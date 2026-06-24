// ============================================================
// Data Model — all state lives here, persisted to localStorage
// ============================================================

const STORAGE_KEY = 'notion-dashboard-data';

// Session-level in-memory cache for loaded files and pages
const pdfDataMap = new Map();
const docPagesCache = new Map();
let pdfRenderMode = 'page'; // 'page' (visual canvas) or 'text' (selectable highlights)
let activeTextLayer = null;

// IndexedDB Helper Functions
const DB_NAME = 'LibraryFilesDB';
const STORE_NAME = 'files';


let currentPromptCallback = null;

function showCustomPrompt(title, fields, callback) {
  const modal = document.getElementById('custom-prompt-modal');
  document.getElementById('prompt-modal-title').textContent = title;
  
  const body = document.getElementById('prompt-modal-body');
  body.innerHTML = '';
  
  fields.forEach(f => {
    let inputHtml = '';
    if (f.type === 'select') {
      let opts = f.options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
      inputHtml = `<select id="prompt-input-${f.id}" class="prompt-input" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--divider); background: var(--bg-hover); color: var(--text-primary); outline: none;">
        ${opts}
      </select>`;
    } else {
      inputHtml = `<input type="text" id="prompt-input-${f.id}" class="prompt-input" placeholder="${escapeHtml(f.placeholder || '')}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--divider); background: transparent; color: var(--text-primary); outline: none;" value="${escapeHtml(f.value || '')}" autocomplete="off">`;
    }
    
    body.innerHTML += `
      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px; display: block;">${escapeHtml(f.label)}</label>
        ${inputHtml}
      </div>
    `;
  });
  
  currentPromptCallback = callback;
  modal.style.display = 'flex';
  
  const firstInput = document.getElementById('prompt-input-' + fields[0].id);
  if (firstInput && firstInput.tagName !== 'SELECT') setTimeout(() => firstInput.focus(), 50);
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('custom-prompt-modal');
  const btnClose = document.getElementById('btn-close-prompt-modal');
  const btnCancel = document.getElementById('btn-prompt-cancel');
  const btnSave = document.getElementById('btn-prompt-save');
  
  const close = () => { modal.style.display = 'none'; currentPromptCallback = null; };
  
  if (btnClose) btnClose.onclick = close;
  if (btnCancel) btnCancel.onclick = close;
  if (btnSave) {
    btnSave.onclick = () => {
      if (currentPromptCallback) {
        const inputs = modal.querySelectorAll('.prompt-input');
        const results = {};
        inputs.forEach(i => {
          const id = i.id.replace('prompt-input-', '');
          results[id] = i.value.trim();
        });
        currentPromptCallback(results);
      }
      close();
    };
  }

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // Ctrl+P / Cmd+P - Fuzzy search palette
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      openFuzzySearchPalette();
    }
    // Ctrl+/ / Cmd+/ - Keyboard shortcuts cheat sheet
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      openShortcutsCheatSheet();
    }
    // Escape closes overlays
    if (e.key === 'Escape') {
      closeSearchPalette();
      closeShortcutsCheatSheet();
      closeKnowledgeGraphModal();
    }
  });
});

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = function(e) {
      resolve(e.target.result);
    };
    request.onerror = function(e) {
      reject(e.target.error);
    };
  });
}

function saveFileToDB(id, arrayBuffer) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(arrayBuffer, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

function getFileFromDB(id) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }).catch(err => {
    console.error("Error fetching file from IndexedDB:", err);
    return null;
  });
}

function deleteFileFromDB(id) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }).catch(err => {
    console.error("Error deleting file from IndexedDB:", err);
  });
}

function hexToRgba(hex, alpha = 0.4) {
  if (!hex) return `rgba(255, 235, 59, ${alpha})`;
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


const DEFAULT_DATA = {
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
      type: 'tasks', // tasks | notes | planner
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

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.activeView = parsed.activeView || 'tasks';
      parsed.library = parsed.library || [];
      
      // Settings Migration
      parsed.settings = parsed.settings || {};
      if (parsed.settings.pomodoro === undefined) parsed.settings.pomodoro = true;
      if (parsed.settings.pomodoroWorkDuration === undefined) parsed.settings.pomodoroWorkDuration = 25;
      if (parsed.settings.pomodoroBreakDuration === undefined) parsed.settings.pomodoroBreakDuration = 5;
      if (parsed.settings.stickyNotes === undefined) parsed.settings.stickyNotes = true;
      if (parsed.settings.banners === undefined) parsed.settings.banners = true;
      if (parsed.settings.theme === undefined) parsed.settings.theme = 'dark';
      if (parsed.settings.themeSubtype === undefined) parsed.settings.themeSubtype = (parsed.settings.theme === 'light' ? 'white' : 'charcoal');
      if (parsed.settings.fontFamily === undefined) parsed.settings.fontFamily = 'sans';
      if (parsed.settings.accentColor === undefined) parsed.settings.accentColor = 'blue';
      if (parsed.settings.weekStart === undefined) parsed.settings.weekStart = 'sunday';
      if (parsed.settings.sidebarPosition === undefined) parsed.settings.sidebarPosition = 'left';
      if (parsed.settings.density === undefined) parsed.settings.density = 'cozy';
      if (parsed.settings.glassEffects === undefined) parsed.settings.glassEffects = false;
      if (parsed.settings.sidebarCollapsed === undefined) parsed.settings.sidebarCollapsed = false;
      if (parsed.settings.splitscreen === undefined) parsed.settings.splitscreen = false;
      if (!parsed.settings.categories) {
        parsed.settings.categories = ['To-dos', 'Notes', 'Journal', 'Personal', 'Work'];
      }
      if (parsed.settings.homeTitle === undefined) parsed.settings.homeTitle = 'Command Center';
      if (parsed.settings.customQuote === undefined) parsed.settings.customQuote = '';
      if (parsed.settings.activeWidgets === undefined) {
        parsed.settings.activeWidgets = ['clock', 'habits', 'goals', 'quote', 'timer', 'reading', 'calendar', 'quick_add'];
      }
      if (parsed.settings.quickActions === undefined) {
        parsed.settings.quickActions = [];
      }
      
      // Stickies Migration
      parsed.stickies = parsed.stickies || [];
      
      // Page Category and Banner Migration
      parsed.pages.forEach(p => {
        if (!p.category) p.category = 'To-dos';
        if (p.banner === undefined) p.banner = '';
      });

      // New features migrations
      parsed.habits = parsed.habits || [
        { id: 'h1', name: 'Read books', checkedToday: false, streak: 3, lastChecked: '' },
        { id: 'h2', name: 'Exercise', checkedToday: false, streak: 5, lastChecked: '' },
        { id: 'h3', name: 'Meditation', checkedToday: false, streak: 2, lastChecked: '' }
      ];
      parsed.todayGoals = parsed.todayGoals || [];
      parsed.moodLogs = parsed.moodLogs || [];
      parsed.crmContacts = parsed.crmContacts || [];
      parsed.profile = parsed.profile || {
        name: 'User Name',
        bio: 'Productivity Mode',
        avatarType: 'initials',
        avatarUrl: ''
      };
      
      return parsed;
    }
  } catch { /* ignore */ }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function updateFavicon() {
  const initial = (data.settings.workspaceName || 'Workspace').charAt(0).toUpperCase();
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  
  const accentColors = {
    blue: '#097fe8',
    green: '#10b981',
    pink: '#ec4899',
    purple: '#8b5cf6',
    yellow: '#f59e0b',
    cyan: '#14b8a6'
  };
  const accentKey = data.settings.accentColor || 'blue';
  ctx.fillStyle = accentColors[accentKey] || '#097fe8';
  ctx.beginPath();
  ctx.arc(16, 16, 16, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, 16, 16);
  
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.getElementsByTagName('head')[0].appendChild(link);
  }
  link.href = canvas.toDataURL('image/x-icon');
}

function updateSidebarProfile() {
  const profileName = document.getElementById('profile-name');
  const profileBio = document.getElementById('profile-bio');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileCard = document.getElementById('sidebar-profile-card');
  
  if (!profileName || !profileBio || !profileAvatar) return;

  const prof = data.profile || { name: 'User Name', bio: 'Productivity Mode', avatarType: 'initials', avatarUrl: '' };
  profileName.textContent = prof.name || 'User Name';
  profileBio.textContent = prof.bio || 'Productivity Mode';

  if (prof.avatarType === 'image' && prof.avatarUrl) {
    profileAvatar.style.backgroundImage = `url(${prof.avatarUrl})`;
    profileAvatar.textContent = '';
  } else {
    profileAvatar.style.backgroundImage = 'none';
    profileAvatar.style.backgroundColor = 'var(--accent-blue)';
    profileAvatar.textContent = (prof.name || 'User Name').charAt(0).toUpperCase();
  }
}

function updateSettingsAvatarPreview() {
  const preview = document.getElementById('settings-avatar-preview');
  if (!preview) return;
  const prof = data.profile || { name: 'User Name', bio: 'Productivity Mode', avatarType: 'initials', avatarUrl: '' };
  
  if (prof.avatarType === 'image' && prof.avatarUrl) {
    preview.style.backgroundImage = `url(${prof.avatarUrl})`;
    preview.textContent = '';
  } else {
    preview.style.backgroundImage = 'none';
    preview.style.backgroundColor = 'var(--accent-blue)';
    preview.textContent = (prof.name || 'User Name').charAt(0).toUpperCase();
  }
}

let data = loadData();

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}


function getBannerHtml(pageOrId) {
  if (!data.settings.banners) return '';
  let banner = '';
  
  if (typeof pageOrId === 'string') {
    if (!data.settings.pseudoBanners) data.settings.pseudoBanners = {};
    banner = data.settings.pseudoBanners[pageOrId] || '';
  } else if (pageOrId) {
    banner = pageOrId.banner || '';
  }

  if (banner) {
    const isCustomImage = banner.startsWith('data:');
    if (isCustomImage) {
      return `
        <div class="page-cover-banner" style="background-image: url('${banner}'); background-size: cover; background-position: center;">
          <div class="banner-actions">
            <button class="banner-action-btn" id="btn-change-cover">Change cover</button>
            <button class="banner-action-btn" id="btn-remove-cover">Remove cover</button>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="page-cover-banner ${banner.toLowerCase()}">
          <div class="banner-actions">
            <button class="banner-action-btn" id="btn-change-cover">Change cover</button>
            <button class="banner-action-btn" id="btn-remove-cover">Remove cover</button>
          </div>
        </div>
      `;
    }
  } else {
    return `
      <div class="page-cover-placeholder">
        <button class="add-cover-btn" id="btn-add-cover">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>
          </svg>Add cover
        </button>
      </div>
    `;
  }
}
function getPage(id) {
  return data.pages.find(p => p.id === id);
}

function getActivePage() {
  return getPage(data.activePageId) || data.pages[0];
}

function pushRecent(pageId) {
  data.recentIds = [pageId, ...data.recentIds.filter(r => r !== pageId)].slice(0, 8);
}

// ============================================================
// Date Utilities (Timed Tasks parsing & formatting)
// ============================================================

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function parseDateString(str) {
  if (!str) return null;
  const cleaned = str.trim();
  if (cleaned === '—') return null;
  
  const normalized = cleaned.replace(/\s+/g, ' ');
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) {
    return d;
  }
  return null;
}

function formatDate(date, timeStr) {
  const m = MONTH_NAMES[date.getMonth()];
  const d = date.getDate();
  const y = date.getFullYear();
  let base = `${m} ${d}, ${y}`;
  if (timeStr) {
    base += ` ${timeStr}`;
  }
  return base;
}

function getTaskTime(dueStr) {
  if (!dueStr || dueStr === '—') return '';
  if (!dueStr.includes(':')) return '';
  const parsed = parseDateString(dueStr);
  if (!parsed) return '';
  
  let hours = parsed.getHours();
  const minutes = parsed.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; 
  const minStr = String(minutes).padStart(2, '0');
  return `${hours}:${minStr} ${ampm}`;
}

// Document Reader Utility Functions

function cleanEpubHtml(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  doc.querySelectorAll('style, link, script').forEach(el => el.remove());
  return doc.body.innerHTML || doc.documentElement.innerHTML;
}

function paginateHtml(htmlString, blocksPerPage = 8) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const children = Array.from(doc.body.children);
  
  if (children.length === 0) {
    return [htmlString || "Empty document."];
  }
  
  const pages = [];
  let currentPageHtml = "";
  let blockCount = 0;
  
  children.forEach(child => {
    currentPageHtml += child.outerHTML;
    blockCount++;
    if (blockCount >= blocksPerPage) {
      pages.push(currentPageHtml);
      currentPageHtml = "";
      blockCount = 0;
    }
  });
  
  if (currentPageHtml.trim()) {
    pages.push(currentPageHtml);
  }
  
  return pages;
}

function highlightTextInContainer(container, text, color) {
  if (!text) return;
  
  const getTextNodes = (node, list) => {
    if (node.nodeType === Node.TEXT_NODE) {
      list.push(node);
    } else {
      for (let child of node.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE && child.classList.contains('highlighted-pdf-text')) {
          continue;
        }
        getTextNodes(child, list);
      }
    }
  };

  let nodes = [];
  getTextNodes(container, nodes);
  let fullText = nodes.map(n => n.nodeValue).join('');
  let index = fullText.toLowerCase().indexOf(text.toLowerCase());
  
  if (index === -1) return;
  
  let startIdx = index;
  let endIdx = index + text.length;
  
  let currentLen = 0;
  let startNodeIdx = -1;
  let startOffset = 0;
  let endNodeIdx = -1;
  let endOffset = 0;
  
  for (let i = 0; i < nodes.length; i++) {
    let nodeLen = nodes[i].nodeValue.length;
    if (startNodeIdx === -1 && currentLen + nodeLen > startIdx) {
      startNodeIdx = i;
      startOffset = startIdx - currentLen;
    }
    if (endNodeIdx === -1 && currentLen + nodeLen >= endIdx) {
      endNodeIdx = i;
      endOffset = endIdx - currentLen;
      break;
    }
    currentLen += nodeLen;
  }
  
  if (startNodeIdx !== -1 && endNodeIdx !== -1) {
    const rgbaColor = hexToRgba(color, 0.4);
    if (startNodeIdx === endNodeIdx) {
      const node = nodes[startNodeIdx];
      const val = node.nodeValue;
      const before = val.substring(0, startOffset);
      const match = val.substring(startOffset, endOffset);
      const after = val.substring(endOffset);
      
      const parent = node.parentNode;
      const span = document.createElement('span');
      span.className = 'highlighted-pdf-text';
      span.style.backgroundColor = rgbaColor;
      span.textContent = match;
      
      if (before) parent.insertBefore(document.createTextNode(before), node);
      parent.insertBefore(span, node);
      if (after) parent.insertBefore(document.createTextNode(after), node);
      parent.removeChild(node);
    } else {
      // Split start node
      const startNode = nodes[startNodeIdx];
      const startVal = startNode.nodeValue;
      const startBefore = startVal.substring(0, startOffset);
      const startMatch = startVal.substring(startOffset);
      const startParent = startNode.parentNode;
      const startSpan = document.createElement('span');
      startSpan.className = 'highlighted-pdf-text';
      startSpan.style.backgroundColor = rgbaColor;
      startSpan.textContent = startMatch;
      if (startBefore) startParent.insertBefore(document.createTextNode(startBefore), startNode);
      startParent.insertBefore(startSpan, startNode);
      startParent.removeChild(startNode);
      
      // Wrap intermediate nodes
      for (let i = startNodeIdx + 1; i < endNodeIdx; i++) {
        const midNode = nodes[i];
        const midParent = midNode.parentNode;
        const midSpan = document.createElement('span');
        midSpan.className = 'highlighted-pdf-text';
        midSpan.style.backgroundColor = rgbaColor;
        midSpan.textContent = midNode.nodeValue;
        midParent.insertBefore(midSpan, midNode);
        midParent.removeChild(midNode);
      }
      
      // Split end node
      const endNode = nodes[endNodeIdx];
      const endVal = endNode.nodeValue;
      const endMatch = endVal.substring(0, endOffset);
      const endAfter = endVal.substring(endOffset);
      const endParent = endNode.parentNode;
      const endSpan = document.createElement('span');
      endSpan.className = 'highlighted-pdf-text';
      endSpan.style.backgroundColor = rgbaColor;
      endSpan.textContent = endMatch;
      endParent.insertBefore(endSpan, endNode);
      if (endAfter) endParent.insertBefore(document.createTextNode(endAfter), endNode);
      endParent.removeChild(endNode);
    }
  }
}


// ============================================================
// Rendering
// ============================================================

const gridIconSVG = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="1" y="1" width="5.5" height="5.5" rx="1"/>
  <rect x="8.5" y="1" width="5.5" height="5.5" rx="1"/>
  <rect x="1" y="8.5" width="5.5" height="5.5" rx="1"/>
  <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1"/>
</svg>`;

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// --- Sidebar ---

const collapsedCategories = new Set(JSON.parse(localStorage.getItem('collapsed-categories') || '[]'));

function saveCollapsedCategories() {
  localStorage.setItem('collapsed-categories', JSON.stringify(Array.from(collapsedCategories)));
}

function renderSidebar(searchQuery = '') {
  const recentsEl = document.getElementById('sidebar-recents');
  const privateEl = document.getElementById('sidebar-private');
  if (!recentsEl || !privateEl) return;

  const query = searchQuery.toLowerCase().trim();

  // Recents
  
  const isRecentsCollapsed = collapsedCategories.has('__recents__');
  recentsEl.innerHTML = '';
  const chev = document.getElementById('recents-chevron');
  if (chev) chev.innerHTML = isRecentsCollapsed ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>' : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
  
  if (!isRecentsCollapsed) {
    data.recentIds.forEach(pid => {
      const page = getPage(pid);
      if (!page) return;
      if (query && !page.name.toLowerCase().includes(query)) return;
      recentsEl.appendChild(makeSidebarItem(page));
    });
  }

  // Private — grouped by category collapsible headers
  privateEl.innerHTML = '';

  const categories = data.settings.categories || ['To-dos', 'Notes', 'Journal', 'Personal', 'Work'];
  const allCategories = [...categories];
  
  // Collect any page categories that aren't in the settings list (e.g. Uncategorized fallback)
  data.pages.forEach(p => {
    const cat = p.category || 'Uncategorized';
    if (!allCategories.includes(cat)) {
      allCategories.push(cat);
    }
  });

  allCategories.forEach(catName => {
    const catPages = data.pages.filter(p => (p.category || 'Uncategorized') === catName);
    if (query) {
      const filtered = catPages.filter(p => p.name.toLowerCase().includes(query));
      if (filtered.length === 0) return;
    }

    const isCollapsed = collapsedCategories.has(catName);
    const headerDiv = document.createElement('div');
    headerDiv.className = 'sidebar-category-header';
    
    const chevronRight = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="chevron"><polyline points="9 18 15 12 9 6"/></svg>`;
    const chevronDown = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="chevron"><polyline points="6 9 12 15 18 9"/></svg>`;
    
    headerDiv.innerHTML = `
      <div class="category-toggle-area">
        <span class="category-chevron">${isCollapsed ? chevronRight : chevronDown}</span>
        <span class="category-title-text">${escapeHtml(catName)}</span>
      </div>
      <div style="display: flex; gap: 4px;">
        <button class="category-add-page-btn" title="Add page to folder">+</button>
        ${catName !== 'Uncategorized' ? `<button class="category-delete-btn" title="Delete folder" data-cat="${escapeHtml(catName)}" style="background: none; border: none; color: var(--text-muted); cursor: pointer;">&times;</button>` : ''}
      </div>
    `;
    
    headerDiv.querySelector('.category-toggle-area').addEventListener('click', (e) => {
      e.stopPropagation();
      if (isCollapsed) {
        collapsedCategories.delete(catName);
      } else {
        collapsedCategories.add(catName);
      }
      saveCollapsedCategories();
      renderSidebar(searchQuery);
    });

    headerDiv.querySelector('.category-add-page-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      addNewPageInCategory(catName);
    });

    const delBtn = headerDiv.querySelector('.category-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete folder "${catName}"? Pages inside will become Uncategorized.`)) {
          data.settings.categories = data.settings.categories.filter(c => c !== catName);
          data.pages.forEach(p => {
            if ((p.category || 'Uncategorized') === catName) p.category = 'Uncategorized';
          });
          saveData();
          renderSidebar(searchQuery);
        }
      });
    }

    privateEl.appendChild(headerDiv);

    if (!isCollapsed) {
      const pageListContainer = document.createElement('div');
      pageListContainer.className = 'category-page-list';
      
      if (catPages.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'sidebar-category-empty';
        emptyDiv.textContent = 'No pages';
        pageListContainer.appendChild(emptyDiv);
      } else {
        catPages.forEach(page => {
          if (query && !page.name.toLowerCase().includes(query)) return;
          pageListContainer.appendChild(makeSidebarItem(page));
        });
      }
      privateEl.appendChild(pageListContainer);
    }
  });

  // Home active indicator
  const navHome = document.getElementById('nav-home');
  if (navHome) {
    navHome.classList.toggle('active', data.activePageId === 'home');
  }

  // Library active indicator
  const navLib = document.getElementById('nav-library');
  if (navLib) {
    navLib.classList.toggle('active', data.activePageId === 'library');
  }

  // Settings active indicator
  const navSettings = document.getElementById('nav-settings');
  if (navSettings) {
    navSettings.classList.toggle('active', data.activePageId === 'settings');
  }
  updateSidebarProfile();
}

async function addNewPageInCategory(categoryName) {
  const pageType = await promptPageType();
  if (!pageType) return;

  const page = {
    id: uid(),
    name: 'Untitled',
    icon: '',
    category: categoryName,
    banner: '',
    type: pageType,
    tasks: [],
    content: pageType === 'notes' ? '' : undefined,
    planner: pageType === 'planner' ? { goals: '', priorities: '' } : undefined,
    planner: pageType === 'planner' ? { goals: '', priorities: '' } : undefined,
  };

  data.pages.push(page);
  pushRecent(page.id);
  data.activePageId = page.id;
  saveData();
  renderSidebar();
  renderPage();

  setTimeout(() => {
    const titleEl = document.querySelector('.page-title');
    if (titleEl) {
      titleEl.focus();
      const range = document.createRange();
      range.selectNodeContents(titleEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, 50);

  showToast(`"${page.name}" created`);
}

function makeSidebarItem(page) {
  const div = document.createElement('div');
  div.className = 'sidebar-item';
  div.draggable = true;
  if (data.activePageId === page.id) div.classList.add('active');
  div.dataset.pageId = page.id;
  
  let iconHtml = '';
  if (page.type === 'tasks') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
  } else if (page.type === 'notes') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
  } else if (page.type === 'planner') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  } else if (page.type === 'kanban') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/></svg>`;
  } else if (page.type === 'flashcards') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/></svg>`;
  } else if (page.type === 'student') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2.5 3 6 3s6-1 6-3v-5"/></svg>`;
  } else if (page.type === 'crm') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  } else if (page.type === 'journal') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
  } else if (page.type === 'productivity') {
    iconHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
  } else {
    let letter = page.name ? page.name.charAt(0).toUpperCase() : 'U';
    iconHtml = `<span style="font-weight:bold; font-size:10px;">${letter}</span>`;
  }

  div.innerHTML = `<span class="item-icon" style="display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.06); border-radius:4px; width:18px; height:18px;">${iconHtml}</span><span class="item-text">${escapeHtml(page.name)}</span>`;
  div.addEventListener('click', () => navigateTo(page.id));
  return div;
}


function waitForEmbedPDF(timeout = 4000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (window.EmbedPDF && typeof window.EmbedPDF.init === 'function') {
        resolve(true);
      } else if (Date.now() - start > timeout) {
        resolve(false);
      } else {
        setTimeout(check, 80);
      }
    };
    check();
  });
}

async function loadAndRenderSelectedDoc() {
  const selectedDoc = (data.library || []).find(d => d.id === data.selectedDocId) || (data.library || [])[0];
  if (!selectedDoc) return;

  if (selectedDoc.type === '.pdf') {
    console.log('[PDF] Waiting for EmbedPDF local bundle to load...');
    const loaded = await waitForEmbedPDF(4000);
    if (loaded && window.EmbedPDF && typeof window.EmbedPDF.init === 'function') {
      console.log('[PDF] Rendering with EmbedPDF (fully offline).');
      triggerEmbedPdfRender(selectedDoc);
    } else {
      console.warn('[PDF] EmbedPDF failed to load.');
      const container = document.getElementById('pdf-view-container');
      if (container) {
        container.innerHTML = '<div style="text-align:center; padding:50px; color:#ff6b6b;">Failed to load EmbedPDF.</div>';
      }
    }
  } else {
    // fallback for docx/epub: they render inline in renderLibraryHtml already via paper-sheet
    // just ensure no error
    const nonPdfContainer = document.getElementById('reader-text-area');
    if (nonPdfContainer) {
      // content already populated in renderLibraryHtml
    }
  }
}

async function triggerEmbedPdfRender(selectedDoc, customContainer = null) {
  const container = customContainer || document.getElementById('pdf-view-container');
  if (!container) return;

  if (!window.EmbedPDF || typeof window.EmbedPDF.init !== 'function') {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:var(--text-muted);">Waiting for EmbedPDF...</div>';
    const loaded = await waitForEmbedPDF(4000);
    if (!loaded || !window.EmbedPDF || typeof window.EmbedPDF.init !== 'function') {
      container.innerHTML = '<div style="text-align:center; padding:50px; color:#ff6b6b;">Failed to load EmbedPDF.</div>';
      return;
    }
  }

  container.innerHTML = '<div style="text-align:center; padding:50px; color:var(--text-muted);">Loading PDF with EmbedPDF...</div>';

  getFileFromDB(selectedDoc.id).then(buffer => {
    if (!buffer) {
      container.innerHTML = '<div style="text-align:center; padding:50px; color:var(--text-muted);">Document data not found.</div>';
      return;
    }

    const blob = new Blob([new Uint8Array(buffer)], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.background = 'transparent';
    container.style.height = '480px';

    try {
      const startPage = Math.max(1, selectedDoc.currentPage || 1);

      const viewer = window.EmbedPDF.init({
        type: 'container',
        target: container,
        src: blobUrl,
        // local wasm for fully offline operation
        wasmUrl: window.getAssetUrl('lib/pdfium.wasm'),
        fontFallback: null,
        fonts: {
          ui: {
            family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            stylesheetUrl: null
          },
          signature: null
        },
        stamp: { manifests: [] },
        disabledCategories: ['document-open', 'panel-sidebar'],
        theme: {
          preference: 'dark',
          dark: {
            accent: {
              primary: '#097fe8',
              primaryHover: '#0a6cbd',
              primaryActive: '#085fa4',
              primaryForeground: '#ffffff'
            },
            background: {
              app: '#191919',
              surface: '#252525',
              surfaceAlt: '#1e1e1e',
              elevated: '#2c2c2c',
              input: 'rgba(255, 255, 255, 0.04)'
            },
            foreground: {
              primary: '#ffffff',
              secondary: '#8a8a8a',
              muted: '#666666'
            },
            border: {
              default: 'rgba(255, 255, 255, 0.06)',
              subtle: 'rgba(255, 255, 255, 0.04)'
            }
          }
        },
        documentManager: {
          initialDocuments: [{ url: blobUrl }],
          startPage: startPage
        }
      });

      container._embedPdfViewer = viewer;
      container._embedPdfBlobUrl = blobUrl;

      setTimeout(() => {
        if (!selectedDoc.pageCount || selectedDoc.pageCount < 1) {
          selectedDoc.pageCount = (viewer.numPages || (viewer.getNumPages && viewer.getNumPages()) || 1);
          saveData();
        }
        const total = selectedDoc.pageCount || 1;
        const isSplit = container.id === 'split-pdf-view-container';
        const btnPrev = document.getElementById(isSplit ? 'btn-split-prev' : 'btn-reader-prev');
        const btnNext = document.getElementById(isSplit ? 'btn-split-next' : 'btn-reader-next');
        const btnFs = document.getElementById(isSplit ? 'btn-split-fullscreen' : 'btn-reader-fullscreen');

        if (btnPrev) btnPrev.disabled = (selectedDoc.currentPage || 1) <= 1;
        if (btnNext) btnNext.disabled = (selectedDoc.currentPage || 1) >= total;
        if (btnFs) btnFs.style.display = 'inline-block';

        // Re-apply the dashboard's existing per-page highlights as overlay (preserves the existing storage format)
        // Note: EmbedPDF has its own text layer; this overlay may be limited.
        const pageHighlights = (selectedDoc.highlights || []).filter(h => h.page === (selectedDoc.currentPage || 1));
        pageHighlights.forEach(h => highlightTextInContainer(container, h.text, h.color));
      }, 650);

      // Hook used by the existing nav buttons (prev/next in bindLibraryEvents + the multipage _pdfRenderFn logic)
      // Re-init EmbedPDF for the new currentPage (avoids full outer renderPage which destroys the library layout)
      container._pdfRenderFn = () => {
        if (container._embedPdfBlobUrl) {
          URL.revokeObjectURL(container._embedPdfBlobUrl);
          container._embedPdfBlobUrl = null;
        }
        // currentPage was already updated + saved by the caller (btn onclick)
        // Re-render just the PDF area using EmbedPDF path again
        if (window.EmbedPDF && typeof window.EmbedPDF.init === 'function') {
          triggerEmbedPdfRender(selectedDoc, container);
        } else {
          container.innerHTML = '<div style="text-align:center; padding:50px; color:#ff6b6b;">Failed to load EmbedPDF.</div>';
        }
      };

    } catch (err) {
      console.error('[EmbedPDF] init error', err);
      container.innerHTML = '<div style="color:#ff6b6b;text-align:center;padding:40px;">EmbedPDF error: ' + (err.message || err) + '</div>';
    }
  }).catch(err => {
    console.error(err);
    container.innerHTML = '<div style="text-align:center; padding:50px; color:var(--text-muted);">Failed to load from storage.</div>';
  });
}

// ============================================================
// ============================================================

// ============================================================
// Planner Page Type
// ============================================================

function renderPage() {
  updateFavicon();
  const container = document.getElementById('page-content');
  if (!container) return;

  if (window.innerWidth <= 768 && !data.settings.sidebarCollapsed) {
    data.settings.sidebarCollapsed = true;
    saveData();
    applySidebarState();
  }

  // Handle Home rendering separately
  if (data.activePageId === 'home') {
    document.getElementById('breadcrumb-name').textContent = 'Home';
    document.title = 'Home — Dashboard';
    container.innerHTML = renderHomeHtml();
    bindHomeEvents();
    return;
  }

  // Handle Library rendering separately
  if (data.activePageId === 'library') {
    document.getElementById('breadcrumb-name').textContent = 'Library';
    document.title = 'Library — Dashboard';
    container.innerHTML = renderLibraryHtml();
    bindLibraryEvents();
    
    // Load and render doc content
    loadAndRenderSelectedDoc();
    return;
  }

  // Handle Settings rendering separately
  if (data.activePageId === 'settings') {
    document.getElementById('breadcrumb-name').textContent = 'Settings';
    document.title = 'Settings — Dashboard';
    container.innerHTML = renderSettingsHtml();
    bindSettingsEvents();
    return;
  }

  const isPseudo = ['library', 'settings', 'home'].includes(data.activePageId);
  const page = getActivePage();
  if (!page && !isPseudo) return;

  document.getElementById('breadcrumb-name').textContent = page.name;
  document.title = `${page.name} — Dashboard`;

  const pageType = page.type || 'tasks';

  // Check if there's a linked document to this page
  const linkedDoc = (data.library || []).find(d => d.linkedPageId === page.id);
  const pageBadge = linkedDoc ? `
    <div class="page-link-badge" data-doc-id="${linkedDoc.id}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      Linked Document: <strong>${escapeHtml(linkedDoc.name)}</strong>
    </div>
  ` : '';

  let bannerHtml = getBannerHtml(page);

  // Render different content based on page type
  let contentHtml = '';

  if (pageType === 'tasks') {
    contentHtml = `
      <div class="view-tabs">
        <button class="view-tab" id="tab-tasks">
          <span class="tab-icon"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="1" width="5" height="5" rx="0.8"/><rect x="8" y="1" width="5" height="5" rx="0.8"/>
            <rect x="1" y="8" width="5" height="5" rx="0.8"/><rect x="8" y="8" width="5" height="5" rx="0.8"/>
          </svg></span>
          Tasks
        </button>
        <button class="view-tab" id="tab-calendar">
          <span class="tab-icon"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="2" width="12" height="10" rx="1.5"/><line x1="1" y1="5" x2="13" y2="5"/>
            <line x1="4" y1="1" x2="4" y2="3.5"/><line x1="9" y1="1" x2="9" y2="3.5"/>
          </svg></span>
          Calendar
        </button>
      </div>

      <div class="table-toolbar">
        <div class="toolbar-left">
          <button class="toolbar-btn" id="btn-table-search" title="Search"><svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="4"/><line x1="9.5" y1="9.5" x2="13" y2="13"/></svg></button>
          <div class="table-search-box" id="table-search-container" style="display: none; margin-left: 8px;">
            <input type="text" id="table-search-input" placeholder="Filter tasks..." autocomplete="off">
          </div>
        </div>
        <div class="toolbar-right">
          <div class="new-btn-wrapper" id="new-btn-wrapper">
            <button class="new-btn" id="btn-new-main">
              <span class="new-btn-text">New</span>
              <span class="new-btn-divider"></span>
              <span class="new-btn-caret" id="btn-new-caret">▾</span>
            </button>
          </div>
        </div>
      </div>

      <table class="task-table" id="task-table">
        <thead>
          <tr>
            <th class="col-drag"></th>
            <th class="col-check"></th>
            <th class="col-task">
              <div class="th-inner">
                <span class="th-icon"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
                  <line x1="1" y1="3" x2="12" y2="3"/><line x1="1" y1="6.5" x2="9" y2="6.5"/><line x1="1" y1="10" x2="12" y2="10"/>
                </svg></span>
                Task name
              </div>
            </th>
            <th class="col-due">
              <div class="th-inner">
                <span class="th-icon"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="1" y="2" width="11" height="9.5" rx="1.5"/><line x1="1" y1="5" x2="12" y2="5"/>
                  <line x1="4" y1="0.8" x2="4" y2="3.5"/><line x1="9" y1="0.8" x2="9" y2="3.5"/>
                </svg></span>
                Due
              </div>
            </th>
          </tr>
        </thead>
        <tbody id="task-tbody"></tbody>
      </table>

      <div id="calendar-view-container" style="display: none;"></div>
    `;
  } 
  else if (pageType === 'notes') {
    const backlinks = (typeof getBacklinks === 'function') ? getBacklinks(page) : [];
    contentHtml = `
      <div style="max-width: 720px; margin: 0 auto;">
        <div class="page-breadcrumb" style="margin-bottom: 20px;">
          <span>Notes</span>
        </div>
        
        <div class="rich-editor-container">
          <div class="rich-editor-toolbar">
            <button class="toolbar-btn" data-command="bold" title="Bold (Ctrl+B)">
              <strong>B</strong>
            </button>
            <button class="toolbar-btn" data-command="italic" title="Italic (Ctrl+I)">
              <em>I</em>
            </button>
            <button class="toolbar-btn" data-command="underline" title="Underline (Ctrl+U)">
              <u>U</u>
            </button>
            <button class="toolbar-btn" data-command="strikeThrough" title="Strikethrough">
              <s>S</s>
            </button>
            <div class="toolbar-divider"></div>
            <button class="toolbar-btn" data-command="formatBlock" data-value="h1" title="Heading 1">
              H1
            </button>
            <button class="toolbar-btn" data-command="formatBlock" data-value="h2" title="Heading 2">
              H2
            </button>
            <button class="toolbar-btn" data-command="formatBlock" data-value="p" title="Paragraph">
              P
            </button>
            <div class="toolbar-divider"></div>
            <button class="toolbar-btn" data-command="insertUnorderedList" title="Bullet List">
              &bull; List
            </button>
            <button class="toolbar-btn" data-command="insertOrderedList" title="Numbered List">
              1. List
            </button>
            <button class="toolbar-btn" data-command="formatBlock" data-value="blockquote" title="Quote">
              &ldquo;&rdquo;
            </button>
            <div class="toolbar-divider"></div>
            <button class="toolbar-btn" data-command="removeFormat" title="Clear Formatting">
              Clear
            </button>
            <div class="toolbar-divider"></div>
            <button class="toolbar-btn" id="btn-insert-image" title="Insert Image Attachment">
              🖼️ Image
            </button>
          </div>
          <div id="notes-rich-editor" contenteditable="true" placeholder="Start typing your notes here...">
            ${page.content || ''}
          </div>
        </div>

        <div class="backlinks-section" style="margin-top: 40px; border-top: 1px solid var(--border-input); padding-top: 20px;">
          <h3 style="font-size: 15px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; color: var(--text-primary);">
            <span>🔗 References (Backlinks)</span>
            <span style="font-size: 11px; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 10px; color: var(--text-muted);">${backlinks.length}</span>
          </h3>
          ${backlinks.length === 0 ? `
            <div style="font-size: 12px; color: var(--text-muted);">No notes link to this note. Use <code>[[${escapeHtml(page.name)}]]</code> inside other notes to link them.</div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${backlinks.map(p => `
                <div class="backlink-item" data-page-id="${p.id}" style="cursor: pointer; padding: 10px 14px; background: rgba(255,255,255,0.01); border: 1px solid var(--border-input); border-radius: 6px; font-size: 13px; transition: background 0.2s;">
                  <strong style="color: var(--accent-blue);">${escapeHtml(p.name)}</strong>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.4;">
                    ${escapeHtml(p.content.replace(/<[^>]*>/g, '').substring(0, 150))}
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  } 
  else if (pageType === 'planner') {
    contentHtml = `
      <div style="max-width: 720px; margin: 0 auto;">
        <div style="margin-bottom: 32px;">
          <h2 style="font-size: 28px; margin-bottom: 8px;">Weekly Planner</h2>
          <p style="color: var(--text-muted);">Plan your week and set goals</p>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
          <div>
            <h4 style="margin-bottom: 12px; color: var(--text-section);">This Week's Goals</h4>
            <textarea id="planner-goals" style="width:100%; height:120px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:12px; color:white; resize:vertical;" placeholder="What do you want to achieve this week?"></textarea>
          </div>
          <div>
            <h4 style="margin-bottom: 12px; color: var(--text-section);">Key Priorities</h4>
            <textarea id="planner-priorities" style="width:100%; height:120px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:12px; color:white; resize:vertical;" placeholder="Top 3 priorities"></textarea>
          </div>
        </div>
      </div>
    `;
  }
  else if (pageType === 'kanban') {
    contentHtml = renderKanbanHtml(page);
  }
  else if (pageType === 'flashcards') {
    contentHtml = renderFlashcardsHtml(page);
  }
  else if (pageType === 'student') {
    contentHtml = renderStudentHtml(page);
  }
  else if (pageType === 'crm') {
    contentHtml = renderCrmHtml(page);
  }
  else if (pageType === 'journal') {
    contentHtml = renderJournalHtml(page);
  }
  else if (pageType === 'productivity') {
    contentHtml = renderProductivityHtml(page);
  }

  container.innerHTML = `
    ${bannerHtml}
    <div class="page-breadcrumb">
      <span>${escapeHtml(page.name)}</span>
    </div>

    <div class="page-title-row">
      <span class="page-title-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span>
      <h1 class="page-title" contenteditable="true" spellcheck="false">${escapeHtml(page.name)}</h1>
    </div>
    ${pageBadge}
    ${contentHtml}
  `;

  // Bind page-type specific events
  if (pageType === 'notes') {
    const editor = document.getElementById('notes-rich-editor');
    if (editor) {
      setupWikiLinkAutocomplete(editor, page);
      // Save content on input
      editor.addEventListener('input', () => {
        page.content = editor.innerHTML;
        saveData();
      });

      // Handle formatting buttons
      document.querySelectorAll('.rich-editor-toolbar .toolbar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const command = btn.dataset.command;
          const value = btn.dataset.value || null;
          
          if (command === 'formatBlock') {
            document.execCommand(command, false, `<${value}>`);
          } else {
            document.execCommand(command, false, value);
          }
          editor.focus();
          
          // Re-save content immediately
          page.content = editor.innerHTML;
          saveData();
        });
      });

      // Handle paste event: clean formatting to avoid external style issues
      editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.originalEvent || e).clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
        
        // Re-save content immediately
        page.content = editor.innerHTML;
        saveData();
      });

      // Track selection state to highlight active toolbar buttons
      const updateToolbarActiveStates = () => {
        document.querySelectorAll('.rich-editor-toolbar .toolbar-btn').forEach(btn => {
          const command = btn.dataset.command;
          if (command && command !== 'formatBlock' && command !== 'removeFormat') {
            try {
              const active = document.queryCommandState(command);
              btn.classList.toggle('active', active);
            } catch (err) {}
          }
        });
      };
      
      editor.addEventListener('keyup', updateToolbarActiveStates);
      editor.addEventListener('click', updateToolbarActiveStates);
      
      // Auto-cleanup listener when editor leaves DOM
      const selectionListener = () => {
        if (!document.getElementById('notes-rich-editor')) {
          document.removeEventListener('selectionchange', selectionListener);
          return;
        }
        updateToolbarActiveStates();
      };
      document.addEventListener('selectionchange', selectionListener);

      // Backlink item clicks to navigate
      document.querySelectorAll('.backlink-item').forEach(item => {
        item.onclick = () => {
          const pId = item.dataset.pageId;
          if (pId) navigateTo(pId);
        };
      });

      // Insert image button listener
      const insertImgBtn = document.getElementById('btn-insert-image');
      if (insertImgBtn) {
        insertImgBtn.onclick = () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = () => {
            if (input.files && input.files[0]) {
              const file = input.files[0];
              const reader = new FileReader();
              reader.onload = (event) => {
                document.execCommand('insertImage', false, event.target.result);
                page.content = editor.innerHTML;
                saveData();
              };
              reader.readAsDataURL(file);
            }
          };
          input.click();
        };
      }

      // Drag & Drop image listener
      editor.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
        }
      });
      editor.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          const file = files[0];
          if (file.type.startsWith('image/')) {
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target.result;
              let range;
              if (document.caretRangeFromPoint) {
                range = document.caretRangeFromPoint(e.clientX, e.clientY);
              } else if (e.rangeParent) {
                range = document.createRange();
                range.setStart(e.rangeParent, e.rangeOffset);
              }
              if (range) {
                const img = document.createElement('img');
                img.src = base64;
                img.style.maxWidth = '100%';
                img.style.borderRadius = '8px';
                img.style.margin = '10px 0';
                range.insertNode(img);
                
                page.content = editor.innerHTML;
                saveData();
              }
            };
            reader.readAsDataURL(file);
          }
        }
      });

      // Wiki-links click to navigate
      editor.addEventListener('click', (e) => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        if (node.nodeType !== Node.TEXT_NODE) return;
        const text = node.textContent;
        const offset = range.startOffset;
        
        const startIdx = text.lastIndexOf('[[', offset);
        const endIdx = text.indexOf(']]', offset);
        if (startIdx !== -1 && endIdx !== -1 && startIdx < offset && offset <= endIdx + 2) {
          const pageName = text.substring(startIdx + 2, endIdx).trim();
          const targetPage = data.pages.find(p => p.name.toLowerCase() === pageName.toLowerCase());
          if (targetPage) {
            e.preventDefault();
            navigateTo(targetPage.id);
          } else {
            showToast(`Page "${pageName}" not found. Double click to create it!`, 3000);
          }
        }
      });

      // Wiki-links double click to create page
      editor.addEventListener('dblclick', (e) => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        if (node.nodeType !== Node.TEXT_NODE) return;
        const text = node.textContent;
        const offset = range.startOffset;
        
        const startIdx = text.lastIndexOf('[[', offset);
        const endIdx = text.indexOf(']]', offset);
        if (startIdx !== -1 && endIdx !== -1 && startIdx < offset && offset <= endIdx + 2) {
          const pageName = text.substring(startIdx + 2, endIdx).trim();
          const targetPage = data.pages.find(p => p.name.toLowerCase() === pageName.toLowerCase());
          if (!targetPage) {
            e.preventDefault();
            const newPage = {
              id: 'page-' + uid(),
              name: pageName,
              category: page.category || 'Notes',
              type: 'notes',
              content: '',
              banner: ''
            };
            data.pages.push(newPage);
            data.recentIds.unshift(newPage.id);
            saveData();
            renderSidebar();
            navigateTo(newPage.id);
            showToast(`Created page: ${pageName}`);
          }
        }
      });
    }
  }

  

  if (pageType === 'planner') {
    bindPlannerEvents(page);
  }

  if (pageType === 'kanban') {
    bindKanbanEvents(page);
  }
  if (pageType === 'flashcards') {
    bindFlashcardEvents(page);
  }
  if (pageType === 'student') {
    bindStudentEvents(page);
  }
  if (pageType === 'crm') {
    bindCrmEvents(page);
  }
  if (pageType === 'journal') {
    bindJournalEvents(page);
  }
  if (pageType === 'productivity') {
    bindProductivityEvents(page);
  }

  if (pageType === 'tasks') {
    renderActiveView();
  }

  bindPageEvents();
}

function bindPlannerEvents(page) {
  const container = document.getElementById('page-content');
  if (!container) return;

  const addBtn = document.getElementById('btn-add-planner-block');
  if (addBtn) {
    addBtn.onclick = () => {
      if (!page.plannerBlocks) page.plannerBlocks = [];
      page.plannerBlocks.push({ id: uid(), title: "New Block", content: "" });
      saveData();
      renderPage();
    };
  }

  container.querySelectorAll('.planner-title').forEach(el => {
    el.onblur = () => {
      const id = el.dataset.id;
      const block = page.plannerBlocks.find(b => b.id === id);
      if (block) {
        block.title = el.textContent.trim() || 'Untitled';
        saveData();
      }
    };
    el.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } };
  });

  container.querySelectorAll('.planner-content').forEach(ta => {
    ta.oninput = () => {
      const id = ta.dataset.id;
      const block = page.plannerBlocks.find(b => b.id === id);
      if (block) {
        block.content = ta.value;
        saveData();
      }
    };
  });

  container.querySelectorAll('.planner-delete-btn').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      if (confirm('Delete this block?')) {
        page.plannerBlocks = page.plannerBlocks.filter(b => b.id !== id);
        saveData();
        renderPage();
      }
    };
  });
}


function renderActiveView() {
  const page = getActivePage();
  if (!page) return;

  const tasksTab = document.getElementById('tab-tasks');
  const calendarTab = document.getElementById('tab-calendar');
  const toolbar = document.querySelector('.table-toolbar');
  const table = document.getElementById('task-table');
  const calContainer = document.getElementById('calendar-view-container');

  if (!tasksTab || !calendarTab || !toolbar || !table || !calContainer) return;

  if (data.activeView === 'calendar') {
    tasksTab.classList.remove('active');
    calendarTab.classList.add('active');
    toolbar.style.display = 'none';
    table.style.display = 'none';
    calContainer.style.display = 'block';
    renderCalendar();
  } else {
    tasksTab.classList.add('active');
    calendarTab.classList.remove('active');
    toolbar.style.display = 'flex';
    table.style.display = 'table';
    calContainer.style.display = 'none';
    renderTasks();
  }
}

function renderTasks(searchQuery = '') {
  const page = getActivePage();
  const tbody = document.getElementById('task-tbody');
  if (!tbody || !page) return;

  tbody.innerHTML = '';

  const query = searchQuery.toLowerCase().trim();
  const filteredTasks = page.tasks.filter(t => t.name.toLowerCase().includes(query));

  filteredTasks.forEach((task) => {
    const realIdx = page.tasks.indexOf(task);
    
    // Check if there is a linked document to this task (replacing emoji with paperclip SVG)
    const linkedDoc = (data.library || []).find(d => d.linkedTaskId === task.id);
    const paperclip = linkedDoc ? `
      <span class="task-link-badge" title="Linked to document: ${escapeHtml(linkedDoc.name)}" data-doc-id="${linkedDoc.id}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
        </svg>
      </span>
    ` : '';

    const tr = document.createElement('tr');
    tr.dataset.taskIdx = realIdx;
    tr.innerHTML = `
      <td><span class="drag-handle"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg></span></td>
      <td>
        <div class="task-checkbox${task.checked ? ' checked' : ''}">
          <svg viewBox="0 0 10 10" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1.5,5.5 4,8 8.5,2.5"/>
          </svg>
        </div>
      </td>
      <td>
        <div class="task-name-cell">
          <span class="task-name-text${task.checked ? ' completed' : ''}" contenteditable="true" spellcheck="false">${escapeHtml(task.name)}</span>
          ${paperclip}
        </div>
      </td>
      <td><span class="due-date" contenteditable="true" spellcheck="false">${escapeHtml(task.due || '')}</span></td>
    `;
    tbody.appendChild(tr);
  });

  // "+ New task" row
  const newRow = document.createElement('tr');
  newRow.className = 'new-task-row';
  newRow.innerHTML = `<td></td><td></td><td colspan="2"><div class="new-task-cell"><span>+</span><span>New task</span></div></td>`;
  tbody.appendChild(newRow);
}

// ============================================================
// Calendar Logic
// ============================================================

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

function renderCalendar() {
  const page = getActivePage();
  const container = document.getElementById('calendar-view-container');
  if (!container || !page) return;

  const date = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevLastDay = new Date(currentYear, currentMonth, 0).getDate();
  const monthName = date.toLocaleString('default', { month: 'long' });

  const weekStart = data.settings.weekStart || 'sunday';
  let firstDayIndex = date.getDay();
  let weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  if (weekStart === 'monday') {
    firstDayIndex = (firstDayIndex + 6) % 7;
    weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  }

  const weekdayHeaders = weekdays.map(day => `<div class="calendar-weekday">${day}</div>`).join('');

  let cellsHtml = '';

  // Previous month padding
  for (let i = firstDayIndex; i > 0; i--) {
    const d = prevLastDay - i + 1;
    const pm = currentMonth === 0 ? 11 : currentMonth - 1;
    const py = currentMonth === 0 ? currentYear - 1 : currentYear;
    cellsHtml += `
      <div class="calendar-day-cell other-month" data-date="${py}-${String(pm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}">
        <div class="calendar-day-header">
          <span class="calendar-day-number">${d}</span>
        </div>
        <div class="calendar-tasks-list"></div>
      </div>
    `;
  }

  const today = new Date();

  // Current month cells
  for (let d = 1; d <= lastDay; d++) {
    const isToday = today.getDate() === d && today.getMonth() === currentMonth && today.getFullYear() === currentYear;
    const formattedDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    const dayTasks = page.tasks.filter(task => {
      if (!task.due || task.due === '—') return false;
      const parsed = parseDateString(task.due);
      if (!parsed) return false;
      return parsed.getDate() === d && parsed.getMonth() === currentMonth && parsed.getFullYear() === currentYear;
    });

    dayTasks.sort((a, b) => {
      const ta = parseDateString(a.due);
      const tb = parseDateString(b.due);
      if (ta && tb) return ta.getTime() - tb.getTime();
      return 0;
    });

    let tasksHtml = '';
    dayTasks.forEach(task => {
      const timeStr = getTaskTime(task.due);
      const timeBadge = timeStr ? `<span class="calendar-task-time">${timeStr}</span>` : '';
      tasksHtml += `
        <div class="calendar-task-item${task.checked ? ' completed' : ''}" data-task-id="${task.id}">
          ${timeBadge}
          <span class="calendar-task-name">${escapeHtml(task.name || 'Untitled')}</span>
        </div>
      `;
    });

    cellsHtml += `
      <div class="calendar-day-cell${isToday ? ' today' : ''}" data-date="${formattedDate}">
        <div class="calendar-day-header">
          <span class="calendar-day-number">${d}</span>
          <button class="calendar-day-add-btn" title="Add task">+</button>
        </div>
        <div class="calendar-tasks-list">
          ${tasksHtml}
        </div>
      </div>
    `;
  }

  // Next month padding
  const totalCells = firstDayIndex + lastDay;
  const nextMonthPadding = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= nextMonthPadding; i++) {
    const nm = currentMonth === 11 ? 0 : currentMonth + 1;
    const ny = currentMonth === 11 ? currentYear + 1 : currentYear;
    cellsHtml += `
      <div class="calendar-day-cell other-month" data-date="${ny}-${String(nm+1).padStart(2,'0')}-${String(i).padStart(2,'0')}">
        <div class="calendar-day-header">
          <span class="calendar-day-number">${i}</span>
        </div>
        <div class="calendar-tasks-list"></div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="calendar-view">
      <div class="calendar-header">
        <div class="calendar-title-info">
          <button class="calendar-nav-btn" id="btn-cal-prev">◀</button>
          <h2 class="calendar-month-title">${monthName} ${currentYear}</h2>
          <button class="calendar-nav-btn" id="btn-cal-next">▶</button>
        </div>
        <div class="calendar-header-actions">
          <button class="calendar-today-btn" id="btn-cal-today">Today</button>
        </div>
      </div>
      <div class="calendar-grid">
        ${weekdayHeaders}
        ${cellsHtml}
      </div>
    </div>
  `;

  // Bind calendar event listeners
  document.getElementById('btn-cal-prev').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar();
  });

  document.getElementById('btn-cal-next').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar();
  });

  document.getElementById('btn-cal-today').addEventListener('click', () => {
    currentYear = new Date().getFullYear();
    currentMonth = new Date().getMonth();
    renderCalendar();
  });

  // Click on a calendar task item
  container.querySelectorAll('.calendar-task-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = item.dataset.taskId;
      const taskIdx = page.tasks.findIndex(t => t.id === taskId);
      if (taskIdx !== -1) {
        openTaskModal(page.tasks[taskIdx], page.id, taskIdx);
      }
    });
  });

  // Click "+" button in cell
  container.querySelectorAll('.calendar-day-add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cell = btn.closest('.calendar-day-cell');
      const cellDateStr = cell.dataset.date;
      const dateParts = cellDateStr.split('-');
      const targetDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
      
      const newTask = {
        id: uid(),
        name: '',
        due: formatDate(targetDate, ''),
        checked: false
      };
      
      openTaskModal(newTask, page.id, -1);
    });
  });

  // Double click cell empty area
  container.querySelectorAll('.calendar-day-cell').forEach(cell => {
    cell.addEventListener('dblclick', (e) => {
      if (e.target.closest('.calendar-task-item') || e.target.closest('.calendar-day-add-btn')) return;
      
      const cellDateStr = cell.dataset.date;
      const dateParts = cellDateStr.split('-');
      const targetDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
      
      const newTask = {
        id: uid(),
        name: '',
        due: formatDate(targetDate, ''),
        checked: false
      };
      
      openTaskModal(newTask, page.id, -1);
    });
  });
}

// ============================================================
// Task Modal Logic (Timed tasks creation & updating)
// ============================================================

let editingTask = null;

function openTaskModal(task, pageId, taskIdx) {
  editingTask = { task, pageId, taskIdx };
  
  const modal = document.getElementById('task-modal');
  const title = document.getElementById('modal-title');
  const nameInput = document.getElementById('modal-task-name');
  const dateInput = document.getElementById('modal-task-date');
  const timeInput = document.getElementById('modal-task-time');

  if (!modal || !nameInput || !dateInput || !timeInput) return;

  title.textContent = task.name ? 'Edit Task' : 'New Task';
  nameInput.value = task.name || '';
  
  const parsed = parseDateString(task.due);
  if (parsed) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    dateInput.value = `${y}-${m}-${d}`;

    if (task.due.includes(':')) {
      const hh = String(parsed.getHours()).padStart(2, '0');
      const mm = String(parsed.getMinutes()).padStart(2, '0');
      timeInput.value = `${hh}:${mm}`;
    } else {
      timeInput.value = '';
    }
  } else {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${y}-${m}-${d}`;
    timeInput.value = '';
  }

  modal.style.display = 'flex';
  nameInput.focus();
}

function closeTaskModal() {
  const modal = document.getElementById('task-modal');
  if (modal) modal.style.display = 'none';
  editingTask = null;
}

function saveTaskModal() {
  if (!editingTask) return;
  const nameInput = document.getElementById('modal-task-name');
  const dateInput = document.getElementById('modal-task-date');
  const timeInput = document.getElementById('modal-task-time');

  if (!nameInput || !dateInput || !timeInput) return;

  const newName = nameInput.value.trim();
  if (!newName) {
    showToast('Task name cannot be empty');
    return;
  }

  const rawDate = dateInput.value;
  const rawTime = timeInput.value;
  
  

  
  let newDue = '—';
  if (rawDate) {
    const dateParts = rawDate.split('-');
    const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
    let timeStr = '';
    if (rawTime) {
      const timeParts = rawTime.split(':');
      dateObj.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]));
      let hours = dateObj.getHours();
      const minutes = dateObj.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minStr = String(minutes).padStart(2, '0');
      timeStr = `${hours}:${minStr} ${ampm}`;
    }
    newDue = formatDate(dateObj, timeStr);
  }


  const { task, pageId, taskIdx } = editingTask;
  const page = getPage(pageId);
  if (!page) return;

  task.name = newName;
  task.due = newDue;

  if (taskIdx === -1) {
    page.tasks.push(task);
  }

  saveData();
  closeTaskModal();
  renderActiveView();
}

// ============================================================
// Library Logic (Reading, notes, highlighting, linking)
// ============================================================

function renderLibraryHtml() {
  const docs = data.library || [];
  const selectedDoc = docs.find(d => d.id === data.selectedDocId) || docs[0];
  
  let docsListHtml = '';
  if (docs.length === 0) {
    docsListHtml = '<div class="no-docs-text" style="color: var(--text-section); font-size: 13px; text-align: center; margin-top: 20px;">No documents uploaded yet.</div>';
  } else {
    docs.forEach(doc => {
      const isSelected = selectedDoc && doc.id === selectedDoc.id;
      docsListHtml += `
        <div class="doc-list-item${isSelected ? ' active' : ''}" data-doc-id="${doc.id}">
          <span class="doc-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </span>
          <div class="doc-info">
            <span class="doc-title">${escapeHtml(doc.name)}</span>
            <span class="doc-meta">Page ${doc.currentPage || 1} of ${doc.pageCount || (doc.pages ? doc.pages.length : 1)}</span>
          </div>
          <button class="doc-delete-btn" title="Delete document">&times;</button>
        </div>
      `;
    });
  }

  let readerHtml = '';
  if (!selectedDoc) {
    readerHtml = `
      <div class="empty-reader">
        <span class="empty-reader-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
        </span>
        <h3>Select a document to read</h3>
        <p>Upload files on the left and select them to begin reading, taking notes, and highlighting.</p>
      </div>
    `;
  } else {
    let pageOptions = '<option value="">-- Link to a Page --</option>';
    data.pages.forEach(p => {
      const isSel = selectedDoc.linkedPageId === p.id ? ' selected' : '';
      pageOptions += `<option value="${p.id}"${isSel}>${escapeHtml(p.name)}</option>`;
    });

    let taskOptions = '<option value="">-- Link to a Task --</option>';
    data.pages.forEach(p => {
      (p.tasks || []).forEach(t => {
        const isSel = selectedDoc.linkedTaskId === t.id ? ' selected' : '';
        taskOptions += `<option value="${t.id}"${isSel}>[${escapeHtml(p.name)}] ${escapeHtml(t.name || 'Untitled task')}</option>`;
      });
    });

    let readerBodyHtml = '';
    if (selectedDoc.type === '.pdf') {
      readerBodyHtml = `
        <div class="reader-body-container" id="pdf-view-container" style="padding: 0; background: rgba(0,0,0,0.15); border-radius: 6px; overflow: hidden; height: 480px; width: 100%;">
        </div>
      `;
    } else {
      readerBodyHtml = `
        <div class="reader-body-container" style="background: transparent; border: none; padding: 0;">
          <div class="paper-sheet" id="reader-text-area" title="Select text to highlight">
            <div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 40px 0;">Loading document...</div>
          </div>
        </div>
      `;
    }

    const totalPages = selectedDoc.pageCount || (selectedDoc.pages ? selectedDoc.pages.length : 1);

    readerHtml = `
      <div class="library-reader-panel">
        <div class="reader-header">
          <h4>${escapeHtml(selectedDoc.name)}</h4>
          <div style="display: flex; align-items: center;">
            <div class="reader-page-nav" style="${selectedDoc.type === '.pdf' ? 'display: none;' : ''}">
              <button class="reader-nav-btn" id="btn-reader-prev" ${selectedDoc.currentPage <= 1 ? 'disabled' : ''}>◀</button>
              <span>Page ${selectedDoc.currentPage || 1} of ${totalPages}</span>
              <button class="reader-nav-btn" id="btn-reader-next" ${selectedDoc.currentPage >= totalPages ? 'disabled' : ''}>▶</button>
              <button class="reader-nav-btn" id="btn-reader-fullscreen" title="Toggle fullscreen" style="margin-left:6px; font-size:11px;">⛶</button>
            </div>
          </div>
        </div>

        ${readerBodyHtml}

        <div class="highlight-tooltip" id="highlight-tooltip" style="display: none;">
          <button class="hl-btn yellow" data-color="#ffeb3b" title="Highlight Yellow"></button>
          <button class="hl-btn blue" data-color="#a7ffeb" title="Highlight Teal"></button>
          <button class="hl-btn pink" data-color="#ff80ab" title="Highlight Pink"></button>
          <span class="hl-divider"></span>
          <button class="hl-action-btn" id="btn-hl-link-task">Link Task</button>
        </div>

        <div class="reader-split-footer">
          <div class="library-notes-section">
            <label>Notes</label>
            <textarea id="library-notes-input" placeholder="Type notes here...">${escapeHtml(selectedDoc.notes || '')}</textarea>
          </div>
          <div class="library-linking-section">
            <label>Link Document to:</label>
            <div class="link-select-row">
              <select id="select-link-page">${pageOptions}</select>
              <select id="select-link-task">${taskOptions}</select>
            </div>
            ${(selectedDoc.highlights || []).length > 0 ? `
              <div class="saved-highlights-container">
                <label>Saved Highlights</label>
                <div class="highlights-list">
                  ${(selectedDoc.highlights || []).map(h => `
                    <div class="highlight-list-item" style="border-left-color: ${h.color};">
                      <p>"${escapeHtml(h.text)}" (Pg. ${h.page})</p>
                      <button class="delete-hl-btn" data-hl-text="${escapeHtml(h.text)}">&times;</button>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  return `${getBannerHtml("library")}
    <div class="library-view-container">
      <div class="library-left-column">
        <div class="library-upload-zone" id="library-upload-zone">
          <span class="upload-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
          </span>
          <span class="upload-text">Drag & drop files here</span>
          <span class="upload-subtext">Supports DOCX, PDF, EPUB</span>
        </div>
        <input type="file" id="library-file-input" accept=".docx,.pdf,.epub" multiple style="display: none;">

        <div class="library-docs-list-header">
          <span>Your Documents</span>
        </div>
        <div class="library-docs-list">
          ${docsListHtml}
        </div>
      </div>

      <div class="library-right-column">
        ${readerHtml}
      </div>
    </div>
  `;
}

function bindLibraryEvents() {
  const uploadZone = document.getElementById('library-upload-zone');
  const fileInput = document.getElementById('library-file-input');

  if (uploadZone && fileInput) {
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('click', (e) => e.stopPropagation());
    
    fileInput.addEventListener('change', (e) => {
      handleLibraryFiles(e.target.files);
    });

    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      handleLibraryFiles(e.dataTransfer.files);
    });
  }

  const docsList = document.querySelector('.library-docs-list');
  if (docsList) {
    docsList.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.doc-delete-btn');
      const item = e.target.closest('.doc-list-item');
      
      if (deleteBtn && item) {
        e.stopPropagation();
        const docId = item.dataset.docId;
        deleteLibraryDoc(docId);
        return;
      }

      if (item) {
        const docId = item.dataset.docId;
        data.selectedDocId = docId;
        saveData();
        renderPage();
      }
    });
  }

  const selectedDoc = (data.library || []).find(d => d.id === data.selectedDocId) || (data.library || [])[0];
  if (selectedDoc) {
    const btnPrev = document.getElementById('btn-reader-prev');
    const btnNext = document.getElementById('btn-reader-next');
    const btnFullscreen = document.getElementById('btn-reader-fullscreen');
    const notesInput = document.getElementById('library-notes-input');
    const selectLinkPage = document.getElementById('select-link-page');
    const selectLinkTask = document.getElementById('select-link-task');

    const totalPages = selectedDoc.pageCount || (selectedDoc.pages ? selectedDoc.pages.length : 1);

    const updatePageNav = () => {
      const pageSpan = document.querySelector('.reader-page-nav span');
      if (pageSpan) {
        pageSpan.textContent = `Page ${selectedDoc.currentPage || 1} of ${totalPages}`;
      }
      if (btnPrev) btnPrev.disabled = (selectedDoc.currentPage || 1) <= 1;
      if (btnNext) btnNext.disabled = (selectedDoc.currentPage || 1) >= totalPages;
    };

    if (btnPrev) {
      btnPrev.onclick = () => {
        if ((selectedDoc.currentPage || 1) > 1) {
          selectedDoc.currentPage = (selectedDoc.currentPage || 1) - 1;
          saveData();
          updatePageNav();
          if (selectedDoc.type === '.pdf') {
            const cont = document.getElementById('pdf-view-container');
            if (cont && typeof cont._pdfRenderFn === 'function') {
              cont._pdfRenderFn();
            } else {
              renderPage(); // fallback full re-render
            }
          } else {
            renderPage();
          }
        }
      };
    }

    if (btnNext) {
      btnNext.onclick = () => {
        if ((selectedDoc.currentPage || 1) < totalPages) {
          selectedDoc.currentPage = (selectedDoc.currentPage || 1) + 1;
          saveData();
          updatePageNav();
          if (selectedDoc.type === '.pdf') {
            const cont = document.getElementById('pdf-view-container');
            if (cont && typeof cont._pdfRenderFn === 'function') {
              cont._pdfRenderFn();
            } else {
              renderPage();
            }
          } else {
            renderPage();
          }
        }
      };
    }

    if (btnFullscreen) {
      btnFullscreen.onclick = () => {
        const pdfContainer = document.getElementById('pdf-view-container');
        if (pdfContainer) {
          if (!document.fullscreenElement) {
            pdfContainer.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen();
          }
        }
      };
    }

    if (notesInput) {
      notesInput.addEventListener('input', () => {
        selectedDoc.notes = notesInput.value;
        saveData();
      });
    }

    if (selectLinkPage) {
      selectLinkPage.addEventListener('change', () => {
        selectedDoc.linkedPageId = selectLinkPage.value;
        saveData();
        showToast('Document linked to page');
        renderSidebar();
      });
    }

    if (selectLinkTask) {
      selectLinkTask.addEventListener('change', () => {
        selectedDoc.linkedTaskId = selectLinkTask.value;
        saveData();
        showToast('Document linked to task');
      });
    }

    const readerTextArea = document.getElementById('reader-text-area');
    if (readerTextArea) {
      readerTextArea.addEventListener('mouseup', handleTextSelection);
    }

    const highlightsContainer = document.querySelector('.saved-highlights-container');
    if (highlightsContainer) {
      highlightsContainer.addEventListener('click', (e) => {
        const deleteHlBtn = e.target.closest('.delete-hl-btn');
        if (deleteHlBtn) {
          const hlText = deleteHlBtn.dataset.hlText;
          selectedDoc.highlights = selectedDoc.highlights.filter(h => h.text !== hlText);
          saveData();
          renderPage();
        }
      });
    }

    // Hide selection tooltip on click outside
    document.addEventListener('mousedown', (e) => {
      const tooltip = document.getElementById('highlight-tooltip');
      if (tooltip && !tooltip.contains(e.target) && !e.target.closest('#reader-text-area') && !e.target.closest('#pdf-text-layer')) {
        tooltip.style.display = 'none';
      }
    });
  }
}

function handleLibraryFiles(files) {
  if (!files || files.length === 0) return;
  data.library = data.library || [];

  const allowedExtensions = ['.docx', '.pdf', '.epub'];

  Array.from(files).forEach(file => {
    const extIndex = file.name.lastIndexOf('.');
    if (extIndex === -1) {
      showToast(`Unsupported file type: ${file.name}`);
      return;
    }

    const ext = file.name.substring(extIndex).toLowerCase();
    
    if (!allowedExtensions.includes(ext)) {
      showToast(`Only DOCX, PDF, and EPUB files are supported!`);
      return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
      const arrayBuffer = e.target.result;
      const fileId = uid();

      saveFileToDB(fileId, arrayBuffer).then(() => {
        if (ext === '.pdf') {
          showToast(`Reading PDF: ${file.name}...`);
          addDocumentToLibrary(fileId, file.name, ext, 1);
        } else if (ext === '.docx') {
          if (!window.mammoth) {
            showToast("DOCX library not loaded yet.");
            return;
          }
          showToast(`Reading DOCX: ${file.name}...`);
          mammoth.convertToHtml({arrayBuffer: arrayBuffer}).then(result => {
            const pages = paginateHtml(result.value, 8);
            addDocumentToLibrary(fileId, file.name, ext, pages.length);
          }).catch(err => {
            console.error(err);
            showToast('Failed to read DOCX');
          });
        } else if (ext === '.epub') {
          if (!window.JSZip) {
            showToast("EPUB parsing library (JSZip) not loaded.");
            return;
          }
          showToast(`Reading EPUB: ${file.name}...`);
          JSZip.loadAsync(arrayBuffer).then(zip => {
            const htmlFiles = [];
            zip.forEach((relativePath, zipEntry) => {
              if (relativePath.endsWith('.html') || relativePath.endsWith('.xhtml') || relativePath.endsWith('.htm')) {
                htmlFiles.push(zipEntry);
              }
            });
            htmlFiles.sort((a, b) => a.name.localeCompare(b.name));
            
            if (htmlFiles.length === 0) {
              showToast('No readable content found in EPUB');
              return;
            }
            const filePromises = htmlFiles.map(f => f.async('string'));
            Promise.all(filePromises).then(pagesHtml => {
              const cleanHtmls = pagesHtml.map(html => cleanEpubHtml(html));
              const fullHtml = cleanHtmls.join('<hr class="chapter-break">');
              const pages = paginateHtml(fullHtml, 12);
              addDocumentToLibrary(fileId, file.name, ext, pages.length);
            });
          }).catch(err => {
            console.error(err);
            showToast('Failed to read EPUB');
          });
        }
      }).catch(err => {
        console.error("Save failed", err);
        showToast("Failed to save file.");
      });
    };

    reader.readAsArrayBuffer(file);
  });
}


function addDocumentToLibrary(fileId, filename, ext, pageCount) {
  const doc = {
    id: fileId,
    name: filename,
    type: ext,
    pageCount: pageCount,
    currentPage: 1,
    notes: '',
    highlights: [],
    linkedPageId: '',
    linkedTaskId: ''
  };
  
  data.library.push(doc);
  data.selectedDocId = doc.id;
  saveData();
  renderPage();
  showToast(`Uploaded ${filename}`);
  return doc;
}

function deleteLibraryDoc(docId) {
  if (!data.library) return;
  const idx = data.library.findIndex(d => d.id === docId);
  if (idx !== -1) {
    const docName = data.library[idx].name;
    data.library.splice(idx, 1);
    if (data.selectedDocId === docId) {
      data.selectedDocId = data.library.length > 0 ? data.library[0].id : null;
    }
    saveData();
    
    deleteFileFromDB(docId).then(() => {
      pdfDataMap.delete(docId);
      docPagesCache.delete(docId);
      renderPage();
      showToast(`"${docName}" deleted`);
    });
  }
}


function handleTextSelection(e) {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  const tooltip = document.getElementById('highlight-tooltip');
  
  if (!tooltip) return;

  if (!selectedText) {
    tooltip.style.display = 'none';
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const containerRect = document.getElementById('page-content').getBoundingClientRect();

  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top}px`;
  tooltip.style.position = 'fixed';
  tooltip.style.display = 'flex';

  tooltip.querySelectorAll('.hl-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = newBtn.dataset.color;
      addHighlightToSelectedDoc(selectedText, color);
      tooltip.style.display = 'none';
      selection.removeAllRanges();
    });
  });

  const btnLinkTask = document.getElementById('btn-hl-link-task');
  if (btnLinkTask) {
    const newBtnLinkTask = btnLinkTask.cloneNode(true);
    btnLinkTask.parentNode.replaceChild(newBtnLinkTask, btnLinkTask);
    
    newBtnLinkTask.addEventListener('click', (e) => {
      e.stopPropagation();
      tooltip.style.display = 'none';
      selection.removeAllRanges();
      
      const activePage = getActivePage();
      if (activePage && activePage.tasks.length > 0) {
        const selectedDoc = data.library.find(d => d.id === data.selectedDocId);
        if (selectedDoc) {
          addHighlightToSelectedDoc(selectedText, '#ffeb3b');
          selectedDoc.linkedTaskId = activePage.tasks[0].id;
          saveData();
          renderPage();
          showToast(`Highlight saved & linked to "${activePage.tasks[0].name}"`);
        }
      } else {
        showToast('No tasks available to link!');
      }
    });
  }
}

function addHighlightToSelectedDoc(text, color) {
  const doc = data.library.find(d => d.id === data.selectedDocId);
  if (!doc) return;

  doc.highlights = doc.highlights || [];
  
  if (doc.highlights.some(h => h.text === text && h.page === doc.currentPage)) {
    return;
  }

  doc.highlights.push({
    text: text,
    page: doc.currentPage || 1,
    color: color
  });

  saveData();
  renderPage();
  showToast('Highlight saved');
}

// ============================================================
// Page & Task Deletion
// ============================================================

function deletePage(pageId) {
  const idx = data.pages.findIndex(p => p.id === pageId);
  if (idx === -1) return;

  data.pages.splice(idx, 1);
  data.recentIds = data.recentIds.filter(id => id !== pageId);

  if (data.pages.length === 0) {
    const newPage = {
      id: 'page-todos',
      name: 'To-dos',
      icon: '',
      tasks: []
    };
    data.pages.push(newPage);
    data.activePageId = newPage.id;
    data.recentIds = [newPage.id];
  } else if (data.activePageId === pageId) {
    data.activePageId = data.pages[0].id;
    pushRecent(data.activePageId);
  }

  saveData();
  renderSidebar();
  renderPage();
  showToast('Page deleted');
}

function deleteTask(taskIdx, pageId) {
  const page = getPage(pageId || data.activePageId);
  if (!page) return;

  if (taskIdx >= 0 && taskIdx < page.tasks.length) {
    const taskName = page.tasks[taskIdx].name || 'Task';
    page.tasks.splice(taskIdx, 1);
    saveData();
    renderActiveView();
    showToast(`"${taskName}" deleted`);
  }
}

// ============================================================
// Context Menu Controller (Emojis removed from layout)
// ============================================================

let contextMenuTarget = null;

function showContextMenu(e, type, details) {
  e.preventDefault();
  const menu = document.getElementById('custom-context-menu');
  if (!menu) return;

  if (type === 'task' && details && !details.task) {
    const page = getPage(details.pageId);
    if (page && page.tasks) {
      details.task = page.tasks[details.taskIdx];
    }
  }

  contextMenuTarget = { type, data: details };

  let itemsHtml = '';
  if (type === 'task') {
    const task = details.task;
    if (!task) return;
    itemsHtml = `
      <div class="context-menu-item" data-action="toggle-complete">
        <span>Mark ${task.checked ? 'Incomplete' : 'Complete'}</span>
      </div>
      <div class="context-menu-item" data-action="edit-task">
        <span>Edit details...</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" data-action="delete-task">
        <span>Delete Task</span>
      </div>
    `;
  } else if (type === 'page') {
    let catItems = '';
    const categories = data.settings.categories || ['To-dos', 'Notes', 'Journal', 'Personal', 'Work'];
    categories.forEach(cat => {
      catItems += `
        <div class="context-menu-item" data-action="change-page-category" data-cat="${escapeHtml(cat)}">
          <span style="opacity: 0.5; margin-right: 6px;">→</span> Move to ${escapeHtml(cat)}
        </div>
      `;
    });

    itemsHtml = `
      <div class="context-menu-item" data-action="rename-page">
        <span>Rename Page</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-title" style="padding: 4px 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-section); letter-spacing: 0.05em; pointer-events: none;">Categorize</div>
      ${catItems}
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" data-action="delete-page">
        <span>Delete Page</span>
      </div>
    `;
  } else if (type === 'day') {
    itemsHtml = `
      <div class="context-menu-item" data-action="add-task-day">
        <span>Add task for ${details.dateStr}...</span>
      </div>
    `;
  } else if (type === 'home-module') {
    itemsHtml = `
      <div class="context-menu-item danger" data-action="remove-module">
        <span>Remove Section</span>
      </div>
    `;
  } else if (type === 'global') {
    itemsHtml = `
      <div class="context-menu-item" data-action="nav-home"><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px; vertical-align:middle;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>Go to Home</span></div>
      <div class="context-menu-item" data-action="nav-library"><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px; vertical-align:middle;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>Go to Library</span></div>
      <div class="context-menu-item" data-action="nav-settings"><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px; vertical-align:middle;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Go to Settings</span></div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" data-action="new-page"><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px; vertical-align:middle;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Page</span></div>
    `;
  } else if (type === 'widgets-toggle') {
    const activeWidgets = data.settings.activeWidgets || ['clock', 'habits', 'goals', 'quote', 'timer', 'reading', 'calendar', 'quick_add'];
    const ALL_WIDGETS = [
      { id: 'clock', label: '🕒 Time & Date' },
      { id: 'habits', label: '🔥 Daily Habits' },
      { id: 'goals', label: '🎯 Today\'s Goals' },
      { id: 'quote', label: '💬 Focus Quote' },
      { id: 'timer', label: '⏳ Focus Timer' },
      { id: 'reading', label: '📚 Reading Progress' },
      { id: 'calendar', label: '📅 Calendar' },
      { id: 'quick_add', label: '⚡ Quick Add' }
    ];

    let widgetItems = '';
    ALL_WIDGETS.forEach(w => {
      const isActive = activeWidgets.includes(w.id);
      widgetItems += `
        <div class="context-menu-item ${isActive ? 'active' : ''}" data-action="toggle-widget" data-widget-id="${w.id}">
          <span>${w.label}</span>
          <span style="color:var(--accent-blue); font-weight:bold;">${isActive ? '✓' : ''}</span>
        </div>
      `;
    });

    itemsHtml = `
      <div class="context-menu-title">Toggle Widgets</div>
      ${widgetItems}
    `;
  }

  menu.innerHTML = itemsHtml;
  menu.style.display = 'block';

  const menuWidth = menu.offsetWidth || 150;
  const menuHeight = menu.offsetHeight || 120;
  let x = e.clientX;
  let y = e.clientY;

  if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
  if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

function hideContextMenu() {
  const menu = document.getElementById('custom-context-menu');
  if (menu) menu.style.display = 'none';
  contextMenuTarget = null;
}

function initContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.dynamic-action-btn')) return;

    const moduleHeader = e.target.closest('.home-section-header');
    const modularSection = e.target.closest('.modular-section');
    if (moduleHeader && modularSection) {
      showContextMenu(e, 'home-module', { moduleId: modularSection.dataset.moduleId });
      return;
    }

    const sidebarItem = e.target.closest('.sidebar-item');
    if (sidebarItem && sidebarItem.dataset.pageId) {
      showContextMenu(e, 'page', { pageId: sidebarItem.dataset.pageId });
      return;
    }
    
    const taskRow = e.target.closest('tr[data-task-idx]');
    if (taskRow) {
      const idx = parseInt(taskRow.dataset.taskIdx);
      if (!isNaN(idx)) {
        showContextMenu(e, 'task', { taskIdx: idx, pageId: data.activePageId });
        return;
      }
    }

    const homeView = e.target.closest('.home-view');
    if (homeView && !e.target.closest('input') && !e.target.closest('textarea') && !e.target.isContentEditable) {
      showContextMenu(e, 'widgets-toggle', {});
      return;
    }

    if (!e.target.closest('input') && !e.target.closest('textarea') && !e.target.isContentEditable) {
      showContextMenu(e, 'global', {});
      return;
    }
    hideContextMenu();
  });

  const menu = document.getElementById('custom-context-menu');
  if (menu) {
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.context-menu-item');
      if (!item) return;

      const action = item.dataset.action;
      const { type, data: details } = contextMenuTarget || {};

      if (action === 'toggle-widget' && type === 'widgets-toggle') {
        const widgetId = item.dataset.widgetId;
        let nextWidgets = [...(data.settings.activeWidgets || ['clock', 'habits', 'goals', 'quote', 'timer', 'reading', 'calendar', 'quick_add'])];
        if (nextWidgets.includes(widgetId)) {
          if (nextWidgets.length <= 1) {
            showToast("At least one widget must remain active!");
            return;
          }
          nextWidgets = nextWidgets.filter(id => id !== widgetId);
        } else {
          nextWidgets.push(widgetId);
        }
        data.settings.activeWidgets = nextWidgets;
        saveData();
        renderPage();
      } else if (action === 'delete-page' && type === 'page') {
        deletePage(details.pageId);
      } else if (action === 'rename-page' && type === 'page') {
        navigateTo(details.pageId);
        setTimeout(() => {
          const titleEl = document.querySelector('.page-title');
          if (titleEl) {
            titleEl.focus();
            const range = document.createRange();
            range.selectNodeContents(titleEl);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }, 100);
      } else if (action === 'change-page-category' && type === 'page') {
        const cat = item.dataset.cat;
        const page = getPage(details.pageId);
        if (page) {
          page.category = cat;
          saveData();
          renderSidebar();
          renderPage();
          showToast(`Moved to ${cat}`);
        }
      } else if (action === 'delete-task' && type === 'task') {
        deleteTask(details.taskIdx, details.pageId);
      } else if (action === 'toggle-complete' && type === 'task') {
        details.task.checked = !details.task.checked;
        saveData();
        renderActiveView();
      } else if (action === 'edit-task' && type === 'task') {
        openTaskModal(details.task, details.pageId, details.taskIdx);
      } else if (action === 'add-task-day' && type === 'day') {
        const dateParts = details.dateStr.split('-');
        const targetDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        const newTask = {
          id: uid(),
          name: '',
          due: formatDate(targetDate, ''),
          checked: false
        };
        const activePage = getActivePage();
        openTaskModal(newTask, activePage.id, -1);
      } else if (action === 'remove-module') {
        data.settings.homeLayout = data.settings.homeLayout.filter(id => id !== details.moduleId);
        saveData();
        renderPage();
      } else if (action === 'nav-home') {
        navigateTo('home');
      } else if (action === 'nav-library') {
        navigateTo('library');
      } else if (action === 'nav-settings') {
        navigateTo('settings');
      } else if (action === 'new-page') {
        addNewPage();
      } else if (action === 'nav-home') {
        navigateTo('home');
      } else if (action === 'nav-library') {
        navigateTo('library');
      } else if (action === 'nav-settings') {
        navigateTo('settings');
      } else if (action === 'new-page') {
        addNewPage();
      }

      hideContextMenu();
    });
  }

  document.addEventListener('click', () => {
    hideContextMenu();
  });
}

// ============================================================
// Navigation
// ============================================================

function navigateTo(pageId) {
  const page = getPage(pageId);
  if (!page && pageId !== 'library' && pageId !== 'settings' && pageId !== 'home') return;
  data.activePageId = pageId;
  if (pageId !== 'library' && pageId !== 'settings' && pageId !== 'home') pushRecent(pageId);
  if (pageId === 'library' && data.settings.splitscreen) {
    data.settings.splitscreen = false;
  }
  saveData();
  renderSidebar();
  renderPage();
  applySplitScreenState();
}

function bindCoverEvents() {
  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;
  
  // Clean up any old listeners if we wanted, but we'll just add one globally once if possible.
  // Actually, event delegation on a static element doesn't need to be rebound every render, but page-content's DOM is swapped.
  // We can safely re-add it if we use an onclick, but onclick overwrites other pageContent.onclick.
  // Let's attach to the #page-content container but ensure we don't duplicate if we use addEventListener.
  // Actually, we can just delegate it at the document level for '.banner-action-btn' and '.add-cover-btn'.
}

// Global cover event delegation
document.addEventListener('click', (e) => {
  const target = e.target;
  if (target.closest('#btn-change-cover') || target.closest('#btn-add-cover')) {
    e.stopPropagation();
    openCoverPicker(target.closest('.banner-action-btn') || target.closest('.add-cover-btn'));
  }
  if (target.closest('#btn-remove-cover')) {
    e.stopPropagation();
    const isPseudo = ['library', 'settings', 'home'].includes(data.activePageId);
    if (isPseudo) {
      data.settings.pseudoBanners[data.activePageId] = '';
    } else {
      const page = getActivePage();
      if (page) page.banner = '';
    }
    saveData();
    renderPage();
  }
});

function bindPageEvents() {
  const page = getActivePage();
  
  // Linked items badges clicks
  const pageBadge = document.querySelector('.page-link-badge');
  if (pageBadge) {
    pageBadge.addEventListener('click', () => {
      const docId = pageBadge.dataset.docId;
      data.activePageId = 'library';
      data.selectedDocId = docId;
      saveData();
      renderSidebar();
      renderPage();
    });
  }

  if (data.activePageId === 'library') return;
  const isPseudo = ['library', 'settings', 'home'].includes(data.activePageId);
  if (!page && !isPseudo) return;

  

  // Page title editing
  const titleEl = document.querySelector('.page-title');
  if (titleEl) {
    titleEl.addEventListener('blur', () => {
      const newName = titleEl.textContent.trim();
      if (newName && newName !== page.name) {
        const oldName = page.name;
        page.name = newName;
        // Update backlinks in other pages
        data.pages.forEach(p => {
          if (p.content) {
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp('\\[\\[' + escapeRegExp(oldName) + '\\]\\]', 'gi');
            p.content = p.content.replace(regex, `[[${newName}]]`);
          }
        });
        saveData();
        renderSidebar();
        document.getElementById('breadcrumb-name').textContent = newName;
        document.title = `${newName} — Dashboard`;
      }
    });
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    });
  }

  // View tab switching
  const tasksTab = document.getElementById('tab-tasks');
  const calendarTab = document.getElementById('tab-calendar');

  if (tasksTab && calendarTab) {
    tasksTab.addEventListener('click', () => {
      data.activeView = 'tasks';
      saveData();
      renderActiveView();
    });
    calendarTab.addEventListener('click', () => {
      data.activeView = 'calendar';
      saveData();
      renderActiveView();
    });
  }

  // New task button
  const newBtnMain = document.getElementById('btn-new-main');
  const wrapper = document.getElementById('new-btn-wrapper');

  if (newBtnMain) {
    newBtnMain.addEventListener('click', (e) => {
      if (e.target.closest('#btn-new-caret')) {
        e.stopPropagation();
        toggleDropdown(wrapper);
        return;
      }
      addNewTask();
    });
  }

  // Table task actions delegated on tbody
  const tbody = document.getElementById('task-tbody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const badge = e.target.closest('.task-link-badge');
      if (badge) {
        e.stopPropagation();
        const docId = badge.dataset.docId;
        data.activePageId = 'library';
        data.selectedDocId = docId;
        saveData();
        renderSidebar();
        renderPage();
        return;
      }

      const cb = e.target.closest('.task-checkbox');
      if (cb) {
        const tr = cb.closest('tr');
        const idx = parseInt(tr.dataset.taskIdx);
        if (!isNaN(idx) && page.tasks[idx]) {
          page.tasks[idx].checked = !page.tasks[idx].checked;
          cb.classList.toggle('checked');
          cb.classList.add('just-checked');
          setTimeout(() => cb.classList.remove('just-checked'), 300);
          const nameEl = tr.querySelector('.task-name-text');
          if (nameEl) nameEl.classList.toggle('completed', page.tasks[idx].checked);
          saveData();
        }
        return;
      }

      const newRow = e.target.closest('.new-task-row');
      if (newRow) {
        addNewTask();
        return;
      }
    });

    // Edit task name inline (without auto-deleting on blur)
    tbody.addEventListener('blur', (e) => {
      if (e.target.classList.contains('task-name-text')) {
        const tr = e.target.closest('tr');
        const idx = parseInt(tr?.dataset.taskIdx);
        if (!isNaN(idx) && page.tasks[idx]) {
          const val = e.target.textContent.trim();
          page.tasks[idx].name = val;
          saveData();
        }
      }

      // Edit task date inline
      if (e.target.classList.contains('due-date')) {
        const tr = e.target.closest('tr');
        const idx = parseInt(tr?.dataset.taskIdx);
        if (!isNaN(idx) && page.tasks[idx]) {
          page.tasks[idx].due = e.target.textContent.trim() || '';
          saveData();
        }
      }
    }, true);

    tbody.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target.classList.contains('task-name-text') || e.target.classList.contains('due-date'))) {
        e.preventDefault();
        e.target.blur();
      }
    });
  }

  // Table search toggle & search handler
  const btnTableSearch = document.getElementById('btn-table-search');
  const tableSearchContainer = document.getElementById('table-search-container');
  const tableSearchInput = document.getElementById('table-search-input');
  
  if (btnTableSearch && tableSearchContainer && tableSearchInput) {
    btnTableSearch.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = tableSearchContainer.style.display === 'none';
      tableSearchContainer.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        tableSearchInput.focus();
      } else {
        tableSearchInput.value = '';
        renderTasks();
      }
    });

    tableSearchInput.addEventListener('input', () => {
      renderTasks(tableSearchInput.value);
    });

    tableSearchInput.addEventListener('click', (e) => e.stopPropagation());
  }
}

// ============================================================
// Add Task Helper
// ============================================================

function addNewTask() {
  const page = getActivePage();
  if (!page) return;

  if (data.activeView === 'calendar') {
    const today = new Date();
    const newTask = {
      id: uid(),
      name: '',
      due: formatDate(today, ''),
      checked: false
    };
    openTaskModal(newTask, page.id, -1);
    return;
  }

  const task = { id: uid(), name: '', due: '', checked: false };
  page.tasks.push(task);
  saveData();
  renderPage(); 
  setTimeout(() => {
    const tbody = document.getElementById('task-tbody');
    if (tbody) {
      const rows = tbody.querySelectorAll('tr[data-task-idx]');
      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        const nameEl = lastRow.querySelector('.task-name-text');
        if (nameEl) nameEl.focus();
      }
    }
  }, 0);
}


// ============================================================
// Dropdown menu caret (Emojis replaced with clean SVGs)
// ============================================================

let activeDropdown = null;

function toggleDropdown(wrapper) {
  if (activeDropdown) {
    closeDropdown();
    return;
  }

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.innerHTML = `
    <button class="dropdown-item" data-action="new-task">
      <span class="dd-icon">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1.5" y="1.5" width="9" height="9" rx="1.5"/>
          <polyline points="4 6 5.5 7.5 8 4.5"/>
        </svg>
      </span>
      New task
    </button>
    <button class="dropdown-item" data-action="new-page">
      <span class="dd-icon">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 1H2v10h8V3z"/>
          <polyline points="8 1 8 3 10 3"/>
        </svg>
      </span>
      New page
    </button>
  `;

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;
    const action = item.dataset.action;
    closeDropdown();
    if (action === 'new-task') addNewTask();
    if (action === 'new-page') addNewPage();
  });

  wrapper.appendChild(menu);
  activeDropdown = menu;

  setTimeout(() => {
    document.addEventListener('click', outsideDropdownClick);
  }, 0);
}

function outsideDropdownClick(e) {
  if (activeDropdown && !activeDropdown.contains(e.target) && !e.target.closest('#btn-new-caret')) {
    closeDropdown();
  }
}

function closeDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
  document.removeEventListener('click', outsideDropdownClick);
}

// ============================================================
// Add Page Helper
// ============================================================

async function addNewPage(startName) {
  const pageType = await promptPageType();
  if (!pageType) return;

  const page = {
    id: uid(),
    name: startName || 'Untitled',
    icon: '',
    type: pageType,
    tasks: [],
    content: pageType === 'notes' ? '' : undefined,
    planner: pageType === 'planner' ? { goals: '', priorities: '' } : undefined,
    planner: pageType === 'planner' ? { goals: '', priorities: '' } : undefined,
  };

  data.pages.push(page);
  pushRecent(page.id);
  data.activePageId = page.id;
  saveData();
  renderSidebar();
  renderPage();

  setTimeout(() => {
    const titleEl = document.querySelector('.page-title');
    if (titleEl) {
      titleEl.focus();
      const range = document.createRange();
      range.selectNodeContents(titleEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, 50);

  showToast(`"${page.name}" created`);
}

function promptPageType() {
  const types = [
    { id: 'tasks', label: 'Tasks (checklist & calendar)' },
    { id: 'notes', label: 'Notes (rich text note editor)' },
    { id: 'planner', label: 'Planner (weekly goals)' },
    { id: 'kanban', label: 'Kanban (drag-and-drop board)' },
    { id: 'flashcards', label: 'Flashcards (spaced repetition)' },
    { id: 'student', label: 'Student Workspace (GPA & assignments)' },
    { id: 'crm', label: 'Personal CRM (contacts & logs)' },
    { id: 'journal', label: 'Journal & Reflections (habits & mood)' },
    { id: 'productivity', label: 'Productivity (analytics & heatmap)' }
  ];

  let html = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;">';
  html += '<div style="background:#2c2c2c;border-radius:12px;padding:24px;width:340px;box-shadow:0 10px 30px rgba(0,0,0,0.5);max-height:80vh;overflow-y:auto;">';
  html += '<h3 style="margin:0 0 16px 0;font-size:16px;">Choose page type</h3>';
  
  types.forEach(t => {
    html += `<div class="page-type-option" data-type="${t.id}" style="padding:10px 14px;margin-bottom:8px;background:#3a3a3a;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:12px;">`;
    html += `<div style="width:28px;height:28px;background:#555;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;">`;
    if (t.id === 'tasks') html += `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
    else if (t.id === 'notes') html += `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
    else if (t.id === 'planner') html += `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    else if (t.id === 'kanban') html += `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/></svg>`;
    else if (t.id === 'flashcards') html += `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/></svg>`;
    else if (t.id === 'student') html += `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2.5 3 6 3s6-1 6-3v-5"/></svg>`;
    else if (t.id === 'crm') html += `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    else if (t.id === 'journal') html += `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
    else if (t.id === 'productivity') html += `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
    html += `</div>`;
    html += `<div><div style="font-weight:500;">${t.label.split(' (')[0]}</div><div style="font-size:11px;color:#888;">${t.label.split(' (')[1] || ''}</div></div>`;
    html += `</div>`;
  });

  html += '</div></div>';

  const modal = document.createElement('div');
  modal.innerHTML = html;
  document.body.appendChild(modal.firstElementChild);

  return new Promise(resolve => {
    const modalEl = document.querySelector('body > div[style*="position:fixed"]');
    if (!modalEl) return resolve('tasks');

    modalEl.addEventListener('click', (e) => {
      const option = e.target.closest('.page-type-option');
      if (option) {
        const type = option.dataset.type;
        modalEl.remove();
        resolve(type);
      } else if (e.target === modalEl) {
        modalEl.remove();
        resolve(null);
      }
    });
  });
}

// ============================================================
// Home Hub View
// ============================================================

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function makeMiniCalendarHtml() {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Find all deadline dates for current month
  const deadlineDays = new Set();
  data.pages.forEach(p => {
    (p.tasks || []).forEach(t => {
      if (t.due && t.due !== '—') {
        const dt = parseDateString(t.due);
        if (dt && dt.getFullYear() === year && dt.getMonth() === month) {
          deadlineDays.add(dt.getDate());
        }
      }
    });
  });
  
  let calHtml = `
    <div style="font-size:12px; font-weight:600; text-align:center; margin-bottom:8px; font-family: var(--font-stack);">
      ${d.toLocaleString('en-US', { month: 'long' })} ${year}
    </div>
    <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:2px; font-size:10px; text-align:center; font-family: var(--font-stack);">
      <div style="color:var(--text-muted); font-weight:600;">S</div>
      <div style="color:var(--text-muted); font-weight:600;">M</div>
      <div style="color:var(--text-muted); font-weight:600;">T</div>
      <div style="color:var(--text-muted); font-weight:600;">W</div>
      <div style="color:var(--text-muted); font-weight:600;">T</div>
      <div style="color:var(--text-muted); font-weight:600;">F</div>
      <div style="color:var(--text-muted); font-weight:600;">S</div>
  `;
  
  for (let i = 0; i < firstDay; i++) {
    calHtml += `<div></div>`;
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = day === d.getDate();
    const hasDot = deadlineDays.has(day);
    calHtml += `
      <div style="padding:2px; position:relative; border-radius:3px; background:${isToday ? 'var(--accent-blue)' : 'transparent'}; color:${isToday ? 'white' : 'var(--text-primary)'}; font-weight: ${isToday ? '600' : 'normal'};">
        ${day}
        ${hasDot ? `<span style="position:absolute; bottom:1px; left:50%; transform:translateX(-50%); width:3px; height:3px; border-radius:50%; background:${isToday ? 'white' : 'var(--accent-blue)'};"></span>` : ''}
      </div>
    `;
  }
  calHtml += `</div>`;
  return calHtml;
}

function renderHomeHtml() {
  const greeting = getGreeting();
  const workspaceName = data.settings.workspaceName || 'Workspace';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const allTasks = data.pages.reduce((acc, p) => acc.concat(p.tasks || []), []);
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter(t => t.checked).length;
  const pendingTasks = totalTasks - completedTasks;

  const recentPages = data.recentIds.map(id => getPage(id)).filter(Boolean).slice(0, 6);
  let recentCardsHtml = '';
  recentPages.forEach(p => {
    const taskCount = (p.tasks || []).length;
    const doneCount = (p.tasks || []).filter(t => t.checked).length;
    recentCardsHtml += `
      <div class="home-recent-card" data-page-id="${p.id}">
        <div class="home-recent-card-icon" style="font-weight:bold; font-size:12px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.1); border-radius:4px;">
          ${p.name ? p.name.charAt(0).toUpperCase() : 'U'}
        </div>
        <div class="home-recent-card-body">
          <div class="home-recent-card-title">${escapeHtml(p.name)}</div>
          <div class="home-recent-card-meta">
            <span class="home-card-cat">${escapeHtml(p.category || 'Uncategorized')}</span>
            <span class="home-card-tasks">${doneCount}/${taskCount} tasks</span>
          </div>
        </div>
      </div>`;
  });
  if (recentPages.length === 0) recentCardsHtml = '<div class="home-empty-state">No recent pages yet.</div>';

  const upcomingTasks = [];
  data.pages.forEach(p => {
    (p.tasks || []).forEach(t => {
      if (!t.checked && t.due && t.due !== '—') upcomingTasks.push({ ...t, pageName: p.name, pageId: p.id });
    });
  });
  upcomingTasks.sort((a, b) => {
    const da = parseDateString(a.due); const db = parseDateString(b.due);
    if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
    return da - db;
  });
  const topUpcoming = upcomingTasks.slice(0, 5);
  let upcomingHtml = '';
  if (topUpcoming.length === 0) {
    upcomingHtml = '<div class="home-empty-state">No upcoming tasks.</div>';
  } else {
    topUpcoming.forEach(t => {
      upcomingHtml += `
        <div class="home-upcoming-item" style="display:flex; align-items:center; gap:8px; padding: 6px 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--divider); border-radius:6px; margin-bottom:6px;">
          <div class="task-checkbox" data-page-id="${t.pageId}" data-task-id="${t.id}" style="cursor:pointer;">
            <svg viewBox="0 0 10 10" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,5.5 4,8 8.5,2.5"/></svg>
          </div>
          <div class="home-upcoming-content" style="flex:1;">
            <div class="home-upcoming-name" contenteditable="true" data-page-id="${t.pageId}" data-task-id="${t.id}" spellcheck="false" style="outline:none; font-weight:500; font-size:12px;">${escapeHtml(t.name)}</div>
            <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">
              <span>${escapeHtml(t.pageName)}</span> &bull; <span>${escapeHtml(t.due)}</span>
            </div>
          </div>
        </div>`;
    });
  }

  let plansHtml = '';
  let goalsHtml = '';
  const plannerPages = data.pages.filter(p => p.type === 'planner');
  if (plannerPages.length === 0) {
    plansHtml = '<div class="home-empty-state">No plans yet.</div>';
    goalsHtml = '<div class="home-empty-state">No goals yet.</div>';
  } else {
    plannerPages.forEach(p => {
      if (p.plannerBlocks) {
        p.plannerBlocks.forEach(b => {
          const htmlChunk = `
            <div style="margin-bottom: 12px;">
              <div style="font-size: 13px; font-weight: 500; margin-bottom: 4px; color: var(--text-muted);">${escapeHtml(b.title)} (from ${escapeHtml(p.name)})</div>
              <textarea class="home-inline-textarea" data-page-id="${p.id}" data-block-id="${b.id}" style="width:100%; height:80px; background:rgba(255,255,255,0.03); border:1px solid var(--divider); border-radius:6px; padding:10px; color:var(--text-primary); resize:vertical; outline:none; font-family:var(--font-stack); font-size:14px;" placeholder="Type here...">${escapeHtml(b.content || '')}</textarea>
            </div>`;
          if (b.title.toLowerCase().includes('goal')) goalsHtml += htmlChunk;
          else plansHtml += htmlChunk;
        });
      }
    });
  }

  let customActionsHtml = '';
  data.settings.quickActions.forEach(qa => {
    const icon = qa.icon || '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>';
    customActionsHtml += `
      <button class="home-action-btn dynamic-action-btn" data-type="${qa.type}" data-target="${escapeHtml(qa.target)}" oncontextmenu="event.preventDefault(); window.deleteQuickAction('${qa.id}')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg><span>${escapeHtml(qa.label)}</span>
      </button>
    `;
  });
  
  customActionsHtml += `
    <button class="home-action-btn" id="home-add-action" style="border: 1px dashed var(--divider); background: transparent;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>Add Action</span>
    </button>
  `;

  // Habits Render
  let habitsHtml = '';
  (data.habits || []).forEach(h => {
    const isChecked = h.checkedToday;
    habitsHtml += `
      <div class="habit-checkbox-row">
        <span style="font-size:13px; color:var(--text-primary);">${escapeHtml(h.name)}</span>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:11px; color:var(--text-muted);">🔥 ${h.streak}d</span>
          <div class="habit-circle ${isChecked ? 'checked' : ''}" data-habit-id="${h.id}">
            <svg viewBox="0 0 10 10" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,5.5 4,8 8.5,2.5"/></svg>
          </div>
        </div>
      </div>
    `;
  });
  if ((data.habits || []).length === 0) habitsHtml = '<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:10px;">No habits defined.</div>';

  // Today Goals Render
  let goalsListHtml = '';
  (data.todayGoals || []).forEach(g => {
    goalsListHtml += `
      <div class="habit-checkbox-row">
        <span style="font-size:13px; color:var(--text-primary); text-decoration: ${g.checked ? 'line-through' : 'none'}; opacity: ${g.checked ? 0.6 : 1};">${escapeHtml(g.name)}</span>
        <div class="today-goal-circle habit-circle ${g.checked ? 'checked' : ''}" data-goal-id="${g.id}">
          <svg viewBox="0 0 10 10" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,5.5 4,8 8.5,2.5"/></svg>
        </div>
      </div>
    `;
  });
  if ((data.todayGoals || []).length === 0) goalsListHtml = '<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:10px;">No goals for today.</div>';

  // Reading progress
  const docsList = data.library || [];
  let readPct = 0;
  if (docsList.length > 0) {
    let totalP = 0, currentP = 0;
    docsList.forEach(d => {
      totalP += d.pageCount || 1;
      currentP += d.currentPage || 1;
    });
    readPct = Math.round((currentP / totalP) * 100);
  }

  // Quote & Weather
  const quotes = [
    "Focus on being productive instead of busy. — Tim Ferriss",
    "Your focus determines your reality. — Qui-Gon Jinn",
    "The secret of getting ahead is getting started. — Mark Twain",
    "It always seems impossible until it's done. — Nelson Mandela",
    "Action is the foundational key to all success. — Pablo Picasso",
    "Make each day your masterpiece. — John Wooden"
  ];
  const quoteHash = new Date().getDate() % quotes.length;
  const todayQuote = quotes[quoteHash];

  const weatherConds = ['Sunny ☀️ 74°F', 'Partly Cloudy ⛅ 68°F', 'Clear Sky 🌙 62°F', 'Rainy 🌧️ 58°F'];
  const weatherHash = new Date().getHours() % weatherConds.length;
  const weatherText = weatherConds[weatherHash];

  if (!data.settings.homeLayout) data.settings.homeLayout = ['recents', 'tasks', 'plans', 'goals'];

  const renderModule = (id) => {
    let title, content;
    if (id === 'recents') { title = 'Recently Visited'; content = `<div class="home-recent-grid">${recentCardsHtml}</div>`; }
    else if (id === 'tasks') { title = 'Upcoming Tasks'; content = `<div class="home-upcoming-list">${upcomingHtml}</div>`; }
    else if (id === 'plans') { title = 'Plans & Priorities'; content = plansHtml; }
    else if (id === 'goals') { title = 'Goals'; content = goalsHtml; }

    return `
      <div class="home-section modular-section" data-module-id="${id}" style="border: 1px solid transparent; padding: 8px; border-radius: 8px; transition: border 0.2s; background: rgba(0,0,0,0.15);">
        <div class="home-section-header" style="display:flex; align-items:center; cursor: move;" draggable="true">
          <svg class="drag-handle-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px; opacity:0.5; cursor:grab;">
            <circle cx="9" cy="6" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>
          </svg>
          <h3 style="margin:0;">${title}</h3>
        </div>
        ${content}
      </div>
    `;
  };

  const modulesHtml = data.settings.homeLayout.map(renderModule).join('');
  const activeWidgets = data.settings.activeWidgets || ['clock', 'habits', 'goals', 'quote', 'timer', 'reading', 'calendar', 'quick_add'];
  let widgetsHtml = '';
  const displayQuote = data.settings.customQuote || todayQuote;

  activeWidgets.forEach(w => {
    if (w === 'clock') {
      widgetsHtml += `
        <div class="widget-card" data-widget-id="clock">
          <div class="widget-header">
            <span class="widget-title">🕒 Time & Date</span>
          </div>
          <div class="widget-clock" id="dashboard-clock-display">00:00:00</div>
          <div class="widget-date">${dateStr}</div>
          <div class="widget-weather" id="dashboard-weather-display">${weatherText}</div>
        </div>
      `;
    }
    else if (w === 'habits') {
      widgetsHtml += `
        <div class="widget-card" data-widget-id="habits">
          <div class="widget-header">
            <span class="widget-title">🔥 Daily Habits</span>
          </div>
          <div class="widget-body" style="overflow-y:auto; max-height:110px;">
            ${habitsHtml}
          </div>
        </div>
      `;
    }
    else if (w === 'goals') {
      widgetsHtml += `
        <div class="widget-card" data-widget-id="goals">
          <div class="widget-header">
            <span class="widget-title">🎯 Today's Goals</span>
          </div>
          <div class="widget-body">
            <div style="overflow-y:auto; max-height:80px;">
              ${goalsListHtml}
            </div>
            <div style="display:flex; gap:6px; margin-top:10px;">
              <input type="text" id="input-new-today-goal" placeholder="New goal..." style="flex:1; background:var(--bg-input); border:1px solid var(--border-input); border-radius:4px; padding:4px 8px; font-size:12px; color:white; outline:none;">
              <button id="btn-add-today-goal" style="background:var(--accent-blue); border:none; border-radius:4px; padding:4px 10px; color:white; font-size:12px; cursor:pointer;">+</button>
            </div>
          </div>
        </div>
      `;
    }
    else if (w === 'quote') {
      widgetsHtml += `
        <div class="widget-card" data-widget-id="quote" style="justify-content:center;">
          <div class="widget-header">
            <span class="widget-title">💬 Focus Quote</span>
          </div>
          <div style="font-style:italic; font-size:13px; text-align:center; color:var(--text-primary); line-height:1.4; cursor:pointer;" id="home-quote-display" title="Click to customize quote">
            "${escapeHtml(displayQuote)}"
          </div>
        </div>
      `;
    }
    else if (w === 'timer') {
      widgetsHtml += `
        <div class="widget-card" data-widget-id="timer">
          <div class="widget-header">
            <span class="widget-title">⏳ Focus Timer</span>
          </div>
          <div class="widget-body">
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;">
              <div id="study-timer-display" style="font-size:24px; font-weight:600; font-family:monospace; margin-top:8px;">25:00</div>
              <div style="display:flex; gap:6px;">
                <button class="btn-action" id="btn-study-timer-toggle" style="font-size:11px; padding:4px 10px;">Start</button>
                <button class="btn-action" id="btn-study-timer-reset" style="font-size:11px; padding:4px 10px;">Reset</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    else if (w === 'reading') {
      widgetsHtml += `
        <div class="widget-card" data-widget-id="reading" style="align-items:center; justify-content:center;">
          <div class="widget-header" style="width:100%;">
            <span class="widget-title">📚 Reading Progress</span>
          </div>
          <div style="position:relative; width:80px; height:80px; display:flex; align-items:center; justify-content:center;">
            <svg viewBox="0 0 36 36" style="width:100%; height:100%;">
              <path fill="none" stroke="var(--divider)" stroke-width="3" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path fill="none" stroke="var(--accent-blue)" stroke-width="3" stroke-dasharray="${readPct}, 100" stroke-linecap="round" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <div style="position:absolute; font-size:14px; font-weight:600; color:var(--text-primary);">${readPct}%</div>
          </div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:8px;">Completed documents</div>
        </div>
      `;
    }
    else if (w === 'calendar') {
      widgetsHtml += `
        <div class="widget-card" data-widget-id="calendar">
          <div class="widget-header">
            <span class="widget-title">📅 Calendar</span>
          </div>
          <div class="widget-body">
            ${makeMiniCalendarHtml()}
          </div>
        </div>
      `;
    }
    else if (w === 'quick_add') {
      widgetsHtml += `
        <div class="widget-card" data-widget-id="quick_add">
          <div class="widget-header">
            <span class="widget-title">⚡ Quick Add</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
            <button class="btn-action" id="btn-quick-add-task" style="width:100%; padding:6px; font-size:12px; text-align:left; justify-content:flex-start;">+ Add Task</button>
            <button class="btn-action" id="btn-quick-add-note" style="width:100%; padding:6px; font-size:12px; text-align:left; justify-content:flex-start;">+ Add Note</button>
            <button class="btn-action" id="btn-quick-add-contact" style="width:100%; padding:6px; font-size:12px; text-align:left; justify-content:flex-start;">+ Add Contact</button>
          </div>
        </div>
      `;
    }
  });

  const libCount = docsList.length;
  const homeTitle = data.settings.homeTitle || 'Command Center';

  return `${getBannerHtml("home")}
    <div class="page-breadcrumb"><span>Home</span></div>
    <div class="page-title-row">
      <span class="page-title-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg></span>
      <h1 class="page-title" contenteditable="true" spellcheck="false" id="home-title-h1">${escapeHtml(homeTitle)}</h1>
    </div>

    <div class="view-tabs">
      <button class="view-tab active">
        <span class="tab-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
        </svg></span>
        Overview
      </button>
    </div>

    <div class="home-view" style="max-width: none; margin: 16px 0 0 0;">
      <div class="home-hero">
        <div class="home-hero-text">
          <div class="home-greeting">${greeting}, <strong>${escapeHtml(workspaceName)}</strong></div>
          <div class="home-date">${dateStr}</div>
        </div>
      </div>

      <div class="home-stats-row">
        <div class="home-stat-card"><div class="home-stat-number">${totalTasks}</div><div class="home-stat-label">Total Tasks</div></div>
        <div class="home-stat-card"><div class="home-stat-number">${completedTasks}</div><div class="home-stat-label">Completed</div></div>
        <div class="home-stats-row" style="display:contents;">
          <div class="home-stat-card"><div class="home-stat-number">${pendingTasks}</div><div class="home-stat-label">Pending</div></div>
          <div class="home-stat-card"><div class="home-stat-number">${libCount}</div><div class="home-stat-label">Library Docs</div></div>
        </div>
      </div>

      <!-- Command Center Widgets Grid -->
      <div class="dashboard-grid">
        ${widgetsHtml}
      </div>

      <div class="home-section" style="margin-top: 24px; margin-bottom: 24px;">
        <div class="home-section-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h3>Quick Actions</h3>
          <span style="font-size:11px; color:var(--text-muted); opacity:0.6;">Right-click to delete</span>
        </div>
        <div class="home-actions-row">
          ${customActionsHtml}
        </div>
      </div>

      <div class="home-grid" id="home-modules-container">
        ${modulesHtml}
      </div>
    </div>
  `;
}

function bindHomeEvents() {
  const container = document.getElementById('page-content');
  if (!container) return;

  // Home renaming
  const homeTitleEl = document.getElementById('home-title-h1');
  if (homeTitleEl) {
    homeTitleEl.addEventListener('blur', () => {
      const val = homeTitleEl.textContent.trim();
      data.settings.homeTitle = val || 'Command Center';
      saveData();
    });
    homeTitleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        homeTitleEl.blur();
      }
    });
  }

  // Quote editing
  const quoteDisplay = document.getElementById('home-quote-display');
  if (quoteDisplay) {
    quoteDisplay.addEventListener('click', () => {
      showCustomPrompt('Customize Focus Quote', [
        { id: 'quote', label: 'Your Custom Quote', value: data.settings.customQuote || '', placeholder: 'Type your motivational quote...' }
      ], (res) => {
        data.settings.customQuote = res.quote.trim();
        saveData();
        renderPage();
      });
    });
  }

  // Clock Update
  const clockEl = document.getElementById('dashboard-clock-display');
  if (clockEl) {
    const updateTime = () => {
      if (!document.getElementById('dashboard-clock-display')) {
        clearInterval(clockInterval);
        return;
      }
      const n = new Date();
      clockEl.textContent = n.toLocaleTimeString();
    };
    const clockInterval = setInterval(updateTime, 1000);
    updateTime();
  }

  // Habits Clicks
  container.querySelectorAll('.habit-circle[data-habit-id]').forEach(circle => {
    circle.onclick = () => {
      const id = circle.dataset.habitId;
      const habit = (data.habits || []).find(h => h.id === id);
      if (habit) {
        habit.checkedToday = !habit.checkedToday;
        if (habit.checkedToday) {
          habit.streak += 1;
          habit.lastChecked = new Date().toISOString().split('T')[0];
        } else {
          habit.streak = Math.max(0, habit.streak - 1);
        }
        saveData();
        renderPage();
      }
    };
  });

  // Goals Check Clicks
  container.querySelectorAll('.today-goal-circle[data-goal-id]').forEach(circle => {
    circle.onclick = () => {
      const id = circle.dataset.goalId;
      const goal = (data.todayGoals || []).find(g => g.id === id);
      if (goal) {
        goal.checked = !goal.checked;
        saveData();
        renderPage();
      }
    };
  });

  // Add Today's Goal
  const addGoalBtn = document.getElementById('btn-add-today-goal');
  const addGoalInput = document.getElementById('input-new-today-goal');
  if (addGoalBtn && addGoalInput) {
    addGoalBtn.onclick = () => {
      const val = addGoalInput.value.trim();
      if (val) {
        data.todayGoals.push({
          id: 'tg-' + uid(),
          name: val,
          checked: false
        });
        saveData();
        renderPage();
      }
    };
    addGoalInput.onkeydown = (e) => {
      if (e.key === 'Enter') addGoalBtn.click();
    };
  }

  // Study Timer
  const timerDisplay = document.getElementById('study-timer-display');
  const toggleBtn = document.getElementById('btn-study-timer-toggle');
  const resetBtn = document.getElementById('btn-study-timer-reset');
  if (timerDisplay && toggleBtn && resetBtn) {
    let timeLeft = 25 * 60;
    let timerRunning = false;
    let timerInterval = null;
    
    const updateDisplay = () => {
      const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
      const secs = (timeLeft % 60).toString().padStart(2, '0');
      timerDisplay.textContent = `${mins}:${secs}`;
    };
    
    toggleBtn.onclick = () => {
      if (timerRunning) {
        clearInterval(timerInterval);
        toggleBtn.textContent = 'Start';
        timerRunning = false;
      } else {
        timerRunning = true;
        toggleBtn.textContent = 'Pause';
        timerInterval = setInterval(() => {
          if (!document.getElementById('study-timer-display')) {
            clearInterval(timerInterval);
            return;
          }
          if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerRunning = false;
            toggleBtn.textContent = 'Start';
            timeLeft = 25 * 60;
            showToast("Study session complete! Take a break.");
            updateDisplay();
          } else {
            timeLeft--;
            updateDisplay();
          }
        }, 1000);
      }
    };
    
    resetBtn.onclick = () => {
      clearInterval(timerInterval);
      timeLeft = 25 * 60;
      timerRunning = false;
      toggleBtn.textContent = 'Start';
      updateDisplay();
    };
  }

  // Quick Add Buttons
  const qAddTask = document.getElementById('btn-quick-add-task');
  const qAddNote = document.getElementById('btn-quick-add-note');
  const qAddContact = document.getElementById('btn-quick-add-contact');

  if (qAddTask) {
    qAddTask.onclick = () => {
      const listOptions = data.pages.filter(p => p.type === 'tasks').map(p => ({ value: p.id, label: p.name }));
      if (listOptions.length === 0) {
        showToast("Create a Tasks page first!");
        return;
      }
      showCustomPrompt('Quick Add Task', [
        { id: 'name', label: 'Task Name' },
        { id: 'pageId', label: 'Choose list', type: 'select', options: listOptions },
        { id: 'due', label: 'Due Date (e.g. May 15, 2025)' }
      ], (res) => {
        if (!res.name) return;
        const page = getPage(res.pageId);
        if (page) {
          page.tasks.push({
            id: uid(),
            name: res.name,
            due: res.due || '—',
            checked: false
          });
          saveData();
          renderPage();
          showToast("Task added!");
        }
      });
    };
  }

  if (qAddNote) {
    qAddNote.onclick = () => {
      const catOptions = data.settings.categories.map(c => ({ value: c, label: c }));
      showCustomPrompt('Quick Add Note', [
        { id: 'name', label: 'Note Title' },
        { id: 'category', label: 'Select folder', type: 'select', options: catOptions }
      ], (res) => {
        if (!res.name) return;
        const newPage = {
          id: 'page-' + uid(),
          name: res.name,
          category: res.category || 'Notes',
          type: 'notes',
          content: '',
          banner: ''
        };
        data.pages.push(newPage);
        data.recentIds.unshift(newPage.id);
        saveData();
        renderSidebar();
        navigateTo(newPage.id);
        showToast("Note created!");
      });
    };
  }

  if (qAddContact) {
    qAddContact.onclick = () => {
      showCustomPrompt('Quick Add CRM Contact', [
        { id: 'name', label: 'Contact Name' },
        { id: 'stage', label: 'Stage', type: 'select', options: [
            { value: 'Mentor', label: 'Mentor' },
            { value: 'Professional', label: 'Professional' },
            { value: 'Friend', label: 'Friend' },
            { value: 'Family', label: 'Family' }
          ]
        },
        { id: 'notes', label: 'Notes/Details' }
      ], (res) => {
        if (!res.name) return;
        data.crmContacts.push({
          id: 'crm-' + uid(),
          name: res.name,
          stage: res.stage || 'Friend',
          lastContact: new Date().toISOString().split('T')[0],
          frequency: 'monthly',
          notes: res.notes || ''
        });
        saveData();
        renderPage();
        showToast("Contact added!");
      });
    };
  }

  // Quick Action triggers
  container.querySelectorAll('.dynamic-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const target = btn.dataset.target;
      if (type === 'internal') {
        if (target === 'new-page') addNewPage();
        else navigateTo(target);
      } else if (type === 'external') {
        window.open(target, '_blank');
      }
    });
  });

  const addActionBtn = document.getElementById('home-add-action');
  if (addActionBtn) {
    addActionBtn.addEventListener('click', () => {
      const pageOptions = data.pages.map(p => ({ value: p.id, label: 'Page: ' + p.name }));
      pageOptions.unshift({ value: 'custom_url', label: '-- Custom External URL --' });
      pageOptions.push({ value: 'home', label: 'Dashboard Home' });
      pageOptions.push({ value: 'library', label: 'Library' });
      pageOptions.push({ value: 'settings', label: 'Settings' });

      showCustomPrompt('Add Quick Action', [
        { id: 'label', label: 'Action name (e.g. Google)' },
        { id: 'target_type', label: 'Link to', type: 'select', options: pageOptions },
        { id: 'target_url', label: 'External URL (if Custom URL selected)', placeholder: 'https://...' }
      ], (res) => {
        const label = res.label;
        if (!label) return;
        
        let target = res.target_type;
        let type = 'internal';
        
        if (target === 'custom_url') {
          target = res.target_url;
          if (!target) return;
          type = 'external';
          if (!target.startsWith('http')) target = 'https://' + target;
        }
        
        data.settings.quickActions.push({
          id: 'qa-' + uid(),
          type,
          target,
          label,
          icon: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'
        });
        saveData();
        renderPage();
      });
    });
  }

  container.querySelectorAll('.home-inline-textarea').forEach(ta => {
    ta.addEventListener('input', (e) => {
      const pId = ta.dataset.pageId;
      const bId = ta.dataset.blockId;
      const p = getPage(pId);
      if (p && p.plannerBlocks) {
        const b = p.plannerBlocks.find(x => x.id === bId);
        if (b) {
          b.content = ta.value;
          saveData();
        }
      }
    });
  });

  container.querySelectorAll('.home-upcoming-name').forEach(el => {
    el.addEventListener('blur', (e) => {
      const pId = el.dataset.pageId;
      const tId = el.dataset.taskId;
      const p = getPage(pId);
      if (p) {
        const task = p.tasks.find(x => x.id === tId);
        if (task) { task.name = el.textContent; saveData(); }
      }
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  });

  container.querySelectorAll('.task-checkbox').forEach(cb => {
    cb.addEventListener('click', (e) => {
      const pId = cb.dataset.pageId;
      const tId = cb.dataset.taskId;
      const p = getPage(pId);
      if (p) {
        const task = p.tasks.find(x => x.id === tId);
        if (task) {
          task.checked = true;
          // Log task completion in productivity activity
          const todayDate = new Date().toISOString().split('T')[0];
          data.productivityActivity = data.productivityActivity || {};
          data.productivityActivity[todayDate] = (data.productivityActivity[todayDate] || 0) + 1;
          saveData();
          renderPage();
        }
      }
    });
  });

  container.querySelectorAll('.home-recent-card').forEach(card => {
    card.addEventListener('click', () => {
      const pId = card.dataset.pageId;
      if (pId) navigateTo(pId);
    });
  });

  const modulesContainer = document.getElementById('home-modules-container');
  if (!modulesContainer) return;

  let dragSrcEl = null;

  modulesContainer.querySelectorAll('.modular-section').forEach(section => {
    const handle = section.querySelector('.home-section-header');
    handle.addEventListener('dragstart', (e) => {
      dragSrcEl = section;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', section.outerHTML);
      section.style.opacity = '0.4';
    });
    handle.addEventListener('dragend', () => {
      section.style.opacity = '1';
      modulesContainer.querySelectorAll('.modular-section').forEach(s => s.style.border = '1px solid transparent');
    });
  });
  modulesContainer.addEventListener('dragleave', (e) => {
    const dropTarget = e.target.closest('.modular-section');
    if (dropTarget) dropTarget.style.border = '1px solid transparent';
  });

  modulesContainer.addEventListener('drop', (e) => {
    e.stopPropagation();
    const dropTarget = e.target.closest('.modular-section');
    if (dragSrcEl && dropTarget && dragSrcEl !== dropTarget) {
      const srcId = dragSrcEl.dataset.moduleId;
      const targetId = dropTarget.dataset.moduleId;
      const newLayout = data.settings.homeLayout.filter(id => id !== srcId);
      const targetIndex = newLayout.indexOf(targetId);
      const targetRect = dropTarget.getBoundingClientRect();
      const dropY = e.clientY - targetRect.top;
      if (dropY < targetRect.height / 2) newLayout.splice(targetIndex, 0, srcId);
      else newLayout.splice(targetIndex + 1, 0, srcId);
      data.settings.homeLayout = newLayout;
      saveData();
      renderPage();
    }
    return false;
  });
}


// ============================================================
// Settings Tab, Theme, Banners, Pomodoro & Stickies Engines
// ============================================================

function applyTheme() {
  const theme = data.settings.theme || 'dark';
  const themeSubtype = data.settings.themeSubtype || (theme === 'light' ? 'white' : 'charcoal');
  const fontFamily = data.settings.fontFamily || 'sans';
  const accentColor = data.settings.accentColor || 'blue';
  
  const sidebarPosition = data.settings.sidebarPosition || 'left';
  const density = data.settings.density || 'cozy';
  const glassEffects = !!data.settings.glassEffects;

  document.body.classList.toggle('light-theme', theme === 'light');

  // Toggle theme subtypes
  document.body.classList.toggle('theme-oled', theme === 'dark' && themeSubtype === 'oled');
  document.body.classList.toggle('theme-charcoal', theme === 'dark' && themeSubtype === 'charcoal');
  document.body.classList.toggle('theme-white', theme === 'light' && themeSubtype === 'white');
  document.body.classList.toggle('theme-cream', theme === 'light' && themeSubtype === 'cream');

  // Toggle font families
  document.body.classList.toggle('font-sans', fontFamily === 'sans');
  document.body.classList.toggle('font-serif', fontFamily === 'serif');
  document.body.classList.toggle('font-round', fontFamily === 'round');
  document.body.classList.toggle('font-mono', fontFamily === 'mono');

  // Clear custom color inline style property
  document.body.style.removeProperty('--accent-blue');

  // Toggle preset accent colors
  document.body.classList.toggle('accent-blue', accentColor === 'blue');
  document.body.classList.toggle('accent-green', accentColor === 'green');
  document.body.classList.toggle('accent-pink', accentColor === 'pink');
  document.body.classList.toggle('accent-purple', accentColor === 'purple');
  document.body.classList.toggle('accent-yellow', accentColor === 'yellow');
  document.body.classList.toggle('accent-cyan', accentColor === 'cyan');

  // Apply custom accent color if it is a hex value
  if (accentColor.startsWith('#')) {
    document.body.style.setProperty('--accent-blue', accentColor);
  }

  // Toggle advanced layout options
  document.body.classList.toggle('sidebar-right', sidebarPosition === 'right');
  document.body.classList.toggle('layout-compact', density === 'compact');
  document.body.classList.toggle('glass-enabled', glassEffects);
}

function applySidebarState() {
  const sidebar = document.getElementById('sidebar');
  const btnExpand = document.getElementById('btn-expand-sidebar');
  if (!sidebar) return;

  const collapsed = !!data.settings.sidebarCollapsed;
  sidebar.classList.toggle('collapsed', collapsed);
  if (btnExpand) {
    btnExpand.style.display = collapsed ? 'inline-flex' : 'none';
  }
}

function renderSettingsHtml() {
  const settings = data.settings || {};
  const categories = Array.isArray(settings.categories) ? settings.categories : ['To-dos', 'Notes', 'Journal', 'Personal', 'Work'];
  const prof = data.profile || { name: 'User Name', bio: 'Productivity Mode', avatarType: 'initials', avatarUrl: '' };
  
  let categoriesListHtml = '';
  categories.forEach(cat => {
    categoriesListHtml += `
      <div class="settings-cat-item">
        <span class="settings-cat-name">${escapeHtml(cat)}</span>
        <button class="settings-cat-delete-btn" data-cat="${escapeHtml(cat)}" title="Delete Category">&times;</button>
      </div>
    `;
  });

  let profileSectionHtml = `
      <div class="settings-section">
        <h3>User Profile</h3>
        <p class="section-desc" style="margin-bottom: 16px; font-size: 12px; color: var(--text-muted);">
          Customize your name, status bio, and profile picture displayed in the sidebar.
        </p>

        <div style="display: flex; gap: 20px; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap;">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <div id="settings-avatar-preview" style="width: 80px; height: 80px; border-radius: 50%; background: var(--accent-blue); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 32px; border: 2px solid var(--border-input); background-size: cover; background-position: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); ${prof.avatarType === 'image' && prof.avatarUrl ? `background-image: url(${prof.avatarUrl});` : ''}">
              ${prof.avatarType === 'initials' ? (prof.name || 'User Name').charAt(0).toUpperCase() : ''}
            </div>
            <button class="btn-action" id="btn-upload-avatar" style="font-size: 11px; padding: 4px 8px; cursor: pointer;">Upload Photo</button>
          </div>

          <div style="flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 12px;">
            <div>
              <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Profile Name</label>
              <input type="text" id="profile-input-name" value="${escapeHtml(prof.name)}" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 6px; padding: 8px; color: white; outline: none; font-family: var(--font-stack);">
            </div>
            <div>
              <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Status / Bio</label>
              <input type="text" id="profile-input-bio" value="${escapeHtml(prof.bio)}" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 6px; padding: 8px; color: white; outline: none; font-family: var(--font-stack);">
            </div>
            <div>
              <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Avatar Source</label>
              <select id="profile-input-avatar-type" style="width: 100%; background: var(--bg-active); border: 1px solid var(--border-input); border-radius: 6px; padding: 8px; color: white; outline: none; font-family: var(--font-stack);">
                <option value="initials" ${prof.avatarType === 'initials' ? 'selected' : ''}>Name Initial</option>
                <option value="image" ${prof.avatarType === 'image' ? 'selected' : ''}>Custom Photo</option>
              </select>
            </div>
          </div>
        </div>
      </div>
  `;

  return `${getBannerHtml("settings")}
    <div class="settings-view-container">
      <div class="settings-header">
        <h2>Settings</h2>
        <p>Configure your workspace features, theme, cover banners, and sidebar page categories.</p>
      </div>

      ${profileSectionHtml}

      <div class="settings-section">
        <h3>Feature Toggles</h3>
        
        <div class="settings-toggle-row">
          <div class="toggle-control">
            <div class="toggle-label">Pomodoro Timer</div>
            <div class="toggle-desc">Show study timer in the top header bar</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-pomodoro" ${settings.pomodoro ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>

        <div class="settings-toggle-row" id="pomodoro-duration-settings" style="${settings.pomodoro ? '' : 'display: none;'} border-top: 1px solid rgba(255,255,255,0.03); padding-top: 12px; margin-top: -8px;">
          <div class="toggle-control">
            <div class="toggle-label" style="font-size: 13px;">Timer Durations (minutes)</div>
            <div class="toggle-desc">Customize Pomodoro work and break intervals</div>
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 12px; color: var(--text-muted);">Work:</span>
              <input type="number" id="input-pomo-work" value="${settings.pomodoroWorkDuration || 25}" min="1" max="180" style="width: 50px; background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 4px; padding: 4px 6px; color: var(--text-primary); text-align: center; font-family: var(--font-stack); outline: none;">
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 12px; color: var(--text-muted);">Break:</span>
              <input type="number" id="input-pomo-break" value="${settings.pomodoroBreakDuration || 5}" min="1" max="60" style="width: 50px; background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 4px; padding: 4px 6px; color: var(--text-primary); text-align: center; font-family: var(--font-stack); outline: none;">
            </div>
          </div>
        </div>

        <div class="settings-toggle-row">
          <div class="toggle-control">
            <div class="toggle-label">Sticky Notes Widget</div>
            <div class="toggle-desc">Enable draggable, resizable floating notes on screen</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-sticky" ${settings.stickyNotes ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>

        <div class="settings-toggle-row">
          <div class="toggle-control">
            <div class="toggle-label">Page Cover Banners</div>
            <div class="toggle-desc">Enable aesthetic Notion-style header banners on pages</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-banners" ${settings.banners ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h3>Workspace Personalization</h3>
        <p class="section-desc" style="margin-bottom: 16px; font-size: 12px; color: var(--text-muted);">
          Branding, themes, typography, and calendar preferences for this workspace.
        </p>

        <!-- Font Family Cards Selection -->
        <div class="settings-option-group">
          <div class="settings-option-title">Typography & Fonts</div>
          <div class="settings-option-desc">Select the font-family style used across your entire dashboard.</div>
          <div class="settings-grid-cards">
            <div class="settings-card-tile font-option ${settings.fontFamily === 'sans' ? 'active' : ''}" data-font="sans" style="font-family: 'Inter', sans-serif;">
              <span class="settings-card-preview" style="font-family: 'Inter', sans-serif;">Aa</span>
              <span class="settings-card-name">Inter</span>
              <span class="settings-card-desc">Sleek, modern, and highly readable.</span>
            </div>
            <div class="settings-card-tile font-option ${settings.fontFamily === 'serif' ? 'active' : ''}" data-font="serif" style="font-family: 'Playfair Display', serif;">
              <span class="settings-card-preview" style="font-family: 'Playfair Display', serif;">Aa</span>
              <span class="settings-card-name">Playfair</span>
              <span class="settings-card-desc">Classic, elegant editorial typography.</span>
            </div>
            <div class="settings-card-tile font-option ${settings.fontFamily === 'round' ? 'active' : ''}" data-font="round" style="font-family: 'Outfit', sans-serif;">
              <span class="settings-card-preview" style="font-family: 'Outfit', sans-serif;">Aa</span>
              <span class="settings-card-name">Outfit</span>
              <span class="settings-card-desc">Friendly, round, and highly modern.</span>
            </div>
            <div class="settings-card-tile font-option ${settings.fontFamily === 'mono' ? 'active' : ''}" data-font="mono" style="font-family: 'Fira Code', monospace;">
              <span class="settings-card-preview" style="font-family: 'Fira Code', monospace;">Aa</span>
              <span class="settings-card-name">Fira Code</span>
              <span class="settings-card-desc">Technical, precise monospace style.</span>
            </div>
          </div>
        </div>

        <!-- Custom Accent Theme Colors -->
        <div class="settings-option-group">
          <div class="settings-option-title">Accent Brand Color</div>
          <div class="settings-option-desc">Choose the accent highlight color for buttons, links, active pages, and checkmarks.</div>
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <div class="settings-color-bubbles" style="margin-bottom: 0;">
              <div class="color-bubble accent-option blue ${settings.accentColor === 'blue' ? 'active' : ''}" data-color="blue" style="background-color: #097fe8;" title="Classic Blue"></div>
              <div class="color-bubble accent-option green ${settings.accentColor === 'green' ? 'active' : ''}" data-color="green" style="background-color: #10b981;" title="Emerald Green"></div>
              <div class="color-bubble accent-option pink ${settings.accentColor === 'pink' ? 'active' : ''}" data-color="pink" style="background-color: #ec4899;" title="Sakura Pink"></div>
              <div class="color-bubble accent-option purple ${settings.accentColor === 'purple' ? 'active' : ''}" data-color="purple" style="background-color: #8b5cf6;" title="Violet Purple"></div>
              <div class="color-bubble accent-option yellow ${settings.accentColor === 'yellow' ? 'active' : ''}" data-color="yellow" style="background-color: #f59e0b;" title="Amber Yellow"></div>
              <div class="color-bubble accent-option cyan ${settings.accentColor === 'cyan' ? 'active' : ''}" data-color="cyan" style="background-color: #14b8a6;" title="Teal Cyan"></div>
              
              <!-- Custom Color Picker Bubble Wrapper -->
              <div class="color-picker-wrapper ${String(settings.accentColor).startsWith('#') ? 'active' : ''}" id="custom-color-picker-wrapper" title="Pick Custom Color">
                <input type="color" id="input-custom-color" value="${String(settings.accentColor).startsWith('#') ? settings.accentColor : '#097fe8'}">
              </div>
            </div>
            ${String(settings.accentColor).startsWith('#') ? `<span class="custom-color-label" style="font-size: 11px; font-family: var(--font-stack); padding: 4px 8px; background: var(--bg-active); border-radius: 4px; border: 1px solid var(--border-input); color: var(--text-primary); font-weight: 500;">Custom: ${settings.accentColor}</span>` : ''}
          </div>
        </div>

        <!-- Theme Mode Subtypes selection -->
        <div class="settings-option-group">
          <div class="settings-option-title">Theme Variations</div>
          <div class="settings-option-desc">Switch between various dark and light mode designs.</div>
          
          <div style="font-size: 11px; text-transform: uppercase; color: var(--text-section); letter-spacing: 0.05em; font-weight: 600; margin-bottom: 8px;">Dark Modes</div>
          <div class="settings-grid-cards" style="margin-bottom: 16px;">
            <div class="settings-card-tile theme-option ${settings.theme === 'dark' && settings.themeSubtype === 'charcoal' ? 'active' : ''}" data-theme="dark" data-subtype="charcoal" style="background-color: #191919; border: 1px solid rgba(255,255,255,0.08);">
              <span class="settings-card-name" style="color: #ffffff;">Charcoal Dark</span>
              <span class="settings-card-desc" style="color: #8a8a8a;">Default elegant deep grey interface.</span>
            </div>
            <div class="settings-card-tile theme-option ${settings.theme === 'dark' && settings.themeSubtype === 'oled' ? 'active' : ''}" data-theme="dark" data-subtype="oled" style="background-color: #000000; border: 1px solid rgba(255,255,255,0.15);">
              <span class="settings-card-name" style="color: #ffffff;">OLED Pitch Black</span>
              <span class="settings-card-desc" style="color: #888888;">Pure black theme. Great for OLED screens.</span>
            </div>
          </div>

          <div style="font-size: 11px; text-transform: uppercase; color: var(--text-section); letter-spacing: 0.05em; font-weight: 600; margin-bottom: 8px;">Light Modes</div>
          <div class="settings-grid-cards">
            <div class="settings-card-tile theme-option ${settings.theme === 'light' && settings.themeSubtype === 'white' ? 'active' : ''}" data-theme="light" data-subtype="white" style="background-color: #ffffff; border: 1px solid rgba(0,0,0,0.1);">
              <span class="settings-card-name" style="color: #1c1c1a;">Clean White</span>
              <span class="settings-card-desc" style="color: #5c5c5a;">Crisp, bright, and classic interface.</span>
            </div>
            <div class="settings-card-tile theme-option ${settings.theme === 'light' && settings.themeSubtype === 'cream' ? 'active' : ''}" data-theme="light" data-subtype="cream" style="background-color: #faf8f5; border: 1px solid rgba(43,38,31,0.15);">
              <span class="settings-card-name" style="color: #2b261f;">Soft Cream</span>
              <span class="settings-card-desc" style="color: #6b6357;">Warm, sepia tone. Gentle on the eyes.</span>
            </div>
          </div>
        </div>

        <!-- Layout & Aesthetics settings -->
        <div class="settings-option-group">
          <div class="settings-option-title">Sidebar Position</div>
          <div class="settings-option-desc">Choose whether the navigation sidebar is docked on the left or right side of the window.</div>
          <div class="settings-segmented-control">
            <button class="segmented-btn position-option ${settings.sidebarPosition === 'left' ? 'active' : ''}" data-position="left">Left</button>
            <button class="segmented-btn position-option ${settings.sidebarPosition === 'right' ? 'active' : ''}" data-position="right">Right</button>
          </div>
        </div>

        <div class="settings-option-group">
          <div class="settings-option-title">Spacing Density</div>
          <div class="settings-option-desc">Adjust the padding and layout spacing of lists, page views, and tables.</div>
          <div class="settings-segmented-control">
            <button class="segmented-btn density-option ${settings.density === 'cozy' ? 'active' : ''}" data-density="cozy">Cozy Default</button>
            <button class="segmented-btn density-option ${settings.density === 'compact' ? 'active' : ''}" data-density="compact">Compact</button>
          </div>
        </div>

        <div class="settings-option-group">
          <div class="settings-option-title">Frosted Glass Sidebar</div>
          <div class="settings-option-desc">Enable frosted glass translucent blur on the navigation sidebar.</div>
          <div class="settings-toggle-row" style="border-bottom: none; padding: 0;">
            <div class="toggle-control" style="padding-bottom: 0;">
              <div class="toggle-label" style="font-size: 13px;">Glassmorphism Backdrop</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="toggle-glass" ${settings.glassEffects ? 'checked' : ''}>
              <span class="slider round"></span>
            </label>
          </div>
        </div>

        <!-- Calendar Week Start Day settings -->
        <div class="settings-option-group">
          <div class="settings-option-title">Calendar Start Day</div>
          <div class="settings-option-desc">Set whether the calendar week starts on Sunday or Monday.</div>
          <div class="settings-segmented-control">
            <button class="segmented-btn weekstart-option ${settings.weekStart === 'sunday' ? 'active' : ''}" data-start="sunday">Sunday</button>
            <button class="segmented-btn weekstart-option ${settings.weekStart === 'monday' ? 'active' : ''}" data-start="monday">Monday</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Page Categories</h3>
        <p class="section-desc">Add or delete categories used to group your private pages in the sidebar.</p>
        <div class="settings-cat-list">
          ${categoriesListHtml}
        </div>
        <div class="settings-cat-add-row">
          <input type="text" id="input-new-cat" placeholder="Add custom category..." autocomplete="off">
          <button class="btn-primary" id="btn-add-cat">Add</button>
        </div>
      </div>
    </div>
  `;
}

function bindSettingsEvents() {
  if (!data.settings) data.settings = {};
  if (!Array.isArray(data.settings.categories)) {
    data.settings.categories = ['To-dos', 'Notes', 'Journal', 'Personal', 'Work'];
  }
  if (!data.profile) {
    data.profile = { name: 'User Name', bio: 'Productivity Mode', avatarType: 'initials', avatarUrl: '' };
  }

  // Profile Customization Listeners
  const profileNameInput = document.getElementById('profile-input-name');
  const profileBioInput = document.getElementById('profile-input-bio');
  const profileAvatarType = document.getElementById('profile-input-avatar-type');
  
  if (profileNameInput) {
    profileNameInput.addEventListener('input', () => {
      data.profile.name = profileNameInput.value.trim() || 'User Name';
      saveData();
      updateSidebarProfile();
      updateSettingsAvatarPreview();
    });
  }

  if (profileBioInput) {
    profileBioInput.addEventListener('input', () => {
      data.profile.bio = profileBioInput.value.trim() || 'Productivity Mode';
      saveData();
      updateSidebarProfile();
    });
  }

  if (profileAvatarType) {
    profileAvatarType.addEventListener('change', () => {
      data.profile.avatarType = profileAvatarType.value;
      saveData();
      updateSidebarProfile();
      updateSettingsAvatarPreview();
    });
  }

  const uploadBtn = document.getElementById('btn-upload-avatar');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.onchange = () => {
        if (fileInput.files && fileInput.files[0]) {
          const file = fileInput.files[0];
          const reader = new FileReader();
          reader.onload = (e) => {
            data.profile.avatarUrl = e.target.result;
            data.profile.avatarType = 'image';
            if (profileAvatarType) profileAvatarType.value = 'image';
            saveData();
            updateSidebarProfile();
            updateSettingsAvatarPreview();
          };
          reader.readAsDataURL(file);
        }
      };
      fileInput.click();
    });
  }

  const togglePomodoro = document.getElementById('toggle-pomodoro');
  const btnRestoreHome = document.getElementById('btn-restore-home');
  if (btnRestoreHome) {
    btnRestoreHome.onclick = () => {
      data.settings.homeLayout = ['recents', 'tasks', 'plans', 'goals'];
      saveData();
      showToast('Home widgets restored');
    };
  }
  const toggleSticky = document.getElementById('toggle-sticky');
  const toggleBanners = document.getElementById('toggle-banners');
  const btnAddCat = document.getElementById('btn-add-cat');
  const inputNewCat = document.getElementById('input-new-cat');

  if (togglePomodoro) {
    togglePomodoro.addEventListener('change', () => {
      data.settings.pomodoro = togglePomodoro.checked;
      const durationRow = document.getElementById('pomodoro-duration-settings');
      if (durationRow) {
        durationRow.style.display = togglePomodoro.checked ? 'flex' : 'none';
      }
      saveData();
      initPomodoroTimer();
      showToast('Pomodoro Timer toggled');
    });
  }

  const inputPomoWork = document.getElementById('input-pomo-work');
  const inputPomoBreak = document.getElementById('input-pomo-break');

  if (inputPomoWork) {
    inputPomoWork.addEventListener('change', () => {
      let val = parseInt(inputPomoWork.value, 10);
      if (isNaN(val) || val < 1) val = 25;
      data.settings.pomodoroWorkDuration = val;
      saveData();
      initPomodoroTimer();
      showToast('Work duration updated');
    });
  }

  if (inputPomoBreak) {
    inputPomoBreak.addEventListener('change', () => {
      let val = parseInt(inputPomoBreak.value, 10);
      if (isNaN(val) || val < 1) val = 5;
      data.settings.pomodoroBreakDuration = val;
      saveData();
      initPomodoroTimer();
      showToast('Break duration updated');
    });
  }

  if (toggleSticky) {
    toggleSticky.addEventListener('change', () => {
      data.settings.stickyNotes = toggleSticky.checked;
      saveData();
      initStickyNotesPad();
      showToast('Sticky Notes toggled');
    });
  }

  if (toggleBanners) {
    toggleBanners.addEventListener('change', () => {
      data.settings.banners = toggleBanners.checked;
      saveData();
      renderPage();
      showToast('Page Banners toggled');
    });
  }

  // Workspace Personalization Bindings
  document.querySelectorAll('.font-option').forEach(card => {
    card.addEventListener('click', () => {
      const font = card.dataset.font;
      data.settings.fontFamily = font;
      saveData();
      applyTheme();
      
      // Update active class on cards
      document.querySelectorAll('.font-option').forEach(c => c.classList.toggle('active', c.dataset.font === font));
      showToast(`Font updated to ${font.charAt(0).toUpperCase() + font.slice(1)}`);
    });
  });

  document.querySelectorAll('.accent-option').forEach(bubble => {
    bubble.addEventListener('click', () => {
      const color = bubble.dataset.color;
      data.settings.accentColor = color;
      saveData();
      applyTheme();
      renderPage();
      showToast(`Accent color updated to ${color.charAt(0).toUpperCase() + color.slice(1)}`);
    });
  });

  const inputCustomColor = document.getElementById('input-custom-color');
  if (inputCustomColor) {
    inputCustomColor.addEventListener('input', (e) => {
      const color = e.target.value;
      data.settings.accentColor = color;
      saveData();
      applyTheme();
      
      const wrapper = document.getElementById('custom-color-picker-wrapper');
      if (wrapper) wrapper.classList.add('active');
      document.querySelectorAll('.accent-option').forEach(b => b.classList.remove('active'));
    });
    inputCustomColor.addEventListener('change', () => {
      renderPage();
      showToast(`Custom accent color applied`);
    });
  }

  document.querySelectorAll('.position-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const position = btn.dataset.position;
      data.settings.sidebarPosition = position;
      saveData();
      applyTheme();
      renderPage();
      showToast(`Sidebar moved to the ${position}`);
    });
  });

  document.querySelectorAll('.density-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const density = btn.dataset.density;
      data.settings.density = density;
      saveData();
      applyTheme();
      renderPage();
      showToast(`Spacing density set to ${density}`);
    });
  });

  const toggleGlass = document.getElementById('toggle-glass');
  if (toggleGlass) {
    toggleGlass.addEventListener('change', () => {
      data.settings.glassEffects = toggleGlass.checked;
      saveData();
      applyTheme();
      showToast(toggleGlass.checked ? 'Glassmorphism enabled' : 'Glassmorphism disabled');
    });
  }

  document.querySelectorAll('.weekstart-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const start = btn.dataset.start;
      data.settings.weekStart = start;
      saveData();
      
      // Update active class on buttons
      document.querySelectorAll('.weekstart-option').forEach(b => b.classList.toggle('active', b.dataset.start === start));
      showToast(`Calendar week start updated to ${start.charAt(0).toUpperCase() + start.slice(1)}`);
      
      // If we are currently viewing tasks in calendar layout, re-render it
      if (data.activeView === 'calendar') {
        renderCalendar();
      }
    });
  });

  document.querySelectorAll('.theme-option').forEach(card => {
    card.addEventListener('click', () => {
      const theme = card.dataset.theme;
      const subtype = card.dataset.subtype;
      data.settings.theme = theme;
      data.settings.themeSubtype = subtype;
      saveData();
      applyTheme();
      renderSidebar();
      
      // Update active class on cards
      document.querySelectorAll('.theme-option').forEach(c => {
        const isMatch = c.dataset.theme === theme && c.dataset.subtype === subtype;
        c.classList.toggle('active', isMatch);
      });
      
      showToast(`Theme variation updated`);
    });
  });

  if (btnAddCat && inputNewCat) {
    const handleAdd = () => {
      const name = inputNewCat.value.trim();
      if (!name) return;
      if (data.settings.categories.includes(name)) {
        showToast('Category already exists!');
        return;
      }
      data.settings.categories.push(name);
      saveData();
      renderSidebar();
      renderPage();
      showToast(`Category "${name}" created`);
    };

    btnAddCat.addEventListener('click', handleAdd);
    inputNewCat.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAdd();
    });
  }

  const catList = document.querySelector('.settings-cat-list');
  if (catList) {
    catList.addEventListener('click', (e) => {
      const btn = e.target.closest('.settings-cat-delete-btn');
      if (btn) {
        const cat = btn.dataset.cat;
        data.settings.categories = data.settings.categories.filter(c => c !== cat);
        
        // Migrate pages in deleted category to 'To-dos'
        data.pages.forEach(p => {
          if (p.category === cat) {
            p.category = 'To-dos';
          }
        });
        
        saveData();
        renderSidebar();
        renderPage();
        showToast(`Category "${cat}" removed`);
      }
    });
  }
}

// ============================================================
// Cover Photo Banner Picker (Notion-style + Custom Upload)
// ============================================================

function openCoverPicker(button) {
  let picker = document.getElementById('cover-picker-popup');
  if (picker) picker.remove();

  picker = document.createElement('div');
  picker.id = 'cover-picker-popup';
  picker.className = 'cover-picker-popup';
  
  const gradients = ['Sunset', 'Ocean', 'Emerald', 'Cosmic', 'Nordic'];
  let itemsHtml = '';
  gradients.forEach(g => {
    itemsHtml += `
      <div class="cover-picker-item" data-gradient="${g}">
        <span class="cover-picker-preview ${g.toLowerCase()}"></span>
        <span class="cover-picker-name">${g}</span>
      </div>
    `;
  });
  
  // Add custom upload option
  itemsHtml += `
    <div class="cover-picker-item" id="cover-upload-option">
      <span class="cover-picker-preview" style="background: linear-gradient(135deg, #666 0%, #333 100%); display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span>
      <span class="cover-picker-name">Upload image</span>
    </div>
  `;
  
  picker.innerHTML = itemsHtml;
  document.body.appendChild(picker);
  
  const rect = button.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.left = `${rect.left}px`;
  picker.style.top = `${rect.bottom + window.scrollY + 6}px`;
  picker.style.zIndex = '10200';
  
  // Gradient selection
  picker.querySelectorAll('.cover-picker-item[data-gradient]').forEach(item => {
    item.addEventListener('click', () => {
      const gradient = item.dataset.gradient;
      const isPseudo = ['library', 'settings', 'home'].includes(data.activePageId);
      const page = getActivePage();
      if (page || isPseudo) {
        if (isPseudo) {
          if (!data.settings.pseudoBanners) data.settings.pseudoBanners = {};
          data.settings.pseudoBanners[data.activePageId] = gradient;
        } else {
          page.banner = gradient;
        }
        saveData();
        renderPage();
      }
      picker.remove();
    });
  });
  
  // Custom image upload
  const uploadOption = picker.querySelector('#cover-upload-option');
  if (uploadOption) {
    uploadOption.addEventListener('click', () => {
      picker.remove();
      
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
          showToast('Please select an image file');
          return;
        }
        
        const reader = new FileReader();
        reader.onload = function(ev) {
          const isPseudo = ['library', 'settings', 'home'].includes(data.activePageId);
          const page = getActivePage();
          if (page || isPseudo) {
            if (isPseudo) {
              if (!data.settings.pseudoBanners) data.settings.pseudoBanners = {};
              data.settings.pseudoBanners[data.activePageId] = ev.target.result;
            } else {
              page.banner = ev.target.result; // base64 data URL
            }
            saveData();
            renderPage();
            showToast('Custom cover applied');
          }
        };
        reader.readAsDataURL(file);
      };
      
      fileInput.click();
    });
  }
  
  const closeHandler = (e) => {
    if (!picker.contains(e.target) && e.target !== button) {
      picker.remove();
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
}

// ============================================================
// Pomodoro Timer Engine (Header bar)
// ============================================================

let pomodoroSeconds = 25 * 60;
let pomodoroInterval = null;
let pomodoroMode = 'work'; // 'work' or 'break'
let pomodoroIsRunning = false;

function initPomodoroTimer() {
  const container = document.getElementById('header-pomodoro-container');
  if (!container) return;

  if (!data.settings.pomodoro) {
    container.style.display = 'none';
    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
    pomodoroIsRunning = false;
    return;
  }

  // Set initial seconds from settings if not running
  if (!pomodoroIsRunning) {
    const workMin = data.settings.pomodoroWorkDuration || 25;
    const breakMin = data.settings.pomodoroBreakDuration || 5;
    pomodoroSeconds = (pomodoroMode === 'work' ? workMin : breakMin) * 60;
  }

  container.style.display = 'flex';
  renderPomodoroWidget();
}

function renderPomodoroWidget() {
  const container = document.getElementById('header-pomodoro-container');
  if (!container) return;

  const minutes = Math.floor(pomodoroSeconds / 60);
  const seconds = pomodoroSeconds % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  const playIcon = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  const pauseIcon = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

  container.innerHTML = `
    <div class="pomodoro-widget" id="pomodoro-widget-draggable" style="cursor: move; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
      <span class="pomo-status ${pomodoroMode}">${pomodoroMode === 'work' ? 'Work' : 'Break'}</span>
      <span class="pomo-time">${timeStr}</span>
      <button class="pomo-control-btn" id="btn-pomo-toggle" title="${pomodoroIsRunning ? 'Pause' : 'Start'}">
        ${pomodoroIsRunning ? pauseIcon : playIcon}
      </button>
      <button class="pomo-control-btn" id="btn-pomo-reset" title="Reset">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg>
      </button>
    </div>
  `;
  makePomodoroDraggable();


  document.getElementById('btn-pomo-toggle').addEventListener('click', togglePomodoro);
  document.getElementById('btn-pomo-reset').addEventListener('click', resetPomodoro);
}


function makePomodoroDraggable() {
  const widget = document.getElementById('pomodoro-widget-draggable');
  const container = document.getElementById('header-pomodoro-container');
  if (!widget || !container) return;

  if (container.style.position !== 'fixed') {
    container.style.position = 'fixed';
    container.style.zIndex = '9999';
    if (data.settings.pomodoroPos) {
      container.style.left = data.settings.pomodoroPos.x + 'px';
      container.style.top = data.settings.pomodoroPos.y + 'px';
      container.style.right = 'auto';
    } else {
      container.style.top = '20px';
      container.style.right = '20px';
    }
  }

  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  widget.addEventListener('mousedown', (e) => {
    if (e.target.closest('.pomo-control-btn')) return;
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    const rect = container.getBoundingClientRect();
    initialLeft = rect.left; initialTop = rect.top;
    container.style.right = 'auto'; container.style.bottom = 'auto';
    container.style.left = initialLeft + 'px'; container.style.top = initialTop + 'px';
    widget.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    let newX = initialLeft + (e.clientX - startX);
    let newY = initialTop + (e.clientY - startY);
    newX = Math.max(0, Math.min(newX, window.innerWidth - container.offsetWidth));
    newY = Math.max(0, Math.min(newY, window.innerHeight - container.offsetHeight));
    container.style.left = newX + 'px';
    container.style.top = newY + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      widget.style.cursor = 'move';
      document.body.style.userSelect = '';
      if (!data.settings) data.settings = {};
      data.settings.pomodoroPos = { x: parseInt(container.style.left, 10), y: parseInt(container.style.top, 10) };
      saveData();
    }
  });
}
function togglePomodoro() {
  if (pomodoroIsRunning) {
    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
    pomodoroIsRunning = false;
  } else {
    pomodoroIsRunning = true;
    pomodoroInterval = setInterval(() => {
      pomodoroSeconds--;
      if (pomodoroSeconds < 0) {
        playTimerChime();
        if (pomodoroMode === 'work') {
          pomodoroMode = 'break';
          pomodoroSeconds = (data.settings.pomodoroBreakDuration || 5) * 60;
          showToast("Work cycle finished! Time for a break.");
        } else {
          pomodoroMode = 'work';
          pomodoroSeconds = (data.settings.pomodoroWorkDuration || 25) * 60;
          showToast("Break cycle finished! Back to work.");
        }
      }
      renderPomodoroWidget();
    }, 1000);
  }
  renderPomodoroWidget();
}

function resetPomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroInterval = null;
  pomodoroIsRunning = false;
  pomodoroMode = 'work';
  pomodoroSeconds = (data.settings.pomodoroWorkDuration || 25) * 60;
  renderPomodoroWidget();
}

function playTimerChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Low tone (C5)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); 
    gain1.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.3);
    
    // High tone (E5) slightly offset
    setTimeout(() => {
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime);
      gain2.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start();
      osc2.stop(audioCtx.currentTime + 0.4);
    }, 150);
  } catch (e) {
    console.error("Audio timer chime error:", e);
  }
}

// ============================================================
// Draggable Floating Sticky Notes Engine
// ============================================================

function initStickyNotesPad() {
  const toggleBtn = document.getElementById('btn-sticky-toggle');
  const drawer = document.getElementById('sticky-pad-drawer');
  
  if (!toggleBtn || !drawer) return;

  if (!data.settings.stickyNotes) {
    toggleBtn.style.display = 'none';
    drawer.style.display = 'none';
    document.querySelectorAll('.floating-sticky-note').forEach(n => n.remove());
    return;
  }

  toggleBtn.style.display = 'flex';
  
  toggleBtn.onclick = () => {
    const isHidden = drawer.style.display === 'none';
    drawer.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) renderStickiesDrawer();
  };

  document.getElementById('btn-sticky-add').onclick = () => {
    createStickyNote();
  };

  renderAllStickyNotes();
}

function renderStickiesDrawer() {
  const drawer = document.getElementById('sticky-pad-drawer');
  if (!drawer) return;

  let listEl = drawer.querySelector('.sticky-pad-content');
  if (!listEl) {
    listEl = document.createElement('div');
    listEl.className = 'sticky-pad-content';
    drawer.appendChild(listEl);
  }

  listEl.innerHTML = '';
  if (data.stickies.length === 0) {
    listEl.innerHTML = '<div style="font-size: 11px; color: var(--text-section); text-align: center; padding: 12px 0;">No active stickies.</div>';
  } else {
    data.stickies.forEach(note => {
      const summary = note.text.trim().substring(0, 20) || 'Empty Sticky';
      const item = document.createElement('div');
      item.className = `sticky-drawer-item ${note.color}`;
      item.innerHTML = `
        <span class="sticky-drawer-text">${escapeHtml(summary)}</span>
        <button class="sticky-drawer-del-btn" data-id="${note.id}">&times;</button>
      `;
      
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('sticky-drawer-del-btn')) {
          e.stopPropagation();
          deleteStickyNote(note.id);
          return;
        }
        const noteEl = document.getElementById(`sticky-${note.id}`);
        if (noteEl) {
          noteEl.style.zIndex = getMaxStickyZIndex() + 1;
          noteEl.querySelector('textarea').focus();
        }
      });
      listEl.appendChild(item);
    });
  }
}

function renderAllStickyNotes() {
  document.querySelectorAll('.floating-sticky-note').forEach(n => n.remove());
  data.stickies.forEach(note => {
    drawStickyNoteElement(note);
  });
}

function createStickyNote() {
  const id = uid();
  const colors = ['yellow', 'pink', 'teal', 'purple'];
  const note = {
    id: id,
    text: '',
    color: colors[data.stickies.length % colors.length],
    x: 180 + (data.stickies.length * 25) % 250,
    y: 120 + (data.stickies.length * 25) % 250,
    w: 180,
    h: 180
  };

  data.stickies.push(note);
  saveData();
  drawStickyNoteElement(note);
  renderStickiesDrawer();
}

function deleteStickyNote(id) {
  data.stickies = data.stickies.filter(n => n.id !== id);
  saveData();
  const el = document.getElementById(`sticky-${id}`);
  if (el) el.remove();
  renderStickiesDrawer();
}

function getMaxStickyZIndex() {
  let maxZ = 1000;
  document.querySelectorAll('.floating-sticky-note').forEach(el => {
    const z = parseInt(el.style.zIndex);
    if (!isNaN(z) && z > maxZ) maxZ = z;
  });
  return maxZ;
}

function drawStickyNoteElement(note) {
  const div = document.createElement('div');
  div.className = `floating-sticky-note ${note.color}`;
  div.id = `sticky-${note.id}`;
  div.style.left = `${note.x}px`;
  div.style.top = `${note.y}px`;
  div.style.width = `${note.w}px`;
  div.style.height = `${note.h}px`;
  div.style.zIndex = getMaxStickyZIndex() + 1;

  div.innerHTML = `
    <div class="sticky-header-bar">
      <span class="sticky-drag-handle"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg></span>
      <div class="sticky-header-actions">
        <button class="sticky-color-dot yellow" data-color="yellow"></button>
        <button class="sticky-color-dot pink" data-color="pink"></button>
        <button class="sticky-color-dot teal" data-color="teal"></button>
        <button class="sticky-color-dot purple" data-color="purple"></button>
        <button class="sticky-del-btn" title="Delete note">&times;</button>
      </div>
    </div>
    <div class="sticky-body-area">
      <textarea placeholder="Write note...">${escapeHtml(note.text || '')}</textarea>
    </div>
  `;

  div.addEventListener('mousedown', () => {
    div.style.zIndex = getMaxStickyZIndex() + 1;
  });

  const textarea = div.querySelector('textarea');
  textarea.addEventListener('input', () => {
    note.text = textarea.value;
    saveData();
    renderStickiesDrawer();
  });

  div.querySelectorAll('.sticky-color-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      div.className = `floating-sticky-note ${color}`;
      note.color = color;
      saveData();
      renderStickiesDrawer();
    });
  });

  div.querySelector('.sticky-del-btn').addEventListener('click', () => {
    deleteStickyNote(note.id);
  });

  const handle = div.querySelector('.sticky-drag-handle');
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = note.x;
    const initialY = note.y;

    const onMouseMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      note.x = initialX + dx;
      note.y = initialY + dy;
      
      if (note.x < 0) note.x = 0;
      if (note.y < 0) note.y = 0;

      div.style.left = `${note.x}px`;
      div.style.top = `${note.y}px`;
    };

    const onMouseUp = () => {
      saveData();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  document.body.appendChild(div);
}

// ============================================================
// Sidebar Event Bindings & Init
// ============================================================

document.getElementById('nav-add-private')?.addEventListener('click', (e) => {
  e.stopPropagation();
  addNewPage();
});

const navLibBtn = document.getElementById('nav-library');
if (navLibBtn) {
  navLibBtn.addEventListener('click', () => {
    navigateTo('library');
  });
}

const navHomeBtn = document.getElementById('nav-home');
if (navHomeBtn) {
  navHomeBtn.addEventListener('click', () => {
    navigateTo('home');
  });
}

const navSettingsBtn = document.getElementById('nav-settings');
if (navSettingsBtn) {
  navSettingsBtn.addEventListener('click', () => {
    navigateTo('settings');
  });
}

const sidebarProfileCard = document.getElementById('sidebar-profile-card');
if (sidebarProfileCard) {
  sidebarProfileCard.addEventListener('click', () => {
    navigateTo('settings');
  });
}


function initSidebarSearch() {
  const wsNameSpan = document.getElementById('workspace-name-span');
  const wsLogoLetter = document.getElementById('workspace-logo-letter');
  if (wsNameSpan && wsLogoLetter) {
    wsNameSpan.textContent = data.settings.workspaceName || 'Workspace';
    wsLogoLetter.textContent = (data.settings.workspaceName || 'W').charAt(0).toUpperCase();
    wsNameSpan.onblur = () => {
      data.settings.workspaceName = wsNameSpan.textContent.trim() || 'Workspace';
      wsLogoLetter.textContent = data.settings.workspaceName.charAt(0).toUpperCase();
      saveData();
      updateFavicon();
      if (data.activePageId === 'home') renderPage();
    };
    wsNameSpan.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); wsNameSpan.blur(); } };
  }

  const btnCollapse = document.getElementById('btn-collapse-sidebar');
  const btnExpand = document.getElementById('btn-expand-sidebar');

  if (btnCollapse) {
    btnCollapse.addEventListener('click', () => {
      data.settings.sidebarCollapsed = true;
      saveData();
      applySidebarState();
    });
  }

  if (btnExpand) {
    btnExpand.addEventListener('click', () => {
      data.settings.sidebarCollapsed = false;
      saveData();
      applySidebarState();
    });
  }

  const sidebarDragEl = document.getElementById('sidebar');
  if (sidebarDragEl && !sidebarDragEl.dataset.dragBound) {
    sidebarDragEl.dataset.dragBound = 'true';
    let draggedPageId = null;

    sidebarDragEl.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.sidebar-item');
      if (!item || !item.dataset.pageId) {
        e.preventDefault();
        return;
      }
      draggedPageId = item.dataset.pageId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedPageId);
      item.style.opacity = '0.5';
    });

    sidebarDragEl.addEventListener('dragend', (e) => {
      const item = e.target.closest('.sidebar-item');
      if (item) item.style.opacity = '1';
      sidebarDragEl.querySelectorAll('.sidebar-item').forEach(el => el.style.borderTop = '');
      sidebarDragEl.querySelectorAll('.sidebar-category-header').forEach(el => el.style.borderBottom = '');
    });

    sidebarDragEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      sidebarDragEl.querySelectorAll('.sidebar-item').forEach(el => el.style.borderTop = '');
      sidebarDragEl.querySelectorAll('.sidebar-category-header').forEach(el => el.style.borderBottom = '');

      const targetItem = e.target.closest('.sidebar-item');
      if (targetItem && targetItem.dataset.pageId !== draggedPageId) {
        targetItem.style.borderTop = '2px solid var(--text-primary)';
      } else {
        const catHeader = e.target.closest('.sidebar-category-header');
        if (catHeader) {
          catHeader.style.borderBottom = '2px solid var(--text-primary)';
        }
      }
    });

    sidebarDragEl.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sidebarDragEl.querySelectorAll('.sidebar-item').forEach(el => el.style.borderTop = '');
      sidebarDragEl.querySelectorAll('.sidebar-category-header').forEach(el => el.style.borderBottom = '');
      
      if (!draggedPageId) return;

      const targetItem = e.target.closest('.sidebar-item');
      const catHeader = e.target.closest('.sidebar-category-header');
      
      const draggedIndex = data.pages.findIndex(p => p.id === draggedPageId);
      if (draggedIndex === -1) return;
      const draggedPage = data.pages[draggedIndex];

      if (targetItem) {
        const targetPageId = targetItem.dataset.pageId;
        if (targetPageId === draggedPageId) return;
        
        const targetIndex = data.pages.findIndex(p => p.id === targetPageId);
        if (targetIndex === -1) return;
        
        const targetPage = data.pages[targetIndex];
        
        data.pages.splice(draggedIndex, 1);
        draggedPage.category = targetPage.category;
        
        const newIndex = data.pages.findIndex(p => p.id === targetPageId);
        data.pages.splice(newIndex, 0, draggedPage);
        
        saveData();
        renderSidebar();
      } else if (catHeader) {
        const catNameSpan = catHeader.querySelector('.category-title-text');
        if (catNameSpan) {
          const catName = catNameSpan.textContent.trim();
          draggedPage.category = catName;
          saveData();
          renderSidebar();
        }
      }
      
      draggedPageId = null;
    });
  }

  const recentsToggle = document.getElementById('header-recents-toggle');
  if (recentsToggle) {
    recentsToggle.onclick = () => {
      if (collapsedCategories.has('__recents__')) {
        collapsedCategories.delete('__recents__');
      } else {
        collapsedCategories.add('__recents__');
      }
      saveCollapsedCategories();
      renderSidebar();
    };
  }
  
  // Cleanup old floating library panel bindings

  const btnSearch = document.getElementById('btn-search');
  const searchContainer = document.getElementById('sidebar-search-container');
  const searchInput = document.getElementById('sidebar-search-input');

  if (btnSearch && searchContainer && searchInput) {
    btnSearch.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = searchContainer.style.display === 'none';
      searchContainer.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        searchInput.focus();
      } else {
        searchInput.value = '';
        renderSidebar();
      }
    });

    searchInput.addEventListener('input', () => {
      renderSidebar(searchInput.value);
    });

    searchInput.addEventListener('click', (e) => e.stopPropagation());
  }

  const btnGraph = document.getElementById('btn-knowledge-graph');
  if (btnGraph && !btnGraph._bound) {
    btnGraph._bound = true;
    btnGraph.addEventListener('click', (e) => {
      e.stopPropagation();
      openKnowledgeGraphModal();
    });
  }

  // Folder add button (was previously in a broken top-level block)
  const btnAddFolder = document.getElementById('btn-add-folder');
  if (btnAddFolder) {
    btnAddFolder.onclick = () => {
      showCustomPrompt('New Folder', [{id: 'name', label: 'Folder Name'}], (res) => {
        const folderName = res.name;
        if (!folderName) return;
        if (!data.settings.categories) data.settings.categories = ['To-dos', 'Notes', 'Journal', 'Personal', 'Work'];
        if (!data.settings.categories.includes(folderName)) {
          data.settings.categories.push(folderName);
          saveData();
          renderSidebar();
        }
      });
    };
  }
}

// ============================================================
// Task Modal Event Binding
// ============================================================

function initTaskModal() {
  const btnClose = document.getElementById('btn-close-modal');
  const btnCancel = document.getElementById('btn-modal-cancel');
  const btnSave = document.getElementById('btn-modal-save');
  const overlay = document.getElementById('task-modal');

  if (btnClose) btnClose.addEventListener('click', closeTaskModal);
  if (btnCancel) btnCancel.addEventListener('click', closeTaskModal);
  if (btnSave) btnSave.addEventListener('click', saveTaskModal);

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeTaskModal();
    });
  }

  const nameInput = document.getElementById('modal-task-name');
  if (nameInput) {
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveTaskModal();
      }
    });
  }
}

// ============================================================
// Toast
// ============================================================

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ============================================================
// App Initialisation
// ============================================================

// Global safety net
window.addEventListener('error', e => {
  // Ignore harmless ResizeObserver warnings
  if (e.message && (e.message.includes('ResizeObserver loop completed') || e.message.includes('ResizeObserver loop limit'))) {
    return;
  }
  console.error('[GLOBAL ERROR]', e.message, e.error);
  const c = document.getElementById('page-content');
  if (c) c.innerHTML = '<div style="color:#ff6b6b;padding:40px;font-family:monospace">JS error: ' + (e.message || e) + '<br>See console for details.</div>';
});

try {
  applyTheme();
  applySidebarState();
  initPomodoroTimer();
  initStickyNotesPad();
  renderSidebar();
  renderPage();
  initSidebarSearch();
  initContextMenu();
  initTaskModal();
  initSplitScreen();
  console.log('[APP] Initialization complete');
} catch (e) {
  console.error('[APP INIT FAILED]', e);
  const c = document.getElementById('page-content');
  if (c) c.innerHTML = '<div style="color:#ff6b6b;padding:40px">Failed to start app: ' + e.message + '</div>';
}


window.deleteQuickAction = function(id) {
  if (confirm('Delete this quick action?')) {
    data.settings.quickActions = data.settings.quickActions.filter(q => q.id !== id);
    saveData();
    renderPage();
  }
};

function initSplitScreen() {
  const btn = document.getElementById('btn-toggle-split');
  if (btn) {
    btn.onclick = () => {
      data.settings.splitscreen = !data.settings.splitscreen;
      saveData();
      applySplitScreenState();
    };
  }

  // Handle window resizing dynamically for responsive splitscreen
  window.addEventListener('resize', () => {
    if (data.settings.splitscreen && data.activePageId !== 'library') {
      applySplitScreenState();
    }
  });

  applySplitScreenState();
}

function applySplitScreenState() {
  const panel = document.getElementById('split-right-panel');
  const btn = document.getElementById('btn-toggle-split');
  const leftPanel = document.getElementById('split-left-panel');
  if (!panel || !btn || !leftPanel) return;

  const isSplit = !!data.settings.splitscreen;
  
  // Hide splitscreen button on the library page to prevent double readers
  btn.style.display = (data.activePageId === 'library') ? 'none' : 'flex';
  
  if (isSplit && data.activePageId !== 'library') {
    panel.style.display = 'flex';
    btn.classList.add('active');
    btn.style.background = 'var(--bg-hover)';
    
    // Mobile responsive layout
    if (window.innerWidth <= 768) {
      panel.style.width = '100%';
      leftPanel.style.display = 'none';
    } else {
      panel.style.width = '50%';
      leftPanel.style.display = 'block';
    }
    
    // Only re-render split panel if it's not already displaying the correct document
    const docs = data.library || [];
    const selectedDoc = docs.find(d => d.id === data.selectedDocId) || docs[0];
    const currentRenderedId = panel.getAttribute('data-rendered-doc-id');
    if (!currentRenderedId || (selectedDoc && currentRenderedId !== selectedDoc.id)) {
      renderSplitReader();
    }
  } else {
    panel.style.display = 'none';
    leftPanel.style.display = 'block';
    btn.classList.remove('active');
    btn.style.background = 'none';
    panel.removeAttribute('data-rendered-doc-id');
    
    // Revoke any blob URLs used in the split panel to save memory
    const container = document.getElementById('split-pdf-view-container');
    if (container && container._embedPdfBlobUrl) {
      URL.revokeObjectURL(container._embedPdfBlobUrl);
      container._embedPdfBlobUrl = null;
    }
  }
}

function renderSplitReader() {
  const container = document.getElementById('split-right-panel');
  if (!container) return;

  const docs = data.library || [];
  if (docs.length === 0) {
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; padding:20px; color:var(--text-muted); text-align:center;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <span style="font-size:14px; font-weight:500; color:var(--text-primary);">No documents found</span>
        <p style="font-size:12px; margin-top:4px; color:var(--text-muted);">Upload documents in the main Library page to view them here.</p>
      </div>
    `;
    container.removeAttribute('data-rendered-doc-id');
    return;
  }

  const selectedDoc = docs.find(d => d.id === data.selectedDocId) || docs[0];
  container.setAttribute('data-rendered-doc-id', selectedDoc.id);

  let docOptions = '';
  docs.forEach(doc => {
    docOptions += `<option value="${doc.id}" ${doc.id === selectedDoc.id ? 'selected' : ''}>${escapeHtml(doc.name)}</option>`;
  });

  let pageOptions = '<option value="">-- Link to a Page --</option>';
  data.pages.forEach(p => {
    const isSel = selectedDoc.linkedPageId === p.id ? ' selected' : '';
    pageOptions += `<option value="${p.id}"${isSel}>${escapeHtml(p.name)}</option>`;
  });

  let taskOptions = '<option value="">-- Link to a Task --</option>';
  data.pages.forEach(p => {
    (p.tasks || []).forEach(t => {
      const isSel = selectedDoc.linkedTaskId === t.id ? ' selected' : '';
      taskOptions += `<option value="${t.id}"${isSel}>[${escapeHtml(p.name)}] ${escapeHtml(t.name || 'Untitled task')}</option>`;
    });
  });

  let readerBodyHtml = '';
  if (selectedDoc.type === '.pdf') {
    readerBodyHtml = `
      <div id="split-pdf-view-container" style="flex: 1; min-height: 250px; background: rgba(0,0,0,0.15); border-radius: 6px; overflow: hidden; width: 100%;">
      </div>
    `;
  } else {
    readerBodyHtml = `
      <div style="flex: 1; overflow-y: auto; background: var(--bg-hover); border-radius: 6px; border: 1px solid var(--border-input); padding: 16px;">
        <div class="paper-sheet" id="split-reader-text-area" style="font-size: 14px; line-height: 1.6; color: var(--text-primary);">
          <div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 40px 0;">Loading document...</div>
        </div>
      </div>
    `;
  }

  const totalPages = selectedDoc.pageCount || (selectedDoc.pages ? selectedDoc.pages.length : 1);

  container.innerHTML = `
    <div class="split-reader-header" style="display:flex; justify-content:space-between; align-items:center; padding: 12px 16px; border-bottom: 1px solid var(--border-input);">
      <h4 style="margin:0; font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px;">${escapeHtml(selectedDoc.name)}</h4>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div class="reader-page-nav" style="${selectedDoc.type === '.pdf' ? 'display: none;' : ''}">
          <button class="reader-nav-btn" id="btn-split-prev" ${selectedDoc.currentPage <= 1 ? 'disabled' : ''}>◀</button>
          <span style="font-size: 11px; color: var(--text-muted);">Page ${selectedDoc.currentPage || 1} of ${totalPages}</span>
          <button class="reader-nav-btn" id="btn-split-next" ${selectedDoc.currentPage >= totalPages ? 'disabled' : ''}>▶</button>
        </div>
        <button class="modal-close-btn" id="btn-close-split" style="font-size:18px; line-height:1; cursor:pointer; background:none; border:none; color:var(--text-muted);">&times;</button>
      </div>
    </div>
    
    <div class="split-reader-body" style="flex:1; display:flex; flex-direction:column; padding:12px; gap:12px; overflow:hidden; height: calc(100% - 45px); font-family: var(--font-stack);">
      <select id="split-doc-select" style="width:100%; background:var(--bg-hover); color:var(--text-primary); border:1px solid var(--border-input); padding:6px; border-radius:4px; font-size:13px; outline:none; font-family: var(--font-stack);">
        ${docOptions}
      </select>

      ${readerBodyHtml}

      <div class="reader-split-footer" style="display:flex; flex-direction:column; gap:10px; border-top:1px solid var(--border-input); padding-top:12px; margin-top:auto;">
        <div class="library-notes-section" style="display:flex; flex-direction:column; gap:4px;">
          <label style="font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase; font-family: var(--font-stack);">Notes</label>
          <textarea id="split-notes-input" style="width:100%; height:80px; background:var(--bg-hover); border:1px solid var(--border-input); border-radius:4px; padding:8px; color:var(--text-primary); font-size:13px; resize:none; outline:none; font-family: var(--font-stack);" placeholder="Type notes here...">${escapeHtml(selectedDoc.notes || '')}</textarea>
        </div>
        <div class="library-linking-section" style="display:flex; flex-direction:column; gap:4px;">
          <label style="font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase; font-family: var(--font-stack);">Link Document to:</label>
          <div class="link-select-row" style="display:flex; gap:8px;">
            <select id="split-link-page" style="flex:1; background:var(--bg-hover); color:var(--text-primary); border:1px solid var(--border-input); padding:4px; border-radius:4px; font-size:12px; outline:none; font-family: var(--font-stack);">${pageOptions}</select>
            <select id="split-link-task" style="flex:1; background:var(--bg-hover); color:var(--text-primary); border:1px solid var(--border-input); padding:4px; border-radius:4px; font-size:12px; outline:none; font-family: var(--font-stack);">${taskOptions}</select>
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind Events
  document.getElementById('btn-close-split').onclick = () => {
    data.settings.splitscreen = false;
    saveData();
    applySplitScreenState();
  };

  document.getElementById('split-doc-select').onchange = (e) => {
    data.selectedDocId = e.target.value;
    saveData();
    renderSplitReader();
  };

  // Textarea notes binding
  const notesInput = document.getElementById('split-notes-input');
  if (notesInput) {
    notesInput.oninput = () => {
      selectedDoc.notes = notesInput.value;
      saveData();
    };
  }

  // Links page/task binding
  const linkPage = document.getElementById('split-link-page');
  const linkTask = document.getElementById('split-link-task');
  if (linkPage) {
    linkPage.onchange = () => {
      selectedDoc.linkedPageId = linkPage.value;
      saveData();
      showToast('Document link updated');
    };
  }
  if (linkTask) {
    linkTask.onchange = () => {
      selectedDoc.linkedTaskId = linkTask.value;
      saveData();
      showToast('Document link updated');
    };
  }

  // Load Content
  if (selectedDoc.type === '.pdf') {
    const pdfContainer = document.getElementById('split-pdf-view-container');
    triggerEmbedPdfRender(selectedDoc, pdfContainer);
  } else {
    // Non-PDF
    const textArea = document.getElementById('split-reader-text-area');

    getFileFromDB(selectedDoc.id).then(buffer => {
      if (!buffer) {
        textArea.innerHTML = 'Document data not found.';
        return;
      }
      if (selectedDoc.type === '.docx') {
        mammoth.convertToHtml({arrayBuffer: buffer}).then(result => {
          textArea.innerHTML = result.value || "Empty page.";
        }).catch(() => textArea.innerHTML = 'Error loading DOCX');
      } else if (selectedDoc.type === '.epub') {
        textArea.innerHTML = '<div style="text-align:center; padding:20px;">EPUB preview requires full library view.</div>';
      }
    });
  }

  // Bind split reader navigation buttons for both PDF fallback and text/DOCX documents
  const btnPrev = document.getElementById('btn-split-prev');
  const btnNext = document.getElementById('btn-split-next');
  if (btnPrev && btnNext) {
    btnPrev.onclick = () => {
      if ((selectedDoc.currentPage || 1) > 1) {
        selectedDoc.currentPage = (selectedDoc.currentPage || 1) - 1;
        saveData();
        if (selectedDoc.type === '.pdf') {
          const pdfContainer = document.getElementById('split-pdf-view-container');
          if (pdfContainer && typeof pdfContainer._pdfRenderFn === 'function') {
            pdfContainer._pdfRenderFn();
          } else {
            renderSplitReader();
          }
        } else {
          renderSplitReader();
        }
      }
    };
    btnNext.onclick = () => {
      if ((selectedDoc.currentPage || 1) < totalPages) {
        selectedDoc.currentPage = (selectedDoc.currentPage || 1) + 1;
        saveData();
        if (selectedDoc.type === '.pdf') {
          const pdfContainer = document.getElementById('split-pdf-view-container');
          if (pdfContainer && typeof pdfContainer._pdfRenderFn === 'function') {
            pdfContainer._pdfRenderFn();
          } else {
            renderSplitReader();
          }
        } else {
          renderSplitReader();
        }
      }
    };
  }
}

function bindPlannerEvents(page) {
  if (!page.planner) {
    page.planner = { goals: '', priorities: '' };
  }
  
  const goals = document.getElementById('planner-goals');
  const priorities = document.getElementById('planner-priorities');
  
  if (goals) {
    goals.value = page.planner.goals || '';
    goals.oninput = () => {
      page.planner.goals = goals.value;
      saveData();
    };
  }
  
  if (priorities) {
    priorities.value = page.planner.priorities || '';
    priorities.oninput = () => {
      page.planner.priorities = priorities.value;
      saveData();
    };
  }
}

// ============================================================
// Wiki-links & Obsidian-style Backlinks Helper
// ============================================================

function getBacklinks(currentPage) {
  const backlinks = [];
  if (!currentPage || !data.pages) return backlinks;
  data.pages.forEach(p => {
    if (p.id === currentPage.id) return;
    if (p.content && p.content.includes(`[[${currentPage.name}]]`)) {
      backlinks.push(p);
    }
  });
  return backlinks;
}

function getWikiLinkTrigger(editor) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  
  const text = node.textContent;
  const offset = range.startOffset;
  
  const lastDoubleOpen = text.lastIndexOf('[[', offset - 1);
  if (lastDoubleOpen === -1) return null;
  
  const textBetween = text.substring(lastDoubleOpen, offset);
  if (textBetween.includes(']]')) return null;
  
  const query = textBetween.substring(2);
  return {
    node: node,
    query: query,
    startOffset: lastDoubleOpen,
    endOffset: offset
  };
}

function closeWikiLinkDropdown() {
  if (window.wikiLinkDropdown) {
    window.wikiLinkDropdown.remove();
    window.wikiLinkDropdown = null;
    window.wikiLinkDropdownActiveIndex = -1;
    window.wikiLinkDropdownInfo = null;
  }
}

function positionDropdown(dropdown, selectionRange) {
  const rect = selectionRange.getBoundingClientRect();
  dropdown.style.position = 'absolute';
  dropdown.style.zIndex = '10000';
  
  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY;
  
  const dropdownWidth = 240;
  if (left + dropdownWidth > window.innerWidth) {
    left = window.innerWidth - dropdownWidth - 10;
  }
  
  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${top}px`;
}

function showWikiLinkDropdown(editor, page, triggerInfo) {
  closeWikiLinkDropdown();
  
  const matches = data.pages.filter(p => 
    p.name.toLowerCase().includes(triggerInfo.query.toLowerCase())
  );
  
  const dropdown = document.createElement('div');
  dropdown.className = 'wiki-link-dropdown';
  dropdown.style.cssText = `
    position: absolute;
    background: var(--bg-context-menu);
    border: 1px solid var(--border-input);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    max-height: 200px;
    overflow-y: auto;
    width: 240px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  `;
  
  let options = [...matches];
  let html = '';
  options.forEach((opt, idx) => {
    html += `
      <div class="wiki-dropdown-item ${idx === 0 ? 'active' : ''}" data-index="${idx}" data-page-id="${opt.id}" data-page-name="${opt.name}" style="padding: 6px 10px; border-radius: 4px; color: white; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: background 0.15s;">
        <span style="font-weight: 500;">${escapeHtml(opt.name)}</span>
        <span style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">${escapeHtml(opt.type || 'note')}</span>
      </div>
    `;
  });
  
  const hasExactMatch = matches.some(m => m.name.toLowerCase() === triggerInfo.query.toLowerCase().trim());
  const queryTrimmed = triggerInfo.query.trim();
  if (queryTrimmed && !hasExactMatch) {
    const createIndex = options.length;
    html += `
      <div class="wiki-dropdown-item wiki-dropdown-create ${options.length === 0 ? 'active' : ''}" data-index="${createIndex}" data-create-name="${escapeHtml(queryTrimmed)}" style="padding: 6px 10px; border-radius: 4px; color: var(--accent-blue); font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.15s; border-top: 1px solid var(--divider);">
        <span>✦</span>
        <span style="font-weight: 500; font-style: italic;">Create "${escapeHtml(queryTrimmed)}"</span>
      </div>
    `;
  }
  
  if (!html) return;
  
  dropdown.innerHTML = html;
  document.body.appendChild(dropdown);
  window.wikiLinkDropdown = dropdown;
  window.wikiLinkDropdownActiveIndex = 0;
  
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    positionDropdown(dropdown, selection.getRangeAt(0));
  }
  
  if (!document.getElementById('wiki-link-dropdown-styles')) {
    const styles = document.createElement('style');
    styles.id = 'wiki-link-dropdown-styles';
    styles.innerHTML = `
      .wiki-dropdown-item:hover, .wiki-dropdown-item.active {
        background: rgba(255, 255, 255, 0.08) !important;
      }
      .wiki-dropdown-item.active {
        outline: 1px solid rgba(255, 255, 255, 0.15);
      }
    `;
    document.head.appendChild(styles);
  }
  
  dropdown.querySelectorAll('.wiki-dropdown-item').forEach(item => {
    item.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectDropdownItem(editor, page, item, triggerInfo);
    };
  });
}

function selectDropdownItem(editor, page, item, triggerInfo) {
  let pageName = '';
  if (item.classList.contains('wiki-dropdown-create')) {
    const newName = item.dataset.createName;
    const newPage = {
      id: 'page-' + uid(),
      name: newName,
      category: page.category || 'Notes',
      type: 'notes',
      content: '',
      banner: ''
    };
    data.pages.push(newPage);
    data.recentIds.unshift(newPage.id);
    saveData();
    renderSidebar();
    pageName = newName;
    showToast(`Created page: ${newName}`);
  } else {
    pageName = item.dataset.pageName;
  }
  
  const textNode = triggerInfo.node;
  const beforeText = textNode.textContent.substring(0, triggerInfo.startOffset);
  const afterText = textNode.textContent.substring(triggerInfo.endOffset);
  
  textNode.textContent = beforeText + `[[${pageName}]]` + afterText;
  
  const newCaretPos = triggerInfo.startOffset + pageName.length + 4;
  const range = document.createRange();
  const selection = window.getSelection();
  
  range.setStart(textNode, newCaretPos);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  
  editor.dispatchEvent(new Event('input'));
  closeWikiLinkDropdown();
}

function handleWikiLinkKeyDown(e, editor, page) {
  if (!window.wikiLinkDropdown) return;
  
  const dropdown = window.wikiLinkDropdown;
  const items = dropdown.querySelectorAll('.wiki-dropdown-item');
  if (items.length === 0) return;
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    window.wikiLinkDropdownActiveIndex = (window.wikiLinkDropdownActiveIndex + 1) % items.length;
    updateActiveItem(items);
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault();
    window.wikiLinkDropdownActiveIndex = (window.wikiLinkDropdownActiveIndex - 1 + items.length) % items.length;
    updateActiveItem(items);
  }
  else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    const activeItem = items[window.wikiLinkDropdownActiveIndex];
    if (activeItem && window.wikiLinkDropdownInfo) {
      selectDropdownItem(editor, page, activeItem, window.wikiLinkDropdownInfo);
    }
  }
  else if (e.key === 'Escape') {
    e.preventDefault();
    closeWikiLinkDropdown();
  }
}

function updateActiveItem(items) {
  items.forEach((item, idx) => {
    if (idx === window.wikiLinkDropdownActiveIndex) {
      item.classList.add('active');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('active');
    }
  });
}

function setupWikiLinkAutocomplete(editor, page) {
  editor.addEventListener('keydown', (e) => {
    if (window.wikiLinkDropdown) {
      handleWikiLinkKeyDown(e, editor, page);
    }
  });

  editor.addEventListener('keyup', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
      return;
    }
    
    const trigger = getWikiLinkTrigger(editor);
    if (trigger) {
      window.wikiLinkDropdownInfo = trigger;
      showWikiLinkDropdown(editor, page, trigger);
    } else {
      closeWikiLinkDropdown();
    }
  });

  const clickOutsideHandler = (e) => {
    if (window.wikiLinkDropdown && !editor.contains(e.target) && !window.wikiLinkDropdown.contains(e.target)) {
      closeWikiLinkDropdown();
    }
  };
  document.addEventListener('click', clickOutsideHandler);
  
  const cleanupObserver = new MutationObserver(() => {
    if (!document.getElementById('notes-rich-editor')) {
      document.removeEventListener('click', clickOutsideHandler);
      closeWikiLinkDropdown();
      cleanupObserver.disconnect();
    }
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });
}

// ============================================================
// Kanban Board Page Type View
// ============================================================

function renderKanbanHtml(page) {
  const tasks = page.tasks || [];
  
  // Ensure every task has a valid stage
  tasks.forEach(t => {
    if (!t.stage) {
      t.stage = t.checked ? 'done' : 'todo';
    }
  });

  const todoTasks = tasks.filter(t => t.stage === 'todo');
  const inProgressTasks = tasks.filter(t => t.stage === 'in_progress');
  const reviewTasks = tasks.filter(t => t.stage === 'review');
  const doneTasks = tasks.filter(t => t.stage === 'done');

  const renderCard = (t) => `
    <div class="kanban-card" draggable="true" data-task-id="${t.id}">
      <div class="kanban-card-title" contenteditable="true" spellcheck="false" data-task-id="${t.id}">${escapeHtml(t.name)}</div>
      <div class="kanban-card-meta">
        <span>📅 ${escapeHtml(t.due || '—')}</span>
        <button class="icon-btn btn-delete-kanban-card" data-task-id="${t.id}" style="color:var(--text-muted); cursor:pointer; background:none; border:none; padding:2px;" title="Delete">✕</button>
      </div>
    </div>
  `;

  return `
    <div style="max-width: 1200px; margin: 0 auto; padding: 0 10px;">
      <div style="margin-bottom: 20px;">
        <p style="color: var(--text-muted); font-size:14px;">Drag and drop cards between workflow columns to track progress.</p>
      </div>
      <div class="kanban-board-container">
        <!-- To Do -->
        <div class="kanban-column" data-stage="todo">
          <div class="kanban-column-header">
            <span>To Do</span>
            <span style="font-size:11px; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:10px;">${todoTasks.length}</span>
          </div>
          <div class="kanban-cards-list" data-stage="todo">
            ${todoTasks.map(renderCard).join('')}
          </div>
          <button class="kanban-add-card-btn" data-stage="todo">+ Add Card</button>
        </div>

        <!-- In Progress -->
        <div class="kanban-column" data-stage="in_progress">
          <div class="kanban-column-header">
            <span>In Progress</span>
            <span style="font-size:11px; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:10px;">${inProgressTasks.length}</span>
          </div>
          <div class="kanban-cards-list" data-stage="in_progress">
            ${inProgressTasks.map(renderCard).join('')}
          </div>
          <button class="kanban-add-card-btn" data-stage="in_progress">+ Add Card</button>
        </div>

        <!-- Review -->
        <div class="kanban-column" data-stage="review">
          <div class="kanban-column-header">
            <span>Review</span>
            <span style="font-size:11px; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:10px;">${reviewTasks.length}</span>
          </div>
          <div class="kanban-cards-list" data-stage="review">
            ${reviewTasks.map(renderCard).join('')}
          </div>
          <button class="kanban-add-card-btn" data-stage="review">+ Add Card</button>
        </div>

        <!-- Done -->
        <div class="kanban-column" data-stage="done">
          <div class="kanban-column-header">
            <span>Done</span>
            <span style="font-size:11px; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:10px;">${doneTasks.length}</span>
          </div>
          <div class="kanban-cards-list" data-stage="done">
            ${doneTasks.map(renderCard).join('')}
          </div>
          <button class="kanban-add-card-btn" data-stage="done">+ Add Card</button>
        </div>
      </div>
    </div>
  `;
}

function bindKanbanEvents(page) {
  const container = document.getElementById('page-content');
  if (!container) return;

  // Add Card Buttons
  container.querySelectorAll('.kanban-add-card-btn').forEach(btn => {
    btn.onclick = () => {
      const stage = btn.dataset.stage;
      showCustomPrompt('Add Kanban Card', [
        { id: 'name', label: 'Card Title' },
        { id: 'due', label: 'Due Date', placeholder: 'e.g. May 20, 2025' }
      ], (res) => {
        if (!res.name) return;
        if (!page.tasks) page.tasks = [];
        page.tasks.push({
          id: uid(),
          name: res.name,
          due: res.due || '—',
          checked: stage === 'done',
          stage: stage
        });
        saveData();
        renderPage();
      });
    };
  });

  // Edit Card Title Inline
  container.querySelectorAll('.kanban-card-title').forEach(el => {
    el.onblur = () => {
      const id = el.dataset.taskId;
      const task = page.tasks.find(t => t.id === id);
      if (task) {
        task.name = el.textContent.trim();
        saveData();
      }
    };
    el.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
      }
    };
  });

  // Delete Card Buttons
  container.querySelectorAll('.btn-delete-kanban-card').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.taskId;
      page.tasks = page.tasks.filter(t => t.id !== id);
      saveData();
      renderPage();
    };
  });

  // Drag and Drop
  let dragTaskId = null;
  container.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      dragTaskId = card.dataset.taskId;
      e.dataTransfer.effectAllowed = 'move';
      card.style.opacity = '0.5';
    });
    card.addEventListener('dragend', () => {
      card.style.opacity = '1';
    });
  });

  container.querySelectorAll('.kanban-column').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.style.background = 'var(--bg-active)';
    });
    col.addEventListener('dragleave', () => {
      col.style.background = 'var(--bg-hover)';
    });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.style.background = 'var(--bg-hover)';
      const targetStage = col.dataset.stage;
      if (dragTaskId && targetStage) {
        const task = page.tasks.find(t => t.id === dragTaskId);
        if (task) {
          task.stage = targetStage;
          task.checked = targetStage === 'done';
          saveData();
          renderPage();
        }
      }
    });
  });
}

// ============================================================
// Flashcards & Spaced Repetition (Anki-style SM-2)
// ============================================================

function scanNotesForFlashcards(page) {
  const cards = [];
  if (!data.pages) return cards;
  
  // 1. Scan notes
  data.pages.forEach(p => {
    if (p.type !== 'notes' || !p.content) return;
    
    // Strip HTML tags to process clean text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = p.content;
    const text = tempDiv.textContent || tempDiv.innerText || "";
    
    const lines = text.split('\n');
    let currentQ = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^q:\s*/i)) {
        currentQ = line.replace(/^q:\s*/i, '').trim();
      } else if (line.match(/^a:\s*/i) && currentQ) {
        const answer = line.replace(/^a:\s*/i, '').trim();
        cards.push({
          id: 'fc-' + p.id + '-' + i,
          sourcePageId: p.id,
          sourcePageName: p.name,
          question: currentQ,
          answer: answer,
          interval: 1,
          ease: 2.5,
          repetitions: 0,
          dueDate: new Date().toISOString().split('T')[0]
        });
        currentQ = '';
      }
    }
  });

  // 2. Append manual cards from current page
  if (page && page.type === 'flashcards' && Array.isArray(page.cards)) {
    page.cards.forEach(c => {
      cards.push({
        id: c.id,
        sourcePageId: page.id,
        sourcePageName: 'Manual',
        question: c.question,
        answer: c.answer,
        interval: c.interval || 1,
        ease: c.ease || 2.5,
        repetitions: c.repetitions || 0,
        dueDate: c.dueDate || new Date().toISOString().split('T')[0]
      });
    });
  }

  // Sync with persistent SM-2 states in localStorage
  data.flashcardStates = data.flashcardStates || {};
  cards.forEach(c => {
    const state = data.flashcardStates[c.id];
    if (state) {
      c.interval = state.interval;
      c.ease = state.ease;
      c.repetitions = state.repetitions;
      c.dueDate = state.dueDate;
    } else {
      data.flashcardStates[c.id] = {
        interval: c.interval,
        ease: c.ease,
        repetitions: c.repetitions,
        dueDate: c.dueDate
      };
    }
  });

  return cards;
}

function updateFlashcardSM2(cardId, response) {
  data.flashcardStates = data.flashcardStates || {};
  const state = data.flashcardStates[cardId] || { interval: 1, ease: 2.5, repetitions: 0, dueDate: '' };
  let { interval, ease, repetitions } = state;
  
  if (response === 1) { // Again
    repetitions = 0;
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
    
    if (response === 2) { // Hard
      ease = Math.max(1.3, ease - 0.15);
      interval = Math.max(1, Math.round(interval * 0.8));
    } else if (response === 4) { // Easy
      ease = ease + 0.15;
      interval = Math.round(interval * 1.3);
    }
  }
  
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  state.interval = interval;
  state.ease = ease;
  state.repetitions = repetitions;
  state.dueDate = nextDate.toISOString().split('T')[0];
  
  data.flashcardStates[cardId] = state;
  
  const activePage = getActivePage();
  if (activePage && activePage.type === 'flashcards' && Array.isArray(activePage.cards)) {
    const card = activePage.cards.find(c => c.id === cardId);
    if (card) {
      card.interval = state.interval;
      card.ease = state.ease;
      card.repetitions = state.repetitions;
      card.dueDate = state.dueDate;
    }
  }
  
  saveData();
}

function renderFlashcardsHtml(page) {
  const cards = scanNotesForFlashcards(page);
  const todayStr = new Date().toISOString().split('T')[0];
  const dueCards = cards.filter(c => c.dueDate <= todayStr);
  const pendingCount = dueCards.length;

  let activeCardHtml = '';
  if (pendingCount > 0) {
    const card = dueCards[0];
    activeCardHtml = `
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 13px; color: var(--text-muted);">Due today: <strong>${pendingCount}</strong> cards</span>
      </div>
      <div class="flashcard-wrapper">
        <div class="flashcard-inner" id="active-flashcard-inner">
          <div class="flashcard-front">
            <span style="font-size: 11px; text-transform: uppercase; color: var(--text-section); letter-spacing: 1px; margin-bottom: 12px; display:block;">Question (${escapeHtml(card.sourcePageName)})</span>
            <div style="font-size: 18px; font-weight: 500; text-align: center; color: white;">${escapeHtml(card.question)}</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 30px;">Click to show answer</div>
          </div>
          <div class="flashcard-back">
            <span style="font-size: 11px; text-transform: uppercase; color: var(--text-section); letter-spacing: 1px; margin-bottom: 12px; display:block;">Answer</span>
            <div style="font-size: 18px; font-weight: 500; text-align: center; color: white; margin-bottom: 20px;">${escapeHtml(card.answer)}</div>
            <div style="display: flex; gap: 8px; justify-content: center; width: 100%;">
              <button class="btn-action sm2-btn" data-response="1" data-card-id="${card.id}" style="background:#ff6b6b; color:white; border:none; padding:6px 12px; font-size:12px;">Again</button>
              <button class="btn-action sm2-btn" data-response="2" data-card-id="${card.id}" style="background:#f59e0b; color:white; border:none; padding:6px 12px; font-size:12px;">Hard</button>
              <button class="btn-action sm2-btn" data-response="3" data-card-id="${card.id}" style="background:#10b981; color:white; border:none; padding:6px 12px; font-size:12px;">Good</button>
              <button class="btn-action sm2-btn" data-response="4" data-card-id="${card.id}" style="background:#3b82f6; color:white; border:none; padding:6px 12px; font-size:12px;">Easy</button>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    activeCardHtml = `
      <div style="text-align:center; padding: 40px 20px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-input); border-radius:12px;">
        <span style="font-size:48px;">🎉</span>
        <h3 style="margin-top:16px; margin-bottom:8px;">All caught up!</h3>
        <p style="color:var(--text-muted); font-size:14px; max-width:320px; margin:0 auto;">No flashcards due for review today. Add more <code>Q: Question</code> and <code>A: Answer</code> pairings inside your notes to scan cards!</p>
      </div>
    `;
  }

  let listHtml = '';
  if (cards.length > 0) {
    listHtml = `
      <table class="task-table" style="margin-top: 20px; font-size:13px;">
        <thead>
          <tr>
            <th>Question</th>
            <th>Next Due</th>
            <th>Interval (days)</th>
            <th>Ease</th>
            <th>Source Note</th>
          </tr>
        </thead>
        <tbody>
          ${cards.map(c => `
            <tr>
              <td><strong>${escapeHtml(c.question)}</strong></td>
              <td>${escapeHtml(c.dueDate)}</td>
              <td>${c.interval}</td>
              <td>${c.ease.toFixed(2)}</td>
              <td>
                ${c.id.startsWith('fc-manual-') 
                  ? `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                      <span class="home-card-cat">${escapeHtml(c.sourcePageName)}</span>
                      <button class="icon-btn btn-delete-flashcard" data-card-id="${c.id}" style="color:var(--text-muted); cursor:pointer; background:none; border:none; padding:2px;" title="Delete">✕</button>
                     </div>`
                  : `<span class="home-card-cat" style="cursor:pointer;" onclick="navigateTo('${c.sourcePageId}')">${escapeHtml(c.sourcePageName)}</span>`
                }
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    listHtml = `<div style="text-align:center; color:var(--text-muted); font-size:12px; padding:20px;">No flashcards parsed from notes yet.</div>`;
  }

  const activeTab = data.activeFlashcardTab || 'study';

  return `
    <div style="max-width: 720px; margin: 0 auto;">
      <div class="view-tabs" style="margin-bottom: 20px;">
        <button class="view-tab ${activeTab === 'study' ? 'active' : ''}" id="tab-fc-study">Study Decks</button>
        <button class="view-tab ${activeTab === 'list' ? 'active' : ''}" id="tab-fc-list">Card Database</button>
      </div>

      <div id="fc-study-view" style="${activeTab === 'study' ? '' : 'display:none;'}">
        ${activeCardHtml}
      </div>

      <div id="fc-list-view" style="${activeTab === 'list' ? '' : 'display:none;'}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0;">All Flashcards (${cards.length})</h3>
          <button class="btn-action" id="btn-add-flashcard">+ Add Card</button>
        </div>
        ${listHtml}
      </div>
    </div>
  `;
}

function bindFlashcardEvents(page) {
  const container = document.getElementById('page-content');
  if (!container) return;

  const tabStudy = document.getElementById('tab-fc-study');
  const tabList = document.getElementById('tab-fc-list');
  const studyView = document.getElementById('fc-study-view');
  const listView = document.getElementById('fc-list-view');

  if (tabStudy && tabList && studyView && listView) {
    tabStudy.onclick = () => {
      tabStudy.classList.add('active');
      tabList.classList.remove('active');
      studyView.style.display = 'block';
      listView.style.display = 'none';
      data.activeFlashcardTab = 'study';
      saveData();
    };
    tabList.onclick = () => {
      tabList.classList.add('active');
      tabStudy.classList.remove('active');
      studyView.style.display = 'none';
      listView.style.display = 'block';
      data.activeFlashcardTab = 'list';
      saveData();
    };
  }

  const cardInner = document.getElementById('active-flashcard-inner');
  if (cardInner) {
    cardInner.onclick = (e) => {
      if (e.target.closest('.sm2-btn')) return;
      cardInner.classList.toggle('flipped');
    };
  }

  container.querySelectorAll('.sm2-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const cardId = btn.dataset.cardId;
      const response = parseInt(btn.dataset.response);
      updateFlashcardSM2(cardId, response);
      renderPage();
      showToast("Response recorded!");
    };
  });

  const addBtn = document.getElementById('btn-add-flashcard');
  if (addBtn) {
    addBtn.onclick = () => {
      showCustomPrompt('Add Flashcard', [
        { id: 'question', label: 'Question' },
        { id: 'answer', label: 'Answer' }
      ], (res) => {
        if (!res.question || !res.answer) return;
        page.cards = page.cards || [];
        const newCard = {
          id: 'fc-manual-' + uid(),
          question: res.question,
          answer: res.answer,
          interval: 1,
          ease: 2.5,
          repetitions: 0,
          dueDate: new Date().toISOString().split('T')[0]
        };
        page.cards.push(newCard);
        
        data.flashcardStates = data.flashcardStates || {};
        data.flashcardStates[newCard.id] = {
          interval: newCard.interval,
          ease: newCard.ease,
          repetitions: newCard.repetitions,
          dueDate: newCard.dueDate
        };
        
        saveData();
        renderPage();
        showToast("Flashcard added!");
      });
    };
  }

  container.querySelectorAll('.btn-delete-flashcard').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.cardId;
      page.cards = (page.cards || []).filter(x => x.id !== id);
      if (data.flashcardStates && data.flashcardStates[id]) {
        delete data.flashcardStates[id];
      }
      saveData();
      renderPage();
      showToast("Flashcard deleted");
    };
  });
}

// ============================================================
// Student Workspace Page Type View
// ============================================================

function renderStudentHtml(page) {
  page.assignments = page.assignments || [];
  page.courses = page.courses || [];
  page.exams = page.exams || [];
  page.studyPlans = page.studyPlans || [];

  let totalCredits = 0;
  let totalPoints = 0;
  const gradePointsMap = { 'A': 4.0, 'B': 3.0, 'C': 2.0, 'D': 1.0, 'F': 0.0 };
  page.courses.forEach(c => {
    const credits = parseFloat(c.credits) || 0;
    const grade = c.grade;
    if (credits > 0 && gradePointsMap[grade] !== undefined) {
      totalCredits += credits;
      totalPoints += gradePointsMap[grade] * credits;
    }
  });
  const gpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00';

  let assignmentsHtml = '';
  if (page.assignments.length === 0) {
    assignmentsHtml = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No assignments tracked yet.</td></tr>`;
  } else {
    page.assignments.forEach(a => {
      assignmentsHtml += `
        <tr>
          <td><strong style="color:white;">${escapeHtml(a.name)}</strong></td>
          <td>${escapeHtml(a.course)}</td>
          <td>${escapeHtml(a.dueDate)}</td>
          <td>${a.weight}%</td>
          <td>
            <select class="student-select assignment-status-select" data-id="${a.id}" style="background:var(--bg-active); border:1px solid var(--border-input); border-radius:4px; color:white; padding:2px 4px; font-size:12px;">
              <option value="Not Started" ${a.status === 'Not Started' ? 'selected' : ''}>Not Started</option>
              <option value="In Progress" ${a.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
              <option value="Submitted" ${a.status === 'Submitted' ? 'selected' : ''}>Submitted</option>
              <option value="Graded" ${a.status === 'Graded' ? 'selected' : ''}>Graded</option>
            </select>
          </td>
          <td>
            <button class="icon-btn btn-delete-assignment" data-id="${a.id}" style="color:var(--text-muted); background:none; border:none; cursor:pointer;">✕</button>
          </td>
        </tr>
      `;
    });
  }

  let coursesHtml = '';
  if (page.courses.length === 0) {
    coursesHtml = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No courses listed.</td></tr>`;
  } else {
    page.courses.forEach(c => {
      coursesHtml += `
        <tr>
          <td><strong>${escapeHtml(c.name)}</strong></td>
          <td>${c.credits}</td>
          <td>${c.grade}</td>
          <td>
            <button class="icon-btn btn-delete-course" data-id="${c.id}" style="color:var(--text-muted); background:none; border:none; cursor:pointer;">✕</button>
          </td>
        </tr>
      `;
    });
  }

  let examsHtml = '';
  if (page.exams.length === 0) {
    examsHtml = `<div style="text-align:center; color:var(--text-muted); padding:10px; font-size:12px;">No exams added.</div>`;
  } else {
    page.exams.forEach(ex => {
      let diffDays = -1;
      if (ex.date) {
        const parts = ex.date.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const day = parseInt(parts[2], 10);
          const examDate = new Date(year, month - 1, day);
          const today = new Date();
          today.setHours(0,0,0,0);
          const diffMs = examDate - today;
          diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        }
      }
      const countdownStr = diffDays > 0 ? `🚨 ${diffDays} days left` : diffDays === 0 ? '📅 TODAY!' : '✅ Completed';
      
      examsHtml += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid var(--divider); padding:10px 14px; border-radius:6px; margin-bottom:8px;">
          <div>
            <div style="font-weight:500; color:white; font-size:13px;">${escapeHtml(ex.course)} ${ex.chapters ? '- Ch: ' + escapeHtml(ex.chapters) : ''}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Exam: ${escapeHtml(ex.date)}</div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:12px; font-weight:600; color:var(--accent-blue);">${countdownStr}</span>
            <button class="icon-btn btn-delete-exam" data-id="${ex.id}" style="color:var(--text-muted); background:none; border:none; cursor:pointer;">✕</button>
          </div>
        </div>
      `;
    });
  }

  let plansListHtml = '';
  if (page.studyPlans.length === 0) {
    plansListHtml = `<div style="text-align:center; color:var(--text-muted); font-size:12px; padding:20px;">No study plans generated. Input exam details below.</div>`;
  } else {
    page.studyPlans.forEach(plan => {
      plansListHtml += `
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-input); border-radius:8px; padding:16px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid var(--divider); padding-bottom:6px;">
            <strong style="color:var(--accent-blue);">${escapeHtml(plan.course)} Study Schedule</strong>
            <button class="icon-btn btn-delete-plan" data-id="${plan.id}" style="color:var(--text-muted); background:none; border:none; cursor:pointer;">✕</button>
          </div>
          <div style="max-height: 180px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
            ${plan.schedule.map(day => `
              <div style="display:flex; justify-content:space-between; font-size:12px; padding: 2px 0;">
                <span style="color:var(--text-muted);">${escapeHtml(day.date)}:</span>
                <span style="color:white; font-weight:500;">Review: ${escapeHtml(day.content)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });
  }

  return `
    <div style="max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: 2fr 1fr; gap: 24px; padding: 0 10px;">
      <div>
        <div class="home-section" style="padding: 16px; background:rgba(0,0,0,0.1); border-radius:8px; margin-bottom:24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0;">📝 Assignments & Tasks</h3>
            <button class="btn-action" id="btn-add-assignment" style="font-size:11px; padding:4px 10px;">+ Add Assignment</button>
          </div>
          <table class="task-table" style="font-size:12px;">
            <thead>
              <tr>
                <th>Assignment</th>
                <th>Course</th>
                <th>Due</th>
                <th>Weight</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${assignmentsHtml}
            </tbody>
          </table>
        </div>

        <div class="home-section" style="padding: 16px; background:rgba(0,0,0,0.1); border-radius:8px;">
          <h3 style="margin-bottom:12px;">📅 Study Planner & Schedules</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:rgba(255,255,255,0.02); border:1px solid var(--border-input); padding:12px; border-radius:6px; margin-bottom:16px;">
            <div>
              <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:4px;">Exam Course/Subject</label>
              <input type="text" id="plan-course" placeholder="e.g. Physics 101" style="width:100%; background:var(--bg-input); border:1px solid var(--border-input); border-radius:4px; padding:6px; font-size:12px; color:white; outline:none;">
            </div>
            <div>
              <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:4px;">Exam Date</label>
              <input type="date" id="plan-exam-date" style="width:100%; background:var(--bg-input); border:1px solid var(--border-input); border-radius:4px; padding:6px; font-size:12px; color:white; outline:none;">
            </div>
            <div style="grid-column: span 2;">
              <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:4px;">Chapters/Chapters List (separated by commas)</label>
              <input type="text" id="plan-chapters" placeholder="e.g. Ch 1, Ch 2, Ch 3, Ch 4" style="width:100%; background:var(--bg-input); border:1px solid var(--border-input); border-radius:4px; padding:6px; font-size:12px; color:white; outline:none;">
            </div>
            <div style="grid-column: span 2; display:flex; justify-content:flex-end;">
              <button class="btn-action" id="btn-generate-study-plan" style="font-size:11px; padding:6px 12px; background:var(--accent-blue); color:white; border:none; cursor:pointer;">Generate Schedule</button>
            </div>
          </div>
          ${plansListHtml}
        </div>
      </div>

      <div>
        <div class="home-section" style="padding: 16px; background:rgba(0,0,0,0.1); border-radius:8px; margin-bottom:24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0;">📊 GPA Calculator</h3>
            <span style="font-size:16px; font-weight:700; color:var(--accent-blue);">${gpa} GPA</span>
          </div>
          <table class="task-table" style="font-size:11px; margin-bottom:12px;">
            <thead>
              <tr>
                <th>Course</th>
                <th>Credits</th>
                <th>Grade</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${coursesHtml}
            </tbody>
          </table>
          <button class="kanban-add-card-btn" id="btn-add-course" style="margin-top:0;">+ Add Course</button>
        </div>

        <div class="home-section" style="padding: 16px; background:rgba(0,0,0,0.1); border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0;">⏱️ Exam Dates</h3>
            <button class="icon-btn" id="btn-add-exam" style="color:var(--text-muted); background:none; border:none; font-size:16px; cursor:pointer;" title="Add Exam">+</button>
          </div>
          ${examsHtml}
        </div>
      </div>
    </div>
  `;
}

function bindStudentEvents(page) {
  const container = document.getElementById('page-content');
  if (!container) return;

  // Add Assignment
  const addAssignment = document.getElementById('btn-add-assignment');
  if (addAssignment) {
    addAssignment.onclick = () => {
      showCustomPrompt('Add Assignment', [
        { id: 'name', label: 'Assignment Name' },
        { id: 'course', label: 'Course' },
        { id: 'due', label: 'Due Date', placeholder: 'e.g. May 25, 2025' },
        { id: 'weight', label: 'Grade Weight (%)', placeholder: 'e.g. 15' }
      ], (res) => {
        if (!res.name) return;
        page.assignments.push({
          id: uid(),
          name: res.name,
          course: res.course || 'General',
          dueDate: res.due || '—',
          weight: parseInt(res.weight) || 0,
          status: 'Not Started'
        });
        saveData();
        renderPage();
      });
    };
  }

  // Update Assignment Status
  container.querySelectorAll('.assignment-status-select').forEach(sel => {
    sel.onchange = () => {
      const id = sel.dataset.id;
      const a = page.assignments.find(x => x.id === id);
      if (a) {
        a.status = sel.value;
        saveData();
        renderPage();
      }
    };
  });

  // Delete Assignment
  container.querySelectorAll('.btn-delete-assignment').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      page.assignments = page.assignments.filter(x => x.id !== id);
      saveData();
      renderPage();
    };
  });

  // Add Course for GPA
  const addCourse = document.getElementById('btn-add-course');
  if (addCourse) {
    addCourse.onclick = () => {
      showCustomPrompt('Add Course Grade', [
        { id: 'name', label: 'Course Name (e.g. Calculus)' },
        { id: 'credits', label: 'Credit Hours', placeholder: 'e.g. 3' },
        { id: 'grade', label: 'Letter Grade', type: 'select', options: [
            { value: 'A', label: 'A (4.0)' },
            { value: 'B', label: 'B (3.0)' },
            { value: 'C', label: 'C (2.0)' },
            { value: 'D', label: 'D (1.0)' },
            { value: 'F', label: 'F (0.0)' }
          ]
        }
      ], (res) => {
        if (!res.name) return;
        page.courses.push({
          id: uid(),
          name: res.name,
          credits: parseFloat(res.credits) || 0,
          grade: res.grade || 'A'
        });
        saveData();
        renderPage();
      });
    };
  }

  // Delete Course
  container.querySelectorAll('.btn-delete-course').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      page.courses = page.courses.filter(x => x.id !== id);
      saveData();
      renderPage();
    };
  });

  // Add Exam
  const addExam = document.getElementById('btn-add-exam');
  if (addExam) {
    addExam.onclick = () => {
      showCustomPrompt('Add Exam Countdown', [
        { id: 'course', label: 'Course Subject' },
        { id: 'date', label: 'Exam Date', type: 'date' },
        { id: 'chapters', label: 'Chapters (Optional)', placeholder: 'e.g. 1-4' }
      ], (res) => {
        if (!res.course || !res.date) return;
        page.exams.push({
          id: uid(),
          course: res.course,
          date: res.date,
          chapters: res.chapters || ''
        });
        saveData();
        renderPage();
      });
    };
  }

  // Delete Exam
  container.querySelectorAll('.btn-delete-exam').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      page.exams = page.exams.filter(x => x.id !== id);
      saveData();
      renderPage();
    };
  });

  // Generate Study Schedule
  const genPlan = document.getElementById('btn-generate-study-plan');
  if (genPlan) {
    genPlan.onclick = () => {
      const course = document.getElementById('plan-course').value.trim();
      const examDateStr = document.getElementById('plan-exam-date').value;
      const chaptersStr = document.getElementById('plan-chapters').value.trim();
      
      if (!course || !examDateStr || !chaptersStr) {
        showToast("Please enter course, exam date, and chapters!");
        return;
      }

      let diffDays = 0;
      const parts = examDateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        const examDate = new Date(year, month - 1, day);
        const today = new Date();
        today.setHours(0,0,0,0);
        const diffMs = examDate - today;
        diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      }
      
      if (diffDays <= 0) {
        showToast("Exam date must be in the future!");
        return;
      }

      const chapters = chaptersStr.split(',').map(ch => ch.trim()).filter(Boolean);
      const schedule = [];
      const chaptersPerDay = Math.ceil(chapters.length / diffDays);
      
      for (let i = 0; i < diffDays; i++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + i);
        const sliceStart = i * chaptersPerDay;
        const sliceEnd = Math.min(chapters.length, sliceStart + chaptersPerDay);
        const dayChapters = chapters.slice(sliceStart, sliceEnd);
        
        if (dayChapters.length > 0) {
          schedule.push({
            date: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            content: dayChapters.join(', ')
          });
        }
      }

      page.studyPlans.push({
        id: uid(),
        course,
        schedule
      });
      saveData();
      renderPage();
      showToast("Study schedule generated!");
    };
  }

  // Delete Plan
  container.querySelectorAll('.btn-delete-plan').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      page.studyPlans = page.studyPlans.filter(x => x.id !== id);
      saveData();
      renderPage();
    };
  });
}

// ============================================================
// Personal CRM Page Type View
// ============================================================

function renderCrmHtml(page) {
  const contacts = data.crmContacts || [];

  let contactsListHtml = '';
  if (contacts.length === 0) {
    contactsListHtml = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">No contacts in your CRM yet. Click Add Contact below to begin.</td></tr>`;
  } else {
    const today = new Date();
    today.setHours(0,0,0,0);

    contacts.forEach(c => {
      let lastContactDate;
      if (c.lastContact) {
        const parts = c.lastContact.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const day = parseInt(parts[2], 10);
          lastContactDate = new Date(year, month - 1, day);
        } else {
          lastContactDate = new Date(today);
        }
      } else {
        lastContactDate = new Date(today);
      }
      let frequencyDays = 30;
      if (c.frequency === 'weekly') frequencyDays = 7;
      else if (c.frequency === 'monthly') frequencyDays = 30;
      else if (c.frequency === 'quarterly') frequencyDays = 90;

      const nextContactDate = new Date(lastContactDate);
      nextContactDate.setDate(lastContactDate.getDate() + frequencyDays);
      
      const diffMs = nextContactDate - today;
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      
      let countdownHtml = '';
      if (diffDays > 0) {
        countdownHtml = `<span style="color:#34d399; font-weight:500;">⏰ ${diffDays} days left</span>`;
      } else if (diffDays === 0) {
        countdownHtml = `<span style="color:#f59e0b; font-weight:600;">⚠️ Contact today!</span>`;
      } else {
        countdownHtml = `<span style="color:#ff6b6b; font-weight:600;">🚨 Overdue by ${Math.abs(diffDays)}d!</span>`;
      }

      contactsListHtml += `
        <tr>
          <td><strong style="color:white; font-size:14px;">${escapeHtml(c.name)}</strong></td>
          <td><span class="crm-stage-badge stage-${c.stage.toLowerCase()}">${c.stage}</span></td>
          <td>${escapeHtml(c.lastContact)}</td>
          <td><span style="text-transform:capitalize;">${c.frequency}</span></td>
          <td>${countdownHtml}</td>
          <td><span style="font-size:11px; color:var(--text-muted); max-width:180px; display:inline-block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(c.notes)}">${escapeHtml(c.notes || '—')}</span></td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="btn-action btn-crm-log-today" data-id="${c.id}" style="padding:2px 8px; font-size:11px; cursor:pointer;">Log Contact</button>
              <button class="icon-btn btn-delete-crm-contact" data-id="${c.id}" style="color:var(--text-muted); background:none; border:none; cursor:pointer;">✕</button>
            </div>
          </td>
        </tr>
      `;
    });
  }

  return `
    <div style="max-width: 960px; margin: 0 auto; padding: 0 10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <p style="color: var(--text-muted); font-size:14px; margin:0;">Maintain professional relationships, track check-ins, and log contact updates.</p>
        <button class="btn-action" id="btn-add-crm-contact" style="font-size:12px; background:var(--accent-blue); border:none; padding:6px 12px; color:white; cursor:pointer;">+ Add Contact</button>
      </div>

      <table class="task-table" style="font-size:13px;">
        <thead>
          <tr>
            <th>Name</th>
            <th>Stage</th>
            <th>Last Contacted</th>
            <th>Frequency</th>
            <th>Status</th>
            <th>Notes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${contactsListHtml}
        </tbody>
      </table>
    </div>
  `;
}

function bindCrmEvents(page) {
  const container = document.getElementById('page-content');
  if (!container) return;

  const btnAdd = document.getElementById('btn-add-crm-contact');
  if (btnAdd) {
    btnAdd.onclick = () => {
      showCustomPrompt('Add CRM Contact', [
        { id: 'name', label: 'Name' },
        { id: 'stage', label: 'Relationship Stage', type: 'select', options: [
            { value: 'Mentor', label: 'Mentor' },
            { value: 'Professional', label: 'Professional' },
            { value: 'Friend', label: 'Friend' },
            { value: 'Family', label: 'Family' }
          ]
        },
        { id: 'frequency', label: 'Contact frequency', type: 'select', options: [
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'quarterly', label: 'Quarterly' }
          ]
        },
        { id: 'notes', label: 'Interaction Notes/Details' }
      ], (res) => {
        if (!res.name) return;
        data.crmContacts.push({
          id: 'crm-' + uid(),
          name: res.name,
          stage: res.stage || 'Professional',
          lastContact: new Date().toISOString().split('T')[0],
          frequency: res.frequency || 'monthly',
          notes: res.notes || ''
        });
        saveData();
        renderPage();
        showToast("Contact added to CRM!");
      });
    };
  }

  container.querySelectorAll('.btn-crm-log-today').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const c = data.crmContacts.find(x => x.id === id);
      if (c) {
        c.lastContact = new Date().toISOString().split('T')[0];
        saveData();
        renderPage();
        showToast(`Contact with ${c.name} logged for today!`);
      }
    };
  });

  container.querySelectorAll('.btn-delete-crm-contact').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      data.crmContacts = data.crmContacts.filter(x => x.id !== id);
      saveData();
      renderPage();
    };
  });
}

// ============================================================
// Journal & Mood Tracker Page Type View
// ============================================================

function renderMoodLogsHtml() {
  let moodLogsHtml = '';
  const logs = data.moodLogs || [];
  if (logs.length === 0) {
    moodLogsHtml = `<div style="text-align:center; color:var(--text-muted); font-size:11px; padding:10px;">No mood history logged yet.</div>`;
  } else {
    logs.slice().reverse().forEach(log => {
      moodLogsHtml += `
        <div style="padding:8px 0; border-bottom:1px solid var(--divider); font-size:12px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
            <span style="font-weight:600; color:white;">${log.mood} ${escapeHtml(log.moodName || '')}</span>
            <span style="color:var(--text-muted);">${escapeHtml(log.date)}</span>
          </div>
          <div style="color:var(--text-muted);">${escapeHtml(log.note || '')}</div>
        </div>
      `;
    });
  }
  return moodLogsHtml;
}

function renderBucketListHtml(page) {
  let bucketListHtml = '';
  if (page.bucketList.length === 0) {
    bucketListHtml = `<div style="text-align:center; color:var(--text-muted); font-size:12px; padding:10px;">Your bucket list is empty.</div>`;
  } else {
    page.bucketList.forEach(item => {
      bucketListHtml += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--divider);">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" class="bucket-checkbox" data-id="${item.id}" ${item.checked ? 'checked' : ''} style="accent-color:var(--accent-blue);">
            <span style="color:white; text-decoration: ${item.checked ? 'line-through' : 'none'}; opacity: ${item.checked ? 0.6 : 1}; font-size:13px;">${escapeHtml(item.name)}</span>
          </label>
          <button class="icon-btn btn-delete-bucket" data-id="${item.id}" style="color:var(--text-muted); background:none; border:none; cursor:pointer; padding:2px;">✕</button>
        </div>
      `;
    });
  }
  return bucketListHtml;
}

function renderVisionBoardGridHtml(page) {
  let visionHtml = '';
  if (page.visionBoard.length === 0) {
    visionHtml = `<div style="text-align:center; color:var(--text-muted); font-size:12px; padding:30px; border: 1px dashed var(--divider); border-radius:8px; grid-column: 1 / -1;">Your vision board is empty. Add base64 images or inspirational quotes!</div>`;
  } else {
    page.visionBoard.forEach(img => {
      visionHtml += `
        <div style="position:relative; border-radius:8px; overflow:hidden; border:1px solid var(--border-input); box-shadow:0 4px 10px rgba(0,0,0,0.3); aspect-ratio:1.2; background:rgba(0,0,0,0.2);">
          <img src="${img.src}" style="width:100%; height:100%; object-fit:cover;">
          <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.7); padding:6px; font-size:11px; text-align:center; color:white; font-weight:500;">
            ${escapeHtml(img.caption || '')}
          </div>
          <button class="icon-btn btn-delete-vision" data-id="${img.id}" style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.8); color:white; border:none; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer;">✕</button>
        </div>
      `;
    });
  }
  return visionHtml;
}

function renderDecisionsTbodyHtml(page) {
  let decisionsHtml = '';
  if (page.decisions.length === 0) {
    decisionsHtml = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No decision records yet.</td></tr>`;
  } else {
    page.decisions.forEach(d => {
      decisionsHtml += `
        <tr>
          <td><strong>${escapeHtml(d.name)}</strong></td>
          <td>${escapeHtml(d.predictedOutcome)}</td>
          <td>${escapeHtml(d.reviewDate)}</td>
          <td>
            <select class="student-select decision-status" data-id="${d.id}" style="font-size:11px; padding:2px 4px; background:var(--bg-active); border:1px solid var(--border-input); border-radius:4px; color:white;">
              <option value="Pending" ${d.status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="Correct Prediction" ${d.status === 'Correct Prediction' ? 'selected' : ''}>Correct</option>
              <option value="Incorrect Prediction" ${d.status === 'Incorrect Prediction' ? 'selected' : ''}>Incorrect</option>
            </select>
          </td>
          <td>
            <button class="icon-btn btn-delete-decision" data-id="${d.id}" style="color:var(--text-muted); background:none; border:none; cursor:pointer;">✕</button>
          </td>
        </tr>
      `;
    });
  }
  return decisionsHtml;
}

function renderJournalHtml(page) {
  page.bucketList = page.bucketList || [];
  page.visionBoard = page.visionBoard || [];
  page.decisions = page.decisions || [];
  page.lifeAreas = page.lifeAreas || { career: 5, health: 5, finance: 5, relationships: 5, growth: 5 };

  const prompts = [
    "What made you smile today?",
    "What is something you learned about yourself recently?",
    "What was the most challenging part of your day, and how did you handle it?",
    "Identify three things you are grateful for right now.",
    "What is a personal boundary you set or wish you set today?",
    "What goal are you currently working towards, and what is your next step?"
  ];
  const randPrompt = prompts[new Date().getDate() % prompts.length];

  const bucketListHtml = renderBucketListHtml(page);
  const visionHtml = renderVisionBoardGridHtml(page);
  const decisionsHtml = renderDecisionsTbodyHtml(page);
  const moodLogsHtml = renderMoodLogsHtml();

  return `
    <div style="max-width: 960px; margin: 0 auto; padding: 0 10px;">
      <div class="view-tabs" style="margin-bottom: 20px;">
        <button class="view-tab active" id="tab-journal-mood">Mood & Reflections</button>
        <button class="view-tab" id="tab-journal-vision">Vision & Goals</button>
        <button class="view-tab" id="tab-journal-decisions">Decision Journal</button>
      </div>

      <!-- Mood & Reflections -->
      <div id="journal-mood-view" style="display:grid; grid-template-columns: 2fr 1fr; gap:24px;">
        <div>
          <div class="home-section" style="padding:16px; background:rgba(0,0,0,0.1); border-radius:8px; margin-bottom:20px;">
            <h3 style="margin-bottom:12px;">✍️ Mood & Reflection Entry</h3>
            <div style="display:flex; gap:10px; margin-bottom:16px; justify-content:center;">
              <button class="icon-btn mood-select-btn" data-mood="😍" data-name="Excellent" style="font-size:24px; padding:8px; border-radius:8px; background:none; border:none; cursor:pointer;">😍</button>
              <button class="icon-btn mood-select-btn" data-mood="😊" data-name="Good" style="font-size:24px; padding:8px; border-radius:8px; background:none; border:none; cursor:pointer;">😊</button>
              <button class="icon-btn mood-select-btn" data-mood="😐" data-name="Neutral" style="font-size:24px; padding:8px; border-radius:8px; background:none; border:none; cursor:pointer;">😐</button>
              <button class="icon-btn mood-select-btn" data-mood="😔" data-name="Low" style="font-size:24px; padding:8px; border-radius:8px; background:none; border:none; cursor:pointer;">😔</button>
              <button class="icon-btn mood-select-btn" data-mood="😢" data-name="Bad" style="font-size:24px; padding:8px; border-radius:8px; background:none; border:none; cursor:pointer;">😢</button>
            </div>
            
            <div style="margin-bottom:12px;">
              <label style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:4px;"><strong>Daily Prompt Reflection:</strong> ${randPrompt}</label>
              <textarea id="journal-reflection-input" style="width:100%; height:80px; background:var(--bg-input); border:1px solid var(--border-input); border-radius:6px; padding:8px; color:white; outline:none; resize:none;" placeholder="Reflect on today..."></textarea>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button class="btn-action" id="btn-save-mood-entry" style="background:var(--accent-blue); color:white; border:none; padding:6px 12px; font-size:12px; cursor:pointer;">Save Reflection</button>
            </div>
          </div>
        </div>

        <div>
          <div class="home-section" style="padding:16px; background:rgba(0,0,0,0.1); border-radius:8px; max-height:360px; overflow-y:auto;">
            <h3 style="margin-bottom:12px;">📜 Mood History</h3>
            <div id="mood-history-list">${moodLogsHtml}</div>
          </div>
        </div>
      </div>

      <!-- Vision & Goals -->
      <div id="journal-vision-view" style="display:none; grid-template-columns: 2fr 1.2fr; gap:24px;">
        <div>
          <div class="home-section" style="padding:16px; background:rgba(0,0,0,0.1); border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h3 style="margin:0;">🌠 Vision Board</h3>
              <button class="btn-action" id="btn-add-vision" style="font-size:11px; padding:4px 10px; cursor:pointer;">+ Add Vision</button>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:16px;" id="vision-board-grid">
              ${visionHtml}
            </div>
          </div>
        </div>

        <div>
          <div class="home-section" style="padding:16px; background:rgba(0,0,0,0.1); border-radius:8px; margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h3 style="margin:0;">🪣 Bucket List</h3>
              <button class="icon-btn" id="btn-add-bucket" style="color:var(--text-muted); background:none; border:none; font-size:16px; cursor:pointer;" title="Add bucket item">+</button>
            </div>
            <div style="max-height: 250px; overflow-y:auto;" id="bucket-list-container">
              ${bucketListHtml}
            </div>
          </div>

          <div class="home-section" style="padding:16px; background:rgba(0,0,0,0.1); border-radius:8px;">
            <h3 style="margin-bottom:12px;">🎡 Life Satisfaction</h3>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${Object.keys(page.lifeAreas).map(area => `
                <div>
                  <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                    <span style="text-transform:capitalize; font-weight:500; color:white;">${area}</span>
                    <span style="color:var(--accent-blue); font-weight:600;">${page.lifeAreas[area]}/10</span>
                  </div>
                  <input type="range" min="1" max="10" value="${page.lifeAreas[area]}" class="life-area-slider" data-area="${area}" style="width:100%; accent-color:var(--accent-blue);">
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Decision Journal -->
      <div id="journal-decisions-view" style="display:none;">
        <div class="home-section" style="padding:16px; background:rgba(0,0,0,0.1); border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="margin:0;">⚖️ Decision Log</h3>
            <button class="btn-action" id="btn-add-decision" style="font-size:12px; background:var(--accent-blue); color:white; border:none; padding:6px 12px; cursor:pointer;">+ Record Decision</button>
          </div>
          <p style="color:var(--text-muted); font-size:13px; margin-bottom:16px;">Document your critical decisions, your prediction of the outcome, and specify a review date to check back and evaluate your reasoning.</p>
          <table class="task-table" style="font-size:12px;">
            <thead>
              <tr>
                <th>Decision</th>
                <th>Predicted Outcome</th>
                <th>Review Date</th>
                <th>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="decisions-tbody">
              ${decisionsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function bindBucketListEvents(container, page) {
  container.querySelectorAll('.bucket-checkbox').forEach(cb => {
    cb.onchange = () => {
      const id = cb.dataset.id;
      const item = page.bucketList.find(x => x.id === id);
      if (item) {
        item.checked = cb.checked;
        saveData();
        const span = cb.nextElementSibling;
        if (span) {
          span.style.textDecoration = cb.checked ? 'line-through' : 'none';
          span.style.opacity = cb.checked ? '0.6' : '1';
        }
      }
    };
  });

  container.querySelectorAll('.btn-delete-bucket').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      page.bucketList = page.bucketList.filter(x => x.id !== id);
      saveData();
      const bucketContainer = document.getElementById('bucket-list-container');
      if (bucketContainer) {
        bucketContainer.innerHTML = renderBucketListHtml(page);
        bindBucketListEvents(bucketContainer, page);
      }
    };
  });
}

function bindVisionEvents(container, page) {
  container.querySelectorAll('.btn-delete-vision').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      page.visionBoard = page.visionBoard.filter(x => x.id !== id);
      saveData();
      const visionContainer = document.getElementById('vision-board-grid');
      if (visionContainer) {
        visionContainer.innerHTML = renderVisionBoardGridHtml(page);
        bindVisionEvents(visionContainer, page);
      }
    };
  });
}

function bindDecisionEvents(container, page) {
  container.querySelectorAll('.decision-status').forEach(sel => {
    sel.onchange = () => {
      const id = sel.dataset.id;
      const d = page.decisions.find(x => x.id === id);
      if (d) {
        d.status = sel.value;
        saveData();
      }
    };
  });

  container.querySelectorAll('.btn-delete-decision').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      page.decisions = page.decisions.filter(x => x.id !== id);
      saveData();
      const decisionsTbody = document.getElementById('decisions-tbody');
      if (decisionsTbody) {
        decisionsTbody.innerHTML = renderDecisionsTbodyHtml(page);
        bindDecisionEvents(decisionsTbody, page);
      }
    };
  });
}

function bindJournalEvents(page) {
  const container = document.getElementById('page-content');
  if (!container) return;

  const t1 = document.getElementById('tab-journal-mood');
  const t2 = document.getElementById('tab-journal-vision');
  const t3 = document.getElementById('tab-journal-decisions');
  const v1 = document.getElementById('journal-mood-view');
  const v2 = document.getElementById('journal-vision-view');
  const v3 = document.getElementById('journal-decisions-view');

  if (t1 && t2 && t3 && v1 && v2 && v3) {
    t1.onclick = () => {
      t1.classList.add('active'); t2.classList.remove('active'); t3.classList.remove('active');
      v1.style.display = 'grid'; v2.style.display = 'none'; v3.style.display = 'none';
    };
    t2.onclick = () => {
      t2.classList.add('active'); t1.classList.remove('active'); t3.classList.remove('active');
      v1.style.display = 'none'; v2.style.display = 'grid'; v3.style.display = 'none';
    };
    t3.onclick = () => {
      t3.classList.add('active'); t1.classList.remove('active'); t2.classList.remove('active');
      v1.style.display = 'none'; v2.style.display = 'none'; v3.style.display = 'block';
    };
  }

  let selectedMood = '😊';
  let selectedMoodName = 'Good';
  const moodBtns = container.querySelectorAll('.mood-select-btn');
  moodBtns.forEach(btn => {
    btn.onclick = () => {
      moodBtns.forEach(b => b.style.background = 'transparent');
      btn.style.background = 'rgba(255,255,255,0.1)';
      selectedMood = btn.dataset.mood;
      selectedMoodName = btn.dataset.name;
    };
  });
  const defaultMoodBtn = Array.from(moodBtns).find(b => b.dataset.mood === '😊');
  if (defaultMoodBtn) defaultMoodBtn.style.background = 'rgba(255,255,255,0.1)';

  const saveMoodBtn = document.getElementById('btn-save-mood-entry');
  const reflectionInput = document.getElementById('journal-reflection-input');
  if (saveMoodBtn && reflectionInput) {
    saveMoodBtn.onclick = () => {
      const val = reflectionInput.value.trim();
      if (!val) {
        showToast("Please write a quick reflection!");
        return;
      }
      data.moodLogs = data.moodLogs || [];
      data.moodLogs.push({
        date: new Date().toISOString().split('T')[0],
        mood: selectedMood,
        moodName: selectedMoodName,
        note: val
      });
      saveData();
      
      const moodLogsList = document.getElementById('mood-history-list');
      if (moodLogsList) {
        moodLogsList.innerHTML = renderMoodLogsHtml();
      }
      reflectionInput.value = '';
      showToast("Reflection and mood logged!");
    };
  }

  const addBucket = document.getElementById('btn-add-bucket');
  if (addBucket) {
    addBucket.onclick = () => {
      showCustomPrompt('Add Bucket List Item', [{ id: 'name', label: 'Item details (e.g. Travel to Japan)' }], (res) => {
        if (!res.name) return;
        page.bucketList.push({ id: uid(), name: res.name, checked: false });
        saveData();
        const bucketContainer = document.getElementById('bucket-list-container');
        if (bucketContainer) {
          bucketContainer.innerHTML = renderBucketListHtml(page);
          bindBucketListEvents(bucketContainer, page);
        }
      });
    };
  }

  bindBucketListEvents(container, page);

  const addVision = document.getElementById('btn-add-vision');
  if (addVision) {
    addVision.onclick = () => {
      showCustomPrompt('Add Vision Card', [
        { id: 'caption', label: 'Vision Caption (e.g. Dream House)' },
        { id: 'src', label: 'Image URL or paste Base64 data' }
      ], (res) => {
        if (!res.src) return;
        page.visionBoard.push({
          id: uid(),
          src: res.src,
          caption: res.caption || ''
        });
        saveData();
        const visionContainer = document.getElementById('vision-board-grid');
        if (visionContainer) {
          visionContainer.innerHTML = renderVisionBoardGridHtml(page);
          bindVisionEvents(visionContainer, page);
        }
      });
    };
  }

  bindVisionEvents(container, page);

  container.querySelectorAll('.life-area-slider').forEach(slider => {
    slider.oninput = () => {
      const area = slider.dataset.area;
      page.lifeAreas[area] = parseInt(slider.value) || 5;
      saveData();
      slider.previousElementSibling.querySelector('span:last-child').textContent = slider.value + '/10';
    };
  });

  const addDecision = document.getElementById('btn-add-decision');
  if (addDecision) {
    addDecision.onclick = () => {
      showCustomPrompt('Record Decision Log', [
        { id: 'name', label: 'Decision Description' },
        { id: 'predictedOutcome', label: 'Predicted outcome / Hypothesis' },
        { id: 'reviewDate', label: 'Review Date (YYYY-MM-DD)', placeholder: 'e.g. 2026-09-01' }
      ], (res) => {
        if (!res.name) return;
        page.decisions.push({
          id: uid(),
          name: res.name,
          predictedOutcome: res.predictedOutcome || '',
          reviewDate: res.reviewDate || '',
          status: 'Pending'
        });
        saveData();
        const decisionsTbody = document.getElementById('decisions-tbody');
        if (decisionsTbody) {
          decisionsTbody.innerHTML = renderDecisionsTbodyHtml(page);
          bindDecisionEvents(decisionsTbody, page);
        }
      });
    };
  }

  bindDecisionEvents(container, page);
}

// ============================================================
// Productivity Analytics Page Type View
// ============================================================

function renderProductivityHtml(page) {
  const allTasks = data.pages.reduce((acc, p) => acc.concat(p.tasks || []), []);
  const total = allTasks.length;
  const completed = allTasks.filter(t => t.checked).length;
  const compRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  // GitHub contribution cells (364 cells, columns are weeks)
  let cellsHtml = '';
  const today = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  
  const activity = data.productivityActivity || {};
  const cells = [];
  
  for (let i = 363; i >= 0; i--) {
    const d = new Date(today.getTime() - i * oneDay);
    const dateStr = d.toISOString().split('T')[0];
    const count = activity[dateStr] || 0;
    
    let levelClass = '';
    if (count > 0 && count <= 1) levelClass = 'level-1';
    else if (count > 1 && count <= 3) levelClass = 'level-2';
    else if (count > 3 && count <= 5) levelClass = 'level-3';
    else if (count > 5) levelClass = 'level-4';

    cells.push({
      date: dateStr,
      count,
      levelClass
    });
  }

  cellsHtml = cells.map(c => `
    <div class="heatmap-cell ${c.levelClass}" title="${c.date}: ${c.count} tasks completed"></div>
  `).join('');

  // Output by category
  const categoryCounts = {};
  data.settings.categories.forEach(c => { categoryCounts[c] = 0; });
  data.pages.forEach(p => {
    const cat = p.category || 'Uncategorized';
    if (categoryCounts[cat] === undefined) categoryCounts[cat] = 0;
    categoryCounts[cat] += (p.tasks || []).filter(t => t.checked).length;
  });

  // Most productive day calculation
  let bestDay = 'None';
  let bestCount = 0;
  Object.keys(activity).forEach(dateStr => {
    if (activity[dateStr] > bestCount) {
      bestCount = activity[dateStr];
      bestDay = dateStr;
    }
  });

  const reportHtml = `
    <div style="line-height:1.6; font-size:13px; color:var(--text-primary);">
      <p>💡 <strong>Weekly Activity Report Summary:</strong></p>
      <p>Over the active period, you have registered a total completion of <strong>${completed}</strong> tasks across all workspaces. Your overall completion efficiency rate is currently sitting at <strong>${compRate}%</strong>.</p>
      <p>Your most productive single day was <strong>${bestDay}</strong> where you checked off <strong>${bestCount}</strong> items! Keep up the momentum to secure your daily habits streaks!</p>
    </div>
  `;

  return `
    <div style="max-width: 900px; margin: 0 auto; display:flex; flex-direction:column; gap:24px; padding: 0 10px;">
      
      <!-- Top Overview row -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:16px;">
        <div class="home-stat-card" style="background:rgba(255,255,255,0.02); border:1px solid var(--border-input); border-radius:10px; padding:16px; text-align:center;">
          <div style="font-size:28px; font-weight:700; color:white;">${compRate}%</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Completion Rate</div>
        </div>
        <div class="home-stat-card" style="background:rgba(255,255,255,0.02); border:1px solid var(--border-input); border-radius:10px; padding:16px; text-align:center;">
          <div style="font-size:28px; font-weight:700; color:white;">${completed}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Tasks Finished</div>
        </div>
        <div class="home-stat-card" style="background:rgba(255,255,255,0.02); border:1px solid var(--border-input); border-radius:10px; padding:16px; text-align:center;">
          <div style="font-size:28px; font-weight:700; color:white;">${bestCount}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Max Output / Day</div>
        </div>
        <div class="home-stat-card" style="background:rgba(255,255,255,0.02); border:1px solid var(--border-input); border-radius:10px; padding:16px; text-align:center;">
          <div style="font-size:18px; font-weight:700; color:white; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding: 4px 0;">${bestDay}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Most Productive Day</div>
        </div>
      </div>

      <!-- Heatmap contribution grid -->
      <div class="home-section" style="padding:16px; background:rgba(0,0,0,0.1); border-radius:8px;">
        <h3 style="margin-bottom:12px;">📊 Activity Heatmap (Last 365 Days)</h3>
        <div class="heatmap-container">
          <div class="heatmap-grid" id="heatmap-grid-container" style="display:grid; grid-auto-flow:column; grid-template-rows:repeat(7, 12px); grid-auto-columns:12px; gap:4px; max-width:100%; overflow-x:auto; padding:6px 0;">
            ${cellsHtml}
          </div>
          <div style="display:flex; justify-content:flex-end; font-size:10px; color:var(--text-muted); gap:6px; margin-top:8px;">
            <span>Less</span>
            <div class="heatmap-cell"></div>
            <div class="heatmap-cell level-1"></div>
            <div class="heatmap-cell level-2"></div>
            <div class="heatmap-cell level-3"></div>
            <div class="heatmap-cell level-4"></div>
            <span>More</span>
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:24px;">
        <div class="home-section" style="padding:16px; background:rgba(0,0,0,0.1); border-radius:8px;">
          <h3 style="margin-bottom:12px;">📝 Weekly Productivity Summary</h3>
          ${reportHtml}
        </div>

        <div class="home-section" style="padding:16px; background:rgba(0,0,0,0.1); border-radius:8px;">
          <h3 style="margin-bottom:12px;">📁 Output by Category</h3>
          <div style="display:flex; flex-direction:column; gap:12px; margin-top:10px;">
            ${Object.keys(categoryCounts).map(cat => {
              const count = categoryCounts[cat];
              const pct = completed > 0 ? Math.round((count / completed) * 100) : 0;
              return `
                <div>
                  <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
                    <span style="font-weight:500; color:white;">${escapeHtml(cat)}</span>
                    <span style="color:var(--text-muted);">${count} completed (${pct}%)</span>
                  </div>
                  <div style="width:100%; height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:var(--accent-blue); border-radius:3px;"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

    </div>
  `;
}

function bindProductivityEvents(page) {
  // Read-only dashboard display
}

// ============================================================
// Fuzzy Search Palette Modal Logic
// ============================================================

function openFuzzySearchPalette() {
  let modal = document.getElementById('fuzzy-search-palette-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'fuzzy-search-palette-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0,0,0,0.6)';
    modal.style.zIndex = '100000';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.paddingTop = '80px';
    modal.innerHTML = `
      <div style="background:#222; border:1px solid #444; border-radius:12px; width:500px; max-height:400px; display:flex; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.8); overflow:hidden;">
        <input type="text" id="palette-search-input" placeholder="Search pages... (Enter to open, Esc to close)" style="width:100%; padding:14px; background:#111; border:none; border-bottom:1px solid #444; color:white; font-size:15px; outline:none;" autocomplete="off">
        <div id="palette-results" style="flex:1; overflow-y:auto; padding:8px 0;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeSearchPalette();
    });

    const input = document.getElementById('palette-search-input');
    input.addEventListener('input', () => updatePaletteResults());
    input.addEventListener('keydown', handlePaletteKeydown);
  }

  modal.style.display = 'flex';
  const input = document.getElementById('palette-search-input');
  input.value = '';
  input.focus();
  updatePaletteResults();
}

function closeSearchPalette() {
  const modal = document.getElementById('fuzzy-search-palette-modal');
  if (modal) modal.style.display = 'none';
}

let activePaletteIndex = 0;
let palettePages = [];

function updatePaletteResults() {
  const input = document.getElementById('palette-search-input');
  const query = input.value.trim().toLowerCase();
  
  if (query === '') {
    palettePages = data.recentIds.map(id => getPage(id)).filter(Boolean).slice(0, 10);
  } else {
    palettePages = data.pages.filter(p => p.name.toLowerCase().includes(query));
  }

  activePaletteIndex = 0;
  renderPaletteRows();
}

function renderPaletteRows() {
  const resultsContainer = document.getElementById('palette-results');
  if (palettePages.length === 0) {
    resultsContainer.innerHTML = `<div style="padding:12px; color:var(--text-muted); font-size:13px; text-align:center;">No pages match your search.</div>`;
    return;
  }

  resultsContainer.innerHTML = palettePages.map((p, idx) => {
    const isActive = idx === activePaletteIndex;
    const typeLabel = p.type ? p.type.toUpperCase() : 'PAGE';
    return `
      <div class="palette-row" data-page-id="${p.id}" data-index="${idx}" style="padding:10px 16px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; background:${isActive ? 'var(--accent-blue)' : 'transparent'}; color:${isActive ? 'white' : 'var(--text-primary)'}; font-size:14px;">
        <span style="font-weight:500;">📂 ${escapeHtml(p.name)}</span>
        <span style="font-size:10px; opacity:0.7; background:${isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}; padding:2px 6px; border-radius:4px;">${typeLabel}</span>
      </div>
    `;
  }).join('');

  resultsContainer.querySelectorAll('.palette-row').forEach(row => {
    row.onclick = () => {
      const pId = row.dataset.pageId;
      navigateTo(pId);
      closeSearchPalette();
    };
  });
}

function handlePaletteKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activePaletteIndex = (activePaletteIndex + 1) % palettePages.length;
    renderPaletteRows();
    scrollActivePaletteRowIntoView();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activePaletteIndex = (activePaletteIndex - 1 + palettePages.length) % palettePages.length;
    renderPaletteRows();
    scrollActivePaletteRowIntoView();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (palettePages.length > 0) {
      const activePage = palettePages[activePaletteIndex];
      navigateTo(activePage.id);
      closeSearchPalette();
    }
  }
}

function scrollActivePaletteRowIntoView() {
  const container = document.getElementById('palette-results');
  const activeRow = container.querySelector(`.palette-row[data-index="${activePaletteIndex}"]`);
  if (activeRow) {
    activeRow.scrollIntoView({ block: 'nearest' });
  }
}

// ============================================================
// Keyboard Shortcuts Cheat Sheet Logic
// ============================================================

function openShortcutsCheatSheet() {
  let modal = document.getElementById('shortcuts-cheat-sheet-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'shortcuts-cheat-sheet-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0,0,0,0.6)';
    modal.style.zIndex = '100000';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.innerHTML = `
      <div style="background:#222; border:1px solid #444; border-radius:12px; width:400px; padding:24px; box-shadow:0 10px 30px rgba(0,0,0,0.8); color:white;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; padding-bottom:12px; margin-bottom:16px;">
          <h3 style="margin:0; font-size:16px;">⌨️ Keyboard Shortcuts</h3>
          <button id="btn-close-shortcuts-modal" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:16px;">✕</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px; font-size:13px;">
          <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Open Search Palette</span><kbd style="background:#444; padding:2px 6px; border-radius:4px;">Ctrl + P</kbd></div>
          <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Keyboard Shortcuts Cheat Sheet</span><kbd style="background:#444; padding:2px 6px; border-radius:4px;">Ctrl + /</kbd></div>
          <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Bold Text (Note Editor)</span><kbd style="background:#444; padding:2px 6px; border-radius:4px;">Ctrl + B</kbd></div>
          <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Italic Text (Note Editor)</span><kbd style="background:#444; padding:2px 6px; border-radius:4px;">Ctrl + I</kbd></div>
          <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Underline Text (Note Editor)</span><kbd style="background:#444; padding:2px 6px; border-radius:4px;">Ctrl + U</kbd></div>
          <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Wiki-Link navigation</span><kbd style="background:#444; padding:2px 6px; border-radius:4px;">Click [[link]]</kbd></div>
          <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Create new Wiki-Link page</span><kbd style="background:#444; padding:2px 6px; border-radius:4px;">DblClick [[link]]</kbd></div>
          <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Close overlays / Modals</span><kbd style="background:#444; padding:2px 6px; border-radius:4px;">Escape</kbd></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeShortcutsCheatSheet();
    });

    const closeBtn = document.getElementById('btn-close-shortcuts-modal');
    closeBtn.onclick = closeShortcutsCheatSheet;
  }

  modal.style.display = 'flex';
}

function closeShortcutsCheatSheet() {
  const modal = document.getElementById('shortcuts-cheat-sheet-modal');
  if (modal) modal.style.display = 'none';
}

// ============================================================
// Interactive Physics-based Knowledge Graph Modal
// ============================================================

function openKnowledgeGraphModal() {
  let modal = document.getElementById('knowledge-graph-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'knowledge-graph-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0,0,0,0.85)';
    modal.style.zIndex = '100000';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.innerHTML = `
      <div style="width:90%; height:90%; background:#1c1c1c; border:1px solid #333; border-radius:12px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 15px 40px rgba(0,0,0,0.8);">
        <div style="display:flex; justify-content:space-between; align-items:center; background:#222; padding:14px 20px; border-bottom:1px solid #333;">
          <h3 style="margin:0; font-size:15px; color:white; display:flex; align-items:center; gap:8px;">
            <span>🌐 Knowledge Graph</span>
            <span style="font-size:11px; background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:10px; color:var(--text-muted); font-weight:normal;">Drag nodes, scroll to zoom, click note to navigate</span>
          </h3>
          <button id="btn-close-graph-modal" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:18px;">✕</button>
        </div>
        <div style="flex:1; position:relative; overflow:hidden;" id="graph-canvas-container">
          <canvas id="knowledge-graph-canvas" style="width:100%; height:100%; display:block; cursor:grab;"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeKnowledgeGraphModal();
    });

    const closeBtn = document.getElementById('btn-close-graph-modal');
    closeBtn.onclick = closeKnowledgeGraphModal;
  }

  modal.style.display = 'flex';
  initKnowledgeGraphCanvas();
}

function closeKnowledgeGraphModal() {
  const modal = document.getElementById('knowledge-graph-modal');
  if (modal) {
    modal.style.display = 'none';
    if (window._graphAnimationId) {
      cancelAnimationFrame(window._graphAnimationId);
      window._graphAnimationId = null;
    }
  }
}

function initKnowledgeGraphCanvas() {
  const canvas = document.getElementById('knowledge-graph-canvas');
  const container = document.getElementById('graph-canvas-container');
  if (!canvas || !container) return;

  const rect = container.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const ctx = canvas.getContext('2d');

  // Build nodes
  const nodes = data.pages.map((p, idx) => {
    const angle = (idx / data.pages.length) * Math.PI * 2;
    const r = Math.min(canvas.width, canvas.height) * 0.3;
    return {
      id: p.id,
      name: p.name,
      x: canvas.width / 2 + Math.cos(angle) * r,
      y: canvas.height / 2 + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
      r: 8 + Math.min(12, (p.tasks || []).length + (p.content || '').length / 500)
    };
  });

  // Build links
  const links = [];
  data.pages.forEach(p => {
    if (!p.content) return;
    const regex = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = regex.exec(p.content)) !== null) {
      const targetName = match[1].trim().toLowerCase();
      const targetPage = data.pages.find(tp => tp.name.toLowerCase() === targetName);
      if (targetPage) {
        links.push({ source: p.id, target: targetPage.id });
      }
    }
  });

  let panX = 0;
  let panY = 0;
  let zoom = 1.0;
  let dragNode = null;
  let dragStartMouse = { x: 0, y: 0 };
  let isPanning = false;

  const getCanvasMouse = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = (mouseX - canvas.width / 2 - panX) / zoom + canvas.width / 2;
    const worldY = (mouseY - canvas.height / 2 - panY) / zoom + canvas.height / 2;
    return { x: worldX, y: worldY, screenX: mouseX, screenY: mouseY };
  };

  canvas.onmousedown = (e) => {
    const mouse = getCanvasMouse(e);
    dragNode = null;
    for (let node of nodes) {
      const dist = Math.hypot(node.x - mouse.x, node.y - mouse.y);
      if (dist <= node.r + 5) {
        dragNode = node;
        canvas.style.cursor = 'grabbing';
        break;
      }
    }

    if (!dragNode) {
      isPanning = true;
      dragStartMouse = { x: e.clientX - panX, y: e.clientY - panY };
      canvas.style.cursor = 'grabbing';
    }
  };

  canvas.onmousemove = (e) => {
    if (dragNode) {
      const mouse = getCanvasMouse(e);
      dragNode.x = mouse.x;
      dragNode.y = mouse.y;
      dragNode.vx = 0;
      dragNode.vy = 0;
    } else if (isPanning) {
      panX = e.clientX - dragStartMouse.x;
      panY = e.clientY - dragStartMouse.y;
    } else {
      const mouse = getCanvasMouse(e);
      let hoverNode = false;
      for (let node of nodes) {
        if (Math.hypot(node.x - mouse.x, node.y - mouse.y) <= node.r + 5) {
          hoverNode = true;
          break;
        }
      }
      canvas.style.cursor = hoverNode ? 'pointer' : 'grab';
    }
  };

  canvas.onmouseup = (e) => {
    if (dragNode) {
      navigateTo(dragNode.id);
      closeKnowledgeGraphModal();
    }
    dragNode = null;
    isPanning = false;
    canvas.style.cursor = 'grab';
  };

  canvas.onwheel = (e) => {
    e.preventDefault();
    const zoomIntensity = 0.08;
    const mouse = getCanvasMouse(e);
    
    const oldZoom = zoom;
    if (e.deltaY < 0) {
      zoom = Math.min(3.0, zoom + zoomIntensity);
    } else {
      zoom = Math.max(0.3, zoom - zoomIntensity);
    }

    panX -= (mouse.screenX - canvas.width / 2 - panX) * (zoom / oldZoom - 1);
    panY -= (mouse.screenY - canvas.height / 2 - panY) * (zoom / oldZoom - 1);
  };

  const simulationStep = () => {
    // 1. Force Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      const n1 = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const n2 = nodes[j];
        const dx = n2.x - n1.x || 0.1;
        const dy = n2.y - n1.y || 0.1;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 400) {
          const force = 180 / (dist * dist);
          n1.vx -= force * (dx / dist);
          n1.vy -= force * (dy / dist);
          n2.vx += force * (dx / dist);
          n2.vy += force * (dy / dist);
        }
      }
    }

    // 2. Force Attraction along links
    links.forEach(link => {
      const n1 = nodes.find(n => n.id === link.source);
      const n2 = nodes.find(n => n.id === link.target);
      if (n1 && n2) {
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.hypot(dx, dy) || 1;
        const targetLen = 80;
        const force = (dist - targetLen) * 0.015;
        n1.vx += force * (dx / dist);
        n1.vy += force * (dy / dist);
        n2.vx -= force * (dx / dist);
        n2.vy -= force * (dy / dist);
      }
    });

    // 3. Gravity pulling to center
    nodes.forEach(n => {
      const dx = canvas.width / 2 - n.x;
      const dy = canvas.height / 2 - n.y;
      n.vx += dx * 0.005;
      n.vy += dy * 0.005;
    });

    // 4. Update coordinates with friction
    nodes.forEach(n => {
      if (n === dragNode) return;
      n.vx *= 0.85;
      n.vy *= 0.85;
      n.x += n.vx;
      n.y += n.vy;
    });
  };

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    // Draw Links
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    links.forEach(link => {
      const n1 = nodes.find(n => n.id === link.source);
      const n2 = nodes.find(n => n.id === link.target);
      if (n1 && n2) {
        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
        ctx.stroke();
      }
    });

    // Draw Nodes
    nodes.forEach(n => {
      const isConnected = links.some(l => l.source === n.id || l.target === n.id);
      
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = isConnected ? 'var(--accent-blue)' : '#888';
      ctx.fill();

      if (n === dragNode) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = '#eee';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.name, n.x, n.y - n.r - 4);
    });

    ctx.restore();
  };

  const animate = () => {
    simulationStep();
    draw();
    window._graphAnimationId = requestAnimationFrame(animate);
  };

  animate();
}


