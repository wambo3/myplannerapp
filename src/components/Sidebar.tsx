import React, { useState } from 'react';
import { 
  Home, 
  BookOpen, 
  Settings as SettingsIcon, 
  Plus, 
  ChevronDown, 
  ChevronRight, 
  FileText, 
  CheckSquare, 
  Calendar, 
  Trash2,
  Edit2
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import type { Page } from '../types';

export const Sidebar: React.FC = () => {
  const { 
    state, 
    setActivePageId, 
    addPage, 
    deletePage, 
    updatePage
  } = useApp();

  const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({
    'To-dos': true,
    'Notes': true,
    'Journal': true,
    'Personal': true,
    'Work': true
  });

  const [activeContextMenu, setActiveContextMenu] = useState<{ pageId: string; x: number; y: number } | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  
  // New Page creation modal state
  const [isAddingPage, setIsAddingPage] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  const [newPageType, setNewPageType] = useState<Page['type']>('tasks');
  const [newPageCategory, setNewPageCategory] = useState('To-dos');

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleCreatePage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPageName.trim()) {
      addPage(newPageName.trim(), newPageType, newPageCategory);
      setNewPageName('');
      setIsAddingPage(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, pageId: string) => {
    e.preventDefault();
    setActiveContextMenu({
      pageId,
      x: e.clientX,
      y: e.clientY
    });
  };

  const handleRenameSubmit = (pageId: string) => {
    if (renameValue.trim()) {
      updatePage(pageId, { name: renameValue.trim() });
    }
    setEditingPageId(null);
  };

  // Close context menu on click anywhere
  React.useEffect(() => {
    const close = () => setActiveContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const getPageIcon = (type: Page['type']) => {
    switch (type) {
      case 'tasks': return <CheckSquare className="w-4 h-4 text-emerald-500" />;
      case 'notes': return <FileText className="w-4 h-4 text-amber-500" />;
      case 'planner': return <Calendar className="w-4 h-4 text-purple-500" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const profileInitials = state.profile.name
    ? state.profile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  const collapsed = state.settings.sidebarCollapsed;

  return (
    <aside 
      className={`border-r border-[var(--border-color)] bg-[var(--bg-sidebar)] flex flex-col h-full select-none text-[var(--text-primary)] transition-all duration-300 relative ${
        collapsed ? 'w-0 overflow-hidden border-none opacity-0' : 'w-64'
      }`}
    >
      {/* Profile Card Header */}
      <div 
        onClick={() => setActivePageId('settings')}
        className="p-4 border-b border-[var(--border-color)] flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors group"
      >
        <div className="w-10 h-10 rounded-full bg-blue-600/25 border border-blue-500/50 flex items-center justify-center font-bold text-sm text-blue-400 group-hover:scale-105 transition-transform">
          {profileInitials}
        </div>
        <div className="flex-1 truncate">
          <div className="font-semibold text-sm truncate">{state.profile.name || 'User Name'}</div>
          <div className="text-xs text-[var(--text-muted)] truncate">{state.profile.bio || 'Productivity Bio'}</div>
        </div>
      </div>

      {/* Navigation Options */}
      <div className="p-2 space-y-0.5 border-b border-[var(--border-color)]">
        {/* Home */}
        <div 
          onClick={() => setActivePageId('home')}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm font-medium ${
            state.activePageId === 'home' 
              ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20' 
              : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
          }`}
        >
          <Home className="w-4 h-4" />
          <span>Command Center</span>
        </div>

        {/* Library (Zotero) */}
        <div 
          onClick={() => setActivePageId('library')}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm font-medium ${
            state.activePageId === 'library' 
              ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20' 
              : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Zotero Library</span>
        </div>

        {/* Settings */}
        <div 
          onClick={() => setActivePageId('settings')}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm font-medium ${
            state.activePageId === 'settings' 
              ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20' 
              : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          <span>Settings</span>
        </div>
      </div>

      {/* Collapsible Categories Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        <div>
          <div className="flex items-center justify-between px-2 py-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span>Workspace Pages</span>
            <button 
              onClick={() => setIsAddingPage(true)}
              className="hover:text-[var(--text-primary)] p-0.5 rounded hover:bg-[var(--bg-hover)]"
              title="Add New Page"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-1.5 space-y-2">
            {state.settings.categories.map(cat => {
              const catPages = state.pages.filter(p => p.category === cat);
              const isExpanded = !!expandedCategories[cat];
              
              return (
                <div key={cat} className="space-y-0.5">
                  {/* Category Header */}
                  <div 
                    onClick={() => toggleCategory(cat)}
                    className="flex items-center justify-between px-2 py-1 hover:bg-[var(--bg-hover)] rounded cursor-pointer text-xs font-semibold text-[var(--text-muted)] select-none"
                  >
                    <div className="flex items-center gap-1">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span>{cat}</span>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewPageCategory(cat);
                        setIsAddingPage(true);
                      }}
                      className="opacity-0 hover:opacity-100 group-hover:opacity-100 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Category Pages */}
                  {isExpanded && (
                    <div className="pl-3.5 space-y-0.5 border-l border-[var(--border-color)] ml-3.5">
                      {catPages.map(page => {
                        const isSelected = state.activePageId === page.id;
                        const isEditing = editingPageId === page.id;
                        
                        return (
                          <div 
                            key={page.id}
                            onClick={() => {
                              if (!isEditing) setActivePageId(page.id);
                            }}
                            onContextMenu={(e) => handleContextMenu(e, page.id)}
                            className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-xs font-medium border border-transparent ${
                              isSelected
                                ? 'bg-blue-600/10 text-blue-400 font-semibold'
                                : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate flex-1">
                              {getPageIcon(page.type)}
                              {isEditing ? (
                                <input 
                                  type="text"
                                  value={renameValue}
                                  onChange={e => setRenameValue(e.target.value)}
                                  onBlur={() => handleRenameSubmit(page.id)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleRenameSubmit(page.id);
                                    if (e.key === 'Escape') setEditingPageId(null);
                                  }}
                                  className="w-full bg-[var(--bg-app)] text-[var(--text-primary)] border border-blue-500 rounded px-1 py-0.5 focus:outline-none"
                                  autoFocus
                                  onClick={e => e.stopPropagation()}
                                />
                              ) : (
                                <span className="truncate">{page.name}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      
                      {catPages.length === 0 && (
                        <div className="text-[10px] text-slate-500 italic pl-6 py-1 select-none">
                          No pages
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Add Page Modal */}
      {isAddingPage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <form 
            onSubmit={handleCreatePage}
            className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl p-5 text-sm space-y-4"
          >
            <div className="text-sm font-bold text-[var(--text-primary)]">Create Workspace Page</div>
            
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Page Name</label>
              <input 
                type="text"
                value={newPageName}
                onChange={e => setNewPageName(e.target.value)}
                placeholder="e.g. Weekly Meeting Notes"
                className="w-full bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-[var(--text-primary)] text-xs"
                required
                autoFocus
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Page Type</label>
                <select
                  value={newPageType}
                  onChange={e => setNewPageType(e.target.value as Page['type'])}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 text-xs text-[var(--text-primary)]"
                >
                  <option value="tasks">Tasks Board</option>
                  <option value="notes">Notes/Wiki</option>
                  <option value="planner">Calendar</option>
                </select>
              </div>

              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Category</label>
                <select
                  value={newPageCategory}
                  onChange={e => setNewPageCategory(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 text-xs text-[var(--text-primary)]"
                >
                  {state.settings.categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 text-xs">
              <button 
                type="button"
                onClick={() => setIsAddingPage(false)}
                className="px-3.5 py-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg font-medium text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Right Click Page Options Context Menu */}
      {activeContextMenu && (
        <div 
          className="fixed bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-xl py-1 text-xs text-[var(--text-primary)] z-55 w-36"
          style={{ left: activeContextMenu.x, top: activeContextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div 
            onClick={() => {
              const page = state.pages.find(p => p.id === activeContextMenu.pageId);
              if (page) {
                setEditingPageId(page.id);
                setRenameValue(page.name);
              }
              setActiveContextMenu(null);
            }}
            className="px-3 py-1.5 hover:bg-[var(--bg-hover)] cursor-pointer flex items-center gap-2"
          >
            <Edit2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Rename Page</span>
          </div>
          {activeContextMenu.pageId !== 'page-todos' && (
            <div 
              onClick={() => {
                if (confirm("Are you sure you want to delete this page and all its tasks/notes?")) {
                  deletePage(activeContextMenu.pageId);
                }
                setActiveContextMenu(null);
              }}
              className="px-3 py-1.5 hover:bg-red-500/10 text-red-500 hover:text-red-400 cursor-pointer flex items-center gap-2 border-t border-[var(--border-color)]"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              <span>Delete Page</span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
