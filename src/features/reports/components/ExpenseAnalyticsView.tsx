import React from 'react';
import { TrendingDown, Activity, DollarSign, Clock, ShieldAlert } from 'lucide-react';
import { isVoidStatus } from '../../../lib/utils';

interface ExpenseAnalyticsViewProps {
  expenseAnalyticsSummary: {
    total: number;
    avg: number;
    largest: number;
    count: number;
  };
  categoryExpensesReport: any[];
  vendorExpensesReport: any[];
  dateWiseExpensesReport: any[];
  cashImpactAnalysis: {
    cashOpex: number;
    nonCashOpex: number;
  };
  totalExpensesAmt: number;
  filteredExpensesList: any[];
  expenses: any[];
}

export const ExpenseAnalyticsView: React.FC<ExpenseAnalyticsViewProps> = ({
  expenseAnalyticsSummary,
  categoryExpensesReport,
  vendorExpensesReport,
  dateWiseExpensesReport,
  cashImpactAnalysis,
  totalExpensesAmt,
  filteredExpensesList,
  expenses,
}) => {
  return (
    <div className="space-y-6 font-sans print:space-y-4">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Reconciled Expense */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white flex flex-col justify-between shadow-sm min-h-[120px]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Active Outflow</span>
            <TrendingDown className="h-4.5 w-4.5 text-rose-400" />
          </div>
          <div>
            <h3 className="text-xl xs:text-2xl font-black font-mono leading-none pt-2">
              ${expenseAnalyticsSummary.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-[10px] text-slate-400 mt-1">Reconciled in selected date range</p>
          </div>
        </div>

        {/* Average Outflow Value */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs min-h-[120px]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Average Tx Outflow</span>
            <Activity className="h-4.5 w-4.5 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-xl xs:text-2xl font-black text-slate-900 font-mono leading-none pt-2">
              ${expenseAnalyticsSummary.avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-[10px] text-slate-400 mt-1">Weighted transaction average</p>
          </div>
        </div>

        {/* Peak Operating Outflow */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs min-h-[120px]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Largest Single Outflow</span>
            <DollarSign className="h-4.5 w-4.5 text-emerald-500" />
          </div>
          <div>
            <h3 className="text-xl xs:text-2xl font-black text-slate-900 font-mono leading-none pt-2">
              ${expenseAnalyticsSummary.largest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-[10px] text-slate-400 mt-1">Peak single transaction value</p>
          </div>
        </div>

        {/* Transaction Volume */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs min-h-[120px]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Transaction Volume</span>
            <Clock className="h-4.5 w-4.5 text-amber-500" />
          </div>
          <div>
            <h3 className="text-xl xs:text-2xl font-black text-slate-900 font-mono leading-none pt-2">
              {expenseAnalyticsSummary.count} Active Tx
            </h3>
            <p className="text-[10px] text-slate-400 mt-1">GAAP-compliant audit records</p>
          </div>
        </div>
      </div>

      {/* Bento Grid: Categories & Vendors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category-wise bento card */}
        <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Category-wise Operating Expenses</h4>
              <p className="text-[11px] text-slate-400">Proportional budget utilization</p>
            </div>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
              Budget Breakdown
            </span>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {categoryExpensesReport.length === 0 ? (
              <p className="text-xs text-slate-400 py-12 text-center font-semibold">No category metrics calculated</p>
            ) : (
              categoryExpensesReport.map((cat, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">{cat.category}</span>
                    <span className="font-mono font-bold text-slate-900">
                      ${cat.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="text-slate-400 font-normal text-[10px] ml-1.5">({cat.count} Tx, {cat.percentage.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 to-rose-500 h-full rounded-full"
                      style={{ width: `${cat.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Vendor-wise bento card */}
        <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Creditor & Vendor Concentration</h4>
              <p className="text-[11px] text-slate-400">Concentration of active business liabilities</p>
            </div>
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
              Vendor Stats
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="pb-2">Vendor</th>
                  <th className="pb-2 text-center">Tx Count</th>
                  <th className="pb-2 text-right">Average</th>
                  <th className="pb-2 text-right">Total Outflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {vendorExpensesReport.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400 font-semibold">No vendor metrics logged</td>
                  </tr>
                ) : (
                  vendorExpensesReport.slice(0, 6).map((v, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2.5 font-bold text-slate-700">{v.vendor}</td>
                      <td className="py-2.5 text-center font-mono text-slate-600">{v.count}</td>
                      <td className="py-2.5 text-right font-mono text-slate-600">${v.avg.toFixed(2)}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-rose-600">${v.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bento Grid: Temporal Distribution & Financial Impact Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Temporal distribution */}
        <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Temporal Period Distribution</h4>
              <p className="text-[11px] text-slate-400">Total operational spend classified by chronological cycles</p>
            </div>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
              Time Periods
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {dateWiseExpensesReport.map((item, idx) => (
              <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.period}</span>
                <div>
                  <h5 className="text-sm xs:text-base font-black font-mono text-slate-800 pt-1">
                    ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h5>
                  <span className="text-[9px] text-slate-400 line-clamp-1 block leading-tight mt-0.5">{item.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Operating Impact & Cash flow Analysis */}
        <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Financial Impact & Liquidity Analysis</h4>
              <p className="text-[11px] text-slate-400">Nett cash flow drainage vs non-cash accrued obligations</p>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              GAAP Impact
            </span>
          </div>

          <div className="space-y-4 font-sans text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-emerald-100 bg-emerald-50/20">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block">Cash Settle Outflow</span>
                <h4 className="text-lg font-black text-emerald-700 font-mono mt-1">
                  ${cashImpactAnalysis.cashOpex.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </h4>
                <p className="text-[9px] text-emerald-600 mt-1">Cash, Transfer, Cashier, Petty cash</p>
              </div>

              <div className="p-4 rounded-2xl border border-rose-100 bg-rose-50/20">
                <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest block">Deferred Credit Opex</span>
                <h4 className="text-lg font-black text-rose-700 font-mono mt-1">
                  ${cashImpactAnalysis.nonCashOpex.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </h4>
                <p className="text-[9px] text-rose-600 mt-1">Credit, Deferred, Accrued, Accounts Payable</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-slate-700 block">Total OpEx to Net Margin Impact</span>
                <p className="text-[10px] text-slate-400">Aggregate impact of operating costs on gross trading yields</p>
              </div>
              <span className="font-mono font-black text-rose-600 text-sm bg-rose-50 border border-rose-100 px-3 py-1 rounded-lg">
                -${totalExpensesAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Line-item Transaction Log */}
      <div className="bg-white border border-slate-200 rounded-[2rem] shadow-2xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Line-item Operating Ledger Log</h4>
            <p className="text-[11px] text-slate-400">Reconciled line-items for audit and internal controls</p>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            Showing {filteredExpensesList.length} of {expenses.length} records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-5 whitespace-nowrap">Tx ID / Date</th>
                <th className="py-3 px-5 whitespace-nowrap">Category</th>
                <th className="py-3 px-5 whitespace-nowrap">Vendor / Payee</th>
                <th className="py-3 px-5 whitespace-nowrap">Payment Method</th>
                <th className="py-3 px-5 whitespace-nowrap text-center">Status</th>
                <th className="py-3 px-5 whitespace-nowrap text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpensesList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-semibold">
                    No operating expense lines match the filters
                  </td>
                </tr>
              ) : (
                filteredExpensesList.map((item) => {
                  const isVoid = isVoidStatus(item.status);
                  return (
                    <tr key={item.id} className={`hover:bg-slate-50/50 transition duration-150 ${isVoid ? 'bg-slate-50/30 opacity-70' : ''}`}>
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <span className="font-mono font-bold text-indigo-600 block">{(item.id || '').substring(0, 8).toUpperCase()}</span>
                        <span className="text-[10px] text-slate-400 font-semibold">{item.expenseDate ? item.expenseDate.split('T')[0] : 'N/A'}</span>
                      </td>
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <span className="font-bold text-slate-800">{item.category}</span>
                        {item.description && <span className="text-[10px] text-slate-400 block max-w-xs truncate">{item.description}</span>}
                      </td>
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <span className="font-bold text-slate-700 block">{item.vendorName || 'N/A'}</span>
                        <span className="text-[10px] text-slate-400">Employee: {item.employeeName || 'N/A'}</span>
                      </td>
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <span className="font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-wide">{item.paymentMethod || 'Cash'}</span>
                      </td>
                      <td className="py-3.5 px-5 whitespace-nowrap text-center">
                        {isVoid ? (
                          <span className="inline-flex items-center gap-1 bg-red-50 border border-red-100 text-red-700 px-2.5 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wide">
                            <ShieldAlert className="w-3 h-3 text-red-500" /> Voided (0.00 Impact)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wide">
                            Active
                          </span>
                        )}
                      </td>
                      <td className={`py-3.5 px-5 whitespace-nowrap text-right font-mono font-bold text-sm ${isVoid ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                        ${Number(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
