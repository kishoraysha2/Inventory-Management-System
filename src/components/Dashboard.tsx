import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { calculateCustomerLedger } from '../lib/utils';
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
  Trash2,
  Archive,
  Briefcase,
  Wallet,
  Save
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Sale, Customer, Product, Supplier, Capital, CashLedgerEntry } from '../types';

export default function Dashboard({ userRole }: { userRole: 'admin' | 'accountant' | 'cashier' | 'viewer' }) {
  // --- States ---
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customersState, setCustomersState] = useState<Customer[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [cashLedger, setCashLedger] = useState<any[]>([]);
  const [capital, setCapital] = useState<Capital[]>([]);
  const [loading, setLoading] = useState(true);

  const customers = useMemo(() => {
    return customersState.map(c => {
      const rawDue = calculateCustomerLedger(sales, customerPayments, c.id);
      return {
        ...c,
        dueBalance: Math.max(0, rawDue),
        customerCredit: rawDue < 0 ? Math.abs(rawDue) : 0
      };
    });
  }, [customersState, sales, customerPayments]);
  const [timePeriod, setTimePeriod] = useState<'all' | 'thirty_days'>('all');

  // --- Simulated Identity Policy Control ---
  const [isCapitalModalOpen, setIsCapitalModalOpen] = useState(false);
  const [newCapAmount, setNewCapAmount] = useState('');
  const [newCapDate, setNewCapDate] = useState(new Date().toISOString().split('T')[0]);
  const [newCapNote, setNewCapNote] = useState('');
  const [capFeedback, setCapFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSaveCapital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'admin' && userRole !== 'accountant') {
      setCapFeedback({ message: 'Access Denied: Only Admin and Accountant users can add or modify business Capital.', type: 'error' });
      return;
    }
    const amt = parseFloat(newCapAmount);
    if (isNaN(amt) || amt <= 0) {
      setCapFeedback({ message: 'Please enter a valid capital investment amount.', type: 'error' });
      return;
    }
    try {
      const capId = `cap-${Date.now()}`;
      if (!auth.currentUser) {
        // Offline / local storage fallback
        const savedCapital = localStorage.getItem('inventory_capital') || '[]';
        const capitalList = JSON.parse(savedCapital);
        const newCap = {
          id: capId,
          amount: amt,
          date: newCapDate,
          note: newCapNote,
          createdBy: 'admin_01'
        };
        capitalList.push(newCap);
        localStorage.setItem('inventory_capital', JSON.stringify(capitalList));
        setCapital(capitalList);

        const savedLogs = localStorage.getItem('inventory_system_logs') || '[]';
        const logsList = JSON.parse(savedLogs);
        logsList.unshift({
          id: `log-${Date.now()}`,
          action: 'Capital contribution',
          user: 'admin_01',
          timestamp: new Date().toISOString(),
          details: `Injected manual capital contribution of $${amt.toLocaleString()} on ${newCapDate} (${newCapNote || 'No notes'})`
        });
        localStorage.setItem('inventory_system_logs', JSON.stringify(logsList));
        setSystemLogs(logsList);

        setCapFeedback({ message: 'Capital investment successfully logged locally!', type: 'success' });
        setNewCapAmount('');
        setNewCapNote('');
        return;
      }

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
        if (!auth.currentUser) {
          const savedCapital = localStorage.getItem('inventory_capital') || '[]';
          let capitalList = JSON.parse(savedCapital);
          capitalList = capitalList.filter((item: any) => item.id !== id);
          localStorage.setItem('inventory_capital', JSON.stringify(capitalList));
          setCapital(capitalList);

          const savedLogs = localStorage.getItem('inventory_system_logs') || '[]';
          const logsList = JSON.parse(savedLogs);
          logsList.unshift({
            id: `log-${Date.now()}`,
            action: 'Capital deletion',
            user: 'admin_01',
            timestamp: new Date().toISOString(),
            details: `Deleted capital contribution record: ${id}`
          });
          localStorage.setItem('inventory_system_logs', JSON.stringify(logsList));
          setSystemLogs(logsList);
          return;
        }

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
    if (!auth.currentUser) {
      // Local fallback
      const savedSales = localStorage.getItem('inventory_sales');
      setSales(savedSales ? JSON.parse(savedSales) : []);

      const savedProducts = localStorage.getItem('inventory_products');
      setProducts(savedProducts ? JSON.parse(savedProducts) : []);

      const savedCustomers = localStorage.getItem('inventory_customers');
      setCustomersState(savedCustomers ? JSON.parse(savedCustomers) : []);

      const savedPayments = localStorage.getItem('inventory_customer_payments');
      setCustomerPayments(savedPayments ? JSON.parse(savedPayments) : []);

      const savedSuppliers = localStorage.getItem('inventory_suppliers');
      setSuppliers(savedSuppliers ? JSON.parse(savedSuppliers) : []);

      const savedPurchases = localStorage.getItem('inventory_purchases');
      setPurchases(savedPurchases ? JSON.parse(savedPurchases) : []);

      const savedLogs = localStorage.getItem('inventory_system_logs');
      setSystemLogs(savedLogs ? JSON.parse(savedLogs) : []);

      const savedLedger = localStorage.getItem('inventory_cash_ledger');
      setCashLedger(savedLedger ? JSON.parse(savedLedger) : []);

      const savedCapital = localStorage.getItem('inventory_capital');
      setCapital(savedCapital ? JSON.parse(savedCapital) : []);

      setLoading(false);
      return;
    }

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
      setCustomersState(custList);
    }, (err) => {
      console.error("Dashboard error syncing customers", err);
    });

    // 3.1 Sync Customer Payments
    const unsubPayments = onSnapshot(collection(db, 'customerPayments'), (snapshot) => {
      const paymentsList: any[] = [];
      snapshot.forEach((docSnap) => {
        paymentsList.push(docSnap.data());
      });
      setCustomerPayments(paymentsList);
    }, (err) => {
      console.error("Dashboard error syncing customerPayments", err);
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

    // 8. Sync Purchases
    const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.exists()) {
          list.push(docSnap.data());
        }
      });
      setPurchases(list);
    }, (err) => {
      console.error("Dashboard error syncing purchases", err);
    });

    return () => {
      unsubSales();
      unsubProducts();
      unsubCustomers();
      unsubPayments();
      unsubSuppliers();
      unsubLogs();
      unsubCashLedger();
      unsubCapital();
      unsubPurchases();
    };
  }, []);

  // --- Calculations Engine ---
  
  // Set reference dates based on metadata/local simulation time (2026-06-01)
  const simulationDateStr = "2026-06-01";
  const refDate = new Date(simulationDateStr);
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Today's Sales (excluding VOID/voided)
  const todaysSalesValue = sales.filter(s => {
    if (!s.saleDate || s.status === 'VOID' || s.status === 'voided') return false;
    const datePart = s.saleDate.split('T')[0];
    return datePart === todayStr;
  }).reduce((sum, s) => sum + s.totalAmount, 0);

  // 2. Monthly Sales (June 2026) (excluding VOID/voided)
  const currentMonthNum = refDate.getMonth(); // 5 (June)
  const currentYearNum = refDate.getFullYear(); // 2026
  const monthlySalesValue = sales.filter(s => {
    if (!s.saleDate || s.status === 'VOID' || s.status === 'voided') return false;
    const d = new Date(s.saleDate);
    return d.getMonth() === currentMonthNum && d.getFullYear() === currentYearNum;
  }).reduce((sum, s) => sum + s.totalAmount, 0);

  // 3. Profit calculations (based strictly on subtotal minus costOfGoodsSold, excluding tax) (excluding VOID/voided)
  const cashProfitValue = sales.filter(s => s.status !== 'VOID' && s.status !== 'voided' && (s.paymentType || '').toString().toUpperCase().trim() !== 'CREDIT').reduce((sum, s) => {
    const saleSubtotal = s.subtotal ?? (s.quantity * (s.unitPrice ?? s.sellingPrice));
    const saleCOGS = s.costOfGoodsSold !== undefined ? s.costOfGoodsSold : (s.productPurchasePriceAtSale !== undefined ? s.productPurchasePriceAtSale : s.sellingPrice * 0.6) * s.quantity;
    return sum + (saleSubtotal - saleCOGS);
  }, 0);

  const creditProfitValue = sales.filter(s => s.status !== 'VOID' && s.status !== 'voided' && (s.paymentType || '').toString().toUpperCase().trim() === 'CREDIT').reduce((sum, s) => {
    const saleSubtotal = s.subtotal ?? (s.quantity * (s.unitPrice ?? s.sellingPrice));
    const saleCOGS = s.costOfGoodsSold !== undefined ? s.costOfGoodsSold : (s.productPurchasePriceAtSale !== undefined ? s.productPurchasePriceAtSale : s.sellingPrice * 0.6) * s.quantity;
    return sum + (saleSubtotal - saleCOGS);
  }, 0);

  const salesProfitValue = cashProfitValue + creditProfitValue;

  // 4. Total Purchase (Valuation of stock currently acquired in our inventory)
  const totalPurchaseValue = products
    .filter(p => p.status !== 'inactive')
    .reduce((sum, p) => {
      return sum + (p.purchasePrice * p.currentStock);
    }, 0);

  // 4.1. Opening Stock Value Calculation
  // Calculates the sum of all inventory value created through the "Add Product (Opening Stock)" process.
  // Using the formula: initialStock = p.currentStock - totalProcured + totalSold as fallback or p.initialStock directly.
  const openingStockValueCost = products
    .filter(p => p.status !== 'inactive')
    .reduce((sum, p) => {
      const totalProcured = (purchases || [])
        .filter(pur => pur.productId === p.id && pur.status !== 'VOID' && pur.status !== 'voided')
        .reduce((s, pur) => s + (pur.quantity || 0), 0);
      const totalSold = (sales || [])
        .filter(sale => sale.productId === p.id && sale.status !== 'VOID' && sale.status !== 'voided')
        .reduce((s, sale) => s + (sale.quantity || 0), 0);
      const openingQty =
        p.initialStock !== undefined
          ? p.initialStock
          : Math.max(0, p.currentStock - totalProcured + totalSold);
      return sum + (openingQty * p.purchasePrice);
    }, 0);

  const openingStockValueRetail = products
    .filter(p => p.status !== 'inactive')
    .reduce((sum, p) => {
      const totalProcured = (purchases || [])
        .filter(pur => pur.productId === p.id && pur.status !== 'VOID' && pur.status !== 'voided')
        .reduce((s, pur) => s + (pur.quantity || 0), 0);
      const totalSold = (sales || [])
        .filter(sale => sale.productId === p.id && sale.status !== 'VOID' && sale.status !== 'voided')
        .reduce((s, sale) => s + (sale.quantity || 0), 0);
      const openingQty =
        p.initialStock !== undefined
          ? p.initialStock
          : Math.max(0, p.currentStock - totalProcured + totalSold);
      return sum + (openingQty * p.sellingPrice);
    }, 0);

  // 5. Customer Due (Sum of receivables)
  const totalCustomerDue = customers
    .filter(c => c.status !== 'inactive')
    .reduce((sum, c) => sum + (c.dueBalance || 0), 0);

  // 6. Supplier Due (Sum of payables)
  const totalSupplierDue = suppliers
    .filter(s => s.status !== 'inactive')
    .reduce((sum, s) => sum + (s.dueBalance || 0), 0);

  // Customer Credit (Total credit balance/prepaid balances from customers)
  const totalCustomerCredit = customers
    .filter(c => c.status !== 'inactive')
    .reduce((sum, c) => sum + (c.customerCredit || 0), 0);

  // Total Purchases Sum (All-time valid purchases)
  const totalPurchasesSum = purchases
    .filter(p => p.status !== 'VOID' && p.status !== 'voided')
    .reduce((sum, p) => sum + p.totalAmount, 0);

  // 7. Cash accounting calculations with capital support
  const startingCapital = capital.reduce((sum, entry) => sum + entry.amount, 0);
  const initialCapital = startingCapital;

  const totalInflow = cashLedger
    .filter(entry => entry.type === 'inflow' && entry.status !== 'voided' && entry.status !== 'VOID')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const totalOutflow = cashLedger
    .filter(entry => entry.type === 'outflow' && entry.status !== 'voided' && entry.status !== 'VOID')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const cashInHand = initialCapital + totalInflow - totalOutflow;
  const netMovement = totalInflow - totalOutflow;

  // 7. Low Stock Products list and count
  const lowStockProductsList = products.filter(p => p.status !== 'inactive' && p.currentStock <= p.minimumStockAlert);
  const lowStockCount = lowStockProductsList.length;

  // Additional stats: Overall profit margin percentage (excluding tax) (excluding VOID/voided)
  const overallSalesSubtotal = sales.filter(s => s.status !== 'VOID' && s.status !== 'voided').reduce((sum, s) => sum + (s.subtotal ?? (s.quantity * (s.unitPrice ?? s.sellingPrice))), 0);
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

  // Populate sales into trend (excluding VOID/voided)
  sales.filter(s => s.status !== 'VOID' && s.status !== 'voided').forEach(s => {
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
    <div id="nexus-intel-dashboard-root" className="space-y-6 sm:space-y-8 animate-fade-in font-sans pb-12 bg-[#0B0F19] text-[#E6EDF7] p-4 sm:p-8 rounded-2xl sm:rounded-[2rem] border border-[#1E2A44] shadow-2xl w-full max-w-full overflow-hidden">
      
      {/* HEADER BAR AND DATE INDICES */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00D4FF] animate-pulse"></span>
            Operational Intelligence Dashboard
          </h2>
          <p className="text-[10px] sm:text-xs text-[#93A3B8] mt-1 uppercase tracking-wider font-semibold font-mono">
            Audit Date: June 01, 2026 • Real-time FireStore Calculations active
          </p>
        </div>

        {/* Action tags */}
        <div className="flex items-center gap-2 text-xs font-semibold text-[#93A3B8] bg-[#0F1626]/80 border border-[#1E2A44] rounded-2xl px-4 py-2.5 w-fit shadow-lg backdrop-blur-xs">
          <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>Last automated sync: {loading ? 'Computing...' : 'Now'}</span>
          {loading && <RefreshCw className="w-3 h-3 text-indigo-400 animate-spin ml-2" />}
        </div>
      </div>

      {/* --- CASH & CAPITAL ACCOUNTING LIQUIDITY DESK --- */}
      {loading ? (
        <div className="space-y-6 sm:space-y-8 animate-pulse">
          {/* Liquidity Desk Skeleton */}
          <div className="bg-[#0F1626]/60 rounded-2xl sm:rounded-[2rem] border border-[#1E2A44] p-4 sm:p-6 md:p-8 flex flex-col xl:flex-row justify-between items-stretch gap-6 w-full">
            <div className="space-y-4 w-full xl:w-1/4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="h-4 bg-[#1E2A44] rounded-lg w-1/2"></div>
                <div className="h-3 bg-[#1E2A44] rounded-lg w-full"></div>
                <div className="h-3 bg-[#1E2A44] rounded-lg w-5/6"></div>
              </div>
              <div className="h-8 bg-[#1E2A44] rounded-xl w-3/4 mt-4"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 xl:gap-8 w-full xl:w-3/4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-[#121B2F]/60 border border-[#1E2A44]/40 h-32 rounded-xl p-4 flex flex-col justify-between">
                  <div className="h-3 bg-[#1E2A44] rounded w-1/3"></div>
                  <div className="h-6 bg-[#1E2A44] rounded w-2/3"></div>
                  <div className="h-2.5 bg-[#1E2A44] rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>

          {/* Grid of cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-[#0F1626]/50 border border-[#1E2A44] rounded-2xl p-5 h-36 flex flex-col justify-between">
                <div className="flex justify-between items-center">
                  <div className="h-3 bg-[#1E2A44] rounded w-1/2"></div>
                  <div className="w-8 h-8 rounded-lg bg-[#1E2A44]"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-6 bg-[#1E2A44] rounded w-3/4"></div>
                  <div className="h-2.5 bg-[#1E2A44] rounded w-1/3"></div>
                </div>
              </div>
            ))}
          </div>

          {/* Graph + ledger skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-[#0F1626]/50 border border-[#1E2A44] rounded-3xl p-6 h-96 lg:col-span-2 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-4">
                <div className="h-4 bg-[#1E2A44] rounded w-1/4"></div>
                <div className="h-3 bg-[#1E2A44] rounded w-1/6"></div>
              </div>
              <div className="flex-1 bg-[#121B2F]/40 border border-[#1e2a44]/30 rounded-2xl w-full flex items-end p-4 gap-2 h-48">
                {[40, 60, 50, 80, 70, 95, 85].map((h, b) => (
                  <div key={b} className="flex-1 bg-[#1E2A44]/60 rounded-t" style={{ height: `${h}%` }}></div>
                ))}
              </div>
              <div className="h-3 bg-[#1E2A44] rounded w-1/3 mt-4"></div>
            </div>
            <div className="bg-[#0F1626]/50 border border-[#1E2A44] rounded-3xl p-6 h-96 flex flex-col justify-between">
              <div className="h-4 bg-[#1E2A44] rounded w-1/2 mb-4"></div>
              <div className="flex-1 space-y-3">
                {[1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="flex items-center justify-between border-b border-[#1E2A44]/30 pb-2">
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3 bg-[#1E2A44] rounded w-2/3"></div>
                      <div className="h-2 bg-[#1E2A44] rounded w-1/3"></div>
                    </div>
                    <div className="h-4 bg-[#1E2A44] rounded w-1/6"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
      {/* --- CASH & CAPITAL ACCOUNTING LIQUIDITY DESK --- */}
      <div id="liquidity-desk-widget" className="bg-gradient-to-r from-[#0F1626]/90 to-[#121B2F]/90 rounded-2xl sm:rounded-[2rem] border border-[#1E2A44] p-4 sm:p-6 md:p-8 shadow-2xl flex flex-col xl:flex-row justify-between items-stretch gap-6 w-full max-w-full overflow-hidden">
        <div className="space-y-4 flex flex-col justify-between w-full xl:w-1/4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00D4FF] animate-pulse"></span>
              <span className="text-[10px] font-black tracking-widest text-[#00D4FF] uppercase">Capital Liquidity Desk</span>
            </div>
            <h3 className="text-xs text-[#93A3B8] font-medium leading-relaxed font-sans">
              Real-time balance sheets monitoring owner starting capital, net trading movements, and instant liquid vault reserves.
            </h3>
          </div>
          
          <div className="space-y-2 pt-2">
            <div className="text-xs text-[#93A3B8] flex items-center gap-2 font-sans">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#93A3B8] opacity-60">Role:</span>
              <span className="bg-[#1E2A44] text-[#00D4FF] font-mono font-bold tracking-wide uppercase px-2 py-0.5 rounded-md border border-[#1E2A44]/80 text-[10px]">
                {userRole}
              </span>
            </div>
            <button 
              onClick={() => setIsCapitalModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#4F7BFF] to-[#7B5CFF] hover:from-[#5f8aff] hover:to-[#8b6eff] text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow-lg cursor-pointer font-sans"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Modify Capital</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 xl:gap-8 w-full xl:w-3/4">
          {/* Starting Capital Widget */}
          <motion.div
            whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(79,123,255,0.4)" }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#4F7BFF]/25 rounded-xl sm:rounded-[1.5rem] shadow-[0_4px_25px_-4px_rgba(79,123,255,0.1)] hover:shadow-[0_8px_30px_rgba(79,123,255,0.18)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[150px] sm:min-h-[190px] relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-br from-[#4F7BFF]/10 to-transparent rounded-full blur-2xl pointer-events-none group-hover:scale-110 transition-transform duration-300"></div>
            <div className="space-y-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#4F7BFF] to-[#7B5CFF] shrink-0 ring-2 ring-white/10 shadow-[0_0_15px_rgba(79,123,255,0.35)] group-hover:scale-105 transition-transform duration-300">
                  <Briefcase className="h-5 w-5 text-white" />
                </div>
                <span className="text-[10px] font-bold text-[#4F7BFF] uppercase tracking-widest font-sans opacity-95">Business Capital</span>
              </div>
              <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-[#4F7BFF] pt-1 font-mono">
                ${startingCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="pt-4 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
              <span className="truncate opacity-80">Owner Equity</span>
              <span className="text-[#00D4FF] font-bold bg-[#1E2A44] px-2.5 py-1 rounded-lg text-[9px] font-mono shadow-sm">
                {capital.length} Injections
              </span>
            </div>
          </motion.div>

          {/* Current Cash Widget */}
          <motion.div
            whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(34,197,94,0.45)" }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#22C55E]/25 rounded-xl sm:rounded-[1.5rem] shadow-[0_0_25px_rgba(34,197,94,0.06)] hover:shadow-[0_8px_30px_rgba(34,197,94,0.18)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[150px] sm:min-h-[190px] relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-br from-[#22C55E]/10 to-transparent rounded-full blur-2xl pointer-events-none group-hover:scale-110 transition-transform duration-300"></div>
            <div className="space-y-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#22C55E] to-[#10B981] shrink-0 ring-2 ring-white/10 shadow-[0_0_15px_rgba(34,197,94,0.35)] group-hover:scale-105 transition-transform duration-300">
                  <DollarSign className="h-5 w-5 text-white" />
                </div>
                <span className="text-[10px] font-bold text-[#22C55E] uppercase tracking-widest font-sans opacity-95">Cash in Hand</span>
              </div>
              <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-[#22C55E] pt-1 font-mono">
                ${cashInHand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="pt-4 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
              <span className="truncate opacity-80">Liquid reserves</span>
              <span className={`font-mono font-bold px-2.5 py-1 rounded-lg text-[9px] shadow-sm ${cashInHand >= 0 ? "bg-emerald-950/50 text-[#22C55E] border border-emerald-500/20" : "bg-rose-950/50 text-rose-400 border border-rose-500/20"}`}>
                {cashInHand >= 0 ? "SURPLUS" : "DEFICIT"}
              </span>
            </div>
          </motion.div>

          {/* Net Movement Widget */}
          <motion.div
            whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(34,197,94,0.4)" }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#1E2A44] rounded-xl sm:rounded-[1.5rem] shadow-[0_4px_25px_-4px_rgba(79,123,255,0.1)] hover:shadow-[0_8px_30px_rgba(34,197,94,0.15)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[150px] sm:min-h-[190px] relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-br from-[#4F7BFF]/10 to-transparent rounded-full blur-2xl pointer-events-none group-hover:scale-110 transition-transform duration-300"></div>
            <div className="space-y-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#4F7BFF] to-[#7B5CFF] shrink-0 ring-2 ring-white/10 shadow-[0_0_15px_rgba(79,123,255,0.35)] group-hover:scale-105 transition-transform duration-300">
                  <RefreshCw className="h-5 w-5 text-white" />
                </div>
                <span className="text-[10px] font-bold text-[#8FA2B9] uppercase tracking-widest font-sans opacity-95">Net Movement</span>
              </div>
              <h3 className={`text-xl xs:text-2xl sm:text-3xl font-black tracking-tight pt-1 font-mono ${netMovement >= 0 ? 'text-[#22C55E]' : 'text-rose-400'}`}>
                {netMovement >= 0 ? '+' : ''}${netMovement.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="pt-4 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
              <span className="truncate opacity-80">Combined cashflow</span>
              <span className={`font-bold px-2.5 py-1 rounded-lg text-[9px] font-mono shadow-sm ${netMovement >= 0 ? "bg-emerald-950/50 text-[#22C55E] border border-emerald-500/20" : "bg-rose-950/50 text-rose-400 border border-rose-500/20"}`}>
                {netMovement >= 0 ? "INCREASING ▲" : "DECREASING ▼"}
              </span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* 8 BENTO METRICS GRID (Showcasing all calculations requested with enhanced heights & modern SaaS feels) */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:gap-7 xl:gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 font-sans">
        
        {/* CARD 1: Total Products */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(79,123,255,0.3)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#1E2A44] rounded-xl sm:rounded-[1.5rem] shadow-[0_4px_20px_-4px_rgba(79,123,255,0.08)] hover:shadow-[0_8px_30px_rgba(79,123,255,0.15)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#4F7BFF]/5 to-transparent rounded-full blur-2xl pointer-events-none"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#4F7BFF] to-[#7B5CFF] shrink-0 ring-2 ring-white/10 shadow-[0_0_12px_rgba(79,123,255,0.35)] group-hover:scale-105 transition-transform duration-300">
                <Layers className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold text-[#8FA2B9] uppercase tracking-widest font-sans opacity-95">Total Products</span>
            </div>
            <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-[#E6EDF7] pt-1">
              {products.filter(p => p.status !== 'inactive').length} Items
            </h3>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="truncate opacity-80">Active catalog</span>
            <span className="text-[#4F7BFF] font-bold">Synced Live</span>
          </div>
        </motion.div>

        {/* CARD 2: Total Customers */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(79,123,255,0.3)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#1E2A44] rounded-xl sm:rounded-[1.5rem] shadow-[0_4px_20px_-4px_rgba(79,123,255,0.08)] hover:shadow-[0_8px_30px_rgba(79,123,255,0.15)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#4F7BFF]/5 to-transparent rounded-full blur-2xl pointer-events-none"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#4F7BFF] to-[#7B5CFF] shrink-0 ring-2 ring-white/10 shadow-[0_0_12px_rgba(79,123,255,0.35)] group-hover:scale-105 transition-transform duration-300">
                <Users className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold text-[#8FA2B9] uppercase tracking-widest font-sans opacity-95">Total Customers</span>
            </div>
            <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-[#E6EDF7] pt-1">
              {customers.filter(c => c.status !== 'inactive').length} Profiles
            </h3>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="truncate opacity-80">CRM accounts</span>
            <span className="text-[#00D4FF] font-bold">Active CRM</span>
          </div>
        </motion.div>

        {/* CARD 3: Total Suppliers */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(79,123,255,0.3)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#1E2A44] rounded-xl sm:rounded-[1.5rem] shadow-[0_4px_20px_-4px_rgba(79,123,255,0.08)] hover:shadow-[0_8px_30px_rgba(79,123,255,0.15)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#4F7BFF]/5 to-transparent rounded-full blur-2xl pointer-events-none"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#4F7BFF] to-[#7B5CFF] shrink-0 ring-2 ring-white/10 shadow-[0_0_12px_rgba(79,123,255,0.35)] group-hover:scale-105 transition-transform duration-300">
                <Truck className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold text-[#8FA2B9] uppercase tracking-widest font-sans opacity-95">Total Suppliers</span>
            </div>
            <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-[#E6EDF7] pt-1">
              {suppliers.filter(s => s.status !== 'inactive').length} Partners
            </h3>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="truncate opacity-80">Trade partners</span>
            <span className="text-[#4F7BFF] font-bold">Supply Chain</span>
          </div>
        </motion.div>

        {/* CARD 4: Low Stock Products alert count */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(239,68,68,0.5)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-rose-500/30 rounded-xl sm:rounded-[1.5rem] shadow-[0_0_20px_rgba(239,68,68,0.06)] hover:shadow-[0_8px_30px_rgba(239,68,68,0.18)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#FF4F5A]/8 to-transparent rounded-full blur-2xl pointer-events-none"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#FF4E4E] to-[#FF8000] shrink-0 ring-2 ring-white/10 shadow-[0_0_12px_rgba(255,78,78,0.4)] group-hover:scale-105 transition-transform duration-300">
                <AlertTriangle className={`h-5 w-5 text-white ${lowStockCount > 0 ? 'animate-pulse' : ''}`} />
              </div>
              <span className="text-[10px] font-bold text-[#EF4444] uppercase tracking-widest font-sans opacity-95">Low Stock Alert</span>
            </div>
            <h3 className={`text-xl xs:text-2xl sm:text-3xl font-black tracking-tight pt-1 ${lowStockCount > 0 ? 'text-[#FF4F5A]' : 'text-[#E6EDF7]'}`}>
              {lowStockCount} Products
            </h3>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="truncate opacity-80 font-medium">Safety threshold</span>
            <span className={`font-mono font-bold uppercase text-[9px] px-2.5 py-1 rounded-lg ${
              lowStockCount > 0 
                ? 'bg-rose-950/50 text-[#FF4E4E] border border-rose-500/25' 
                : 'bg-emerald-950/50 text-[#22C55E] border border-emerald-500/25'
            }`}>
              {lowStockCount > 0 ? 'Urgent Restock' : 'Healthy'}
            </span>
          </div>
        </motion.div>

        {/* CARD 5: Total Sales Today */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(0,212,255,0.3)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#1E2A44] rounded-xl sm:rounded-[1.5rem] shadow-[0_4px_20px_-4px_rgba(79,123,255,0.08)] hover:shadow-[0_8px_30px_rgba(0,212,255,0.15)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#00D4FF]/5 to-transparent rounded-full blur-2xl pointer-events-none"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#00D4FF] to-[#9C4DFF] shrink-0 ring-2 ring-white/10 shadow-[0_0_12px_rgba(0,212,255,0.35)] group-hover:scale-105 transition-transform duration-300">
                <ShoppingBag className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold text-[#8FA2B9] uppercase tracking-widest font-sans opacity-95">Total Sales Today</span>
            </div>
            <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-[#E6EDF7] pt-1 font-mono">
              ${todaysSalesValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="truncate opacity-80">{todayStr}</span>
            <span className="text-emerald-400 font-bold font-mono">LIVE BOOK</span>
          </div>
        </motion.div>

        {/* CARD 6: Total Sales This Month */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(0,212,255,0.3)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#1E2A44] rounded-xl sm:rounded-[1.5rem] shadow-[0_4px_20px_-4px_rgba(79,123,255,0.08)] hover:shadow-[0_8px_30px_rgba(0,212,255,0.15)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#00D4FF]/5 to-transparent rounded-full blur-2xl pointer-events-none"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#00D4FF] to-[#9C4DFF] shrink-0 ring-2 ring-white/10 shadow-[0_0_12px_rgba(0,212,255,0.35)] group-hover:scale-105 transition-transform duration-300">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold text-[#8FA2B9] uppercase tracking-widest font-sans opacity-95">Sales This Month</span>
            </div>
            <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-[#E6EDF7] pt-1 font-mono">
              ${monthlySalesValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="truncate opacity-85">Running cycle billing</span>
            <span className="text-[#00D4FF] font-bold">Active Cycle</span>
          </div>
        </motion.div>

        {/* CARD 7: Total Purchases */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(0,212,255,0.3)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#1E2A44] rounded-xl sm:rounded-[1.5rem] shadow-[0_4px_20px_-4px_rgba(79,123,255,0.08)] hover:shadow-[0_8px_30px_rgba(0,212,255,0.15)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#00D4FF]/5 to-transparent rounded-full blur-2xl pointer-events-none"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#00D4FF] to-[#9C4DFF] shrink-0 ring-2 ring-white/10 shadow-[0_0_12px_rgba(0,212,255,0.35)] group-hover:scale-105 transition-transform duration-300">
                <Archive className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold text-[#8FA2B9] uppercase tracking-widest font-sans opacity-95">Total Purchases</span>
            </div>
            <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-[#E6EDF7] pt-1 font-mono">
              ${totalPurchasesSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="truncate opacity-80">Procurement history</span>
            <span className="text-emerald-400 font-bold">Completed</span>
          </div>
        </motion.div>

        {/* CARD 8: Customer Due */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(245,158,11,0.4)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-amber-500/35 rounded-xl sm:rounded-[1.5rem] shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:shadow-[0_8px_30px_rgba(245,158,11,0.15)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#FF9100]/8 to-transparent rounded-full blur-2xl pointer-events-none"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#FF9100] to-[#FF5E00] shrink-0 ring-2 ring-white/10 shadow-[0_0_15px_rgba(255,145,0,0.35)] group-hover:scale-105 transition-transform duration-300">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold text-amber-400 tracking-widest uppercase font-sans">Customer Due</span>
            </div>
            <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-amber-500 pt-1 font-mono">
              ${totalCustomerDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="truncate opacity-80">Receivables Ledger</span>
            <span className="text-amber-400 font-bold font-mono text-[10px] bg-[#1E2A44] px-2.5 py-1 rounded-lg">
              {customers.filter(c => c.dueBalance > 0).length} Overdue
            </span>
          </div>
        </motion.div>

        {/* CARD 9: Customer Credit */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(168,85,247,0.4)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#A855F7]/25 rounded-xl sm:rounded-[1.5rem] shadow-[0_4px_20px_-4px_rgba(168,85,247,0.08)] hover:shadow-[0_8px_30px_rgba(168,85,247,0.18)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#A855F7]/10 to-transparent rounded-full blur-2xl pointer-events-none"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#A855F7] to-[#8B5CF6] shrink-0 ring-2 ring-white/10 shadow-[0_0_12px_rgba(168,85,247,0.35)] group-hover:scale-105 transition-transform duration-300">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold text-[#A855F7] uppercase tracking-widest font-sans opacity-95">Customer Credit</span>
            </div>
            <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-[#A855F7] pt-1 font-mono">
              ${totalCustomerCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="truncate opacity-80">Prepayments in treasury</span>
            <span className="text-[#A855F7] font-black font-sans tracking-wide text-[9px] uppercase bg-purple-950/40 px-2.5 py-1 rounded-lg">Liability</span>
          </div>
        </motion.div>

        {/* CARD 10: Supplier Due */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(239,68,68,0.4)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-rose-500/25 rounded-xl sm:rounded-[1.5rem] shadow-[0_0_15px_rgba(239,68,68,0.05)] hover:shadow-[0_8px_30px_rgba(239,68,68,0.18)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#EF4444]/10 to-transparent rounded-full blur-2xl pointer-events-none"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#EF4444] to-[#B91C1C] shrink-0 ring-2 ring-white/15 shadow-[0_0_12px_rgba(239,68,68,0.35)] group-hover:scale-105 transition-transform duration-300">
                <Truck className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest font-sans opacity-95">Supplier Due</span>
            </div>
            <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-[#EF4444] pt-1 font-mono">
              ${totalSupplierDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="truncate opacity-80">Outstanding payables</span>
            <span className="text-rose-400 font-bold font-mono text-[10px] bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-500/10">
              {suppliers.filter(s => (s.dueBalance ?? 0) > 0).length} Overdue
            </span>
          </div>
        </motion.div>

        {/* CARD 11: Total Profit */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(34,197,94,0.5)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#22C55E]/30 rounded-xl sm:rounded-[1.5rem] shadow-[0_0_25px_rgba(34,197,94,0.06)] hover:shadow-[0_8px_35px_rgba(34,197,94,0.18)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] lg:col-span-2 h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#22C55E]/10 to-transparent rounded-full blur-3xl pointer-events-none group-hover:scale-110 transition-transform"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[#22C55E] shrink-0 ring-2 ring-white/15 shadow-[0_0_15px_rgba(34,197,94,0.4)] group-hover:scale-105 transition-transform duration-300">
                <Sparkles className="h-5 w-5 text-white animate-pulse" />
              </div>
              <span className="text-[10px] font-bold text-[#22C55E] uppercase tracking-widest font-sans">Total Profit</span>
            </div>
            
            <div>
              <h3 className="text-2xl xs:text-3xl sm:text-4xl font-extrabold tracking-tight text-[#22C55E] font-mono">
                ${salesProfitValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <p className="text-[10px] text-[#93A3B8] mt-1 font-sans font-medium tracking-wide">Gross accumulated trading profit margins</p>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-[#1E2A44]/65 pt-3 w-full text-sans">
              <div>
                <span className="text-[9px] font-bold text-[#93A3B8] uppercase tracking-wider block">Cash Profit</span>
                <span className="text-sm xs:text-base font-black text-[#22C55E] block mt-0.5 font-mono">
                  ${cashProfitValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="border-l border-[#1E2A44]/70 pl-4">
                <span className="text-[9px] font-bold text-[#93A3B8] uppercase tracking-wider block">Credit Profit</span>
                <span className="text-sm xs:text-base font-black text-[#4F7BFF] block mt-0.5 font-mono">
                  ${creditProfitValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-3.5 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="opacity-80">Gross trade margins</span>
            <span className="font-bold text-white font-mono bg-[#1E2A44]/90 px-3 py-1 rounded-lg border border-[#1E2A44]/80">{averageProfitMargin.toFixed(1)}% Avg Margin</span>
          </div>
        </motion.div>

        {/* CARD 12: Original Opening Stock Value */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(79,123,255,0.3)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#1E2A44] rounded-xl sm:rounded-[1.5rem] shadow-[0_4px_20px_-4px_rgba(79,123,255,0.08)] hover:shadow-[0_8px_30px_rgba(79,123,255,0.15)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#4F7BFF]/5 to-transparent rounded-full blur-2xl pointer-events-none"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#4F7BFF] to-[#7B5CFF] shrink-0 ring-2 ring-white/10 shadow-[0_0_12px_rgba(79,123,255,0.35)] group-hover:scale-105 transition-transform duration-300">
                <Archive className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold text-[#8FA2B9] uppercase tracking-widest font-sans opacity-95">Opening Stock Value</span>
            </div>

            <div>
              <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-[#E6EDF7] font-mono">
                ${openingStockValueCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <p className="text-[10px] text-[#93A3B8] mt-1 font-sans">Cost base setup valuation</p>
            </div>

            <div className="border-t border-[#1E2A44]/65 pt-3.5">
              <span className="text-[9px] font-bold text-[#93A3B8] uppercase block font-sans tracking-wide">Opening Stock Retail Value</span>
              <span className="text-xs xs:text-sm font-extrabold text-[#4F7BFF] block mt-0.5 font-mono">
                ${openingStockValueRetail.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="opacity-80">Setup reserve base</span>
            <span className="text-[#00D4FF] font-mono text-[9px] font-bold tracking-wider bg-[#1E2A44] px-2 py-0.5 rounded border border-[#1E2A44]/80">INITIAL</span>
          </div>
        </motion.div>

        {/* CARD 13: Current Inventory Value */}
        <motion.div
          whileHover={{ y: -5, scale: 1.025, borderColor: "rgba(59,130,246,0.4)" }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-b from-[#0F1626] to-[#121B2F] border border-[#3B82F6]/25 rounded-xl sm:rounded-[1.5rem] shadow-[0_4px_20px_-4px_rgba(59,130,246,0.08)] hover:shadow-[0_8px_30px_rgba(59,130,246,0.18)] transition p-4 xs:p-5 sm:p-6 flex flex-col justify-between min-h-[160px] sm:min-h-[200px] h-full relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#3B82F6]/10 to-transparent rounded-full blur-2xl pointer-events-none"></div>
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-[#3B82F6] to-[#60A5FA] shrink-0 ring-2 ring-white/10 shadow-[0_0_12px_rgba(59,130,246,0.35)] group-hover:scale-105 transition-transform duration-300">
                <Briefcase className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold text-[#3B82F6] uppercase tracking-widest font-sans opacity-95">Current Inventory Value</span>
            </div>

            <div>
              <h3 className="text-xl xs:text-2xl sm:text-3xl font-black tracking-tight text-[#3B82F6] font-mono">
                ${totalPurchaseValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <p className="text-[10px] text-[#93A3B8] mt-1 font-sans">Active tied assets (at Cost Price)</p>
            </div>

            <div className="border-t border-[#1E2A44]/65 pt-3.5">
              <span className="text-[9px] font-bold text-[#93A3B8] uppercase block font-sans tracking-wide">Valuation Form</span>
              <span className="text-[10px] text-[#93A3B8] block mt-0.5">
                Purchase Price × Stock count
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1E2A44]/65 flex items-center justify-between text-[11px] text-[#93A3B8] font-sans">
            <span className="opacity-80">Inventory live capital</span>
            <span className="text-[#3B82F6] font-mono text-[9px] font-bold tracking-wider bg-blue-950/40 px-2.5 py-1 rounded border border-[#3B82F6]/20">ASSET BASIS</span>
          </div>
        </motion.div>

      </div>

      {/* CHARTS CONTAINER VISUALIZERS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        
        {/* Sales trend graphic vector */}
        <div id="dashboard-sales-trend-graph" className="lg:col-span-2 bg-white rounded-2xl sm:rounded-[2rem] border border-slate-200/95 p-4 sm:p-8 shadow-xs space-y-6">
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
        <div className="bg-white rounded-2xl sm:rounded-[2rem] border border-slate-200/95 p-4 sm:p-8 shadow-xs space-y-6">
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
        <div className="bg-white rounded-2xl sm:rounded-[2rem] border border-slate-200/95 p-4 sm:p-8 shadow-xs space-y-5">
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
                  className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-rose-100 bg-rose-50/10 hover:bg-rose-50/20 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                >
                  <div className="space-y-1 w-full">
                    <p className="text-xs font-bold text-slate-900 tracking-tight">{prod.name}</p>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] text-slate-500">
                      <span>SKU: {prod.sku}</span>
                      <span className="hidden sm:inline">•</span>
                      <span className="text-rose-600 font-semibold">Live Stock: {prod.currentStock} / Alert {prod.minimumStockAlert}</span>
                    </div>
                  </div>

                  <a
                    href={`mailto:supplier@nexus.com?subject=紧急补货: ${prod.name}&body=Please dispatch emergency units of SKU ${prod.sku}.`}
                    className="w-full sm:w-auto text-center justify-center inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100/60 border border-rose-200 hover:bg-rose-100 rounded-lg px-3 py-2 sm:py-1.5 transition cursor-pointer shrink-0"
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
        <div className="bg-white rounded-2xl sm:rounded-[2rem] border border-slate-200/95 p-4 sm:p-8 shadow-xs space-y-5">
          <div>
            <h4 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-650 bg-indigo-600 animate-pulse"></span>
              Recent System Activity Logs
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">Live-audited operational logs captured in the Firestore database</p>
          </div>

          <div className="space-y-3 max-h-none sm:max-h-[340px] overflow-visible sm:overflow-y-auto pr-1">
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
                  <div key={log.id || index} className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/40 transition flex flex-col gap-2 bg-white">
                    <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1.5 xs:gap-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider w-fit ${
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
                      <span className="text-[9px] text-indigo-600 font-bold font-mono break-all sm:truncate sm:max-w-[200px]" title={log.user}>
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
      </>
      )}

      {/* --- BUSINESS CAPITAL RESERVES & INVESTMENT BOARD MODAL --- */}
      <AnimatePresence>
        {isCapitalModalOpen && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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
                  userRole === 'admin' 
                    ? 'bg-emerald-50/50 border-emerald-100' 
                    : userRole === 'accountant'
                    ? 'bg-indigo-50/50 border-indigo-100'
                    : 'bg-amber-50/50 border-amber-100'
                }`}>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <AlertTriangle className={`w-4 h-4 ${userRole === 'admin' ? 'text-emerald-600' : userRole === 'accountant' ? 'text-indigo-600' : 'text-amber-600'}`} />
                      <span>Security Clearance Auditing</span>
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Active Signed-In ERP Role: <span className="font-mono font-bold uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">{userRole}</span>.
                      {userRole === 'admin' || userRole === 'accountant'
                        ? ' Authorized to log new capital contributions.'
                        : ' Capital write capabilities restricted for your role.'
                      }
                    </p>
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

                  <form onSubmit={handleSaveCapital} className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
                    {/* Amount */}
                    <div className="relative w-full">
                      <DollarSign className="absolute left-3.5 top-[18px] w-4 h-4 text-slate-400" />
                      <input 
                        type="number"
                        step="0.01"
                        required
                        id="cap-amount-field"
                        placeholder=" "
                        value={newCapAmount}
                        onChange={(e) => setNewCapAmount(e.target.value)}
                        disabled={userRole !== 'admin'}
                        className="peer w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 pt-5 pb-1.5 text-xs font-semibold focus:border-indigo-605 focus:ring-1 focus:ring-indigo-605 focus:outline-none transition-all placeholder-transparent h-[52px] disabled:opacity-60 disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                      <label htmlFor="cap-amount-field" className="absolute left-9 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-placeholder-shown:left-9 peer-focus:top-1.5 peer-focus:left-9 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                        Amount ($ USD) <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                    </div>

                    {/* Completion date */}
                    <div className="relative w-full">
                      <input 
                        type="date"
                        required
                        id="cap-date-field"
                        placeholder=" "
                        value={newCapDate}
                        onChange={(e) => setNewCapDate(e.target.value)}
                        disabled={userRole !== 'admin'}
                        className="peer w-full rounded-xl border border-slate-200 bg-white px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:border-indigo-605 focus:ring-1 focus:ring-indigo-605 focus:outline-none transition-all placeholder-transparent h-[52px] disabled:opacity-60 disabled:bg-slate-100 disabled:cursor-not-allowed cursor-pointer"
                      />
                      <label htmlFor="cap-date-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                        Contribution Date <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                    </div>

                    {/* Note */}
                    <div className="relative w-full">
                      <input 
                        type="text"
                        id="cap-note-field"
                        placeholder=" "
                        value={newCapNote}
                        onChange={(e) => setNewCapNote(e.target.value)}
                        disabled={userRole !== 'admin'}
                        className="peer w-full rounded-xl border border-slate-200 bg-white px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:border-indigo-605 focus:ring-1 focus:ring-indigo-605 focus:outline-none transition-all placeholder-transparent h-[52px] disabled:opacity-60 disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                      <label htmlFor="cap-note-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                        Source Note / Equity Reference
                      </label>
                    </div>

                    <div className="md:col-span-3 flex justify-end pt-2">
                      <button 
                        type="submit"
                        disabled={userRole !== 'admin'}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] uppercase tracking-wider px-5 py-2.5 rounded-xl transition shadow-xs hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1.5 h-10"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Inflow Capital Investment</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Historic Equity Injections List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Equity Injection Registers</h4>
                  
                  <div className="border border-slate-100 rounded-2xl overflow-x-auto bg-white scrollbar-thin">
                    <table className="w-full text-left text-xs border-collapse min-w-[600px]">
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
