export interface Author {
  firstName: string;
  lastName: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
}

export interface Highlight {
  id: string;
  page: number;
  text: string;
  color: string;
  rects: { left: number; top: number; width: number; height: number }[];
  date: string;
}

export interface Paper {
  id: string;
  type: string; // e.g., 'journalArticle'
  title: string;
  authors: Author[];
  abstract: string;
  publication: string;
  date: string;
  doi: string;
  url: string;
  pdfPath: string; // local path to PDF
  collections: string[];
  tags: string[];
  related: string[]; // IDs of related papers
  notes: Note[];
  highlights?: Highlight[];
  dateAdded: string;
  dateModified: string;
  currentPage?: number;
  pageCount?: number;
  name?: string; // fallback alias for original library document structure compatibility
}

export interface LibraryState {
  papers: Paper[];
  collections: string[];
  trash: string[]; // list of paper IDs currently in trash
}
