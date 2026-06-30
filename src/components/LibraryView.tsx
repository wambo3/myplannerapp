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

  if (openedPdfPaper) {
    // Sync paper status inside PDF Reader
    const activePaper = state.library.find(p => p.id === openedPdfPaper.id) || openedPdfPaper;
    return (
      <PdfReaderView 
        paper={activePaper} 
        onClose={() => setOpenedPdfPaper(null)}
        onUpdatePaper={updatePaper}
      />
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden h-full bg-slate-100">
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

      <DetailPane 
        paper={selectedPaper}
        selectedChildId={selectedChildId}
        allPapers={state.library.filter(p => !trash.includes(p.id))}
        onUpdatePaper={updatePaper}
        onSelectPaperId={(id) => handleSelectPaper(id, null)}
        onAddNote={addPaperNote}
        onDeleteNote={deletePaperNote}
      />
    </div>
  );
};
