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
  FileCode
} from 'lucide-react';
import type { Paper } from '../types';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [magicWandOpen, setMagicWandOpen] = useState(false);
  const [magicId, setMagicId] = useState('');
  const [magicStatus, setMagicStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [newMenuOpen, setNewMenuOpen] = useState(false);

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
    <div className="flex-1 flex flex-col h-full bg-white select-none text-slate-800 text-sm">
      {/* Toolbar */}
      <div className="p-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 relative">
          {/* New Item Dropdown */}
          <button 
            onClick={() => setNewMenuOpen(!newMenuOpen)}
            className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50 text-slate-700 font-medium text-xs hover:border-slate-400"
          >
            <Plus className="w-3.5 h-3.5 text-green-600" />
            <span>New Item</span>
          </button>
          
          {newMenuOpen && (
            <div className="absolute left-0 top-9 w-44 bg-white border border-slate-250 rounded shadow-lg z-50 text-xs py-1">
              <div 
                onClick={() => { onAddPaperManual('journalArticle'); setNewMenuOpen(false); }}
                className="px-3 py-2 hover:bg-slate-100 cursor-pointer flex items-center gap-2"
              >
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span>Journal Article</span>
              </div>
              <div 
                onClick={() => { onAddPaperManual('book'); setNewMenuOpen(false); }}
                className="px-3 py-2 hover:bg-slate-100 cursor-pointer flex items-center gap-2"
              >
                <File className="w-3.5 h-3.5 text-amber-600" />
                <span>Book</span>
              </div>
            </div>
          )}

          {/* Add by Identifier */}
          <button 
            onClick={() => setMagicWandOpen(!magicWandOpen)}
            className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50 text-slate-700 font-medium text-xs hover:border-slate-400"
            title="Add Item by arXiv ID or DOI"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Add by ID</span>
          </button>

          {magicWandOpen && (
            <form 
              onSubmit={handleMagicWandSubmit}
              className="absolute left-24 top-9 bg-white border border-slate-250 rounded shadow-lg p-3 z-50 flex flex-col gap-2 w-64 text-xs"
            >
              <label className="font-semibold text-slate-700">Enter arXiv ID or DOI:</label>
              <div className="flex gap-1">
                <input 
                  type="text"
                  value={magicId}
                  onChange={e => setMagicId(e.target.value)}
                  placeholder="e.g. 2203.02155 or 1609.02907"
                  className="flex-1 px-2.5 py-1 border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                  disabled={magicStatus === 'loading'}
                  autoFocus
                />
                <button 
                  type="submit"
                  disabled={magicStatus === 'loading' || !magicId.trim()}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
                >
                  {magicStatus === 'loading' ? 'Loading...' : 'Add'}
                </button>
              </div>
              {magicStatus === 'success' && <span className="text-green-600">✓ Item added successfully!</span>}
              {magicStatus === 'error' && <span className="text-red-600">✗ Unknown identifier. Try: 2203.02155</span>}
            </form>
          )}

          {/* Delete Action Button */}
          {selectedPaperId && (
            selectedSpecial === 'trash' ? (
              <div className="flex gap-1">
                <button 
                  onClick={() => onRestoreFromTrash(selectedPaperId)}
                  className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50 text-slate-700 font-medium text-xs hover:border-slate-400"
                  title="Restore selected item to library"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                  <span>Restore</span>
                </button>
                <button 
                  onClick={() => {
                    if (confirm("Are you sure you want to permanently delete this paper and all its attachments?")) {
                      onPermanentlyDelete(selectedPaperId);
                    }
                  }}
                  className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 hover:bg-red-50 text-red-700 hover:border-red-400 font-medium text-xs"
                  title="Permanently delete item"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>Delete Permanently</span>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => onMoveToTrash(selectedPaperId)}
                className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 hover:bg-red-50 text-red-700 hover:border-red-400 font-medium text-xs"
                title="Move selected item to trash"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                <span>Move to Trash</span>
              </button>
            )
          )}
        </div>

        {/* Quick Search */}
        <div className="relative w-56">
          <input 
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search titles, authors, tags..."
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Item List Header Label */}
      <div className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
        {selectedSpecial === 'trash' ? 'Trash' : (selectedCollection || 'All Items')} 
        {searchQuery && ` — search results for "${searchQuery}"`}
      </div>

      {/* Grid Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold select-none sticky top-0 z-10">
              <th className="w-8 px-1 py-2"></th>
              <th className="w-1/2 px-2 py-2 cursor-pointer hover:bg-slate-150" onClick={() => onSort('title')}>
                Title {renderSortIndicator('title')}
              </th>
              <th className="w-1/4 px-2 py-2 cursor-pointer hover:bg-slate-150" onClick={() => onSort('creator')}>
                Creator {renderSortIndicator('creator')}
              </th>
              <th className="w-1/8 px-2 py-2 cursor-pointer hover:bg-slate-150" onClick={() => onSort('date')}>
                Date {renderSortIndicator('date')}
              </th>
              <th className="w-1/8 px-2 py-2 cursor-pointer hover:bg-slate-150" onClick={() => onSort('dateAdded')}>
                Added {renderSortIndicator('dateAdded')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredPapers.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400 italic">
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
                      className={`hover:bg-slate-50 cursor-pointer ${
                        isSelected ? 'bg-blue-100 hover:bg-blue-100 text-blue-950 font-medium' : ''
                      }`}
                    >
                      {/* Chevron Toggle cell */}
                      <td className="px-1 py-2 text-center" onClick={(e) => toggleRowExpansion(paper.id, e)}>
                        <button className="text-slate-400 hover:text-slate-600 focus:outline-none p-0.5 rounded hover:bg-slate-200">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                      {/* Title */}
                      <td className="px-2 py-2 font-medium truncate">
                        <div className="flex items-center gap-1.5 truncate">
                          <FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                          <span className="truncate">{paper.title}</span>
                        </div>
                      </td>
                      {/* Creator */}
                      <td className="px-2 py-2 truncate">{getCreatorString(paper)}</td>
                      {/* Date */}
                      <td className="px-2 py-2 truncate">{paper.date || '—'}</td>
                      {/* Date Added */}
                      <td className="px-2 py-2 truncate text-slate-400">
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
                          className={`hover:bg-slate-50 cursor-pointer ${
                            selectedPaperId === paper.id && selectedChildId?.type === 'pdf'
                              ? 'bg-blue-50 text-blue-900 font-semibold'
                              : 'bg-slate-25/50'
                          }`}
                        >
                          <td className="px-1 py-1.5"></td>
                          <td className="pl-8 px-2 py-1.5 truncate" colSpan={4}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 truncate">
                                <FileCode className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                <span className="truncate italic text-slate-600">
                                  Full Text PDF (local: {paper.id}.pdf)
                                </span>
                              </div>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenPdf(paper);
                                }}
                                className="text-[10px] bg-slate-200 text-slate-700 hover:bg-blue-600 hover:text-white px-2 py-0.5 rounded font-semibold transition-colors"
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
                              className={`hover:bg-slate-50 cursor-pointer ${
                                isNoteSelected ? 'bg-blue-50 text-blue-900 font-semibold' : 'bg-slate-25/50'
                              }`}
                            >
                              <td className="px-1 py-1.5"></td>
                              <td className="pl-8 px-2 py-1.5 truncate" colSpan={4}>
                                <div className="flex items-center gap-2 truncate">
                                  <File className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                                  <span className="truncate italic text-slate-500">
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
