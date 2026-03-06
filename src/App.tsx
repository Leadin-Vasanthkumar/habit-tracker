import { useState, useEffect } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { CheckCircle2, Circle, Flame, Trophy, Plus, Trash2, Clock, Edit2 } from 'lucide-react';
import { supabase } from './lib/supabase';

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
  const [habits, setHabits] = useState<Habit[]>([]);
  const [history, setHistory] = useState<Record<string, Record<string, boolean>>>({});
  const [today] = useState(getTodayStr());

  // UI State
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('🔥');
  const [newHabitStart, setNewHabitStart] = useState('09:00');
  const [newHabitEnd, setNewHabitEnd] = useState('10:00');
  const [loading, setLoading] = useState(true);

  // Edit State
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [editHabitName, setEditHabitName] = useState('');
  const [editHabitIcon, setEditHabitIcon] = useState('');
  const [editHabitStart, setEditHabitStart] = useState('');
  const [editHabitEnd, setEditHabitEnd] = useState('');

  // Load from Supabase
  useEffect(() => {
    fetchData();
  }, [today]);

  const fetchData = async () => {
    setLoading(true);
    // 1. Fetch Habits
    const { data: habitsData, error: habitsError } = await supabase
      .from('habits')
      .select('*')
      .order('sort_order', { ascending: true });

    if (!habitsError && habitsData) {
      setHabits(habitsData);
    }

    // 2. Fetch Completions for last 14 days
    const days = generateDays();
    const minDate = days[0];
    const maxDate = days[days.length - 1];

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
    if (!newHabitName.trim()) return;

    const newHabit = {
      name: newHabitName.trim(),
      icon: newHabitIcon,
      start_time: newHabitStart,
      end_time: newHabitEnd,
      sort_order: habits.length
    };

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

    await supabase
      .from('habits')
      .update(updates)
      .match({ id: editingHabitId });
  };

  const deleteHabit = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Optimistic UI
    setHabits(habits.filter(h => h.id !== id));

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

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] font-sans selection:bg-[#5272c6] selection:text-white pb-20">

      <div className="w-full mx-auto px-4 sm:px-8 xl:px-12 mt-4 md:mt-8 space-y-8 flex flex-col lg:flex-row gap-8">

        {/* Left Column (70%) */}
        <div className="lg:w-[70%] space-y-8">
          {/* Header */}
          <header className="flex justify-between items-end border-b border-[#27272a] pb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#fcfcfc]">Vasanth's OS</h1>
              <p className="text-[#a1a1aa] mt-2 text-sm md:text-base">Focus strictly on Flowlock. Build daily.</p>
            </div>
            <div className="text-right flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-xs text-[#a1a1aa] uppercase font-bold tracking-wider">Perfect Streak</span>
                <div className="flex items-center gap-1 text-[#fcfcfc] text-xl font-bold">
                  <Flame className={streak > 0 ? "text-[#5272c6]" : "text-[#27272a]"} size={20} />
                  {streak}
                </div>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

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
                            onKeyDown={(e) => e.key === 'Enter' && addHabit()}
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
                          className="flex-1 bg-[#5272c6] text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#4361b3] transition-colors"
                        >
                          Add Habit
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
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#5272c6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#5272c6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="#5272c6"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorScore)"
                      activeDot={{ r: 5, fill: '#fcfcfc', stroke: '#5272c6', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (30%) - Timeline Calendar */}
        <div className="lg:w-[30%] bg-[#121214] border border-[#27272a] rounded-xl shadow-xl flex flex-col h-[calc(100vh-4rem)] sticky top-8">
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
    </div>
  );
}
