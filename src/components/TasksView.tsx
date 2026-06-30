import React, { useState } from 'react';
import { Plus, Check, Trash2, Calendar } from 'lucide-react';
import { useApp } from '../state/AppContext';
import type { Page } from '../types';

export const TasksView: React.FC<{ page: Page }> = ({ page }) => {
  const { addTask, toggleTask, deleteTask } = useApp();
  const [taskName, setTaskName] = useState('');
  const [taskDue, setTaskDue] = useState('');
  
  // Filters/Sort
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'due' | 'status'>('due');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (taskName.trim()) {
      addTask(page.id, taskName.trim(), taskDue.trim() || 'No due date');
      setTaskName('');
      setTaskDue('');
    }
  };

  const tasksList = page.tasks || [];

  const filteredTasks = tasksList
    .filter(t => {
      if (filterMode === 'active') return !t.checked;
      if (filterMode === 'completed') return t.checked;
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'due') {
        comparison = a.due.localeCompare(b.due);
      } else if (sortBy === 'status') {
        comparison = (a.checked ? 1 : 0) - (b.checked ? 1 : 0);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const activeCount = tasksList.filter(t => !t.checked).length;
  const completedCount = tasksList.filter(t => t.checked).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-main)] p-6 text-[var(--text-primary)] select-none">
      {/* Banner/Header */}
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <span>📋</span>
            <span>{page.name}</span>
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Category: <span className="font-semibold text-slate-300">{page.category}</span>
          </p>
        </div>

        {/* Tab Filters */}
        <div className="flex bg-[var(--bg-hover)] border border-[var(--border-color)] p-0.5 rounded-lg text-xs font-semibold">
          {(['all', 'active', 'completed'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1 rounded-md capitalize transition-colors ${
                filterMode === mode 
                  ? 'bg-blue-600 text-white shadow-sm font-bold' 
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Task Creation Form */}
      <form onSubmit={handleAddTask} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 flex gap-3 mb-6 items-end">
        <div className="flex-1 space-y-1">
          <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Task Description</label>
          <input 
            type="text"
            value={taskName}
            onChange={e => setTaskName(e.target.value)}
            placeholder="What needs to be done?"
            className="w-full bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-[var(--text-primary)]"
            required
          />
        </div>
        <div className="w-48 space-y-1">
          <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Due Date</label>
          <input 
            type="text"
            value={taskDue}
            onChange={e => setTaskDue(e.target.value)}
            placeholder="e.g. May 20, 2026"
            className="w-full bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-[var(--text-primary)]"
          />
        </div>
        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 font-bold text-xs flex items-center gap-1.5 h-[34px] transition-colors">
          <Plus className="w-4 h-4" />
          <span>Add Task</span>
        </button>
      </form>

      {/* Tasks Table */}
      <div className="flex-1 border border-[var(--border-color)] bg-[var(--bg-card)] rounded-xl overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse text-xs table-fixed">
            <thead>
              <tr className="bg-[var(--bg-hover)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-semibold sticky top-0 z-10">
                <th className="py-2.5 px-4 w-[48px] text-center">Status</th>
                <th className="py-2.5 px-2 w-2/3 cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSort('name')}>
                  Task Description {sortBy === 'name' ? (sortOrder === 'asc' ? ' ▴' : ' ▾') : ''}
                </th>
                <th className="py-2.5 px-2 w-1/4 cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSort('due')}>
                  Due Date {sortBy === 'due' ? (sortOrder === 'asc' ? ' ▴' : ' ▾') : ''}
                </th>
                <th className="py-2.5 px-4 w-[60px] text-right">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {filteredTasks.map(task => (
                <tr key={task.id} className={`hover:bg-[var(--bg-hover)] ${task.checked ? 'opacity-60' : ''}`}>
                  {/* Status checkbox */}
                  <td className="py-2.5 px-4 text-center">
                    <button
                      onClick={() => toggleTask(page.id, task.id)}
                      className={`w-5 h-5 rounded border flex items-center justify-center mx-auto transition-all ${
                        task.checked 
                          ? 'bg-emerald-600 border-emerald-500 text-white' 
                          : 'border-[var(--border-color)] hover:border-emerald-500 text-transparent hover:text-emerald-500'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </td>
                  {/* Description */}
                  <td className={`py-2.5 px-2 truncate font-medium pr-4 text-white ${task.checked ? 'line-through text-[var(--text-muted)]' : ''}`}>
                    {task.name}
                  </td>
                  {/* Due Date */}
                  <td className="py-2.5 px-2 truncate text-[var(--text-muted)]">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{task.due}</span>
                    </div>
                  </td>
                  {/* Delete */}
                  <td className="py-2.5 px-4 text-right">
                    <button 
                      onClick={() => deleteTask(page.id, task.id)}
                      className="text-slate-500 hover:text-red-500 p-1 rounded hover:bg-[var(--bg-hover)]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {filteredTasks.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[var(--text-muted)] italic">
                    No tasks found. Get started by adding a task above!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer Summary */}
        <div className="p-3 border-t border-[var(--border-color)] bg-[var(--bg-hover)] flex justify-between items-center text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
          <div className="flex gap-4">
            <span>Pending: <strong className="text-white">{activeCount}</strong></span>
            <span>Completed: <strong className="text-white">{completedCount}</strong></span>
          </div>
          <span>Total items: {tasksList.length}</span>
        </div>
      </div>
    </div>
  );
};
