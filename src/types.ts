export interface Task {
  id: string;
  name: string;
  due: string;
  checked: boolean;
}

export interface Page {
  id: string;
  name: string;
  icon: string;
  category: string;
  banner: string;
  type: 'tasks' | 'notes' | 'planner';
  tasks?: Task[];
  notes?: string;
}

export interface Author {
  firstName: string;
  lastName: string;
}

export interface PaperNote {
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
  type: string;
  title: string;
  authors: Author[];
  abstract: string;
  publication: string;
  date: string;
  doi: string;
  url: string;
  pdfPath: string;
  collections: string[];
  tags: string[];
  related: string[];
  notes: PaperNote[];
  highlights?: Highlight[];
  dateAdded: string;
  dateModified: string;
  currentPage?: number;
  pageCount?: number;
}

export interface Habit {
  id: string;
  name: string;
  checkedToday: boolean;
  streak: number;
  lastChecked: string;
}

export interface Goal {
  id: string;
  name: string;
  checked: boolean;
}

export interface MoodLog {
  date: string;
  mood: string;
  note: string;
}

export interface Contact {
  id: string;
  name: string;
  stage: string; // Mentor | Recruiter | Professional | etc.
  lastContact: string;
  frequency: string; // weekly | monthly | etc.
  notes: string;
}

export interface Profile {
  name: string;
  bio: string;
  avatarType: 'initials' | 'image' | 'emoji';
  avatarUrl: string;
}

export interface StickyNote {
  id: string;
  text: string;
  color: 'yellow' | 'blue' | 'green' | 'pink';
  x?: number;
  y?: number;
}

export interface Settings {
  pomodoro: boolean;
  stickyNotes: boolean;
  banners: boolean;
  theme: 'dark' | 'light' | 'sepia';
  themeSubtype: 'charcoal' | 'slate' | 'cream' | 'chocolate';
  fontFamily: 'sans' | 'serif' | 'mono';
  accentColor: string;
  weekStart: 'sunday' | 'monday';
  sidebarPosition: 'left' | 'right';
  density: 'cozy' | 'compact';
  glassEffects: boolean;
  sidebarCollapsed: boolean;
  categories: string[];
  homeTitle: string;
  customQuote: string;
  activeWidgets: string[];
  quickActions: { id: string; name: string; type: string }[];
}

export interface AppState {
  activePageId: string;
  activeView: 'tasks' | 'notes' | 'planner';
  selectedDocId: string | null;
  recentIds: string[];
  pages: Page[];
  library: Paper[];
  settings: Settings;
  stickies: StickyNote[];
  habits: Habit[];
  todayGoals: Goal[];
  moodLogs: MoodLog[];
  crmContacts: Contact[];
  productivityActivity: { [key: string]: number };
  profile: Profile;
}
