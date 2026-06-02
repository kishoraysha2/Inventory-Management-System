import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Truck, 
  UserPlus, 
  Phone, 
  MapPin, 
  CreditCard, 
  Search, 
  Trash2, 
  Edit2, 
  Plus, 
  X, 
  Save, 
  AlertTriangle, 
  Calendar, 
  DollarSign, 
  TrendingUp,
  ChevronRight,
  Package
} from 'lucide-react';
import { db, OperationType, handleFirestoreError, logSystemActivity } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Supplier } from '../types';

export default function SupplierManagement() {
  // --- State ---
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'Cash' | 'Credit'>('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // --- Form Fields State ---
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    paymentType: 'Cash' as 'Cash' | 'Credit',
    dueBalance: ''
  });
  
  // --- Validation Errors State ---
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Real-time Firestore Sync ---
  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const supplierList: Supplier[] = [];
      snapshot.forEach((docSnap) => {
        supplierList.push(docSnap.data() as Supplier);
      });
      // Sort suppliers by createdDate descending (fall back on ID if createdDate is missing)
      supplierList.sort((a, b) => {
        const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
        const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
        if (dateA !== dateB) {
          return dateB - dateA;
        }
        return b.id.localeCompare(a.id);
      });
      setSuppliers(supplierList);
      setLoading(false);
    }, (err) => {
      console.error("Suppliers sync error:", err);
      let errMsg = 'Failed to synchronize suppliers list with Firestore database.';
      try {
        handleFirestoreError(err, OperationType.LIST, 'suppliers');
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }
      setError(errMsg);
      setFeedback({ message: errMsg, type: 'error' });
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // --- Auto-hide Feedback ---
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // --- Open Form for Create/Edit ---
  const openForm = (supplier: Supplier | null = null) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({
        name: supplier.name,
        phone: supplier.phone,
        address: supplier.address || '',
        paymentType: supplier.paymentType || 'Cash',
        dueBalance: (supplier.dueBalance ?? 0).toString()
      });
    } else {
      setEditingSupplier(null);
      setFormData({
        name: '',
        phone: '',
        address: '',
        paymentType: 'Cash',
        dueBalance: '0'
      });
    }
    setErrors({});
    setIsFormOpen(true);
  };

  // --- Form Validation ---
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Supplier name is required';
    if (formData.name.length > 200) newErrors.name = 'Name must be 200 characters or less';
    
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (formData.phone.length > 50) {
      newErrors.phone = 'Phone number must be 50 characters or less';
    }

    if (formData.address.length > 500) {
      newErrors.address = 'Address must be 500 characters or less';
    }

    const parsedDue = parseFloat(formData.dueBalance);
    if (isNaN(parsedDue)) {
      newErrors.dueBalance = 'Due balance must be a valid number';
    } else if (parsedDue < 0) {
      newErrors.dueBalance = 'Due balance cannot be negative';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Submit Create / Edit ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSaving(true);
    const dueBalanceValue = parseFloat(formData.dueBalance);
    const timestamp = new Date().toISOString();
    const supplierId = editingSupplier ? editingSupplier.id : `supp-${Date.now()}`;

    // Preserve older fields if editing an initial supplier so they don't get cleared
    const finalSupplierData: Supplier = {
      ...editingSupplier,
      id: supplierId,
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      address: formData.address.trim(),
      paymentType: formData.paymentType,
      dueBalance: dueBalanceValue,
      createdDate: editingSupplier?.createdDate || timestamp
    };

    try {
      await setDoc(doc(db, 'suppliers', supplierId), finalSupplierData);
      if (!editingSupplier) {
        await logSystemActivity(
          "Supplier created",
          `Registered new supplier profile: ${finalSupplierData.name} (Phone: ${finalSupplierData.phone}, Initial Balance: $${finalSupplierData.dueBalance})`
        );
      } else {
        await logSystemActivity(
          "Supplier edited",
          `Updated details for supplier profile: ${finalSupplierData.name}`
        );
      }
      setFeedback({
        message: editingSupplier 
          ? `Successfully updated details for supplier "${finalSupplierData.name}"` 
          : `Permanently registered supplier profile "${finalSupplierData.name}"`,
        type: 'success'
      });
      setIsFormOpen(false);
    } catch (err: any) {
      console.error("Save supplier error:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `suppliers/${supplierId}`);
      } catch (dbErr: any) {
        setFeedback({ message: `Failed to save supplier: ${dbErr.message}`, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Confirm Delete Trigger ---
  const handleDeleteClick = (supplier: Supplier) => {
    setSupplierToDelete(supplier);
  };

  // --- Execute Delete ---
  const handleConfirmDelete = async () => {
    if (!supplierToDelete) return;
    const name = supplierToDelete.name;
    const id = supplierToDelete.id;
    setSupplierToDelete(null);

    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'suppliers', id));
      await logSystemActivity(
        "Supplier deleted",
        `Permanently purged supplier record: ${name}`
      );
      setFeedback({ message: `Supplier record "${name}" has been permanently deleted from directory.`, type: 'success' });
    } catch (err: any) {
      console.error("Delete supplier error:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `suppliers/${id}`);
      } catch (dbErr: any) {
        setFeedback({ message: `Purge unsuccessful: ${dbErr.message}`, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Filtered Suppliers ---
  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = 
      supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.phone.includes(searchQuery) ||
      (supplier.address || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (supplier.contactPerson || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const term = supplier.paymentType || 'Cash'; // Default level fallback
    if (filterType === 'All') return matchesSearch;
    return matchesSearch && term === filterType;
  });

  // --- Metric Calculations ---
  const outstandingCostTotal = suppliers.reduce((sum, item) => sum + (item.dueBalance ?? 0), 0);
  const creditAccountsCount = suppliers.filter(s => (s.paymentType || 'Cash') === 'Credit').length;
  const cashAccountsCount = suppliers.filter(s => (s.paymentType || 'Cash') === 'Cash').length;

  return (
    <div id="supplier-registry-view" className="space-y-8 animate-fade-in">
      
      {/* FEEDBACK STATUS BANNER */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold shadow-lg border ${
              feedback.type === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            )}
            <p>{feedback.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* METRIC BENTO CARDS */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {/* Total Suppliers */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between animate-fade-in">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Total Suppliers</span>
              <div className="p-1 px-2.5 rounded-full text-[10px] font-extrabold bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center gap-1">
                Active <ChevronRight className="h-2.5 w-2.5" />
              </div>
            </div>
            {loading ? (
              <div className="h-9 w-12 bg-slate-100 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">{suppliers.length}</p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
            Registered procurement channels
          </div>
        </div>

        {/* Due Portfolio Balance */}
        <div className="bg-rose-50 rounded-[2rem] p-6 sm:p-8 border border-rose-100 flex flex-col justify-between animate-fade-in">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest leading-none">Total Unpaid Balance</span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-rose-500"></span>
            </div>
            {loading ? (
              <div className="h-9 w-28 bg-rose-200/50 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold font-sans tracking-tight text-rose-900 mt-2">
                ${outstandingCostTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-rose-200/50 text-[11px] text-rose-700/80">
            Aggregate active trade payable credit
          </div>
        </div>

        {/* Account Distribution */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between animate-fade-in">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Payment Terms</span>
              <CreditCard className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase leading-none">Cash</p>
                {loading ? (
                  <div className="h-7 w-10 bg-slate-100 rounded-lg animate-pulse mt-1"></div>
                ) : (
                  <p className="text-xl font-bold text-slate-800 mt-1">{cashAccountsCount}</p>
                )}
              </div>
              <div className="border-l border-slate-100 pl-4">
                <p className="text-xs text-slate-400 font-bold uppercase leading-none">Credit</p>
                {loading ? (
                  <div className="h-7 w-10 bg-slate-100 rounded-lg animate-pulse mt-1"></div>
                ) : (
                  <p className="text-xl font-bold text-slate-800 mt-1">{creditAccountsCount}</p>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-indigo-600 font-bold flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Supply channel settlement
          </div>
        </div>
      </div>

      {/* WORKING DIRECTORY AND LIST AREA */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left span 2: Suppliers directory list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
            
            {/* Header / Filter Toolbar */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-sans text-lg font-bold tracking-tight text-slate-900">
                  Supplier Directory Desk
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update merchant trade status, address details and accounts payable
                </p>
              </div>

              <button
                type="button"
                onClick={() => openForm()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer"
              >
                <Truck className="h-4 w-4" />
                <span>New Supplier</span>
              </button>
            </div>

            {/* Filter controls and Search Bar */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2 border-t border-slate-100">
              {/* Search */}
              <div className="sm:col-span-2 relative">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, contact, phone or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs font-medium text-slate-850 placeholder:text-slate-400 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505 outline-none font-sans"
                />
              </div>

              {/* Type Category Filter */}
              <div className="flex bg-slate-50 border border-slate-100 p-1 rounded-xl">
                {(['All', 'Cash', 'Credit'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilterType(type)}
                    className={`flex-1 text-center py-1.5 text-[11px] font-bold tracking-tight rounded-lg transition ${
                      filterType === type 
                        ? 'bg-white text-indigo-600 shadow-xs border border-slate-100' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Suppliers list container */}
            <div className="space-y-4 pt-2">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="border border-slate-205 border-slate-200 rounded-2xl p-5 bg-white animate-pulse flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-3 flex-grow">
                        <div className="h-4 bg-slate-100 rounded-md w-1/3"></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="h-3.5 bg-slate-50 rounded-md w-1/2"></div>
                          <div className="h-3.5 bg-slate-50 rounded-md w-2/3"></div>
                        </div>
                        <div className="h-3 bg-slate-50 rounded-md w-1/4"></div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100 justify-between sm:justify-end w-full sm:w-auto">
                        <div className="space-y-1 text-left sm:text-right">
                          <div className="h-2.5 bg-slate-100 rounded-md w-12 sm:ml-auto"></div>
                          <div className="h-5 bg-slate-100 rounded-md w-24 sm:ml-auto"></div>
                        </div>
                        <div className="flex gap-2">
                          <div className="w-8 h-8 bg-slate-50 rounded-lg"></div>
                          <div className="w-8 h-8 bg-slate-50 rounded-lg"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-rose-500 border border-dashed border-rose-200 rounded-[2rem] bg-rose-50/10">
                  <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center text-rose-500 mb-3 animate-bounce">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-rose-800">Connection Offline</p>
                  <p className="text-xs text-rose-500 mt-1 max-w-sm px-6">
                    {error}
                  </p>
                </div>
              ) : filteredSuppliers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                  <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-350 mb-3 block">
                    <Truck className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600 font-sans">No Suppliers Identified</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    {searchQuery ? 'Adjust search inputs or apply empty filter parameters' : 'Begin registering channels to establish trade history ledgers'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredSuppliers.map((supplier) => (
                    <motion.div
                      key={supplier.id}
                      layoutId={`supplier-card-${supplier.id}`}
                      className="border border-slate-200 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-xs transition duration-300 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                    >
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-900 truncate">{supplier.name}</h4>
                          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            (supplier.paymentType || 'Cash') === 'Credit' 
                              ? 'bg-orange-50 text-orange-700 border border-orange-100' 
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            {(supplier.paymentType || 'Cash')} Terms
                          </span>
                          {supplier.category && (
                            <span className="inline-flex items-center px-2 py-0.5 text-[10px] bg-slate-50 border border-slate-100 text-slate-500 rounded-full">
                              {supplier.category}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-500">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{supplier.phone}</span>
                          </span>
                          <span className="flex items-center gap-1.5 min-w-0">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{supplier.address || 'No Address Provided'}</span>
                          </span>
                        </div>

                        {supplier.contactPerson && (
                          <div className="text-[11px] text-slate-450 text-slate-400">
                            Representative: <span className="text-slate-650 text-slate-600 font-bold">{supplier.contactPerson}</span>
                            {supplier.email && <span className="ml-1 text-indigo-500 shrink-0">({supplier.email})</span>}
                          </div>
                        )}
                        
                        {supplier.createdDate && (
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span>Trade profile active since {new Date(supplier.createdDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                          </div>
                        )}
                      </div>

                      {/* Right Section: Balance and Action Hooks */}
                      <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0 shrink-0">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none block">Outstanding Payable</span>
                          <span className={`text-lg font-extrabold block mt-1 ${
                            (supplier.dueBalance ?? 0) > 0 ? 'text-amber-600' : 'text-slate-705 text-slate-700'
                          }`}>
                            ${(supplier.dueBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openForm(supplier)}
                            className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition"
                            title="Edit supplier contract terms"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(supplier)}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition"
                            title="Delete supplier permanently from channels"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right side panel (Col 1): Directory stats & rules */}
        <div className="space-y-6">
          {/* Informational Guidelines card */}
          <div className="bg-slate-900 text-white rounded-[2rem] p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold uppercase text-[10px] tracking-widest text-slate-400">Settlement Rules</h4>
                <span className="flex h-2 w-2 rounded-full bg-emerald-400"></span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-xs">
                Trading channels listed as <strong className="text-amber-400 font-extrabold">Credit Terms</strong> defer individual invoicing until standard settlement cycles. Risk buffers are measured globally against total active assets.
              </p>
              
              <div className="mt-6 border-t border-slate-800 pt-4 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Trading Ledger Sync</span>
                  <span className="font-mono text-[10px] bg-slate-800 text-slate-200 px-2 py-0.5 rounded">Synchronized</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-sans">Payment Resolution</span>
                  <span className="font-mono text-[10px] text-indigo-400">Automated</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Credit Limit Statistics Bento */}
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <h4 className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Payable Distribution</h4>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                    <span>Active Credit Ratio</span>
                    <span className="font-bold">{suppliers.length > 0 ? Math.round((creditAccountsCount / suppliers.length) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" 
                      style={{ width: `${suppliers.length > 0 ? (creditAccountsCount / suppliers.length) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                    <span>Payables Risk Threshold</span>
                    <span className="font-bold text-emerald-600">Stable</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-1.5 rounded-full w-2/12"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-5 text-[10px] text-slate-400 leading-normal uppercase font-bold tracking-wider">
              Settlement transactions post to the general database index for accounting audits.
            </p>
          </div>
        </div>
      </div>

      {/* CREATE / EDIT DIALOG FORM MODAL */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden"
            >
              {/* Form title bar */}
              <div className="flex items-center justify-between border-b border-slate-100 px-6 sm:px-8 py-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingSupplier ? `Modify Supplier: ${editingSupplier.name}` : 'Register New Procurement Channel'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure supplier payment structures, records and terms
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

              {/* Form container body */}
              <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
                
                {/* Supplier Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Supplier Name *</label>
                  <input
                    type="text"
                    required
                    disabled={isSaving}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 disabled:bg-slate-50 ${
                      errors.name 
                        ? 'border-rose-350 text-rose-800 bg-rose-50/20' 
                        : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505'
                    }`}
                    placeholder="E.g., Cascade Industrial Supply Co."
                  />
                  {errors.name && <p className="text-[10px] font-bold text-rose-500">{errors.name}</p>}
                </div>

                {/* Grid row: Phone & Payment Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Phone */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Phone Number *</label>
                    <input
                      type="text"
                      required
                      disabled={isSaving}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 disabled:bg-slate-50 ${
                        errors.phone 
                          ? 'border-rose-350 text-rose-800 bg-rose-50/20' 
                          : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505'
                      }`}
                      placeholder="E.g., +1 (800) 555-5021"
                    />
                    {errors.phone && <p className="text-[10px] font-bold text-rose-500">{errors.phone}</p>}
                  </div>

                  {/* Payment Type */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Payment Type *</label>
                    <select
                      disabled={isSaving}
                      value={formData.paymentType}
                      onChange={(e) => setFormData({ ...formData, paymentType: e.target.value as 'Cash' | 'Credit' })}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505 transition cursor-pointer disabled:opacity-60 disabled:bg-slate-50"
                    >
                      <option value="Cash">Cash Account (Settled Immediately)</option>
                      <option value="Credit">Credit Terms (deferred invoice)</option>
                    </select>
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Address Description</label>
                  <textarea
                    rows={2}
                    disabled={isSaving}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-medium focus:outline-none resize-none transition disabled:opacity-60 disabled:bg-slate-50 ${
                      errors.address 
                        ? 'border-rose-350 text-rose-800 bg-rose-50/20' 
                        : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505'
                    }`}
                    placeholder="E.g., Building C, Suite 400, Industrial Trade Zone, Vancouver"
                  />
                  {errors.address && <p className="text-[10px] font-bold text-rose-500">{errors.address}</p>}
                </div>

                {/* Due Balance */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Outstanding Due Balance ($) *</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-xs font-bold text-slate-400 shrink-0">$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      disabled={isSaving}
                      value={formData.dueBalance}
                      onChange={(e) => setFormData({ ...formData, dueBalance: e.target.value })}
                      className={`w-full rounded-xl border py-2.5 pl-8 pr-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 disabled:bg-slate-50 ${
                        errors.dueBalance 
                          ? 'border-rose-350 text-rose-800 bg-rose-50/20' 
                          : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505'
                      }`}
                      placeholder="0.00"
                    />
                  </div>
                  {errors.dueBalance && <p className="text-[10px] font-bold text-rose-500">{errors.dueBalance}</p>}
                  <p className="text-[10px] text-slate-400 mt-1 font-sans">Outstanding liabilities owed to this supplier. Default is 0.00.</p>
                </div>

                {/* Action buttons footer */}
                <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></span>
                        <span>Saving Supplier...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>{editingSupplier ? 'Update Supplier' : 'Register Supplier'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION DIALOG MODAL */}
      <AnimatePresence>
        {supplierToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 sm:p-8 space-y-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center text-rose-600 mb-4 font-sans">
                    <AlertTriangle className="h-6 w-6 animate-pulse" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 font-sans">
                    Purge Supplier Profile?
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed font-sans">
                    Are you absolutely sure you want to permanently delete supplier account for{' '}
                    <strong className="text-slate-900 font-extrabold">"{supplierToDelete.name}"</strong>? 
                    This action will clear all outstanding balances, terms and registration parameters, and cannot be undone.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setSupplierToDelete(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer disabled:opacity-40"
                  >
                    Cancel, Keep Profile
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleConfirmDelete}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 transition shadow-xs hover:shadow-md cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-70"
                  >
                    {isSaving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></span>
                        <span>Purging Record...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        <span>Yes, Purge Record</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
