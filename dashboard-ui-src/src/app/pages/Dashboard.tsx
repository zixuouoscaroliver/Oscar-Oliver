import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Play,
  Square,
  RefreshCw,
  Zap,
  Clock,
  Activity,
  Database,
  Send,
  XCircle,
  AlertTriangle,
  Filter,
  Layers,
  Archive,
  Terminal,
  ChevronRight,
  Settings2,
  ShieldCheck,
  Globe,
  Bell,
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { toast, Toaster } from 'sonner';
import { TagManagementDrawer } from '../components/TagManagementDrawer';
import {
  LowScoreDetailModal,
  SourcesDetailModal,
  SkippedDetailModal,
  DigestQueueDetailModal,
  NewFoundDetailModal,
  PushedDetailModal,
} from '../components/Modals';

type StatusPayload = {
  now: string;
  process: { running: boolean; pids: string[] };
  last_start: string;
  last_summary: string;
  last_push: string;
  last_error: string;
  last_error_time?: string;
  low_buffer_count: number;
  night_buffer_count?: number;
  digest_queue_count?: number;
  activity: {
    phase: string;
    last_log_age_sec: number | null;
    fresh: boolean;
    last_log_line: string;
    recent_events: string[];
    poll_seconds?: number;
    seconds_to_next_cycle?: number | null;
  };
  delivery?: {
    primary: { ok: number; fail: number };
    secondary: { ok: number; fail: number };
    alerts_sent: number;
    alerts_fail: number;
  };
  delivery_1h?: {
    window_hours: number;
    primary: { ok: number; fail: number };
    secondary: { ok: number; fail: number };
    alerts_sent: number;
    alerts_fail: number;
    summary_count: number;
  };
};

type SummaryMetrics = {
  new: number;
  pushed_ok: number;
  sources_ok: number;
  sources_fail: number;
  skipped_seen: number;
  skipped_old: number;
  skipped_major: number;
  skipped_lang: number;
  low_buffer: number;
  low_digest_items: number;
  raw: string;
};

type EventView = { id: string; title: string; time: string; message: string; level: 'info' | 'success' | 'warning' | 'error' };

const API_BASE = (import.meta.env.VITE_MONITOR_API_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const apiUrl = (path: string): string => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

const FALLBACK: StatusPayload = {
  now: '-',
  process: { running: false, pids: [] },
  last_start: '-',
  last_summary: '-',
  last_push: '-',
  last_error: '-',
  last_error_time: '',
  low_buffer_count: 0,
  activity: { phase: 'idle', last_log_age_sec: null, fresh: false, last_log_line: '-', recent_events: [], poll_seconds: 120, seconds_to_next_cycle: 0 },
  delivery: { primary: { ok: 0, fail: 0 }, secondary: { ok: 0, fail: 0 }, alerts_sent: 0, alerts_fail: 0 },
  delivery_1h: { window_hours: 1, primary: { ok: 0, fail: 0 }, secondary: { ok: 0, fail: 0 }, alerts_sent: 0, alerts_fail: 0, summary_count: 0 },
};

const EMPTY_METRICS: SummaryMetrics = {
  new: 0,
  pushed_ok: 0,
  sources_ok: 0,
  sources_fail: 0,
  skipped_seen: 0,
  skipped_old: 0,
  skipped_major: 0,
  skipped_lang: 0,
  low_buffer: 0,
  low_digest_items: 0,
  raw: '-',
};

const trimLogPrefix = (line: string): string => (line || '').replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3}\s+\w+\s+/, '');
const toNum = (v: string | undefined): number => Number(v || 0);

const parseSummary = (line: string): SummaryMetrics => {
  if (!line || line === '-') return EMPTY_METRICS;
  const out: Record<string, string> = {};
  for (const token of line.match(/[a-z_]+=[^\s]+/g) || []) {
    const i = token.indexOf('=');
    if (i > 0) out[token.slice(0, i)] = token.slice(i + 1);
  }
  return {
    new: toNum(out.new),
    pushed_ok: toNum(out.pushed_ok),
    sources_ok: toNum(out.sources_ok),
    sources_fail: toNum(out.sources_fail),
    skipped_seen: toNum(out.skipped_seen),
    skipped_old: toNum(out.skipped_old),
    skipped_major: toNum(out.skipped_major),
    skipped_lang: toNum(out.skipped_lang),
    low_buffer: toNum(out.low_buffer),
    low_digest_items: toNum(out.low_digest_items),
    raw: line,
  };
};

const eventLevel = (line: string): EventView['level'] => {
  if (/ERROR|抓取失败/.test(line)) return 'error';
  if (/WARNING/.test(line)) return 'warning';
  if (/已推送/.test(line)) return 'success';
  return 'info';
};

const eventTitle = (line: string): string => {
  if (/已推送汇总消息|低分新闻定时汇总已推送/.test(line)) return 'Digest Pushed';
  if (/已推送:/.test(line)) return 'Single Push';
  if (/summary tz=/.test(line)) return 'Cycle Summary';
  if (/抓取失败/.test(line)) return 'Source Error';
  return 'Runtime Event';
};

const DeliveryChannelCard = ({ name, data, icon: Icon, colorClass }: any) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const total = (data?.ok || 0) + (data?.fail || 0);
  const rate = total > 0 ? Math.round((data.ok / total) * 100) : 0;
  const status = total === 0 ? 'UNKNOWN' : data.fail === 0 ? 'OK' : data.fail > data.ok ? 'ERROR' : 'WARN';
  const statusColors: any = {
    OK: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]',
    WARN: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]',
    ERROR: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
    UNKNOWN: 'bg-neutral-400',
  };

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/50 rounded-xl overflow-hidden transition-all hover:border-neutral-400 dark:hover:border-neutral-600">
      <div className="p-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 ${colorClass}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-800 dark:text-neutral-200">{name}</span>
          </div>
          <div className={`w-2 h-2 rounded-full ${statusColors[status]}`}></div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <div className="text-[9px] text-neutral-400 font-bold uppercase tracking-tighter">Success / Fail</div>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-black font-mono text-neutral-900 dark:text-white">{data?.ok ?? '--'}</span>
              <span className="text-[10px] font-mono text-neutral-400">/</span>
              <span className={`text-xs font-mono font-bold ${data?.fail > 0 ? 'text-red-500' : 'text-neutral-500'}`}>{data?.fail || 0}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-neutral-400 font-bold uppercase tracking-tighter">Rate</div>
            <div className="text-sm font-black font-mono text-blue-500">{rate}%</div>
          </div>
        </div>

        <div className="h-1 w-full bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden flex">
          <div className="bg-green-500 h-full" style={{ width: `${rate}%` }}></div>
          <div className="bg-red-500 h-full" style={{ width: `${total > 0 ? (data.fail / total) * 100 : 0}%` }}></div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && data?.last_error ? (
          <Motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="bg-red-50 dark:bg-red-950/20 border-t border-red-100 dark:border-red-900/30 p-3">
            <div className="text-[8px] font-black text-red-500 uppercase tracking-widest mb-1">Last Error Details</div>
            <div className="text-[10px] font-mono text-red-800 dark:text-red-300 break-words leading-tight uppercase">{data.last_error}</div>
          </Motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

const DeliveryChannelsPanel = ({ deliveryData, onViewLogs }: any) => (
  <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[2rem] p-6 shadow-sm">
    <div className="flex items-center justify-between mb-6">
      <div>
        <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">推送通道状态 Delivery Channels</h3>
        <p className="text-[8px] text-neutral-500 font-bold uppercase tracking-widest mt-1">Primary / Secondary / Alert Health</p>
      </div>
      <span className="text-[9px] font-mono text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded uppercase font-bold">1H Metrics</span>
    </div>

    <div className="space-y-3">
      <DeliveryChannelCard name="Primary" data={deliveryData?.primary} icon={Zap} colorClass="text-blue-500" />
      <DeliveryChannelCard name="Secondary" data={deliveryData?.secondary} icon={Globe} colorClass="text-neutral-500" />
      <DeliveryChannelCard name="Alert" data={deliveryData?.alerts} icon={Bell} colorClass="text-amber-500" />
    </div>

    <div className="mt-6 pt-6 border-t border-neutral-100 dark:border-neutral-800 flex flex-col gap-2">
      <button
        onClick={onViewLogs}
        className="w-full py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        <Archive className="w-3 h-3" /> 查看推送记录 View Logs
      </button>
      <div className="text-center text-[8px] text-neutral-400 font-bold uppercase tracking-widest">Summary Count: {deliveryData?.summary_count || 0}</div>
    </div>
  </div>
);

const MetricCardClickable = ({ title, subTitle, value, subtext, icon: Icon, colorClass = 'text-blue-500', onClick, themeClass = '' }: any) => (
  <button
    onClick={onClick}
    className={`group bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm flex flex-col gap-3 transition-all hover:border-blue-500 dark:hover:border-blue-500 hover:scale-[1.01] active:scale-[0.99] text-left relative overflow-hidden ${themeClass}`}
  >
    <div className="flex items-center justify-between relative z-10">
      <div className="flex flex-col">
        <span className="text-neutral-900 dark:text-neutral-100 font-black text-xs uppercase tracking-tight">{title}</span>
        <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest">{subTitle}</span>
      </div>
      <div className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 group-hover:bg-blue-600/10 transition-colors">
        <Icon className={`w-4 h-4 ${colorClass}`} />
      </div>
    </div>
    <div className="text-3xl font-black tracking-tighter text-neutral-900 dark:text-white leading-none mt-1 relative z-10 font-mono">{value}</div>
    {subtext ? (
      <div className="text-neutral-400 dark:text-neutral-500 text-[9px] font-black uppercase mt-1 relative z-10 flex items-center gap-1 group-hover:text-blue-500 transition-colors">
        {subtext} <ChevronRight className="w-3 h-3" />
      </div>
    ) : null}
  </button>
);

const SectionGroup = ({ title, subtitle, icon: Icon, children, themeColor = 'blue' }: any) => {
  const themes: any = {
    blue: 'bg-blue-50/30 dark:bg-blue-900/5 border-blue-100 dark:border-blue-900/20',
    amber: 'bg-amber-50/20 dark:bg-amber-900/5 border-amber-100 dark:border-amber-900/10',
    green: 'bg-green-50/20 dark:bg-green-900/5 border-green-100 dark:border-green-900/10',
  };
  const iconColors: any = { blue: 'text-blue-600', amber: 'text-amber-600', green: 'text-green-600' };
  return (
    <div className={`p-6 rounded-[2rem] border ${themes[themeColor]} space-y-4`}>
      <div className="flex items-center gap-3 px-2">
        <div className={`w-8 h-8 rounded-lg ${themes[themeColor]} flex items-center justify-center border`}>
          <Icon className={`w-4 h-4 ${iconColors[themeColor]}`} />
        </div>
        <div>
          <h3 className="text-sm font-black text-neutral-900 dark:text-white uppercase tracking-wider">{title}</h3>
          <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest leading-none">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
};

const EventCard = ({ event }: { event: EventView }) => {
  const levelColors: any = {
    info: 'border-l-blue-500 bg-blue-50/30 dark:bg-blue-900/10',
    success: 'border-l-green-500 bg-green-50/30 dark:bg-green-900/10',
    warning: 'border-l-amber-500 bg-amber-50/30 dark:bg-amber-900/10',
    error: 'border-l-red-500 bg-red-50/30 dark:bg-red-900/10',
  };

  return (
    <div className={`p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 border-l-4 ${levelColors[event.level]} mb-3`}>
      <div className="flex justify-between items-start mb-1">
        <span className="font-semibold text-neutral-800 dark:text-neutral-100">{event.title}</span>
        <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">{event.time}</span>
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed break-words">{event.message}</p>
    </div>
  );
};

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [status, setStatus] = useState<StatusPayload>(FALLBACK);
  const [loading, setLoading] = useState(false);
  const [engineBusy, setEngineBusy] = useState(false);
  const [pushingAll, setPushingAll] = useState(false);

  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isLowScoreModalOpen, setIsLowScoreModalOpen] = useState(false);
  const [isSourcesModalOpen, setIsSourcesModalOpen] = useState(false);
  const [isSkippedModalOpen, setIsSkippedModalOpen] = useState(false);
  const [isDigestQueueModalOpen, setIsDigestQueueModalOpen] = useState(false);
  const [isNewFoundModalOpen, setIsNewFoundModalOpen] = useState(false);
  const [isPushedModalOpen, setIsPushedModalOpen] = useState(false);

  const [lastSummary, setLastSummary] = useState<SummaryMetrics>(EMPTY_METRICS);
  const [events, setEvents] = useState<EventView[]>([]);

  const fetchStatus = useCallback(async (showToast = false) => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/status'));
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = (await res.json()) as StatusPayload;
      setStatus(body);
      setLastSummary(parseSummary(body.last_summary || '-'));
      setEvents(
        (body.activity?.recent_events || []).map((line, idx) => ({
          id: `${idx}-${line.slice(0, 24)}`,
          title: eventTitle(line),
          time: (line.match(/\d{2}:\d{2}:\d{2}/) || ['--:--:--'])[0],
          message: trimLogPrefix(line),
          level: eventLevel(line),
        }))
      );
      if (showToast) toast.success('Monitoring data refreshed');
    } catch (e: any) {
      toast.error('状态拉取失败 Failed to fetch status', { description: `${String(e?.message || e)} | ${API_BASE}` });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(() => fetchStatus(true), [fetchStatus]);

  const handlePushAll = useCallback(async () => {
    try {
      setPushingAll(true);
      const res = await fetch(apiUrl('/api/push-topic'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: '__ALL__' }),
      });
      const body = await res.json();
      if (!res.ok || body?.ok === false) throw new Error(body?.error || `status ${res.status}`);
      toast.success('已触发全部缓存推送 Push all cached now', { description: `sent=${body.sent}` });
      fetchStatus(false);
    } catch (e: any) {
      toast.error('推送失败 Push failed', { description: String(e?.message || e) });
    } finally {
      setPushingAll(false);
    }
  }, [fetchStatus]);

  const controlNotifier = useCallback(
    async (action: 'start' | 'stop') => {
      try {
        setEngineBusy(true);
        const res = await fetch(apiUrl('/api/control-notifier'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const body = await res.json();
        if (!res.ok || body?.ok === false) throw new Error(body?.error || `status ${res.status}`);
        toast.success(`Stable 引擎操作成功: ${action.toUpperCase()}`);
        fetchStatus(false);
      } catch (e: any) {
        toast.error('Stable 引擎操作失败', { description: String(e?.message || e) });
      } finally {
        setEngineBusy(false);
      }
    },
    [fetchStatus]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    fetchStatus(false);
    const poll = window.setInterval(() => fetchStatus(false), 1000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poll);
    };
  }, [fetchStatus]);

  const isRunning = Boolean(status.process?.running);
  const pollSeconds = Math.max(1, Number(status.activity?.poll_seconds ?? 120));
  const nextPoll = Math.max(0, Number(status.activity?.seconds_to_next_cycle ?? 0));
  const logAge = Number(status.activity?.last_log_age_sec ?? 0);

  const enginePhaseMap: Record<string, string> = {
    running: '正在抓取 Running',
    filtering: '数据过滤 Filtering',
    pushing_single: '正在推送 Pushing',
    pushing_summary: '汇总推送 Digest',
    cycle_done: '周期结束 Cycle Done',
    fetch_error: '抓取异常 Error',
    idle: '等待中 Idle',
  };

  const skippedTotal = lastSummary.skipped_seen + lastSummary.skipped_old + lastSummary.skipped_major + lastSummary.skipped_lang;
  const delivery1h = status.delivery_1h || FALLBACK.delivery_1h!;
  const deliveryView = {
    primary: { ...delivery1h.primary, last_ts: status.now, last_error: status.last_error || '' },
    secondary: { ...delivery1h.secondary, last_ts: status.now, last_error: '' },
    alerts: { ok: delivery1h.alerts_sent, fail: delivery1h.alerts_fail, last_ts: status.now, last_error: status.last_error || '' },
    summary_count: delivery1h.summary_count,
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 font-sans selection:bg-blue-100 dark:selection:bg-blue-900/30">
      <Toaster position="top-right" theme="system" />

      <header className="sticky top-0 z-50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-[1600px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap className="text-white w-6 h-6 fill-current" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 uppercase">
                News Pusher <span className="text-blue-600 dark:text-blue-500">Console</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-100 text-emerald-700 tracking-widest">STABLE</span>
              </h1>
              <div className="flex items-center gap-3 text-sm text-neutral-500 font-medium">
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {format(currentTime, 'HH:mm:ss')}</span>
                <span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700"></span>
                <span className="text-neutral-400">API: {API_BASE}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsTagManagerOpen(true)}
              className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-white dark:hover:bg-neutral-700 transition-colors shadow-sm"
            >
              <Settings2 className="w-4 h-4 text-blue-500" /> 标签管理 Tag Manager
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="px-4 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新 Refresh
            </button>
            <button
              onClick={handlePushAll}
              disabled={pushingAll}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
            >
              <Send className="w-4 h-4" /> {pushingAll ? '推送中...' : '立即推送全部缓存 Push All Now'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 lg:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-10">
            <section className="space-y-12">
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black flex items-center gap-3 tracking-tight uppercase"><Activity className="w-6 h-6 text-blue-500" /> 控制台总览 Dashboard Summary</h2>
                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-[0.2em] mt-2 ml-9 opacity-70">数据管线流转状态概览 Pipeline Flow Status Overview</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest bg-neutral-100 dark:bg-neutral-800 px-3 py-1 rounded-full">{status.now || '--'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4 py-2 border-y border-neutral-100 dark:border-neutral-800/50">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Input 输入</span></div>
                  <ChevronRight className="w-3 h-3 text-neutral-300" />
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500"></div><span className="text-[10px] font-black uppercase tracking-widest text-amber-600">Process 处理</span></div>
                  <ChevronRight className="w-3 h-3 text-neutral-300" />
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500"></div><span className="text-[10px] font-black uppercase tracking-widest text-green-600">Output 输出</span></div>
                </div>
              </div>

              <div className="space-y-8">
                <SectionGroup title="输入层 Input" subtitle="数据抓取与源健康 Data Ingestion & Sources" icon={Database} themeColor="blue">
                  <MetricCardClickable title="新增抓取" subTitle="New Found" value={lastSummary.new} icon={Database} subtext="查看新增明细 View New" onClick={() => setIsNewFoundModalOpen(true)} />
                  <MetricCardClickable title="来源状态" subTitle="Sources Status" value={`${lastSummary.sources_ok}/${lastSummary.sources_fail}`} icon={ShieldCheck} colorClass={lastSummary.sources_fail > 0 ? 'text-red-500' : 'text-green-500'} subtext="查看来源健康 View Health" onClick={() => setIsSourcesModalOpen(true)} />
                </SectionGroup>

                <SectionGroup title="处理中 Processing" subtitle="规则过滤与缓存筛选 Rules Filter & Cache" icon={Filter} themeColor="amber">
                  <MetricCardClickable title="已跳过" subTitle="Skipped" value={skippedTotal} icon={XCircle} colorClass="text-neutral-400" subtext="查看过滤历史 View Filtered" onClick={() => setIsSkippedModalOpen(true)} />
                  <MetricCardClickable title="低分主题" subTitle="Low Topics" value={status.low_buffer_count} icon={Archive} colorClass="text-amber-500" subtext="查看低分缓存 View Cache" onClick={() => setIsLowScoreModalOpen(true)} />
                </SectionGroup>

                <SectionGroup title="输出层 Delivery" subtitle="任务分发与推送详情 Distribution & Broadcasting" icon={Send} themeColor="green">
                  <MetricCardClickable
                    title="待汇总"
                    subTitle="Digest Queue"
                    value={status.digest_queue_count ?? status.low_buffer_count}
                    icon={Layers}
                    colorClass="text-blue-400"
                    subtext="查看待汇总队列 View Queue"
                    onClick={() => setIsDigestQueueModalOpen(true)}
                  />
                  <MetricCardClickable title="已推送" subTitle="Pushed" value={lastSummary.pushed_ok} icon={Send} colorClass="text-green-500" subtext="查看推送记录 View Records" onClick={() => setIsPushedModalOpen(true)} />
                </SectionGroup>
              </div>

              <div className="p-4 bg-neutral-200/30 dark:bg-neutral-900/50 rounded-2xl border border-neutral-200 dark:border-neutral-800 mt-12">
                <div className="flex items-center gap-2 text-[10px] text-neutral-400 font-mono uppercase mb-2"><Terminal className="w-3 h-3" /> 原始日志片段 Raw Log Segment</div>
                <code className="text-xs text-neutral-500 dark:text-neutral-400 font-mono block whitespace-pre-wrap leading-relaxed">{lastSummary.raw || '-'}</code>
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-3 tracking-tight"><Terminal className="w-5 h-5 text-blue-500" /> 实时事件流 Live Events</h2>
                <div className="flex gap-2"><span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Streaming</span></div>
              </div>

              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="max-h-[500px] overflow-y-auto p-6 custom-scrollbar">
                  <AnimatePresence mode="popLayout">
                    {events.map((event, idx) => (
                      <Motion.div key={event.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}>
                        <EventCard event={event} />
                      </Motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </section>
          </div>

          <aside className="lg:col-span-4 space-y-8">
            <div className="bg-neutral-900 dark:bg-black border border-neutral-800 dark:border-white/10 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6">
                <Motion.div animate={isRunning ? { scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] } : { opacity: 0.8 }} transition={{ repeat: Infinity, duration: 2 }} className={`w-4 h-4 rounded-full ${isRunning ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]'}`}></Motion.div>
              </div>

              <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.3em] mb-8">引擎实时状态 Live Engine</h3>

              <div className="space-y-8">
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase font-bold mb-2 tracking-widest">当前阶段 Current Phase</div>
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-black text-white uppercase tracking-tighter italic group-hover:text-blue-500 transition-colors">{enginePhaseMap[status.activity?.phase || 'idle'] || status.activity?.phase || 'idle'}</div>
                    {isRunning ? (
                      <Motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}>
                        <RefreshCw className="w-5 h-5 text-blue-500" />
                      </Motion.div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">距离下次轮询 Next Poll In</span>
                    <span className="text-xl font-mono font-black text-blue-500">00:{String(nextPoll).padStart(2, '0')}</span>
                  </div>
                  <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                    <Motion.div className="h-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.4)]" initial={{ width: '100%' }} animate={{ width: isRunning ? `${(nextPoll / pollSeconds) * 100}%` : '0%' }} transition={{ duration: 1, ease: 'linear' }}></Motion.div>
                  </div>
                  <div className="flex justify-between text-[10px] text-neutral-600 font-bold uppercase"><span>Active Cycle</span><span>{logAge}s Age</span></div>
                </div>

                <div className="bg-neutral-800/50 rounded-2xl p-4 border border-neutral-700/50">
                  <div className="text-[10px] text-blue-400 font-mono mb-2 uppercase tracking-[0.2em] font-black">最新执行日志 Latest Log</div>
                  <div className="text-sm text-neutral-300 font-mono leading-relaxed italic">{trimLogPrefix(status.activity?.last_log_line || '-')}</div>
                </div>
              </div>
            </div>

            <DeliveryChannelsPanel deliveryData={deliveryView} onViewLogs={() => setIsPushedModalOpen(true)} />

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] mb-6">进程信息 Process</h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl ${isRunning ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-500' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500'}`}>
                      {isRunning ? <Play className="w-5 h-5 fill-current" /> : <Square className="w-5 h-5 fill-current" />}
                    </div>
                    <div>
                      <div className="font-black text-lg tracking-tight">{isRunning ? '正在运行 RUNNING' : '已停止 STOPPED'}</div>
                      <div className="text-[10px] text-neutral-400 font-mono font-bold uppercase">PID: {status.process?.pids?.length ? status.process.pids.join(',') : '-'}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => controlNotifier(isRunning ? 'stop' : 'start')}
                    disabled={engineBusy}
                    className={`p-3 rounded-full border transition-all ${isRunning ? 'border-red-200 hover:bg-red-50 text-red-500' : 'border-green-200 hover:bg-green-50 text-green-500'} disabled:opacity-60`}
                  >
                    {isRunning ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-neutral-400" /><h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">最近启动 Last Start</h4></div>
                <div className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{trimLogPrefix(status.last_start || '-')}</div>
              </div>

              <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-red-500" /><h4 className="text-[10px] font-black text-red-500/70 uppercase tracking-widest">最近异常 Last Error</h4></div>
                <div className="text-sm font-bold text-red-800 dark:text-red-400 line-clamp-2">{trimLogPrefix(status.last_error || '-')}</div>
                <div className="text-[11px] text-red-600/60 dark:text-red-500/40 mt-1 italic">{status.last_error_time ? `发生于 ${status.last_error_time}` : '无最近异常时间'}</div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <TagManagementDrawer isOpen={isTagManagerOpen} onClose={() => setIsTagManagerOpen(false)} />
      <LowScoreDetailModal isOpen={isLowScoreModalOpen} onClose={() => setIsLowScoreModalOpen(false)} />
      <SourcesDetailModal isOpen={isSourcesModalOpen} onClose={() => setIsSourcesModalOpen(false)} />
      <SkippedDetailModal isOpen={isSkippedModalOpen} onClose={() => setIsSkippedModalOpen(false)} />
      <DigestQueueDetailModal isOpen={isDigestQueueModalOpen} onClose={() => setIsDigestQueueModalOpen(false)} />
      <NewFoundDetailModal isOpen={isNewFoundModalOpen} onClose={() => setIsNewFoundModalOpen(false)} />
      <PushedDetailModal isOpen={isPushedModalOpen} onClose={() => setIsPushedModalOpen(false)} />

      <footer className="max-w-[1600px] mx-auto p-6 lg:p-10 flex justify-between items-center border-t border-neutral-200 dark:border-neutral-800 text-neutral-500 text-[10px] font-mono uppercase tracking-widest">
        <div>© 2026 News Pusher Engine v8.4.2</div>
        <div className="flex gap-4"><a href="#" className="hover:text-blue-500">System Logs</a><a href="#" className="hover:text-blue-500">API Docs</a><a href="#" className="hover:text-blue-500">Status Page</a></div>
      </footer>
    </div>
  );
}
