import React, { useState } from 'react';
import { Player } from '../types';
import { Plus, Edit2, Trash2, Check, X, Users, CheckCircle, XCircle } from 'lucide-react';

interface PlayerListProps {
  players: Player[];
  onAdd: (p: Omit<Player, 'id'>) => void;
  onUpdate: (p: Player) => void;
  onDelete: (id: number) => void;
}

export default function PlayerList({ players, onAdd, onUpdate, onDelete }: PlayerListProps) {
  const [name, setName] = useState('');
  const [family, setFamily] = useState('');
  const [category, setCategory] = useState<'Adult' | 'Kid'>('Adult');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editFamily, setEditFamily] = useState('');
  const [editCategory, setEditCategory] = useState<'Adult' | 'Kid'>('Adult');
  const [showEditSuggestions, setShowEditSuggestions] = useState(false);

  const existingFamilies = Array.from(
    new Set(players.map((p) => p.family?.trim()).filter((f): f is string => !!f))
  ).sort();

  const filteredFamilies = existingFamilies.filter(fam =>
    fam.toLowerCase().includes(family.toLowerCase())
  );

  const filteredEditFamilies = existingFamilies.filter(fam =>
    fam.toLowerCase().includes(editFamily.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name, tier: 'Standard', groups: [], isActive: true, family, category });
    setName('');
    setFamily('');
    setCategory('Adult');
  };

  const startEdit = (p: Player) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditFamily(p.family || '');
    setEditCategory(p.category || 'Adult');
  };

  const handleSaveEdit = (id: number) => {
    if (!editName.trim()) return;
    const existingPlayer = players.find((p) => p.id === id);
    onUpdate({
      id,
      name: editName,
      tier: existingPlayer?.tier || 'Standard',
      groups: existingPlayer?.groups || [],
      isActive: existingPlayer?.isActive !== undefined ? existingPlayer.isActive : true,
      family: editFamily,
      category: editCategory,
    });
    setEditingId(null);
  };

  const toggleActiveStatus = (p: Player) => {
    onUpdate({ ...p, isActive: !p.isActive });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Add Player Form */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm h-fit">
        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 mb-1">
          <Users className="text-emerald-600 w-5 h-5" />
          Register Player
        </h3>
        <p className="text-slate-500 text-xs mb-4 leading-relaxed">
          Add members of your badminton club. You can optionally link them to a family unit for clear group tracking.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-700 text-xs font-semibold mb-1" id="lbl-p-name">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              id="input-p-name"
            />
          </div>

          <div className="relative">
            <label className="block text-slate-700 text-xs font-semibold mb-1" id="lbl-p-family">Family Unit (Optional)</label>
            <input
              type="text"
              value={family}
              onChange={(e) => {
                setFamily(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              placeholder="e.g. Ramesh Family"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              id="input-p-family"
              autoComplete="off"
            />
            {showSuggestions && filteredFamilies.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto" id="dropdown-p-family">
                {filteredFamilies.map((fam) => (
                  <button
                    key={fam}
                    type="button"
                    onMouseDown={() => {
                      setFamily(fam);
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 font-medium transition first:rounded-t-xl last:rounded-b-xl"
                  >
                    👨‍👩‍👧‍👦 {fam}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-slate-700 text-xs font-semibold mb-1" id="lbl-p-category">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as 'Adult' | 'Kid')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition bg-white"
              id="input-p-category"
            >
              <option value="Adult">Adult</option>
              <option value="Kid">Kid</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm shadow-sm shadow-emerald-100 transition flex items-center justify-center gap-2"
            id="btn-add-player"
          >
            <Plus className="w-4 h-4" />
            Add Player
          </button>
        </form>
      </div>

      {/* Players List */}
      <div className="lg:col-span-2 space-y-4">
        {players.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-3xl p-8 text-center shadow-sm">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-semibold text-sm">No players registered yet</p>
            <p className="text-slate-400 text-xs mt-1">Register your first player using the form on the left.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Family Unit</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {players.map((p) => {
                    const isEditing = editingId === p.id;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition">
                        {isEditing ? (
                          <td colSpan={5} className="px-6 py-4">
                            <div className="space-y-3 w-full">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-slate-400">Name</label>
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full px-2 py-1 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-slate-400">Category</label>
                                  <select
                                    value={editCategory}
                                    onChange={(e) => setEditCategory(e.target.value as 'Adult' | 'Kid')}
                                    className="w-full px-2 py-1 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none bg-white"
                                  >
                                    <option value="Adult">Adult</option>
                                    <option value="Kid">Kid</option>
                                  </select>
                                </div>
                                <div className="relative">
                                  <label className="block text-[10px] font-bold uppercase text-slate-400">Family Unit</label>
                                  <input
                                    type="text"
                                    value={editFamily}
                                    onChange={(e) => {
                                      setEditFamily(e.target.value);
                                      setShowEditSuggestions(true);
                                    }}
                                    onFocus={() => setShowEditSuggestions(true)}
                                    onBlur={() => {
                                      setTimeout(() => setShowEditSuggestions(false), 200);
                                    }}
                                    className="w-full px-2 py-1 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none"
                                    autoComplete="off"
                                  />
                                  {showEditSuggestions && filteredEditFamilies.length > 0 && (
                                    <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-32 overflow-y-auto" id="dropdown-edit-family">
                                      {filteredEditFamilies.map((fam) => (
                                        <button
                                          key={fam}
                                          type="button"
                                          onMouseDown={() => {
                                            setEditFamily(fam);
                                            setShowEditSuggestions(false);
                                          }}
                                          className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 font-medium transition first:rounded-t-lg last:rounded-b-lg"
                                        >
                                          👨‍👩‍👧‍👦 {fam}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-50">
                                <button
                                  onClick={() => handleSaveEdit(p.id)}
                                  className="px-3 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg font-semibold text-xs transition"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="px-3 py-1 bg-slate-50 text-slate-500 hover:bg-slate-100 rounded-lg font-semibold text-xs transition"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="px-6 py-4 font-bold text-slate-800">{p.name}</td>
                            <td className="px-6 py-4">
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-xl border ${
                                p.category === 'Kid'
                                  ? 'bg-amber-50 text-amber-700 border-amber-100'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                              }`}>
                                {p.category || 'Adult'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {p.family ? (
                                <span className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200/50 px-2.5 py-1 rounded-xl inline-flex items-center gap-1">
                                  👨‍👩‍👧‍👦 {p.family}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs italic">Individual</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => toggleActiveStatus(p)}
                                className="inline-flex items-center gap-1 text-xs font-medium cursor-pointer"
                              >
                                {p.isActive ? (
                                  <span className="inline-flex items-center text-emerald-700 font-semibold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full text-xs">
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mr-1" /> Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-slate-500 font-semibold bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full text-xs">
                                    <XCircle className="w-3.5 h-3.5 text-slate-400 mr-1" /> Inactive
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => startEdit(p)}
                                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => onDelete(p.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
