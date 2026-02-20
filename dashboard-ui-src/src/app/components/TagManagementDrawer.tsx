import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  RotateCcw, 
  ChevronRight,
  AlertCircle,
  Check
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface TagConfig {
  id: string;
  name: string;
  tags: string[];
}

const DEFAULT_CONFIG: TagConfig[] = [
  { id: '1', name: '战争与冲突 War & Conflict', tags: ['乌克兰 Ukraine', '加沙 Gaza', '地缘政治 Geopolitics', '军事 Military'] },
  { id: '2', name: '中国内政 China Politics', tags: ['政策 Policy', '经济发展 Economy', '社会 Social', '外交 Foreign'] },
  { id: '3', name: '美国政治 US Politics', tags: ['大选 Election', '国会 Congress', '白宫 White House', '两党 Bipartisan'] },
  { id: '4', name: '经济与市场 Economy & Market', tags: ['股市 Stock', '宏观 Macro', '央行 Central Bank', '通胀 Inflation'] },
  { id: '5', name: '科技与产业 Tech & Industry', tags: ['AI 人工智能', '半导体 Semi', '新能源 EV', '互联网 Internet'] },
  { id: '6', name: '其他动态 Other Updates', tags: ['文化 Culture', '体育 Sports', '娱乐 Celeb', '气候 Climate'] },
];

interface TagManagementDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TagManagementDrawer = ({ isOpen, onClose }: TagManagementDrawerProps) => {
  const [config, setConfig] = useState<TagConfig[]>([]);
  const [initialConfig, setInitialConfig] = useState<TagConfig[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newTagName, setNewTagName] = useState('');

  // Fetch data
  useEffect(() => {
    if (isOpen) {
      fetchTags();
    }
  }, [isOpen]);

  const fetchTags = async () => {
    setIsLoading(true);
    try {
      // Mock API GET /api/tags
      // In real scenario: const res = await fetch('/api/tags'); const data = await res.json();
      await new Promise(resolve => setTimeout(resolve, 500));
      const data = [...DEFAULT_CONFIG]; // Using default as mock data
      setConfig(data);
      setInitialConfig(JSON.parse(JSON.stringify(data)));
      if (data.length > 0) setSelectedCategoryId(data[0].id);
    } catch (error) {
      toast.error('获取标签配置失败 Failed to fetch tag config');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Mock API PUT /api/tags
      // await fetch('/api/tags', { method: 'PUT', body: JSON.stringify(config) });
      await new Promise(resolve => setTimeout(resolve, 800));
      setInitialConfig(JSON.parse(JSON.stringify(config)));
      toast.success('标签配置已保存 Tag configuration saved successfully');
    } catch (error) {
      toast.error('保存失败 Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreDefault = () => {
    if (window.confirm('确定要恢复默认配置吗？所有未保存的更改将丢失。Restore to defaults? Unsaved changes will be lost.')) {
      setConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
      toast.info('已恢复默认预设 Restored to default presets');
    }
  };

  const isDirty = JSON.stringify(config) !== JSON.stringify(initialConfig);

  const handleClose = () => {
    if (isDirty) {
      if (window.confirm('您有未保存的更改，确定要关闭吗？You have unsaved changes. Close anyway?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const addCategory = () => {
    const newCat: TagConfig = {
      id: Date.now().toString(),
      name: '新类别 New Category',
      tags: []
    };
    setConfig([...config, newCat]);
    setSelectedCategoryId(newCat.id);
    setEditingCategoryId(newCat.id);
    setNewCategoryName(newCat.name);
  };

  const deleteCategory = (id: string) => {
    if (window.confirm('确定要删除该类别及其所有标签吗？Delete this category and all its tags?')) {
      const newConfig = config.filter(c => c.id !== id);
      setConfig(newConfig);
      if (selectedCategoryId === id) {
        setSelectedCategoryId(newConfig.length > 0 ? newConfig[0].id : null);
      }
    }
  };

  const updateCategoryName = (id: string) => {
    if (!newCategoryName.trim()) return;
    setConfig(config.map(c => c.id === id ? { ...c, name: newCategoryName } : c));
    setEditingCategoryId(null);
  };

  const addTag = (categoryId: string) => {
    if (!newTagName.trim()) return;
    setConfig(config.map(c => 
      c.id === categoryId 
        ? { ...c, tags: [...c.tags, newTagName.trim()] } 
        : c
    ));
    setNewTagName('');
  };

  const removeTag = (categoryId: string, tagName: string) => {
    setConfig(config.map(c => 
      c.id === categoryId 
        ? { ...c, tags: c.tags.filter(t => t !== tagName) } 
        : c
    ));
  };

  const selectedCategory = config.find(c => c.id === selectedCategoryId);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Drawer */}
          <Motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white dark:bg-neutral-900 shadow-2xl z-[101] flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-900/50">
              <div>
                <h2 className="text-xl font-black tracking-tight text-neutral-900 dark:text-white uppercase">
                  新闻类别与标签 <span className="text-blue-600 dark:text-blue-500 font-medium">Categories & Tags</span>
                </h2>
                <p className="text-xs text-neutral-500 font-medium mt-0.5">管理推送新闻的自动分类与过滤标签库</p>
              </div>
              <button 
                onClick={handleClose}
                className="p-2 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-neutral-500" />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Sidebar: Categories */}
              <div className="w-1/3 border-r border-neutral-200 dark:border-neutral-800 overflow-y-auto bg-neutral-50/50 dark:bg-neutral-950/20">
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">类别 Categories</span>
                    <button 
                      onClick={addCategory}
                      className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 rounded transition-colors"
                      title="Add Category"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {config.map(cat => (
                    <div 
                      key={cat.id}
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`group relative p-3 rounded-xl cursor-pointer transition-all border ${
                        selectedCategoryId === cat.id 
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-sm' 
                          : 'bg-transparent border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      {editingCategoryId === cat.id ? (
                        <input
                          autoFocus
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onBlur={() => updateCategoryName(cat.id)}
                          onKeyDown={(e) => e.key === 'Enter' && updateCategoryName(cat.id)}
                          className="w-full bg-white dark:bg-neutral-800 text-sm font-bold border border-blue-500 rounded px-2 py-1 outline-none"
                        />
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-bold truncate ${selectedCategoryId === cat.id ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-700 dark:text-neutral-300'}`}>
                            {cat.name}
                          </span>
                          <div className={`flex items-center gap-1 ${selectedCategoryId === cat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setEditingCategoryId(cat.id); setNewCategoryName(cat.name); }}
                              className="p-1 hover:text-blue-500"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                              className="p-1 hover:text-red-500"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="text-[10px] text-neutral-400 mt-1 flex items-center gap-1">
                        {cat.tags.length} tags <ChevronRight className="w-2.5 h-2.5" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Content: Tags */}
              <div className="flex-1 overflow-y-auto p-8 bg-white dark:bg-neutral-900">
                {selectedCategory ? (
                  <div className="space-y-8">
                    <div>
                      <h3 className="text-2xl font-black text-neutral-900 dark:text-white mb-2">{selectedCategory.name}</h3>
                      <p className="text-sm text-neutral-500">当前类别的监控关键词库。符合以下标签的新闻将被分类至此。</p>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input 
                            type="text" 
                            placeholder="新增标签 (例如: 宏观经济)..."
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addTag(selectedCategory.id)}
                            className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                          />
                        </div>
                        <button 
                          onClick={() => addTag(selectedCategory.id)}
                          disabled={!newTagName.trim()}
                          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-xl shadow-lg shadow-blue-600/20 transition-all"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <AnimatePresence mode="popLayout">
                          {selectedCategory.tags.map((tag) => (
                            <Motion.div
                              key={tag}
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.8, opacity: 0 }}
                              layout
                              className="group flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-lg transition-colors"
                            >
                              <span className="text-sm font-bold text-neutral-700 dark:text-neutral-200">{tag}</span>
                              <button 
                                onClick={() => removeTag(selectedCategory.id, tag)}
                                className="text-neutral-400 hover:text-red-500 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </Motion.div>
                          ))}
                        </AnimatePresence>
                        {selectedCategory.tags.length === 0 && (
                          <div className="w-full py-12 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl flex flex-col items-center justify-center text-neutral-400">
                            <AlertCircle className="w-8 h-8 mb-2 opacity-20" />
                            <span className="text-sm font-medium italic">暂无标签，请添加 No tags yet.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-400 text-center">
                    <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-4">
                      <ChevronRight className="w-8 h-8 opacity-20" />
                    </div>
                    <p className="font-bold">请选择一个类别进行编辑</p>
                    <p className="text-xs">Select a category from the left to manage tags.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-900/50">
              <button 
                onClick={handleRestoreDefault}
                className="flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> 恢复默认 Reset to Defaults
              </button>

              <div className="flex items-center gap-3">
                <button 
                  onClick={handleClose}
                  className="px-6 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 font-bold text-sm hover:bg-white dark:hover:bg-neutral-800 transition-all"
                >
                  取消 Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={!isDirty || isSaving}
                  className={`flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-sm shadow-xl transition-all ${
                    isDirty && !isSaving 
                      ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/20' 
                      : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
                  }`}
                >
                  {isSaving ? <Motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><RotateCcw className="w-4 h-4" /></Motion.div> : <Save className="w-4 h-4" />}
                  {isSaving ? '正在保存...' : '保存更改 Save Changes'}
                </button>
              </div>
            </div>

            {/* Dirty indicator */}
            {isDirty && (
              <div className="absolute top-20 right-8">
                <div className="bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                  <div className="w-1 h-1 rounded-full bg-amber-500"></div>
                  未保存的更改 UNSAVED CHANGES
                </div>
              </div>
            )}
          </Motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
