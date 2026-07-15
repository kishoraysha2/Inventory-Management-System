import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Calendar, 
  AlertTriangle, 
  Truck, 
  Box, 
  TrendingUp, 
  DollarSign, 
  PlusCircle, 
  CornerDownLeft,
  X,
  RefreshCw,
  Clock,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, OperationType, handleFirestoreError, logSystemActivity, logFinancialAudit } from '../lib/firebase';
import { collection, onSnapshot, doc, runTransaction, setDoc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import { Purchase, Supplier, Product, CashLedgerEntry, Capital } from '../types';
import { usePermission, UserRole } from '../hooks/usePermission';
import { isVoidStatus, isInactiveStatus } from '../lib/utils';
import { getNextPostingNumber, commitNextPostingNumber, ensureSystemAccountsExist, SYSTEM_ACCOUNTS, resolveSystemAccount } from '../lib/postingEngine';

export default function ProcurementManagement({ userRole = 'admin' }: { userRole?: UserRole }) {
  const { permissions } = usePermission({ role: userRole });

  // --- States ---
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>([]);
  const [capital, setCapital] = useState<Capital[]>([]);
  const [coa, setCoa] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // --- Search & Filter States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'All' | 'Cash' | 'Credit'>('All');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [diagnosticTrace, setDiagnosticTrace] = useState<{
    step: string;
    path: string;
    op: string;
    payload: string;
    status: 'PASS' | 'FAIL' | 'PENDING';
    expression?: string;
    reason?: string;
  }[] | null>(null);
  const [voidConfirmationPurchase, setVoidConfirmationPurchase] = useState<Purchase | null>(null);

  // --- Form States ---
  const [formData, setFormData] = useState({
    supplierId: '',
    productId: '',
    quantity: '1',
    purchasePrice: '',
    paymentType: 'Cash' as 'Cash' | 'Credit',
    purchaseDate: new Date().toISOString().split('T')[0]
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Real-time Firestore Sync ---
  useEffect(() => {
    if (!auth.currentUser) {
      // Local fallback
      const savedPurchases = localStorage.getItem('inventory_purchases');
      setPurchases(savedPurchases ? JSON.parse(savedPurchases) : []);

      const savedSuppliers = localStorage.getItem('inventory_suppliers');
      setSuppliers(savedSuppliers ? JSON.parse(savedSuppliers) : []);

      const savedProducts = localStorage.getItem('inventory_products');
      setProducts(savedProducts ? JSON.parse(savedProducts) : []);

      const savedLedger = localStorage.getItem('inventory_cash_ledger');
      setCashLedger(savedLedger ? JSON.parse(savedLedger) : []);

      const savedCapital = localStorage.getItem('inventory_capital');
      setCapital(savedCapital ? JSON.parse(savedCapital) : []);

      const savedCOA = localStorage.getItem('nexus_chart_of_accounts');
      setCoa(savedCOA ? JSON.parse(savedCOA) : []);

      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. Sync Purchases
    const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snapshot) => {
      const purchaseList: Purchase[] = [];
      snapshot.forEach((docSnap) => {
        purchaseList.push(docSnap.data() as Purchase);
      });
      const sorted = purchaseList.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
      setPurchases(sorted);
      setLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'purchases');
      } catch (err: any) {
        setFeedback({ message: `Purchases read error: ${err.message}`, type: 'error' });
      }
      setLoading(false);
    });

    // 2. Sync Suppliers
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const supplierList: Supplier[] = [];
      snapshot.forEach((docSnap) => {
        supplierList.push(docSnap.data() as Supplier);
      });
      setSuppliers(supplierList);
    }, (error) => {
      console.error('Error syncing suppliers:', error);
    });

    // 3. Sync Products
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productList: Product[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Product;
        productList.push({
          ...data,
          id: data.id || docSnap.id
        });
      });
      setProducts(productList);
    }, (error) => {
      console.error('Error syncing products:', error);
    });

    // 4. Sync Cash Ledger
    const unsubCashLedger = onSnapshot(collection(db, 'cashLedger'), (snapshot) => {
      const ledgerList: CashLedgerEntry[] = [];
      snapshot.forEach((docSnap) => {
        ledgerList.push(docSnap.data() as CashLedgerEntry);
      });
      setCashLedger(ledgerList);
    }, (error) => {
      console.error('Error syncing cash ledger in procurement modal:', error);
    });

    // 5. Sync Capital
    const unsubCapital = onSnapshot(collection(db, 'capital'), (snapshot) => {
      const capitalList: Capital[] = [];
      snapshot.forEach((docSnap) => {
        capitalList.push(docSnap.data() as Capital);
      });
      setCapital(capitalList);
    }, (error) => {
      console.error('Error syncing capital in procurement modal:', error);
    });

    // 6. Sync Chart of Accounts
    const unsubCOA = onSnapshot(collection(db, 'chartOfAccounts'), (snapshot) => {
      const coaList: any[] = [];
      snapshot.forEach((docSnap) => {
        coaList.push(docSnap.data());
      });
      setCoa(coaList);
    }, (error) => {
      console.error('Error syncing COA in procurement modal:', error);
    });

    return () => {
      unsubPurchases();
      unsubSuppliers();
      unsubProducts();
      unsubCashLedger();
      unsubCapital();
      unsubCOA();
    };
  }, []);

  useEffect(() => {
    const handleTrigger = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.tab === 'procurement') {
        openForm();
      }
    };
    window.addEventListener('nexus-trigger-add-modal', handleTrigger);
    return () => window.removeEventListener('nexus-trigger-add-modal', handleTrigger);
  }, []);

  // --- Form Helper: Pre-fill purchase price upon product selection ---
  const handleProductSelect = (selectedId: string) => {
    const selectedProd = products.find(p => p.id === selectedId);
    setFormData(prev => ({
      ...prev,
      productId: selectedId,
      purchasePrice: selectedProd ? selectedProd.purchasePrice.toString() : ''
    }));
  };

  // --- Open form in Create / Edit mode ---
  const openForm = (purchase: Purchase | null = null) => {
    setErrors({});
    if (purchase) {
      setEditingPurchase(purchase);
      setFormData({
        supplierId: purchase.supplierId,
        productId: purchase.productId,
        quantity: purchase.quantity.toString(),
        purchasePrice: purchase.purchasePrice.toString(),
        paymentType: purchase.paymentType,
        purchaseDate: purchase.purchaseDate.split('T')[0]
      });
    } else {
      setEditingPurchase(null);
      setFormData({
        supplierId: '',
        productId: '',
        quantity: '1',
        purchasePrice: '',
        paymentType: 'Cash',
        purchaseDate: new Date().toISOString().split('T')[0]
      });
    }
    setIsFormOpen(true);
  };

  // --- Form Validation ---
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.supplierId) newErrors.supplierId = 'Please select a supplier';
    if (!formData.productId) newErrors.productId = 'Please select a product';
    
    const qty = parseInt(formData.quantity);
    if (isNaN(qty) || qty < 1) {
      newErrors.quantity = 'Quantity must be 1 or greater';
    }

    const price = parseFloat(formData.purchasePrice);
    if (isNaN(price) || price < 0) {
      newErrors.purchasePrice = 'Enter a valid positive unit price';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Handles Adding and Editing of Purchases securely ---
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const chosenSupplier = suppliers.find(s => s.id === formData.supplierId);
    const chosenProduct = products.find(p => p.id === formData.productId);

    if (!chosenSupplier || !chosenProduct) {
      setFeedback({ message: 'Selected Supplier or Product not resolved.', type: 'error' });
      return;
    }

    const numQty = parseInt(formData.quantity);
    const numPrice = parseFloat(formData.purchasePrice);
    const totalCalc = numQty * numPrice;

    // --- Cash balance validation to prevent negative cash in hand ---
    if (formData.paymentType === 'Cash') {
      const startingCapital = capital.reduce((sum, entry) => sum + entry.amount, 0);
      const totalInflow = cashLedger
        .filter(entry => entry.type === 'inflow' && !isVoidStatus(entry.status))
        .reduce((sum, entry) => sum + entry.amount, 0);
      const totalOutflow = cashLedger
        .filter(entry => entry.type === 'outflow' && !isVoidStatus(entry.status))
        .reduce((sum, entry) => sum + entry.amount, 0);
      const currentCashInHand = startingCapital + totalInflow - totalOutflow;

      const rollbackAmount = (editingPurchase && editingPurchase.paymentType === 'Cash') ? editingPurchase.totalAmount : 0;
      const effectiveCash = currentCashInHand + rollbackAmount;

      if (totalCalc > effectiveCash) {
        setFeedback({
          message: `Insufficient Cash Balance (Available Cash: $${effectiveCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Required Payment: $${totalCalc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). Available Cash is lower than the payment amount. Please add business capital or use Credit Purchase.`,
          type: 'error'
        });
        setErrors(prev => ({
          ...prev,
          paymentType: `Insufficient cash balance. Available: $${effectiveCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Required: $${totalCalc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
        }));
        return;
      }
    }
    
    const purchaseId = editingPurchase ? editingPurchase.id : `purchase-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    const finalizedPurchaseData: Purchase = {
      id: purchaseId,
      supplierId: chosenSupplier.id,
      supplierName: chosenSupplier.name,
      productId: chosenProduct.id,
      productName: chosenProduct.name,
      quantity: numQty,
      purchasePrice: numPrice,
      totalAmount: totalCalc,
      paymentType: formData.paymentType,
      purchaseDate: new Date(formData.purchaseDate).toISOString()
    };

    setIsSaving(true);
    setFeedback(null);
    setDiagnosticTrace(null);

    try {
      if (!auth.currentUser) {
        // Local state rollback/calculations for edit mode
        const savedPurchases = localStorage.getItem('inventory_purchases') || '[]';
        let purchasesList: Purchase[] = JSON.parse(savedPurchases);

        const savedProducts = localStorage.getItem('inventory_products') || '[]';
        let productsList: Product[] = JSON.parse(savedProducts);

        const savedSuppliers = localStorage.getItem('inventory_suppliers') || '[]';
        let suppliersList: Supplier[] = JSON.parse(savedSuppliers);

        // A. Handle product stock edits & supplier balance adjustments if we are editing an existing purchase
        if (editingPurchase) {
          // Rollback old product stock
          productsList = productsList.map(p => {
            if (p.id === editingPurchase.productId) {
              return { ...p, currentStock: Math.max(0, (p.currentStock ?? 0) - editingPurchase.quantity) };
            }
            return p;
          });

          // Rollback old supplier due balance
          if (editingPurchase.paymentType === 'Credit') {
            suppliersList = suppliersList.map(s => {
              if (s.id === editingPurchase.supplierId) {
                return { ...s, dueBalance: Math.max(0, (s.dueBalance ?? 0) - editingPurchase.totalAmount) };
              }
              return s;
            });
          }

          // Apply current product stock
          productsList = productsList.map(p => {
            if (p.id === chosenProduct.id) {
              return { ...p, currentStock: (p.currentStock ?? 0) + numQty };
            }
            return p;
          });

          // Apply current supplier due balance
          if (formData.paymentType === 'Credit') {
            suppliersList = suppliersList.map(s => {
              if (s.id === chosenSupplier.id) {
                return { ...s, dueBalance: (s.dueBalance ?? 0) + totalCalc };
              }
              return s;
            });
          }

          // Update purchase in list
          purchasesList = purchasesList.map(p => p.id === purchaseId ? finalizedPurchaseData : p);
        } else {
          // Adding a brand new purchase
          // Increase product stock
          productsList = productsList.map(p => {
            if (p.id === chosenProduct.id) {
              return { ...p, currentStock: (p.currentStock ?? 0) + numQty };
            }
            return p;
          });

          // If credit, increase supplier dueBalance
          if (formData.paymentType === 'Credit') {
            suppliersList = suppliersList.map(s => {
              if (s.id === chosenSupplier.id) {
                return { ...s, dueBalance: (s.dueBalance ?? 0) + totalCalc };
              }
              return s;
            });
          }

          // Add to Cash Ledger if it was Cash
          if (formData.paymentType === 'Cash') {
            const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
            const ledgerList = JSON.parse(savedLedger);
            ledgerList.unshift({
              id: `cl-${purchaseId}`,
              type: 'outflow',
              source: 'procurement',
              amount: totalCalc,
              referenceId: purchaseId,
              description: `Purchased "${chosenProduct.name}" from supplier "${chosenSupplier.name}"`,
              timestamp: new Date().toISOString()
            });
            localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));
          }

          purchasesList = [finalizedPurchaseData, ...purchasesList];
        }

        // Save everything locally and update local states
        localStorage.setItem('inventory_purchases', JSON.stringify(purchasesList));
        localStorage.setItem('inventory_products', JSON.stringify(productsList));
        localStorage.setItem('inventory_suppliers', JSON.stringify(suppliersList));

        setPurchases(purchasesList);
        setProducts(productsList);
        setSuppliers(suppliersList);

        setFeedback({
          message: editingPurchase 
            ? `Successfully synchronized purchase corrections for "${finalizedPurchaseData.productName}" (Local Only)` 
            : `Permanently logged procurement transaction for "${finalizedPurchaseData.productName}" locally.`,
          type: 'success'
        });
        setIsFormOpen(false);
        setIsSaving(false);
        return;
      }

      await runTransaction(db, async (transaction) => {
        // --- 1. Define all references ---
        const purchaseRef = doc(db, 'purchases', purchaseId);
        const productRef = doc(db, 'products', chosenProduct.id);
        const supplierRef = doc(db, 'suppliers', chosenSupplier.id);

        let oldProductRef = null;
        let oldSupplierRef = null;

        if (editingPurchase) {
          if (editingPurchase.productId !== chosenProduct.id) {
            oldProductRef = doc(db, 'products', editingPurchase.productId);
          }
          if (editingPurchase.paymentType === 'Credit' && editingPurchase.supplierId !== chosenSupplier.id) {
            oldSupplierRef = doc(db, 'suppliers', editingPurchase.supplierId);
          }
        }

        // --- 2. Execute ALL reads up front (before any writes) ---
        const productSnap = await transaction.get(productRef);
        const supplierSnap = await transaction.get(supplierRef);

        let oldProductSnap = null;
        if (oldProductRef) {
          oldProductSnap = await transaction.get(oldProductRef);
        }

        let oldSupplierSnap = null;
        if (oldSupplierRef) {
          oldSupplierSnap = await transaction.get(oldSupplierRef);
        }

        // Single Sequence Counter Read for atomic sequence generation
        const counterRef = doc(db, 'counters', 'posting_sequences');
        const counterSnap = await transaction.get(counterRef);
        
        let currentSequences = { JV: 0, RV: 0, PV: 0, SV: 0, CV: 0 };
        if (counterSnap.exists()) {
          currentSequences = { ...currentSequences, ...counterSnap.data() };
        }

        const transDateYear = new Date(formData.purchaseDate).getFullYear() || 2026;
        const voucherType = formData.paymentType === 'Cash' ? 'CV' : 'JV';

        // Resolve new entry sequence
        const newNextVal = (currentSequences[voucherType] || 0) + 1;
        const postingNumber = `${voucherType}-${transDateYear}-${String(newNextVal).padStart(6, '0')}`;
        currentSequences[voucherType] = newNextVal;

        // Resolve reversal entry sequence if editing
        let revPostingNumber = '';
        if (editingPurchase) {
          const oldDateYear = new Date(editingPurchase.purchaseDate).getFullYear() || 2026;
          const rNV = (currentSequences['JV'] || 0) + 1;
          revPostingNumber = `JV-${oldDateYear}-${String(rNV).padStart(6, '0')}`;
          currentSequences['JV'] = rNV;
        }

        // --- 3. Perform writes ---

        // A. Handle rollbacks if we are editing
        if (editingPurchase) {
          // Roll back stock from the old product
          const actualOldProductRef = oldProductRef || productRef;
          const actualOldProductSnap = oldProductRef ? oldProductSnap : productSnap;
          if (actualOldProductSnap && actualOldProductSnap.exists()) {
            const oldProductData = actualOldProductSnap.data() as Product;
            transaction.update(actualOldProductRef, {
              currentStock: Math.max(0, (oldProductData.currentStock ?? 0) - editingPurchase.quantity)
            });
          }

          // Roll back credit balance from the old supplier
          if (editingPurchase.paymentType === 'Credit') {
            const actualOldSupplierRef = oldSupplierRef || supplierRef;
            const actualOldSupplierSnap = oldSupplierRef ? oldSupplierSnap : supplierSnap;
            if (actualOldSupplierSnap && actualOldSupplierSnap.exists()) {
              const oldSupplierData = actualOldSupplierSnap.data() as Supplier;
              transaction.update(actualOldSupplierRef, {
                dueBalance: Math.max(0, (oldSupplierData.dueBalance ?? 0) - editingPurchase.totalAmount)
              });
            }
          }

          // --- REVERSAL LEDGER POSTING ---
          const invAcc = resolveSystemAccount('INVENTORY', coa);
          const contraAcc = editingPurchase.paymentType === 'Cash' 
            ? resolveSystemAccount('CASH', coa) 
            : resolveSystemAccount('ACCOUNTS_PAYABLE', coa);

          const revLines = [
            // Credit: Inventory Asset (1300) is reversed with Credit
            {
              accountId: invAcc.id,
              accountCode: invAcc.code,
              accountName: invAcc.name,
              debit: 0,
              credit: editingPurchase.totalAmount,
              baseCurrencyDebit: 0,
              baseCurrencyCredit: editingPurchase.totalAmount
            },
            // Debit: Cash (1100) or Accounts Payable (2100) is reversed with Debit
            {
              accountId: contraAcc.id,
              accountCode: contraAcc.code,
              accountName: contraAcc.name,
              debit: editingPurchase.totalAmount,
              credit: 0,
              baseCurrencyDebit: editingPurchase.totalAmount,
              baseCurrencyCredit: 0
            }
          ];

          const oldPeriodMonth = String(new Date(editingPurchase.purchaseDate).getMonth() + 1).padStart(2, '0');
          const oldAccountingPeriod = `${new Date(editingPurchase.purchaseDate).getFullYear() || 2026}-${oldPeriodMonth}`;
          const revEntryId = `le-purchase-rev-${editingPurchase.id}-${Date.now()}`;

          const reversalLedgerEntry = {
            id: revEntryId,
            postingNumber: revPostingNumber,
            companyId: 'comp-default',
            branchId: 'branch-main',
            fiscalYear: new Date(editingPurchase.purchaseDate).getFullYear() || 2026,
            accountingPeriod: oldAccountingPeriod,
            sourceModule: 'PROCUREMENT' as const,
            postingStatus: 'REVERSED' as const,
            currency: 'USD',
            exchangeRate: 1,
            baseCurrencyCode: 'USD',
            version: 1,
            narration: `Reversal of Procurement Entry due to Edit - Original: ${editingPurchase.id}`,
            createdFrom: editingPurchase.id,
            approvalStatus: 'APPROVED' as const,
            postingDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
            lines: revLines,
            originalEntryId: `le-purchase-${editingPurchase.id}`
          };

          const revLedgerRef = doc(db, 'ledgerEntries', revEntryId);
          transaction.set(revLedgerRef, reversalLedgerEntry);
        }

        // B. Update target product with new stock level
        if (!productSnap.exists()) {
          throw new Error(`Standard inventory error: target product "${chosenProduct.name}" does not exist.`);
        }
        
        const currentProductData = productSnap.data() as Product;
        let initialStockForCalc = currentProductData.currentStock ?? 0;
        
        // If this is an edit and it's the exact same product, factor in the rollback subtraction locally
        if (editingPurchase && editingPurchase.productId === chosenProduct.id) {
          initialStockForCalc = Math.max(0, initialStockForCalc - editingPurchase.quantity);
        }

        const finalProductStock = initialStockForCalc + numQty;
        transaction.update(productRef, {
          currentStock: finalProductStock
        });

        // C. Update supplier accounts if credit purchase
        if (formData.paymentType === 'Credit') {
          if (!supplierSnap.exists()) {
            throw new Error(`Standard account error: target supplier "${chosenSupplier.name}" is missing.`);
          }
          const currentSupplierData = supplierSnap.data() as Supplier;
          let initialDueForCalc = currentSupplierData.dueBalance ?? 0;

          // If this is an edit and it's the exact same supplier, factor in the rollback subtraction locally
          if (editingPurchase && editingPurchase.supplierId === chosenSupplier.id && editingPurchase.paymentType === 'Credit') {
            initialDueForCalc = Math.max(0, initialDueForCalc - editingPurchase.totalAmount);
          }

          const finalSupplierDue = initialDueForCalc + totalCalc;
          transaction.update(supplierRef, {
            dueBalance: finalSupplierDue
          });
        }

        // D. Commit final purchase ledger
        transaction.set(purchaseRef, finalizedPurchaseData);

        // --- E. Cash & Capital Accounting Layer ---
        const cashLedgerId = `cl-${purchaseId}`;
        const cashLedgerRef = doc(db, 'cashLedger', cashLedgerId);
        if (formData.paymentType === 'Cash') {
          transaction.set(cashLedgerRef, {
            id: cashLedgerId,
            type: 'outflow',
            source: 'purchase',
            amount: totalCalc,
            referenceId: purchaseId,
            description: `Procured x${numQty} "${chosenProduct.name}" from "${chosenSupplier.name}"`,
            timestamp: new Date(formData.purchaseDate).toISOString()
          });
        } else {
          // If edited and changed from Cash to Credit, delete the CashLedger entry
          if (editingPurchase && editingPurchase.paymentType === 'Cash') {
            transaction.delete(cashLedgerRef);
          }
        }

        // --- F. Double-Entry General Ledger Posting ---
        const invAcc = resolveSystemAccount('INVENTORY', coa);
        const contraAcc = formData.paymentType === 'Cash'
          ? resolveSystemAccount('CASH', coa)
          : resolveSystemAccount('ACCOUNTS_PAYABLE', coa);

        const lines = [
          // Debit: Inventory Asset (1300)
          {
            accountId: invAcc.id,
            accountCode: invAcc.code,
            accountName: invAcc.name,
            debit: totalCalc,
            credit: 0,
            baseCurrencyDebit: totalCalc,
            baseCurrencyCredit: 0
          },
          // Credit: Cash in Hand (1100) or Accounts Payable (2100)
          {
            accountId: contraAcc.id,
            accountCode: contraAcc.code,
            accountName: contraAcc.name,
            debit: 0,
            credit: totalCalc,
            baseCurrencyDebit: 0,
            baseCurrencyCredit: totalCalc
          }
        ];

        // Verify Debit == Credit
        const totalDebits = lines.reduce((sum, l) => sum + l.debit, 0);
        const totalCredits = lines.reduce((sum, l) => sum + l.credit, 0);
        if (Math.abs(totalDebits - totalCredits) > 0.01) {
          throw new Error(`Double-entry unbalanced error: Total Debits ($${totalDebits}) does not match Total Credits ($${totalCredits}).`);
        }

        const periodMonth = String(new Date(formData.purchaseDate).getMonth() + 1).padStart(2, '0');
        const accountingPeriod = `${transDateYear}-${periodMonth}`;
        const entryId = `le-purchase-${purchaseId}`;

        const ledgerEntry = {
          id: entryId,
          postingNumber,
          companyId: 'comp-default',
          branchId: 'branch-main',
          fiscalYear: transDateYear,
          accountingPeriod,
          sourceModule: 'PROCUREMENT' as const,
          postingStatus: 'POSTED' as const,
          currency: 'USD',
          exchangeRate: 1,
          baseCurrencyCode: 'USD',
          version: 1,
          narration: `Procured x${numQty} "${chosenProduct.name}" from "${chosenSupplier.name}" (${formData.paymentType} Purchase)`,
          createdFrom: purchaseId,
          approvalStatus: 'APPROVED' as const,
          postingDate: new Date(formData.purchaseDate + 'T12:00:00Z').toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
          lines
        };

        const ledgerEntryRef = doc(db, 'ledgerEntries', entryId);
        transaction.set(ledgerEntryRef, ledgerEntry);

        // Commit sequence counters
        transaction.set(counterRef, currentSequences, { merge: true });

        // Ensure default system accounts exist in COA
        const currentCoaIds = coa.map(c => c.id);
        await ensureSystemAccountsExist(transaction, currentCoaIds);
      });

      // Log financial Audit
      await logFinancialAudit({
        action: editingPurchase ? 'UPDATE_PROCUREMENT' : 'CREATE_PROCUREMENT',
        entityType: 'purchase',
        entityId: purchaseId,
        referenceId: formData.paymentType === 'Cash' ? `cl-${purchaseId}` : null,
        customerId: null,
        supplierId: chosenSupplier.id,
        productId: chosenProduct.id,
        amount: totalCalc,
        paymentType: formData.paymentType,
        previousState: editingPurchase || {},
        newState: finalizedPurchaseData,
        notes: editingPurchase 
          ? `Updated procurement of x${numQty} "${chosenProduct.name}" from "${chosenSupplier.name}"`
          : `Procured x${numQty} "${chosenProduct.name}" from "${chosenSupplier.name}"`,
        userRole: userRole
      });

      // Log system operations
      if (editingPurchase) {
        await logSystemActivity(
          "Purchase Edited",
          `Adjusted procurement ledger entry: x${numQty} units of "${chosenProduct.name}" from "${chosenSupplier.name}" (Subtotal: $${totalCalc.toFixed(2)}, Account: ${formData.paymentType})`
        );
      } else {
        await logSystemActivity(
          "Procurement recorded",
          `Procured x${numQty} units of "${chosenProduct.name}" from "${chosenSupplier.name}" (Subtotal: $${totalCalc.toFixed(2)}, Account: ${formData.paymentType})`
        );
      }

      await logSystemActivity(
        "Stock levels adjusted",
        `Increased current stock level for "${chosenProduct.name}" (SKU: ${chosenProduct.sku}) by +${numQty} units.`
      );

      setFeedback({
        message: editingPurchase 
          ? `Successfully adjusted procurement entry for "${chosenProduct.name}".`
          : `Procurement recorded for x${numQty} units of "${chosenProduct.name}".`,
        type: 'success'
      });
      setIsFormOpen(false);
    } catch (err: any) {
      console.error("Procurement writing abort:", err);
      let errMsg = 'Failed to execute transactional writes.';
      try {
        handleFirestoreError(err, OperationType.WRITE, `purchases/${purchaseId}`);
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }

      // --- RUN TIME SEQUENTIAL DIAGNOSTIC TRACE ---
      const trace: {
        step: string;
        path: string;
        op: string;
        payload: string;
        status: 'PASS' | 'FAIL' | 'PENDING';
        expression?: string;
        reason?: string;
      }[] = [];

      try {
        const productRef = doc(db, 'products', chosenProduct.id);
        const purchaseRef = doc(db, 'purchases', purchaseId);
        const cashLedgerId = `cl-${purchaseId}`;
        const cashLedgerRef = doc(db, 'cashLedger', cashLedgerId);

        // Fetch product data to compute exact stock levels
        const productSnap = await getDoc(productRef);
        const currentProductData = productSnap.exists() ? (productSnap.data() as Product) : null;
        let initialStockForCalc = currentProductData?.currentStock ?? 0;
        if (editingPurchase && editingPurchase.productId === chosenProduct.id) {
          initialStockForCalc = Math.max(0, initialStockForCalc - editingPurchase.quantity);
        }
        const finalProductStock = initialStockForCalc + numQty;

        // Step 1: Product stock level update check
        let step1Pass = false;
        try {
          trace.push({
            step: 'STEP 1',
            path: `products/${chosenProduct.id}`,
            op: 'UPDATE',
            payload: JSON.stringify({ currentStock: finalProductStock }, null, 2),
            status: 'PENDING'
          });

          // Perform individual update
          await updateDoc(productRef, { currentStock: finalProductStock });

          // Succeeded! Instantly rollback to preserve pristine database consistency
          if (currentProductData) {
            await updateDoc(productRef, { currentStock: currentProductData.currentStock ?? 0 });
          }

          trace[trace.length - 1].status = 'PASS';
          step1Pass = true;
        } catch (step1Err: any) {
          console.error("Step 1 Probe Error:", step1Err);
          trace[trace.length - 1].status = 'FAIL';
          trace[trace.length - 1].expression = 'isValidProduct(request.resource.data) && (hasRole("admin") || hasRole("accountant") || (hasRole("cashier") && affectedKeys().hasOnly(["currentStock"])))';
          trace[trace.length - 1].reason = step1Err.message || 'Permission denied on update';
        }

        // Step 2: Purchase entry creation check
        let step2Pass = false;
        if (step1Pass) {
          try {
            trace.push({
              step: 'STEP 2',
              path: `purchases/${purchaseId}`,
              op: 'CREATE',
              payload: JSON.stringify(finalizedPurchaseData, null, 2),
              status: 'PENDING'
            });

            // Perform individual write
            await setDoc(purchaseRef, finalizedPurchaseData);

            // Succeeded! Clean up immediately
            await deleteDoc(purchaseRef);

            trace[trace.length - 1].status = 'PASS';
            step2Pass = true;
          } catch (step2Err: any) {
            console.error("Step 2 Probe Error:", step2Err);
            trace[trace.length - 1].status = 'FAIL';
            trace[trace.length - 1].expression = 'isValidPurchase(request.resource.data) && (hasRole("admin") || hasRole("accountant"))';
            trace[trace.length - 1].reason = step2Err.message || 'Permission denied on create';
          }
        }

        // Step 3: Cash Accounting ledger entry creation check
        if (step1Pass && step2Pass && formData.paymentType === 'Cash') {
          const cashLedgerPayload = {
            id: cashLedgerId,
            type: 'outflow',
            source: 'purchase',
            amount: totalCalc,
            referenceId: purchaseId,
            description: `Procured x${numQty} "${chosenProduct.name}" from "${chosenSupplier.name}"`,
            timestamp: new Date(formData.purchaseDate).toISOString()
          };

          try {
            trace.push({
              step: 'STEP 3',
              path: `cashLedger/${cashLedgerId}`,
              op: 'CREATE',
              payload: JSON.stringify(cashLedgerPayload, null, 2),
              status: 'PENDING'
            });

            // Perform individual write
            await setDoc(cashLedgerRef, cashLedgerPayload);

            // Succeeded! Clean up immediately
            await deleteDoc(cashLedgerRef);

            trace[trace.length - 1].status = 'PASS';
          } catch (step3Err: any) {
            console.error("Step 3 Probe Error:", step3Err);
            trace[trace.length - 1].status = 'FAIL';
            trace[trace.length - 1].expression = 'isValidCashLedgerEntry(request.resource.data) && (hasRole("admin") || hasRole("accountant") || hasRole("cashier"))';
            trace[trace.length - 1].reason = step3Err.message || 'Permission denied on create';
          }
        }

      } catch (probeErr: any) {
        console.error("Diagnostic execution failed:", probeErr);
      }

      setDiagnosticTrace(trace);
      setFeedback({ message: `Transaction failed: ${errMsg}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Transaction Voiding securely via Transactions (instead of deletions) ---
  const voidTransaction = async (purchaseId: string) => {
    console.log("VOID triggered", purchaseId);
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) {
      console.error("Purchase not found for voiding:", purchaseId);
      return;
    }
    setVoidConfirmationPurchase(purchase);
  };

  const handleVoidPurchase = async (purchase: Purchase) => {
    console.log("handleVoidPurchase direct invocation for:", purchase.id);
    setFeedback(null);
    try {
      if (!auth.currentUser) {
        // Local Voiding Fallback
        const savedPurchases = localStorage.getItem('inventory_purchases') || '[]';
        let purchasesList: Purchase[] = JSON.parse(savedPurchases);

        const savedProducts = localStorage.getItem('inventory_products') || '[]';
        let productsList: Product[] = JSON.parse(savedProducts);

        const savedSuppliers = localStorage.getItem('inventory_suppliers') || '[]';
        let suppliersList: Supplier[] = JSON.parse(savedSuppliers);

        productsList = productsList.map(p => {
          if (p.id === purchase.productId) {
            return { ...p, currentStock: Math.max(0, (p.currentStock ?? 0) - purchase.quantity) };
          }
          return p;
        });

        if (purchase.paymentType === 'Credit') {
          suppliersList = suppliersList.map(s => {
            if (s.id === purchase.supplierId) {
              return { ...s, dueBalance: Math.max(0, (s.dueBalance ?? 0) - purchase.totalAmount) };
            }
            return s;
          });
        }

        purchasesList = purchasesList.map(p => p.id === purchase.id ? { ...p, status: 'VOID' } : p);

        if (purchase.paymentType === 'Cash') {
          const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
          let ledgerList = JSON.parse(savedLedger);
          ledgerList = ledgerList.map((l: any) => l.id === `cl-${purchase.id}` ? { ...l, status: 'VOID' } : l);
          localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));
        }

        localStorage.setItem('inventory_purchases', JSON.stringify(purchasesList));
        localStorage.setItem('inventory_products', JSON.stringify(productsList));
        localStorage.setItem('inventory_suppliers', JSON.stringify(suppliersList));

        setPurchases(purchasesList);
        setProducts(productsList);
        setSuppliers(suppliersList);

        setFeedback({
          message: `Procurement log for "${purchase.productName}" has been successfully VOIDED locally.`,
          type: 'success'
        });
        return;
      }

      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'products', purchase.productId);
        const supplierRef = doc(db, 'suppliers', purchase.supplierId);

        // -- 1. Gather all READS first --
        const productSnap = await transaction.get(productRef);
        let supplierSnap = null;
        if (purchase.paymentType === 'Credit') {
          supplierSnap = await transaction.get(supplierRef);
        }

        // Single Sequence Counter Read for atomic sequence generation
        const counterRef = doc(db, 'counters', 'posting_sequences');
        const counterSnap = await transaction.get(counterRef);
        
        let currentSequences = { JV: 0, RV: 0, PV: 0, SV: 0, CV: 0 };
        if (counterSnap.exists()) {
          currentSequences = { ...currentSequences, ...counterSnap.data() };
        }

        const purchaseDate = purchase.purchaseDate || new Date().toISOString().split('T')[0];
        const purchaseYear = new Date(purchaseDate).getFullYear() || 2026;
        const jvNextVal = (currentSequences['JV'] || 0) + 1;
        const jvPostingNumber = `JV-${purchaseYear}-${String(jvNextVal).padStart(6, '0')}`;
        currentSequences['JV'] = jvNextVal;

        // -- 2. Perform WRITES --
        if (productSnap.exists()) {
          const productData = productSnap.data() as Product;
          transaction.update(productRef, {
            currentStock: Math.max(0, (productData.currentStock ?? 0) - purchase.quantity)
          });
        }

        if (purchase.paymentType === 'Credit' && supplierSnap && supplierSnap.exists()) {
          const supplierData = supplierSnap.data() as Supplier;
          transaction.update(supplierRef, {
            dueBalance: Math.max(0, (supplierData.dueBalance ?? 0) - purchase.totalAmount)
          });
        }

        const purchaseRef = doc(db, 'purchases', purchase.id);
        transaction.update(purchaseRef, { status: 'VOID' });

        if (purchase.paymentType === 'Cash') {
          const cashLedgerRef = doc(db, 'cashLedger', `cl-${purchase.id}`);
          transaction.update(cashLedgerRef, { status: 'VOID' });
        }

        // --- REVERSAL LEDGER POSTING ---
        const invAcc = resolveSystemAccount('INVENTORY', coa);
        const contraAcc = purchase.paymentType === 'Cash' 
          ? resolveSystemAccount('CASH', coa) 
          : resolveSystemAccount('ACCOUNTS_PAYABLE', coa);

        const revLines = [
          // Debit: Cash (1100) or Accounts Payable (2100) is debited to reverse credit
          {
            accountId: contraAcc.id,
            accountCode: contraAcc.code,
            accountName: contraAcc.name,
            debit: purchase.totalAmount,
            credit: 0,
            baseCurrencyDebit: purchase.totalAmount,
            baseCurrencyCredit: 0
          },
          // Credit: Inventory Asset (1300) is credited to reverse stock addition
          {
            accountId: invAcc.id,
            accountCode: invAcc.code,
            accountName: invAcc.name,
            debit: 0,
            credit: purchase.totalAmount,
            baseCurrencyDebit: 0,
            baseCurrencyCredit: purchase.totalAmount
          }
        ];

        const periodMonth = String(new Date(purchaseDate).getMonth() + 1).padStart(2, '0');
        const accountingPeriod = `${purchaseYear}-${periodMonth}`;
        const revEntryId = `le-purchase-void-${purchase.id}`;

        const reversalLedgerEntry = {
          id: revEntryId,
          postingNumber: jvPostingNumber,
          companyId: 'comp-default',
          branchId: 'branch-main',
          fiscalYear: purchaseYear,
          accountingPeriod,
          sourceModule: 'PROCUREMENT' as const,
          postingStatus: 'REVERSED' as const,
          currency: 'USD',
          exchangeRate: 1,
          baseCurrencyCode: 'USD',
          version: 1,
          narration: `Reversal of Procurement Entry due to Void - Original: ${purchase.id}`,
          createdFrom: purchase.id,
          approvalStatus: 'APPROVED' as const,
          postingDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
          lines: revLines,
          originalEntryId: `le-purchase-${purchase.id}`
        };

        const revLedgerRef = doc(db, 'ledgerEntries', revEntryId);
        transaction.set(revLedgerRef, reversalLedgerEntry);

        // Commit sequence counters
        transaction.set(counterRef, currentSequences, { merge: true });
      });

      // Log financial Audit
      await logFinancialAudit({
        action: 'VOID_PROCUREMENT',
        entityType: 'purchase',
        entityId: purchase.id,
        referenceId: purchase.paymentType === 'Cash' ? `cl-${purchase.id}` : null,
        customerId: null,
        supplierId: purchase.supplierId,
        productId: purchase.productId,
        amount: purchase.totalAmount,
        paymentType: purchase.paymentType,
        previousState: purchase,
        newState: { ...purchase, status: 'VOID' },
        notes: `Voided procurement ID: ${purchase.id}`,
        userRole: userRole
      });

      // Log system/void activity
      await logSystemActivity(
        "Procurement Voided",
        `Permanently marked purchase record ID: ${purchase.id} as VOID. Restored associated stock levels and supplier liabilities.`
      );

      setFeedback({
        message: `Procurement log for "${purchase.productName}" has been successfully VOIDED. Stocks and supplier due credits are reversed securely.`,
        type: 'success'
      });
    } catch (err: any) {
      console.error("Void operations abort:", err);
      let errMsg = 'Failed to void the transaction record.';
      try {
        handleFirestoreError(err, OperationType.UPDATE, `purchases/${purchase.id}`);
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }
      setFeedback({ message: `Access Abort: ${errMsg}`, type: 'error' });
    }
  };

  // --- Calculate Procurement Intelligence parameters ---
  const activePurchases = purchases.filter(p => !isVoidStatus(p.status));
  const totalPurchasesVolume = activePurchases.reduce((sum, p) => sum + p.totalAmount, 0);
  const totalUnitsProcured = activePurchases.reduce((sum, p) => sum + p.quantity, 0);
  const totalCreditDueOutstanding = suppliers.filter(s => !isInactiveStatus(s.status)).reduce((sum, s) => sum + (s.dueBalance ?? 0), 0);

  // --- Listing Filters ---
  const filteredPurchases = purchases.filter((item) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      (item.supplierName || '').toLowerCase().includes(query) ||
      (item.productName || '').toLowerCase().includes(query) ||
      (item.paymentType || '').toLowerCase().includes(query) ||
      (item.id || '').toLowerCase().includes(query);

    const matchesType = paymentFilter === 'All' || item.paymentType === paymentFilter;
    return matchesSearch && matchesType;
  });

  const selectedProductDetails = products.find(p => p.id === formData.productId);

  return (
    <div id="procurement-management-system" className="space-y-8 animate-fade-in font-sans pb-12">
      
      {/* POPUP ALERT BANNER */}
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
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <p>{feedback.message}</p>
            <button 
              type="button"
              className="ml-2 font-black opacity-60 hover:opacity-100 cursor-pointer text-slate-500"
              onClick={() => setFeedback(null)}
            >
              &times;
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* METRIC BENTO CARDS */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {/* Total Cost Outlaid */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Gross Procurement Budget</span>
              <DollarSign className="h-4 w-4 text-indigo-505 text-indigo-600" />
            </div>
            {loading ? (
              <div className="h-9 w-28 bg-slate-100 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
                ${totalPurchasesVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="font-medium">Direct expense outlays</span>
            {loading ? (
              <div className="h-4 w-12 bg-slate-100 rounded animate-pulse"></div>
            ) : (
              <span className="text-indigo-600 font-bold">{purchases.length} supplier orders completed</span>
            )}
          </div>
        </div>

        {/* Total Received stock */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Total Units Procured</span>
              <Box className="h-4 w-4 text-emerald-500" />
            </div>
            {loading ? (
              <div className="h-9 w-20 bg-slate-100 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
                {totalUnitsProcured.toLocaleString()} Units
              </p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Seeded warehouse inputs</span>
            {loading ? (
              <div className="h-4 w-16 bg-slate-100 rounded animate-pulse"></div>
            ) : (
              <span className="text-emerald-600 font-semibold font-mono">+{totalUnitsProcured > 0 ? Math.round((filteredPurchases.reduce((sum, p) => sum + p.quantity, 0) / totalUnitsProcured) * 100) : 0}% active view</span>
            )}
          </div>
        </div>

        {/* Total Credit Accounts Due */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Outstanding Account Payables</span>
              <Truck className="h-4 w-4 text-amber-500" />
            </div>
            {loading ? (
              <div className="h-9 w-24 bg-slate-100 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
                ${totalCreditDueOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Supplier ledger debits</span>
            {loading ? (
              <div className="h-4 w-16 bg-slate-100 rounded animate-pulse"></div>
            ) : (
              <span className="text-amber-500 font-extrabold font-mono">
                {suppliers.filter(s => (s.dueBalance ?? 0) > 0).length} Outstanding Bills
              </span>
            )}
          </div>
        </div>
      </div>

      {/* FILTER CONTROL RAILS */}
      <div className="bg-white border border-slate-200 rounded-[2rem] p-4 shadow-3xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:max-w-md shrink-0">
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Search by supplier, item description, payments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs font-semibold border border-slate-200 rounded-2xl py-3.5 pl-11 pr-4 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-550 focus:ring-1 focus:ring-indigo-500 transition duration-150 h-11"
          />
        </div>

        {/* Tab filters and Action Button stacked on mobile, row on tablet/desktop */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto font-sans">
          
          <div className="w-full sm:flex-1 md:w-auto flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/60 shrink-0 h-11">
            {(['All', 'Cash', 'Credit'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setPaymentFilter(filter)}
                className={`flex-1 md:flex-initial text-center px-4 py-2 text-xs md:text-[10px] md:px-3 md:py-1.5 font-extrabold rounded-lg uppercase tracking-widest transition cursor-pointer whitespace-nowrap min-h-[36px] flex items-center justify-center ${
                  paymentFilter === filter 
                    ? 'bg-white text-indigo-650 text-indigo-600 shadow-2xs border border-slate-200/40' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {permissions.createProcurement && (
            <button
              type="button"
              onClick={() => openForm()}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-3 md:py-2.5 text-xs font-bold transition shadow-xs hover:shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Enter Purchase Order</span>
            </button>
          )}
        </div>
      </div>

      {/* PURCHASE HISTORY TABLE */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-3xs overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Procurement Registry Logs</h3>
            <p className="text-[10px] text-slate-400 uppercase mt-0.5 font-semibold font-mono tracking-wider">Purchase History & Ledger reconciliations</p>
          </div>
          <span className="text-[11px] py-1 px-3 bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold rounded-full font-mono uppercase">
            Showing {filteredPurchases.length} Items
          </span>
        </div>

        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
          {loading ? (
            <div className="space-y-4 p-5 animate-pulse">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                  <div className="space-y-2 flex-grow">
                    <div className="h-4 bg-slate-100 rounded-md w-1/3"></div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                      <div className="h-3.5 bg-[#f1f5f9] rounded-md w-1/2"></div>
                      <div className="h-3.5 bg-[#f1f5f9] rounded-md w-2/3"></div>
                      <div className="h-3.5 bg-[#f1f5f9] rounded-md w-1/2"></div>
                      <div className="h-3.5 bg-[#f1f5f9] rounded-md w-1/3"></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto opacity-40">
                    <div className="h-5 bg-slate-100 rounded-md w-20"></div>
                    <div className="w-8 h-8 bg-slate-50 rounded-lg"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPurchases.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 12 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.3 }}
              className="mx-auto max-w-md w-full my-8 text-center flex flex-col items-center gap-4.5"
            >
              <div className="relative group">
                <div className="absolute inset-0 bg-indigo-200/20 rounded-full blur-xl group-hover:scale-125 transition duration-300"></div>
                <div className="relative w-16 h-16 bg-white border border-slate-100 rounded-2xl shadow-3xs flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-all duration-300">
                  <Box className="h-8 w-8 text-slate-400 transition-transform duration-300 group-hover:scale-110" />
                </div>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest leading-none">
                  {purchases.length === 0 ? 'No Procurement Logs' : 'No Procurements Found'}
                </h4>
                <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed font-semibold">
                  {purchases.length === 0 
                    ? 'Log company product purchases from designated suppliers to automatically restock inventories and maintain trade accounts.'
                    : searchQuery || paymentFilter !== 'All'
                      ? "No records matched your actively specified searching terms or settlement choices."
                      : 'No procurement transactions detected. Empty your filters or record a new buy.'}
                </p>
              </div>
              <div className="flex gap-2.5 pt-1.5 flex-wrap justify-center">
                {purchases.length > 0 && (searchQuery || paymentFilter !== 'All') ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setPaymentFilter('All');
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
                    <span>Record New Procurement</span>
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse table-auto">
                <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                  <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <th className="py-3 px-3 sm:py-4 sm:px-8 min-w-[100px] md:min-w-[120px] whitespace-nowrap">Date</th>
                    <th className="py-3 px-4 sm:py-4 sm:px-5 min-w-[110px] md:min-w-[150px] whitespace-nowrap">Procurement Reference</th>
                    <th className="py-3 px-4 sm:py-4 sm:px-5 min-w-[130px] md:min-w-[165px] whitespace-nowrap">Supplier Channel</th>
                    <th className="py-3 px-4 sm:py-4 sm:px-5 min-w-[140px] md:min-w-[190px] whitespace-nowrap">Product Unit</th>
                    <th className="py-3 px-4 sm:py-4 sm:px-5 text-center min-w-[80px] md:min-w-[100px] whitespace-nowrap">Unit Cost</th>
                    <th className="py-3 px-4 sm:py-4 sm:px-5 text-center min-w-[70px] md:min-w-[120px] whitespace-nowrap">Purchased Qty</th>
                    <th className="py-3 px-4 sm:py-4 sm:px-5 text-right min-w-[110px] md:min-w-[130px] whitespace-nowrap">Debit Total</th>
                    <th className="py-3 px-3 sm:py-4 sm:px-8 text-center min-w-[70px] md:min-w-[100px] shrink-0 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredPurchases.map((purchase) => (
                    <tr 
                      key={purchase.id} 
                      className={`hover:bg-indigo-50/20 even:bg-slate-50/30 transition duration-150 group ${
                        isVoidStatus(purchase.status) 
                          ? 'opacity-40 bg-slate-50/50 line-through text-slate-400' 
                          : ''
                      }`}
                    >
                       <td className="py-3 px-3 sm:py-4 sm:px-8 font-mono text-slate-500 font-bold whitespace-nowrap">
                        {new Date(purchase.purchaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-3 px-4 sm:py-4 sm:px-5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-indigo-600 font-bold uppercase">
                          <span>{purchase.id.substring(0, 15)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 sm:py-4 sm:px-5 font-bold text-slate-900 whitespace-nowrap">
                        {purchase.supplierName}
                      </td>
                      <td className="py-3 px-4 sm:py-4 sm:px-5 whitespace-nowrap">
                        <div className="font-bold text-slate-800">{purchase.productName}</div>
                        <div className="font-mono text-[9px] text-slate-450 uppercase mt-0.5">Product ID: {purchase.productId.substring(0, 8)}</div>
                      </td>
                      <td className="py-3 px-4 sm:py-4 sm:px-5 text-center font-bold text-slate-800 font-mono whitespace-nowrap">
                        ${purchase.purchasePrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 sm:py-4 sm:px-5 text-center font-bold text-slate-900 font-mono whitespace-nowrap">
                        x{purchase.quantity}
                      </td>
                      <td className="py-3 px-4 sm:py-4 sm:px-5 text-right whitespace-nowrap">
                        <span className="text-slate-900 font-black font-mono font-sans block text-sm">${purchase.totalAmount.toFixed(2)}</span>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border uppercase tracking-wider mt-1.5 ${
                          purchase.paymentType === 'Cash' 
                            ? 'bg-emerald-50 border-emerald-250/60 text-emerald-700 shadow-3xs' 
                            : 'bg-blue-50 border-blue-200 text-blue-700 shadow-3xs'
                        }`}>
                          {purchase.paymentType === 'Cash' ? 'Paid / Cash' : 'Credit / Terms'}
                        </span>
                      </td>
                      <td className="py-3 px-3 sm:py-4 sm:px-8 text-center whitespace-nowrap">
                        {isVoidStatus(purchase.status) ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 shadow-3xs animate-fade-in">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                            Void
                          </span>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            {permissions.voidProcurement && (
                              <button
                                type="button"
                                onClick={() => voidTransaction(purchase.id)}
                                title="Void procurement log and reverse parameters"
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* COMPACT ENTRY MODAL DIALOG */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Modal Overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFormOpen(false)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm"
            />

            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative w-full max-w-xl rounded-[2.5rem] bg-white border border-slate-200/80 p-8 shadow-2xl space-y-6 overflow-hidden"
              >
                {/* Header title */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-950 uppercase tracking-widest">
                      {editingPurchase ? 'Modify Procurement Entry' : 'Log New Procurement Order'}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-bold font-mono uppercase tracking-wider">
                      {editingPurchase ? `ID: ${editingPurchase.id}` : 'Syncs stock levels & supplier credit balances'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Form fields */}
                <form onSubmit={handleSavePurchase} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Supplier Field */}
                    <div className="relative w-full">
                      <select
                        id="form-procurement-supplier-field"
                        disabled={isSaving}
                        value={formData.supplierId}
                        onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                        className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 bg-white appearance-none cursor-pointer disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                          errors.supplierId 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455 focus:ring-rose-450' 
                            : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                        }`}
                      >
                        <option value="">-- Choose Supplier --</option>
                        {suppliers.filter(s => !isInactiveStatus(s.status)).map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.category || 'Trading Channel'})
                          </option>
                        ))}
                      </select>
                      <label htmlFor="form-procurement-supplier-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                        Target Supplier <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                      {errors.supplierId && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                          <span>{errors.supplierId}</span>
                        </div>
                      )}
                    </div>

                    {/* Product Selection */}
                    <div className="relative w-full">
                      <select
                        id="form-procurement-product-field"
                        disabled={isSaving}
                        value={formData.productId}
                        onChange={(e) => handleProductSelect(e.target.value)}
                        className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 bg-white appearance-none cursor-pointer disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                          errors.productId 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455 focus:ring-rose-450' 
                            : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                        }`}
                      >
                        <option value="">-- Choose Product --</option>
                        {products.filter(p => !isInactiveStatus(p.status)).map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Stock: {p.currentStock})
                          </option>
                        ))}
                      </select>
                      <label htmlFor="form-procurement-product-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                        Inventory Product <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                      {errors.productId && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                          <span>{errors.productId}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Unit Purchase Price */}
                    <div className="relative w-full">
                      <span className="absolute left-3.5 top-[18px] text-slate-400 text-xs font-bold leading-none">$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        id="form-procurement-price-field"
                        disabled={isSaving}
                        value={formData.purchasePrice}
                        onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                        placeholder=" "
                        className={`peer w-full rounded-xl border pl-7 pr-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                          errors.purchasePrice 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455 focus:ring-rose-450' 
                            : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                        }`}
                      />
                      <label htmlFor="form-procurement-price-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-placeholder-shown:left-7 peer-focus:top-1.5 peer-focus:left-3.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                        Unit Cost ($) <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                      {errors.purchasePrice && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                          <span>{errors.purchasePrice}</span>
                        </div>
                      )}
                    </div>

                    {/* Quantity Procured */}
                    <div className="relative w-full">
                      <input
                        type="number"
                        min="1"
                        required
                        id="form-procurement-qty-field"
                        disabled={isSaving}
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        placeholder=" "
                        className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                          errors.quantity 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455 focus:ring-rose-450' 
                            : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                        }`}
                      />
                      <label htmlFor="form-procurement-qty-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                        Quantity Purchased <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                      {errors.quantity && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                          <span>{errors.quantity}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Payment Account Type */}
                    <div className="relative w-full">
                      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 h-[52.2px] items-center">
                        {(['Cash', 'Credit'] as const).map((method) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, paymentType: method });
                              setErrors(prev => {
                                const copy = { ...prev };
                                delete copy.paymentType;
                                return copy;
                              });
                            }}
                            className={`flex-1 text-center py-2 text-xs font-extrabold rounded-lg uppercase tracking-wider transition cursor-pointer ${
                              formData.paymentType === method 
                                ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200/40' 
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {method}
                          </button>
                        ))}
                      </div>
                      <span className="absolute -top-2.5 left-3 px-1.5 bg-white text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                        Supplier Terms <span className="text-rose-500 font-extrabold">*</span>
                      </span>
                      {errors.paymentType && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                          <span>{errors.paymentType}</span>
                        </div>
                      )}
                    </div>

                    {/* Purchase date */}
                    <div className="relative w-full">
                      <input 
                        type="date"
                        required
                        id="form-procurement-date-field"
                        disabled={isSaving}
                        value={formData.purchaseDate}
                        onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                        className="peer w-full rounded-xl border border-slate-200 bg-white px-3.5 pt-5 pb-1.5 text-xs font-semibold text-slate-850 focus:border-indigo-605 focus:ring-1 focus:ring-indigo-605 focus:outline-none transition duration-150 cursor-pointer h-[52px]"
                      />
                      <label htmlFor="form-procurement-date-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                        Date Settled <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                    </div>
                  </div>

                  {/* dynamic total preview */}
                  {formData.productId && formData.supplierId && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2 mt-4 shadow-3xs"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-bold uppercase tracking-wider">Item details:</span>
                        <span className="font-extrabold text-slate-700">
                          {selectedProductDetails?.name || 'Item'} (x{parseInt(formData.quantity) || 1})
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-bold uppercase tracking-wider">Purchase margin:</span>
                        <span className="font-extrabold text-slate-500">
                          Retail selling is ${selectedProductDetails?.sellingPrice.toFixed(2) || '0.00'}
                        </span>
                      </div>
                      <div className="border-t border-slate-200/60 my-2 pt-2 flex justify-between items-center">
                        <span className="text-xs font-black text-slate-900 uppercase tracking-wider">Gross debit sum:</span>
                        <span className="text-sm font-black text-indigo-600 font-mono">
                          ${((parseInt(formData.quantity) || 1) * (parseFloat(formData.purchasePrice) || 0)).toFixed(2)}
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {/* DIAGNOSTIC RUNTIME TRACE PANEL */}
                  {diagnosticTrace && (
                    <div id="diagnostic-trace-panel" className="bg-slate-950 text-slate-100 rounded-2xl p-5 font-mono text-[11px] space-y-4 border border-slate-800 shadow-xl animate-fade-in">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <span className="font-extrabold uppercase tracking-widest text-[10px] text-rose-500 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                          Runtime Write Transaction Failure Trace
                        </span>
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                          ABAC Gatekeeper Audit
                        </span>
                      </div>
                      
                      <div className="space-y-3.5 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                        {diagnosticTrace.map((op, idx) => (
                          <div key={idx} className="border-b border-slate-900 pb-3 last:border-b-0 last:pb-0">
                            <div className="flex items-center justify-between font-bold mb-1.5">
                              <span className="text-slate-300 font-black">{op.step}</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-black ${
                                op.status === 'PASS' 
                                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900' 
                                  : op.status === 'FAIL' 
                                    ? 'bg-rose-950/80 text-rose-400 border border-rose-900' 
                                    : 'bg-amber-950/80 text-amber-400 border border-amber-900'
                              }`}>
                                {op.status}
                              </span>
                            </div>
                            
                            <div className="space-y-1 text-[11px] text-slate-400 leading-relaxed">
                              <div>
                                <span className="text-slate-500 font-bold">Path:</span> <span className="text-indigo-400 font-semibold">{op.path}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 font-bold">Operation:</span> <span className="text-sky-400 font-semibold">{op.op}</span>
                              </div>
                              <div className="bg-slate-905/80 rounded p-1.5 mt-1 overflow-x-auto text-[10px] border border-slate-900 font-mono text-slate-300">
                                <span className="text-slate-500 font-bold block mb-0.5">Payload:</span>
                                <code>{op.payload}</code>
                              </div>
                              {op.status === 'FAIL' && (
                                <>
                                  <div className="mt-2 text-rose-400 font-semibold">
                                    <span className="text-rose-500 font-black block mb-0.5">Rule Checked Expression:</span>
                                    <span className="font-mono bg-rose-950/30 px-1 py-0.5 rounded border border-rose-900/40 text-[10px] break-all block">{op.expression}</span>
                                  </div>
                                  <div className="mt-2 text-slate-400 font-bold">
                                    <span className="text-slate-500 block mb-0.5">Root Cause Reason:</span>
                                    <span className="font-normal text-rose-300 block bg-slate-900/50 p-1 rounded border border-slate-800">{op.reason}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Submission and Cancel controls */}
                  <div className="flex items-center justify-end gap-3 pt-5 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => setIsFormOpen(false)}
                      className="cursor-pointer border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 py-2.5 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-60"
                    >
                      {isSaving && <RefreshCw className="w-3 h-3 animate-spin" />}
                      <span>{editingPurchase ? 'Update Order' : 'Commit Order'}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {voidConfirmationPurchase && (
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
                    Confirm Void Procurement Log
                  </h3>
                  <p className="text-xs text-slate-550 leading-relaxed">
                    Are you sure you want to VOID this procurement log? This will permanently mark it as VOID, rollback stock, reverse liabilities, and flag the ledger record. This action is irreversible.
                  </p>
                  <div className="text-[10px] font-mono text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                    <div><span className="font-bold">Purchase ID:</span> {voidConfirmationPurchase.id}</div>
                    <div><span className="font-bold">Product Name:</span> {voidConfirmationPurchase.productName} (x{voidConfirmationPurchase.quantity})</div>
                    <div><span className="font-bold">Log Date:</span> {new Date(voidConfirmationPurchase.purchaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                    <div><span className="font-bold">Grand Total:</span> ${voidConfirmationPurchase.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setVoidConfirmationPurchase(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const purchaseToVoid = voidConfirmationPurchase;
                    setVoidConfirmationPurchase(null);
                    await handleVoidPurchase(purchaseToVoid);
                  }}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition cursor-pointer shadow-xs"
                >
                  Yes, Void Procurement
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
