import React from 'react';
import { FileText, Link2, ArrowLeftRight } from 'lucide-react';
import { useApp } from '../state/AppContext';
import type { Page } from '../types';

export const NotesView: React.FC<{ page: Page }> = ({ page }) => {
  const { state, updatePage, setActivePageId } = useApp();

  const handleTextChange = (text: string) => {
    updatePage(page.id, {
      notes: text
    });
  };

  const handleTitleChange = (name: string) => {
    if (name.trim()) {
      updatePage(page.id, { name: name.trim() });
    }
  };

  // Find incoming backlinks: pages that link to this page
  // E.g., notes text contains this page's ID or markdown link
  const incomingLinks = state.pages.filter(p => 
    p.id !== page.id && 
    p.notes && 
    p.notes.includes(page.id)
  );

  // Link page helper: appends a markdown-like link to the textarea
  const handleLinkPageSelect = (targetPageId: string) => {
    const targetPage = state.pages.find(p => p.id === targetPageId);
    if (!targetPage) return;

    const currentNotes = page.notes || '';
    const markdownLink = `\n[[${targetPage.name}]] (${targetPage.id})\n`;
    handleTextChange(currentNotes + markdownLink);
  };

  return (
    <div className="flex-1 flex h-full bg-[var(--bg-main)] text-[var(--text-primary)] select-none overflow-hidden">
      {/* Editor Panel Left */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden h-full">
        {/* Title Input */}
        <div className="mb-4">
          <input
            type="text"
            value={page.name}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="Untitled Page"
            className="bg-transparent border-none text-2xl font-extrabold focus:outline-none text-white w-full tracking-tight"
          />
          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-1">
            Category: <span className="text-slate-350">{page.category}</span>
          </div>
        </div>

        {/* Text Area Note Editor */}
        <div className="flex-1 flex flex-col border border-[var(--border-color)] bg-[var(--bg-card)] rounded-xl p-4 overflow-hidden shadow-sm">
          <textarea
            value={page.notes || ''}
            onChange={e => handleTextChange(e.target.value)}
            placeholder="Type notes here... Use the Link tool on the right to insert wiki backlinks."
            className="w-full flex-1 bg-transparent border-none focus:outline-none resize-none text-xs font-mono leading-relaxed text-[var(--text-primary)]"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Backlinks & Tools Panel Right */}
      <div className="w-72 border-l border-[var(--border-color)] bg-[var(--bg-sidebar)] p-4 flex flex-col gap-4 overflow-y-auto">
        {/* Link Page Action */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
            <Link2 className="w-3.5 h-3.5" />
            <span>Link page in editor</span>
          </div>
          
          <select
            onChange={e => {
              handleLinkPageSelect(e.target.value);
              e.target.value = ''; // reset select
            }}
            className="w-full bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 text-xs text-[var(--text-primary)] font-medium"
            defaultValue=""
          >
            <option value="" disabled>-- Insert Backlink --</option>
            {state.pages
              .filter(p => p.id !== page.id)
              .map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))
            }
          </select>
          <div className="text-[9px] text-[var(--text-muted)] leading-normal">
            Adds a wiki backlink reference pointing to another note page.
          </div>
        </div>

        {/* Dynamic Incoming Backlinks */}
        <div className="space-y-2 pt-4 border-t border-[var(--border-color)] flex-1 flex flex-col">
          <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Incoming Backlinks ({incomingLinks.length})</span>
          </div>

          <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
            {incomingLinks.map(linkPage => (
              <div 
                key={linkPage.id}
                onClick={() => setActivePageId(linkPage.id)}
                className="p-2 border border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] rounded-lg cursor-pointer transition-colors flex items-center gap-2 text-xs text-blue-400 group"
              >
                <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span className="truncate font-medium group-hover:underline">{linkPage.name}</span>
              </div>
            ))}

            {incomingLinks.length === 0 && (
              <div className="text-xs text-[var(--text-muted)] italic text-center py-6">
                No incoming links found. Link this page from other notes using its wiki ID!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
