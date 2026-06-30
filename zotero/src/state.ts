import type { LibraryState, Paper } from './types';

const STORAGE_KEY = 'notion-dashboard-data';

// Default fallback papers in case fetch fails
const DEFAULT_FALLBACK_COLLECTIONS = [
  "LLM Alignment",
  "Diffusion & Generative Models",
  "Graph Neural Networks",
  "Multimodal Learning",
  "Efficient Inference & Quantization"
];

export async function loadLibraryState(): Promise<LibraryState> {
  // 1. Try to load existing dashboard data from localStorage
  const rawDashboardData = localStorage.getItem(STORAGE_KEY);
  let dashboardData: any = {};
  
  if (rawDashboardData) {
    try {
      dashboardData = JSON.parse(rawDashboardData);
    } catch (e) {
      console.error("Failed to parse dashboard data from localStorage", e);
    }
  }

  let papers: Paper[] = [];
  let collections: string[] = [];
  let trash: string[] = [];

  // If dashboardData has library papers, load them
  if (dashboardData.library && Array.isArray(dashboardData.library) && dashboardData.library.length > 0) {
    papers = dashboardData.library.map((p: any) => {
      // Ensure compatibility with original name field
      return {
        ...p,
        name: p.name || p.title,
        notes: p.notes || [],
        tags: p.tags || [],
        collections: p.collections || [],
        related: p.related || []
      };
    });
  }

  // Load collections
  if (dashboardData.libraryCollections && Array.isArray(dashboardData.libraryCollections) && dashboardData.libraryCollections.length > 0) {
    collections = dashboardData.libraryCollections;
  } else {
    collections = [...DEFAULT_FALLBACK_COLLECTIONS];
  }

  // Load trash
  if (dashboardData.libraryTrash && Array.isArray(dashboardData.libraryTrash)) {
    trash = dashboardData.libraryTrash;
  }

  // 2. If papers list is empty, fetch from data.json (our single source of truth)
  if (papers.length === 0) {
    try {
      const response = await fetch('./data.json');
      if (response.ok) {
        const dataJson = await response.json();
        if (dataJson.papers && Array.isArray(dataJson.papers)) {
          papers = dataJson.papers.map((p: any) => ({
            ...p,
            name: p.title, // sync name for dashboard stats compatibility
          }));
        }
        if (dataJson.collections && Array.isArray(dataJson.collections)) {
          collections = dataJson.collections;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch data.json, using offline empty array", err);
    }
    
    // Save newly initialized state back
    saveLibraryState(papers, collections, trash);
  }

  return { papers, collections, trash };
}

export function saveLibraryState(papers: Paper[], collections: string[], trash: string[]): void {
  const rawDashboardData = localStorage.getItem(STORAGE_KEY);
  let dashboardData: any = {};
  
  if (rawDashboardData) {
    try {
      dashboardData = JSON.parse(rawDashboardData);
    } catch (e) {
      /* ignore */
    }
  }

  // Sync back to dashboard structure
  dashboardData.library = papers.map(p => ({
    ...p,
    name: p.title, // sync title to name for dashboard compatibility
    currentPage: p.currentPage || 1,
    pageCount: p.pageCount || 1,
    type: p.type || 'journalArticle'
  }));

  dashboardData.libraryCollections = collections;
  dashboardData.libraryTrash = trash;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboardData));
  } catch (err) {
    console.error("Failed to save state to localStorage", err);
  }
}
