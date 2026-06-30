import React, { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Check } from 'lucide-react';

const ACCENT_COLORS = [
  { name: 'blue', value: '#3b82f6', bg: 'bg-blue-500' },
  { name: 'emerald', value: '#10b981', bg: 'bg-emerald-500' },
  { name: 'violet', value: '#8b5cf6', bg: 'bg-violet-500' },
  { name: 'rose', value: '#f43f5e', bg: 'bg-rose-500' },
  { name: 'amber', value: '#f59e0b', bg: 'bg-amber-500' }
];

export const SettingsView: React.FC = () => {
  const { state, updateSettings, updateProfile } = useApp();

  const [profName, setProfName] = useState(state.profile.name);
  const [profBio, setProfBio] = useState(state.profile.bio);
  
  const [newCat, setNewCat] = useState('');

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      name: profName.trim() || 'User Name',
      bio: profBio.trim() || 'Productivity Mode'
    });
  };

  const handleAddCat = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCat.trim() && !state.settings.categories.includes(newCat.trim())) {
      updateSettings({
        categories: [...state.settings.categories, newCat.trim()]
      });
      setNewCat('');
    }
  };

  const handleDeleteCat = (cat: string) => {
    if (state.settings.categories.length <= 1) {
      alert("You must keep at least one category.");
      return;
    }
    updateSettings({
      categories: state.settings.categories.filter(c => c !== cat)
    });
  };

  const handleWidgetToggle = (widgetId: string) => {
    const active = state.settings.activeWidgets;
    const updated = active.includes(widgetId)
      ? active.filter(w => w !== widgetId)
      : [...active, widgetId];
    updateSettings({ activeWidgets: updated });
  };

  const handleAccentSelect = (colorValue: string) => {
    updateSettings({ accentColor: colorValue });
    document.documentElement.style.setProperty('--accent-color', colorValue);
    
    // Create soft translucent background for accents
    const softAccent = colorValue + '25';
    document.documentElement.style.setProperty('--accent-light', softAccent);
  };

  const handleThemeSelect = (theme: 'dark' | 'light' | 'sepia') => {
    updateSettings({ theme });
    
    // Toggle class on document body
    const bodyClassList = document.body.classList;
    bodyClassList.remove('theme-light', 'theme-sepia');
    if (theme === 'light') bodyClassList.add('theme-light');
    if (theme === 'sepia') bodyClassList.add('theme-sepia');
  };

  const allWidgets = [
    { id: 'clock', name: '🕒 Clock & Daily Mood' },
    { id: 'habits', name: '⚡ Habit Tracker' },
    { id: 'goals', name: '🎯 Today\'s Goals' },
    { id: 'timer', name: '📌 Sticky Notes Grid' },
    { id: 'reading', name: '📚 Zotero Reading Circle' },
    { id: 'quick_add', name: '⚡ Quick Add Shortcuts' }
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-main)] p-6 text-[var(--text-primary)] select-none">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <span>⚙️</span>
            <span>Settings</span>
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">Configure profile metadata, toggle home widgets, and adjust visual themes.</p>
        </div>

        {/* Profile Settings */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-sm text-white">User Profile</h3>
          
          <form onSubmit={handleProfileSave} className="space-y-3.5 text-xs">
            <div className="flex gap-4">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Profile Name</label>
                <input 
                  type="text"
                  value={profName}
                  onChange={e => setProfName(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-blue-500 font-semibold"
                  placeholder="e.g. Nana"
                  required
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Bio Summary</label>
                <input 
                  type="text"
                  value={profBio}
                  onChange={e => setProfBio(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                  placeholder="e.g. Scholar mode"
                />
              </div>
            </div>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 font-bold text-xs">
              Save Profile Changes
            </button>
          </form>
        </div>

        {/* Home Widgets Toggles */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-sm text-white">Toggle Home Widgets</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {allWidgets.map(widget => {
              const active = state.settings.activeWidgets.includes(widget.id);
              return (
                <label 
                  key={widget.id}
                  className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-all ${
                    active 
                      ? 'bg-blue-600/10 border-blue-500/25 text-[var(--text-primary)]' 
                      : 'bg-[var(--bg-app)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="text-xs font-semibold">{widget.name}</span>
                  <input 
                    type="checkbox"
                    checked={active}
                    onChange={() => handleWidgetToggle(widget.id)}
                    className="rounded border-slate-350 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                </label>
              );
            })}
          </div>
        </div>

        {/* Categories Management */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-sm text-white">Manage Folder Categories</h3>
          
          <form onSubmit={handleAddCat} className="flex gap-2 text-xs">
            <input 
              type="text"
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              placeholder="Add new folder category (e.g. Projects)"
              className="flex-1 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
              required
            />
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 font-semibold">
              Add Category
            </button>
          </form>

          <div className="flex flex-wrap gap-2 pt-1.5">
            {state.settings.categories.map(cat => (
              <span 
                key={cat}
                className="flex items-center gap-1.5 bg-[var(--bg-app)] border border-[var(--border-color)] text-xs px-3 py-1 rounded-full text-[var(--text-primary)]"
              >
                <span>{cat}</span>
                <button 
                  type="button" 
                  onClick={() => handleDeleteCat(cat)}
                  className="text-[var(--text-muted)] hover:text-red-500 font-bold"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Styling Settings */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 space-y-5">
          <h3 className="font-bold text-sm text-white">Appearance Settings</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            {/* Theme */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Visual Theme</label>
              <select
                value={state.settings.theme}
                onChange={e => handleThemeSelect(e.target.value as any)}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-[var(--text-primary)] font-medium"
              >
                <option value="dark">Charcoal Dark</option>
                <option value="light">Light Cream</option>
                <option value="sepia">Warm Sepia</option>
              </select>
            </div>

            {/* Font */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Typography Font</label>
              <select
                value={state.settings.fontFamily}
                onChange={e => updateSettings({ fontFamily: e.target.value as any })}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-[var(--text-primary)] font-medium"
              >
                <option value="sans">System Sans-Serif</option>
                <option value="serif">Bookish Serif</option>
                <option value="mono">Developer Monospace</option>
              </select>
            </div>

            {/* Accent Color */}
            <div className="space-y-2 col-span-1 md:col-span-2 border-t border-[var(--border-color)] pt-4">
              <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Accent Highlight Color</label>
              <div className="flex gap-3 items-center mt-1">
                {ACCENT_COLORS.map(color => {
                  const isActive = state.settings.accentColor === color.value;
                  return (
                    <button
                      key={color.name}
                      onClick={() => handleAccentSelect(color.value)}
                      className={`w-7 h-7 rounded-full ${color.bg} border-2 hover:scale-110 transition-transform flex items-center justify-center ${
                        isActive ? 'border-white' : 'border-transparent'
                      }`}
                      title={color.name}
                    >
                      {isActive && <Check className="w-4 h-4 text-white" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
