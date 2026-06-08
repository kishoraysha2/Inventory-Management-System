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
  ChevronRight
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError, logSystemActivity } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { Customer } from '../types';
import { calculateCustomerLedger } from '../lib/utils';

export default function CustomerManagement({ userRole = 'admin' }: { userRole?: 'admin' | 'accountant' | 'cashier' | 'viewer' }) {
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
    phone: '',
    address: '',
    customerType: 'Cash' as 'Cash' | 'Credit',
    dueBalance: '',
    status: 'active' as 'active' | 'inactive'
  });
  
  // --- Validation Errors State ---
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      const rawDue = calculateCustomerLedger(sales, customerPayments, c.id);
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

  // --- Open Form for Create/Edit ---
  const openForm = (customer: Customer | null = null) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        customerType: customer.customerType,
        dueBalance: customer.dueBalance.toString(),
        status: customer.status || 'active'
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: '',
        phone: '',
        address: '',
        customerType: 'Cash',
        dueBalance: '0',
        status: 'active'
      });
    }
    setErrors({});
    setIsFormOpen(true);
  };

  // --- Form Validation ---
  const validateForm = () => {
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
    const customerId = editingCustomer ? editingCustomer.id : `cust-${Date.now()}`;

    const finalCustomerData: Customer = {
      id: customerId,
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      address: formData.address.trim(),
      customerType: formData.customerType,
      dueBalance: dueBalanceValue,
      createdDate: editingCustomer ? editingCustomer.createdDate : timestamp,
      status: formData.status
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
    try {
      if (!auth.currentUser) {
        const saved = localStorage.getItem('inventory_customers');
        let currentList: Customer[] = saved ? JSON.parse(saved) : [];

        const savedSales = localStorage.getItem('inventory_sales') || '[]';
        const salesList = JSON.parse(savedSales);
        const hasSales = salesList.some((s: any) => s.customerId === id);

        const savedPayments = localStorage.getItem('inventory_customer_payments') || '[]';
        const paymentsList = JSON.parse(savedPayments);
        const hasPayments = paymentsList.some((p: any) => p.customerId === id);

        const hasBalance = (customerToDelete.dueBalance ?? 0) > 0;

        if (hasSales || hasPayments || hasBalance) {
          const updatedCustomer: Customer = {
            ...customerToDelete,
            status: 'inactive'
          };
          currentList = currentList.map(c => c.id === id ? updatedCustomer : c);
          localStorage.setItem('inventory_customers', JSON.stringify(currentList));
          setCustomersState(currentList);

          const reasons: string[] = [];
          if (hasSales) reasons.push("sales history");
          if (hasPayments) reasons.push("payment history");
          if (hasBalance) reasons.push(`outstanding due balance ($${customerToDelete.dueBalance.toFixed(2)})`);

          const reasonText = reasons.join(", ");
          setFeedback({ 
            message: `Customer "${name}" has associated ${reasonText} and has been safely marked as "inactive" locally.`, 
            type: 'success' 
          });
        } else {
          const updatedCustomer: Customer = {
            ...customerToDelete,
            status: 'inactive'
          };
          currentList = currentList.map(c => c.id === id ? updatedCustomer : c);
          localStorage.setItem('inventory_customers', JSON.stringify(currentList));
          setCustomersState(currentList);
          setFeedback({ message: `Customer record "${name}" has been safely retired as "inactive" locally.`, type: 'success' });
        }
        setIsSaving(false);
        return;
      }

      // Always soft-delete to preserve business ledger and audit histories
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
    if (customer.status === 'inactive') return false;

    const matchesSearch = 
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone.includes(searchQuery) ||
      customer.address.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterType === 'All') return matchesSearch;
    return matchesSearch && customer.customerType === filterType;
  });

  // --- Analytical Calculations ---
  const outstandingBalanceTotal = customers.filter(c => c.status !== 'inactive').reduce((sum, item) => sum + item.dueBalance, 0);
  const customerCreditTotal = customers.filter(c => c.status !== 'inactive').reduce((sum, item) => sum + (item.customerCredit || 0), 0);
  const creditAccountsCount = customers.filter(c => c.status !== 'inactive' && c.customerType === 'Credit').length;
  const cashAccountsCount = customers.filter(c => c.status !== 'inactive' && c.customerType === 'Cash').length;

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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Customers */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between animate-fade-in">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Total Customers</span>
              <div className="p-1 px-2.5 rounded-full text-[10px] font-extrabold bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center gap-1">
                Active <ChevronRight className="h-2.5 w-2.5" />
              </div>
            </div>
            {loading ? (
              <div className="h-9 w-12 bg-slate-100 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">{customers.filter(c => c.status !== 'inactive').length}</p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
            Registered ledger records
          </div>
        </div>

        {/* Due Portfolio Balance */}
        <div className="bg-rose-50 rounded-[2rem] p-6 sm:p-8 border border-rose-100 flex flex-col justify-between animate-fade-in">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest leading-none">Total Outstanding</span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-rose-500"></span>
            </div>
            {loading ? (
              <div className="h-9 w-28 bg-rose-200/50 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold font-sans tracking-tight text-rose-900 mt-2">
                ${outstandingBalanceTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-rose-200/50 text-[11px] text-rose-700/80">
            Aggregate active customer dues
          </div>
        </div>

        {/* Customer Credit Portfolio Balance */}
        <div className="bg-emerald-50 rounded-[2rem] p-6 sm:p-8 border border-emerald-100 flex flex-col justify-between animate-fade-in">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest leading-none">Customer Credit</span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            </div>
            {loading ? (
              <div className="h-9 w-28 bg-emerald-200/50 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
                ${customerCreditTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-emerald-200/50 text-[11px] text-emerald-700/85">
            Advance overpaid customer balances
          </div>
        </div>

        {/* Account Distribution */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between animate-fade-in">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Account Types</span>
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

              {userRole === 'admin' && (
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
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                  <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-350 mb-3">
                    <Users className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">No Customers Identified</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    {searchQuery ? 'Adjust search inputs or apply empty filter parameters' : 'Begin registering clients to establish trade history ledgers'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredCustomers.map((customer) => (
                    <motion.div
                      key={customer.id}
                      layoutId={`customer-card-${customer.id}`}
                      className="border border-slate-200 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-xs transition duration-300 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-900">{customer.name}</h4>
                          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            customer.customerType === 'Credit' 
                              ? 'bg-orange-50 text-orange-700 border border-orange-100' 
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            {customer.customerType} Account
                          </span>
                          {customer.status === 'inactive' ? (
                            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                              Inactive
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                              Active
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-500">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{customer.phone}</span>
                          </span>
                          <span className="flex items-center gap-1.5 min-w-0">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{customer.address || 'No Address Provided'}</span>
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span>Added {new Date(customer.createdDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                        </div>
                      </div>

                      {/* Right Section: Balance and Action Hooks */}
                      <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0 shrink-0">
                        <div className="flex gap-6 items-center">
                          <div className="text-left sm:text-right">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none block">Outstanding Due</span>
                            <span className={`text-lg font-extrabold block mt-1 ${
                              customer.dueBalance > 0 ? 'text-rose-600' : 'text-slate-705 text-slate-700'
                            }`}>
                              ${customer.dueBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {(customer.customerCredit || 0) > 0 && (
                            <div className="text-left sm:text-right border-l border-slate-155 border-slate-100 pl-4">
                              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest leading-none block">Customer Credit</span>
                              <span className="text-lg font-extrabold block mt-1 text-emerald-600">
                                ${customer.customerCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          )}
                        </div>

                        {userRole === 'admin' && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openForm(customer)}
                              className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition cursor-pointer"
                              title="Edit customer account details"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(customer)}
                              className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition cursor-pointer"
                              title="Delete customer record permanently"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
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
                    <span className="font-bold">{customers.filter(c => c.status !== 'inactive').length > 0 ? Math.round((creditAccountsCount / customers.filter(c => c.status !== 'inactive').length) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" 
                      style={{ width: `${customers.filter(c => c.status !== 'inactive').length > 0 ? (creditAccountsCount / customers.filter(c => c.status !== 'inactive').length) * 100 : 0}%` }}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans">
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
              <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
                
                {/* Customer Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Customer Name *</label>
                  <input
                    type="text"
                    required
                    disabled={isSaving}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 disabled:bg-slate-50 ${
                      errors.name 
                        ? 'border-rose-450 border-rose-350 text-rose-800 bg-rose-50/20' 
                        : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    }`}
                    placeholder="E.g., John Doe Retailers"
                  />
                  {errors.name && <p className="text-[10px] font-bold text-rose-500">{errors.name}</p>}
                </div>

                {/* Grid row: Phone & Customer Type */}
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
                          : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      }`}
                      placeholder="E.g., +1 (555) 0192"
                    />
                    {errors.phone && <p className="text-[10px] font-bold text-rose-500">{errors.phone}</p>}
                  </div>

                  {/* Customer Type */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Customer Type *</label>
                    <select
                      disabled={isSaving}
                      value={formData.customerType}
                      onChange={(e) => setFormData({ ...formData, customerType: e.target.value as 'Cash' | 'Credit' })}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition cursor-pointer disabled:opacity-60 disabled:bg-slate-50"
                    >
                      <option value="Cash">Cash Account (Immediate Settling)</option>
                      <option value="Credit">Credit Account (Invoice Cycle Term)</option>
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
                        : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    }`}
                    placeholder="E.g., Sector 4, Warehouse Building B, Suite 102"
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
                      disabled={isSaving || !!editingCustomer}
                      value={formData.dueBalance}
                      onChange={(e) => setFormData({ ...formData, dueBalance: e.target.value })}
                      className={`w-full rounded-xl border py-2.5 pl-8 pr-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 disabled:bg-slate-50 ${
                        errors.dueBalance 
                          ? 'border-rose-350 text-rose-800 bg-rose-50/20' 
                          : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-550'
                      }`}
                      placeholder="0.00"
                    />
                  </div>
                  {errors.dueBalance && <p className="text-[10px] font-bold text-rose-500">{errors.dueBalance}</p>}
                  <p className="text-[10px] text-slate-425 text-slate-400 font-sans mt-1">Record unpaid account entries here. Default is 0.00.</p>
                </div>

                {/* Show status selection only when editing an existing customer */}
                {editingCustomer && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Customer Status *</label>
                    <select
                      disabled={isSaving}
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition cursor-pointer disabled:opacity-60 disabled:bg-slate-50 text-slate-700 bg-white"
                    >
                      <option value="active">Active (Available for transactions)</option>
                      <option value="inactive">Inactive (Suspended / Read-only)</option>
                    </select>
                  </div>
                )}

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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans">
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
