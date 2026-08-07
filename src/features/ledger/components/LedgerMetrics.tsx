import React from 'react';
import { TrendingUp, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../../utils/currencyFormatter';

interface LedgerMetricsProps {
  activeSegment: 'customers' | 'suppliers';
  loading: boolean;
  totalCustomerPaidThisMonth: number;
  totalSupplierPaidThisMonth: number;
  totalOutstandingCustomerDebt: number;
  totalOutstandingSupplierDebt: number;
  registeredCount: number;
  inDebtCount: number;
}

export default function LedgerMetrics({
  activeSegment,
  loading,
  totalCustomerPaidThisMonth,
  totalSupplierPaidThisMonth,
  totalOutstandingCustomerDebt,
  totalOutstandingSupplierDebt,
  registeredCount,
  inDebtCount
}: LedgerMetricsProps) {
  return (
    <div id="ledger-metrics-grid" className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      {/* Metric 1: Payments recorded this month */}
      <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              {activeSegment === 'customers' ? 'Inward Paid (Mtd)' : 'Outward Settled (Mtd)'}
            </span>
            <div className="p-1 px-2.5 rounded-full text-[10px] font-extrabold bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center gap-1">
              Current Month <ChevronRight className="h-2.5 w-2.5" />
            </div>
          </div>
          {loading ? (
            <div className="h-9 w-24 bg-slate-100 rounded-lg animate-pulse mt-2"></div>
          ) : (
            <p className="text-3xl font-bold tracking-tight text-slate-900 mt-2 flex items-baseline gap-1">
              {formatCurrency(activeSegment === 'customers' ? totalCustomerPaidThisMonth : totalSupplierPaidThisMonth)}
            </p>
          )}
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
          Total ledger volume logged since {new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Metric 2: Remaining Ledger Debt Owed */}
      <div className="bg-amber-50/60 rounded-[2rem] p-6 sm:p-8 border border-amber-100 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest leading-none">
              {activeSegment === 'customers' ? 'Outstanding Receivable' : 'Outstanding Trade Payable'}
            </span>
            <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          </div>
          {loading ? (
            <div className="h-9 w-28 bg-amber-200/30 rounded-lg animate-pulse mt-2"></div>
          ) : (
            <p className="text-3xl font-bold tracking-tight text-amber-950 mt-2">
              {formatCurrency(activeSegment === 'customers' ? totalOutstandingCustomerDebt : totalOutstandingSupplierDebt)}
            </p>
          )}
        </div>
        <div className="mt-4 pt-3 border-t border-amber-200/50 text-[11px] text-amber-700/90 font-medium">
          {activeSegment === 'customers' 
            ? 'Aggregate credit balances pending client collection' 
            : 'Our open commercial liabilities requiring trade settlement'}
        </div>
      </div>

      {/* Metric 3: Active Ledgers Account Metric */}
      <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Account distribution</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase leading-none">Registered</p>
              {loading ? (
                <div className="h-7 w-8 bg-slate-100 rounded-lg animate-pulse mt-1"></div>
              ) : (
                <p className="text-xl font-bold text-slate-800 mt-1">{registeredCount}</p>
              )}
            </div>
            <div className="border-l border-slate-100 pl-4">
              <p className="text-[10px] text-slate-400 font-bold uppercase leading-none">In Debt</p>
              {loading ? (
                <div className="h-7 w-8 bg-slate-100 rounded-lg animate-pulse mt-1"></div>
              ) : (
                <p className="text-xl font-bold text-amber-700 mt-1">{inDebtCount}</p>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
          Accounts with pending balances
        </div>
      </div>
    </div>
  );
}
