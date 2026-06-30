import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Check, 
  Trash2, 
  CheckSquare, 
  FileText, 
  Smile, 
  ArrowRight,
  TrendingUp,
  Bookmark
} from 'lucide-react';
import { useApp } from '../state/AppContext';

export const HomeView: React.FC = () => {
  const { 
    state, 
    addHabit, 
    toggleHabit, 
    addGoal, 
    toggleGoal, 
    deleteGoal,
    addContact,
    deleteContact,
    addSticky,
    updateSticky,
    deleteSticky,
    addMoodLog,
    addTask,
    addPage
  } = useApp();

  // Widget States
  const [time, setTime] = useState(new Date());
  const [newHabitName, setNewHabitName] = useState('');
  const [newGoalName, setNewGoalName] = useState('');
  
  // CRM state
  const [contactName, setContactName] = useState('');
  const [contactStage, setContactStage] = useState('Mentor');
  const [contactFreq, setContactFreq] = useState('monthly');
  const [contactNotes, setContactNotes] = useState('');
  const [isAddingContact, setIsAddingContact] = useState(false);

  // Mood logs
  const [activeMood, setActiveMood] = useState('😊');
  const [moodNote, setMoodNote] = useState('');

  // Clock tick effect
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hrs = time.getHours();
    const name = state.profile.name || 'Nana';
    if (hrs < 12) return `Good morning, ${name}!`;
    if (hrs < 18) return `Good afternoon, ${name}!`;
    return `Good evening, ${name}!`;
  };

  const handleHabitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newHabitName.trim()) {
      addHabit(newHabitName.trim());
      setNewHabitName('');
    }
  };

  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGoalName.trim()) {
      addGoal(newGoalName.trim());
      setNewGoalName('');
    }
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (contactName.trim()) {
      addContact(contactName.trim(), contactStage, contactFreq, contactNotes.trim());
      setContactName('');
      setContactNotes('');
      setIsAddingContact(false);
    }
  };

  const handleMoodSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMoodLog(activeMood, moodNote.trim());
    setMoodNote('');
  };

  // Compute stats for reading progress widget
  const totalPapers = state.library.length;
  const readPapers = state.library.filter(p => p.currentPage && p.pageCount && p.currentPage === p.pageCount).length;
  const readPct = totalPapers > 0 ? Math.round((readPapers / totalPapers) * 100) : 0;

  const isWidgetActive = (widgetId: string) => state.settings.activeWidgets.includes(widgetId);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-main)] text-[var(--text-primary)] text-sm">
      {/* Banner / Cover */}
      {state.settings.banners && (
        <div className="h-44 w-full bg-gradient-to-r from-blue-700 via-indigo-800 to-purple-900 flex-shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]"></div>
          {/* Subtle decoration elements */}
          <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-blue-500/20 blur-xl"></div>
          <div className="absolute -top-10 -right-10 w-64 h-64 rounded-full bg-purple-500/20 blur-2xl"></div>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Header Greeting */}
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-slate-400 font-mono">
            {getGreeting()}
          </h2>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            {state.settings.homeTitle || 'Command Center'}
          </h1>
        </div>

        {/* Widgets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 1. Clock & Mood logger widget */}
          {isWidgetActive('clock') && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 flex flex-col justify-between min-h-[160px]">
              <div>
                <div className="flex justify-between items-start">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Clock & Mood</span>
                  <Smile className="w-4 h-4 text-yellow-500" />
                </div>
                <div className="text-3xl font-mono font-bold mt-2 text-white">
                  {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
              </div>

              {/* Mood Log Form */}
              <form onSubmit={handleMoodSubmit} className="mt-4 pt-3 border-t border-[var(--border-color)] flex gap-2">
                <select 
                  value={activeMood}
                  onChange={e => setActiveMood(e.target.value)}
                  className="bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg text-lg px-1.5 focus:outline-none"
                >
                  <option value="😊">😊</option>
                  <option value="😭">😭</option>
                  <option value="😴">😴</option>
                  <option value="😡">😡</option>
                  <option value="😎">😎</option>
                </select>
                <input 
                  type="text"
                  value={moodNote}
                  onChange={e => setMoodNote(e.target.value)}
                  placeholder="How are you feeling?"
                  className="flex-1 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-blue-500 text-[var(--text-primary)]"
                />
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-2.5 text-xs font-semibold">
                  Log
                </button>
              </form>
            </div>
          )}

          {/* 2. Habits Tracker */}
          {isWidgetActive('habits') && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 flex flex-col min-h-[160px]">
              <div className="flex justify-between items-center text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                <span>Habit Tracker</span>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 max-h-36 pr-1">
                {state.habits.map(h => (
                  <div key={h.id} className="flex items-center justify-between bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs">
                    <span className={`font-medium ${h.checkedToday ? 'line-through text-[var(--text-muted)]' : ''}`}>{h.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded-full">
                        Streak: {h.streak}d
                      </span>
                      <button 
                        onClick={() => toggleHabit(h.id)}
                        className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                          h.checkedToday 
                            ? 'bg-emerald-600 border-emerald-500 text-white' 
                            : 'border-[var(--border-color)] hover:border-emerald-500 text-transparent hover:text-emerald-500'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
                
                {state.habits.length === 0 && (
                  <div className="text-xs text-[var(--text-muted)] italic text-center py-4">No habits defined yet.</div>
                )}
              </div>

              <form onSubmit={handleHabitSubmit} className="mt-3 flex gap-1 pt-2 border-t border-[var(--border-color)]">
                <input 
                  type="text"
                  value={newHabitName}
                  onChange={e => setNewHabitName(e.target.value)}
                  placeholder="New habit..."
                  className="flex-1 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-blue-500 text-[var(--text-primary)]"
                />
                <button type="submit" className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* 3. Daily Goals */}
          {isWidgetActive('goals') && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 flex flex-col min-h-[160px]">
              <div className="flex justify-between items-center text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                <span>Today's Goals</span>
                <CheckSquare className="w-4 h-4 text-purple-500" />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 max-h-36 pr-1">
                {state.todayGoals.map(g => (
                  <div key={g.id} className="flex items-center justify-between bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs">
                    <span className={`font-medium ${g.checked ? 'line-through text-[var(--text-muted)]' : ''}`}>{g.name}</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => toggleGoal(g.id)}
                        className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                          g.checked 
                            ? 'bg-purple-600 border-purple-500 text-white' 
                            : 'border-[var(--border-color)] hover:border-purple-500 text-transparent hover:text-purple-500'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={() => deleteGoal(g.id)} className="text-slate-500 hover:text-red-500">
                        &times;
                      </button>
                    </div>
                  </div>
                ))}

                {state.todayGoals.length === 0 && (
                  <div className="text-xs text-[var(--text-muted)] italic text-center py-4">All goals completed!</div>
                )}
              </div>

              <form onSubmit={handleGoalSubmit} className="mt-3 flex gap-1 pt-2 border-t border-[var(--border-color)]">
                <input 
                  type="text"
                  value={newGoalName}
                  onChange={e => setNewGoalName(e.target.value)}
                  placeholder="New goal..."
                  className="flex-1 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-blue-500 text-[var(--text-primary)]"
                />
                <button type="submit" className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* 4. Sticky Notes */}
          {isWidgetActive('timer') && state.settings.stickyNotes && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 flex flex-col min-h-[160px] lg:col-span-2">
              <div className="flex justify-between items-center text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                <span>Sticky Notes</span>
                <div className="flex gap-1">
                  {(['yellow', 'blue', 'green', 'pink'] as const).map(color => (
                    <button 
                      key={color}
                      onClick={() => addSticky('Double click to edit note.', color)}
                      className={`w-3.5 h-3.5 rounded-full hover:scale-110 transition-transform ${
                        color === 'yellow' ? 'bg-yellow-300' :
                        color === 'blue' ? 'bg-blue-300' :
                        color === 'green' ? 'bg-green-300' : 'bg-pink-300'
                      }`}
                      title={`Add ${color} sticky`}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 flex-1 overflow-y-auto max-h-48 pr-1">
                {state.stickies.map(sticky => {
                  const colorBg = 
                    sticky.color === 'yellow' ? 'bg-yellow-100 text-yellow-900 border-yellow-200' :
                    sticky.color === 'blue' ? 'bg-blue-100 text-blue-900 border-blue-200' :
                    sticky.color === 'green' ? 'bg-green-100 text-green-900 border-green-200' :
                    'bg-pink-100 text-pink-900 border-pink-200';
                  
                  return (
                    <div key={sticky.id} className={`p-3 border rounded-xl relative flex flex-col justify-between ${colorBg}`}>
                      <textarea
                        value={sticky.text}
                        onChange={e => updateSticky(sticky.id, e.target.value)}
                        className="bg-transparent border-none text-xs w-full flex-1 resize-none focus:outline-none leading-relaxed font-sans"
                      />
                      <div className="flex justify-end mt-2">
                        <button 
                          onClick={() => deleteSticky(sticky.id)}
                          className="opacity-50 hover:opacity-100 text-slate-700 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {state.stickies.length === 0 && (
                  <div className="col-span-2 text-xs text-[var(--text-muted)] italic text-center py-6">
                    No sticky notes yet. Click color bubbles above to drop a note!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. Zotero Reading Progress circle */}
          {isWidgetActive('reading') && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 flex flex-col items-center justify-center min-h-[160px]">
              <div className="w-full flex justify-between items-center text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                <span>Reading Progress</span>
                <Bookmark className="w-4 h-4 text-blue-500" />
              </div>
              
              <div className="relative w-20 h-20 flex items-center justify-center mt-1">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path 
                    fill="none" 
                    stroke="var(--border-color)" 
                    strokeWidth="3.5" 
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                  />
                  <path 
                    fill="none" 
                    stroke="#3b82f6" 
                    strokeWidth="3.5" 
                    strokeDasharray={`${readPct}, 100`} 
                    strokeLinecap="round" 
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                  />
                </svg>
                <div className="absolute font-mono font-extrabold text-sm text-white">
                  {readPct}%
                </div>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-3">
                {readPapers} of {totalPapers} local documents completed
              </div>
            </div>
          )}

          {/* 6. Quick Add Page/Tasks widget */}
          {isWidgetActive('quick_add') && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 flex flex-col justify-between min-h-[160px]">
              <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Quick Shortcuts
              </div>
              
              <div className="space-y-2 mt-3">
                <button 
                  onClick={() => addTask('page-todos', 'New task...', 'Today')}
                  className="w-full bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg p-2 text-xs flex items-center justify-between text-[var(--text-primary)]"
                >
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
                    <span>+ Quick Task in To-dos</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-[var(--text-muted)]" />
                </button>
                <button 
                  onClick={() => addPage('New Note Page', 'notes', 'Notes')}
                  className="w-full bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg p-2 text-xs flex items-center justify-between text-[var(--text-primary)]"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-amber-500" />
                    <span>+ Create Wiki Notes page</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-[var(--text-muted)]" />
                </button>
              </div>
              <div className="text-[9px] text-[var(--text-muted)] italic mt-2">
                Instantly drops components inside database folders
              </div>
            </div>
          )}

          {/* 7. CRM Contact Manager widget */}
          {isWidgetActive('goals') && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 flex flex-col min-h-[160px] lg:col-span-3">
              <div className="flex justify-between items-center text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                <span>CRM Contacts Networking</span>
                <button 
                  onClick={() => setIsAddingContact(!isAddingContact)}
                  className="text-xs text-blue-500 hover:text-blue-400 font-semibold"
                >
                  {isAddingContact ? 'Cancel' : '+ Add Contact'}
                </button>
              </div>

              {isAddingContact && (
                <form onSubmit={handleContactSubmit} className="bg-[var(--bg-app)] p-3 border border-[var(--border-color)] rounded-xl mb-3 space-y-2.5 text-xs">
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={contactName}
                      onChange={e => setContactName(e.target.value)}
                      placeholder="Contact Name"
                      className="flex-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-2 py-1 text-[var(--text-primary)]"
                      required
                    />
                    <select
                      value={contactStage}
                      onChange={e => setContactStage(e.target.value)}
                      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-1.5 text-[var(--text-primary)]"
                    >
                      <option value="Mentor">Mentor</option>
                      <option value="Recruiter">Recruiter</option>
                      <option value="Professional">Professional</option>
                      <option value="Peer">Peer</option>
                    </select>
                    <select
                      value={contactFreq}
                      onChange={e => setContactFreq(e.target.value)}
                      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-1.5 text-[var(--text-primary)]"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={contactNotes}
                      onChange={e => setContactNotes(e.target.value)}
                      placeholder="Notes / Check-in summary..."
                      className="flex-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-2 py-1 text-[var(--text-primary)]"
                    />
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-1 font-semibold">
                      Save
                    </button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs table-fixed">
                  <thead>
                    <tr className="text-[var(--text-muted)] border-b border-[var(--border-color)] font-semibold select-none">
                      <th className="py-2 w-1/4">Name</th>
                      <th className="py-2 w-1/5">Stage</th>
                      <th className="py-2 w-1/5">Frequency</th>
                      <th className="py-2 w-1/3">Notes</th>
                      <th className="py-2 w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {state.crmContacts.map(contact => (
                      <tr key={contact.id} className="hover:bg-[var(--bg-hover)]">
                        <td className="py-2 font-medium text-white truncate pr-2">{contact.name}</td>
                        <td className="py-2 truncate pr-2">
                          <span className="bg-blue-600/10 border border-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0.5 rounded-full">
                            {contact.stage}
                          </span>
                        </td>
                        <td className="py-2 capitalize">{contact.frequency}</td>
                        <td className="py-2 text-[var(--text-muted)] truncate pr-2" title={contact.notes}>
                          {contact.notes || '—'}
                        </td>
                        <td className="py-2 text-right">
                          <button 
                            onClick={() => deleteContact(contact.id)}
                            className="text-slate-500 hover:text-red-500"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    ))}
                    
                    {state.crmContacts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-[var(--text-muted)] italic">
                          No networking contacts logged. Keep in touch with mentors and peers!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
