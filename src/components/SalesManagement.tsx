import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  Search, 
  Plus, 
  X, 
  Save, 
  AlertTriangle, 
  Calendar, 
  DollarSign, 
  Tag,
  Hash,
  ShoppingBag,
  Bell,
  Archive,
  CreditCard,
  User,
  Layers,
  Sparkles,
  ArrowRight,
  BookOpen,
  ArrowUpRight,
  FileText
} from 'lucide-react';
import { db, OperationType, handleFirestoreError, logSystemActivity } from '../lib/firebase';
import { collection, onSnapshot, doc, runTransaction, setDoc } from 'firebase/firestore';
import { Sale, Customer, Product } from '../types';
import TaxInvoiceModal from './TaxInvoiceModal';

export const INITIAL_SALES: Sale[] = [
  {
    id: "sale-1",
    customerId: "cust-abc",
    customerName: "Aero Athletic Club",
    productId: "prod-1",
    productName: "AeroGrip Pro Athletic Shoes",
    quantity: 2,
    sellingPrice: 110.00,
    unitPrice: 110.00,
    subtotal: 220.00,
    taxRatePercent: 15,
    taxAmount: 33.00,
    totalAmount: 253.00,
    paymentType: "Cash",
    saleDate: "2026-05-28T10:15:00Z",
    timestamp: "2026-05-28T10:15:00Z",
    productPurchasePriceAtSale: 45.00,
    productSellingPriceAtSale: 110.00,
    costOfGoodsSold: 90.00,
    grossProfit: 130.00
  },
  {
    id: "sale-2",
    customerId: "cust-xyz",
    customerName: "Apex Fitness Hub",
    productId: "prod-5",
    productName: "Apex Grip Training Gloves",
    quantity: 5,
    sellingPrice: 28.00,
    unitPrice: 28.00,
    subtotal: 140.00,
    taxRatePercent: 15,
    taxAmount: 21.00,
    totalAmount: 161.00,
    paymentType: "Credit",
    saleDate: "2026-05-29T14:45:00Z",
    timestamp: "2026-05-29T14:45:00Z",
    productPurchasePriceAtSale: 12.00,
    productSellingPriceAtSale: 28.00,
    costOfGoodsSold: 60.00,
    grossProfit: 80.00
  }
];

export default function SalesManagement() {
  // --- States ---
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'All' | 'Cash' | 'Credit'>('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [selectedSaleForInvoice, setSelectedSaleForInvoice] = useState<Sale | null>(null);

  // --- Form Field States ---
  const [formData, setFormData] = useState({
    customerId: '',
    productId: '',
    quantity: '1',
    sellingPrice: '',
    taxRatePercent: '15',
    paymentType: 'Cash' as 'Cash' | 'Credit',
    saleDate: new Date().toISOString().split('T')[0]
  });

  // --- Validation Errors ---
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Real-time Firestore Sync for Sales, Customers, and Products ---
  useEffect(() => {
    setLoading(true);
    setError(null);
    // 1. Sync Sales
    const unsubSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
      const salesList: Sale[] = [];
      snapshot.forEach((docSnap) => {
        salesList.push(docSnap.data() as Sale);
      });

      if (salesList.length > 0) {
        salesList.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
        setSales(salesList);
        setLoading(false);
      } else {
        setSales([]);
        setLoading(false);
      }
    }, (err) => {
      console.error("Sales sync error:", err);
      let errMsg = 'Failed to synchronize sales list with Firestore database.';
      try {
        handleFirestoreError(err, OperationType.LIST, 'sales');
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }
      setError(errMsg);
      setFeedback({ message: errMsg, type: 'error' });
      setLoading(false);
    });

    // 2. Sync Customers for selection dropdown
    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const custList: Customer[] = [];
      snapshot.forEach((docSnap) => {
        custList.push(docSnap.data() as Customer);
      });
      custList.sort((a, b) => a.name.localeCompare(b.name));
      setCustomers(custList);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'customers');
      } catch (err: any) {
        console.error("Customers select sync error", err);
      }
    });

    // 3. Sync Products for selection dropdown
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const prodList: Product[] = [];
      snapshot.forEach((docSnap) => {
        prodList.push(docSnap.data() as Product);
      });
      prodList.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(prodList);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'products');
      } catch (err: any) {
        console.error("Products select sync error", err);
      }
    });

    return () => {
      unsubSales();
      unsubCustomers();
      unsubProducts();
    };
  }, []);

  // --- Auto-hide Feedback Banner ---
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // --- Handle Product Selection logic to auto-fill prices ---
  const handleProductChange = (selectedProdId: string) => {
    const selectedProd = products.find(p => p.id === selectedProdId);
    setFormData(prev => ({
      ...prev,
      productId: selectedProdId,
      sellingPrice: selectedProd ? selectedProd.sellingPrice.toString() : ''
    }));
  };

  // --- Handle Customer Selection to pre-populate default Payment Type ---
  const handleCustomerChange = (selectedCustId: string) => {
    const selectedCust = customers.find(c => c.id === selectedCustId);
    setFormData(prev => ({
      ...prev,
      customerId: selectedCustId,
      paymentType: selectedCust ? selectedCust.customerType : 'Cash'
    }));
  };

  // --- Form Validation ---
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.customerId) newErrors.customerId = 'Choosing a customer is required';
    if (!formData.productId) newErrors.productId = 'Choosing a product is required';
    
    const qty = parseInt(formData.quantity);
    if (isNaN(qty) || qty <= 0) {
      newErrors.quantity = 'Quantity must be at least 1';
    } else {
      const selectedProd = products.find(p => p.id === formData.productId);
      if (selectedProd && qty > selectedProd.currentStock) {
        newErrors.quantity = `Insufficent warehouse stock. Only ${selectedProd.currentStock} units left for "${selectedProd.name}"`;
      }
    }

    const price = parseFloat(formData.sellingPrice);
    if (isNaN(price) || price < 0) {
      newErrors.sellingPrice = 'Enter a valid positive unit selling price';
    }

    const taxRate = parseFloat(formData.taxRatePercent);
    if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
      newErrors.taxRatePercent = 'Tax Rate must be between 0% and 100%';
    }

    if (!formData.saleDate) {
      newErrors.saleDate = 'Sale completion date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Form Modal Toggle ---
  const openForm = () => {
    setFormData({
      customerId: '',
      productId: '',
      quantity: '1',
      sellingPrice: '',
      taxRatePercent: '15',
      paymentType: 'Cash',
      saleDate: new Date().toISOString().split('T')[0]
    });
    setErrors({});
    setIsFormOpen(true);
  };

  // --- Submit / Finalize Transaction ---
  const handleSubmitSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const chosenCust = customers.find(c => c.id === formData.customerId);
    const chosenProd = products.find(p => p.id === formData.productId);

    if (!chosenCust || !chosenProd) {
      setFeedback({ message: 'Selected customer or product configuration mismatch.', type: 'error' });
      return;
    }

    if (chosenProd.status === 'inactive') {
      setFeedback({ message: 'Selected product is inactive and cannot be sold.', type: 'error' });
      return;
    }

    const numQty = parseInt(formData.quantity);
    const numPrice = parseFloat(formData.sellingPrice);
    const subtotal = numQty * numPrice;
    const taxRatePercent = parseFloat(formData.taxRatePercent) || 0;
    const taxAmount = (subtotal * taxRatePercent) / 100;
    const totalAmount = subtotal + taxAmount;
    const saleId = `sale-${Date.now()}`;

    const finalizedSaleData: Sale = {
      id: saleId,
      customerId: chosenCust.id,
      customerName: chosenCust.name,
      productId: chosenProd.id,
      productName: chosenProd.name,
      quantity: numQty,
      sellingPrice: numPrice,
      unitPrice: numPrice,
      subtotal: subtotal,
      taxRatePercent: taxRatePercent,
      taxAmount: taxAmount,
      totalAmount: totalAmount,
      paymentType: formData.paymentType,
      saleDate: new Date(formData.saleDate).toISOString(),
      timestamp: new Date(formData.saleDate).toISOString()
    };

    setIsSaving(true);
    try {
      // Execute Atomic Database Updates
      await runTransaction(db, async (transaction) => {
        // A. Verify and read Product stock live in transaction
        const productRef = doc(db, 'products', chosenProd.id);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) {
          throw new Error(`Product "${chosenProd.name}" no longer exists.`);
        }
        const productData = productSnap.data() as Product;
        if (productData.status === 'inactive') {
          throw new Error(`Transactional abort: Product "${chosenProd.name}" has been marked as inactive.`);
        }
        const liveProductStock = productData.currentStock ?? 0;
        
        if (liveProductStock < numQty) {
          throw new Error(`Transactional abort: Insufficient stock. Live: ${liveProductStock}, Requested: ${numQty}`);
        }

        // B. Verify and read Customer balance if Credit Payment
        let liveCustBalance = 0;
        let customerRef = null;
        if (formData.paymentType === 'Credit') {
          customerRef = doc(db, 'customers', chosenCust.id);
          const customerSnap = await transaction.get(customerRef);
          if (!customerSnap.exists()) {
            throw new Error(`Customer "${chosenCust.name}" profile was purged/not found.`);
          }
          const customerData = customerSnap.data() as Customer;
          liveCustBalance = (customerData.dueBalance ?? 0) + totalAmount;
        }

        // C. WRITE: Decrement product stock level
        transaction.update(productRef, {
          currentStock: liveProductStock - numQty
        });

        // D. WRITE: Add balance to Customer profile if credit
        if (formData.paymentType === 'Credit' && customerRef) {
          transaction.update(customerRef, {
            dueBalance: liveCustBalance
          });
        }

        // E. WRITE: Log sale ledger block
        const purchasePriceAtSale = productData.purchasePrice ?? 0;
        const sellingPriceAtSale = productData.sellingPrice ?? 0;
        const costOfGoodsSold = purchasePriceAtSale * numQty;
        const grossProfit = subtotal - costOfGoodsSold;

        const finalizedSaleWithSnapshot: Sale = {
          ...finalizedSaleData,
          productPurchasePriceAtSale: purchasePriceAtSale,
          productSellingPriceAtSale: sellingPriceAtSale,
          costOfGoodsSold: costOfGoodsSold,
          grossProfit: grossProfit
        };

        const saleRef = doc(db, 'sales', saleId);
        transaction.set(saleRef, finalizedSaleWithSnapshot);
      });

      // Log activity to the Logs collection
      await logSystemActivity(
        "Sale completed",
        `Completed sale of x${numQty} "${chosenProd.name}" to "${chosenCust.name}" (Subtotal: $${subtotal.toFixed(2)}, Tax ID Applied: $${taxAmount.toFixed(2)}, Total: $${totalAmount.toFixed(2)}, Payment: ${formData.paymentType})`
      );
      
      await logSystemActivity(
        "Stock updated",
        `Decreased stock level for "${chosenProd.name}" (SKU: ${chosenProd.sku}) by -${numQty} units. Remaining stock: ${chosenProd.currentStock - numQty} units.`
      );

      setFeedback({
        message: `Atomically recorded purchase of x${numQty} "${chosenProd.name}" to "${chosenCust.name}". Net amount with VAT: $${totalAmount.toFixed(2)}`,
        type: 'success'
      });
      setIsFormOpen(false);
    } catch (err: any) {
      console.error("Save sale transaction error:", err);
      let errMsg = 'Failed to post sale transaction.';
      try {
        handleFirestoreError(err, OperationType.WRITE, `sales/${saleId}`);
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }
      setFeedback({ message: `Database Abort: ${errMsg}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Calculate Dynamic Metrics ---
  const totalSalesRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalSalesCount = sales.length;
  const cashSalesTotal = sales.filter(s => s.paymentType === 'Cash').reduce((sum, s) => sum + s.totalAmount, 0);
  const creditSalesTotal = sales.filter(s => s.paymentType === 'Credit').reduce((sum, s) => sum + s.totalAmount, 0);
  const totalItemsSold = sales.reduce((sum, s) => sum + s.quantity, 0);

  // --- Filter and Search matching ---
  const filteredSalesList = sales.filter((sale) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      sale.customerName.toLowerCase().includes(query) ||
      sale.productName.toLowerCase().includes(query) ||
      sale.paymentType.toLowerCase().includes(query);

    const matchesFilterStatus = paymentFilter === 'All' || sale.paymentType === paymentFilter;

    return matchesSearch && matchesFilterStatus;
  });

  // Derived selected product info
  const currentSelectedProduct = products.find(p => p.id === formData.productId);

  return (
    <div id="sales-management-system-root" className="space-y-8 animate-fade-in font-sans pb-12">
      
      {/* POPUP BANNER ALERTS */}
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* THREE BENTO METRICS FOR SALES INTELLIGENCE */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {/* Total revenue */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Net Sales Revenue</span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
              ${totalSalesRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1.5 justify-between">
            <span className="font-medium">Combined registers: {totalSalesCount} entries</span>
            <span className="text-indigo-600 font-bold">{totalItemsSold} stock units distributed</span>
          </div>
        </div>

        {/* Cash registers ledger breakdown */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Cash Receipts</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-50 border border-emerald-100 text-emerald-700 uppercase">
                Liquidity
              </span>
            </div>
            <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
              ${cashSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Instant settled trades</span>
            <span className="font-semibold text-slate-650 text-slate-700">
              {totalSalesRevenue > 0 ? Math.round((cashSalesTotal / totalSalesRevenue) * 100) : 0}% of net
            </span>
          </div>
        </div>

        {/* Credit registries outstanding billing */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Outstanding Account credit</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-50 border border-amber-100 text-amber-700 uppercase">
                Receivables
              </span>
            </div>
            <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
              ${creditSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex justify-between items-center">
            <span>Customer due invoice ledger</span>
            <span className="font-semibold text-amber-700">
              {totalSalesRevenue > 0 ? Math.round((creditSalesTotal / totalSalesRevenue) * 105) / 1.05 : 0}% of net
            </span>
          </div>
        </div>
      </div>

      {/* CORE SALES VIEW STRUCTURE */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Sales ledger matching table */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
            
            {/* Header section with add button */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-sans text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-indigo-505 text-indigo-550 text-indigo-500 shrink-0" />
                  Sales Journal Desk
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  View historically indexed customer orders, product margins, and payment state records
                </p>
              </div>

              <button
                type="button"
                onClick={openForm}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Record New Sale</span>
              </button>
            </div>

            {/* Filters panel */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2 border-t border-slate-100">
              <div className="sm:col-span-2 relative">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search ledger by product, customer, or payment type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-sans"
                />
              </div>

              <div className="flex bg-slate-50 border border-slate-100 p-1 rounded-xl">
                {([ 'All', 'Cash', 'Credit' ] as const).map((filterOpt) => (
                  <button
                    key={filterOpt}
                    type="button"
                    onClick={() => setPaymentFilter(filterOpt)}
                    className={`flex-1 text-center py-2 text-[10px] font-bold tracking-tight rounded-lg transition cursor-pointer ${
                      paymentFilter === filterOpt
                        ? 'bg-white text-indigo-600 shadow-xs border border-slate-100' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {filterOpt}
                  </button>
                ))}
              </div>
            </div>

            {/* List entries */}
            <div className="space-y-4 pt-2">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="border border-slate-200 rounded-2xl p-5 bg-white animate-pulse flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-3 flex-grow">
                        <div className="h-4 bg-slate-100 rounded-md w-1/3"></div>
                        <div className="grid grid-cols-3 gap-4 pt-1">
                          <div className="h-3.5 bg-slate-50 rounded-md w-1/2"></div>
                          <div className="h-3.5 bg-slate-50 rounded-md w-2/3"></div>
                          <div className="h-3.5 bg-slate-50 rounded-md w-1/2"></div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0 shrink-0">
                        <div className="h-5 bg-slate-100 rounded-md w-24"></div>
                        <div className="w-8 h-8 bg-slate-50 rounded-lg"></div>
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
              ) : filteredSalesList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
                  <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-3">
                    <ShoppingBag className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    {sales.length === 0 ? 'No sales found' : 'No matching sales logged'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    {searchQuery ? 'Double check spelling or swap filters' : 'Start logging sales transactions to configure financial calculations'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredSalesList.map((sale) => (
                    <motion.div
                      key={sale.id}
                      layoutId={`sale-card-${sale.id}`}
                      className="border border-slate-200 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-xs transition duration-300 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-extrabold text-slate-900 capitalize">{sale.customerName}</span>
                          <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="text-xs font-medium text-slate-655 text-slate-600 shrink-0">{sale.productName}</span>
                        </div>

                        <div className="grid grid-cols-3 gap-4 pt-1 text-[11px]">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Volume / Price</span>
                            <span className="font-semibold text-slate-700 block mt-0.5">
                              x{sale.quantity} @ ${sale.sellingPrice.toFixed(2)}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Logged Date</span>
                            <span className="font-medium text-slate-500 block mt-0.5">
                              {new Date(sale.saleDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Settlement Type</span>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold mt-0.5 border ${
                              sale.paymentType === 'Cash' 
                                ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                                : 'bg-amber-50 border-amber-200 text-amber-800'
                            }`}>
                              <CreditCard className="h-2.5 w-2.5 shrink-0" />
                              {sale.paymentType}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Selling cost display */}
                      <div className="text-left sm:text-right flex sm:flex-col justify-between sm:justify-center items-center sm:items-end border-t sm:border-t-0 border-slate-100 pt-3.5 sm:pt-0 shrink-0 gap-3">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block sm:mb-0.5">Grand Total</span>
                          <span className="text-sm font-bold text-indigo-600 block">
                            ${sale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => setSelectedSaleForInvoice(sale)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-205 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition cursor-pointer shrink-0"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Tax Invoice</span>
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Right side: Insights, tips and warnings */}
        <div className="space-y-6">
          {/* Quick instructions / guidelines */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Receivable Rules</h4>
              <CreditCard className="h-4 w-4 text-indigo-500 shrink-0" />
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              When finalizing a <strong className="text-slate-800 font-extrabold">Credit sale</strong>, the customer due balance is increased instantly. Always ensure compliance with credit boundaries.
            </p>

            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Unsettled Accounts</span>
                <span className="font-mono text-[10px] font-bold text-amber-700 bg-amber-50 rounded px-2 py-0.5 border border-amber-100">
                  {sales.filter(s => s.paymentType === 'Credit').length} active
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Total volume distributed</span>
                <span className="font-bold text-slate-700">{totalItemsSold} stock units</span>
              </div>
            </div>
          </div>

          {/* Quick seed metrics info panel */}
          <div className="bg-slate-900 text-white rounded-[2rem] p-6 sm:p-8 space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-bold uppercase text-[10px] tracking-widest text-slate-400">System Integrity</h4>
              <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              Stock checking operates inside a <strong className="text-white font-semibold">Single Cloud Transaction</strong> prevent race conditions. Quantities are instantly updated upon completion.
            </p>

            <div className="mt-4 border-t border-slate-800 pt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Inventory Sync</span>
                <span className="font-mono text-[9px] text-emerald-400 font-semibold uppercase">ACTIVE-TX</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Customer Debt Sync</span>
                <span className="font-mono text-[9px] text-indigo-300">AUTOMATIC</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SALES RECORD MODAL FORM */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-6 sm:px-8 py-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Record Ledger Sales Line
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select customer, products config, payment type and complete transactions atomically
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-800 transition rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form body */}
              <form onSubmit={handleSubmitSymbol} className="p-6 sm:p-8 space-y-5">
                
                {/* Select Customer */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Customer Name *</label>
                  {customers.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium">
                      ⚠️ No customers registered in index. Please configure Customer profiles inside directory first.
                    </div>
                  ) : (
                    <select
                      value={formData.customerId}
                      onChange={(e) => handleCustomerChange(e.target.value)}
                      required
                      className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-semibold focus:outline-none transition cursor-pointer ${
                        errors.customerId 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10' 
                          : 'border-slate-200 focus:border-indigo-500'
                      }`}
                    >
                      <option value="">-- Choose Customer profile --</option>
                      {customers.filter(cust => cust.status !== 'inactive').map((cust) => (
                        <option key={cust.id} value={cust.id}>
                          {cust.name} ({cust.customerType} - Due: ${cust.dueBalance.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.customerId && <p className="text-[10px] font-bold text-rose-500">{errors.customerId}</p>}
                </div>

                {/* Select Product */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Product Specification *</label>
                  {products.filter(p => p.status !== 'inactive').length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium">
                      ⚠️ No active products cataloged inside database. Add or reactivate products first.
                    </div>
                  ) : (
                    <select
                      value={formData.productId}
                      onChange={(e) => handleProductChange(e.target.value)}
                      required
                      className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-semibold focus:outline-none transition cursor-pointer ${
                        errors.productId
                          ? 'border-rose-305 text-rose-805 text-rose-800 bg-rose-50/10' 
                          : 'border-slate-200 focus:border-indigo-505 focus:border-indigo-500'
                      }`}
                    >
                      <option value="">-- Choose Product SKU --</option>
                      {products.filter(p => p.status !== 'inactive').map((p) => {
                        const outOfStock = p.currentStock <= 0;
                        return (
                          <option key={p.id} value={p.id} disabled={outOfStock}>
                            {p.name} ({p.currentStock > 0 ? `${p.currentStock} units left` : 'OUT OF STOCK'} • SRP: ${p.sellingPrice.toFixed(2)})
                          </option>
                        );
                      })}
                    </select>
                  )}
                  {errors.productId && <p className="text-[10px] font-bold text-rose-500">{errors.productId}</p>}
                </div>

                {/* Grid Inputs for Quantity & Pricing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  {/* Quantity input */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Quantity Trade Units *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-medium focus:outline-none transition ${
                        errors.quantity
                          ? 'border-rose-300 text-rose-800 bg-rose-50/20' 
                          : 'border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505'
                      }`}
                      placeholder="Enter amount"
                    />
                    {errors.quantity && <p className="text-[10px] font-bold text-rose-500">{errors.quantity}</p>}
                  </div>

                  {/* Selling price */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Selling Price Override ($) *</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-slate-400 text-xs font-semibold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={formData.sellingPrice}
                        onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                        className={`w-full rounded-xl border py-2.5 pl-8 pr-3.5 text-xs font-medium focus:outline-none transition ${
                          errors.sellingPrice 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/20' 
                            : 'border-slate-200 focus:border-indigo-505 focus:border-indigo-500 focus:ring-1'
                        }`}
                        placeholder="0.00"
                      />
                    </div>
                    {errors.sellingPrice && <p className="text-[10px] font-bold text-rose-500">{errors.sellingPrice}</p>}
                  </div>

                </div>

                {/* Date and Settlement selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Settlement Segment Choice */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Settlement Type *</label>
                    <div className="flex bg-slate-50 border border-slate-100 p-1 rounded-xl">
                      {([ 'Cash', 'Credit' ] as const).map((typeOpt) => (
                        <button
                          key={typeOpt}
                          type="button"
                          onClick={() => setFormData({ ...formData, paymentType: typeOpt })}
                          className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                            formData.paymentType === typeOpt 
                              ? 'bg-white text-indigo-650 text-indigo-600 shadow-xs border border-slate-100' 
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {typeOpt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Completion date */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Sale Completion Date *</label>
                    <input
                      type="date"
                      required
                      value={formData.saleDate}
                      onChange={(e) => setFormData({ ...formData, saleDate: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3.5 text-xs font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505"
                    />
                    {errors.saleDate && <p className="text-[10px] font-bold text-rose-505">{errors.saleDate}</p>}
                  </div>
                </div>

                {/* Tax Configuration Segment */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Tax / VAT Rate (%) *</label>
                    <div className="relative">
                      <span className="absolute right-3.5 top-2.5 text-slate-400 text-xs font-semibold">%</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        required
                        value={formData.taxRatePercent}
                        onChange={(e) => setFormData({ ...formData, taxRatePercent: e.target.value })}
                        className={`w-full rounded-xl border py-2.5 pl-3.5 pr-8 text-xs font-medium focus:outline-none transition ${
                          errors.taxRatePercent 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/20' 
                            : 'border-slate-200 focus:border-indigo-500 focus:ring-1'
                        }`}
                        placeholder="15"
                      />
                    </div>
                    {errors.taxRatePercent && <p className="text-[10px] font-bold text-rose-500">{errors.taxRatePercent}</p>}
                  </div>
                </div>

                {/* Dynamic Summary Breakdown Banner */}
                {formData.productId && formData.customerId && (() => {
                  const subVal = (parseInt(formData.quantity) || 1) * (parseFloat(formData.sellingPrice) || 0);
                  const rateVal = parseFloat(formData.taxRatePercent) || 0;
                  const taxVal = (subVal * rateVal) / 100;
                  const grandVal = subVal + taxVal;
                  return (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
                      <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Dynamic invoice Summary</p>
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-slate-500">
                          {currentSelectedProduct?.name || 'Item'} (x{parseInt(formData.quantity) || 1})
                        </span>
                        <span className="text-slate-800">
                          ${subVal.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-medium text-[11px] text-slate-500 border-t border-dashed border-slate-200/60 pt-1.5">
                        <span>Sales Tax / VAT ({rateVal}%)</span>
                        <span>
                          ${taxVal.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-bold text-indigo-600 pt-1.5 border-t border-slate-200">
                        <span>Total Invoice Due (Locked)</span>
                        <span>
                          ${grandVal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Submits */}
                <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed font-semibold"
                  >
                    {isSaving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></span>
                        <span>Posting Ledger...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Post ledger Transaction</span>
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
        {selectedSaleForInvoice && (
          <TaxInvoiceModal 
            sale={selectedSaleForInvoice}
            customers={customers}
            products={products}
            onClose={() => setSelectedSaleForInvoice(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
