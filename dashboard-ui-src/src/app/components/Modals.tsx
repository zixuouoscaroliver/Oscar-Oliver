import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Filter,
  ShieldCheck,
  XCircle,
  Layers,
  Database,
  Send,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Archive,
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

const API_BASE = (import.meta.env.VITE_MONITOR_API_BASE || 'http://127.0.0.1:8788').replace(/\/+$/, '');
const apiUrl = (path: string): string => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

const BaseModal = ({ isOpen, onClose, title, subtitle, icon: Icon, children }: any) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 overflow-hidden">
          <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-neutral-950/60 backdrop-blur-md" />
          <Motion.div
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            className="relative w-full max-w-6xl max-h-full bg-white dark:bg-neutral-900 rounded-[2rem] shadow-2xl flex flex-col border border-neutral-200 dark:border-neutral-800 overflow-hidden"
          >
            <div className="px-8 py-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-950/20">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600/10 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                  <Icon className="w-6 h-6 text-blue-600 dark:text-blue-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">{title}</h2>
                  <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mt-1">{subtitle}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-3 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-full transition-colors group">
                <X className="w-6 h-6 text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8">{children}</div>
          </Motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};

function useDetailApi(path: string, isOpen: boolean) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(apiUrl(path));
      const body = await res.json();
      if (!res.ok || body?.ok === false) throw new Error(body?.error || `status ${res.status}`);
      setData(body);
    } catch (e: any) {
      const msg = String(e?.message || e);
      setError(msg);
      toast.error('详情拉取失败', { description: msg });
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (!isOpen) return;
    load();
  }, [isOpen, load]);

  return { loading, error, data, reload: load };
}

const SectionHeader = ({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) => (
  <div className="flex justify-end mb-4">
    <button onClick={onRefresh} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-neutral-300 hover:bg-neutral-50 flex items-center gap-2">
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
    </button>
  </div>
);

const ErrorTip = ({ error }: { error: string }) =>
  error ? <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div> : null;

export const LowScoreDetailModal = ({ isOpen, onClose }: any) => {
  const { loading, error, data, reload } = useDetailApi('/api/details/low-topics', isOpen);
  const [busyTopic, setBusyTopic] = useState('');
  const topics = (data?.items || []) as any[];

  const pushTopic = async (topic: string) => {
    try {
      setBusyTopic(topic);
      const res = await fetch(apiUrl('/api/push-topic'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const body = await res.json();
      if (!res.ok || body?.ok === false) throw new Error(body?.error || `status ${res.status}`);
      toast.success(`已推送主题: ${topic}`, { description: `sent=${body.sent}` });
      reload();
    } catch (e: any) {
      toast.error('主题推送失败', { description: String(e?.message || e) });
    } finally {
      setBusyTopic('');
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="低分主题缓存" subtitle="Low Score Topics Cache • <= 5.0 pts" icon={Filter}>
      <SectionHeader onRefresh={reload} loading={loading} />
      <ErrorTip error={error} />
      <div className="space-y-6">
        {topics.map((topic, idx) => (
          <div key={idx} className="bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800">
            <div className="flex justify-between items-center mb-4 gap-4">
              <div className="flex items-center gap-3">
                <span className="text-lg font-black uppercase text-neutral-800 dark:text-white">{topic.topic}</span>
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-black rounded-full border border-blue-200 dark:border-blue-800">Avg {topic.avg_heat} pts</span>
              </div>
              <button
                onClick={() => pushTopic(topic.topic)}
                disabled={busyTopic === topic.topic}
                className="text-[10px] font-black uppercase px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg shadow-blue-600/20 hover:scale-105 transition-transform disabled:opacity-60"
              >
                {busyTopic === topic.topic ? '推送中...' : '立即推送 Push Now'}
              </button>
            </div>
            <div className="space-y-3">
              {(topic.items || []).slice(0, 20).map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold truncate">{item.title}</span>
                    <span className="text-[10px] text-neutral-400 uppercase font-bold">{item.source} • {item.published || '-'}</span>
                  </div>
                  <span className="text-amber-500 font-mono font-bold shrink-0">{item.heat}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!loading && topics.length === 0 ? <div className="text-sm text-neutral-500">暂无低分主题缓存</div> : null}
      </div>
    </BaseModal>
  );
};

export const SourcesDetailModal = ({ isOpen, onClose }: any) => {
  const { loading, error, data, reload } = useDetailApi('/api/details/sources', isOpen);
  const sources = (data?.items || []) as any[];

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="来源健康状态" subtitle="Source Health & Coverage Status" icon={ShieldCheck}>
      <SectionHeader onRefresh={reload} loading={loading} />
      <ErrorTip error={error} />
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-black uppercase text-neutral-400 border-b border-neutral-100 dark:border-neutral-800">
              <th className="pb-4">Source / 来源</th>
              <th className="pb-4">Status / 状态</th>
              <th className="pb-4 text-center">24h Items / 抓取量</th>
              <th className="pb-4">Last Error / 最近异常</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {sources.map((s, i) => (
              <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                <td className="py-4 font-bold text-neutral-800 dark:text-white">{s.source}</td>
                <td className="py-4">
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      s.status === 'OK'
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : s.status === 'WARN'
                          ? 'bg-amber-100 text-amber-700 border-amber-200'
                          : s.status === 'ERROR'
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                    }`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="py-4 text-center font-black text-neutral-800 dark:text-neutral-200">{s.items_24h_estimate}</td>
                <td className="py-4 text-xs text-neutral-500">{s.last_error || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BaseModal>
  );
};

export const SkippedDetailModal = ({ isOpen, onClose }: any) => {
  const { loading, error, data, reload } = useDetailApi('/api/details/skipped?days=7&limit=300', isOpen);
  const rows = (data?.items || []) as any[];

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="被跳过条目" subtitle="Skipped & Filtered Items History • 7 days" icon={XCircle}>
      <SectionHeader onRefresh={reload} loading={loading} />
      <ErrorTip error={error} />
      <div className="space-y-4">
        {rows.map((item, i) => (
          <div key={i} className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <div className="flex justify-between items-start mb-2 gap-3">
              <span className="font-bold text-neutral-800 dark:text-white">{item.title || '(no title)'}</span>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded text-neutral-500">{item.reason}</span>
            </div>
            <div className="text-[10px] text-neutral-500 font-bold uppercase mb-2">{item.source || '-'} • {item.ts || '-'}</div>
            <div className="p-2 bg-white dark:bg-neutral-900 rounded border border-neutral-100 dark:border-neutral-800 text-xs italic text-neutral-500">
              {item.link ? (
                <a href={item.link} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
                  查看原文 <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                '无链接'
              )}
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 ? <div className="text-sm text-neutral-500">近 7 天无跳过明细</div> : null}
      </div>
    </BaseModal>
  );
};

export const DigestQueueDetailModal = ({ isOpen, onClose }: any) => {
  const { loading, error, data, reload } = useDetailApi('/api/details/low-digest-queue?limit=300', isOpen);
  const rows = (data?.items || []) as any[];

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="待汇总队列" subtitle="Digest Summary Queue" icon={Layers}>
      <SectionHeader onRefresh={reload} loading={loading} />
      <ErrorTip error={error} />
      <div className="space-y-4">
        {rows.map((item, i) => (
          <div key={i} className="flex items-center gap-4 p-4 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800">
            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center font-black text-amber-500 border border-amber-500/20">{item.heat}</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{item.title || '(no title)'}</div>
              <div className="text-[10px] text-neutral-400 uppercase font-bold">{item.source} • {item.ts || '-'}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-neutral-400 font-black uppercase">Topic</div>
              <div className="text-xs font-black text-blue-500">{item.topic || '-'}</div>
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 ? <div className="text-sm text-neutral-500">当前无待汇总条目</div> : null}
      </div>
    </BaseModal>
  );
};

export const NewFoundDetailModal = ({ isOpen, onClose }: any) => {
  const { loading, error, data, reload } = useDetailApi('/api/details/new-found?days=7&limit=300', isOpen);
  const rows = (data?.items || []) as any[];

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="新增抓取明细" subtitle="New Items • 7 days" icon={Database}>
      <SectionHeader onRefresh={reload} loading={loading} />
      <ErrorTip error={error} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map((item, i) => (
          <div key={i} className="p-5 bg-neutral-50 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:border-blue-500 transition-colors">
            <div className="flex justify-between mb-3 gap-3">
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-black rounded uppercase">{item.topic || '-'}</span>
              <span className="text-sm font-black text-blue-500">{item.heat} pts</span>
            </div>
            <div className="font-bold text-sm mb-2 line-clamp-2">{item.title || '(no title)'}</div>
            <div className="text-[10px] text-neutral-400 font-bold uppercase">{item.source || '-'} • {item.ts || '-'}</div>
          </div>
        ))}
        {!loading && rows.length === 0 ? <div className="text-sm text-neutral-500">近 7 天无新增明细</div> : null}
      </div>
    </BaseModal>
  );
};

export const PushedDetailModal = ({ isOpen, onClose }: any) => {
  const { loading, error, data, reload } = useDetailApi('/api/details/pushed?days=7&limit=300', isOpen);
  const rows = (data?.items || []) as any[];

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="历史推送记录" subtitle="Push Execution & Delivery History • 7 days" icon={Send}>
      <SectionHeader onRefresh={reload} loading={loading} />
      <ErrorTip error={error} />
      <div className="space-y-3">
        {rows.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4 p-4 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-4 min-w-0">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${p.status === 'ok' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {p.status === 'ok' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <div className="font-bold truncate">{p.title || `${p.kind || 'push'} / ${p.source || '-'}`}</div>
                <div className="text-[10px] text-neutral-400 font-bold uppercase">{p.channel || 'primary'} • {p.ts || '-'}</div>
              </div>
            </div>
            <div className="text-right shrink-0 text-xs font-mono text-neutral-500 uppercase">{p.kind || '-'}</div>
          </div>
        ))}
        {!loading && rows.length === 0 ? <div className="text-sm text-neutral-500">近 7 天无推送记录</div> : null}
      </div>
    </BaseModal>
  );
};
