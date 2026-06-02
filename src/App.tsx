import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Download,
  Upload,
  RotateCcw,
  TrendingUp,
  Box,
  DollarSign,
  MapPin,
  X,
  ChevronDown,
  ChevronUp,
  Users,
  Truck,
  ShoppingBag,
  LayoutDashboard,
  BarChart3,
  ShoppingCart,
} from 'lucide-react';

import { Product, ActivityLog, Supplier } from './types';
import { INITIAL_PRODUCTS, INITIAL_LOGS, INITIAL_SUPPLIERS } from './data';
import MetricCard from './components/MetricCard';
import ItemForm from './components/ItemForm';
import ActivityHistory from './components/ActivityHistory';
import SupplierContact from './components/SupplierContact';
import CustomerManagement from './components/CustomerManagement';
import SupplierManagement from './components/SupplierManagement';
import ProductManagement from './components/ProductManagement';
import SalesManagement from './components/SalesManagement';
import ProcurementManagement from './components/ProcurementManagement';
import Dashboard from './components/Dashboard';
import ReportsPage from './components/ReportsPage';
import { db, OperationType, handleFirestoreError, logSystemActivity } from './lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

export default function App() {
  // --- Core Persistent State ---
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('inventory_products');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });

  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    const saved = localStorage.getItem('inventory_suppliers');
    return saved ? JSON.parse(saved) : INITIAL_SUPPLIERS;
  });

  const [logs, setLogs] = useState<ActivityLog[]>(() => {
    const saved = localStorage.getItem('inventory_logs');
    return saved ? JSON.parse(saved) : INITIAL_LOGS;
  });

  // --- Search, Filter & Sort State ---
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [sortBy, setBy] = useState<'name' | 'sku' | 'price' | 'quantity' | 'lastUpdated'>('lastUpdated');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // --- Modal / Active Interaction State ---
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'customers' | 'suppliers' | 'products' | 'sales' | 'procurement' | 'reports'>('dashboard');

  // --- Reference Nodes ---
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Real-time Firestore Sync ---
  useEffect(() => {
    // 1. Products Sync
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productsList: Product[] = [];
      snapshot.forEach((docSnap) => {
        productsList.push(docSnap.data() as Product);
      });
      
      if (productsList.length > 0) {
        setProducts(productsList);
      } else {
        // If Firestore is empty, bootstrap with standard products
        INITIAL_PRODUCTS.forEach(async (prod) => {
          try {
            await setDoc(doc(db, 'products', prod.id), prod);
          } catch (e) {
            console.error("Failed to seed products to Firestore", e);
          }
        });
        setProducts(INITIAL_PRODUCTS);
      }
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'products');
      } catch (err: any) {
        setFeedback({ message: `Firestore Read Error: ${err.message}`, type: 'error' });
      }
    });

    // 2. Suppliers Sync
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const suppliersList: Supplier[] = [];
      snapshot.forEach((docSnap) => {
        suppliersList.push(docSnap.data() as Supplier);
      });
      
      if (suppliersList.length > 0) {
        setSuppliers(suppliersList);
      } else {
        INITIAL_SUPPLIERS.forEach(async (supplier) => {
          try {
            await setDoc(doc(db, 'suppliers', supplier.id), supplier);
          } catch (e) {
            console.error("Failed to seed suppliers", e);
          }
        });
        setSuppliers(INITIAL_SUPPLIERS);
      }
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'suppliers');
      } catch (err: any) {
        console.error("Suppliers Sync Error", err);
      }
    });

    // 3. Logs Sync
    const unsubLogs = onSnapshot(collection(db, 'logs'), (snapshot) => {
      const logsList: ActivityLog[] = [];
      snapshot.forEach((docSnap) => {
        logsList.push(docSnap.data() as ActivityLog);
      });
      
      if (logsList.length > 0) {
        const sorted = logsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setLogs(sorted);
      } else {
        INITIAL_LOGS.forEach(async (log) => {
          try {
            await setDoc(doc(db, 'logs', log.id), log);
          } catch (e) {
            console.error("Failed to seed logs", e);
          }
        });
        setLogs(INITIAL_LOGS);
      }
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'logs');
      } catch (err: any) {
        console.error("Logs Sync Error", err);
      }
    });

    return () => {
      unsubProducts();
      unsubSuppliers();
      unsubLogs();
    };
  }, []);

  // --- Autosave to LocalStorage for offline resilience ---
  useEffect(() => {
    localStorage.setItem('inventory_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('inventory_suppliers', JSON.stringify(suppliers));
  }, [suppliers]);

  useEffect(() => {
    localStorage.setItem('inventory_logs', JSON.stringify(logs));
  }, [logs]);

  // --- Feedback timer ---
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // --- Derived Categories ---
  const categories: string[] = ['All', ...Array.from(new Set(products.map((p) => p.category))).map(String)];

  // --- Global Metrics ---
  const totalProducts = products.length;
  const totalStockQuantity = products.reduce((acc, p) => acc + p.currentStock, 0);
  const totalValuation = products.reduce((acc, p) => acc + p.sellingPrice * p.currentStock, 0);
  const lowStockItemsCount = products.filter((p) => p.currentStock <= p.minimumStockAlert).length;

  const lowStockList = products.filter((p) => p.currentStock <= p.minimumStockAlert);

  // --- Quick Stock Increments ---
  const handleQuickQuantityAdjust = async (productId: string, delta: number) => {
    const productToUpdate = products.find((p) => p.id === productId);
    if (!productToUpdate) return;

    const newQty = productToUpdate.currentStock + delta;
    if (newQty < 0) {
      setFeedback({ message: `Cannot decrease stock level below 0 for ${productToUpdate.name}.`, type: 'error' });
      return;
    }

    const timestamp = new Date().toISOString();
    const updatedProduct: Product = {
      ...productToUpdate,
      currentStock: newQty,
    };

    // Log activity
    const logEntry: ActivityLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      itemId: productToUpdate.id,
      itemName: productToUpdate.name,
      type: 'stock_change',
      description: `Adjusted quantity from ${productToUpdate.currentStock} to ${newQty} (${delta > 0 ? '+' : ''}${delta})`,
      quantityDifference: delta,
      timestamp,
    };

    try {
      await setDoc(doc(db, 'products', updatedProduct.id), updatedProduct);
      await setDoc(doc(db, 'logs', logEntry.id), logEntry);
      await logSystemActivity(
        "Stock updated",
        `Adjusted stock level for item "${productToUpdate.name}" (SKU: ${productToUpdate.sku}) from ${productToUpdate.currentStock} to ${newQty} (${delta > 0 ? '+' : ''}${delta})`
      );
      setFeedback({ message: `Level updated for ${productToUpdate.name} (${newQty} units total).`, type: 'success' });
    } catch (e) {
      try {
        handleFirestoreError(e, OperationType.WRITE, `products/${productId}`);
      } catch (err: any) {
        setFeedback({ message: `Firestore Write Error: ${err.message}`, type: 'error' });
      }
    }
  };

  // --- Create or Update Dispatch ---
  const handleSaveItem = async (formData: Omit<Product, 'id' | 'createdDate'> & { id?: string }) => {
    const timestamp = new Date().toISOString();

    if (formData.id) {
      // Edit mode
      const existingProduct = products.find((p) => p.id === formData.id);
      if (!existingProduct) return;

      const originalQty = existingProduct.currentStock;
      const updatedQty = formData.currentStock;
      let logMsg = `Modified fields for ${formData.name}`;

      if (originalQty !== updatedQty) {
        logMsg = `Adjusted Quantity from ${originalQty} to ${updatedQty} during property update.`;
      }

      const updatedProduct: Product = {
        ...existingProduct,
        ...formData,
        id: formData.id,
      };

      const logEntry: ActivityLog = {
        id: `log-edit-${Date.now()}`,
        itemId: updatedProduct.id,
        itemName: updatedProduct.name,
        type: originalQty !== updatedQty ? 'stock_change' : 'edit',
        description: logMsg,
        quantityDifference: originalQty !== updatedQty ? updatedQty - originalQty : undefined,
        timestamp,
      };

      try {
        await setDoc(doc(db, 'products', updatedProduct.id), updatedProduct);
        await setDoc(doc(db, 'logs', logEntry.id), logEntry);
        await logSystemActivity(
          "Product edited",
          `Edited details for inventory product: "${updatedProduct.name}" (SKU: ${updatedProduct.sku}). Stock level: ${updatedProduct.currentStock} units.`
        );
        if (originalQty !== updatedQty) {
          await logSystemActivity(
            "Stock updated",
            `Adjusted stock level for product "${updatedProduct.name}" from ${originalQty} to ${updatedQty} during details edit.`
          );
        }
        setFeedback({ message: `${formData.name} updated successfully.`, type: 'success' });
      } catch (e) {
        try {
          handleFirestoreError(e, OperationType.WRITE, `products/${formData.id}`);
        } catch (err: any) {
          setFeedback({ message: `Firestore Error: ${err.message}`, type: 'error' });
        }
      }
    } else {
      // Add mode
      const newProductId = `prod-${Date.now()}`;
      const newProduct: Product = {
        id: newProductId,
        name: formData.name,
        sku: formData.sku,
        category: formData.category,
        sellingPrice: formData.sellingPrice,
        purchasePrice: formData.purchasePrice,
        currentStock: formData.currentStock,
        minimumStockAlert: formData.minimumStockAlert,
        supplierName: formData.supplierName,
        supplierEmail: formData.supplierEmail,
        location: formData.location,
        description: formData.description,
        createdDate: timestamp,
        status: 'active',
      };

      const logEntry: ActivityLog = {
        id: `log-add-${Date.now()}`,
        itemId: newProduct.id,
        itemName: newProduct.name,
        type: 'add',
        description: `Catalogs new product: ${newProduct.name} (SKU: ${newProduct.sku})`,
        timestamp,
      };

      try {
        await setDoc(doc(db, 'products', newProduct.id), newProduct);
        await setDoc(doc(db, 'logs', logEntry.id), logEntry);
        await logSystemActivity(
          "Product added",
          `Added new inventory product: "${newProduct.name}" (SKU: ${newProduct.sku}, Price: $${newProduct.sellingPrice}, Initial Stock: ${newProduct.currentStock} units)`
        );
        setFeedback({ message: `${newProduct.name} successfully catalogs.`, type: 'success' });
      } catch (e) {
        try {
          handleFirestoreError(e, OperationType.WRITE, `products/${newProduct.id}`);
        } catch (err: any) {
          setFeedback({ message: `Firestore Error: ${err.message}`, type: 'error' });
        }
      }
    }
  };

  // --- Deletion Flow ---
  const handleDeleteItem = async (itemId: string) => {
    const productToDelete = products.find((p) => p.id === itemId);
    if (!productToDelete) return;

    if (confirm(`Are you absolutely sure you want to remove ${productToDelete.name} from inventory records?`)) {
      const logEntry: ActivityLog = {
        id: `log-del-${Date.now()}`,
        itemId: productToDelete.id,
        itemName: productToDelete.name,
        type: 'delete',
        description: `Removed product records (SKU: ${productToDelete.sku})`,
        timestamp: new Date().toISOString(),
      };

      try {
        await deleteDoc(doc(db, 'products', itemId));
        await setDoc(doc(db, 'logs', logEntry.id), logEntry);
        setFeedback({ message: `${productToDelete.name} removed from registry.`, type: 'success' });
      } catch (e) {
        try {
          handleFirestoreError(e, OperationType.WRITE, `products/${itemId}`);
        } catch (err: any) {
          setFeedback({ message: `Firestore Error: ${err.message}`, type: 'error' });
        }
      }
    }
  };

  // --- Filter and Sort Core Execution ---
  const filteredItems = products
    .filter((item) => {
      const query = search.toLowerCase();
      const matchesSearch =
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) ||
        (item.location || '').toLowerCase().includes(query) ||
        (item.supplierName || '').toLowerCase().includes(query);

      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;

      let matchesStatus = true;
      if (stockFilter === 'in_stock') {
        matchesStatus = item.currentStock > item.minimumStockAlert;
      } else if (stockFilter === 'low_stock') {
        matchesStatus = item.currentStock > 0 && item.currentStock <= item.minimumStockAlert;
      } else if (stockFilter === 'out_of_stock') {
        matchesStatus = item.currentStock === 0;
      }

      return matchesSearch && matchesCategory && matchesStatus;
    })
    .sort((a, b) => {
      const keyA = sortBy === 'price' ? 'sellingPrice' : sortBy === 'quantity' ? 'currentStock' : sortBy === 'lastUpdated' ? 'createdDate' : sortBy;
      const keyB = sortBy === 'price' ? 'sellingPrice' : sortBy === 'quantity' ? 'currentStock' : sortBy === 'lastUpdated' ? 'createdDate' : sortBy;
      
      let valA = (a as any)[keyA] ?? '';
      let valB = (b as any)[keyB] ?? '';

      if (typeof valA === 'string') {
        valA = (valA as string).toLowerCase();
        valB = (valB as string).toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const handleSortSelection = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setBy(field);
      setSortOrder('desc');
    }
  };

  // --- Reset Entire Local Database ---
  const handleResetDemoData = async () => {
    if (confirm('This action resets current stock and logs to the original initial setup. Proceed?')) {
      try {
        // Overwrite and clear documents
        for (const product of products) {
          try {
            await deleteDoc(doc(db, 'products', product.id));
          } catch (err) {}
        }
        for (const supplier of suppliers) {
          try {
            await deleteDoc(doc(db, 'suppliers', supplier.id));
          } catch (err) {}
        }
        for (const log of logs) {
          try {
            await deleteDoc(doc(db, 'logs', log.id));
          } catch (err) {}
        }

        // Write initial defaults to Firestore
        for (const product of INITIAL_PRODUCTS) {
          await setDoc(doc(db, 'products', product.id), product);
        }
        for (const supplier of INITIAL_SUPPLIERS) {
          await setDoc(doc(db, 'suppliers', supplier.id), supplier);
        }
        for (const log of INITIAL_LOGS) {
          await setDoc(doc(db, 'logs', log.id), log);
        }

        localStorage.clear();
        setFeedback({ message: 'Database reset to default template products.', type: 'success' });
      } catch (e) {
        try {
          handleFirestoreError(e, OperationType.WRITE, 'reset');
        } catch (err: any) {
          setFeedback({ message: `Reset Failed: ${err.message}`, type: 'error' });
        }
      }
    }
  };

  // --- Securely Clear Audit Logs ---
  const handleClearLogs = async () => {
    if (confirm('Clear all system audit logs?')) {
      try {
        for (const log of logs) {
          await deleteDoc(doc(db, 'logs', log.id));
        }
        setFeedback({ message: 'Cleared system audit logs.', type: 'success' });
      } catch (e) {
        setFeedback({ message: 'Failed to clear logs on Firestore database.', type: 'error' });
      }
    }
  };

  // --- JSON Data Export ---
  const handleExportJSON = () => {
    try {
      const dataStr = JSON.stringify(
        {
          products,
          suppliers,
          logs,
          exportedAt: new Date().toISOString(),
        },
        null,
        2
      );
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = `inventory-records-${new Date().toISOString().split('T')[0]}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      setFeedback({ message: 'Backup JSON generated and downloaded.', type: 'success' });
    } catch {
      setFeedback({ message: 'Failed to generate backup JSON.', type: 'error' });
    }
  };

  // --- JSON Data Import ---
  const processImportText = async (text: string) => {
    try {
      const parsed = JSON.parse(text);
      const importedProducts = parsed.products || parsed.items;
      if (importedProducts && Array.isArray(importedProducts)) {
        // Map products (robust against legacy property names as well)
        const productsList: Product[] = importedProducts.map((p: any) => {
          return {
            id: p.id,
            name: p.name,
            sku: p.sku,
            category: p.category,
            sellingPrice: p.sellingPrice ?? p.price ?? 0,
            purchasePrice: p.purchasePrice ?? (p.price ? p.price * 0.6 : 0),
            currentStock: p.currentStock ?? p.quantity ?? 0,
            minimumStockAlert: p.minimumStockAlert ?? p.minQuantity ?? 0,
            supplierName: p.supplierName ?? 'N/A',
            supplierEmail: p.supplierEmail ?? 'N/A',
            location: p.location ?? 'Unassigned',
            description: p.description ?? '',
            createdDate: p.createdDate ?? p.lastUpdated ?? p.createdAt ?? new Date().toISOString(),
            status: p.status ?? 'active',
          };
        });
        
        // Write all loaded products to Firestore
        for (const prod of productsList) {
          await setDoc(doc(db, 'products', prod.id), prod);
        }

        if (parsed.suppliers && Array.isArray(parsed.suppliers)) {
          for (const supplier of parsed.suppliers) {
            await setDoc(doc(db, 'suppliers', supplier.id), supplier);
          }
        }

        const logEntry: ActivityLog = {
          id: `log-import-${Date.now()}`,
          itemName: 'Bulk Database Import',
          itemId: 'system',
          type: 'add',
          description: `Loaded ${productsList.length} products from JSON file.`,
          timestamp: new Date().toISOString(),
        };

        await setDoc(doc(db, 'logs', logEntry.id), logEntry);
        setFeedback({ message: `Successfully loaded ${productsList.length} products.`, type: 'success' });
        setShowImport(false);
      } else {
        setFeedback({ message: 'Invalid file format. Missing "products" or "items" array structure.', type: 'error' });
      }
    } catch (e: any) {
      setFeedback({ message: `Parsing failed or Firestore writing failed: ${e.message || e}`, type: 'error' });
    }
  };

  // File picker handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const txt = event.target?.result as string;
      processImportText(txt);
    };
    reader.readAsText(file);
  };

  // Drag and Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setFeedback({ message: 'Only standard JSON array backups are supported.', type: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const txt = event.target?.result as string;
      processImportText(txt);
    };
    reader.readAsText(file);
  };

  // --- UI Color Helpers ---
  const getBadgeColors = (qty: number, min: number) => {
    if (qty === 0) {
      return 'bg-rose-50 text-rose-700 border-rose-100';
    }
    if (qty <= min) {
      return 'bg-amber-50 text-amber-700 border-amber-100';
    }
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  };

  const getBadgeValue = (qty: number, min: number) => {
    if (qty === 0) return 'Out of Stock';
    if (qty <= min) return 'Low Stock';
    return 'In Stock';
  };

  return (
    <div id="inventory-app-container" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* HEADER BAR */}
      <div id="dashboard-header" className="print:hidden flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6 mb-2">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0">
              <Box className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-sans text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center flex-wrap gap-2 leading-none">
                NEXUS INVENTORY <span className="text-slate-400 font-normal text-xs uppercase tracking-widest bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">v4.2.1</span>
              </h1>
              <p className="mt-1 text-[11px] text-slate-400 font-bold tracking-widest uppercase flex items-center gap-2">
                <span>System: Online</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>User: admin_01</span>
              </p>
            </div>
          </div>
        </div>

        {/* Global Control Row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Load Sample Reset Button */}
          <button
            id="reset-demo-data-button"
            type="button"
            onClick={handleResetDemoData}
            title="Restore default product catalog"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Load Demo</span>
          </button>

          {/* Export JSON backup */}
          <button
            id="export-backup-json-button"
            type="button"
            onClick={handleExportJSON}
            title="Download full catalog backup in JSON"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Backup</span>
          </button>

          {/* Import JSON backup panel switcher */}
          <button
            id="import-backup-toggle-button"
            type="button"
            onClick={() => setShowImport((prev) => !prev)}
            title="Import inventory data from JSON backup"
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              showImport
                ? 'bg-slate-100 text-slate-700 border-slate-355'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import JSON</span>
          </button>

          {/* Main Primary Addition Button */}
          <button
            id="register-new-item-button"
            type="button"
            onClick={() => {
              setProductToEdit(null);
              setIsFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Register Product</span>
          </button>
        </div>
      </div>

      {/* PRIMARY NAVIGATION TABS */}
      <div className="print:hidden flex bg-slate-100 p-1 rounded-2xl max-w-3xl border border-slate-200 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'dashboard'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          <span>Dashboard</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('inventory')}
          className={`flex-1 min-w-[110px] flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'inventory'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Box className="h-4 w-4" />
          <span>Inventory Desk</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('customers')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'customers'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Customers</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('suppliers')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'suppliers'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck className="h-4 w-4" />
          <span>Suppliers</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'products'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingBag className="h-4 w-4" />
          <span>Products</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sales')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'sales'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          <span>Sales</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('procurement')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'procurement'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          <span>Procurement</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'reports'
              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Reports</span>
        </button>
      </div>

      {/* FEEDBACK STATUS BANNER */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            id="feedback-popup-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`rounded-2xl border p-4 text-xs font-medium flex items-center justify-between shadow-sm ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                : 'bg-rose-50 border-rose-100 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600" />
              )}
              <span>{backupFeedbackMessage(feedback.message)}</span>
            </div>
            <button
              id="close-feedback-button"
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAG AND DROP COLLAPSIBLE PANELS SECTION */}
      <AnimatePresence>
        {showImport && (
          <motion.div
            id="upload-dropzone-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-2xl border-2 border-dashed p-8 text-center transition cursor-pointer flex flex-col items-center justify-center ${
                dragActive
                  ? 'border-slate-800 bg-slate-50/80'
                  : 'border-slate-200 bg-white hover:bg-slate-50/45'
              }`}
            >
              <Upload className={`h-8 w-8 mb-3 ${dragActive ? 'text-slate-800' : 'text-slate-400'}`} />
              <p className="font-sans text-xs font-bold text-slate-700">
                Drag and drop your JSON backup file here, or click to browse
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Supports standard formats generated by the export facility
              </p>
              <input
                id="file-import-hidden-input"
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {activeTab === 'dashboard' ? (
        <Dashboard />
      ) : activeTab === 'inventory' ? (
        <>
          {/* METRICS BENTO GRID */}
          <div id="metrics-bento-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Consolidated Portfolio Value"
              value={`$${totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
              subtext="Net stock asset valuation face"
              trend="Real-Time"
              trendType="neutral"
              colorClass="border-emerald-100 bg-emerald-50/10"
            />
            <MetricCard
              title="Cataloged Stock Level"
              value={totalStockQuantity.toLocaleString('en-US')}
              icon={<Box className="h-5 w-5 text-indigo-600" />}
              subtext="Total items actively in bins"
              trend={`${totalProducts} Products`}
              trendType="neutral"
              colorClass="border-indigo-100 bg-indigo-50/10"
            />
            <MetricCard
              title="Procurement Alerts"
              value={lowStockItemsCount}
              icon={<AlertCircle className="h-5 w-5 text-rose-600" />}
              subtext="Products below safe limits"
              trend={lowStockItemsCount > 0 ? 'Critical' : 'All Clear'}
              trendType={lowStockItemsCount > 0 ? 'negative' : 'positive'}
              colorClass={lowStockItemsCount > 0 ? 'border-rose-100 bg-rose-50/25' : 'border-slate-100'}
            />
            <MetricCard
              title="Dynamic Categories"
              value={categories.length - 1}
              icon={<TrendingUp className="h-5 w-5 text-amber-600" />}
              subtext="Catalog departments tracked"
              trend="Organized"
              trendType="neutral"
              colorClass="border-slate-100"
            />
          </div>

          {/* MAIN DESK GRID */}
          <div id="main-working-grid" className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* LEFT COMPONENT: Search, Filters & Data Table */}
            <div id="table-working-desk" className="lg:col-span-2 space-y-6">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
                {/* Filter controls row */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-sans text-sm font-bold tracking-tight text-slate-800">
                      Active Asset Registry
                    </h3>
                    <p className="text-xs text-slate-400">Search, adjust, and audit product status parameters</p>
                  </div>

                  {/* Mini filters summary display */}
                  <span className="text-[11px] font-semibold text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1 self-start">
                    Showing {filteredItems.length} of {totalProducts} Cataloged
                  </span>
                </div>

                {/* Searching Filters Center */}
                <div className="flex flex-col gap-3 sm:flex-row">
                  {/* Search text filter */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="table-search-input"
                      type="text"
                      placeholder="Query product name, SKU, or storage location..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 outline-none text-xs transition focus:border-slate-400 bg-slate-50/50"
                    />
                    {search && (
                      <button
                        id="clear-search-button"
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Category filter */}
                  <div className="min-w-[140px]">
                    <div className="relative">
                      <select
                        id="table-category-select-filter"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-slate-200 text-xs px-3.5 py-2.5 outline-none bg-slate-50/50 font-semibold text-slate-600 transition focus:border-slate-400 pr-8"
                      >
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat === 'All' ? 'All Categories' : cat}
                          </option>
                        ))}
                      </select>
                      <Filter className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Status Alert Filter */}
                  <div className="min-w-[140px]">
                    <select
                      id="table-stock-status-select-filter"
                      value={stockFilter}
                      onChange={(e) => setStockFilter(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 text-xs px-3.5 py-2.5 outline-none bg-slate-50/50 font-semibold text-slate-600 transition focus:border-slate-400"
                    >
                      <option value="all">All Stock Status</option>
                      <option value="in_stock">In Stock (Safe)</option>
                      <option value="low_stock">Low Stock Alerts</option>
                      <option value="out_of_stock">Out of Stock</option>
                    </select>
                  </div>
                </div>

                {/* Live Inventory Data Grid */}
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table id="inventory-data-grid" className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/40 text-slate-400 select-none">
                        <th
                          id="header-name"
                          onClick={() => handleSortSelection('name')}
                          className="cursor-pointer p-4 font-bold tracking-wider uppercase text-[10px] hover:text-slate-700 transition"
                        >
                          <div className="flex items-center gap-1">
                            <span>Product</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </th>
                        <th
                          id="header-category"
                          className="p-4 font-bold tracking-wider uppercase text-[10px]"
                        >
                          Category
                        </th>
                        <th
                          id="header-price"
                          onClick={() => handleSortSelection('price')}
                          className="cursor-pointer p-4 font-bold tracking-wider uppercase text-[10px] hover:text-slate-700 transition"
                        >
                          <div className="flex items-center gap-1">
                            <span>Unit Price</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </th>
                        <th
                          id="header-quantity"
                          onClick={() => handleSortSelection('quantity')}
                          className="cursor-pointer p-4 font-bold tracking-wider uppercase text-[10px] hover:text-slate-700 transition text-center"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>Level</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </th>
                        <th id="header-status" className="p-4 font-bold tracking-wider uppercase text-[10px] text-center">
                          Status
                        </th>
                        <th id="header-actions" className="p-4 font-bold tracking-wider uppercase text-[10px] text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredItems.length === 0 ? (
                        <tr id="empty-table-row">
                          <td colSpan={6} className="p-10 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center">
                              <AlertCircle className="h-8 w-8 text-slate-200 mb-2" />
                              <p className="font-semibold text-slate-500 text-xs">No cataloged products match searches</p>
                              <p className="text-[10px] text-slate-350 mt-1">Try widening your active filter queries</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => (
                          <tr
                            id={`inventory-row-${item.id}`}
                            key={item.id}
                            className="group hover:bg-slate-55/15 hover:bg-slate-50/30 transition-colors"
                          >
                            {/* Name & SKU & Storage location */}
                            <td className="p-4 max-w-[200px]">
                              <div>
                                <p className="font-bold text-slate-800 text-xs truncate group-hover:text-slate-900 leading-tight">
                                  {item.name}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="font-mono text-[9px] text-slate-400 font-bold bg-slate-50 border border-slate-100 rounded px-1 tracking-wider uppercase">
                                    {item.sku}
                                  </span>
                                  <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-400">
                                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                                    {item.location || 'Unassigned'}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Category */}
                            <td className="p-4 text-slate-500 font-medium">
                              {item.category}
                            </td>

                            {/* Price */}
                            <td className="p-4 font-mono text-slate-700 font-bold">
                              ${item.sellingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            {/* Live Quantity Adjuster */}
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  id={`adjust-minus-${item.id}`}
                                  type="button"
                                  onClick={() => handleQuickQuantityAdjust(item.id, -1)}
                                  className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition shadow-2xs"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                <span className="inline-block w-8 font-mono text-xs font-bold text-slate-800">
                                  {item.currentStock}
                                </span>
                                <button
                                  id={`adjust-plus-${item.id}`}
                                  type="button"
                                  onClick={() => handleQuickQuantityAdjust(item.id, 1)}
                                  className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition shadow-2xs"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>

                            {/* Status badge */}
                            <td className="p-4 text-center">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${getBadgeColors(
                                  item.currentStock,
                                  item.minimumStockAlert
                                )}`}
                              >
                                <span className="mr-1 h-1 w-1 rounded-full bg-current" />
                                {getBadgeValue(item.currentStock, item.minimumStockAlert)}
                              </span>
                            </td>

                            {/* Row quick action buttons */}
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                                <button
                                  id={`action-edit-${item.id}`}
                                  type="button"
                                  onClick={() => {
                                    setProductToEdit(item);
                                    setIsFormOpen(true);
                                  }}
                                  title="Edit item parameters"
                                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-100 transition shadow-2xs"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  id={`action-delete-${item.id}`}
                                  type="button"
                                  onClick={() => handleDeleteItem(item.id)}
                                  title="Delete product catalog"
                                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-slate-50 hover:text-rose-600 hover:border-rose-100 transition shadow-2xs"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* RIGHT MODULE: Sub components (Suppliers and History) */}
            <div id="widgets-working-desk" className="space-y-6">
              {/* Supplier Directory desk */}
              <SupplierContact suppliers={suppliers} lowStockItems={lowStockList} />

              {/* Audit Trail list */}
              <ActivityHistory logs={logs} onClear={handleClearLogs} />
            </div>
          </div>
        </>
      ) : activeTab === 'customers' ? (
        <CustomerManagement />
      ) : activeTab === 'suppliers' ? (
        <SupplierManagement />
      ) : activeTab === 'products' ? (
        <ProductManagement />
      ) : activeTab === 'sales' ? (
        <SalesManagement />
      ) : activeTab === 'procurement' ? (
        <ProcurementManagement />
      ) : (
        <ReportsPage />
      )}

      {/* RENDER FORM OVERLAY MODAL */}
      <ItemForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSaveItem}
        itemToEdit={productToEdit}
        categories={categories.filter((cat) => cat !== 'All')}
      />

      {/* Footer Bar */}
      <footer className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap justify-between items-center gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">
        <div className="flex gap-6">
          <span>System: Online</span>
          <span>Sync: 0.04s Latency</span>
          <span>Region: Europe-West3</span>
        </div>
        <div>© 2026 Nexus Intelligence Systems Inc.</div>
      </footer>
    </div>
  );
}

// Simple message cleaner helper (optional)
function backupFeedbackMessage(msg: string) {
  return msg;
}
