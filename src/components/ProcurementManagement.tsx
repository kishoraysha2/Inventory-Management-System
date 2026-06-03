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
import { db, OperationType, handleFirestoreError, logSystemActivity } from '../lib/firebase';
import { collection, onSnapshot, doc, runTransaction, setDoc, deleteDoc } from 'firebase/firestore';
import { Purchase, Supplier, Product } from '../types';

export default function ProcurementManagement() {
  // --- States ---
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // --- Search & Filter States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'All' | 'Cash' | 'Credit'>('All');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
    // 1. Sync Purchases
    const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snapshot) => {
      const purchaseList: Purchase[] = [];
      snapshot.forEach((docSnap) => {
        purchaseList.push(docSnap.data() as Purchase);
      });
      const sorted = purchaseList.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
      setPurchases(sorted);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'purchases');
      } catch (err: any) {
        setFeedback({ message: `Purchases read error: ${err.message}`, type: 'error' });
      }
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

  // --- Deletion & Rolling Back of Stock/Accounts securely via Transactions ---
  const handleDeletePurchase = async (purchase: Purchase) => {
    if (!window.confirm(`Are you sure you want to delete this procurement log of "${purchase.productName}"? This will rollback Supplier and Product parameters.`)) {
      return;
    }

    setFeedback(null);
    try {
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
        transaction.delete(purchaseRef);
      });

      // Log deletions
      await logSystemActivity(
        "Procurement Purged",
        `Deleted purchase record ID: ${purchase.id}. Restored associated stock level and account balances.`
      );

      setFeedback({
        message: `Procurement log for "${purchase.productName}" has been successfully deleted with active stock rollback applied.`,
        type: 'success'
      });
    } catch (err: any) {
      console.error("Purge operations abort:", err);
      let errMsg = 'Failed to clear the transaction record.';
      try {
        handleFirestoreError(err, OperationType.DELETE, `purchases/${purchase.id}`);
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }
      setFeedback({ message: `Access Abort: ${errMsg}`, type: 'error' });
    }
  };

  // --- Calculate Procurement Intelligence parameters ---
  const totalPurchasesVolume = purchases.reduce((sum, p) => sum + p.totalAmount, 0);
  const totalUnitsProcured = purchases.reduce((sum, p) => sum + p.quantity, 0);
  const totalCreditDueOutstanding = suppliers.reduce((sum, s) => sum + (s.dueBalance ?? 0), 0);

  // --- Listing Filters ---
  const filteredPurchases = purchases.filter((item) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      item.supplierName.toLowerCase().includes(query) ||
      item.productName.toLowerCase().includes(query) ||
      item.paymentType.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query);

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
            <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
              ${totalPurchasesVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="font-medium">Direct expense outlays</span>
            <span className="text-indigo-600 font-bold">{purchases.length} supplier orders completed</span>
          </div>
        </div>

        {/* Total Received stock */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Total Units Procured</span>
              <Box className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
              {totalUnitsProcured.toLocaleString()} Units
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Seeded warehouse inputs</span>
            <span className="text-emerald-600 font-semibold font-mono">+{totalUnitsProcured > 0 ? Math.round((filteredPurchases.reduce((sum, p) => sum + p.quantity, 0) / totalUnitsProcured) * 100) : 0}% active view</span>
          </div>
        </div>

        {/* Total Credit Accounts Due */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Outstanding Account Payables</span>
              <Truck className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
              ${totalCreditDueOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Supplier ledger debits</span>
            <span className="text-amber-500 font-extrabold font-mono">
              {suppliers.filter(s => (s.dueBalance ?? 0) > 0).length} Outstanding Bills
            </span>
          </div>
        </div>
      </div>

      {/* FILTER CONTROL RAILS */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-[2rem] p-4 shadow-3xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Search by supplier, item description, payments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs font-medium border border-slate-200 rounded-2xl py-3 pl-11 pr-4 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-550 focus:ring-1 focus:ring-indigo-500 transition duration-150"
          />
        </div>

        {/* Tab filters and Creation button */}
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60 shrink-0">
            {(['All', 'Cash', 'Credit'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setPaymentFilter(filter)}
                className={`px-3 py-1.5 text-[10px] font-extrabold rounded-lg uppercase tracking-widest transition cursor-pointer ${
                  paymentFilter === filter 
                    ? 'bg-white text-indigo-650 text-indigo-600 shadow-2xs border border-slate-200/40' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openForm()}
            className="inline-flex items-center gap-1.5 cursor-pointer bg-indigo-650 bg-indigo-600 hover:bg-indigo-705 hover:bg-indigo-700 text-white rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-xs hover:shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Enter Purchase Order</span>
          </button>
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

        <div className="overflow-x-auto">
          {filteredPurchases.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400 shadow-3xs">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">No matching procurement records</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {searchQuery ? 'Adjust your text search or toggle filter options.' : 'Record your first company-supplier procurement order to activate stocks.'}
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse table-auto">
              <thead>
                <tr className="bg-slate-500/5 border-b border-slate-100 text-slate-450 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <th className="py-4.5 px-6 sm:px-8">Date</th>
                  <th className="py-4.5 px-5">Procurement Reference</th>
                  <th className="py-4.5 px-5">Supplier Channel</th>
                  <th className="py-4.5 px-5">Product Unit</th>
                  <th className="py-4.5 px-5 text-center">Unit Cost</th>
                  <th className="py-4.5 px-5 text-center">Purchased Quantity</th>
                  <th className="py-4.5 px-5 text-right">Debit Total</th>
                  <th className="py-4.5 px-6 sm:px-8 text-center shrink-0">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredPurchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-slate-50/50 transition duration-100 group">
                    <td className="py-4 px-6 sm:px-8 font-mono text-slate-500 font-bold whitespace-nowrap">
                      {new Date(purchase.purchaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-indigo-600 font-bold uppercase">
                        <span>{purchase.id.substring(0, 15)}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5 font-bold text-slate-900 whitespace-nowrap">
                      {purchase.supplierName}
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      <div className="font-bold text-slate-850 text-slate-800">{purchase.productName}</div>
                      <div className="font-mono text-[9px] text-slate-400 uppercase mt-0.5">Product ID: {purchase.productId.substring(0, 8)}</div>
                    </td>
                    <td className="py-4 px-5 text-center font-bold text-slate-800 font-mono">
                      ${purchase.purchasePrice.toFixed(2)}
                    </td>
                    <td className="py-4 px-5 text-center font-bold text-slate-900 font-mono">
                      x{purchase.quantity}
                    </td>
                    <td className="py-4 px-5 text-right font-black font-mono whitespace-nowrap">
                      <span className="text-slate-900">${purchase.totalAmount.toFixed(2)}</span>
                      <span className={`block text-[9px] font-extrabold uppercase mt-0.5 tracking-wider ${
                        purchase.paymentType === 'Cash' 
                          ? 'text-emerald-600' 
                          : 'text-amber-500'
                      }`}>
                        {purchase.paymentType}
                      </span>
                    </td>
                    <td className="py-4 px-6 sm:px-8 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openForm(purchase)}
                          title="Edit transaction order"
                          className="p-2 text-slate-405 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-xl transition cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePurchase(purchase)}
                          title="Purge transaction from registry and revert stocks"
                          className="p-2 text-slate-405 text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs"
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
                <form onSubmit={handleSavePurchase} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Supplier Field */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Target Supplier *</label>
                      <select
                        disabled={isSaving}
                        value={formData.supplierId}
                        onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                        className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-semibold focus:outline-none transition bg-white appearance-none cursor-pointer ${
                          errors.supplierId 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/20' 
                            : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                        }`}
                      >
                        <option value="">-- Choose Supplier --</option>
                        {suppliers.filter(s => s.status !== 'inactive').map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.category || 'Trading Channel'})
                          </option>
                        ))}
                      </select>
                      {errors.supplierId && <p className="text-[10px] font-bold text-rose-500">{errors.supplierId}</p>}
                    </div>

                    {/* Product Selection */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Inventory Product *</label>
                      <select
                        disabled={isSaving}
                        value={formData.productId}
                        onChange={(e) => handleProductSelect(e.target.value)}
                        className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-semibold focus:outline-none transition bg-white appearance-none cursor-pointer ${
                          errors.productId 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/20' 
                            : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                        }`}
                      >
                        <option value="">-- Choose Product --</option>
                        {products.filter(p => p.status !== 'inactive').map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Stock: {p.currentStock})
                          </option>
                        ))}
                      </select>
                      {errors.productId && <p className="text-[10px] font-bold text-rose-500">{errors.productId}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Unit Purchase Price */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Unit Purchase Price ($) *</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 text-slate-400 text-xs font-bold">$</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          disabled={isSaving}
                          value={formData.purchasePrice}
                          onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                          className={`w-full rounded-xl border py-2.5 pl-8 pr-3.5 text-xs font-semibold focus:outline-none transition disabled:bg-slate-50 ${
                            errors.purchasePrice 
                              ? 'border-rose-300 text-rose-800 bg-rose-50/20' 
                              : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                          }`}
                          placeholder="0.00"
                        />
                      </div>
                      {errors.purchasePrice && <p className="text-[10px] font-bold text-rose-500">{errors.purchasePrice}</p>}
                    </div>

                    {/* Quantity Procured */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Quantity Units Purchased *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        disabled={isSaving}
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-semibold focus:outline-none transition disabled:bg-slate-50 ${
                          errors.quantity 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/20' 
                            : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                        }`}
                        placeholder="Quantity"
                      />
                      {errors.quantity && <p className="text-[10px] font-bold text-rose-500">{errors.quantity}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Payment Account Type */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Supplier Terms *</label>
                      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                        {(['Cash', 'Credit'] as const).map((method) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setFormData({ ...formData, paymentType: method })}
                            className={`flex-1 text-center py-2 text-xs font-extrabold rounded-lg uppercase tracking-widest transition cursor-pointer ${
                              formData.paymentType === method 
                                ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200/40' 
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {method}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Purchase date */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Date Settled *</label>
                      <input 
                        type="date"
                        required
                        disabled={isSaving}
                        value={formData.purchaseDate}
                        onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-semibold text-slate-850 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition duration-150 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* dynamic total preview */}
                  {formData.productId && formData.supplierId && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2 mt-4"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-450 text-slate-500 font-bold uppercase tracking-wider">Item details:</span>
                        <span className="font-extrabold text-slate-850 text-slate-700">
                          {selectedProductDetails?.name || 'Item'} (x{parseInt(formData.quantity) || 1})
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-450 text-slate-500 font-bold uppercase tracking-wider">Purchase margin:</span>
                        <span className="font-extrabold text-slate-500">
                          Retail selling is ${selectedProductDetails?.sellingPrice.toFixed(2) || '0.00'}
                        </span>
                      </div>
                      <div className="border-t border-slate-200/60 my-2 pt-2 flex justify-between items-center">
                        <span className="text-xs font-black text-slate-900 uppercase tracking-wider">Gross debit sum:</span>
                        <span className="text-sm font-black text-indigo-650 text-indigo-600 font-mono">
                          ${((parseInt(formData.quantity) || 1) * (parseFloat(formData.purchasePrice) || 0)).toFixed(2)}
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {/* Submission and Cancel controls */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => setIsFormOpen(false)}
                      className="cursor-pointer border border-slate-200 hover:bg-slate-50 text-slate-650 text-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold transition"
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

    </div>
  );
}
