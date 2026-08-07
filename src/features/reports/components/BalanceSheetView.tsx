import React from 'react';
import { Layers } from 'lucide-react';
import { formatCurrency } from '../../../utils/currencyFormatter';

interface BalanceSheetViewProps {
  financialStatements: {
    isBsBalanced: boolean;
    currentAssetAccounts: any[];
    totalCurrentAssets: number;
    nonCurrentAssetAccounts: any[];
    totalNonCurrentAssets: number;
    totalAssets: number;
    currentLiabilityAccounts: any[];
    totalCurrentLiabilities: number;
    longTermLiabilityAccounts: any[];
    totalLongTermLiabilities: number;
    equityAccounts: any[];
    currentYearEarnings: number;
    totalEquity: number;
    totalLiabilities: number;
  };
  tbCompanyFilter: string;
  setTbCompanyFilter: (val: string) => void;
  tbBranchFilter: string;
  setTbBranchFilter: (val: string) => void;
  tbPostingStatusFilter: string;
  setTbPostingStatusFilter: (val: string) => void;
}

export const BalanceSheetView: React.FC<BalanceSheetViewProps> = ({
  financialStatements,
  tbCompanyFilter,
  setTbCompanyFilter,
  tbBranchFilter,
  setTbBranchFilter,
  tbPostingStatusFilter,
  setTbPostingStatusFilter,
}) => {
  return (
    <div className="p-6 space-y-6">
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reporting Company</label>
          <select
            value={tbCompanyFilter}
            onChange={(e) => setTbCompanyFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
          >
            <option value="">All Registered Companies</option>
            <option value="CO-001">Apex Global Supply Ltd.</option>
            <option value="CO-002">Nexus Innovations Corp.</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Branch Division</label>
          <select
            value={tbBranchFilter}
            onChange={(e) => setTbBranchFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
          >
            <option value="">All Company Divisions</option>
            <option value="BR-HQ">Austin Headquarters (HQ)</option>
            <option value="BR-EAST">New York Distribution</option>
            <option value="BR-WEST">California Logistics</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Journal Postings Filter</label>
          <select
            value={tbPostingStatusFilter}
            onChange={(e) => setTbPostingStatusFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
          >
            <option value="POSTED">Official Posted (General Ledger)</option>
            <option value="DRAFT">Draft Journals (Provisional)</option>
            <option value="">All State Postings</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between p-4 rounded-xl border font-semibold text-xs transition duration-300 bg-white shadow-3xs border-slate-200">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-500" />
          <span className="text-slate-800 font-extrabold uppercase tracking-wide">Balance Equation:</span>
          <span className="text-slate-500">Assets ($) = Liabilities ($) + Equity ($)</span>
        </div>
        <div>
          {financialStatements.isBsBalanced ? (
            <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">● EQUATION BALANCED</span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">● OUT OF BALANCE</span>
          )}
        </div>
      </div>

      {/* Dual Column Assets vs Liabilities & Equity Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        
        {/* LEFT COLUMN: ASSETS */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-3xs">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-teal-700 text-white font-bold text-[10px] uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Asset Account Classification</th>
                <th className="px-4 py-3 text-right">Code</th>
                <th className="px-4 py-3 text-right">Amount ($)</th>
              </tr>
            </thead>
            <tbody>
              {/* Current Assets */}
              <tr className="bg-teal-50/45 font-black text-teal-900 border-b border-teal-100">
                <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">1. Current Assets</td>
              </tr>
              {financialStatements.currentAssetAccounts.map((acc, index) => (
                <tr key={index} className="border-b border-slate-150 hover:bg-slate-50/50 font-medium">
                  <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                    <span>{acc.name}</span>
                    {acc.isLegacy && (
                      <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{formatCurrency(acc.balance)}</td>
                </tr>
              ))}
              {financialStatements.currentAssetAccounts.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-3 text-center text-slate-400">No Current Assets recorded.</td></tr>
              )}
              <tr className="border-b border-slate-200 bg-slate-50/30 font-bold">
                <td colSpan={2} className="px-4 py-2.5 text-slate-650 pl-6">Total Current Assets:</td>
                <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900 underline">{formatCurrency(financialStatements.totalCurrentAssets)}</td>
              </tr>

              {/* Non-Current Assets */}
              <tr className="bg-teal-50/45 font-black text-teal-900 border-b border-teal-100">
                <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">2. Non-Current Assets (Fixed assets, property, equipment)</td>
              </tr>
              {financialStatements.nonCurrentAssetAccounts.map((acc, index) => (
                <tr key={index} className="border-b border-slate-150 hover:bg-slate-50/50 font-medium">
                  <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                    <span>{acc.name}</span>
                    {acc.isLegacy && (
                      <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{formatCurrency(acc.balance)}</td>
                </tr>
              ))}
              {financialStatements.nonCurrentAssetAccounts.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-3 text-center text-slate-400">No Fixed or Long-Term Assets recorded.</td></tr>
              )}
              <tr className="border-b border-slate-250 bg-slate-50/30 font-bold">
                <td colSpan={2} className="px-4 py-2.5 text-slate-650 pl-6">Total Non-Current Assets:</td>
                <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900 underline">{formatCurrency(financialStatements.totalNonCurrentAssets)}</td>
              </tr>

              {/* GRAND TOTAL ASSETS */}
              <tr className="bg-slate-900 text-white font-black border-t border-slate-800">
                <td colSpan={2} className="px-4 py-3.5 text-[10px] uppercase tracking-widest font-black text-slate-200">TOTAL CONSOLIDATED ASSETS:</td>
                <td className="px-4 py-3.5 text-right font-mono text-sm text-white font-black underline decoration-double">{formatCurrency(financialStatements.totalAssets)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* RIGHT COLUMN: LIABILITIES & EQUITY */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-3xs">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800 text-white font-bold text-[10px] uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Liabilities & Equity Classifications</th>
                <th className="px-4 py-3 text-right">Code</th>
                <th className="px-4 py-3 text-right">Amount ($)</th>
              </tr>
            </thead>
            <tbody>
              {/* Current Liabilities */}
              <tr className="bg-slate-100 font-black text-slate-800 border-b border-slate-200">
                <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">1. Current Liabilities</td>
              </tr>
              {financialStatements.currentLiabilityAccounts.map((acc, index) => (
                <tr key={index} className="border-b border-slate-150 hover:bg-slate-50/50 font-medium">
                  <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                    <span>{acc.name}</span>
                    {acc.isLegacy && (
                      <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{formatCurrency(acc.balance)}</td>
                </tr>
              ))}
              {financialStatements.currentLiabilityAccounts.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-3 text-center text-slate-400">No Current Liabilities recorded.</td></tr>
              )}
              <tr className="border-b border-slate-200 bg-slate-50/30 font-bold">
                <td colSpan={2} className="px-4 py-2.5 text-slate-650 pl-6">Total Current Liabilities:</td>
                <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900 underline">{formatCurrency(financialStatements.totalCurrentLiabilities)}</td>
              </tr>

              {/* Long Term Liabilities */}
              <tr className="bg-slate-100 font-black text-slate-800 border-b border-slate-200">
                <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">2. Long-Term Liabilities (Notes, mortgages)</td>
              </tr>
              {financialStatements.longTermLiabilityAccounts.map((acc, index) => (
                <tr key={index} className="border-b border-slate-150 hover:bg-slate-50/50 font-medium">
                  <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                    <span>{acc.name}</span>
                    {acc.isLegacy && (
                      <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{formatCurrency(acc.balance)}</td>
                </tr>
              ))}
              {financialStatements.longTermLiabilityAccounts.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-3 text-center text-slate-400">No Long-Term Liabilities recorded.</td></tr>
              )}
              <tr className="border-b border-slate-250 bg-slate-50/30 font-bold">
                <td colSpan={2} className="px-4 py-2.5 text-slate-650 pl-6">Total Long-Term Liabilities:</td>
                <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900 underline">{formatCurrency(financialStatements.totalLongTermLiabilities)}</td>
              </tr>

              {/* Equity Area */}
              <tr className="bg-slate-100 font-black text-slate-800 border-b border-slate-200">
                <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">3. Shareholders' Equity</td>
              </tr>
              {financialStatements.equityAccounts.map((acc, index) => (
                <tr key={index} className="border-b border-slate-150 hover:bg-slate-50/50 font-medium">
                  <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                    <span>{acc.name}</span>
                    {acc.isLegacy && (
                      <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{formatCurrency(acc.balance)}</td>
                </tr>
              ))}
              {/* Dynamic Current Year Earnings */}
              <tr className="border-b border-slate-150 hover:bg-indigo-50/20 font-medium">
                <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-indigo-900">
                  <span>Retained Earnings (Current Year Net Profit)</span>
                  <span className="text-[8px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-black font-mono">DYNAMIC RECONCILED</span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-400">N/A</td>
                <td className="px-4 py-2.5 text-right font-mono font-black text-emerald-600 font-bold">{formatCurrency(financialStatements.currentYearEarnings)}</td>
              </tr>
              <tr className="border-b border-slate-250 bg-slate-50/30 font-bold">
                <td colSpan={2} className="px-4 py-2.5 text-slate-650 pl-6">Total Shareholders' Equity:</td>
                <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900 underline">{formatCurrency(financialStatements.totalEquity)}</td>
              </tr>

              {/* GRAND TOTAL LIABILITIES & EQUITY */}
              <tr className="bg-slate-850 text-white font-black border-t border-slate-800">
                <td colSpan={2} className="px-4 py-3.5 text-[10px] uppercase tracking-widest font-black text-slate-200">TOTAL LIABILITIES & EQUITY:</td>
                <td className="px-4 py-3.5 text-right font-mono text-sm text-white font-black underline decoration-double">{formatCurrency(financialStatements.totalLiabilities + financialStatements.totalEquity)}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};
