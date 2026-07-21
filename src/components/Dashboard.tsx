import React, { useState } from 'react';
import { Player, Quarter, Session } from '../types';
import { DollarSign, Calendar, Users, TrendingUp, RefreshCw, ArrowRight, Wallet, Receipt } from 'lucide-react';

interface DashboardProps {
  sessions: Session[];
  quarters: Quarter[];
  players: Player[];
}

export default function Dashboard({ sessions, quarters, players }: DashboardProps) {
  const [selectedQuarter, setSelectedQuarter] = useState<number>(
    quarters.length > 0 ? quarters[0].id : 0
  );

  React.useEffect(() => {
    if (quarters.length > 0 && !selectedQuarter) {
      setSelectedQuarter(quarters[0].id);
    }
  }, [quarters]);

  // Filter sessions for selected quarter
  const qSessions = sessions.filter((s) => s.quarterId === selectedQuarter);

  // Compute metrics
  const totalExpenses = qSessions.reduce((acc, curr) => acc + curr.courtFee, 0);
  const totalSessionsCount = qSessions.length;
  
  // Players attending in this quarter
  const activeAttendeesSet = new Set<number>();
  qSessions.forEach((s) => s.attendeeIds.forEach((id) => activeAttendeesSet.add(id)));
  const uniqueAttendeesCount = activeAttendeesSet.size;

  // Compute Player Ledger
  const ledger: {
    [playerId: number]: {
      player: Player;
      totalPaid: number;
      totalShare: number;
      netBalance: number;
    };
  } = {};

  // Initialize
  players.forEach((p) => {
    ledger[p.id] = {
      player: p,
      totalPaid: 0,
      totalShare: 0,
      netBalance: 0,
    };
  });

  // Calculate payments and split shares
  qSessions.forEach((s) => {
    // 1. Add payment
    if (ledger[s.paidById]) {
      ledger[s.paidById].totalPaid += s.courtFee;
    }

    // 2. Add split shares
    const count = s.attendeeIds.length;
    if (count > 0) {
      const share = s.courtFee / count;
      s.attendeeIds.forEach((id) => {
        if (ledger[id]) {
          ledger[id].totalShare += share;
        }
      });
    }
  });

  // Calculate Net Balances
  const ledgerList = Object.values(ledger).map((item) => {
    const net = item.totalPaid - item.totalShare;
    return {
      ...item,
      netBalance: Number(net.toFixed(2)),
      totalPaid: Number(item.totalPaid.toFixed(2)),
      totalShare: Number(item.totalShare.toFixed(2)),
    };
  });

  // Filter out players who had no participation in this quarter
  const activeLedger = ledgerList.filter(
    (item) => item.totalPaid > 0 || item.totalShare > 0
  );

  // Settle Balances Algorithm (Debt Simplification) with Family Grouping
  const calculateSettlements = () => {
    const entityBalances: { [key: string]: number } = {};

    activeLedger.forEach((item) => {
      const entityName = item.player.family?.trim() || item.player.name;
      entityBalances[entityName] = (entityBalances[entityName] || 0) + item.netBalance;
    });

    const debtors: { name: string; amount: number }[] = [];
    const creditors: { name: string; amount: number }[] = [];

    Object.entries(entityBalances).forEach(([name, balance]) => {
      if (balance < -0.01) {
        debtors.push({ name, amount: Math.abs(balance) });
      } else if (balance > 0.01) {
        creditors.push({ name, amount: balance });
      }
    });

    // Sort to prioritize large amounts
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements: { from: string; to: string; amount: number }[] = [];

    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const payment = Math.min(debtor.amount, creditor.amount);

      if (payment > 0.01) {
        settlements.push({
          from: debtor.name,
          to: creditor.name,
          amount: Number(payment.toFixed(2)),
        });
      }

      debtor.amount -= payment;
      creditor.amount -= payment;

      if (debtor.amount <= 0.01) dIdx++;
      if (creditor.amount <= 0.01) cIdx++;
    }

    return settlements;
  };

  const settlements = calculateSettlements();

  return (
    <div className="space-y-6">
      {/* Compact Quarter Selector */}
      {quarters.length > 0 && (
        <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Quarter</span>
          <select
            value={selectedQuarter}
            onChange={(e) => setSelectedQuarter(Number(e.target.value))}
            className="px-3 py-1.5 border border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none focus:border-emerald-500 transition cursor-pointer bg-white shadow-sm"
            id="select-d-filter"
          >
            {quarters.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm flex items-center gap-4">
          <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-2xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider">Total Court Fees</span>
            <span className="font-black text-2xl text-slate-800">${totalExpenses.toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm flex items-center gap-4">
          <div className="bg-amber-50 text-amber-600 p-3.5 rounded-2xl">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider">Sessions Logged</span>
            <span className="font-black text-2xl text-slate-800">{totalSessionsCount} sessions</span>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm flex items-center gap-4">
          <div className="bg-indigo-50 text-indigo-600 p-3.5 rounded-2xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider">Active Attendees</span>
            <span className="font-black text-2xl text-slate-800">{uniqueAttendeesCount} players</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
        {/* Peer Settlement Plan */}
        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 mb-1">
          <Wallet className="text-emerald-600 w-5 h-5" />
          Settlement Guide
        </h3>
        <p className="text-slate-500 text-xs mb-4">
          Optimized, peer-to-peer payout transactions to bring everyone's dues back to $0.
        </p>

        {settlements.length === 0 ? (
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 text-center">
            <span className="text-2xl">🎉</span>
            <p className="text-emerald-800 font-bold text-xs mt-2">All balances settled!</p>
            <p className="text-emerald-600 text-[10px] mt-0.5">Either no expenses were logged or everyone paid exactly their share.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {settlements.map((s, idx) => (
              <div key={idx} className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-bold text-slate-800">{s.from}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-bold text-slate-800">{s.to}</span>
                  </div>
                  <span className="block text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Payer to Payee</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-black text-emerald-600 text-base font-mono">${s.amount.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
