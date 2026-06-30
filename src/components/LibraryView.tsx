import React, { useState, useEffect } from 'react';
import { SidebarPane } from './SidebarPane';
import { ItemListPane } from './ItemListPane';
import { DetailPane } from './DetailPane';
import { PdfReaderView } from './PdfReaderView';
import { useApp } from '../state/AppContext';
import type { Paper } from '../types';

const COLLECTIONS_STORAGE_KEY = 'zotero-collections-list';
const DEFAULT_COLLECTIONS = [
  "LLM Alignment",
  "Diffusion & Generative Models",
  "Graph Neural Networks",
  "Multimodal Learning",
  "Efficient Inference & Quantization"
];

export const LibraryView: React.FC = () => {
  const {
    state,
    updatePaper,
    addPaperManual,
    addPaperByIdentifier,
    moveToTrash,
    restoreFromTrash,
    permanentlyDeletePaper,
    addPaperNote,
    deletePaperNote,
    trash,
    setActivePageId
  } = useApp();

  const [collections, setCollections] = useState<string[]>(() => {
    const saved = localStorage.getItem(COLLECTIONS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_COLLECTIONS;
  });

  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [selectedSpecial, setSelectedSpecial] = useState<'all' | 'duplicates' | 'unfiled' | 'trash'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<{ type: 'pdf' | 'note'; id: string } | null>(null);
  const [openedPdfPaper, setOpenedPdfPaper] = useState<Paper | null>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<'title' | 'creator' | 'date' | 'dateAdded'>('dateAdded');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Panel Resizing States
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [detailWidth, setDetailWidth] = useState(320);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingDetail, setIsResizingDetail] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'info' | 'abstract' | 'tags' | 'related' | 'pdf'>('info');

  // Drag-to-resize columns handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = Math.max(180, Math.min(400, e.clientX));
        setSidebarWidth(newWidth);
      } else if (isResizingDetail) {
        const newWidth = Math.max(260, Math.min(700, window.innerWidth - e.clientX));
        setDetailWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingDetail(false);
    };

    if (isResizingSidebar || isResizingDetail) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, isResizingDetail]);

  // Save collections list when changed
  useEffect(() => {
    localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(collections));
  }, [collections]);

  const handleAddCollection = (name: string) => {
    if (!collections.includes(name)) {
      setCollections(prev => [...prev, name]);
    }
  };

  const handleDeleteCollection = (name: string) => {
    setCollections(prev => prev.filter(c => c !== name));
    // Remove collection tags from papers
    state.library.forEach(p => {
      if (p.collections.includes(name)) {
        updatePaper({
          ...p,
          collections: p.collections.filter(c => c !== name)
        });
      }
    });
    if (selectedCollection === name) {
      setSelectedCollection(null);
    }
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleClearTags = () => setSelectedTags([]);

  const handleSelectPaper = (id: string | null, child?: { type: 'pdf' | 'note'; id: string } | null) => {
    setSelectedPaperId(id);
    setSelectedChildId(child || null);
    // Switch to info tab on new paper selection unless PDF tab is selected
    if (activeDetailTab === 'pdf' && !child) {
      // Keep PDF tab if there is a PDF
    } else if (child?.type === 'pdf') {
      setActiveDetailTab('pdf');
    } else {
      setActiveDetailTab('info');
    }
  };

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // Get paper counts for collections
  const papersCount: { [key: string]: number } = {};
  collections.forEach(c => {
    papersCount[c] = state.library.filter(p => !trash.includes(p.id) && p.collections.includes(c)).length;
  });

  const totalCount = state.library.filter(p => !trash.includes(p.id)).length;
  const trashCount = trash.length;

  // Extract all unique tags
  const allTags = Array.from(
    new Set(
      state.library
        .filter(p => !trash.includes(p.id))
        .reduce((acc: string[], p) => acc.concat(p.tags || []), [])
    )
  );

  // Filter papers for central list
  const listPapers = state.library
    .filter(p => {
      if (selectedSpecial === 'trash') {
        return trash.includes(p.id);
      }
      if (trash.includes(p.id)) return false;

      if (selectedCollection && !p.collections.includes(selectedCollection)) {
        return false;
      }

      if (selectedTags.length > 0 && !selectedTags.every(t => p.tags.includes(t))) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      let comp = 0;
      if (sortBy === 'title') {
        comp = a.title.localeCompare(b.title);
      } else if (sortBy === 'creator') {
        const aCreator = a.authors?.[0]?.lastName || '';
        const bCreator = b.authors?.[0]?.lastName || '';
        comp = aCreator.localeCompare(bCreator);
      } else if (sortBy === 'date') {
        comp = (a.date || '').localeCompare(b.date || '');
      } else if (sortBy === 'dateAdded') {
        comp = (a.dateAdded || '').localeCompare(b.dateAdded || '');
      }
      return sortOrder === 'asc' ? comp : -comp;
    });

  const selectedPaper = state.library.find(p => p.id === selectedPaperId) || null;

  // Sync details width when PDF reader tab is selected (expanded view)
  const currentDetailWidth = activeDetailTab === 'pdf' ? Math.max(620, detailWidth) : detailWidth;

  return (
    <div className="flex flex-1 overflow-hidden h-full bg-[var(--bg-app)] text-[var(--text-primary)] relative select-none">
      {/* 1. Left collections tree sidebar */}
      <div 
        style={{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }} 
        className="h-full flex flex-col overflow-hidden shrink-0"
      >
        <SidebarPane 
          collections={collections}
          selectedCollection={selectedCollection}
          selectedSpecial={selectedSpecial}
          onSelectCollection={setSelectedCollection}
          onSelectSpecial={setSelectedSpecial}
          onAddCollection={handleAddCollection}
          onDeleteCollection={handleDeleteCollection}
          allTags={allTags}
          selectedTags={selectedTags}
          onToggleTag={handleToggleTag}
          onClearTags={handleClearTags}
          papersCount={papersCount}
          totalCount={totalCount}
          trashCount={trashCount}
          onBackToDashboard={() => setActivePageId('home')}
        />
      </div>

      {/* Left Resizer Border */}
      <div 
        onMouseDown={() => setIsResizingSidebar(true)}
        className={`w-[3px] hover:w-[5px] cursor-col-resize hover:bg-blue-500/50 bg-[var(--border-color)] transition-all h-full z-20 shrink-0 ${
          isResizingSidebar ? 'bg-blue-500 w-[5px]' : ''
        }`}
      />

      {/* 2. Middle Main Grid Column (or middle PDF reader view) */}
      <div className="flex-1 h-full min-w-0 overflow-hidden flex flex-col bg-[var(--bg-main)]">
        {openedPdfPaper ? (
          <PdfReaderView 
            paper={state.library.find(p => p.id === openedPdfPaper.id) || openedPdfPaper} 
            onClose={() => setOpenedPdfPaper(null)}
            onUpdatePaper={updatePaper}
          />
        ) : (
          <ItemListPane 
            papers={listPapers}
            selectedPaperId={selectedPaperId}
            selectedChildId={selectedChildId}
            onSelectPaper={handleSelectPaper}
            onAddPaperManual={(type) => addPaperManual(type, selectedCollection)}
            onAddByIdentifier={(id) => addPaperByIdentifier(id, selectedCollection)}
            onMoveToTrash={moveToTrash}
            onRestoreFromTrash={restoreFromTrash}
            onPermanentlyDelete={permanentlyDeletePaper}
            selectedSpecial={selectedSpecial}
            selectedCollection={selectedCollection}
            onOpenPdf={(paper) => setOpenedPdfPaper(paper)}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        )}
      </div>

      {/* Right Resizer Border */}
      <div 
        onMouseDown={() => setIsResizingDetail(true)}
        className={`w-[3px] hover:w-[5px] cursor-col-resize hover:bg-blue-500/50 bg-[var(--border-color)] transition-all h-full z-20 shrink-0 ${
          isResizingDetail ? 'bg-blue-500 w-[5px]' : ''
        }`}
      />

      {/* 3. Right Details & Metadata Pane */}
      <div 
        style={{ width: `${currentDetailWidth}px`, minWidth: `${currentDetailWidth}px` }} 
        className="h-full flex flex-col overflow-hidden shrink-0"
      >
        <DetailPane 
          paper={selectedPaper}
          selectedChildId={selectedChildId}
          allPapers={state.library.filter(p => !trash.includes(p.id))}
          onUpdatePaper={updatePaper}
          onSelectPaperId={(id) => handleSelectPaper(id, null)}
          onAddNote={addPaperNote}
          onDeleteNote={deletePaperNote}
          activeTab={activeDetailTab}
          onChangeTab={setActiveDetailTab}
        />
      </div>
    </div>
  );
};

