import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  AlertTriangle, 
  Users, 
  Truck, 
  Layers, 
  ArrowUpRight, 
  Clock, 
  Calendar, 
  Sparkles, 
  Mail, 
  ArrowRight, 
  PieChart as PieIcon, 
  BarChart as BarIcon,
  ChevronRight,
  RefreshCw,
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Sale, Customer, Product, Supplier, Capital, CashLedgerEntry } from '../types';

export default function Dashboard() {
  // --- States ---
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [cashLedger, setCashLedger] = useState<any[]>([]);
  const [capital, setCapital] = useState<Capital[]>([]);
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<'all' | 'thirty_days'>('all');

  // --- Simulated Identity Policy Control ---
  const [userRole, setUserRole] = useState<'admin' | 'employee'>('admin');
  const [isCapitalModalOpen, setIsCapitalModalOpen] = useState(false);
  const [newCapAmount, setNewCapAmount] = useState('');
  const [newCapDate, setNewCapDate] = useState(new Date().toISOString().split('T')[0]);
  const [newCapNote, setNewCapNote] = useState('');
  const [capFeedback, setCapFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSaveCapital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'admin') {
      setCapFeedback({ message: 'Access Denied: Only Administrator users can add or modify business Capital.', type: 'error' });
      return;
    }
    const amt = parseFloat(newCapAmount);
    if (isNaN(amt) || amt <= 0) {
      setCapFeedback({ message: 'Please enter a valid capital investment amount.', type: 'error' });
      return;
    }
    try {
      const capId = `cap-${Date.now()}`;
      await setDoc(doc(db, 'capital', capId), {
        id: capId,
        amount: amt,
        date: newCapDate,
        note: newCapNote,
        createdBy: 'admin_01'
      });
      setCapFeedback({ message: 'Capital investment successfully logged & synchronized!', type: 'success' });
      setNewCapAmount('');
      setNewCapNote('');
      // Log this system operation
      await setDoc(doc(db, 'Logs', `log-${Date.now()}`), {
        id: `log-${Date.now()}`,
        action: 'Capital contribution',
        user: 'admin_01',
        timestamp: new Date().toISOString(),
        details: `Injected manual capital contribution of $${amt.toLocaleString()} on ${newCapDate} (${newCapNote || 'No notes'})`
      });
    } catch (err: any) {
      setCapFeedback({ message: `Failed to save Capital: ${err.message}`, type: 'error' });
    }
  };

  const handleDeleteCapital = async (id: string) => {
    if (userRole !== 'admin') {
      alert('Access Denied: Only administrators can modify or delete seed capital investments.');
      return;
    }
    if (confirm('Delete this capital contribution record?')) {
      try {
        await deleteDoc(doc(db, 'capital', id));
        // Log this system operation
        await setDoc(doc(db, 'Logs', `log-${Date.now()}`), {
          id: `log-${Date.now()}`,
          action: 'Capital deletion',
          user: 'admin_01',
          timestamp: new Date().toISOString(),
          details: `Deleted capital contribution record: ${id}`
        });
      } catch (err: any) {
        alert(`Failed to delete: ${err.message}`);
      }
    }
  };

  // --- Real-time Sync listeners ---
  useEffect(() => {
    setLoading(true);

    // 1. Sync Sales
    const unsubSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
      const salesList: Sale[] = [];
      snapshot.forEach((docSnap) => {
        salesList.push(docSnap.data() as Sale);
      });
      setSales(salesList);
    }, (err) => {
      console.error("Dashboard error syncing sales", err);
    });

    // 2. Sync Products
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const prodList: Product[] = [];
      snapshot.forEach((docSnap) => {
        prodList.push(docSnap.data() as Product);
      });
      setProducts(prodList);
    }, (err) => {
      console.error("Dashboard error syncing products", err);
    });

    // 3. Sync Customers
    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const custList: Customer[] = [];
      snapshot.forEach((docSnap) => {
        custList.push(docSnap.data() as Customer);
      });
      setCustomers(custList);
    }, (err) => {
      console.error("Dashboard error syncing customers", err);
    });

    // 4. Sync Suppliers
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const supplierList: Supplier[] = [];
      snapshot.forEach((docSnap) => {
        supplierList.push(docSnap.data() as Supplier);
      });
      setSuppliers(supplierList);
    }, (err) => {
      console.error("Dashboard error syncing suppliers", err);
    });

    // 5. Sync System Logs (Firestore Logs Collection)
    const unsubLogs = onSnapshot(collection(db, 'Logs'), (snapshot) => {
      const logsList: any[] = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.exists()) {
          logsList.push(docSnap.data());
        }
      });
      // Sort by timestamp desc and keep the most recent ones
      const sortedLogs = logsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setSystemLogs(sortedLogs);
    }, (err) => {
      console.error("Dashboard error syncing Logs collection", err);
    });

    // 6. Sync Cash Ledger
    const unsubCashLedger = onSnapshot(collection(db, 'cashLedger'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.exists()) {
          list.push(docSnap.data());
        }
      });
      setCashLedger(list);
    }, (err) => {
      console.error("Dashboard error syncing cashLedger", err);
    });

    // 7. Sync Capital Collection
    const unsubCapital = onSnapshot(collection(db, 'capital'), (snapshot) => {
      const list: Capital[] = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.exists()) {
          list.push(docSnap.data() as Capital);
        }
      });
      setCapital(list);
      setLoading(false);
    }, (err) => {
      console.error("Dashboard error syncing capital", err);
      setLoading(false);
    });

    return () => {
      unsubSales();
      unsubProducts();
      unsubCustomers();
      unsubSuppliers();
      unsubLogs();
      unsubCashLedger();
      unsubCapital();
    };
  }, []);

  // --- Calculations Engine ---
  
  // Set reference dates based on metadata/local simulation time (2026-06-01)
  const simulationDateStr = "2026-06-01";
  const refDate = new Date(simulationDateStr);
  const todayStr = refDate.toISOString().split('T')[0]; // "2026-06-01"

  // 1. Today's Sales
  const todaysSalesValue = sales.filter(s => {
    if (!s.saleDate) return false;
    const datePart = s.saleDate.split('T')[0];
    return datePart === todayStr;
  }).reduce((sum, s) => sum + s.totalAmount, 0);

  // 2. Monthly Sales (June 2026)
  const currentMonthNum = refDate.getMonth(); // 5 (June)
  const currentYearNum = refDate.getFullYear(); // 2026
  const monthlySalesValue = sales.filter(s => {
    if (!s.saleDate) return false;
    const d = new Date(s.saleDate);
    return d.getMonth() === currentMonthNum && d.getFullYear() === currentYearNum;
  }).reduce((sum, s) => sum + s.totalAmount, 0);

  // 3. Total Profit (based strictly on subtotal minus costOfGoodsSold, excluding tax)
  const salesProfitValue = sales.reduce((sum, s) => {
    const saleSubtotal = s.subtotal ?? (s.quantity * (s.unitPrice ?? s.sellingPrice));
    const saleCOGS = s.costOfGoodsSold !== undefined ? s.costOfGoodsSold : (s.productPurchasePriceAtSale !== undefined ? s.productPurchasePriceAtSale : s.sellingPrice * 0.6) * s.quantity;
    return sum + (saleSubtotal - saleCOGS);
  }, 0);

  // 4. Total Purchase (Valuation of stock currently acquired in our inventory)
  const totalPurchaseValue = products.reduce((sum, p) => {
    return sum + (p.purchasePrice * p.currentStock);
  }, 0);

  // 5. Customer Due (Sum of receivables)
  const totalCustomerDue = customers.reduce((sum, c) => sum + (c.dueBalance || 0), 0);

  // 6. Supplier Due (Sum of payables)
  const totalSupplierDue = suppliers.reduce((sum, s) => sum + (s.dueBalance || 0), 0);

  // 7. Cash accounting calculations with capital support
  const startingCapital = capital.reduce((sum, entry) => sum + entry.amount, 0);
  const initialCapital = startingCapital;

  const totalInflow = cashLedger
    .filter(entry => entry.type === 'inflow')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const totalOutflow = cashLedger
    .filter(entry => entry.type === 'outflow')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const cashInHand = initialCapital + totalInflow - totalOutflow;
  const netMovement = totalInflow - totalOutflow;

  // 7. Low Stock Products list and count
  const lowStockProductsList = products.filter(p => p.status !== 'inactive' && p.currentStock <= p.minimumStockAlert);
  const lowStockCount = lowStockProductsList.length;

  // Additional stats: Overall profit margin percentage (excluding tax)
  const overallSalesSubtotal = sales.reduce((sum, s) => sum + (s.subtotal ?? (s.quantity * (s.unitPrice ?? s.sellingPrice))), 0);
  const averageProfitMargin = overallSalesSubtotal > 0 ? (salesProfitValue / overallSalesSubtotal) * 100 : 0;

  // --- Dynamic Graph Coordinates Processing (Pure Vector Line Graphs) ---
  // Generate beautiful line coordinates for daily sales trend
  const dailySalesTrendMap: Record<string, number> = {};
  
  // Initialize last 7 days of dates up to June 1, 2026 for a beautiful smooth trend chart
  for (let i = 6; i >= 0; i--) {
    const d = new Date(refDate);
    d.setDate(refDate.getDate() - i);
    const dateString = d.toISOString().split('T')[0];
    dailySalesTrendMap[dateString] = 0;
  }

  // Populate sales into trend
  sales.forEach(s => {
    if (!s.saleDate) return;
    const dateString = s.saleDate.split('T')[0];
    if (dailySalesTrendMap[dateString] !== undefined) {
      dailySalesTrendMap[dateString] += s.totalAmount;
    }
  });

  const dailyTrendData = Object.entries(dailySalesTrendMap).map(([date, val]) => ({
    label: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    value: val
  }));

  // Create smooth coordinates inside SVG viewport (e.g. 500w x 180h)
  const maxVal = Math.max(...dailyTrendData.map(d => d.value), 200);
  const widthSvg = 500;
  const heightSvg = 180;
  const paddingX = 40;
  const paddingY = 20;

  const points = dailyTrendData.map((d, index) => {
    const x = paddingX + (index * (widthSvg - paddingX * 2)) / (dailyTrendData.length - 1);
    const y = heightSvg - paddingY - (d.value / maxVal) * (heightSvg - paddingY * 2);
    return `${x},${y}`;
  }).join(' ');

  // Underneath area coordinates for line fill
  const areaPoints = points ? `${paddingX},${heightSvg - paddingY} ${points} ${widthSvg - paddingX},${heightSvg - paddingY}` : '';

  return (
    <div id="nexus-intel-dashboard-root" className="space-y-8 animate-fade-in font-sans pb-12">
      
      {/* HEADER BAR AND DATE INDICES */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
            Operational Intelligence Dashboard
          </h2>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold font-mono">
            Audit Date: June 01, 2026 • Real-time FireStore Calculations active
          </p>
        </div>

        {/* Action tags */}
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 w-fit shadow-2xs">
          <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span>Last automated sync: {loading ? 'Computing...' : 'Now'}</span>
          {loading && <RefreshCw className="w-3 h-3 text-indigo-500 animate-spin ml-2" />}
        </div>
      </div>

      {/* --- CASH & CAPITAL ACCOUNTING LIQUIDITY DESK --- */}
      <div id="liquidity-desk-widget" className="bg-gradient-to-r from-emerald-50/70 to-teal-50/30 rounded-[2rem] border border-emerald-100 p-6 md:p-8 shadow-2xs flex flex-col xl:flex-row justify-between items-stretch gap-6">
        <div className="space-y-4 flex flex-col justify-between xl:w-1/4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] font-black tracking-widest text-emerald-800 uppercase">Capital Liquidity Desk</span>
            </div>
            <h3 className="text-xs text-slate-500 font-medium leading-relaxed">
              Real-time balance sheets monitoring owner starting capital, net trading movements, and instant liquid vault reserves.
            </h3>
          </div>
          
          <div className="space-y-2 pt-2">
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Simulating:</span>
              <select 
                value={userRole} 
                onChange={(e) => setUserRole(e.target.value as 'admin' | 'employee')}
                className="bg-white border border-slate-200 text-slate-700 font-bold rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="admin">System Admin</option>
                <option value="employee">Standard Employee</option>
              </select>
            </div>
            <button 
              onClick={() => setIsCapitalModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow-3xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Modify Capital</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 xl:w-3/4">
          {/* Starting Capital Widget */}
          <div className="bg-white rounded-2xl p-5 border border-emerald-100/60 shadow-3xs flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Starting Capital</span>
              <p className="text-2xl font-black text-slate-900 mt-2 font-mono tracking-tight">
                ${startingCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-medium font-sans">Owner Corporate Equity</span>
              <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[8px] font-mono">
                {capital.length} Injections
              </span>
            </div>
          </div>

          {/* Current Cash Widget */}
          <div className="bg-white rounded-2xl p-5 border border-emerald-100/60 shadow-3xs flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-sans">Current Cash</span>
              <p className="text-2xl font-black text-slate-900 mt-2 font-mono tracking-tight">
                ${cashInHand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-medium font-sans">Liquid Vault Reserves</span>
              <span className={`font-black px-1.5 py-0.5 rounded text-[9px] font-mono ${cashInHand >= 0 ? "bg-teal-50 text-teal-700" : "bg-rose-50 text-rose-700"}`}>
                {cashInHand >= 0 ? "SURPLUS" : "DEFICIT"}
              </span>
            </div>
          </div>

          {/* Net Movement Widget */}
          <div className="bg-white rounded-2xl p-5 border border-emerald-100/60 shadow-3xs flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-sans">Net Movement</span>
              <p className={`text-2xl font-black mt-2 font-mono tracking-tight ${netMovement >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {netMovement >= 0 ? '+' : ''}${netMovement.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-medium font-sans">Combined Trade Cashflow</span>
              <span className={`font-black px-1.5 py-0.5 rounded text-[8px] font-mono ${netMovement >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {netMovement >= 0 ? "INCREASING ▲" : "DECREASING ▼"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 
        8 BENTO METRICS GRID (Showcasing all calculations requested)
      */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        
        {/* CARD 1: Total Products */}
        <motion.div
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-[2rem] p-6 border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Total Products</span>
              <Layers className="h-4 w-4 text-indigo-500 opacity-70" />
            </div>
            <h3 className="text-3xl font-extrabold tracking-tight text-slate-900 pt-1">
              {products.length} Items
            </h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>In active inventory catalog</span>
            <span className="text-indigo-600 font-bold">Synced Live</span>
          </div>
        </motion.div>

        {/* CARD 2: Total Customers */}
        <motion.div
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-[2rem] p-6 border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Total Customers</span>
              <Users className="h-4 w-4 text-emerald-500 opacity-70" />
            </div>
            <h3 className="text-3xl font-extrabold tracking-tight text-slate-900 pt-1">
              {customers.length} Profiles
            </h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Registered customers</span>
            <span className="text-emerald-600 font-bold">Active CRM</span>
          </div>
        </motion.div>

        {/* CARD 3: Total Suppliers */}
        <motion.div
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-[2rem] p-6 border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Total Suppliers</span>
              <Truck className="h-4 w-4 text-sky-500 opacity-70" />
            </div>
            <h3 className="text-3xl font-extrabold tracking-tight text-slate-900 pt-1">
              {suppliers.length} Partners
            </h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Verified trade vendors</span>
            <span className="text-sky-600 font-bold">Supply Chain</span>
          </div>
        </motion.div>

        {/* CARD 4: Low Stock Products alert count */}
        <motion.div
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
          className={`rounded-[2rem] p-6 border shadow-2xs hover:shadow-xs transition flex flex-col justify-between ${
            lowStockCount > 0 
              ? 'border-rose-100 bg-rose-50/10 text-rose-950' 
              : 'border-slate-200/90 bg-white text-slate-900'
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Low Stock Products</span>
              <AlertTriangle className={`h-4 w-4 ${lowStockCount > 0 ? 'text-rose-500 animate-pulse' : 'text-slate-400'}`} />
            </div>
            <h3 className={`text-3xl font-extrabold tracking-tight pt-1 ${lowStockCount > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
              {lowStockCount} Products
            </h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Under warning thresholds</span>
            <span className={`font-bold uppercase text-[9px] px-2 py-0.5 rounded border ${
              lowStockCount > 0 
                ? 'bg-rose-50 border-rose-200 text-rose-700' 
                : 'bg-emerald-50 border-emerald-100 text-emerald-800'
            }`}>
              {lowStockCount > 0 ? 'Urgent Restock' : 'Stock Healthy'}
            </span>
          </div>
        </motion.div>

        {/* CARD 5: Total Sales Today */}
        <motion.div
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-[2rem] p-6 border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Total Sales Today</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[9px] font-extrabold border border-indigo-100">
                Live
              </span>
            </div>
            <h3 className="text-3xl font-extrabold tracking-tight text-slate-900 pt-1">
              ${todaysSalesValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-medium text-slate-400">Date: {todayStr}</span>
            <span className="text-emerald-600 font-bold">Invoiced today</span>
          </div>
        </motion.div>

        {/* CARD 6: Total Sales This Month */}
        <motion.div
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-[2rem] p-6 border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Total Sales This Month</span>
              <Calendar className="h-4 w-4 text-indigo-500 opacity-60" />
            </div>
            <h3 className="text-3xl font-extrabold tracking-tight text-slate-900 pt-1">
              ${monthlySalesValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>June 2026 Billing Run</span>
            <span className="text-indigo-600 font-bold">Active Cycle</span>
          </div>
        </motion.div>

        {/* CARD 7: Total Customer Due */}
        <motion.div
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
          className="bg-slate-900 text-white rounded-[2rem] p-6 shadow-xs hover:shadow-lg transition flex flex-col justify-between border border-slate-850"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Total Customer Due</span>
              <TrendingUp className="h-4 w-4 text-amber-400" />
            </div>
            <h3 className="text-3xl font-black tracking-tight text-white pt-1">
              ${totalCustomerDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span>Receivables Ledger</span>
            <span className="text-amber-400 font-bold font-mono">
              {customers.filter(c => c.dueBalance > 0).length} Overdue
            </span>
          </div>
        </motion.div>

        {/* CARD 8: Cumulative Profit (Adding premium calculation value) */}
        <motion.div
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-[2rem] p-6 border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Cumulative Profit</span>
              <Sparkles className="h-4 w-4 text-indigo-550 text-indigo-600" />
            </div>
            <h3 className="text-3xl font-extrabold tracking-tight text-slate-950 pt-1">
              ${salesProfitValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-450 text-slate-400">
            <span>Gross margin estimate</span>
            <span className="font-semibold text-slate-700 font-mono">{averageProfitMargin.toFixed(1)}% Avg</span>
          </div>
        </motion.div>

      </div>

      {/* CHARTS CONTAINER VISUALIZERS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        
        {/* Sales trend graphic vector */}
        <div id="dashboard-sales-trend-graph" className="lg:col-span-2 bg-white rounded-[2rem] border border-slate-200/95 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex justify-between items-center bg-white">
            <div>
              <h4 className="font-sans text-sm font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
                <BarIcon className="h-4 w-4 text-indigo-500 shrink-0" />
                7-Day Invoicing Dynamics
              </h4>
              <p className="text-[11px] text-slate-400">Vector representation of sales curves across latest calendar periods</p>
            </div>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
              Trend Analytics
            </span>
          </div>

          {/* SVG Pure Chart */}
          <div className="relative pt-2">
            {sales.length === 0 ? (
              <div className="h-[180px] flex items-center justify-center text-slate-400 text-xs">
                Log a sales record to begin trend analysis
              </div>
            ) : (
              <svg viewBox={`0 0 ${widthSvg} ${heightSvg}`} className="w-full h-[180px] max-h-[180px] overflow-visible">
                {/* Grid lines */}
                <line x1={paddingX} y1={paddingY} x2={widthSvg - paddingX} y2={paddingY} stroke="#f1f5f9" strokeDasharray="3" />
                <line x1={paddingX} y1={heightSvg / 2} x2={widthSvg - paddingX} y2={heightSvg / 2} stroke="#f1f5f9" strokeDasharray="3" />
                <line x1={paddingX} y1={heightSvg - paddingY} x2={widthSvg - paddingX} y2={heightSvg - paddingY} stroke="#e2e8f0" />

                {/* Shaded Area fill under curve */}
                <polygon points={areaPoints} fill="url(#indigo-grad)" opacity="0.12" />

                {/* Line Path */}
                <polyline
                  fill="none"
                  stroke="#4f46e5"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />

                {/* Circular Node Dots on Points */}
                {dailyTrendData.map((d, idx) => {
                  const x = paddingX + (idx * (widthSvg - paddingX * 2)) / (dailyTrendData.length - 1);
                  const y = heightSvg - paddingY - (d.value / maxVal) * (heightSvg - paddingY * 2);
                  return (
                    <g key={idx} className="group">
                      <circle
                        cx={x}
                        cy={y}
                        r="5"
                        fill="#ffffff"
                        stroke="#4f46e5"
                        strokeWidth="3"
                        className="transition duration-200 cursor-pointer hover:r-7"
                      />
                      <title>{`${d.label}: $${d.value.toFixed(2)}`}</title>
                    </g>
                  );
                })}

                {/* Labels styling */}
                {dailyTrendData.map((d, idx) => {
                  const x = paddingX + (idx * (widthSvg - paddingX * 2)) / (dailyTrendData.length - 1);
                  return (
                    <text
                      key={idx}
                      x={x}
                      y={heightSvg - 4}
                      textAnchor="middle"
                      fill="#94a3b8"
                      className="text-[9px] font-semibold font-sans"
                    >
                      {d.label}
                    </text>
                  );
                })}

                {/* SVG definitions */}
                <defs>
                  <linearGradient id="indigo-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="100%" stopColor="#ffffff" />
                  </linearGradient>
                </defs>
              </svg>
            )}
          </div>
        </div>

        {/* Ranked Products / Categories Performance bar visualizer */}
        <div className="bg-white rounded-[2rem] border border-slate-200/95 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex justify-between items-center bg-white">
            <div>
              <h4 className="font-sans text-sm font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
                <PieIcon className="h-4 w-4 text-indigo-500 shrink-0" />
                Category Sales Split
              </h4>
              <p className="text-[11px] text-slate-400">Sales volume ranking of product lines</p>
            </div>
          </div>

          {/* Inline bar visualization of categories */}
          <div className="space-y-4 pt-2">
            {products.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">Add products to populate categories</p>
            ) : (
              (() => {
                // Group sales volumes by category
                const catSalesMap: Record<string, number> = {};
                sales.forEach(s => {
                  const mProd = products.find(p => p.id === s.productId);
                  const cat = mProd ? mProd.category : 'General';
                  catSalesMap[cat] = (catSalesMap[cat] || 0) + s.totalAmount;
                });

                const sortedCats = Object.entries(catSalesMap)
                  .map(([cat, val]) => ({ cat, val }))
                  .sort((a,b) => b.val - a.val);

                const maxCatVal = Math.max(...sortedCats.map(c => c.val), 100);

                if (sortedCats.length === 0) {
                  return <p className="text-xs text-slate-400 text-center py-6">No sales tracked yet</p>;
                }

                return sortedCats.slice(0, 4).map(({ cat, val }, index) => {
                  const percent = (val / maxCatVal) * 100;
                  return (
                    <div key={index} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-800 capitalize leading-none">{cat}</span>
                        <span className="font-semibold text-slate-500 font-mono">${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </div>
                      <div className="w-full h-2 bg-slate-50 border border-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>

      </div>

      {/* EMERGENCY WORKFLOW DESKS: LOW STOCK ALERTS & UNPAID BALANCES */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        
        {/* Urgent Low Stock Alerts Desk */}
        <div className="bg-white rounded-[2rem] border border-slate-200/95 p-6 sm:p-8 shadow-xs space-y-5">
          <div>
            <h4 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              Emergency Reorder Desk
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">Critical list of products with stock values below safety margins</p>
          </div>

          <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
            {lowStockProductsList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                <p className="text-xs font-bold text-slate-500">All product counts healthy!</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Warehouse catalog stocks meet minimum safety standards</p>
              </div>
            ) : (
              lowStockProductsList.map((prod) => (
                <div 
                  key={prod.id} 
                  className="p-4 rounded-2xl border border-rose-100 bg-rose-50/10 hover:bg-rose-50/20 transition flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900 tracking-tight">{prod.name}</p>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <span>SKU: {prod.sku}</span>
                      <span>•</span>
                      <span className="text-rose-600 font-semibold">Live Stock: {prod.currentStock} / Alert {prod.minimumStockAlert}</span>
                    </div>
                  </div>

                  <a
                    href={`mailto:supplier@nexus.com?subject=紧急补货: ${prod.name}&body=Please dispatch emergency units of SKU ${prod.sku}.`}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100/60 border border-rose-200 hover:bg-rose-100 rounded-lg px-3 py-1.5 transition cursor-pointer"
                  >
                    <span>Restock Order</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Outstanding Receivables Tracking Desk */}
        <div className="bg-white rounded-[2rem] border border-slate-200/95 p-6 sm:p-8 shadow-xs space-y-5">
          <div>
            <h4 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-650 bg-indigo-600 animate-pulse"></span>
              Recent System Activity Logs
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">Live-audited operational logs captured in the Firestore database</p>
          </div>

          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
            {systemLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                <p className="text-xs font-bold text-slate-500">No logs found</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Live Firestore connection has no audit telemetry stored.</p>
              </div>
            ) : (
              systemLogs.slice(0, 6).map((log, index) => {
                const formattedTime = log.timestamp 
                  ? new Date(log.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : 'N/A';
                
                return (
                  <div key={log.id || index} className="p-4 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/40 transition flex flex-col gap-2 bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        log.action === 'Sale completed' ? 'bg-emerald-100 text-emerald-800' :
                        log.action === 'Stock updated' ? 'bg-amber-100 text-amber-800' :
                        log.action === 'Product added' ? 'bg-indigo-100 text-indigo-800' :
                        log.action === 'Product edited' ? 'bg-blue-100 text-blue-800' :
                        log.action === 'Customer created' ? 'bg-sky-100 text-sky-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {log.action}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{formattedTime}</span>
                    </div>

                    <p className="text-xs text-slate-705 text-slate-700 font-medium leading-relaxed">
                      {log.details}
                    </p>

                    <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-50">
                      <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                      <span className="text-[9px] font-semibold text-slate-550 text-slate-500">Operator:</span>
                      <span className="text-[9px] text-indigo-600 font-bold font-mono truncate max-w-[200px]" title={log.user}>
                        {log.user || 'System'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* --- BUSINESS CAPITAL RESERVES & INVESTMENT BOARD MODAL --- */}
      <AnimatePresence>
        {isCapitalModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]"
            >
              <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Corporate Equity & Capital Desk
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium tracking-wide mt-1">Manual ledger injection of starting capital reserves and owner seed investments.</p>
                </div>
                <button 
                  onClick={() => {
                    setIsCapitalModalOpen(false);
                    setCapFeedback(null);
                  }}
                  className="p-1.5 hover:bg-white/10 rounded-xl transition text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* Simulated Identity Control info */}
                <div className={`p-4 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border ${
                  userRole === 'admin' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-amber-50/50 border-amber-100'
                }`}>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <AlertTriangle className={`w-4 h-4 ${userRole === 'admin' ? 'text-emerald-600' : 'text-amber-600'}`} />
                      <span>Security Clearance Auditing</span>
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {userRole === 'admin' 
                        ? 'Simulating User: admin_01 (Administrator authorized to write/edit initial business capital policies).'
                        : 'Simulating User: Standard Employee (Read-only clearance. Capital write capability restricted).'
                      }
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Swap Role:</span>
                    <select 
                      value={userRole} 
                      onChange={(e) => {
                        setUserRole(e.target.value as 'admin' | 'employee');
                        setCapFeedback(null);
                      }}
                      className="bg-white border border-slate-200 text-slate-850 font-bold rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-slate-400 cursor-pointer text-slate-800"
                    >
                      <option value="admin">System Admin</option>
                      <option value="employee">Standard Employee</option>
                    </select>
                  </div>
                </div>

                {/* Subtitle Form to Add Investment */}
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100/80 space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Log New Capital Contribution</h4>
                  
                  {capFeedback && (
                    <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                      capFeedback.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'
                    }`}>
                      {capFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                      <span>{capFeedback.message}</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveCapital} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Amount ($ USD)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                          type="number"
                          step="0.01"
                          required
                          placeholder="50,000.00"
                          value={newCapAmount}
                          onChange={(e) => setNewCapAmount(e.target.value)}
                          disabled={userRole !== 'admin'}
                          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-slate-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Contribution Date</label>
                      <input 
                        type="date"
                        required
                        value={newCapDate}
                        onChange={(e) => setNewCapDate(e.target.value)}
                        disabled={userRole !== 'admin'}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-slate-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Source Note / Equity Reference</label>
                      <input 
                        type="text"
                        placeholder="e.g. Series A seed round, cash injection"
                        value={newCapNote}
                        onChange={(e) => setNewCapNote(e.target.value)}
                        disabled={userRole !== 'admin'}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-slate-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    <div className="md:col-span-3 flex justify-end">
                      <button 
                        type="submit"
                        disabled={userRole !== 'admin'}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-3xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Inflow Capital Investment
                      </button>
                    </div>
                  </form>
                </div>

                {/* Historic Equity Injections List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Equity Injection Registers</h4>
                  
                  <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                          <th className="p-4">Investment ID</th>
                          <th className="p-4">Effective Date</th>
                          <th className="p-4 text-right">Injected Capital</th>
                          <th className="p-4">Assigned Originator</th>
                          <th className="p-4">Official Log Note</th>
                          <th className="p-4 text-center">Manage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {capital.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-400">
                              No Capital reserves configured yet. Set an initial capital investment above.
                            </td>
                          </tr>
                        ) : (
                          capital.map((cap) => (
                            <tr key={cap.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition text-slate-750">
                              <td className="p-4 font-bold font-mono text-slate-800">{cap.id}</td>
                              <td className="p-4 font-mono font-bold">{cap.date}</td>
                              <td className="p-4 text-right font-black font-mono text-[13px] text-emerald-700">${cap.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className="p-4 font-semibold text-indigo-650">
                                <span className="bg-indigo-50 text-indigo-750 px-1.5 py-0.5 rounded text-[9.5px] font-bold font-mono">
                                  {cap.createdBy || 'System'}
                                </span>
                              </td>
                              <td className="p-4 text-slate-500 max-w-xs truncate" title={cap.note}>{cap.note || 'None'}</td>
                              <td className="p-4 text-center">
                                <button 
                                  onClick={() => handleDeleteCapital(cap.id)}
                                  disabled={userRole !== 'admin'}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-block"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
              <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
                <button 
                  onClick={() => {
                    setIsCapitalModalOpen(false);
                    setCapFeedback(null);
                  }}
                  className="bg-white border border-slate-200 text-slate-705 text-slate-700 hover:bg-slate-50 font-bold text-xs px-5 py-2.5 rounded-xl transition cursor-pointer"
                >
                  Close Desk
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
