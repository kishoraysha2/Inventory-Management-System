import React from 'react';
import { Info } from 'lucide-react';
import { formatCurrency } from '../../../utils/currencyFormatter';

interface ProfitLossViewProps {
  financialStatements: {
    revenueAccounts: any[];
    totalRevenue: number;
    cogsAccounts: any[];
    totalCogs: number;
    grossProfit: number;
    opexAccounts: any[];
    totalOpex: number;
    operatingProfit: number;
    taxAccounts: any[];
    totalTax: number;
    netProfitAfterTax: number;
  };
  tbCompanyFilter: string;
  setTbCompanyFilter: (val: string) => void;
  tbBranchFilter: string;
  setTbBranchFilter: (val: string) => void;
  tbPostingStatusFilter: string;
  setTbPostingStatusFilter: (val: string) => void;
}

export const ProfitLossView: React.FC<ProfitLossViewProps> = ({
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

      <div className="flex items-center gap-2 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-indigo-700 text-xs font-semibold">
        <Info className="h-4 w-4 text-indigo-500 shrink-0" />
        <span>Real-time IFRS/GAAP compliant Profit & Loss Statement backed by General Ledger posting lines. Includes active and legacy account balances.</span>
      </div>

      {/* Profit & Loss Statement Table */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-3xs">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Account Description</th>
              <th className="px-4 py-3 text-right">Account Code</th>
              <th className="px-4 py-3 text-right">Debit Balance ($)</th>
              <th className="px-4 py-3 text-right">Credit Balance ($)</th>
              <th className="px-4 py-3 text-right">Net Amount ($)</th>
            </tr>
          </thead>
          <tbody>
            {/* 1. Revenues */}
            <tr className="bg-slate-100/80 font-black text-slate-800">
              <td colSpan={5} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">1. Operating Revenues</td>
            </tr>
            {financialStatements.revenueAccounts.map((acc, index) => (
              <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/50 font-medium">
                <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                  <span>{acc.name}</span>
                  {acc.isLegacy && (
                    <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-400 font-bold">0.00</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-900">{formatCurrency(acc.balance)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600">+{formatCurrency(acc.balance)}</td>
              </tr>
            ))}
            {financialStatements.revenueAccounts.length === 0 && (
              <tr className="border-b border-slate-100"><td colSpan={5} className="px-4 py-3 text-center text-slate-400">No operating revenue entries recorded in this range.</td></tr>
            )}
            <tr className="border-b border-slate-200 bg-slate-50/50 font-bold">
              <td colSpan={4} className="px-4 py-3 text-slate-700">Subtotal Operating Revenues:</td>
              <td className="px-4 py-3 text-right font-mono font-black text-emerald-600 underline">{formatCurrency(financialStatements.totalRevenue)}</td>
            </tr>

            {/* 2. COGS */}
            <tr className="bg-slate-100/80 font-black text-slate-800">
              <td colSpan={5} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">2. Cost of Sales / Cost of Goods Sold</td>
            </tr>
            {financialStatements.cogsAccounts.map((acc, index) => (
              <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/50 font-medium">
                <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                  <span>{acc.name}</span>
                  {acc.isLegacy && (
                    <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-900">{formatCurrency(acc.balance)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-400 font-bold">0.00</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">-{formatCurrency(acc.balance)}</td>
              </tr>
            ))}
            {financialStatements.cogsAccounts.length === 0 && (
              <tr className="border-b border-slate-100"><td colSpan={5} className="px-4 py-3 text-center text-slate-400">No cost of goods sold entries recorded.</td></tr>
            )}
            <tr className="border-b border-slate-200 bg-slate-50/50 font-bold">
              <td colSpan={4} className="px-4 py-3 text-slate-700">Subtotal Cost of Goods Sold:</td>
              <td className="px-4 py-3 text-right font-mono font-black text-rose-600 underline">-{formatCurrency(financialStatements.totalCogs)}</td>
            </tr>

            {/* 3. Gross Profit */}
            <tr className="bg-indigo-50/40 font-black text-slate-900 border-b-2 border-slate-300">
              <td colSpan={4} className="px-4 py-3.5 text-xs text-indigo-900 uppercase tracking-wider font-extrabold">Gross Profit / Operating Margin:</td>
              <td className="px-4 py-3.5 text-right font-mono text-sm text-emerald-600 font-black">{formatCurrency(financialStatements.grossProfit)}</td>
            </tr>

            {/* 4. OpEx */}
            <tr className="bg-slate-100/80 font-black text-slate-800">
              <td colSpan={5} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">3. General & Administrative Operating Expenses (OpEx)</td>
            </tr>
            {financialStatements.opexAccounts.map((acc, index) => (
              <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/50 font-medium">
                <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                  <span>{acc.name}</span>
                  {acc.isLegacy && (
                    <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-900">{formatCurrency(acc.balance)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-400 font-bold">0.00</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">-{formatCurrency(acc.balance)}</td>
              </tr>
            ))}
            {financialStatements.opexAccounts.length === 0 && (
              <tr className="border-b border-slate-100"><td colSpan={5} className="px-4 py-3 text-center text-slate-400">No general operating expenses recorded.</td></tr>
            )}
            <tr className="border-b border-slate-200 bg-slate-50/50 font-bold">
              <td colSpan={4} className="px-4 py-3 text-slate-700">Subtotal Operating Expenses:</td>
              <td className="px-4 py-3 text-right font-mono font-black text-rose-600 underline">-{formatCurrency(financialStatements.totalOpex)}</td>
            </tr>

            {/* 5. Operating Profit */}
            <tr className="bg-indigo-50/40 font-black text-slate-900 border-b-2 border-slate-300">
              <td colSpan={4} className="px-4 py-3.5 text-xs text-indigo-900 uppercase tracking-wider font-extrabold">Operating Income / Profit (EBIT):</td>
              <td className="px-4 py-3.5 text-right font-mono text-sm text-indigo-600 font-black">{formatCurrency(financialStatements.operatingProfit)}</td>
            </tr>

            {/* 6. Taxes */}
            <tr className="bg-slate-100/80 font-black text-slate-800">
              <td colSpan={5} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">4. Provision for Corporate Income Taxes</td>
            </tr>
            {financialStatements.taxAccounts.map((acc, index) => (
              <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/50 font-medium">
                <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                  <span>{acc.name}</span>
                  {acc.isLegacy && (
                    <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-900">{formatCurrency(acc.balance)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-400 font-bold">0.00</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">-{formatCurrency(acc.balance)}</td>
              </tr>
            ))}
            {financialStatements.taxAccounts.length === 0 && (
              <tr className="border-b border-slate-100"><td colSpan={5} className="px-4 py-3 text-center text-slate-400">No taxation provisions recorded in this range.</td></tr>
            )}
            <tr className="border-b border-slate-200 bg-slate-50/50 font-bold">
              <td colSpan={4} className="px-4 py-3 text-slate-700">Subtotal Income Taxation:</td>
              <td className="px-4 py-3 text-right font-mono font-black text-rose-600 underline">-{formatCurrency(financialStatements.totalTax)}</td>
            </tr>

            {/* 7. Net Profit After Tax */}
            <tr className="bg-slate-950 text-white font-black border-t border-slate-900">
              <td colSpan={4} className="px-4 py-4 text-xs uppercase tracking-widest font-extrabold text-slate-200">GRAND TOTAL NET INCOME / PROFIT (NET PROFIT AFTER TAX):</td>
              <td className="px-4 py-4 text-right font-mono text-base text-emerald-450 font-black underline decoration-double">{formatCurrency(financialStatements.netProfitAfterTax)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
