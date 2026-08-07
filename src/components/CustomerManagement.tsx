import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
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
  FileText,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError, logSystemActivity } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { Customer } from '../types';
import { calculateCustomerLedger, isInactiveStatus } from '../lib/utils';
import { ResponsiveKPIValue } from './MetricCard';
import { usePermission, UserRole } from '../hooks/usePermission';
import { formatCurrency } from '../utils/currencyFormatter';
import { EnterpriseIdentityValidationService } from '../services/validation/EnterpriseIdentityValidationService';
import { TranslationService } from '../services/translation/TranslationService';

export default function CustomerManagement({ userRole = 'admin' }: { userRole?: UserRole }) {
  const { permissions } = usePermission({ role: userRole });

  // --- State ---
  const [customersState, setCustomersState] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'Cash' | 'Credit'>('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // --- Form Fields State ---
  const [formData, setFormData] = useState({
    name: '',
    nameArabic: '',
    phone: '',
    address: '',
    customerType: 'Cash' as 'Cash' | 'Credit',
    dueBalance: '',
    status: 'active' as 'active' | 'inactive',
    vatNumber: '',
    email: ''
  });
  
  // --- Validation Errors State ---
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [translationNotice, setTranslationNotice] = useState<{ type: 'success' | 'warning'; message: string } | null>(null);

  const [sales, setSales] = useState<any[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);

  // --- Real-time Firestore Sync ---
  useEffect(() => {
    if (!auth.currentUser) {
      // Local fallback
      const saved = localStorage.getItem('inventory_customers');
      setCustomersState(saved ? JSON.parse(saved) : []);

      const savedSales = localStorage.getItem('inventory_sales') || '[]';
      setSales(JSON.parse(savedSales));

      const savedPayments = localStorage.getItem('inventory_customer_payments') || '[]';
      setCustomerPayments(JSON.parse(savedPayments));

      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const customerList: Customer[] = [];
      snapshot.forEach((docSnap) => {
        customerList.push(docSnap.data() as Customer);
      });
      // Sort customers by createdDate descending
      customerList.sort((a, b) => {
        const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
        const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
        return dateB - dateA;
      });
      setCustomersState(customerList);
      setLoading(false);
    }, (err) => {
      console.error("Customers list synchronize error:", err);
      let errMsg = 'Failed to synchronize customers list with Firestore database.';
      try {
        handleFirestoreError(err, OperationType.LIST, 'customers');
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }
      setError(errMsg);
      setFeedback({ message: errMsg, type: 'error' });
      setLoading(false);
    });

    const unsubSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
      const salesList: any[] = [];
      snapshot.forEach((docSnap) => {
        salesList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setSales(salesList);
    });

    const unsubPayments = onSnapshot(collection(db, 'customerPayments'), (snapshot) => {
      const paymentsList: any[] = [];
      snapshot.forEach((docSnap) => {
        paymentsList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setCustomerPayments(paymentsList);
    });

    return () => {
      unsubCustomers();
      unsubSales();
      unsubPayments();
    };
  }, []);

  const customers = useMemo(() => {
    return customersState.map(c => {
      const rawDue = calculateCustomerLedger(sales, customerPayments, c.id, c.dueBalance);
      return {
        ...c,
        dueBalance: Math.max(0, rawDue),
        customerCredit: rawDue < 0 ? Math.abs(rawDue) : 0
      };
    });
  }, [customersState, sales, customerPayments]);

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
      if (customEvent.detail?.tab === 'customers') {
        openForm();
      }
    };
    window.addEventListener('nexus-trigger-add-modal', handleTrigger);
    return () => window.removeEventListener('nexus-trigger-add-modal', handleTrigger);
  }, []);

  // --- Open Form for Create/Edit ---
  const openForm = (customer: Customer | null = null) => {
    if (customer) {
      setEditingCustomer(customer);
      // Retrieve the original opening balance from customersState to prevent overwriting it on save
      const originalCust = customersState.find(c => c.id === customer.id);
      const openingBalance = originalCust ? originalCust.dueBalance : customer.dueBalance;
      setFormData({
        name: customer.name,
        nameArabic: customer.nameArabic || '',
        phone: customer.phone,
        address: customer.address,
        customerType: customer.customerType,
        dueBalance: openingBalance.toString(),
        status: customer.status || 'active',
        vatNumber: customer.vatNumber || '',
        email: customer.email || ''
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: '',
        nameArabic: '',
        phone: '',
        address: '',
        customerType: 'Cash',
        dueBalance: '0',
        status: 'active',
        vatNumber: '',
        email: ''
      });
    }
    setErrors({});
    setIsFormOpen(true);
  };

  // --- Form Validation ---
  const validateForm = async () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Customer name is required';
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
      currentEntityId: editingCustomer ? editingCustomer.id : undefined,
      currentCollection: 'customers',
      localCustomers: customersState
    });

    const combinedErrors = { ...newErrors, ...validationResult.errors };
    setErrors(combinedErrors);
    return Object.keys(combinedErrors).length === 0;
  };

  // --- Submit Create / Edit ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Perform instant local check for error feedback dispatching
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Customer name is required';
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
      currentEntityId: editingCustomer ? editingCustomer.id : undefined,
      currentCollection: 'customers',
      localCustomers: customersState
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
    const customerId = editingCustomer ? editingCustomer.id : `cust-${Date.now()}`;

    const finalCustomerData: Customer = {
      id: customerId,
      name: formData.name.trim(),
      nameArabic: formData.nameArabic.trim() ? formData.nameArabic.trim() : undefined,
      phone: formData.phone.trim(),
      address: formData.address.trim(),
      customerType: formData.customerType,
      dueBalance: dueBalanceValue,
      createdDate: editingCustomer ? editingCustomer.createdDate : timestamp,
      status: formData.status,
      vatNumber: formData.vatNumber.trim() ? formData.vatNumber.trim() : undefined,
      email: formData.email.trim() ? formData.email.trim() : undefined
    };

    try {
      if (!auth.currentUser) {
        const saved = localStorage.getItem('inventory_customers');
        let currentList: Customer[] = saved ? JSON.parse(saved) : [];
        if (editingCustomer) {
          currentList = currentList.map(c => c.id === customerId ? finalCustomerData : c);
        } else {
          currentList = [finalCustomerData, ...currentList];
        }
        localStorage.setItem('inventory_customers', JSON.stringify(currentList));
        setCustomersState(currentList);

        setFeedback({
          message: editingCustomer 
            ? `Successfully updated details for ${finalCustomerData.name} (Local Only)` 
            : `Permanently registered customer profile ${finalCustomerData.name} locally`,
          type: 'success'
        });
        setIsFormOpen(false);
        setIsSaving(false);
        return;
      }

      await setDoc(doc(db, 'customers', customerId), finalCustomerData);
      if (!editingCustomer) {
        await logSystemActivity(
          "Customer created",
          `Registered new customer profile: ${finalCustomerData.name} (Phone: ${finalCustomerData.phone}, Initial Balance: $${finalCustomerData.dueBalance})`
        );
      } else {
        await logSystemActivity(
          "Customer edited",
          `Updated details for customer profile: ${finalCustomerData.name}`
        );
      }
      setFeedback({
        message: editingCustomer 
          ? `Successfully updated details for ${finalCustomerData.name}` 
          : `Permanently registered customer profile ${finalCustomerData.name}`,
        type: 'success'
      });
      setIsFormOpen(false);
    } catch (err: any) {
      console.error("Save customer error:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `customers/${customerId}`);
      } catch (dbErr: any) {
        setFeedback({ message: `Failed to save customer: ${dbErr.message}`, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Delete Customer ---
  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
  };

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;
    const name = customerToDelete.name;
    const id = customerToDelete.id;
    setCustomerToDelete(null);

    setIsSaving(true);
    
    // Relationship protection / transaction block check
    const hasSales = sales.some((s: any) => s.customerId === id);
    const hasPayments = customerPayments.some((p: any) => p.customerId === id);
    const hasBalance = (customerToDelete.dueBalance ?? 0) !== 0 || (customerToDelete.customerCredit ?? 0) !== 0;

    if (hasSales || hasPayments || hasBalance) {
      const reasons: string[] = [];
      if (hasSales) reasons.push("sales history");
      if (hasPayments) reasons.push("payment history");
      if (hasBalance) reasons.push(`outstanding ledger balance (${formatCurrency(customerToDelete.dueBalance ?? 0)})`);

      const reasonText = reasons.join(", ");
      setFeedback({
        message: `Deletion blocked! Customer "${name}" cannot be deleted because they have associated ${reasonText}.`,
        type: 'error'
      });
      setIsSaving(false);
      return;
    }

    try {
      if (!auth.currentUser) {
        const saved = localStorage.getItem('inventory_customers');
        let currentList: Customer[] = saved ? JSON.parse(saved) : [];

        const updatedCustomer: Customer = {
          ...customerToDelete,
          status: 'inactive'
        };
        currentList = currentList.map(c => c.id === id ? updatedCustomer : c);
        localStorage.setItem('inventory_customers', JSON.stringify(currentList));
        setCustomersState(currentList);
        setFeedback({ message: `Customer record "${name}" has been safely retired as "inactive" locally.`, type: 'success' });
        
        setIsSaving(false);
        return;
      }

      // Soft-delete if no transactions to preserve business ledger and audit histories
      const updatedCustomer: Customer = {
        ...customerToDelete,
        status: 'inactive'
      };
      await setDoc(doc(db, 'customers', id), updatedCustomer);

      await logSystemActivity(
        "Customer inactivated",
        `Marked customer "${name}" (ID: ${id}) as inactive.`
      );
      setFeedback({ 
        message: `Customer "${name}" has been safely retired and marked as "inactive".`, 
        type: 'success' 
      });
    } catch (err: any) {
      console.error("Delete customer error:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `customers/${id}`);
      } catch (dbErr: any) {
        setFeedback({ message: `Inactivation unsuccessful: ${dbErr.message}`, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Filtered Customers Summary ---
  const filteredCustomers = customers.filter(customer => {
    // Hide inactive customers from standard listings
    if (isInactiveStatus(customer.status)) return false;

    const matchesSearch = 
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone.includes(searchQuery) ||
      customer.address.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterType === 'All') return matchesSearch;
    return matchesSearch && customer.customerType === filterType;
  });

  // --- Analytical Calculations ---
  const outstandingBalanceTotal = customers.filter(c => !isInactiveStatus(c.status)).reduce((sum, item) => sum + item.dueBalance, 0);
  const customerCreditTotal = customers.filter(c => !isInactiveStatus(c.status)).reduce((sum, item) => sum + (item.customerCredit || 0), 0);
  const creditAccountsCount = customers.filter(c => !isInactiveStatus(c.status) && c.customerType === 'Credit').length;
  const cashAccountsCount = customers.filter(c => !isInactiveStatus(c.status) && c.customerType === 'Cash').length;

  return (
    <div id="customer-registry-view" className="space-y-8 animate-fade-in">
      
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
              <span className="w-2 h-2 rounded-full bg-emerald-55 bg-emerald-500 animate-pulse"></span>
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            )}
            <p>{feedback.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* METRIC BENTO CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Customers */}
        <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between w-full min-w-0 animate-fade-in">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Total Customers</span>
              <div className="p-1 px-2.5 rounded-full text-[10px] font-extrabold bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center gap-1 shrink-0">
                Active <ChevronRight className="h-2.5 w-2.5" />
              </div>
            </div>
            {loading ? (
              <div className="h-8 w-12 bg-slate-100 rounded-lg animate-pulse"></div>
            ) : (
              <ResponsiveKPIValue value={customers.filter(c => !isInactiveStatus(c.status)).length} className="text-slate-900" />
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 truncate">
            Registered ledger records
          </div>
        </div>

        {/* Due Portfolio Balance */}
        <div className="bg-rose-50 rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-rose-100 flex flex-col justify-between w-full min-w-0 animate-fade-in">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Total Outstanding</span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0"></span>
            </div>
            {loading ? (
              <div className="h-8 w-28 bg-rose-200/50 rounded-lg animate-pulse"></div>
            ) : (
              <ResponsiveKPIValue value={formatCurrency(outstandingBalanceTotal)} className="text-rose-900" />
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-rose-200/50 text-[11px] text-rose-700/80 truncate">
            Aggregate active customer dues
          </div>
        </div>

        {/* Customer Credit Portfolio Balance */}
        <div className="bg-emerald-50 rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-emerald-100 flex flex-col justify-between w-full min-w-0 animate-fade-in">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Customer Credit</span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
            </div>
            {loading ? (
              <div className="h-8 w-28 bg-emerald-200/50 rounded-lg animate-pulse"></div>
            ) : (
              <ResponsiveKPIValue value={formatCurrency(customerCreditTotal)} className="text-slate-900" />
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-emerald-200/50 text-[11px] text-emerald-700/85 truncate">
            Advance overpaid customer balances
          </div>
        </div>

        {/* Account Distribution */}
        <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between w-full min-w-0 animate-fade-in">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Account Types</span>
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
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-indigo-600 font-bold flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Ledger breakdown report
          </div>
        </div>
      </div>

      {/* WORKING GRAPHIC AND LIST AREA */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left span 2: Customers directory list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
            
            {/* Header / Filter Toolbar */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-sans text-lg font-bold tracking-tight text-slate-900">
                  Customer Master Directory
                </h3>
                <p className="text-xs text-slate-450 text-slate-400 mt-0.5">
                  Update customer credit status, address profiles and balances
                </p>
              </div>

              {permissions.createCustomer && (
                <button
                  type="button"
                  onClick={() => openForm()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer animate-fade-in"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>New Customer</span>
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
                  placeholder="Search by name, phone or address..."
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

            {/* Customers list container */}
            <div className="space-y-4 pt-2">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="border border-slate-200 rounded-2xl p-5 bg-white animate-pulse flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
              ) : filteredCustomers.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, y: 12 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ duration: 0.3 }}
                  className="mx-auto max-w-md w-full my-6 bg-slate-50/50 border border-slate-200/60 rounded-3xl p-8 text-center flex flex-col items-center gap-4.5 shadow-3xs hover:shadow-2xs transition-all"
                >
                  <div className="relative group">
                    <div className="absolute inset-0 bg-indigo-200/20 rounded-full blur-xl group-hover:scale-125 transition duration-300"></div>
                    <div className="relative w-16 h-16 bg-white border border-slate-100 rounded-2xl shadow-3xs flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-all duration-300">
                      <Users className="h-8 w-8 text-slate-400 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest leading-none">
                      {customersState.length === 0 ? 'No Customers Registered' : 'No Customers Found'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed font-semibold">
                      {customersState.length === 0 
                        ? 'Begin registering your accounts and clients to activate trade logs, billing lists, and outstanding ledger records.'
                        : searchQuery || filterType !== 'All'
                          ? "We couldn't find any profiles matching your search filters or active segment types."
                          : 'No matching records were located. Clear your filtering parameters or create a new registry.'}
                    </p>
                  </div>
                  <div className="flex gap-2.5 pt-1.5 flex-wrap justify-center">
                    {customersState.length > 0 && (searchQuery || filterType !== 'All') ? (
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
                        <span>Register First Customer</span>
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
                          <th className="py-4 px-6">Customer Name</th>
                          <th className="py-4 px-5">Type / Status</th>
                          <th className="py-4 px-5">Contact Details</th>
                          <th className="py-4 px-5">Date Added</th>
                          <th className="py-4 px-5 text-right">Outstanding Due</th>
                          <th className="py-4 px-5 text-right">Customer Credit</th>
                          <th className="py-4 px-6 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                        {filteredCustomers.map((customer) => (
                          <tr 
                            key={customer.id} 
                            className="hover:bg-indigo-50/20 even:bg-slate-50/30 transition duration-150"
                          >
                            <td className="py-4 px-6 font-bold text-slate-900 whitespace-nowrap">
                              {customer.name}
                            </td>
                            <td className="py-4 px-5 whitespace-nowrap space-x-1.5 matches-status-design font-sans">
                              <span className={`inline-flex items-center px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-full border shadow-3xs ${
                                customer.customerType === 'Credit' 
                                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-250/60'
                              }`}>
                                {customer.customerType} Account
                              </span>
                              {isInactiveStatus(customer.status) ? (
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
                                  <span>{customer.phone}</span>
                                </span>
                                <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate max-w-[200px]">{customer.address || 'No Address'}</span>
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-5 font-mono text-slate-500 whitespace-nowrap">
                              {new Date(customer.createdDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                            </td>
                            <td className={`py-4 px-5 text-right font-black font-mono whitespace-nowrap text-sm ${
                              customer.dueBalance > 0 ? 'text-rose-600' : 'text-slate-700'
                            }`}>
                              {formatCurrency(customer.dueBalance)}
                            </td>
                            <td className="py-4 px-5 text-right font-black font-mono text-emerald-600 whitespace-nowrap text-sm">
                              {(customer.customerCredit || 0) > 0 ? (
                                formatCurrency(customer.customerCredit)
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="py-4 px-6 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    sessionStorage.setItem('nexus_target_customer_id', customer.id);
                                    sessionStorage.setItem('nexus_target_report_type', 'customer_statement');
                                    window.dispatchEvent(new CustomEvent('nexus-change-tab', { detail: 'reports' }));
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 transition cursor-pointer"
                                  title="View customer ledger statement"
                                >
                                  <FileText className="h-4 w-4" />
                                </button>
                                {permissions.editCustomer && (
                                  <button
                                    type="button"
                                    onClick={() => openForm(customer)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition cursor-pointer"
                                    title="Edit customer account details"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                )}
                                {permissions.deleteCustomer && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteClick(customer)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition cursor-pointer"
                                    title="Delete customer record permanently"
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

        {/* Right side panel (Col 1): Actions & dynamic operations */}
        <div className="space-y-6">
          {/* Quick Informational Guide Bento */}
          <div className="bg-slate-900 text-white rounded-[2rem] p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold uppercase text-[10px] tracking-widest text-slate-400">Registry Rules</h4>
                <span className="flex h-2 w-2 rounded-full bg-emerald-400"></span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Customers flagged as <strong className="text-orange-400 font-extrabold">Credit Only</strong> are allowed transactional invoice deferral terms. Trade audit rules apply on balances exceeding standard allocations.
              </p>
              
              <div className="mt-6 border-t border-slate-800 pt-4 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Trade Sync Server</span>
                  <span className="font-mono text-[10px] bg-slate-800 text-slate-200 px-2 py-0.5 rounded">Active</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-sans">Sync Resolution</span>
                  <span className="font-mono text-[10px] text-indigo-400">Real-Time</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Credit Limit Statistics Bento */}
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <h4 className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Aggregate Health metrics</h4>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                    <span>Credit Ratio</span>
                    <span className="font-bold">{customers.filter(c => !isInactiveStatus(c.status)).length > 0 ? Math.round((creditAccountsCount / customers.filter(c => !isInactiveStatus(c.status)).length) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" 
                      style={{ width: `${customers.filter(c => !isInactiveStatus(c.status)).length > 0 ? (creditAccountsCount / customers.filter(c => !isInactiveStatus(c.status)).length) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                    <span>Outstanding Risk limit</span>
                    <span className="font-bold">Normal</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-1.5 rounded-full w-4/12"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-5 text-[10px] text-slate-400 leading-normal uppercase font-bold tracking-wider">
              Automatic alert dispatches route to administrative users on critical credit thresholds.
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
              <div className="flex items-center justify-between border-b border-slate-150 border-slate-100 px-6 sm:px-8 py-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingCustomer ? `Modify Profile: ${editingCustomer.name}` : 'Register New Customer Account'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure customer account data and terms
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsFormOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-800 transition rounded-lg hover:bg-slate-50 disabled:opacity-40"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form container body */}
              <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
                
                {/* Customer Name */}
                <div className="relative w-full">
                  <input
                    type="text"
                    required
                    id="form-customer-name-field"
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
                  <label htmlFor="form-customer-name-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                    Customer Name <span className="text-rose-500 font-extrabold">*</span>
                  </label>
                  {errors.name && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                      <span>{errors.name}</span>
                    </div>
                  )}
                </div>

                {/* Customer Name (Arabic) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="form-customer-name-arabic-field" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Customer Name (Arabic)
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        setTranslationNotice(null);
                        const sourceName = (formData.name || '').trim();
                        if (!sourceName) {
                          setTranslationNotice({ type: 'warning', message: 'Please enter a Customer Name first.' });
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
                    id="form-customer-name-arabic-field"
                    dir="rtl"
                    disabled={isSaving}
                    value={formData.nameArabic}
                    onChange={(e) => setFormData({ ...formData, nameArabic: e.target.value })}
                    placeholder="اسم العميل (اختياري)"
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

                {/* Grid row: Phone & Customer Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Phone */}
                  <div className="relative w-full">
                    <input
                      type="text"
                      required
                      id="form-customer-phone-field"
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
                    <label htmlFor="form-customer-phone-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      Phone Number <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {errors.phone && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                        <span>{errors.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Customer Type */}
                  <div className="relative w-full">
                    <select
                      id="form-customer-type-field"
                      disabled={isSaving}
                      value={formData.customerType}
                      onChange={(e) => setFormData({ ...formData, customerType: e.target.value as 'Cash' | 'Credit' })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition cursor-pointer disabled:opacity-60 disabled:bg-slate-50 text-slate-800 h-[52px]"
                    >
                      <option value="Cash">Cash Account (Immediate Settling)</option>
                      <option value="Credit">Credit Account (Invoice Cycle Term)</option>
                    </select>
                    <label htmlFor="form-customer-type-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none">
                      Customer Type <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                  </div>
                </div>

                {/* Address */}
                <div className="relative w-full">
                  <textarea
                    rows={2}
                    id="form-customer-address-field"
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
                  <label htmlFor="form-customer-address-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                    Address Description
                  </label>
                  {errors.address && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                      <span>{errors.address}</span>
                    </div>
                  )}
                </div>

                {/* Optional Customer info VAT and Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="relative w-full animate-fade-in">
                    <input
                      type="text"
                      id="form-customer-vat-field"
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
                    <label htmlFor="form-customer-vat-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      VAT Registration No. (Optional)
                    </label>
                    {errors.vatNumber && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                        <span>{errors.vatNumber}</span>
                      </div>
                    )}
                  </div>

                  <div className="relative w-full animate-fade-in">
                    <input
                      type="email"
                      id="form-customer-email-field"
                      disabled={isSaving}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder=" "
                      className="peer w-full rounded-xl border border-slate-200 px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 focus:border-indigo-650 h-[52px]"
                    />
                    <label htmlFor="form-customer-email-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      Email Address (Optional)
                    </label>
                  </div>
                </div>

                {/* Due Balance */}
                <div className="relative w-full">
                  <span className="absolute left-3.5 top-4.5 text-xs font-bold text-slate-400 shrink-0">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    id="form-customer-due-field"
                    disabled={isSaving || !!editingCustomer}
                    value={formData.dueBalance}
                    onChange={(e) => setFormData({ ...formData, dueBalance: e.target.value })}
                    placeholder=" "
                    className={`peer w-full rounded-xl border pl-7 pr-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                      errors.dueBalance 
                        ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                        : 'border-slate-200 focus:border-indigo-600 focus:ring-indigo-650'
                    }`}
                  />
                  <label htmlFor="form-customer-due-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-placeholder-shown:left-7 peer-focus:top-1.5 peer-focus:left-3.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                    Outstanding Due Balance ($) <span className="text-rose-500 font-extrabold">*</span>
                  </label>
                  {errors.dueBalance ? (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                      <span>{errors.dueBalance}</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 font-sans mt-1.5 pl-1">Record unpaid account entries here. Default is 0.00.</p>
                  )}
                </div>

                {/* Show status selection only when editing an existing customer */}
                {editingCustomer && (
                  <div className="relative w-full">
                    <select
                      id="form-customer-status-field"
                      disabled={isSaving}
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition cursor-pointer disabled:opacity-60 disabled:bg-slate-50 text-slate-800 h-[52px]"
                    >
                      <option value="active">Active (Available for transactions)</option>
                      <option value="inactive">Inactive (Suspended / Read-only)</option>
                    </select>
                    <label htmlFor="form-customer-status-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none">
                      Customer Status <span className="text-rose-500 font-extrabold">*</span>
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
                        <span>Saving Changes...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>{editingCustomer ? 'Update Profile' : 'Register Customer'}</span>
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
        {customerToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm font-sans">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 sm:p-8 space-y-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center text-rose-600 mb-4">
                    <AlertTriangle className="h-6 w-6 animate-pulse" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    Purge Customer Profile?
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Are you absolutely sure you want to permanently delete customer account for{' '}
                    <strong className="text-slate-900 font-extrabold">"{customerToDelete.name}"</strong>? 
                    This action will clear all associated trade histories, metadata records, outstanding limits, and cannot be undone.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setCustomerToDelete(null)}
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
