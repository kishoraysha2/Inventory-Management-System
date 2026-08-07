import React from 'react';
import { motion } from 'motion/react';
import { History, PlusCircle, Calendar, FileText } from 'lucide-react';
import { AppPermissions } from '../../../hooks/usePermission';
import { isVoidStatus } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currencyFormatter';

interface PaymentHistoryTableProps {
  activeSegment: 'customers' | 'suppliers';
  loading: boolean;
  activeRecordsCount: number;
  activeRecordSum: number;
  customerPayments: any[];
  supplierPayments: any[];
  filteredCustomerPayments: any[];
  filteredSupplierPayments: any[];
  personFilter: string;
  startDate: string;
  endDate: string;
  permissions: AppPermissions;
  handleResetFilters: () => void;
  handleOpenRecordModal: (personId?: string) => void;
  setSelectedPayment: (p: any) => void;
  setSelectedSupplierPayment: (p: any) => void;
  voidTransaction: (id: string) => void;
}

export default function PaymentHistoryTable({
  activeSegment,
  loading,
  activeRecordsCount,
  activeRecordSum,
  customerPayments,
  supplierPayments,
  filteredCustomerPayments,
  filteredSupplierPayments,
  personFilter,
  startDate,
  endDate,
  permissions,
  handleResetFilters,
  handleOpenRecordModal,
  setSelectedPayment,
  setSelectedSupplierPayment,
  voidTransaction
}: PaymentHistoryTableProps) {
  return (
    <div id="payment-history-table-container" className="bg-white rounded-[2rem] border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
      
      {/* Table Header toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
            <History className="h-4.5 w-4.5 text-slate-400" />
            <span>Settlement Payment History Ledger</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Showing {activeRecordsCount} settlement records ({activeSegment === 'customers' ? 'Inflow' : 'Outflow'} Total: {formatCurrency(activeRecordSum)})
          </p>
        </div>

        {permissions.createPayment && (
          <button
            type="button"
            onClick={() => handleOpenRecordModal()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4.5 py-3 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer"
          >
            <PlusCircle className="h-4 w-4" />
            <span>{activeSegment === 'customers' ? 'Record Customer Pay' : 'Record Supplier Pay'}</span>
          </button>
        )}
      </div>

      {/* List container */}
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="border border-slate-100 rounded-2xl p-4 animate-pulse bg-slate-50/50 flex justify-between h-20"></div>
            ))}
          </div>
        ) : activeRecordsCount === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 12 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.3 }}
            className="mx-auto max-w-md w-full my-8 bg-slate-50/50 border border-slate-200/60 rounded-3xl p-8 text-center flex flex-col items-center gap-4.5 shadow-3xs"
          >
            <div className="relative group">
              <div className="absolute inset-0 bg-indigo-200/20 rounded-full blur-xl group-hover:scale-125 transition duration-300"></div>
              <div className="relative w-16 h-16 bg-white border border-slate-100 rounded-2xl shadow-3xs flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-all duration-300">
                <History className="h-8 w-8 text-slate-400 transition-transform duration-300 group-hover:scale-110" />
              </div>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest leading-none">
                {(activeSegment === 'customers' ? customerPayments : supplierPayments).length === 0 ? 'No Payments Logged' : 'No Payments Identified'}
              </h4>
              <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed font-semibold">
                {(activeSegment === 'customers' ? customerPayments : supplierPayments).length === 0 
                  ? 'Begin recording financial settlements and invoice payments to reconcile customer or supplier balances.'
                  : 'No payment logs matched your actively specified searching filters or date boundaries.'}
              </p>
            </div>
            <div className="flex gap-2.5 pt-1.5 flex-wrap justify-center">
              {(activeSegment === 'customers' ? customerPayments : supplierPayments).length > 0 && (personFilter || startDate || endDate) ? (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="bg-white border border-slate-200 hover:border-slate-350 text-slate-700 font-extrabold text-[11px] uppercase tracking-wider px-5 py-2.5 rounded-xl transition cursor-pointer shadow-3xs"
                >
                  Reset Search Filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleOpenRecordModal()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] uppercase tracking-wider h-10 px-5 rounded-xl transition cursor-pointer shadow-xs hover:shadow-md inline-flex items-center gap-1.5"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Record First Settlement</span>
                </button>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="divide-y divide-slate-100 animate-fade-in">
            {(activeSegment === 'customers' ? filteredCustomerPayments : filteredSupplierPayments).map((p) => {
              const isVoided = isVoidStatus(p.status);
              return (
                <div 
                  key={p.id} 
                  className={`py-4.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group transition ${isVoided ? 'opacity-45 bg-slate-50/70 line-through text-slate-400' : ''}`}
                >
                  {/* Name / Date details */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-950 group-hover:text-indigo-600 transition">
                        {activeSegment === 'customers' 
                          ? p.customerName || 'Anonymous Client'
                          : p.supplierName || 'Anonymous Supplier'}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] bg-slate-50 border border-slate-100 text-slate-400 font-bold rounded-full">
                        ID: {p.id}
                      </span>
                      {activeSegment === 'customers' && p.receiptNumber && (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold rounded-full animate-in fade-in zoom-in-95">
                          Receipt: {p.receiptNumber}
                        </span>
                      )}
                      {activeSegment === 'suppliers' && p.voucherNumber && (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] bg-orange-50 border border-orange-100 text-orange-700 font-extrabold rounded-full animate-in fade-in zoom-in-95">
                          Voucher: {p.voucherNumber}
                        </span>
                      )}
                    </div>

                    {/* Description indicators */}
                    <div className="flex items-center gap-4 text-[11px] text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1 shrink-0">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span>{new Date(p.paymentDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                      </span>

                      {p.notes && (
                        <span className="flex items-center gap-1 truncate max-w-[280px]">
                          <FileText className="h-3.5 w-3.5 text-slate-400" />
                          <span className="truncate italic text-slate-400">"{p.notes}"</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amounts column right */}
                  <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0">
                    <div className="text-left sm:text-right space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none block">Settled Sum</span>
                      <span className={`text-sm font-bold block leading-none ${
                        activeSegment === 'customers' ? 'text-emerald-600' : 'text-indigo-600'
                      }`}>
                        {activeSegment === 'customers' ? '+' : '-'}{formatCurrency(p.amountPaid)}
                      </span>
                    </div>

                    {/* State step progress indicator */}
                    <div className="text-[10px] text-slate-400 border-l border-slate-100 pl-4 space-y-0.5 min-w-[124px]">
                      <div>Owed: <span className="font-bold text-slate-600">{formatCurrency(p.previousDue ?? 0)}</span></div>
                      <div>Rem: <span className="font-bold text-slate-800">{formatCurrency(p.remainingDue ?? 0)}</span></div>
                    </div>

                     {/* Void & Receipt Control */}
                    <div className="border-l border-slate-100 pl-4 flex flex-col items-center justify-center gap-1.5 min-w-[100px]">
                      {isVoided ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shadow-3xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                            Void
                          </span>
                          {activeSegment === 'customers' ? (
                            <button
                              type="button"
                              onClick={() => setSelectedPayment(p)}
                              className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold text-indigo-500 hover:text-white hover:bg-indigo-500 border border-indigo-200 cursor-pointer transition uppercase tracking-wider shadow-3xs"
                            >
                              Receipt
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelectedSupplierPayment(p)}
                              className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold text-orange-500 hover:text-white hover:bg-orange-500 border border-orange-200 cursor-pointer transition uppercase tracking-wider shadow-3xs"
                            >
                              Voucher
                            </button>
                          )}
                        </>
                      ) : (
                      <>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-250/60 text-emerald-700 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shadow-3xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                          Success
                        </span>
                        <div className="flex gap-1 flex-wrap justify-center">
                          {activeSegment === 'customers' ? (
                            <button
                              type="button"
                              onClick={() => setSelectedPayment(p)}
                              className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 cursor-pointer transition uppercase tracking-wider shadow-3xs"
                            >
                              Receipt
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelectedSupplierPayment(p)}
                              className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold text-orange-600 hover:text-white hover:bg-orange-600 border border-orange-200 cursor-pointer transition uppercase tracking-wider shadow-3xs"
                            >
                              Voucher
                            </button>
                          )}
                          {permissions.voidPayment && (
                            <button
                              type="button"
                              onClick={() => voidTransaction(p.id)}
                              className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 cursor-pointer transition uppercase tracking-wider shadow-3xs"
                            >
                              Void
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}
