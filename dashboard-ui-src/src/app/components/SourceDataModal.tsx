import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  PauseCircle, 
  Globe, 
  Search, 
  Filter, 
  ArrowUpDown, 
  Zap, 
  Clock, 
  ChevronDown, 
  ChevronUp,
  BarChart3,
  ExternalLink,
  Info,
  Calendar
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

// --- Types (Re-using from previous context) ---
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
    last_success_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    last_item_published_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    success_count_20_cycles: 20,
    fail_count_20_cycles: 0,
    items_24h: 142,
    avg_parse_latency_ms: 380,
    last_error: "",
    recent_titles: ["Global markets react to inflation data", "Peace talks show progress in region"],
    recent_events: [{ ts: "10:30:12", level: "INFO", msg: "Fetch successful: 12 new items" }]
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
    recent_titles: ["Congress debates new funding bill"],
    recent_events: [{ ts: "09:45:22", level: "WARN", msg: "High latency detected: 4.2s" }]
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
    recent_events: [{ ts: "07:30:00", level: "ERROR", msg: "Rate limit exceeded" }]
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
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${styles[status]}`}>
      {status}
    </div>
  );
};

const SummaryChip = ({ label, zh, value, color }: any) => (
  <div className="bg-white dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 flex flex-col items-center justify-center min-w-[100px] shadow-sm">
    <span className={`${color} text-lg font-black font-mono`}>{value}</span>
    <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest">{label}</span>
    <span className="text-[8px] text-neutral-500 font-medium">{zh}</span>
  </div>
);

const SourceRow = ({ source }: { source: NewsSource }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`border-b border-neutral-100 dark:border-neutral-800 last:border-0 transition-colors ${isExpanded ? 'bg-neutral-50 dark:bg-neutral-900/40' : 'hover:bg-neutral-50/50 dark:hover:bg-neutral-900/20'}`}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex flex-wrap md:flex-nowrap items-center gap-4 px-6 py-4 cursor-pointer"
      >
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-neutral-900 dark:text-neutral-100">{source.name}</span>
            {source.priority === 'primary' && <Zap className="w-3 h-3 text-blue-500 fill-current" />}
          </div>
          <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-tighter">{source.region} • {source.type}</div>
        </div>

        <div className="w-24 shrink-0 flex justify-center"><StatusBadge status={source.status} /></div>

        <div className="w-32 hidden md:block text-[10px] font-mono text-neutral-500">
          <div className="font-bold text-neutral-700 dark:text-neutral-300">
            {source.status === 'DISABLED' ? '--' : format(new Date(source.last_success_at), 'HH:mm:ss')}
          </div>
          <div className="opacity-60">Last Success</div>
        </div>

        <div className="w-24 hidden md:block text-center">
          <div className="text-sm font-black font-mono text-neutral-800 dark:text-neutral-200">{source.items_24h}</div>
          <div className="text-[9px] text-neutral-400 font-bold uppercase">24h Items</div>
        </div>

        <div className="w-32 hidden lg:block">
           <div className="flex items-center gap-2 mb-1">
             <div className="flex-1 h-1 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden flex">
               <div className="bg-green-500 h-full" style={{ width: `${(source.success_count_20_cycles/20)*100}%` }}></div>
               <div className="bg-red-500 h-full" style={{ width: `${(source.fail_count_20_cycles/20)*100}%` }}></div>
             </div>
           </div>
           <div className="text-[9px] font-mono text-neutral-400 flex justify-between">
             <span>S:{source.success_count_20_cycles}</span>
             <span>F:{source.fail_count_20_cycles}</span>
           </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          {source.last_error && <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />}
          {isExpanded ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <Motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-neutral-100/30 dark:bg-black/10 border-t border-neutral-100 dark:border-neutral-800"
          >
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <h5 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> 最近内容预览 Recent Content
                  </h5>
                  <div className="space-y-2">
                    {source.recent_titles.map((t, i) => (
                      <div key={i} className="text-sm p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 font-medium">
                        "{t}"
                      </div>
                    ))}
                    {source.recent_titles.length === 0 && <div className="text-xs italic text-neutral-400">无内容记录 No items found.</div>}
                  </div>
                </div>

                {source.last_error && (
                  <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-xl border border-red-100 dark:border-red-900/30">
                    <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" /> Error Details
                    </div>
                    <div className="text-xs font-mono text-red-800 dark:text-red-300 break-words">{source.last_error}</div>
                  </div>
                )}
              </div>

              <div>
                <h5 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" /> 诊断日志 Events Log
                </h5>
                <div className="space-y-2 font-mono text-[10px]">
                  {source.recent_events.map((ev, i) => (
                    <div key={i} className="flex gap-2 p-2 bg-neutral-200/50 dark:bg-neutral-800/30 rounded">
                      <span className="opacity-50">[{ev.ts}]</span>
                      <span className={ev.level === 'ERROR' ? 'text-red-500 font-bold' : ev.level === 'WARN' ? 'text-amber-500' : 'text-blue-500'}>
                        [{ev.level}]
                      </span>
                      <span className="text-neutral-600 dark:text-neutral-400">{ev.msg}</span>
                    </div>
                  ))}
                  {source.recent_events.length === 0 && <div className="text-xs italic text-neutral-400">无日志记录 No logs.</div>}
                </div>
              </div>
            </div>
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main Modal Component ---

export const SourceDataModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<SourceStatus | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<keyof NewsSource>('items_24h');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredSources = useMemo(() => {
    let result = MOCK_SOURCES.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchFilter = filter === 'ALL' || s.status === filter;
      return matchSearch && matchFilter;
    });

    result.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
      }
      return 0;
    });
    return result;
  }, [searchTerm, filter, sortKey, sortOrder]);

  const stats = useMemo(() => ({
    total: MOCK_SOURCES.length,
    ok: MOCK_SOURCES.filter(s => s.status === 'OK').length,
    warn: MOCK_SOURCES.filter(s => s.status === 'WARN').length,
    error: MOCK_SOURCES.filter(s => s.status === 'ERROR').length,
    disabled: MOCK_SOURCES.filter(s => s.status === 'DISABLED').length,
    totalItems: MOCK_SOURCES.reduce((acc, s) => acc + s.items_24h, 0)
  }), []);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 overflow-hidden">
          {/* Backdrop */}
          <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-neutral-950/60 backdrop-blur-md"
          />

          {/* Modal Container */}
          <Motion.div
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-5xl max-h-full bg-white dark:bg-neutral-900 rounded-[2rem] shadow-2xl flex flex-col border border-neutral-200 dark:border-neutral-800 overflow-hidden"
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-950/20">
              <div>
                <h2 className="text-2xl font-black text-neutral-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
                  <ShieldCheck className="w-7 h-7 text-blue-500" />
                  来源数据 <span className="text-blue-600 dark:text-blue-500 font-medium">Sources</span>
                </h2>
                <div className="flex items-center gap-4 text-[10px] text-neutral-500 font-bold uppercase tracking-widest mt-1">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Update: 10:31:00</span>
                  <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Timezone: Asia/Shanghai</span>
                  <span className="flex items-center gap-1"><Info className="w-3 h-3" /> Total: {stats.total} Sources</span>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-3 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-full transition-colors group"
              >
                <X className="w-6 h-6 text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white" />
              </button>
            </div>

            {/* Stats Chips */}
            <div className="px-8 py-6 flex flex-wrap gap-4 border-b border-neutral-100 dark:border-neutral-800">
              <SummaryChip label="Total Sources" zh="来源总数" value={stats.total} color="text-neutral-900 dark:text-white" />
              <SummaryChip label="Status OK" zh="健康活跃" value={stats.ok} color="text-green-500" />
              <SummaryChip label="Status WARN" zh="波动异常" value={stats.warn} color="text-amber-500" />
              <SummaryChip label="Status ERROR" zh="严重错误" value={stats.error} color="text-red-500" />
              <SummaryChip label="Disabled" zh="已禁用" value={stats.disabled} color="text-neutral-400" />
              <SummaryChip label="Items 24h" zh="24h 抓取总量" value={stats.totalItems} color="text-blue-500" />
            </div>

            {/* Filters Bar */}
            <div className="px-8 py-4 bg-neutral-50/30 dark:bg-neutral-950/10 border-b border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input 
                  type="text" 
                  placeholder="搜索来源名称 Search Source Name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mr-2">Filter</span>
                {(['ALL', 'OK', 'WARN', 'ERROR', 'DISABLED'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${
                      filter === f 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20' 
                        : 'bg-white dark:bg-neutral-800 text-neutral-500 border-neutral-200 dark:border-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mr-2">Sort</span>
                <button 
                  onClick={() => { setSortKey('items_24h'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-all ${sortKey === 'items_24h' ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400'}`}
                >
                  Items 24h <ArrowUpDown className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => { setSortKey('last_success_at'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-all ${sortKey === 'last_success_at' ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400'}`}
                >
                  Last Success <ArrowUpDown className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filteredSources.length > 0 ? (
                <div className="flex flex-col">
                  {filteredSources.map(source => (
                    <SourceRow key={source.id} source={source} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                  <Search className="w-12 h-12 mb-4 opacity-10" />
                  <p className="font-bold uppercase tracking-widest text-sm">No Results / 未找到匹配来源</p>
                  <p className="text-xs">尝试调整搜索词或过滤器项 Try adjusting your search or filters.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-8 py-4 bg-neutral-50 dark:bg-neutral-950/20 border-t border-neutral-100 dark:border-neutral-800 flex justify-between items-center text-[10px] font-mono text-neutral-400">
               <div className="flex items-center gap-2">
                 <ShieldCheck className="w-3 h-3 text-green-500" />
                 <span>System reports all primary source clusters are nominal.</span>
               </div>
               <div className="uppercase tracking-[0.2em]">Source Monitor v2.1</div>
            </div>
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
