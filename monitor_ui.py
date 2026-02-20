#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import time
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import parse_qs, urlparse

from news_notifier import (
    build_source_feeds,
    DEFAULT_IRAN_KEYWORDS,
    DEFAULT_MAJOR_KEYWORDS,
    SUMMARY_TOPIC_RULES,
    detect_topic,
    get_iran_keywords,
    get_summary_topic_rules,
    load_dotenv_simple,
    load_state,
    maybe_send_compact_summary,
    resolve_news_timezone,
    save_state,
    send_news_item,
)


ROOT_DIR = Path("/Users/oscar_oliver/projects/news-pusher-stable")
STATE_FILE = ROOT_DIR / ".state.json"
LOG_FILE = ROOT_DIR / "stable.live.log"
ENV_FILE = ROOT_DIR / ".env.stable"
PROFILE_PREFIX = "STABLE"
SHARED_ENV_FILE = Path("/Users/oscar_oliver/projects/news-pusher.shared.env")


def _apply_profile_credentials(prefix: str) -> None:
    p = (prefix or "").strip().upper()
    if not p:
        return
    mapping = {
        "TELEGRAM_BOT_TOKEN": f"{p}_TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID": f"{p}_TELEGRAM_CHAT_ID",
        "SECONDARY_TELEGRAM_BOT_TOKEN": f"{p}_SECONDARY_TELEGRAM_BOT_TOKEN",
        "SECONDARY_TELEGRAM_CHAT_ID": f"{p}_SECONDARY_TELEGRAM_CHAT_ID",
    }
    for dest, src in mapping.items():
        v = (os.getenv(src) or "").strip()
        if v:
            os.environ[dest] = v


def _load_runtime_env() -> None:
    load_dotenv_simple(str(ENV_FILE))
    shared = Path((os.getenv("SHARED_ENV_FILE") or "").strip() or str(SHARED_ENV_FILE))
    if shared.exists():
        load_dotenv_simple(str(shared))
    _apply_profile_credentials((os.getenv("APP_PROFILE") or PROFILE_PREFIX).strip() or PROFILE_PREFIX)


def _split_csv(raw: str) -> List[str]:
    out: List[str] = []
    for tok in (raw or "").split(","):
        x = tok.strip()
        if x and x not in out:
            out.append(x)
    return out


def _read_env_map(path: Path) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k:
            out[k] = v
    return out


def _default_tags_payload() -> dict:
    categories = [{"id": str(i + 1), "name": name, "tags": list(tags)} for i, (name, tags) in enumerate(SUMMARY_TOPIC_RULES)]
    major = list(DEFAULT_MAJOR_KEYWORDS)
    iran = list(DEFAULT_IRAN_KEYWORDS)
    return {"categories": categories, "major_keywords": major, "iran_keywords": iran}


def _load_tags_payload() -> dict:
    env_map = _read_env_map(ENV_FILE)
    raw_topic = (env_map.get("TOPIC_RULES_JSON") or "").strip()
    categories = []
    if raw_topic:
        try:
            data = json.loads(raw_topic)
            if isinstance(data, list):
                for i, item in enumerate(data):
                    if not isinstance(item, dict):
                        continue
                    name = str(item.get("name") or item.get("label") or "").strip()
                    tags = item.get("tags")
                    if not name or not isinstance(tags, list):
                        continue
                    cleaned = []
                    for t in tags:
                        s = str(t or "").strip()
                        if s and s not in cleaned:
                            cleaned.append(s)
                    categories.append({"id": str(i + 1), "name": name, "tags": cleaned})
        except Exception:
            categories = []
    if not categories:
        categories = [{"id": str(i + 1), "name": name, "tags": list(tags)} for i, (name, tags) in enumerate(SUMMARY_TOPIC_RULES)]

    major = _split_csv((env_map.get("MAJOR_KEYWORDS") or "").strip()) or list(DEFAULT_MAJOR_KEYWORDS)
    iran = _split_csv((env_map.get("IRAN_RELATED_KEYWORDS") or "").strip()) or list(DEFAULT_IRAN_KEYWORDS)
    return {"categories": categories, "major_keywords": major, "iran_keywords": iran}


def _upsert_env_values(updates: Dict[str, str]) -> None:
    lines = []
    if ENV_FILE.exists():
        lines = ENV_FILE.read_text(encoding="utf-8").splitlines()
    for key, value in updates.items():
        assigned = False
        new_line = f"{key}={value}"
        for i, line in enumerate(lines):
            if re.match(rf"^\s*{re.escape(key)}\s*=", line):
                lines[i] = new_line
                assigned = True
                break
        if not assigned:
            lines.append(new_line)
        os.environ[key] = value
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _save_tags_payload(data: dict) -> dict:
    categories = data.get("categories")
    if not isinstance(categories, list) or not categories:
        return {"ok": False, "error": "categories must be a non-empty list"}
    normalized = []
    for i, item in enumerate(categories):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        tags = item.get("tags")
        if not name or not isinstance(tags, list):
            continue
        cleaned: List[str] = []
        for t in tags:
            s = str(t or "").strip()
            if s and s not in cleaned:
                cleaned.append(s)
        normalized.append({"id": str(i + 1), "name": name, "tags": cleaned})
    if not normalized:
        return {"ok": False, "error": "no valid categories"}

    major = data.get("major_keywords")
    if not isinstance(major, list):
        merged: List[str] = []
        for c in normalized:
            for t in c["tags"]:
                if t not in merged:
                    merged.append(t)
        major = merged
    major_clean = []
    for t in major:
        s = str(t or "").strip()
        if s and s not in major_clean:
            major_clean.append(s)

    iran = data.get("iran_keywords")
    if not isinstance(iran, list):
        # Fallback: infer from all tags + existing defaults.
        inferred: List[str] = []
        for c in normalized:
            for t in c["tags"]:
                lower = t.lower()
                if any(x in lower for x in ("iran", "tehran", "irgc", "伊朗", "德黑兰")) and t not in inferred:
                    inferred.append(t)
        iran = inferred or list(get_iran_keywords())
    iran_clean = []
    for t in iran:
        s = str(t or "").strip()
        if s and s not in iran_clean:
            iran_clean.append(s)
    if not iran_clean:
        iran_clean = list(DEFAULT_IRAN_KEYWORDS)

    topic_rules_json = json.dumps([{"name": c["name"], "tags": c["tags"]} for c in normalized], ensure_ascii=False)
    updates = {
        "TOPIC_RULES_JSON": topic_rules_json,
        "MAJOR_KEYWORDS": ",".join(major_clean),
        "IRAN_RELATED_KEYWORDS": ",".join(iran_clean),
    }
    _upsert_env_values(updates)
    restart = _control_notifier("restart")
    return {
        "ok": True,
        "categories": normalized,
        "major_keywords": major_clean,
        "iran_keywords": iran_clean,
        "notifier_restarted": bool(restart.get("ok")),
        "notifier_restart_result": restart,
    }


def _shell(cmd: List[str]) -> str:
    try:
        return subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""


def _notifier_pids() -> List[str]:
    # Match both absolute-path launches and cwd-relative launches.
    raw = []
    raw.extend(_shell(["pgrep", "-f", str(ROOT_DIR / "news_notifier.py")]).splitlines())
    raw.extend(_shell(["pgrep", "-f", r"(^|/)news_notifier\.py($| )"]).splitlines())
    seen = set()
    out: List[str] = []
    for pid in raw:
        p = pid.strip()
        if not p or p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out


def _start_notifier() -> dict:
    pids = _notifier_pids()
    if pids:
        return {"ok": True, "action": "start", "already_running": True, "pids": pids}
    try:
        with (ROOT_DIR / "stable.live.log").open("a", encoding="utf-8") as lf:
            proc = subprocess.Popen(
                ["python3", str(ROOT_DIR / "news_notifier.py")],
                cwd=str(ROOT_DIR),
                stdout=lf,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        time.sleep(0.5)
        return {"ok": True, "action": "start", "already_running": False, "pid": proc.pid, "pids": _notifier_pids()}
    except Exception as exc:
        return {"ok": False, "action": "start", "error": str(exc)}


def _stop_notifier() -> dict:
    pids = _notifier_pids()
    if not pids:
        return {"ok": True, "action": "stop", "already_stopped": True, "pids": []}
    stopped = []
    failed = []
    for p in pids:
        try:
            subprocess.run(["kill", p], check=True)
            stopped.append(p)
        except Exception:
            failed.append(p)
    time.sleep(0.3)
    remain = _notifier_pids()
    return {
        "ok": len(failed) == 0,
        "action": "stop",
        "stopped": stopped,
        "failed": failed,
        "pids": remain,
    }


def _control_notifier(action: str) -> dict:
    action = (action or "").strip().lower()
    if action == "start":
        return _start_notifier()
    if action == "stop":
        return _stop_notifier()
    if action == "restart":
        _stop_notifier()
        return _start_notifier()
    return {"ok": False, "error": f"Unsupported action: {action}"}


def _tail(path: Path, max_lines: int = 120) -> List[str]:
    if not path.exists():
        return []
    try:
        data = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        return data[-max_lines:]
    except Exception:
        return []


def _last_line(lines: List[str], pattern: str) -> str:
    rx = re.compile(pattern)
    for line in reversed(lines):
        if rx.search(line):
            return line
    return ""


def _log_time_str(line: str) -> str:
    m = re.match(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d{3}", line or "")
    return m.group(1) if m else ""


def _parse_log_time(line: str) -> datetime | None:
    m = re.match(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d{3}", line or "")
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def _infer_phase(lines: List[str]) -> str:
    last = _last_line(
        lines,
        r"开始运行|抓取失败|本轮有内容但|已推送汇总消息|已推送:|summary tz=|低分新闻已缓存|低分新闻定时汇总",
    )
    if not last:
        return "idle"
    if "抓取失败" in last:
        return "fetch_error"
    if "已推送汇总消息" in last or "低分新闻定时汇总已推送" in last:
        return "pushing_summary"
    if "已推送:" in last:
        return "pushing_single"
    if "本轮有内容但" in last:
        return "filtering"
    if "summary tz=" in last:
        return "cycle_done"
    if "开始运行" in last:
        return "running"
    return "idle"


def _recent_events(lines: List[str], limit: int = 12) -> List[str]:
    out = []
    for line in reversed(lines):
        if re.search(r"已推送:|已推送汇总消息|低分新闻定时汇总已推送|抓取失败|summary tz=", line):
            out.append(line)
        if len(out) >= limit:
            break
    out.reverse()
    return out


def _topic_buckets(low_score_buffer: List[dict]) -> List[dict]:
    buckets: Dict[str, dict] = {}
    for item in low_score_buffer:
        source = item.get("source") or "Unknown"
        entry = item.get("entry") or {}
        title = (entry.get("title") or "").strip()
        topic = detect_topic(title)
        heat = float(item.get("heat") or 0.0)
        bucket = buckets.setdefault(
            topic,
            {"topic": topic, "count": 0, "avg_heat": 0.0, "items": [], "sources": {}},
        )
        bucket["count"] += 1
        bucket["avg_heat"] += heat
        bucket["sources"][source] = bucket["sources"].get(source, 0) + 1
        if len(bucket["items"]) < 30:
            bucket["items"].append(
                {
                    "title": title,
                    "source": source,
                    "heat": round(heat, 2),
                    "link": (entry.get("link") or "").strip(),
                    "published": (entry.get("published") or "").strip(),
                }
            )
    out = []
    for v in buckets.values():
        c = max(1, v["count"])
        v["avg_heat"] = round(v["avg_heat"] / c, 2)
        v["top_sources"] = sorted(v["sources"].items(), key=lambda kv: (-kv[1], kv[0]))[:5]
        del v["sources"]
        out.append(v)
    out.sort(key=lambda x: (-x["count"], -x["avg_heat"], x["topic"]))
    return out


def _parse_delivery_from_summary(line: str) -> dict:
    # Example in summary line:
    # delivery_p=1/0 delivery_s=0/1 alerts=1/0
    parsed = {
        "primary": {"ok": 0, "fail": 0},
        "secondary": {"ok": 0, "fail": 0},
        "alerts_sent": 0,
        "alerts_fail": 0,
    }
    m_p = re.search(r"\bdelivery_p=(\d+)/(\d+)\b", line or "")
    m_s = re.search(r"\bdelivery_s=(\d+)/(\d+)\b", line or "")
    m_a = re.search(r"\balerts=(\d+)/(\d+)\b", line or "")
    if m_p:
        parsed["primary"]["ok"] = int(m_p.group(1))
        parsed["primary"]["fail"] = int(m_p.group(2))
    if m_s:
        parsed["secondary"]["ok"] = int(m_s.group(1))
        parsed["secondary"]["fail"] = int(m_s.group(2))
    if m_a:
        parsed["alerts_sent"] = int(m_a.group(1))
        parsed["alerts_fail"] = int(m_a.group(2))
    return parsed


def _rolling_delivery(lines: List[str], hours: int = 1) -> dict:
    now = datetime.now()
    since = now - timedelta(hours=hours)
    out = {
        "window_hours": hours,
        "primary": {"ok": 0, "fail": 0},
        "secondary": {"ok": 0, "fail": 0},
        "alerts_sent": 0,
        "alerts_fail": 0,
        "summary_count": 0,
    }
    for line in lines:
        if "summary tz=" not in line:
            continue
        dt = _parse_log_time(line)
        if not dt or dt < since:
            continue
        one = _parse_delivery_from_summary(line)
        out["summary_count"] += 1
        out["primary"]["ok"] += one["primary"]["ok"]
        out["primary"]["fail"] += one["primary"]["fail"]
        out["secondary"]["ok"] += one["secondary"]["ok"]
        out["secondary"]["fail"] += one["secondary"]["fail"]
        out["alerts_sent"] += one["alerts_sent"]
        out["alerts_fail"] += one["alerts_fail"]
    return out


def _recent_error_items(lines: List[str], limit: int = 20) -> List[dict]:
    items: List[dict] = []
    for line in reversed(lines):
        if not re.search(r"\b(ERROR|WARNING)\b", line):
            continue
        level_match = re.search(r"\b(ERROR|WARNING)\b", line)
        level = level_match.group(1) if level_match else "ERROR"
        items.append(
            {
                "time": _log_time_str(line),
                "level": level,
                "line": line,
                "message": re.sub(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}\s+\w+\s+", "", line),
            }
        )
        if len(items) >= limit:
            break
    return items


def _parse_iso(ts: str) -> datetime | None:
    s = (ts or "").strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _history_rows(state: dict, key: str, *, days: int = 7, limit: int = 500) -> List[dict]:
    rows = state.get(key, [])
    if not isinstance(rows, list):
        return []
    cutoff = datetime.now().astimezone() - timedelta(days=max(1, days))
    out: List[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        dt = _parse_iso(str(row.get("ts") or ""))
        if dt and dt.astimezone() < cutoff:
            continue
        out.append(row)
    out.sort(key=lambda x: str(x.get("ts") or ""), reverse=True)
    return out[: max(1, limit)]


def _safe_int(raw: str | None, default: int) -> int:
    try:
        return int(str(raw if raw is not None else default))
    except Exception:
        return default


def _source_status_payload(lines: List[str]) -> dict:
    source_names = sorted(build_source_feeds().keys())
    recent_fail: Dict[str, str] = {}
    recent_fallback: Dict[str, str] = {}
    recent_push_count: Dict[str, int] = {}
    for line in reversed(lines):
        m_fail = re.search(r"抓取失败:\s*(.+)$", line)
        if m_fail:
            src = m_fail.group(1).strip()
            recent_fail.setdefault(src, line)
        m_fb = re.search(r"抓取源fallback命中:\s*(.+?)\s*->", line)
        if m_fb:
            src = m_fb.group(1).strip()
            recent_fallback.setdefault(src, line)
        m_push = re.search(r"已推送:\s*([^|]+)\|", line)
        if m_push:
            src = m_push.group(1).strip()
            recent_push_count[src] = recent_push_count.get(src, 0) + 1

    items = []
    for src in source_names:
        status = "OK"
        last_error = ""
        if src in recent_fail:
            status = "ERROR"
            last_error = re.sub(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}\s+\w+\s+", "", recent_fail[src])
        elif src in recent_fallback:
            status = "WARN"
        items.append(
            {
                "source": src,
                "status": status,
                "enabled": True,
                "items_24h_estimate": recent_push_count.get(src, 0),
                "last_error": last_error,
                "last_fallback": recent_fallback.get(src, ""),
            }
        )
    return {
        "ok": True,
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "count": len(items),
        "items": items,
    }


def _details_payload(path: str) -> tuple[int, dict]:
    parsed = urlparse(path)
    qs = parse_qs(parsed.query or "")
    state = load_state(STATE_FILE)
    days = _safe_int((qs.get("days") or [None])[0], 7)
    limit = _safe_int((qs.get("limit") or [None])[0], 300)

    if parsed.path == "/api/details/new-found":
        rows = _history_rows(state, "history_new", days=days, limit=limit)
        return HTTPStatus.OK, {"ok": True, "days": days, "count": len(rows), "items": rows}

    if parsed.path == "/api/details/pushed":
        rows = _history_rows(state, "history_pushed", days=days, limit=limit)
        status_filter = ((qs.get("status") or [""])[0] or "").strip().lower()
        if status_filter:
            rows = [x for x in rows if str(x.get("status") or "").lower() == status_filter]
        return HTTPStatus.OK, {"ok": True, "days": days, "count": len(rows), "items": rows}

    if parsed.path == "/api/details/skipped":
        rows = _history_rows(state, "history_skipped", days=days, limit=limit)
        reason = ((qs.get("reason") or [""])[0] or "").strip().lower()
        if reason:
            rows = [x for x in rows if str(x.get("reason") or "").lower() == reason]
        return HTTPStatus.OK, {"ok": True, "days": days, "count": len(rows), "items": rows}

    if parsed.path == "/api/details/low-digest":
        rows = _history_rows(state, "history_low_digest", days=days, limit=limit)
        return HTTPStatus.OK, {"ok": True, "days": days, "count": len(rows), "items": rows}

    if parsed.path == "/api/details/low-digest-queue":
        low_buffer = state.get("low_score_buffer", [])
        night_buffer = state.get("night_buffer", [])
        if not isinstance(low_buffer, list):
            low_buffer = []
        if not isinstance(night_buffer, list):
            night_buffer = []
        merged = []
        for item in low_buffer:
            if isinstance(item, dict):
                x = dict(item)
                x["_queue"] = "low_score_buffer"
                merged.append(x)
        for item in night_buffer:
            if isinstance(item, dict):
                x = dict(item)
                x["_queue"] = "night_buffer"
                merged.append(x)
        rows = []
        for item in merged[: max(1, limit) * 2]:
            if not isinstance(item, dict):
                continue
            entry = item.get("entry") if isinstance(item.get("entry"), dict) else {}
            title = (entry.get("title") or "").strip()
            rows.append(
                {
                    "ts": datetime.fromtimestamp(int(item.get("buffered_ts") or 0)).astimezone().isoformat() if item.get("buffered_ts") else "",
                    "source": item.get("source") or "Unknown",
                    "uid": item.get("uid") or "",
                    "heat": float(item.get("heat") or 0.0),
                    "topic": detect_topic(title),
                    "queue": item.get("_queue") or "",
                    "title": title,
                    "link": (entry.get("link") or "").strip(),
                    "published": (entry.get("published") or "").strip(),
                }
            )
        rows.sort(key=lambda x: str(x.get("ts") or ""), reverse=True)
        return HTTPStatus.OK, {"ok": True, "count": len(rows), "items": rows[: max(1, limit)]}

    if parsed.path == "/api/details/low-topics":
        low_buffer = state.get("low_score_buffer", [])
        if not isinstance(low_buffer, list):
            low_buffer = []
        topics = _topic_buckets(low_buffer)
        topic = ((qs.get("topic") or [""])[0] or "").strip()
        if topic:
            topics = [t for t in topics if str(t.get("topic") or "") == topic]
        return HTTPStatus.OK, {"ok": True, "count": len(topics), "items": topics}

    if parsed.path == "/api/details/sources":
        lines = _tail(LOG_FILE, max_lines=3000)
        payload = _source_status_payload(lines)
        status_filter = ((qs.get("status") or [""])[0] or "").strip().upper()
        if status_filter:
            payload["items"] = [x for x in payload["items"] if str(x.get("status") or "").upper() == status_filter]
            payload["count"] = len(payload["items"])
        return HTTPStatus.OK, payload

    if parsed.path == "/api/engine/timer":
        poll_seconds = int(os.getenv("POLL_SECONDS", "120"))
        last_run = state.get("last_run", {}) if isinstance(state.get("last_run"), dict) else {}
        utc_str = str(last_run.get("utc") or "")
        dt = _parse_iso(utc_str)
        running = bool(_notifier_pids())
        seconds_since = None
        if dt:
            seconds_since = int((datetime.now(timezone.utc) - dt.astimezone(timezone.utc)).total_seconds())
        if seconds_since is None:
            seconds_left = poll_seconds if running else 0
        else:
            seconds_left = max(0, poll_seconds - (seconds_since % poll_seconds)) if running else 0
        return HTTPStatus.OK, {
            "ok": True,
            "running": running,
            "poll_seconds": poll_seconds,
            "seconds_since_last_cycle": seconds_since,
            "seconds_to_next_cycle": seconds_left,
        }

    return HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"}


def _status_payload() -> dict:
    state = load_state(STATE_FILE)
    last_run = state.get("last_run", {}) if isinstance(state.get("last_run", {}), dict) else {}
    delivery = last_run.get("delivery", {}) if isinstance(last_run.get("delivery", {}), dict) else {}
    lines = _tail(LOG_FILE, max_lines=1200)
    pids = _notifier_pids()
    poll_seconds = int(os.getenv("POLL_SECONDS", "120"))
    last_log_line = lines[-1] if lines else ""
    last_log_dt = _parse_log_time(last_log_line)
    age_sec = int((datetime.now() - last_log_dt).total_seconds()) if last_log_dt else None
    is_fresh = bool(age_sec is not None and age_sec <= max(15, poll_seconds * 2))
    phase = _infer_phase(lines)
    last_run_utc = str(last_run.get("utc") or "")
    last_run_dt = _parse_iso(last_run_utc)
    since_last_cycle = None
    if last_run_dt:
        since_last_cycle = int((datetime.now(timezone.utc) - last_run_dt.astimezone(timezone.utc)).total_seconds())
    next_cycle_sec = max(0, poll_seconds - (since_last_cycle % poll_seconds)) if since_last_cycle is not None and pids else 0
    low_buffer = state.get("low_score_buffer", [])
    night_buffer = state.get("night_buffer", [])
    low_buffer_list = low_buffer if isinstance(low_buffer, list) else []
    night_buffer_list = night_buffer if isinstance(night_buffer, list) else []
    topics = _topic_buckets(low_buffer_list)
    recent_errors = _recent_error_items(lines, limit=20)
    last_error = recent_errors[0] if recent_errors else None
    return {
        "now": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "process": {"running": bool(pids), "pids": pids},
        "last_start": _last_line(lines, r"开始运行"),
        "last_summary": _last_line(lines, r"summary tz="),
        "last_push": _last_line(lines, r"已推送汇总消息|已推送:"),
        "last_error": _last_line(lines, r"ERROR|WARNING"),
        "last_error_time": (last_error or {}).get("time", ""),
        "last_error_level": (last_error or {}).get("level", ""),
        "last_error_message": (last_error or {}).get("message", ""),
        "recent_errors": recent_errors,
        "activity": {
            "phase": phase,
            "last_log_age_sec": age_sec,
            "fresh": is_fresh,
            "last_log_line": last_log_line,
            "recent_events": _recent_events(lines),
            "poll_seconds": poll_seconds,
            "seconds_since_last_cycle": since_last_cycle,
            "seconds_to_next_cycle": next_cycle_sec,
        },
        "low_buffer_count": len(low_buffer_list),
        "night_buffer_count": len(night_buffer_list),
        "digest_queue_count": len(low_buffer_list) + len(night_buffer_list),
        "low_topics": topics,
        "last_low_digest_slot": state.get("last_low_digest_slot", ""),
        "delivery": {
            "primary": {
                "ok": int(((delivery.get("primary") or {}).get("ok", 0) if isinstance(delivery.get("primary"), dict) else 0)),
                "fail": int(((delivery.get("primary") or {}).get("fail", 0) if isinstance(delivery.get("primary"), dict) else 0)),
            },
            "secondary": {
                "ok": int(((delivery.get("secondary") or {}).get("ok", 0) if isinstance(delivery.get("secondary"), dict) else 0)),
                "fail": int(((delivery.get("secondary") or {}).get("fail", 0) if isinstance(delivery.get("secondary"), dict) else 0)),
            },
            "alerts_sent": int(delivery.get("alerts_sent", 0)),
            "alerts_fail": int(delivery.get("alerts_fail", 0)),
        },
        "delivery_1h": _rolling_delivery(lines, hours=1),
    }


def _push_topic(topic: str) -> dict:
    _load_runtime_env()
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (os.getenv("TELEGRAM_CHAT_ID") or "").strip()
    if not token or not chat_id:
        return {"ok": False, "error": "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID"}

    tz_name, news_tz = resolve_news_timezone()
    now_local = datetime.now(tz=news_tz)
    ai_api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    ai_model = (os.getenv("AI_SUMMARY_MODEL") or "gpt-5-mini").strip()
    ai_max_items = int(os.getenv("AI_SUMMARY_MAX_ITEMS", "30"))

    state = load_state(STATE_FILE)
    low_buffer = state.get("low_score_buffer", [])
    night_buffer = state.get("night_buffer", [])
    if not isinstance(low_buffer, list):
        return {"ok": False, "error": "Bad low_score_buffer state"}
    if not isinstance(night_buffer, list):
        return {"ok": False, "error": "Bad night_buffer state"}

    selected: List[dict] = []
    remaining_low: List[dict] = []
    remaining_night: List[dict] = []

    def _pick(items: List[dict], remain: List[dict], queue_name: str) -> None:
        for item in items:
            if not isinstance(item, dict):
                continue
            title = ((item.get("entry") or {}).get("title") or "").strip()
            item_topic = detect_topic(title)
            if topic == "__ALL__" or topic == item_topic:
                one = dict(item)
                one["_queue"] = queue_name
                selected.append(one)
            else:
                remain.append(item)

    _pick(low_buffer, remaining_low, "low_score_buffer")
    _pick(night_buffer, remaining_night, "night_buffer")

    if not selected:
        return {"ok": False, "error": f"No cached items for topic: {topic}"}

    compact_items = [
        {"source": x.get("source"), "entry": x.get("entry"), "uid": x.get("uid")}
        for x in selected
    ]

    sent = 0
    pushed_rows: List[dict] = []
    try:
        sent_compact = maybe_send_compact_summary(
            token=token,
            chat_id=chat_id,
            items=compact_items,
            tz_name=tz_name,
            now_local=now_local,
            threshold=0,
            ai_api_key=ai_api_key,
            ai_model=ai_model,
            ai_max_items=ai_max_items,
        )
        if sent_compact:
            sent = len(selected)
            pushed_rows.append(
                {
                    "ts": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                    "kind": "summary",
                    "status": "ok",
                    "count": len(selected),
                    "title": f"手动汇总推送 {len(selected)} 条",
                    "channel": "primary",
                    "manual": True,
                }
            )
        else:
            for item in selected:
                send_news_item(
                    token=token,
                    chat_id=chat_id,
                    source=item.get("source") or "Unknown",
                    entry=item.get("entry") or {},
                    prefix="[Manual topic push] ",
                    fetch_article_image_enabled=True,
                )
                sent += 1
                entry = item.get("entry") or {}
                pushed_rows.append(
                    {
                        "ts": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                        "kind": "single",
                        "status": "ok",
                        "source": item.get("source") or "Unknown",
                        "uid": item.get("uid") or "",
                        "title": (entry.get("title") or "").strip(),
                        "link": (entry.get("link") or "").strip(),
                        "published": (entry.get("published") or "").strip(),
                        "channel": "primary",
                        "manual": True,
                    }
                )
    except Exception as exc:
        return {"ok": False, "error": f"Push failed: {exc}"}

    state["low_score_buffer"] = remaining_low
    state["night_buffer"] = remaining_night
    if pushed_rows:
        history = state.get("history_pushed", [])
        if not isinstance(history, list):
            history = []
        history.extend(pushed_rows)
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        kept = []
        for row in history:
            dt = _parse_iso(str((row or {}).get("ts") or ""))
            if dt and dt.astimezone(timezone.utc) < cutoff:
                continue
            kept.append(row)
        state["history_pushed"] = kept[-6000:]
    save_state(STATE_FILE, state)
    return {
        "ok": True,
        "sent": sent,
        "topic": topic,
        "remaining_low_buffer": len(remaining_low),
        "remaining_night_buffer": len(remaining_night),
    }


ROOT_INFO = {
    "ok": True,
    "service": "news-pusher-monitor-api",
    "message": "Legacy embedded monitor HTML has been removed. Use the zip dashboard UI.",
    "frontend_default": "http://127.0.0.1:5173/",
    "endpoints": {
        "status": "GET /api/status",
        "engine_timer": "GET /api/engine/timer",
        "details_new_found": "GET /api/details/new-found?days=7&limit=300",
        "details_pushed": "GET /api/details/pushed?days=7&status=ok|fail",
        "details_skipped": "GET /api/details/skipped?days=7&reason=seen|old|major|lang",
        "details_low_digest": "GET /api/details/low-digest?days=7",
        "details_low_digest_queue": "GET /api/details/low-digest-queue?limit=300",
        "details_low_topics": "GET /api/details/low-topics?topic=战争与冲突",
        "details_sources": "GET /api/details/sources?status=OK|WARN|ERROR|DISABLED",
        "tags": "GET /api/tags",
        "tags_save": "PUT /api/tags body={categories:[...],major_keywords:[...],iran_keywords:[...]}",
        "push_topic": "POST /api/push-topic body={\"topic\":\"__ALL__|TOPIC\"}",
        "control_notifier": "POST /api/control-notifier body={\"action\":\"start|stop|restart\"}",
    },
}




class Handler(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *args: Any) -> None:  # reduce noisy logs
        return

    def _json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/" or path.startswith("/index.html"):
            self._json(HTTPStatus.OK, ROOT_INFO)
            return
        if path == "/api/status":
            self._json(HTTPStatus.OK, _status_payload())
            return
        if path == "/api/tags":
            payload = _load_tags_payload()
            payload["ok"] = True
            self._json(HTTPStatus.OK, payload)
            return
        if path.startswith("/api/details/") or path == "/api/engine/timer":
            code, payload = _details_payload(self.path)
            self._json(code, payload)
            return
        self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:
        if self.path not in ("/api/push-topic", "/api/control-notifier"):
            self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})
            return
        try:
            n = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(n) if n > 0 else b"{}"
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Bad JSON"})
            return
        if self.path == "/api/push-topic":
            topic = str(data.get("topic") or "").strip()
            if not topic:
                self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Missing topic"})
                return
            result = _push_topic(topic)
            self._json(HTTPStatus.OK if result.get("ok") else HTTPStatus.BAD_REQUEST, result)
            return

        action = str(data.get("action") or "").strip().lower()
        if action not in ("start", "stop", "restart"):
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Missing/invalid action"})
            return
        result = _control_notifier(action)
        self._json(HTTPStatus.OK if result.get("ok") else HTTPStatus.BAD_REQUEST, result)

    def do_PUT(self) -> None:
        if self.path != "/api/tags":
            self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})
            return
        try:
            n = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(n) if n > 0 else b"{}"
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Bad JSON"})
            return
        result = _save_tags_payload(data if isinstance(data, dict) else {})
        self._json(HTTPStatus.OK if result.get("ok") else HTTPStatus.BAD_REQUEST, result)


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def main() -> None:
    _load_runtime_env()
    host = os.getenv("MONITOR_UI_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.getenv("MONITOR_UI_PORT", "8787"))
    srv = ReusableThreadingHTTPServer((host, port), Handler)
    print(f"monitor ui running on http://{host}:{port}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
