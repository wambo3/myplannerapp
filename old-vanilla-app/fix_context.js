const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// The original issue was the context menu event listener not identifying the home modules correctly.
const contextMenuRegex = /document\.addEventListener\('contextmenu', \(e\) => \{[\s\S]*?hideContextMenu\(\);\n\s*\}\);/m;
const newContextMenu = `document.addEventListener('contextmenu', (e) => {
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
  });`;

// Because the file might have been wiped/reset, we need to locate where `initContextMenu` assigns the event listeners.
code = code.replace(/document\.addEventListener\('contextmenu', \(e\) => \{[\s\S]*?hideContextMenu\(\);\n\s*\}\);/m, newContextMenu);

const showContextRegex = /\} else if \(type === 'day'\) \{[\s\S]*?\}\n\s*menu\.innerHTML = itemsHtml;\n\s*menu\.style\.display = 'block';/m;
const newShowContext = `} else if (type === 'day') {
    itemsHtml = \`
      <div class="context-menu-item" data-action="add-task-day">
        <span>Add task for \${details.dateStr}...</span>
      </div>
    \`;
  } else if (type === 'home-module') {
    itemsHtml = \`
      <div class="context-menu-item danger" data-action="remove-module">
        <span>Remove Section</span>
      </div>
    \`;
  } else if (type === 'global') {
    itemsHtml = \`
      <div class="context-menu-item" data-action="nav-home"><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px; vertical-align:middle;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>Go to Home</span></div>
      <div class="context-menu-item" data-action="nav-library"><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px; vertical-align:middle;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>Go to Library</span></div>
      <div class="context-menu-item" data-action="nav-settings"><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px; vertical-align:middle;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Go to Settings</span></div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" data-action="new-page"><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px; vertical-align:middle;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Page</span></div>
    \`;
  }

  menu.innerHTML = itemsHtml;
  menu.style.display = 'block';`;

code = code.replace(showContextRegex, newShowContext);

const clickRegex = /\} else if \(action === 'add-task-day' && type === 'day'\) \{[\s\S]*?openTaskModal\(newTask, activePage\.id, -1\);\n\s*\}/m;
const newClick = `} else if (action === 'add-task-day' && type === 'day') {
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
      }`;

code = code.replace(clickRegex, newClick);

fs.writeFileSync('app.js', code);
