import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { applyEnterprisePdfFont, formatPdfText, formatPdfCurrency, setPdfFont } from '../utils/pdfHelper';
import { formatAmountInWords } from '../utils/amountInWords';
import { calculateCustomerLedger, isVoidStatus, isInactiveStatus } from '../lib/utils';
import {
  User,
  Truck,
  AlertTriangle
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError, logSystemActivity, logFinancialAudit } from '../lib/firebase';
import { collection, onSnapshot, doc, runTransaction } from 'firebase/firestore';
import { Customer, Supplier, CustomerPayment, SupplierPayment } from '../types';
import { usePermission, UserRole } from '../hooks/usePermission';
import { getNextPostingNumber, commitNextPostingNumber, ensureSystemAccountsExist, resolveSystemAccount, validateJournalBalance } from '../lib/postingEngine';
import { formatCurrency, getCurrencySymbol, getCurrencyCode } from '../utils/currencyFormatter';

// Subcomponents imported from the ledger features folder
import LedgerMetrics from '../features/ledger/components/LedgerMetrics';
import LedgerFilters from '../features/ledger/components/LedgerFilters';
import CustomerSupplierSection from '../features/ledger/components/CustomerSupplierSection';
import PaymentHistoryTable from '../features/ledger/components/PaymentHistoryTable';
import PaymentDetailModals from '../features/ledger/components/PaymentDetailModals';
import PaymentFormModal from '../features/ledger/components/PaymentFormModal';
import LedgerConfirmations from '../features/ledger/components/LedgerConfirmations';

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
  return formatAmountInWords(num);
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

  // --- Void Payments securely via Transactions ---
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
          customersList = customersList.map((c: any) => c.id === cp.customerId ? { ...c } : c);
          localStorage.setItem('inventory_customers', JSON.stringify(customersList));
          setCustomersState(customersList);

          // Update Customer Payments status
          const savedPayments = localStorage.getItem('inventory_customer_payments') || '[]';
          let paymentsList = JSON.parse(savedPayments);
          paymentsList = paymentsList.map((p: any) => p.id === cp.id ? { ...p, status: 'VOID' } : p);
          localStorage.setItem('inventory_customer_payments', JSON.stringify(paymentsList));
          setCustomerPayments(paymentsList);

          // Update Cash Ledger
          const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
          let ledgerList = JSON.parse(savedLedger);
          const revCashEntry = {
            id: `cl-rev-${cp.id}`,
            type: 'outflow',
            source: 'payment',
            amount: cp.amountPaid,
            referenceId: cp.id,
            description: `Cash Reversal for Voided Customer Payment Receipt #${cp.receiptNumber || cp.id}`,
            timestamp: new Date().toISOString(),
            status: 'active',
            isReversal: true,
            reversesCashEntryId: `cl-${cp.id}`,
            postingStatus: 'POSTED'
          };
          ledgerList.push(revCashEntry);
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

          // Update Cash Ledger
          const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
          let ledgerList = JSON.parse(savedLedger);
          const revCashEntry = {
            id: `cl-rev-${sp.id}`,
            type: 'inflow',
            source: 'payment',
            amount: sp.amountPaid,
            referenceId: sp.id,
            description: `Cash Reversal for Voided Supplier Payment Voucher #${sp.voucherNumber || sp.id}`,
            timestamp: new Date().toISOString(),
            status: 'active',
            isReversal: true,
            reversesCashEntryId: `cl-${sp.id}`,
            postingStatus: 'POSTED'
          };
          ledgerList.push(revCashEntry);
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

          // --- REVERSAL LEDGER POSTING (JV) ---
          const cpDate = cp.paymentDate || new Date().toISOString().split('T')[0];
          const cpYear = new Date(cpDate).getFullYear() || 2026;
          const { postingNumber: jvPostingNumber, nextVal: jvNextVal } = await getNextPostingNumber(transaction, 'JV', cpYear);

          const paymentRef = doc(db, 'customerPayments', cp.id);
          transaction.update(paymentRef, { status: 'VOID' });

          // --- CASH LEDGER REVERSAL ---
          const revCashId = `cl-rev-${cp.id}`;
          const revCashRef = doc(db, 'cashLedger', revCashId);
          transaction.set(revCashRef, {
            id: revCashId,
            type: 'outflow',
            source: 'payment',
            amount: cp.amountPaid,
            referenceId: cp.id,
            description: `Cash Reversal for Voided Customer Payment Receipt #${cp.receiptNumber || cp.id}`,
            timestamp: new Date().toISOString(),
            status: 'active',
            isReversal: true,
            reversesCashEntryId: `cl-${cp.id}`,
            postingStatus: 'POSTED'
          });

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

          // Mandatory Enterprise Journal Integrity Validation (Phase X)
          validateJournalBalance(lines);

          const periodMonth = String(new Date(cpDate).getMonth() + 1).padStart(2, '0');
          const accountingPeriod = `${cpYear}-${periodMonth}`;
          const entryId = `le-void-payment-${cp.id}`;
          const origEntryId = `le-payment-${cp.id}`;

          // Update metadata on original entry
          const origLedgerRef = doc(db, 'ledgerEntries', origEntryId);
          transaction.set(origLedgerRef, {
            isVoided: true,
            voidedAt: new Date().toISOString(),
            voidedBy: auth.currentUser?.email || 'admin_01@nexus.erp',
            voidReason: 'Customer payment voided',
            reversalEntryId: entryId
          }, { merge: true });

          const ledgerEntry = {
            id: entryId,
            postingNumber: jvPostingNumber,
            companyId: 'comp-default',
            branchId: 'branch-main',
            fiscalYear: cpYear,
            accountingPeriod,
            sourceModule: 'CUSTOMER_PAYMENT' as const,
            postingStatus: 'POSTED' as const,
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
            originalEntryId: origEntryId,
            isReversal: true,
            reversesEntryId: origEntryId,
            customerId: cp.customerId,
            customerName: cp.customerName
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

          // --- CASH LEDGER REVERSAL ---
          const revCashId = `cl-rev-${sp.id}`;
          const revCashRef = doc(db, 'cashLedger', revCashId);
          transaction.set(revCashRef, {
            id: revCashId,
            type: 'inflow',
            source: 'payment',
            amount: sp.amountPaid,
            referenceId: sp.id,
            description: `Cash Reversal for Voided Supplier Payment Voucher #${sp.voucherNumber || sp.id}`,
            timestamp: new Date().toISOString(),
            status: 'active',
            isReversal: true,
            reversesCashEntryId: `cl-${sp.id}`,
            postingStatus: 'POSTED'
          });

          // --- REVERSAL LEDGER POSTING (JV) ---
          const spDate = sp.paymentDate || new Date().toISOString().split('T')[0];
          const spYear = new Date(spDate).getFullYear() || 2026;
          const { postingNumber: jvPostingNumber, nextVal: jvNextVal } = await getNextPostingNumber(transaction, 'JV', spYear);

          const cashAcc = resolveSystemAccount('CASH', coa);
          const apAcc = resolveSystemAccount('ACCOUNTS_PAYABLE', coa);

          const lines = [
            // Debit: Cash in Hand (1100) (restores cash)
            {
              accountId: cashAcc.id,
              accountCode: cashAcc.code,
              accountName: cashAcc.name,
              debit: sp.amountPaid,
              credit: 0,
              baseCurrencyDebit: sp.amountPaid,
              baseCurrencyCredit: 0
            },
            // Credit: Accounts Payable (2100) (restores liability)
            {
              accountId: apAcc.id,
              accountCode: apAcc.code,
              accountName: apAcc.name,
              debit: 0,
              credit: sp.amountPaid,
              baseCurrencyDebit: 0,
              baseCurrencyCredit: sp.amountPaid
            }
          ];

          // Mandatory Enterprise Journal Integrity Validation (Phase X)
          validateJournalBalance(lines);

          const periodMonth = String(new Date(spDate).getMonth() + 1).padStart(2, '0');
          const accountingPeriod = `${spYear}-${periodMonth}`;
          const entryId = `le-void-payment-${sp.id}`;
          const origEntryId = `le-payment-${sp.id}`;

          // Update metadata on original entry
          const origLedgerRef = doc(db, 'ledgerEntries', origEntryId);
          transaction.set(origLedgerRef, {
            isVoided: true,
            voidedAt: new Date().toISOString(),
            voidedBy: auth.currentUser?.email || 'admin_01@nexus.erp',
            voidReason: 'Supplier payment voided',
            reversalEntryId: entryId
          }, { merge: true });

          const ledgerEntry = {
            id: entryId,
            postingNumber: jvPostingNumber,
            companyId: 'comp-default',
            branchId: 'branch-main',
            fiscalYear: spYear,
            accountingPeriod,
            sourceModule: 'SUPPLIER_PAYMENT' as const,
            postingStatus: 'POSTED' as const,
            currency: 'USD',
            exchangeRate: 1,
            baseCurrencyCode: 'USD',
            version: 1,
            narration: `Reversal of Supplier Payment to "${sp.supplierName || 'Supplier'}". Voucher: ${sp.voucherNumber || sp.id}`,
            createdFrom: sp.id,
            approvalStatus: 'APPROVED' as const,
            postingDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
            lines,
            originalEntryId: origEntryId,
            isReversal: true,
            reversesEntryId: origEntryId,
            supplierId: sp.supplierId,
            supplierName: sp.supplierName
          };

          const ledgerRef = doc(db, 'ledgerEntries', entryId);
          transaction.set(ledgerRef, ledgerEntry);

          commitNextPostingNumber(transaction, 'JV', jvNextVal);
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
      let errMsg = err.message || 'Failed to void the payment record.';
      if (err.message && err.message.includes("Accounting validation failed")) {
        setFeedback({ message: err.message, type: 'error' });
      } else {
        try {
          handleFirestoreError(err, OperationType.UPDATE, `${isCustomerPayment ? 'customer' : 'supplier'}Payments/${payment.id}`);
        } catch (dbErr: any) {
          errMsg = dbErr.message;
        }
        setFeedback({ message: `Access Abort: ${errMsg}`, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Filtering & Searching State ---
  const [personFilter, setPersonFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

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
      applyEnterprisePdfFont(doc);

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
      setPdfFont(doc, 'bold');
      doc.setFontSize(8);
      doc.text('NEXUS ERP  |  OFFICIAL SALES AUDIT TRANS-RECEIPT', margin, 8);

      currentY += 10;

      doc.setFontSize(22);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('NEXUS ERP INC.', margin, currentY + 10);

      doc.setFontSize(8);
      setPdfFont(doc, 'normal');
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text('Global Financial Registry: NF-8902-X', margin, currentY + 15);
      doc.text('support@nexus-erp.enterprise.com', margin, currentY + 19);

      const rightColX = 130;
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(rightColX, currentY + 2, 60, 24, 2, 2, 'FD');

      setPdfFont(doc, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('RECEIPT VOUCHER', rightColX + 5, currentY + 8);

      setPdfFont(doc, 'normal');
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

      setPdfFont(doc, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('1. RECEIPT PARTICULARS', margin, currentY);

      currentY += 4;

      setPdfFont(doc, 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text('Customer Account Name:', margin, currentY + 4);
      setPdfFont(doc, 'bold');
      doc.text(pay.customerName || 'N/A', margin + 40, currentY + 4);

      setPdfFont(doc, 'normal');
      doc.text('Customer System ID:', margin, currentY + 9);
      setPdfFont(doc, 'bold');
      doc.text(pay.customerId || 'N/A', margin + 40, currentY + 9);

      setPdfFont(doc, 'normal');
      doc.text('Account Prev. Due:', margin, currentY + 14);
      setPdfFont(doc, 'bold');
      doc.text(formatPdfCurrency(pay.previousDue ?? 0), margin + 40, currentY + 14);

      setPdfFont(doc, 'normal');
      doc.text('Account Remaining Due:', margin, currentY + 19);
      setPdfFont(doc, 'bold');
      doc.text(formatPdfCurrency(pay.remainingDue ?? 0), margin + 40, currentY + 19);

      setPdfFont(doc, 'normal');
      doc.text('Received By Agent:', rightColX, currentY + 4);
      setPdfFont(doc, 'bold');
      doc.text(pay.receivedBy || 'System Admin', rightColX + 35, currentY + 4);

      setPdfFont(doc, 'normal');
      doc.text('Receipt Date:', rightColX, currentY + 9);
      setPdfFont(doc, 'bold');
      doc.text(pay.receiptDate || pay.paymentDate, rightColX + 35, currentY + 9);

      setPdfFont(doc, 'normal');
      doc.text('Reference Number:', rightColX, currentY + 14);
      setPdfFont(doc, 'bold');
      doc.text(pay.referenceNumber || 'N/A', rightColX + 35, currentY + 14);

      setPdfFont(doc, 'normal');
      doc.text('Cheque / Bank Ref:', rightColX, currentY + 19);
      setPdfFont(doc, 'bold');
      doc.text(pay.chequeOrBankRef || 'N/A', rightColX + 35, currentY + 19);

      currentY += 28;

      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 22, 2, 2, 'FD');

      setPdfFont(doc, 'bold');
      doc.setFontSize(11);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('TOTAL AMOUNT RECEIVED', margin + 6, currentY + 7);

      doc.setFontSize(16);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(formatPdfCurrency(pay.amountPaid), pageWidth - margin - 50, currentY + 9);

      const words = numberToWords(pay.amountPaid);
      setPdfFont(doc, 'oblique');
      doc.setFontSize(8.5);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text(`Amount in Words: ${words}`, margin + 6, currentY + 15, { maxWidth: 160 });

      currentY += 30;

      setPdfFont(doc, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('2. CHRONOLOGICAL INVOICE ALLOCATION (FIFO ENGINE)', margin, currentY);

      currentY += 4;

      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(margin, currentY, pageWidth - (margin * 2), 7, 'F');

      doc.setTextColor(255, 255, 255);
      setPdfFont(doc, 'bold');
      doc.setFontSize(7.5);
      doc.text('INVOICE / ID', margin + 4, currentY + 5);
      doc.text('DATE', margin + 55, currentY + 5);
      doc.text('TOTAL VAL', margin + 85, currentY + 5);
      doc.text('ALLOCATED', margin + 115, currentY + 5);
      doc.text('REM BALANCE', margin + 145, currentY + 5);

      currentY += 7;

      const allocs = getFIFOAllocationForSelected();

      if (allocs.length === 0) {
        setPdfFont(doc, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text('No active credit invoices found. Entire amount allocated to Customer Credit Account Balance.', margin + 4, currentY + 6);
        currentY += 10;
      } else {
        allocs.forEach((item, index) => {
          doc.setFillColor(index % 2 === 0 ? 255 : lightBg[0], index % 2 === 0 ? 255 : lightBg[1], index % 2 === 0 ? 255 : lightBg[2]);
          doc.rect(margin, currentY, pageWidth - (margin * 2), 8, 'F');

          setPdfFont(doc, 'normal');
          doc.setFontSize(8);
          doc.setTextColor(textColor[0], textColor[1], textColor[2]);
          doc.text(item.invoiceNumber, margin + 4, currentY + 5.5);
          doc.text(item.saleDate, margin + 55, currentY + 5.5);
          doc.text(formatPdfCurrency(item.totalAmount), margin + 85, currentY + 5.5);
          doc.text(formatPdfCurrency(item.allocatedAmount), margin + 115, currentY + 5.5);
          doc.text(formatPdfCurrency(item.remainingAmount), margin + 145, currentY + 5.5);

          currentY += 8;
        });
      }

      currentY += 15;

      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.line(margin, currentY, margin + 60, currentY);
      doc.line(pageWidth - margin - 60, currentY, pageWidth - margin, currentY);

      setPdfFont(doc, 'normal');
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
      applyEnterprisePdfFont(doc);

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
      setPdfFont(doc, 'bold');
      doc.setFontSize(8);
      doc.text('NEXUS ERP  |  OFFICIAL ACCOUNTS PAYABLE TRANS-VOUCHER', margin, 8);

      currentY += 10;

      doc.setFontSize(22);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('NEXUS ERP INC.', margin, currentY + 10);

      doc.setFontSize(8);
      setPdfFont(doc, 'normal');
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text('Global Financial Registry: NF-8902-X', margin, currentY + 15);
      doc.text('support@nexus-erp.enterprise.com', margin, currentY + 19);

      const rightColX = 130;
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(rightColX, currentY + 2, 60, 24, 2, 2, 'FD');

      setPdfFont(doc, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('PAYMENT VOUCHER', rightColX + 5, currentY + 8);

      setPdfFont(doc, 'normal');
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

      setPdfFont(doc, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('1. VOUCHER PARTICULARS', margin, currentY);

      currentY += 4;

      setPdfFont(doc, 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text('Supplier Account Name:', margin, currentY + 4);
      setPdfFont(doc, 'bold');
      doc.text(pay.supplierName || 'N/A', margin + 40, currentY + 4);

      setPdfFont(doc, 'normal');
      doc.text('Supplier System ID:', margin, currentY + 9);
      setPdfFont(doc, 'bold');
      doc.text(pay.supplierId || 'N/A', margin + 40, currentY + 9);

      setPdfFont(doc, 'normal');
      doc.text('Account Prev. Due:', margin, currentY + 14);
      setPdfFont(doc, 'bold');
      doc.text(formatPdfCurrency(pay.previousDue ?? 0), margin + 40, currentY + 14);

      setPdfFont(doc, 'normal');
      doc.text('Account Remaining Due:', margin, currentY + 19);
      setPdfFont(doc, 'bold');
      doc.text(formatPdfCurrency(pay.remainingDue ?? 0), margin + 40, currentY + 19);

      setPdfFont(doc, 'normal');
      doc.text('Disbursed By Agent:', rightColX, currentY + 4);
      setPdfFont(doc, 'bold');
      doc.text(pay.paidBy || 'System Admin', rightColX + 35, currentY + 4);

      setPdfFont(doc, 'normal');
      doc.text('Voucher Date:', rightColX, currentY + 9);
      setPdfFont(doc, 'bold');
      doc.text(pay.paymentDate, rightColX + 35, currentY + 9);

      setPdfFont(doc, 'normal');
      doc.text('Reference Number:', rightColX, currentY + 14);
      setPdfFont(doc, 'bold');
      doc.text(pay.referenceNumber || 'N/A', rightColX + 35, currentY + 14);

      setPdfFont(doc, 'normal');
      doc.text('Cheque / Bank Ref:', rightColX, currentY + 19);
      setPdfFont(doc, 'bold');
      doc.text(pay.chequeOrBankRef || 'N/A', rightColX + 35, currentY + 19);

      currentY += 28;

      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 22, 2, 2, 'FD');

      setPdfFont(doc, 'bold');
      doc.setFontSize(11);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('TOTAL AMOUNT DISBURSED', margin + 6, currentY + 7);

      doc.setFontSize(16);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(formatPdfCurrency(pay.amountPaid), pageWidth - margin - 50, currentY + 9);

      const words = numberToWords(pay.amountPaid);
      setPdfFont(doc, 'oblique');
      doc.setFontSize(8.5);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text(`Amount in Words: ${words}`, margin + 6, currentY + 15, { maxWidth: 160 });

      currentY += 30;

      // Signature / Footer
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.line(margin, currentY, pageWidth - margin, currentY);

      currentY += 8;
      setPdfFont(doc, 'normal');
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
  }, [customerPayments, supplierPayments, activeSegment]);

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
            message: `Recorded customer payment of ${formatCurrency(amountVal)} for "${targetCust.name}" locally`,
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
            message: `Recorded supplier payment voucher ${formData.voucherNumber.trim()} of ${formatCurrency(amountVal)} for "${targetSupp.name}" locally`,
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

          // Mandatory Enterprise Journal Integrity Validation (Phase X)
          validateJournalBalance(lines);

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
            lines,
            customerId: targetCust.id,
            customerName: targetCust.name
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
          `Recorded customer payment of ${formatCurrency(amountVal)} from "${targetCustName}" under Receipt Number: ${formData.receiptNumber.trim()}.`
        );

        setFeedback({
          message: `Successfully recorded customer payment of ${formatCurrency(amountVal)} for "${targetCustName}"`,
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

          // Mandatory Enterprise Journal Integrity Validation (Phase X)
          validateJournalBalance(lines);

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
            lines,
            supplierId: targetSupp.id,
            supplierName: targetSupp.name
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
          `Recorded supplier layout of ${formatCurrency(amountVal)} to "${targetSuppName}". Owed balance updated from ${formatCurrency(finalPrevDue)} to ${formatCurrency(finalRemDue)}.`
        );

        setFeedback({
          message: `Successfully recorded supplier payment of ${formatCurrency(amountVal)} to "${targetSuppName}"`,
          type: 'success'
        });
      }

      setIsFormOpen(false);
    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.includes("Accounting validation failed")) {
        setFeedback({ message: err.message, type: 'error' });
      } else {
        try {
          handleFirestoreError(err, OperationType.WRITE, 'payments');
        } catch (dbErr: any) {
          setFeedback({ message: `Failed to register payment: ${dbErr.message}`, type: 'error' });
        }
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
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-55 flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold shadow-lg border ${
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
          <p className="text-xs text-slate-550 mt-1 font-medium">
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
            className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
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
            className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSegment === 'suppliers' 
                ? 'bg-white text-orange-600 shadow-xs border border-slate-200/40' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Truck className="h-3.5 w-3.5" />
            <span>Suppliers Portal</span>
          </button>
        </div>
      </div>

      {/* METRICS DASHBOARD CONTAINER */}
      <LedgerMetrics
        activeSegment={activeSegment}
        loading={loading}
        totalCustomerPaidThisMonth={totalCustomerPaidThisMonth}
        totalSupplierPaidThisMonth={totalSupplierPaidThisMonth}
        totalOutstandingCustomerDebt={totalOutstandingCustomerDebt}
        totalOutstandingSupplierDebt={totalOutstandingSupplierDebt}
        registeredCount={activeSegment === 'customers' ? customers.length : suppliers.length}
        inDebtCount={activeSegment === 'customers' ? customers.filter(c => c.dueBalance > 0).length : suppliers.filter(s => (s.dueBalance ?? 0) > 0).length}
      />

      {/* FILTER PANEL AND DUAL COLUMN PROFILE AREA */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* Left Hand: Search & General Directory Filters */}
        <div className="lg:col-span-4 space-y-8">
          <LedgerFilters
            activeSegment={activeSegment}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            personFilter={personFilter}
            setPersonFilter={setPersonFilter}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            handleResetFilters={handleResetFilters}
          />

          <CustomerSupplierSection
            activeSegment={activeSegment}
            loading={loading}
            searchedCustomers={searchedCustomers}
            searchedSuppliers={searchedSuppliers}
            permissions={permissions}
            handleOpenRecordModal={handleOpenRecordModal}
          />
        </div>

        {/* Right Hand: Detailed Settlement Table History */}
        <div className="lg:col-span-8">
          <PaymentHistoryTable
            activeSegment={activeSegment}
            loading={loading}
            activeRecordsCount={activeRecordsCount}
            activeRecordSum={activeRecordSum}
            customerPayments={customerPayments}
            supplierPayments={supplierPayments}
            filteredCustomerPayments={filteredCustomerPayments}
            filteredSupplierPayments={filteredSupplierPayments}
            personFilter={personFilter}
            startDate={startDate}
            endDate={endDate}
            permissions={permissions}
            handleResetFilters={handleResetFilters}
            handleOpenRecordModal={handleOpenRecordModal}
            setSelectedPayment={setSelectedPayment}
            setSelectedSupplierPayment={setSelectedSupplierPayment}
            voidTransaction={voidTransaction}
          />
        </div>
      </div>

      {/* MODALS AND CONFIRMATION WRAPPERS */}
      <PaymentDetailModals
        selectedPayment={selectedPayment}
        setSelectedPayment={setSelectedPayment}
        selectedSupplierPayment={selectedSupplierPayment}
        setSelectedSupplierPayment={setSelectedSupplierPayment}
        getFIFOAllocationForSelected={getFIFOAllocationForSelected}
        handlePrintReceiptPDF={handlePrintReceiptPDF}
        handlePrintVoucherPDF={handlePrintVoucherPDF}
        numberToWords={numberToWords}
      />

      <PaymentFormModal
        isFormOpen={isFormOpen}
        setIsFormOpen={setIsFormOpen}
        activeSegment={activeSegment}
        isSaving={isSaving}
        formData={formData}
        setFormData={setFormData}
        formErrors={formErrors}
        customers={customers}
        suppliers={suppliers}
        handleSavePayment={handleSavePayment}
        selectedPersonOutstanding={selectedPersonOutstanding}
      />

      <LedgerConfirmations
        voidConfirmationPayment={voidConfirmationPayment}
        setVoidConfirmationPayment={setVoidConfirmationPayment}
        handleVoidPayment={handleVoidPayment}
        overpaymentConfirmData={overpaymentConfirmData}
        setOverpaymentConfirmData={setOverpaymentConfirmData}
        proceedWithSavingPayment={proceedWithSavingPayment}
      />

    </div>
  );
}
