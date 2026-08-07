import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  deleteDoc, 
  updateDoc,
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { 
  db, 
  auth, 
  OperationType, 
  handleFirestoreError, 
  logSystemActivity, 
  logFinancialAudit 
} from '../lib/firebase';
import { Expense, ExpenseCategory } from '../types';
import { getNextPostingNumber, commitNextPostingNumber, ensureSystemAccountsExist, SYSTEM_ACCOUNTS, resolveExpenseAccount, resolveSystemAccount, validateJournalBalance } from '../lib/postingEngine';
import { AppPermissions, UserRole } from '../hooks/usePermission';
import { formatCurrency } from '../utils/currencyFormatter';
import { ResponsiveKPIValue } from './MetricCard';
import { 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit3, 
  Eye, 
  X, 
  Download, 
  TrendingDown, 
  Calendar, 
  Tag, 
  CreditCard, 
  AlertCircle, 
  AlertTriangle,
  FolderPlus, 
  Check, 
  FileText 
} from 'lucide-react';

const DEFAULT_CATEGORIES = [
  "Office Rent",
  "Electricity",
  "Water",
  "Internet",
  "Salary",
  "Fuel",
  "Transportation",
  "Maintenance",
  "Office Supplies",
  "Marketing",
  "Meals",
  "Taxes",
  "Miscellaneous"
];

interface ExpenseManagementProps {
  userRole: UserRole | string;
  permissions: AppPermissions;
}

export default function ExpenseManagement({ userRole, permissions }: ExpenseManagementProps) {
  // State
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [customCategories, setCustomCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form Modals State
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [voidConfirmationExpense, setVoidConfirmationExpense] = useState<Expense | null>(null);
  const [deleteConfirmationCategory, setDeleteConfirmationCategory] = useState<ExpenseCategory | null>(null);
  const [coa, setCoa] = useState<any[]>([]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('active'); // default to show active
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Add/Edit Form state
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formCategory, setFormCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [formVendor, setFormVendor] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formTaxRatePercent, setFormTaxRatePercent] = useState<number>(15);
  const [formHasVat, setFormHasVat] = useState<boolean>(true);
  const [formIsVatInclusive, setFormIsVatInclusive] = useState<boolean>(true);
  const [formPaymentMethod, setFormPaymentMethod] = useState('Cash');
  const [formReference, setFormReference] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Custom Category Form state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Subscriptions
  useEffect(() => {
    if (!permissions.viewExpenses) {
      setLoading(false);
      return;
    }

    const unsubExpenses = onSnapshot(
      collection(db, 'expenses'), 
      (snapshot) => {
        const list: Expense[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Expense);
        });
        // Sort descending by date & number
        list.sort((a, b) => {
          const dateComp = new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime();
          if (dateComp !== 0) return dateComp;
          return b.expenseNumber.localeCompare(a.expenseNumber);
        });
        setExpenses(list);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to fetch expenses:", err);
        setError("Missing or insufficient permissions to view financial expense data.");
        setLoading(false);
      }
    );

    const unsubCategories = onSnapshot(
      collection(db, 'expenseCategories'),
      (snapshot) => {
        const list: ExpenseCategory[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as ExpenseCategory);
        });
        setCustomCategories(list);
      },
      (err) => {
        console.error("Failed to fetch custom categories:", err);
      }
    );

    const unsubCOA = onSnapshot(
      collection(db, 'chartOfAccounts'),
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data());
        });
        setCoa(list);
      },
      (err) => {
        console.error("Failed to fetch COA in ExpenseManagement:", err);
      }
    );

    return () => {
      unsubExpenses();
      unsubCategories();
      unsubCOA();
    };
  }, [permissions.viewExpenses]);

  // Combine categories
  const allCategories = useMemo(() => {
    const customNames = customCategories.map(c => c.name);
    // Exclude duplicates
    const uniqueCustom = customNames.filter(name => !DEFAULT_CATEGORIES.includes(name));
    return [...DEFAULT_CATEGORIES, ...uniqueCustom];
  }, [customCategories]);

  // Handle Recording / Submitting Expense
  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formCategory || !formVendor || !formAmount || !formPaymentMethod) {
      alert("Please fill in all required fields.");
      return;
    }

    const amountNum = parseFloat(formAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("Please enter a valid positive amount.");
      return;
    }

    const taxRateNum = formHasVat ? formTaxRatePercent : 0;
    let subtotalNum = amountNum;
    let vatAmountNum = 0;
    let totalGrossNum = amountNum;

    if (formHasVat && taxRateNum > 0) {
      if (formIsVatInclusive) {
        totalGrossNum = amountNum;
        subtotalNum = parseFloat((amountNum / (1 + taxRateNum / 100)).toFixed(2));
        vatAmountNum = parseFloat((totalGrossNum - subtotalNum).toFixed(2));
      } else {
        subtotalNum = amountNum;
        vatAmountNum = parseFloat((amountNum * (taxRateNum / 100)).toFixed(2));
        totalGrossNum = parseFloat((subtotalNum + vatAmountNum).toFixed(2));
      }
    }

    try {
      const currentUserEmail = auth.currentUser?.email || 'admin_01@nexus.erp';
      const timestamp = new Date().toISOString();

      if (editingExpense) {
        // Edit Mode
        if (!permissions.editExpense) {
          alert("Security clearance denied. Your account is restricted from updating expenditures.");
          return;
        }

        const expenseId = editingExpense.id;
        const oldExpense = { ...editingExpense };

        const updatedData: Partial<Expense> = {
          expenseDate: formDate,
          category: formCategory,
          vendor: formVendor,
          description: formDescription,
          amount: totalGrossNum,
          subtotal: subtotalNum,
          taxAmount: vatAmountNum,
          vatAmount: vatAmountNum,
          taxRatePercent: taxRateNum,
          paymentMethod: formPaymentMethod,
          referenceNumber: formReference,
          notes: formNotes,
          updatedAt: timestamp
        };

        const batch = writeBatch(db);
        const syslogId = `syslog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const finlogId = `finlog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        batch.update(doc(db, 'expenses', expenseId), updatedData);

        // Determine previous active cash ledger document ID
        const oldCashLedgerId = oldExpense.createdAt === oldExpense.updatedAt
          ? `cl-${expenseId}`
          : `cl-${expenseId}-${oldExpense.updatedAt.replace(/[:.]/g, '-')}`;

        // Determine new cash ledger document ID for this edit
        const newCashLedgerId = `cl-${expenseId}-${timestamp.replace(/[:.]/g, '-')}`;

        // Void the previous cash ledger entry if the previous payment method was Cash
        if (oldExpense.paymentMethod === 'Cash') {
          batch.set(doc(db, 'cashLedger', oldCashLedgerId), {
            status: 'VOID'
          }, { merge: true });
        }

        let finalCashLedgerId: string | null = null;
        if (formPaymentMethod === 'Cash') {
          finalCashLedgerId = newCashLedgerId;
          const ledgerPayload = {
            id: newCashLedgerId,
            type: 'outflow' as const,
            source: 'expense' as const,
            amount: totalGrossNum,
            referenceId: expenseId,
            description: `Expense [${formCategory}] - ${formVendor}: ${formDescription}`,
            timestamp: new Date(formDate + 'T12:00:00Z').toISOString(),
            status: oldExpense.status
          };
          batch.set(doc(db, 'cashLedger', newCashLedgerId), ledgerPayload);
        }

        const syslogPayload = {
          id: syslogId,
          action: "Expense Updated",
          user: currentUserEmail,
          timestamp,
          details: `Updated Expense record ${oldExpense.expenseNumber}: Category [${formCategory}], Net: $${subtotalNum}, Input VAT: $${vatAmountNum}, Total: $${totalGrossNum}.`
        };
        batch.set(doc(db, 'Logs', syslogId), syslogPayload);

        const finlogPayload = {
          id: finlogId,
          timestamp,
          action: 'UPDATE_EXPENSE',
          entityType: 'expense',
          entityId: expenseId,
          referenceId: finalCashLedgerId,
          performedBy: currentUserEmail,
          userRole: userRole,
          customerId: null,
          supplierId: null,
          productId: null,
          amount: totalGrossNum,
          paymentType: formPaymentMethod,
          previousState: JSON.stringify(oldExpense),
          newState: JSON.stringify({ ...oldExpense, ...updatedData }),
          notes: `Updated Expense ${oldExpense.expenseNumber} to $${totalGrossNum} (Net: $${subtotalNum}, VAT: $${vatAmountNum})`
        };
        batch.set(doc(db, 'financialLogs', finlogId), finlogPayload);

        await batch.commit();

      } else {
        // Create Mode
        if (!permissions.createExpense) {
          alert("Security clearance denied. Your account is restricted from recording expenditures.");
          return;
        }

        const expenseId = `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const seqNumber = Math.floor(10000 + Math.random() * 90000);
        const expenseNumber = `EXP-${seqNumber}`;

        const newExpense: Expense = {
          id: expenseId,
          expenseNumber,
          expenseDate: formDate,
          category: formCategory,
          vendor: formVendor,
          description: formDescription,
          amount: totalGrossNum,
          subtotal: subtotalNum,
          taxAmount: vatAmountNum,
          vatAmount: vatAmountNum,
          taxRatePercent: taxRateNum,
          paymentMethod: formPaymentMethod,
          referenceNumber: formReference,
          status: 'active',
          createdBy: currentUserEmail,
          createdAt: timestamp,
          updatedAt: timestamp,
          notes: formNotes
        };

        const cashLedgerId = `cl-${expenseId}`;
        const syslogId = `syslog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const finlogId = `finlog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        const syslogPayload = {
          id: syslogId,
          action: "Expense Recorded",
          user: currentUserEmail,
          timestamp,
          details: `Successfully registered expenditure receipt ${expenseNumber} (Net: $${subtotalNum}, VAT 1400: $${vatAmountNum}, Total: $${totalGrossNum}) under category [${formCategory}] to payee "${formVendor}".`
        };

        const finlogPayload = {
          id: finlogId,
          timestamp,
          action: 'CREATE_EXPENSE',
          entityType: 'expense',
          entityId: expenseId,
          referenceId: formPaymentMethod === 'Cash' ? cashLedgerId : null,
          performedBy: currentUserEmail,
          userRole: userRole,
          customerId: null,
          supplierId: null,
          productId: null,
          amount: totalGrossNum,
          paymentType: formPaymentMethod,
          previousState: JSON.stringify({}),
          newState: JSON.stringify(newExpense),
          notes: `Recorded expenditure ${expenseNumber} paid to ${formVendor}`
        };

        let writeCount = 0;
        let lastQueuedPath = "None";
        let nextAttemptPath = "None";

        const queueWrite = (path: string, payload: any, setFn: () => void) => {
          writeCount++;
          nextAttemptPath = path;
          console.log(`====================================================`);
          console.log(`WRITE #${writeCount}`);
          console.log(`Document Path:`, path);
          console.log(`Payload:`, payload);
          console.log(`====================================================`);
          setFn();
          lastQueuedPath = path;
          nextAttemptPath = "None";
          console.log("WRITE QUEUED");
        };

        try {
          await runTransaction(db, async (transaction) => {
            // A. READ phase: Retrieve posting number sequence (Voucher type: CV)
            const year = new Date(formDate).getFullYear() || 2026;
            const { postingNumber, nextVal } = await getNextPostingNumber(transaction, 'CV', year);

            // B. WRITE phase
            const expDocRef = doc(db, 'expenses', expenseId);
            queueWrite(expDocRef.path, newExpense, () => {
              transaction.set(expDocRef, newExpense);
            });

            if (formPaymentMethod === 'Cash') {
              const ledgerPayload = {
                id: cashLedgerId,
                type: 'outflow' as const,
                source: 'expense' as const,
                amount: totalGrossNum,
                referenceId: expenseId,
                description: `Expense [${formCategory}] - ${formVendor}: ${formDescription}`,
                timestamp: new Date(formDate + 'T12:00:00Z').toISOString(),
                status: 'active'
              };
              const cashDocRef = doc(db, 'cashLedger', cashLedgerId);
              queueWrite(cashDocRef.path, ledgerPayload, () => {
                transaction.set(cashDocRef, ledgerPayload);
              });
            }

            // --- AUTOMATIC LEDGER POSTING (CV) ---
            const periodMonth = String(new Date(formDate).getMonth() + 1).padStart(2, '0');
            const accountingPeriod = `${year}-${periodMonth}`;
            const expAccount = resolveExpenseAccount(formCategory, coa);
            const inputVatAcc = resolveSystemAccount('INPUT_VAT', coa);

            const lines = [];

            // Debit: Expense Account (Net Amount)
            lines.push({
              accountId: expAccount.id,
              accountCode: expAccount.code,
              accountName: expAccount.name,
              debit: subtotalNum,
              credit: 0,
              baseCurrencyDebit: subtotalNum,
              baseCurrencyCredit: 0
            });

            // Debit: Input VAT Receivable (1400) (if vatAmountNum > 0)
            if (vatAmountNum > 0) {
              lines.push({
                accountId: inputVatAcc.id,
                accountCode: inputVatAcc.code,
                accountName: inputVatAcc.name,
                debit: vatAmountNum,
                credit: 0,
                baseCurrencyDebit: vatAmountNum,
                baseCurrencyCredit: 0
              });
            }

            // Credit: Cash in Hand (if Cash) or Accounts Payable (if Credit/Other)
            if (formPaymentMethod === 'Cash') {
              const cashAcc = resolveSystemAccount('CASH', coa);
              lines.push({
                accountId: cashAcc.id,
                accountCode: cashAcc.code,
                accountName: cashAcc.name,
                debit: 0,
                credit: totalGrossNum,
                baseCurrencyDebit: 0,
                baseCurrencyCredit: totalGrossNum
              });
            } else {
              const apAcc = resolveSystemAccount('ACCOUNTS_PAYABLE', coa);
              lines.push({
                accountId: apAcc.id,
                accountCode: apAcc.code,
                accountName: apAcc.name,
                debit: 0,
                credit: totalGrossNum,
                baseCurrencyDebit: 0,
                baseCurrencyCredit: totalGrossNum
              });
            }

            // Mandatory Enterprise Journal Integrity Validation (Phase X)
            validateJournalBalance(lines);

            const entryId = `le-expense-${expenseId}`;
            const ledgerEntry = {
              id: entryId,
              postingNumber,
              companyId: 'comp-default',
              branchId: 'branch-main',
              fiscalYear: year,
              accountingPeriod,
              sourceModule: 'EXPENSE' as const,
              postingStatus: 'POSTED' as const,
              currency: 'USD',
              exchangeRate: 1,
              baseCurrencyCode: 'USD',
              version: 1,
              narration: `Recorded Expense: [${formCategory}] to "${formVendor}". Ref: ${formReference} (Net: $${subtotalNum}, VAT 1400: $${vatAmountNum})`,
              createdFrom: expenseId,
              approvalStatus: 'APPROVED' as const,
              postingDate: new Date(formDate + 'T12:00:00Z').toISOString(),
              createdAt: new Date().toISOString(),
              createdBy: currentUserEmail,
              lines
            };

            const ledgerRef = doc(db, 'ledgerEntries', entryId);
            queueWrite(ledgerRef.path, ledgerEntry, () => {
              transaction.set(ledgerRef, ledgerEntry);
            });

            // Update sequence counter
            commitNextPostingNumber(transaction, 'CV', nextVal, queueWrite);

            // Ensure default system accounts exist
            const currentCoaIds = coa.map(c => c.id);
            await ensureSystemAccountsExist(transaction, currentCoaIds, queueWrite);

            // Log activities
            const sysDocRef = doc(db, 'Logs', syslogId);
            queueWrite(sysDocRef.path, syslogPayload, () => {
              transaction.set(sysDocRef, syslogPayload);
            });

            const finDocRef = doc(db, 'financialLogs', finlogId);
            queueWrite(finDocRef.path, finlogPayload, () => {
              transaction.set(finDocRef, finlogPayload);
            });
          });
        } catch (txError: any) {
          console.log("----------------------------------------------------");
          console.log("Transaction Failed");
          console.log("----------------------------------------------------");
          console.error(txError);
          if (txError) {
            console.log("error.code:", txError.code);
            console.log("error.message:", txError.message);
            console.log("error.customData:", txError.customData);
            console.log("error.stack:", txError.stack);
          }
          console.log("The LAST successfully queued document path:", lastQueuedPath);
          console.log("The NEXT document path that was about to be written:", nextAttemptPath);
          throw txError;
        }
      }

      // Reset state and close modal
      setIsRecordModalOpen(false);
      resetForm();
    } catch (err: any) {
      console.error("Failed to save expense:", err);
      if (err.message && err.message.includes("Accounting validation failed")) {
        alert(err.message);
      } else {
        handleFirestoreError(err, OperationType.WRITE, `batch_write/expense`);
        alert(`Failed to save expense: ${err?.message || "Check network or credentials"}`);
      }
    }
  };

  const resetForm = () => {
    setEditingExpense(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormCategory(DEFAULT_CATEGORIES[0]);
    setFormVendor('');
    setFormDescription('');
    setFormAmount('');
    setFormTaxRatePercent(15);
    setFormHasVat(true);
    setFormIsVatInclusive(true);
    setFormPaymentMethod('Cash');
    setFormReference('');
    setFormNotes('');
  };

  const handleEditClick = (expense: Expense) => {
    if (!permissions.editExpense) {
      alert("Access Denied. You do not have permissions to edit expense records.");
      return;
    }
    setEditingExpense(expense);
    setFormDate(expense.expenseDate);
    setFormCategory(expense.category);
    setFormVendor(expense.vendor);
    setFormDescription(expense.description);
    setFormAmount((expense.amount || 0).toString());
    setFormTaxRatePercent(expense.taxRatePercent !== undefined ? expense.taxRatePercent : 15);
    setFormHasVat(expense.taxRatePercent !== undefined ? expense.taxRatePercent > 0 : true);
    setFormIsVatInclusive(expense.subtotal !== undefined ? (expense.amount !== expense.subtotal) : true);
    setFormPaymentMethod(expense.paymentMethod);
    setFormReference(expense.referenceNumber || '');
    setFormNotes(expense.notes || '');
    setIsRecordModalOpen(true);
  };

  // Void Expense
  const handleVoidExpense = async (expense: Expense) => {
    if (!permissions.voidExpense) {
      alert("Access Denied. You do not have permissions to void active expense records.");
      return;
    }

    if (expense.status === 'void') {
      alert("This expense is already voided.");
      return;
    }

    try {
      const currentUserEmail = auth.currentUser?.email || 'admin_01@nexus.erp';
      const timestamp = new Date().toISOString();
      // Determine active cash ledger document ID
      const activeCashLedgerId = expense.createdAt === expense.updatedAt
        ? `cl-${expense.id}`
        : `cl-${expense.id}-${expense.updatedAt.replace(/[:.]/g, '-')}`;

      const syslogId = `syslog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const finlogId = `finlog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const syslogPayload = {
        id: syslogId,
        action: "Expense Voided",
        user: currentUserEmail,
        timestamp,
        details: `Permanently marked expense ${expense.expenseNumber} ($${expense.amount}) as VOID. Financial reports and ledgers synchronized.`
      };

      const finlogPayload = {
        id: finlogId,
        timestamp,
        action: 'VOID_EXPENSE',
        entityType: 'expense',
        entityId: expense.id,
        referenceId: expense.paymentMethod === 'Cash' ? activeCashLedgerId : null,
        performedBy: currentUserEmail,
        userRole: userRole,
        customerId: null,
        supplierId: null,
        productId: null,
        amount: expense.amount,
        paymentType: expense.paymentMethod,
        previousState: JSON.stringify(expense),
        newState: JSON.stringify({ ...expense, status: 'void', updatedAt: timestamp }),
        notes: `Voided expenditure record ${expense.expenseNumber} of $${expense.amount}`
      };

      await runTransaction(db, async (transaction) => {
        // A. READ phase: Retrieve posting number sequence for reversal (Voucher type: JV)
        const year = new Date(expense.expenseDate).getFullYear() || 2026;
        const { postingNumber: jvPostingNumber, nextVal: jvNextVal } = await getNextPostingNumber(transaction, 'JV', year);

        // B. WRITE phase
        transaction.update(doc(db, 'expenses', expense.id), {
          status: 'void',
          updatedAt: timestamp
        });

        if (expense.paymentMethod === 'Cash') {
          const revCashId = `cl-rev-${expense.id}`;
          const revCashRef = doc(db, 'cashLedger', revCashId);
          transaction.set(revCashRef, {
            id: revCashId,
            type: 'inflow',
            source: 'expense',
            amount: expense.amount,
            referenceId: expense.id,
            description: `Cash Reversal for Voided Expense #${expense.expenseNumber || expense.id}`,
            timestamp: new Date().toISOString(),
            status: 'active',
            isReversal: true,
            reversesCashEntryId: activeCashLedgerId,
            postingStatus: 'POSTED'
          });
        }

        // --- REVERSAL LEDGER POSTING (JV) ---
        const periodMonth = String(new Date(expense.expenseDate).getMonth() + 1).padStart(2, '0');
        const accountingPeriod = `${year}-${periodMonth}`;
        const expAccount = resolveExpenseAccount(expense.category, coa);
        const inputVatAcc = resolveSystemAccount('INPUT_VAT', coa);

        const vatAmount = expense.taxAmount !== undefined ? expense.taxAmount : (expense.vatAmount !== undefined ? expense.vatAmount : 0);
        const grossAmount = expense.amount;
        const netAmount = expense.subtotal !== undefined ? expense.subtotal : (grossAmount - vatAmount);

        const lines = [];

        // Debit: Cash in Hand (if Cash) or Accounts Payable (if Credit/Other)
        if (expense.paymentMethod === 'Cash') {
          const cashAcc = resolveSystemAccount('CASH', coa);
          lines.push({
            accountId: cashAcc.id,
            accountCode: cashAcc.code,
            accountName: cashAcc.name,
            debit: grossAmount,
            credit: 0,
            baseCurrencyDebit: grossAmount,
            baseCurrencyCredit: 0
          });
        } else {
          const apAcc = resolveSystemAccount('ACCOUNTS_PAYABLE', coa);
          lines.push({
            accountId: apAcc.id,
            accountCode: apAcc.code,
            accountName: apAcc.name,
            debit: grossAmount,
            credit: 0,
            baseCurrencyDebit: grossAmount,
            baseCurrencyCredit: 0
          });
        }

        // Credit: Expense Account (Net Amount)
        lines.push({
          accountId: expAccount.id,
          accountCode: expAccount.code,
          accountName: expAccount.name,
          debit: 0,
          credit: netAmount,
          baseCurrencyDebit: 0,
          baseCurrencyCredit: netAmount
        });

        // Credit: Input VAT Receivable (1400) (if vatAmount > 0)
        if (vatAmount > 0) {
          lines.push({
            accountId: inputVatAcc.id,
            accountCode: inputVatAcc.code,
            accountName: inputVatAcc.name,
            debit: 0,
            credit: vatAmount,
            baseCurrencyDebit: 0,
            baseCurrencyCredit: vatAmount
          });
        }

        // Mandatory Enterprise Journal Integrity Validation (Phase X)
        validateJournalBalance(lines);

        const entryId = `le-void-expense-${expense.id}`;
        const origEntryId = `le-expense-${expense.id}`;

        // Update metadata on original entry
        const origLedgerRef = doc(db, 'ledgerEntries', origEntryId);
        transaction.set(origLedgerRef, {
          isVoided: true,
          voidedAt: new Date().toISOString(),
          voidedBy: currentUserEmail,
          voidReason: 'Expense record voided',
          reversalEntryId: entryId
        }, { merge: true });

        const ledgerEntry = {
          id: entryId,
          postingNumber: jvPostingNumber,
          companyId: 'comp-default',
          branchId: 'branch-main',
          fiscalYear: year,
          accountingPeriod,
          sourceModule: 'EXPENSE' as const,
          postingStatus: 'POSTED' as const,
          currency: 'USD',
          exchangeRate: 1,
          baseCurrencyCode: 'USD',
          version: 1,
          narration: `Reversal of Expense: Mapped Category "${expense.category}" to "${expense.vendor}" due to Voiding. Original Expense ID: ${expense.id}`,
          createdFrom: expense.id,
          approvalStatus: 'APPROVED' as const,
          postingDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: currentUserEmail,
          lines,
          originalEntryId: origEntryId,
          isReversal: true,
          reversesEntryId: origEntryId
        };

        const ledgerRef = doc(db, 'ledgerEntries', entryId);
        transaction.set(ledgerRef, ledgerEntry);

        // Commit sequence number
        commitNextPostingNumber(transaction, 'JV', jvNextVal);

        // Commit logs
        transaction.set(doc(db, 'Logs', syslogId), syslogPayload);
        transaction.set(doc(db, 'financialLogs', finlogId), finlogPayload);
      });

    } catch (err: any) {
      console.error("Failed to void expense:", err);
      if (err.message && err.message.includes("Accounting validation failed")) {
        alert(err.message);
      } else {
        handleFirestoreError(err, OperationType.WRITE, `batch_void/expense`);
        alert(`Error processing void transaction: ${err?.message || "Check network or credentials"}`);
      }
    }
  };

  // Category CRUD
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryError(null);

    const name = newCategoryName.trim();
    if (!name) return;

    if (allCategories.some(c => c.toLowerCase() === name.toLowerCase())) {
      setCategoryError("This category name already exists.");
      return;
    }

    try {
      const catId = `cat-${Date.now()}`;
      const syslogId = `syslog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const currentUserEmail = auth.currentUser?.email || 'admin_01@nexus.erp';

      const batch = writeBatch(db);

      batch.set(doc(db, 'expenseCategories', catId), {
        id: catId,
        name: name
      });

      batch.set(doc(db, 'Logs', syslogId), {
        id: syslogId,
        action: "Custom Category Added",
        user: currentUserEmail,
        timestamp: new Date().toISOString(),
        details: `Admin created new custom expense category: [${name}]`
      });

      await batch.commit();

      setNewCategoryName('');
      alert(`Category "${name}" added successfully.`);
    } catch (err: any) {
      console.error("Failed to create category:", err);
      setCategoryError("Failed to store custom category.");
    }
  };

  const handleDeleteCategory = async (cat: ExpenseCategory) => {
    try {
      const syslogId = `syslog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const currentUserEmail = auth.currentUser?.email || 'admin_01@nexus.erp';

      const batch = writeBatch(db);

      batch.delete(doc(db, 'expenseCategories', cat.id));

      batch.set(doc(db, 'Logs', syslogId), {
        id: syslogId,
        action: "Custom Category Deleted",
        user: currentUserEmail,
        timestamp: new Date().toISOString(),
        details: `Admin deleted custom expense category: [${cat.name}]`
      });

      await batch.commit();
    } catch (err: any) {
      console.error("Failed to delete category:", err);
      alert("Could not complete delete operation.");
    }
  };

  // Calculations & Analytics metrics
  const stats = useMemo(() => {
    const activeExpenses = expenses.filter(e => e.status === 'active');
    
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    let todaySum = 0;
    let monthlySum = 0;
    let yearlySum = 0;

    const categoryTotals: Record<string, number> = {};

    activeExpenses.forEach(e => {
      const amt = e.amount;
      const date = new Date(e.expenseDate);
      
      // Totals
      if (e.expenseDate === todayStr) {
        todaySum += amt;
      }
      if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
        monthlySum += amt;
      }
      if (date.getFullYear() === yearlySum || date.getFullYear() === currentYear) {
        yearlySum += amt;
      }

      // Categories
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + amt;
    });

    // Top Category
    let topCat = 'None';
    let topVal = 0;
    Object.entries(categoryTotals).forEach(([cat, val]) => {
      if (val > topVal) {
        topVal = val;
        topCat = cat;
      }
    });

    return {
      today: todaySum,
      monthly: monthlySum,
      yearly: yearlySum,
      topCategory: topCat,
      topCategoryVal: topVal,
      categoryTotals
    };
  }, [expenses]);

  // Filters application
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      // Search
      const text = searchQuery.toLowerCase();
      const matchText = searchQuery === '' || 
        e.expenseNumber.toLowerCase().includes(text) ||
        e.vendor.toLowerCase().includes(text) ||
        (e.description || '').toLowerCase().includes(text) ||
        (e.notes || '').toLowerCase().includes(text);

      // Category
      const matchCat = selectedCategory === 'All' || e.category === selectedCategory;

      // Payment
      const matchPay = selectedPaymentMethod === 'All' || e.paymentMethod === selectedPaymentMethod;

      // Status
      const matchStatus = selectedStatus === 'all' || e.status === selectedStatus;

      // Dates
      let matchDates = true;
      if (startDate) {
        matchDates = matchDates && e.expenseDate >= startDate;
      }
      if (endDate) {
        matchDates = matchDates && e.expenseDate <= endDate;
      }

      return matchText && matchCat && matchPay && matchStatus && matchDates;
    });
  }, [expenses, searchQuery, selectedCategory, selectedPaymentMethod, selectedStatus, startDate, endDate]);

  // Exports
  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) {
      alert("No data available to export.");
      return;
    }

    const headers = ["Expense Number", "Date", "Category", "Vendor", "Description", "Amount", "Payment Method", "Reference", "Status", "Created By", "Created At"];
    const rows = filteredExpenses.map(e => [
      e.expenseNumber,
      e.expenseDate,
      e.category,
      e.vendor,
      e.description,
      e.amount,
      e.paymentMethod,
      e.referenceNumber || '',
      e.status,
      e.createdBy,
      e.createdAt
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(row => row.map(v => `"${v.toString().replace(/"/g, '""')}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Nexus_ERP_Expenses_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    if (filteredExpenses.length === 0) {
      alert("No data available to export.");
      return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredExpenses, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `Nexus_ERP_Expenses_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Guard view permission
  if (!permissions.viewExpenses) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center max-w-lg mx-auto space-y-4">
        <div className="p-4 bg-rose-50 text-rose-500 rounded-full">
          <AlertCircle className="w-12 h-12" />
        </div>
        <h1 className="text-xl font-bold text-slate-800">Security Clearance Denied</h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          Your role profile (<strong>{userRole.toUpperCase()}</strong>) is unauthorized to browse corporate Expense Management ledger records. Contact system owner for updated privilege mapping.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <TrendingDown className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Expense Management</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
            Record corporate expenditures, track utility outlays, manage custom spending categories, and coordinate direct ledger reconciliations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {userRole === 'owner' || userRole === 'admin' ? (
            <button
              onClick={() => setIsCategoryModalOpen(true)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-2 transition"
            >
              <FolderPlus className="w-4 h-4" />
              Categories
            </button>
          ) : null}
          {permissions.createExpense && (
            <button
              onClick={() => { resetForm(); setIsRecordModalOpen(true); }}
              className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center gap-2 shadow-sm shadow-rose-200 transition"
            >
              <Plus className="w-4 h-4" />
              Record Expense
            </button>
          )}
        </div>
      </div>

      {/* Analytics Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Expense */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between min-w-0 w-full">
          <div className="space-y-1 min-w-0 flex-1 pr-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 block truncate">Today's Outlay</span>
            <div className="min-w-0">
              <ResponsiveKPIValue value={formatCurrency(stats.today)} className="text-slate-800" />
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
              <Calendar className="w-3 h-3 shrink-0" /> Standard outlays
            </p>
          </div>
          <div className="p-2.5 sm:p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0 flex items-center justify-center">
            <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Monthly Expense */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between min-w-0 w-full">
          <div className="space-y-1 min-w-0 flex-1 pr-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 block truncate">Monthly Sum</span>
            <div className="min-w-0">
              <ResponsiveKPIValue value={formatCurrency(stats.monthly)} className="text-slate-800" />
            </div>
            <p className="text-[11px] text-slate-400 truncate">Current cycle tracking</p>
          </div>
          <div className="p-2.5 sm:p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0 flex items-center justify-center">
            <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Yearly Expense */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between min-w-0 w-full">
          <div className="space-y-1 min-w-0 flex-1 pr-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 block truncate">Yearly Total</span>
            <div className="min-w-0">
              <ResponsiveKPIValue value={formatCurrency(stats.yearly)} className="text-slate-800" />
            </div>
            <p className="text-[11px] text-slate-400 truncate">Annual operation expenditures</p>
          </div>
          <div className="p-2.5 sm:p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0 flex items-center justify-center">
            <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Top Expense Category */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between min-w-0 w-full">
          <div className="space-y-1 min-w-0 flex-1 pr-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 block truncate">Top Outflow Category</span>
            <h3 className="text-base sm:text-lg font-bold text-slate-800 truncate">{stats.topCategory}</h3>
            <p className="text-[11px] text-slate-400 truncate">
              Total: {formatCurrency(stats.topCategoryVal)}
            </p>
          </div>
          <div className="p-2.5 sm:p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0 flex items-center justify-center">
            <Tag className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {/* Main Data & Filters panel */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        
        {/* Filters bar */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by expense sequence #, vendor or description..."
                className="pl-9 pr-4 py-2 w-full text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/10 focus:border-rose-500 transition"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500"
              >
                <option value="All">All Categories</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              {/* Payment Method Filter */}
              <select
                value={selectedPaymentMethod}
                onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500"
              >
                <option value="All">All Methods</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Cheque">Cheque</option>
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500"
              >
                <option value="active">Active Only</option>
                <option value="void">Void Only</option>
                <option value="all">All Records</option>
              </select>

              <button
                onClick={handleExportCSV}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            </div>
          </div>

          {/* Date range filters */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 border-t border-slate-100 pt-3">
            <span className="font-semibold flex items-center gap-1"><Filter className="w-3.5 h-3.5" /> Date Filter:</span>
            <div className="flex items-center gap-2">
              <label>From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1 border border-slate-200 rounded bg-white text-slate-700 text-xs focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label>To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1 border border-slate-200 rounded bg-white text-slate-700 text-xs focus:outline-none"
              />
            </div>
            {(startDate || endDate || selectedCategory !== 'All' || selectedPaymentMethod !== 'All' || selectedStatus !== 'active' || searchQuery) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setSelectedCategory('All');
                  setSelectedPaymentMethod('All');
                  setSelectedStatus('active');
                  setSearchQuery('');
                }}
                className="text-rose-600 hover:underline hover:text-rose-700"
              >
                Reset filters
              </button>
            )}
            <span className="ml-auto font-medium text-slate-400">Showing {filteredExpenses.length} entries</span>
          </div>
        </div>

        {/* Expenses List Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-100">
                <th className="py-4 px-6">Expense #</th>
                <th className="py-4 px-4">Date</th>
                <th className="py-4 px-4">Category</th>
                <th className="py-4 px-4">Vendor / Payee</th>
                <th className="py-4 px-4">Description</th>
                <th className="py-4 px-4 text-right">Amount</th>
                <th className="py-4 px-4">Method</th>
                <th className="py-4 px-4">Status</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                    Querying secure corporate accounts... Please wait.
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 leading-loose">
                    <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    No corporate expenditures found matching the specified filter keys.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => {
                  const isVoid = expense.status === 'void';
                  return (
                    <tr 
                      key={expense.id} 
                      className={`hover:bg-slate-50/50 transition-colors ${isVoid ? 'bg-slate-50/40 text-slate-400 line-through decoration-slate-300' : 'text-slate-700'}`}
                    >
                      <td className="py-4 px-6 font-mono font-semibold text-slate-900">
                        {expense.expenseNumber}
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        {expense.expenseDate}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isVoid ? 'bg-slate-100 text-slate-400' : 'bg-slate-50 text-slate-700 border border-slate-150'}`}>
                          {expense.category}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-medium truncate max-w-[150px]">
                        {expense.vendor}
                      </td>
                      <td className="py-4 px-4 max-w-xs truncate">
                        {expense.description}
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap text-xs flex items-center gap-1.5 mt-2.5">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                        {expense.paymentMethod}
                      </td>
                      <td className="py-4 px-4">
                        {isVoid ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500">
                            Void
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setViewingExpense(expense); setIsViewModalOpen(true); }}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          
                          {!isVoid && permissions.editExpense && (
                            <button
                              onClick={() => handleEditClick(expense)}
                              className="p-1.5 hover:bg-indigo-50 rounded text-indigo-600 hover:text-indigo-800 transition"
                              title="Edit"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}

                          {!isVoid && permissions.voidExpense && (
                            <button
                              onClick={() => setVoidConfirmationExpense(expense)}
                              className="p-1.5 hover:bg-rose-50 rounded text-rose-600 hover:text-rose-800 transition"
                              title="Void Expense"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Expense Modal */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="p-6 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-rose-500" />
                {editingExpense ? `Edit Expense Details [${editingExpense.expenseNumber}]` : "Record Corporate Expense"}
              </h2>
              <button
                onClick={() => setIsRecordModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitExpense} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Expense Date *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="px-3 py-2 w-full text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Category *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="px-3 py-2 w-full text-sm border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  >
                    {allCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Payee / Vendor *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Electric Corp, Acme Corp"
                    value={formVendor}
                    onChange={(e) => setFormVendor(e.target.value)}
                    className="px-3 py-2 w-full text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Expense Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0.01"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="px-3 py-2 w-full text-sm font-mono font-semibold border border-slate-200 rounded-lg focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* VAT ACCOUNTING CONFIGURATION */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formHasVat}
                      onChange={(e) => setFormHasVat(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
                    />
                    <span className="text-xs font-bold text-slate-700">Separate Input VAT Receivable (1400)</span>
                  </label>
                  {formHasVat && (
                    <span className="text-[10px] font-bold text-indigo-700 font-mono bg-indigo-100/60 px-2 py-0.5 rounded">
                      Account 1400 Active
                    </span>
                  )}
                </div>

                {formHasVat && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">VAT Rate %</label>
                      <select
                        value={formTaxRatePercent}
                        onChange={(e) => setFormTaxRatePercent(parseFloat(e.target.value) || 0)}
                        className="px-3 py-1.5 w-full text-xs font-mono font-semibold border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value={15}>15% (Standard VAT)</option>
                        <option value={5}>5% (Reduced VAT)</option>
                        <option value={0}>0% (Zero Rated)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Calculation Mode</label>
                      <select
                        value={formIsVatInclusive ? 'inclusive' : 'exclusive'}
                        onChange={(e) => setFormIsVatInclusive(e.target.value === 'inclusive')}
                        className="px-3 py-1.5 w-full text-xs font-semibold border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="inclusive">Tax Inclusive (Gross Entered)</option>
                        <option value="exclusive">Tax Exclusive (Net Entered)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* VAT LIVE BREAKDOWN BOX */}
                {formHasVat && formAmount && parseFloat(formAmount) > 0 && (
                  <div className="bg-white border border-indigo-100 rounded-lg p-3 text-xs space-y-1 font-mono">
                    {(() => {
                      const amountInput = parseFloat(formAmount) || 0;
                      const rate = formTaxRatePercent;
                      let net = amountInput;
                      let vat = 0;
                      let gross = amountInput;
                      if (formIsVatInclusive) {
                        gross = amountInput;
                        net = parseFloat((amountInput / (1 + rate / 100)).toFixed(2));
                        vat = parseFloat((gross - net).toFixed(2));
                      } else {
                        net = amountInput;
                        vat = parseFloat((amountInput * (rate / 100)).toFixed(2));
                        gross = parseFloat((net + vat).toFixed(2));
                      }
                      return (
                        <>
                          <div className="flex justify-between text-slate-600">
                            <span>Operating Expense (Net):</span>
                            <span className="font-bold text-slate-900">{formatCurrency(net)}</span>
                          </div>
                          <div className="flex justify-between text-indigo-700 font-semibold">
                            <span>Input VAT Receivable (1400):</span>
                            <span className="font-bold">{formatCurrency(vat)}</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-100 pt-1 font-bold text-slate-900">
                            <span>Total Cash / AP Outlay:</span>
                            <span className="text-emerald-600">{formatCurrency(gross)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Brief Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. May electricity bill, internet infrastructure upgrade"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="px-3 py-2 w-full text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Payment Method *</label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    className="px-3 py-2 w-full text-sm border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Reference # / Bill #</label>
                  <input
                    type="text"
                    placeholder="e.g. TXN-19401"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    className="px-3 py-2 w-full text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Detailed Notes</label>
                <textarea
                  rows={2}
                  placeholder="Add optional administrative notes, approval logs, or physical file location pointers..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="px-3 py-2 w-full text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              {formPaymentMethod === 'Cash' && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <span className="font-semibold">Cash Ledger Synchronization:</span> Recording this transaction as Cash will automatically allocate and reflect a corresponding <strong>outflow</strong> of {formatCurrency(parseFloat(formAmount) || 0)} inside the corporate Cash Ledger.
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50 p-6 -mx-6 -mb-6">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition shadow-sm shadow-rose-200"
                >
                  {editingExpense ? "Apply Changes" : "Commit Outlay"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Categories Management Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="p-6 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-500" />
                Manage Spending Categories
              </h2>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Add category form */}
              <form onSubmit={handleAddCategory} className="space-y-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase">Create New Category</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. Travel, Software Licences"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg flex-1 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1 transition"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                {categoryError && <p className="text-xs text-rose-600 font-medium">{categoryError}</p>}
              </form>

              {/* Lists of Categories */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">Registered Categories</h3>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 pr-1">
                  
                  {/* Default immutable categories */}
                  <div className="py-2.5 space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Default Systems (Immutable)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_CATEGORIES.map(cat => (
                        <span key={cat} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-50 text-slate-500 border border-slate-150">
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Custom added categories */}
                  <div className="py-2.5 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-500 block">Custom Added (Admin)</span>
                    {customCategories.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No custom categories registered yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {customCategories.map(cat => (
                          <div key={cat.id} className="flex items-center justify-between py-1 px-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700">
                            <span>{cat.name}</span>
                            <button
                              onClick={() => setDeleteConfirmationCategory(cat)}
                              className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1 rounded transition"
                              title="Delete custom category"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {isViewModalOpen && viewingExpense && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="p-6 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-500" />
                Expenditure Audit Ledger [{viewingExpense.expenseNumber}]
              </h2>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-sm text-slate-700">
              {/* Header Details */}
              <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                <div>
                  <span className="text-xs text-slate-400 font-semibold block uppercase">Total Amount</span>
                  <span className="text-3xl font-mono font-extrabold text-slate-950">{formatCurrency(viewingExpense.amount)}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 font-semibold block uppercase">Status</span>
                  {viewingExpense.status === 'void' ? (
                    <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-500">
                      Voided / Cancelled
                    </span>
                  ) : (
                    <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Active Transaction
                    </span>
                  )}
                </div>
              </div>

              {/* VAT Breakdown if present */}
              {((viewingExpense.taxAmount || 0) > 0 || (viewingExpense.vatAmount || 0) > 0) && (
                <div className="bg-indigo-50/50 border border-indigo-150 rounded-xl p-3 text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between text-slate-600">
                    <span>Operating Expense (Net):</span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(viewingExpense.subtotal !== undefined ? viewingExpense.subtotal : (viewingExpense.amount - (viewingExpense.taxAmount || viewingExpense.vatAmount || 0)))}
                    </span>
                  </div>
                  <div className="flex justify-between text-indigo-700 font-semibold">
                    <span>Input VAT Receivable (1400) [{viewingExpense.taxRatePercent || 15}%]:</span>
                    <span className="font-bold">{formatCurrency(viewingExpense.taxAmount || viewingExpense.vatAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between border-t border-indigo-100 pt-1 font-bold text-slate-900">
                    <span>Gross Cash Outlay:</span>
                    <span className="text-emerald-700">{formatCurrency(viewingExpense.amount)}</span>
                  </div>
                </div>
              )}

              {/* Key fields */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2">
                <div>
                  <span className="text-xs text-slate-400 font-semibold uppercase block">Transaction Date</span>
                  <span className="font-medium text-slate-800">{viewingExpense.expenseDate}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-semibold uppercase block">Spend Category</span>
                  <span className="font-medium text-slate-800">{viewingExpense.category}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-semibold uppercase block">Vendor / Payee</span>
                  <span className="font-medium text-slate-800">{viewingExpense.vendor}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-semibold uppercase block">Payment Method</span>
                  <span className="font-medium text-slate-800">{viewingExpense.paymentMethod}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-semibold uppercase block">Reference / Receipt Number</span>
                  <span className="font-medium text-slate-800">{viewingExpense.referenceNumber || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-semibold uppercase block">Recorded By</span>
                  <span className="font-mono text-slate-600 truncate block max-w-[180px]" title={viewingExpense.createdBy}>{viewingExpense.createdBy}</span>
                </div>
              </div>

              {/* Description */}
              <div className="border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-400 font-semibold uppercase block">Purpose / Description</span>
                <p className="mt-1 font-medium text-slate-800">{viewingExpense.description}</p>
              </div>

              {/* Administrative Notes */}
              {viewingExpense.notes && (
                <div className="border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-400 font-semibold uppercase block">Administrative Notes</span>
                  <div className="mt-1 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600 leading-relaxed font-sans">
                    {viewingExpense.notes}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-400 flex justify-between font-mono">
                <span>Created: {new Date(viewingExpense.createdAt).toLocaleString()}</span>
                <span>Last Updated: {new Date(viewingExpense.updatedAt).toLocaleString()}</span>
              </div>

              <div className="pt-4 border-t border-slate-150 flex items-center justify-end bg-slate-50 p-6 -mx-6 -mb-6">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="px-5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition"
                >
                  Close Audit Sheet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {voidConfirmationExpense && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xl"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-sans text-sm font-bold tracking-tight text-slate-850">
                    Confirm Void Expense
                  </h3>
                  <p className="text-xs text-slate-550 leading-relaxed">
                    Are you absolutely sure you want to VOID expense transaction {voidConfirmationExpense.expenseNumber}? This operation cannot be undone. Financial reports and ledgers will be synchronized.
                  </p>
                  <div className="text-[10px] font-mono text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                    <div><span className="font-bold">Expense ID:</span> {voidConfirmationExpense.id}</div>
                    <div><span className="font-bold">Category:</span> {voidConfirmationExpense.category}</div>
                    <div><span className="font-bold">Vendor:</span> {voidConfirmationExpense.vendor}</div>
                    <div><span className="font-bold">Amount:</span> {formatCurrency(voidConfirmationExpense.amount)}</div>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setVoidConfirmationExpense(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const expenseToVoid = voidConfirmationExpense;
                    setVoidConfirmationExpense(null);
                    await handleVoidExpense(expenseToVoid);
                  }}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition cursor-pointer shadow-xs"
                >
                  Yes, Void Expense
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirmationCategory && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xl"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-sans text-sm font-bold tracking-tight text-slate-850">
                    Confirm Delete Custom Category
                  </h3>
                  <p className="text-xs text-slate-550 leading-relaxed">
                    Are you sure you want to remove custom category "{deleteConfirmationCategory.name}"? Existing expenses will preserve their tags, but this category will not be available for new selections.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmationCategory(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const categoryToDelete = deleteConfirmationCategory;
                    setDeleteConfirmationCategory(null);
                    await handleDeleteCategory(categoryToDelete);
                  }}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition cursor-pointer shadow-xs"
                >
                  Yes, Remove Category
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
