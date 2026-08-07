import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, X, Clock, Printer } from 'lucide-react';
import { formatCurrency, getCurrencyCode } from '../../../utils/currencyFormatter';

interface PaymentDetailModalsProps {
  selectedPayment: any | null;
  setSelectedPayment: (p: any | null) => void;
  selectedSupplierPayment: any | null;
  setSelectedSupplierPayment: (p: any | null) => void;
  getFIFOAllocationForSelected: () => any[];
  handlePrintReceiptPDF: (pay: any) => void;
  handlePrintVoucherPDF: (pay: any) => void;
  numberToWords: (num: number) => string;
}

export default function PaymentDetailModals({
  selectedPayment,
  setSelectedPayment,
  selectedSupplierPayment,
  setSelectedSupplierPayment,
  getFIFOAllocationForSelected,
  handlePrintReceiptPDF,
  handlePrintVoucherPDF,
  numberToWords
}: PaymentDetailModalsProps) {
  return (
    <>
      {/* PRINTABLE RECEIPT MODAL DIALOG */}
      <AnimatePresence>
        {selectedPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl rounded-[2.5rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <span>Official Customer Receipt Voucher</span>
                  </h3>
                  <p className="text-xs text-slate-550 mt-1">
                    Receipt details and FIFO allocation audit profile.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPayment(null)}
                  className="h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-650 hover:bg-slate-50 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Receipt Body Snapshot */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                {/* Left Side: General Vouchers */}
                <div className="md:col-span-5 space-y-5">
                  <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Receipt Number</span>
                      <strong className="text-xs font-mono font-extrabold text-indigo-650 bg-indigo-50 border border-indigo-100/60 px-2.5 py-0.5 rounded-full">
                        {selectedPayment.receiptNumber || 'N/A'}
                      </strong>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Customer Account</span>
                      <strong className="text-xs text-slate-850 block">{selectedPayment.customerName || 'Anonymous Client'}</strong>
                      <span className="text-[10px] font-mono text-slate-400 block">ID: {selectedPayment.customerId}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/45">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Receipt Date</span>
                        <span className="text-xs font-semibold text-slate-700">{selectedPayment.receiptDate || selectedPayment.paymentDate}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Received By Agent</span>
                        <span className="text-xs font-semibold text-slate-700">{selectedPayment.receivedBy || 'System Admin'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/45">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Reference #</span>
                        <span className="text-xs font-mono font-semibold text-slate-700">{selectedPayment.referenceNumber || 'N/A'}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Cheque / Bank Ref</span>
                        <span className="text-xs font-mono font-semibold text-slate-700">{selectedPayment.chequeOrBankRef || 'N/A'}</span>
                      </div>
                    </div>

                    {selectedPayment.notes && (
                      <div className="pt-3 border-t border-slate-200/45 space-y-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Internal Notes</span>
                        <p className="text-xs text-slate-500 italic leading-relaxed">"{selectedPayment.notes}"</p>
                      </div>
                    )}
                  </div>

                  {/* Settled sum summary */}
                  <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-5 space-y-2">
                    <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider block">Settlement Sum Received</span>
                    <strong className="text-2xl font-bold font-mono text-emerald-800 block">
                      {formatCurrency(selectedPayment.amountPaid)}
                    </strong>
                    <div className="text-[10px] text-emerald-600 leading-relaxed font-semibold italic border-t border-emerald-200/60 pt-1.5">
                      Amount in words: {numberToWords(selectedPayment.amountPaid)}
                    </div>
                  </div>
                </div>

                {/* Right Side: FIFO Chronological Allocation Profile */}
                <div className="md:col-span-7 space-y-4">
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50">
                    <div className="bg-slate-100 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-indigo-500" />
                        <span>FIFO Invoice Allocation Breakdown</span>
                      </span>
                      <span className="text-[10px] font-bold text-indigo-650 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                        Deterministic FIFO Rule
                      </span>
                    </div>

                    <div className="p-1 max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                      {getFIFOAllocationForSelected().length === 0 ? (
                        <div className="text-center py-8 text-xs text-slate-400 font-medium italic">
                          No outstanding invoices allocated. Full amount credited to account balance.
                        </div>
                      ) : (
                        getFIFOAllocationForSelected().map((item) => (
                          <div key={item.invoiceId} className="p-3.5 flex items-center justify-between gap-4 text-xs">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <strong className="font-semibold text-slate-800">{item.invoiceNumber}</strong>
                                <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider rounded-md ${
                                  item.status === 'Fully Paid' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    : item.status === 'Unallocated Future Credit'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                    : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                }`}>
                                  {item.status}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-3">
                                <span>Date: {item.saleDate}</span>
                                <span>Total Value: {formatCurrency(item.totalAmount)}</span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold leading-none mb-0.5">Allocated</div>
                              <strong className="text-indigo-600 font-bold font-mono">{formatCurrency(item.allocatedAmount)}</strong>
                              {item.invoiceId !== 'CREDIT_POOL' && (
                                <div className="text-[9px] text-slate-400">Rem: {formatCurrency(item.remainingAmount)}</div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Operational Ledger Audit Snapshot */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Operational Ledger Verification</span>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-xl bg-white border border-slate-100/65">
                        <div className="text-[9px] font-semibold text-slate-400 uppercase">Pre-Payment Outstanding</div>
                        <strong className="text-sm font-bold text-slate-800">{formatCurrency(selectedPayment.previousDue ?? 0)}</strong>
                      </div>
                      <div className="p-3 rounded-xl bg-white border border-slate-100/65">
                        <div className="text-[9px] font-semibold text-slate-400 uppercase">Post-Payment Outstanding</div>
                        <strong className="text-sm font-bold text-slate-800">{formatCurrency(selectedPayment.remainingDue ?? 0)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal footer actions */}
              <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-4">
                <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  <span>Officially Verified & Registered  |  Audit Ledger Secure</span>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedPayment(null)}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Close Voucher
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintReceiptPDF(selectedPayment)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-sm hover:shadow-md cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print Official Receipt (PDF)</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PRINTABLE SUPPLIER VOUCHER MODAL DIALOG */}
      <AnimatePresence>
        {selectedSupplierPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl rounded-[2.5rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-orange-600" />
                    <span>Official Supplier Payment Voucher</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Voucher details, disbursement agents, and ledger audit verification profile.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSupplierPayment(null)}
                  className="h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-650 hover:bg-slate-50 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Voucher Body Snapshot */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                {/* Left Side: General Info */}
                <div className="md:col-span-5 space-y-5">
                  <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Voucher Number</span>
                      <strong className="text-xs font-mono font-extrabold text-orange-700 bg-orange-50 border border-orange-100/60 px-2.5 py-0.5 rounded-full">
                        {selectedSupplierPayment.voucherNumber || 'N/A'}
                      </strong>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Supplier Account</span>
                      <strong className="text-xs text-slate-850 block">{selectedSupplierPayment.supplierName || 'Anonymous Supplier'}</strong>
                      <span className="text-[10px] font-mono text-slate-400 block">ID: {selectedSupplierPayment.supplierId}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/45">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Payment Date</span>
                        <span className="text-xs font-semibold text-slate-700">{selectedSupplierPayment.paymentDate}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Disbursed By Agent</span>
                        <span className="text-xs font-semibold text-slate-700">{selectedSupplierPayment.paidBy || 'System Admin'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/45">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Reference #</span>
                        <span className="text-xs font-mono font-semibold text-slate-700">{selectedSupplierPayment.referenceNumber || 'N/A'}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Cheque / Bank Ref</span>
                        <span className="text-xs font-mono font-semibold text-slate-700">{selectedSupplierPayment.chequeOrBankRef || 'N/A'}</span>
                      </div>
                    </div>

                    {selectedSupplierPayment.notes && (
                      <div className="pt-3 border-t border-slate-200/45 space-y-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Internal Notes</span>
                        <p className="text-xs text-slate-500 italic leading-relaxed">"{selectedSupplierPayment.notes}"</p>
                      </div>
                    )}
                  </div>

                  {/* Settled sum summary */}
                  <div className="bg-orange-50 rounded-2xl border border-orange-100 p-5 space-y-2">
                    <span className="text-[10px] font-extrabold text-orange-700 uppercase tracking-wider block">Settlement Sum Disbursed</span>
                    <strong className="text-2xl font-bold font-mono text-orange-800 block">
                      {formatCurrency(selectedSupplierPayment.amountPaid)}
                    </strong>
                    <div className="text-[10px] text-orange-600 leading-relaxed font-semibold italic border-t border-orange-200/60 pt-1.5">
                      Amount in words: {numberToWords(selectedSupplierPayment.amountPaid)}
                    </div>
                  </div>
                </div>

                {/* Right Side: Ledger Snapshot */}
                <div className="md:col-span-7 space-y-4">
                  {/* Operational Ledger Audit Snapshot */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs space-y-4">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Operational Ledger Verification</span>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-xl bg-white border border-slate-100/65">
                        <div className="text-[9px] font-semibold text-slate-400 uppercase">Pre-Payment Outstanding</div>
                        <strong className="text-sm font-bold text-slate-800">{formatCurrency(selectedSupplierPayment.previousDue ?? 0)}</strong>
                      </div>
                      <div className="p-3 rounded-xl bg-white border border-slate-100/65">
                        <div className="text-[9px] font-semibold text-slate-400 uppercase">Post-Payment Outstanding</div>
                        <strong className="text-sm font-bold text-slate-800">{formatCurrency(selectedSupplierPayment.remainingDue ?? 0)}</strong>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-50/40 border border-amber-100/80 text-[11px] text-amber-800 leading-relaxed space-y-2">
                      <strong className="font-bold uppercase tracking-wider block text-[10px] text-amber-900">AP ENGINE SYSTEM RULE</strong>
                      <p>
                        This payment has been automatically logged against the supplier's balance under double-entry cash flow rules. It will mirror against the Procurements register sequentially.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal footer actions */}
              <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-4">
                <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-orange-500"></span>
                  <span>Officially Verified & Registered  |  Accounts Payable Ledger Secure</span>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedSupplierPayment(null)}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Close Voucher
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintVoucherPDF(selectedSupplierPayment)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-600 text-xs font-bold text-white hover:bg-orange-700 transition shadow-sm hover:shadow-md cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print Official Voucher (PDF)</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
