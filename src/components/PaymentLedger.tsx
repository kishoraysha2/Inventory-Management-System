import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { calculateCustomerLedger } from '../lib/utils';
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
import { db, auth, OperationType, handleFirestoreError, logSystemActivity, logFinancialAudit } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { Customer, Supplier, CustomerPayment, SupplierPayment } from '../types';

export default function PaymentLedger({ userRole = 'admin' }: { userRole?: 'admin' | 'accountant' | 'cashier' | 'viewer' }) {
  // --- Core State ---
  const [activeSegment, setActiveSegment] = useState<'customers' | 'suppliers'>('customers');
  const [customersState, setCustomersState] = useState<Customer[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);

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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [voidConfirmationPayment, setVoidConfirmationPayment] = useState<CustomerPayment | SupplierPayment | null>(null);

  // --- Void Payments securely via Transactions (instead of deletions) ---
  const voidTransaction = async (paymentId: string) => {
    console.log("VOID triggered", paymentId);
    const payment = [...customerPayments, ...supplierPayments].find(p => p.id === paymentId);
    if (!payment) {
      console.error("Payment not found for voiding:", paymentId);
      return;
    }
    setVoidConfirmationPayment(payment);
  };

  const handleVoidPayment = async (payment: CustomerPayment | SupplierPayment) => {
    console.log("handleVoidPayment direct invocation for:", payment.id);
    setFeedback(null);
    setIsSaving(true);
    try {
      if (!auth.currentUser) {
        // Local Voiding Fallback
        if (activeSegment === 'customers') {
          const cp = payment as CustomerPayment;
          
          // Update Customers list
          const savedCustomers = localStorage.getItem('inventory_customers') || '[]';
          let customersList = JSON.parse(savedCustomers);
          customersList = customersList.map((c: any) => c.id === cp.customerId ? { ...c, dueBalance: (c.dueBalance ?? 0) + cp.amountPaid } : c);
          localStorage.setItem('inventory_customers', JSON.stringify(customersList));
          setCustomersState(customersList);

          // Update Customer Payments status
          const savedPayments = localStorage.getItem('inventory_customer_payments') || '[]';
          let paymentsList = JSON.parse(savedPayments);
          paymentsList = paymentsList.map((p: any) => p.id === cp.id ? { ...p, status: 'VOID' } : p);
          localStorage.setItem('inventory_customer_payments', JSON.stringify(paymentsList));
          setCustomerPayments(paymentsList);

          // Update Cash Ledger status
          const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
          let ledgerList = JSON.parse(savedLedger);
          ledgerList = ledgerList.map((l: any) => l.id === `cl-${cp.id}` ? { ...l, status: 'VOID' } : l);
          localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));

        } else {
          const sp = payment as SupplierPayment;

          // Update Suppliers list
          const savedSuppliers = localStorage.getItem('inventory_suppliers') || '[]';
          let suppliersList = JSON.parse(savedSuppliers);
          suppliersList = suppliersList.map((s: any) => s.id === sp.supplierId ? { ...s, dueBalance: (s.dueBalance ?? 0) + sp.amountPaid } : s);
          localStorage.setItem('inventory_suppliers', JSON.stringify(suppliersList));
          setSuppliers(suppliersList);

          // Update Supplier Payments status
          const savedPayments = localStorage.getItem('inventory_supplier_payments') || '[]';
          let paymentsList = JSON.parse(savedPayments);
          paymentsList = paymentsList.map((p: any) => p.id === sp.id ? { ...p, status: 'VOID' } : p);
          localStorage.setItem('inventory_supplier_payments', JSON.stringify(paymentsList));
          setSupplierPayments(paymentsList);

          // Update Cash Ledger status
          const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
          let ledgerList = JSON.parse(savedLedger);
          ledgerList = ledgerList.map((l: any) => l.id === `cl-${sp.id}` ? { ...l, status: 'VOID' } : l);
          localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));
        }

        setFeedback({
          message: 'Payment settlement successfully voided locally and dues restored.',
          type: 'success'
        });
        setIsSaving(false);
        return;
      }

      await runTransaction(db, async (transaction) => {
        if (activeSegment === 'customers') {
          const cp = payment as CustomerPayment;
          const customerRef = doc(db, 'customers', cp.customerId);
          const customerSnap = await transaction.get(customerRef);

          if (customerSnap.exists()) {
            const customerData = customerSnap.data() as Customer;
            transaction.update(customerRef, {
              dueBalance: (customerData.dueBalance ?? 0) + cp.amountPaid
            });
          }

          const paymentRef = doc(db, 'customerPayments', cp.id);
          transaction.update(paymentRef, { status: 'VOID' });

          const cashLedgerRef = doc(db, 'cashLedger', `cl-${cp.id}`);
          transaction.update(cashLedgerRef, { status: 'VOID' });
        } else {
          const sp = payment as SupplierPayment;
          const supplierRef = doc(db, 'suppliers', sp.supplierId);
          const supplierSnap = await transaction.get(supplierRef);

          if (supplierSnap.exists()) {
            const supplierData = supplierSnap.data() as Supplier;
            transaction.update(supplierRef, {
              dueBalance: (supplierData.dueBalance ?? 0) + sp.amountPaid
            });
          }

          const paymentRef = doc(db, 'supplierPayments', sp.id);
          transaction.update(paymentRef, { status: 'VOID' });

          const cashLedgerRef = doc(db, 'cashLedger', `cl-${sp.id}`);
          transaction.update(cashLedgerRef, { status: 'VOID' });
        }
      });

      // Log financial Audit
      await logFinancialAudit(
        'VOID',
        payment.id,
        payment,
        { ...payment, status: 'VOID' },
        {
          cash: activeSegment === 'customers' ? -payment.amountPaid : payment.amountPaid, // Reversing previous cash flow
          stock: 0,
          due: payment.amountPaid
        }
      );

      // Log system activity
      await logSystemActivity(
        "Payment Voided",
        `Permanently marked payment record ID: ${payment.id} as VOID in ledger. Rolled back dues and reconciled allocations.`
      );

      setFeedback({
        message: 'Payment settlement successfully voided and account liabilities restored.',
        type: 'success'
      });
    } catch (err: any) {
      console.error('Void payment error:', err);
      let errMsg = 'Failed to void the payment record.';
      try {
        handleFirestoreError(err, OperationType.UPDATE, `${activeSegment}Payments/${payment.id}`);
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }
      setFeedback({ message: `Access Abort: ${errMsg}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

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
    if (!auth.currentUser) {
      // Local fallback
      const savedCustomers = localStorage.getItem('inventory_customers');
      setCustomersState(savedCustomers ? JSON.parse(savedCustomers) : []);

      const savedSales = localStorage.getItem('inventory_sales');
      setSales(savedSales ? JSON.parse(savedSales) : []);

      const savedSuppliers = localStorage.getItem('inventory_suppliers');
      setSuppliers(savedSuppliers ? JSON.parse(savedSuppliers) : []);

      const savedCustomerPayments = localStorage.getItem('inventory_customer_payments');
      setCustomerPayments(savedCustomerPayments ? JSON.parse(savedCustomerPayments) : []);

      const savedSupplierPayments = localStorage.getItem('inventory_supplier_payments');
      setSupplierPayments(savedSupplierPayments ? JSON.parse(savedSupplierPayments) : []);

      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. Customers Sync
    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const custs: Customer[] = [];
      snapshot.forEach((d) => custs.push(d.data() as Customer));
      setCustomersState(custs.sort((a, b) => a.name.localeCompare(b.name)));
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

    // 5. Sales Sync
    const unsubSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
      const salesList: any[] = [];
      snapshot.forEach((d) => salesList.push(d.data()));
      setSales(salesList);
    }, (err) => console.error(err));

    return () => {
      unsubCustomers();
      unsubSuppliers();
      unsubCustomerPayments();
      unsubSupplierPayments();
      unsubSales();
    };
  }, []);

  // --- Feedback Auto-hide ---
  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  useEffect(() => {
    const handleTrigger = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.tab === 'ledger') {
        handleOpenRecordModal();
      }
    };
    window.addEventListener('nexus-trigger-add-modal', handleTrigger);
    return () => window.removeEventListener('nexus-trigger-add-modal', handleTrigger);
  }, []);

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
      if (!auth.currentUser) {
        // Offline / local storage fallback
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

          // Update Customer Payment list
          const savedPayments = localStorage.getItem('inventory_customer_payments') || '[]';
          const paymentsList = JSON.parse(savedPayments);
          paymentsList.unshift(newPayment);
          localStorage.setItem('inventory_customer_payments', JSON.stringify(paymentsList));
          setCustomerPayments(paymentsList);

          // Update Customers list
          const savedCustomers = localStorage.getItem('inventory_customers') || '[]';
          let customersList = JSON.parse(savedCustomers);
          customersList = customersList.map((c: any) => c.id === targetCust.id ? { ...c, dueBalance: remDue } : c);
          localStorage.setItem('inventory_customers', JSON.stringify(customersList));
          setCustomersState(customersList);

          // Update Cash Ledger
          const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
          const ledgerList = JSON.parse(savedLedger);
          const cashLedgerId = `cl-${paymentId}`;
          ledgerList.unshift({
            id: cashLedgerId,
            type: 'inflow',
            source: 'payment',
            amount: amountVal,
            referenceId: paymentId,
            description: `Collected customer payment from "${targetCust.name}"`,
            timestamp: new Date().toISOString()
          });
          localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));

          setFeedback({
            message: `Recorded customer payment of $${amountVal.toFixed(2)} for "${targetCust.name}" locally`,
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

          // Update Supplier Payment list
          const savedPayments = localStorage.getItem('inventory_supplier_payments') || '[]';
          const paymentsList = JSON.parse(savedPayments);
          paymentsList.unshift(newPayment);
          localStorage.setItem('inventory_supplier_payments', JSON.stringify(paymentsList));
          setSupplierPayments(paymentsList);

          // Update Suppliers list
          const savedSuppliers = localStorage.getItem('inventory_suppliers') || '[]';
          let suppliersList = JSON.parse(savedSuppliers);
          suppliersList = suppliersList.map((s: any) => s.id === targetSupp.id ? { ...s, dueBalance: remDue } : s);
          localStorage.setItem('inventory_suppliers', JSON.stringify(suppliersList));
          setSuppliers(suppliersList);

          // Update Cash Ledger
          const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
          const ledgerList = JSON.parse(savedLedger);
          const cashLedgerId = `cl-${paymentId}`;
          ledgerList.unshift({
            id: cashLedgerId,
            type: 'outflow',
            source: 'payment',
            amount: amountVal,
            referenceId: paymentId,
            description: `Paid supplier payment to "${targetSupp.name}"`,
            timestamp: new Date().toISOString()
          });
          localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));

          setFeedback({
            message: `Recorded supplier payment of $${amountVal.toFixed(2)} for "${targetSupp.name}" locally`,
            type: 'success'
          });
        }
        setIsSaving(false);
        setIsFormOpen(false);
        return;
      }

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

        // Link with Cash / Capital Accounting Layer
        const cashLedgerId = `cl-${paymentId}`;
        await setDoc(doc(db, 'cashLedger', cashLedgerId), {
          id: cashLedgerId,
          type: 'inflow',
          source: 'payment',
          amount: amountVal,
          referenceId: paymentId,
          description: `Collected customer payment from "${targetCust.name}"`,
          timestamp: new Date().toISOString()
        });

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

        // Link with Cash / Capital Accounting Layer
        const cashLedgerId = `cl-${paymentId}`;
        await setDoc(doc(db, 'cashLedger', cashLedgerId), {
          id: cashLedgerId,
          type: 'outflow',
          source: 'payment',
          amount: amountVal,
          referenceId: paymentId,
          description: `Disbursed supplier payment to "${targetSupp.name}"`,
          timestamp: new Date().toISOString()
        });

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
                  <div className="space-y-6">
                    {/* SECTION 1: Outstanding Due */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase tracking-wider text-slate-450 text-slate-400 font-extrabold flex items-center gap-1.5 px-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-550 bg-rose-500"></span>
                        <span>Customers With Outstanding Due</span>
                        <span className="ml-auto bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-mono">
                          {searchedCustomers.filter(c => (c.customerCredit || 0) === 0).length}
                        </span>
                      </h4>
                      {searchedCustomers.filter(c => (c.customerCredit || 0) === 0).length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic pl-3.5 py-2">No customers with outstanding due balances.</p>
                      ) : (
                        <div className="divide-y divide-slate-100 bg-slate-50/20 rounded-2xl p-3 border border-slate-100">
                          {searchedCustomers.filter(c => (c.customerCredit || 0) === 0).map((c) => (
                            <div key={c.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group transition">
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600 transition">{c.name}</h4>
                                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
                                  <span className="inline-flex shrink-0 px-1 py-0.5 text-[8px] bg-white border border-slate-100 text-slate-400 font-bold rounded">
                                    ID: {c.id}
                                  </span>
                                  {c.phone ? (
                                    <span className="inline-flex items-center gap-1 text-[9px] text-slate-500 font-medium truncate">
                                      <Phone className="h-2 w-2 text-slate-400" />
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
                                {(userRole === 'admin' || userRole === 'accountant') && c.dueBalance > 0 && (
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
                      )}
                    </div>

                    {/* SECTION 2: Credit Balance */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <h4 className="text-[10px] uppercase tracking-wider text-slate-450 text-slate-400 font-extrabold flex items-center gap-1.5 px-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-555 bg-emerald-500 animate-pulse"></span>
                        <span>Customers With Credit Balance</span>
                        <span className="ml-auto bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-mono">
                          {searchedCustomers.filter(c => (c.customerCredit || 0) > 0).length}
                        </span>
                      </h4>
                      {searchedCustomers.filter(c => (c.customerCredit || 0) > 0).length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic pl-3.5 py-2">No customers with credit balances.</p>
                      ) : (
                        <div className="divide-y divide-slate-100 bg-slate-50/20 rounded-2xl p-3 border border-slate-100">
                          {searchedCustomers.filter(c => (c.customerCredit || 0) > 0).map((c) => (
                            <div key={c.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group transition">
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-emerald-600 transition">{c.name}</h4>
                                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
                                  <span className="inline-flex shrink-0 px-1 py-0.5 text-[8px] bg-white border border-slate-100 text-slate-400 font-bold rounded">
                                    ID: {c.id}
                                  </span>
                                  {c.phone ? (
                                    <span className="inline-flex items-center gap-1 text-[9px] text-slate-500 font-medium truncate">
                                      <Phone className="h-2 w-2 text-slate-404 text-slate-400" />
                                      <span className="truncate">{c.phone}</span>
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Credit Balance</p>
                                  <span className="text-xs font-bold block mt-1 text-emerald-600 font-extrabold">
                                    ${(c.customerCredit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
                            {(userRole === 'admin' || userRole === 'accountant') && owed > 0 && (
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

              {(userRole === 'admin' || userRole === 'accountant') && (
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
                <div className="divide-y divide-slate-100">
                  {(activeSegment === 'customers' ? filteredCustomerPayments : filteredSupplierPayments).map((p) => (
                    <div 
                      key={p.id} 
                      className={`py-4.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group transition ${p.status === 'voided' || p.status === 'VOID' ? 'opacity-45 bg-slate-55 bg-slate-50/70 line-through text-slate-400' : ''}`}
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
                        <div className="text-[10px] text-slate-400 border-l border-slate-100 pl-4 space-y-0.5 min-w-[124px]">
                          <div>Owed: <span className="font-bold text-slate-600">${(p.previousDue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                          <div>Rem: <span className="font-bold text-slate-800">${(p.remainingDue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        </div>

                        {/* Void Control */}
                        <div className="border-l border-slate-100 pl-4 flex flex-col items-center justify-center gap-1.5 min-w-[95px]">
                          {p.status === 'voided' || p.status === 'VOID' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shadow-3xs">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                              Void
                            </span>
                          ) : (
                            <>
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-250/60 text-emerald-700 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shadow-3xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                Success
                              </span>
                              {(userRole === 'admin' || userRole === 'accountant') && (
                                <button
                                  type="button"
                                  onClick={() => voidTransaction(p.id)}
                                  className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 cursor-pointer transition uppercase tracking-wider"
                                >
                                  Void
                                </button>
                              )}
                            </>
                          )}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
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
                      customers.filter(c => c.status !== 'inactive').map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Outstanding receivable: ${c.dueBalance.toFixed(2)})
                        </option>
                      ))
                    ) : (
                      suppliers.filter(s => s.status !== 'inactive').map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} (Outstanding trade payable: ${(s.dueBalance ?? 0).toFixed(2)})
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
                    <strong className="text-orange-600 font-extrabold text-[13px]">${selectedPersonOutstanding()?.toFixed(2)}</strong>
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

      <AnimatePresence>
        {voidConfirmationPayment && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xl animate-in duration-200 fade-in zoom-in-95"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-sans text-sm font-bold tracking-tight text-slate-850">
                    Confirm Void Payment
                  </h3>
                  <p className="text-xs text-slate-550 leading-relaxed">
                    Are you sure you want to VOID this payment settlement? This will mark it as VOID, rollback associated due balances, and reverse cash ledger entries. This action is irreversible.
                  </p>
                  <div className="text-[10px] font-mono text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                    <div><span className="font-bold">Transaction ID:</span> {voidConfirmationPayment.id}</div>
                    <div>
                      <span className="font-bold">Entity:</span> {'customerName' in voidConfirmationPayment ? voidConfirmationPayment.customerName : voidConfirmationPayment.supplierName}
                    </div>
                    <div><span className="font-bold">Settlement Date:</span> {voidConfirmationPayment.paymentDate}</div>
                    <div><span className="font-bold">Amount Settled:</span> ${voidConfirmationPayment.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
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

    </div>
  );
}
