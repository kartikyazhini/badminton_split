import React, { useState, useEffect } from 'react';
import { Player, Quarter, Session } from './types';
import Dashboard from './components/Dashboard';
import SessionList from './components/SessionList';
import PlayerList from './components/PlayerList';
import QuarterList from './components/QuarterList';
import SheetsSync from './components/SheetsSync';
import IOSInstallPrompt from './components/IOSInstallPrompt';
import { loadFromGoogleSheets, syncToGoogleSheets } from './lib/googleSheetsService';
import { LayoutGrid, CalendarRange, Users, FolderKanban, Activity, ShieldCheck, RefreshCw } from 'lucide-react';

const SEED_PLAYERS: Player[] = [
  { id: 1, name: "Yazhini", tier: "Premium", groups: ["Sunday Group"], isActive: true, family: "", category: "Adult" },
  { id: 2, name: "Krams", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "Krams/Abhaya", category: "Adult" },
  { id: 3, name: "Abhaya", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "Krams/Abhaya", category: "Adult" },
  { id: 4, name: "Komal", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "Komal/Om", category: "Adult" },
  { id: 5, name: "Om", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "Komal/Om", category: "Adult" },
  { id: 13, name: "Aarav", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "Komal/Om", category: "Adult" },
  { id: 6, name: "Charanya", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "Charanya/Shyam", category: "Adult" },
  { id: 7, name: "Shyam", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "Charanya/Shyam", category: "Adult" },
  { id: 8, name: "Punit", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "Punit/Neel", category: "Adult" },
  { id: 14, name: "Neel", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "Punit/Neel", category: "Adult" },
  { id: 9, name: "Gokul", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "", category: "Adult" },
  { id: 10, name: "Judy", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "Judy/Subash", category: "Adult" },
  { id: 11, name: "Subash", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "Judy/Subash", category: "Adult" },
  { id: 12, name: "Ramesh", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "", category: "Adult" },
  { id: 15, name: "Kartik", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "", category: "Adult" },
  { id: 16, name: "Satish", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "", category: "Adult" },
  
  // Kids
  { id: 17, name: "Manasvini", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "", category: "Kid" },
  { id: 18, name: "Aadhya", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "", category: "Kid" },
  { id: 19, name: "Swara", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "", category: "Kid" },
  { id: 20, name: "Samit", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "", category: "Kid" },
  { id: 21, name: "Shriya", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "", category: "Kid" },
  { id: 22, name: "Prats", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "", category: "Kid" },
  { id: 23, name: "Saanvi", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "", category: "Kid" },
  { id: 24, name: "Meera", tier: "Standard", groups: ["Sunday Group"], isActive: true, family: "", category: "Kid" },
];

const SEED_QUARTERS: Quarter[] = [
  { id: 1, name: "Quarter 1 2026", startDate: "2026-01-01", endDate: "2026-03-31" },
  { id: 2, name: "Quarter 2 2026", startDate: "2026-04-01", endDate: "2026-06-30" },
];

const SEED_SESSIONS: Session[] = [
  {
    id: 1,
    quarterId: 2,
    date: "2026-04-12",
    courtFee: 20.46,
    attendeeIds: [2, 3, 4, 8, 10, 15],
    paidById: 2,
    shares: [],
    expenseType: "Court Rental - 3 hours",
    comment: "Regular Sunday court rental split",
  },
  {
    id: 2,
    quarterId: 2,
    date: "2026-04-18",
    courtFee: 13.64,
    attendeeIds: [2, 3, 8, 10, 11, 12, 15],
    paidById: 2,
    shares: [],
    expenseType: "Court Rental - 2 hours",
    comment: "Saturday booking split",
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sessions' | 'players' | 'quarters'>('dashboard');
  const [category, setCategory] = useState<'Adult' | 'Kid'>(() => {
    return (localStorage.getItem('active_category') as 'Adult' | 'Kid') || 'Adult';
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('google_access_token'));
  const [loadingSheetData, setLoadingSheetData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load state from localStorage with seeds as fallback
  const [quarters, setQuarters] = useState<Quarter[]>(() => {
    const data = localStorage.getItem('quarters');
    try {
      return data ? JSON.parse(data) : SEED_QUARTERS;
    } catch {
      return SEED_QUARTERS;
    }
  });

  const [players, setPlayers] = useState<Player[]>(() => {
    const data = localStorage.getItem('players');
    try {
      if (data) {
        const parsed: Player[] = JSON.parse(data);
        // Automatically merge any newly added SEED_PLAYERS that aren't in the user's localStorage yet
        const merged = [...parsed];
        let hasNew = false;
        SEED_PLAYERS.forEach((seed) => {
          const existingIndex = merged.findIndex((p) => p.id === seed.id);
          if (existingIndex === -1) {
            merged.push(seed);
            hasNew = true;
          } else {
            let updated = false;
            const existing = merged[existingIndex];
            if (existing.family !== seed.family) {
              existing.family = seed.family;
              updated = true;
            }
            if (!existing.category || existing.category !== seed.category) {
              existing.category = seed.category || 'Adult';
              updated = true;
            }
            if (updated) {
              merged[existingIndex] = { ...existing };
              hasNew = true;
            }
          }
        });
        if (hasNew) {
          localStorage.setItem('players', JSON.stringify(merged));
        }
        return merged;
      }
      return SEED_PLAYERS;
    } catch {
      return SEED_PLAYERS;
    }
  });

  const [sessions, setSessions] = useState<Session[]>(() => {
    const data = localStorage.getItem('sessions');
    try {
      if (data) {
        const parsed: Session[] = JSON.parse(data);
        // Robustly deduplicate sessions by ID and duplicate structural values to avoid any ghost rows
        const unique: Session[] = [];
        const seenIds = new Set<number>();
        parsed.forEach((s) => {
          if (!seenIds.has(s.id)) {
            // Check if there is an exact match already on core fields
            const isDuplicate = unique.some((u) => 
              u.date === s.date && 
              u.courtFee === s.courtFee && 
              u.paidById === s.paidById && 
              JSON.stringify([...u.attendeeIds].sort()) === JSON.stringify([...s.attendeeIds].sort()) &&
              u.comment === s.comment
            );
            if (!isDuplicate) {
              unique.push(s);
              seenIds.add(s.id);
            }
          }
        });
        if (unique.length !== parsed.length) {
          localStorage.setItem('sessions', JSON.stringify(unique));
        }
        return unique;
      }
      return SEED_SESSIONS;
    } catch {
      return SEED_SESSIONS;
    }
  });

  const [selectedQuarterFilter, setSelectedQuarterFilter] = useState<number>(() => {
    const data = localStorage.getItem('quarters');
    try {
      const q = data ? JSON.parse(data) : SEED_QUARTERS;
      return q.length > 0 ? q[0].id : 0;
    } catch {
      return SEED_QUARTERS.length > 0 ? SEED_QUARTERS[0].id : 0;
    }
  });

  // Keep selectedQuarterFilter in sync if quarters list changes
  useEffect(() => {
    if (quarters.length > 0) {
      const exists = quarters.some((q) => q.id === selectedQuarterFilter);
      if (!exists) {
        setSelectedQuarterFilter(quarters[0].id);
      }
    } else {
      setSelectedQuarterFilter(0);
    }
  }, [quarters, selectedQuarterFilter]);

  // Load from Google Sheets on start or on category switch
  const loadSheetData = async (activeCategory: 'Adult' | 'Kid', activeToken: string | null) => {
    if (!activeToken) return;
    setLoadingSheetData(true);
    setLoadError(null);
    try {
      const data = await loadFromGoogleSheets({
        token: activeToken,
        category: activeCategory,
        players
      });
      if (data.quarters && data.quarters.length > 0) {
        setQuarters(data.quarters);
      }
      if (data.sessions) {
        setSessions(data.sessions);
      }
    } catch (err: any) {
      console.error('Error loading sheet data:', err);
      setLoadError(err.message || 'Error loading from Google Sheets');
    } finally {
      setLoadingSheetData(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadSheetData(category, token);
    }
  }, [category, token]);

  // Auto sync back to Google Sheets on changes
  const triggerAutoSync = async (updatedQuarters: Quarter[], updatedSessions: Session[]) => {
    const activeToken = token || localStorage.getItem('google_access_token');
    if (!activeToken) return;

    const spreadsheetId = category === 'Kid'
      ? '1cj02RjtHirJs5GELGQuM6kjBiMXfQ_1uK6pV-9OUyp8'
      : '1YHzJuRgjUFCUqFuibXpb-ZiYIAyuXyZK2Wx_QDeTr9I';

    try {
      await syncToGoogleSheets({
        token: activeToken,
        spreadsheetId,
        quarters: updatedQuarters,
        players,
        sessions: updatedSessions
      });
    } catch (err) {
      console.error('Auto-sync to Google Sheets failed:', err);
    }
  };

  // Save State to localStorage on change
  useEffect(() => {
    localStorage.setItem('quarters', JSON.stringify(quarters));
  }, [quarters]);

  useEffect(() => {
    localStorage.setItem('players', JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    localStorage.setItem('sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('active_category', category);
  }, [category]);

  // Actions for Quarters
  const handleAddQuarter = (newQ: Omit<Quarter, 'id'>) => {
    const id = quarters.length > 0 ? Math.max(...quarters.map((q) => q.id)) + 1 : 1;
    const nextSessions = sessions.filter((s) => s.quarterId !== id);
    const nextQuarters = [...quarters, { ...newQ, id }];
    setSessions(nextSessions);
    setQuarters(nextQuarters);
    triggerAutoSync(nextQuarters, nextSessions);
  };

  const handleUpdateQuarter = (updatedQ: Quarter) => {
    const nextQuarters = quarters.map((q) => (q.id === updatedQ.id ? updatedQ : q));
    setQuarters(nextQuarters);
    triggerAutoSync(nextQuarters, sessions);
  };

  const handleDeleteQuarter = (id: number) => {
    const nextQuarters = quarters.filter((q) => q.id !== id);
    const nextSessions = sessions.filter((s) => s.quarterId !== id);
    setQuarters(nextQuarters);
    setSessions(nextSessions);
    triggerAutoSync(nextQuarters, nextSessions);
  };

  // Actions for Players
  const handleAddPlayer = (newP: Omit<Player, 'id'>) => {
    const id = players.length > 0 ? Math.max(...players.map((p) => p.id)) + 1 : 1;
    setPlayers([...players, { ...newP, id }]);
  };

  const handleUpdatePlayer = (updatedP: Player) => {
    setPlayers(players.map((p) => (p.id === updatedP.id ? updatedP : p)));
  };

  const handleDeletePlayer = (id: number) => {
    setPlayers(players.filter((p) => p.id !== id));
    // Cascade update attendee list in sessions
    const nextSessions = sessions.map((s) => ({
      ...s,
      attendeeIds: s.attendeeIds.filter((attId) => attId !== id),
    }));
    setSessions(nextSessions);
    triggerAutoSync(quarters, nextSessions);
  };

  // Actions for Sessions
  const handleAddSession = (newS: Omit<Session, 'id' | 'shares'>) => {
    const id = sessions.length > 0 ? Math.max(...sessions.map((s) => s.id)) + 1 : 1;
    const nextSessions = [...sessions, { ...newS, id, shares: [] }];
    setSessions(nextSessions);
    triggerAutoSync(quarters, nextSessions);
  };

  const handleUpdateSession = (updatedS: Session) => {
    const nextSessions = sessions.map((s) => (s.id === updatedS.id ? updatedS : s));
    setSessions(nextSessions);
    triggerAutoSync(quarters, nextSessions);
  };

  const handleDeleteSession = (id: number) => {
    const nextSessions = sessions.filter((s) => s.id !== id);
    setSessions(nextSessions);
    triggerAutoSync(quarters, nextSessions);
  };

  const handleImportSessions = (imported: Session[]) => {
    if (imported.length === 0) return;
    const targetQuarterId = imported[0].quarterId;
    const otherSessions = sessions.filter(s => s.quarterId !== targetQuarterId);
    let maxId = otherSessions.length > 0 ? Math.max(...otherSessions.map(s => s.id)) : 0;
    const importedWithIds = imported.map((s, idx) => ({
      ...s,
      id: maxId + idx + 1,
      shares: []
    }));
    const nextSessions = [...otherSessions, ...importedWithIds];
    setSessions(nextSessions);
    triggerAutoSync(quarters, nextSessions);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">
      {/* Top Header - Adjusted for iOS Notch / Status Bar */}
      <header className="bg-white border-b border-slate-100 pt-[calc(14px+env(safe-area-inset-top,0px))] pb-4 px-6 sticky top-0 z-30 shadow-sm/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2.5 rounded-2xl text-white shadow-md shadow-emerald-100 flex items-center justify-center">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-extrabold text-slate-800 text-xl tracking-tight leading-none">Badminton Split</h1>
              <p className="text-slate-400 text-[10px] sm:text-xs font-medium mt-1">Court fee allocation & Sheets sync</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Category Switcher Segment Control */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 shadow-inner/5">
              <button
                onClick={() => setCategory('Adult')}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  category === 'Adult'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                🧑 Adults
              </button>
              <button
                onClick={() => setCategory('Kid')}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  category === 'Kid'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                🧒 Kids
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-2 bg-slate-100/50 p-1 rounded-xl border border-slate-100">
              <span className="inline-flex w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-2"></span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pr-2">System Live</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container - Bottom padding adapted to make room for fixed iOS bottom bar */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:px-8 pb-[calc(76px+env(safe-area-inset-bottom,0px))] sm:pb-12">
        {loadingSheetData && (
          <div className="mb-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl px-4 py-3 flex items-center gap-2.5 shadow-sm">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
            <span className="text-xs font-semibold">Loading live quarters and sessions from Google Sheets...</span>
          </div>
        )}
        {loadError && (
          <div className="mb-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl px-4 py-3 flex items-center justify-between gap-2.5 shadow-sm">
            <span className="text-xs font-semibold">Sync Error: {loadError}</span>
            <button
              onClick={() => loadSheetData(category, token)}
              className="text-xs font-bold underline text-rose-800 hover:text-rose-900 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Google Sheets Sync banner */}
        <SheetsSync
          quarters={quarters}
          players={players}
          sessions={sessions}
          onImportSessions={handleImportSessions}
          selectedQuarterId={selectedQuarterFilter}
          category={category}
          onTokenChange={(t) => setToken(t)}
        />

        {/* Navigation Tabs (Visible on Desktop / Tablet only) */}
        <div className="hidden sm:flex border-b border-slate-200 mb-6 overflow-x-auto whitespace-nowrap scrollbar-none">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-sm transition border-b-2 -mb-px cursor-pointer ${
              activeTab === 'dashboard'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
            id="tab-dashboard"
          >
            <LayoutGrid className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('sessions')}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-sm transition border-b-2 -mb-px cursor-pointer ${
              activeTab === 'sessions'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
            id="tab-sessions"
          >
            <CalendarRange className="w-4 h-4" />
            Sessions History
          </button>
          <button
            onClick={() => setActiveTab('players')}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-sm transition border-b-2 -mb-px cursor-pointer ${
              activeTab === 'players'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
            id="tab-players"
          >
            <Users className="w-4 h-4" />
            Players Registry
          </button>
          <button
            onClick={() => setActiveTab('quarters')}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-sm transition border-b-2 -mb-px cursor-pointer ${
              activeTab === 'quarters'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
            id="tab-quarters"
          >
            <FolderKanban className="w-4 h-4" />
            Quarters
          </button>
        </div>

        {/* Dynamic Tab Views */}
        <div className="pb-4">
          {activeTab === 'dashboard' && (
            <Dashboard sessions={sessions} quarters={quarters} players={players} />
          )}
          {activeTab === 'sessions' && (
            <SessionList
              sessions={sessions}
              quarters={quarters}
              players={players}
              onAdd={handleAddSession}
              onUpdate={handleUpdateSession}
              onDelete={handleDeleteSession}
              selectedQuarterFilter={selectedQuarterFilter}
              setSelectedQuarterFilter={setSelectedQuarterFilter}
            />
          )}
          {activeTab === 'players' && (
            <PlayerList
              players={players}
              onAdd={handleAddPlayer}
              onUpdate={handleUpdatePlayer}
              onDelete={handleDeletePlayer}
            />
          )}
          {activeTab === 'quarters' && (
            <QuarterList
              quarters={quarters}
              onAdd={handleAddQuarter}
              onUpdate={handleUpdateQuarter}
              onDelete={handleDeleteQuarter}
            />
          )}
        </div>
      </main>

      {/* Premium iOS-style bottom Tab Bar for Mobile */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-100 z-40 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-2.5 px-6 flex justify-around items-center shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ios-active ${
            activeTab === 'dashboard' ? 'text-emerald-600' : 'text-slate-400'
          }`}
        >
          <LayoutGrid className="w-5.5 h-5.5" />
          <span className="text-[10px] font-bold">Dashboard</span>
        </button>
        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ios-active ${
            activeTab === 'sessions' ? 'text-emerald-600' : 'text-slate-400'
          }`}
        >
          <CalendarRange className="w-5.5 h-5.5" />
          <span className="text-[10px] font-bold">Sessions</span>
        </button>
        <button
          onClick={() => setActiveTab('players')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ios-active ${
            activeTab === 'players' ? 'text-emerald-600' : 'text-slate-400'
          }`}
        >
          <Users className="w-5.5 h-5.5" />
          <span className="text-[10px] font-bold">Players</span>
        </button>
        <button
          onClick={() => setActiveTab('quarters')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ios-active ${
            activeTab === 'quarters' ? 'text-emerald-600' : 'text-slate-400'
          }`}
        >
          <FolderKanban className="w-5.5 h-5.5" />
          <span className="text-[10px] font-bold">Quarters</span>
        </button>
      </nav>

      {/* iOS Safari Home Screen Installation Prompt Overlay */}
      <IOSInstallPrompt />
    </div>
  );
}
