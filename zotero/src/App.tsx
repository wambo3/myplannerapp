import React, { useState, useEffect } from 'react';
import { SidebarPane } from './components/SidebarPane';
import { ItemListPane } from './components/ItemListPane';
import { DetailPane } from './components/DetailPane';
import { PdfReaderView } from './components/PdfReaderView';
import type { Paper } from './types';
import { loadLibraryState, saveLibraryState } from './state';

// Premapped papers for "Add by Identifier" (magic wand tool)
const PREMAPPED_PAPERS: { [key: string]: Omit<Paper, 'dateAdded' | 'dateModified'> } = {
  "2203.02155": {
    id: "2203.02155",
    type: "journalArticle",
    title: "Training language models to follow instructions with human feedback",
    authors: [
      { firstName: "Long", lastName: "Ouyang" },
      { firstName: "Jeff", lastName: "Wu" },
      { firstName: "Xu", lastName: "Jiang" },
      { firstName: "Diogo", lastName: "Almeida" },
      { firstName: "Carroll", lastName: "Wainwright" },
      { firstName: "Pamela", lastName: "Mishkin" },
      { firstName: "Chong", lastName: "Zhang" },
      { firstName: "Sandhini", lastName: "Agarwal" },
      { firstName: "Katarina", lastName: "Slama" },
      { firstName: "Alex", lastName: "Ray" },
      { firstName: "John", lastName: "Schulman" },
      { firstName: "Jacob", lastName: "Hilton" },
      { firstName: "Fraser", lastName: "Kelton" },
      { firstName: "Luke", lastName: "Miller" },
      { firstName: "Maddie", lastName: "Simens" },
      { firstName: "Amanda", lastName: "Askell" },
      { firstName: "Peter", lastName: "Welinder" },
      { firstName: "Paul", lastName: "Christiano" },
      { firstName: "Jan", lastName: "Leike" },
      { firstName: "Ryan", lastName: "Lowe" }
    ],
    abstract: "Making language models larger does not inherently make them better at following a user's intent. For example, large language models can generate outputs that are untruthful, toxic, or simply not helpful to the user. In other words, these models are not aligned with their users. In this paper, we show an avenue for aligning language models with user intent on a wide range of tasks, by fine-tuning with human feedback...",
    publication: "arXiv",
    date: "2022-03-04",
    doi: "10.48550/arXiv.2203.02155",
    url: "https://arxiv.org/abs/2203.02155",
    pdfPath: "pdfs/2203.02155.pdf",
    collections: ["LLM Alignment"],
    tags: ["RLHF", "Alignment", "InstructGPT", "GPT-3"],
    related: ["2103.00020"],
    notes: [
      {
        id: "n_init_" + Math.random().toString(36).substr(2, 9),
        title: "InstructGPT Initial Notes",
        content: "This paper establishes reinforcement learning from human feedback (RLHF) as a highly successful scaling paradigm for GPT-3 instruction tuning."
      }
    ]
  },
  "2006.11239": {
    id: "2006.11239",
    type: "journalArticle",
    title: "Denoising Diffusion Probabilistic Models",
    authors: [
      { firstName: "Jonathan", lastName: "Ho" },
      { firstName: "Ajay", lastName: "Jain" },
      { firstName: "Pieter", lastName: "Abbeel" }
    ],
    abstract: "We present high quality image synthesis results using diffusion probabilistic models, a class of latent variable models inspired by considerations from nonequilibrium thermodynamics. Our best results are obtained on a weighted variational bound designed according to a novel connection between diffusion probabilistic models and denoising score matching with Langevin dynamics...",
    publication: "arXiv",
    date: "2020-06-19",
    doi: "10.48550/arXiv.2006.11239",
    url: "https://arxiv.org/abs/2006.11239",
    pdfPath: "pdfs/2006.11239.pdf",
    collections: ["Diffusion & Generative Models"],
    tags: ["Diffusion", "Generative Models", "DDPM", "Thermodynamics"],
    related: [],
    notes: [
      {
        id: "n_init_" + Math.random().toString(36).substr(2, 9),
        title: "DDPM Mathematical Background",
        content: "Introduced the simplified variational bound mapping diffusion directly to denoising autoencoders at multiple noise levels."
      }
    ]
  },
  "1609.02907": {
    id: "1609.02907",
    type: "journalArticle",
    title: "Semi-Supervised Classification with Graph Convolutional Networks",
    authors: [
      { firstName: "Thomas", lastName: "Kipf" },
      { firstName: "Max", lastName: "Welling" }
    ],
    abstract: "We present a scalable approach for semi-supervised learning on graph-structured data that is based on an efficient variant of convolutional neural networks which operate directly on graphs. We motivate the choice of our convolutional architecture via a localized first-order approximation of spectral graph convolutions...",
    publication: "arXiv",
    date: "2016-09-22",
    doi: "10.48550/arXiv.1609.02907",
    url: "https://arxiv.org/abs/1609.02907",
    pdfPath: "pdfs/1609.02907.pdf",
    collections: ["Graph Neural Networks"],
    tags: ["GCN", "GNN", "Semi-Supervised", "Graph Networks"],
    related: [],
    notes: [
      {
        id: "n_init_" + Math.random().toString(36).substr(2, 9),
        title: "Spectral approximation",
        content: "First-order spectral formulation provides standard graph convolutional networks baseline."
      }
    ]
  },
  "2103.00020": {
    id: "2103.00020",
    type: "journalArticle",
    title: "Learning Transferable Visual Models From Natural Language Supervision",
    authors: [
      { firstName: "Alec", lastName: "Radford" },
      { firstName: "Jong Wook", lastName: "Kim" },
      { firstName: "Chris", lastName: "Hallacy" },
      { firstName: "Aditya", "lastName": "Ramesh" },
      { firstName: "Gabriel", "lastName": "Goh" },
      { firstName: "Sandhini", "lastName": "Agarwal" },
      { firstName: "Girish", "lastName": "Sastry" },
      { firstName: "Amanda", "lastName": "Askell" },
      { firstName: "Pamela", "lastName": "Mishkin" },
      { firstName: "Jack", "lastName": "Clark" },
      { firstName: "Gretchen", "lastName": "Krueger" },
      { firstName: "Ilya", "lastName": "Sutskever" }
    ],
    abstract: "State-of-the-art computer vision systems are trained to predict a fixed set of predetermined object categories. This restricted form of supervision limits their generality and usability since additional labeled data is needed to specify any other visual concept. Learning directly from raw text about images is a promising alternative which leverages a much broader source of supervision...",
    publication: "arXiv",
    date: "2021-02-26",
    doi: "10.48550/arXiv.2103.00020",
    url: "https://arxiv.org/abs/2103.00020",
    pdfPath: "pdfs/2103.00020.pdf",
    collections: ["Multimodal Learning"],
    tags: ["CLIP", "Multimodal", "Contrastive Learning", "Zero-Shot"],
    related: ["2203.02155"],
    notes: [
      {
        id: "n_init_" + Math.random().toString(36).substr(2, 9),
        title: "Contrastive training overview",
        content: "Contrastive image-text pre-training at scale displays unprecedented zero-shot capability on ImageNet classification."
      }
    ]
  },
  "2208.07339": {
    id: "2208.07339",
    type: "journalArticle",
    title: "LLM.int8(): 8-bit Matrix Multiplication for Transformers at Scale",
    authors: [
      { firstName: "Tim", "lastName": "Dettmers" },
      { firstName: "Mike", "lastName": "Lewis" },
      { firstName: "Younes", "lastName": "Belkada" },
      { firstName: "Luke", "lastName": "Zettlemoyer" }
    ],
    abstract: "Large language models show emergent capabilities at scale, but their massive size makes them extremely expensive for inference. We present LLM.int8(), a quantization method for matrix multiplication in transformers that reduces memory usage by half while preserving model performance. We show that we can quantize matrix multiplication with 8-bit integers without loss in accuracy for models up to 175B parameters...",
    publication: "arXiv",
    date: "2022-08-15",
    doi: "10.48550/arXiv.2208.07339",
    url: "https://arxiv.org/abs/2208.07339",
    pdfPath: "pdfs/2208.07339.pdf",
    collections: ["Efficient Inference & Quantization"],
    tags: ["Quantization", "LLM.int8", "Inference", "Efficiency"],
    related: [],
    notes: [
      {
        id: "n_init_" + Math.random().toString(36).substr(2, 9),
        title: "Outlier feature separation",
        content: "The core contribution is separating coordinate-wise outlier channels into FP16 matrix multiplication while doing 8-bit quantization on other 99.9% of features."
      }
    ]
  }
};

export const App: React.FC = () => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [collections, setCollections] = useState<string[]>([]);
  const [trash, setTrash] = useState<string[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<{ type: 'pdf' | 'note'; id: string } | null>(null);
  
  // Left Tree Sidebar Selection States
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [selectedSpecial, setSelectedSpecial] = useState<'all' | 'duplicates' | 'unfiled' | 'trash'>('all');
  
  // Tag Filter selection
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Open PDF in-app Reader
  const [openedPdfPaper, setOpenedPdfPaper] = useState<Paper | null>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<'title' | 'creator' | 'date' | 'dateAdded'>('dateAdded');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Load Library Data
  useEffect(() => {
    async function init() {
      const state = await loadLibraryState();
      setPapers(state.papers);
      setCollections(state.collections);
      setTrash(state.trash);
    }
    init();
  }, []);

  // Save State whenever papers, collections, or trash changes
  const saveState = (updatedPapers: Paper[], updatedCollections: string[], updatedTrash: string[]) => {
    setPapers(updatedPapers);
    setCollections(updatedCollections);
    setTrash(updatedTrash);
    saveLibraryState(updatedPapers, updatedCollections, updatedTrash);
  };

  // Sorting Handler
  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // Sidebar Handlers
  const handleSelectCollection = (collection: string | null) => {
    setSelectedCollection(collection);
    setSelectedPaperId(null);
    setSelectedChildId(null);
  };

  const handleSelectSpecial = (type: typeof selectedSpecial) => {
    setSelectedSpecial(type);
    setSelectedPaperId(null);
    setSelectedChildId(null);
  };

  const handleAddCollection = (name: string) => {
    if (!collections.includes(name)) {
      const updated = [...collections, name];
      saveState(papers, updated, trash);
    }
  };

  const handleDeleteCollection = (name: string) => {
    const updatedCollections = collections.filter(c => c !== name);
    // Unassign this collection from all papers
    const updatedPapers = papers.map(p => ({
      ...p,
      collections: p.collections.filter(c => c !== name)
    }));
    saveState(updatedPapers, updatedCollections, trash);
    if (selectedCollection === name) {
      setSelectedCollection(null);
    }
  };

  // Tag filter handlers
  const handleToggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleClearTags = () => {
    setSelectedTags([]);
  };

  // Paper CRUD operations
  const handleSelectPaper = (id: string | null, child?: { type: 'pdf' | 'note'; id: string } | null) => {
    setSelectedPaperId(id);
    setSelectedChildId(child || null);
  };

  const handleUpdatePaper = (updatedPaper: Paper) => {
    const updated = papers.map(p => p.id === updatedPaper.id ? updatedPaper : p);
    saveState(updated, collections, trash);
  };

  const handleAddPaperManual = (type: string) => {
    const newPaperId = 'p_' + Math.random().toString(36).substr(2, 9);
    const newPaper: Paper = {
      id: newPaperId,
      type: type,
      title: `Untitled ${type === 'journalArticle' ? 'Journal Article' : 'Book'}`,
      authors: [{ firstName: '', lastName: '' }],
      abstract: '',
      publication: '',
      date: new Date().getFullYear().toString(),
      doi: '',
      url: '',
      pdfPath: '',
      collections: selectedCollection ? [selectedCollection] : [],
      tags: [],
      related: [],
      notes: [],
      dateAdded: new Date().toISOString(),
      dateModified: new Date().toISOString()
    };

    saveState([...papers, newPaper], collections, trash);
    setSelectedPaperId(newPaperId);
    setSelectedChildId(null);
  };

  const handleAddByIdentifier = async (identifier: string): Promise<boolean> => {
    const cleanId = identifier.trim();
    
    // Check if we have pre-mapped metadata for this arXiv ID
    const mapped = PREMAPPED_PAPERS[cleanId];
    if (mapped) {
      // Check if already in library
      if (papers.some(p => p.id === cleanId)) {
        // Already exists, just select it
        setSelectedPaperId(cleanId);
        setSelectedChildId(null);
        return true;
      }

      // Simulate a loading delay of 800ms
      await new Promise(resolve => setTimeout(resolve, 800));

      const newPaper: Paper = {
        ...mapped,
        collections: selectedCollection ? [selectedCollection] : mapped.collections,
        dateAdded: new Date().toISOString(),
        dateModified: new Date().toISOString()
      };

      // If paper was in trash, restore it
      const updatedTrash = trash.filter(id => id !== cleanId);
      
      saveState([...papers, newPaper], collections, updatedTrash);
      setSelectedPaperId(cleanId);
      setSelectedChildId(null);
      return true;
    }

    return false;
  };

  const handleMoveToTrash = (id: string) => {
    if (!trash.includes(id)) {
      const updatedTrash = [...trash, id];
      saveState(papers, collections, updatedTrash);
      setSelectedPaperId(null);
      setSelectedChildId(null);
    }
  };

  const handleRestoreFromTrash = (id: string) => {
    const updatedTrash = trash.filter(item => item !== id);
    saveState(papers, collections, updatedTrash);
    setSelectedPaperId(id);
    setSelectedChildId(null);
  };

  const handlePermanentlyDelete = (id: string) => {
    const updatedPapers = papers.filter(p => p.id !== id);
    const updatedTrash = trash.filter(item => item !== id);
    saveState(updatedPapers, collections, updatedTrash);
    setSelectedPaperId(null);
    setSelectedChildId(null);
  };

  // Note management
  const handleAddNote = (paperId: string) => {
    const p = papers.find(item => item.id === paperId);
    if (!p) return;

    const noteId = 'n_' + Math.random().toString(36).substr(2, 9);
    const newNote = {
      id: noteId,
      title: 'New Note',
      content: ''
    };

    const updatedPaper = {
      ...p,
      notes: [...(p.notes || []), newNote],
      dateModified: new Date().toISOString()
    };

    handleUpdatePaper(updatedPaper);
    setSelectedChildId({ type: 'note', id: noteId });
  };

  const handleDeleteNote = (paperId: string, noteId: string) => {
    const p = papers.find(item => item.id === paperId);
    if (!p) return;

    const updatedPaper = {
      ...p,
      notes: p.notes.filter(n => n.id !== noteId),
      dateModified: new Date().toISOString()
    };

    handleUpdatePaper(updatedPaper);
    setSelectedChildId(null);
  };

  // Extract all unique tags in active papers
  const allTags = Array.from(
    new Set(
      papers
        .filter(p => !trash.includes(p.id))
        .reduce((acc: string[], p) => acc.concat(p.tags || []), [])
    )
  );

  // Compute paper counts for collections
  const papersCount: { [key: string]: number } = {};
  collections.forEach(c => {
    papersCount[c] = papers.filter(p => !trash.includes(p.id) && p.collections.includes(c)).length;
  });

  const totalCount = papers.filter(p => !trash.includes(p.id)).length;
  const trashCount = trash.length;

  // Filter papers for central list displaying
  const listPapers = papers
    .filter(p => {
      // 1. Trash filter
      if (selectedSpecial === 'trash') {
        return trash.includes(p.id);
      }
      if (trash.includes(p.id)) return false;

      // 2. Collection filter
      if (selectedCollection && !p.collections.includes(selectedCollection)) {
        return false;
      }

      // 3. Tag filter
      if (selectedTags.length > 0 && !selectedTags.every(t => p.tags.includes(t))) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortBy === 'creator') {
        const aCreator = a.authors?.[0]?.lastName || '';
        const bCreator = b.authors?.[0]?.lastName || '';
        comparison = aCreator.localeCompare(bCreator);
      } else if (sortBy === 'date') {
        comparison = (a.date || '').localeCompare(b.date || '');
      } else if (sortBy === 'dateAdded') {
        comparison = (a.dateAdded || '').localeCompare(b.dateAdded || '');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const selectedPaper = papers.find(p => p.id === selectedPaperId) || null;

  // Render Full Screen PDF Reader View if a PDF is opened
  if (openedPdfPaper) {
    return (
      <PdfReaderView 
        paper={openedPdfPaper} 
        onClose={() => setOpenedPdfPaper(null)}
        onUpdatePaper={handleUpdatePaper}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 font-sans antialiased text-slate-800 text-sm select-none">
      {/* 3-Pane Layout container */}
      <div className="flex flex-1 overflow-hidden h-full">
        {/* Left Pane (Collections Tree) */}
        <SidebarPane 
          collections={collections}
          selectedCollection={selectedCollection}
          selectedSpecial={selectedSpecial}
          onSelectCollection={handleSelectCollection}
          onSelectSpecial={handleSelectSpecial}
          onAddCollection={handleAddCollection}
          onDeleteCollection={handleDeleteCollection}
          allTags={allTags}
          selectedTags={selectedTags}
          onToggleTag={handleToggleTag}
          onClearTags={handleClearTags}
          papersCount={papersCount}
          totalCount={totalCount}
          trashCount={trashCount}
        />

        {/* Middle Pane (Sortable Paper Table List) */}
        <ItemListPane 
          papers={listPapers}
          selectedPaperId={selectedPaperId}
          selectedChildId={selectedChildId}
          onSelectPaper={handleSelectPaper}
          onAddPaperManual={handleAddPaperManual}
          onAddByIdentifier={handleAddByIdentifier}
          onMoveToTrash={handleMoveToTrash}
          onRestoreFromTrash={handleRestoreFromTrash}
          onPermanentlyDelete={handlePermanentlyDelete}
          selectedSpecial={selectedSpecial}
          selectedCollection={selectedCollection}
          onOpenPdf={(paper) => setOpenedPdfPaper(paper)}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
        />

        {/* Right Pane (Metadata Editor Pane) */}
        <DetailPane 
          paper={selectedPaper}
          selectedChildId={selectedChildId}
          allPapers={papers.filter(p => !trash.includes(p.id))}
          onUpdatePaper={handleUpdatePaper}
          onSelectPaperId={(id) => handleSelectPaper(id, null)}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
        />
      </div>
    </div>
  );
};
