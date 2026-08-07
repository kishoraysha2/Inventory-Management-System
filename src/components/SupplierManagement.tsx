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
  Package,
  FileText,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError, logSystemActivity } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { Supplier } from '../types';
import { ResponsiveKPIValue } from './MetricCard';
import { isInactiveStatus } from '../lib/utils';
import { usePermission, UserRole } from '../hooks/usePermission';
import { formatCurrency } from '../utils/currencyFormatter';
import { EnterpriseIdentityValidationService } from '../services/validation/EnterpriseIdentityValidationService';
import { TranslationService } from '../services/translation/TranslationService';

export default function SupplierManagement({ userRole = 'admin' }: { userRole?: UserRole }) {
  const { permissions } = usePermission({ role: userRole });

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
    nameArabic: '',
    phone: '',
    email: '',
    vatNumber: '',
    address: '',
    paymentType: 'Cash' as 'Cash' | 'Credit',
    dueBalance: '',
    status: 'active' as 'active' | 'inactive'
  });
  
  // --- Validation Errors State ---
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [translationNotice, setTranslationNotice] = useState<{ type: 'success' | 'warning'; message: string } | null>(null);

  const [purchases, setPurchases] = useState<any[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);

  // --- Real-time Firestore Sync ---
  useEffect(() => {
    if (!auth.currentUser) {
      // Local fallback
      const saved = localStorage.getItem('inventory_suppliers');
      setSuppliers(saved ? JSON.parse(saved) : []);

      const savedPurchases = localStorage.getItem('inventory_purchases') || '[]';
      setPurchases(JSON.parse(savedPurchases));

      const savedPayments = localStorage.getItem('inventory_supplier_payments') || '[]';
      setSupplierPayments(JSON.parse(savedPayments));

      setLoading(false);
      return;
    }

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

    const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snapshot) => {
      const purchasesList: any[] = [];
      snapshot.forEach((docSnap) => {
        purchasesList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setPurchases(purchasesList);
    });

    const unsubSupplierPayments = onSnapshot(collection(db, 'supplierPayments'), (snapshot) => {
      const paymentsList: any[] = [];
      snapshot.forEach((docSnap) => {
        paymentsList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setSupplierPayments(paymentsList);
    });

    return () => {
      unsub();
      unsubPurchases();
      unsubSupplierPayments();
    };
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

  useEffect(() => {
    const handleTrigger = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.tab === 'suppliers') {
        openForm();
      }
    };
    window.addEventListener('nexus-trigger-add-modal', handleTrigger);
    return () => window.removeEventListener('nexus-trigger-add-modal', handleTrigger);
  }, []);

  // --- Programmatic Statement Redirection ---
  const handleViewStatement = (supplier: Supplier) => {
    sessionStorage.setItem('nexus_target_report_type', 'supplier_statement');
    sessionStorage.setItem('nexus_target_supplier_id', supplier.id);
    window.dispatchEvent(new CustomEvent('nexus-change-tab', { detail: { tab: 'reports' } }));
  };

  // --- Open Form for Create/Edit ---
  const openForm = (supplier: Supplier | null = null) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({
        name: supplier.name,
        nameArabic: supplier.nameArabic || '',
        phone: supplier.phone,
        email: supplier.email || '',
        vatNumber: supplier.vatNumber || '',
        address: supplier.address || '',
        paymentType: supplier.paymentType || 'Cash',
        dueBalance: (supplier.dueBalance ?? 0).toString(),
        status: supplier.status || 'active'
      });
    } else {
      setEditingSupplier(null);
      setFormData({
        name: '',
        nameArabic: '',
        phone: '',
        email: '',
        vatNumber: '',
        address: '',
        paymentType: 'Cash',
        dueBalance: '0',
        status: 'active'
      });
    }
    setErrors({});
    setIsFormOpen(true);
  };

  // --- Form Validation ---
  const validateForm = async () => {
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

    // Centralized Enterprise Identity Validation
    const validationResult = await EnterpriseIdentityValidationService.validateIdentity({
      name: formData.name,
      phone: formData.phone,
      email: formData.email,
      vatNumber: formData.vatNumber,
      currentEntityId: editingSupplier ? editingSupplier.id : undefined,
      currentCollection: 'suppliers',
      localSuppliers: suppliers
    });

    const combinedErrors = { ...newErrors, ...validationResult.errors };
    setErrors(combinedErrors);
    return Object.keys(combinedErrors).length === 0;
  };

  // --- Submit Create / Edit ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Local duplicate and syntax checks
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

    // Centralized Enterprise Identity Validation
    const validationResult = await EnterpriseIdentityValidationService.validateIdentity({
      name: formData.name,
      phone: formData.phone,
      email: formData.email,
      vatNumber: formData.vatNumber,
      currentEntityId: editingSupplier ? editingSupplier.id : undefined,
      currentCollection: 'suppliers',
      localSuppliers: suppliers
    });

    const combinedErrors = { ...newErrors, ...validationResult.errors };
    setErrors(combinedErrors);
    if (Object.keys(combinedErrors).length > 0) {
      const firstError = Object.values(combinedErrors)[0];
      setFeedback({ message: firstError, type: 'error' });
      return;
    }

    setIsSaving(true);
    const dueBalanceValue = parseFloat(formData.dueBalance);
    const timestamp = new Date().toISOString();
    const supplierId = editingSupplier ? editingSupplier.id : `supp-${Date.now()}`;

    // Preserve older fields if editing an initial supplier so they don't get cleared
    const finalSupplierData: Supplier = {
      ...editingSupplier,
      id: supplierId,
      name: formData.name.trim(),
      nameArabic: formData.nameArabic.trim() ? formData.nameArabic.trim() : undefined,
      phone: formData.phone.trim(),
      email: formData.email.trim() ? formData.email.trim() : undefined,
      vatNumber: formData.vatNumber.trim() ? formData.vatNumber.trim() : undefined,
      address: formData.address.trim(),
      paymentType: formData.paymentType,
      dueBalance: dueBalanceValue,
      createdDate: editingSupplier?.createdDate || timestamp,
      status: formData.status
    };

    try {
      if (!auth.currentUser) {
        const saved = localStorage.getItem('inventory_suppliers');
        let currentList: Supplier[] = saved ? JSON.parse(saved) : [];
        if (editingSupplier) {
          currentList = currentList.map(s => s.id === supplierId ? finalSupplierData : s);
        } else {
          currentList = [finalSupplierData, ...currentList];
        }
        localStorage.setItem('inventory_suppliers', JSON.stringify(currentList));
        setSuppliers(currentList);

        setFeedback({
          message: editingSupplier 
            ? `Successfully updated details for supplier "${finalSupplierData.name}" (Local Only)` 
            : `Permanently registered supplier profile "${finalSupplierData.name}" locally`,
          type: 'success'
        });
        setIsFormOpen(false);
        setIsSaving(false);
        return;
      }

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
    
    // Relationship protection / transaction block checks
    const hasPurchases = purchases.some((p: any) => p.supplierId === id);
    const hasPayments = supplierPayments.some((p: any) => p.supplierId === id);
    const hasBalance = (supplierToDelete.dueBalance ?? 0) !== 0;

    if (hasPurchases || hasPayments || hasBalance) {
      const reasons: string[] = [];
      if (hasPurchases) reasons.push("purchase history");
      if (hasPayments) reasons.push("payment history");
      if (hasBalance) reasons.push(`outstanding balance due (${formatCurrency(supplierToDelete.dueBalance ?? 0)})`);

      const reasonText = reasons.join(", ");
      setFeedback({ 
        message: `Deletion blocked! Supplier "${name}" cannot be deleted because they have associated ${reasonText}.`, 
        type: 'error' 
      });
      setIsSaving(false);
      return;
    }

    try {
      if (!auth.currentUser) {
        const saved = localStorage.getItem('inventory_suppliers');
        let currentList: Supplier[] = saved ? JSON.parse(saved) : [];

        const updatedSupplier: Supplier = {
          ...supplierToDelete,
          status: 'inactive'
        };
        currentList = currentList.map(s => s.id === id ? updatedSupplier : s);
        localStorage.setItem('inventory_suppliers', JSON.stringify(currentList));
        setSuppliers(currentList);
        setFeedback({ message: `Supplier record "${name}" has been safely retired as "inactive" locally.`, type: 'success' });
        setIsSaving(false);
        return;
      }

      // Soft-delete if no transactions to preserve business integrity and history reports
      const updatedSupplier: Supplier = {
        ...supplierToDelete,
        status: 'inactive'
      };
      await setDoc(doc(db, 'suppliers', id), updatedSupplier);

      await logSystemActivity(
        "Supplier inactivated",
        `Marked supplier "${name}" (ID: ${id}) as inactive.`
      );
      setFeedback({ 
        message: `Supplier "${name}" has been safely retired and marked as "inactive".`, 
        type: 'success' 
      });
    } catch (err: any) {
      console.error("Delete supplier error:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `suppliers/${id}`);
      } catch (dbErr: any) {
        setFeedback({ message: `Inactivation unsuccessful: ${dbErr.message}`, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Filtered Suppliers ---
  const filteredSuppliers = suppliers.filter(supplier => {
    // Hide inactive suppliers from standard listings
    if (isInactiveStatus(supplier.status)) return false;

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
  const outstandingCostTotal = suppliers.filter(s => !isInactiveStatus(s.status)).reduce((sum, item) => sum + (item.dueBalance ?? 0), 0);
  const creditAccountsCount = suppliers.filter(s => !isInactiveStatus(s.status) && (s.paymentType || 'Cash') === 'Credit').length;
  const cashAccountsCount = suppliers.filter(s => !isInactiveStatus(s.status) && (s.paymentType || 'Cash') === 'Cash').length;

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
      <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-3">
        {/* Total Suppliers */}
        <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between w-full min-w-0 animate-fade-in">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Total Suppliers</span>
              <div className="p-1 px-2.5 rounded-full text-[10px] font-extrabold bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center gap-1 shrink-0">
                Active <ChevronRight className="h-2.5 w-2.5" />
              </div>
            </div>
            {loading ? (
              <div className="h-8 w-12 bg-slate-100 rounded-lg animate-pulse"></div>
            ) : (
              <ResponsiveKPIValue value={suppliers.filter(s => !isInactiveStatus(s.status)).length} className="text-slate-900" />
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 truncate">
            Registered procurement channels
          </div>
        </div>

        {/* Due Portfolio Balance */}
        <div className="bg-rose-50 rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-rose-100 flex flex-col justify-between w-full min-w-0 animate-fade-in">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Total Unpaid Balance</span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0"></span>
            </div>
            {loading ? (
              <div className="h-8 w-28 bg-rose-200/50 rounded-lg animate-pulse"></div>
            ) : (
              <ResponsiveKPIValue value={formatCurrency(outstandingCostTotal)} className="text-rose-900" />
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-rose-200/50 text-[11px] text-rose-700/80 truncate">
            Aggregate active trade payable credit
          </div>
        </div>

        {/* Account Distribution */}
        <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between w-full min-w-0 animate-fade-in">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Payment Terms</span>
              <CreditCard className="h-4 w-4 text-indigo-500 shrink-0" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 font-bold uppercase leading-none truncate">Cash</p>
                {loading ? (
                  <div className="h-7 w-10 bg-slate-100 rounded-lg animate-pulse mt-1"></div>
                ) : (
                  <p className="text-lg sm:text-xl font-bold text-slate-800 mt-1 truncate">{cashAccountsCount}</p>
                )}
              </div>
              <div className="border-l border-slate-100 pl-3 min-w-0">
                <p className="text-[10px] text-slate-400 font-bold uppercase leading-none truncate">Credit</p>
                {loading ? (
                  <div className="h-7 w-10 bg-slate-100 rounded-lg animate-pulse mt-1"></div>
                ) : (
                  <p className="text-lg sm:text-xl font-bold text-slate-800 mt-1 truncate">{creditAccountsCount}</p>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-indigo-600 font-bold flex items-center gap-1 truncate">
            <TrendingUp className="h-3 w-3 shrink-0" /> Supply channel settlement
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

              {permissions.createSupplier && (
                <button
                  type="button"
                  onClick={() => openForm()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer"
                >
                  <Truck className="h-4 w-4" />
                  <span>New Supplier</span>
                </button>
              )}
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
                <motion.div 
                  initial={{ opacity: 0, y: 12 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ duration: 0.3 }}
                  className="mx-auto max-w-md w-full my-6 bg-slate-50/50 border border-slate-200/60 rounded-3xl p-8 text-center flex flex-col items-center gap-4.5 shadow-3xs hover:shadow-2xs transition-all"
                >
                  <div className="relative group">
                    <div className="absolute inset-0 bg-indigo-200/20 rounded-full blur-xl group-hover:scale-125 transition duration-300"></div>
                    <div className="relative w-16 h-16 bg-white border border-slate-100 rounded-2xl shadow-3xs flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-all duration-300">
                      <Truck className="h-8 w-8 text-slate-400 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest leading-none">
                      {suppliers.length === 0 ? 'No Suppliers Registered' : 'No Suppliers Found'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed font-semibold">
                      {suppliers.length === 0 
                        ? 'Begin registering your supplier channels to execute stock procurements and reconcile payables.'
                        : searchQuery || filterType !== 'All'
                          ? "We couldn't track down any matching records under your search parameters or filter limits."
                          : 'No matching suppliers found. Clear your filters or create a new supplier entry.'}
                    </p>
                  </div>
                  <div className="flex gap-2.5 pt-1.5 flex-wrap justify-center">
                    {suppliers.length > 0 && (searchQuery || filterType !== 'All') ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setFilterType('All');
                        }}
                        className="bg-white border border-slate-200 hover:border-slate-350 text-slate-700 font-extrabold text-[11px] uppercase tracking-wider px-5 py-2.5 rounded-xl transition cursor-pointer shadow-3xs"
                      >
                        Reset Search Filters
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openForm()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] uppercase tracking-wider h-10 px-5 rounded-xl transition cursor-pointer shadow-xs hover:shadow-md inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Register First Supplier</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-left border-collapse table-auto">
                      <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-4 px-6">Supplier Channel</th>
                          <th className="py-4 px-5">Type / Status</th>
                          <th className="py-4 px-5">Contact Details</th>
                          <th className="py-4 px-5">Representative</th>
                          <th className="py-4 px-5 text-right">Outstanding Payable</th>
                          <th className="py-4 px-6 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                        {filteredSuppliers.map((supplier) => (
                          <tr 
                            key={supplier.id}
                            className="hover:bg-indigo-50/20 even:bg-slate-50/30 transition duration-150"
                          >
                            <td className="py-4 px-6 font-bold text-slate-900 whitespace-nowrap">
                              <div>{supplier.name}</div>
                              {supplier.createdDate && (
                                <span className="text-[9px] font-normal text-slate-400">
                                  Since {new Date(supplier.createdDate).toLocaleDateString(undefined, { dateStyle: 'short' })}
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-5 whitespace-nowrap space-x-1.5 matches-status-design font-sans">
                              <span className={`inline-flex items-center px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-full border shadow-3xs ${
                                (supplier.paymentType || 'Cash') === 'Credit' 
                                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-250/60'
                              }`}>
                                {(supplier.paymentType || 'Cash')} Terms
                              </span>
                              {isInactiveStatus(supplier.status) ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-full bg-slate-50 text-slate-500 border border-slate-200 shadow-3xs">
                                  Inactive
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-3xs">
                                  Active
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-5 whitespace-nowrap">
                              <div className="flex flex-col gap-0.5">
                                <span className="flex items-center gap-1.5 text-slate-700">
                                  <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  <span>{supplier.phone}</span>
                                </span>
                                <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate max-w-[200px]">{supplier.address || 'No Address'}</span>
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-5 whitespace-nowrap">
                              {supplier.contactPerson ? (
                                <div>
                                  <div className="font-bold text-slate-805 text-slate-805">{supplier.contactPerson}</div>
                                  {supplier.email && <div className="text-[10px] text-indigo-500">{supplier.email}</div>}
                                </div>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className={`py-4 px-5 text-right font-black font-mono whitespace-nowrap text-sm ${
                              (supplier.dueBalance ?? 0) > 0 ? 'text-amber-600' : 'text-slate-700'
                            }`}>
                              {formatCurrency(supplier.dueBalance ?? 0)}
                            </td>
                            <td className="py-4 px-6 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleViewStatement(supplier)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-50 transition"
                                  title="View Account Ledger Statement"
                                >
                                  <FileText className="h-4 w-4" />
                                </button>
                                {permissions.editSupplier && (
                                  <button
                                    type="button"
                                    onClick={() => openForm(supplier)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition"
                                    title="Edit supplier contract terms"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                )}
                                {permissions.deleteSupplier && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteClick(supplier)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-50 transition"
                                    title="Delete supplier permanently from channels"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                    <span className="font-bold">{suppliers.filter(s => !isInactiveStatus(s.status)).length > 0 ? Math.round((creditAccountsCount / suppliers.filter(s => !isInactiveStatus(s.status)).length) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" 
                      style={{ width: `${suppliers.filter(s => !isInactiveStatus(s.status)).length > 0 ? (creditAccountsCount / suppliers.filter(s => !isInactiveStatus(s.status)).length) * 100 : 0}%` }}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm font-sans">
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
              <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
                
                {/* Supplier Name */}
                <div className="relative w-full">
                  <input
                    type="text"
                    required
                    id="form-supplier-name-field"
                    disabled={isSaving}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder=" "
                    className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                      errors.name 
                        ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                        : 'border-slate-200 focus:border-indigo-600 focus:ring-indigo-650'
                    }`}
                  />
                  <label htmlFor="form-supplier-name-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                    Supplier Name <span className="text-rose-500 font-extrabold">*</span>
                  </label>
                  {errors.name && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                      <span>{errors.name}</span>
                    </div>
                  )}
                </div>

                {/* Supplier Name (Arabic) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="form-supplier-name-arabic-field" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Supplier Name (Arabic)
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        setTranslationNotice(null);
                        const sourceName = (formData.name || '').trim();
                        if (!sourceName) {
                          setTranslationNotice({ type: 'warning', message: 'Please enter a Supplier Name first.' });
                          return;
                        }
                        const res = await TranslationService.translateToArabic(sourceName);
                        if (res.success && res.translatedText) {
                          setFormData(prev => ({ ...prev, nameArabic: res.translatedText }));
                          setTranslationNotice({ type: 'success', message: `Arabic name generated: ${res.translatedText}` });
                        } else {
                          setTranslationNotice({ type: 'warning', message: res.message || 'Translation not found in offline dictionary.' });
                        }
                      }}
                      className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md transition border border-indigo-100/80 cursor-pointer"
                    >
                      Generate Arabic
                    </button>
                  </div>
                  <input
                    type="text"
                    id="form-supplier-name-arabic-field"
                    dir="rtl"
                    disabled={isSaving}
                    value={formData.nameArabic}
                    onChange={(e) => setFormData({ ...formData, nameArabic: e.target.value })}
                    placeholder="اسم المورد (اختياري)"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 focus:border-indigo-650 h-[42px] text-right font-sans"
                  />
                  {translationNotice && (
                    <div className={`mt-1.5 text-[11px] font-semibold px-3 py-2 rounded-xl flex items-center justify-between border shadow-3xs transition-all ${
                      translationNotice.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                        : 'bg-amber-50 text-amber-800 border-amber-200/80'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        {translationNotice.type === 'success' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        )}
                        <span>{translationNotice.message}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTranslationNotice(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Grid row: Phone & Payment Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Phone */}
                  <div className="relative w-full">
                    <input
                      type="text"
                      required
                      id="form-supplier-phone-field"
                      disabled={isSaving}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                        errors.phone 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                          : 'border-slate-200 focus:border-indigo-600 focus:ring-indigo-650'
                      }`}
                    />
                    <label htmlFor="form-supplier-phone-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      Phone Number <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {errors.phone && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                        <span>{errors.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Payment Type */}
                  <div className="relative w-full">
                    <select
                      id="form-supplier-payment-field"
                      disabled={isSaving}
                      value={formData.paymentType}
                      onChange={(e) => setFormData({ ...formData, paymentType: e.target.value as 'Cash' | 'Credit' })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition cursor-pointer disabled:opacity-60 disabled:bg-slate-50 text-slate-800 h-[52px]"
                    >
                      <option value="Cash">Cash Account (Settled Immediately)</option>
                      <option value="Credit">Credit Terms (deferred invoice)</option>
                    </select>
                    <label htmlFor="form-supplier-payment-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none">
                      Payment Type <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                  </div>
                </div>

                {/* Address */}
                <div className="relative w-full">
                  <textarea
                    rows={2}
                    id="form-supplier-address-field"
                    disabled={isSaving}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder=" "
                    className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none resize-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 min-h-[70px] ${
                      errors.address 
                        ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                        : 'border-slate-200 focus:border-indigo-600 focus:ring-indigo-650'
                    }`}
                  />
                  <label htmlFor="form-supplier-address-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                    Address Description
                  </label>
                  {errors.address && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                      <span>{errors.address}</span>
                    </div>
                  )}
                </div>

                {/* Optional Supplier info: VAT and Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 animate-fade-in">
                  <div className="relative w-full">
                    <input
                      type="text"
                      id="form-supplier-vat-field"
                      disabled={isSaving}
                      value={formData.vatNumber}
                      onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 h-[52px] ${
                        errors.vatNumber 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                          : 'border-slate-200 focus:border-indigo-600 focus:ring-indigo-650'
                      }`}
                    />
                    <label htmlFor="form-supplier-vat-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      VAT Registration No. (Optional)
                    </label>
                    {errors.vatNumber && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                        <span>{errors.vatNumber}</span>
                      </div>
                    )}
                  </div>

                  <div className="relative w-full">
                    <input
                      type="email"
                      id="form-supplier-email-field"
                      disabled={isSaving}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 h-[52px] ${
                        errors.email 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                          : 'border-slate-200 focus:border-indigo-600 focus:ring-indigo-650'
                      }`}
                    />
                    <label htmlFor="form-supplier-email-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      Email Address (Optional)
                    </label>
                    {errors.email && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                        <span>{errors.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Due Balance */}
                <div className="relative w-full">
                  <span className="absolute left-3.5 top-4.5 text-xs font-bold text-slate-400 shrink-0">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    id="form-supplier-due-field"
                    disabled={isSaving || !!editingSupplier}
                    value={formData.dueBalance}
                    onChange={(e) => setFormData({ ...formData, dueBalance: e.target.value })}
                    placeholder=" "
                    className={`peer w-full rounded-xl border pl-7 pr-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                      errors.dueBalance 
                        ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                        : 'border-slate-200 focus:border-indigo-600 focus:ring-indigo-650'
                    }`}
                  />
                  <label htmlFor="form-supplier-due-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-placeholder-shown:left-7 peer-focus:top-1.5 peer-focus:left-3.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                    Outstanding Due Balance ($) <span className="text-rose-500 font-extrabold">*</span>
                  </label>
                  {errors.dueBalance ? (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                      <span>{errors.dueBalance}</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1.5 pl-1 font-sans">Outstanding liabilities owed to this supplier. Default is 0.00.</p>
                  )}
                </div>

                {/* Show status selection only when editing an existing supplier */}
                {editingSupplier && (
                  <div className="relative w-full">
                    <select
                      id="form-supplier-status-field"
                      disabled={isSaving}
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition cursor-pointer disabled:opacity-60 disabled:bg-slate-50 text-slate-800 h-[52px]"
                    >
                      <option value="active">Active (Available for transactions)</option>
                      <option value="inactive">Inactive (Suspended / Read-only)</option>
                    </select>
                    <label htmlFor="form-supplier-status-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none">
                      Supplier Status <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                  </div>
                )}

                {/* Action buttons footer */}
                <div className="flex justify-end items-center gap-3 pt-5 border-t border-slate-100">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm font-sans">
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
