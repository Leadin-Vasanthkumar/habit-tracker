import { useState, useEffect } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, LineChart
} from 'recharts';
import { CheckCircle2, Circle, Flame, Trophy, Plus, Trash2, Clock, Edit2, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { supabase } from './lib/supabase';

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Generate all days in a specific month
const generateMonthDays = (baseDate: Date) => {
  const days = [];
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 1; i <= daysInMonth; i++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(i).padStart(2, '0');
    days.push(`${year}-${mm}-${dd}`);
  }
  return days;
};

// Format: YYYY-MM-DD
const getTodayStr = () => {
  // Use local time, account for timezone offset
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().split('T')[0];
};

type Habit = {
  id: string;
  name: string;
  icon: string;
  start_time: string;
  end_time: string;
  sort_order: number;
};

// Generate last 14 days
const generateDays = () => {
  const days = [];
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;

  for (let i = 13; i >= 0; i--) {
    const d = new Date(today.getTime() - offset);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
};

// Timeline hours (12 AM to 11 PM) - full 24 hours
const TIMELINE_HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function App() {
  const [authMode, setAuthMode] = useState<'loading' | 'unauthenticated' | 'authenticated' | 'viewer'>('loading');

  const [habits, setHabits] = useState<Habit[]>([]);
  const [history, setHistory] = useState<Record<string, Record<string, boolean>>>({});
  const [today] = useState(getTodayStr());

  const [currentMonthDate, setCurrentMonthDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  // UI State
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('🔥');
  const [newHabitStart, setNewHabitStart] = useState('09:00');
  const [newHabitEnd, setNewHabitEnd] = useState('10:00');
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit State
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [editHabitName, setEditHabitName] = useState('');
  const [editHabitIcon, setEditHabitIcon] = useState('');
  const [editHabitStart, setEditHabitStart] = useState('');
  const [editHabitEnd, setEditHabitEnd] = useState('');

  // Handle Authentication Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthMode('authenticated');
      } else {
        setAuthMode(current => current === 'viewer' ? 'viewer' : 'unauthenticated');
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthMode('authenticated');
      } else {
        setAuthMode(current => current === 'viewer' ? 'viewer' : 'unauthenticated');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // After sign out, the event listener will pick it up and set it to unauthenticated.
  };

  // Load from Supabase (or set up demo data)
  useEffect(() => {
    if (authMode === 'authenticated' || authMode === 'viewer') {
      fetchData();
    }
  }, [today, currentMonthDate, authMode]);

  const fetchData = async () => {
    if (authMode === 'viewer') {
      // Provide starting mock data for viewer mode if none exists
      if (habits.length === 0) {
        setHabits([
          { id: 'mock-1', name: 'Morning Run', icon: '🏃', start_time: '06:00', end_time: '07:00', sort_order: 0 },
          { id: 'mock-2', name: 'Deep Work', icon: '⚡', start_time: '09:00', end_time: '12:00', sort_order: 1 },
          { id: 'mock-3', name: 'Read Book', icon: '📚', start_time: '20:00', end_time: '21:00', sort_order: 2 },
        ]);

        // Mock some history for the graph
        const mockHistory: Record<string, Record<string, boolean>> = {};
        const days = generateDays();
        days.forEach(d => {
          if (Math.random() > 0.3) {
            mockHistory[d] = { 'mock-1': true, 'mock-2': Math.random() > 0.5, 'mock-3': true };
          }
        });
        setHistory(mockHistory);
      }
      return;
    }

    setLoading(true);
    // 1. Fetch Habits
    const { data: habitsData, error: habitsError } = await supabase
      .from('habits')
      .select('*')
      .order('sort_order', { ascending: true });

    if (!habitsError && habitsData) {
      setHabits(habitsData);
    }

    // 2. Fetch Completions
    const days = generateDays();
    const monthDays = generateMonthDays(currentMonthDate);

    // find min and max
    const allDates = [...days, ...monthDays].sort();
    const minDate = allDates[0];
    const maxDate = allDates[allDates.length - 1];

    const { data: completionsData, error: completionsError } = await supabase
      .from('habit_completions')
      .select('*')
      .gte('completed_date', minDate)
      .lte('completed_date', maxDate);

    if (!completionsError && completionsData) {
      const historyMap: Record<string, Record<string, boolean>> = {};
      completionsData.forEach(comp => {
        if (!historyMap[comp.completed_date]) {
          historyMap[comp.completed_date] = {};
        }
        historyMap[comp.completed_date][comp.habit_id] = true;
      });
      setHistory(historyMap);
    }
    setLoading(false);
  };

  const toggleHabit = async (habitId: string) => {
    const isDone = history[today]?.[habitId];

    // Optimistic UI update
    const newHistory = { ...history };
    if (!newHistory[today]) newHistory[today] = {};
    newHistory[today][habitId] = !isDone;
    setHistory(newHistory);

    if (authMode === 'viewer') return;

    if (!isDone) {
      // Mark as done (insert)
      await supabase
        .from('habit_completions')
        .insert({ habit_id: habitId, completed_date: today });
    } else {
      // Mark as undone (delete)
      await supabase
        .from('habit_completions')
        .delete()
        .match({ habit_id: habitId, completed_date: today });
    }
  };

  const addHabit = async () => {
    if (!newHabitName.trim() || isSubmitting) return;
    setIsSubmitting(true);

    const newHabit = {
      name: newHabitName.trim(),
      icon: newHabitIcon,
      start_time: newHabitStart,
      end_time: newHabitEnd,
      sort_order: habits.length
    };

    if (authMode === 'viewer') {
      const mockId = Math.random().toString(36).substring(7);
      setHabits([...habits, { ...newHabit, id: mockId }]);
      setNewHabitName('');
      setNewHabitStart('09:00');
      setNewHabitEnd('10:00');
      setIsAddingMode(false);
      setIsSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from('habits')
      .insert(newHabit)
      .select()
      .single();

    if (!error && data) {
      setHabits([...habits, data]);
      setNewHabitName('');
      setNewHabitStart('09:00');
      setNewHabitEnd('10:00');
      setIsAddingMode(false);
    }
    setIsSubmitting(false);
  };

  const startEditing = (habit: Habit, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingHabitId(habit.id);
    setEditHabitName(habit.name);
    setEditHabitIcon(habit.icon);
    setEditHabitStart(habit.start_time);
    setEditHabitEnd(habit.end_time);
  };

  const saveEdit = async () => {
    if (!editingHabitId || !editHabitName.trim()) return;

    const updates = {
      name: editHabitName.trim(),
      icon: editHabitIcon,
      start_time: editHabitStart,
      end_time: editHabitEnd,
    };

    // Optimistic UI update
    setHabits(habits.map(h => h.id === editingHabitId ? { ...h, ...updates } : h));
    setEditingHabitId(null);

    if (authMode === 'viewer') return;

    await supabase
      .from('habits')
      .update(updates)
      .match({ id: editingHabitId });
  };

  const deleteHabit = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Optimistic UI
    setHabits(habits.filter(h => h.id !== id));

    if (authMode === 'viewer') return;

    await supabase
      .from('habits')
      .delete()
      .match({ id });
  };

  // Helper to format 24h to AM/PM for timeline markers
  const formatHour = (h: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    if (h === 0) return '12:00 AM';
    return `${hour}:00 ${ampm}`;
  };

  const todayScore = Object.values(history[today] || {}).filter(Boolean).length;
  const totalHabits = habits.length;

  // Calculate score for the graph (Percentage)
  const chartData = generateDays().map(date => {
    const dayData = history[date] || {};
    const score = Object.values(dayData).filter(Boolean).length;
    const dateObj = new Date(date);
    return {
      date,
      displayDate: `${dateObj.getDate()}/${dateObj.getMonth() + 1}`,
      score: totalHabits > 0 ? Math.round((score / totalHabits) * 100) : 0
    };
  });

  // Calculate streak (consecutive days with ALL habits done)
  let streak = 0;
  if (totalHabits > 0) {
    const days = generateDays().reverse();
    for (const day of days) {
      const dScore = Object.values(history[day] || {}).filter(Boolean).length;
      if (dScore === totalHabits) streak++;
      else if (day !== today) break; // If yesterday wasn't perfect, streak broken
    }
  }

  const monthlyChartData = generateMonthDays(currentMonthDate).map(date => {
    const dayData = history[date] || {};
    const score = Object.values(dayData).filter(Boolean).length;
    const dateObj = new Date(date);
    return {
      date,
      displayDate: `${dateObj.getDate()}`,
      score: totalHabits > 0 ? Math.round((score / totalHabits) * 100) : 0
    };
  });

  const handlePrevMonth = () => {
    setCurrentMonthDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  if (authMode === 'loading') {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-[#fcfcfc]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-t-2 border-[#5272c6]"></div>
      </div>
    );
  }

  if (authMode === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col items-center justify-center px-4 font-sans selection:bg-[#5272c6] selection:text-white">
        <div className="max-w-md w-full bg-[#121214] border border-[#27272a] rounded-xl p-8 shadow-xl text-center animate-in fade-in zoom-in duration-300">
          <div className="mx-auto bg-[#5272c6]/10 w-16 h-16 rounded-full flex items-center justify-center mb-6 border border-[#5272c6]/30 shadow-[0_0_15px_rgba(82,114,198,0.2)]">
            <CheckCircle2 className="text-[#5272c6]" size={32} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#fcfcfc] mb-2">Flowlock</h1>
          <p className="text-[#a1a1aa] mb-8 text-sm">Focus strictly. Build daily. Own your habits.</p>

          <div className="space-y-4">
            <button
              onClick={handleSignIn}
              className="w-full bg-[#fcfcfc] text-[#09090b] font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 hover:bg-[#e4e4e7] transition-all transform active:scale-[0.98]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                <path fill="none" d="M1 1h22v22H1z" />
              </svg>
              Sign in with Google
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-[#27272a]"></div>
              <span className="flex-shrink-0 mx-4 text-[#71717a] text-xs uppercase tracking-wider">or</span>
              <div className="flex-grow border-t border-[#27272a]"></div>
            </div>

            <button
              onClick={() => setAuthMode('viewer')}
              className="w-full bg-transparent border border-[#27272a] text-[#a1a1aa] font-medium py-3 px-4 rounded-lg hover:bg-[#27272a]/50 hover:text-[#fcfcfc] transition-all"
            >
              Try Demo (Viewer Mode)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] font-sans selection:bg-[#5272c6] selection:text-white pb-20">

      {authMode === 'viewer' && (
        <div className="bg-[#5272c6]/20 border-b border-[#5272c6]/30 px-4 py-2.5 text-center text-sm text-[#8aa5f2] flex flex-wrap justify-center items-center gap-x-4 gap-y-1 z-50 sticky top-0 backdrop-blur-md shadow-sm">
          <span className="font-medium animate-pulse">Viewing in Sandbox Mode. Changes won't be saved.</span>
          <button
            onClick={() => setAuthMode('unauthenticated')}
            className="text-[#fcfcfc] font-bold text-xs bg-[#5272c6]/40 hover:bg-[#5272c6]/60 px-3 py-1 rounded-full transition-colors"
          >
            Sign In Now
          </button>
        </div>
      )}

      <div className="w-full mx-auto px-4 sm:px-8 xl:px-12 mt-4 md:mt-8 flex flex-col lg:flex-row gap-8">

        {/* Left Column (70%) */}
        <div className="lg:w-[70%] flex flex-col">
          {/* Header */}
          <header className="flex justify-between items-end border-b border-[#27272a] pb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#fcfcfc]">OS Core</h1>
              <p className="text-[#a1a1aa] mt-2 text-sm md:text-base">Focus strictly. Build daily.</p>
            </div>
            <div className="text-right flex items-center gap-6">
              <div className="flex flex-col items-end">
                <span className="text-xs text-[#a1a1aa] uppercase font-bold tracking-wider">Perfect Streak</span>
                <div className="flex items-center gap-1 text-[#fcfcfc] text-xl font-bold">
                  <Flame className={streak > 0 ? "text-[#5272c6]" : "text-[#27272a]"} size={20} />
                  {streak}
                </div>
              </div>

              {authMode === 'authenticated' && (
                <button
                  onClick={handleSignOut}
                  className="flex items-center justify-center p-2.5 bg-[#27272a]/50 hover:bg-red-500/10 text-[#a1a1aa] hover:text-red-400 border border-transparent hover:border-red-500/30 rounded-lg transition-all"
                  title="Sign Out"
                >
                  <LogOut size={18} />
                </button>
              )}
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">

            {/* Today's Checklist */}
            <div className="bg-[#121214] border border-[#27272a] rounded-xl p-5 shadow-xl flex flex-col">
              <div className="flex justify-between items-center mb-6 px-1">
                <h2 className="text-lg font-semibold text-[#fcfcfc]">Today's Habits</h2>
                <span className="bg-[#27272a] text-[#fcfcfc] text-xs px-2.5 py-1 rounded-md font-medium">
                  {todayScore}/{totalHabits} Done
                </span>
              </div>

              {loading ? (
                <div className="flex-1 flex items-center justify-center text-[#a1a1aa] text-sm py-10">
                  Loading habits...
                </div>
              ) : (
                <div className="space-y-3 flex-1">
                  {habits.map(habit => {
                    const isDone = history[today]?.[habit.id] || false;

                    if (editingHabitId === habit.id) {
                      return (
                        <div key={`edit-${habit.id}`} className="flex flex-col gap-3 p-3 rounded-lg border border-[#5272c6]/50 bg-[#18181b] animate-in fade-in zoom-in-95 duration-200">
                          <div className="flex gap-2 items-center">
                            <input
                              className="bg-black/20 border border-[#27272a] rounded px-2 py-1.5 w-12 text-center text-lg focus:outline-none focus:border-[#5272c6]"
                              value={editHabitIcon}
                              onChange={(e) => setEditHabitIcon(e.target.value)}
                              placeholder="🔥"
                              maxLength={2}
                            />
                            <input
                              className="flex-1 bg-transparent border-none text-[#fcfcfc] px-2 py-1.5 focus:outline-none text-sm font-medium placeholder-[#52525b]"
                              value={editHabitName}
                              onChange={(e) => setEditHabitName(e.target.value)}
                              placeholder="Enter habit name..."
                              autoFocus
                            />
                          </div>
                          <div className="flex gap-2 items-center text-[#a1a1aa] text-sm justify-between bg-black/20 p-2 rounded border border-[#27272a]">
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-semibold uppercase text-[#71717a]">Start</label>
                              <input
                                type="time"
                                className="bg-transparent border-none text-[#fcfcfc] focus:outline-none focus:ring-1 focus:ring-[#5272c6] rounded px-1"
                                value={editHabitStart}
                                onChange={(e) => setEditHabitStart(e.target.value)}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-semibold uppercase text-[#71717a]">End</label>
                              <input
                                type="time"
                                className="bg-transparent border-none text-[#fcfcfc] focus:outline-none focus:ring-1 focus:ring-[#5272c6] rounded px-1"
                                value={editHabitEnd}
                                onChange={(e) => setEditHabitEnd(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                              />
                            </div>
                          </div>
                          <div className="flex w-full gap-2 mt-1">
                            <button
                              onClick={() => setEditingHabitId(null)}
                              className="flex-1 bg-transparent text-[#a1a1aa] border border-[#27272a] px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#27272a] hover:text-[#fcfcfc] transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveEdit}
                              className="flex-1 bg-[#5272c6] text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#4361b3] transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={habit.id}
                        className={`group relative w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 border cursor-pointer select-none
                          ${isDone
                            ? 'bg-[#5272c6]/10 border-[#5272c6]/50 text-[#fcfcfc]'
                            : 'bg-transparent border-[#27272a] text-[#a1a1aa] hover:border-[#a1a1aa]/50 hover:text-[#fcfcfc]'
                          }`}
                        onClick={() => toggleHabit(habit.id)}
                      >
                        <div className="flex-shrink-0">
                          {isDone ? (
                            <CheckCircle2 className="text-[#5272c6]" size={22} />
                          ) : (
                            <Circle className="text-[#27272a]" size={22} />
                          )}
                        </div>
                        <span className="text-lg w-8 text-center bg-black/20 rounded-md py-0.5">{habit.icon}</span>
                        <div className="flex flex-col flex-1 truncate">
                          <span className={`font-medium ${isDone ? 'line-through opacity-70' : ''}`}>
                            {habit.name}
                          </span>
                          <span className="text-xs text-[#71717a] font-mono">
                            {habit.start_time} - {habit.end_time}
                          </span>
                        </div>

                        {/* Hover Actions */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 pr-1">
                          <button
                            className="text-[#a1a1aa] hover:text-[#fcfcfc] hover:bg-[#27272a] p-1.5 rounded-md transition-colors"
                            onClick={(e) => startEditing(habit, e)}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="text-red-500/70 hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm('Delete this habit altogether?')) {
                                deleteHabit(habit.id, e);
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add Habit Inline Form */}
                  {isAddingMode ? (
                    <div className="flex flex-col gap-3 p-3 rounded-lg border border-[#3f3f46] bg-[#18181b] animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex gap-2 items-center">
                        <input
                          className="bg-black/20 border border-[#27272a] rounded px-2 py-1.5 w-12 text-center text-lg focus:outline-none focus:border-[#5272c6]"
                          value={newHabitIcon}
                          onChange={(e) => setNewHabitIcon(e.target.value)}
                          placeholder="🔥"
                          maxLength={2}
                        />
                        <input
                          className="flex-1 bg-transparent border-none text-[#fcfcfc] px-2 py-1.5 focus:outline-none text-sm font-medium placeholder-[#52525b]"
                          value={newHabitName}
                          onChange={(e) => setNewHabitName(e.target.value)}
                          placeholder="Enter habit name..."
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-2 items-center text-[#a1a1aa] text-sm justify-between bg-black/20 p-2 rounded border border-[#27272a]">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold uppercase text-[#71717a]">Start</label>
                          <input
                            type="time"
                            className="bg-transparent border-none text-[#fcfcfc] focus:outline-none focus:ring-1 focus:ring-[#5272c6] rounded px-1"
                            value={newHabitStart}
                            onChange={(e) => setNewHabitStart(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold uppercase text-[#71717a]">End</label>
                          <input
                            type="time"
                            className="bg-transparent border-none text-[#fcfcfc] focus:outline-none focus:ring-1 focus:ring-[#5272c6] rounded px-1"
                            value={newHabitEnd}
                            onChange={(e) => setNewHabitEnd(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addHabit();
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex w-full gap-2 mt-1">
                        <button
                          onClick={() => setIsAddingMode(false)}
                          className="flex-1 bg-transparent text-[#a1a1aa] border border-[#27272a] px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#27272a] hover:text-[#fcfcfc] transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={addHabit}
                          disabled={isSubmitting}
                          className={`flex-1 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${isSubmitting ? 'bg-[#5272c6]/50 cursor-not-allowed' : 'bg-[#5272c6] hover:bg-[#4361b3]'
                            }`}
                        >
                          {isSubmitting ? 'Adding...' : 'Add Habit'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsAddingMode(true)}
                      className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-[#27272a] text-[#a1a1aa] hover:text-[#fcfcfc] hover:border-[#3f3f46] hover:bg-[#27272a]/30 transition-all text-sm font-medium mt-2"
                    >
                      <Plus size={16} /> Add New Habit
                    </button>
                  )}
                  {habits.length === 0 && !isAddingMode && !loading && (
                    <div className="text-center text-sm text-[#a1a1aa] py-4">No habits yet. Add one above!</div>
                  )}
                </div>
              )}

              {todayScore === totalHabits && totalHabits > 0 && (
                <div className="mt-6 p-4 rounded-lg bg-gradient-to-r from-[#5272c6]/20 to-[#5272c6]/5 border border-[#5272c6]/30 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                  <div className="bg-[#5272c6]/20 p-2 rounded-full">
                    <Trophy className="text-[#5272c6]" size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#fcfcfc]">Perfect Day</p>
                    <p className="text-xs text-[#a1a1aa]">You hit all targets.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Progress Graph */}
            <div className="bg-[#121214] border border-[#27272a] rounded-xl p-5 shadow-xl flex flex-col min-h-[400px]">
              <h2 className="text-lg font-semibold text-[#fcfcfc] mb-6 px-1">14-Day Trajectory</h2>

              <div className="flex-1 w-full habits-graph relative -left-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="displayDate"
                      stroke="#a1a1aa"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis
                      stroke="#a1a1aa"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `${val}%`}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '13px' }}
                      itemStyle={{ color: '#fcfcfc' }}
                      formatter={(value: number | undefined) => [`${value || 0}% Complete`, 'Score']}
                      labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#5272c6"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 5, fill: '#fcfcfc', stroke: '#5272c6', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (30%) - Timeline Calendar */}
        <div className="lg:w-[30%] bg-[#121214] border border-[#27272a] rounded-xl shadow-xl flex flex-col h-[770px] mt-8 lg:mt-[105px]">
          <div className="p-5 border-b border-[#27272a] flex justify-between items-center bg-[#121214] rounded-t-xl z-20 shadow-md">
            <h2 className="text-lg font-semibold text-[#fcfcfc] flex items-center gap-2">
              <Clock size={18} className="text-[#fcfcfc]" /> Daily Timeline
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto relative custom-scrollbar">
            {/* Calendar Grid Container */}
            <div className="relative min-h-full py-4 pb-20">
              {/* Background Lines & Hour Labels */}
              {TIMELINE_HOURS.map((hour) => (
                <div key={`hour-${hour}`} className="flex relative h-16 group">
                  {/* Time Label */}
                  <div className="w-16 flex-shrink-0 text-right pr-3 -mt-2">
                    <span className="text-[10px] sm:text-xs font-medium text-[#71717a]">{formatHour(hour)}</span>
                  </div>

                  {/* Grid Line */}
                  <div className="flex-1 border-t border-[#27272a]/60 relative z-0"></div>
                </div>
              ))}

              {/* Habit Blocks (Absolute Positioning over the grid) */}
              <div className="absolute top-4 left-16 right-4 bottom-4">
                {habits.map(habit => {
                  if (!habit.start_time || !habit.end_time) return null;

                  const [sh, sm] = habit.start_time.split(':').map(Number);
                  const [eh, em] = habit.end_time.split(':').map(Number);

                  // Calculate position
                  // Timeline starts at TIMELINE_HOURS[0] (12 AM)
                  const startHour = TIMELINE_HOURS[0];

                  const offsetHoursStart = sh - startHour + (sm / 60);
                  const offsetHoursEnd = eh - startHour + (em / 60);

                  // Each hour is 64px (h-16 class = 4rem = 64px)
                  const topPosition = offsetHoursStart * 64;

                  // Calculate height based on duration. If end time is before start time (e.g. overnight), we handle it as 1 hour minimal for now.
                  let durationHours = offsetHoursEnd - offsetHoursStart;
                  if (durationHours <= 0) durationHours = 1; // Fallback minimal height

                  const height = durationHours * 64;

                  const isDone = history[today]?.[habit.id];

                  return (
                    <div
                      key={`timeline-${habit.id}`}
                      className="absolute left-0 right-0 group z-10 mx-1"
                      style={{
                        top: `${topPosition}px`,
                        height: `calc(${height}px - 4px)` // subtract margin
                      }}
                    >
                      <div className={`relative px-3 py-1.5 rounded-md border text-sm flex flex-col gap-0.5 shadow-sm transition-all h-full overflow-hidden
                        ${isDone
                          ? 'bg-[#18181b]/90 border-[#27272a] opacity-70'
                          : 'bg-[#5272c6]/10 border-[#5272c6]/30 hover:border-[#5272c6]/60 backdrop-blur-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium flex items-center gap-2 truncate pr-2 leading-none">
                            <span className={isDone ? "opacity-50" : ""}>{habit.icon}</span>
                            {habit.name}
                          </span>
                          <span className="text-[10px] font-mono opacity-60 flex-shrink-0 leading-none mt-1">
                            {habit.start_time} - {habit.end_time}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Monthly Graph - Full Width Below */}
      <div className="w-full mx-auto px-4 sm:px-8 xl:px-12 mt-8 pb-12">
        <div className="bg-[#121214] border border-[#27272a] rounded-xl p-5 shadow-xl flex flex-col h-[400px]">
          <div className="flex justify-between items-center mb-6 px-1">
            <h2 className="text-lg font-semibold text-[#fcfcfc] flex items-center gap-2">
              Monthly Overview
            </h2>
            <div className="flex items-center gap-4 bg-[#27272a]/50 p-1 rounded-lg">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-[#27272a] rounded-md transition-colors text-[#a1a1aa] hover:text-[#fcfcfc]"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="font-medium text-sm text-[#fcfcfc] min-w-[120px] text-center">
                {MONTH_NAMES[currentMonthDate.getMonth()]} {currentMonthDate.getFullYear()}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-[#27272a] rounded-md transition-colors text-[#a1a1aa] hover:text-[#fcfcfc]"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 w-full habits-graph relative -left-4 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="displayDate"
                  stroke="#a1a1aa"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#a1a1aa"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val}%`}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '13px' }}
                  itemStyle={{ color: '#fcfcfc' }}
                  formatter={(value: number | undefined) => [`${value || 0}% Complete`, 'Score']}
                  labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#5272c6"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5, fill: '#fcfcfc', stroke: '#5272c6', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
}
