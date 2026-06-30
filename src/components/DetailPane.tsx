import React, { useState } from 'react';
import { 
  FileText, 
  Trash2, 
  Link as LinkIcon, 
  Plus, 
  FileCode,
  File,
  X
} from 'lucide-react';
import type { Paper, PaperNote, Author } from '../types';

interface DetailPaneProps {
  paper: Paper | null;
  selectedChildId: { type: 'pdf' | 'note'; id: string } | null;
  allPapers: Paper[]; // for related items linkage
  onUpdatePaper: (updated: Paper) => void;
  onSelectPaperId: (id: string | null) => void;
  onDeleteNote: (paperId: string, noteId: string) => void;
  onAddNote: (paperId: string) => void;
}

export const DetailPane: React.FC<DetailPaneProps> = ({
  paper,
  selectedChildId,
  allPapers,
  onUpdatePaper,
  onSelectPaperId,
  onDeleteNote,
  onAddNote,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'abstract' | 'tags' | 'related'>('info');
  const [newTag, setNewTag] = useState('');

  if (!paper) {
    return (
      <div className="w-80 border-l border-slate-200 bg-slate-50 flex flex-col h-full items-center justify-center p-6 text-center select-none text-slate-400">
        <FileText className="w-12 h-12 text-slate-300 mb-2" />
        <h3 className="font-semibold text-slate-600 text-sm">No Item Selected</h3>
        <p className="text-xs mt-1">Select an item in the library to view and edit its metadata.</p>
      </div>
    );
  }

  // Handle Note Child selection editor
  if (selectedChildId?.type === 'note') {
    const note = paper.notes.find(n => n.id === selectedChildId.id);
    if (!note) return null;

    const handleNoteChange = (fields: Partial<PaperNote>) => {
      const updatedNotes = paper.notes.map(n => 
        n.id === note.id ? { ...n, ...fields } : n
      );
      onUpdatePaper({
        ...paper,
        notes: updatedNotes,
        dateModified: new Date().toISOString()
      });
    };

    return (
      <div className="w-80 border-l border-slate-200 bg-white flex flex-col h-full text-slate-800 text-sm">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between font-semibold text-slate-900 text-xs">
          <div className="flex items-center gap-1.5">
            <File className="w-4 h-4 text-yellow-500" />
            <span>Edit Note Attachment</span>
          </div>
          <button 
            onClick={() => onDeleteNote(paper.id, note.id)}
            className="text-red-500 hover:text-red-700 font-medium hover:bg-slate-200 p-1 rounded"
            title="Delete this note"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-4 flex-1 flex flex-col gap-3">
          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Note Title</label>
            <input 
              type="text"
              value={note.title}
              onChange={e => handleNoteChange({ title: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-slate-350 rounded focus:outline-none focus:border-blue-500 font-medium"
            />
          </div>
          <div className="flex-1 flex flex-col">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Content</label>
            <textarea 
              value={note.content}
              onChange={e => handleNoteChange({ content: e.target.value })}
              className="w-full flex-1 px-2.5 py-1.5 border border-slate-350 rounded focus:outline-none focus:border-blue-500 font-mono text-xs resize-none"
              placeholder="Write your note here..."
            />
          </div>
        </div>
      </div>
    );
  }

  // Handle PDF Child selection info
  if (selectedChildId?.type === 'pdf') {
    return (
      <div className="w-80 border-l border-slate-200 bg-slate-50 flex flex-col h-full text-slate-800 text-sm p-4 items-center justify-center text-center">
        <FileCode className="w-12 h-12 text-red-400 mb-2" />
        <h3 className="font-semibold text-slate-700">PDF Attachment</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-[200px] truncate">
          {paper.id}.pdf
        </p>
        <div className="mt-4 p-3 bg-white border border-slate-200 rounded text-left w-full text-xs space-y-1">
          <div><strong>Relation:</strong> Child attachment</div>
          <div><strong>Type:</strong> Adobe Acrobat Document</div>
          <div><strong>Attached to:</strong> {paper.title}</div>
        </div>
      </div>
    );
  }

  // Helper metadata change handler
  const handleMetaChange = (fields: Partial<Paper>) => {
    onUpdatePaper({
      ...paper,
      ...fields,
      dateModified: new Date().toISOString()
    });
  };

  const handleAuthorChange = (index: number, fields: Partial<Author>) => {
    const updatedAuthors = paper.authors.map((a, idx) => 
      idx === index ? { ...a, ...fields } : a
    );
    handleMetaChange({ authors: updatedAuthors });
  };

  const handleAddAuthor = () => {
    const updatedAuthors = [...paper.authors, { firstName: '', lastName: '' }];
    handleMetaChange({ authors: updatedAuthors });
  };

  const handleRemoveAuthor = (index: number) => {
    const updatedAuthors = paper.authors.filter((_, idx) => idx !== index);
    handleMetaChange({ authors: updatedAuthors });
  };

  const handleAddTagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTag.trim() && !paper.tags.includes(newTag.trim())) {
      handleMetaChange({ tags: [...paper.tags, newTag.trim()] });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    handleMetaChange({ tags: paper.tags.filter(t => t !== tag) });
  };

  const handleLinkRelated = (relatedId: string) => {
    if (relatedId && !paper.related.includes(relatedId)) {
      handleMetaChange({ related: [...paper.related, relatedId] });
      
      // Mutual linking: Zotero also links the other paper back
      const otherPaper = allPapers.find(p => p.id === relatedId);
      if (otherPaper && !otherPaper.related.includes(paper.id)) {
        onUpdatePaper({
          ...otherPaper,
          related: [...otherPaper.related, paper.id],
          dateModified: new Date().toISOString()
        });
      }
    }
  };

  const handleRemoveRelated = (relatedId: string) => {
    handleMetaChange({ related: paper.related.filter(id => id !== relatedId) });
    
    // Mutual unlinking
    const otherPaper = allPapers.find(p => p.id === relatedId);
    if (otherPaper && otherPaper.related.includes(paper.id)) {
      onUpdatePaper({
        ...otherPaper,
        related: otherPaper.related.filter(id => id !== paper.id),
        dateModified: new Date().toISOString()
      });
    }
  };

  return (
    <div className="w-80 border-l border-slate-200 bg-white flex flex-col h-full text-slate-800 text-sm">
      {/* Detail Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
        {(['info', 'abstract', 'tags', 'related'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-center border-b-2 font-medium capitalize ${
              activeTab === tab 
                ? 'border-blue-600 text-blue-700 bg-white' 
                : 'border-transparent hover:bg-slate-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'info' && (
          <div className="space-y-3">
            {/* Item Type */}
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Item Type</label>
              <select
                value={paper.type}
                onChange={e => handleMetaChange({ type: e.target.value })}
                className="w-full px-2 py-1 border border-slate-350 rounded focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="journalArticle">Journal Article</option>
                <option value="book">Book</option>
                <option value="conferencePaper">Conference Paper</option>
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Title</label>
              <textarea
                value={paper.title}
                onChange={e => handleMetaChange({ title: e.target.value })}
                rows={3}
                className="w-full px-2 py-1.5 border border-slate-350 rounded focus:outline-none focus:border-blue-500 font-semibold leading-snug resize-none"
              />
            </div>

            {/* Authors */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Authors</label>
                <button 
                  onClick={handleAddAuthor}
                  className="text-blue-600 hover:text-blue-800 text-xs font-semibold flex items-center gap-0.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {paper.authors.map((author, index) => (
                  <div key={index} className="flex gap-1.5 items-center">
                    <input 
                      type="text"
                      value={author.firstName}
                      onChange={e => handleAuthorChange(index, { firstName: e.target.value })}
                      placeholder="First Name"
                      className="w-1/2 px-2 py-1 border border-slate-300 rounded focus:outline-none focus:border-blue-500 text-xs"
                    />
                    <input 
                      type="text"
                      value={author.lastName}
                      onChange={e => handleAuthorChange(index, { lastName: e.target.value })}
                      placeholder="Last Name"
                      className="w-1/2 px-2 py-1 border border-slate-300 rounded focus:outline-none focus:border-blue-500 text-xs font-medium"
                    />
                    {paper.authors.length > 1 && (
                      <button 
                        onClick={() => handleRemoveAuthor(index)}
                        className="text-slate-400 hover:text-red-500 text-sm font-semibold p-0.5"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Publication */}
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Publication/Journal</label>
              <input
                type="text"
                value={paper.publication}
                onChange={e => handleMetaChange({ publication: e.target.value })}
                className="w-full px-2 py-1 border border-slate-350 rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Date */}
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Date</label>
              <input
                type="text"
                value={paper.date}
                onChange={e => handleMetaChange({ date: e.target.value })}
                className="w-full px-2 py-1 border border-slate-350 rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* DOI */}
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">DOI</label>
              <input
                type="text"
                value={paper.doi}
                onChange={e => handleMetaChange({ doi: e.target.value })}
                className="w-full px-2 py-1 border border-slate-350 rounded focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>

            {/* URL */}
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">URL</label>
              <input
                type="text"
                value={paper.url}
                onChange={e => handleMetaChange({ url: e.target.value })}
                className="w-full px-2 py-1 border border-slate-350 rounded focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>

            {/* Collection assignment tags */}
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Collections</label>
              <div className="flex flex-wrap gap-1 mt-1 text-slate-600">
                {paper.collections.map(c => (
                  <span key={c} className="text-xs bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            
            {/* Notes List and Quick Add Note */}
            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Notes</label>
                <button 
                  onClick={() => onAddNote(paper.id)}
                  className="text-blue-600 hover:text-blue-800 text-xs font-semibold flex items-center gap-0.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Note
                </button>
              </div>
              <div className="space-y-1">
                {paper.notes.length === 0 ? (
                  <div className="text-xs text-slate-400 italic">No notes attached.</div>
                ) : (
                  paper.notes.map(note => (
                    <div key={note.id} className="text-xs flex items-center justify-between bg-yellow-25 border border-yellow-100 p-1.5 rounded">
                      <span className="font-medium text-slate-700 truncate flex-1">{note.title || 'Untitled Note'}</span>
                      <button 
                        onClick={() => onDeleteNote(paper.id, note.id)}
                        className="text-red-500 hover:text-red-700 p-0.5 ml-1"
                        title="Delete note"
                      >
                        &times;
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'abstract' && (
          <div className="flex flex-col h-full gap-2">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Abstract</label>
            <textarea
              value={paper.abstract}
              onChange={e => handleMetaChange({ abstract: e.target.value })}
              className="w-full flex-1 px-3 py-2 border border-slate-350 rounded focus:outline-none focus:border-blue-500 leading-relaxed text-xs resize-none"
              placeholder="Paste or write abstract summary..."
            />
          </div>
        )}

        {activeTab === 'tags' && (
          <div className="space-y-3">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Tags</label>
            
            <form onSubmit={handleAddTagSubmit} className="flex gap-1.5">
              <input 
                type="text"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                placeholder="Add tag..."
                className="flex-1 px-2.5 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
              />
              <button 
                type="submit"
                disabled={!newTag.trim()}
                className="bg-slate-100 border border-slate-300 hover:bg-slate-200 px-3 py-1 rounded text-xs font-semibold disabled:opacity-50"
              >
                Add
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5 pt-2">
              {paper.tags.length === 0 ? (
                <div className="text-slate-400 text-xs italic">No tags assigned.</div>
              ) : (
                paper.tags.map(tag => (
                  <span 
                    key={tag}
                    className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 border border-slate-250 text-slate-700 text-xs px-2 py-0.5 rounded-full"
                  >
                    <span>{tag}</span>
                    <button 
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-slate-400 hover:text-red-600 font-bold text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'related' && (
          <div className="space-y-4">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Related Items</label>
            
            {/* Link another paper */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Add relation:</label>
              <select
                onChange={e => {
                  handleLinkRelated(e.target.value);
                  e.target.value = ''; // reset select
                }}
                className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
                defaultValue=""
              >
                <option value="" disabled>-- Select Paper to Link --</option>
                {allPapers
                  .filter(p => p.id !== paper.id && !paper.related.includes(p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))
                }
              </select>
            </div>

            {/* List of related papers */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              {paper.related.length === 0 ? (
                <div className="text-slate-400 text-xs italic">No related items linked.</div>
              ) : (
                paper.related.map(relId => {
                  const relPaper = allPapers.find(p => p.id === relId);
                  if (!relPaper) return null;

                  return (
                    <div 
                      key={relId}
                      className="flex items-start justify-between bg-slate-50 border border-slate-200 p-2 rounded gap-2 hover:bg-slate-100/50"
                    >
                      <div 
                        onClick={() => onSelectPaperId(relId)}
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline cursor-pointer truncate flex-1"
                      >
                        <LinkIcon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        <span className="truncate font-medium">{relPaper.title}</span>
                      </div>
                      <button 
                        onClick={() => handleRemoveRelated(relId)}
                        className="text-slate-400 hover:text-red-500"
                        title="Remove link"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
