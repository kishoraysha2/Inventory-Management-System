import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DollarSign,
  Calendar,
  User,
  Truck,
  History,
  PlusCircle,
  ArrowDownRight,
  ArrowUpRight,
  Search,
  Filter,
  Clock,
  FileText,
  AlertTriangle,
  ChevronRight,
  X,
  CheckCircle2,
  Trash2,
  TrendingUp,
  RotateCcw,
  Phone
} from 'lucide-react';
import { db, OperationType, handleFirestoreError, logSystemActivity } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Customer, Supplier, CustomerPayment, SupplierPayment } from '../types';

export default function PaymentLedger() {
  // --- Core State ---
  const [activeSegment, setActiveSegment] = useState<'customers' | 'suppliers'>('customers');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // --- Filtering & Searching State ---
  const [personFilter, setPersonFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // --- Form Modal State ---
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    personId: '',
    amountPaid: '',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // --- Real-time Firestore Sync ---
  useEffect(() => {
    setLoading(true);

    // 1. Customers Sync
    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const custs: Customer[] = [];
      snapshot.forEach((d) => custs.push(d.data() as Customer));
      setCustomers(custs.sort((a, b) => a.name.localeCompare(b.name)));
    }, (err) => console.error(err));

    // 2. Suppliers Sync
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const supps: Supplier[] = [];
      snapshot.forEach((d) => supps.push(d.data() as Supplier));
      setSuppliers(supps.sort((a, b) => a.name.localeCompare(b.name)));
    }, (err) => console.error(err));

    // 3. Customer Payments Sync
    const unsubCustomerPayments = onSnapshot(collection(db, 'customerPayments'), (snapshot) => {
      const payments: CustomerPayment[] = [];
      snapshot.forEach((d) => payments.push(d.data() as CustomerPayment));
      // Chronological descending
      payments.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
      setCustomerPayments(payments);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('Failed to synchronize payment records with Firestore database.');
      setLoading(false);
    });

    // 4. Supplier Payments Sync
    const unsubSupplierPayments = onSnapshot(collection(db, 'supplierPayments'), (snapshot) => {
      const payments: SupplierPayment[] = [];
      snapshot.forEach((d) => payments.push(d.data() as SupplierPayment));
      // Chronological descending
      payments.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
      setSupplierPayments(payments);
    }, (err) => console.error(err));

    return () => {
      unsubCustomers();
      unsubSuppliers();
      unsubCustomerPayments();
      unsubSupplierPayments();
    };
  }, []);

  // --- Feedback Auto-hide ---
  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  // --- Reset Filter Form ---
  const handleResetFilters = () => {
    setPersonFilter('');
    setStartDate('');
    setEndDate('');
  };

  // --- Record Payment Open Action ---
  const handleOpenRecordModal = (initialPersonId: string = '') => {
    setFormData({
      personId: initialPersonId,
      amountPaid: '',
      paymentDate: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  // --- Form Validation ---
  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!formData.personId) {
      errs.personId = activeSegment === 'customers' ? 'Please select a customer' : 'Please select a supplier';
    }

    const payVal = parseFloat(formData.amountPaid);
    if (isNaN(payVal)) {
      errs.amountPaid = 'Please enter a valid amount';
    } else if (payVal <= 0) {
      errs.amountPaid = 'Payment amount must be greater than zero';
    } else if (formData.personId) {
      if (activeSegment === 'customers') {
        const cust = customers.find((c) => c.id === formData.personId);
        const outstanding = cust?.dueBalance ?? 0;
        if (payVal > outstanding) {
          errs.amountPaid = `Cannot record payment of $${payVal.toFixed(2)} that exceeds outstanding customer due balance of $${outstanding.toFixed(2)}`;
        }
      } else {
        const supp = suppliers.find((s) => s.id === formData.personId);
        const outstanding = supp?.dueBalance ?? 0;
        if (payVal > outstanding) {
          errs.amountPaid = `Cannot record payment of $${payVal.toFixed(2)} that exceeds outstanding supplier payable balance of $${outstanding.toFixed(2)}`;
        }
      }
    }

    if (!formData.paymentDate) {
      errs.paymentDate = 'Please specify a transaction date';
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // --- Form Submit Action ---
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSaving(true);
    const amountVal = parseFloat(formData.amountPaid);
    const transDate = formData.paymentDate;
    const transNotes = formData.notes.trim();

    try {
      if (activeSegment === 'customers') {
        const targetCust = customers.find((c) => c.id === formData.personId)!;
        const prevDue = targetCust.dueBalance;
        const remDue = Math.max(0, prevDue - amountVal);

        const paymentId = `cp-${Date.now()}`;
        const newPayment: CustomerPayment = {
          id: paymentId,
          customerId: targetCust.id,
          customerName: targetCust.name,
          amountPaid: amountVal,
          previousDue: prevDue,
          remainingDue: remDue,
          paymentDate: transDate,
          notes: transNotes
        };

        // Write Payment Record
        await setDoc(doc(db, 'customerPayments', paymentId), newPayment);

        // Update Customer Record
        const updatedCustomer: Customer = {
          ...targetCust,
          dueBalance: remDue
        };
        await setDoc(doc(db, 'customers', targetCust.id), updatedCustomer);

        // System Log
        await logSystemActivity(
          "Customer payment",
          `Recorded customer payment of $${amountVal.toFixed(2)} from "${targetCust.name}". Due balance updated from $${prevDue.toFixed(2)} to $${remDue.toFixed(2)}.`
        );

        setFeedback({
          message: `Successfully recorded customer payment of $${amountVal.toFixed(2)} for "${targetCust.name}"`,
          type: 'success'
        });
      } else {
        const targetSupp = suppliers.find((s) => s.id === formData.personId)!;
        const prevDue = targetSupp.dueBalance ?? 0;
        const remDue = Math.max(0, prevDue - amountVal);

        const paymentId = `sp-${Date.now()}`;
        const newPayment: SupplierPayment = {
          id: paymentId,
          supplierId: targetSupp.id,
          supplierName: targetSupp.name,
          amountPaid: amountVal,
          previousDue: prevDue,
          remainingDue: remDue,
          paymentDate: transDate,
          notes: transNotes
        };

        // Write Payment Record
        await setDoc(doc(db, 'supplierPayments', paymentId), newPayment);

        // Update Supplier Record
        const updatedSupplier: Supplier = {
          ...targetSupp,
          dueBalance: remDue
        };
        await setDoc(doc(db, 'suppliers', targetSupp.id), updatedSupplier);

        // System Log
        await logSystemActivity(
          "Supplier payment",
          `Recorded supplier layout of $${amountVal.toFixed(2)} to "${targetSupp.name}". Owed balance updated from $${prevDue.toFixed(2)} to $${remDue.toFixed(2)}.`
        );

        setFeedback({
          message: `Successfully recorded supplier payment of $${amountVal.toFixed(2)} to "${targetSupp.name}"`,
          type: 'success'
        });
      }

      setIsFormOpen(false);
    } catch (err: any) {
      console.error(err);
      try {
        handleFirestoreError(err, OperationType.WRITE, 'payments');
      } catch (dbErr: any) {
        setFeedback({ message: `Failed to register payment: ${dbErr.message}`, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Computed Metrics ---
  const currentMonthStr = new Date().toISOString().substring(0, 7); // "YYYY-MM"
  
  const totalCustomerPaidThisMonth = customerPayments
    .filter((p) => p.paymentDate.startsWith(currentMonthStr))
    .reduce((sum, p) => sum + p.amountPaid, 0);

  const totalSupplierPaidThisMonth = supplierPayments
    .filter((p) => p.paymentDate.startsWith(currentMonthStr))
    .reduce((sum, p) => sum + p.amountPaid, 0);

  const totalOutstandingCustomerDebt = customers.reduce((sum, c) => sum + c.dueBalance, 0);
  const totalOutstandingSupplierDebt = suppliers.reduce((sum, s) => sum + (s.dueBalance ?? 0), 0);

  // --- Filtering computations ---
  const filteredCustomerPayments = customerPayments.filter((p) => {
    const matchesPerson = !personFilter || p.customerName?.toLowerCase().includes(personFilter.toLowerCase()) || p.customerId === personFilter;
    const matchesStart = !startDate || p.paymentDate >= startDate;
    const matchesEnd = !endDate || p.paymentDate <= endDate;
    return matchesPerson && matchesStart && matchesEnd;
  });

  const filteredSupplierPayments = supplierPayments.filter((p) => {
    const matchesPerson = !personFilter || p.supplierName?.toLowerCase().includes(personFilter.toLowerCase()) || p.supplierId === personFilter;
    const matchesStart = !startDate || p.paymentDate >= startDate;
    const matchesEnd = !endDate || p.paymentDate <= endDate;
    return matchesPerson && matchesStart && matchesEnd;
  });

  const activeRecordsCount = activeSegment === 'customers' ? filteredCustomerPayments.length : filteredSupplierPayments.length;
  const activeRecordSum = activeSegment === 'customers' 
    ? filteredCustomerPayments.reduce((sum, p) => sum + p.amountPaid, 0)
    : filteredSupplierPayments.reduce((sum, p) => sum + p.amountPaid, 0);

  // Helper properties for selected dropdown entity
  const selectedPersonOutstanding = () => {
    if (!formData.personId) return null;
    if (activeSegment === 'customers') {
      return customers.find((c) => c.id === formData.personId)?.dueBalance ?? 0;
    } else {
      return suppliers.find((s) => s.id === formData.personId)?.dueBalance ?? 0;
    }
  };

  const searchedCustomers = customers.filter((c) => {
    const query = personFilter.toLowerCase();
    return c.name.toLowerCase().includes(query) || (c.phone || '').toLowerCase().includes(query);
  });

  const searchedSuppliers = suppliers.filter((s) => {
    const query = personFilter.toLowerCase();
    return s.name.toLowerCase().includes(query) || (s.phone || '').toLowerCase().includes(query);
  });

  return (
    <div id="payment-ledger-panel" className="space-y-8 animate-fade-in font-sans">
      
      {/* Toast Feedback Status Banner */}
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

      {/* Segment Selector - Outstanding Ledgers Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Due settlement ledger</h2>
          <p className="text-xs text-slate-500 mt-1">
            Maintain due portfolio accountability. Pay down invoices, and audit full histories.
          </p>
        </div>

        <div className="flex bg-slate-100 border border-slate-200 p-1 rounded-2xl shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setActiveSegment('customers');
              handleResetFilters();
            }}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeSegment === 'customers' 
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/40' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            <span>Customers Portal</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSegment('suppliers');
              handleResetFilters();
            }}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeSegment === 'suppliers' 
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/40' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Truck className="h-3.5 w-3.5" />
            <span>Suppliers Portal</span>
          </button>
        </div>
      </div>

      {/* METRIC BENTO CARDS */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {/* Metric 1: Payments recorded this month */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                {activeSegment === 'customers' ? 'Inward Paid (Mtd)' : 'Outward Settled (Mtd)'}
              </span>
              <div className="p-1 px-2.5 rounded-full text-[10px] font-extrabold bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center gap-1">
                Current Month <ChevronRight className="h-2.5 w-2.5" />
              </div>
            </div>
            {loading ? (
              <div className="h-9 w-24 bg-slate-100 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold tracking-tight text-slate-900 mt-2 flex items-baseline gap-1">
                ${activeSegment === 'customers' 
                  ? totalCustomerPaidThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })
                  : totalSupplierPaidThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
            Total ledger volume logged since {new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </div>
        </div>

        {/* Metric 2: Remaining Ledger Debt Owed */}
        <div className="bg-amber-50/60 rounded-[2rem] p-6 sm:p-8 border border-amber-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest leading-none">
                {activeSegment === 'customers' ? 'Outstanding Receivable' : 'Outstanding Trade Payable'}
              </span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            </div>
            {loading ? (
              <div className="h-9 w-28 bg-amber-200/30 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold tracking-tight text-amber-950 mt-2">
                ${activeSegment === 'customers' 
                  ? totalOutstandingCustomerDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })
                  : totalOutstandingSupplierDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-amber-200/50 text-[11px] text-amber-700/90 font-medium">
            {activeSegment === 'customers' 
              ? 'Aggregate credit balances pending client collection' 
              : 'Our open commercial liabilities requiring trade settlement'}
          </div>
        </div>

        {/* Metric 3: Active Ledgers Account Metric */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Account distribution</span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase leading-none">Registered</p>
                {loading ? (
                  <div className="h-7 w-8 bg-slate-100 rounded-lg animate-pulse mt-1"></div>
                ) : (
                  <p className="text-xl font-bold text-slate-800 mt-1">
                    {activeSegment === 'customers' ? customers.length : suppliers.length}
                  </p>
                )}
              </div>
              <div className="border-l border-slate-100 pl-4">
                <p className="text-[10px] text-slate-400 font-bold uppercase leading-none">In Debt</p>
                {loading ? (
                  <div className="h-7 w-8 bg-slate-100 rounded-lg animate-pulse mt-1"></div>
                ) : (
                  <p className="text-xl font-bold text-amber-700 mt-1">
                    {activeSegment === 'customers' 
                      ? customers.filter((c) => c.dueBalance > 0).length 
                      : suppliers.filter((s) => (s.dueBalance ?? 0) > 0).length}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
            Accounts with pending balances
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS BAR & WORKSPACE AREA */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Left Col 1: Filters Sidebar inside the component */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-[2rem] border border-slate-200 p-6 sm:p-7 space-y-5">
            <h3 className="font-sans text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1.5 pb-3 border-b border-slate-100">
              <Filter className="h-4 w-4 text-slate-450 text-indigo-505" />
              <span>Search Filters</span>
            </h3>

            {/* Filter by Person Choice */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                {activeSegment === 'customers' ? 'Search Customer' : 'Search Supplier'}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={activeSegment === 'customers' ? 'E.g., Acmet Corp' : 'E.g., Global Dist'}
                  value={personFilter}
                  onChange={(e) => setPersonFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-505 outline-none"
                />
              </div>
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs font-semibold text-slate-800 transition focus:border-indigo-500 focus:bg-white outline-none cursor-pointer"
              />
            </div>

            {/* End Date */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs font-semibold text-slate-800 transition focus:border-indigo-500 focus:bg-white outline-none cursor-pointer"
              />
            </div>

            {/* Actions for Filters */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition font-bold text-[10px] uppercase tracking-wide flex items-center justify-center gap-1 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Prompt quick informational guidelines */}
          <div className="bg-slate-900 text-white rounded-[2rem] p-6 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold uppercase text-[9px] tracking-widest text-slate-450 text-indigo-300">Safeguard Alert</span>
                <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-400"></span>
              </div>
              <p className="text-[11px] text-slate-300 leading-normal font-medium">
                Our double-entry ledgers absolutely prevent negative due balances. In case of overall payments, credit must first be registered as standard credit lines.
              </p>
            </div>
          </div>
        </div>

        {/* Right Col 3: Records History List & Outstanding portfolios with main header */}
        <div className="lg:col-span-3 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* Outstanding Accounts list (Left side of workspace) */}
          <div className="xl:col-span-5 bg-white rounded-[2rem] border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6 flex flex-col">
            <div className="pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                {activeSegment === 'customers' ? (
                  <>
                    <User className="h-4.5 w-4.5 text-indigo-600" />
                    <span>Customer Section</span>
                  </>
                ) : (
                  <>
                    <Truck className="h-4.5 w-4.5 text-indigo-600" />
                    <span>Supplier Section</span>
                  </>
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeSegment === 'customers'
                  ? 'Active accounts receivable ledger'
                  : 'Active accounts trade payable ledger'}
              </p>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-16 border border-slate-100 rounded-2xl animate-pulse bg-slate-50"></div>
                  ))}
                </div>
              ) : activeSegment === 'customers' ? (
                searchedCustomers.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <p className="text-xs font-bold text-slate-600">No customers found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Adjust filter keywords to search database.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {searchedCustomers.map((c) => (
                      <div key={c.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group transition">
                        <div className="min-w-0 flex-1 space-y-1">
                          <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600 transition">{c.name}</h4>
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                            <span className="inline-flex shrink-0 px-1.5 py-0.5 text-[9px] bg-slate-50 border border-slate-100 text-slate-400 font-bold rounded-md">
                              ID: {c.id}
                            </span>
                            {c.phone ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium truncate">
                                <Phone className="h-2.5 w-2.5 text-slate-405 text-slate-400" />
                                <span className="truncate">{c.phone}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Due Balance</p>
                            <span className={`text-xs font-bold block mt-1 ${c.dueBalance > 0 ? 'text-orange-600' : 'text-slate-400 font-normal'}`}>
                              ${c.dueBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {c.dueBalance > 0 && (
                            <button
                              type="button"
                              onClick={() => handleOpenRecordModal(c.id)}
                              className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-150 border border-indigo-100 text-indigo-600 font-bold text-[10px] cursor-pointer transition shrink-0"
                            >
                              Pay
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                searchedSuppliers.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <p className="text-xs font-bold text-slate-600">No suppliers found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Adjust filter keywords to search database.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {searchedSuppliers.map((s) => {
                      const owed = s.dueBalance ?? 0;
                      return (
                        <div key={s.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group transition">
                          <div className="min-w-0 flex-1 space-y-1">
                            <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600 transition">{s.name}</h4>
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                              <span className="inline-flex shrink-0 px-1.5 py-0.5 text-[9px] bg-slate-50 border border-slate-100 text-slate-400 font-bold rounded-md">
                                ID: {s.id}
                              </span>
                              {s.phone ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium truncate">
                                  <Phone className="h-2.5 w-2.5 text-slate-405 text-slate-400" />
                                  <span className="truncate">{s.phone}</span>
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Owed Balance</p>
                              <span className={`text-xs font-bold block mt-1 ${owed > 0 ? 'text-indigo-600' : 'text-slate-400 font-normal'}`}>
                                ${owed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            {owed > 0 && (
                              <button
                                type="button"
                                onClick={() => handleOpenRecordModal(s.id)}
                                className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-150 border border-indigo-100 text-indigo-600 font-bold text-[10px] cursor-pointer transition shrink-0"
                              >
                                Settle
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Records History List (Right side of workspace) */}
          <div className="xl:col-span-7 bg-white rounded-[2rem] border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
            
            {/* Table Header toolbar */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <History className="h-4.5 w-4.5 text-slate-400" />
                  <span>Settlement Payment History Ledger</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Showing {activeRecordsCount} settlement records ({activeSegment === 'customers' ? 'Inflow' : 'Outflow'} Total: ${activeRecordSum.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleOpenRecordModal()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4.5 py-3 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer"
              >
                <PlusCircle className="h-4 w-4" />
                <span>{activeSegment === 'customers' ? 'Record Customer Pay' : 'Record Supplier Pay'}</span>
              </button>
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
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/20">
                  <div className="p-3 bg-slate-100 rounded-full text-slate-400 mb-3">
                    <History className="h-6 w-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-600">No payment logs identified</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm">No ledger matches active filters or payments. Click record payments to register first settlement activity.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {(activeSegment === 'customers' ? filteredCustomerPayments : filteredSupplierPayments).map((p) => (
                    <div 
                      key={p.id} 
                      className="py-4.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group transition"
                    >
                      {/* Name / Date details */}
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-950 group-hover:text-indigo-600 transition">
                            {activeSegment === 'customers' 
                              ? (p as CustomerPayment).customerName || 'Anonymous Client'
                              : (p as SupplierPayment).supplierName || 'Anonymous Supplier'}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 text-[10px] bg-slate-50 border border-slate-100 text-slate-400 font-bold rounded-full">
                            ID: {p.id}
                          </span>
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
                            {activeSegment === 'customers' ? '+' : '-'}${p.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        {/* State step progress indicator */}
                        <div className="text-[10px] text-slate-400 border-l border-slate-100 pl-4 space-y-0.5 min-w-[120px]">
                          <div>Owed: <span className="font-bold text-slate-600">${p.previousDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                          <div>Rem: <span className="font-bold text-slate-800">${p.remainingDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* RECORD PAYMENT MODAL DIALOG */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
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
              <form onSubmit={handleSavePayment} className="p-6 sm:p-8 space-y-4.5">
                
                {/* Person Dropdown */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    {activeSegment === 'customers' ? 'Select Customer *' : 'Select Supplier *'}
                  </label>
                  <select
                    disabled={isSaving}
                    value={formData.personId}
                    onChange={(e) => setFormData({ ...formData, personId: e.target.value })}
                    className={`w-full rounded-xl border bg-white py-2.5 px-3.5 text-xs font-semibold focus:outline-none focus:border-indigo-505 transition cursor-pointer disabled:opacity-60 ${
                      formErrors.personId ? 'border-rose-300' : 'border-slate-200'
                    }`}
                  >
                    <option value="">{activeSegment === 'customers' ? '-- Select a client account --' : '-- Select a supplier account --'}</option>
                    {activeSegment === 'customers' ? (
                      customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Outstanding receivable: ${c.dueBalance.toFixed(2)})
                        </option>
                      ))
                    ) : (
                      suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} (Outstanding trade payable: ${(s.dueBalance ?? 0).toFixed(2)})
                        </option>
                      ))
                    )}
                  </select>
                  {formErrors.personId && (
                    <p className="text-[10px] font-bold text-rose-500">{formErrors.personId}</p>
                  )}
                </div>

                {/* Show current due parameters */}
                {formData.personId && selectedPersonOutstanding() !== null && (
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 text-xs text-slate-600 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Selected Outstanding Balance:</span>
                      <strong className="text-orange-600">${selectedPersonOutstanding()?.toFixed(2)}</strong>
                    </div>
                  </div>
                )}

                {/* Grid row: Paid Amount & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  {/* Amount Paid input */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Settlement Amount ($) *</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-3.5 text-xs font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        disabled={isSaving}
                        value={formData.amountPaid}
                        onChange={(e) => setFormData({ ...formData, amountPaid: e.target.value })}
                        placeholder="0.00"
                        className={`w-full rounded-xl border py-2.5 pl-8 pr-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 ${
                          formErrors.amountPaid 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/20' 
                            : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505'
                        }`}
                      />
                    </div>
                    {formErrors.amountPaid && (
                      <p className="text-[10px] font-bold text-rose-500">{formErrors.amountPaid}</p>
                    )}
                  </div>

                  {/* Payment date calendar */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Transaction Date *</label>
                    <input
                      type="date"
                      required
                      disabled={isSaving}
                      value={formData.paymentDate}
                      onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3.5 text-xs font-bold text-slate-850 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                    />
                    {formErrors.paymentDate && (
                      <p className="text-[10px] font-bold text-rose-500">{formErrors.paymentDate}</p>
                    )}
                  </div>
                </div>

                {/* Notes area */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Internal Transaction Notes / Memo</label>
                  <textarea
                    rows={2}
                    disabled={isSaving}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Provide details, invoice match description, bank transaction references, check numbers..."
                    className="w-full rounded-xl border border-slate-200 py-2.5 px-3.5 text-xs font-medium focus:outline-none focus:border-indigo-550 transition resize-none"
                  />
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

    </div>
  );
}
