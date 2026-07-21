import React, { useState } from 'react';
import { Player, Quarter, Session } from '../types';
import { Plus, Edit2, Trash2, Calendar, DollarSign, Users, MessageSquare, Tag, Eye, ChevronDown, ChevronUp } from 'lucide-react';

interface SessionListProps {
  sessions: Session[];
  quarters: Quarter[];
  players: Player[];
  onAdd: (s: Omit<Session, 'id' | 'shares'>) => void;
  onUpdate: (s: Session) => void;
  onDelete: (id: number) => void;
  selectedQuarterFilter: number;
  setSelectedQuarterFilter: (id: number) => void;
}

export default function SessionList({
  sessions,
  quarters,
  players,
  onAdd,
  onUpdate,
  onDelete,
  selectedQuarterFilter,
  setSelectedQuarterFilter
}: SessionListProps) {
  // Form State
  const [quarterId, setQuarterId] = useState<number>(quarters.length > 0 ? quarters[0].id : 0);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [courtFee, setCourtFee] = useState<number | ''>('');
  const [attendeeIds, setAttendeeIds] = useState<number[]>([]);
  const [paidById, setPaidById] = useState<number | ''>('');
  const [expenseType, setExpenseType] = useState('');

  // Editing modal/section state
  const [editingSession, setEditingSession] = useState<Session | null>(null);

  // Collapsible states for Adults/Kids attendees checkboxes
  const [adultsExpanded, setAdultsExpanded] = useState(true);
  const [kidsExpanded, setKidsExpanded] = useState(true);
  const [editAdultsExpanded, setEditAdultsExpanded] = useState(true);
  const [editKidsExpanded, setEditKidsExpanded] = useState(true);

  const activePlayers = players.filter((p) => p.isActive);
  const activeAdults = activePlayers.filter((p) => (p.category || 'Adult') === 'Adult');
  const activeKids = activePlayers.filter((p) => p.category === 'Kid');

  // Sync state if quarters change
  React.useEffect(() => {
    if (quarters.length > 0) {
      if (!quarterId) {
        setQuarterId(quarters[0].id);
      }
    }
  }, [quarters, players]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quarterId || attendeeIds.length === 0 || !paidById || !expenseType || courtFee === '') {
      alert("Please ensure you've selected a Quarter, at least 1 Attendee, a Payer, an Expense Type, and entered a Total Fee.");
      return;
    }
    const attendeeNames = attendeeIds
      .map((id) => players.find((p) => p.id === id)?.name || '')
      .filter((name) => name !== '')
      .join(', ');

    onAdd({
      quarterId,
      date,
      courtFee: Number(courtFee),
      attendeeIds,
      paidById: Number(paidById),
      expenseType,
      comment: attendeeNames,
    });
    // Clear the form after a successful entry
    setAttendeeIds([]);
    setCourtFee('');
    setExpenseType('');
    setPaidById('');
  };

  const startEdit = (s: Session) => {
    setEditingSession(s);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;
    if (editingSession.attendeeIds.length === 0) {
      alert("Please select at least 1 attendee.");
      return;
    }
    const attendeeNames = editingSession.attendeeIds
      .map((id) => players.find((p) => p.id === id)?.name || '')
      .filter((name) => name !== '')
      .join(', ');

    onUpdate({
      ...editingSession,
      comment: attendeeNames,
    });
    setEditingSession(null);
  };

  const handleAddToggleAttendee = (id: number) => {
    setAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleEditToggleAttendee = (id: number) => {
    if (!editingSession) return;
    const current = editingSession.attendeeIds;
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];
    setEditingSession({ ...editingSession, attendeeIds: next });
  };

  const filteredSessions = sessions.filter(
    (s) => s.quarterId === selectedQuarterFilter
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Session Entry Form */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm h-fit">
        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 mb-1">
          <Calendar className="text-emerald-600 w-5 h-5" />
          Log Session / Fee
        </h3>
        <p className="text-slate-500 text-xs mb-4 leading-relaxed">
          Log an expense (e.g. court hire, shuttlecocks) and split it among participating attendees.
        </p>

        {quarters.length === 0 ? (
          <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl p-3.5 text-xs font-semibold leading-relaxed">
            ⚠️ You must create at least one Quarter first before logging badminton sessions.
          </div>
        ) : players.length === 0 ? (
          <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl p-3.5 text-xs font-semibold leading-relaxed">
            ⚠️ You must register at least one Player first before logging sessions.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-700 text-xs font-semibold mb-1" id="lbl-s-quarter">Target Quarter</label>
              <select
                value={quarterId}
                onChange={(e) => setQuarterId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                id="select-s-quarter"
              >
                {quarters.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 text-xs font-semibold mb-1" id="lbl-s-date">Session Date</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  id="input-s-date"
                />
              </div>
              <div>
                <label className="block text-slate-700 text-xs font-semibold mb-1" id="lbl-s-fee">Total Fee ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={courtFee}
                  onChange={(e) => setCourtFee(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 20.46"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  id="input-s-fee"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 text-xs font-semibold mb-1" id="lbl-s-expense">Expense Type</label>
                <select
                  value={expenseType}
                  onChange={(e) => setExpenseType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  id="select-s-expense"
                  required
                >
                  <option value="" disabled>Select Type</option>
                  <option value="Court Rental - 1 hour">Court Rental - 1 hour</option>
                  <option value="Court Rental - 2 hours">Court Rental - 2 hours</option>
                  <option value="Court Rental - 3 hours">Court Rental - 3 hours</option>
                  <option value="Junior Day Pass">Junior Day Pass</option>
                  <option value="Shuttlecocks Purchase">Shuttlecocks Purchase</option>
                  <option value="Snacks & Hydration">Snacks & Hydration</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-700 text-xs font-semibold mb-1" id="lbl-s-paidby">Paid By (Payer)</label>
                <select
                  value={paidById}
                  onChange={(e) => setPaidById(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  id="select-s-paidby"
                  required
                >
                  <option value="" disabled>Select Payer</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-semibold mb-1.5" id="lbl-s-attendees">
                Attendees (Check all who attended - split shares)
              </label>
              
              <div className="space-y-2">
                {/* Adults Collapsible Section */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => setAdultsExpanded(!adultsExpanded)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-slate-700 text-xs font-bold border-b border-slate-200 focus:outline-none"
                  >
                    <span className="flex items-center gap-1.5">
                      🧑 Adults ({activeAdults.filter(p => attendeeIds.includes(p.id)).length} / {activeAdults.length} selected)
                    </span>
                    <span className="text-slate-400">
                      {adultsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                  {adultsExpanded && (
                    <div className="p-2 max-h-40 overflow-y-auto space-y-1 bg-white">
                      {activeAdults.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded-lg cursor-pointer transition text-xs font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={attendeeIds.includes(p.id)}
                            onChange={() => handleAddToggleAttendee(p.id)}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>{p.name}</span>
                          {p.family && <span className="text-[10px] text-slate-400">({p.family})</span>}
                        </label>
                      ))}
                      {activeAdults.length === 0 && (
                        <p className="text-slate-400 text-xs italic p-1">No active adult players</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Kids Collapsible Section */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => setKidsExpanded(!kidsExpanded)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-slate-700 text-xs font-bold border-b border-slate-200 focus:outline-none"
                  >
                    <span className="flex items-center gap-1.5">
                      🧒 Kids ({activeKids.filter(p => attendeeIds.includes(p.id)).length} / {activeKids.length} selected)
                    </span>
                    <span className="text-slate-400">
                      {kidsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                  {kidsExpanded && (
                    <div className="p-2 max-h-40 overflow-y-auto space-y-1 bg-white">
                      {activeKids.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded-lg cursor-pointer transition text-xs font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={attendeeIds.includes(p.id)}
                            onChange={() => handleAddToggleAttendee(p.id)}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>{p.name}</span>
                          {p.family && <span className="text-[10px] text-slate-400">({p.family})</span>}
                        </label>
                      ))}
                      {activeKids.length === 0 && (
                        <p className="text-slate-400 text-xs italic p-1">No active kids registered</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[10px] text-slate-500 mt-2.5 flex justify-between font-medium">
                <span>Selected: {attendeeIds.length} players</span>
                {attendeeIds.length > 0 && (
                  <span className="text-emerald-700 font-bold">
                    Split share: ${(Number(courtFee || 0) / attendeeIds.length).toFixed(2)} each
                  </span>
                )}
              </div>
            </div>



            <button
              type="submit"
              className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm shadow-sm shadow-emerald-100 transition flex items-center justify-center gap-2"
              id="btn-add-session"
            >
              <Plus className="w-4 h-4" />
              Log Session
            </button>
          </form>
        )}
      </div>

      {/* Sessions History List */}
      <div className="lg:col-span-2 space-y-4">
        {/* Quarter Filter Selector */}
        {quarters.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-slate-700">Filter History</span>
            <select
              value={selectedQuarterFilter}
              onChange={(e) => setSelectedQuarterFilter(Number(e.target.value))}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:border-emerald-500 transition"
              id="select-s-filter"
            >
              {quarters.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {filteredSessions.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-3xl p-12 text-center shadow-sm">
            <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-semibold text-sm">No sessions logged for this quarter</p>
            <p className="text-slate-400 text-xs mt-1">Configure players and record sessions to begin court fee calculation.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSessions.map((s) => (
              <SessionCard
                key={s.id}
                s={s}
                players={players}
                onStartEdit={startEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Session Dialog Overlay */}
      {editingSession && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <Edit2 className="text-emerald-600 w-5 h-5" />
              Edit Logged Session
            </h3>
            
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 text-xs font-semibold mb-1">Session Date</label>
                  <input
                    type="date"
                    required
                    value={editingSession.date}
                    onChange={(e) => setEditingSession({ ...editingSession, date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 text-xs font-semibold mb-1">Total Fee ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0"
                    value={editingSession.courtFee}
                    onChange={(e) => setEditingSession({ ...editingSession, courtFee: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 text-xs font-semibold mb-1">Expense Type</label>
                  <select
                    value={editingSession.expenseType}
                    onChange={(e) => setEditingSession({ ...editingSession, expenseType: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none"
                  >
                    <option value="Court Rental - 1 hour">Court Rental - 1 hour</option>
                    <option value="Court Rental - 2 hours">Court Rental - 2 hours</option>
                    <option value="Court Rental - 3 hours">Court Rental - 3 hours</option>
                    <option value="Junior Day Pass">Junior Day Pass</option>
                    <option value="Shuttlecocks Purchase">Shuttlecocks Purchase</option>
                    <option value="Snacks & Hydration">Snacks & Hydration</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 text-xs font-semibold mb-1">Paid By (Payer)</label>
                  <select
                    value={editingSession.paidById}
                    onChange={(e) => setEditingSession({ ...editingSession, paidById: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none"
                  >
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 text-xs font-semibold mb-1.5">
                  Attendees (Check all participating players)
                </label>
                
                <div className="space-y-2">
                  {/* Edit Adults Collapsible Section */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <button
                      type="button"
                      onClick={() => setEditAdultsExpanded(!editAdultsExpanded)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-slate-700 text-xs font-bold border-b border-slate-200 focus:outline-none"
                    >
                      <span className="flex items-center gap-1.5">
                        🧑 Adults ({players.filter((p) => p.isActive && (p.category || 'Adult') === 'Adult' && editingSession.attendeeIds.includes(p.id)).length} / {players.filter((p) => p.isActive && (p.category || 'Adult') === 'Adult').length} selected)
                      </span>
                      <span className="text-slate-400">
                        {editAdultsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                    {editAdultsExpanded && (
                      <div className="p-2 max-h-36 overflow-y-auto space-y-1 bg-white">
                        {players.filter((p) => p.isActive && (p.category || 'Adult') === 'Adult').map((p) => (
                          <label key={p.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded-lg cursor-pointer transition text-xs font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={editingSession.attendeeIds.includes(p.id)}
                              onChange={() => handleEditToggleAttendee(p.id)}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>{p.name}</span>
                            {p.family && <span className="text-[10px] text-slate-400">({p.family})</span>}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Edit Kids Collapsible Section */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <button
                      type="button"
                      onClick={() => setEditKidsExpanded(!editKidsExpanded)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-slate-700 text-xs font-bold border-b border-slate-200 focus:outline-none"
                    >
                      <span className="flex items-center gap-1.5">
                        🧒 Kids ({players.filter((p) => p.isActive && p.category === 'Kid' && editingSession.attendeeIds.includes(p.id)).length} / {players.filter((p) => p.isActive && p.category === 'Kid').length} selected)
                      </span>
                      <span className="text-slate-400">
                        {editKidsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                    {editKidsExpanded && (
                      <div className="p-2 max-h-36 overflow-y-auto space-y-1 bg-white">
                        {players.filter((p) => p.isActive && p.category === 'Kid').map((p) => (
                          <label key={p.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded-lg cursor-pointer transition text-xs font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={editingSession.attendeeIds.includes(p.id)}
                              onChange={() => handleEditToggleAttendee(p.id)}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>{p.name}</span>
                            {p.family && <span className="text-[10px] text-slate-400">({p.family})</span>}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>



              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-50">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface SessionCardProps {
  key?: any;
  s: Session;
  players: Player[];
  onStartEdit: (s: Session) => void;
  onDelete: (id: number) => void;
}

function SessionCard({ s, players, onStartEdit, onDelete }: SessionCardProps) {
  const [cardAdultsExpanded, setCardAdultsExpanded] = useState(true);
  const [cardKidsExpanded, setCardKidsExpanded] = useState(true);

  const payer = players.find((p) => p.id === s.paidById);
  const count = s.attendeeIds.length;
  const costEach = count > 0 ? (s.courtFee / count) : 0;
  
  const dateStr = s.date ? (() => {
    const parts = s.date.split('-');
    if (parts.length !== 3) return s.date;
    const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return dObj.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  })() : 'N/A';

  const sessionPlayers = s.attendeeIds.map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p);
  const cardAdultAttendees = sessionPlayers.filter(p => (p.category || 'Adult') === 'Adult');
  const cardKidAttendees = sessionPlayers.filter(p => p.category === 'Kid');

  const familyGroups: Record<string, any[]> = {};
  sessionPlayers.forEach((p) => {
    if (p.family && p.family.trim()) {
      const fam = p.family.trim();
      if (!familyGroups[fam]) {
        familyGroups[fam] = [];
      }
      familyGroups[fam].push(p);
    }
  });
  const multipleMemberFamilies = Object.entries(familyGroups).filter(([_, members]) => members.length > 1);
  const multipleMemberFamilyPlayerIds = new Set(
    multipleMemberFamilies.flatMap(([_, members]) => members.map(m => m.id))
  );
  const individualPlayers = sessionPlayers.filter(p => !multipleMemberFamilyPlayerIds.has(p.id));

  return (
    <div className="bg-white border border-slate-100 hover:border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition duration-200">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
              {s.expenseType || 'Court Rental'}
            </span>
            <span className="text-slate-500 text-xs font-semibold flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {dateStr}
            </span>
          </div>
          {s.comment && (
            <p className="text-slate-600 text-xs mt-2 italic flex items-start gap-1">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <span>"{s.comment}"</span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
          <div className="text-right">
            <div className="text-slate-900 font-extrabold text-base flex items-center justify-end">
              <DollarSign className="w-4 h-4 text-slate-400 -mr-0.5" />
              {s.courtFee.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              Total Fee
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onStartEdit(s)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(s.id)}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4">
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Paid By</span>
          <span className="text-xs font-bold text-slate-800">{payer ? payer.name : `Payer #${s.paidById}`}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Head Count</span>
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            {count} Attendees
          </span>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Individual Share</span>
          {individualPlayers.length > 0 ? (
            <div className="mt-1 space-y-1">
              {individualPlayers.map(p => (
                <div key={p.id} className="text-xs font-semibold text-slate-700">
                  {p.name}: <span className="text-emerald-600 font-extrabold">${costEach.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-400 italic block mt-1">Included in Family Share</span>
          )}
        </div>
      </div>

      {multipleMemberFamilies.length > 0 && (
        <div className="mt-3.5 p-3.5 bg-indigo-50/40 border border-indigo-100/40 rounded-2xl">
          <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <span>👨‍👩‍👧‍👦 Family Share (Multiple Members)</span>
          </div>
          <div className="space-y-1.5">
            {multipleMemberFamilies.map(([famName, members]) => {
              const famShare = members.length * costEach;
              return (
                <div key={famName} className="flex justify-between items-center text-xs text-slate-700">
                  <span className="font-medium">
                    <span className="font-semibold text-slate-800">{famName}</span> ({members.map(m => m.name).join(', ')})
                  </span>
                  <span className="font-bold text-indigo-600 bg-indigo-50 border border-indigo-100/60 px-2.5 py-0.5 rounded-lg shrink-0">
                    ${famShare.toFixed(2)} total ({members.length} members)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grouped & Collapsible Attendees inside history card */}
      <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Attendees (Grouped)
        </div>

        {/* Adults collapsible */}
        <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/30">
          <button
            type="button"
            onClick={() => setCardAdultsExpanded(!cardAdultsExpanded)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none transition"
          >
            <span className="flex items-center gap-1.5">
              🧑 Adults ({cardAdultAttendees.length})
            </span>
            <span className="text-slate-400">
              {cardAdultsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </span>
          </button>
          {cardAdultsExpanded && (
            <div className="p-2 flex flex-wrap gap-1 bg-white border-t border-slate-100">
              {cardAdultAttendees.map((att) => (
                <span key={att.id} className="text-[10px] font-semibold bg-slate-50 border border-slate-200/50 text-slate-600 px-2 py-0.5 rounded-full">
                  {att.name} {att.family && <span className="text-[9px] text-slate-400 font-normal">({att.family})</span>}
                </span>
              ))}
              {cardAdultAttendees.length === 0 && (
                <span className="text-[10px] text-slate-400 italic">No adults attended</span>
              )}
            </div>
          )}
        </div>

        {/* Kids collapsible */}
        <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/30">
          <button
            type="button"
            onClick={() => setCardKidsExpanded(!cardKidsExpanded)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none transition"
          >
            <span className="flex items-center gap-1.5">
              🧒 Kids ({cardKidAttendees.length})
            </span>
            <span className="text-slate-400">
              {cardKidsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </span>
          </button>
          {cardKidsExpanded && (
            <div className="p-2 flex flex-wrap gap-1 bg-white border-t border-slate-100">
              {cardKidAttendees.map((att) => (
                <span key={att.id} className="text-[10px] font-semibold bg-amber-50/40 border border-amber-100/60 text-amber-800 px-2 py-0.5 rounded-full">
                  {att.name} {att.family && <span className="text-[9px] text-slate-400 font-normal">({att.family})</span>}
                </span>
              ))}
              {cardKidAttendees.length === 0 && (
                <span className="text-[10px] text-slate-400 italic">No kids attended</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
