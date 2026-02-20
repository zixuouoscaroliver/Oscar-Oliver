import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  PauseCircle, 
  Globe, 
  Clock, 
  BarChart3, 
  Zap, 
  ChevronRight, 
  Search, 
  Filter,
  ArrowUpDown,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Info,
  X
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

// --- Types ---

export type SourceStatus = 'OK' | 'WARN' | 'ERROR' | 'DISABLED';
export type SourcePriority = 'primary' | 'fallback';

export interface SourceEvent {
  ts: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  msg: string;
}

export interface NewsSource {
  id: string;
  name: string;
  region: string;
  type: string;
  status: SourceStatus;
  enabled: boolean;
  priority: SourcePriority;
  last_success_at: string;
  last_item_published_at: string;
  success_count_20_cycles: number;
  fail_count_20_cycles: number;
  items_24h: number;
  avg_parse_latency_ms: number;
  last_error: string;
  recent_titles: string[];
  recent_events: SourceEvent[];
}

// --- Mock Data ---

const MOCK_SOURCES: NewsSource[] = [
  {
    id: "reuters_world",
    name: "Reuters World",
    region: "Global",
    type: "International",
    status: "OK",
    enabled: true,
    priority: "primary",
    last_success_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(), // 2 mins ago
    last_item_published_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    success_count_20_cycles: 20,
    fail_count_20_cycles: 0,
    items_24h: 142,
    avg_parse_latency_ms: 380,
    last_error: "",
    recent_titles: ["Global markets react to inflation data", "Peace talks show progress in region"],
    recent_events: [
      { ts: "10:30:12", level: "INFO", msg: "Fetch successful: 12 new items" },
      { ts: "10:15:05", level: "INFO", msg: "Connection pool optimized" }
    ]
  },
  {
    id: "ap_politics",
    name: "AP Politics",
    region: "US",
    type: "Political",
    status: "WARN",
    enabled: true,
    priority: "primary",
    last_success_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    last_item_published_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    success_count_20_cycles: 14,
    fail_count_20_cycles: 6,
    items_24h: 45,
    avg_parse_latency_ms: 1250,
    last_error: "Timeout: Read timeout after 10s on /v1/feed",
    recent_titles: ["Congress debates new funding bill", "White House briefing highlights"],
    recent_events: [
      { ts: "09:45:22", level: "WARN", msg: "High latency detected: 4.2s" },
      { ts: "09:30:10", level: "ERROR", msg: "Timeout on request" }
    ]
  },
  {
    id: "nyt_asia",
    name: "NYT Asia",
    region: "Asia",
    type: "Regional",
    status: "OK",
    enabled: true,
    priority: "primary",
    last_success_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    last_item_published_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    success_count_20_cycles: 19,
    fail_count_20_cycles: 1,
    items_24h: 88,
    avg_parse_latency_ms: 520,
    last_error: "",
    recent_titles: ["Tech boom in Southeast Asia continues", "New trade agreement signed"],
    recent_events: [
      { ts: "10:22:15", level: "INFO", msg: "Fetch successful: 5 new items" }
    ]
  },
  {
    id: "bbc_archive",
    name: "BBC Archive",
    region: "UK",
    type: "Backup",
    status: "DISABLED",
    enabled: false,
    priority: "fallback",
    last_success_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    last_item_published_at: new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(),
    success_count_20_cycles: 0,
    fail_count_20_cycles: 0,
    items_24h: 0,
    avg_parse_latency_ms: 0,
    last_error: "Manually disabled via config_v4",
    recent_titles: [],
    recent_events: []
  },
  {
    id: "twitter_stream",
    name: "X/Twitter Realtime",
    region: "Global",
    type: "Social",
    status: "ERROR",
    enabled: true,
    priority: "primary",
    last_success_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    last_item_published_at: new Date(Date.now() - 1000 * 60 * 185).toISOString(),
    success_count_20_cycles: 2,
    fail_count_20_cycles: 18,
    items_24h: 12,
    avg_parse_latency_ms: 0,
    last_error: "403 Forbidden: API limit reached / Auth revoked",
    recent_titles: ["Breaking: Major event in Tokyo"],
    recent_events: [
      { ts: "07:30:00", level: "ERROR", msg: "Rate limit exceeded" },
      { ts: "07:15:00", level: "ERROR", msg: "403 Forbidden" }
    ]
  }
];

// --- Sub-components ---

const StatusBadge = ({ status }: { status: SourceStatus }) => {
  const styles = {
    OK: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
    WARN: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    ERROR: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
    DISABLED: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-neutral-200 dark:border-neutral-700",
  };

  const icons = {
    OK: <CheckCircle2 className="w-3 h-3" />,
    WARN: <AlertTriangle className="w-3 h-3" />,
    ERROR: <XCircle className="w-3 h-3" />,
    DISABLED: <PauseCircle className="w-3 h-3" />,
  };

  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${styles[status]}`}>
      {icons[status]}
      {status}
    </div>
  );
};

export const SourceDetailDrawer = ({ source, isOpen, onClose }: { source: NewsSource | null, isOpen: boolean, onClose: () => void }) => {
  if (!source) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <Motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]" 
          />
          <Motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-neutral-900 shadow-2xl z-[201] flex flex-col border-l border-neutral-200 dark:border-neutral-800"
          >
            <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center bg-neutral-50 dark:bg-neutral-950/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg text-white"><Globe className="w-5 h-5" /></div>
                <div>
                  <h2 className="text-xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">{source.name}</h2>
                  <div className="flex gap-2 mt-0.5">
                    <StatusBadge status={source.status} />
                    <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">{source.region} • {source.type}</span>
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-full transition-colors">
                <X className="w-6 h-6 text-neutral-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <div className="text-[10px] text-neutral-400 font-black uppercase mb-1">Items 24h / 24小时抓取</div>
                  <div className="text-2xl font-black text-blue-500 font-mono">{source.items_24h}</div>
                </div>
                <div className="bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <div className="text-[10px] text-neutral-400 font-black uppercase mb-1">Latency / 平均延迟</div>
                  <div className="text-2xl font-black text-amber-500 font-mono">{source.avg_parse_latency_ms}ms</div>
                </div>
              </div>

              {/* Recent Errors */}
              {source.last_error && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-4 rounded-xl">
                  <div className="flex items-center gap-2 mb-2 text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-xs font-black uppercase tracking-wider">最近错误详情 Last Error Detail</span>
                  </div>
                  <p className="text-sm font-mono text-red-800 dark:text-red-300 break-words leading-relaxed bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-red-200/50 dark:border-red-800/30">
                    {source.last_error}
                  </p>
                </div>
              )}

              {/* Recent Titles */}
              <section>
                <div className="flex items-center gap-2 mb-4 text-neutral-500">
                  <ExternalLink className="w-4 h-4" />
                  <h3 className="text-xs font-black uppercase tracking-widest">最近内容预览 Recent Content</h3>
                </div>
                <div className="space-y-3">
                  {source.recent_titles.length > 0 ? source.recent_titles.map((title, i) => (
                    <div key={i} className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-medium">
                      "{title}"
                    </div>
                  )) : <div className="text-sm italic text-neutral-400 text-center py-4">无最近内容 No recent items</div>}
                </div>
              </section>

              {/* Event Log */}
              <section>
                <div className="flex items-center gap-2 mb-4 text-neutral-500">
                  <BarChart3 className="w-4 h-4" />
                  <h3 className="text-xs font-black uppercase tracking-widest">诊断日志 Source Events</h3>
                </div>
                <div className="space-y-2 font-mono text-xs">
                  {source.recent_events.map((ev, i) => (
                    <div key={i} className={`flex gap-3 p-2 rounded ${ev.level === 'ERROR' ? 'text-red-500 bg-red-500/5' : ev.level === 'WARN' ? 'text-amber-500 bg-amber-500/5' : 'text-neutral-500 bg-neutral-500/5'}`}>
                      <span className="opacity-50 shrink-0">[{ev.ts}]</span>
                      <span className="font-bold shrink-0 w-12">[{ev.level}]</span>
                      <span className="break-all">{ev.msg}</span>
                    </div>
                  ))}
                  {source.recent_events.length === 0 && <div className="text-neutral-400 italic text-center py-4">无日志记录 No logs</div>}
                </div>
              </section>
            </div>

            <div className="p-6 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/50">
              <button 
                onClick={onClose}
                className="w-full py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-bold uppercase tracking-widest text-sm hover:opacity-90 transition-opacity"
              >
                Close / 关闭
              </button>
            </div>
          </Motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// --- Main Components ---

export const SourceStatusPanel = () => {
  const [sources] = useState<NewsSource[]>(MOCK_SOURCES);
  const [filter, setFilter] = useState<SourceStatus | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<keyof NewsSource>('last_success_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedSource, setSelectedSource] = useState<NewsSource | null>(null);

  const filteredSources = useMemo(() => {
    let result = filter === 'ALL' ? [...sources] : sources.filter(s => s.status === filter);
    
    result.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      return 0;
    });
    
    return result;
  }, [sources, filter, sortKey, sortOrder]);

  const toggleSort = (key: keyof NewsSource) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  return (
    <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Panel Header */}
      <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-50 dark:bg-neutral-900/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-500/10 dark:bg-green-500/20 rounded-xl flex items-center justify-center border border-green-500/20">
            <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-neutral-900 dark:text-white uppercase">Sources 健康与覆盖 <span className="text-green-600 dark:text-green-500">Status</span></h2>
            <p className="text-xs text-neutral-500 font-medium mt-0.5">当前启用的新闻抓取来源及其健康运行指标概览</p>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
          {(['ALL', 'OK', 'WARN', 'ERROR', 'DISABLED'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap border ${
                filter === f 
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white shadow-md' 
                  : 'bg-white dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:border-neutral-400'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-neutral-50 dark:bg-neutral-800/30 border-b border-neutral-200 dark:border-neutral-800">
              <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Source / 来源</th>
              <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest cursor-pointer group" onClick={() => toggleSort('status')}>
                <div className="flex items-center gap-1">Status 状态 {sortKey === 'status' && <ArrowUpDown className="w-3 h-3 text-blue-500" />}</div>
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest cursor-pointer group" onClick={() => toggleSort('last_success_at')}>
                <div className="flex items-center gap-1">Last Success 最近成功 {sortKey === 'last_success_at' && <ArrowUpDown className="w-3 h-3 text-blue-500" />}</div>
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Cycles 周期 (20轮)</th>
              <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest cursor-pointer group" onClick={() => toggleSort('items_24h')}>
                <div className="flex items-center gap-1">24h Items 抓取量 {sortKey === 'items_24h' && <ArrowUpDown className="w-3 h-3 text-blue-500" />}</div>
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Latency 延迟</th>
              <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Priority 优先级</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filteredSources.map(s => (
              <tr 
                key={s.id} 
                onClick={() => setSelectedSource(s)}
                className="group hover:bg-neutral-50 dark:hover:bg-neutral-800/40 cursor-pointer transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-neutral-900 dark:text-neutral-100">{s.name}</span>
                    <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-tighter">{s.region} • {s.type}</span>
                  </div>
                </td>
                <td className="px-6 py-4"><StatusBadge status={s.status} /></td>
                <td className="px-6 py-4 text-xs font-mono text-neutral-500 dark:text-neutral-400">
                  <div className="flex flex-col">
                    <span>{format(new Date(s.last_success_at), 'HH:mm:ss')}</span>
                    <span className="text-[10px] opacity-60">Success</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 w-16 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden flex">
                      <div className="bg-green-500 h-full" style={{ width: `${(s.success_count_20_cycles / 20) * 100}%` }}></div>
                      <div className="bg-red-500 h-full" style={{ width: `${(s.fail_count_20_cycles / 20) * 100}%` }}></div>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-500">{s.success_count_20_cycles}/{s.fail_count_20_cycles}</span>
                  </div>
                </td>
                <td className="px-6 py-4 font-black font-mono text-sm text-neutral-800 dark:text-neutral-200">{s.items_24h}</td>
                <td className="px-6 py-4 text-xs font-mono text-neutral-500">{s.avg_parse_latency_ms > 0 ? `${s.avg_parse_latency_ms}ms` : 'N/A'}</td>
                <td className="px-6 py-4">
                  <div className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                    s.priority === 'primary' ? 'bg-blue-100/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-neutral-200 dark:border-neutral-700'
                  }`}>
                    {s.priority === 'primary' ? <Zap className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                    {s.priority}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="lg:hidden p-4 space-y-3 bg-white dark:bg-neutral-900">
        {filteredSources.map(s => (
          <div 
            key={s.id} 
            onClick={() => setSelectedSource(s)}
            className="p-4 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/50"
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-black text-neutral-900 dark:text-white uppercase tracking-tight">{s.name}</h4>
                <div className="text-[10px] text-neutral-500 font-bold uppercase">{s.region} • {s.type}</div>
              </div>
              <StatusBadge status={s.status} />
            </div>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
              <div>
                <div className="text-[10px] text-neutral-400 uppercase font-black">24h Items</div>
                <div className="text-sm font-black font-mono">{s.items_24h}</div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-400 uppercase font-black">Last Success</div>
                <div className="text-sm font-mono">{format(new Date(s.last_success_at), 'HH:mm')}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredSources.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-neutral-400">
          <Filter className="w-12 h-12 mb-4 opacity-10" />
          <p className="font-bold">未找到符合筛选条件的来源</p>
          <p className="text-xs">No sources matching your current filters.</p>
        </div>
      )}

      {/* Panel Footer */}
      <div className="p-4 bg-neutral-50 dark:bg-neutral-800/30 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
        <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest flex items-center gap-2">
          <Info className="w-3 h-3" /> 点击行以查看详细抓取日志与最近内容预览
        </div>
        <div className="text-[10px] font-mono text-neutral-500 uppercase">
          Total Enabled: {sources.filter(s => s.enabled).length}
        </div>
      </div>

      {/* Detail Drawer */}
      <SourceDetailDrawer 
        source={selectedSource} 
        isOpen={!!selectedSource} 
        onClose={() => setSelectedSource(null)} 
      />
    </section>
  );
};
