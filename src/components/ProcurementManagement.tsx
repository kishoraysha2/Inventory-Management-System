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
import { collection, onSnapshot, doc, runTransaction, setDoc, deleteDoc } from 'firebase/firestore';
import { Purchase, Supplier, Product } from '../types';

export default function ProcurementManagement({ userRole = 'admin' }: { userRole?: 'admin' | 'accountant' | 'cashier' | 'viewer' }) {
  // --- States ---
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // --- Search & Filter States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'All' | 'Cash' | 'Credit'>('All');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
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
        productList.push(docSnap.data() as Product);
      });
      setProducts(productList);
    }, (error) => {
      console.error('Error syncing products:', error);
    });

    return () => {
      unsubPurchases();
      unsubSuppliers();
      unsubProducts();
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

        // --- 3. Perform calculations & validation codes, then write ---

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
          transaction.delete(cashLedgerRef);
        }
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
      });

      // Log financial Audit
      await logFinancialAudit(
        'VOID',
        purchase.id,
        purchase,
        { ...purchase, status: 'VOID' },
        {
          cash: purchase.paymentType === 'Cash' ? -purchase.totalAmount : 0,
          stock: -purchase.quantity,
          due: purchase.paymentType === 'Credit' ? -purchase.totalAmount : 0
        }
      );

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
  const activePurchases = purchases.filter(p => p.status !== 'voided' && p.status !== 'VOID');
  const totalPurchasesVolume = activePurchases.reduce((sum, p) => sum + p.totalAmount, 0);
  const totalUnitsProcured = activePurchases.reduce((sum, p) => sum + p.quantity, 0);
  const totalCreditDueOutstanding = suppliers.reduce((sum, s) => sum + (s.dueBalance ?? 0), 0);

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

          {(userRole === 'admin' || userRole === 'accountant') && (
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
                        purchase.status === 'voided' || purchase.status === 'VOID' 
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
                        {purchase.status === 'voided' || purchase.status === 'VOID' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 shadow-3xs animate-fade-in">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                            Void
                          </span>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            {userRole === 'admin' && (
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
                        {suppliers.filter(s => s.status !== 'inactive').map(s => (
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
                        {products.filter(p => p.status !== 'inactive').map(p => (
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
                            onClick={() => setFormData({ ...formData, paymentType: method })}
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
