import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, PlusCircle } from 'lucide-react';
import { isInactiveStatus } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currencyFormatter';

interface PaymentFormModalProps {
  isFormOpen: boolean;
  setIsFormOpen: (open: boolean) => void;
  activeSegment: 'customers' | 'suppliers';
  isSaving: boolean;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  formErrors: Record<string, string>;
  customers: any[];
  suppliers: any[];
  handleSavePayment: (e: React.FormEvent) => void;
  selectedPersonOutstanding: () => number | null;
}

export default function PaymentFormModal({
  isFormOpen,
  setIsFormOpen,
  activeSegment,
  isSaving,
  formData,
  setFormData,
  formErrors,
  customers,
  suppliers,
  handleSavePayment,
  selectedPersonOutstanding
}: PaymentFormModalProps) {
  return (
    <AnimatePresence>
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-[2rem] border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden"
          >
            {/* Form title header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 sm:px-8 py-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {activeSegment === 'customers' ? 'Record Customer Credit Payment' : 'Record Supplier Trade Payment'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select outstanding portfolio ledger to decrease global liability.
                </p>
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setIsFormOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-800 transition rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form Body fields */}
            <form onSubmit={handleSavePayment} className="p-6 sm:p-8 space-y-6">
              
              {/* Person Dropdown */}
              <div className="relative w-full">
                <select
                  disabled={isSaving}
                  id="form-payment-person-field"
                  value={formData.personId}
                  onChange={(e) => setFormData({ ...formData, personId: e.target.value })}
                  className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 bg-white appearance-none cursor-pointer disabled:opacity-60 disabled:bg-slate-50 h-[52px] text-slate-700 ${
                    formErrors.personId 
                      ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                      : 'border-slate-200 focus:border-indigo-605'
                  }`}
                >
                  <option value="">{activeSegment === 'customers' ? '-- Choose a Client --' : '-- Choose a Supplier --'}</option>
                  {activeSegment === 'customers' ? (
                    customers.filter(c => !isInactiveStatus(c.status)).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Outstanding receivable: {formatCurrency(c.dueBalance)})
                      </option>
                    ))
                  ) : (
                    suppliers.filter(s => !isInactiveStatus(s.status)).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Outstanding trade payable: {formatCurrency(s.dueBalance ?? 0)})
                      </option>
                    ))
                  )}
                </select>
                <label htmlFor="form-payment-person-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                  {activeSegment === 'customers' ? 'Customer Profile Name' : 'Supplier Business Name'} <span className="text-rose-500 font-extrabold">*</span>
                </label>
                {formErrors.personId && (
                  <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    <span>{formErrors.personId}</span>
                  </div>
                )}
              </div>

              {/* Show current due parameters */}
              {formData.personId && selectedPersonOutstanding() !== null && (
                <div className="rounded-xl bg-slate-50 border border-slate-100/70 p-3.5 text-xs text-slate-600 flex justify-between items-center animate-fade-in">
                  <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Account Active Balance Due:</span>
                  <strong className="text-orange-600 font-extrabold text-[13px]">{formatCurrency(selectedPersonOutstanding() ?? 0)}</strong>
                </div>
              )}

              {/* Grid row: Paid Amount & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Amount Paid input */}
                <div className="relative w-full">
                  <span className="absolute left-3.5 top-[18px] text-slate-400 text-xs font-bold leading-none">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    disabled={isSaving}
                    id="form-payment-amount-field"
                    value={formData.amountPaid}
                    onChange={(e) => setFormData({ ...formData, amountPaid: e.target.value })}
                    placeholder=" "
                    className={`peer w-full rounded-xl border pl-[26px] pr-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                      formErrors.amountPaid 
                        ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                        : 'border-slate-200 focus:border-indigo-605'
                    }`}
                  />
                  <label htmlFor="form-payment-amount-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-placeholder-shown:left-[26px] peer-focus:top-1.5 peer-focus:left-3.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                    Settlement Amount ($) <span className="text-rose-500 font-extrabold">*</span>
                  </label>
                  {formErrors.amountPaid && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      <span>{formErrors.amountPaid}</span>
                    </div>
                  )}
                </div>

                {/* Payment date calendar */}
                <div className="relative w-full">
                  <input
                    type="date"
                    required
                    disabled={isSaving}
                    id="form-payment-date-field"
                    value={formData.paymentDate}
                    onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                    placeholder=" "
                    className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all h-[52px] bg-white cursor-pointer ${
                      formErrors.paymentDate 
                        ? 'border-rose-350 text-rose-800 bg-rose-50/10 focus:border-rose-455 focus:ring-1 focus:ring-rose-500' 
                        : 'border-slate-200 focus:border-indigo-605 focus:ring-1 focus:ring-indigo-605'
                    }`}
                  />
                  <label htmlFor="form-payment-date-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                    Transaction Date <span className="text-rose-500 font-extrabold">*</span>
                  </label>
                  {formErrors.paymentDate && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-505 shrink-0" />
                      <span>{formErrors.paymentDate}</span>
                    </div>
                  )}
                </div>
              </div>

              {activeSegment === 'customers' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Receipt Number */}
                  <div className="relative w-full">
                    <input
                      type="text"
                      required
                      disabled={isSaving}
                      id="form-payment-receipt-field"
                      value={formData.receiptNumber}
                      onChange={(e) => setFormData({ ...formData, receiptNumber: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all h-[52px] bg-white ${
                        formErrors.receiptNumber 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                          : 'border-slate-200 focus:border-indigo-605'
                      }`}
                    />
                    <label htmlFor="form-payment-receipt-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                      Receipt Number <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {formErrors.receiptNumber && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                        <span>{formErrors.receiptNumber}</span>
                      </div>
                    )}
                  </div>

                  {/* Received By */}
                  <div className="relative w-full">
                    <input
                      type="text"
                      required
                      disabled={isSaving}
                      id="form-payment-received-by-field"
                      value={formData.receivedBy}
                      onChange={(e) => setFormData({ ...formData, receivedBy: e.target.value })}
                      placeholder=" "
                      className="peer w-full rounded-xl border border-slate-200 px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-605 focus:border-indigo-605 transition h-[52px]"
                    />
                    <label htmlFor="form-payment-received-by-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                      Received By <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                  </div>
                </div>
              )}

              {activeSegment === 'suppliers' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Payment Voucher Number */}
                  <div className="relative w-full">
                    <input
                      type="text"
                      required
                      disabled={isSaving}
                      id="form-payment-voucher-field"
                      value={formData.voucherNumber}
                      onChange={(e) => setFormData({ ...formData, voucherNumber: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all h-[52px] bg-white ${
                        formErrors.voucherNumber 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                          : 'border-slate-200 focus:border-indigo-605'
                      }`}
                    />
                    <label htmlFor="form-payment-voucher-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                      Payment Voucher Number <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {formErrors.voucherNumber && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                        <span>{formErrors.voucherNumber}</span>
                      </div>
                    )}
                  </div>

                  {/* Paid By */}
                  <div className="relative w-full">
                    <input
                      type="text"
                      required
                      disabled={isSaving}
                      id="form-payment-paid-by-field"
                      value={formData.paidBy}
                      onChange={(e) => setFormData({ ...formData, paidBy: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition h-[52px] ${
                        formErrors.paidBy 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                          : 'border-slate-200 focus:border-indigo-605'
                      }`}
                    />
                    <label htmlFor="form-payment-paid-by-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                      Paid By <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {formErrors.paidBy && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-505 shrink-0" />
                        <span>{formErrors.paidBy}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeSegment === 'customers' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="relative w-full">
                    <input
                      type="text"
                      disabled={isSaving}
                      id="form-payment-ref-num-field"
                      value={formData.referenceNumber}
                      onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                      placeholder=" "
                      className="peer w-full rounded-xl border border-slate-200 px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-605 focus:border-indigo-605 transition h-[52px]"
                    />
                    <label htmlFor="form-payment-ref-num-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                      Reference Number (Optional)
                    </label>
                  </div>

                  <div className="relative w-full">
                    <input
                      type="text"
                      disabled={isSaving}
                      id="form-payment-cheque-ref-field"
                      value={formData.chequeOrBankRef}
                      onChange={(e) => setFormData({ ...formData, chequeOrBankRef: e.target.value })}
                      placeholder=" "
                      className="peer w-full rounded-xl border border-slate-200 px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-605 focus:border-indigo-605 transition h-[52px]"
                    />
                    <label htmlFor="form-payment-cheque-ref-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                      Cheque / Bank Reference (Optional)
                    </label>
                  </div>
                </div>
              )}

              {activeSegment === 'suppliers' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="relative w-full">
                    <input
                      type="text"
                      disabled={isSaving}
                      id="form-payment-supp-ref-field"
                      value={formData.referenceNumber}
                      onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                      placeholder=" "
                      className="peer w-full rounded-xl border border-slate-200 px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-605 focus:border-indigo-605 transition h-[52px]"
                    />
                    <label htmlFor="form-payment-supp-ref-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                      Reference Number (Optional)
                    </label>
                  </div>

                  <div className="relative w-full">
                    <input
                      type="text"
                      disabled={isSaving}
                      id="form-payment-supp-cheque-field"
                      value={formData.chequeOrBankRef}
                      onChange={(e) => setFormData({ ...formData, chequeOrBankRef: e.target.value })}
                      placeholder=" "
                      className="peer w-full rounded-xl border border-slate-200 px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-605 focus:border-indigo-605 transition h-[52px]"
                    />
                    <label htmlFor="form-payment-supp-cheque-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                      Cheque / Bank Reference (Optional)
                    </label>
                  </div>
                </div>
              )}

              {/* Notes area */}
              <div className="relative w-full">
                <textarea
                  rows={2}
                  disabled={isSaving}
                  id="form-payment-notes-field"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder=" "
                  className="peer w-full rounded-xl border border-slate-200 px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-605 focus:border-indigo-605 transition resize-none min-h-[76px]"
                />
                <label htmlFor="form-payment-notes-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                  Internal Notes / Memo / References
                </label>
              </div>

              {/* Submit actions footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></span>
                      <span>Saving Journal...</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="h-4 w-4" />
                      <span>Record Payment Journal</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
