import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Phone, ExternalLink, Send, CheckCircle2, User } from 'lucide-react';
import { Supplier, Product } from '../types';

interface SupplierContactProps {
  id?: string;
  suppliers: Supplier[];
  lowStockItems: Product[];
}

export default function SupplierContact({
  id = 'supplier-contact-panel',
  suppliers,
  lowStockItems,
}: SupplierContactProps) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const currentSupplier = suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0];

  const handleSendSimulatedEmail = () => {
    if (!currentSupplier) return;
    setIsSending(true);

    // Get low stock items supplied by this supplier
    const itemsToRestock = lowStockItems.filter(
      (item) => (item.supplierName || '').toLowerCase() === (currentSupplier?.name || '').toLowerCase()
    );

    setTimeout(() => {
      setIsSending(false);
      const itemsList = itemsToRestock.length > 0 
        ? itemsToRestock.map(i => `${i.name} (SKU: ${i.sku})`).join(', ')
        : 'general inquiries';
      
      setSuccessMsg(`Simulated restock request for [ ${itemsList} ] sent to ${currentSupplier.email}!`);
      setTimeout(() => setSuccessMsg(''), 5000);
    }, 1800);
  };

  return (
    <div id={id} className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs flex flex-col h-full text-slate-700">
      <div className="border-b border-slate-100 pb-4 mb-4">
        <h4 className="font-sans text-sm font-bold tracking-tight text-slate-800 uppercase tracking-wider">
          Supplier Procurement Desk
        </h4>
        <p className="text-xs text-slate-400 mt-0.5">Dispatch re-orders and query catalog vendors</p>
      </div>

      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center text-slate-350">
          <User className="h-8 w-8 text-slate-200 mb-2" />
          <p className="text-xs font-semibold text-slate-400">No active suppliers registered</p>
        </div>
      ) : (
        <div className="space-y-4 flex-1 flex flex-col justify-between">
          <div className="space-y-3">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Selected Supplier
            </label>
            <select
              id="supplier-selection-dropdown"
              value={selectedSupplierId || (currentSupplier?.id ?? '')}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 text-xs px-3 py-2 outline-none bg-white font-medium text-slate-700 transition focus:border-slate-400"
            >
              {suppliers.filter(s => s.status !== 'inactive').map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.category})
                </option>
              ))}
            </select>

            {currentSupplier && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2 text-xs mt-3">
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  {currentSupplier.contactPerson}
                </p>
                
                <div className="flex items-center gap-2 text-slate-500">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <a
                    id={`supplier-email-link-${currentSupplier.id}`}
                    href={`mailto:${currentSupplier.email}`}
                    className="hover:text-slate-900 break-all transition font-mono text-[11px]"
                  >
                    {currentSupplier.email}
                  </a>
                </div>

                <div className="flex items-center gap-2 text-slate-500">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="font-mono">{currentSupplier.phone}</span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Re-order Intelligence
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 animate-none">
                {lowStockItems.length} Low Stock
              </span>
            </div>

            <button
              id="dispatch-reorder-button"
              type="button"
              disabled={isSending || !!successMsg}
              onClick={handleSendSimulatedEmail}
              className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition shadow-xs ${
                isSending
                  ? 'bg-slate-150 text-slate-400 cursor-not-allowed border border-slate-205'
                  : successMsg
                  ? 'bg-emerald-50 text-emerald-650 border border-emerald-200'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-sm'
              }`}
            >
              {isSending ? (
                <>
                  <motion.div
                    className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-800"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, ease: 'linear', duration: 1 }}
                  />
                  <span>Assembling Draft Request...</span>
                </>
              ) : successMsg ? (
                <>
                  <CheckCircle2 className="h-4 w-4 animate-bounce" />
                  <span>Procurement Sent!</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Draft & Dispatch Re-Order</span>
                </>
              )}
            </button>

            <AnimatePresence>
              {successMsg && (
                <motion.p
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="text-[10px] text-emerald-600 leading-relaxed text-center bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50 font-medium"
                >
                  {successMsg}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
