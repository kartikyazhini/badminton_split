import React, { useState } from 'react';
import { Quarter } from '../types';
import { Plus, Calendar, Edit2, Trash2, Check, X, FolderKanban } from 'lucide-react';

interface QuarterListProps {
  quarters: Quarter[];
  onAdd: (q: Omit<Quarter, 'id'>) => void;
  onUpdate: (q: Quarter) => void;
  onDelete: (id: number) => void;
}

export default function QuarterList({ quarters, onAdd, onUpdate, onDelete }: QuarterListProps) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name, startDate, endDate });
    setName('');
    setStartDate('');
    setEndDate('');
  };

  const startEdit = (q: Quarter) => {
    setEditingId(q.id);
    setEditName(q.name);
    setEditStartDate(q.startDate);
    setEditEndDate(q.endDate);
  };

  const handleSaveEdit = (id: number) => {
    if (!editName.trim()) return;
    onUpdate({ id, name: editName, startDate: editStartDate, endDate: editEndDate });
    setEditingId(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Add Quarter Form */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm h-fit">
        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 mb-1">
          <FolderKanban className="text-emerald-600 w-5 h-5" />
          Create Quarter
        </h3>
        <p className="text-slate-500 text-xs mb-4 leading-relaxed">
          Quarters help organize player sheets and sessions. Sessions are automatically categorized under their corresponding quarter.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-700 text-xs font-semibold mb-1" id="lbl-q-name">Quarter Title / Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q2 2026 Badminton"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              id="input-q-name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 text-xs font-semibold mb-1" id="lbl-q-start">Start Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                id="input-q-start"
              />
            </div>
            <div>
              <label className="block text-slate-700 text-xs font-semibold mb-1" id="lbl-q-end">End Date</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                id="input-q-end"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm shadow-sm shadow-emerald-100 transition flex items-center justify-center gap-2"
            id="btn-add-quarter"
          >
            <Plus className="w-4 h-4" />
            Add Quarter
          </button>
        </form>
      </div>

      {/* Quarters List */}
      <div className="lg:col-span-2 space-y-4">
        {quarters.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-3xl p-8 text-center shadow-sm">
            <FolderKanban className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-semibold text-sm">No quarters configured yet</p>
            <p className="text-slate-400 text-xs mt-1">Add your first badminton quarter using the form on the left.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quarters.map((q) => {
              const isEditing = editingId === q.id;
              return (
                <div key={q.id} className="bg-white border border-slate-100 hover:border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition duration-200 flex flex-col justify-between">
                  {isEditing ? (
                    <div className="space-y-3 w-full">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={editStartDate}
                          onChange={(e) => setEditStartDate(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none"
                        />
                        <input
                          type="date"
                          value={editEndDate}
                          onChange={(e) => setEditEndDate(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => handleSaveEdit(q.id)}
                          className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 bg-slate-50 text-slate-500 hover:bg-slate-100 rounded-lg transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-slate-800 text-base leading-snug">{q.name}</h4>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => startEdit(q)}
                              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDelete(q.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-slate-500 text-xs mt-3 bg-slate-50/50 px-3 py-1.5 rounded-xl w-fit">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {q.startDate ? (() => {
                              const parts = q.startDate.split('-');
                              if (parts.length !== 3) return q.startDate;
                              return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
                            })() : 'No start date'}
                            {' - '}
                            {q.endDate ? (() => {
                              const parts = q.endDate.split('-');
                              if (parts.length !== 3) return q.endDate;
                              return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
                            })() : 'No end date'}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
