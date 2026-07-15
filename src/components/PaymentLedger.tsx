import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { calculateCustomerLedger, isVoidStatus, isInactiveStatus } from '../lib/utils';
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
  Phone,
  Printer,
  Download,
  QrCode,
  FileSpreadsheet
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError, logSystemActivity, logFinancialAudit } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { Customer, Supplier, CustomerPayment, SupplierPayment } from '../types';
import { usePermission, UserRole } from '../hooks/usePermission';
import { getNextPostingNumber, commitNextPostingNumber, ensureSystemAccountsExist, SYSTEM_ACCOUNTS, resolveSystemAccount } from '../lib/postingEngine';

function getNextReceiptNumber(payments: CustomerPayment[]): string {
  const rcNums = payments
    .map(p => p.receiptNumber || '')
    .filter(num => num.startsWith('RC-'))
    .map(num => parseInt(num.replace('RC-', ''), 10))
    .filter(val => !isNaN(val));
  const maxNum = rcNums.length > 0 ? Math.max(...rcNums) : 4586;
  return `RC-${maxNum + 1}`;
}

function getNextVoucherNumber(payments: SupplierPayment[]): string {
  const pvNums = payments
    .map(p => p.voucherNumber || '')
    .filter(num => num.startsWith('PV-'))
    .map(num => parseInt(num.replace('PV-', ''), 10))
    .filter(val => !isNaN(val));
  const maxVal = pvNums.length > 0 ? Math.max(...pvNums) : 0;
  return `PV-${(maxVal + 1).toString().padStart(6, '0')}`;
}

function numberToWords(num: number): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const scales = ['', 'thousand', 'million', 'billion'];

  if (num === 0) return 'zero dollars';

  const parts = num.toFixed(2).split('.');
  const dollars = parseInt(parts[0], 10);
  const cents = parts[1] ? parseInt(parts[1].substring(0, 2).padEnd(2, '0'), 10) : 0;

  function convertSection(n: number): string {
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += ones[n] + ' ';
    }
    return str.trim();
  }

  let dollarStr = '';
  let tempDollars = dollars;
  let scaleIdx = 0;

  while (tempDollars > 0) {
    const chunk = tempDollars % 1000;
    if (chunk > 0) {
      const chunkStr = convertSection(chunk);
      dollarStr = chunkStr + (scales[scaleIdx] ? ' ' + scales[scaleIdx] : '') + (dollarStr ? ', ' + dollarStr : '');
    }
    tempDollars = Math.floor(tempDollars / 1000);
    scaleIdx++;
  }

  dollarStr = dollarStr.trim() || 'zero';
  dollarStr += ' dollar' + (dollars === 1 ? '' : 's');

  let centStr = '';
  if (cents > 0) {
    const centWords = convertSection(cents);
    centStr = ' and ' + centWords + ' cent' + (cents === 1 ? '' : 's');
  }

  return (dollarStr + centStr).toUpperCase();
}

export default function PaymentLedger({ userRole = 'admin' }: { userRole?: UserRole }) {
  const { permissions } = usePermission({ role: userRole });

  // --- Core State ---
  const [activeSegment, setActiveSegment] = useState<'customers' | 'suppliers'>('customers');
  const [customersState, setCustomersState] = useState<Customer[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);

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

  const [loading, setLoading] = useState(true);
  const [coa, setCoa] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [voidConfirmationPayment, setVoidConfirmationPayment] = useState<CustomerPayment | SupplierPayment | null>(null);
  const [overpaymentConfirmData, setOverpaymentConfirmData] = useState<{ outstanding: number; amount: number; excess: number } | null>(null);

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
    const isCustomerPayment = 'customerId' in payment;
    try {
      if (!auth.currentUser) {
        // Local Voiding Fallback
        if (isCustomerPayment) {
          const cp = payment as CustomerPayment;
          
          // Update Customers list
          const savedCustomers = localStorage.getItem('inventory_customers') || '[]';
          let customersList = JSON.parse(savedCustomers);
          // When a payment is voided, we do not mutate the customer's Opening Balance (dueBalance).
          // The dynamic ledger recalculation will automatically reflect the change.
          customersList = customersList.map((c: any) => c.id === cp.customerId ? { ...c } : c);
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
        if (isCustomerPayment) {
          const cp = payment as CustomerPayment;
          const customerRef = doc(db, 'customers', cp.customerId);
          const customerSnap = await transaction.get(customerRef);

          // --- REVERSAL LEDGER POSTING (JV) ---
          const cpDate = cp.paymentDate || new Date().toISOString().split('T')[0];
          const cpYear = new Date(cpDate).getFullYear() || 2026;
          const { postingNumber: jvPostingNumber, nextVal: jvNextVal } = await getNextPostingNumber(transaction, 'JV', cpYear);

          // When a payment is voided, we do not mutate the customer's Opening Balance (dueBalance).
          // The dynamic ledger recalculation will automatically reflect the change.

          const paymentRef = doc(db, 'customerPayments', cp.id);
          transaction.update(paymentRef, { status: 'VOID' });

          const cashLedgerRef = doc(db, 'cashLedger', `cl-${cp.id}`);
          transaction.update(cashLedgerRef, { status: 'VOID' });

          const cashAcc = resolveSystemAccount('CASH', coa);
          const arAcc = resolveSystemAccount('ACCOUNTS_RECEIVABLE', coa);

          const lines = [
            // Debit: Accounts Receivable (1200)
            {
              accountId: arAcc.id,
              accountCode: arAcc.code,
              accountName: arAcc.name,
              debit: cp.amountPaid,
              credit: 0,
              baseCurrencyDebit: cp.amountPaid,
              baseCurrencyCredit: 0
            },
            // Credit: Cash in Hand (1100)
            {
              accountId: cashAcc.id,
              accountCode: cashAcc.code,
              accountName: cashAcc.name,
              debit: 0,
              credit: cp.amountPaid,
              baseCurrencyDebit: 0,
              baseCurrencyCredit: cp.amountPaid
            }
          ];

          // Validate Debit == Credit
          const totalDebits = lines.reduce((sum, l) => sum + l.debit, 0);
          const totalCredits = lines.reduce((sum, l) => sum + l.credit, 0);
          if (Math.abs(totalDebits - totalCredits) > 0.01) {
            throw new Error(`Double-entry unbalanced error: Total Debits ($${totalDebits}) does not match Total Credits ($${totalCredits}).`);
          }

          const periodMonth = String(new Date(cpDate).getMonth() + 1).padStart(2, '0');
          const accountingPeriod = `${cpYear}-${periodMonth}`;
          const entryId = `le-void-payment-${cp.id}`;

          const ledgerEntry = {
            id: entryId,
            postingNumber: jvPostingNumber,
            companyId: 'comp-default',
            branchId: 'branch-main',
            fiscalYear: cpYear,
            accountingPeriod,
            sourceModule: 'CUSTOMER_PAYMENT' as const,
            postingStatus: 'REVERSED' as const,
            currency: 'USD',
            exchangeRate: 1,
            baseCurrencyCode: 'USD',
            version: 1,
            narration: `Reversal of Customer Payment from "${cp.customerName || 'Customer'}". Receipt: ${cp.receiptNumber || cp.id}`,
            createdFrom: cp.id,
            approvalStatus: 'APPROVED' as const,
            postingDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
            lines,
            originalEntryId: `le-payment-${cp.id}`
          };

          const ledgerRef = doc(db, 'ledgerEntries', entryId);
          transaction.set(ledgerRef, ledgerEntry);

          // Commit sequence
          commitNextPostingNumber(transaction, 'JV', jvNextVal);
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
      await logFinancialAudit({
        action: isCustomerPayment ? 'VOID_CUSTOMER_PAYMENT' : 'VOID_SUPPLIER_PAYMENT',
        entityType: 'payment',
        entityId: payment.id,
        referenceId: `cl-${payment.id}`,
        customerId: isCustomerPayment ? (payment as CustomerPayment).customerId : null,
        supplierId: !isCustomerPayment ? (payment as SupplierPayment).supplierId : null,
        productId: null,
        amount: payment.amountPaid,
        paymentType: 'Cash',
        previousState: payment,
        newState: { ...payment, status: 'VOID' },
        notes: `Voided ${isCustomerPayment ? 'customer' : 'supplier'} payment ID: ${payment.id}`,
        userRole: userRole
      });

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
        handleFirestoreError(err, OperationType.UPDATE, `${isCustomerPayment ? 'customer' : 'supplier'}Payments/${payment.id}`);
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
  const [searchQuery, setSearchQuery] = useState('');

  // --- Company Settings State ---
  const [companyProfile] = useState<any>(() => {
    const saved = localStorage.getItem('invoice_company_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      name: 'NEXUS ENTERPRISE ERP',
      address: '100 Industrial Parkway, Sector 4',
      phone: '+1 (555) 019-2831',
      email: 'finance@nexus-erp.corp',
      website: 'www.nexus-erp.corp',
      taxRegistrationId: 'TX-9988221-A',
      taxRatePercent: 15
    };
  });

  // --- Selected Payment for Receipt Viewer Modal ---
  const [selectedPayment, setSelectedPayment] = useState<CustomerPayment | null>(null);
  const [selectedSupplierPayment, setSelectedSupplierPayment] = useState<SupplierPayment | null>(null);

  // --- Form Modal State ---
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    personId: '',
    amountPaid: '',
    paymentDate: new Date().toISOString().split('T')[0],
    receiptNumber: '',
    receiptDate: new Date().toISOString().split('T')[0],
    receivedBy: '',
    referenceNumber: '',
    chequeOrBankRef: '',
    notes: '',
    voucherNumber: '',
    paidBy: ''
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // FIFO allocation utility for the selected payment receipt
  const getFIFOAllocationForSelected = () => {
    if (!selectedPayment) return [];
    
    // 1. Get all credit sales for the customer, sorted oldest first
    const custSales = sales
      .filter(s => s.customerId === selectedPayment.customerId && s.paymentType?.toLowerCase() === 'credit' && !isVoidStatus(s.status))
      .sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime())
      .map(s => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber || s.id,
        saleDate: s.saleDate,
        totalAmount: s.totalAmount,
        remaining: s.totalAmount
      }));

    // 2. Get all payments for this customer sorted by date up to and including the target payment
    const activePayments = customerPayments
      .filter(p => p.customerId === selectedPayment.customerId && !isVoidStatus(p.status))
      .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());

    // 3. For each payment chronologically, allocate its amountPaid to the oldest invoices
    let targetAllocations: Array<{
      invoiceId: string;
      invoiceNumber: string;
      saleDate: string;
      totalAmount: number;
      allocatedAmount: number;
      remainingAmount: number;
      status: string;
    }> = [];

    for (const pay of activePayments) {
      let unallocated = pay.amountPaid;
      const currentPayAllocations: typeof targetAllocations = [];

      for (const sale of custSales) {
        if (sale.remaining <= 0) continue;
        if (unallocated <= 0) break;

        const allocate = Math.min(sale.remaining, unallocated);
        sale.remaining -= allocate;
        unallocated -= allocate;

        currentPayAllocations.push({
          invoiceId: sale.id,
          invoiceNumber: sale.invoiceNumber,
          saleDate: sale.saleDate,
          totalAmount: sale.totalAmount,
          allocatedAmount: allocate,
          remainingAmount: sale.remaining,
          status: sale.remaining === 0 ? 'Fully Paid' : 'Partially Paid'
        });
      }

      // If this is the selected payment, we extract its allocations
      if (pay.id === selectedPayment.id) {
        targetAllocations = currentPayAllocations;
        break;
      }
    }

    // Check if there is still unallocated amount left from this payment
    let totalAllocatedSum = targetAllocations.reduce((sum, item) => sum + item.allocatedAmount, 0);
    let unallocatedRemainder = selectedPayment.amountPaid - totalAllocatedSum;
    if (unallocatedRemainder > 0.005) {
      targetAllocations.push({
        invoiceId: 'CREDIT_POOL',
        invoiceNumber: 'Customer Credit Account Pool',
        saleDate: selectedPayment.paymentDate,
        totalAmount: unallocatedRemainder,
        allocatedAmount: unallocatedRemainder,
        remainingAmount: 0,
        status: 'Unallocated Future Credit'
      });
    }

    return targetAllocations;
  };

  const handlePrintReceiptPDF = (pay: CustomerPayment) => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const primaryColor = [15, 23, 42]; // Slate 900
      const accentColor = [79, 70, 229]; // Indigo 600
      const textColor = [51, 65, 85]; // Slate 700
      const borderColor = [226, 232, 240]; // Slate 200
      const lightBg = [248, 250, 252]; // Slate 50

      const pageWidth = 210;
      const margin = 20;
      let currentY = 20;

      // Header top line bar
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, 12, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('NEXUS ERP  |  OFFICIAL SALES AUDIT TRANS-RECEIPT', margin, 8);

      currentY += 10;

      doc.setFontSize(22);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('NEXUS ERP INC.', margin, currentY + 10);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text('Global Financial Registry: NF-8902-X', margin, currentY + 15);
      doc.text('support@nexus-erp.enterprise.com', margin, currentY + 19);

      const rightColX = 130;
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(rightColX, currentY + 2, 60, 24, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('RECEIPT VOUCHER', rightColX + 5, currentY + 8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text(`Receipt #: ${pay.receiptNumber || 'N/A'}`, rightColX + 5, currentY + 14);
      doc.text(`Date: ${pay.paymentDate}`, rightColX + 5, currentY + 19);
      doc.text(`Status: ${pay.status?.toUpperCase() || 'SUCCESS'}`, rightColX + 5, currentY + 24);

      currentY += 34;

      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY, pageWidth - margin, currentY);

      currentY += 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('1. RECEIPT PARTICULARS', margin, currentY);

      currentY += 4;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text('Customer Account Name:', margin, currentY + 4);
      doc.setFont('helvetica', 'bold');
      doc.text(pay.customerName || 'N/A', margin + 40, currentY + 4);

      doc.setFont('helvetica', 'normal');
      doc.text('Customer System ID:', margin, currentY + 9);
      doc.setFont('helvetica', 'bold');
      doc.text(pay.customerId || 'N/A', margin + 40, currentY + 9);

      doc.setFont('helvetica', 'normal');
      doc.text('Account Prev. Due:', margin, currentY + 14);
      doc.setFont('helvetica', 'bold');
      doc.text(`$${(pay.previousDue ?? 0).toFixed(2)}`, margin + 40, currentY + 14);

      doc.setFont('helvetica', 'normal');
      doc.text('Account Remaining Due:', margin, currentY + 19);
      doc.setFont('helvetica', 'bold');
      doc.text(`$${(pay.remainingDue ?? 0).toFixed(2)}`, margin + 40, currentY + 19);

      doc.setFont('helvetica', 'normal');
      doc.text('Received By Agent:', rightColX, currentY + 4);
      doc.setFont('helvetica', 'bold');
      doc.text(pay.receivedBy || 'System Admin', rightColX + 35, currentY + 4);

      doc.setFont('helvetica', 'normal');
      doc.text('Receipt Date:', rightColX, currentY + 9);
      doc.setFont('helvetica', 'bold');
      doc.text(pay.receiptDate || pay.paymentDate, rightColX + 35, currentY + 9);

      doc.setFont('helvetica', 'normal');
      doc.text('Reference Number:', rightColX, currentY + 14);
      doc.setFont('helvetica', 'bold');
      doc.text(pay.referenceNumber || 'N/A', rightColX + 35, currentY + 14);

      doc.setFont('helvetica', 'normal');
      doc.text('Cheque / Bank Ref:', rightColX, currentY + 19);
      doc.setFont('helvetica', 'bold');
      doc.text(pay.chequeOrBankRef || 'N/A', rightColX + 35, currentY + 19);

      currentY += 28;

      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 22, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('TOTAL AMOUNT RECEIVED', margin + 6, currentY + 7);

      doc.setFontSize(16);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`$${pay.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 50, currentY + 9);

      const words = numberToWords(pay.amountPaid);
      doc.setFont('helvetica', 'oblique');
      doc.setFontSize(8.5);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text(`Amount in Words: ${words} Dollars and Zero Cents Only`, margin + 6, currentY + 15, { maxWidth: 160 });

      currentY += 30;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('2. CHRONOLOGICAL INVOICE ALLOCATION (FIFO ENGINE)', margin, currentY);

      currentY += 4;

      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(margin, currentY, pageWidth - (margin * 2), 7, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text('INVOICE / ID', margin + 4, currentY + 5);
      doc.text('DATE', margin + 55, currentY + 5);
      doc.text('TOTAL VAL', margin + 85, currentY + 5);
      doc.text('ALLOCATED', margin + 115, currentY + 5);
      doc.text('REM BALANCE', margin + 145, currentY + 5);

      currentY += 7;

      const allocs = getFIFOAllocationForSelected();

      if (allocs.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text('No active credit invoices found. Entire amount allocated to Customer Credit Account Balance.', margin + 4, currentY + 6);
        currentY += 10;
      } else {
        allocs.forEach((item, index) => {
          doc.setFillColor(index % 2 === 0 ? 255 : lightBg[0], index % 2 === 0 ? 255 : lightBg[1], index % 2 === 0 ? 255 : lightBg[2]);
          doc.rect(margin, currentY, pageWidth - (margin * 2), 8, 'F');

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(textColor[0], textColor[1], textColor[2]);
          doc.text(item.invoiceNumber, margin + 4, currentY + 5.5);
          doc.text(item.saleDate, margin + 55, currentY + 5.5);
          doc.text(`$${item.totalAmount.toFixed(2)}`, margin + 85, currentY + 5.5);
          doc.text(`$${item.allocatedAmount.toFixed(2)}`, margin + 115, currentY + 5.5);
          doc.text(`$${item.remainingAmount.toFixed(2)}`, margin + 145, currentY + 5.5);

          currentY += 8;
        });
      }

      currentY += 15;

      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.line(margin, currentY, margin + 60, currentY);
      doc.line(pageWidth - margin - 60, currentY, pageWidth - margin, currentY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text('Authorized Representative Signature', margin + 5, currentY + 4);
      doc.text('Customer Acknowledgement Signature', pageWidth - margin - 55, currentY + 4);

      doc.save(`NEXUS-RECEIPT-${pay.receiptNumber || pay.id}.pdf`);
    } catch (e: any) {
      console.error('Error generating receipt PDF:', e);
      alert('Error printing receipt: ' + e.message);
    }
  };

  const handlePrintVoucherPDF = (pay: SupplierPayment) => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const primaryColor = [15, 23, 42]; // Slate 900
      const accentColor = [194, 65, 12]; // Orange 700 / Dark Red for AP
      const textColor = [51, 65, 85]; // Slate 700
      const borderColor = [226, 232, 240]; // Slate 200
      const lightBg = [248, 250, 252]; // Slate 50

      const pageWidth = 210;
      const margin = 20;
      let currentY = 20;

      // Header top line bar
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, 12, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('NEXUS ERP  |  OFFICIAL ACCOUNTS PAYABLE TRANS-VOUCHER', margin, 8);

      currentY += 10;

      doc.setFontSize(22);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('NEXUS ERP INC.', margin, currentY + 10);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text('Global Financial Registry: NF-8902-X', margin, currentY + 15);
      doc.text('support@nexus-erp.enterprise.com', margin, currentY + 19);

      const rightColX = 130;
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(rightColX, currentY + 2, 60, 24, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('PAYMENT VOUCHER', rightColX + 5, currentY + 8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text(`Voucher #: ${pay.voucherNumber || 'N/A'}`, rightColX + 5, currentY + 14);
      doc.text(`Date: ${pay.paymentDate}`, rightColX + 5, currentY + 19);
      doc.text(`Status: ${pay.status?.toUpperCase() || 'SUCCESS'}`, rightColX + 5, currentY + 24);

      currentY += 34;

      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY, pageWidth - margin, currentY);

      currentY += 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('1. VOUCHER PARTICULARS', margin, currentY);

      currentY += 4;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text('Supplier Account Name:', margin, currentY + 4);
      doc.setFont('helvetica', 'bold');
      doc.text(pay.supplierName || 'N/A', margin + 40, currentY + 4);

      doc.setFont('helvetica', 'normal');
      doc.text('Supplier System ID:', margin, currentY + 9);
      doc.setFont('helvetica', 'bold');
      doc.text(pay.supplierId || 'N/A', margin + 40, currentY + 9);

      doc.setFont('helvetica', 'normal');
      doc.text('Account Prev. Due:', margin, currentY + 14);
      doc.setFont('helvetica', 'bold');
      doc.text(`$${(pay.previousDue ?? 0).toFixed(2)}`, margin + 40, currentY + 14);

      doc.setFont('helvetica', 'normal');
      doc.text('Account Remaining Due:', margin, currentY + 19);
      doc.setFont('helvetica', 'bold');
      doc.text(`$${(pay.remainingDue ?? 0).toFixed(2)}`, margin + 40, currentY + 19);

      doc.setFont('helvetica', 'normal');
      doc.text('Disbursed By Agent:', rightColX, currentY + 4);
      doc.setFont('helvetica', 'bold');
      doc.text(pay.paidBy || 'System Admin', rightColX + 35, currentY + 4);

      doc.setFont('helvetica', 'normal');
      doc.text('Voucher Date:', rightColX, currentY + 9);
      doc.setFont('helvetica', 'bold');
      doc.text(pay.paymentDate, rightColX + 35, currentY + 9);

      doc.setFont('helvetica', 'normal');
      doc.text('Reference Number:', rightColX, currentY + 14);
      doc.setFont('helvetica', 'bold');
      doc.text(pay.referenceNumber || 'N/A', rightColX + 35, currentY + 14);

      doc.setFont('helvetica', 'normal');
      doc.text('Cheque / Bank Ref:', rightColX, currentY + 19);
      doc.setFont('helvetica', 'bold');
      doc.text(pay.chequeOrBankRef || 'N/A', rightColX + 35, currentY + 19);

      currentY += 28;

      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 22, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('TOTAL AMOUNT DISBURSED', margin + 6, currentY + 7);

      doc.setFontSize(16);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`$${pay.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 50, currentY + 9);

      const words = numberToWords(pay.amountPaid);
      doc.setFont('helvetica', 'oblique');
      doc.setFontSize(8.5);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text(`Amount in Words: ${words} Dollars and Zero Cents Only`, margin + 6, currentY + 15, { maxWidth: 160 });

      currentY += 30;

      // Signature / Footer
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.line(margin, currentY, pageWidth - margin, currentY);

      currentY += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text('Generated by Nexus Enterprise Accounts Payable Engine. Authenticated via SECURE FINANCIAL LOGS.', margin, currentY);

      doc.save(`Voucher_${pay.voucherNumber || pay.id}.pdf`);
    } catch (err: any) {
      console.error('Failed to generate AP Voucher PDF:', err);
      alert('Error printing voucher: ' + err.message);
    }
  };

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

      const savedCOA = localStorage.getItem('nexus_chart_of_accounts');
      setCoa(savedCOA ? JSON.parse(savedCOA) : []);

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

    // 6. Chart of Accounts Sync
    const unsubCOA = onSnapshot(collection(db, 'chartOfAccounts'), (snapshot) => {
      const coaList: any[] = [];
      snapshot.forEach((d) => coaList.push(d.data()));
      setCoa(coaList);
    }, (err) => console.error(err));

    return () => {
      unsubCustomers();
      unsubSuppliers();
      unsubCustomerPayments();
      unsubSupplierPayments();
      unsubSales();
      unsubCOA();
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
    setSearchQuery('');
  };

  // --- Record Payment Open Action ---
  const handleOpenRecordModal = (initialPersonId: string = '') => {
    const nextRcNum = activeSegment === 'customers' ? getNextReceiptNumber(customerPayments) : '';
    const nextPvNum = activeSegment === 'suppliers' ? getNextVoucherNumber(supplierPayments) : '';
    setFormData({
      personId: initialPersonId,
      amountPaid: '',
      paymentDate: new Date().toISOString().split('T')[0],
      receiptNumber: nextRcNum,
      receiptDate: new Date().toISOString().split('T')[0],
      receivedBy: auth.currentUser?.email || 'Cashier',
      referenceNumber: '',
      chequeOrBankRef: '',
      notes: '',
      voucherNumber: nextPvNum,
      paidBy: auth.currentUser?.email || 'Cashier'
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
        // Customer overpayment is allowed, and stored as credit.
      } else {
        // Supplier overpayment is allowed, and stored as Supplier Advance.
      }
    }

    if (!formData.paymentDate) {
      errs.paymentDate = 'Please specify a transaction date';
    }

    if (activeSegment === 'customers') {
      const rcNum = formData.receiptNumber.trim();
      if (!rcNum) {
        errs.receiptNumber = 'Receipt number is required';
      } else {
        const dup = customerPayments.some(
          (p) => p.receiptNumber?.toUpperCase() === rcNum.toUpperCase() && !isVoidStatus(p.status)
        );
        if (dup) {
          errs.receiptNumber = 'Receipt Number already exists.';
        }
      }
    }

    if (activeSegment === 'suppliers') {
      const pvNum = formData.voucherNumber.trim();
      if (!pvNum) {
        errs.voucherNumber = 'Voucher number is required';
      } else {
        const dup = supplierPayments.some(
          (p) => p.voucherNumber?.toUpperCase() === pvNum.toUpperCase() && !isVoidStatus(p.status)
        );
        if (dup) {
          errs.voucherNumber = 'Voucher Number already exists.';
        }
      }
      if (!formData.paidBy.trim()) {
        errs.paidBy = 'Paid By is required';
      }
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // --- Form Submit Action ---
  const proceedWithSavingPayment = async () => {
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
          const prevCredit = targetCust.customerCredit ?? 0;

          let remDue = 0;
          let newCredit = prevCredit;

          if (amountVal > prevDue) {
            remDue = 0;
            newCredit += (amountVal - prevDue);
          } else {
            remDue = prevDue - amountVal;
          }

          const paymentId = `cp-${Date.now()}`;
          const newPayment: CustomerPayment = {
            id: paymentId,
            customerId: targetCust.id,
            customerName: targetCust.name,
            amountPaid: amountVal,
            previousDue: prevDue,
            remainingDue: remDue,
            paymentDate: transDate,
            receiptNumber: formData.receiptNumber.trim(),
            receiptDate: formData.receiptDate,
            receivedBy: formData.receivedBy || 'Cashier',
            referenceNumber: formData.referenceNumber.trim(),
            chequeOrBankRef: formData.chequeOrBankRef.trim(),
            notes: transNotes,
            status: 'success'
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
          
          // Keep the original opening balance unchanged in the database/localStorage
          const origCust = customersList.find((c: any) => c.id === targetCust.id);
          const originalDue = origCust ? origCust.dueBalance : targetCust.dueBalance;
          const originalCredit = origCust ? (origCust.customerCredit || 0) : 0;
          customersList = customersList.map((c: any) => c.id === targetCust.id ? { ...c, dueBalance: originalDue, customerCredit: originalCredit } : c);
          
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
            description: `Collected customer payment from "${targetCust.name}" - Receipt: ${formData.receiptNumber.trim()}`,
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
          const prevAdvance = targetSupp.supplierAdvance ?? 0;

          let remDue = 0;
          let newAdvance = prevAdvance;
          if (amountVal > prevDue) {
            remDue = 0;
            newAdvance += (amountVal - prevDue);
          } else {
            remDue = prevDue - amountVal;
          }

          const paymentId = `sp-${Date.now()}`;
          const newPayment: SupplierPayment = {
            id: paymentId,
            supplierId: targetSupp.id,
            supplierName: targetSupp.name,
            amountPaid: amountVal,
            previousDue: prevDue,
            remainingDue: remDue,
            paymentDate: transDate,
            voucherNumber: formData.voucherNumber.trim(),
            paidBy: formData.paidBy || 'Cashier',
            referenceNumber: formData.referenceNumber.trim() || undefined,
            chequeOrBankRef: formData.chequeOrBankRef.trim() || undefined,
            notes: transNotes,
            status: 'success'
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
          suppliersList = suppliersList.map((s: any) => s.id === targetSupp.id ? { ...s, dueBalance: remDue, supplierAdvance: newAdvance } : s);
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
            description: `Paid supplier payment voucher ${formData.voucherNumber.trim()} to "${targetSupp.name}"`,
            timestamp: new Date().toISOString()
          });
          localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));

          setFeedback({
            message: `Recorded supplier payment voucher ${formData.voucherNumber.trim()} of $${amountVal.toFixed(2)} for "${targetSupp.name}" locally`,
            type: 'success'
          });
        }
        setIsSaving(false);
        setIsFormOpen(false);
        return;
      }

      if (activeSegment === 'customers') {
        const paymentId = `cp-${Date.now()}`;
        let finalPrevDue = 0;
        let finalRemDue = 0;
        let finalPrevCredit = 0;
        let finalNewCredit = 0;
        let targetCustName = "";

        await runTransaction(db, async (transaction) => {
          const customerRef = doc(db, 'customers', formData.personId);
          const customerSnap = await transaction.get(customerRef);
          if (!customerSnap.exists()) {
            throw new Error(`Customer with ID ${formData.personId} does not exist.`);
          }
          const targetCust = customerSnap.data() as Customer;
          targetCustName = targetCust.name;
          const prevDue = targetCust.dueBalance;
          const prevCredit = targetCust.customerCredit ?? 0;

          finalPrevDue = prevDue;
          finalPrevCredit = prevCredit;

          let remDue = 0;
          let newCredit = prevCredit;

          if (amountVal > prevDue) {
            remDue = 0;
            newCredit += (amountVal - prevDue);
          } else {
            remDue = prevDue - amountVal;
          }

          finalRemDue = remDue;
          finalNewCredit = newCredit;

          // --- AUTOMATIC LEDGER POSTING (RV) ---
          const transDateYear = new Date(transDate).getFullYear() || 2026;
          const { postingNumber, nextVal } = await getNextPostingNumber(transaction, 'RV', transDateYear);

          const newPayment: CustomerPayment = {
            id: paymentId,
            customerId: targetCust.id,
            customerName: targetCust.name,
            amountPaid: amountVal,
            previousDue: prevDue,
            remainingDue: remDue,
            paymentDate: transDate,
            receiptNumber: formData.receiptNumber.trim(),
            receiptDate: formData.receiptDate,
            receivedBy: formData.receivedBy || 'Cashier',
            referenceNumber: formData.referenceNumber.trim(),
            chequeOrBankRef: formData.chequeOrBankRef.trim(),
            notes: transNotes,
            status: 'success'
          };

          // 1. Create customerPayments document
          const paymentRef = doc(db, 'customerPayments', paymentId);
          const cleanPayment: any = {};
          const allowedPaymentKeys = [
            'id', 'customerId', 'customerName', 'amountPaid', 'previousDue', 'remainingDue', 
            'paymentDate', 'receiptNumber', 'receiptDate', 'receivedBy', 'referenceNumber', 
            'chequeOrBankRef', 'notes', 'status'
          ];
          allowedPaymentKeys.forEach(key => {
            if ((newPayment as any)[key] !== undefined) {
              cleanPayment[key] = (newPayment as any)[key];
            }
          });
          transaction.set(paymentRef, cleanPayment);

          // 2. Update Customer balances & audit timestamps
          const updatedCustomer: Customer = {
            ...targetCust,
            dueBalance: prevDue, // preserve opening balance in dueBalance
            customerCredit: prevCredit // preserve credit
          };
          const cleanCustomer: any = {};
          const allowedCustKeys = ['id', 'name', 'phone', 'address', 'customerType', 'dueBalance', 'customerCredit', 'createdDate', 'status', 'vatNumber', 'email'];
          allowedCustKeys.forEach(key => {
            if ((updatedCustomer as any)[key] !== undefined) {
              cleanCustomer[key] = (updatedCustomer as any)[key];
            }
          });
          transaction.set(customerRef, cleanCustomer);

          // 3. Create cashLedger entry
          const cashLedgerId = `cl-${paymentId}`;
          const cashLedgerRef = doc(db, 'cashLedger', cashLedgerId);
          transaction.set(cashLedgerRef, {
            id: cashLedgerId,
            type: 'inflow',
            source: 'payment',
            amount: amountVal,
            referenceId: paymentId,
            description: `Collected customer payment from "${targetCust.name}" - Receipt: ${formData.receiptNumber.trim()}`,
            timestamp: new Date().toISOString()
          });

          const cashAcc = resolveSystemAccount('CASH', coa);
          const arAcc = resolveSystemAccount('ACCOUNTS_RECEIVABLE', coa);

          const lines = [
            // Debit: Cash in Hand (1100)
            {
              accountId: cashAcc.id,
              accountCode: cashAcc.code,
              accountName: cashAcc.name,
              debit: amountVal,
              credit: 0,
              baseCurrencyDebit: amountVal,
              baseCurrencyCredit: 0
            },
            // Credit: Accounts Receivable (1200)
            {
              accountId: arAcc.id,
              accountCode: arAcc.code,
              accountName: arAcc.name,
              debit: 0,
              credit: amountVal,
              baseCurrencyDebit: 0,
              baseCurrencyCredit: amountVal
            }
          ];

          // Validate Debit == Credit
          const totalDebits = lines.reduce((sum, l) => sum + l.debit, 0);
          const totalCredits = lines.reduce((sum, l) => sum + l.credit, 0);
          if (Math.abs(totalDebits - totalCredits) > 0.01) {
            throw new Error(`Double-entry unbalanced error: Total Debits ($${totalDebits}) does not match Total Credits ($${totalCredits}).`);
          }

          const periodMonth = String(new Date(transDate).getMonth() + 1).padStart(2, '0');
          const accountingPeriod = `${transDateYear}-${periodMonth}`;
          const entryId = `le-payment-${paymentId}`;

          const ledgerEntry = {
            id: entryId,
            postingNumber,
            companyId: 'comp-default',
            branchId: 'branch-main',
            fiscalYear: transDateYear,
            accountingPeriod,
            sourceModule: 'CUSTOMER_PAYMENT' as const,
            postingStatus: 'POSTED' as const,
            currency: 'USD',
            exchangeRate: 1,
            baseCurrencyCode: 'USD',
            version: 1,
            narration: `Customer Payment Received from "${targetCust.name}". Receipt: ${formData.receiptNumber.trim()}`,
            createdFrom: paymentId,
            approvalStatus: 'APPROVED' as const,
            postingDate: new Date(transDate + 'T12:00:00Z').toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
            lines
          };

          const ledgerRef = doc(db, 'ledgerEntries', entryId);
          transaction.set(ledgerRef, ledgerEntry);

          // Commit next sequence number
          commitNextPostingNumber(transaction, 'RV', nextVal);

          // Ensure default system accounts exist
          const currentCoaIds = coa.map(c => c.id);
          await ensureSystemAccountsExist(transaction, currentCoaIds);
        });

        // Log financial Audit
        await logFinancialAudit({
          action: 'CUSTOMER_PAYMENT',
          entityType: 'payment',
          entityId: paymentId,
          referenceId: `cl-${paymentId}`,
          customerId: formData.personId,
          supplierId: null,
          productId: null,
          amount: amountVal,
          paymentType: 'Cash',
          previousState: {},
          newState: {
            id: paymentId,
            customerId: formData.personId,
            customerName: targetCustName,
            amountPaid: amountVal,
            paymentDate: transDate,
            receiptNumber: formData.receiptNumber.trim(),
            receiptDate: formData.receiptDate,
            receivedBy: formData.receivedBy || 'Cashier',
            referenceNumber: formData.referenceNumber.trim(),
            chequeOrBankRef: formData.chequeOrBankRef.trim(),
            notes: transNotes,
            status: 'success'
          },
          notes: `Recorded customer payment from "${targetCustName}" - Receipt Number: ${formData.receiptNumber.trim()}`,
          userRole: userRole
        });

        // System Log
        await logSystemActivity(
          "Customer payment",
          `Recorded customer payment of $${amountVal.toFixed(2)} from "${targetCustName}" under Receipt Number: ${formData.receiptNumber.trim()}.`
        );

        setFeedback({
          message: `Successfully recorded customer payment of $${amountVal.toFixed(2)} for "${targetCustName}"`,
          type: 'success'
        });
      } else {
        const paymentId = `sp-${Date.now()}`;
        let finalPrevDue = 0;
        let finalRemDue = 0;
        let targetSuppName = "";

        await runTransaction(db, async (transaction) => {
          const supplierRef = doc(db, 'suppliers', formData.personId);
          const supplierSnap = await transaction.get(supplierRef);
          if (!supplierSnap.exists()) {
            throw new Error(`Supplier with ID ${formData.personId} does not exist.`);
          }
          const targetSupp = supplierSnap.data() as Supplier;
          targetSuppName = targetSupp.name;
          const prevDue = targetSupp.dueBalance ?? 0;
          const prevAdvance = targetSupp.supplierAdvance ?? 0;

          // --- AUTOMATIC LEDGER POSTING (PV) ---
          const transDateYear = new Date(transDate).getFullYear() || 2026;
          const { postingNumber, nextVal } = await getNextPostingNumber(transaction, 'PV', transDateYear);

          let remDue = 0;
          let newAdvance = prevAdvance;
          if (amountVal > prevDue) {
            remDue = 0;
            newAdvance += (amountVal - prevDue);
          } else {
            remDue = prevDue - amountVal;
          }

          finalPrevDue = prevDue;
          finalRemDue = remDue;

          const newPayment: SupplierPayment = {
            id: paymentId,
            supplierId: targetSupp.id,
            supplierName: targetSupp.name,
            amountPaid: amountVal,
            previousDue: prevDue,
            remainingDue: remDue,
            paymentDate: transDate,
            voucherNumber: formData.voucherNumber.trim(),
            paidBy: formData.paidBy || 'Cashier',
            referenceNumber: formData.referenceNumber.trim() || undefined,
            chequeOrBankRef: formData.chequeOrBankRef.trim() || undefined,
            notes: transNotes,
            status: 'success'
          };

          // 1. Create supplierPayments document
          const paymentRef = doc(db, 'supplierPayments', paymentId);
          const cleanPayment: any = {};
          const allowedPaymentKeys = [
            'id', 'supplierId', 'supplierName', 'amountPaid', 'previousDue', 'remainingDue',
            'paymentDate', 'notes', 'status', 'voucherNumber', 'paidBy', 'referenceNumber', 'chequeOrBankRef', 'updatedAt'
          ];
          allowedPaymentKeys.forEach(key => {
            if ((newPayment as any)[key] !== undefined) {
              cleanPayment[key] = (newPayment as any)[key];
            }
          });
          transaction.set(paymentRef, cleanPayment);

          // 2. Update Supplier balances & audit timestamps
          const updatedSupplier: Supplier = {
            ...targetSupp,
            dueBalance: remDue,
            supplierAdvance: newAdvance
          };
          const cleanSupplier: any = {};
          const allowedSupplierKeys = ['id', 'name', 'phone', 'contactPerson', 'email', 'category', 'address', 'paymentType', 'dueBalance', 'supplierAdvance', 'createdDate', 'status', 'vatNumber', 'updatedAt'];
          allowedSupplierKeys.forEach(key => {
            if ((updatedSupplier as any)[key] !== undefined) {
              cleanSupplier[key] = (updatedSupplier as any)[key];
            }
          });
          transaction.set(supplierRef, cleanSupplier);

          // 3. Create cashLedger entry
          const cashLedgerId = `cl-${paymentId}`;
          const cashLedgerRef = doc(db, 'cashLedger', cashLedgerId);
          transaction.set(cashLedgerRef, {
            id: cashLedgerId,
            type: 'outflow',
            source: 'payment',
            amount: amountVal,
            referenceId: paymentId,
            description: `Disbursed supplier payment voucher ${formData.voucherNumber.trim()} to "${targetSupp.name}"`,
            timestamp: new Date().toISOString()
          });

          // 4. Create Ledger Entry for Double-Entry bookkeeping (Debit: AP, Credit: Cash)
          const apAcc = resolveSystemAccount('ACCOUNTS_PAYABLE', coa);
          const cashAcc = resolveSystemAccount('CASH', coa);

          const lines = [
            // Debit: Accounts Payable (2100)
            {
              accountId: apAcc.id,
              accountCode: apAcc.code,
              accountName: apAcc.name,
              debit: amountVal,
              credit: 0,
              baseCurrencyDebit: amountVal,
              baseCurrencyCredit: 0
            },
            // Credit: Cash in Hand (1100)
            {
              accountId: cashAcc.id,
              accountCode: cashAcc.code,
              accountName: cashAcc.name,
              debit: 0,
              credit: amountVal,
              baseCurrencyDebit: 0,
              baseCurrencyCredit: amountVal
            }
          ];

          // Validate Debit == Credit
          const totalDebits = lines.reduce((sum, l) => sum + l.debit, 0);
          const totalCredits = lines.reduce((sum, l) => sum + l.credit, 0);
          if (Math.abs(totalDebits - totalCredits) > 0.01) {
            throw new Error(`Double-entry unbalanced error: Total Debits ($${totalDebits}) does not match Total Credits ($${totalCredits}).`);
          }

          const periodMonth = String(new Date(transDate).getMonth() + 1).padStart(2, '0');
          const accountingPeriod = `${transDateYear}-${periodMonth}`;
          const entryId = `le-payment-${paymentId}`;

          const ledgerEntry = {
            id: entryId,
            postingNumber,
            companyId: 'comp-default',
            branchId: 'branch-main',
            fiscalYear: transDateYear,
            accountingPeriod,
            sourceModule: 'SUPPLIER_PAYMENT' as const,
            postingStatus: 'POSTED' as const,
            currency: 'USD',
            exchangeRate: 1,
            baseCurrencyCode: 'USD',
            version: 1,
            narration: `Supplier Payment voucher ${formData.voucherNumber.trim()} to "${targetSuppName}". Reference: ${formData.referenceNumber.trim() || 'N/A'}`,
            createdFrom: paymentId,
            approvalStatus: 'APPROVED' as const,
            postingDate: new Date(transDate + 'T12:00:00Z').toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
            lines
          };

          const ledgerRef = doc(db, 'ledgerEntries', entryId);
          transaction.set(ledgerRef, ledgerEntry);

          // Commit sequence number
          commitNextPostingNumber(transaction, 'PV', nextVal);

          // Ensure default system accounts exist
          const currentCoaIds = coa.map(c => c.id);
          await ensureSystemAccountsExist(transaction, currentCoaIds);
        });

        // Log financial Audit
        await logFinancialAudit({
          action: 'SUPPLIER_PAYMENT',
          entityType: 'payment',
          entityId: paymentId,
          referenceId: `cl-${paymentId}`,
          customerId: null,
          supplierId: formData.personId,
          productId: null,
          amount: amountVal,
          paymentType: 'Cash',
          previousState: {},
          newState: {
            id: paymentId,
            supplierId: formData.personId,
            supplierName: targetSuppName,
            amountPaid: amountVal,
            paymentDate: transDate,
            voucherNumber: formData.voucherNumber.trim(),
            paidBy: formData.paidBy || 'Cashier',
            referenceNumber: formData.referenceNumber.trim() || undefined,
            chequeOrBankRef: formData.chequeOrBankRef.trim() || undefined,
            notes: transNotes,
            status: 'success'
          },
          notes: `Recorded supplier payment voucher ${formData.voucherNumber.trim()} to "${targetSuppName}"`,
          userRole: userRole
        });

        // System Log
        await logSystemActivity(
          "Supplier payment",
          `Recorded supplier layout of $${amountVal.toFixed(2)} to "${targetSuppName}". Owed balance updated from $${finalPrevDue.toFixed(2)} to $${finalRemDue.toFixed(2)}.`
        );

        setFeedback({
          message: `Successfully recorded supplier payment of $${amountVal.toFixed(2)} to "${targetSuppName}"`,
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

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const amountVal = parseFloat(formData.amountPaid);
    if (activeSegment === 'customers') {
      const targetCust = customers.find((c) => c.id === formData.personId)!;
      const outstanding = targetCust.dueBalance;
      if (amountVal > outstanding) {
        setOverpaymentConfirmData({
          outstanding,
          amount: amountVal,
          excess: amountVal - outstanding
        });
        return;
      }
    }

    await proceedWithSavingPayment();
  };

  // --- Computed Metrics ---
  const currentMonthStr = new Date().toISOString().substring(0, 7); // "YYYY-MM"
  
  const totalCustomerPaidThisMonth = customerPayments
    .filter((p) => p.paymentDate.startsWith(currentMonthStr))
    .reduce((sum, p) => sum + p.amountPaid, 0);

  const totalSupplierPaidThisMonth = supplierPayments
    .filter((p) => p.paymentDate.startsWith(currentMonthStr))
    .reduce((sum, p) => sum + p.amountPaid, 0);

  const totalOutstandingCustomerDebt = customers.filter(c => !isInactiveStatus(c.status)).reduce((sum, c) => sum + c.dueBalance, 0);
  const totalOutstandingSupplierDebt = suppliers.filter(s => !isInactiveStatus(s.status)).reduce((sum, s) => sum + (s.dueBalance ?? 0), 0);

  // --- Filtering computations ---
  const filteredCustomerPayments = customerPayments.filter((p) => {
    const matchesPerson = !personFilter || p.customerName?.toLowerCase().includes(personFilter.toLowerCase()) || p.customerId === personFilter;
    const matchesStart = !startDate || p.paymentDate >= startDate;
    const matchesEnd = !endDate || p.paymentDate <= endDate;
    
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery = !q || 
      p.receiptNumber?.toLowerCase().includes(q) || 
      p.id.toLowerCase().includes(q) || 
      p.customerName?.toLowerCase().includes(q) || 
      p.notes?.toLowerCase().includes(q) ||
      p.paymentDate.includes(q);

    return matchesPerson && matchesStart && matchesEnd && matchesQuery;
  });

  const filteredSupplierPayments = supplierPayments.filter((p) => {
    const matchesPerson = !personFilter || p.supplierName?.toLowerCase().includes(personFilter.toLowerCase()) || p.supplierId === personFilter;
    const matchesStart = !startDate || p.paymentDate >= startDate;
    const matchesEnd = !endDate || p.paymentDate <= endDate;

    const q = searchQuery.trim().toLowerCase();
    const matchesQuery = !q || 
      p.id.toLowerCase().includes(q) || 
      p.supplierName?.toLowerCase().includes(q) || 
      p.notes?.toLowerCase().includes(q) ||
      p.paymentDate.includes(q);

    return matchesPerson && matchesStart && matchesEnd && matchesQuery;
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
                    {activeSegment === 'customers' ? customers.filter(c => !isInactiveStatus(c.status)).length : suppliers.filter(s => !isInactiveStatus(s.status)).length}
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
                      ? customers.filter((c) => !isInactiveStatus(c.status) && c.dueBalance > 0).length 
                      : suppliers.filter((s) => !isInactiveStatus(s.status) && (s.dueBalance ?? 0) > 0).length}
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

            {/* Filter by Receipt Number/General Search */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                General Query (Receipt / ID)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="E.g., RC-4587 or payment date"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-505 outline-none"
                />
              </div>
            </div>

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
                              <div className="flex items-center gap-4 shrink-0">
                                <div className="text-right">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Due Balance</p>
                                  <span className={`text-xs font-bold block mt-1 ${c.dueBalance > 0 ? 'text-orange-600 font-extrabold' : 'text-slate-400 font-normal'}`}>
                                    ${c.dueBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div className="text-right border-l border-slate-100 pl-3">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Customer Credit</p>
                                  <span className={`text-xs font-bold block mt-1 ${(c.customerCredit || 0) > 0 ? 'text-emerald-600 font-extrabold' : 'text-slate-400 font-normal'}`}>
                                    ${(c.customerCredit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                                {permissions.createPayment && c.dueBalance > 0 && (
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
                              <div className="flex items-center gap-4 shrink-0">
                                <div className="text-right">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Due Balance</p>
                                  <span className={`text-xs font-bold block mt-1 ${c.dueBalance > 0 ? 'text-orange-600 font-extrabold' : 'text-slate-400 font-normal'}`}>
                                    ${c.dueBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div className="text-right border-l border-slate-100 pl-3">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Customer Credit</p>
                                  <span className="text-xs font-bold block mt-1 text-emerald-600 font-extrabold">
                                    ${(c.customerCredit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                                {permissions.createPayment && c.dueBalance > 0 && (
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
                            {permissions.createPayment && owed > 0 && (
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

              {permissions.createPayment && (
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
                  {(activeSegment === 'customers' ? filteredCustomerPayments : filteredSupplierPayments).map((p) => {
                    const isVoided = isVoidStatus(p.status);
                    return (
                      <div 
                        key={p.id} 
                        className={`py-4.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group transition ${isVoided ? 'opacity-45 bg-slate-55 bg-slate-50/70 line-through text-slate-400' : ''}`}
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
                            {activeSegment === 'customers' && (p as CustomerPayment).receiptNumber && (
                              <span className="inline-flex items-center px-2 py-0.5 text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold rounded-full animate-in fade-in zoom-in-95">
                                Receipt: {(p as CustomerPayment).receiptNumber}
                              </span>
                            )}
                            {activeSegment === 'suppliers' && (p as SupplierPayment).voucherNumber && (
                              <span className="inline-flex items-center px-2 py-0.5 text-[10px] bg-orange-50 border border-orange-100 text-orange-700 font-extrabold rounded-full animate-in fade-in zoom-in-95">
                                Voucher: {(p as SupplierPayment).voucherNumber}
                              </span>
                            )}
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

                           {/* Void & Receipt Control */}
                          <div className="border-l border-slate-100 pl-4 flex flex-col items-center justify-center gap-1.5 min-w-[100px]">
                            {isVoided ? (
                              <>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shadow-3xs">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                  Void
                                </span>
                                {activeSegment === 'customers' ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPayment(p as CustomerPayment)}
                                    className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold text-indigo-500 hover:text-white hover:bg-indigo-500 border border-indigo-200 cursor-pointer transition uppercase tracking-wider shadow-3xs"
                                  >
                                    Receipt
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedSupplierPayment(p as SupplierPayment)}
                                    className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold text-orange-500 hover:text-white hover:bg-orange-500 border border-orange-200 cursor-pointer transition uppercase tracking-wider shadow-3xs"
                                  >
                                    Voucher
                                  </button>
                                )}
                              </>
                            ) : (
                            <>
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-250/60 text-emerald-700 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shadow-3xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                Success
                              </span>
                              <div className="flex gap-1 flex-wrap justify-center">
                                {activeSegment === 'customers' ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPayment(p as CustomerPayment)}
                                    className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 cursor-pointer transition uppercase tracking-wider shadow-3xs"
                                  >
                                    Receipt
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedSupplierPayment(p as SupplierPayment)}
                                    className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold text-orange-600 hover:text-white hover:bg-orange-600 border border-orange-200 cursor-pointer transition uppercase tracking-wider shadow-3xs"
                                  >
                                    Voucher
                                  </button>
                                )}
                                {permissions.voidPayment && (
                                  <button
                                    type="button"
                                    onClick={() => voidTransaction(p.id)}
                                    className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 cursor-pointer transition uppercase tracking-wider shadow-3xs"
                                  >
                                    Void
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )})}
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
                      customers.filter(c => !isInactiveStatus(c.status)).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Outstanding receivable: ${c.dueBalance.toFixed(2)})
                        </option>
                      ))
                    ) : (
                      suppliers.filter(s => !isInactiveStatus(s.status)).map((s) => (
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
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455 focus:ring-1 focus:ring-rose-500' 
                            : 'border-slate-200 focus:border-indigo-605 focus:ring-1 focus:ring-indigo-605'
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
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455 focus:ring-1 focus:ring-rose-500' 
                            : 'border-slate-200 focus:border-indigo-605 focus:ring-1 focus:ring-indigo-605'
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
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455 focus:ring-1 focus:ring-rose-500' 
                            : 'border-slate-200 focus:border-indigo-605 focus:ring-1 focus:ring-indigo-605'
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

      <AnimatePresence>
        {overpaymentConfirmData && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xl animate-in duration-200 fade-in zoom-in-95"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-2 w-full">
                  <h3 className="font-sans text-sm font-bold tracking-tight text-slate-850">
                    Overpayment Detected
                  </h3>
                  <p className="text-xs text-slate-550 leading-relaxed">
                    The payment amount exceeds the customer's current outstanding due balance.
                  </p>
                  <div className="text-[11px] font-mono text-slate-650 bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1.5 w-full">
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-400 uppercase tracking-wider text-[9px]">Outstanding Due:</span>
                      <strong className="text-slate-800">${overpaymentConfirmData.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="flex justify-between border-t border-slate-200/50 pt-1.5">
                      <span className="font-medium text-slate-400 uppercase tracking-wider text-[9px]">Payment Received:</span>
                      <strong className="text-indigo-600 font-extrabold">${overpaymentConfirmData.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="flex justify-between border-t border-slate-200/50 pt-1.5">
                      <span className="font-medium text-slate-400 uppercase tracking-wider text-[9px]">Excess Amount:</span>
                      <strong className="text-emerald-500 font-extrabold">${overpaymentConfirmData.excess.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 italic mt-1.5 leading-normal">
                    The excess amount of <span className="text-emerald-600 font-bold font-mono">${overpaymentConfirmData.excess.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> will be stored as Customer Credit and automatically applied to future sales.
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

      {/* PRINTABLE RECEIPT MODAL DIALOG */}
      <AnimatePresence>
        {selectedPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl rounded-[2.5rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh] animate-in duration-200 fade-in zoom-in-95"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <span>Official Customer Receipt Voucher</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
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
                      ${selectedPayment.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </strong>
                    <div className="text-[10px] text-emerald-600 leading-relaxed font-semibold italic border-t border-emerald-200/60 pt-1.5">
                      Amount in words: {numberToWords(selectedPayment.amountPaid)} Dollars Only
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
                                <span>Total Value: ${item.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold leading-none mb-0.5">Allocated</div>
                              <strong className="text-indigo-600 font-bold font-mono">${item.allocatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                              {item.invoiceId !== 'CREDIT_POOL' && (
                                <div className="text-[9px] text-slate-400">Rem: ${item.remainingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
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
                        <strong className="text-sm font-bold text-slate-800">${(selectedPayment.previousDue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div className="p-3 rounded-xl bg-white border border-slate-100/65">
                        <div className="text-[9px] font-semibold text-slate-400 uppercase">Post-Payment Outstanding</div>
                        <strong className="text-sm font-bold text-slate-800">${(selectedPayment.remainingDue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl rounded-[2.5rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh] animate-in duration-200 fade-in zoom-in-95"
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
                      ${selectedSupplierPayment.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </strong>
                    <div className="text-[10px] text-orange-600 leading-relaxed font-semibold italic border-t border-orange-200/60 pt-1.5">
                      Amount in words: {numberToWords(selectedSupplierPayment.amountPaid)} Dollars Only
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
                        <strong className="text-sm font-bold text-slate-800">${(selectedSupplierPayment.previousDue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div className="p-3 rounded-xl bg-white border border-slate-100/65">
                        <div className="text-[9px] font-semibold text-slate-400 uppercase">Post-Payment Outstanding</div>
                        <strong className="text-sm font-bold text-slate-800">${(selectedSupplierPayment.remainingDue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
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

    </div>
  );
}
