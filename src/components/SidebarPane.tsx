import React, { useState } from 'react';
import { 
  Folder, 
  FolderPlus, 
  Trash2, 
  Layers, 
  Tag, 
  ChevronDown, 
  ChevronRight,
  BookOpen
} from 'lucide-react';

interface SidebarPaneProps {
  collections: string[];
  selectedCollection: string | null; // null means 'My Library' or other special pages
  selectedSpecial: 'all' | 'duplicates' | 'unfiled' | 'trash';
  onSelectCollection: (collection: string | null) => void;
  onSelectSpecial: (type: 'all' | 'duplicates' | 'unfiled' | 'trash') => void;
  onAddCollection: (name: string) => void;
  onDeleteCollection: (name: string) => void;
  allTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  papersCount: { [key: string]: number };
  totalCount: number;
  trashCount: number;
  onBackToDashboard?: () => void;
}

export const SidebarPane: React.FC<SidebarPaneProps> = ({
  collections,
  selectedCollection,
  selectedSpecial,
  onSelectCollection,
  onSelectSpecial,
  onAddCollection,
  onDeleteCollection,
  allTags,
  selectedTags,
  onToggleTag,
  onClearTags,
  papersCount,
  totalCount,
  trashCount,
  onBackToDashboard,
}) => {
  const [isTreeExpanded, setIsTreeExpanded] = useState(true);
  const [newCollName, setNewCollName] = useState('');
  const [isAddingColl, setIsAddingColl] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  const handleAddCollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCollName.trim()) {
      onAddCollection(newCollName.trim());
      setNewCollName('');
      setIsAddingColl(false);
    }
  };

  const filteredTags = allTags.filter(tag => 
    tag.toLowerCase().includes(tagSearch.toLowerCase())
  );

  return (
    <div className="w-full h-full border-r border-[var(--border-color)] bg-[var(--bg-sidebar)] flex flex-col select-none text-[var(--text-primary)] text-sm">
      {/* Search/Header area */}
      <div className="p-3 border-b border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
          <BookOpen className="w-5 h-5 text-blue-500" />
          <span>Zotero 9 Clone</span>
        </div>
        {onBackToDashboard && (
          <button 
            onClick={onBackToDashboard}
            className="text-xs bg-[var(--bg-hover)] border border-[var(--border-color)] hover:bg-[var(--bg-app)] px-2 py-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] font-semibold transition-colors"
            title="Back to Planner Dashboard"
          >
            Dashboard
          </button>
        )}
      </div>

      {/* Library Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        <div>
          <div className="flex items-center justify-between px-2 py-1 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span>My Library</span>
            <button 
              onClick={() => setIsAddingColl(!isAddingColl)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 rounded hover:bg-[var(--bg-hover)]"
              title="New Collection"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          {isAddingColl && (
            <form onSubmit={handleAddCollSubmit} className="px-2 py-1.5 flex gap-1">
              <input 
                type="text"
                value={newCollName}
                onChange={e => setNewCollName(e.target.value)}
                placeholder="Collection name"
                className="flex-1 px-2 py-1 border border-[var(--border-color)] bg-[var(--bg-hover)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
                autoFocus
              />
              <button 
                type="submit" 
                className="px-2 py-1 bg-[var(--accent-color)] text-white rounded text-xs font-medium hover:opacity-90"
              >
                Add
              </button>
            </form>
          )}

          <div className="mt-1 space-y-0.5">
            {/* All items */}
            <div 
              onClick={() => {
                onSelectSpecial('all');
                onSelectCollection(null);
              }}
              className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors ${
                selectedSpecial === 'all' && !selectedCollection
                  ? 'bg-[var(--accent-light)] text-[var(--accent-color)] font-medium border-l-2 border-[var(--accent-color)] pl-1.5'
                  : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4" />
                <span>All Items</span>
              </div>
              <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-hover)] px-1.5 py-0.2 rounded-full font-normal">
                {totalCount}
              </span>
            </div>

            {/* Tree root for Collections */}
            <div>
              <div 
                onClick={() => setIsTreeExpanded(!isTreeExpanded)}
                className="flex items-center gap-1 px-2 py-1 hover:bg-[var(--bg-hover)] rounded cursor-pointer text-[var(--text-muted)] text-xs font-semibold"
              >
                {isTreeExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <span>Collections</span>
              </div>

              {isTreeExpanded && (
                <div className="pl-4 mt-0.5 space-y-0.5 border-l border-[var(--border-color)] ml-3">
                  {collections.map(coll => {
                    const isSelected = selectedCollection === coll;
                    return (
                      <div 
                        key={coll}
                        onClick={() => {
                          onSelectCollection(coll);
                          onSelectSpecial('all');
                        }}
                        className={`group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[var(--accent-light)] text-[var(--accent-color)] font-medium border-l-2 border-[var(--accent-color)] pl-1.5'
                            : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Folder className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[var(--accent-color)]' : 'text-[var(--text-muted)]'}`} />
                          <span className="truncate">{coll}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-hover)] group-hover:hidden px-1.5 py-0.2 rounded-full font-normal">
                            {papersCount[coll] || 0}
                          </span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Are you sure you want to delete collection "${coll}"? (Papers will remain in "All Items")`)) {
                                onDeleteCollection(coll);
                              }
                            }}
                            className="hidden group-hover:block text-[var(--text-muted)] hover:text-red-500 font-bold"
                            title="Delete Collection"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Trash */}
            <div 
              onClick={() => {
                onSelectSpecial('trash');
                onSelectCollection(null);
              }}
              className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors ${
                selectedSpecial === 'trash'
                  ? 'bg-[var(--accent-light)] text-[var(--accent-color)] font-medium border-l-2 border-[var(--accent-color)] pl-1.5'
                  : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                <span>Trash</span>
              </div>
              <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-hover)] px-1.5 py-0.2 rounded-full font-normal">
                {trashCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tags Filter Pane */}
      <div className="border-t border-[var(--border-color)] bg-[var(--bg-card)] p-3 h-52 flex flex-col">
        <div className="flex items-center justify-between text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
          <div className="flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" />
            <span>Tags Filter</span>
          </div>
          {selectedTags.length > 0 && (
            <button 
              onClick={onClearTags}
              className="text-[var(--accent-color)] hover:opacity-85 text-[10px] lowercase font-normal"
            >
              clear all
            </button>
          )}
        </div>

        <input 
          type="text"
          value={tagSearch}
          onChange={e => setTagSearch(e.target.value)}
          placeholder="Filter tags..."
          className="w-full px-2 py-1 border border-[var(--border-color)] bg-[var(--bg-hover)] text-[var(--text-primary)] rounded text-xs focus:outline-none focus:border-[var(--accent-color)] mb-2"
        />

        <div className="flex-1 overflow-y-auto space-y-1.5">
          {filteredTags.length === 0 ? (
            <div className="text-[var(--text-muted)] text-xs italic text-center mt-4">No tags match</div>
          ) : (
            filteredTags.map(tag => {
              const isChecked = selectedTags.includes(tag);
              return (
                <label 
                  key={tag}
                  className={`flex items-center gap-2 px-1.5 py-0.5 rounded text-xs cursor-pointer hover:bg-[var(--bg-hover)] ${
                    isChecked ? 'text-[var(--accent-color)] bg-[var(--accent-light)] font-medium' : 'text-[var(--text-muted)]'
                  }`}
                >
                  <input 
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleTag(tag)}
                    className="rounded border-[var(--border-color)] text-[var(--accent-color)] focus:ring-[var(--accent-color)] w-3 h-3 bg-transparent"
                  />
                  <span className="truncate">{tag}</span>
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
