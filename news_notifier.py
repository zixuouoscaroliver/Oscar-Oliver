#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import subprocess
import time
import html
import email.utils
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, tzinfo
from pathlib import Path
from typing import Dict, List, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

SOURCE_DOMAINS = {
    "NYP": "nypost.com",
    "WaPo": "washingtonpost.com",
    "Politico": "politico.com",
    "Economist": "economist.com",
    "WSJ": "wsj.com",
    "AP NEWS": "apnews.com",
    "The Atlantic": "theatlantic.com",
    "Reuters": "reuters.com",
    "SCMP": "scmp.com",
    "NHK International": "nhk.or.jp",
    "Al Jazeera": "aljazeera.com",
    "Bloomberg": "bloomberg.com",
    "CNN": "cnn.com",
    "BBC": "bbc.com",
    "RT": "rt.com",
    "新华社": "news.cn",
}

SOURCE_FEEDS = {
    "NYP": "https://nypost.com/feed/",
    "WaPo": "https://feeds.washingtonpost.com/rss/world",
    "Politico": "https://rss.politico.com/politics-news.xml",
    "Economist": "https://www.bing.com/news/search?q=site%3Aeconomist.com&format=rss",
    "WSJ": "https://feeds.a.dj.com/rss/RSSWorldNews.xml",
    "AP NEWS": "https://www.bing.com/news/search?q=site%3Aapnews.com&format=rss",
    "The Atlantic": "https://www.theatlantic.com/feed/channel/news/",
    "Reuters": "https://www.bing.com/news/search?q=site%3Areuters.com&format=rss",
    "SCMP": "https://www.scmp.com/rss/91/feed",
    "NHK International": "https://www.bing.com/news/search?q=site%3Anhkworld-japan.com%20OR%20site%3Anhk.or.jp%2Fnhkworld&format=rss",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
    "Bloomberg": "https://www.bing.com/news/search?q=site%3Abloomberg.com&format=rss",
    "CNN": "http://rss.cnn.com/rss/edition_world.rss",
    "BBC": "http://feeds.bbci.co.uk/news/world/rss.xml",
    "RT": "https://www.rt.com/rss/news/",
    "新华社": "https://www.bing.com/news/search?q=site%3Anews.cn%20OR%20site%3Axinhuanet.com&format=rss",
}

SCMP_FALLBACK_FEEDS = [
    "https://www.bing.com/news/search?q=site%3Ascmp.com&format=rss",
    "https://news.google.com/rss/search?q=site%3Ascmp.com&hl=en-US&gl=US&ceid=US:en",
]

SOURCE_FALLBACK_FEEDS = {
    "SCMP": SCMP_FALLBACK_FEEDS,
    "NHK International": [
        "https://news.google.com/rss/search?q=site%3Anhkworld-japan.com%20OR%20site%3Anhk.or.jp%2Fnhkworld&hl=en-US&gl=US&ceid=US:en",
    ],
    "Al Jazeera": [
        "https://news.google.com/rss/search?q=site%3Aaljazeera.com&hl=en-US&gl=US&ceid=US:en",
    ],
    "Bloomberg": [
        "https://news.google.com/rss/search?q=site%3Abloomberg.com&hl=en-US&gl=US&ceid=US:en",
    ],
    "CNN": [
        "https://news.google.com/rss/search?q=site%3Acnn.com&hl=en-US&gl=US&ceid=US:en",
    ],
    "BBC": [
        "https://news.google.com/rss/search?q=site%3Abbc.com%20OR%20site%3Abbc.co.uk&hl=en-US&gl=US&ceid=US:en",
    ],
    "RT": [
        "https://news.google.com/rss/search?q=site%3Art.com&hl=en-US&gl=US&ceid=US:en",
    ],
    "新华社": [
        "https://news.google.com/rss/search?q=site%3Anews.cn%20OR%20site%3Axinhuanet.com&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
    ],
}

ALLOWED_PUSH_LANGUAGES = {"zh", "en"}
SOURCE_LANGUAGE_PREFERENCE = {
    "新华社": "zh",
}

DEFAULT_MAJOR_KEYWORDS = [
    "breaking",
    "urgent",
    "election",
    "war",
    "ceasefire",
    "attack",
    "missile",
    "killed",
    "dead",
    "explosion",
    "earthquake",
    "flood",
    "hurricane",
    "wildfire",
    "sanction",
    "supreme court",
    "white house",
    "fed",
    "interest rate",
    "inflation",
    "recession",
    "bankruptcy",
    "merger",
    "acquisition",
    "ipo",
    "earnings",
    "tariff",
    "taiwan",
    "south china sea",
    # User-focused topics
    "trump",
    "xi jinping",
    "习近平",
    "巴以冲突",
    "israel",
    "israeli",
    "palestine",
    "palestinian",
    "gaza",
    "hamas",
    "west bank",
    "俄乌战争",
    "ukraine",
    "ukrainian",
    "russia",
    "russian",
    "putin",
    "zelensky",
    "kyiv",
    "moscow",
    "乌克兰",
    "俄罗斯",
    "eu",
    "europe",
    "european",
    "eurozone",
    "ecb",
    "brussels",
    "africa",
    "african",
    "非洲",
    "sudan",
    "darfur",
    "congo",
    "drc",
    "somalia",
    "sahel",
    "boko haram",
    "al-shabaab",
    "greenland",
    "格陵兰",
    "格陵兰岛",
    "southeast asia",
    "asean",
    "东南亚",
    "philippines",
    "vietnam",
    "thailand",
    "myanmar",
    "indonesia",
    "malaysia",
    "singapore",
    "cambodia",
    "laos",
    # China domestic affairs
    "两会",
    "全国人大",
    "政协",
    "国务院",
    "国常会",
    "中共中央",
    "中央政治局",
    "最高人民法院",
    "最高人民检察院",
    "国家发改委",
    "财政部",
    "工信部",
    "商务部",
    "教育部",
    "公安部",
    "国家统计局",
    "纪检",
    "反腐",
    "户籍",
    "社保",
    "医保",
    "房地产调控",
    "地方债",
    "就业",
    "高考",
    "内需",
    "乡村振兴",
    "共同富裕",
]

DEFAULT_FALLBACK_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/No_image_available.svg/512px-No_image_available.svg.png"
DEFAULT_ENV_FILE = ".env.stable"
PROFILE_PREFIX = "STABLE"
SHARED_ENV_FILE = "/Users/oscar_oliver/projects/news-pusher.shared.env"

_DELIVERY_STATS = {
    "primary": {"ok": 0, "fail": 0},
    "secondary": {"ok": 0, "fail": 0},
    "alerts_sent": 0,
    "alerts_fail": 0,
}

SUMMARY_MAX_HEADLINES = 15
SUMMARY_CHUNK_SIZE = 15
DEFAULT_IRAN_KEYWORDS = [
    "iran",
    "iranian",
    "tehran",
    "irgc",
    "revolutionary guard",
    "persian gulf",
    "hormuz",
    "伊朗",
    "德黑兰",
]
SUMMARY_TOPIC_RULES = [
    (
        "战争与冲突",
        [
            "ceasefire",
            "airstrike",
            "attack",
            "missile",
            "drone",
            "shelling",
            "bombing",
            "hostage",
            "gaza war",
            "israel-hamas",
            "ukraine war",
            "russia-ukraine",
            "russian invasion",
            "俄乌",
            "停火",
            "空袭",
            "导弹",
            "袭击",
            "交火",
            "军事行动",
        ],
    ),
    ("美国政治", ["trump", "biden", "white house", "supreme court", "congress", "senate", "election"]),
    ("中国与亚太", ["china", "xi", "taiwan", "south china sea", "philippines", "asean", "japan"]),
    (
        "中国内政",
        [
            "两会",
            "全国人大",
            "全国政协",
            "国务院",
            "国常会",
            "中共中央",
            "政治局",
            "最高法",
            "最高检",
            "国家发改委",
            "财政部",
            "商务部",
            "教育部",
            "公安部",
            "国家统计局",
            "纪检",
            "反腐",
            "户籍",
            "社保",
            "医保",
            "地方债",
            "房地产调控",
            "就业",
            "高考",
            "乡村振兴",
            "共同富裕",
            "domestic policy",
            "state council",
            "npc",
            "cppcc",
            "china ministry",
        ],
    ),
    ("经济与市场", ["fed", "inflation", "interest rate", "recession", "tariff", "earnings", "ipo", "bank"]),
    ("灾害与事故", ["earthquake", "flood", "hurricane", "wildfire", "explosion", "crash"]),
    ("科技与产业", ["ai", "chip", "semiconductor", "apple", "google", "meta", "openai", "tesla"]),
]
SOURCE_HEAT_WEIGHT = {
    "Reuters": 2.5,
    "AP NEWS": 2.4,
    "WaPo": 2.3,
    "WSJ": 2.3,
    "Economist": 2.1,
    "Politico": 2.0,
    "SCMP": 2.0,
    "The Atlantic": 1.8,
    "NYP": 1.6,
    "NHK International": 2.0,
    "Al Jazeera": 2.1,
    "Bloomberg": 2.2,
    "CNN": 2.1,
    "BBC": 2.2,
    "RT": 1.9,
    "新华社": 2.3,
}
HEAT_SIGNAL_WEIGHTS = [
    (("breaking", "urgent", "alert"), 3.0),
    (("war", "attack", "missile", "ceasefire", "sanction", "explosion"), 2.6),
    (("election", "white house", "supreme court", "congress", "trump", "biden"), 2.2),
    (("fed", "inflation", "interest rate", "recession", "tariff", "bank"), 2.1),
    (("earthquake", "flood", "hurricane", "wildfire"), 2.3),
    (("ai", "chip", "semiconductor"), 1.6),
]


def _topic_keyword_hit(title: str, kw: str) -> bool:
    title = (title or "").strip()
    kw = (kw or "").strip()
    if not title or not kw:
        return False
    if kw.isascii():
        part = r"[\s\-]+".join(re.escape(p) for p in kw.split())
        return re.search(r"(?<![A-Za-z0-9_])" + part + r"(?![A-Za-z0-9_])", title, re.IGNORECASE) is not None
    return kw in title


def _parse_csv_keywords(raw: str) -> List[str]:
    out: List[str] = []
    for tok in (raw or "").split(","):
        x = tok.strip()
        if x and x not in out:
            out.append(x)
    return out


def get_summary_topic_rules() -> List[Tuple[str, List[str]]]:
    raw = (os.getenv("TOPIC_RULES_JSON") or "").strip()
    if raw:
        try:
            data = json.loads(raw)
            out: List[Tuple[str, List[str]]] = []
            if isinstance(data, list):
                for item in data:
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
                    if cleaned:
                        out.append((name, cleaned))
            if out:
                return out
        except Exception:
            logging.exception("解析 TOPIC_RULES_JSON 失败，回退默认分类规则")
    return SUMMARY_TOPIC_RULES


def get_iran_keywords() -> List[str]:
    raw = (os.getenv("IRAN_RELATED_KEYWORDS") or "").strip()
    kws = _parse_csv_keywords(raw)
    return kws if kws else list(DEFAULT_IRAN_KEYWORDS)


def detect_topic(title: str) -> str:
    for label, kws in get_summary_topic_rules():
        if any(_topic_keyword_hit(title, k) for k in kws):
            return label
    return "其他动态"


def is_iran_related(entry: dict) -> bool:
    title = (entry.get("title") or "").strip().lower()
    if not title:
        return False
    iran_kws = get_iran_keywords()
    return any(k in title for k in iran_kws)


def detect_entry_language(entry: dict) -> str:
    title = (entry.get("title") or "").strip()
    if not title:
        return "other"
    if re.search(r"[\u4e00-\u9fff]", title):
        return "zh"
    if re.search(r"[A-Za-z]", title):
        return "en"
    return "other"


def parse_published_ts(entry: dict) -> datetime | None:
    raw = (entry.get("published") or "").strip()
    if not raw:
        return None
    try:
        dt = email.utils.parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        pass
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def compute_news_heat(source: str, entry: dict, now_local: datetime | None = None) -> float:
    title = (entry.get("title") or "").strip().lower()
    score = SOURCE_HEAT_WEIGHT.get(source, 1.5)

    for kws, w in HEAT_SIGNAL_WEIGHTS:
        hit = sum(1 for kw in kws if kw in title)
        if hit:
            score += w + (hit - 1) * 0.4

    if re.search(r"\b\d{3,}\b", title):
        score += 0.8

    published_dt = parse_published_ts(entry)
    if published_dt:
        now_utc = (now_local or datetime.now(timezone.utc)).astimezone(timezone.utc)
        age_hours = max(0.0, (now_utc - published_dt).total_seconds() / 3600)
        if age_hours <= 3:
            score += 1.8
        elif age_hours <= 12:
            score += 1.2
        elif age_hours <= 24:
            score += 0.7

    return round(score, 3)


def resolve_news_timezone() -> tuple[str, tzinfo]:
    tz_name = (os.getenv("NEWS_TZ") or os.getenv("TZ") or "").strip()
    if tz_name:
        try:
            return tz_name, ZoneInfo(tz_name)
        except ZoneInfoNotFoundError:
            logging.warning("未知时区: %s，将回退到UTC", tz_name)
        except Exception:
            logging.exception("解析时区失败: %s，将回退到UTC", tz_name)
    return "UTC", timezone.utc


def source_logo_url(source: str) -> str:
    domain = SOURCE_DOMAINS.get(source, "")
    if not domain:
        return ""
    return f"https://www.google.com/s2/favicons?domain={domain}&sz=256"


def source_logo_candidates(source: str) -> List[str]:
    domain = SOURCE_DOMAINS.get(source, "")
    if not domain:
        return []
    return [
        f"https://logo.clearbit.com/{domain}",
        source_logo_url(source),
    ]


def extract_image_from_html(page_url: str, html_text: str) -> str:
    patterns = [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
        r'<link[^>]+rel=["\']image_src["\'][^>]+href=["\']([^"\']+)["\']',
        r'<img[^>]+src=["\']([^"\']+)["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, html_text, flags=re.IGNORECASE)
        if not match:
            continue
        url = html.unescape(match.group(1)).strip()
        if not url:
            continue
        return urllib.parse.urljoin(page_url, url)
    return ""


def fetch_article_image(article_url: str, timeout: int = 20) -> str:
    if not article_url:
        return ""
    req = urllib.request.Request(
        article_url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        final_url = resp.geturl() or article_url
        content_type = (resp.headers.get("Content-Type") or "").lower()
        if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
            return ""
        content = resp.read(700_000)
    try:
        text = content.decode("utf-8", errors="ignore")
    except Exception:
        return ""
    return extract_image_from_html(final_url, text)


def load_dotenv_simple(path: str = ".env") -> None:
    env_file = Path(path)
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def apply_profile_credentials(prefix: str) -> None:
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


def google_news_rss_url(domain: str) -> str:
    q = urllib.parse.quote_plus(f"site:{domain}")
    return f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"


def bing_news_rss_url(domain: str) -> str:
    q = urllib.parse.quote_plus(f"site:{domain}")
    return f"https://www.bing.com/news/search?q={q}&format=rss"


def build_source_feeds() -> Dict[str, str]:
    out = dict(SOURCE_FEEDS)
    for name, domain in SOURCE_DOMAINS.items():
        out.setdefault(name, google_news_rss_url(domain))
    return out


def source_feed_candidates(source: str, primary_url: str) -> List[str]:
    urls: List[str] = []
    if primary_url:
        urls.append(primary_url)
    for u in SOURCE_FALLBACK_FEEDS.get(source, []):
        if u and u not in urls:
            urls.append(u)
    domain = SOURCE_DOMAINS.get(source, "")
    if domain:
        for u in (bing_news_rss_url(domain), google_news_rss_url(domain)):
            if u and u not in urls:
                urls.append(u)
    return urls


def now_ts() -> int:
    return int(time.time())


def load_state(state_file: Path) -> dict:
    if not state_file.exists():
        return {
            "initialized": False,
            "seen": {},
            "night_buffer": [],
            "last_digest_date": "",
            "low_score_buffer": [],
            "last_low_digest_slot": "",
        }
    try:
        with state_file.open("r", encoding="utf-8") as f:
            state = json.load(f)
    except Exception:
        logging.exception("读取状态文件失败，使用空状态")
        return {
            "initialized": False,
            "seen": {},
            "night_buffer": [],
            "last_digest_date": "",
            "low_score_buffer": [],
            "last_low_digest_slot": "",
        }

    if not isinstance(state, dict):
        state = {}
    state.setdefault("initialized", False)
    state.setdefault("seen", {})
    state.setdefault("night_buffer", [])
    state.setdefault("last_digest_date", "")
    state.setdefault("low_score_buffer", [])
    state.setdefault("last_low_digest_slot", "")
    state.setdefault("last_run", {})
    if not isinstance(state.get("last_run"), dict):
        state["last_run"] = {}
    return state


def try_git(args: List[str]) -> str:
    try:
        return subprocess.check_output(args, stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:
        return ""


def github_run_url() -> str:
    server = (os.getenv("GITHUB_SERVER_URL") or "").strip()
    repo = (os.getenv("GITHUB_REPOSITORY") or "").strip()
    run_id = (os.getenv("GITHUB_RUN_ID") or "").strip()
    if server and repo and run_id:
        return f"{server}/{repo}/actions/runs/{run_id}"
    return ""


def save_state(state_file: Path, state: dict) -> None:
    tmp_file = state_file.with_suffix(".tmp")
    with tmp_file.open("w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    tmp_file.replace(state_file)


def prune_seen(seen: dict, ttl_hours: int) -> dict:
    cutoff = now_ts() - ttl_hours * 3600
    return {k: v for k, v in seen.items() if isinstance(v, int) and v >= cutoff}


def http_get_bytes(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def local_name(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def text_or_empty(elem: ET.Element, child_name: str) -> str:
    for child in list(elem):
        if local_name(child.tag).lower() == child_name.lower():
            return (child.text or "").strip()
    return ""


def rss_item_image_url(item: ET.Element) -> str:
    for child in list(item):
        name = local_name(child.tag).lower()
        if name == "image":
            url = (child.text or "").strip()
            if url:
                return url
        if name in ("content", "thumbnail"):
            url = (child.attrib.get("url") or "").strip()
            if url:
                return url
        if name == "enclosure":
            type_value = (child.attrib.get("type") or "").lower()
            url = (child.attrib.get("url") or "").strip()
            if url and type_value.startswith("image"):
                return url
    return ""


def parse_rss_items(root: ET.Element) -> List[dict]:
    out = []
    for item in root.iter():
        if local_name(item.tag).lower() != "item":
            continue
        title = text_or_empty(item, "title")
        link = normalize_news_link(text_or_empty(item, "link"))
        published = text_or_empty(item, "pubDate") or text_or_empty(item, "published")
        guid = text_or_empty(item, "guid")
        image_url = normalize_image_url(rss_item_image_url(item))
        out.append(
            {
                "id": guid or link or title,
                "title": title,
                "link": link,
                "published": published,
                "image_url": image_url,
            }
        )
    return out


def normalize_news_link(link: str) -> str:
    link = (link or "").strip()
    if not link:
        return ""
    try:
        u = urllib.parse.urlparse(link)
        host = (u.netloc or "").lower()
        if host.endswith("bing.com") and u.path.startswith("/news/apiclick.aspx"):
            q = urllib.parse.parse_qs(u.query)
            raw = (q.get("url") or [""])[0]
            if raw:
                return urllib.parse.unquote(raw)
    except Exception:
        return link
    return link


def normalize_image_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    if url.startswith("http://"):
        url = "https://" + url[len("http://") :]

    try:
        parsed = urllib.parse.urlparse(url)
        host = (parsed.netloc or "").lower()

        # Bing News default thumbnail is often 100x100; request high-res frame.
        if host.endswith("bing.com") and parsed.path == "/th":
            q = urllib.parse.parse_qs(parsed.query)
            if q.get("id") or q.get("thid"):
                q["w"] = ["1600"]
                q["h"] = ["900"]
                q["c"] = ["14"]
                q["rs"] = ["1"]
                new_query = urllib.parse.urlencode(q, doseq=True)
                return urllib.parse.urlunparse(parsed._replace(query=new_query))

        # Google-hosted images often include width parameters like '=s0-w300-rw'.
        if host.endswith("googleusercontent.com"):
            url = re.sub(r"=s0-w\\d+(-rw)?", "=s0-w1600-rw", url)
            url = re.sub(r"=w\\d+-h\\d+(-p)?", "=w1600-h900-p", url)
            return url
    except Exception:
        return url

    return url


def parse_atom_entries(root: ET.Element) -> List[dict]:
    out = []
    for entry in root.iter():
        if local_name(entry.tag).lower() != "entry":
            continue

        title = text_or_empty(entry, "title")
        published = text_or_empty(entry, "published") or text_or_empty(entry, "updated")
        uid = text_or_empty(entry, "id")

        link = ""
        image_url = ""
        for child in list(entry):
            if local_name(child.tag).lower() == "link":
                href = (child.attrib.get("href") or "").strip()
                rel = (child.attrib.get("rel") or "alternate").strip().lower()
                type_value = (child.attrib.get("type") or "").lower()
                if href and rel == "alternate":
                    link = href
                if href and rel == "enclosure" and type_value.startswith("image"):
                    image_url = normalize_image_url(href)

        out.append(
            {
                "id": uid or link or title,
                "title": title,
                "link": link,
                "published": published,
                "image_url": image_url,
            }
        )
    return out


def fetch_entries(url: str) -> List[dict]:
    data = http_get_bytes(url)
    root = ET.fromstring(data)
    root_name = local_name(root.tag).lower()

    if root_name == "rss":
        return parse_rss_items(root)
    if root_name == "feed":
        return parse_atom_entries(root)

    entries = parse_rss_items(root)
    if entries:
        return entries
    return parse_atom_entries(root)


def entry_uid(entry: dict) -> str:
    uid = entry.get("id") or entry.get("link") or entry.get("title")
    return str(uid).strip()


def entry_time_text(entry: dict) -> str:
    if entry.get("published"):
        return str(entry.get("published"))
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def parse_keywords(raw: str) -> List[str]:
    return [x.strip().lower() for x in raw.split(",") if x.strip()]


def parse_hour_slots(raw: str, default_hours: List[int]) -> List[int]:
    vals: List[int] = []
    for token in (raw or "").split(","):
        token = token.strip()
        if not token:
            continue
        try:
            h = int(token)
        except Exception:
            continue
        if 0 <= h <= 23 and h not in vals:
            vals.append(h)
    if not vals:
        vals = list(default_hours)
    return sorted(vals)


def build_keyword_patterns(keywords: List[str]) -> List[re.Pattern]:
    patterns = []
    for kw in keywords:
        kw = (kw or "").strip()
        if not kw:
            continue

        is_ascii = kw.isascii()
        if is_ascii:
            # For ASCII keywords:
            # - Match full words / phrases (avoid matching inside other words: fed != federal).
            # - Allow hyphen in multi-word phrases (e.g. "White-House").
            part = r"[\s\-]+".join(re.escape(p) for p in kw.split())
            patterns.append(
                re.compile(r"(?<![A-Za-z0-9_])" + part + r"(?![A-Za-z0-9_])", re.IGNORECASE)
            )
        else:
            # For non-ASCII (e.g. CJK), \b word boundary is unreliable (titles often have no spaces).
            # Use substring match instead.
            patterns.append(re.compile(re.escape(kw), re.IGNORECASE))
    return patterns


def is_major_news(entry: dict, keyword_patterns: List[re.Pattern]) -> bool:
    title = (entry.get("title") or "").strip()
    lower_title = title.lower()
    if "opinion" in lower_title:
        return False
    return any(p.search(title) for p in keyword_patterns)


def is_quiet_time(now_local: datetime, quiet_start: int, quiet_end: int) -> bool:
    h = now_local.hour
    if quiet_start < quiet_end:
        return quiet_start <= h < quiet_end
    return h >= quiet_start or h < quiet_end


def build_caption(source: str, entry: dict, prefix: str = "") -> str:
    title = (entry.get("title") or "(无标题)").strip()
    link = (entry.get("link") or "").strip()
    published = entry_time_text(entry)
    heat = compute_news_heat(source, entry)
    text = f"{prefix}[{source}] 🔥{heat:.1f}\n{title}\n{published}\n{link}".strip()
    return text[:1024]


def telegram_api_json(token: str, method: str, payload: dict) -> dict:
    url = f"https://api.telegram.org/bot{token}/{method}"
    raw = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=raw,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if not data.get("ok"):
        raise RuntimeError(f"Telegram API 返回失败: {data}")
    return data


def _reset_delivery_stats() -> None:
    global _DELIVERY_STATS
    _DELIVERY_STATS = {
        "primary": {"ok": 0, "fail": 0},
        "secondary": {"ok": 0, "fail": 0},
        "alerts_sent": 0,
        "alerts_fail": 0,
    }


def _bump_delivery(label: str, ok: bool) -> None:
    if label not in ("primary", "secondary"):
        return
    key = "ok" if ok else "fail"
    _DELIVERY_STATS[label][key] = int(_DELIVERY_STATS[label].get(key, 0)) + 1


def _snapshot_delivery_stats() -> dict:
    return {
        "primary": {
            "ok": int(_DELIVERY_STATS.get("primary", {}).get("ok", 0)),
            "fail": int(_DELIVERY_STATS.get("primary", {}).get("fail", 0)),
        },
        "secondary": {
            "ok": int(_DELIVERY_STATS.get("secondary", {}).get("ok", 0)),
            "fail": int(_DELIVERY_STATS.get("secondary", {}).get("fail", 0)),
        },
        "alerts_sent": int(_DELIVERY_STATS.get("alerts_sent", 0)),
        "alerts_fail": int(_DELIVERY_STATS.get("alerts_fail", 0)),
    }


def _telegram_targets(primary_token: str, primary_chat_id: str) -> List[tuple[str, str, str]]:
    targets: List[tuple[str, str, str]] = [(primary_token, primary_chat_id, "primary")]
    token2 = (
        os.getenv("SECONDARY_TELEGRAM_BOT_TOKEN")
        or os.getenv("TELEGRAM_BOT_TOKEN_2")
        or ""
    ).strip()
    chat2 = (
        os.getenv("SECONDARY_TELEGRAM_CHAT_ID")
        or os.getenv("TELEGRAM_CHAT_ID_2")
        or ""
    ).strip()
    if token2 and chat2 and (token2 != primary_token or chat2 != primary_chat_id):
        targets.append((token2, chat2, "secondary"))
    return targets


def _token_tail(token: str) -> str:
    t = (token or "").strip()
    return t[-4:] if len(t) >= 4 else t


def _log_push_targets(context: str, targets: List[tuple[str, str, str]]) -> None:
    parts = [f"{label}:chat={chat},token=*{_token_tail(tok)}" for tok, chat, label in targets]
    logging.info("push_targets context=%s %s", context, " | ".join(parts))


def _notify_push_failure(primary_token: str, primary_chat_id: str, reason: str) -> None:
    text = (
        "【Push Failure Alert】\n"
        f"time={datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"reason={reason[:500]}"
    )
    for dest_token, dest_chat, label in _telegram_targets(primary_token, primary_chat_id):
        try:
            telegram_api_json(
                dest_token,
                "sendMessage",
                {
                    "chat_id": dest_chat,
                    "text": text,
                    "disable_web_page_preview": True,
                },
            )
            _DELIVERY_STATS["alerts_sent"] = int(_DELIVERY_STATS.get("alerts_sent", 0)) + 1
        except Exception:
            _DELIVERY_STATS["alerts_fail"] = int(_DELIVERY_STATS.get("alerts_fail", 0)) + 1
            logging.exception("告警发送失败 label=%s chat_id=%s", label, dest_chat)


def send_telegram_message(
    token: str,
    chat_id: str,
    text: str,
    parse_mode: str = "",
    disable_web_page_preview: bool = False,
) -> None:
    targets = _telegram_targets(token, chat_id)
    _log_push_targets("sendMessage", targets)
    for idx, (dest_token, dest_chat, label) in enumerate(targets):
        payload = {
            "chat_id": dest_chat,
            "text": text,
            "disable_web_page_preview": disable_web_page_preview,
        }
        if parse_mode:
            payload["parse_mode"] = parse_mode
        try:
            telegram_api_json(dest_token, "sendMessage", payload)
            _bump_delivery(label, True)
        except Exception as exc:
            _bump_delivery(label, False)
            if idx == 0:
                _notify_push_failure(token, chat_id, f"primary sendMessage failed: {exc}")
                raise
            logging.exception("secondary sendMessage失败，chat_id=%s", dest_chat)
            _notify_push_failure(token, chat_id, f"secondary sendMessage failed: {exc}")


def send_telegram_photo(token: str, chat_id: str, photo_url: str, caption: str) -> None:
    targets = _telegram_targets(token, chat_id)
    _log_push_targets("sendPhoto", targets)
    for idx, (dest_token, dest_chat, label) in enumerate(targets):
        try:
            telegram_api_json(
                dest_token,
                "sendPhoto",
                {
                    "chat_id": dest_chat,
                    "photo": photo_url,
                    "caption": caption,
                },
            )
            _bump_delivery(label, True)
        except Exception as exc:
            _bump_delivery(label, False)
            if idx == 0:
                _notify_push_failure(token, chat_id, f"primary sendPhoto failed: {exc}")
                raise
            logging.exception("secondary sendPhoto失败，chat_id=%s url=%s", dest_chat, photo_url)
            _notify_push_failure(token, chat_id, f"secondary sendPhoto failed: {exc}")


def send_news_item(
    token: str, chat_id: str, source: str, entry: dict, prefix: str = "", fetch_article_image_enabled: bool = True
) -> None:
    caption = build_caption(source, entry, prefix=prefix)
    article_image = ""
    if fetch_article_image_enabled:
        try:
            article_image = normalize_image_url(fetch_article_image((entry.get("link") or "").strip()))
        except Exception:
            logging.exception("抓取正文配图失败，source=%s", source)

    image_candidates = [normalize_image_url((entry.get("image_url") or "").strip()), article_image]
    image_candidates.extend(normalize_image_url(x) for x in source_logo_candidates(source))
    image_candidates.append(DEFAULT_FALLBACK_IMAGE)
    targets = _telegram_targets(token, chat_id)
    _log_push_targets(f"news_item source={source}", targets)
    for dest_token, dest_chat, label in targets:
        sent = False
        tried = set()
        for image_url in image_candidates:
            if not image_url or image_url in tried:
                continue
            tried.add(image_url)
            try:
                telegram_api_json(
                    dest_token,
                    "sendPhoto",
                    {
                        "chat_id": dest_chat,
                        "photo": image_url,
                        "caption": caption,
                    },
                )
                _bump_delivery(label, True)
                sent = True
                break
            except Exception:
                logging.exception("sendPhoto失败，target=%s source=%s url=%s", label, source, image_url)

        if sent:
            continue

        try:
            telegram_api_json(
                dest_token,
                "sendMessage",
                {
                    "chat_id": dest_chat,
                    "text": caption,
                    "disable_web_page_preview": False,
                },
            )
            _bump_delivery(label, True)
            sent = True
            logging.info("sendPhoto均失败，已降级为sendMessage，target=%s source=%s", label, source)
        except Exception as exc:
            _bump_delivery(label, False)
            logging.exception("sendMessage兜底失败，target=%s source=%s", label, source)
            _notify_push_failure(token, chat_id, f"{label} push failed source={source}: {exc}")

        if label == "primary" and (not sent):
            raise RuntimeError("primary目标所有可用图片URL都发送失败且sendMessage也失败")


def build_rule_summary_text(items: List[dict], tz_name: str, now_local: datetime) -> str:
    source_counts: Dict[str, int] = {}
    grouped: Dict[str, List[dict]] = {}
    topic_order = [x[0] for x in get_summary_topic_rules()] + ["其他动态"]
    for it in items:
        src = it.get("source") or "未知来源"
        source_counts[src] = source_counts.get(src, 0) + 1
        entry = it.get("entry") or {}
        title = (entry.get("title") or "").strip()
        topic = detect_topic(title)
        grouped.setdefault(topic, []).append(
            {
                "item": it,
                "heat": compute_news_heat(src, entry, now_local=now_local),
            }
        )

    top_sources = ", ".join(f"{k}:{v}" for k, v in sorted(source_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:5]) or "未知"
    topic_rank = {
        t: (
            sum(x["heat"] for x in rows) / max(1, len(rows)),
            len(rows),
            -topic_order.index(t) if t in topic_order else -999,
        )
        for t, rows in grouped.items()
    }
    ranked_topics = sorted(
        grouped.keys(),
        key=lambda t: (
            -topic_rank[t][0],  # category average heat desc
            -topic_rank[t][1],  # count desc
            topic_order.index(t) if t in topic_order else 999,
        ),
    )

    lines = [
        f"<b>【新闻汇总】本轮共 {len(items)} 条（{now_local.strftime('%Y-%m-%d %H:%M')} {tz_name}）</b>",
        f"主要来源：{html.escape(top_sources)}",
        "",
    ]
    idx = 1
    for topic in ranked_topics:
        bucket = grouped.get(topic, [])
        if not bucket:
            continue
        avg_heat = sum(x["heat"] for x in bucket) / max(1, len(bucket))
        lines.append(f"<b>{html.escape(topic)}（{len(bucket)}，均热度{avg_heat:.1f}）</b>")
        bucket_sorted = sorted(bucket, key=lambda x: (-x["heat"],))
        for rec in bucket_sorted:
            if idx > SUMMARY_MAX_HEADLINES:
                break
            item = rec["item"]
            source = item.get("source") or "未知来源"
            entry = item.get("entry") or {}
            title = (entry.get("title") or "(无标题)").strip().replace("\n", " ")
            if len(title) > 92:
                title = title[:89] + "..."
            link = (entry.get("link") or "").strip()
            safe_title = html.escape(f"[{source}] {title}")
            if link:
                safe_link = html.escape(link, quote=True)
                lines.append(f'{idx}. <a href="{safe_link}">{safe_title}</a> (🔥{rec["heat"]:.1f})')
            else:
                lines.append(f'{idx}. {safe_title} (🔥{rec["heat"]:.1f})')
            idx += 1
        lines.append("")
        if idx > SUMMARY_MAX_HEADLINES:
            break
    if idx <= len(items):
        lines.append(f"… 其余 {len(items) - idx + 1} 条可在下一轮查看")

    return "\n".join(lines).strip()[:3900]


def build_ai_summary_text(
    items: List[dict], tz_name: str, now_local: datetime, api_key: str, model: str, max_items: int = 30
) -> str:
    focus = items[: max(1, max_items)]
    events = []
    for idx, item in enumerate(focus, start=1):
        source = item.get("source") or "未知来源"
        entry = item.get("entry") or {}
        title = (entry.get("title") or "(无标题)").strip().replace("\n", " ")
        link = (entry.get("link") or "").strip()
        heat = compute_news_heat(source, entry, now_local=now_local)
        events.append(f'{idx}. [{source}] {title}\n热度: {heat:.1f}\n链接: {link}')

    system_msg = (
        "你是新闻编辑。请输出高信息密度摘要，目标是在一条消息里看到尽量多标题并能直接点标题跳转链接。"
        "输出格式："
        "1) 先给1行总体概览；"
        "2) 按主题分组（每组标题用小标题）；"
        "3) 每条标题用HTML超链接格式：<a href=\"URL\">[来源] 标题</a> (🔥热度)；"
        "4) 不要编造。"
    )
    user_msg = (
        f"时间: {now_local.strftime('%Y-%m-%d %H:%M')} {tz_name}\n"
        f"新闻共 {len(items)} 条，以下是前 {len(focus)} 条:\n\n" + "\n\n".join(events)
    )

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(
            {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.2,
            }
        ).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    text = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    text = (text or "").strip()
    if not text:
        raise RuntimeError(f"AI总结返回为空: {data}")
    return f"【AI新闻汇总】{now_local.strftime('%m-%d %H:%M')} {tz_name}\n{text}"[:3900]


def maybe_send_compact_summary(
    token: str,
    chat_id: str,
    items: List[dict],
    tz_name: str,
    now_local: datetime,
    threshold: int,
    ai_api_key: str,
    ai_model: str,
    ai_max_items: int,
) -> bool:
    if len(items) <= threshold:
        return False

    chunks: List[List[dict]] = []
    for i in range(0, len(items), max(1, SUMMARY_CHUNK_SIZE)):
        chunks.append(items[i : i + max(1, SUMMARY_CHUNK_SIZE)])
    total_chunks = len(chunks)

    for idx, chunk_items in enumerate(chunks, start=1):
        summary_text = ""
        if ai_api_key:
            try:
                summary_text = build_ai_summary_text(
                    items=chunk_items,
                    tz_name=tz_name,
                    now_local=now_local,
                    api_key=ai_api_key,
                    model=ai_model,
                    max_items=min(max(1, ai_max_items), SUMMARY_CHUNK_SIZE),
                )
                logging.info(
                    "AI汇总成功，分片=%s/%s，条数=%s model=%s",
                    idx,
                    total_chunks,
                    len(chunk_items),
                    ai_model,
                )
            except Exception:
                logging.exception("AI汇总失败，将降级为规则汇总")

        if not summary_text:
            summary_text = build_rule_summary_text(items=chunk_items, tz_name=tz_name, now_local=now_local)

        if total_chunks > 1:
            summary_text = f"<b>【汇总分片 {idx}/{total_chunks}】</b>\n" + summary_text

        html_text = summary_text[:3900]
        try:
            send_telegram_message(
                token,
                chat_id,
                html_text,
                parse_mode="HTML",
                disable_web_page_preview=True,
            )
        except Exception:
            # Common Telegram 400 causes are malformed/truncated HTML entities.
            # Keep compact delivery by retrying as plain text instead of per-item fallback.
            plain_text = re.sub(r"<[^>]+>", "", html_text)
            plain_text = html.unescape(plain_text).strip()
            if len(plain_text) > 3900:
                plain_text = plain_text[:3900]
            logging.exception("汇总HTML发送失败，降级为纯文本汇总重试")
            send_telegram_message(
                token,
                chat_id,
                plain_text,
                parse_mode="",
                disable_web_page_preview=True,
            )
    return True


def flush_low_score_digest_if_due(
    token: str,
    chat_id: str,
    state: dict,
    now_local: datetime,
    tz_name: str,
    digest_hours: List[int],
    ai_api_key: str,
    ai_model: str,
    ai_max_items: int,
    fetch_article_image_enabled: bool = True,
) -> tuple[int, int]:
    if now_local.hour not in digest_hours:
        return 0, 0

    slot_key = f"{now_local.strftime('%Y-%m-%d')}-{now_local.hour:02d}"
    if state.get("last_low_digest_slot", "") == slot_key:
        return 0, 0

    buffered = state.get("low_score_buffer", [])
    state["last_low_digest_slot"] = slot_key
    if not buffered:
        logging.info("低分新闻定时汇总时点到达（%s），但缓存为空", slot_key)
        return 0, 0

    items = [{"source": x.get("source"), "entry": x.get("entry"), "uid": x.get("uid")} for x in buffered]
    try:
        maybe_send_compact_summary(
            token=token,
            chat_id=chat_id,
            items=items,
            tz_name=tz_name,
            now_local=now_local,
            threshold=0,
            ai_api_key=ai_api_key,
            ai_model=ai_model,
            ai_max_items=ai_max_items,
        )
        state["low_score_buffer"] = []
        logging.info("低分新闻定时汇总已推送，时点=%s 条数=%s", slot_key, len(items))
        return len(items), 1
    except Exception:
        logging.exception("低分新闻定时汇总失败，回退逐条发送")

    remain = []
    ok = 0
    failed = 0
    for item in items:
        source = item.get("source") or "未知来源"
        entry = item.get("entry") or {}
        try:
            send_news_item(
                token,
                chat_id,
                source,
                entry,
                prefix="[低分定时汇总] ",
                fetch_article_image_enabled=fetch_article_image_enabled,
            )
            ok += 1
        except Exception:
            failed += 1
            remain.append(item)
            logging.exception("低分新闻回退逐条推送失败: %s", source)

    state["low_score_buffer"] = remain
    if failed:
        return ok, ok
    return ok, 1 if ok > 0 else 0


def flush_night_digest(
    token: str,
    chat_id: str,
    state: dict,
    today_str: str,
    now_local: datetime,
    tz_name: str,
    summary_threshold: int,
    ai_api_key: str,
    ai_model: str,
    ai_max_items: int,
    fetch_article_image_enabled: bool = True,
) -> None:
    buffered = state.get("night_buffer", [])
    if not buffered:
        return

    logging.info("发送夜间汇总，条数=%s", len(buffered))
    if maybe_send_compact_summary(
        token=token,
        chat_id=chat_id,
        items=buffered,
        tz_name=tz_name,
        now_local=now_local,
        threshold=summary_threshold,
        ai_api_key=ai_api_key,
        ai_model=ai_model,
        ai_max_items=ai_max_items,
    ):
        state["night_buffer"] = []
        state["last_digest_date"] = today_str
        logging.info("夜间缓存已汇总推送，条数=%s", len(buffered))
        return

    remain = []
    ok = 0
    failed = 0
    for item in buffered:
        source = item.get("source") or "未知来源"
        entry = item.get("entry") or {}
        try:
            send_news_item(
                token,
                chat_id,
                source,
                entry,
                prefix="[夜间汇总] ",
                fetch_article_image_enabled=fetch_article_image_enabled,
            )
            ok += 1
        except Exception:
            failed += 1
            remain.append(item)
            logging.exception("夜间汇总推送失败: %s", source)

    if failed:
        # Keep failed items for retry on next cycle (don't set last_digest_date).
        state["night_buffer"] = remain
        logging.warning("夜间汇总部分失败，成功=%s 失败=%s，将在下轮重试失败项", ok, failed)
        return

    state["night_buffer"] = []
    state["last_digest_date"] = today_str


def run(run_once: bool = False) -> None:
    env_file = (os.getenv("ENV_FILE") or "").strip() or DEFAULT_ENV_FILE
    env_path = Path(env_file)
    if not env_path.is_absolute():
        env_path = (Path(__file__).resolve().parent / env_path).resolve()
    if not env_path.exists():
        raise RuntimeError(f"环境文件不存在: {env_file}")
    load_dotenv_simple(str(env_path))
    shared_env = (os.getenv("SHARED_ENV_FILE") or "").strip() or SHARED_ENV_FILE
    if Path(shared_env).exists():
        load_dotenv_simple(shared_env)
    apply_profile_credentials((os.getenv("APP_PROFILE") or PROFILE_PREFIX).strip() or PROFILE_PREFIX)

    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    poll_seconds = int(os.getenv("POLL_SECONDS", "120"))
    max_items_per_source = int(os.getenv("MAX_ITEMS_PER_SOURCE", "3"))
    max_news_age_hours = float(os.getenv("MAX_NEWS_AGE_HOURS", "24"))
    immediate_heat_min = float(os.getenv("IMMEDIATE_HEAT_MIN", "5"))
    low_digest_hours = parse_hour_slots(os.getenv("LOW_SCORE_DIGEST_HOURS", "9,12,15,18,21"), [9, 12, 15, 18, 21])
    bootstrap_silent = os.getenv("BOOTSTRAP_SILENT", "true").strip().lower() == "true"
    state_file = Path(os.getenv("STATE_FILE", ".state.json"))
    seen_ttl_hours = int(os.getenv("SEEN_TTL_HOURS", "72"))
    major_only = os.getenv("MAJOR_ONLY", "true").strip().lower() == "true"
    major_keywords = parse_keywords(os.getenv("MAJOR_KEYWORDS", ",".join(DEFAULT_MAJOR_KEYWORDS)))
    keyword_patterns = build_keyword_patterns(major_keywords)
    quiet_start = int(os.getenv("QUIET_HOUR_START", "23"))
    quiet_end = int(os.getenv("QUIET_HOUR_END", "9"))
    night_digest_max = int(os.getenv("NIGHT_DIGEST_MAX", "40"))
    fetch_article_image_enabled = os.getenv("FETCH_ARTICLE_IMAGE", "true").strip().lower() == "true"
    ai_summary_threshold = int(os.getenv("AI_SUMMARY_THRESHOLD", "10"))
    ai_summary_model = (os.getenv("AI_SUMMARY_MODEL", "gpt-5-mini") or "gpt-5-mini").strip()
    ai_summary_max_items = int(os.getenv("AI_SUMMARY_MAX_ITEMS", "30"))
    openai_api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    tz_name, news_tz = resolve_news_timezone()

    if not token or not chat_id:
        raise RuntimeError("请先配置 TELEGRAM_BOT_TOKEN 和 TELEGRAM_CHAT_ID")

    source_feeds = build_source_feeds()
    state = load_state(state_file)
    state["seen"] = prune_seen(state.get("seen", {}), seen_ttl_hours)

    logging.info(
        "开始运行，轮询间隔=%s秒，来源数量=%s，时区=%s quiet=%02d-%02d max_age=%sh immediate_heat>%s low_digest_hours=%s",
        poll_seconds,
        len(source_feeds),
        tz_name,
        quiet_start,
        quiet_end,
        max_news_age_hours,
        immediate_heat_min,
        ",".join(str(x) for x in low_digest_hours),
    )

    while True:
        try:
            now_local = datetime.now(tz=news_tz)
            cycle_ts = now_ts()
            now_utc = now_local.astimezone(timezone.utc)
            today_str = now_local.strftime("%Y-%m-%d")
            quiet_now = is_quiet_time(now_local, quiet_start, quiet_end)
            _reset_delivery_stats()

            if (not quiet_now) and now_local.hour >= quiet_end and state.get("last_digest_date", "") != today_str:
                flush_night_digest(
                    token=token,
                    chat_id=chat_id,
                    state=state,
                    today_str=today_str,
                    now_local=now_local,
                    tz_name=tz_name,
                    summary_threshold=ai_summary_threshold,
                    ai_api_key=openai_api_key,
                    ai_model=ai_summary_model,
                    ai_max_items=ai_summary_max_items,
                    fetch_article_image_enabled=fetch_article_image_enabled,
                )

            low_digest_items = 0
            low_digest_messages = 0
            low_digest_items, low_digest_messages = flush_low_score_digest_if_due(
                token=token,
                chat_id=chat_id,
                state=state,
                now_local=now_local,
                tz_name=tz_name,
                digest_hours=low_digest_hours,
                ai_api_key=openai_api_key,
                ai_model=ai_summary_model,
                ai_max_items=ai_summary_max_items,
                fetch_article_image_enabled=fetch_article_image_enabled,
            )

            sources_ok = 0
            sources_fail = 0
            entries_total = 0
            skipped_seen = 0
            skipped_old = 0
            skipped_major = 0
            skipped_lang = 0
            pushed_ok = 0
            pushed_fail = 0
            low_buffer_added = 0
            night_buffer_added = 0
            all_new = []
            cycle_seen = set()
            for source, url in source_feeds.items():
                entries = []
                used_url = ""
                last_exc: Exception | None = None
                for candidate_url in source_feed_candidates(source, url):
                    try:
                        entries = fetch_entries(candidate_url)
                        used_url = candidate_url
                        break
                    except Exception as exc:
                        last_exc = exc
                        continue
                if not used_url:
                    sources_fail += 1
                    logging.exception("抓取失败: %s", source, exc_info=last_exc)
                    continue
                if used_url != url:
                    logging.info("抓取源fallback命中: %s -> %s", source, used_url)
                sources_ok += 1
                entries_total += len(entries)
                entries_with_dt = [(entry, parse_published_ts(entry)) for entry in entries]
                entries_with_dt.sort(
                    key=lambda x: x[1] or datetime.fromtimestamp(0, tz=timezone.utc),
                    reverse=True,
                )
                lang_pref = SOURCE_LANGUAGE_PREFERENCE.get(source, "en")
                pref_items: List[tuple[dict, datetime | None]] = []
                fallback_items: List[tuple[dict, datetime | None]] = []
                for entry, published_dt in entries_with_dt:
                    lang = detect_entry_language(entry)
                    if lang not in ALLOWED_PUSH_LANGUAGES:
                        skipped_lang += 1
                        continue
                    if lang == lang_pref:
                        pref_items.append((entry, published_dt))
                    else:
                        fallback_items.append((entry, published_dt))
                entries_with_dt = pref_items + fallback_items

                new_count = 0
                for entry, published_dt in entries_with_dt:
                    uid = entry_uid(entry)
                    if not uid:
                        continue
                    if uid in state["seen"] or uid in cycle_seen:
                        if uid in state["seen"]:
                            skipped_seen += 1
                        continue
                    if not published_dt:
                        skipped_old += 1
                        continue
                    age_hours = max(0.0, (now_utc - published_dt).total_seconds() / 3600)
                    if age_hours > max_news_age_hours:
                        skipped_old += 1
                        continue

                    topic = detect_topic(entry.get("title") or "")
                    war_unfiltered = topic == "战争与冲突"
                    iran_tagged = is_iran_related(entry)

                    if major_only and (not war_unfiltered) and (not iran_tagged) and (not is_major_news(entry, keyword_patterns)):
                        skipped_major += 1
                        continue

                    heat = compute_news_heat(source, entry, now_local=now_local)
                    cycle_seen.add(uid)
                    all_new.append((source, entry, uid, heat, topic, war_unfiltered))
                    new_count += 1
                    if new_count >= max_items_per_source:
                        break

            state["seen"] = prune_seen(state["seen"], seen_ttl_hours)

            if sources_ok == 0:
                logging.warning("本轮所有来源抓取均失败（sources_fail=%s），可能是网络/被封/源站变更导致", sources_fail)
            if entries_total > 0 and len(all_new) == 0:
                if major_only and skipped_major > 0:
                    logging.info(
                        "本轮有内容但未命中关键词：entries_total=%s skipped_major=%s skipped_seen=%s skipped_old=%s",
                        entries_total,
                        skipped_major,
                        skipped_seen,
                        skipped_old,
                    )
                else:
                    logging.info(
                        "本轮有内容但没有新条目：entries_total=%s skipped_seen=%s skipped_old=%s",
                        entries_total,
                        skipped_seen,
                        skipped_old,
                    )

            if not state.get("initialized", False):
                # Seed seen cache on the very first run (prevents historical spam).
                for _source, _entry, uid, _heat, _topic, _war in all_new:
                    state["seen"][uid] = cycle_ts
                state["initialized"] = True
                save_state(state_file, state)
                if bootstrap_silent:
                    logging.info("首次启动完成，已建立去重缓存（静默模式）")
                    if run_once:
                        break
                    time.sleep(poll_seconds)
                    continue

            immediate_items = []
            low_buffer = state.get("low_score_buffer", [])
            for source, entry, uid, heat, topic, war_unfiltered in all_new:
                if war_unfiltered or heat > immediate_heat_min:
                    immediate_items.append((source, entry, uid, heat, topic, war_unfiltered))
                    continue
                low_buffer.append(
                    {
                        "source": source,
                        "entry": entry,
                        "uid": uid,
                        "heat": heat,
                        "buffered_ts": cycle_ts,
                    }
                )
                state["seen"][uid] = cycle_ts
                low_buffer_added += 1
            state["low_score_buffer"] = low_buffer

            if low_buffer_added:
                logging.info("低分新闻已缓存，新增=%s 当前缓存=%s", low_buffer_added, len(low_buffer))

            if quiet_now and immediate_items:
                night_buffer = state.get("night_buffer", [])
                if not isinstance(night_buffer, list):
                    night_buffer = []
                buffered_uids = {str(x.get("uid")) for x in night_buffer if isinstance(x, dict) and x.get("uid")}
                for source, entry, uid, heat, _topic, _war in immediate_items:
                    if uid in buffered_uids:
                        continue
                    night_buffer.append(
                        {
                            "source": source,
                            "entry": entry,
                            "uid": uid,
                            "heat": heat,
                            "buffered_ts": cycle_ts,
                        }
                    )
                    state["seen"][uid] = cycle_ts
                    night_buffer_added += 1
                    buffered_uids.add(uid)
                state["night_buffer"] = night_buffer
                immediate_items = []
                if night_buffer_added:
                    logging.info("夜间免打扰生效，高分新闻转入夜间缓存，新增=%s 当前夜间缓存=%s", night_buffer_added, len(night_buffer))

            compact_items = [{"source": s, "entry": e, "uid": u} for s, e, u, _h, _topic, _war in immediate_items]
            sent_compact = False
            try:
                sent_compact = maybe_send_compact_summary(
                    token=token,
                    chat_id=chat_id,
                    items=compact_items,
                    tz_name=tz_name,
                    now_local=now_local,
                    threshold=ai_summary_threshold,
                    ai_api_key=openai_api_key,
                    ai_model=ai_summary_model,
                    ai_max_items=ai_summary_max_items,
                )
            except Exception:
                logging.exception("高分新闻汇总推送失败，将回退逐条发送")
                sent_compact = False

            if sent_compact:
                for _source, _entry, uid, _heat, _topic, _war in immediate_items:
                    state["seen"][uid] = cycle_ts
                pushed_ok += 1
                logging.info("已推送高分汇总消息，覆盖条数=%s", len(immediate_items))
            else:
                for source, entry, uid, _heat, _topic, _war in immediate_items:
                    try:
                        send_news_item(
                            token, chat_id, source, entry, fetch_article_image_enabled=fetch_article_image_enabled
                        )
                        state["seen"][uid] = cycle_ts
                        pushed_ok += 1
                        logging.info("已推送: %s | %s", source, entry.get("title", ""))
                    except Exception:
                        pushed_fail += 1
                        logging.exception("推送失败: %s", source)

            checkout_sha = try_git(["git", "rev-parse", "HEAD"])
            checkout_ref = try_git(["git", "rev-parse", "--abbrev-ref", "HEAD"])
            if checkout_ref == "HEAD":
                checkout_ref = ""
            delivery = _snapshot_delivery_stats()

            utc_now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            state["last_run"] = {
                "utc": utc_now,
                "local": now_local.replace(microsecond=0).isoformat(),
                "tz": tz_name,
                "local_hour": now_local.hour,
                "quiet": quiet_now,
                "sources_ok": sources_ok,
                "sources_fail": sources_fail,
                "entries_total": entries_total,
                "new": len(all_new),
                "pushed_ok": pushed_ok,
                "pushed_fail": pushed_fail,
                "skipped_seen": skipped_seen,
                "skipped_old": skipped_old,
                "skipped_major": skipped_major,
                "skipped_lang": skipped_lang,
                "buffered_total": len(state.get("night_buffer", [])),
                "buffered_added": night_buffer_added,
                "low_buffer_total": len(state.get("low_score_buffer", [])),
                "low_buffer_added": low_buffer_added,
                "low_digest_items": low_digest_items,
                "low_digest_messages": low_digest_messages,
                "delivery": delivery,
                "seen_size": len(state.get("seen", {})) if isinstance(state.get("seen"), dict) else 0,
                "github": {
                    "repo": (os.getenv("GITHUB_REPOSITORY") or "").strip(),
                    "workflow": (os.getenv("GITHUB_WORKFLOW") or "").strip(),
                    "run_id": (os.getenv("GITHUB_RUN_ID") or "").strip(),
                    "run_number": (os.getenv("GITHUB_RUN_NUMBER") or "").strip(),
                    "sha": (os.getenv("GITHUB_SHA") or "").strip(),
                    "ref": (os.getenv("GITHUB_REF") or "").strip(),
                    "run_url": github_run_url(),
                },
                "checkout": {
                    "ref": checkout_ref,
                    "sha": checkout_sha,
                },
            }

            save_state(state_file, state)
            logging.info(
                "summary tz=%s local_hour=%s quiet=%s sources_ok=%s sources_fail=%s entries_total=%s new=%s pushed_ok=%s pushed_fail=%s skipped_seen=%s skipped_old=%s skipped_major=%s skipped_lang=%s low_buffer=%s low_added=%s low_digest_items=%s delivery_p=%s/%s delivery_s=%s/%s alerts=%s/%s",
                tz_name,
                now_local.hour,
                quiet_now,
                sources_ok,
                sources_fail,
                entries_total,
                len(all_new),
                pushed_ok,
                pushed_fail,
                skipped_seen,
                skipped_old,
                skipped_major,
                skipped_lang,
                len(state.get("low_score_buffer", [])),
                low_buffer_added,
                low_digest_items,
                delivery.get("primary", {}).get("ok", 0),
                delivery.get("primary", {}).get("fail", 0),
                delivery.get("secondary", {}).get("ok", 0),
                delivery.get("secondary", {}).get("fail", 0),
                delivery.get("alerts_sent", 0),
                delivery.get("alerts_fail", 0),
            )
            logging.info("本轮完成，新消息=%s", len(all_new))
        except Exception:
            logging.exception("主循环异常")

        if run_once:
            break
        time.sleep(poll_seconds)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Telegram News Notifier")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    run(run_once=args.once)
