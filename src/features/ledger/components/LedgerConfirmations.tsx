import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../../utils/currencyFormatter';

interface LedgerConfirmationsProps {
  voidConfirmationPayment: any | null;
  setVoidConfirmationPayment: (p: any | null) => void;
  handleVoidPayment: (p: any) => Promise<void>;
  
  overpaymentConfirmData: any | null;
  setOverpaymentConfirmData: (p: any | null) => void;
  proceedWithSavingPayment: () => Promise<void>;
}

export default function LedgerConfirmations({
  voidConfirmationPayment,
  setVoidConfirmationPayment,
  handleVoidPayment,
  overpaymentConfirmData,
  setOverpaymentConfirmData,
  proceedWithSavingPayment
}: LedgerConfirmationsProps) {
  return (
    <>
      {/* VOID PAYMENT CONFIRMATION MODAL */}
      <AnimatePresence>
        {voidConfirmationPayment && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xl"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-sans text-sm font-bold tracking-tight text-slate-850">
                    Confirm Void Payment
                  </h3>
                  <p className="text-xs text-slate-550 leading-relaxed font-medium">
                    Are you sure you want to VOID this payment settlement? This will mark it as VOID, rollback associated due balances, and reverse cash ledger entries. This action is irreversible.
                  </p>
                  <div className="text-[10px] font-mono text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                    <div><span className="font-bold">Transaction ID:</span> {voidConfirmationPayment.id}</div>
                    <div>
                      <span className="font-bold">Entity:</span> {'customerName' in voidConfirmationPayment ? voidConfirmationPayment.customerName : voidConfirmationPayment.supplierName}
                    </div>
                    <div><span className="font-bold">Settlement Date:</span> {voidConfirmationPayment.paymentDate}</div>
                    <div><span className="font-bold">Amount Settled:</span> {formatCurrency(voidConfirmationPayment.amountPaid)}</div>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setVoidConfirmationPayment(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const payToVoid = voidConfirmationPayment;
                    setVoidConfirmationPayment(null);
                    await handleVoidPayment(payToVoid);
                  }}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition cursor-pointer shadow-xs"
                >
                  Yes, Void Settlement
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* OVERPAYMENT DETECTED MODAL */}
      <AnimatePresence>
        {overpaymentConfirmData && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xl"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-2 w-full">
                  <h3 className="font-sans text-sm font-bold tracking-tight text-slate-850">
                    Overpayment Detected
                  </h3>
                  <p className="text-xs text-slate-550 leading-relaxed font-medium">
                    The payment amount exceeds the customer's current outstanding due balance.
                  </p>
                  <div className="text-[11px] font-mono text-slate-650 bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1.5 w-full">
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-400 uppercase tracking-wider text-[9px]">Outstanding Due:</span>
                      <strong className="text-slate-800">{formatCurrency(overpaymentConfirmData.outstanding)}</strong>
                    </div>
                    <div className="flex justify-between border-t border-slate-200/50 pt-1.5">
                      <span className="font-medium text-slate-400 uppercase tracking-wider text-[9px]">Payment Received:</span>
                      <strong className="text-indigo-600 font-extrabold">{formatCurrency(overpaymentConfirmData.amount)}</strong>
                    </div>
                    <div className="flex justify-between border-t border-slate-200/50 pt-1.5">
                      <span className="font-medium text-slate-400 uppercase tracking-wider text-[9px]">Excess Amount:</span>
                      <strong className="text-emerald-500 font-extrabold">{formatCurrency(overpaymentConfirmData.excess)}</strong>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 italic mt-1.5 leading-normal">
                    The excess amount of <span className="text-emerald-600 font-bold font-mono">{formatCurrency(overpaymentConfirmData.excess)}</span> will be stored as Customer Credit and automatically applied to future sales.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setOverpaymentConfirmData(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setOverpaymentConfirmData(null);
                    await proceedWithSavingPayment();
                  }}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition cursor-pointer shadow-xs"
                >
                  Confirm Payment
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
