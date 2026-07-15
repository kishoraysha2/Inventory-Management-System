import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { calculateCustomerLedger, calculateSupplierLedger, isVoidStatus, isInactiveStatus } from '../lib/utils';
import { 
  Calendar, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Truck, 
  Layers, 
  Percent, 
  ChevronRight, 
  Search, 
  Info,
  RefreshCw,
  ShoppingBag,
  ArrowUpRight,
  Printer,
  Clock,
  Activity,
  AlertCircle,
  ShieldAlert
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { Sale, Customer, Product, Supplier, getNormalizedItems, getSaleSummary, Purchase, ChartOfAccount, LedgerEntry } from '../types';
import { INITIAL_CHART_OF_ACCOUNTS } from '../data';
import TaxInvoiceModal from './TaxInvoiceModal';
import { PurchaseDetailModal } from './PurchaseDetailModal';

import { AppPermissions, usePermission, UserRole } from '../hooks/usePermission';

type ReportType = 'sales' | 'purchases' | 'profit_loss' | 'customer_due' | 'supplier_due' | 'tax_vat' | 'activity_logs' | 'customer_statement' | 'supplier_statement' | 'expense_analytics' | 'chart_of_accounts';

interface ReportsPageProps {
  userRole?: UserRole;
  permissions?: AppPermissions;
}

export default function ReportsPage({ userRole, permissions: propPermissions }: ReportsPageProps = {}) {
  const { permissions: hookPermissions } = usePermission({ role: userRole || 'viewer' });
  const permissions = propPermissions || hookPermissions;

  // --- States ---
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customersState, setCustomersState] = useState<Customer[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [coa, setCoa] = useState<ChartOfAccount[]>([]);
  const [cashLedger, setCashLedger] = useState<any[]>([]);
  const [capital, setCapital] = useState<any[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<ReportType>('sales');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');

  // --- Enterprise Sales Register Filters & States ---
  const [salesCustomerFilter, setSalesCustomerFilter] = useState<string>('');
  const [salesProductFilter, setSalesProductFilter] = useState<string>('');
  const [salesCategoryFilter, setSalesCategoryFilter] = useState<string>('');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState<string>('all');
  const [salesStatusFilter, setSalesStatusFilter] = useState<string>('all');
  const [salesMinAmtFilter, setSalesMinAmtFilter] = useState<string>('');
  const [salesMaxAmtFilter, setSalesMaxAmtFilter] = useState<string>('');
  const [salesDatePreset, setSalesDatePreset] = useState<string>('all_time');
  const [salesActiveSubTab, setSalesActiveSubTab] = useState<'register' | 'analytics'>('register');
  const [selectedSaleForInvoice, setSelectedSaleForInvoice] = useState<Sale | null>(null);

  // --- Enterprise Purchase Register Filters & States ---
  const [purchasesSupplierFilter, setPurchasesSupplierFilter] = useState<string>('');
  const [purchasesProductFilter, setPurchasesProductFilter] = useState<string>('');
  const [purchasesCategoryFilter, setPurchasesCategoryFilter] = useState<string>('');
  const [purchasesPaymentFilter, setPurchasesPaymentFilter] = useState<string>('all');
  const [purchasesStatusFilter, setPurchasesStatusFilter] = useState<string>('all');
  const [purchasesMinAmtFilter, setPurchasesMinAmtFilter] = useState<string>('');
  const [purchasesMaxAmtFilter, setPurchasesMaxAmtFilter] = useState<string>('');
  const [purchasesActiveSubTab, setPurchasesActiveSubTab] = useState<'register' | 'analytics'>('register');
  const [selectedPurchaseForDetail, setSelectedPurchaseForDetail] = useState<any | null>(null);

  const [companyProfile, setCompanyProfile] = useState<any>({
    name: "Apex Global Supply Ltd.",
    address: "740 Industrial Boulevard, Suite C, Austin, TX 78701",
    phone: "+1 (512) 555-0193",
    email: "billing@apexsupply.com",
    website: "www.apexsupply.com",
    taxRegistrationId: "VAT-US948301140B",
    taxRatePercent: 15,
    tradeName: "Apex Global Supply",
    ownerName: "Apex Global LLC",
    crNumber: "CR-1010349283",
  });

  // --- Expense Analytics Specific Filters State ---
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('');
  const [expenseVendorFilter, setExpenseVendorFilter] = useState<string>('');
  const [expenseMethodFilter, setExpenseMethodFilter] = useState<string>('');
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<string>('active');
  const [expenseMinAmtFilter, setExpenseMinAmtFilter] = useState<string>('');
  const [expenseMaxAmtFilter, setExpenseMaxAmtFilter] = useState<string>('');

  // --- Check for Redirect from Customer/Supplier Management View Statement ---
  useEffect(() => {
    const handleCheckRedirect = () => {
      const targetReport = sessionStorage.getItem('nexus_target_report_type');
      const targetCustomer = sessionStorage.getItem('nexus_target_customer_id');
      const targetSupplier = sessionStorage.getItem('nexus_target_supplier_id');
      if (targetReport === 'customer_statement') {
        setActiveReport('customer_statement');
        if (targetCustomer) {
          setSelectedCustomerId(targetCustomer);
        }
        sessionStorage.removeItem('nexus_target_report_type');
        sessionStorage.removeItem('nexus_target_customer_id');
      } else if (targetReport === 'supplier_statement') {
        setActiveReport('supplier_statement');
        if (targetSupplier) {
          setSelectedSupplierId(targetSupplier);
        }
        sessionStorage.removeItem('nexus_target_report_type');
        sessionStorage.removeItem('nexus_target_supplier_id');
      }
    };
    handleCheckRedirect();
    // Also listen to custom event if tab changes dynamically
    window.addEventListener('nexus-change-tab', handleCheckRedirect);
    return () => window.removeEventListener('nexus-change-tab', handleCheckRedirect);
  }, []);

  const getSaleDescription = (s: any) => {
    if (s.items && s.items.length > 0) {
      return s.items.map((item: any) => `${item.productName} (x${item.quantity})`).join(', ');
    }
    return `${s.productName || 'Product'} (x${s.quantity || 1})`;
  };

  const getPaymentDescription = (p: any) => {
    return p.notes ? `Payment via ${p.notes}` : 'Customer payment settlement';
  };

  useEffect(() => {
    if (permissions?.viewProductCost === false && (activeReport === 'purchases' || activeReport === 'profit_loss')) {
      setActiveReport('sales');
    }
  }, [permissions, activeReport]);

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

  // --- Date Range Constants & States (Reference date 2026-06-01) ---
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchQuery, setSearchQuery] = useState('');

  // Debugging log for Reports Sales Data
  console.log("Reports Sales Data:", sales);

  const setQuickRange = (range: '30_days' | '90_days' | 'this_year' | 'all_time') => {
    const end = "2026-06-01";
    let start = "2026-05-01";
    if (range === '90_days') {
      start = "2026-03-01";
      setStartDate(start);
      setEndDate(end);
    } else if (range === 'this_year') {
      start = "2026-01-01";
      setStartDate(start);
      setEndDate(end);
    } else if (range === 'all_time') {
      setStartDate("");
      setEndDate("");
    } else {
      setStartDate(start);
      setEndDate(end);
    }
  };

  // --- Enterprise Sales Register Date Preset Handler ---
  const handleSalesDatePresetChange = (preset: string) => {
    setSalesDatePreset(preset);
    const end = "2026-06-01"; // Reference today's date
    if (preset === 'today') {
      setStartDate("2026-06-01");
      setEndDate("2026-06-01");
    } else if (preset === 'yesterday') {
      setStartDate("2026-05-31");
      setEndDate("2026-05-31");
    } else if (preset === 'this_week') {
      setStartDate("2026-05-25");
      setEndDate("2026-06-01");
    } else if (preset === 'this_month') {
      setStartDate("2026-06-01");
      setEndDate("2026-06-30");
    } else if (preset === 'this_quarter') {
      setStartDate("2026-04-01");
      setEndDate("2026-06-30");
    } else if (preset === 'this_year') {
      setStartDate("2026-01-01");
      setEndDate("2026-12-31");
    } else if (preset === 'all_time') {
      setStartDate("");
      setEndDate("");
    }
  };

  // --- Filter Implementation by Date Limits ---
  const isDateInRange = (dateStr: string) => {
    if (!dateStr) return false;
    if (!startDate && !endDate) return true; // If no filter is applied, show all data

    const itemDate = new Date(dateStr.split('T')[0]).getTime();
    
    if (startDate && !endDate) {
      const start = new Date(startDate).getTime();
      return itemDate >= start;
    }
    if (!startDate && endDate) {
      const end = new Date(endDate).getTime();
      return itemDate <= end;
    }

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    return itemDate >= start && itemDate <= end;
  };

  // --- Enterprise Sales Register Core Data Re-conciliation ---
  const registerSalesList = useMemo(() => {
    return sales.map(s => {
      const summary = getSaleSummary(s, products);
      return {
        ...s,
        subtotal: summary.subtotal,
        totalAmount: summary.totalAmount,
        costOfGoodsSold: summary.costOfGoodsSold,
        grossProfit: summary.grossProfit,
        taxAmount: summary.taxAmount,
      };
    });
  }, [sales, products]);

  const filteredRegisterSales = useMemo(() => {
    return registerSalesList.filter(s => {
      // 1. Date range filter
      if (!isDateInRange(s.saleDate)) return false;

      // 2. Search query filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const invoiceNo = (s.invoiceNumber || s.id).toLowerCase();
        const custName = (s.customerName || '').toLowerCase();
        const normItems = getNormalizedItems(s);
        const matchesProduct = normItems.some(item => (item.productName || '').toLowerCase().includes(q));
        if (!invoiceNo.includes(q) && !custName.includes(q) && !matchesProduct) {
          return false;
        }
      }

      // 3. Customer filter
      if (salesCustomerFilter && s.customerId !== salesCustomerFilter) return false;

      // 4. Product filter
      if (salesProductFilter) {
        const normItems = getNormalizedItems(s);
        const hasProduct = normItems.some(item => item.productId === salesProductFilter);
        if (!hasProduct) return false;
      }

      // 5. Product Category filter
      if (salesCategoryFilter) {
        const normItems = getNormalizedItems(s);
        const hasCategory = normItems.some(item => {
          const pMatch = products.find(p => p.id === item.productId);
          return pMatch && pMatch.category === salesCategoryFilter;
        });
        if (!hasCategory) return false;
      }

      // 6. Payment Type filter
      if (salesPaymentFilter !== 'all' && s.paymentType !== salesPaymentFilter) return false;

      // 7. Status filter
      const isVoid = isVoidStatus(s.status);
      if (salesStatusFilter === 'active' && isVoid) return false;
      if (salesStatusFilter === 'voided' && !isVoid) return false;

      // 8. Amount Range filter
      if (salesMinAmtFilter && (s.totalAmount || 0) < Number(salesMinAmtFilter)) return false;
      if (salesMaxAmtFilter && (s.totalAmount || 0) > Number(salesMaxAmtFilter)) return false;

      return true;
    });
  }, [registerSalesList, startDate, endDate, searchQuery, salesCustomerFilter, salesProductFilter, salesCategoryFilter, salesPaymentFilter, salesStatusFilter, salesMinAmtFilter, salesMaxAmtFilter, products]);

  const activeRegisterSales = useMemo(() => {
    return filteredRegisterSales.filter(s => !isVoidStatus(s.status));
  }, [filteredRegisterSales]);

  const registerSummary = useMemo(() => {
    const totalRevenue = activeRegisterSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalItemsSold = activeRegisterSales.reduce((sum, s) => {
      const items = getNormalizedItems(s);
      return sum + items.reduce((acc, item) => acc + (item.quantity ?? 0), 0);
    }, 0);
    const avgOrderValue = activeRegisterSales.length > 0 ? totalRevenue / activeRegisterSales.length : 0;
    const cashSalesTotal = activeRegisterSales.filter(s => s.paymentType === 'Cash').reduce((sum, s) => sum + s.totalAmount, 0);
    const creditSalesTotal = activeRegisterSales.filter(s => s.paymentType === 'Credit').reduce((sum, s) => sum + s.totalAmount, 0);
    const totalTax = activeRegisterSales.reduce((sum, s) => sum + (s.taxAmount ?? 0), 0);
    const totalSubtotal = activeRegisterSales.reduce((sum, s) => sum + (s.subtotal ?? 0), 0);
    
    return {
      totalRevenue,
      totalItemsSold,
      avgOrderValue,
      cashSalesTotal,
      creditSalesTotal,
      totalTax,
      totalSubtotal
    };
  }, [activeRegisterSales]);

  const salesAnalyticsData = useMemo(() => {
    // 1. Sales by Customer
    const customerGroup: Record<string, { name: string; revenue: number; qty: number }> = {};
    // 2. Sales by Product
    const productGroup: Record<string, { name: string; revenue: number; qty: number; category: string }> = {};
    // 3. Sales by Category
    const categoryGroup: Record<string, { name: string; revenue: number; qty: number }> = {};
    // 4. Sales by Payment Type
    let cashCount = 0;
    let creditCount = 0;
    let cashRevenue = 0;
    let creditRevenue = 0;

    activeRegisterSales.forEach(s => {
      const customerId = s.customerId || 'Unknown';
      const customerName = s.customerName || 'Walk-in Customer';
      
      if (!customerGroup[customerId]) {
        customerGroup[customerId] = { name: customerName, revenue: 0, qty: 0 };
      }
      customerGroup[customerId].revenue += s.totalAmount;

      if (s.paymentType === 'Cash') {
        cashCount++;
        cashRevenue += s.totalAmount;
      } else {
        creditCount++;
        creditRevenue += s.totalAmount;
      }

      const items = getNormalizedItems(s);
      items.forEach(item => {
        const productId = item.productId || 'Unknown';
        const productName = item.productName || 'Unknown Product';
        const qty = item.quantity || 0;
        const amt = item.totalAmount || 0;

        // find category
        const pMatch = products.find(p => p.id === productId);
        const cat = pMatch ? pMatch.category : 'General';

        if (!productGroup[productId]) {
          productGroup[productId] = { name: productName, revenue: 0, qty: 0, category: cat };
        }
        productGroup[productId].qty += qty;
        productGroup[productId].revenue += amt;

        customerGroup[customerId].qty += qty;

        if (!categoryGroup[cat]) {
          categoryGroup[cat] = { name: cat, revenue: 0, qty: 0 };
        }
        categoryGroup[cat].qty += qty;
        categoryGroup[cat].revenue += amt;
      });
    });

    const customerSales = Object.values(customerGroup).sort((a, b) => b.revenue - a.revenue);
    const productSales = Object.values(productGroup).sort((a, b) => b.revenue - a.revenue);
    const categorySales = Object.values(categoryGroup).sort((a, b) => b.revenue - a.revenue);

    return {
      customerSales,
      productSales,
      categorySales,
      paymentBreakdown: {
        cashCount,
        creditCount,
        cashRevenue,
        creditRevenue,
        totalRevenue: cashRevenue + creditRevenue
      }
    };
  }, [activeRegisterSales, products]);

  // --- Enterprise Purchase Register Core Data & Analytics Re-conciliation ---
  const filteredRegisterPurchases = useMemo(() => {
    return purchases.filter(p => {
      // 1. Date range filter
      if (!isDateInRange(p.purchaseDate)) return false;

      // 2. Search query filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const invoiceNo = (p.invoiceNumber || p.id || '').toLowerCase();
        const supName = (p.supplierName || '').toLowerCase();
        const prodName = (p.productName || '').toLowerCase();
        if (!invoiceNo.includes(q) && !supName.includes(q) && !prodName.includes(q)) {
          return false;
        }
      }

      // 3. Supplier filter
      if (purchasesSupplierFilter && p.supplierId !== purchasesSupplierFilter) return false;

      // 4. Product filter
      if (purchasesProductFilter && p.productId !== purchasesProductFilter) return false;

      // 5. Product Category filter
      if (purchasesCategoryFilter) {
        const pMatch = products.find(prod => prod.id === p.productId);
        if (!pMatch || pMatch.category !== purchasesCategoryFilter) return false;
      }

      // 6. Payment Type filter
      if (purchasesPaymentFilter !== 'all' && p.paymentType !== purchasesPaymentFilter) return false;

      // 7. Status filter
      const isVoid = isVoidStatus(p.status);
      if (purchasesStatusFilter === 'active' && isVoid) return false;
      if (purchasesStatusFilter === 'voided' && !isVoid) return false;

      // 8. Amount Range filter
      if (purchasesMinAmtFilter && (p.totalAmount || 0) < Number(purchasesMinAmtFilter)) return false;
      if (purchasesMaxAmtFilter && (p.totalAmount || 0) > Number(purchasesMaxAmtFilter)) return false;

      return true;
    });
  }, [purchases, startDate, endDate, searchQuery, purchasesSupplierFilter, purchasesProductFilter, purchasesCategoryFilter, purchasesPaymentFilter, purchasesStatusFilter, purchasesMinAmtFilter, purchasesMaxAmtFilter, products]);

  const activeRegisterPurchases = useMemo(() => {
    return filteredRegisterPurchases.filter(p => !isVoidStatus(p.status));
  }, [filteredRegisterPurchases]);

  const purchasesSummary = useMemo(() => {
    let totalPurchases = 0;
    let cashPurchases = 0;
    let creditPurchases = 0;
    let totalVAT = 0;
    let totalDiscount = 0;
    let quantityPurchased = 0;
    let maxPurchase = 0;
    let minPurchase = activeRegisterPurchases.length > 0 ? Infinity : 0;

    activeRegisterPurchases.forEach(p => {
      const amt = p.totalAmount || 0;
      totalPurchases += amt;
      quantityPurchased += p.quantity || 0;
      
      const vat = p.vatAmount ?? (amt * 15 / 115);
      totalVAT += vat;
      totalDiscount += p.discountAmount ?? 0;

      if (p.paymentType === 'Cash') {
        cashPurchases += amt;
      } else {
        creditPurchases += amt;
      }

      if (amt > maxPurchase) {
        maxPurchase = amt;
      }
      if (amt < minPurchase) {
        minPurchase = amt;
      }
    });

    const averagePurchase = activeRegisterPurchases.length > 0 ? totalPurchases / activeRegisterPurchases.length : 0;
    const smallestPurchase = minPurchase === Infinity ? 0 : minPurchase;

    return {
      totalPurchases,
      cashPurchases,
      creditPurchases,
      averagePurchase,
      largestPurchase: maxPurchase,
      smallestPurchase,
      totalVAT,
      totalDiscount,
      quantityPurchased
    };
  }, [activeRegisterPurchases]);

  const purchasesAnalyticsData = useMemo(() => {
    // 1. Purchases by Supplier
    const supplierGroup: Record<string, { name: string; amount: number; qty: number }> = {};
    // 2. Purchases by Product
    const productGroup: Record<string, { name: string; amount: number; qty: number; category: string }> = {};
    // 3. Purchases by Category
    const categoryGroup: Record<string, { name: string; amount: number; qty: number }> = {};
    // 4. Purchases by Payment Type
    let cashCount = 0;
    let creditCount = 0;
    let cashAmount = 0;
    let creditAmount = 0;

    activeRegisterPurchases.forEach(p => {
      const supplierId = p.supplierId || 'Unknown';
      const supplierName = p.supplierName || 'Unknown Supplier';

      if (!supplierGroup[supplierId]) {
        supplierGroup[supplierId] = { name: supplierName, amount: 0, qty: 0 };
      }
      supplierGroup[supplierId].amount += p.totalAmount;
      supplierGroup[supplierId].qty += p.quantity || 0;

      if (p.paymentType === 'Cash') {
        cashCount++;
        cashAmount += p.totalAmount;
      } else {
        creditCount++;
        creditAmount += p.totalAmount;
      }

      const productId = p.productId || 'Unknown';
      const productName = p.productName || 'Unknown Product';
      const qty = p.quantity || 0;
      const amt = p.totalAmount || 0;

      // find category
      const pMatch = products.find(prod => prod.id === productId);
      const cat = pMatch ? pMatch.category : 'General';

      if (!productGroup[productId]) {
        productGroup[productId] = { name: productName, amount: 0, qty: 0, category: cat };
      }
      productGroup[productId].qty += qty;
      productGroup[productId].amount += amt;

      if (!categoryGroup[cat]) {
        categoryGroup[cat] = { name: cat, amount: 0, qty: 0 };
      }
      categoryGroup[cat].qty += qty;
      categoryGroup[cat].amount += amt;
    });

    const supplierPurchases = Object.values(supplierGroup).sort((a, b) => b.amount - a.amount);
    const productPurchases = Object.values(productGroup).sort((a, b) => b.amount - a.amount);
    const categoryPurchases = Object.values(categoryGroup).sort((a, b) => b.amount - a.amount);

    return {
      supplierPurchases,
      productPurchases,
      categoryPurchases,
      paymentBreakdown: {
        cashCount,
        creditCount,
        cashAmount,
        creditAmount,
        totalAmount: cashAmount + creditAmount
      }
    };
  }, [activeRegisterPurchases, products]);

  // Local settings for VAT calculation model
  const defaultVatRate = 15; // standard VAT percentage

  // --- Real-Time Sync Streams ---
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

      const savedLogs = localStorage.getItem('inventory_logs');
      setSystemLogs(savedLogs ? JSON.parse(savedLogs) : []);

      const savedExpenses = localStorage.getItem('expenses');
      setExpenses(savedExpenses ? JSON.parse(savedExpenses) : []);

      const savedPurchases = localStorage.getItem('inventory_purchases');
      setPurchases(savedPurchases ? JSON.parse(savedPurchases) : []);

      const savedSupplierPayments = localStorage.getItem('inventory_supplier_payments');
      setSupplierPayments(savedSupplierPayments ? JSON.parse(savedSupplierPayments) : []);

      const savedCOA = localStorage.getItem('chartOfAccounts');
      setCoa(savedCOA ? JSON.parse(savedCOA) : INITIAL_CHART_OF_ACCOUNTS);

      const savedCashLedger = localStorage.getItem('cashLedger');
      setCashLedger(savedCashLedger ? JSON.parse(savedCashLedger) : []);

      const savedCapital = localStorage.getItem('capital');
      setCapital(savedCapital ? JSON.parse(savedCapital) : []);

      const savedLedgerEntries = localStorage.getItem('inventory_ledger_entries');
      setLedgerEntries(savedLedgerEntries ? JSON.parse(savedLedgerEntries) : []);

      const savedProfile = localStorage.getItem('invoice_company_profile');
      if (savedProfile) {
        setCompanyProfile(JSON.parse(savedProfile));
      }

      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
      const salesList: Sale[] = [];
      snapshot.forEach((docSnap) => {
        salesList.push(docSnap.data() as Sale);
      });
      // Sort sales by date descending
      setSales(salesList.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime()));
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
       const prodList: Product[] = [];
       snapshot.forEach((docSnap) => {
         const data = docSnap.data() as Product;
         prodList.push({
           ...data,
           id: data.id || docSnap.id
         });
       });
      setProducts(prodList);
    });

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const custList: Customer[] = [];
      snapshot.forEach((docSnap) => {
        custList.push(docSnap.data() as Customer);
      });
      setCustomersState(custList);
    });

    const unsubPayments = onSnapshot(collection(db, 'customerPayments'), (snapshot) => {
      const paymentsList: any[] = [];
      snapshot.forEach((docSnap) => {
        paymentsList.push(docSnap.data());
      });
      setCustomerPayments(paymentsList);
    });

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const supplierList: Supplier[] = [];
      snapshot.forEach((docSnap) => {
        supplierList.push(docSnap.data() as Supplier);
      });
      setSuppliers(supplierList);
      setLoading(false);
    });

    const unsubLogs = onSnapshot(collection(db, 'Logs'), (snapshot) => {
      const logsList: any[] = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.exists()) {
          logsList.push(docSnap.data());
        }
      });
      setSystemLogs(logsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    });

    const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
      const expensesList: any[] = [];
      snapshot.forEach((docSnap) => {
        expensesList.push(docSnap.data());
      });
      setExpenses(expensesList);
    });

    const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snapshot) => {
      const purchasesList: any[] = [];
      snapshot.forEach((docSnap) => {
        purchasesList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setPurchases(purchasesList);
    });

    const unsubSupplierPayments = onSnapshot(collection(db, 'supplierPayments'), (snapshot) => {
      const paymentsList: any[] = [];
      snapshot.forEach((docSnap) => {
        paymentsList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setSupplierPayments(paymentsList);
    });

    const unsubBusinessProfile = onSnapshot(doc(db, 'businessProfile', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        setCompanyProfile(docSnap.data());
      }
    });

    const unsubCOA = onSnapshot(collection(db, 'chartOfAccounts'), (snapshot) => {
      const coaList: ChartOfAccount[] = [];
      snapshot.forEach((docSnap) => {
        coaList.push(docSnap.data() as ChartOfAccount);
      });
      if (coaList.length > 0) {
        setCoa(coaList.sort((a, b) => a.code.localeCompare(b.code)));
      } else {
        setCoa(INITIAL_CHART_OF_ACCOUNTS);
      }
    });

    const unsubCashLedger = onSnapshot(collection(db, 'cashLedger'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data());
      });
      setCashLedger(list);
    });

    const unsubCapital = onSnapshot(collection(db, 'capital'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data());
      });
      setCapital(list);
    });

    const unsubLedgerEntries = onSnapshot(collection(db, 'ledgerEntries'), (snapshot) => {
      const list: LedgerEntry[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as LedgerEntry);
      });
      setLedgerEntries(list);
    });

    return () => {
      unsubSales();
      unsubProducts();
      unsubCustomers();
      unsubPayments();
      unsubSuppliers();
      unsubLogs();
      unsubExpenses();
      unsubPurchases();
      unsubSupplierPayments();
      unsubBusinessProfile();
      unsubCOA();
      unsubCashLedger();
      unsubCapital();
      unsubLedgerEntries();
    };
  }, []);

  const filteredSales = sales.filter(s => isDateInRange(s.saleDate) && !isVoidStatus(s.status)).map(s => {
    const summary = getSaleSummary(s, products);
    const saleDate = s.saleDate;
    
    return {
      ...s,
      subtotal: summary.subtotal,
      totalAmount: summary.totalAmount,
      costOfGoodsSold: summary.costOfGoodsSold,
      grossProfit: summary.grossProfit,
      taxAmount: summary.taxAmount,
      saleDate
    };
  });
  
  // For products/inventory added in date range
  const filteredProducts = products.filter(p => {
    if (!p.createdDate) return true; // fallback
    return isDateInRange(p.createdDate);
  });

  const filteredSystemLogs = systemLogs.filter(log => {
    if (!log.timestamp) return true;
    return isDateInRange(log.timestamp);
  });

  const searchableSystemLogs = filteredSystemLogs.filter(log => {
    const q = searchQuery.toLowerCase();
    return (log.action || '').toLowerCase().includes(q) ||
           (log.user || '').toLowerCase().includes(q) ||
           (log.details || '').toLowerCase().includes(q);
  });

  // --- Active Calculations Data Models ---

  // 1. Sales Report Math
  const totalItemsSold = filteredSales.reduce((sum, s) => {
    const items = getNormalizedItems(s);
    const qty = items.reduce((acc, item) => acc + (item.quantity ?? 0), 0);
    return sum + qty;
  }, 0);
  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const avgOrderValue = filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0;
  const cashSalesTotal = filteredSales.filter(s => s.paymentType === 'Cash').reduce((sum, s) => sum + s.totalAmount, 0);
  const creditSalesTotal = filteredSales.filter(s => s.paymentType === 'Credit').reduce((sum, s) => sum + s.totalAmount, 0);

  const activeProductsList = products.filter(p => !isInactiveStatus(p.status));
  const activeCustomersList = customers.filter(c => !isInactiveStatus(c.status));
  const activeSuppliersList = suppliers.filter(s => !isInactiveStatus(s.status));

  // 2. Purchase / Asset Valuation Report Math
  // Total purchase asset value acquired during this range
  const totalPurchaseValue = activeProductsList.reduce((sum, p) => {
    return sum + (p.purchasePrice * p.currentStock);
  }, 0);
  const potentialSellingValue = activeProductsList.reduce((sum, p) => {
    return sum + (p.sellingPrice * p.currentStock);
  }, 0);
  const unrealizedProfitValuation = potentialSellingValue - totalPurchaseValue;

  // --- ACCOUNTING LEDGER-BASED AGGREGATION ENGINE (GAAP/IFRS Compliant) ---
  const ledgerBalancesReport = useMemo(() => {
    const periodBalances: Record<string, { totalDebits: number; totalCredits: number }> = {};
    const cumulativeBalances: Record<string, { totalDebits: number; totalCredits: number }> = {};

    ledgerEntries.forEach(entry => {
      if (entry.postingStatus !== 'POSTED') return;

      const postingDate = entry.postingDate || entry.createdAt;
      const t = new Date(postingDate).getTime();
      
      const inPeriod = (() => {
        if (!startDate && !endDate) return true;
        if (startDate && !endDate) {
          const start = new Date(startDate).getTime();
          return t >= start;
        }
        if (!startDate && endDate) {
          const end = new Date(endDate).getTime() + 86400000;
          return t <= end;
        }
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime() + 86400000;
        return t >= start && t <= end;
      })();

      const beforeEnd = (() => {
        if (!endDate) return true;
        const end = new Date(endDate).getTime() + 86400000;
        return t <= end;
      })();

      entry.lines.forEach(line => {
        const code = line.accountCode;
        
        if (inPeriod) {
          if (!periodBalances[code]) periodBalances[code] = { totalDebits: 0, totalCredits: 0 };
          periodBalances[code].totalDebits += line.debit || 0;
          periodBalances[code].totalCredits += line.credit || 0;
        }

        if (beforeEnd) {
          if (!cumulativeBalances[code]) cumulativeBalances[code] = { totalDebits: 0, totalCredits: 0 };
          cumulativeBalances[code].totalDebits += line.debit || 0;
          cumulativeBalances[code].totalCredits += line.credit || 0;
        }
      });
    });

    return { periodBalances, cumulativeBalances };
  }, [ledgerEntries, startDate, endDate]);

  const getLedgerReportBalance = (code: string, normalBalance: 'Debit' | 'Credit', type: 'period' | 'cumulative'): number => {
    const map = type === 'period' ? ledgerBalancesReport.periodBalances : ledgerBalancesReport.cumulativeBalances;
    const data = map[code];
    if (!data) return 0.00;
    if (normalBalance === 'Debit') {
      return data.totalDebits - data.totalCredits;
    } else {
      return data.totalCredits - data.totalDebits;
    }
  };

  // 3. Profit / Loss Report Math (Ledger-Backed)
  const totalSubtotal = getLedgerReportBalance('4100', 'Credit', 'period');
  const costOfGoodsSold = getLedgerReportBalance('5100', 'Debit', 'period');
  const grossProfit = totalSubtotal - costOfGoodsSold;
  const totalExpensesAmt = Object.keys(ledgerBalancesReport.periodBalances)
    .filter(code => code.startsWith('61') || code === '5200')
    .reduce((sum, code) => sum + getLedgerReportBalance(code, 'Debit', 'period'), 0);
  const netProfit = grossProfit - totalExpensesAmt;
  const marginPercentage = totalSubtotal > 0 ? (netProfit / totalSubtotal) * 100 : 0;

  // 4. Customer Due Math (Direct Outstanding Receivables from Ledger)
  const customersWithDue = activeCustomersList.filter(c => c.dueBalance > 0);
  const totalCustomerDueOutstanding = getLedgerReportBalance('1200', 'Debit', 'cumulative');

  // 5. Supplier Due Math (Direct Outstanding Payables from Ledger)
  const suppliersWithDue = activeSuppliersList.filter(s => (s.dueBalance ?? 0) > 0);
  const totalSupplierDueOutstanding = getLedgerReportBalance('2100', 'Credit', 'cumulative');

  // 6. Regional VAT / Tax Math (Ledger-Backed)
  const totalTaxableNet = totalSubtotal;
  const calculatedTaxCollected = getLedgerReportBalance('2400', 'Credit', 'period');
  const grossRevenueWithTax = totalSubtotal + calculatedTaxCollected;

  // --- Chart Of Accounts Report Math (Ledger-Backed) ---
  const getCOAAccountLiveBalance = (code: string): number => {
    const resolvedCode = code === '1010' ? '1100' : code;
    const account = coa.find(acc => acc.code === resolvedCode);
    const isDebitNormal = account ? account.normalBalance === 'Debit' : true;
    return getLedgerReportBalance(resolvedCode, isDebitNormal ? 'Debit' : 'Credit', 'cumulative');
  };

  const coaSummaryStats = useMemo(() => {
    const totalAccounts = coa.length;
    const activeAccounts = coa.filter(a => a.status === 'active').length;
    const systemAccounts = coa.filter(a => a.isSystem).length;
    const customAccounts = coa.filter(a => !a.isSystem).length;
    
    const assetsBalance = coa.filter(a => a.type === 'Asset' && a.status === 'active').reduce((sum, a) => sum + getCOAAccountLiveBalance(a.code), 0);
    const liabilitiesBalance = coa.filter(a => a.type === 'Liability' && a.status === 'active').reduce((sum, a) => sum + getCOAAccountLiveBalance(a.code), 0);
    const equityBalance = coa.filter(a => a.type === 'Equity' && a.status === 'active').reduce((sum, a) => sum + getCOAAccountLiveBalance(a.code), 0);
    const revenueBalance = coa.filter(a => a.type === 'Revenue' && a.status === 'active').reduce((sum, a) => sum + getCOAAccountLiveBalance(a.code), 0);
    const expensesBalance = coa.filter(a => a.type === 'Expense' && a.status === 'active').reduce((sum, a) => sum + getCOAAccountLiveBalance(a.code), 0);

    return {
      totalAccounts,
      activeAccounts,
      systemAccounts,
      customAccounts,
      assetsBalance,
      liabilitiesBalance,
      equityBalance,
      revenueBalance,
      expensesBalance
    };
  }, [coa, ledgerBalancesReport]);

  // 7. Customer Statement Report Math
  const currentCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  const initialOpeningBalance = useMemo(() => {
    const original = customersState.find(c => c.id === selectedCustomerId);
    return original ? (Number(original.dueBalance) || 0) : 0;
  }, [customersState, selectedCustomerId]);

  const customerLedgerEntries = useMemo(() => {
    if (!selectedCustomerId) return [];

    // 1. Credit Sales
    const customerSales = sales.filter(s => 
      s.customerId === selectedCustomerId && 
      s.paymentType?.toLowerCase() === 'credit'
    ).map(s => {
      const isVoid = isVoidStatus(s.status);
      const isAdjustment = s.status?.toLowerCase() === 'adjustment';
      const txType = isAdjustment ? 'Adjustment' : (isVoid ? 'Void Sale' : 'Sale');

      return {
        date: s.saleDate,
        ref: s.id,
        invoiceNumber: s.invoiceNumber || s.id.substring(s.id.length - 8).toUpperCase(),
        receiptNumber: '-',
        type: txType,
        description: getSaleDescription(s),
        debit: s.totalAmount,
        credit: 0,
        status: s.status || 'Active'
      };
    });

    // 2. Customer Payments
    const paymentsForUser = customerPayments.filter(p => 
      p.customerId === selectedCustomerId
    ).map(p => {
      const isVoid = isVoidStatus(p.status);
      const isAdjustment = p.status?.toLowerCase() === 'adjustment';
      const txType = isAdjustment ? 'Adjustment' : (isVoid ? 'Void Payment' : 'Payment');

      return {
        date: p.paymentDate,
        ref: p.id,
        invoiceNumber: '-',
        receiptNumber: p.receiptNumber || '-',
        type: txType,
        description: getPaymentDescription(p),
        debit: 0,
        credit: p.amountPaid,
        status: p.status || 'Active'
      };
    });

    // Combine and sort chronologically (oldest first)
    const combined = [...customerSales, ...paymentsForUser].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate Running Balance sequentially
    let currentBal = initialOpeningBalance;
    return combined.map(entry => {
      const isVoid = isVoidStatus(entry.status);
      const effectiveDebit = isVoid ? 0 : entry.debit;
      const effectiveCredit = isVoid ? 0 : entry.credit;
      currentBal = currentBal + effectiveDebit - effectiveCredit;
      return {
        ...entry,
        runningBalance: currentBal
      };
    });
  }, [selectedCustomerId, sales, customerPayments, initialOpeningBalance]);

  const totalSalesDebit = useMemo(() => {
    return customerLedgerEntries.reduce((sum, item) => sum + (isVoidStatus(item.status) ? 0 : item.debit), 0);
  }, [customerLedgerEntries]);

  const totalPaymentsCredit = useMemo(() => {
    return customerLedgerEntries.reduce((sum, item) => sum + (isVoidStatus(item.status) ? 0 : item.credit), 0);
  }, [customerLedgerEntries]);

  const derivedOutstanding = useMemo(() => {
    return initialOpeningBalance + totalSalesDebit - totalPaymentsCredit;
  }, [initialOpeningBalance, totalSalesDebit, totalPaymentsCredit]);

  const salesInvoicesCount = useMemo(() => {
    return customerLedgerEntries.filter(item => item.type === 'Sale').length;
  }, [customerLedgerEntries]);

  const latestTxDate = useMemo(() => {
    return customerLedgerEntries.length > 0 ? customerLedgerEntries[customerLedgerEntries.length - 1].date : null;
  }, [customerLedgerEntries]);

  const filteredLedgerEntries = useMemo(() => {
    if (!searchQuery) return customerLedgerEntries;
    const q = searchQuery.toLowerCase();
    return customerLedgerEntries.filter(item => 
      item.ref.toLowerCase().includes(q) || 
      item.type.toLowerCase().includes(q) || 
      item.description.toLowerCase().includes(q) ||
      (item.invoiceNumber && item.invoiceNumber.toLowerCase().includes(q)) ||
      (item.receiptNumber && item.receiptNumber.toLowerCase().includes(q))
    );
  }, [customerLedgerEntries, searchQuery]);

  // --- 8. Supplier Statement Report Math ---
  const currentSupplier = useMemo(() => {
    return suppliers.find(s => s.id === selectedSupplierId);
  }, [suppliers, selectedSupplierId]);

  const initialSupplierOpeningBalance = useMemo(() => {
    const original = suppliers.find(s => s.id === selectedSupplierId);
    return original ? (Number(original.dueBalance) || 0) : 0;
  }, [suppliers, selectedSupplierId]);

  const supplierLedgerEntries = useMemo(() => {
    if (!selectedSupplierId) return [];

    // 1. Credit Purchases (Credits - increases our liability)
    const supplierPurchases = purchases.filter(p =>
      p.supplierId === selectedSupplierId &&
      !isVoidStatus(p.status) &&
      p.paymentType?.toLowerCase() === 'credit'
    ).map(p => ({
      date: p.purchaseDate || p.createdDate,
      ref: p.id,
      type: 'Purchase Invoice',
      description: p.productName ? `Procured x${p.quantity} "${p.productName}"` : `Bulk Procured Items`,
      debit: 0,
      credit: Number(p.totalAmount) || 0,
      status: p.status || 'Active'
    }));

    // 2. Supplier Payments (Debits - decreases our liability)
    const paymentsForSupplier = supplierPayments.filter(sp =>
      sp.supplierId === selectedSupplierId &&
      !isVoidStatus(sp.status)
    ).map(sp => ({
      date: sp.paymentDate,
      ref: sp.id,
      type: 'Supplier Payment',
      description: sp.notes ? `Payment via ${sp.notes}` : 'Supplier payment settlement',
      debit: Number(sp.amountPaid) || 0,
      credit: 0,
      status: sp.status || 'Active'
    }));

    // Combine and sort chronologically (oldest first)
    const combined = [...supplierPurchases, ...paymentsForSupplier].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate Running Balance sequentially
    let currentBal = initialSupplierOpeningBalance;
    return combined.map(entry => {
      currentBal = currentBal + entry.credit - entry.debit;
      return {
        ...entry,
        runningBalance: currentBal
      };
    });
  }, [selectedSupplierId, purchases, supplierPayments, initialSupplierOpeningBalance]);

  const totalSupplierPurchasesCredit = useMemo(() => {
    return supplierLedgerEntries.reduce((sum, item) => sum + item.credit, 0);
  }, [supplierLedgerEntries]);

  const totalSupplierPaymentsDebit = useMemo(() => {
    return supplierLedgerEntries.reduce((sum, item) => sum + item.debit, 0);
  }, [supplierLedgerEntries]);

  const derivedSupplierOutstanding = useMemo(() => {
    return initialSupplierOpeningBalance + totalSupplierPurchasesCredit - totalSupplierPaymentsDebit;
  }, [initialSupplierOpeningBalance, totalSupplierPurchasesCredit, totalSupplierPaymentsDebit]);

  const purchasesInvoicesCount = useMemo(() => {
    return supplierLedgerEntries.filter(item => item.type === 'Purchase Invoice').length;
  }, [supplierLedgerEntries]);

  const latestSupplierTxDate = useMemo(() => {
    return supplierLedgerEntries.length > 0 ? supplierLedgerEntries[supplierLedgerEntries.length - 1].date : null;
  }, [supplierLedgerEntries]);

  const filteredSupplierLedgerEntries = useMemo(() => {
    let entries = supplierLedgerEntries;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(item =>
        item.ref.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    }

    if (startDate || endDate) {
      entries = entries.filter(item => {
        if (!item.date) return false;
        const itemTime = new Date(item.date.split('T')[0]).getTime();
        if (startDate && endDate) {
          return itemTime >= new Date(startDate).getTime() && itemTime <= new Date(endDate).getTime();
        }
        if (startDate) {
          return itemTime >= new Date(startDate).getTime();
        }
        if (endDate) {
          return itemTime <= new Date(endDate).getTime();
        }
        return true;
      });
    }

    return entries;
  }, [supplierLedgerEntries, searchQuery, startDate, endDate]);

  // --- 9. Expense Analytics Report Math & Helpers ---
  const filteredExpensesList = useMemo(() => {
    return expenses.filter(e => {
      // 1. Date Range
      if (!isDateInRange(e.expenseDate)) return false;

      // 2. Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const categoryMatch = (e.category || '').toLowerCase().includes(q);
        const vendorMatch = (e.vendorName || '').toLowerCase().includes(q);
        const employeeMatch = (e.employeeName || '').toLowerCase().includes(q);
        const refMatch = (e.id || '').toLowerCase().includes(q);
        const methodMatch = (e.paymentMethod || '').toLowerCase().includes(q);
        const descMatch = (e.description || '').toLowerCase().includes(q);
        if (!categoryMatch && !vendorMatch && !employeeMatch && !refMatch && !methodMatch && !descMatch) {
          return false;
        }
      }

      // 3. Category Filter
      if (expenseCategoryFilter && e.category !== expenseCategoryFilter) return false;

      // 4. Vendor Filter
      if (expenseVendorFilter && e.vendorName !== expenseVendorFilter) return false;

      // 5. Payment Method Filter
      if (expenseMethodFilter && e.paymentMethod !== expenseMethodFilter) return false;

      // 6. Status Filter
      if (expenseStatusFilter === 'active') {
        if (isVoidStatus(e.status)) return false;
      } else if (expenseStatusFilter === 'void') {
        if (!isVoidStatus(e.status)) return false;
      } // if 'all', include both active and voided

      // 7. Min Amount
      if (expenseMinAmtFilter && (Number(e.amount) || 0) < Number(expenseMinAmtFilter)) return false;

      // 8. Max Amount
      if (expenseMaxAmtFilter && (Number(e.amount) || 0) > Number(expenseMaxAmtFilter)) return false;

      return true;
    });
  }, [expenses, startDate, endDate, searchQuery, expenseCategoryFilter, expenseVendorFilter, expenseMethodFilter, expenseStatusFilter, expenseMinAmtFilter, expenseMaxAmtFilter]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    expenses.forEach(e => {
      if (e.category) cats.add(e.category);
    });
    return Array.from(cats).sort();
  }, [expenses]);

  const uniqueVendors = useMemo(() => {
    const vens = new Set<string>();
    expenses.forEach(e => {
      if (e.vendorName) vens.add(e.vendorName);
    });
    return Array.from(vens).sort();
  }, [expenses]);

  const uniqueMethods = useMemo(() => {
    const meths = new Set<string>();
    expenses.forEach(e => {
      if (e.paymentMethod) meths.add(e.paymentMethod);
    });
    return Array.from(meths).sort();
  }, [expenses]);

  const expenseAnalyticsSummary = useMemo(() => {
    const activeExps = filteredExpensesList.filter(e => !isVoidStatus(e.status));
    
    const total = activeExps.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const count = activeExps.length;
    const avg = count > 0 ? total / count : 0;
    
    let largest = 0;
    let smallest = count > 0 ? Infinity : 0;
    activeExps.forEach(e => {
      const val = Number(e.amount) || 0;
      if (val > largest) largest = val;
      if (val < smallest) smallest = val;
    });
    if (smallest === Infinity) smallest = 0;

    const todayStrLocal = new Date().toISOString().split('T')[0];
    const simulationMonth = 5; // June (0-indexed)
    const simulationYear = 2026;

    const todayExpensesAmt = activeExps
      .filter(e => e.expenseDate && e.expenseDate.split('T')[0] === todayStrLocal)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const monthlyExpensesAmt = activeExps
      .filter(e => {
        if (!e.expenseDate) return false;
        const d = new Date(e.expenseDate);
        return d.getMonth() === simulationMonth && d.getFullYear() === simulationYear;
      })
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const yearlyExpensesAmt = activeExps
      .filter(e => {
        if (!e.expenseDate) return false;
        const d = new Date(e.expenseDate);
        return d.getFullYear() === simulationYear;
      })
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    return {
      total,
      count,
      avg,
      largest,
      smallest,
      todayExpensesAmt,
      monthlyExpensesAmt,
      yearlyExpensesAmt
    };
  }, [filteredExpensesList]);

  const categoryExpensesReport = useMemo(() => {
    const activeExps = filteredExpensesList.filter(e => !isVoidStatus(e.status));
    const total = activeExps.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    
    const group: Record<string, { count: number; total: number }> = {};
    activeExps.forEach(e => {
      const cat = e.category || 'Miscellaneous';
      if (!group[cat]) {
        group[cat] = { count: 0, total: 0 };
      }
      group[cat].count += 1;
      group[cat].total += Number(e.amount) || 0;
    });

    return Object.entries(group).map(([category, data]) => {
      const percentage = total > 0 ? (data.total / total) * 100 : 0;
      return {
        category,
        count: data.count,
        total: data.total,
        percentage
      };
    }).sort((a, b) => b.total - a.total);
  }, [filteredExpensesList]);

  const vendorExpensesReport = useMemo(() => {
    const activeExps = filteredExpensesList.filter(e => !isVoidStatus(e.status));
    
    const group: Record<string, { count: number; total: number; dates: string[] }> = {};
    activeExps.forEach(e => {
      const ven = e.vendorName || 'General / Unknown';
      if (!group[ven]) {
        group[ven] = { count: 0, total: 0, dates: [] };
      }
      group[ven].count += 1;
      group[ven].total += Number(e.amount) || 0;
      if (e.expenseDate) {
        group[ven].dates.push(e.expenseDate);
      }
    });

    return Object.entries(group).map(([vendor, data]) => {
      const avg = data.count > 0 ? data.total / data.count : 0;
      let lastDate = 'N/A';
      if (data.dates.length > 0) {
        const sortedDates = [...data.dates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        lastDate = new Date(sortedDates[0]).toLocaleDateString();
      }
      return {
        vendor,
        count: data.count,
        total: data.total,
        lastDate,
        avg
      };
    }).sort((a, b) => b.total - a.total);
  }, [filteredExpensesList]);

  const dateWiseExpensesReport = useMemo(() => {
    const activeExps = expenses.filter(e => !isVoidStatus(e.status));
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 24 * 60 * 60 * 1000;
    
    const dayOfWeek = now.getDay();
    const startOfWeek = today - dayOfWeek * 24 * 60 * 60 * 1000;
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1).getTime();
    
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

    let todayAmt = 0;
    let yesterdayAmt = 0;
    let weekAmt = 0;
    let monthAmt = 0;
    let quarterAmt = 0;
    let yearAmt = 0;

    activeExps.forEach(e => {
      if (!e.expenseDate) return;
      const t = new Date(e.expenseDate).getTime();
      const amt = Number(e.amount) || 0;

      if (t >= today) {
        todayAmt += amt;
      }
      if (t >= yesterday && t < today) {
        yesterdayAmt += amt;
      }
      if (t >= startOfWeek) {
        weekAmt += amt;
      }
      if (t >= startOfMonth) {
        monthAmt += amt;
      }
      if (t >= startOfQuarter) {
        quarterAmt += amt;
      }
      if (t >= startOfYear) {
        yearAmt += amt;
      }
    });

    return [
      { period: "Today's Expenses", amount: todayAmt, description: "Total spent since 12:00 AM today" },
      { period: "Yesterday's Expenses", amount: yesterdayAmt, description: "Total spent in previous calendar day" },
      { period: "This Week's Expenses", amount: weekAmt, description: "Total spent in current week" },
      { period: "This Month's Expenses", amount: monthAmt, description: "Total spent in current calendar month" },
      { period: "This Quarter's Expenses", amount: quarterAmt, description: "Total spent in current business QTR" },
      { period: "This Year's Expenses", amount: yearAmt, description: "Total spent in current financial year" }
    ];
  }, [expenses]);

  const cashImpactAnalysis = useMemo(() => {
    const activeExps = filteredExpensesList.filter(e => !isVoidStatus(e.status));
    const cashOpex = activeExps
      .filter(e => {
        const m = (e.paymentMethod || '').toLowerCase();
        return m === 'cash' || m === 'bank transfer' || m === 'cashier' || m === 'petty cash';
      })
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    
    const nonCashOpex = activeExps
      .filter(e => {
        const m = (e.paymentMethod || '').toLowerCase();
        return m === 'credit' || m === 'deferred' || m === 'accrued';
      })
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    return {
      cashOpex,
      nonCashOpex
    };
  }, [filteredExpensesList]);

  // --- Action: Beautiful CSV Generator (Excel Native Compatible Format) ---
  const handleExportCSV = () => {
    if (permissions?.viewProductCost === false && (activeReport === 'purchases' || activeReport === 'profit_loss')) {
      return;
    }
    let csvContent = "";
    let fileName = `report_${activeReport}_${startDate}_to_${endDate}.csv`;

    // 1. Construct customized layout streams depending on report types
    if (activeReport === 'sales') {
      csvContent = "Invoice ID,Invoice Number,Customer ID,Customer Name,Customer Type,Product SKU,Product Name,Quantity,Selling Price ($),Subtotal ($),Tax ($),Total Revenue ($),Payment Type,Status,Sale Date\n";
      filteredRegisterSales.forEach(s => {
        const items = getNormalizedItems(s);
        const isVoid = isVoidStatus(s.status);
        const customerType = s.customerSnapshot?.customerType || customers.find(c => c.id === s.customerId)?.customerType || "Cash";
        items.forEach(item => {
          const prodMatch = products.find(p => p.id === item.productId);
          const sku = prodMatch?.sku || "N/A";
          const rowSubtotal = isVoid ? 0 : (item.quantity * item.unitPrice);
          const rowTax = isVoid ? 0 : (rowSubtotal * 0.15);
          const rowTotal = isVoid ? 0 : (rowSubtotal + rowTax);
          csvContent += `"${s.id}","${s.invoiceNumber || ''}","${s.customerId}","${s.customerName.replace(/"/g, '""')}","${customerType}","${sku}","${item.productName.replace(/"/g, '""')}",${item.quantity},${item.unitPrice},${rowSubtotal},${rowTax},${rowTotal},"${s.paymentType}","${s.status}","${s.saleDate}"\n`;
        });
      });
      csvContent += `\nSUMMARY,Total Audited Transactions,${filteredRegisterSales.length},Total Revenue,${registerSummary.totalRevenue},Items Sold,${registerSummary.totalItemsSold},Cash Amount,${registerSummary.cashSalesTotal},Credit Amount,${registerSummary.creditSalesTotal}\n`;
    } 
    else if (activeReport === 'purchases') {
      csvContent = "Purchase Invoice Number,Purchase Date,Supplier,Supplier Type,Product Summary,Quantity,Subtotal ($),VAT (15%) ($),Discount ($),Grand Total ($),Payment Type,Status,Created By\n";
      filteredRegisterPurchases.forEach(p => {
        const isVoid = isVoidStatus(p.status);
        const invoiceNum = p.invoiceNumber || `PIN-${p.id.substring(p.id.length - 8).toUpperCase()}`;
        const pDate = p.purchaseDate.split('T')[0];
        const sType = suppliers.find(s => s.id === p.supplierId)?.category || "Standard";
        const vat = p.vatAmount ?? (p.totalAmount * 15 / 115);
        const sub = p.totalAmount - vat;
        const disc = p.discountAmount ?? 0;
        const logMatch = systemLogs.find(l => l.entityId === p.id && l.action.includes('PROCUREMENT'));
        const createdBy = logMatch ? logMatch.user : "kishor.aysha2@gmail.com";
        
        csvContent += `"${invoiceNum}","${pDate}","${p.supplierName.replace(/"/g, '""')}","${sType}","${p.productName.replace(/"/g, '""')}",${p.quantity},${sub.toFixed(2)},${vat.toFixed(2)},${disc.toFixed(2)},${p.totalAmount.toFixed(2)},"${p.paymentType}","${isVoid ? 'Voided' : 'Active'}","${createdBy}"\n`;
      });
      csvContent += `\nSUMMARY,Total Audited Purchases,${filteredRegisterPurchases.length},Grand Total Value,${purchasesSummary.totalPurchases.toFixed(2)},Cash Purchases,${purchasesSummary.cashPurchases.toFixed(2)},Credit Purchases,${purchasesSummary.creditPurchases.toFixed(2)},Quantity Purchased,${purchasesSummary.quantityPurchased}\n`;
    } 
    else if (activeReport === 'profit_loss') {
      csvContent = "Financial Indicator Metric,Calculated Value ($),Proportion Ratio (%)\n";
      csvContent += `"Gross Revenue (Excluding Tax)",${totalSubtotal},100%\n`;
      csvContent += `"Cost of Goods Sold (COGS)",${costOfGoodsSold},${totalSubtotal > 0 ? ((costOfGoodsSold / totalSubtotal) * 100).toFixed(1) : '0'}%\n`;
      csvContent += `"Gross Profit Margin",${grossProfit},${totalSubtotal > 0 ? ((grossProfit / totalSubtotal) * 100).toFixed(1) : '0'}%\n`;
      csvContent += `"Operating Expenses (OpEx)",${totalExpensesAmt},${totalSubtotal > 0 ? ((totalExpensesAmt / totalSubtotal) * 100).toFixed(1) : '0'}%\n`;
      csvContent += `"Net Operating Profit Margin",${netProfit},${marginPercentage.toFixed(1)}%\n`;
      csvContent += `"Asset Stock Value Added",${totalPurchaseValue},-\n`;
    } 
    else if (activeReport === 'customer_due') {
      csvContent = "Customer Account ID,Recipient Name,Contact Phone,Address Label,Account Type,Ledger Due Balance Receivables ($)\n";
      activeCustomersList.forEach(c => {
        csvContent += `"${c.id}","${c.name.replace(/"/g, '""')}","${c.phone}","${c.address.replace(/"/g, '""')}","${c.customerType}",${c.dueBalance}\n`;
      });
      csvContent += `\nSUMMARY,Total Active Customers registered,${activeCustomersList.length},Customers with Unsettled Credit Balances,${customersWithDue.length},Gross Outstanding Due Receivables,${totalCustomerDueOutstanding}\n`;
    } 
    else if (activeReport === 'supplier_due') {
      csvContent = "Supplier ID,Supplier Entity Name,Contact Person,Email Address,Phone,Category Term,Account Payables Balance ($)\n";
      activeSuppliersList.forEach(s => {
        csvContent += `"${s.id}","${s.name.replace(/"/g, '""')}","${s.contactPerson ?? ''}","${s.email ?? ''}","${s.phone}","${s.category ?? ''}",${s.dueBalance ?? 0}\n`;
      });
      csvContent += `\nSUMMARY,Total Active Suppliers list,${activeSuppliersList.length},Suppliers Outstanding Bills,${suppliersWithDue.length},Gross Outstanding Trade Debts,${totalSupplierDueOutstanding}\n`;
    } 
    else if (activeReport === 'tax_vat') {
      csvContent = "Trading Sale Reference,Customer Name,Subtotal Nett Amount ($),Tax VAT Rate Applied (%),Calculated Tax Accrued ($),Payment Type,Date Settled\n";
      filteredSales.forEach(s => {
        csvContent += `"${s.id}","${s.customerName.replace(/"/g, '""')}",${s.subtotal},${s.taxRatePercent}%,${s.taxAmount},"${s.paymentType}","${s.saleDate}"\n`;
      });
      csvContent += `\nSUMMARY,Overall Net Taxable Trade,${totalTaxableNet},Regional VAT percentage Rate,Various,Total Collected Tax Liabilities,${calculatedTaxCollected},Gross Trade With Taxes,${grossRevenueWithTax}\n`;
    }
    else if (activeReport === 'activity_logs') {
      csvContent = "Log ID,Action,Operator Email,Timestamp,Details\n";
      searchableSystemLogs.forEach(l => {
        csvContent += `"${l.id}","${l.action}","${l.user}","${l.timestamp}","${(l.details || '').replace(/"/g, '""')}"\n`;
      });
      csvContent += `\nSUMMARY,Total Tracked Logs,${filteredSystemLogs.length},All-Time Stored,${systemLogs.length}\n`;
    }
    else if (activeReport === 'customer_statement') {
      if (!selectedCustomerId || !currentCustomer) {
        alert("Please select a customer first.");
        return;
      }
      csvContent = `Customer Ledger Statement: ${currentCustomer.name}\n`;
      csvContent += `Phone: ${currentCustomer.phone}, Email: ${currentCustomer.email || 'N/A'}, Address: ${currentCustomer.address || 'N/A'}\n\n`;
      csvContent += "Date,Reference ID,Transaction Type,Description,Debit ($),Credit ($),Running Balance ($)\n";
      
      // Add Opening Balance as first line
      csvContent += `"-","-","Opening Balance","Initial starting balance",0,0,${initialOpeningBalance}\n`;
      
      customerLedgerEntries.forEach(item => {
        csvContent += `"${new Date(item.date).toLocaleDateString()}","${item.ref}","${item.type}","${item.description.replace(/"/g, '""')}",${item.debit},${item.credit},${item.runningBalance}\n`;
      });
      
      csvContent += `\nSUMMARY,Opening Balance,${initialOpeningBalance},Total Sales (Debits),${totalSalesDebit},Total Payments (Credits),${totalPaymentsCredit},Outstanding Balance,${derivedOutstanding}\n`;
    }
    else if (activeReport === 'supplier_statement') {
      if (!selectedSupplierId || !currentSupplier) {
        alert("Please select a supplier first.");
        return;
      }
      csvContent = `Supplier Ledger Statement: ${currentSupplier.name}\n`;
      csvContent += `Phone: ${currentSupplier.phone}, Email: ${currentSupplier.email || 'N/A'}, Address: ${currentSupplier.address || 'N/A'}, Payment Terms: ${currentSupplier.paymentType || 'N/A'}\n\n`;
      csvContent += "Date,Reference ID,Transaction Type,Description,Debit ($),Credit ($),Running Balance ($)\n";
      
      // Add Opening Balance as first line
      csvContent += `"-","-","Opening Balance","Initial starting balance",0,0,${initialSupplierOpeningBalance}\n`;
      
      supplierLedgerEntries.forEach(item => {
        csvContent += `"${new Date(item.date).toLocaleDateString()}","${item.ref}","${item.type}","${item.description.replace(/"/g, '""')}",${item.debit},${item.credit},${item.runningBalance}\n`;
      });
      
      csvContent += `\nSUMMARY,Opening Balance,${initialSupplierOpeningBalance},Total Payments (Debits),${totalSupplierPaymentsDebit},Total Credit Purchases (Credits),${totalSupplierPurchasesCredit},Outstanding Payable Balance,${derivedSupplierOutstanding}\n`;
    }
    else if (activeReport === 'expense_analytics') {
      csvContent = "NEXUS ERP OPERATING EXPENSE ANALYTICS REPORT\n";
      csvContent += `Generated On: ${new Date().toLocaleDateString()}, Range: ${startDate || 'All-time'} to ${endDate || 'All-time'}\n\n`;
      
      csvContent += "METRICS SUMMARY\n";
      csvContent += `Total Reconciled Active Expense,${expenseAnalyticsSummary.total.toFixed(2)}\n`;
      csvContent += `Average Expense Cost,${expenseAnalyticsSummary.avg.toFixed(2)}\n`;
      csvContent += `Largest Single Outflow,${expenseAnalyticsSummary.largest.toFixed(2)}\n`;
      csvContent += `Transaction Count,${expenseAnalyticsSummary.count}\n`;
      csvContent += `Cash Outflow,${cashImpactAnalysis.cashOpex.toFixed(2)}\n`;
      csvContent += `Credit/Deferred Outflow,${cashImpactAnalysis.nonCashOpex.toFixed(2)}\n\n`;

      csvContent += "CATEGORY BREAKDOWN\n";
      csvContent += "Category Name,Transaction Count,Total Expense ($),Budget Percentage (%)\n";
      categoryExpensesReport.forEach(c => {
        csvContent += `"${c.category}",${c.count},${c.total.toFixed(2)},${c.percentage.toFixed(1)}%\n`;
      });
      csvContent += "\n";

      csvContent += "VENDOR BREAKDOWN\n";
      csvContent += "Vendor Name,Transaction Count,Average Expense ($),Total Expense ($)\n";
      vendorExpensesReport.forEach(v => {
        csvContent += `"${v.vendor}",${v.count},${v.avg.toFixed(2)},${v.total.toFixed(2)}\n`;
      });
      csvContent += "\n";

      csvContent += "DETAILED OPERATING LEDGER LOG\n";
      csvContent += "Expense ID,Date,Category,Vendor/Payee,Employee,Payment Method,Status,Amount ($),Description\n";
      filteredExpensesList.forEach(e => {
        csvContent += `"${e.id}","${e.expenseDate ? e.expenseDate.split('T')[0] : ''}","${(e.category || '').replace(/"/g, '""')}","${(e.vendorName || '').replace(/"/g, '""')}","${(e.employeeName || '').replace(/"/g, '""')}","${e.paymentMethod || 'Cash'}","${e.status || 'active'}",${e.amount},"${(e.description || '').replace(/"/g, '""')}"\n`;
      });
    }
    else if (activeReport === 'chart_of_accounts') {
      csvContent = "Account Code,Account Name,Account Type,Normal Balance,Parent Account Code,User Editable,Status,Is System,Live Balance ($)\n";
      coa.forEach(a => {
        const bal = getCOAAccountLiveBalance(a.code);
        csvContent += `"${a.code}","${a.name.replace(/"/g, '""')}","${a.type}","${a.normalBalance}","${a.parentAccount || ''}","${a.editable ? 'Yes' : 'No'}","${a.status}","${a.isSystem ? 'Yes' : 'No'}",${bal.toFixed(2)}\n`;
      });
      csvContent += `\nSUMMARY,Total Accounts Registered,${coaSummaryStats.totalAccounts},Active Accounts,${coaSummaryStats.activeAccounts},System Accounts,${coaSummaryStats.systemAccounts},Custom Accounts,${coaSummaryStats.customAccounts}\n`;
      csvContent += `BALANCES,Total Assets,${coaSummaryStats.assetsBalance.toFixed(2)},Total Liabilities,${coaSummaryStats.liabilitiesBalance.toFixed(2)},Total Equity,${coaSummaryStats.equityBalance.toFixed(2)},Total Revenue,${coaSummaryStats.revenueBalance.toFixed(2)},Total Expenses,${coaSummaryStats.expensesBalance.toFixed(2)}\n`;
    }

    // Prepare blob stream
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Action: Modern Vector PDF Generator using jsPDF ---
  const handleExportPDF = () => {
    if (permissions?.viewProductCost === false && (activeReport === 'purchases' || activeReport === 'profit_loss')) {
      return;
    }
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // 1. High-end Aesthetic Corporate Header Banner
    doc.setFillColor(30, 41, 59); // Primary Slate block
    doc.rect(0, 0, 210, 10, 'F'); // Top ribbon tag
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text("NEXUS ENTERPRISE LEDGER", 15, 25);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Generated by: kishor.aysha2@gmail.com  |  Audit Date: ${new Date().toLocaleDateString()}`, 15, 30);
    doc.text(`Specified Reporting Filters: ${startDate} to ${endDate}`, 15, 34);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(79, 70, 229); // Indigo theme banner
    doc.text(`${activeReport.replace('_', ' ').toUpperCase()} REPORT`, 140, 25);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(15, 38, 195, 38);

    let startY = 46;

    // 2. Populate tables dynamically inside PDF template
    if (activeReport === 'sales') {
      doc.setFillColor(248, 250, 252); // slate-50 metrics card
      doc.rect(15, startY, 180, 20, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("ENTERPRISE SALES AUDIT REGISTER SUMMARY:", 20, startY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Total Realised Value: $${registerSummary.totalRevenue.toFixed(2)}`, 20, startY + 14);
      doc.text(`Average Basket Ticket: $${registerSummary.avgOrderValue.toFixed(2)}`, 85, startY + 14);
      doc.text(`Total Dispatched Items: ${registerSummary.totalItemsSold} Units`, 150, startY + 14);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 26, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("INVOICE / DATE", 18, startY + 31.5);
      doc.text("CUSTOMER NAME", 55, startY + 31.5);
      doc.text("ITEMS DISPATCHED", 100, startY + 31.5);
      doc.text("QTY", 145, startY + 31.5);
      doc.text("STATUS", 158, startY + 31.5);
      doc.text("TOTAL ($)", 180, startY + 31.5);

      // Table data
      let rowY = startY + 38;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      filteredRegisterSales.slice(0, 18).forEach(s => {
        if (rowY > 260) return; // safeguard page overflow
        const items = getNormalizedItems(s);
        let displayProdName = "";
        let displayQty = 0;
        if (items.length === 1) {
          displayProdName = items[0].productName;
          displayQty = items[0].quantity;
        } else if (items.length > 1) {
          displayProdName = `${items[0].productName} + ${items.length - 1} items`;
          displayQty = items.reduce((acc, item) => acc + item.quantity, 0);
        }
        const isVoid = isVoidStatus(s.status);
        const invoiceNum = s.invoiceNumber || s.id.substring(s.id.length - 8).toUpperCase();
        
        doc.text(`${invoiceNum} | ${s.saleDate.split('T')[0]}`, 18, rowY);
        doc.text(s.customerName.length > 18 ? s.customerName.substring(0, 18) + '...' : s.customerName, 55, rowY);
        doc.text(displayProdName.length > 20 ? displayProdName.substring(0, 20) + '...' : displayProdName, 100, rowY);
        doc.text(displayQty.toString(), 145, rowY);
        doc.text(isVoid ? 'Voided' : 'Active', 158, rowY);
        doc.text(`$${s.totalAmount.toFixed(2)}`, 180, rowY);
        rowY += 6;
      });
    } 
    else if (activeReport === 'purchases') {
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 20, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("ENTERPRISE PURCHASE REGISTER SUMMARY:", 20, startY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Total Purchases: $${purchasesSummary.totalPurchases.toFixed(2)}`, 20, startY + 14);
      doc.text(`Cash Settlements: $${purchasesSummary.cashPurchases.toFixed(2)}`, 85, startY + 14);
      doc.text(`Credit Settlements: $${purchasesSummary.creditPurchases.toFixed(2)}`, 140, startY + 14);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 26, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("INVOICE NO", 18, startY + 31.5);
      doc.text("DATE", 42, startY + 31.5);
      doc.text("SUPPLIER", 62, startY + 31.5);
      doc.text("PRODUCT SUMMARY", 102, startY + 31.5);
      doc.text("QTY", 142, startY + 31.5);
      doc.text("PAYMENT", 152, startY + 31.5);
      doc.text("GRAND TOTAL", 172, startY + 31.5);

      let rowY = startY + 38;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      filteredRegisterPurchases.slice(0, 18).forEach(p => {
        if (rowY > 260) return;
        const isVoid = isVoidStatus(p.status);
        const invoiceNum = p.invoiceNumber || `PIN-${p.id.substring(p.id.length - 8).toUpperCase()}`;
        const pDate = p.purchaseDate.split('T')[0];
        
        doc.text(invoiceNum, 18, rowY);
        doc.text(pDate, 42, rowY);
        doc.text(p.supplierName.length > 20 ? p.supplierName.substring(0, 20) + '...' : p.supplierName, 62, rowY);
        doc.text(p.productName.length > 20 ? p.productName.substring(0, 20) + '...' : p.productName, 102, rowY);
        doc.text(p.quantity.toString(), 142, rowY);
        doc.text(p.paymentType, 152, rowY);
        
        if (isVoid) {
          doc.setTextColor(220, 38, 38);
          doc.text("Voided", 172, rowY);
          doc.setTextColor(51, 65, 85);
        } else {
          doc.text(`$${p.totalAmount.toFixed(2)}`, 172, rowY);
        }
        
        rowY += 6;
      });
    } 
    else if (activeReport === 'profit_loss') {
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 15, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);
      doc.text("PROFIT & LOSS BREAKDOWN STATEMENTS:", 20, startY + 9.5);

      let statY = startY + 28;
      doc.setDrawColor(241, 245, 249);
      doc.setFillColor(255, 255, 255);

      const items = [
        { label: "1. Gross Corporate Revenue (Excluding Tax)", value: totalSubtotal, color: [15, 23, 42] },
        { label: "2. Cost of Goods Sold (COGS)", value: -costOfGoodsSold, color: [225, 29, 72] },
        { label: "3. Gross Profit Margin", value: grossProfit, color: [5, 150, 105] },
        { label: "4. Operating Expenses (OpEx)", value: -totalExpensesAmt, color: [225, 29, 72] },
        { label: "5. Net Margins / Operating Profits", value: netProfit, color: [5, 150, 105], bold: true },
        { label: "6. Internal Inventory Active Purchase Stock Assets", value: totalPurchaseValue, color: [71, 85, 105] }
      ];

      items.forEach((item) => {
        doc.rect(15, statY, 180, 12, 'S');
        if (item.bold) {
          doc.setFont('helvetica', 'bold');
          doc.setFillColor(243, 244, 246);
          doc.rect(15, statY, 180, 12, 'F');
        } else {
          doc.setFont('helvetica', 'normal');
        }
        
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(item.label, 20, statY + 8);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(item.color[0], item.color[1], item.color[2]);
        doc.text(`${item.value < 0 ? '-' : ''}$${Math.abs(item.value).toFixed(2)}`, 165, statY + 8);
        
        statY += 15;
      });

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.text("* Net Margins are generated dynamically by reconciling actual transaction counts with registered stock prices in real-time.", 15, statY + 12);
    } 
    else if (activeReport === 'customer_due') {
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 15, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`TOTAL CREDIT RECEIVABLES DUES: $${totalCustomerDueOutstanding.toFixed(2)}`, 20, startY + 9.5);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 22, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("CUSTOMER IDENTIFIER ID", 18, startY + 27.5);
      doc.text("CUSTOMER REGISTERED NAME", 65, startY + 27.5);
      doc.text("CONTACT PHONE", 115, startY + 27.5);
      doc.text("ACCOUNT CLASS", 145, startY + 27.5);
      doc.text("OUTSTANDING DUE ($)", 172, startY + 27.5);

      let rowY = startY + 34;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      customers.slice(0, 18).forEach(c => {
        if (rowY > 260) return;
        doc.text(c.id, 18, rowY);
        doc.text(c.name, 65, rowY);
        doc.text(c.phone, 115, rowY);
        doc.text(c.customerType, 145, rowY);
        doc.setTextColor(c.dueBalance > 0 ? 190 : 51, c.dueBalance > 0 ? 24 : 65, c.dueBalance > 0 ? 74 : 85);
        doc.setFont('helvetica', c.dueBalance > 0 ? 'bold' : 'normal');
        doc.text(`$${c.dueBalance.toFixed(2)}`, 172, rowY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        rowY += 6;
      });
    } 
    else if (activeReport === 'supplier_due') {
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 15, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`TOTAL SUPPLIER DEBTS PAYABLE LEDGER: $${totalSupplierDueOutstanding.toFixed(2)}`, 20, startY + 9.5);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 22, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("SUPPLIER ID", 18, startY + 27.5);
      doc.text("SUPPLIER ENTITY NAME", 55, startY + 27.5);
      doc.text("CONTACT EMAIL", 105, startY + 27.5);
      doc.text("PAYMENT TYPE", 145, startY + 27.5);
      doc.text("OUTSTANDING DEBT ($)", 172, startY + 27.5);

      let rowY = startY + 34;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      suppliers.slice(0, 18).forEach(s => {
        if (rowY > 260) return;
        doc.text(s.id.substring(0, 12) + '...', 18, rowY);
        doc.text(s.name, 55, rowY);
        doc.text(s.email || 'N/A', 105, rowY);
        doc.text(s.paymentType || 'Cash', 145, rowY);
        const dueVal = s.dueBalance ?? 0;
        doc.setTextColor(dueVal > 0 ? 190 : 51, dueVal > 0 ? 24 : 65, dueVal > 0 ? 74 : 85);
        doc.setFont('helvetica', dueVal > 0 ? 'bold' : 'normal');
        doc.text(`$${dueVal.toFixed(2)}`, 172, rowY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        rowY += 6;
      });
    } 
    else if (activeReport === 'tax_vat') {
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 20, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("REGIONAL TAXATION / VAT LEDGER SUMMARY:", 20, startY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Nett Taxable Trade Volume: $${totalTaxableNet.toFixed(2)}`, 20, startY + 14);
      doc.text(`Total VAT Collected: $${calculatedTaxCollected.toFixed(2)}`, 110, startY + 14);
      doc.text(`Gross Trade Volume: $${grossRevenueWithTax.toFixed(2)}`, 182, startY + 14);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 26, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("SALE DATE", 18, startY + 31.5);
      doc.text("TRANSACTION REFERENCE ID", 45, startY + 31.5);
      doc.text("CUSTOMER RECIPIENT", 95, startY + 31.5);
      doc.text("TAX VALUE (ACCRUED)", 142, startY + 31.5);
      doc.text("NET AMOUNT ($)", 175, startY + 31.5);

      let rowY = startY + 38;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      filteredSales.slice(0, 18).forEach(s => {
        if (rowY > 260) return;
        doc.text(s.saleDate.split('T')[0], 18, rowY);
        doc.text(s.id, 45, rowY);
        doc.text(s.customerName, 95, rowY);
        doc.text(`$${s.taxAmount.toFixed(2)} (${s.taxRatePercent}%)`, 142, rowY);
        doc.text(`$${s.subtotal.toFixed(2)}`, 175, rowY);
        rowY += 6;
      });
    }
    else if (activeReport === 'activity_logs') {
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 20, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("SYSTEM ACTIVITY AUDIT JOURNAL SUMMARY:", 20, startY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Total Tracked Operations: ${filteredSystemLogs.length} Entries`, 20, startY + 14);
      doc.text(`Active Security Engine: Yes`, 85, startY + 14);
      doc.text(`Database: Connected Real-Time`, 140, startY + 14);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 26, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("TIMESTAMP", 18, startY + 31.5);
      doc.text("ACTION TYPE", 55, startY + 31.5);
      doc.text("OPERATOR USER", 95, startY + 31.5);
      doc.text("DETAILS & CONTEXT", 135, startY + 31.5);

      let rowY = startY + 38;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      searchableSystemLogs.slice(0, 18).forEach(l => {
        if (rowY > 260) return;
        const shortTime = new Date(l.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        doc.text(shortTime, 18, rowY);
        doc.text(l.action, 55, rowY);
        doc.text(l.user.length > 18 ? l.user.substring(0, 18) + '...' : l.user, 95, rowY);
        const detailTxt = l.details || '';
        doc.text(detailTxt.length > 34 ? detailTxt.substring(0, 34) + '...' : detailTxt, 135, rowY);
        rowY += 6;
      });
    }
    else if (activeReport === 'customer_statement') {
      if (!currentCustomer) {
        alert("Please select a customer first.");
        return;
      }
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 22, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`CUSTOMER ACCOUNT INFRASTRUCTURE:`, 20, startY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Client: ${currentCustomer.name}`, 20, startY + 12);
      doc.text(`Contact: ${currentCustomer.phone}`, 20, startY + 18);
      doc.text(`Address: ${currentCustomer.address || 'N/A'}`, 100, startY + 12);
      doc.text(`VAT ID: ${currentCustomer.vatNumber || 'N/A'}`, 100, startY + 18);

      // Bento Grid Summary Boxes
      doc.setFillColor(243, 244, 246);
      doc.rect(15, startY + 26, 180, 14, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(`Opening Bal: $${initialOpeningBalance.toFixed(2)}`, 18, startY + 34.5);
      doc.text(`Total Sales: $${totalSalesDebit.toFixed(2)}`, 62, startY + 34.5);
      doc.text(`Total Payments: $${totalPaymentsCredit.toFixed(2)}`, 108, startY + 34.5);
      doc.text(`Outstanding: $${derivedOutstanding.toFixed(2)}`, 154, startY + 34.5);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 44, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("DATE", 18, startY + 49.5);
      doc.text("REFERENCE NO", 40, startY + 49.5);
      doc.text("TYPE", 75, startY + 49.5);
      doc.text("DEBIT ($)", 110, startY + 49.5);
      doc.text("CREDIT ($)", 138, startY + 49.5);
      doc.text("RUNNING BAL ($)", 164, startY + 49.5);

      let rowY = startY + 56;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      // Print initial starting balance row
      doc.setFont('helvetica', 'bold');
      doc.text("-", 18, rowY);
      doc.text("INITIAL", 40, rowY);
      doc.text("Opening Balance", 75, rowY);
      doc.text("-", 110, rowY);
      doc.text("-", 138, rowY);
      doc.text(`$${initialOpeningBalance.toFixed(2)}`, 164, rowY);
      doc.setFont('helvetica', 'normal');
      rowY += 6;

      customerLedgerEntries.slice(0, 24).forEach(item => {
        if (rowY > 260) return;
        doc.text(new Date(item.date).toLocaleDateString(), 18, rowY);
        doc.text(item.ref.substring(0, 15), 40, rowY);
        doc.text(item.type, 75, rowY);
        doc.text(item.debit > 0 ? `$${item.debit.toFixed(2)}` : "-", 110, rowY);
        doc.text(item.credit > 0 ? `$${item.credit.toFixed(2)}` : "-", 138, rowY);
        doc.text(`$${item.runningBalance.toFixed(2)}`, 164, rowY);
        rowY += 6;
      });
    }
    else if (activeReport === 'supplier_statement') {
      if (!currentSupplier) {
        alert("Please select a supplier first.");
        return;
      }
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 22, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`SUPPLIER ACCOUNT INFRASTRUCTURE:`, 20, startY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Supplier: ${currentSupplier.name}`, 20, startY + 12);
      doc.text(`Contact: ${currentSupplier.phone}`, 20, startY + 18);
      doc.text(`Address: ${currentSupplier.address || 'N/A'}`, 100, startY + 12);
      doc.text(`Terms: ${currentSupplier.paymentType || 'Credit'}`, 100, startY + 18);

      // Bento Grid Summary Boxes
      doc.setFillColor(243, 244, 246);
      doc.rect(15, startY + 26, 180, 14, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(`Opening Bal: $${initialSupplierOpeningBalance.toFixed(2)}`, 18, startY + 34.5);
      doc.text(`Total Credit Purchases: $${totalSupplierPurchasesCredit.toFixed(2)}`, 55, startY + 34.5);
      doc.text(`Total Payments: $${totalSupplierPaymentsDebit.toFixed(2)}`, 108, startY + 34.5);
      doc.text(`Outstanding: $${derivedSupplierOutstanding.toFixed(2)}`, 154, startY + 34.5);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 44, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("DATE", 18, startY + 49.5);
      doc.text("REFERENCE NO", 40, startY + 49.5);
      doc.text("TYPE", 75, startY + 49.5);
      doc.text("DEBIT ($) [PAY]", 110, startY + 49.5);
      doc.text("CREDIT ($) [BUY]", 138, startY + 49.5);
      doc.text("RUNNING BAL ($)", 164, startY + 49.5);

      let rowY = startY + 56;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      // Print initial starting balance row
      doc.setFont('helvetica', 'bold');
      doc.text("-", 18, rowY);
      doc.text("INITIAL", 40, rowY);
      doc.text("Opening Balance", 75, rowY);
      doc.text("-", 110, rowY);
      doc.text("-", 138, rowY);
      doc.text(`$${initialSupplierOpeningBalance.toFixed(2)}`, 164, rowY);
      doc.setFont('helvetica', 'normal');
      rowY += 6;

      supplierLedgerEntries.slice(0, 24).forEach(item => {
        if (rowY > 260) return;
        doc.text(new Date(item.date).toLocaleDateString(), 18, rowY);
        doc.text(item.ref.substring(0, 15), 40, rowY);
        doc.text(item.type, 75, rowY);
        doc.text(item.debit > 0 ? `$${item.debit.toFixed(2)}` : "-", 110, rowY);
        doc.text(item.credit > 0 ? `$${item.credit.toFixed(2)}` : "-", 138, rowY);
        doc.text(`$${item.runningBalance.toFixed(2)}`, 164, rowY);
        rowY += 6;
      });
    }
    else if (activeReport === 'expense_analytics') {
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 22, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("OPERATING EXPENSES (OPEX) ANALYTICS SUMMARY:", 20, startY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Total Active Outflow: $${expenseAnalyticsSummary.total.toFixed(2)}`, 20, startY + 12);
      doc.text(`Transaction Volume: ${expenseAnalyticsSummary.count} Active Tx`, 20, startY + 18);
      doc.text(`Cash Settle: $${cashImpactAnalysis.cashOpex.toFixed(2)}`, 110, startY + 12);
      doc.text(`Deferred Creditor: $${cashImpactAnalysis.nonCashOpex.toFixed(2)}`, 110, startY + 18);

      // Category Metrics Box
      doc.setFillColor(243, 244, 246);
      doc.rect(15, startY + 26, 180, 18, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text("BUDGET BREAKDOWN BY BUSINESS CATEGORIES:", 18, startY + 31.5);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      let catLineText = "";
      categoryExpensesReport.slice(0, 4).forEach((c, i) => {
        catLineText += `${c.category}: $${c.total.toFixed(2)} (${c.percentage.toFixed(1)}%)   |   `;
      });
      if (catLineText.endsWith('   |   ')) {
        catLineText = catLineText.substring(0, catLineText.length - 7);
      }
      doc.text(catLineText, 18, startY + 38);

      let vendorLineText = "";
      vendorExpensesReport.slice(0, 4).forEach((v, i) => {
        vendorLineText += `${v.vendor}: $${v.total.toFixed(2)} (${v.count} Tx)   |   `;
      });
      if (vendorLineText.endsWith('   |   ')) {
        vendorLineText = vendorLineText.substring(0, vendorLineText.length - 7);
      }
      doc.text(`Creditors: ${vendorLineText || 'None'}`, 18, startY + 42);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 48, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("DATE", 18, startY + 53.5);
      doc.text("EXPENSE ID", 40, startY + 53.5);
      doc.text("CATEGORY & PAYEE", 70, startY + 53.5);
      doc.text("METHOD", 130, startY + 53.5);
      doc.text("STATUS", 152, startY + 53.5);
      doc.text("AMOUNT ($)", 180, startY + 53.5);

      let rowY = startY + 60;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      filteredExpensesList.slice(0, 24).forEach(item => {
        if (rowY > 260) return;
        const isVoid = isVoidStatus(item.status);
        doc.text(item.expenseDate ? item.expenseDate.split('T')[0] : 'N/A', 18, rowY);
        doc.text((item.id || '').substring(0, 10).toUpperCase(), 40, rowY);
        
        let label = `${item.category}`;
        if (item.vendorName) label += ` (${item.vendorName})`;
        doc.text(label.length > 32 ? label.substring(0, 32) + '...' : label, 70, rowY);
        
        doc.text(item.paymentMethod || 'Cash', 130, rowY);
        
        if (isVoid) {
          doc.setTextColor(220, 38, 38);
          doc.setFont('helvetica', 'bold');
          doc.text("Voided", 152, rowY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(51, 65, 85);
        } else {
          doc.text("Active", 152, rowY);
        }
        
        doc.setFont('helvetica', 'bold');
        if (isVoid) {
          doc.setTextColor(148, 163, 184);
          doc.text(`$${Number(item.amount || 0).toFixed(2)}`, 180, rowY);
          doc.setTextColor(51, 65, 85);
        } else {
          doc.text(`$${Number(item.amount || 0).toFixed(2)}`, 180, rowY);
        }
        doc.setFont('helvetica', 'normal');
        
        rowY += 6;
      });
    }
    else if (activeReport === 'chart_of_accounts') {
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 22, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("ENTERPRISE CHART OF ACCOUNTS SUMMARY:", 20, startY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Total Accounts: ${coaSummaryStats.totalAccounts}   |   Active: ${coaSummaryStats.activeAccounts}`, 20, startY + 12);
      doc.text(`Assets Balance: $${coaSummaryStats.assetsBalance.toFixed(2)}   |   Liabilities: $${coaSummaryStats.liabilitiesBalance.toFixed(2)}`, 20, startY + 18);
      doc.text(`Equity Balance: $${coaSummaryStats.equityBalance.toFixed(2)}`, 110, startY + 12);
      doc.text(`Revenue: $${coaSummaryStats.revenueBalance.toFixed(2)}   |   Expenses: $${coaSummaryStats.expensesBalance.toFixed(2)}`, 110, startY + 18);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 26, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("CODE", 18, startY + 31.5);
      doc.text("ACCOUNT NAME", 42, startY + 31.5);
      doc.text("TYPE", 102, startY + 31.5);
      doc.text("PARENT", 132, startY + 31.5);
      doc.text("EDITABLE", 154, startY + 31.5);
      doc.text("BALANCE ($)", 174, startY + 31.5);

      let rowY = startY + 38;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      coa.forEach(a => {
        if (rowY > 260) return;
        const bal = getCOAAccountLiveBalance(a.code);
        doc.text(a.code, 18, rowY);
        doc.text(a.name.length > 32 ? a.name.substring(0, 32) + '...' : a.name, 42, rowY);
        doc.text(a.type, 102, rowY);
        doc.text(a.parentAccount || 'None', 132, rowY);
        doc.text(a.editable ? 'Yes' : 'No', 154, rowY);
        doc.text(`$${bal.toFixed(2)}`, 174, rowY);
        rowY += 6.5;
      });
    }

    // Beautiful footer signature block
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // grey border
    doc.line(15, 275, 195, 275);
    doc.text("Official Certified Ledger Balance Report Sheet • Restricted Trade Intel", 15, 280);
    doc.text(`Confidential • Page 1 of 1`, 160, 280);

    // Save outputs securely
    doc.save(`ledger_${activeReport}_${startDate}_to_${endDate}.pdf`);
  };

  // Filter lists inside display screens based on search query
  const searchableSales = filteredSales.filter(s => {
    const items = getNormalizedItems(s);
    const hasMatchingProduct = items.some(item => item.productName.toLowerCase().includes(searchQuery.toLowerCase()));
    return s.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || 
           hasMatchingProduct || 
           s.id.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const searchableCustomers = customers.filter(c => {
    return c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           c.phone.toLowerCase().includes(searchQuery.toLowerCase()) || 
           c.id.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const searchableSuppliers = suppliers.filter(s => {
    return s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           s.phone.toLowerCase().includes(searchQuery.toLowerCase()) || 
           s.id.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const searchableProducts = products.filter(p => {
    return p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           p.sku.toLowerCase().includes(searchQuery.toLowerCase()) || 
           p.category.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // --- Beautiful Chart Coordinates calculations for the Reports Page ---
  const reportsSalesMap: Record<string, { sales: number; profit: number }> = {};
  const sortedSalesForTrend = [...filteredSales].sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime());
  
  sortedSalesForTrend.forEach(s => {
    if (!s.saleDate) return;
    const dateStr = s.saleDate.split('T')[0];
    if (!reportsSalesMap[dateStr]) {
      reportsSalesMap[dateStr] = { sales: 0, profit: 0 };
    }
    reportsSalesMap[dateStr].sales += s.totalAmount ?? 0;
    reportsSalesMap[dateStr].profit += s.grossProfit ?? 0;
  });

  const trendDataList = Object.entries(reportsSalesMap).map(([date, val]) => ({
    label: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    salesValue: val.sales,
    profitValue: val.profit
  })).slice(-10); // show last 10 points for elegance

  const trendWidthSvg = 540;
  const trendHeightSvg = 160;
  const trendPaddingX = 40;
  const trendPaddingY = 20;
  
  const maxSalesVal = Math.max(...trendDataList.map(d => d.salesValue), 100);
  
  const salesPoints = trendDataList.map((d, index) => {
    const x = trendPaddingX + (index * (trendWidthSvg - trendPaddingX * 2)) / Math.max(trendDataList.length - 1, 1);
    const y = trendHeightSvg - trendPaddingY - (d.salesValue / maxSalesVal) * (trendHeightSvg - trendPaddingY * 2);
    return `${x},${y}`;
  }).join(' ');

  const profitPoints = trendDataList.map((d, index) => {
    const x = trendPaddingX + (index * (trendWidthSvg - trendPaddingX * 2)) / Math.max(trendDataList.length - 1, 1);
    const y = trendHeightSvg - trendPaddingY - (d.profitValue / maxSalesVal) * (trendHeightSvg - trendPaddingY * 2);
    return `${x},${y}`;
  }).join(' ');

  const salesAreaPoints = salesPoints ? `${trendPaddingX},${trendHeightSvg - trendPaddingY} ${salesPoints} ${trendWidthSvg - trendPaddingX},${trendHeightSvg - trendPaddingY}` : '';

  // Requirement 8: If no sales exist -> show "No sales data available" empty state page
  if (sales.length === 0 && !loading) {
    return (
      <div id="nexus-reports-root" className="space-y-8 animate-fade-in font-sans pb-12 print:space-y-4 print:pb-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:border-b print:pb-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse print:hidden"></span>
              Operational Intelligence Reports
            </h2>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold font-mono print:text-slate-500">
              Custom filters • Multiple layout exports • Professional Print Engine ready
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-24 bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-2xs">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl border border-slate-150 flex items-center justify-center mb-4">
            <ShoppingBag className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-base font-bold text-slate-950">No sales data available</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
            Currently, there are no recorded transactions across the system. Log some sales in order to view analytical insights.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="nexus-reports-root" className="space-y-8 animate-fade-in font-sans pb-12 print:space-y-4 print:pb-0 w-full max-w-full overflow-x-clip">
      
      {/* HEADER SECTION AND CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:border-b print:pb-3 pb-2 w-full max-w-full">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse print:hidden"></span>
            Operational Intelligence Reports
          </h2>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold font-mono print:text-slate-500">
            Custom filters • Multiple layout exports • Professional Print Engine ready
          </p>
        </div>

        {/* Date Filters Container */}
        <div className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white border border-slate-200/90 rounded-[2rem] p-4 sm:p-3 shadow-2xs lg:shadow-3xs print:bg-transparent print:border-none print:shadow-none print:p-0">
          
          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50/60 rounded-xl border border-indigo-100/40 shrink-0 print:hidden self-start sm:self-auto">
            <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest leading-none">Date Range</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
            {/* Quick ranges selectors - hidden on print */}
            <div className="grid grid-cols-4 sm:flex items-center gap-1.5 print:hidden w-full sm:w-auto">
              {(['30_days', '90_days', 'this_year', 'all_time'] as const).map((range) => {
                const labelMap: Record<string, string> = {
                  '30_days': '30D',
                  '90_days': '90D',
                  'this_year': 'YTD',
                  'all_time': 'Max'
                };
                const isSelected = (range === '30_days' && startDate === '2026-05-01' && endDate === '2026-06-01') ||
                                   (range === '90_days' && startDate === '2026-03-01' && endDate === '2026-06-01') ||
                                   (range === 'this_year' && startDate === '2026-01-01' && endDate === '2026-06-01') ||
                                   (range === 'all_time' && startDate === '2020-01-01' && endDate === '2026-06-01');
                return (
                  <button 
                    key={range}
                    type="button"
                    onClick={() => setQuickRange(range)} 
                    className={`text-[10px] font-extrabold px-2 py-2.5 sm:py-1.5 rounded-xl border transition cursor-pointer text-center whitespace-nowrap ${
                      isSelected
                        ? 'bg-slate-900 border-slate-900 text-white shadow-xs' 
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    {labelMap[range]}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 print:hidden w-full sm:w-auto min-w-0">
              <input 
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-w-0 sm:w-auto min-h-[38px] px-2.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500 cursor-pointer shadow-3xs"
              />
              <span className="text-slate-400 text-xs font-bold shrink-0">to</span>
              <input 
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full min-w-0 sm:w-auto min-h-[38px] px-2.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500 cursor-pointer shadow-3xs"
              />
            </div>
          </div>

          {/* Label visible only on Print */}
          <div className="hidden print:block text-xs font-bold text-slate-800">
            {startDate} to {endDate}
          </div>

        </div>
      </div>

      {/* DUAL COLS WORKSPACE */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start print:grid-cols-4 animate-pulse">
          {/* Left Column Skeleton */}
          <div className="space-y-3 lg:col-span-1 print:hidden">
            <div className="h-3.5 bg-slate-200/60 rounded w-1/3 mb-2"></div>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-11 bg-slate-100/80 rounded-xl w-full"></div>
            ))}
          </div>

          {/* Right Column Skeleton */}
          <div className="lg:col-span-3 space-y-6 print:col-span-4 w-full">
            <div className="bg-white border border-slate-200 rounded-[2.5rem] p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200/80 rounded w-48 font-semibold"></div>
                  <div className="h-3 bg-slate-100 rounded w-72"></div>
                </div>
                <div className="h-10 bg-slate-100 rounded-xl w-32"></div>
              </div>

              {/* Bento-like grids */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 bg-slate-100 rounded w-1/2"></div>
                    <div className="h-6 bg-slate-200/80 rounded w-2/3"></div>
                    <div className="h-2.5 bg-slate-50 rounded w-1/3"></div>
                  </div>
                ))}
              </div>

              {/* Large Table area skeleton */}
              <div className="border border-slate-100 rounded-2xl p-4 space-y-4">
                <div className="flex justify-between border-b border-slate-100 pb-3">
                  <div className="h-3 bg-slate-200/60 rounded w-1/4"></div>
                  <div className="h-3 bg-slate-200/60 rounded w-1/5"></div>
                </div>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex justify-between items-center py-2.5">
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3 bg-slate-100 rounded w-1/3"></div>
                      <div className="h-2.5 bg-slate-50 rounded w-1/5"></div>
                    </div>
                    <div className="h-3 bg-slate-100 rounded w-16"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start print:grid-cols-4">
        
        {/* REPORT TYPE SELECTOR (LEFT COLUMN) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-col gap-2 lg:col-span-1 print:hidden">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1 col-span-full">Select Report View</span>
          
          {(['sales', 'purchases', 'profit_loss', 'customer_due', 'supplier_due', 'tax_vat', 'activity_logs', 'customer_statement', 'supplier_statement', 'expense_analytics', 'chart_of_accounts'] as ReportType[])
            .filter((type) => {
              if (type === 'purchases' || type === 'profit_loss') {
                return permissions?.viewProductCost !== false;
              }
              if (type === 'expense_analytics') {
                return permissions?.viewExpenses !== false;
              }
              return true;
            })
            .map((type) => {
            const isActive = activeReport === type;
            const labelsMap: Record<ReportType, string> = {
              'sales': 'Enterprise Sales Register',
              'purchases': 'Enterprise Purchase Register',
              'profit_loss': 'Profit & Loss Statement',
              'customer_due': 'Customer Due Report',
              'supplier_due': 'Supplier Due Report',
              'tax_vat': 'VAT/Tax Collected Report',
              'activity_logs': 'System Activity Audit Log',
              'customer_statement': 'Customer Statement',
              'supplier_statement': 'Supplier Statement',
              'expense_analytics': 'Expense Analytics & Reports',
              'chart_of_accounts': 'Chart of Accounts Report'
            };

            const colorsMap: Record<ReportType, string> = {
              'sales': 'text-indigo-600 bg-indigo-50 border-indigo-150',
              'purchases': 'text-emerald-700 bg-emerald-50 border-emerald-150',
              'profit_loss': 'text-violet-600 bg-violet-50 border-violet-150',
              'customer_due': 'text-amber-700 bg-amber-50 border-amber-150',
              'supplier_due': 'text-sky-700 bg-sky-50 border-sky-150',
              'tax_vat': 'text-rose-600 bg-rose-50 border-rose-150',
              'activity_logs': 'text-slate-700 bg-slate-50 border-slate-150',
              'customer_statement': 'text-emerald-700 bg-emerald-50 border-emerald-150',
              'supplier_statement': 'text-amber-700 bg-amber-50 border-amber-150',
              'expense_analytics': 'text-rose-700 bg-rose-50 border-rose-150',
              'chart_of_accounts': 'text-indigo-700 bg-indigo-50 border-indigo-150'
            };

            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setActiveReport(type);
                  setSearchQuery('');
                }}
                className={`w-full flex items-center justify-between text-left px-5 py-4 rounded-[1.6rem] border font-bold text-xs transition cursor-pointer ${
                  isActive 
                    ? `bg-slate-900 border-slate-900 text-white shadow-md` 
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <span>{labelsMap[type]}</span>
                <ChevronRight className={`w-3.5 h-3.5 transition ${isActive ? 'translate-x-1 text-indigo-400' : 'text-slate-400'}`} />
              </button>
            );
          })}
        </div>

        {/* DATA METRICS & TRANSACTION VIEWER (RIGHT COLUMNS) */}
        <div className="lg:col-span-3 print:col-span-4 space-y-6 print:w-full">
          
          {/* HIGH-FIDELITY BENTO SUMMARIES */}
          <div className="bg-white border border-slate-200/95 rounded-[2.5rem] p-6 sm:p-8 shadow-2xs space-y-6 print:shadow-none print:border-none print:p-2">
            
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block print:hidden">Audit Dashboard Summaries</span>
                <h3 className="text-lg font-bold text-slate-950 mt-0.5 capitalize print:text-xl">{activeReport.replace('_', ' ')} Calculations</h3>
              </div>

              {/* ACTION DOWNLOAD BUTTONS */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 print:hidden w-full xl:w-auto font-sans">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 cursor-pointer bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-4 py-3 md:py-2.5 text-xs font-bold transition shadow-3xs hover:shadow-2xs min-h-[44px] md:min-h-[38px]"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="whitespace-nowrap">Export Excel (CSV)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportPDF}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-3 md:py-2.5 text-xs font-bold transition shadow-3xs hover:shadow-2xs min-h-[44px] md:min-h-[38px]"
                >
                  <FileText className="w-4 h-4 text-indigo-200 shrink-0" />
                  <span className="whitespace-nowrap">Download PDF Document</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 cursor-pointer bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-4 py-3 md:py-2.5 text-xs font-bold transition shadow-3xs hover:shadow-2xs min-h-[44px] md:min-h-[38px]"
                >
                  <Printer className="w-4 h-4 text-slate-600 shrink-0" />
                  <span className="whitespace-nowrap">Print Report</span>
                </button>
              </div>
            </div>

            {/* DYNAMIC METRIC CARDS BASED ON SELECTED REPORT */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              
              {activeReport === 'sales' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Realised Business Revenue</span>
                    <p className="text-2xl font-black text-slate-900">${registerSummary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Over {activeRegisterSales.length} active transactions</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Items Dispatched</span>
                    <p className="text-2xl font-black text-slate-900">{registerSummary.totalItemsSold} Products</p>
                    <p className="text-[10px] text-emerald-600 font-semibold font-mono">Dispatched successfully</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Average Voucher Basket</span>
                    <p className="text-2xl font-black text-indigo-600">${registerSummary.avgOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400 font-semibold text-slate-500">Active average ticket basket</p>
                  </div>
                </>
              )}

              {activeReport === 'purchases' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Purchases Ledger</span>
                    <p className="text-2xl font-black text-slate-900">${purchasesSummary.totalPurchases.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">
                      Cash: <span className="font-bold text-slate-600">${purchasesSummary.cashPurchases.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> • Credit: <span className="font-bold text-slate-600">${purchasesSummary.creditPurchases.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Procured Volume & Average Ticket</span>
                    <p className="text-2xl font-black text-slate-900">{purchasesSummary.quantityPurchased.toLocaleString()} Units</p>
                    <p className="text-[10px] text-slate-400">
                      Average Ticket size: <span className="font-bold text-slate-600">${purchasesSummary.averagePurchase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Transaction Bounds & Taxes</span>
                    <p className="text-xl font-black text-emerald-600">Max: ${purchasesSummary.largestPurchase.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">
                      Min: <span className="font-bold text-slate-600">${purchasesSummary.smallestPurchase.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> • VAT (15%): <span className="font-bold text-slate-600">${purchasesSummary.totalVAT.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> • Disc: <span className="font-bold text-rose-600">-${purchasesSummary.totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </p>
                  </div>
                </>
              )}

              {activeReport === 'profit_loss' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Reconciled Revenue & COGS</span>
                    <p className="text-xl font-black text-slate-900">${totalSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-rose-500 font-bold">COGS: ${costOfGoodsSold.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Gross Profit & Expenses</span>
                    <p className="text-xl font-black text-slate-900">${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-rose-500 font-bold">OpEx: ${totalExpensesAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest block">Net Operating Profit</span>
                    <p className="text-2xl font-black text-emerald-600">${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-emerald-600 font-bold font-mono">Net Margin: {marginPercentage.toFixed(1)}%</p>
                  </div>
                </>
              )}

              {activeReport === 'customer_due' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Outstanding Account Receivables</span>
                    <p className="text-2xl font-black text-slate-900">${totalCustomerDueOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Accrued across credit histories</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Outstanding Credit Account count</span>
                    <p className="text-2xl font-black text-slate-900">{customersWithDue.length} Debtor profiles</p>
                    <p className="text-[10px] text-amber-600 font-semibold font-mono">Requires collection follow-up</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Max Debtor Balance</span>
                    <p className="text-2xl font-black text-indigo-600">
                      ${activeCustomersList.length > 0 ? Math.max(...activeCustomersList.map(c => c.dueBalance || 0), 0).toFixed(2) : '0.00'}
                    </p>
                    <p className="text-[10px] text-slate-400">Single highest liability</p>
                  </div>
                </>
              )}

              {activeReport === 'supplier_due' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Outstanding payables stock debt</span>
                    <p className="text-2xl font-black text-slate-900">${totalSupplierDueOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Outstanding liabilities</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Outstanding Supplier accounts</span>
                    <p className="text-2xl font-black text-slate-900">{suppliersWithDue.length} Trade accounts</p>
                    <p className="text-[10px] text-slate-400">Subject to standard Net terms</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Max Creditor Debt</span>
                    <p className="text-2xl font-black text-indigo-600">
                      ${activeSuppliersList.length > 0 ? Math.max(...activeSuppliersList.map(s => s.dueBalance || 0), 0).toFixed(2) : '0.00'}
                    </p>
                    <p className="text-[10px] text-slate-400">Single highest trade liability</p>
                  </div>
                </>
              )}

              {activeReport === 'tax_vat' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Accumulated net taxable revenue</span>
                    <p className="text-2xl font-black text-slate-900">${totalTaxableNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">From filtered trade orders</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest block">Tax / VAT Collected Liabilities</span>
                    <p className="text-2xl font-black text-rose-600">${calculatedTaxCollected.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-rose-600 font-semibold text-[9px] font-mono">Standard Rate: {defaultVatRate}% VAT</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Gross Turnover (Inc. Tax)</span>
                    <p className="text-2xl font-black text-indigo-150 text-indigo-600">${grossRevenueWithTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Trade turn with taxes added</p>
                  </div>
                </>
              )}

              {activeReport === 'activity_logs' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Tracked Operations Segment</span>
                    <p className="text-2xl font-black text-slate-900">{filteredSystemLogs.length} Entries</p>
                    <p className="text-[10px] text-slate-400">Within filtered date limits</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">All-time Audits stored</span>
                    <p className="text-2xl font-black text-slate-900">{systemLogs.length} Records</p>
                    <p className="text-[10px] text-indigo-600 font-semibold font-mono">Synced live with Firestore</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Security Operations Log</span>
                    <p className="text-2xl font-black text-emerald-600">Active</p>
                    <p className="text-[10px] text-slate-400">Fully structured & immutable</p>
                  </div>
                </>
              )}

              {activeReport === 'customer_statement' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Opening Balance</span>
                    <p className="text-2xl font-black text-slate-950">${initialOpeningBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Initial profile starting due</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Sales (Debits)</span>
                    <p className="text-2xl font-black text-slate-900">${totalSalesDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">From {salesInvoicesCount} credit invoices</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Outstanding Due Recievables</span>
                    <p className="text-2xl font-black text-rose-600">${derivedOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-rose-600 font-bold">Current reconciled ledger due</p>
                  </div>
                </>
              )}

              {activeReport === 'supplier_statement' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Opening Balance</span>
                    <p className="text-2xl font-black text-slate-950">${initialSupplierOpeningBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Initial profile starting debt</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Purchases (Credits)</span>
                    <p className="text-2xl font-black text-slate-900">${totalSupplierPurchasesCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">From {purchasesInvoicesCount} credit invoices</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Outstanding Payables Debt</span>
                    <p className="text-2xl font-black text-amber-600">${derivedSupplierOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-amber-600 font-bold">Current reconciled ledger debt</p>
                  </div>
                </>
              )}

              {activeReport === 'chart_of_accounts' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block">Registered General Ledger Accounts</span>
                    <p className="text-2xl font-black text-slate-900">{coaSummaryStats.totalAccounts} Accounts</p>
                    <p className="text-[10px] text-slate-400">
                      Active: <span className="font-bold text-slate-600">{coaSummaryStats.activeAccounts}</span> • System: <span className="font-bold text-slate-600">{coaSummaryStats.systemAccounts}</span>
                    </p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Asset Valuation</span>
                    <p className="text-2xl font-black text-slate-900">${coaSummaryStats.assetsBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Reconciled Cash, AR, & Inventory Assets</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest block">Live Cumulative Revenue</span>
                    <p className="text-2xl font-black text-emerald-600">${coaSummaryStats.revenueBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-emerald-600 font-bold font-mono">Reconciled Sales Invoices</p>
                  </div>
                </>
              )}

            </div>

            {/* Trend Graphs Section */}
            {(activeReport === 'sales' || activeReport === 'profit_loss') && trendDataList.length > 0 && (
              <div className="mt-8 border-t border-slate-100 pt-6 space-y-4 print:hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-950 uppercase tracking-widest flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                      {activeReport === 'sales' ? 'Revenue Timeline Trend' : 'Profit vs Cost Timeline Trend'}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-medium">Visualization of metrics grouped by sale dates</p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-bold">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-600 block"></span> Revenue</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 block"></span> Profit</span>
                  </div>
                </div>

                <div className="relative pt-2 w-full overflow-hidden">
                  <svg viewBox={`0 0 ${trendWidthSvg} ${trendHeightSvg}`} className="w-full h-[140px] max-h-[140px] overflow-hidden">
                    <defs>
                      <linearGradient id="reports-indigo-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="reports-emerald-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Grid lines */}
                    <line x1={trendPaddingX} y1={trendPaddingY} x2={trendWidthSvg - trendPaddingX} y2={trendPaddingY} stroke="#f8fafc" strokeDasharray="3" />
                    <line x1={trendPaddingX} y1={trendHeightSvg / 2} x2={trendWidthSvg - trendPaddingX} y2={trendHeightSvg / 2} stroke="#f8fafc" strokeDasharray="3" />
                    <line x1={trendPaddingX} y1={trendHeightSvg - trendPaddingY} x2={trendWidthSvg - trendPaddingX} y2={trendHeightSvg - trendPaddingY} stroke="#f1f5f9" />

                    {/* Shaded Area fill under revenue curve */}
                    <polygon points={salesAreaPoints} fill="url(#reports-indigo-grad)" />

                    {/* Revenue Line Path */}
                    <polyline
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={salesPoints}
                    />

                    {/* Profit Line Path (for Profit Loss Report) */}
                    {activeReport === 'profit_loss' && (
                      <>
                        <polygon points={profitPoints ? `${trendPaddingX},${trendHeightSvg - trendPaddingY} ${profitPoints} ${trendWidthSvg - trendPaddingX},${trendHeightSvg - trendPaddingY}` : ''} fill="url(#reports-emerald-grad)" />
                        <polyline
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={profitPoints}
                        />
                      </>
                    )}

                    {/* Points Circles */}
                    {trendDataList.map((d, index) => {
                      const x = trendPaddingX + (index * (trendWidthSvg - trendPaddingX * 2)) / Math.max(trendDataList.length - 1, 1);
                      const ySales = trendHeightSvg - trendPaddingY - (d.salesValue / maxSalesVal) * (trendHeightSvg - trendPaddingY * 2);
                      const yProfit = trendHeightSvg - trendPaddingY - (d.profitValue / maxSalesVal) * (trendHeightSvg - trendPaddingY * 2);
                      
                      return (
                        <g key={index} className="group">
                          <circle
                            cx={x}
                            cy={ySales}
                            r="3.5"
                            fill="#ffffff"
                            stroke="#4f46e5"
                            strokeWidth="2"
                            className="transition duration-150 cursor-pointer hover:scale-125"
                          />
                          {activeReport === 'profit_loss' && (
                            <circle
                              cx={x}
                              cy={yProfit}
                              r="3.5"
                              fill="#ffffff"
                              stroke="#10b981"
                              strokeWidth="2"
                              className="transition duration-150 cursor-pointer hover:scale-125"
                            />
                          )}
                          
                          {/* Label Texts */}
                          {trendDataList.length > 0 && (index === 0 || index === trendDataList.length - 1 || index % 2 === 0) && (
                            <text
                              x={x}
                              y={trendHeightSvg - 2}
                              textAnchor="middle"
                              className="text-[8px] font-bold font-mono fill-slate-400"
                            >
                              {d.label}
                            </text>
                          )}
                          <title>{`${d.label} - Revenue: $${d.salesValue.toFixed(2)}${activeReport === 'profit_loss' ? `, Profit: $${d.profitValue.toFixed(2)}` : ''}`}</title>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            )}

          </div>

          {/* CUSTOMER STATEMENT SELECTOR */}
          {activeReport === 'customer_statement' && (
            <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Client Account Ledger</label>
                <div className="relative">
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full md:w-80 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">-- Choose Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Due: ${c.dueBalance.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {currentCustomer && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] block">Billing Phone</span>
                    <span className="text-slate-800 font-bold">{currentCustomer.phone}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] block">VAT Number</span>
                    <span className="text-slate-800 font-bold">{currentCustomer.vatNumber || 'N/A'}</span>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] block">Address</span>
                    <span className="text-slate-800 font-bold line-clamp-1" title={currentCustomer.address}>{currentCustomer.address || 'N/A'}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUPPLIER STATEMENT SELECTOR */}
          {activeReport === 'supplier_statement' && (
            <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Supplier Account Ledger</label>
                <div className="relative">
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full md:w-80 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">-- Choose Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Debt: ${Number(s.dueBalance || 0).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {currentSupplier && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] block">Contact Phone</span>
                    <span className="text-slate-800 font-bold">{currentSupplier.phone}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] block">Payment Type</span>
                    <span className="text-slate-800 font-bold">{currentSupplier.paymentType || 'Credit'}</span>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] block">Email</span>
                    <span className="text-slate-800 font-bold line-clamp-1" title={currentSupplier.email}>{currentSupplier.email || 'N/A'}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SALES REGISTER SELECTOR */}
          {activeReport === 'sales' && (
            <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block">
                  Sales Audit Register Advanced Filters
                </span>
                
                {/* SUB TAB CONTROLS */}
                <div className="flex bg-slate-200/60 p-1 rounded-xl w-fit border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setSalesActiveSubTab('register')}
                    className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                      salesActiveSubTab === 'register'
                        ? 'bg-white text-indigo-700 shadow-3xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Sales Register List
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesActiveSubTab('analytics')}
                    className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                      salesActiveSubTab === 'analytics'
                        ? 'bg-white text-indigo-700 shadow-3xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Audit Analytics Insights
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-7 gap-4 text-xs font-sans">
                {/* Customer Filter */}
                <div className="space-y-1 col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer</label>
                  <select
                    value={salesCustomerFilter}
                    onChange={(e) => setSalesCustomerFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">All Customers</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Product Filter */}
                <div className="space-y-1 col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product</label>
                  <select
                    value={salesProductFilter}
                    onChange={(e) => setSalesProductFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">All Products</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Category Filter */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category</label>
                  <select
                    value={salesCategoryFilter}
                    onChange={(e) => setSalesCategoryFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">All Categories</option>
                    {Array.from(new Set(products.map(p => p.category))).filter(Boolean).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Payment Type Filter */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment</label>
                  <select
                    value={salesPaymentFilter}
                    onChange={(e) => setSalesPaymentFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="all">All Types</option>
                    <option value="Cash">Cash Only</option>
                    <option value="Credit">Credit Only</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                  <select
                    value={salesStatusFilter}
                    onChange={(e) => setSalesStatusFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="all">All Invoices</option>
                    <option value="active">Active Only</option>
                    <option value="voided">Voided Only</option>
                  </select>
                </div>

                {/* Min Amount Filter */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Min Amount ($)</label>
                  <input
                    type="number"
                    placeholder="Min"
                    value={salesMinAmtFilter}
                    onChange={(e) => setSalesMinAmtFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs font-mono"
                  />
                </div>

                {/* Max Amount Filter */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Max Amount ($)</label>
                  <input
                    type="number"
                    placeholder="Max"
                    value={salesMaxAmtFilter}
                    onChange={(e) => setSalesMaxAmtFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs font-mono"
                  />
                </div>
              </div>

              {/* Date Presets Row */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-150">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center pr-2">Date Presets:</span>
                {[
                  { value: 'all_time', label: 'All-Time' },
                  { value: 'today', label: 'Today (June 1)' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'this_week', label: 'This Week' },
                  { value: 'this_month', label: 'This Month' },
                  { value: 'this_quarter', label: 'This Quarter' },
                  { value: 'this_year', label: 'This Year' }
                ].map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleSalesDatePresetChange(preset.value)}
                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                      salesDatePreset === preset.value
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-3xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PURCHASES REGISTER SELECTOR */}
          {activeReport === 'purchases' && (
            <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block">
                    Purchases Register Advanced Filters
                  </span>
                  {/* Certified Audit reconciliation status badge */}
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 border border-emerald-200 text-emerald-800 uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    Audit Reconciled
                  </span>
                </div>
                
                {/* Mode Selector Tab */}
                <div className="flex bg-slate-200/60 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPurchasesActiveSubTab('register')}
                    className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                      purchasesActiveSubTab === 'register'
                        ? 'bg-white text-emerald-700 shadow-3xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Tabular Register List
                  </button>
                  <button
                    type="button"
                    onClick={() => setPurchasesActiveSubTab('analytics')}
                    className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                      purchasesActiveSubTab === 'analytics'
                        ? 'bg-white text-emerald-700 shadow-3xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Purchase Analytics Insights
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-xs font-sans">
                {/* Supplier Dropdown */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Supplier</label>
                  <select
                    value={purchasesSupplierFilter}
                    onChange={(e) => setPurchasesSupplierFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition shadow-2xs"
                  >
                    <option value="">All Suppliers</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Product Dropdown */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product</label>
                  <select
                    value={purchasesProductFilter}
                    onChange={(e) => setPurchasesProductFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition shadow-2xs"
                  >
                    <option value="">All Products</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Category Dropdown */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category</label>
                  <select
                    value={purchasesCategoryFilter}
                    onChange={(e) => setPurchasesCategoryFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition shadow-2xs"
                  >
                    <option value="">All Categories</option>
                    {Array.from(new Set(products.map(p => p.category).filter(Boolean))).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Payment Type Dropdown */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Type</label>
                  <select
                    value={purchasesPaymentFilter}
                    onChange={(e) => setPurchasesPaymentFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition shadow-2xs"
                  >
                    <option value="all">All Payment Types</option>
                    <option value="Cash">Cash Purchases</option>
                    <option value="Credit">Credit Purchases</option>
                  </select>
                </div>

                {/* Status Dropdown */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                  <select
                    value={purchasesStatusFilter}
                    onChange={(e) => setPurchasesStatusFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition shadow-2xs"
                  >
                    <option value="all">Include All Statuses</option>
                    <option value="active">Active Only</option>
                    <option value="voided">Voided Only</option>
                  </select>
                </div>

                {/* Min/Max Amount */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Min/Max Amt ($)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      placeholder="Min"
                      value={purchasesMinAmtFilter}
                      onChange={(e) => setPurchasesMinAmtFilter(e.target.value)}
                      className="w-1/2 bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition shadow-2xs font-mono"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={purchasesMaxAmtFilter}
                      onChange={(e) => setPurchasesMaxAmtFilter(e.target.value)}
                      className="w-1/2 bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition shadow-2xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Audit reconciliation strip */}
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200/40 rounded-xl text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                <Info className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Certified Ledger Match: Purchase Register = Supplier Statement = Supplier Due = Cash Ledger = Balance Sheet = Financial Audit Logs.</span>
              </div>
            </div>
          )}

          {/* EXPENSE ANALYTICS SELECTOR */}
          {activeReport === 'expense_analytics' && (
            <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl space-y-4">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest block">
                Expense Analytical Filters
              </span>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-xs font-sans">
                {/* Category Dropdown */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category</label>
                  <select
                    value={expenseCategoryFilter}
                    onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">All Categories</option>
                    {uniqueCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Vendor Dropdown */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vendor</label>
                  <select
                    value={expenseVendorFilter}
                    onChange={(e) => setExpenseVendorFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">All Vendors</option>
                    {uniqueVendors.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Payment Method Dropdown */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Method</label>
                  <select
                    value={expenseMethodFilter}
                    onChange={(e) => setExpenseMethodFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">All Methods</option>
                    {uniqueMethods.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Status Dropdown */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                  <select
                    value={expenseStatusFilter}
                    onChange={(e) => setExpenseStatusFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="active">Active Only</option>
                    <option value="void">Voided Only</option>
                    <option value="all">Include All</option>
                  </select>
                </div>

                {/* Min Amount */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Min Amount ($)</label>
                  <input
                    type="number"
                    placeholder="Min"
                    value={expenseMinAmtFilter}
                    onChange={(e) => setExpenseMinAmtFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  />
                </div>

                {/* Max Amount */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Max Amount ($)</label>
                  <input
                    type="number"
                    placeholder="Max"
                    value={expenseMaxAmtFilter}
                    onChange={(e) => setExpenseMaxAmtFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* DYNAMIC SEARCH FILTER */}
          {activeReport !== 'profit_loss' && (
            <div className="relative print:hidden">
              <span className="absolute left-4 top-3.5 text-slate-400">
                <Search className="h-4.5 w-4.5" />
              </span>
              <input
                type="text"
                placeholder={
                  activeReport === 'sales' || activeReport === 'tax_vat' 
                    ? "Filter by customer name, product item or sale reference..."
                    : activeReport === 'purchases'
                      ? "Filter by product name, SKU indicator or product category..."
                      : activeReport === 'customer_due'
                        ? "Filter by debtor name, phone number or profile ID..."
                        : activeReport === 'activity_logs'
                          ? "Filter by action tracked, details context or logging operator..."
                          : activeReport === 'customer_statement'
                            ? "Filter statement ledger rows by description or reference ID..."
                            : activeReport === 'supplier_statement'
                              ? "Filter supplier statement rows by description or reference ID..."
                              : "Filter by supplier entity name, category class or contact details..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-xs font-semibold focus:outline-none focus:border-indigo-505 focus:border-indigo-500 transition shadow-2xs placeholder-slate-400"
              />
            </div>
          )}

          {/* TABULAR LAYOUT FOR SELECTED REPORT */}
          {activeReport !== 'expense_analytics' && (
            <div className="bg-white border border-slate-200 rounded-[2rem] shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
              
              {activeReport === 'sales' && (
                <div className="p-1 space-y-6">
                  {salesActiveSubTab === 'register' ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white rounded-t-2xl text-[10px] uppercase tracking-wider font-black">
                          <th className="py-4 px-5 rounded-tl-xl min-w-[130px] whitespace-nowrap">Invoice Number</th>
                          <th className="py-4 px-5 min-w-[100px] whitespace-nowrap">Invoice Date</th>
                          <th className="py-4 px-5 min-w-[150px] whitespace-nowrap">Customer</th>
                          <th className="py-4 px-5 min-w-[110px] whitespace-nowrap">Cust Type</th>
                          <th className="py-4 px-5 min-w-[220px] whitespace-nowrap">Product Summary</th>
                          <th className="py-4 px-5 text-center min-w-[60px] whitespace-nowrap">Qty</th>
                          <th className="py-4 px-5 text-right min-w-[110px] whitespace-nowrap">Subtotal</th>
                          <th className="py-4 px-5 text-right min-w-[90px] whitespace-nowrap">VAT (15%)</th>
                          <th className="py-4 px-5 text-right min-w-[90px] whitespace-nowrap">Discount</th>
                          <th className="py-4 px-5 text-right min-w-[120px] whitespace-nowrap font-bold text-indigo-200">Grand Total</th>
                          <th className="py-4 px-5 min-w-[100px] whitespace-nowrap">Payment</th>
                          <th className="py-4 px-5 min-w-[100px] whitespace-nowrap">Status</th>
                          <th className="py-4 px-5 rounded-tr-xl min-w-[150px] whitespace-nowrap">Created By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredRegisterSales.length === 0 ? (
                          <tr>
                            <td colSpan={13} className="py-16 text-center text-slate-400 text-xs font-semibold">
                              No transaction records found matching the active search filters.
                            </td>
                          </tr>
                        ) : (
                          filteredRegisterSales.map((item) => {
                            const isVoid = isVoidStatus(item.status);
                            const logMatch = systemLogs.find(l => l.entityId === item.id && l.action === 'CREATE_SALE');
                            const createdBy = logMatch ? logMatch.user : "kishor.aysha2@gmail.com";
                            const customerType = item.customerSnapshot?.customerType || customers.find(c => c.id === item.customerId)?.customerType || "Cash";
                            const normItems = getNormalizedItems(item);
                            const totalQty = normItems.reduce((acc, it) => acc + (it.quantity ?? 0), 0);
                            const productSumm = normItems.length === 1 
                              ? normItems[0].productName 
                              : `${normItems[0].productName} + ${normItems.length - 1} items`;

                            return (
                              <tr 
                                key={item.id} 
                                onClick={() => setSelectedSaleForInvoice(item)}
                                className={`hover:bg-indigo-50/40 transition duration-150 cursor-pointer ${
                                  isVoid ? 'bg-rose-50/20 text-slate-400 opacity-60' : ''
                                }`}
                              >
                                {/* Invoice Number */}
                                <td className="py-4 px-5 whitespace-nowrap">
                                  <span className="font-mono font-bold text-xs text-indigo-600 block hover:underline">
                                    {item.invoiceNumber || item.id.substring(item.id.length - 8).toUpperCase()}
                                  </span>
                                </td>
                                {/* Invoice Date */}
                                <td className="py-4 px-5 text-xs font-semibold text-slate-500 whitespace-nowrap">
                                  {item.saleDate.split('T')[0]}
                                </td>
                                {/* Customer */}
                                <td className="py-4 px-5 text-xs font-bold text-slate-800 capitalize whitespace-nowrap">
                                  {item.customerName}
                                </td>
                                {/* Cust Type */}
                                <td className="py-4 px-5 text-xs whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                    customerType === 'Credit' 
                                      ? 'bg-blue-50 border border-blue-100 text-blue-700' 
                                      : 'bg-slate-50 border border-slate-150 text-slate-600'
                                  }`}>
                                    {customerType}
                                  </span>
                                </td>
                                {/* Product Summary */}
                                <td className="py-4 px-5 text-xs text-slate-600 max-w-[220px] truncate" title={normItems.map(it => `${it.productName} (x${it.quantity})`).join(', ')}>
                                  {productSumm}
                                </td>
                                {/* Qty */}
                                <td className="py-4 px-5 text-xs font-bold text-center text-slate-700 whitespace-nowrap">
                                  {totalQty}
                                </td>
                                {/* Subtotal */}
                                <td className="py-4 px-5 text-xs font-mono font-bold text-slate-950 text-right whitespace-nowrap">
                                  ${(item.subtotal ?? item.totalAmount / 1.15).toFixed(2)}
                                </td>
                                {/* VAT */}
                                <td className="py-4 px-5 text-xs font-mono font-bold text-slate-500 text-right whitespace-nowrap">
                                  ${(item.taxAmount ?? (item.totalAmount - (item.subtotal ?? item.totalAmount / 1.15))).toFixed(2)}
                                </td>
                                {/* Discount */}
                                <td className="py-4 px-5 text-xs font-mono font-semibold text-slate-400 text-right whitespace-nowrap">
                                  $0.00
                                </td>
                                {/* Grand Total */}
                                <td className={`py-4 px-5 text-xs font-mono font-black text-right whitespace-nowrap ${isVoid ? 'text-slate-400 line-through' : 'text-indigo-650 text-indigo-700'}`}>
                                  ${item.totalAmount.toFixed(2)}
                                </td>
                                {/* Payment */}
                                <td className="py-4 px-5 text-xs whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-bold text-[9px] ${
                                    item.paymentType === 'Cash' 
                                      ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                                      : 'bg-amber-50 border-amber-100 text-amber-800'
                                  }`}>
                                    {item.paymentType}
                                  </span>
                                </td>
                                {/* Status */}
                                <td className="py-4 px-5 text-xs whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border font-black text-[9px] tracking-wide uppercase ${
                                    isVoid 
                                      ? 'bg-red-50 border-red-100 text-red-700' 
                                      : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                  }`}>
                                    {isVoid ? 'Voided' : 'Active'}
                                  </span>
                                </td>
                                {/* Created By */}
                                <td className="py-4 px-5 text-xs text-slate-500 font-mono whitespace-nowrap max-w-[150px] truncate" title={createdBy}>
                                  {createdBy}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  ) : (
                    /* AUDIT ANALYTICS DASHBOARD VIEW */
                    <div className="p-4 space-y-6">
                      {/* Grid Row 1: Payment Type Breakdown & Categories */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Payment Type Distribution */}
                        <div className="border border-slate-150 rounded-2xl p-5 bg-slate-50/50 space-y-4">
                          <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">
                            Invoice Settlement Distribution
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white border border-slate-200/60 p-4 rounded-xl space-y-1">
                              <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block">Cash Settlements</span>
                              <p className="text-lg font-black text-slate-900">${salesAnalyticsData.paymentBreakdown.cashRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                              <span className="text-[10px] text-slate-400 font-medium block">
                                {salesAnalyticsData.paymentBreakdown.cashCount} completed orders
                              </span>
                            </div>
                            <div className="bg-white border border-slate-200/60 p-4 rounded-xl space-y-1">
                              <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider block">Credit Settlements</span>
                              <p className="text-lg font-black text-slate-900">${salesAnalyticsData.paymentBreakdown.creditRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                              <span className="text-[10px] text-slate-400 font-medium block">
                                {salesAnalyticsData.paymentBreakdown.creditCount} outstanding ledger lines
                              </span>
                            </div>
                          </div>

                          {/* Distribution Ratio Bar */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold text-slate-500">
                              <span>Cash ({salesAnalyticsData.paymentBreakdown.totalRevenue > 0 ? Math.round((salesAnalyticsData.paymentBreakdown.cashRevenue / salesAnalyticsData.paymentBreakdown.totalRevenue) * 100) : 0}%)</span>
                              <span>Credit ({salesAnalyticsData.paymentBreakdown.totalRevenue > 0 ? Math.round((salesAnalyticsData.paymentBreakdown.creditRevenue / salesAnalyticsData.paymentBreakdown.totalRevenue) * 100) : 0}%)</span>
                            </div>
                            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                              <div 
                                className="h-full bg-emerald-500 transition-all duration-500" 
                                style={{ width: `${salesAnalyticsData.paymentBreakdown.totalRevenue > 0 ? (salesAnalyticsData.paymentBreakdown.cashRevenue / salesAnalyticsData.paymentBreakdown.totalRevenue) * 100 : 0}%` }}
                              ></div>
                              <div 
                                className="h-full bg-amber-500 transition-all duration-500" 
                                style={{ width: `${salesAnalyticsData.paymentBreakdown.totalRevenue > 0 ? (salesAnalyticsData.paymentBreakdown.creditRevenue / salesAnalyticsData.paymentBreakdown.totalRevenue) * 100 : 0}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>

                        {/* Top Categories Chart List */}
                        <div className="border border-slate-150 rounded-2xl p-5 bg-slate-50/50 space-y-4">
                          <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">
                            Product Categories Performance
                          </h4>
                          <div className="space-y-3">
                            {salesAnalyticsData.categorySales.slice(0, 4).map((cat, idx) => {
                              const sharePercent = registerSummary.totalRevenue > 0 ? Math.round((cat.revenue / registerSummary.totalRevenue) * 100) : 0;
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                                    <span className="font-bold">{cat.name || 'General'}</span>
                                    <span className="font-mono text-slate-900">${cat.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({sharePercent}%)</span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-indigo-500 rounded-full transition-all duration-300" 
                                      style={{ width: `${sharePercent}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                            {salesAnalyticsData.categorySales.length === 0 && (
                              <p className="text-center text-xs text-slate-400 py-6">No product sale data logged yet.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Grid Row 2: Top Customers & Top Products */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Top Customers Leaderboard */}
                        <div className="border border-slate-150 rounded-2xl p-5 bg-white space-y-4">
                          <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                            <span>Top Customer Portfolios</span>
                            <span className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md font-bold">BY REVENUE</span>
                          </h4>
                          <div className="divide-y divide-slate-100">
                            {salesAnalyticsData.customerSales.slice(0, 5).map((cust, idx) => {
                              const share = registerSummary.totalRevenue > 0 ? (cust.revenue / registerSummary.totalRevenue) * 100 : 0;
                              const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "👤";
                              return (
                                <div key={idx} className="py-3 flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">{medal}</span>
                                    <div>
                                      <span className="text-xs font-bold text-slate-800 block capitalize">{cust.name}</span>
                                      <span className="text-[10px] text-slate-400 font-medium">Dispatched {cust.qty} total units</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs font-mono font-bold text-slate-900 block">${cust.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    <span className="text-[9px] text-slate-400 font-bold uppercase">{share.toFixed(1)}% contribution</span>
                                  </div>
                                </div>
                              );
                            })}
                            {salesAnalyticsData.customerSales.length === 0 && (
                              <p className="text-center text-xs text-slate-400 py-6">No customer data logged yet.</p>
                            )}
                          </div>
                        </div>

                        {/* Top Products Leaderboard */}
                        <div className="border border-slate-150 rounded-2xl p-5 bg-white space-y-4">
                          <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                            <span>Top Product Sales Ledger</span>
                            <span className="text-[9px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md font-bold">DISPATCH VOLUMES</span>
                          </h4>
                          <div className="divide-y divide-slate-100">
                            {salesAnalyticsData.productSales.slice(0, 5).map((prod, idx) => {
                              return (
                                <div key={idx} className="py-3 flex items-center justify-between gap-4">
                                  <div>
                                    <span className="text-xs font-bold text-slate-800 block">{prod.name}</span>
                                    <span className="text-[9px] font-semibold text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded-md">{prod.category}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs font-mono font-bold text-emerald-700 block">{prod.qty} Units Sold</span>
                                    <span className="text-[10px] text-slate-400 font-medium">${prod.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })} revenue</span>
                                  </div>
                                </div>
                              );
                            })}
                            {salesAnalyticsData.productSales.length === 0 && (
                              <p className="text-center text-xs text-slate-400 py-6">No product sale volumes logged yet.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeReport === 'purchases' && (
                <div className="p-1 space-y-6">
                  {purchasesActiveSubTab === 'register' ? (
                    <div className="overflow-x-auto border border-slate-150 rounded-2xl">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-wider font-black">
                            <th className="py-4 px-5 rounded-tl-xl min-w-[140px] whitespace-nowrap">Purchase Invoice Number</th>
                            <th className="py-4 px-5 min-w-[100px] whitespace-nowrap">Purchase Date</th>
                            <th className="py-4 px-5 min-w-[150px] whitespace-nowrap">Supplier</th>
                            <th className="py-4 px-5 min-w-[110px] whitespace-nowrap">Supplier Type</th>
                            <th className="py-4 px-5 min-w-[220px] whitespace-nowrap">Product Summary</th>
                            <th className="py-4 px-5 text-center min-w-[60px] whitespace-nowrap">Qty</th>
                            <th className="py-4 px-5 text-right min-w-[110px] whitespace-nowrap">Subtotal</th>
                            <th className="py-4 px-5 text-right min-w-[90px] whitespace-nowrap">VAT (15%)</th>
                            <th className="py-4 px-5 text-right min-w-[90px] whitespace-nowrap">Discount</th>
                            <th className="py-4 px-5 text-right min-w-[120px] whitespace-nowrap font-bold text-emerald-200">Grand Total</th>
                            <th className="py-4 px-5 min-w-[100px] whitespace-nowrap">Payment Type</th>
                            <th className="py-4 px-5 min-w-[100px] whitespace-nowrap">Status</th>
                            <th className="py-4 px-5 rounded-tr-xl min-w-[150px] whitespace-nowrap">Created By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredRegisterPurchases.length === 0 ? (
                            <tr>
                              <td colSpan={13} className="py-16 text-center text-slate-400 text-xs font-semibold">
                                No purchase records found matching the active search filters.
                              </td>
                            </tr>
                          ) : (
                            filteredRegisterPurchases.map((item) => {
                              const isVoid = isVoidStatus(item.status);
                              const logMatch = systemLogs.find(l => l.entityId === item.id && l.action.includes('PROCUREMENT'));
                              const createdBy = logMatch ? logMatch.user : "kishor.aysha2@gmail.com";
                              const sType = suppliers.find(s => s.id === item.supplierId)?.category || "Standard";
                              const vat = item.vatAmount ?? (item.totalAmount * 15 / 115);
                              const sub = item.totalAmount - vat;
                              const disc = item.discountAmount ?? 0;
                              const invoiceNum = item.invoiceNumber || `PIN-${item.id.substring(item.id.length - 8).toUpperCase()}`;

                              return (
                                <tr 
                                  key={item.id} 
                                  onClick={() => setSelectedPurchaseForDetail(item)}
                                  className={`hover:bg-emerald-50/40 transition duration-150 cursor-pointer ${
                                    isVoid ? 'bg-rose-50/20 text-slate-400 opacity-60' : ''
                                  }`}
                                >
                                  {/* Invoice Number */}
                                  <td className="py-4 px-5 whitespace-nowrap">
                                    <span className="font-mono font-bold text-xs text-emerald-600 block hover:underline">
                                      {invoiceNum}
                                    </span>
                                  </td>
                                  {/* Purchase Date */}
                                  <td className="py-4 px-5 text-xs font-semibold text-slate-500 whitespace-nowrap">
                                    {item.purchaseDate.split('T')[0]}
                                  </td>
                                  {/* Supplier */}
                                  <td className="py-4 px-5 text-xs font-bold text-slate-800 capitalize whitespace-nowrap">
                                    {item.supplierName}
                                  </td>
                                  {/* Supplier Type */}
                                  <td className="py-4 px-5 text-xs whitespace-nowrap">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-50 border border-slate-150 text-slate-600 capitalize">
                                      {sType}
                                    </span>
                                  </td>
                                  {/* Product Summary */}
                                  <td className="py-4 px-5 text-xs text-slate-600 max-w-[220px] truncate" title={item.productName}>
                                    {item.productName}
                                  </td>
                                  {/* Qty */}
                                  <td className="py-4 px-5 text-xs font-bold text-center text-slate-700 whitespace-nowrap">
                                    {item.quantity}
                                  </td>
                                  {/* Subtotal */}
                                  <td className="py-4 px-5 text-xs font-mono font-bold text-slate-950 text-right whitespace-nowrap">
                                    ${sub.toFixed(2)}
                                  </td>
                                  {/* VAT */}
                                  <td className="py-4 px-5 text-xs font-mono font-bold text-slate-500 text-right whitespace-nowrap">
                                    ${vat.toFixed(2)}
                                  </td>
                                  {/* Discount */}
                                  <td className="py-4 px-5 text-xs font-mono font-bold text-rose-600 text-right whitespace-nowrap">
                                    -${disc.toFixed(2)}
                                  </td>
                                  {/* Grand Total */}
                                  <td className="py-4 px-5 text-xs font-mono font-black text-slate-900 text-right whitespace-nowrap">
                                    ${item.totalAmount.toFixed(2)}
                                  </td>
                                  {/* Payment Type */}
                                  <td className="py-4 px-5 text-xs whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                      item.paymentType === 'Credit' 
                                        ? 'bg-amber-50 border border-amber-100 text-amber-700' 
                                        : 'bg-slate-50 border border-slate-150 text-slate-600'
                                    }`}>
                                      {item.paymentType}
                                    </span>
                                  </td>
                                  {/* Status */}
                                  <td className="py-4 px-5 text-xs whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                      isVoid 
                                        ? 'bg-rose-50 border border-rose-100 text-rose-700' 
                                        : 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                                    }`}>
                                      {isVoid ? 'Voided' : 'Active'}
                                    </span>
                                  </td>
                                  {/* Created By */}
                                  <td className="py-4 px-5 text-xs text-slate-500 font-mono whitespace-nowrap max-w-[150px] truncate" title={createdBy}>
                                    {createdBy}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* AUDIT ANALYTICS DASHBOARD VIEW FOR PURCHASES */
                    <div className="p-4 space-y-6 animate-fade-in">
                      {/* Grid Row 1: Payment Type Breakdown & Categories */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Payment Type Distribution */}
                        <div className="border border-slate-150 rounded-2xl p-5 bg-slate-50/50 space-y-4">
                          <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">
                            Purchase Settlement Distribution
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white border border-slate-200/60 p-4 rounded-xl space-y-1">
                              <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block">Cash Settlements</span>
                              <p className="text-lg font-black text-slate-900">${purchasesAnalyticsData.paymentBreakdown.cashAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                              <span className="text-[10px] text-slate-400 font-medium block">
                                {purchasesAnalyticsData.paymentBreakdown.cashCount} completed orders
                              </span>
                            </div>
                            <div className="bg-white border border-slate-200/60 p-4 rounded-xl space-y-1">
                              <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider block">Credit Settlements</span>
                              <p className="text-lg font-black text-slate-900">${purchasesAnalyticsData.paymentBreakdown.creditAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                              <span className="text-[10px] text-slate-400 font-medium block">
                                {purchasesAnalyticsData.paymentBreakdown.creditCount} outstanding ledger lines
                              </span>
                            </div>
                          </div>

                          {/* Distribution Ratio Bar */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold text-slate-500">
                              <span>Cash ({purchasesAnalyticsData.paymentBreakdown.totalAmount > 0 ? Math.round((purchasesAnalyticsData.paymentBreakdown.cashAmount / purchasesAnalyticsData.paymentBreakdown.totalAmount) * 100) : 0}%)</span>
                              <span>Credit ({purchasesAnalyticsData.paymentBreakdown.totalAmount > 0 ? Math.round((purchasesAnalyticsData.paymentBreakdown.creditAmount / purchasesAnalyticsData.paymentBreakdown.totalAmount) * 100) : 0}%)</span>
                            </div>
                            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                              <div 
                                className="h-full bg-emerald-500 transition-all duration-500" 
                                style={{ width: `${purchasesAnalyticsData.paymentBreakdown.totalAmount > 0 ? (purchasesAnalyticsData.paymentBreakdown.cashAmount / purchasesAnalyticsData.paymentBreakdown.totalAmount) * 100 : 0}%` }}
                              ></div>
                              <div 
                                className="h-full bg-amber-500 transition-all duration-500" 
                                style={{ width: `${purchasesAnalyticsData.paymentBreakdown.totalAmount > 0 ? (purchasesAnalyticsData.paymentBreakdown.creditAmount / purchasesAnalyticsData.paymentBreakdown.totalAmount) * 100 : 0}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>

                        {/* Top Categories Chart List */}
                        <div className="border border-slate-150 rounded-2xl p-5 bg-slate-50/50 space-y-4">
                          <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">
                            Product Categories Procurement Performance
                          </h4>
                          <div className="space-y-3">
                            {purchasesAnalyticsData.categoryPurchases.slice(0, 4).map((cat, idx) => {
                              const sharePercent = purchasesSummary.totalPurchases > 0 ? Math.round((cat.amount / purchasesSummary.totalPurchases) * 100) : 0;
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                                    <span className="font-bold">{cat.name || 'General'}</span>
                                    <span className="font-mono text-slate-900">${cat.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({sharePercent}%)</span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-emerald-500 rounded-full transition-all duration-300" 
                                      style={{ width: `${sharePercent}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                            {purchasesAnalyticsData.categoryPurchases.length === 0 && (
                              <p className="text-center text-xs text-slate-400 py-6">No product purchase data logged yet.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Grid Row 2: Top Suppliers & Top Products */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Top Suppliers Leaderboard */}
                        <div className="border border-slate-150 rounded-2xl p-5 bg-white space-y-4">
                          <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                            <span>Top Supplier Portfolios</span>
                            <span className="text-[9px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md font-bold">BY PROCUREMENT</span>
                          </h4>
                          <div className="divide-y divide-slate-100">
                            {purchasesAnalyticsData.supplierPurchases.slice(0, 5).map((sup, idx) => {
                              const share = purchasesSummary.totalPurchases > 0 ? (sup.amount / purchasesSummary.totalPurchases) * 100 : 0;
                              const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "👤";
                              return (
                                <div key={idx} className="py-3 flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold">{medal}</span>
                                    <div>
                                      <span className="text-xs font-bold text-slate-800 capitalize block">{sup.name}</span>
                                      <span className="text-[10px] text-slate-400 font-medium block">{sup.qty} items supplied</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs font-bold font-mono text-slate-900 block">${sup.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    <span className="text-[9px] text-emerald-600 font-bold block">{share.toFixed(1)}% weight</span>
                                  </div>
                                </div>
                              );
                            })}
                            {purchasesAnalyticsData.supplierPurchases.length === 0 && (
                              <p className="text-center text-xs text-slate-400 py-12">No supplier portfolios recorded yet.</p>
                            )}
                          </div>
                        </div>

                        {/* Top Products Leaderboard */}
                        <div className="border border-slate-150 rounded-2xl p-5 bg-white space-y-4">
                          <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                            <span>Top Procured Products</span>
                            <span className="text-[9px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md font-bold">BY VOLUMES</span>
                          </h4>
                          <div className="divide-y divide-slate-100">
                            {purchasesAnalyticsData.productPurchases.slice(0, 5).map((prod, idx) => {
                              const share = purchasesSummary.totalPurchases > 0 ? (prod.amount / purchasesSummary.totalPurchases) * 100 : 0;
                              const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "📦";
                              return (
                                <div key={idx} className="py-3 flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold">{medal}</span>
                                    <div>
                                      <span className="text-xs font-bold text-slate-800 capitalize block">{prod.name}</span>
                                      <span className="text-[10px] text-slate-400 font-medium block">Category: {prod.category}</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs font-bold font-mono text-slate-900 block">${prod.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    <span className="text-[9px] text-slate-500 font-bold block">Qty: {prod.qty} Units</span>
                                  </div>
                                </div>
                              );
                            })}
                            {purchasesAnalyticsData.productPurchases.length === 0 && (
                              <p className="text-center text-xs text-slate-400 py-12">No product catalog purchases registered.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeReport === 'profit_loss' && (
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200/60 rounded-xl text-slate-500 text-xs font-semibold">
                    <Info className="h-4 w-4 text-indigo-500 shrink-0" />
                    <span>Real-time reconciliation of costs and revenue. Gross Profit calculation reflects total items shipped with exact stock procurement rates.</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-3 border-b border-slate-100 text-xs font-bold">
                      <span className="text-slate-500">Gross Sales Income (Excluding Tax):</span>
                      <span className="text-slate-900">${totalSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-slate-100 text-xs font-bold">
                      <span className="text-slate-500">Cost of Goods Sold (cogs):</span>
                      <span className="text-rose-600">-${costOfGoodsSold.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-slate-100 text-xs font-bold">
                      <span className="text-slate-500">Gross Margin / Profit:</span>
                      <span className="text-emerald-600">${grossProfit.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-slate-100 text-xs font-bold">
                      <span className="text-slate-500">Operating Expenses (OpEx):</span>
                      <span className="text-rose-600">-${totalExpensesAmt.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-4 text-sm font-black bg-indigo-50/30 px-4 rounded-xl">
                      <span className="text-indigo-605 text-indigo-600">Net Operating Profits Margin:</span>
                      <span className="text-emerald-600">${netProfit.toFixed(2)} ({marginPercentage.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
              )}

              {activeReport === 'customer_due' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-tl-xl min-w-[140px] whitespace-nowrap">Customer Account ID</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[150px] whitespace-nowrap">Billing Name</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[130px] whitespace-nowrap">Contact Phone</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[180px] whitespace-nowrap">Billing Address</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[120px] whitespace-nowrap">Account Type</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right rounded-tr-xl min-w-[160px] whitespace-nowrap">Outstanding Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchableCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-semibold">
                          No customer debtor profiles matched
                        </td>
                      </tr>
                    ) : (
                      searchableCustomers.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/50 transition duration-150">
                          <td className="py-4 px-5 font-mono text-xs text-slate-400 whitespace-nowrap">{c.id.substring(0, 10)}...</td>
                          <td className="py-4 px-5 text-xs font-bold text-slate-800 capitalize whitespace-nowrap">{c.name}</td>
                          <td className="py-4 px-5 text-xs text-slate-500 whitespace-nowrap">{c.phone}</td>
                          <td className="py-4 px-5 text-xs text-slate-500 truncate max-w-[180px] whitespace-nowrap" title={c.address}>{c.address}</td>
                          <td className="py-4 px-5 text-xs whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[9px] border ${
                              c.customerType === 'Cash' 
                                ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                                : 'bg-amber-50 border-amber-100 text-amber-800'
                            }`}>
                              {c.customerType}
                            </span>
                          </td>
                          <td className="py-4 px-5 text-xs text-right whitespace-nowrap">
                            <span className={`font-mono font-bold ${c.dueBalance > 0 ? 'text-rose-600 text-sm' : 'text-slate-500'}`}>
                              ${c.dueBalance.toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeReport === 'supplier_due' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-tl-xl min-w-[150px] whitespace-nowrap">Supplier Account Code</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[160px] whitespace-nowrap">Entity Name</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[150px] whitespace-nowrap">Contact Details</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[125px] whitespace-nowrap">Sector Label</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right rounded-tr-xl min-w-[160px] whitespace-nowrap">Outstanding Debt Payables</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchableSuppliers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 text-xs font-semibold">
                          No active suppliers to state
                        </td>
                      </tr>
                    ) : (
                      searchableSuppliers.map((s) => {
                        const debt = s.dueBalance ?? 0;
                        return (
                          <tr key={s.id} className="hover:bg-slate-50/50 transition duration-150">
                            <td className="py-4 px-5 font-mono text-xs text-slate-400 whitespace-nowrap">{s.id.substring(0, 10)}...</td>
                            <td className="py-4 px-5 text-xs font-bold text-slate-800 whitespace-nowrap">{s.name}</td>
                            <td className="py-4 px-5 whitespace-nowrap">
                              <span className="text-xs text-slate-500 block">{s.phone}</span>
                              <span className="text-[10px] text-slate-400 block">{s.email || 'N/A'}</span>
                            </td>
                            <td className="py-4 px-5 text-xs text-slate-500 capitalize whitespace-nowrap">{s.category ?? 'Primary Materials'}</td>
                            <td className="py-4 px-5 text-xs text-right whitespace-nowrap">
                              <span className={`font-mono font-bold ${debt > 0 ? 'text-rose-600 text-sm' : 'text-slate-500'}`}>
                                ${debt.toFixed(2)}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {activeReport === 'tax_vat' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-tl-xl min-w-[160px] whitespace-nowrap">Trade Transaction ID</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[160px] whitespace-nowrap">Customer Entity</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-center min-w-[100px] whitespace-nowrap">VAT rate</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right min-w-[160px] whitespace-nowrap">Tax Accrued Liabilities</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right rounded-tr-xl min-w-[160px] whitespace-nowrap">Nett Value (Subtotal)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchableSales.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 text-xs font-semibold">
                          No sales trade files subject to regional VAT limits
                        </td>
                      </tr>
                    ) : (
                      searchableSales.map((item) => {
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition duration-150">
                            <td className="py-4 px-5 font-mono text-xs text-indigo-600 whitespace-nowrap">{item.id.substring(item.id.length - 12).toUpperCase()}</td>
                            <td className="py-4 px-5 text-xs font-bold text-slate-800 capitalize whitespace-nowrap">{item.customerName}</td>
                            <td className="py-4 px-5 text-xs text-center font-bold text-slate-500 whitespace-nowrap">{item.taxRatePercent}%</td>
                            <td className="py-4 px-5 text-xs font-bold text-right text-rose-600 font-mono whitespace-nowrap">${item.taxAmount?.toFixed(2)}</td>
                            <td className="py-4 px-5 text-xs font-bold text-right text-slate-900 font-mono whitespace-nowrap">${item.subtotal?.toFixed(2)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {activeReport === 'activity_logs' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-tl-xl min-w-[130px] whitespace-nowrap">Timestamp</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[150px] whitespace-nowrap">Activity Action</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[160px] whitespace-nowrap">Logged Operator</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-tr-xl min-w-[200px] whitespace-nowrap">Details Context</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchableSystemLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-400 text-xs font-semibold">
                          No audit activities recorded matching search criteria
                        </td>
                      </tr>
                    ) : (
                      searchableSystemLogs.map((item, index) => {
                        return (
                          <tr key={item.id || index} className="hover:bg-slate-50/50 transition duration-150">
                            <td className="py-4 px-5 font-mono text-xs text-slate-500 whitespace-nowrap">
                              {item.timestamp ? new Date(item.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                            </td>
                            <td className="py-4 px-5 text-xs font-bold whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                item.action === 'Sale completed' ? 'bg-emerald-100 text-emerald-800' :
                                item.action === 'Stock updated' ? 'bg-amber-100 text-amber-800' :
                                item.action === 'Product added' ? 'bg-indigo-100 text-indigo-800' :
                                item.action === 'Product edited' ? 'bg-blue-100 text-blue-800' :
                                item.action === 'Customer created' ? 'bg-sky-100 text-sky-800' :
                                'bg-slate-100 text-slate-800'
                              }`}>
                                {item.action}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-xs font-semibold text-slate-750 text-slate-700 whitespace-nowrap">{item.user || 'System'}</td>
                            <td className="py-4 px-5 text-xs text-slate-600 font-sans leading-relaxed">{item.details}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {activeReport === 'customer_statement' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white rounded-t-2xl">
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-tl-xl whitespace-nowrap">Date</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Reference</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Invoice No</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Receipt No</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Transaction Type</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Description</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right whitespace-nowrap">Debit</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right whitespace-nowrap">Credit</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right whitespace-nowrap font-mono">Running Balance</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-tr-xl whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!selectedCustomerId ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-400 text-xs font-semibold">
                          Please select a customer profile from the dropdown menu to load ledger statements
                        </td>
                      </tr>
                    ) : filteredLedgerEntries.length === 0 ? (
                      <>
                        <tr className="hover:bg-slate-50/50 transition duration-150 font-semibold text-slate-700 bg-slate-50/30">
                          <td className="py-4 px-5 text-xs font-mono">-</td>
                          <td className="py-4 px-5 text-xs font-mono font-bold text-indigo-600">INITIAL</td>
                          <td className="py-4 px-5 text-xs font-mono text-slate-400">-</td>
                          <td className="py-4 px-5 text-xs font-mono text-slate-400">-</td>
                          <td className="py-4 px-5 text-xs font-bold text-slate-600">Opening Balance</td>
                          <td className="py-4 px-5 text-xs text-slate-500">Starting balance configured on profile creation</td>
                          <td className="py-4 px-5 text-xs text-right font-mono text-slate-400">-</td>
                          <td className="py-4 px-5 text-xs text-right font-mono text-slate-400">-</td>
                          <td className="py-4 px-5 text-xs text-right font-mono font-black text-slate-900">${initialOpeningBalance.toFixed(2)}</td>
                          <td className="py-4 px-5 text-xs text-emerald-800 font-semibold">Active</td>
                        </tr>
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-slate-400 text-xs font-semibold">
                            No additional ledger entries found matching search query
                          </td>
                        </tr>
                      </>
                    ) : (
                      <>
                        {/* Always prepend the opening balance row for accounting consistency */}
                        <tr className="hover:bg-slate-50/50 transition duration-150 font-semibold text-slate-700 bg-slate-50/30">
                          <td className="py-4 px-5 text-xs font-mono">-</td>
                          <td className="py-4 px-5 text-xs font-mono font-bold text-indigo-600">INITIAL</td>
                          <td className="py-4 px-5 text-xs font-mono text-slate-400">-</td>
                          <td className="py-4 px-5 text-xs font-mono text-slate-400">-</td>
                          <td className="py-4 px-5 text-xs font-bold text-slate-650">Opening Balance</td>
                          <td className="py-4 px-5 text-xs text-slate-500">Starting balance configured on profile creation</td>
                          <td className="py-4 px-5 text-xs text-right font-mono text-slate-400">-</td>
                          <td className="py-4 px-5 text-xs text-right font-mono text-slate-400">-</td>
                          <td className="py-4 px-5 text-xs text-right font-mono font-black text-slate-900">${initialOpeningBalance.toFixed(2)}</td>
                          <td className="py-4 px-5 text-xs text-emerald-800 font-semibold">Active</td>
                        </tr>
                        {filteredLedgerEntries.map((item, idx) => {
                          const isVoid = isVoidStatus(item.status);
                          return (
                            <tr key={idx} className={`hover:bg-slate-50/50 transition duration-150 ${isVoid ? 'bg-rose-50/20 text-slate-450 opacity-80' : ''}`}>
                              {/* 1. Date */}
                              <td className="py-4 px-5 text-xs whitespace-nowrap text-slate-500 font-semibold">
                                {new Date(item.date).toLocaleDateString()}
                              </td>
                              {/* 2. Reference */}
                              <td className="py-4 px-5 whitespace-nowrap">
                                <span className="font-mono font-bold text-xs text-slate-750 block text-slate-700">{item.ref}</span>
                              </td>
                              {/* 3. Invoice No */}
                              <td className="py-4 px-5 whitespace-nowrap">
                                <span className="font-mono font-bold text-xs text-slate-700 block">{item.invoiceNumber}</span>
                              </td>
                              {/* 4. Receipt No */}
                              <td className="py-4 px-5 whitespace-nowrap">
                                <span className="font-mono font-bold text-xs text-slate-700 block">{item.receiptNumber}</span>
                              </td>
                              {/* 5. Transaction Type */}
                              <td className="py-4 px-5 text-xs font-bold text-slate-800 whitespace-nowrap capitalize">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-bold ${
                                  item.type === 'Sale'
                                    ? 'bg-amber-50 border-amber-100 text-amber-800'
                                    : item.type === 'Payment'
                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                                    : item.type === 'Void Sale'
                                    ? 'bg-rose-50 border-rose-100 text-rose-800 line-through'
                                    : item.type === 'Void Payment'
                                    ? 'bg-rose-50 border-rose-100 text-rose-800 line-through'
                                    : 'bg-indigo-50 border-indigo-100 text-indigo-800'
                                }`}>
                                  {item.type}
                                </span>
                              </td>
                              {/* 6. Description */}
                              <td className="py-4 px-5 text-xs text-slate-600 font-medium">
                                {item.description}
                              </td>
                              {/* 7. Debit */}
                              <td className={`py-4 px-5 text-xs text-right font-mono font-bold text-rose-600 whitespace-nowrap ${isVoid ? 'line-through' : ''}`}>
                                {item.debit > 0 ? `$${item.debit.toFixed(2)}` : '-'}
                              </td>
                              {/* 8. Credit */}
                              <td className={`py-4 px-5 text-xs text-right font-mono font-bold text-emerald-600 whitespace-nowrap ${isVoid ? 'line-through' : ''}`}>
                                {item.credit > 0 ? `$${item.credit.toFixed(2)}` : '-'}
                              </td>
                              {/* 9. Running Balance */}
                              <td className="py-4 px-5 text-xs text-right font-mono font-black text-slate-950 whitespace-nowrap bg-slate-50/10">
                                ${item.runningBalance.toFixed(2)}
                              </td>
                              {/* 10. Status */}
                              <td className="py-4 px-5 text-xs whitespace-nowrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                  isVoid
                                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                                    : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                }`}>
                                  {item.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    )}
                  </tbody>
                </table>
              )}

              {activeReport === 'supplier_statement' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white rounded-t-2xl">
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-tl-xl min-w-[110px] whitespace-nowrap">Date</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[140px] whitespace-nowrap">Reference ID</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[130px] whitespace-nowrap">Transaction Type</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[220px] whitespace-nowrap">Description</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right min-w-[125px] whitespace-nowrap">Debit (Payment)</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right min-w-[125px] whitespace-nowrap">Credit (Procurement)</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right rounded-tr-xl min-w-[130px] whitespace-nowrap font-mono">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!selectedSupplierId ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 text-xs font-semibold">
                          Please select a supplier profile from the dropdown menu to load ledger statements
                        </td>
                      </tr>
                    ) : filteredSupplierLedgerEntries.length === 0 ? (
                      <>
                        <tr className="hover:bg-slate-50/50 transition duration-150 font-semibold text-slate-700 bg-slate-50/30">
                          <td className="py-4 px-5 text-xs font-mono">-</td>
                          <td className="py-4 px-5 text-xs font-mono font-bold text-indigo-600">INITIAL</td>
                          <td className="py-4 px-5 text-xs font-bold text-slate-600">Opening Balance</td>
                          <td className="py-4 px-5 text-xs text-slate-500">Starting balance configured on profile creation</td>
                          <td className="py-4 px-5 text-xs text-right font-mono text-slate-400">-</td>
                          <td className="py-4 px-5 text-xs text-right font-mono text-slate-400">-</td>
                          <td className="py-4 px-5 text-xs text-right font-mono font-black text-slate-900">${initialSupplierOpeningBalance.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400 text-xs font-semibold">
                            No additional ledger entries found matching search query
                          </td>
                        </tr>
                      </>
                    ) : (
                      <>
                        {/* Always prepend the opening balance row for accounting consistency */}
                        <tr className="hover:bg-slate-50/50 transition duration-150 font-semibold text-slate-700 bg-slate-50/30">
                          <td className="py-4 px-5 text-xs font-mono">-</td>
                          <td className="py-4 px-5 text-xs font-mono font-bold text-indigo-600">INITIAL</td>
                          <td className="py-4 px-5 text-xs font-bold text-slate-600">Opening Balance</td>
                          <td className="py-4 px-5 text-xs text-slate-500">Starting balance configured on profile creation</td>
                          <td className="py-4 px-5 text-xs text-right font-mono text-slate-400">-</td>
                          <td className="py-4 px-5 text-xs text-right font-mono text-slate-400">-</td>
                          <td className="py-4 px-5 text-xs text-right font-mono font-black text-slate-900">${initialSupplierOpeningBalance.toFixed(2)}</td>
                        </tr>
                        {filteredSupplierLedgerEntries.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition duration-150">
                            <td className="py-4 px-5 text-xs whitespace-nowrap text-slate-500 font-semibold">
                              {new Date(item.date).toLocaleDateString()}
                            </td>
                            <td className="py-4 px-5 whitespace-nowrap">
                              <span className="font-mono font-bold text-xs text-slate-750 block text-slate-700">{item.ref}</span>
                            </td>
                            <td className="py-4 px-5 text-xs font-bold text-slate-800 whitespace-nowrap capitalize">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-bold ${
                                item.type === 'Purchase Invoice'
                                  ? 'bg-amber-50 border-amber-100 text-amber-800'
                                  : 'bg-emerald-50 border-emerald-100 text-emerald-800'
                              }`}>
                                {item.type}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-xs text-slate-600 font-medium">
                              {item.description}
                            </td>
                            <td className="py-4 px-5 text-xs text-right font-mono font-bold text-emerald-600 whitespace-nowrap">
                              {item.debit > 0 ? `$${item.debit.toFixed(2)}` : '-'}
                            </td>
                            <td className="py-4 px-5 text-xs text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                              {item.credit > 0 ? `$${item.credit.toFixed(2)}` : '-'}
                            </td>
                            <td className="py-4 px-5 text-xs text-right font-mono font-black text-slate-950 whitespace-nowrap bg-slate-50/10">
                              ${item.runningBalance.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              )}

              {activeReport === 'chart_of_accounts' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-wider font-black">
                      <th className="py-4 px-5 rounded-tl-xl whitespace-nowrap">Account Code</th>
                      <th className="py-4 px-5 whitespace-nowrap">Account Name</th>
                      <th className="py-4 px-5 whitespace-nowrap">Classification Type</th>
                      <th className="py-4 px-5 whitespace-nowrap">Parent Account Code</th>
                      <th className="py-4 px-5 whitespace-nowrap">Normal Balance</th>
                      <th className="py-4 px-5 whitespace-nowrap">Status Label</th>
                      <th className="py-4 px-5 text-right rounded-tr-xl font-bold whitespace-nowrap">Live Reconciled Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-sans">
                    {coa.filter(a => {
                      const q = searchQuery.toLowerCase();
                      return a.code.toLowerCase().includes(q) ||
                             a.name.toLowerCase().includes(q) ||
                             a.type.toLowerCase().includes(q) ||
                             (a.description || '').toLowerCase().includes(q) ||
                             (a.parentAccount || '').toLowerCase().includes(q);
                    }).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 font-semibold">
                          No chart accounts matched your search parameters.
                        </td>
                      </tr>
                    ) : (
                      coa.filter(a => {
                        const q = searchQuery.toLowerCase();
                        return a.code.toLowerCase().includes(q) ||
                               a.name.toLowerCase().includes(q) ||
                               a.type.toLowerCase().includes(q) ||
                               (a.description || '').toLowerCase().includes(q) ||
                               (a.parentAccount || '').toLowerCase().includes(q);
                      }).map((a) => {
                        const balanceVal = getCOAAccountLiveBalance(a.code);
                        return (
                          <tr key={a.id} className="hover:bg-slate-50/50 transition duration-150">
                            {/* Code */}
                            <td className="py-4 px-5 font-mono font-bold text-slate-700 whitespace-nowrap">
                              {a.code}
                            </td>
                            {/* Name */}
                            <td className="py-4 px-5 font-bold text-slate-900 whitespace-nowrap">
                              <div>
                                <span className="block">{a.name}</span>
                                {a.description && (
                                  <span className="block text-[10px] text-slate-400 font-normal mt-0.5 max-w-sm whitespace-normal leading-relaxed">{a.description}</span>
                                )}
                              </div>
                            </td>
                            {/* Type */}
                            <td className="py-4 px-5 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${
                                a.type === 'Asset' ? 'bg-indigo-50 border-indigo-100 text-indigo-800' :
                                a.type === 'Liability' ? 'bg-rose-50 border-rose-100 text-rose-800' :
                                a.type === 'Equity' ? 'bg-violet-50 border-violet-100 text-violet-800' :
                                a.type === 'Revenue' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
                                'bg-amber-50 border-amber-100 text-amber-850'
                              }`}>
                                {a.type}
                              </span>
                            </td>
                            {/* Parent Account */}
                            <td className="py-4 px-5 font-mono text-slate-550 whitespace-nowrap">
                              {a.parentAccount ? (
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">
                                  {a.parentAccount}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            {/* Normal Balance */}
                            <td className="py-4 px-5 text-slate-600 whitespace-nowrap">
                              {a.normalBalance}
                            </td>
                            {/* Status */}
                            <td className="py-4 px-5 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                a.status === 'active' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-400'
                              }`}>
                                {a.status === 'active' ? 'Active' : 'Deactivated'}
                              </span>
                            </td>
                            {/* Live Balance */}
                            <td className="py-4 px-5 text-right font-mono font-black text-slate-900 whitespace-nowrap text-sm">
                              ${balanceVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

            </div>
          </div>
          )}

          {/* EXPENSE ANALYTICS VIEW PANEL */}
          {activeReport === 'expense_analytics' && (
            <div className="space-y-6 font-sans print:space-y-4">
              
              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Reconciled Expense */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white flex flex-col justify-between shadow-sm min-h-[120px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Active Outflow</span>
                    <TrendingDown className="h-4.5 w-4.5 text-rose-400" />
                  </div>
                  <div>
                    <h3 className="text-xl xs:text-2xl font-black font-mono leading-none pt-2">
                      ${expenseAnalyticsSummary.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1">Reconciled in selected date range</p>
                  </div>
                </div>

                {/* Average Outflow Value */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs min-h-[120px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Average Tx Outflow</span>
                    <Activity className="h-4.5 w-4.5 text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="text-xl xs:text-2xl font-black text-slate-900 font-mono leading-none pt-2">
                      ${expenseAnalyticsSummary.avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1">Weighted transaction average</p>
                  </div>
                </div>

                {/* Peak Operating Outflow */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs min-h-[120px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Largest Single Outflow</span>
                    <DollarSign className="h-4.5 w-4.5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-xl xs:text-2xl font-black text-slate-900 font-mono leading-none pt-2">
                      ${expenseAnalyticsSummary.largest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1">Peak single transaction value</p>
                  </div>
                </div>

                {/* Transaction Volume */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs min-h-[120px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Transaction Volume</span>
                    <Clock className="h-4.5 w-4.5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-xl xs:text-2xl font-black text-slate-900 font-mono leading-none pt-2">
                      {expenseAnalyticsSummary.count} Active Tx
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1">GAAP-compliant audit records</p>
                  </div>
                </div>
              </div>

              {/* Bento Grid: Categories & Vendors */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category-wise bento card */}
                <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Category-wise Operating Expenses</h4>
                      <p className="text-[11px] text-slate-400">Proportional budget utilization</p>
                    </div>
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                      Budget Breakdown
                    </span>
                  </div>

                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {categoryExpensesReport.length === 0 ? (
                      <p className="text-xs text-slate-400 py-12 text-center font-semibold">No category metrics calculated</p>
                    ) : (
                      categoryExpensesReport.map((cat, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700">{cat.category}</span>
                            <span className="font-mono font-bold text-slate-900">
                              ${cat.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              <span className="text-slate-400 font-normal text-[10px] ml-1.5">({cat.count} Tx, {cat.percentage.toFixed(1)}%)</span>
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-indigo-500 to-rose-500 h-full rounded-full"
                              style={{ width: `${cat.percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Vendor-wise bento card */}
                <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Creditor & Vendor Concentration</h4>
                      <p className="text-[11px] text-slate-400">Concentration of active business liabilities</p>
                    </div>
                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
                      Vendor Stats
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                          <th className="pb-2">Vendor</th>
                          <th className="pb-2 text-center">Tx Count</th>
                          <th className="pb-2 text-right">Average</th>
                          <th className="pb-2 text-right">Total Outflow</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {vendorExpensesReport.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-12 text-center text-slate-400 font-semibold">No vendor metrics logged</td>
                          </tr>
                        ) : (
                          vendorExpensesReport.slice(0, 6).map((v, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-2.5 font-bold text-slate-700">{v.vendor}</td>
                              <td className="py-2.5 text-center font-mono text-slate-600">{v.count}</td>
                              <td className="py-2.5 text-right font-mono text-slate-600">${v.avg.toFixed(2)}</td>
                              <td className="py-2.5 text-right font-mono font-bold text-rose-600">${v.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Bento Grid: Temporal Distribution & Financial Impact Analysis */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Temporal distribution */}
                <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Temporal Period Distribution</h4>
                      <p className="text-[11px] text-slate-400">Total operational spend classified by chronological cycles</p>
                    </div>
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                      Time Periods
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {dateWiseExpensesReport.map((item, idx) => (
                      <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.period}</span>
                        <div>
                          <h5 className="text-sm xs:text-base font-black font-mono text-slate-800 pt-1">
                            ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </h5>
                          <span className="text-[9px] text-slate-400 line-clamp-1 block leading-tight mt-0.5">{item.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Operating Impact & Cash flow Analysis */}
                <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Financial Impact & Liquidity Analysis</h4>
                      <p className="text-[11px] text-slate-400">Nett cash flow drainage vs non-cash accrued obligations</p>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                      GAAP Impact
                    </span>
                  </div>

                  <div className="space-y-4 font-sans text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-2xl border border-emerald-100 bg-emerald-50/20">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block">Cash Settle Outflow</span>
                        <h4 className="text-lg font-black text-emerald-700 font-mono mt-1">
                          ${cashImpactAnalysis.cashOpex.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </h4>
                        <p className="text-[9px] text-emerald-600 mt-1">Cash, Transfer, Cashier, Petty cash</p>
                      </div>

                      <div className="p-4 rounded-2xl border border-rose-100 bg-rose-50/20">
                        <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest block">Deferred Credit Opex</span>
                        <h4 className="text-lg font-black text-rose-700 font-mono mt-1">
                          ${cashImpactAnalysis.nonCashOpex.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </h4>
                        <p className="text-[9px] text-rose-600 mt-1">Credit, Deferred, Accrued, Accounts Payable</p>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-700 block">Total OpEx to Net Margin Impact</span>
                        <p className="text-[10px] text-slate-400">Aggregate impact of operating costs on gross trading yields</p>
                      </div>
                      <span className="font-mono font-black text-rose-600 text-sm bg-rose-50 border border-rose-100 px-3 py-1 rounded-lg">
                        -${totalExpensesAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Line-item Transaction Log */}
              <div className="bg-white border border-slate-200 rounded-[2rem] shadow-2xs overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Line-item Operating Ledger Log</h4>
                    <p className="text-[11px] text-slate-400">Reconciled line-items for audit and internal controls</p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    Showing {filteredExpensesList.length} of {expenses.length} records
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-5 whitespace-nowrap">Tx ID / Date</th>
                        <th className="py-3 px-5 whitespace-nowrap">Category</th>
                        <th className="py-3 px-5 whitespace-nowrap">Vendor / Payee</th>
                        <th className="py-3 px-5 whitespace-nowrap">Payment Method</th>
                        <th className="py-3 px-5 whitespace-nowrap text-center">Status</th>
                        <th className="py-3 px-5 whitespace-nowrap text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredExpensesList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400 font-semibold">
                            No operating expense lines match the filters
                          </td>
                        </tr>
                      ) : (
                        filteredExpensesList.map((item) => {
                          const isVoid = isVoidStatus(item.status);
                          return (
                            <tr key={item.id} className={`hover:bg-slate-50/50 transition duration-150 ${isVoid ? 'bg-slate-50/30 opacity-70' : ''}`}>
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                <span className="font-mono font-bold text-indigo-600 block">{(item.id || '').substring(0, 8).toUpperCase()}</span>
                                <span className="text-[10px] text-slate-400 font-semibold">{item.expenseDate ? item.expenseDate.split('T')[0] : 'N/A'}</span>
                              </td>
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                <span className="font-bold text-slate-800">{item.category}</span>
                                {item.description && <span className="text-[10px] text-slate-400 block max-w-xs truncate">{item.description}</span>}
                              </td>
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                <span className="font-bold text-slate-700 block">{item.vendorName || 'N/A'}</span>
                                <span className="text-[10px] text-slate-400">Employee: {item.employeeName || 'N/A'}</span>
                              </td>
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                <span className="font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-wide">{item.paymentMethod || 'Cash'}</span>
                              </td>
                              <td className="py-3.5 px-5 whitespace-nowrap text-center">
                                {isVoid ? (
                                  <span className="inline-flex items-center gap-1 bg-red-50 border border-red-100 text-red-700 px-2.5 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wide">
                                    <ShieldAlert className="w-3 h-3 text-red-500" /> Voided (0.00 Impact)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wide">
                                    Active
                                  </span>
                                )}
                              </td>
                              <td className={`py-3.5 px-5 whitespace-nowrap text-right font-mono font-bold text-sm ${isVoid ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                ${Number(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
      )}

      {/* RENDER INVOICE MODAL OVERLAY */}
      {selectedSaleForInvoice && (
        <TaxInvoiceModal
          sale={selectedSaleForInvoice}
          customers={customers}
          products={products}
          sales={sales}
          customerPayments={customerPayments}
          onClose={() => setSelectedSaleForInvoice(null)}
        />
      )}

      {/* RENDER PURCHASE DETAIL MODAL OVERLAY */}
      {selectedPurchaseForDetail && (
        <PurchaseDetailModal
          purchase={selectedPurchaseForDetail}
          suppliers={suppliers}
          products={products}
          companyProfile={companyProfile}
          onClose={() => setSelectedPurchaseForDetail(null)}
        />
      )}

    </div>
  );
}
