import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Package, 
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
  Tag,
  Hash,
  ShoppingBag,
  Bell,
  Scale,
  Sparkles,
  Layers,
  Archive,
  BookOpen
} from 'lucide-react';
import { db, OperationType, handleFirestoreError, logSystemActivity } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { Product } from '../types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: "prod-1",
    name: "AeroGrip Pro Athletic Shoes",
    sku: "AGP-ATH-001",
    category: "Footwear",
    purchasePrice: 45.00,
    sellingPrice: 110.00,
    currentStock: 18,
    minimumStockAlert: 10,
    createdDate: "2026-05-15T08:00:00Z"
  },
  {
    id: "prod-2",
    name: "UltraLight Rain Jacket",
    sku: "ULR-JKT-004",
    category: "Apparel",
    purchasePrice: 32.50,
    sellingPrice: 85.00,
    currentStock: 5,
    minimumStockAlert: 12,
    createdDate: "2026-05-16T09:12:00Z"
  },
  {
    id: "prod-3",
    name: "ChronoSync Smartwatch Steel",
    sku: "CSS-WCH-012",
    category: "Electronics",
    purchasePrice: 110.00,
    sellingPrice: 249.00,
    currentStock: 25,
    minimumStockAlert: 8,
    createdDate: "2026-05-20T14:30:00Z"
  },
  {
    id: "prod-4",
    name: "AeroFlow Carbon Fiber Helmet",
    sku: "AFC-HLM-088",
    category: "Safety Gear",
    purchasePrice: 65.00,
    sellingPrice: 145.00,
    currentStock: 3,
    minimumStockAlert: 5,
    createdDate: "2026-05-21T11:45:00Z"
  },
  {
    id: "prod-5",
    name: "Apex Grip Training Gloves",
    sku: "ATG-GLV-034",
    category: "Fitness",
    purchasePrice: 12.00,
    sellingPrice: 28.00,
    currentStock: 50,
    minimumStockAlert: 15,
    createdDate: "2026-05-24T16:05:00Z"
  }
];

export default function ProductManagement() {
  // --- States ---
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [stockStatusFilter, setStockStatusFilter] = useState<'All' | 'Alert Only' | 'In Stock'>('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // --- Form Field States ---
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    purchasePrice: '',
    sellingPrice: '',
    currentStock: '',
    minimumStockAlert: '',
    status: 'active'
  });

  // --- Validation Errors State ---
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Real-time Firestore Sync ---
  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productList: Product[] = [];
      snapshot.forEach((docSnap) => {
        productList.push(docSnap.data() as Product);
      });

      if (productList.length > 0) {
        // Sort products by createdDate descending (fall back on SKU/ID if createdDate is missing)
        productList.sort((a, b) => {
          const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
          const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
          if (dateA !== dateB) return dateB - dateA;
          return b.id.localeCompare(a.id);
        });
        setProducts(productList);
        setLoading(false);
      } else {
        setProducts([]);
        setLoading(false);
      }
    }, (err) => {
      console.error("Products sync error:", err);
      let errMsg = 'Failed to synchronize products list with Firestore database.';
      try {
        handleFirestoreError(err, OperationType.LIST, 'products');
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }
      setError(errMsg);
      setFeedback({ message: errMsg, type: 'error' });
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // --- Auto-hide Feedback ---
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // --- Derived Categories ---
  const categoriesList = ['All', ...Array.from(new Set(products.map(p => p.category))).filter(Boolean)];

  // --- Form Modal Toggle ---
  const openForm = (product: Product | null = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        sku: product.sku,
        category: product.category,
        purchasePrice: product.purchasePrice.toString(),
        sellingPrice: product.sellingPrice.toString(),
        currentStock: product.currentStock.toString(),
        minimumStockAlert: product.minimumStockAlert.toString(),
        status: product.status || 'active'
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        sku: '',
        category: '',
        purchasePrice: '',
        sellingPrice: '',
        currentStock: '',
        minimumStockAlert: '',
        status: 'active'
      });
    }
    setErrors({});
    setIsFormOpen(true);
  };

  // --- Validate Input Feeds ---
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Product name is required';
    if (formData.name.length > 200) newErrors.name = 'Name must be 200 characters or less';
    
    if (!formData.sku.trim()) {
      newErrors.sku = 'SKU code is required';
    } else if (formData.sku.length > 100) {
      newErrors.sku = 'SKU code must be 100 characters or less';
    }

    if (!formData.category.trim()) {
      newErrors.category = 'Category designation is required';
    } else if (formData.category.length > 100) {
      newErrors.category = 'Category must be 100 characters or less';
    }

    const costPrice = parseFloat(formData.purchasePrice);
    if (isNaN(costPrice) || costPrice < 0) {
      newErrors.purchasePrice = 'Enter a valid positive purchase cost';
    }

    const salePrice = parseFloat(formData.sellingPrice);
    if (isNaN(salePrice) || salePrice < 0) {
      newErrors.sellingPrice = 'Enter a valid positive retail price';
    } else if (salePrice < costPrice) {
      // Gentle warning, but allow. Or flag as error depending on constraints
    }

    const stock = parseInt(formData.currentStock);
    if (isNaN(stock) || stock < 0) {
      newErrors.currentStock = 'Stock level must be 0 or greater';
    }

    const minAlert = parseInt(formData.minimumStockAlert);
    if (isNaN(minAlert) || minAlert < 0) {
      newErrors.minimumStockAlert = 'Minimum stock alert level must be 0 or greater';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Save / Create Product Handler ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSaving(true);
    const productId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
    const timestamp = editingProduct?.createdDate || new Date().toISOString();

    const finalizedData: Product = {
      id: productId,
      name: formData.name.trim(),
      sku: formData.sku.trim().toUpperCase(),
      category: formData.category.trim(),
      purchasePrice: parseFloat(formData.purchasePrice),
      sellingPrice: parseFloat(formData.sellingPrice),
      currentStock: parseInt(formData.currentStock),
      minimumStockAlert: parseInt(formData.minimumStockAlert),
      createdDate: timestamp,
      status: (formData.status as 'active' | 'inactive') || 'active'
    };

    try {
      // 1. Live Firestore SKU check (Backend validation bypass protection)
      const productsRef = collection(db, 'products');
      const q = query(productsRef, where('sku', '==', finalizedData.sku));
      const querySnapshot = await getDocs(q);
      const isSkuDuplicate = querySnapshot.docs.some(docSnap => docSnap.id !== productId);

      if (isSkuDuplicate) {
        setErrors(prev => ({ ...prev, sku: 'SKU code already exists for another product. Must be unique.' }));
        setIsSaving(false);
        return;
      }

      // 2. Prevent duplicate product names with same SKU (strictly enforced)
      const isNameWithSameSkuDuplicate = querySnapshot.docs.some(docSnap => {
        const prod = docSnap.data() as Product;
        return prod.id !== productId && prod.name.trim().toLowerCase() === finalizedData.name.toLowerCase();
      });

      if (isNameWithSameSkuDuplicate) {
        setErrors(prev => ({ ...prev, name: 'A product with this name and SKU already exists.' }));
        setIsSaving(false);
        return;
      }

      await setDoc(doc(db, 'products', productId), finalizedData);
      if (editingProduct) {
        await logSystemActivity(
          "Product edited",
          `Updated product: "${finalizedData.name}" (SKU: ${finalizedData.sku}, Price: $${finalizedData.sellingPrice}, Stock: ${finalizedData.currentStock} units)`
        );
      } else {
        await logSystemActivity(
          "Product added",
          `Added product: "${finalizedData.name}" (SKU: ${finalizedData.sku}, Price: $${finalizedData.sellingPrice}, Initial Stock: ${finalizedData.currentStock} units)`
        );
      }
      setFeedback({
        message: editingProduct 
          ? `Successfully synchronized product alterations for "${finalizedData.name}"` 
          : `Permanently logged product record "${finalizedData.name}" in index.`,
        type: 'success'
      });
      setIsFormOpen(false);
    } catch (err: any) {
      console.error("Save product error:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
      } catch (dbErr: any) {
        setFeedback({ message: `Firestore Write Failed: ${dbErr.message}`, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Confirm Delete Trigger ---
  const handleDeleteTrigger = (product: Product) => {
    setProductToDelete(product);
  };

  // --- Confirm Delete Execution ---
  const handleConfirmDeleteField = async () => {
    if (!productToDelete) return;
    const name = productToDelete.name;
    const id = productToDelete.id;
    setProductToDelete(null);

    setIsSaving(true);
    try {
      // 1. Live Firestore existing sales history check
      const salesRef = collection(db, 'sales');
      const salesQuery = query(salesRef, where('productId', '==', id));
      const salesSnapshot = await getDocs(salesQuery);

      // 2. Live Firestore existing purchase history check
      const purchasesRef = collection(db, 'purchases');
      const purchasesQuery = query(purchasesRef, where('productId', '==', id));
      const purchasesSnapshot = await getDocs(purchasesQuery);

      const hasSales = !salesSnapshot.empty;
      const hasPurchases = !purchasesSnapshot.empty;

      if (hasSales || hasPurchases) {
        // Has history - mark as inactive
        const updatedProduct: Product = {
          ...productToDelete,
          status: 'inactive'
        };
        await setDoc(doc(db, 'products', id), updatedProduct);

        let reason = "";
        if (hasSales && hasPurchases) {
          reason = "existing sales and purchase history";
        } else if (hasSales) {
          reason = "existing sales history";
        } else {
          reason = "existing purchase history";
        }

        await logSystemActivity(
          "Product inactivated",
          `Marked product "${name}" (ID: ${id}) as inactive because it contains ${reason}.`
        );
        setFeedback({ message: `Product record "${name}" has ${reason} and has been safely marked as "inactive" instead of being deleted.`, type: 'success' });
      } else {
        // No sales or purchase history - permanently purge
        await deleteDoc(doc(db, 'products', id));
        await logSystemActivity(
          "Product deleted",
          `Permanently purged product catalog record: ${name}`
        );
        setFeedback({ message: `Product record "${name}" has been permanently purged from inventory index.`, type: 'success' });
      }
    } catch (err: any) {
      console.error("Delete product error:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `products/${id}`);
      } catch (dbErr: any) {
        setFeedback({ message: `Purge/Inactivation unsuccessful: ${dbErr.message}`, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Filter and Search logic ---
  const filteredProducts = products.filter((prod) => {
    const matchesSearch = 
      prod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prod.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prod.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'All' || prod.category === selectedCategory;

    let matchesStockFilter = true;
    if (stockStatusFilter === 'Alert Only') {
      matchesStockFilter = prod.status !== 'inactive' && prod.currentStock <= prod.minimumStockAlert;
    } else if (stockStatusFilter === 'In Stock') {
      matchesStockFilter = prod.status !== 'inactive' && prod.currentStock > prod.minimumStockAlert;
    }

    return matchesSearch && matchesCategory && matchesStockFilter;
  });

  // --- Dashboard Calculation Metrics ---
  const totalsCount = products.length;
  const criticalAlertsCount = products.filter(p => p.status !== 'inactive' && p.currentStock <= p.minimumStockAlert).length;
  const totalValuationPurchase = products.reduce((sum, p) => sum + (p.purchasePrice * p.currentStock), 0);
  const potentialRevenueValue = products.reduce((sum, p) => sum + (p.sellingPrice * p.currentStock), 0);
  const potentialProfitValue = potentialRevenueValue - totalValuationPurchase;

  return (
    <div id="product-management-system-root" className="space-y-8 animate-fade-in font-sans pb-12">
      
      {/* POPUP FEEDBACK ALERT BANNER */}
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

      {/* THREE BENTO METRIC CARDS */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {/* Total Registered Products */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between animate-fade-in">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Cataloged Items</span>
              <span className="p-1 px-2.5 rounded-full text-[10px] font-extrabold bg-indigo-50 border border-indigo-100 text-indigo-600">
                Core Index
              </span>
            </div>
            {loading ? (
              <div className="h-9 w-12 bg-slate-100 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">{totalsCount}</p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1">
            <Archive className="h-3 w-3 text-indigo-505" /> Unique product configurations
          </div>
        </div>

        {/* Low Stock Warning Alert State */}
        <div className={`rounded-[2rem] p-6 sm:p-8 border transition flex flex-col justify-between animate-fade-in ${
          criticalAlertsCount > 0 
            ? 'bg-amber-50 border-amber-200 text-amber-900' 
            : 'bg-emerald-50 border-emerald-100 text-emerald-950'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Low-Stock Warnings</span>
              {criticalAlertsCount > 0 ? (
                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
              ) : (
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              )}
            </div>
            {loading ? (
              <div className="h-9 w-12 bg-amber-200/50 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold font-sans tracking-tight mt-2">{criticalAlertsCount}</p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-dashed border-current/20 text-[11px] opacity-80 flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5 shrink-0" />
            {criticalAlertsCount > 0 
              ? `${criticalAlertsCount} products require instant restock orders` 
              : 'All registered stock levels safe'}
          </div>
        </div>

        {/* Asset Capital Valuation */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between animate-fade-in">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Net Asset Capital value</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            {loading ? (
              <div className="h-9 w-28 bg-slate-100 rounded-lg animate-pulse mt-2"></div>
            ) : (
              <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
                ${totalValuationPurchase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex justify-between items-center">
            <span>Potential retail: ${potentialRevenueValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            <span className="text-emerald-600 font-bold">Profit Margin: +{totalValuationPurchase > 0 ? Math.round((potentialProfitValue / totalValuationPurchase) * 100) : 0}%</span>
          </div>
        </div>
      </div>

      {/* CORE CONTROL AREA */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Side: Product Master Lists */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
            
            {/* Tab header buttons */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-sans text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-indigo-500 shrink-0" />
                  Product Directory Desk
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update product SKUs, classification, pricing limits and warehouse stock
                </p>
              </div>

              <button
                type="button"
                onClick={() => openForm()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Add Product</span>
              </button>
            </div>

            {/* Filter controls panel */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 pt-2 border-t border-slate-100">
              {/* Search input field */}
              <div className="sm:col-span-2 relative">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by product name, SKU or categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-xs font-medium text-slate-800 placeholder:text-slate-450 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505 outline-none font-sans"
                />
              </div>

              {/* Category Dropdown Selection */}
              <div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 px-3.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                >
                  <option value="All">All Categories</option>
                  {categoriesList.filter(c => c !== 'All').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Stock Status Selection Filters */}
              <div className="flex bg-slate-50 border border-slate-100 p-1 rounded-xl">
                {([ 'All', 'Alert Only' ] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStockStatusFilter(status)}
                    className={`flex-1 text-center py-2 text-[10px] font-bold tracking-tight rounded-lg transition ${
                      stockStatusFilter === status 
                        ? 'bg-white text-indigo-600 shadow-xs border border-slate-100' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {status === 'Alert Only' ? '⚠️ Alerts' : 'All Stock'}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Product Lists */}
            <div className="space-y-4 pt-2">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="border border-slate-200 rounded-2xl p-5 bg-white animate-pulse flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-3 flex-grow">
                        <div className="h-4 bg-slate-100 rounded-md w-1/3"></div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                          <div className="h-3.5 bg-slate-50 rounded-md w-1/2"></div>
                          <div className="h-3.5 bg-slate-50 rounded-md w-2/3"></div>
                          <div className="h-3.5 bg-slate-50 rounded-md w-1/2"></div>
                          <div className="h-3.5 bg-slate-50 rounded-md w-2/3"></div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0 shrink-0">
                        <div className="h-5 bg-slate-100 rounded-md w-24"></div>
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
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center text-slate-450 text-slate-400">
                  <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3">
                    <ShoppingBag className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-650 text-slate-700">No products found</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    {searchQuery ? 'Double check search parameters or reset limits' : 'Start registering and indexing items to construct the database'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredProducts.map((product) => {
                    const isLowStock = product.currentStock <= product.minimumStockAlert;
                    const isInactive = product.status === 'inactive';
                    return (
                      <motion.div
                        key={product.id}
                        layoutId={`product-card-${product.id}`}
                        className={`border rounded-2xl p-5 hover:shadow-xs transition duration-300 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isInactive
                            ? 'border-slate-200 bg-slate-50/70 opacity-75'
                            : isLowStock 
                            ? 'border-amber-250 bg-amber-50/5 hover:border-amber-300 bg-white' 
                            : 'border-slate-200 hover:border-indigo-200 bg-white'
                        }`}
                      >
                        {/* Middle info container */}
                        <div className="space-y-2.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-slate-900 truncate">{product.name}</h4>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-50 border border-slate-100 text-slate-500">
                              <Tag className="h-2.5 w-2.5" />
                              {product.category}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg">
                              <Hash className="h-2.5 w-2.5" />
                              {product.sku}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                            {/* Buying price */}
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Purchase Cost</span>
                              <span className="text-xs font-semibold text-slate-705 text-slate-705 block mt-0.5">${product.purchasePrice.toFixed(2)}</span>
                            </div>
                            {/* Selling price */}
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Retail Selling</span>
                              <span className="text-xs font-semibold text-slate-900 block mt-0.5">${product.sellingPrice.toFixed(2)}</span>
                            </div>
                            {/* Current Stock */}
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Warehouse Stock</span>
                              <span className={`text-xs font-extrabold block mt-0.5 ${isLowStock ? 'text-rose-600' : 'text-slate-900'}`}>
                                {product.currentStock} Units
                              </span>
                            </div>
                            {/* Minimum alert */}
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Minimum Alert</span>
                              <span className="text-xs font-medium text-slate-500 block mt-0.5">{product.minimumStockAlert} Units</span>
                            </div>
                          </div>
                        </div>

                        {/* Right side alert & triggers */}
                        <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0 shrink-0">
                          
                          {/* Alert state banner */}
                          <div className="text-left md:text-right">
                            {product.status === 'inactive' ? (
                              <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-600 antialiased shrink-0">
                                <span>Inactive / Retired</span>
                              </div>
                            ) : isLowStock ? (
                              <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[10px] font-bold text-amber-800 antialiased shrink-0">
                                <AlertTriangle className="h-3 w-3 text-amber-600" />
                                <span>Low Stock</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800 antialiased shrink-0">
                                <span>Active / Safe</span>
                              </div>
                            )}
                          </div>

                          {/* Quick buttons */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openForm(product)}
                              className="p-2.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition"
                              title="Edit product parameters"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTrigger(product)}
                              className="p-2.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition"
                              title="Permeantly delete product description"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Right Columns: Critical Alerts Panel & Audit Guides */}
        <div className="space-y-6">
          
          {/* List of outstanding critical product alerts */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Stock Alerts Panel</h4>
              <Bell className="h-4 w-4 text-amber-500 shrink-0" />
            </div>

            <div className="space-y-3">
              {products.filter(p => p.status !== 'inactive' && p.currentStock <= p.minimumStockAlert).length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <p className="text-xs font-semibold text-slate-500">Systems Safe</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">All item levels exceed alert trigger settings</p>
                </div>
              ) : (
                products.filter(p => p.status !== 'inactive' && p.currentStock <= p.minimumStockAlert).slice(0, 4).map((prod) => (
                  <div key={prod.id} className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-amber-900 truncate">{prod.name}</p>
                      <p className="text-[10px] text-amber-705 font-medium mt-0.5">
                        SKU: {prod.sku} • Limit: {prod.minimumStockAlert}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-rose-650 text-rose-600 block">{prod.currentStock} left</span>
                      <span className="text-[9px] text-slate-400 block">Restock needed</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Guidelines on markup/revenue rules */}
          <div className="bg-slate-900 text-white rounded-[2rem] p-6 sm:p-8 space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-bold uppercase text-[10px] tracking-widest text-slate-400">Inventory Guidelines</h4>
              <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              When configuring <strong className="text-white font-bold">Minimum Stock levels</strong>, ensure the threshold covers the standard lead times for vendor shipments to avoid stockout scenarios.
            </p>
            <div className="mt-4 border-t border-slate-800 pt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-450 text-slate-400">Asset Valuation Sync</span>
                <span className="font-mono text-[9px] bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded">Active</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-450 text-slate-400">Form Validation Engine</span>
                <span className="font-mono text-[9px] text-emerald-400 font-semibold">Strict</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* FORM MODAL COMPONENT */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden"
            >
              {/* Form title */}
              <div className="flex items-center justify-between border-b border-slate-100 px-6 sm:px-8 py-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingProduct ? `Modify Product: ${editingProduct.name}` : 'Catalog New Inventory Product'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Assign product identification, current inventories, and price margins
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

              {/* Form inputs body */}
              <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
                
                {/* Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Product Name *</label>
                  <input
                    type="text"
                    required
                    disabled={isSaving}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 disabled:bg-slate-50/50 ${
                      errors.name 
                        ? 'border-rose-350 text-rose-800 bg-rose-50/20' 
                        : 'border-slate-200 focus:border-indigo-500 focus:ring-1'
                    }`}
                    placeholder="E.g., Carbon Aero-Helmet V2"
                  />
                  {errors.name && <p className="text-[10px] font-bold text-rose-500">{errors.name}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* SKU */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">SKU Code *</label>
                    <input
                      type="text"
                      required
                      disabled={isSaving}
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 disabled:bg-slate-50/50 ${
                        errors.sku 
                          ? 'border-rose-350 text-rose-800 bg-rose-50/20' 
                          : 'border-slate-200 focus:border-indigo-500 focus:ring-1'
                      }`}
                      placeholder="E.g., AGP-ATH-001"
                    />
                    {errors.sku && <p className="text-[10px] font-bold text-rose-500">{errors.sku}</p>}
                  </div>

                  {/* Category */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Category Designation *</label>
                    <input
                      type="text"
                      required
                      disabled={isSaving}
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 disabled:bg-slate-50/50 ${
                        errors.category 
                          ? 'border-rose-350 text-rose-800 bg-rose-50/20' 
                          : 'border-slate-200 focus:border-indigo-500 focus:ring-1'
                      }`}
                      placeholder="E.g., Safety Gear"
                    />
                    {errors.category && <p className="text-[10px] font-bold text-rose-500">{errors.category}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Purchase Price */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Purchase Unit Cost ($) *</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-slate-400 text-xs font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        disabled={isSaving}
                        value={formData.purchasePrice}
                        onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                        className={`w-full rounded-xl border py-2.5 pl-8 pr-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 disabled:bg-slate-50/50 ${
                          errors.purchasePrice 
                            ? 'border-rose-350 text-rose-800 bg-rose-50/20' 
                            : 'border-slate-200 focus:border-indigo-500 focus:ring-1'
                        }`}
                        placeholder="0.00"
                      />
                    </div>
                    {errors.purchasePrice && <p className="text-[10px] font-bold text-rose-500">{errors.purchasePrice}</p>}
                  </div>

                  {/* Selling Price */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Retail Selling Price ($) *</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-slate-400 text-xs font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        disabled={isSaving}
                        value={formData.sellingPrice}
                        onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                        className={`w-full rounded-xl border py-2.5 pl-8 pr-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 disabled:bg-slate-50/50 ${
                          errors.sellingPrice 
                            ? 'border-rose-350 text-rose-800 bg-rose-50/20' 
                            : 'border-slate-200 focus:border-indigo-500 focus:ring-1'
                        }`}
                        placeholder="0.00"
                      />
                    </div>
                    {errors.sellingPrice && <p className="text-[10px] font-bold text-rose-500">{errors.sellingPrice}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Current Stock */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Current Stock Units *</label>
                    <input
                      type="number"
                      required
                      disabled={isSaving}
                      value={formData.currentStock}
                      onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })}
                      className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 disabled:bg-slate-50/50 ${
                        errors.currentStock 
                          ? 'border-rose-350 text-rose-800 bg-rose-50/20' 
                          : 'border-slate-200 focus:border-indigo-500 focus:ring-1'
                      }`}
                      placeholder="E.g., 24"
                    />
                    {errors.currentStock && <p className="text-[10px] font-bold text-rose-500">{errors.currentStock}</p>}
                  </div>

                  {/* Minimum alert */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Minimum Alert Threshold *</label>
                    <input
                      type="number"
                      required
                      disabled={isSaving}
                      value={formData.minimumStockAlert}
                      onChange={(e) => setFormData({ ...formData, minimumStockAlert: e.target.value })}
                      className={`w-full rounded-xl border py-2.5 px-3.5 text-xs font-medium focus:outline-none transition disabled:opacity-60 disabled:bg-slate-50/50 ${
                        errors.minimumStockAlert 
                          ? 'border-rose-350 text-rose-800 bg-rose-50/20' 
                          : 'border-slate-200 focus:border-indigo-500 focus:ring-1'
                      }`}
                      placeholder="E.g., 5"
                    />
                    {errors.minimumStockAlert && <p className="text-[10px] font-bold text-rose-500">{errors.minimumStockAlert}</p>}
                  </div>
                </div>

                {/* Show status selection only when editing an existing product */}
                {editingProduct && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Product Status *</label>
                    <select
                      disabled={isSaving}
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3.5 text-xs font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 transition disabled:opacity-60 disabled:bg-slate-50/50 cursor-pointer text-slate-700 bg-white"
                    >
                      <option value="active">Active (Available for sales/procurements)</option>
                      <option value="inactive">Inactive / Retired (Archived and read-only)</option>
                    </select>
                  </div>
                )}

                {/* Submit / actions */}
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
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer font-semibold disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></span>
                        <span>Saving Catalog...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>{editingProduct ? 'Save Product' : 'Catalog Item'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION SYSTEM MODAL */}
      <AnimatePresence>
        {productToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
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
                    Purge Product Catalog Record?
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Are you absolutely certain you want to permanently delete product descriptor{' '}
                    <strong className="text-slate-900 font-extrabold">"{productToDelete.name}"</strong>? 
                    This deletion will erase SKU registries, classifications, and all recorded inventory counts.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setProductToDelete(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer disabled:opacity-40"
                  >
                    Cancel, Keep Record
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleConfirmDeleteField}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 transition shadow-xs hover:shadow-md cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-75"
                  >
                    {isSaving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></span>
                        <span>Purging Catalog...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        <span>Yes, Purge Catalog</span>
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
