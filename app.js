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
    sidebarCollapsed: false,
    categories: ['To-dos', 'Notes', 'Journal', 'Personal', 'Work']
  },
  stickies: []
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
      if (parsed.settings.stickyNotes === undefined) parsed.settings.stickyNotes = true;
      if (parsed.settings.banners === undefined) parsed.settings.banners = true;
      if (parsed.settings.theme === undefined) parsed.settings.theme = 'dark';
      if (parsed.settings.sidebarCollapsed === undefined) parsed.settings.sidebarCollapsed = false;
      if (!parsed.settings.categories) {
        parsed.settings.categories = ['To-dos', 'Notes', 'Journal', 'Personal', 'Work'];
      }
      
      // Stickies Migration
      parsed.stickies = parsed.stickies || [];
      
      // Page Category and Banner Migration
      parsed.pages.forEach(p => {
        if (!p.category) p.category = 'To-dos';
        if (p.banner === undefined) p.banner = '';
      });
      
      return parsed;
    }
  } catch { /* ignore */ }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
  
  let icon = page.name ? page.name.charAt(0).toUpperCase() : 'U';
  
  div.innerHTML = `<span class="item-icon" style="font-weight:bold; font-size:12px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.1); border-radius:4px; width:16px; height:16px;">${icon}</span><span class="item-text">${escapeHtml(page.name)}</span>`;
  div.addEventListener('click', () => navigateTo(page.id));
  return div;
}


async function renderPdfBuffer(selectedDoc, dataBuffer, canvas) {
  if (!window.pdfjsLib) return;
  // Use local worker for fully offline support
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + '/lib/pdf.worker.min.js';

  try {
    const pdf = await pdfjsLib.getDocument({data: new Uint8Array(dataBuffer)}).promise;
    const pageNum = selectedDoc.currentPage || 1;
    const page = await pdf.getPage(pageNum);
    
    const scale = 1.3;
    const viewport = page.getViewport({ scale: scale });

    // Stack layers with absolute positioning inside relative wrapper
    const canvasContainer = canvas.parentNode;
    if (canvasContainer) {
      canvasContainer.innerHTML = `
        <div class="pdf-page-container" style="position: relative; width: ${viewport.width}px; height: ${viewport.height}px; margin: 0 auto; box-shadow: 0 4px 15px rgba(0,0,0,0.3); background: #fff;">
          <canvas id="pdf-render-canvas" style="position: absolute; top: 0; left: 0; width: ${viewport.width}px; height: ${viewport.height}px; z-index: 1; pointer-events: none;"></canvas>
          <div class="textLayer" id="pdf-text-layer" style="position: absolute; top: 0; left: 0; width: ${viewport.width}px; height: ${viewport.height}px; z-index: 2; overflow: hidden; line-height: 1; --scale-factor: 1;"></div>
        </div>
      `;
    }

    const newCanvas = document.getElementById('pdf-render-canvas');
    const textLayerDiv = document.getElementById('pdf-text-layer');
    if (!newCanvas || !textLayerDiv) return;

    // Bind selection event listener to the text layer
    textLayerDiv.addEventListener('mouseup', handleTextSelection);

    // Fix scale mismatch: canvas backing buffer scaled by dpr
    const dpr = window.devicePixelRatio || 1;
    newCanvas.width = viewport.width * dpr;
    newCanvas.height = viewport.height * dpr;
    newCanvas.style.width = `${viewport.width}px`;
    newCanvas.style.height = `${viewport.height}px`;

    const context = newCanvas.getContext('2d');
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      transform: [dpr, 0, 0, dpr, 0, 0]
    };

    await page.render(renderContext).promise;

    // Clean up active text layer
    if (activeTextLayer) {
      try {
        activeTextLayer.cancel();
      } catch (e) {
        console.error("Error cancelling text layer:", e);
      }
      activeTextLayer = null;
    }

    // Use renderTextLayer API (PDF.js build does NOT expose TextLayer as constructor on pdfjsLib; use renderTextLayer to populate selectable text layer)
    const textContent = page.streamTextContent ? page.streamTextContent() : page.getTextContent();
    const textLayerTask = window.pdfjsLib.renderTextLayer({
      textContentSource: textContent,  // preferred in this build
      container: textLayerDiv,
      viewport: viewport
    });
    activeTextLayer = textLayerTask;

    // Apply highlights
    const pageHighlights = selectedDoc.highlights.filter(h => h.page === pageNum);
    pageHighlights.forEach(h => {
      highlightTextInContainer(textLayerDiv, h.text, h.color);
    });

  } catch (err) {
    console.error("Error rendering PDF:", err);
  }
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
      console.warn('[PDF] EmbedPDF failed to load in time, falling back to local PDF.js.');
      triggerPdfCanvasRender(selectedDoc);
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

function triggerPdfCanvasRender(selectedDoc) {
  const container = document.getElementById('pdf-view-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding:50px; color:var(--text-muted);">Loading PDF (local PDF.js - fully offline)...</div>';

  getFileFromDB(selectedDoc.id).then(buffer => {
    if (!buffer) {
      container.innerHTML = '<div style="text-align:center; padding:50px; color:var(--text-muted);">Document data not found.</div>';
      return;
    }

    // Use local PDF.js (no CDN, fully offline)
    if (!window.pdfjsLib) {
      container.innerHTML = '<div style="text-align:center; padding:50px; color:#ff6b6b;">PDF.js not loaded. Make sure lib/pdf.min.js exists.</div>';
      return;
    }
    // Always use the local worker (we ship it in lib/)
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + '/lib/pdf.worker.min.js';

    const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    loadingTask.promise.then(pdf => {
      if (!selectedDoc.pageCount || selectedDoc.pageCount < 1) {
        selectedDoc.pageCount = pdf.numPages;
        saveData();
      }
      const pageNum = Math.min(Math.max(selectedDoc.currentPage || 1, 1), pdf.numPages);
      selectedDoc.currentPage = pageNum;
      saveData();

      container.innerHTML = '';
      container.style.position = 'relative';
      container.style.overflow = 'auto';
      container.style.background = '#222';

      const renderCurrentPage = async () => {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">Rendering page...</div>';
        try {
          const page = await pdf.getPage(selectedDoc.currentPage);

          const scale = 1.4;
          const viewport = page.getViewport({ scale });

          const wrapper = document.createElement('div');
          wrapper.style.position = 'relative';
          wrapper.style.width = viewport.width + 'px';
          wrapper.style.height = viewport.height + 'px';
          wrapper.style.margin = '0 auto';
          wrapper.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
          wrapper.style.background = '#fff';

          const canvas = document.createElement('canvas');
          canvas.style.position = 'absolute';
          canvas.style.top = '0';
          canvas.style.left = '0';
          canvas.style.zIndex = '1';
          canvas.style.pointerEvents = 'none';

          const textLayerDiv = document.createElement('div');
          textLayerDiv.className = 'textLayer';
          textLayerDiv.style.position = 'absolute';
          textLayerDiv.style.top = '0';
          textLayerDiv.style.left = '0';
          textLayerDiv.style.width = viewport.width + 'px';
          textLayerDiv.style.height = viewport.height + 'px';
          textLayerDiv.style.zIndex = '2';
          textLayerDiv.style.overflow = 'hidden';
          textLayerDiv.style.lineHeight = '1';
          textLayerDiv.style.userSelect = 'text';

          wrapper.appendChild(canvas);
          wrapper.appendChild(textLayerDiv);
          container.appendChild(wrapper);

          const dpr = window.devicePixelRatio || 1;
          canvas.width = viewport.width * dpr;
          canvas.height = viewport.height * dpr;
          canvas.style.width = viewport.width + 'px';
          canvas.style.height = viewport.height + 'px';

          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport, transform: [dpr, 0, 0, dpr, 0, 0] }).promise;

          const textContent = await page.getTextContent();
          // Use renderTextLayer API (PDF.js 3.x/4.x build does NOT expose TextLayer as constructor; use renderTextLayer to populate selectable text layer for highlights/selection)
          const textLayerTask = window.pdfjsLib.renderTextLayer({
            textContentSource: textContent,  // preferred in this build (falls back from textContent if needed)
            container: textLayerDiv,
            viewport: viewport
          });
          activeTextLayer = textLayerTask;
          // No .render() or await needed for basic selection + highlight re-apply (per v3 compat); highlights applied immediately after (DOM is populated synchronously enough for most cases)

          const pageHighlights = (selectedDoc.highlights || []).filter(h => h.page === selectedDoc.currentPage);
          pageHighlights.forEach(h => highlightTextInContainer(textLayerDiv, h.text, h.color));

          textLayerDiv.addEventListener('mouseup', handleTextSelection);

          const btnPrev = document.getElementById('btn-reader-prev');
          const btnNext = document.getElementById('btn-reader-next');
          const btnFullscreen = document.getElementById('btn-reader-fullscreen');
          const total = selectedDoc.pageCount || pdf.numPages;
          if (btnPrev) btnPrev.disabled = selectedDoc.currentPage <= 1;
          if (btnNext) btnNext.disabled = selectedDoc.currentPage >= total;
          if (btnFullscreen) btnFullscreen.style.display = 'inline-block';
        } catch (e) {
          console.error(e);
          container.innerHTML = '<div style="color:#ff6b6b;text-align:center;padding:40px;">Render error: ' + e.message + '</div>';
        }
      };

      renderCurrentPage();
      container._pdfRenderFn = renderCurrentPage;
    }).catch(err => {
      console.error(err);
      container.innerHTML = '<div style="text-align:center; padding:50px; color:#ff6b6b;">Failed to load PDF: ' + (err.message || err) + '</div>';
    });
  }).catch(err => {
    console.error(err);
    container.innerHTML = '<div style="text-align:center; padding:50px; color:var(--text-muted);">Failed to load from storage.</div>';
  });
}

// EmbedPDF renderer (preferred for the main Library PDF view)
// Uses the locally bundled @embedpdf/snippet + pdfium.wasm (fully offline, no CDN)
function triggerEmbedPdfRender(selectedDoc) {
  const container = document.getElementById('pdf-view-container');
  if (!container || !window.EmbedPDF || typeof window.EmbedPDF.init !== 'function') {
    return triggerPdfCanvasRender(selectedDoc);
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
        wasmUrl: window.location.origin + '/lib/pdfium.wasm',
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
        const btnPrev = document.getElementById('btn-reader-prev');
        const btnNext = document.getElementById('btn-reader-next');
        const btnFs = document.getElementById('btn-reader-fullscreen');

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
          triggerEmbedPdfRender(selectedDoc);
        } else {
          triggerPdfCanvasRender(selectedDoc);
        }
      };

    } catch (err) {
      console.error('[EmbedPDF] init error', err);
      container.innerHTML = '<div style="color:#ff6b6b;text-align:center;padding:40px;">EmbedPDF error: ' + (err.message || err) + '<br>Falling back to pdf.js...</div>';
      setTimeout(() => triggerPdfCanvasRender(selectedDoc), 50);
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
    contentHtml = `
      <div style="max-width: 720px; margin: 0 auto;">
        <div class="page-breadcrumb" style="margin-bottom: 20px;">
          <span>Notes</span>
        </div>
        
        <textarea id="notes-textarea" style="
          width: 100%; 
          min-height: 500px; 
          background: rgba(255,255,255,0.03); 
          border: 1px solid rgba(255,255,255,0.08); 
          border-radius: 8px; 
          padding: 24px; 
          font-size: 15px; 
          line-height: 1.6; 
          color: var(--text-primary);
          font-family: var(--font-stack);
          resize: vertical;
          outline: none;
        " placeholder="Start typing your notes here...">${escapeHtml(page.content || '')}</textarea>
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
    const editor = document.getElementById('notes-textarea');
    if (editor) {
      editor.addEventListener('input', () => {
        page.content = editor.value;
        saveData();
      });
    }
  }

  

  if (pageType === 'planner') {
    bindPlannerEvents(page);
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
  const firstDayIndex = date.getDay();
  const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevLastDay = new Date(currentYear, currentMonth, 0).getDate();
  const monthName = date.toLocaleString('default', { month: 'long' });

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
      p.tasks.forEach(t => {
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

    if (!e.target.closest('input') && !e.target.closest('textarea') && !e.target.isContentEditable) {
      showContextMenu(e, 'global', {});
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

      if (action === 'delete-page' && type === 'page') {
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
  saveData();
  renderSidebar();
  renderPage();
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
        page.name = newName;
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
    { id: 'tasks', label: 'Tasks (to-do list + calendar)' },
    { id: 'notes', label: 'Notes (simple typing area)' },
    { id: 'planner', label: 'Planner (planning & goals)' }
  ];

  let html = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;">';
  html += '<div style="background:#2c2c2c;border-radius:12px;padding:24px;width:320px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">';
  html += '<h3 style="margin:0 0 16px 0;font-size:16px;">Choose page type</h3>';
  
  types.forEach(t => {
    html += `<div class="page-type-option" data-type="${t.id}" style="padding:12px 16px;margin-bottom:8px;background:#3a3a3a;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:12px;">`;
    html += `<div style="width:32px;height:32px;background:#555;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;">`;
    if (t.id === 'tasks') html += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
    else if (t.id === 'notes') html += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
    else if (t.id === 'planner') html += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    html += `</div>`;
    html += `<div><div style="font-weight:500;">${t.label.split(' (')[0]}</div><div style="font-size:12px;color:#888;">${t.label.split(' (')[1] || ''}</div></div>`;
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

function renderHomeHtml() {
  const greeting = getGreeting();
  const workspaceName = data.settings.workspaceName || 'Workspace';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const allTasks = data.pages.reduce((acc, p) => acc.concat(p.tasks || []), []);
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter(t => t.checked).length;
  const pendingTasks = totalTasks - completedTasks;
  const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (completionPct / 100) * circumference;

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
  if (recentPages.length === 0) recentCardsHtml = '<div class="home-empty-state">No recent pages yet. Create a page to get started!</div>';

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
  const topUpcoming = upcomingTasks.slice(0, 10);
  let upcomingHtml = '';
  if (topUpcoming.length === 0) {
    upcomingHtml = '<div class="home-empty-state">No upcoming tasks. You\'re all caught up!</div>';
  } else {
    topUpcoming.forEach(t => {
      upcomingHtml += `
        <div class="home-upcoming-item" style="display:flex; align-items:center; gap:12px; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--divider); border-radius:6px; margin-bottom:8px;">
          <div class="task-checkbox" data-page-id="${t.pageId}" data-task-id="${t.id}" style="cursor:pointer;">
            <svg viewBox="0 0 10 10" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,5.5 4,8 8.5,2.5"/></svg>
          </div>
          <div class="home-upcoming-content" style="flex:1;">
            <div class="home-upcoming-name" contenteditable="true" data-page-id="${t.pageId}" data-task-id="${t.id}" spellcheck="false" style="outline:none; font-weight:500;">${escapeHtml(t.name)}</div>
            <div class="home-upcoming-meta" style="font-size:12px; color:var(--text-muted); margin-top:4px;">
              <span class="home-upcoming-page">${escapeHtml(t.pageName)}</span> &bull;
              <span class="home-upcoming-due">${escapeHtml(t.due)}</span>
            </div>
          </div>
        </div>`;
    });
  }

  let plansHtml = '';
  let goalsHtml = '';
  const plannerPages = data.pages.filter(p => p.type === 'planner');
  
  if (plannerPages.length === 0) {
    plansHtml = '<div class="home-empty-state">No plans yet. Create a Planner page!</div>';
    goalsHtml = '<div class="home-empty-state">No goals yet. Create a Planner page!</div>';
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

  if (!data.settings.quickActions) {
    data.settings.quickActions = [
      { id: 'home-new-page', type: 'internal', target: 'new-page', label: 'New Page', icon: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' },
      { id: 'home-go-library', type: 'internal', target: 'library', label: 'Library', icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
      { id: 'home-go-settings', type: 'internal', target: 'settings', label: 'Settings', icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' }
    ];
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

  if (!data.settings.homeLayout) data.settings.homeLayout = ['recents', 'tasks', 'plans', 'goals'];

  const renderModule = (id) => {
    let title, content;
    if (id === 'recents') { title = 'Recently Visited'; content = `<div class="home-recent-grid">${recentCardsHtml}</div>`; }
    else if (id === 'tasks') { title = 'Upcoming Tasks'; content = `<div class="home-upcoming-list">${upcomingHtml}</div>`; }
    else if (id === 'plans') { title = 'Plans & Priorities'; content = plansHtml; }
    else if (id === 'goals') { title = 'Goals'; content = goalsHtml; }

    return `
      <div class="home-section modular-section" data-module-id="${id}" style="border: 1px solid transparent; padding: 8px; border-radius: 8px; transition: border 0.2s; background: rgba(0,0,0,0.1);">
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
  const libCount = (data.library || []).length;

  return `${getBannerHtml("home")}
    <div class="page-breadcrumb"><span>Home</span></div>
    <div class="page-title-row">
      <span class="page-title-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg></span>
      <h1 class="page-title" spellcheck="false">Dashboard</h1>
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

    <div class="table-toolbar" style="margin-bottom: 12px;">
      <div class="toolbar-left">
        <span style="font-size: 13px; color: var(--text-muted);">Welcome back! Drag sections to reorder.</span>
      </div>
    </div>

    <div class="home-view" style="max-width: none; margin: 16px 0 0 0;">
      <div class="home-hero">
        <div class="home-hero-text">
          <div class="home-greeting">${greeting}, <strong>${escapeHtml(workspaceName)}</strong></div>
          <div class="home-date">${dateStr}</div>
        </div>
        <div class="home-hero-ring">
          <svg viewBox="0 0 100 100" class="home-ring-svg">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--divider)" stroke-width="6"/>
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--text-primary)" stroke-width="6"
              stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
              stroke-linecap="round" transform="rotate(-90 50 50)" style="transition: stroke-dashoffset 1s ease;"/>
          </svg>
          <div class="home-ring-label"><span class="home-ring-pct" style="color:var(--text-primary);">${completionPct}%</span><span class="home-ring-sub">done</span></div>
        </div>
      </div>

      <div class="home-stats-row">
        <div class="home-stat-card"><div class="home-stat-number">${totalTasks}</div><div class="home-stat-label">Total Tasks</div></div>
        <div class="home-stat-card"><div class="home-stat-number">${completedTasks}</div><div class="home-stat-label">Completed</div></div>
        <div class="home-stat-card"><div class="home-stat-number">${pendingTasks}</div><div class="home-stat-label">Pending</div></div>
        <div class="home-stat-card"><div class="home-stat-number">${libCount}</div><div class="home-stat-label">Library Docs</div></div>
      </div>

      <div class="home-section" style="margin-bottom: 24px;">
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

  modulesContainer.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return false; });
  modulesContainer.addEventListener('dragenter', (e) => {
    e.preventDefault();
    const dropTarget = e.target.closest('.modular-section');
    if (dropTarget && dropTarget !== dragSrcEl) dropTarget.style.border = '1px dashed var(--text-primary)';
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
  document.body.classList.toggle('light-theme', theme === 'light');
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
  
  let categoriesListHtml = '';
  settings.categories.forEach(cat => {
    categoriesListHtml += `
      <div class="settings-cat-item">
        <span class="settings-cat-name">${escapeHtml(cat)}</span>
        <button class="settings-cat-delete-btn" data-cat="${escapeHtml(cat)}" title="Delete Category">&times;</button>
      </div>
    `;
  });

  return `${getBannerHtml("settings")}
    <div class="settings-view-container">
      <div class="settings-header">
        <h2>Settings</h2>
        <p>Configure your workspace features, theme, cover banners, and sidebar page categories.</p>
      </div>

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
        <h3>Theme Customization</h3>
        <div class="settings-toggle-row">
          <div class="toggle-control">
            <div class="toggle-label">Interface Theme</div>
            <div class="toggle-desc">Switch between Dark Mode and Light Mode theme</div>
          </div>
          <button class="theme-toggle-btn" id="btn-theme-toggle">
            ${settings.theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          </button>
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
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const btnAddCat = document.getElementById('btn-add-cat');
  const inputNewCat = document.getElementById('input-new-cat');

  if (togglePomodoro) {
    togglePomodoro.addEventListener('change', () => {
      data.settings.pomodoro = togglePomodoro.checked;
      saveData();
      initPomodoroTimer();
      showToast('Pomodoro Timer toggled');
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

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      data.settings.theme = data.settings.theme === 'light' ? 'dark' : 'light';
      saveData();
      applyTheme();
      renderSidebar();
      renderPage();
      showToast('Theme updated');
    });
  }

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
          const page = getActivePage();
          if (page) {
            page.banner = ev.target.result; // base64 data URL
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
          pomodoroSeconds = 5 * 60;
          showToast("Work cycle finished! Time for a break.");
        } else {
          pomodoroMode = 'work';
          pomodoroSeconds = 25 * 60;
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
  pomodoroSeconds = 25 * 60;
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
    data.activePageId = 'library';
    saveData();
    renderSidebar();
    renderPage();
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
    data.activePageId = 'settings';
    saveData();
    renderSidebar();
    renderPage();
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
  
  const btnToggle = document.getElementById('btn-toggle-floating-lib');
  const panel = document.getElementById('floating-library-panel');
  const btnClose = document.getElementById('btn-close-floating-lib');
  if (btnToggle && panel) {
    btnToggle.onclick = () => {
      if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        renderFloatingLibrary();
        makeFloatingLibDraggable();
      } else {
        panel.style.display = 'none';
      }
    };
  }
  if (btnClose && panel) btnClose.onclick = () => panel.style.display = 'none';

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

function renderFloatingLibrary() {
  const container = document.getElementById('floating-library-content');
  if (!container) return;
  const docs = data.library || [];
  if (docs.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; margin-top:20px;">No documents uploaded. Go to Library page to upload.</div>';
    return;
  }
  const selectedDoc = docs.find(d => d.id === data.selectedDocId) || docs[0];
  
  let options = '<select id="floating-doc-select" style="width:100%; margin-bottom:12px; background:var(--bg-hover); color:var(--text-primary); border:1px solid var(--divider); padding:4px; border-radius:4px;">';
  docs.forEach(doc => {
    options += `<option value="${doc.id}" ${doc.id === selectedDoc.id ? 'selected' : ''}>${escapeHtml(doc.name)}</option>`;
  });
  options += '</select>';

  container.innerHTML = options + `
    <div id="floating-reader-area" style="font-size:13px; color:var(--text-primary); line-height:1.6; height:calc(100% - 40px); overflow-y:auto; border:1px solid var(--divider); border-radius:4px; padding:8px; background:rgba(255,255,255,0.02);">Loading...</div>
  `;

  document.getElementById('floating-doc-select').onchange = (e) => {
    data.selectedDocId = e.target.value;
    saveData();
    renderFloatingLibrary();
    if (data.activePageId === 'library') renderPage();
  };

  const textArea = document.getElementById('floating-reader-area');
  
  if (selectedDoc.type === '.pdf') {
    textArea.style.padding = '0';
    textArea.innerHTML = '<div style="text-align:center; padding:20px;">Loading PDF...</div>';
    getFileFromDB(selectedDoc.id).then(buffer => {
      if (!buffer) {
        textArea.innerHTML = 'Document data not found.';
        return;
      }
      textArea.innerHTML = '';
      // FIXED: Use PDF.js instead of EmbedPDF
      if (!window.pdfjsLib) {
        textArea.innerHTML = '<div style="color:#ff6b6b;padding:20px;">PDF.js not loaded.</div>';
        return;
      }
      // Use local worker (fully offline)
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + '/lib/pdf.worker.min.js';

      const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      loadingTask.promise.then(pdf => {
        const page = pdf.getPage(1).then(p => {
          const scale = 1.0;
          const viewport = p.getViewport({ scale });
          const c = document.createElement('canvas');
          c.width = viewport.width;
          c.height = viewport.height;
          const ctx = c.getContext('2d');
          p.render({ canvasContext: ctx, viewport }).promise.then(() => {
            textArea.innerHTML = '';
            textArea.appendChild(c);
          });
        });
      }).catch(() => {
        textArea.innerHTML = '<div style="padding:20px;">Failed to render PDF preview.</div>';
      });
    });
  } else {
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
}

function makeFloatingLibDraggable() {
  const panel = document.getElementById('floating-library-panel');
  const header = document.getElementById('floating-library-header');
  if (!panel || !header) return;
  
  let isDragging = false;
  let startX, startY, initialL, initialT;
  
  header.onmousedown = (e) => {
    if (e.target.tagName.toLowerCase() === 'button') return;
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    initialL = rect.left; initialT = rect.top;
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
    panel.style.left = initialL + 'px'; panel.style.top = initialT + 'px';
  };
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panel.style.left = Math.max(0, initialL + (e.clientX - startX)) + 'px';
    panel.style.top = Math.max(0, initialT + (e.clientY - startY)) + 'px';
  });
  
  document.addEventListener('mouseup', () => isDragging = false);
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

