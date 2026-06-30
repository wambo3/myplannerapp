import React, { useState } from 'react';
import { 
  Plus, 
  FileText, 
  File,
  Search, 
  Trash2, 
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  FileCode,
  RefreshCw
} from 'lucide-react';
import type { Paper } from '../types';
import { useApp } from '../state/AppContext';

interface ItemListPaneProps {
  papers: Paper[];
  selectedPaperId: string | null;
  selectedChildId: { type: 'pdf' | 'note'; id: string } | null;
  onSelectPaper: (id: string | null, child?: { type: 'pdf' | 'note'; id: string } | null) => void;
  onAddPaperManual: (type: string) => void;
  onAddByIdentifier: (idStr: string) => Promise<boolean>;
  onMoveToTrash: (id: string) => void;
  onRestoreFromTrash: (id: string) => void;
  onPermanentlyDelete: (id: string) => void;
  selectedSpecial: 'all' | 'duplicates' | 'unfiled' | 'trash';
  selectedCollection: string | null;
  onOpenPdf: (paper: Paper) => void;
  sortBy: 'title' | 'creator' | 'date' | 'dateAdded';
  sortOrder: 'asc' | 'desc';
  onSort: (column: 'title' | 'creator' | 'date' | 'dateAdded') => void;
}

export const ItemListPane: React.FC<ItemListPaneProps> = ({
  papers,
  selectedPaperId,
  selectedChildId,
  onSelectPaper,
  onAddPaperManual,
  onAddByIdentifier,
  onMoveToTrash,
  onRestoreFromTrash,
  onPermanentlyDelete,
  selectedSpecial,
  selectedCollection,
  onOpenPdf,
  sortBy,
  sortOrder,
  onSort,
}) => {
  const { resetLibrary } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [magicWandOpen, setMagicWandOpen] = useState(false);
  const [magicId, setMagicId] = useState('');
  const [magicStatus, setMagicStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const toggleRowExpansion = (paperId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRows(prev => 
      prev.includes(paperId) 
        ? prev.filter(id => id !== paperId) 
        : [...prev, paperId]
    );
  };

  const handleMagicWandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicId.trim()) return;
    setMagicStatus('loading');
    const success = await onAddByIdentifier(magicId.trim());
    if (success) {
      setMagicStatus('success');
      setTimeout(() => {
        setMagicWandOpen(false);
        setMagicId('');
        setMagicStatus('idle');
      }, 1000);
    } else {
      setMagicStatus('error');
      setTimeout(() => setMagicStatus('idle'), 2000);
    }
  };

  const handleSyncClick = async () => {
    setIsSyncing(true);
    await resetLibrary();
    setTimeout(() => {
      setIsSyncing(false);
    }, 850);
  };

  const getCreatorString = (paper: Paper) => {
    if (!paper.authors || paper.authors.length === 0) return 'Unknown';
    if (paper.authors.length === 1) return paper.authors[0].lastName;
    if (paper.authors.length === 2) return `${paper.authors[0].lastName} and ${paper.authors[1].lastName}`;
    return `${paper.authors[0].lastName} et al.`;
  };

  const filteredPapers = papers.filter(p => {
    const term = searchQuery.toLowerCase();
    const matchesSearch = 
      p.title.toLowerCase().includes(term) ||
      p.abstract.toLowerCase().includes(term) ||
      p.authors.some(a => `${a.firstName} ${a.lastName}`.toLowerCase().includes(term)) ||
      p.tags.some(t => t.toLowerCase().includes(term)) ||
      p.id.includes(term);
    return matchesSearch;
  });

  const renderSortIndicator = (col: typeof sortBy) => {
    if (sortBy !== col) return null;
    return sortOrder === 'asc' ? ' ▴' : ' ▾';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-main)] select-none text-[var(--text-primary)] text-sm border-r border-[var(--border-color)]">
      {/* Toolbar */}
      <div className="p-2 border-b border-[var(--border-color)] bg-[var(--bg-sidebar)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 relative">
          {/* New Item Dropdown */}
          <button 
            onClick={() => setNewMenuOpen(!newMenuOpen)}
            className="flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-2.5 py-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium text-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-green-500" />
            <span>New Item</span>
          </button>
          
          {newMenuOpen && (
            <div className="absolute left-0 top-9 w-44 bg-[var(--bg-card)] border border-[var(--border-color)] rounded shadow-lg z-50 text-xs py-1 text-[var(--text-primary)]">
              <div 
                onClick={() => { onAddPaperManual('journalArticle'); setNewMenuOpen(false); }}
                className="px-3 py-2 hover:bg-[var(--bg-hover)] cursor-pointer flex items-center gap-2"
              >
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span>Journal Article</span>
              </div>
              <div 
                onClick={() => { onAddPaperManual('book'); setNewMenuOpen(false); }}
                className="px-3 py-2 hover:bg-[var(--bg-hover)] cursor-pointer flex items-center gap-2"
              >
                <File className="w-3.5 h-3.5 text-amber-500" />
                <span>Book</span>
              </div>
            </div>
          )}

          {/* Add by Identifier */}
          <button 
            onClick={() => setMagicWandOpen(!magicWandOpen)}
            className="flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-2.5 py-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium text-xs transition-colors"
            title="Add Item by arXiv ID or DOI"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            <span>Add by ID</span>
          </button>

          {magicWandOpen && (
            <form 
              onSubmit={handleMagicWandSubmit}
              className="absolute left-24 top-9 bg-[var(--bg-card)] border border-[var(--border-color)] rounded shadow-lg p-3 z-50 flex flex-col gap-2 w-64 text-xs"
            >
              <label className="font-semibold text-[var(--text-primary)]">Enter arXiv ID or DOI:</label>
              <div className="flex gap-1">
                <input 
                  type="text"
                  value={magicId}
                  onChange={e => setMagicId(e.target.value)}
                  placeholder="e.g. 2203.02155 or 1609.02907"
                  className="flex-1 px-2.5 py-1 border border-[var(--border-color)] bg-[var(--bg-hover)] text-[var(--text-primary)] rounded focus:outline-none focus:border-[var(--accent-color)]"
                  disabled={magicStatus === 'loading'}
                  autoFocus
                />
                <button 
                  type="submit"
                  disabled={magicStatus === 'loading' || !magicId.trim()}
                  className="px-3 py-1 bg-[var(--accent-color)] text-white rounded font-medium disabled:opacity-50 hover:opacity-95"
                >
                  {magicStatus === 'loading' ? 'Loading...' : 'Add'}
                </button>
              </div>
              {magicStatus === 'success' && <span className="text-green-500">✓ Item added successfully!</span>}
              {magicStatus === 'error' && <span className="text-red-500">✗ Unknown identifier. Try: 2203.02155</span>}
            </form>
          )}

          {/* Delete Action Button */}
          {selectedPaperId && (
            selectedSpecial === 'trash' ? (
              <div className="flex gap-1">
                <button 
                  onClick={() => onRestoreFromTrash(selectedPaperId)}
                  className="flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-2.5 py-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium text-xs transition-colors"
                  title="Restore selected item to library"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-blue-500" />
                  <span>Restore</span>
                </button>
                <button 
                  onClick={() => {
                    if (confirm("Are you sure you want to permanently delete this paper and all its attachments?")) {
                      onPermanentlyDelete(selectedPaperId);
                    }
                  }}
                  className="flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-2.5 py-1.5 hover:bg-red-500/10 text-red-500 hover:border-red-500/30 font-medium text-xs transition-colors"
                  title="Permanently delete item"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  <span>Delete Permanently</span>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => onMoveToTrash(selectedPaperId)}
                className="flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-2.5 py-1.5 hover:bg-red-500/10 text-red-500 hover:border-red-500/30 font-medium text-xs transition-colors"
                title="Move selected item to trash"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                <span>Move to Trash</span>
              </button>
            )
          )}
        </div>

        {/* Quick Search & Sync */}
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <input 
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search titles, authors, tags..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] rounded text-xs focus:outline-none focus:border-[var(--accent-color)]"
            />
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2.5" />
          </div>

          <button
            onClick={handleSyncClick}
            disabled={isSyncing}
            className={`p-1.5 rounded hover:bg-[var(--bg-hover)] text-green-500 hover:text-green-600 focus:outline-none ${
              isSyncing ? 'animate-spin' : ''
            }`}
            title="Sync library database from data.json"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Item List Header Label */}
      <div className="px-3 py-1 bg-[var(--bg-sidebar)] text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider border-b border-[var(--border-color)]">
        {selectedSpecial === 'trash' ? 'Trash' : (selectedCollection || 'All Items')} 
        {searchQuery && ` — search results for "${searchQuery}"`}
      </div>

      {/* Grid Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr className="bg-[var(--bg-sidebar)] border-b border-[var(--border-color)] text-[var(--text-muted)] text-xs font-semibold select-none sticky top-0 z-10">
              <th className="w-8 px-1 py-2"></th>
              <th className="w-1/2 px-2 py-2 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={() => onSort('title')}>
                Title {renderSortIndicator('title')}
              </th>
              <th className="w-1/4 px-2 py-2 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={() => onSort('creator')}>
                Creator {renderSortIndicator('creator')}
              </th>
              <th className="w-1/8 px-2 py-2 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={() => onSort('date')}>
                Date {renderSortIndicator('date')}
              </th>
              <th className="w-1/8 px-2 py-2 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={() => onSort('dateAdded')}>
                Added {renderSortIndicator('dateAdded')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)] text-xs">
            {filteredPapers.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[var(--text-muted)] italic">
                  No items in this collection.
                </td>
              </tr>
            ) : (
              filteredPapers.map(paper => {
                const isSelected = selectedPaperId === paper.id && selectedChildId === null;
                const isExpanded = expandedRows.includes(paper.id);
                
                return (
                  <React.Fragment key={paper.id}>
                    {/* Main Paper Row */}
                    <tr 
                      onClick={() => onSelectPaper(paper.id, null)}
                      className={`hover:bg-[var(--bg-hover)] cursor-pointer transition-colors ${
                        isSelected ? 'bg-[var(--accent-light)] hover:bg-[var(--accent-light)] text-[var(--accent-color)] font-medium border-l-2 border-[var(--accent-color)]' : ''
                      }`}
                    >
                      {/* Chevron Toggle cell */}
                      <td className="px-1 py-2 text-center" onClick={(e) => toggleRowExpansion(paper.id, e)}>
                        <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none p-0.5 rounded hover:bg-[var(--bg-hover)]">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                      {/* Title */}
                      <td className="px-2 py-2 font-medium truncate">
                        <div className="flex items-center gap-1.5 truncate">
                          <FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[var(--accent-color)]' : 'text-[var(--text-muted)]'}`} />
                          <span className="truncate">{paper.title}</span>
                        </div>
                      </td>
                      {/* Creator */}
                      <td className="px-2 py-2 truncate text-[var(--text-muted)]">{getCreatorString(paper)}</td>
                      {/* Date */}
                      <td className="px-2 py-2 truncate text-[var(--text-muted)]">{paper.date || '—'}</td>
                      {/* Date Added */}
                      <td className="px-2 py-2 truncate text-[var(--text-muted)]">
                        {paper.dateAdded ? new Date(paper.dateAdded).toLocaleDateString() : '—'}
                      </td>
                    </tr>

                    {/* Expanded Child Rows */}
                    {isExpanded && (
                      <>
                        {/* PDF attachment row */}
                        <tr 
                          onClick={() => onSelectPaper(paper.id, { type: 'pdf', id: 'pdf' })}
                          onDoubleClick={() => onOpenPdf(paper)}
                          className={`hover:bg-[var(--bg-hover)] cursor-pointer transition-colors ${
                            selectedPaperId === paper.id && selectedChildId?.type === 'pdf'
                              ? 'bg-[var(--accent-light)] text-[var(--accent-color)] font-semibold'
                              : 'bg-[var(--bg-hover)] bg-opacity-20'
                          }`}
                        >
                          <td className="px-1 py-1.5"></td>
                          <td className="pl-8 px-2 py-1.5 truncate" colSpan={4}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 truncate">
                                <FileCode className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                <span className="truncate italic text-[var(--text-muted)]">
                                  Full Text PDF (local: {paper.id}.pdf)
                                </span>
                              </div>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenPdf(paper);
                                }}
                                className="text-[10px] bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--accent-color)] hover:text-white px-2 py-0.5 rounded font-semibold transition-colors"
                              >
                                Open Reader
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Notes attachments rows */}
                        {(paper.notes || []).map(note => {
                          const isNoteSelected = selectedPaperId === paper.id && 
                                                 selectedChildId?.type === 'note' && 
                                                 selectedChildId?.id === note.id;
                          return (
                            <tr 
                              key={note.id}
                              onClick={() => onSelectPaper(paper.id, { type: 'note', id: note.id })}
                              className={`hover:bg-[var(--bg-hover)] cursor-pointer transition-colors ${
                                isNoteSelected ? 'bg-[var(--accent-light)] text-[var(--accent-color)] font-semibold' : 'bg-[var(--bg-hover)] bg-opacity-20'
                              }`}
                            >
                              <td className="px-1 py-1.5"></td>
                              <td className="pl-8 px-2 py-1.5 truncate" colSpan={4}>
                                <div className="flex items-center gap-2 truncate">
                                  <File className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                                  <span className="truncate italic text-[var(--text-muted)] font-medium">
                                    Note: {note.title || 'Untitled note'}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
