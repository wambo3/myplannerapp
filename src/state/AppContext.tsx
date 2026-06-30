import React, { createContext, useContext, useState, useEffect } from 'react';
import type { AppState, Page, Task, Habit, Goal, Contact, StickyNote, Paper, PaperNote, MoodLog, Settings, Profile } from '../types';

interface AppContextProps {
  state: AppState;
  setActivePageId: (id: string) => void;
  setActiveView: (view: AppState['activeView']) => void;
  setSelectedDocId: (id: string | null) => void;
  addPage: (name: string, type: Page['type'], category: string) => void;
  deletePage: (id: string) => void;
  updatePage: (id: string, fields: Partial<Page>) => void;
  addTask: (pageId: string, name: string, due: string) => void;
  toggleTask: (pageId: string, taskId: string) => void;
  deleteTask: (pageId: string, taskId: string) => void;
  addHabit: (name: string) => void;
  toggleHabit: (id: string) => void;
  deleteHabit: (id: string) => void;
  addGoal: (name: string) => void;
  toggleGoal: (id: string) => void;
  deleteGoal: (id: string) => void;
  addContact: (name: string, stage: string, frequency: string, notes: string) => void;
  updateContact: (id: string, fields: Partial<Contact>) => void;
  deleteContact: (id: string) => void;
  addSticky: (text: string, color: StickyNote['color']) => void;
  updateSticky: (id: string, text: string) => void;
  deleteSticky: (id: string) => void;
  addMoodLog: (mood: string, note: string) => void;
  updateSettings: (fields: Partial<Settings>) => void;
  updateProfile: (fields: Partial<Profile>) => void;
  updatePaper: (updated: Paper) => void;
  addPaperManual: (type: string, targetCollection?: string | null) => void;
  addPaperByIdentifier: (identifier: string, targetCollection?: string | null) => Promise<boolean>;
  moveToTrash: (id: string) => void;
  restoreFromTrash: (id: string) => void;
  permanentlyDeletePaper: (id: string) => void;
  addPaperNote: (paperId: string) => void;
  deletePaperNote: (paperId: string, noteId: string) => void;
  trash: string[];
}

const STORAGE_KEY = 'notion-dashboard-data';

const DEFAULT_DATA: AppState = {
  activePageId: 'page-todos',
  activeView: 'tasks',
  selectedDocId: null,
  recentIds: ['page-todos'],
  pages: [
    {
      id: 'page-todos',
      name: 'To-dos',
      icon: '',
      category: 'To-dos',
      banner: '',
      type: 'tasks',
      tasks: [
        { id: 't1', name: 'Design landing page', due: 'May 12, 2025', checked: false },
        { id: 't2', name: 'Fix auth bug', due: 'May 14, 2025', checked: false },
        { id: 't3', name: 'Build Admin console', due: 'May 8, 2025', checked: true },
        { id: 't4', name: 'Schedule team off-site', due: 'May 20, 2025', checked: false },
        { id: 't5', name: 'Prepare Q2 report', due: 'May 25, 2025', checked: false },
        { id: 't6', name: 'Ship v2.0 beta', due: 'Jun 1, 2025 10:00 AM', checked: false },
      ],
    },
  ],
  library: [],
  settings: {
    pomodoro: true,
    stickyNotes: true,
    banners: true,
    theme: 'dark',
    themeSubtype: 'charcoal',
    fontFamily: 'sans',
    accentColor: 'blue',
    weekStart: 'sunday',
    sidebarPosition: 'left',
    density: 'cozy',
    glassEffects: false,
    sidebarCollapsed: false,
    categories: ['To-dos', 'Notes', 'Journal', 'Personal', 'Work'],
    homeTitle: 'Command Center',
    customQuote: '',
    activeWidgets: ['clock', 'habits', 'goals', 'quote', 'timer', 'reading', 'calendar', 'quick_add'],
    quickActions: []
  },
  stickies: [],
  habits: [
    { id: 'h1', name: 'Read books', checkedToday: false, streak: 3, lastChecked: '' },
    { id: 'h2', name: 'Exercise', checkedToday: false, streak: 5, lastChecked: '' },
    { id: 'h3', name: 'Meditation', checkedToday: false, streak: 2, lastChecked: '' }
  ],
  todayGoals: [
    { id: 'tg1', name: 'Complete workspace tasks', checked: false }
  ],
  moodLogs: [
    { date: '2026-06-22', mood: '😊', note: 'Feeling productive!' }
  ],
  crmContacts: [
    { id: 'crm1', name: 'Professor Adams', stage: 'Mentor', lastContact: '2026-06-18', frequency: 'monthly', notes: 'Check in about research proposal.' },
    { id: 'crm2', name: 'Alice (Recruiter)', stage: 'Professional', lastContact: '2026-06-20', frequency: 'weekly', notes: 'Send resume updates.' }
  ],
  productivityActivity: {},
  profile: {
    name: 'User Name',
    bio: 'Productivity Mode',
    avatarType: 'initials',
    avatarUrl: ''
  }
};

// Premapped papers for "Add by Identifier"
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
        id: "n_init_1",
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
        id: "n_init_2",
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
        id: "n_init_3",
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
        id: "n_init_4",
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
        id: "n_init_5",
        title: "Outlier feature separation",
        content: "The core contribution is separating coordinate-wise outlier channels into FP16 matrix multiplication while doing 8-bit quantization on other 99.9% of features."
      }
    ]
  }
};

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(() => {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        // Ensure sub-state sanity
        parsed.pages = parsed.pages || [];
        parsed.library = parsed.library || [];
        parsed.habits = parsed.habits || [];
        parsed.crmContacts = parsed.crmContacts || [];
        parsed.todayGoals = parsed.todayGoals || [];
        parsed.stickies = parsed.stickies || [];
        parsed.moodLogs = parsed.moodLogs || [];
        parsed.productivityActivity = parsed.productivityActivity || {};
        return parsed;
      } catch (e) {
        /* fallback to DEFAULT_DATA */
      }
    }
    return DEFAULT_DATA;
  });

  const [trash, setTrash] = useState<string[]>(() => {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        return parsed.libraryTrash || [];
      } catch (e) { /* ignore */ }
    }
    return [];
  });

  // Load static data.json if library is empty
  useEffect(() => {
    if (state.library.length === 0) {
      fetch('/data.json')
        .then(res => res.ok ? res.json() : null)
        .then(dataJson => {
          if (dataJson && Array.isArray(dataJson.papers)) {
            const mappedPapers = dataJson.papers.map((p: any) => ({
              ...p,
              name: p.title,
              dateAdded: p.dateAdded || new Date().toISOString(),
              dateModified: p.dateModified || new Date().toISOString()
            }));
            updateState({ library: mappedPapers });
          }
        })
        .catch(err => console.warn("Failed to load initial data.json", err));
    }
  }, []);

  // Save changes to localStorage on state or trash update
  const updateState = (updatedFields: Partial<AppState>) => {
    setState(prev => {
      const next = { ...prev, ...updatedFields };
      // Save full state
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...next,
        libraryTrash: trash
      }));
      return next;
    });
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      libraryTrash: trash
    }));
  }, [trash, state]);

  // Actions
  const setActivePageId = (id: string) => updateState({ activePageId: id });
  const setActiveView = (view: AppState['activeView']) => updateState({ activeView: view });
  const setSelectedDocId = (id: string | null) => updateState({ selectedDocId: id });

  const addPage = (name: string, type: Page['type'], category: string) => {
    const newPageId = 'page-' + Math.random().toString(36).substr(2, 9);
    const newPage: Page = {
      id: newPageId,
      name,
      icon: '',
      category,
      banner: '',
      type,
      tasks: type === 'tasks' ? [] : undefined,
      notes: type === 'notes' ? '' : undefined
    };
    updateState({
      pages: [...state.pages, newPage],
      activePageId: newPageId
    });
  };

  const deletePage = (id: string) => {
    const pages = state.pages.filter(p => p.id !== id);
    const activePageId = state.activePageId === id ? 'page-todos' : state.activePageId;
    updateState({ pages, activePageId });
  };

  const updatePage = (id: string, fields: Partial<Page>) => {
    const pages = state.pages.map(p => p.id === id ? { ...p, ...fields } : p);
    updateState({ pages });
  };

  const addTask = (pageId: string, name: string, due: string) => {
    const taskId = 't_' + Math.random().toString(36).substr(2, 9);
    const newTask: Task = { id: taskId, name, due, checked: false };
    const pages = state.pages.map(p => {
      if (p.id === pageId) {
        return { ...p, tasks: [...(p.tasks || []), newTask] };
      }
      return p;
    });
    updateState({ pages });
  };

  const toggleTask = (pageId: string, taskId: string) => {
    const pages = state.pages.map(p => {
      if (p.id === pageId) {
        const tasks = (p.tasks || []).map(t => 
          t.id === taskId ? { ...t, checked: !t.checked } : t
        );
        return { ...p, tasks };
      }
      return p;
    });
    updateState({ pages });
  };

  const deleteTask = (pageId: string, taskId: string) => {
    const pages = state.pages.map(p => {
      if (p.id === pageId) {
        const tasks = (p.tasks || []).filter(t => t.id !== taskId);
        return { ...p, tasks };
      }
      return p;
    });
    updateState({ pages });
  };

  const addHabit = (name: string) => {
    const newHabit: Habit = {
      id: 'h_' + Math.random().toString(36).substr(2, 9),
      name,
      checkedToday: false,
      streak: 0,
      lastChecked: ''
    };
    updateState({ habits: [...state.habits, newHabit] });
  };

  const toggleHabit = (id: string) => {
    const habits = state.habits.map(h => {
      if (h.id === id) {
        const checkedToday = !h.checkedToday;
        const streak = checkedToday ? h.streak + 1 : Math.max(0, h.streak - 1);
        return { 
          ...h, 
          checkedToday, 
          streak,
          lastChecked: checkedToday ? new Date().toISOString().split('T')[0] : ''
        };
      }
      return h;
    });
    updateState({ habits });
  };

  const deleteHabit = (id: string) => {
    updateState({ habits: state.habits.filter(h => h.id !== id) });
  };

  const addGoal = (name: string) => {
    const newGoal: Goal = {
      id: 'g_' + Math.random().toString(36).substr(2, 9),
      name,
      checked: false
    };
    updateState({ todayGoals: [...state.todayGoals, newGoal] });
  };

  const toggleGoal = (id: string) => {
    const todayGoals = state.todayGoals.map(g => 
      g.id === id ? { ...g, checked: !g.checked } : g
    );
    updateState({ todayGoals });
  };

  const deleteGoal = (id: string) => {
    updateState({ todayGoals: state.todayGoals.filter(g => g.id !== id) });
  };

  const addContact = (name: string, stage: string, frequency: string, notes: string) => {
    const newContact: Contact = {
      id: 'crm_' + Math.random().toString(36).substr(2, 9),
      name,
      stage,
      frequency,
      notes,
      lastContact: new Date().toISOString().split('T')[0]
    };
    updateState({ crmContacts: [...state.crmContacts, newContact] });
  };

  const updateContact = (id: string, fields: Partial<Contact>) => {
    const crmContacts = state.crmContacts.map(c => 
      c.id === id ? { ...c, ...fields } : c
    );
    updateState({ crmContacts });
  };

  const deleteContact = (id: string) => {
    updateState({ crmContacts: state.crmContacts.filter(c => c.id !== id) });
  };

  const addSticky = (text: string, color: StickyNote['color']) => {
    const newSticky: StickyNote = {
      id: 's_' + Math.random().toString(36).substr(2, 9),
      text,
      color
    };
    updateState({ stickies: [...state.stickies, newSticky] });
  };

  const updateSticky = (id: string, text: string) => {
    const stickies = state.stickies.map(s => s.id === id ? { ...s, text } : s);
    updateState({ stickies });
  };

  const deleteSticky = (id: string) => {
    updateState({ stickies: state.stickies.filter(s => s.id !== id) });
  };

  const addMoodLog = (mood: string, note: string) => {
    const newLog: MoodLog = {
      date: new Date().toISOString().split('T')[0],
      mood,
      note
    };
    updateState({ moodLogs: [newLog, ...state.moodLogs.filter(l => l.date !== newLog.date)] });
  };

  const updateSettings = (fields: Partial<Settings>) => {
    updateState({ settings: { ...state.settings, ...fields } });
  };

  const updateProfile = (fields: Partial<Profile>) => {
    updateState({ profile: { ...state.profile, ...fields } });
  };

  // Zotero papers metadata support
  const updatePaper = (updatedPaper: Paper) => {
    const library = state.library.map(p => p.id === updatedPaper.id ? updatedPaper : p);
    updateState({ library });
  };

  const addPaperManual = (type: string, targetCollection?: string | null) => {
    const newPaperId = 'p_' + Math.random().toString(36).substr(2, 9);
    const newPaper: Paper = {
      id: newPaperId,
      type,
      title: `Untitled ${type === 'journalArticle' ? 'Journal Article' : 'Book'}`,
      authors: [{ firstName: '', lastName: '' }],
      abstract: '',
      publication: '',
      date: new Date().getFullYear().toString(),
      doi: '',
      url: '',
      pdfPath: '',
      collections: targetCollection ? [targetCollection] : [],
      tags: [],
      related: [],
      notes: [],
      dateAdded: new Date().toISOString(),
      dateModified: new Date().toISOString()
    };
    updateState({ library: [...state.library, newPaper] });
  };

  const addPaperByIdentifier = async (identifier: string, targetCollection?: string | null): Promise<boolean> => {
    const cleanId = identifier.trim();
    const mapped = PREMAPPED_PAPERS[cleanId];
    
    if (mapped) {
      if (state.library.some(p => p.id === cleanId)) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const newPaper: Paper = {
        ...mapped,
        collections: targetCollection ? [targetCollection] : mapped.collections,
        dateAdded: new Date().toISOString(),
        dateModified: new Date().toISOString()
      };
      
      setTrash(prev => prev.filter(id => id !== cleanId));
      updateState({ library: [...state.library, newPaper] });
      return true;
    }
    return false;
  };

  const moveToTrash = (id: string) => {
    setTrash(prev => {
      if (!prev.includes(id)) {
        return [...prev, id];
      }
      return prev;
    });
  };

  const restoreFromTrash = (id: string) => {
    setTrash(prev => prev.filter(item => item !== id));
  };

  const permanentlyDeletePaper = (id: string) => {
    const library = state.library.filter(p => p.id !== id);
    setTrash(prev => prev.filter(item => item !== id));
    updateState({ library });
  };

  const addPaperNote = (paperId: string) => {
    const p = state.library.find(item => item.id === paperId);
    if (!p) return;
    const noteId = 'n_' + Math.random().toString(36).substr(2, 9);
    const newNote: PaperNote = { id: noteId, title: 'New Note', content: '' };
    updatePaper({
      ...p,
      notes: [...(p.notes || []), newNote],
      dateModified: new Date().toISOString()
    });
  };

  const deletePaperNote = (paperId: string, noteId: string) => {
    const p = state.library.find(item => item.id === paperId);
    if (!p) return;
    updatePaper({
      ...p,
      notes: p.notes.filter(n => n.id !== noteId),
      dateModified: new Date().toISOString()
    });
  };

  return (
    <AppContext.Provider value={{
      state,
      setActivePageId,
      setActiveView,
      setSelectedDocId,
      addPage,
      deletePage,
      updatePage,
      addTask,
      toggleTask,
      deleteTask,
      addHabit,
      toggleHabit,
      deleteHabit,
      addGoal,
      toggleGoal,
      deleteGoal,
      addContact,
      updateContact,
      deleteContact,
      addSticky,
      updateSticky,
      deleteSticky,
      addMoodLog,
      updateSettings,
      updateProfile,
      updatePaper,
      addPaperManual,
      addPaperByIdentifier,
      moveToTrash,
      restoreFromTrash,
      permanentlyDeletePaper,
      addPaperNote,
      deletePaperNote,
      trash
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within an AppProvider");
  return context;
};
