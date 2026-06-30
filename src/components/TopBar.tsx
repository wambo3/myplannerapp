import React, { useState, useEffect } from 'react';
import { 
  Menu, 
  Columns, 
  Play, 
  Pause, 
  RotateCcw,
  SkipForward,
  Clock as ClockIcon
} from 'lucide-react';
import { useApp } from '../state/AppContext';

export const TopBar: React.FC<{
  onToggleSplit: () => void;
  isSplitActive: boolean;
}> = ({ onToggleSplit, isSplitActive }) => {
  const { state, updateSettings } = useApp();

  // Pomodoro State
  const [pomodoroMode, setPomodoroMode] = useState<'focus' | 'short' | 'long'>('focus');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  // Map modes to seconds
  const modeTimes = {
    focus: 25 * 60,
    short: 5 * 60,
    long: 15 * 60
  };

  useEffect(() => {
    setSecondsLeft(modeTimes[pomodoroMode]);
    setIsRunning(false);
  }, [pomodoroMode]);

  // Pomodoro timer ticking effect
  useEffect(() => {
    let interval: any = null;
    if (isRunning && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft(s => s - 1);
      }, 1000);
    } else if (secondsLeft === 0) {
      setIsRunning(false);
      playSynthNotification();
      
      // Auto cycle modes
      if (pomodoroMode === 'focus') {
        setPomodoroMode('short');
      } else {
        setPomodoroMode('focus');
      }
    }
    return () => clearInterval(interval);
  }, [isRunning, secondsLeft]);

  const playSynthNotification = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      // Simple double-beep synth tone
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc1.type = 'sine';
      
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      osc2.type = 'sine';

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.setValueAtTime(0.0, ctx.currentTime + 0.4);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start();
      osc1.stop(ctx.currentTime + 0.2);
      osc2.start(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn("Failed to play synth sound", e);
    }
  };

  const toggleTimer = () => setIsRunning(!isRunning);

  const resetTimer = () => {
    setSecondsLeft(modeTimes[pomodoroMode]);
    setIsRunning(false);
  };

  const getTimerString = () => {
    const min = Math.floor(secondsLeft / 60);
    const sec = secondsLeft % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const getPageTitle = () => {
    if (state.activePageId === 'home') return 'Home';
    if (state.activePageId === 'library') return 'Zotero Library';
    if (state.activePageId === 'settings') return 'Settings';
    
    const page = state.pages.find(p => p.id === state.activePageId);
    return page ? page.name : 'Workspace';
  };

  const toggleSidebar = () => {
    updateSettings({ sidebarCollapsed: !state.settings.sidebarCollapsed });
  };

  return (
    <header className="h-12 border-b border-[var(--border-color)] bg-[var(--bg-main)] px-4 flex items-center justify-between z-20 flex-shrink-0 select-none text-[var(--text-primary)]">
      {/* Breadcrumb Left */}
      <div className="flex items-center gap-2">
        {state.settings.sidebarCollapsed && (
          <button 
            onClick={toggleSidebar}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors"
            title="Expand Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {getPageTitle()}
        </span>
      </div>

      {/* Header Tools */}
      <div className="flex items-center gap-4">
        {/* Pomodoro Timer Header Widget */}
        {state.settings.pomodoro && (
          <div className="flex items-center bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-full px-3 py-1 gap-2 text-xs font-medium">
            <ClockIcon className={`w-3.5 h-3.5 ${isRunning ? 'animate-pulse text-red-500' : 'text-[var(--text-muted)]'}`} />
            
            {/* Mode Selectors */}
            <div className="flex gap-1.5 border-r border-[var(--border-color)] pr-2">
              <button 
                onClick={() => setPomodoroMode('focus')}
                className={`px-1.5 py-0.5 rounded transition-colors ${pomodoroMode === 'focus' ? 'text-red-500 font-semibold' : 'text-[var(--text-muted)]'}`}
              >
                Focus
              </button>
              <button 
                onClick={() => setPomodoroMode('short')}
                className={`px-1.5 py-0.5 rounded transition-colors ${pomodoroMode === 'short' ? 'text-emerald-500 font-semibold' : 'text-[var(--text-muted)]'}`}
              >
                Break
              </button>
            </div>

            <span className="font-mono font-bold text-sm w-12 text-center text-[var(--text-primary)]">
              {getTimerString()}
            </span>

            {/* Controls */}
            <div className="flex items-center gap-1 pl-1">
              <button onClick={toggleTimer} className="p-0.5 hover:text-blue-500" title={isRunning ? 'Pause' : 'Start'}>
                {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button onClick={resetTimer} className="p-0.5 hover:text-blue-500" title="Reset">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setPomodoroMode(pomodoroMode === 'focus' ? 'short' : 'focus')}
                className="p-0.5 hover:text-blue-500" 
                title="Skip Mode"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Split Screen Toggle Button */}
        {state.activePageId !== 'library' && state.activePageId !== 'settings' && (
          <button 
            onClick={onToggleSplit}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              isSplitActive 
                ? 'bg-blue-600/15 border-blue-500/30 text-blue-400 font-bold' 
                : 'bg-transparent border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            title="Toggle split screen Zotero view"
          >
            <Columns className="w-4 h-4" />
            <span>Split Screen</span>
          </button>
        )}
        
        {/* Collapse Sidebar Button when sidebar is visible */}
        {!state.settings.sidebarCollapsed && (
          <button 
            onClick={toggleSidebar}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="Collapse Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
      </div>
    </header>
  );
};
