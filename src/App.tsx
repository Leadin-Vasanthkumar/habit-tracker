import { useState, useEffect } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { CheckCircle2, Circle, Flame, Trophy } from 'lucide-react';

// Format: YYYY-MM-DD
const getTodayStr = () => new Date().toISOString().split('T')[0];

const HABITS = [
  { id: 'h1', name: 'Meditation (5m)', icon: '🧘' },
  { id: 'h2', name: 'Workout (30m)', icon: '🏃' },
  { id: 'h3', name: 'Reading (30m)', icon: '📚' },
  { id: 'h4', name: 'Flowlock Build', icon: '💻' },
  { id: 'h5', name: 'No Binge', icon: '📵' }
];

// Generate last 14 days
const generateDays = () => {
  const days = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
};

export default function App() {
  // state: { '2026-03-05': { h1: true, h2: false } }
  const [history, setHistory] = useState<Record<string, Record<string, boolean>>>({});
  const [today] = useState(getTodayStr());

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem('vasanth_habits');
    if (saved) {
      setHistory(JSON.parse(saved));
    }
  }, []);

  const toggleHabit = (habitId: string) => {
    const newHistory = { ...history };
    if (!newHistory[today]) newHistory[today] = {};

    newHistory[today][habitId] = !newHistory[today][habitId];

    setHistory(newHistory);
    localStorage.setItem('vasanth_habits', JSON.stringify(newHistory));
  };

  // Calculate score for the graph
  const chartData = generateDays().map(date => {
    const dayData = history[date] || {};
    const score = Object.values(dayData).filter(Boolean).length;
    const dateObj = new Date(date);
    return {
      date,
      displayDate: `${dateObj.getDate()}/${dateObj.getMonth() + 1}`,
      score: score * 20 // Convert 0-5 to 0-100%
    };
  });

  const todayScore = Object.values(history[today] || {}).filter(Boolean).length;

  // Calculate streak (consecutive days with all 5 habits)
  let streak = 0;
  const days = generateDays().reverse();
  for (const day of days) {
    const dScore = Object.values(history[day] || {}).filter(Boolean).length;
    if (dScore === 5) streak++;
    else if (day !== today) break; // If yesterday wasn't perfect, streak broken
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] p-4 md:p-8 font-sans selection:bg-[#5272c6] selection:text-white">

      <div className="max-w-4xl mx-auto space-y-8 mt-4">
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

        {/* Main Grid content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Today's Checklist */}
          <div className="lg:col-span-1 bg-[#121214] border border-[#27272a] rounded-xl p-5 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-[#fcfcfc]">Today's Habits</h2>
              <span className="bg-[#27272a] text-[#fcfcfc] text-xs px-2 py-1 rounded-md font-medium">
                {todayScore}/5 Done
              </span>
            </div>

            <div className="space-y-3">
              {HABITS.map(habit => {
                const isDone = history[today]?.[habit.id] || false;
                return (
                  <button
                    key={habit.id}
                    onClick={() => toggleHabit(habit.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 border text-left
                      ${isDone
                        ? 'bg-[#5272c6]/10 border-[#5272c6]/50 text-[#fcfcfc]'
                        : 'bg-transparent border-[#27272a] text-[#a1a1aa] hover:border-[#a1a1aa]/50 hover:text-[#fcfcfc]'
                      }`}
                  >
                    <div className="flex-shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="text-[#5272c6]" size={22} />
                      ) : (
                        <Circle className="text-[#27272a]" size={22} />
                      )}
                    </div>
                    <span className="text-lg w-8 text-center bg-black/20 rounded">{habit.icon}</span>
                    <span className={`font-medium ${isDone ? 'line-through opacity-70' : ''}`}>
                      {habit.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {todayScore === 5 && (
              <div className="mt-6 p-4 rounded-lg bg-gradient-to-r from-[#5272c6]/20 to-transparent border border-[#5272c6]/30 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                <Trophy className="text-[#5272c6]" size={24} />
                <div>
                  <p className="text-sm font-bold text-[#fcfcfc]">Perfect Day</p>
                  <p className="text-xs text-[#a1a1aa]">You hit all 5 targets.</p>
                </div>
              </div>
            )}
          </div>

          {/* Progress Graph */}
          <div className="lg:col-span-2 bg-[#121214] border border-[#27272a] rounded-xl p-5 shadow-xl flex flex-col">
            <h2 className="text-lg font-semibold text-[#fcfcfc] mb-6">14-Day Trajectory</h2>

            <div className="flex-1 min-h-[300px] w-full habits-graph">
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
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis
                    stroke="#a1a1aa"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${val}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
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
                    activeDot={{ r: 6, fill: '#fcfcfc', stroke: '#5272c6', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
