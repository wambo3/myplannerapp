import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { HomeView } from './components/HomeView';
import { LibraryView } from './components/LibraryView';
import { SettingsView } from './components/SettingsView';
import { TasksView } from './components/TasksView';
import { NotesView } from './components/NotesView';
import { AppProvider, useApp } from './state/AppContext';

const DashboardContent: React.FC = () => {
  const { state } = useApp();
  const [isSplitActive, setIsSplitActive] = useState(false);

  // Apply typography fonts dynamically
  useEffect(() => {
    const classList = document.documentElement.classList;
    classList.remove('font-sans', 'font-serif', 'font-mono');
    if (state.settings.fontFamily === 'serif') classList.add('font-serif');
    else if (state.settings.fontFamily === 'mono') classList.add('font-mono');
    else classList.add('font-sans');
  }, [state.settings.fontFamily]);

  // Apply theme classes on mount and updates
  useEffect(() => {
    const bodyClassList = document.body.classList;
    bodyClassList.remove('theme-light', 'theme-sepia');
    if (state.settings.theme === 'light') bodyClassList.add('theme-light');
    if (state.settings.theme === 'sepia') bodyClassList.add('theme-sepia');
  }, [state.settings.theme]);

  const renderActiveView = () => {
    if (state.activePageId === 'home') return <HomeView />;
    if (state.activePageId === 'library') return <LibraryView />;
    if (state.activePageId === 'settings') return <SettingsView />;

    const page = state.pages.find(p => p.id === state.activePageId);
    if (!page) return <HomeView />;

    if (page.type === 'tasks') return <TasksView page={page} />;
    if (page.type === 'notes') return <NotesView page={page} />;
    return <HomeView />;
  };

  const handleToggleSplit = () => {
    setIsSplitActive(!isSplitActive);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)] font-sans antialiased select-none">
      {/* 1. Sidebar Panel */}
      <Sidebar />

      {/* 2. Main Page Column */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Top Header */}
        <TopBar onToggleSplit={handleToggleSplit} isSplitActive={isSplitActive} />

        {/* Dynamic content view with optional split layout */}
        <div className="flex-1 flex overflow-hidden min-h-0 w-full">
          {/* Main active view (e.g. Wiki Notes, Tasks) */}
          <div className="flex-1 h-full min-w-0 overflow-hidden flex flex-col">
            {renderActiveView()}
          </div>

          {/* Split Screen Panel (renders Zotero in-app natively!) */}
          {isSplitActive && state.activePageId !== 'library' && state.activePageId !== 'settings' && (
            <div className="w-1/2 h-full border-l border-[var(--border-color)] flex flex-col min-w-0 bg-[var(--bg-card)]">
              <div className="h-9 px-4 border-b border-[var(--border-color)] bg-[var(--bg-sidebar)] flex items-center justify-between text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                <span>Split Screen Library Pane</span>
                <button onClick={() => setIsSplitActive(false)} className="hover:text-[var(--text-primary)]">
                  &times; Close
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <LibraryView />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <DashboardContent />
    </AppProvider>
  );
};
export default App;
