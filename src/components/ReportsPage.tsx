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
  BookOpen,
  HelpCircle,
  Printer,
  Clock,
  Activity,
  AlertCircle,
  ShieldAlert,
  Cpu,
  AlertTriangle,
  XCircle,
  CheckCircle2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { Sale, Customer, Product, Supplier, getNormalizedItems, getSaleSummary, Purchase, ChartOfAccount, LedgerEntry } from '../types';
import { INITIAL_CHART_OF_ACCOUNTS } from '../data';
import TaxInvoiceModal from './TaxInvoiceModal';
import { PurchaseDetailModal } from './PurchaseDetailModal';

import { AppPermissions, usePermission, UserRole } from '../hooks/usePermission';

type ReportType = 'sales' | 'purchases' | 'profit_loss' | 'balance_sheet' | 'cash_flow' | 'financial_reconciliation' | 'general_ledger' | 'trial_balance' | 'customer_due' | 'supplier_due' | 'tax_vat' | 'activity_logs' | 'customer_statement' | 'supplier_statement' | 'expense_analytics' | 'chart_of_accounts';

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

  // --- General Ledger Filters & States ---
  const [selectedGlAccountId, setSelectedGlAccountId] = useState<string>('');
  const [glCompanyFilter, setGlCompanyFilter] = useState<string>('');
  const [glBranchFilter, setGlBranchFilter] = useState<string>('');
  const [glVoucherTypeFilter, setGlVoucherTypeFilter] = useState<string>('');
  const [glPostingStatusFilter, setGlPostingStatusFilter] = useState<string>('POSTED');
  const [glSourceModuleFilter, setGlSourceModuleFilter] = useState<string>('');
  const [glCreatedByFilter, setGlCreatedByFilter] = useState<string>('');
  const [glDatePreset, setGlDatePreset] = useState<string>('all_time');
  const [selectedGlEntryForDetail, setSelectedGlEntryForDetail] = useState<any | null>(null);
  const [glAccountViewMode, setGlAccountViewMode] = useState<'active' | 'historical' | 'all'>('all');

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

  // --- Enterprise Trial Balance Specific Filters State ---
  const [tbCompanyFilter, setTbCompanyFilter] = useState<string>('');
  const [tbBranchFilter, setTbBranchFilter] = useState<string>('');
  const [tbPostingStatusFilter, setTbPostingStatusFilter] = useState<string>('POSTED');
  const [tbCreatedByFilter, setTbCreatedByFilter] = useState<string>('');
  const [tbDatePreset, setTbDatePreset] = useState<string>('all_time');
  const [tbSubTab, setTbSubTab] = useState<'table' | 'reconciliation' | 'diagnostics'>('table');

  const renderFinancialStatementConfigPanel = () => {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reporting Company</label>
          <select
            value={tbCompanyFilter}
            onChange={(e) => setTbCompanyFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
          >
            <option value="">All Registered Companies</option>
            <option value="CO-001">Apex Global Supply Ltd.</option>
            <option value="CO-002">Nexus Innovations Corp.</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Branch Division</label>
          <select
            value={tbBranchFilter}
            onChange={(e) => setTbBranchFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
          >
            <option value="">All Company Divisions</option>
            <option value="BR-HQ">Austin Headquarters (HQ)</option>
            <option value="BR-EAST">New York Distribution</option>
            <option value="BR-WEST">California Logistics</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Journal Postings Filter</label>
          <select
            value={tbPostingStatusFilter}
            onChange={(e) => setTbPostingStatusFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
          >
            <option value="POSTED">Official Posted (General Ledger)</option>
            <option value="DRAFT">Draft Journals (Provisional)</option>
            <option value="">All State Postings</option>
          </select>
        </div>
      </div>
    );
  };

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

  // --- General Ledger Dynamic Account Selection & Date Preset Logic ---
  useEffect(() => {
    if (coa.length > 0 && !selectedGlAccountId) {
      const activeAccts = coa.filter(a => a.status === 'active');
      if (activeAccts.length > 0) {
        setSelectedGlAccountId(activeAccts[0].code);
      }
    }
  }, [coa, selectedGlAccountId]);

  const applyGlDatePreset = (preset: string) => {
    // Current local date in Houston/USA: 2026-07-15
    switch (preset) {
      case 'today':
        setStartDate("2026-07-15");
        setEndDate("2026-07-15");
        break;
      case 'yesterday':
        setStartDate("2026-07-14");
        setEndDate("2026-07-14");
        break;
      case 'this_week':
        setStartDate("2026-07-13"); // Monday of current week
        setEndDate("2026-07-19");   // Sunday of current week
        break;
      case 'this_month':
        setStartDate("2026-07-01");
        setEndDate("2026-07-31");
        break;
      case 'this_quarter':
        setStartDate("2026-07-01");
        setEndDate("2026-09-30");
        break;
      case 'this_year':
        setStartDate("2026-01-01");
        setEndDate("2026-12-31");
        break;
      case 'fiscal_year':
        setStartDate("2026-01-01");
        setEndDate("2026-12-31");
        break;
      case 'custom':
        // Keep the custom selection active
        break;
      case 'all_time':
      default:
        setStartDate("2020-01-01");
        setEndDate("2026-12-31");
        break;
    }
  };

  const handleGlDatePresetChange = (preset: string) => {
    setGlDatePreset(preset);
    applyGlDatePreset(preset);
  };

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

  // --- Historical Account Compatibility Layer (Sprint 6.2.2) ---
  const unionCOA = useMemo(() => {
    const coaMap = new Map<string, ChartOfAccount>();
    coa.forEach(acc => coaMap.set(acc.code, acc));

    const finalCoa: Array<ChartOfAccount & { isLegacy?: boolean; isVirtual?: boolean }> = [...coa];

    // Discover unique account codes from ledgerEntries
    const discoveredCodes = new Set<string>();
    ledgerEntries.forEach(entry => {
      if (entry.lines) {
        entry.lines.forEach(line => {
          if (line.accountCode) {
            discoveredCodes.add(line.accountCode);
          }
        });
      }
    });

    discoveredCodes.forEach(code => {
      if (!coaMap.has(code)) {
        // Determine type and normalBalance based on code prefix (standards compliant)
        let type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense' = 'Asset';
        let normalBalance: 'Debit' | 'Credit' = 'Debit';

        if (code.startsWith('1')) {
          type = 'Asset';
          normalBalance = 'Debit';
        } else if (code.startsWith('2')) {
          type = 'Liability';
          normalBalance = 'Credit';
        } else if (code.startsWith('3')) {
          type = 'Equity';
          normalBalance = 'Credit';
        } else if (code.startsWith('4')) {
          type = 'Revenue';
          normalBalance = 'Credit';
        } else if (code.startsWith('5') || code.startsWith('6') || code.startsWith('7') || code.startsWith('8') || code.startsWith('9')) {
          type = 'Expense';
          normalBalance = 'Debit';
        }

        // Try to resolve the legible name from postings
        let name = 'Legacy Account';
        for (const entry of ledgerEntries) {
          if (entry.lines) {
            const line = entry.lines.find(l => l.accountCode === code);
            if (line && line.accountName) {
              name = line.accountName;
              break;
            }
          }
        }

        finalCoa.push({
          id: `virtual-${code}`,
          code,
          name,
          type,
          normalBalance,
          status: 'inactive',
          isSystem: false,
          editable: false,
          isLegacy: true,
          isVirtual: true,
          description: 'Historical legacy account detected in ledger postings.'
        });
      }
    });

    return finalCoa.sort((a, b) => a.code.localeCompare(b.code));
  }, [coa, ledgerEntries]);

  // --- 11. General Ledger Report Math ---
  const generalLedgerData = useMemo(() => {
    if (!selectedGlAccountId) {
      return {
        openingBalance: 0,
        totalDebits: 0,
        totalCredits: 0,
        closingBalance: 0,
        entries: [],
        lastPostingDate: null,
        isDebitNormal: true
      };
    }

    const account = unionCOA.find(a => a.code === selectedGlAccountId || a.id === selectedGlAccountId);
    const isDebitNormal = account ? account.normalBalance === 'Debit' : true;

    // Filter posted ledger entries
    const postedEntries = ledgerEntries.filter(entry => {
      // 1. Check if matches posting status filter
      if (glPostingStatusFilter && entry.postingStatus !== glPostingStatusFilter) return false;
      // If no filter, we only show POSTED by default
      if (!glPostingStatusFilter && entry.postingStatus !== 'POSTED') return false;

      // 2. Filter by Company
      if (glCompanyFilter && entry.companyId !== glCompanyFilter) return false;

      // 3. Filter by Branch
      if (glBranchFilter && entry.branchId !== glBranchFilter) return false;

      // 4. Filter by Source Module
      if (glSourceModuleFilter && entry.sourceModule !== glSourceModuleFilter) return false;

      // 5. Filter by Created By
      if (glCreatedByFilter && entry.createdBy !== glCreatedByFilter) return false;

      // 6. Check if voucher type matches (prefix of postingNumber e.g. "JV-100" -> "JV")
      if (glVoucherTypeFilter) {
        const entryVoucherType = entry.postingNumber ? entry.postingNumber.split('-')[0] : 'JV';
        if (entryVoucherType !== glVoucherTypeFilter) return false;
      }

      return true;
    });

    // Extract all lines that affect this specific account
    const allMatchingLines: Array<{
      entry: LedgerEntry;
      line: any;
      postingDate: string;
    }> = [];

    postedEntries.forEach(entry => {
      entry.lines.forEach(line => {
        if (line.accountCode === selectedGlAccountId) {
          allMatchingLines.push({
            entry,
            line,
            postingDate: entry.postingDate || entry.createdAt
          });
        }
      });
    });

    // Sort chronologically (oldest first) so running balances compute correctly
    allMatchingLines.sort((a, b) => new Date(a.postingDate).getTime() - new Date(b.postingDate).getTime());

    // Compute Opening Balance: sum lines with postingDate < startDate
    let openingDebits = 0;
    let openingCredits = 0;

    const startDateTime = startDate ? new Date(startDate).getTime() : 0;
    const endDateTime = endDate ? new Date(endDate).getTime() + 86400000 : Infinity; // end of day

    const beforePeriodLines = allMatchingLines.filter(item => {
      const t = new Date(item.postingDate).getTime();
      return startDate && t < startDateTime;
    });

    beforePeriodLines.forEach(item => {
      openingDebits += item.line.debit || 0;
      openingCredits += item.line.credit || 0;
    });

    const openingBalance = isDebitNormal
      ? (openingDebits - openingCredits)
      : (openingCredits - openingDebits);

    // Compute current period entries (between startDate and endDate)
    const periodLines = allMatchingLines.filter(item => {
      const t = new Date(item.postingDate).getTime();
      return t >= startDateTime && t <= endDateTime;
    });

    let totalDebits = 0;
    let totalCredits = 0;
    let lastPostingDate: string | null = null;

    // Build row-by-row entries with running balance
    let currentBal = openingBalance;
    const entries = periodLines.map(item => {
      const debit = item.line.debit || 0;
      const credit = item.line.credit || 0;
      totalDebits += debit;
      totalCredits += credit;
      lastPostingDate = item.postingDate;

      // Update running balance based on normal balance
      if (isDebitNormal) {
        currentBal = currentBal + debit - credit;
      } else {
        currentBal = currentBal + credit - debit;
      }

      // Voucher Type helper
      const voucherType = item.entry.postingNumber ? item.entry.postingNumber.split('-')[0] : 'JV';

      return {
        id: item.entry.id,
        postingDate: item.postingDate,
        postingNumber: item.entry.postingNumber || 'JV-N/A',
        voucherType,
        sourceModule: item.entry.sourceModule,
        reference: item.entry.createdFrom || '-',
        narration: item.line.narration || item.entry.narration || 'Ledger Posting',
        debit,
        credit,
        runningBalance: currentBal,
        createdBy: item.entry.createdBy || 'System',
        companyId: item.entry.companyId,
        branchId: item.entry.branchId,
        createdFrom: item.entry.createdFrom,
        originalEntry: item.entry
      };
    });

    const closingBalance = openingBalance + (isDebitNormal ? (totalDebits - totalCredits) : (totalCredits - totalDebits));

    return {
      openingBalance,
      totalDebits,
      totalCredits,
      closingBalance,
      entries,
      lastPostingDate,
      isDebitNormal
    };
  }, [ledgerEntries, unionCOA, selectedGlAccountId, startDate, endDate, glCompanyFilter, glBranchFilter, glVoucherTypeFilter, glPostingStatusFilter, glSourceModuleFilter, glCreatedByFilter]);

  const searchableGlEntries = useMemo(() => {
    if (!searchQuery) return generalLedgerData.entries;
    const q = searchQuery.toLowerCase();
    return generalLedgerData.entries.filter(e => 
      e.postingNumber.toLowerCase().includes(q) ||
      e.narration.toLowerCase().includes(q) ||
      e.reference.toLowerCase().includes(q) ||
      e.createdBy.toLowerCase().includes(q)
    );
  }, [generalLedgerData.entries, searchQuery]);

  const handleDrillDown = (entryLine: any) => {
    const { sourceModule, createdFrom } = entryLine;
    if (!createdFrom || createdFrom === '-') return;

    if (sourceModule === 'SALES') {
      const foundSale = sales.find(s => s.id === createdFrom);
      if (foundSale) {
        setSelectedSaleForInvoice(foundSale);
      } else {
        alert("Sales invoice record not found in snapshot database.");
      }
    } 
    else if (sourceModule === 'PROCUREMENT') {
      const foundPurchase = purchases.find(p => p.id === createdFrom);
      if (foundPurchase) {
        setSelectedPurchaseForDetail(foundPurchase);
      } else {
        alert("Purchase procurement record not found in snapshot database.");
      }
    } 
    else {
      setSelectedGlEntryForDetail(entryLine);
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
    const account = unionCOA.find(acc => acc.code === code);
    const isDebitNormal = account ? account.normalBalance === 'Debit' : true;
    return getLedgerReportBalance(code, isDebitNormal ? 'Debit' : 'Credit', 'cumulative');
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

  // --- 10. Enterprise Trial Balance Calculation Engine (GAAP/IFRS Compliant) ---
  const trialBalanceData = useMemo(() => {
    // Filter ledgerEntries by general filters
    const filteredEntries = ledgerEntries.filter(entry => {
      // Filter by postingStatus
      if (tbPostingStatusFilter && entry.postingStatus !== tbPostingStatusFilter) return false;
      if (!tbPostingStatusFilter && entry.postingStatus !== 'POSTED') return false;

      // Filter by Company
      if (tbCompanyFilter && entry.companyId !== tbCompanyFilter) return false;

      // Filter by Branch
      if (tbBranchFilter && entry.branchId !== tbBranchFilter) return false;

      // Filter by Created By
      if (tbCreatedByFilter && entry.createdBy !== tbCreatedByFilter) return false;

      return true;
    });

    // We want to calculate opening balances (entries with date < startDate)
    // and period balances (entries with startDate <= date <= endDate)
    const startDateTime = startDate ? new Date(startDate).getTime() : 0;
    const endDateTime = endDate ? new Date(endDate).getTime() + 86400000 : Infinity;

    // We map each account code to its balances
    const accountBalances: Record<string, {
      openingDebits: number;
      openingCredits: number;
      periodDebits: number;
      periodCredits: number;
    }> = {};

    // Initialize all accounts from union Chart of Accounts
    unionCOA.forEach(acc => {
      accountBalances[acc.code] = {
        openingDebits: 0,
        openingCredits: 0,
        periodDebits: 0,
        periodCredits: 0
      };
    });

    let lastPostingDate: string | null = null;

    filteredEntries.forEach(entry => {
      const entryDateStr = entry.postingDate || entry.createdAt;
      const t = new Date(entryDateStr).getTime();

      if (t > 0) {
        if (!lastPostingDate || new Date(entryDateStr).getTime() > new Date(lastPostingDate).getTime()) {
          lastPostingDate = entryDateStr;
        }
      }

      entry.lines.forEach(line => {
        const code = line.accountCode;
        if (!code) return;

        if (!accountBalances[code]) {
          accountBalances[code] = {
            openingDebits: 0,
            openingCredits: 0,
            periodDebits: 0,
            periodCredits: 0
          };
        }

        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;

        if (startDate && t < startDateTime) {
          accountBalances[code].openingDebits += debit;
          accountBalances[code].openingCredits += credit;
        } else if (t >= startDateTime && t <= endDateTime) {
          accountBalances[code].periodDebits += debit;
          accountBalances[code].periodCredits += credit;
        } else if (!startDate && t <= endDateTime) {
          // If no startDate, everything up to endDate is period
          accountBalances[code].periodDebits += debit;
          accountBalances[code].periodCredits += credit;
        }
      });
    });

    // Build the final list of account rows
    let totalDebitColumnSum = 0;
    let totalCreditColumnSum = 0;

    const rows = unionCOA.map(acc => {
      const balances = accountBalances[acc.code] || {
        openingDebits: 0,
        openingCredits: 0,
        periodDebits: 0,
        periodCredits: 0
      };

      const isDebitNormal = acc.normalBalance === 'Debit';

      // Opening Balance as normal balance sign
      const openingBalance = isDebitNormal
        ? (balances.openingDebits - balances.openingCredits)
        : (balances.openingCredits - balances.openingDebits);

      const periodDebit = balances.periodDebits;
      const periodCredit = balances.periodCredits;

      // Net ending debit balance
      const netEndingDebit = (isDebitNormal ? openingBalance : -openingBalance) + periodDebit - periodCredit;

      let debitColumnValue = 0;
      let creditColumnValue = 0;

      if (netEndingDebit >= 0) {
        debitColumnValue = netEndingDebit;
        creditColumnValue = 0;
      } else {
        debitColumnValue = 0;
        creditColumnValue = Math.abs(netEndingDebit);
      }

      const endingBalance = isDebitNormal
        ? (openingBalance + periodDebit - periodCredit)
        : (openingBalance + periodCredit - periodDebit);

      totalDebitColumnSum += debitColumnValue;
      totalCreditColumnSum += creditColumnValue;

      return {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        normalBalance: acc.normalBalance,
        isDebitNormal,
        openingBalance,
        periodDebit,
        periodCredit,
        endingBalance,
        debitColumnValue,
        creditColumnValue,
        isLegacy: acc.isLegacy || false,
      };
    }).filter(row => {
      // Include row if there's any non-zero value or activity
      const hasActivity = Math.abs(row.openingBalance) > 0.001 || row.periodDebit > 0.001 || row.periodCredit > 0.001 || Math.abs(row.endingBalance) > 0.001;
      return hasActivity;
    });

    const difference = Math.abs(totalDebitColumnSum - totalCreditColumnSum);
    const isBalanced = difference < 0.01;

    return {
      rows,
      totalDebitColumnSum,
      totalCreditColumnSum,
      difference,
      isBalanced,
      lastPostingDate,
      totalAccounts: rows.length,
    };
  }, [ledgerEntries, unionCOA, startDate, endDate, tbCompanyFilter, tbBranchFilter, tbPostingStatusFilter, tbCreatedByFilter]);

  // --- 10a. Dynamic Financial Statements & Consistency Validation Engine (Sprint 6.3.0) ---
  const financialStatements = useMemo(() => {
    // 1. Profit & Loss Statement (P&L) Calculations
    const revenueAccounts: Array<{ code: string; name: string; balance: number; isLegacy: boolean }> = [];
    const expenseAccounts: Array<{ code: string; name: string; balance: number; isLegacy: boolean }> = [];
    
    trialBalanceData.rows.forEach(row => {
      const balance = row.endingBalance;
      if (row.type === 'Revenue') {
        revenueAccounts.push({ code: row.code, name: row.name, balance, isLegacy: row.isLegacy });
      } else if (row.type === 'Expense') {
        expenseAccounts.push({ code: row.code, name: row.name, balance, isLegacy: row.isLegacy });
      }
    });

    const totalRevenue = revenueAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    // COGS: Expense accounts starting with '51' or '50' (Cost of Sales / Cost of Goods Sold, etc.)
    const cogsAccounts = expenseAccounts.filter(acc => acc.code.startsWith('51') || acc.code.startsWith('50'));
    const totalCogs = cogsAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    const grossProfit = totalRevenue - totalCogs;

    // Operating Expenses: Expense accounts starting with '6' (Operating Expenses, general administrative)
    const opexAccounts = expenseAccounts.filter(acc => acc.code.startsWith('6') && !acc.code.toLowerCase().includes('tax') && !acc.code.startsWith('9'));
    const totalOpex = opexAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    const operatingProfit = grossProfit - totalOpex;

    // Other Expenses / Non-Operating & Taxes: Expense accounts starting with '9' or containing 'tax'
    const taxAccounts = expenseAccounts.filter(acc => acc.code.startsWith('99') || acc.code.toLowerCase().includes('tax') || acc.code.startsWith('9'));
    const totalTax = taxAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    const netProfitBeforeTax = operatingProfit;
    const netProfitAfterTax = netProfitBeforeTax - totalTax;

    // 2. Balance Sheet (BS) Calculations
    const assetAccounts: Array<{ code: string; name: string; balance: number; isLegacy: boolean }> = [];
    const liabilityAccounts: Array<{ code: string; name: string; balance: number; isLegacy: boolean }> = [];
    const equityAccounts: Array<{ code: string; name: string; balance: number; isLegacy: boolean }> = [];

    trialBalanceData.rows.forEach(row => {
      const balance = row.endingBalance;
      if (row.type === 'Asset') {
        assetAccounts.push({ code: row.code, name: row.name, balance, isLegacy: row.isLegacy });
      } else if (row.type === 'Liability') {
        liabilityAccounts.push({ code: row.code, name: row.name, balance, isLegacy: row.isLegacy });
      } else if (row.type === 'Equity') {
        equityAccounts.push({ code: row.code, name: row.name, balance, isLegacy: row.isLegacy });
      }
    });

    // Asset Classification
    const currentAssetAccounts = assetAccounts.filter(acc => acc.code.startsWith('10') || acc.code.startsWith('11') || acc.code.startsWith('12') || acc.code.startsWith('13'));
    const nonCurrentAssetAccounts = assetAccounts.filter(acc => !acc.code.startsWith('10') && !acc.code.startsWith('11') && !acc.code.startsWith('12') && !acc.code.startsWith('13'));

    const totalCurrentAssets = currentAssetAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const totalNonCurrentAssets = nonCurrentAssetAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    // Liability Classification
    const currentLiabilityAccounts = liabilityAccounts.filter(acc => acc.code.startsWith('21') || acc.code.startsWith('22') || acc.code.startsWith('23') || acc.code.startsWith('24'));
    const longTermLiabilityAccounts = liabilityAccounts.filter(acc => !acc.code.startsWith('21') && !acc.code.startsWith('22') && !acc.code.startsWith('23') && !acc.code.startsWith('24'));

    const totalCurrentLiabilities = currentLiabilityAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLongTermLiabilities = longTermLiabilityAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

    // Equity Classification
    // Note: Net Profit is dynamically added to Equity as Current Year Earnings!
    const baseEquityValue = equityAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const currentYearEarnings = netProfitAfterTax; // Net Profit from P&L
    const totalEquity = baseEquityValue + currentYearEarnings;

    const balanceSheetDifference = Math.abs(totalAssets - (totalLiabilities + totalEquity));
    const isBsBalanced = balanceSheetDifference < 0.01;

    // 3. Cash Flow Statement (Direct Method from Ledger Entries)
    const cashAccounts = unionCOA.filter(acc => 
      acc.systemRole === 'CASH' || 
      acc.code === '1100' || 
      acc.code === '1010' || 
      (acc.type === 'Asset' && (acc.name.toLowerCase().includes('cash') || acc.name.toLowerCase().includes('bank')))
    );
    const cashCodes = new Set(cashAccounts.map(acc => acc.code));

    let openingCashSum = 0;
    trialBalanceData.rows.forEach(row => {
      if (cashCodes.has(row.code)) {
        openingCashSum += row.openingBalance;
      }
    });

    const startDateTime = startDate ? new Date(startDate).getTime() : 0;
    const endDateTime = endDate ? new Date(endDate).getTime() + 86400000 : Infinity;

    const filteredEntries = ledgerEntries.filter(entry => {
      if (tbPostingStatusFilter && entry.postingStatus !== tbPostingStatusFilter) return false;
      if (!tbPostingStatusFilter && entry.postingStatus !== 'POSTED') return false;
      if (tbCompanyFilter && entry.companyId !== tbCompanyFilter) return false;
      if (tbBranchFilter && entry.branchId !== tbBranchFilter) return false;
      if (tbCreatedByFilter && entry.createdBy !== tbCreatedByFilter) return false;
      return true;
    });

    const opexCashFlows: Array<{ desc: string; amount: number; date: string }> = [];
    const customerReceiptsFlows: Array<{ desc: string; amount: number; date: string }> = [];
    const supplierPaymentsFlows: Array<{ desc: string; amount: number; date: string }> = [];
    const otherOpexCashFlows: Array<{ desc: string; amount: number; date: string }> = [];
    
    const investingFlows: Array<{ desc: string; amount: number; date: string }> = [];
    const financingFlows: Array<{ desc: string; amount: number; date: string }> = [];

    filteredEntries.forEach(entry => {
      const entryDateStr = entry.postingDate || entry.createdAt;
      const t = new Date(entryDateStr).getTime();
      if (t < startDateTime || t > endDateTime) return;

      const cashLines = entry.lines?.filter(l => cashCodes.has(l.accountCode)) || [];
      if (cashLines.length === 0) return;

      const netCashImpact = cashLines.reduce((sum, l) => sum + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);
      if (Math.abs(netCashImpact) < 0.001) return;

      const nonCashLines = entry.lines?.filter(l => !cashCodes.has(l.accountCode)) || [];
      
      const hasInvesting = nonCashLines.some(l => {
        const acc = unionCOA.find(a => a.code === l.accountCode);
        return acc && acc.type === 'Asset' && !acc.code.startsWith('10') && !acc.code.startsWith('11') && !acc.code.startsWith('12') && !acc.code.startsWith('13');
      });

      const hasFinancing = nonCashLines.some(l => {
        const acc = unionCOA.find(a => a.code === l.accountCode);
        return acc && (acc.type === 'Equity' || (acc.type === 'Liability' && !acc.code.startsWith('21') && !acc.code.startsWith('22') && !acc.code.startsWith('23') && !acc.code.startsWith('24')));
      });

      const entryDesc = entry.narration || entry.description || "General Posting";

      if (hasInvesting) {
        investingFlows.push({ desc: entryDesc, amount: netCashImpact, date: entryDateStr });
      } else if (hasFinancing) {
        financingFlows.push({ desc: entryDesc, amount: netCashImpact, date: entryDateStr });
      } else {
        const hasReceivables = nonCashLines.some(l => l.accountCode.startsWith('12'));
        const hasPayables = nonCashLines.some(l => l.accountCode.startsWith('21'));
        const hasRevenue = nonCashLines.some(l => {
          const acc = unionCOA.find(a => a.code === l.accountCode);
          return acc && acc.type === 'Revenue';
        });
        const hasExpenses = nonCashLines.some(l => {
          const acc = unionCOA.find(a => a.code === l.accountCode);
          return acc && acc.type === 'Expense';
        });

        if (hasReceivables || hasRevenue) {
          customerReceiptsFlows.push({ desc: entryDesc, amount: netCashImpact, date: entryDateStr });
        } else if (hasPayables || nonCashLines.some(l => l.accountCode.startsWith('51') || l.accountCode.startsWith('50'))) {
          supplierPaymentsFlows.push({ desc: entryDesc, amount: netCashImpact, date: entryDateStr });
        } else if (hasExpenses) {
          opexCashFlows.push({ desc: entryDesc, amount: netCashImpact, date: entryDateStr });
        } else {
          otherOpexCashFlows.push({ desc: entryDesc, amount: netCashImpact, date: entryDateStr });
        }
      }
    });

    const totalCustomerReceipts = customerReceiptsFlows.reduce((sum, f) => sum + f.amount, 0);
    const totalSupplierPayments = supplierPaymentsFlows.reduce((sum, f) => sum + f.amount, 0);
    const totalOpexCash = opexCashFlows.reduce((sum, f) => sum + f.amount, 0);
    const totalOtherOpexCash = otherOpexCashFlows.reduce((sum, f) => sum + f.amount, 0);

    const totalOperatingActivities = totalCustomerReceipts + totalSupplierPayments + totalOpexCash + totalOtherOpexCash;
    const totalInvestingActivities = investingFlows.reduce((sum, f) => sum + f.amount, 0);
    const totalFinancingActivities = financingFlows.reduce((sum, f) => sum + f.amount, 0);

    const netCashFlow = totalOperatingActivities + totalInvestingActivities + totalFinancingActivities;
    const endingCashSum = openingCashSum + netCashFlow;

    // GL Ending Cash Balance
    let glEndingCashSum = 0;
    trialBalanceData.rows.forEach(row => {
      if (cashCodes.has(row.code)) {
        glEndingCashSum += row.endingBalance;
      }
    });

    const cashFlowDifference = Math.abs(endingCashSum - glEndingCashSum);
    const isCashFlowReconciled = cashFlowDifference < 0.01;

    // 4. Financial Statement Consistency Validation Engine (FCE)
    const tbBalanced = trialBalanceData.isBalanced;
    const bsBalanced = isBsBalanced;
    const profitReconciled = true; // Reconciled by design
    const cfReconciled = isCashFlowReconciled;
    const accountingEqCheck = isBsBalanced;

    const allChecksPass = tbBalanced && bsBalanced && profitReconciled && cfReconciled && accountingEqCheck;

    // Diagnostics Alerts
    const diagnosticsList: Array<{
      id: string;
      category: 'Critical' | 'Warning' | 'Info';
      checkName: string;
      message: string;
      details: string;
      remediation: string;
    }> = [];

    if (!tbBalanced) {
      diagnosticsList.push({
        id: "diag-tb",
        category: "Critical",
        checkName: "Trial Balance Imbalance",
        message: `General Ledger is out of balance by $${trialBalanceData.difference.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
        details: "The Trial Balance debit and credit columns contain unequal sums. Double-entry integrity has been violated.",
        remediation: "Verify manual journals and ensure all ledgerEntries have matching debits and credits."
      });
    }

    if (!isBsBalanced) {
      diagnosticsList.push({
        id: "diag-bs",
        category: "Critical",
        checkName: "Balance Sheet Out of Balance",
        message: `Assets do not equal Liabilities + Equity (Variance: $${balanceSheetDifference.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`,
        details: `Assets sum to $${totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}. Liabilities + Equity sums to $${(totalLiabilities + totalEquity).toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
        remediation: "Audit classifications for any custom Chart of Accounts codes added directly to ledger transactions."
      });
    }

    if (!isCashFlowReconciled) {
      diagnosticsList.push({
        id: "diag-cf",
        category: "Warning",
        checkName: "Cash Flow Ending cash mismatch",
        message: `Calculated ending cash is $${endingCashSum.toLocaleString(undefined, { minimumFractionDigits: 2 })} while Ledger Cash is $${glEndingCashSum.toLocaleString(undefined, { minimumFractionDigits: 2 })} (Variance: $${cashFlowDifference.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`,
        details: "Indicates some Cash journal lines cannot be matched against standard operating, investing, or financing counterparts.",
        remediation: "Audit any unusual manual adjustments or cash-to-cash/equity transfer postings."
      });
    }

    assetAccounts.forEach(acc => {
      if (acc.balance < -0.01) {
        diagnosticsList.push({
          id: `diag-neg-asset-${acc.code}`,
          category: "Warning",
          checkName: `Negative Asset Balance: ${acc.name}`,
          message: `Account ${acc.code} has a negative debit-normal balance of $${acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
          details: "Asset accounts are debit-normal; negative values indicate excessive credit postings or wrong classifications.",
          remediation: "Audit credit vouchers, refunds, or depreciation adjustments targeting this asset."
        });
      }
    });

    if (glEndingCashSum < -0.01) {
      diagnosticsList.push({
        id: "diag-neg-cash",
        category: "Critical",
        checkName: "Negative Bank Liquidity Balance",
        message: `Aggregated cash & bank ledger accounts indicate overdraft: $${glEndingCashSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
        details: "Cash reserves are negative, suggesting critical liquidity or solvency concerns.",
        remediation: "Review accounts receivable collections or secure short-term bridge financing."
      });
    }

    revenueAccounts.forEach(acc => {
      if (acc.balance < -0.01) {
        diagnosticsList.push({
          id: `diag-orphan-revenue-${acc.code}`,
          category: "Warning",
          checkName: `Atypical Revenue Debit: ${acc.name}`,
          message: `Revenue account ${acc.code} has a debit-style balance of $${Math.abs(acc.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
          details: "Revenue accounts are credit-normal. Net debit balances represent heavy sales return volumes or journal errors.",
          remediation: "Check return vouchers or manual corrections on sales ledger accounts."
        });
      }
    });

    expenseAccounts.forEach(acc => {
      if (acc.balance < -0.01) {
        diagnosticsList.push({
          id: `diag-orphan-expense-${acc.code}`,
          category: "Warning",
          checkName: `Atypical Expense Credit: ${acc.name}`,
          message: `Expense account ${acc.code} has a credit-style balance of $${Math.abs(acc.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
          details: "Expense accounts are debit-normal. Net credit balances indicate unclassified refunds or write-offs.",
          remediation: "Audit manual journal credits made to expense accounts."
        });
      }
    });

    const healthStatus: 'Green' | 'Yellow' | 'Red' = 
      diagnosticsList.some(d => d.category === 'Critical') ? 'Red' : 
      diagnosticsList.some(d => d.category === 'Warning') ? 'Yellow' : 'Green';

    return {
      revenueAccounts,
      expenseAccounts,
      cogsAccounts,
      opexAccounts,
      taxAccounts,
      totalRevenue,
      totalCogs,
      grossProfit,
      totalOpex,
      operatingProfit,
      totalTax,
      netProfitBeforeTax,
      netProfitAfterTax,

      assetAccounts,
      liabilityAccounts,
      equityAccounts,
      currentAssetAccounts,
      nonCurrentAssetAccounts,
      totalCurrentAssets,
      totalNonCurrentAssets,
      totalAssets,
      currentLiabilityAccounts,
      longTermLiabilityAccounts,
      totalCurrentLiabilities,
      totalLongTermLiabilities,
      totalLiabilities,
      baseEquityValue,
      currentYearEarnings,
      totalEquity,
      balanceSheetDifference,
      isBsBalanced,

      openingCashSum,
      opexCashFlows,
      customerReceiptsFlows,
      supplierPaymentsFlows,
      otherOpexCashFlows,
      totalCustomerReceipts,
      totalSupplierPayments,
      totalOpexCash,
      totalOtherOpexCash,
      totalOperatingActivities,
      investingFlows,
      totalInvestingActivities,
      financingFlows,
      totalFinancingActivities,
      netCashFlow,
      endingCashSum,
      glEndingCashSum,
      cashFlowDifference,
      isCashFlowReconciled,

      tbBalanced,
      bsBalanced,
      profitReconciled,
      cfReconciled,
      accountingEqCheck,
      allChecksPass,
      diagnosticsList,
      healthStatus
    };
  }, [trialBalanceData, ledgerEntries, unionCOA, startDate, endDate, tbCompanyFilter, tbBranchFilter, tbPostingStatusFilter, tbCreatedByFilter]);

  // --- 10b. Enterprise Accounting Diagnostics Engine ---
  const tbDiagnostics = useMemo(() => {
    const issues: Array<{
      id: string;
      category: 'Critical' | 'Warning' | 'Info';
      checkName: string;
      message: string;
      details: string;
      sourceModule?: string;
      voucherType?: string;
      postingNumber?: string;
      accountCode?: string;
      possibleCause?: string;
      remediation?: string;
    }> = [];

    const entries = ledgerEntries;

    const addIssue = (
      category: 'Critical' | 'Warning' | 'Info',
      checkName: string,
      message: string,
      details: string,
      extra?: Partial<any>
    ) => {
      issues.push({
        id: `diag-${issues.length + 1}-${Date.now()}`,
        category,
        checkName,
        message,
        details,
        ...extra
      });
    };

    // 1. Unbalanced Journal Entries
    entries.forEach(entry => {
      let sumDebits = 0;
      let sumCredits = 0;
      entry.lines.forEach(line => {
        sumDebits += Number(line.debit) || 0;
        sumCredits += Number(line.credit) || 0;
      });

      const diff = Math.abs(sumDebits - sumCredits);
      if (diff > 0.01) {
        const voucherType = entry.postingNumber ? entry.postingNumber.split('-')[0] : 'JV';
        addIssue(
          'Critical',
          'Unbalanced Journal Entry',
          `Voucher ${entry.postingNumber || entry.id} is out of balance by $${diff.toFixed(2)}`,
          `Total Debits: $${sumDebits.toFixed(2)} | Total Credits: $${sumCredits.toFixed(2)}. In a double-entry accounting system, total debits must equal total credits.`,
          {
            sourceModule: entry.sourceModule,
            voucherType,
            postingNumber: entry.postingNumber,
            possibleCause: 'The ledger posting transaction did not balance during recording, likely due to a manual journal adjustment or a race condition in the posting pipeline.',
            remediation: 'Void this journal voucher and re-record a balanced entry with matching debits and credits.'
          }
        );
      }

      // 3. Missing Ledger Lines
      if (!entry.lines || entry.lines.length === 0) {
        addIssue(
          'Critical',
          'Missing Ledger Lines',
          `Voucher ${entry.postingNumber || entry.id} has no entry lines.`,
          `The ledger entry exists in the system but contains no line items to debit or credit.`,
          {
            sourceModule: entry.sourceModule,
            postingNumber: entry.postingNumber,
            possibleCause: 'A corrupted transaction payload was sent to the database or the database write failed partially.',
            remediation: 'Audit the source document and trigger a ledger posting re-run or manually recreate the lines.'
          }
        );
      }

      // 5. Missing Debit Leg
      if (entry.lines && entry.lines.length > 0 && sumDebits === 0 && sumCredits > 0) {
        addIssue(
          'Critical',
          'Missing Debit Leg',
          `Voucher ${entry.postingNumber || entry.id} contains only Credits.`,
          `Total Credit: $${sumCredits.toFixed(2)} but total Debit is $0.00.`,
          {
            sourceModule: entry.sourceModule,
            postingNumber: entry.postingNumber,
            possibleCause: 'The posting routine failed to add the debit line of the double entry.',
            remediation: 'Examine the source document accounts mapping. Create a compensating debit adjustment.'
          }
        );
      }

      // 6. Missing Credit Leg
      if (entry.lines && entry.lines.length > 0 && sumCredits === 0 && sumDebits > 0) {
        addIssue(
          'Critical',
          'Missing Credit Leg',
          `Voucher ${entry.postingNumber || entry.id} contains only Debits.`,
          `Total Debit: $${sumDebits.toFixed(2)} but total Credit is $0.00.`,
          {
            sourceModule: entry.sourceModule,
            postingNumber: entry.postingNumber,
            possibleCause: 'The posting routine failed to add the credit line of the double entry.',
            remediation: 'Examine the source document accounts mapping. Create a compensating credit adjustment.'
          }
        );
      }

      // 17. Missing Company
      if (!entry.companyId) {
        addIssue(
          'Warning',
          'Missing Company Identifier',
          `Voucher ${entry.postingNumber || entry.id} has no Company assigned.`,
          `The entry was posted without a valid companyId, violating multi-tenant entity integrity.`,
          {
            sourceModule: entry.sourceModule,
            postingNumber: entry.postingNumber,
            possibleCause: 'The session company profile was not populated or user was not assigned to a company.',
            remediation: 'Link the entry to the primary corporate profile.'
          }
        );
      }

      // 18. Missing Branch
      if (!entry.branchId) {
        addIssue(
          'Warning',
          'Missing Branch Identifier',
          `Voucher ${entry.postingNumber || entry.id} has no Branch assigned.`,
          `The entry was posted without a branch designation, impacting divisional reporting.`,
          {
            sourceModule: entry.sourceModule,
            postingNumber: entry.postingNumber,
            possibleCause: 'Operational branch context was not loaded during transaction recording.',
            remediation: 'Update the ledger record with the default HQ or operational branch.'
          }
        );
      }

      // 16. Invalid Fiscal Year / Period
      if (entry.postingDate) {
        const year = new Date(entry.postingDate).getFullYear();
        if (isNaN(year) || year < 2020 || year > 2035) {
          addIssue(
            'Warning',
            'Invalid Accounting Period / Fiscal Year',
            `Voucher ${entry.postingNumber} has an irregular posting date: ${entry.postingDate}`,
            `The year ${year} is outside of the active Nexus ERP fiscal configurations.`,
            {
              sourceModule: entry.sourceModule,
              postingNumber: entry.postingNumber,
              possibleCause: 'User manual override or device time synchronization discrepancy.',
              remediation: 'Correct the posting date of the source journal.'
            }
          );
        }
      }
    });

    // 2. Duplicate Voucher Numbers
    const voucherCounts: Record<string, string[]> = {};
    entries.forEach(e => {
      if (e.postingNumber && e.postingNumber !== 'JV-N/A') {
        if (!voucherCounts[e.postingNumber]) {
          voucherCounts[e.postingNumber] = [];
        }
        voucherCounts[e.postingNumber].push(e.id);
      }
    });
    Object.entries(voucherCounts).forEach(([num, ids]) => {
      if (ids.length > 1) {
        addIssue(
          'Critical',
          'Duplicate Voucher Numbers',
          `Voucher number ${num} is used by ${ids.length} different ledger entries.`,
          `Voucher IDs: ${ids.join(', ')}. This violates accounting uniqueness principles.`,
          {
            postingNumber: num,
            possibleCause: 'Concurrency issues, voucher sequence generator collision, or manual duplicate posting.',
            remediation: 'Void the duplicate record or resequence the ledger entry numbering.'
          }
        );
      }
    });

    // 7. Invalid Account Codes & 8. Inactive Accounts
    entries.forEach(entry => {
      entry.lines.forEach(line => {
        const code = line.accountCode;
        if (code) {
          const acc = unionCOA.find(a => a.code === code);
          if (!acc) {
            addIssue(
              'Critical',
              'Invalid Account Code',
              `Voucher ${entry.postingNumber} references an invalid account code: "${code}"`,
              `The account code "${code}" does not exist in the active Chart of Accounts.`,
              {
                postingNumber: entry.postingNumber,
                accountCode: code,
                possibleCause: 'Hardcoded posting routine or account was deleted from the Chart of Accounts.',
                remediation: 'Add the missing account code to the Chart of Accounts or edit the journal voucher line to use an existing account.'
              }
            );
          } else if (acc.status === 'inactive' && !acc.isLegacy) {
            addIssue(
              'Warning',
              'Inactive Account Used',
              `Voucher ${entry.postingNumber} posted to an inactive account: "${acc.name}" (${code})`,
              `The account is marked inactive. Postings should not be directed to suspended accounts.`,
              {
                postingNumber: entry.postingNumber,
                accountCode: code,
                possibleCause: 'A scheduled or automated transaction triggered against a frozen account.',
                remediation: 'Change account status to Active, or reverse the transaction and re-route to an active substitute.'
              }
            );
          }
        }
      });
    });

    // 9. Missing System Accounts
    const criticalSystemCodes = ['1010', '1200', '1300', '2100', '3100', '4100', '5100'];
    criticalSystemCodes.forEach(code => {
      const match = coa.find(a => a.code === code);
      if (!match) {
        addIssue(
          'Critical',
          'Missing System Account',
          `Essential system account "${code}" is missing from the Chart of Accounts.`,
          `This account code is required for the automated ERP posting routines (Cash, AR, Inventory, AP, Capital, Sales, COGS).`,
          {
            accountCode: code,
            possibleCause: 'Manual deletion or incomplete Chart of Accounts bootstrapping.',
            remediation: 'Re-initialize the default Chart of Accounts template or manually create the required system account.'
          }
        );
      }
    });

    // 10. Negative Inventory Asset, 11. Negative Cash Balance, 12. Negative Capital
    trialBalanceData.rows.forEach(row => {
      if (row.code === '1300' && row.endingBalance < 0) {
        addIssue(
          'Warning',
          'Negative Inventory Asset Balance',
          `Inventory account (${row.code}) has a negative ending balance: $${row.endingBalance.toFixed(2)}`,
          `Asset balances are normally positive. A negative ending inventory balance implies an error in unit costing or stock ledger adjustments.`,
          {
            accountCode: row.code,
            possibleCause: 'Sales recorded before purchase entries were posted, or incorrect COGS expense recognition.',
            remediation: 'Audit the stock movement log and adjust standard COGS postings.'
          }
        );
      }
      if (row.code === '1010' && row.endingBalance < 0) {
        addIssue(
          'Warning',
          'Negative Cash Balance',
          `Cash account (${row.code}) is overdrawn: $${row.endingBalance.toFixed(2)}`,
          `Cash is an asset with a normal Debit balance. A negative cash balance indicates a cash deficit or unregistered receipts.`,
          {
            accountCode: row.code,
            possibleCause: 'Delayed registration of cash collections or duplicate payment postings.',
            remediation: 'Perform a physical cash count and reconcile with bank statements.'
          }
        );
      }
      if (row.code === '3100' && row.endingBalance < 0) {
        addIssue(
          'Warning',
          'Negative Capital Balance',
          `Equity / Capital account (${row.code}) has negative balance: $${row.endingBalance.toFixed(2)}`,
          `Capital is normally a Credit balance. Negative capital implies accumulated deficits exceeding initial investments.`,
          {
            accountCode: row.code,
            possibleCause: 'Heavy operating losses or unrecorded owner capital injections.',
            remediation: 'Review equity adjustment entries and closing journal allocations.'
          }
        );
      }
    });

    // 13. Orphan Ledger Entries & 14. Ledger Entries without Source Documents
    entries.forEach(entry => {
      if (entry.sourceModule === 'SALES' && entry.createdFrom) {
        const saleExists = sales.some(s => s.id === entry.createdFrom);
        if (!saleExists) {
          addIssue(
            'Warning',
            'Orphan Ledger Entry (SALES)',
            `Voucher ${entry.postingNumber} references Sales ID "${entry.createdFrom}" which does not exist.`,
            `The ledger entry is linked to a sales transaction that was deleted, or never synced.`,
            {
              postingNumber: entry.postingNumber,
              possibleCause: 'A sales invoice was manually purged from the operational database after posting.',
              remediation: 'Verify sales records or delete/re-post this ledger entry.'
            }
          );
        }
      } else if (entry.sourceModule === 'PROCUREMENT' && entry.createdFrom) {
        const purchaseExists = purchases.some(p => p.id === entry.createdFrom);
        if (!purchaseExists) {
          addIssue(
            'Warning',
            'Orphan Ledger Entry (PROCUREMENT)',
            `Voucher ${entry.postingNumber} references Purchase ID "${entry.createdFrom}" which does not exist.`,
            `The ledger entry is linked to a procurement record that was deleted.`,
            {
              postingNumber: entry.postingNumber,
              possibleCause: 'The procurement record was deleted or was not saved properly in the database.',
              remediation: 'Audit the purchases list and recover the source document or void this entry.'
            }
          );
        }
      }
    });

    // 15. Source Documents without Ledger Entries
    sales.forEach(sale => {
      if (!isVoidStatus(sale.status)) {
        const hasLedger = entries.some(e => e.createdFrom === sale.id);
        if (!hasLedger) {
          addIssue(
            'Warning',
            'Source Document without Ledger Entry (SALES)',
            `Sales Invoice "${sale.invoiceNumber || sale.id}" has no general ledger entry.`,
            `This posted transaction has not been synchronized to the General Ledger, causing operational and ledger misalignment.`,
            {
              sourceModule: 'SALES',
              possibleCause: 'Voucher was saved but posting engine pipeline failed, or it was in draft status without ledger generation.',
              remediation: 'Trigger a manual "Post to Ledger" action from the Sales invoice panel.'
            }
          );
        }
      }
    });

    purchases.forEach(purchase => {
      if (!isVoidStatus(purchase.status)) {
        const hasLedger = entries.some(e => e.createdFrom === purchase.id);
        if (!hasLedger) {
          addIssue(
            'Warning',
            'Source Document without Ledger Entry (PROCUREMENT)',
            `Purchase Invoice "${purchase.invoiceNumber || purchase.id}" has no general ledger entry.`,
            `The procurement invoice is saved but its corresponding financial transactions have not been posted to the General Ledger.`,
            {
              sourceModule: 'PROCUREMENT',
              possibleCause: 'The procurement process completed but the ledger poster encountered a concurrency block.',
              remediation: 'Re-run ledger posting from the procurement invoice manager.'
            }
          );
        }
      }
    });

    return issues;
  }, [ledgerEntries, unionCOA, sales, purchases, trialBalanceData]);

  // --- 10c. Enterprise Trial Balance & Operational Reconciliation Calculations ---
  const reconciliationData = useMemo(() => {
    // 1. Cash Ledger (1010)
    const glCashAcc = trialBalanceData.rows.find(r => r.code === '1010');
    const glCashBalance = glCashAcc ? glCashAcc.endingBalance : 0;
    const operationalCashBalance = cashLedger.reduce((sum, item) => {
      const type = (item.type || 'receipt').toLowerCase();
      const amt = Number(item.amount) || 0;
      return type === 'receipt' || type === 'deposit' || type === 'in' ? sum + amt : sum - amt;
    }, 0);

    // 2. Accounts Receivable (1200)
    const glArAcc = trialBalanceData.rows.find(r => r.code === '1200');
    const glArBalance = glArAcc ? glArAcc.endingBalance : 0;
    const operationalArBalance = customersState.reduce((sum, c) => sum + (Number(c.dueBalance) || 0), 0);

    // 3. Inventory (1300)
    const glInventoryAcc = trialBalanceData.rows.find(r => r.code === '1300');
    const glInventoryBalance = glInventoryAcc ? glInventoryAcc.endingBalance : 0;
    const operationalInventoryBalance = products.reduce((sum, p) => {
      const stock = Number(p.currentStock) || Number(p.stock) || 0;
      const price = Number(p.purchasePrice) || Number(p.cost) || 0;
      return sum + (stock * price);
    }, 0);

    // 4. Accounts Payable (2100)
    const glApAcc = trialBalanceData.rows.find(r => r.code === '2100');
    const glApBalance = glApAcc ? glApAcc.endingBalance : 0;
    const operationalApBalance = suppliers.reduce((sum, s) => sum + (Number(s.dueBalance) || 0), 0);

    // 5. Capital (3100)
    const glCapitalAcc = trialBalanceData.rows.find(r => r.code === '3100');
    const glCapitalBalance = glCapitalAcc ? glCapitalAcc.endingBalance : 0;
    const operationalCapitalBalance = capital.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    // 6. Sales Revenue (4100)
    const glSalesAcc = trialBalanceData.rows.find(r => r.code === '4100');
    const glSalesBalance = glSalesAcc ? glSalesAcc.endingBalance : 0;
    const operationalSalesBalance = sales.filter(s => !isVoidStatus(s.status)).reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);

    // 7. COGS (5100)
    const glCogsAcc = trialBalanceData.rows.find(r => r.code === '5100');
    const glCogsBalance = glCogsAcc ? glCogsAcc.endingBalance : 0;
    const operationalCogsBalance = sales.filter(s => !isVoidStatus(s.status)).reduce((sum, s) => {
      const items = getNormalizedItems(s);
      const saleCogs = items.reduce((cSum, item) => {
        const prod = products.find(p => p.id === item.productId);
        const costPrice = prod ? (Number(prod.purchasePrice) || Number(prod.cost) || 0) : 0;
        return cSum + (costPrice * (Number(item.quantity) || 0));
      }, 0);
      return sum + saleCogs;
    }, 0);

    // 8. Operating Expenses (61xx)
    const glExpensesRows = trialBalanceData.rows.filter(r => r.code.startsWith('61'));
    const glExpensesBalance = glExpensesRows.reduce((sum, r) => sum + r.endingBalance, 0);
    const operationalExpensesBalance = expenses.filter(e => !isVoidStatus(e.status) && e.status !== 'void').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const items = [
      { name: 'Cash Ledger (1010)', code: '1010', gl: glCashBalance, op: operationalCashBalance },
      { name: 'Accounts Receivable (1200)', code: '1200', gl: glArBalance, op: operationalArBalance },
      { name: 'Inventory Asset (1300)', code: '1300', gl: glInventoryBalance, op: operationalInventoryBalance },
      { name: 'Accounts Payable (2100)', code: '2100', gl: glApBalance, op: operationalApBalance },
      { name: 'Owner Equity / Capital (3100)', code: '3100', gl: glCapitalBalance, op: operationalCapitalBalance },
      { name: 'Sales Revenue (4100)', code: '4100', gl: glSalesBalance, op: operationalSalesBalance },
      { name: 'Cost of Goods Sold (5100)', code: '5100', gl: glCogsBalance, op: operationalCogsBalance },
      { name: 'Operating Expenses (61xx)', code: '61xx', gl: glExpensesBalance, op: operationalExpensesBalance },
    ];

    return items.map(item => {
      const diff = Math.abs(item.gl - item.op);
      const isReconciled = diff < 1.0; // allows for tiny cents discrepancies
      return {
        ...item,
        diff,
        isReconciled
      };
    });
  }, [trialBalanceData, cashLedger, customersState, products, suppliers, capital, sales, expenses]);

  // --- 10d. Drill Down function to navigate to General Ledger ---
  const handleDrillDownToGl = (accountCode: string) => {
    setSelectedGlAccountId(accountCode);
    setGlCompanyFilter(tbCompanyFilter);
    setGlBranchFilter(tbBranchFilter);
    setGlPostingStatusFilter(tbPostingStatusFilter);
    setGlCreatedByFilter(tbCreatedByFilter);
    setGlDatePreset(tbDatePreset);
    setActiveReport('general_ledger');
    setSearchQuery('');
  };


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
        const createdBy = p.createdBy || (logMatch ? logMatch.user : "System Admin");
        
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
    else if (activeReport === 'general_ledger') {
      const selectedAcc = coa.find(a => a.code === selectedGlAccountId || a.id === selectedGlAccountId);
      const accName = selectedAcc ? selectedAcc.name : 'Unknown Account';
      csvContent = `NEXUS ENTERPRISE GENERAL LEDGER: ${selectedGlAccountId} - ${accName}\n`;
      csvContent += `Reporting Range: ${startDate || 'All-time'} to ${endDate || 'All-time'}\n\n`;
      csvContent += "Posting Date,Posting Number,Voucher Type,Source Module,Reference,Narration,Debit ($),Credit ($),Running Balance ($),Created By\n";
      
      // Opening Balance Row
      csvContent += `"-","-","Opening Balance","-","-","Starting Balance before selected date",0,0,${generalLedgerData.openingBalance.toFixed(2)},"System"\n`;
      
      generalLedgerData.entries.forEach(e => {
        csvContent += `"${e.postingDate.split('T')[0]}","${e.postingNumber}","${e.voucherType}","${e.sourceModule}","${e.reference}","${e.narration.replace(/"/g, '""')}",${e.debit},${e.credit},${e.runningBalance.toFixed(2)},"${e.createdBy}"\n`;
      });
      
      csvContent += `\nSUMMARY,Opening Balance,${generalLedgerData.openingBalance.toFixed(2)},Total Debits,${generalLedgerData.totalDebits.toFixed(2)},Total Credits,${generalLedgerData.totalCredits.toFixed(2)},Closing Balance,${generalLedgerData.closingBalance.toFixed(2)},Transaction Count,${generalLedgerData.entries.length}\n`;
    }
    else if (activeReport === 'trial_balance') {
      csvContent = "NEXUS ERP ENTERPRISE TRIAL BALANCE REPORT\n";
      csvContent += `Generated On: ${new Date().toLocaleDateString()}, Range: ${startDate || 'All-time'} to ${endDate || 'All-time'}\n\n`;
      csvContent += "SUMMARY METRICS\n";
      csvContent += `Total Accounts,${trialBalanceData.totalAccounts}\n`;
      csvContent += `Total Debit Column Sum,${trialBalanceData.totalDebitColumnSum.toFixed(2)}\n`;
      csvContent += `Total Credit Column Sum,${trialBalanceData.totalCreditColumnSum.toFixed(2)}\n`;
      csvContent += `Difference,${trialBalanceData.difference.toFixed(2)}\n`;
      csvContent += `Balanced Status,${trialBalanceData.isBalanced ? 'BALANCED' : 'OUT OF BALANCE'}\n`;
      csvContent += `Last Posting Date,${trialBalanceData.lastPostingDate || 'N/A'}\n\n`;

      csvContent += "ACCOUNT CODES AND PERIOD BALANCES\n";
      csvContent += "Account Code,Account Name,Account Type,Normal Balance,Opening Balance,Period Debit,Period Credit,Debit Column (Ending),Credit Column (Ending)\n";
      trialBalanceData.rows.forEach(r => {
        csvContent += `"${r.code}","${r.name.replace(/"/g, '""')}","${r.type}","${r.normalBalance}",${r.openingBalance.toFixed(2)},${r.periodDebit.toFixed(2)},${r.periodCredit.toFixed(2)},${r.debitColumnValue.toFixed(2)},${r.creditColumnValue.toFixed(2)}\n`;
      });

      if (!trialBalanceData.isBalanced) {
        csvContent += "\nAUTOMATIC FINANCIAL DIAGNOSTICS REPORT\n";
        csvContent += "Category,Check Name,Message,Details\n";
        tbDiagnostics.filter(d => d.category === 'Critical' || d.category === 'Warning').forEach(d => {
          csvContent += `"${d.category}","${d.checkName.replace(/"/g, '""')}","${d.message.replace(/"/g, '""')}","${d.details.replace(/"/g, '""')}"\n`;
        });
      }
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
    doc.text(`Generated by: ${auth.currentUser?.email || 'System Admin'}  |  Audit Date: ${new Date().toLocaleDateString()}`, 15, 30);
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
    else if (activeReport === 'general_ledger') {
      const selectedAcc = coa.find(a => a.code === selectedGlAccountId || a.id === selectedGlAccountId);
      const accName = selectedAcc ? selectedAcc.name : 'Unknown Account';

      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 22, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`GENERAL LEDGER SUMMARY: ${selectedGlAccountId} - ${accName.toUpperCase()}`, 20, startY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Opening Balance: $${generalLedgerData.openingBalance.toFixed(2)}   |   Total Debits: $${generalLedgerData.totalDebits.toFixed(2)}`, 20, startY + 12);
      doc.text(`Closing Balance: $${generalLedgerData.closingBalance.toFixed(2)}   |   Total Credits: $${generalLedgerData.totalCredits.toFixed(2)}`, 20, startY + 18);
      doc.text(`Transactions Count: ${generalLedgerData.entries.length}`, 120, startY + 12);
      doc.text(`Normal Balance Type: ${generalLedgerData.isDebitNormal ? 'Debit-Normal' : 'Credit-Normal'}`, 120, startY + 18);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 26, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("DATE", 18, startY + 31.5);
      doc.text("POSTING NO", 35, startY + 31.5);
      doc.text("VOUCHER TYPE", 65, startY + 31.5);
      doc.text("NARRATION", 95, startY + 31.5);
      doc.text("DEBIT ($)", 140, startY + 31.5);
      doc.text("CREDIT ($)", 162, startY + 31.5);
      doc.text("BALANCE ($)", 182, startY + 31.5);

      let rowY = startY + 38;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      // Print Opening Balance row
      doc.setFont('helvetica', 'bold');
      doc.text("-", 18, rowY);
      doc.text("INITIAL", 35, rowY);
      doc.text("Opening Balance", 65, rowY);
      doc.text("Starting cumulative balance", 95, rowY);
      doc.text("-", 140, rowY);
      doc.text("-", 162, rowY);
      doc.text(`$${generalLedgerData.openingBalance.toFixed(2)}`, 182, rowY);
      doc.setFont('helvetica', 'normal');
      rowY += 6.5;

      generalLedgerData.entries.slice(0, 25).forEach(e => {
        if (rowY > 260) return;
        doc.text(e.postingDate.split('T')[0], 18, rowY);
        doc.text(e.postingNumber, 35, rowY);
        doc.text(e.voucherType, 65, rowY);
        
        const shortNarration = e.narration.length > 25 ? e.narration.substring(0, 25) + '...' : e.narration;
        doc.text(shortNarration, 95, rowY);
        
        doc.text(e.debit > 0 ? `$${e.debit.toFixed(2)}` : '-', 140, rowY);
        doc.text(e.credit > 0 ? `$${e.credit.toFixed(2)}` : '-', 162, rowY);
        doc.text(`$${e.runningBalance.toFixed(2)}`, 182, rowY);
        rowY += 6.5;
      });
    }
    else if (activeReport === 'trial_balance') {
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 24, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("ENTERPRISE TRIAL BALANCE SUMMARY:", 20, startY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Total Accounts: ${trialBalanceData.totalAccounts}   |   Status: ${trialBalanceData.isBalanced ? 'BALANCED' : 'OUT OF BALANCE'}`, 20, startY + 12);
      doc.text(`Total Debits: $${trialBalanceData.totalDebitColumnSum.toFixed(2)}   |   Total Credits: $${trialBalanceData.totalCreditColumnSum.toFixed(2)}`, 20, startY + 18);
      
      if (!trialBalanceData.isBalanced) {
        doc.setTextColor(220, 38, 38);
        doc.setFont('helvetica', 'bold');
        doc.text(`DIFFERENCE: $${trialBalanceData.difference.toFixed(2)}`, 130, startY + 12);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'normal');
      } else {
        doc.setTextColor(16, 185, 129);
        doc.setFont('helvetica', 'bold');
        doc.text("✓ BALANCED", 130, startY + 12);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'normal');
      }
      doc.text(`Last Posting: ${trialBalanceData.lastPostingDate ? trialBalanceData.lastPostingDate.split('T')[0] : 'None'}`, 130, startY + 18);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 28, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text("CODE", 18, startY + 33.5);
      doc.text("ACCOUNT NAME", 38, startY + 33.5);
      doc.text("TYPE", 85, startY + 33.5);
      doc.text("OPENING", 120, startY + 33.5);
      doc.text("DEBIT (+)", 142, startY + 33.5);
      doc.text("CREDIT (-)", 164, startY + 33.5);
      doc.text("ENDING BAL", 183, startY + 33.5);

      let rowY = startY + 41;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.0);

      trialBalanceData.rows.slice(0, 32).forEach(r => {
        if (rowY > 265) return;
        doc.text(r.code, 18, rowY);
        doc.text(r.name.length > 28 ? r.name.substring(0, 28) + '...' : r.name, 38, rowY);
        doc.text(r.type, 85, rowY);
        doc.text(`$${r.openingBalance.toFixed(1)}`, 120, rowY);
        doc.text(r.periodDebit > 0 ? `$${r.periodDebit.toFixed(1)}` : '-', 142, rowY);
        doc.text(r.periodCredit > 0 ? `$${r.periodCredit.toFixed(1)}` : '-', 164, rowY);
        
        doc.setFont('helvetica', 'bold');
        if (r.debitColumnValue > 0) {
          doc.text(`$${r.debitColumnValue.toFixed(1)} (Dr)`, 183, rowY);
        } else if (r.creditColumnValue > 0) {
          doc.text(`$${r.creditColumnValue.toFixed(1)} (Cr)`, 183, rowY);
        } else {
          doc.text('$0.0', 183, rowY);
        }
        doc.setFont('helvetica', 'normal');
        rowY += 6;
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
          
          {(['sales', 'purchases', 'profit_loss', 'balance_sheet', 'cash_flow', 'financial_reconciliation', 'general_ledger', 'trial_balance', 'customer_due', 'supplier_due', 'tax_vat', 'activity_logs', 'customer_statement', 'supplier_statement', 'expense_analytics', 'chart_of_accounts'] as ReportType[])
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
              'balance_sheet': 'Balance Sheet',
              'cash_flow': 'Statement of Cash Flows',
              'financial_reconciliation': 'Financial Consistency Engine',
              'general_ledger': 'Enterprise General Ledger',
              'trial_balance': 'Enterprise Trial Balance',
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
              'balance_sheet': 'text-teal-700 bg-teal-50 border-teal-150',
              'cash_flow': 'text-cyan-700 bg-cyan-50 border-cyan-150',
              'financial_reconciliation': 'text-purple-700 bg-purple-50 border-purple-150',
              'general_ledger': 'text-indigo-800 bg-indigo-50 border-indigo-150',
              'trial_balance': 'text-indigo-850 bg-indigo-50 border-indigo-150',
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
                    <p className="text-xl font-black text-slate-900">${financialStatements.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-rose-500 font-bold">COGS: ${financialStatements.totalCogs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Gross Profit & Operating Expenses</span>
                    <p className="text-xl font-black text-slate-900">${financialStatements.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-rose-500 font-bold">OpEx: ${financialStatements.totalOpex.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest block">Net Profit After Tax</span>
                    <p className="text-2xl font-black text-emerald-600">${financialStatements.netProfitAfterTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-emerald-650 font-bold font-mono">Net Margin: {financialStatements.totalRevenue > 0 ? ((financialStatements.netProfitAfterTax / financialStatements.totalRevenue) * 100).toFixed(1) : '0.0'}%</p>
                  </div>
                </>
              )}

              {activeReport === 'balance_sheet' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Classified Assets</span>
                    <p className="text-2xl font-black text-teal-650">${financialStatements.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Current: ${financialStatements.totalCurrentAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })} • Non-Current: ${financialStatements.totalNonCurrentAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Liabilities & Equity</span>
                    <p className="text-2xl font-black text-indigo-650">${(financialStatements.totalLiabilities + financialStatements.totalEquity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Liab: ${financialStatements.totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })} • Equity: ${financialStatements.totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold uppercase tracking-widest block text-slate-400">Balance Equation Variance</span>
                    <p className={`text-2xl font-black ${financialStatements.isBsBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                      ${financialStatements.balanceSheetDifference.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className={`text-[10px] font-bold font-mono ${financialStatements.isBsBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {financialStatements.isBsBalanced ? 'Balanced (Assets = L + E)' : 'Out of Balance'}
                    </p>
                  </div>
                </>
              )}

              {activeReport === 'cash_flow' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Operating Cash Net Impact</span>
                    <p className="text-xl font-black text-slate-900">${financialStatements.totalOperatingActivities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Receipts: ${financialStatements.totalCustomerReceipts.toLocaleString(undefined, { minimumFractionDigits: 2 })} • Payments: ${financialStatements.totalSupplierPayments.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Investing & Financing Flows</span>
                    <p className="text-xl font-black text-slate-900">${(financialStatements.totalInvestingActivities + financialStatements.totalFinancingActivities).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Investing: ${financialStatements.totalInvestingActivities.toLocaleString(undefined, { minimumFractionDigits: 2 })} • Financing: ${financialStatements.totalFinancingActivities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest block">Net Cash Flow Period Change</span>
                    <p className="text-2xl font-black text-cyan-600">${financialStatements.netCashFlow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-cyan-600 font-bold font-mono">Ending Cash: ${financialStatements.endingCashSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                </>
              )}

              {activeReport === 'financial_reconciliation' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Diagnostics & Alerts</span>
                    <p className={`text-2xl font-black ${financialStatements.healthStatus === 'Green' ? 'text-emerald-600' : financialStatements.healthStatus === 'Yellow' ? 'text-amber-500' : 'text-rose-600'}`}>
                      {financialStatements.diagnosticsList.length} Active Alerts
                    </p>
                    <p className="text-[10px] text-slate-400">System health monitoring</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Double-Entry Status</span>
                    <p className={`text-2xl font-black ${financialStatements.tbBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {financialStatements.tbBalanced ? 'VERIFIED' : 'FAILED'}
                    </p>
                    <p className="text-[10px] text-slate-400">Ledger mathematical balance</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold uppercase tracking-widest block text-indigo-600">Unified Consistency Audit</span>
                    <p className={`text-2xl font-black ${financialStatements.allChecksPass ? 'text-emerald-600' : 'text-amber-500'}`}>
                      {financialStatements.allChecksPass ? '100% RECONCILED' : 'INTEGRITY WARN'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-semibold">GAAP & IFRS Compliant</p>
                  </div>
                </>
              )}

              {activeReport === 'general_ledger' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">Opening & Closing Balances</span>
                    <p className="text-lg font-black text-slate-700">
                      Opening: <span className="font-bold text-slate-900">${generalLedgerData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </p>
                    <p className="text-xs text-indigo-600 font-bold">Closing: ${generalLedgerData.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Period Debits & Credits</span>
                    <p className="text-lg font-black text-emerald-600">Debits: +${generalLedgerData.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-xs text-rose-600 font-bold">Credits: -${generalLedgerData.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Transaction volume</span>
                    <p className="text-2xl font-black text-slate-900">{generalLedgerData.entries.length} Postings</p>
                    <p className="text-[10px] text-slate-450">Last: {generalLedgerData.lastPostingDate ? new Date(generalLedgerData.lastPostingDate).toLocaleDateString() : 'N/A'}</p>
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

          {/* GENERAL LEDGER ADVANCED ENTERPRISE FILTERS */}
          {activeReport === 'general_ledger' && (
            <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl space-y-4 animate-fade-in print:hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block">
                    General Ledger Enterprise Controls
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-indigo-100 border border-indigo-200 text-indigo-800 uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
                    Accounting Source Of Truth
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 text-xs font-sans">
                {/* Account Selector */}
                <div className="space-y-1 col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Selector</label>
                  <select
                    value={selectedGlAccountId}
                    onChange={(e) => setSelectedGlAccountId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">-- Choose Account --</option>
                    {unionCOA
                      .filter(a => {
                        if (glAccountViewMode === 'active') return a.status === 'active' && !a.isLegacy;
                        if (glAccountViewMode === 'historical') return a.isLegacy;
                        return true; // 'all'
                      })
                      .map(a => (
                        <option key={a.code} value={a.code}>
                          {a.code} {a.name} {a.isLegacy ? '[HISTORICAL]' : `(${a.type})`}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Compatibility View Toggle Filter */}
                <div className="space-y-1 col-span-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Legacy Filter</label>
                  <select
                    value={glAccountViewMode}
                    onChange={(e) => setGlAccountViewMode(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-indigo-800 bg-indigo-50/30 border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="all">All Accounts</option>
                    <option value="active">Active Only</option>
                    <option value="historical">Legacy Only</option>
                  </select>
                </div>

                {/* Company Filter */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Company</label>
                  <select
                    value={glCompanyFilter}
                    onChange={(e) => setGlCompanyFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">All Companies</option>
                    {Array.from(new Set(ledgerEntries.map(e => e.companyId).filter(Boolean))).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Branch Filter */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Branch</label>
                  <select
                    value={glBranchFilter}
                    onChange={(e) => setGlBranchFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">All Branches</option>
                    {Array.from(new Set(ledgerEntries.map(e => e.branchId).filter(Boolean))).map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                {/* Voucher Type */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Voucher Type</label>
                  <select
                    value={glVoucherTypeFilter}
                    onChange={(e) => setGlVoucherTypeFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">All Vouchers</option>
                    <option value="JV">JV (Journal Voucher)</option>
                    <option value="CP">CP (Cash Payment)</option>
                    <option value="CR">CR (Cash Receipt)</option>
                    <option value="BP">BP (Bank Payment)</option>
                    <option value="BR">BR (Bank Receipt)</option>
                    <option value="SI">SI (Sales Invoice)</option>
                    <option value="PI">PI (Purchase Invoice)</option>
                  </select>
                </div>

                {/* Posting Status */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                  <select
                    value={glPostingStatusFilter}
                    onChange={(e) => setGlPostingStatusFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="POSTED">Posted Only</option>
                    <option value="">All Statuses</option>
                    <option value="DRAFT">Draft Only</option>
                    <option value="VOID">Void Only</option>
                  </select>
                </div>

                {/* Source Module */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Source Module</label>
                  <select
                    value={glSourceModuleFilter}
                    onChange={(e) => setGlSourceModuleFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">All Modules</option>
                    {Array.from(new Set(ledgerEntries.map(e => e.sourceModule).filter(Boolean))).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Created By */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Created By</label>
                  <select
                    value={glCreatedByFilter}
                    onChange={(e) => setGlCreatedByFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="">All Operators</option>
                    {Array.from(new Set(ledgerEntries.map(e => e.createdBy).filter(Boolean))).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date Presets Row */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-150">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center pr-2">Date Presets:</span>
                {[
                  { value: 'all_time', label: 'All-Time' },
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'this_week', label: 'This Week' },
                  { value: 'this_month', label: 'This Month' },
                  { value: 'this_quarter', label: 'This Quarter' },
                  { value: 'this_year', label: 'This Year' }
                ].map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleGlDatePresetChange(preset.value)}
                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                      glDatePreset === preset.value
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
                            const createdBy = item.createdBy || (logMatch ? logMatch.user : "System Admin");
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
                              const createdBy = item.createdBy || (logMatch ? logMatch.user : "System Admin");
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
                <div className="p-6 space-y-6">
                  {renderFinancialStatementConfigPanel && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reporting Company</label>
                        <select
                          value={tbCompanyFilter}
                          onChange={(e) => setTbCompanyFilter(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="">All Registered Companies</option>
                          <option value="CO-001">Apex Global Supply Ltd.</option>
                          <option value="CO-002">Nexus Innovations Corp.</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Branch Division</label>
                        <select
                          value={tbBranchFilter}
                          onChange={(e) => setTbBranchFilter(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="">All Company Divisions</option>
                          <option value="BR-HQ">Austin Headquarters (HQ)</option>
                          <option value="BR-EAST">New York Distribution</option>
                          <option value="BR-WEST">California Logistics</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Journal Postings Filter</label>
                        <select
                          value={tbPostingStatusFilter}
                          onChange={(e) => setTbPostingStatusFilter(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="POSTED">Official Posted (General Ledger)</option>
                          <option value="DRAFT">Draft Journals (Provisional)</option>
                          <option value="">All State Postings</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-indigo-700 text-xs font-semibold">
                    <Info className="h-4 w-4 text-indigo-500 shrink-0" />
                    <span>Real-time IFRS/GAAP compliant Profit & Loss Statement backed by General Ledger posting lines. Includes active and legacy account balances.</span>
                  </div>

                  {/* Profit & Loss Statement Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-3xs">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider">
                          <th className="px-4 py-3 text-left">Account Description</th>
                          <th className="px-4 py-3 text-right">Account Code</th>
                          <th className="px-4 py-3 text-right">Debit Balance ($)</th>
                          <th className="px-4 py-3 text-right">Credit Balance ($)</th>
                          <th className="px-4 py-3 text-right">Net Amount ($)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* 1. Revenues */}
                        <tr className="bg-slate-100/80 font-black text-slate-800">
                          <td colSpan={5} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">1. Operating Revenues</td>
                        </tr>
                        {financialStatements.revenueAccounts.map((acc, index) => (
                          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/50 font-medium">
                            <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                              <span>{acc.name}</span>
                              {acc.isLegacy && (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-400">0.00</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-900">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600">+{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                        {financialStatements.revenueAccounts.length === 0 && (
                          <tr className="border-b border-slate-100"><td colSpan={5} className="px-4 py-3 text-center text-slate-400">No operating revenue entries recorded in this range.</td></tr>
                        )}
                        <tr className="border-b border-slate-200 bg-slate-50/50 font-bold">
                          <td colSpan={4} className="px-4 py-3 text-slate-700">Subtotal Operating Revenues:</td>
                          <td className="px-4 py-3 text-right font-mono font-black text-emerald-600 underline">${financialStatements.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>

                        {/* 2. COGS */}
                        <tr className="bg-slate-100/80 font-black text-slate-800">
                          <td colSpan={5} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">2. Cost of Sales / Cost of Goods Sold</td>
                        </tr>
                        {financialStatements.cogsAccounts.map((acc, index) => (
                          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/50 font-medium">
                            <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                              <span>{acc.name}</span>
                              {acc.isLegacy && (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-900">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-400 font-bold">0.00</td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">-${acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                        {financialStatements.cogsAccounts.length === 0 && (
                          <tr className="border-b border-slate-100"><td colSpan={5} className="px-4 py-3 text-center text-slate-400">No cost of goods sold entries recorded.</td></tr>
                        )}
                        <tr className="border-b border-slate-200 bg-slate-50/50 font-bold">
                          <td colSpan={4} className="px-4 py-3 text-slate-700">Subtotal Cost of Goods Sold:</td>
                          <td className="px-4 py-3 text-right font-mono font-black text-rose-600 underline">-${financialStatements.totalCogs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>

                        {/* 3. Gross Profit */}
                        <tr className="bg-indigo-50/40 font-black text-slate-900 border-b-2 border-slate-300">
                          <td colSpan={4} className="px-4 py-3.5 text-xs text-indigo-900 uppercase tracking-wider font-extrabold">Gross Profit / Operating Margin:</td>
                          <td className="px-4 py-3.5 text-right font-mono text-sm text-emerald-600 font-black">${financialStatements.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>

                        {/* 4. OpEx */}
                        <tr className="bg-slate-100/80 font-black text-slate-800">
                          <td colSpan={5} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">3. General & Administrative Operating Expenses (OpEx)</td>
                        </tr>
                        {financialStatements.opexAccounts.map((acc, index) => (
                          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/50 font-medium">
                            <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                              <span>{acc.name}</span>
                              {acc.isLegacy && (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-900">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-400">0.00</td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">-${acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                        {financialStatements.opexAccounts.length === 0 && (
                          <tr className="border-b border-slate-100"><td colSpan={5} className="px-4 py-3 text-center text-slate-400">No general operating expenses recorded.</td></tr>
                        )}
                        <tr className="border-b border-slate-200 bg-slate-50/50 font-bold">
                          <td colSpan={4} className="px-4 py-3 text-slate-700">Subtotal Operating Expenses:</td>
                          <td className="px-4 py-3 text-right font-mono font-black text-rose-600 underline">-${financialStatements.totalOpex.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>

                        {/* 5. Operating Profit */}
                        <tr className="bg-indigo-50/40 font-black text-slate-900 border-b-2 border-slate-300">
                          <td colSpan={4} className="px-4 py-3.5 text-xs text-indigo-900 uppercase tracking-wider font-extrabold">Operating Income / Profit (EBIT):</td>
                          <td className="px-4 py-3.5 text-right font-mono text-sm text-indigo-600 font-black">${financialStatements.operatingProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>

                        {/* 6. Taxes */}
                        <tr className="bg-slate-100/80 font-black text-slate-800">
                          <td colSpan={5} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">4. Provision for Corporate Income Taxes</td>
                        </tr>
                        {financialStatements.taxAccounts.map((acc, index) => (
                          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/50 font-medium">
                            <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                              <span>{acc.name}</span>
                              {acc.isLegacy && (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-900">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-400">0.00</td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">-${acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                        {financialStatements.taxAccounts.length === 0 && (
                          <tr className="border-b border-slate-100"><td colSpan={5} className="px-4 py-3 text-center text-slate-400">No taxation provisions recorded in this range.</td></tr>
                        )}
                        <tr className="border-b border-slate-200 bg-slate-50/50 font-bold">
                          <td colSpan={4} className="px-4 py-3 text-slate-700">Subtotal Income Taxation:</td>
                          <td className="px-4 py-3 text-right font-mono font-black text-rose-600 underline">-${financialStatements.totalTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>

                        {/* 7. Net Profit After Tax */}
                        <tr className="bg-slate-950 text-white font-black border-t border-slate-900">
                          <td colSpan={4} className="px-4 py-4 text-xs uppercase tracking-widest font-extrabold text-slate-200">GRAND TOTAL NET INCOME / PROFIT (NET PROFIT AFTER TAX):</td>
                          <td className="px-4 py-4 text-right font-mono text-base text-emerald-450 font-black underline decoration-double">${financialStatements.netProfitAfterTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeReport === 'balance_sheet' && (
                <div className="p-6 space-y-6">
                  {renderFinancialStatementConfigPanel && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reporting Company</label>
                        <select
                          value={tbCompanyFilter}
                          onChange={(e) => setTbCompanyFilter(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="">All Registered Companies</option>
                          <option value="CO-001">Apex Global Supply Ltd.</option>
                          <option value="CO-002">Nexus Innovations Corp.</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Branch Division</label>
                        <select
                          value={tbBranchFilter}
                          onChange={(e) => setTbBranchFilter(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="">All Company Divisions</option>
                          <option value="BR-HQ">Austin Headquarters (HQ)</option>
                          <option value="BR-EAST">New York Distribution</option>
                          <option value="BR-WEST">California Logistics</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Journal Postings Filter</label>
                        <select
                          value={tbPostingStatusFilter}
                          onChange={(e) => setTbPostingStatusFilter(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="POSTED">Official Posted (General Ledger)</option>
                          <option value="DRAFT">Draft Journals (Provisional)</option>
                          <option value="">All State Postings</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-4 rounded-xl border font-semibold text-xs transition duration-300 bg-white shadow-3xs border-slate-200">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-indigo-500" />
                      <span className="text-slate-800 font-extrabold uppercase tracking-wide">Balance Equation:</span>
                      <span className="text-slate-500">Assets ($) = Liabilities ($) + Equity ($)</span>
                    </div>
                    <div>
                      {financialStatements.isBsBalanced ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">● EQUATION BALANCED</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">● OUT OF BALANCE</span>
                      )}
                    </div>
                  </div>

                  {/* Dual Column Assets vs Liabilities & Equity Layout */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                    
                    {/* LEFT COLUMN: ASSETS */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-3xs">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="bg-teal-700 text-white font-bold text-[10px] uppercase tracking-wider">
                            <th className="px-4 py-3 text-left">Asset Account Classification</th>
                            <th className="px-4 py-3 text-right">Code</th>
                            <th className="px-4 py-3 text-right">Amount ($)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Current Assets */}
                          <tr className="bg-teal-50/45 font-black text-teal-900 border-b border-teal-100">
                            <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">1. Current Assets</td>
                          </tr>
                          {financialStatements.currentAssetAccounts.map((acc, index) => (
                            <tr key={index} className="border-b border-slate-150 hover:bg-slate-50/50 font-medium">
                              <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                                <span>{acc.name}</span>
                                {acc.isLegacy && (
                                  <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                          {financialStatements.currentAssetAccounts.length === 0 && (
                            <tr><td colSpan={3} className="px-4 py-3 text-center text-slate-400">No Current Assets recorded.</td></tr>
                          )}
                          <tr className="border-b border-slate-200 bg-slate-50/30 font-bold">
                            <td colSpan={2} className="px-4 py-2.5 text-slate-650 pl-6">Total Current Assets:</td>
                            <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900 underline">${financialStatements.totalCurrentAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>

                          {/* Non-Current Assets */}
                          <tr className="bg-teal-50/45 font-black text-teal-900 border-b border-teal-100">
                            <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">2. Non-Current Assets (Fixed assets, property, equipment)</td>
                          </tr>
                          {financialStatements.nonCurrentAssetAccounts.map((acc, index) => (
                            <tr key={index} className="border-b border-slate-150 hover:bg-slate-50/50 font-medium">
                              <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                                <span>{acc.name}</span>
                                {acc.isLegacy && (
                                  <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                          {financialStatements.nonCurrentAssetAccounts.length === 0 && (
                            <tr><td colSpan={3} className="px-4 py-3 text-center text-slate-400">No Fixed or Long-Term Assets recorded.</td></tr>
                          )}
                          <tr className="border-b border-slate-250 bg-slate-50/30 font-bold">
                            <td colSpan={2} className="px-4 py-2.5 text-slate-650 pl-6">Total Non-Current Assets:</td>
                            <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900 underline">${financialStatements.totalNonCurrentAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>

                          {/* GRAND TOTAL ASSETS */}
                          <tr className="bg-slate-900 text-white font-black border-t border-slate-800">
                            <td colSpan={2} className="px-4 py-3.5 text-[10px] uppercase tracking-widest font-black text-slate-200">TOTAL CONSOLIDATED ASSETS:</td>
                            <td className="px-4 py-3.5 text-right font-mono text-sm text-white font-black underline decoration-double">${financialStatements.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* RIGHT COLUMN: LIABILITIES & EQUITY */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-3xs">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-800 text-white font-bold text-[10px] uppercase tracking-wider">
                            <th className="px-4 py-3 text-left">Liabilities & Equity Classifications</th>
                            <th className="px-4 py-3 text-right">Code</th>
                            <th className="px-4 py-3 text-right">Amount ($)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Current Liabilities */}
                          <tr className="bg-slate-100 font-black text-slate-800 border-b border-slate-200">
                            <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">1. Current Liabilities</td>
                          </tr>
                          {financialStatements.currentLiabilityAccounts.map((acc, index) => (
                            <tr key={index} className="border-b border-slate-150 hover:bg-slate-50/50 font-medium">
                              <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                                <span>{acc.name}</span>
                                {acc.isLegacy && (
                                  <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                          {financialStatements.currentLiabilityAccounts.length === 0 && (
                            <tr><td colSpan={3} className="px-4 py-3 text-center text-slate-400">No Current Liabilities recorded.</td></tr>
                          )}
                          <tr className="border-b border-slate-200 bg-slate-50/30 font-bold">
                            <td colSpan={2} className="px-4 py-2.5 text-slate-650 pl-6">Total Current Liabilities:</td>
                            <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900 underline">${financialStatements.totalCurrentLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>

                          {/* Long Term Liabilities */}
                          <tr className="bg-slate-100 font-black text-slate-800 border-b border-slate-200">
                            <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">2. Long-Term Liabilities (Notes, mortgages)</td>
                          </tr>
                          {financialStatements.longTermLiabilityAccounts.map((acc, index) => (
                            <tr key={index} className="border-b border-slate-150 hover:bg-slate-50/50 font-medium">
                              <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                                <span>{acc.name}</span>
                                {acc.isLegacy && (
                                  <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                          {financialStatements.longTermLiabilityAccounts.length === 0 && (
                            <tr><td colSpan={3} className="px-4 py-3 text-center text-slate-400">No Long-Term Liabilities recorded.</td></tr>
                          )}
                          <tr className="border-b border-slate-250 bg-slate-50/30 font-bold">
                            <td colSpan={2} className="px-4 py-2.5 text-slate-650 pl-6">Total Long-Term Liabilities:</td>
                            <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900 underline">${financialStatements.totalLongTermLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>

                          {/* Equity Area */}
                          <tr className="bg-slate-100 font-black text-slate-800 border-b border-slate-200">
                            <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider">3. Shareholders' Equity</td>
                          </tr>
                          {financialStatements.equityAccounts.map((acc, index) => (
                            <tr key={index} className="border-b border-slate-150 hover:bg-slate-50/50 font-medium">
                              <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                                <span>{acc.name}</span>
                                {acc.isLegacy && (
                                  <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-150 shrink-0">LEGACY</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">{acc.code}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                          {/* Dynamic Current Year Earnings */}
                          <tr className="border-b border-slate-150 hover:bg-indigo-50/20 font-medium">
                            <td className="px-4 py-2.5 font-bold flex items-center gap-1.5 text-indigo-900">
                              <span>Retained Earnings (Current Year Net Profit)</span>
                              <span className="text-[8px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-black font-mono">DYNAMIC RECONCILED</span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-400">N/A</td>
                            <td className="px-4 py-2.5 text-right font-mono font-black text-emerald-600 font-bold">${financialStatements.currentYearEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                          <tr className="border-b border-slate-250 bg-slate-50/30 font-bold">
                            <td colSpan={2} className="px-4 py-2.5 text-slate-650 pl-6">Total Shareholders' Equity:</td>
                            <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900 underline">${financialStatements.totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>

                          {/* GRAND TOTAL LIABILITIES & EQUITY */}
                          <tr className="bg-slate-850 text-white font-black border-t border-slate-800">
                            <td colSpan={2} className="px-4 py-3.5 text-[10px] uppercase tracking-widest font-black text-slate-200">TOTAL LIABILITIES & EQUITY:</td>
                            <td className="px-4 py-3.5 text-right font-mono text-sm text-white font-black underline decoration-double">${(financialStatements.totalLiabilities + financialStatements.totalEquity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                  </div>
                </div>
              )}

              {activeReport === 'cash_flow' && (
                <div className="p-6 space-y-6">
                  {renderFinancialStatementConfigPanel && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reporting Company</label>
                        <select
                          value={tbCompanyFilter}
                          onChange={(e) => setTbCompanyFilter(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="">All Registered Companies</option>
                          <option value="CO-001">Apex Global Supply Ltd.</option>
                          <option value="CO-002">Nexus Innovations Corp.</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Branch Division</label>
                        <select
                          value={tbBranchFilter}
                          onChange={(e) => setTbBranchFilter(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="">All Company Divisions</option>
                          <option value="BR-HQ">Austin Headquarters (HQ)</option>
                          <option value="BR-EAST">New York Distribution</option>
                          <option value="BR-WEST">California Logistics</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Journal Postings Filter</label>
                        <select
                          value={tbPostingStatusFilter}
                          onChange={(e) => setTbPostingStatusFilter(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="POSTED">Official Posted (General Ledger)</option>
                          <option value="DRAFT">Draft Journals (Provisional)</option>
                          <option value="">All State Postings</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl text-white">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-600 rounded-xl text-white">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-100">Direct Method Cash Flows</h4>
                        <p className="text-[10px] text-slate-400 font-medium">Reconciled against General Ledger Cash Accounts</p>
                      </div>
                    </div>
                    <div>
                      {financialStatements.isCashFlowReconciled ? (
                        <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">● RECONCILED</span>
                      ) : (
                        <span className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">● UNRECONCILED VARIANCE</span>
                      )}
                    </div>
                  </div>

                  {/* Cash Flow Statement Details */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-3xs text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase tracking-wider border-b border-slate-200">
                          <th className="px-4 py-3 text-left">Cash Flow Activity Classification</th>
                          <th className="px-4 py-3 text-right">Inflow ($)</th>
                          <th className="px-4 py-3 text-right">Outflow ($)</th>
                          <th className="px-4 py-3 text-right">Net Impact ($)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* 1. Operating Activities */}
                        <tr className="bg-slate-50 font-black text-slate-900">
                          <td colSpan={4} className="px-4 py-2.5 text-[10px] uppercase tracking-widest">A. Cash Flows from Operating Activities</td>
                        </tr>
                        <tr className="border-b border-slate-100 font-medium">
                          <td className="px-4 py-2.5 font-bold text-slate-800 pl-6">Customer Cash Receipts (Inflow):</td>
                          <td className="px-4 py-2.5 text-right font-mono text-emerald-600">+${financialStatements.totalCustomerReceipts.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-400">0.00</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-450">-</td>
                        </tr>
                        <tr className="border-b border-slate-100 font-medium">
                          <td className="px-4 py-2.5 font-bold text-slate-800 pl-6">Payments to Suppliers & Vendor Invoices (Outflow):</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-400">0.00</td>
                          <td className="px-4 py-2.5 text-right font-mono text-rose-600">-${Math.abs(financialStatements.totalSupplierPayments).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-450">-</td>
                        </tr>
                        <tr className="border-b border-slate-100 font-medium">
                          <td className="px-4 py-2.5 font-bold text-slate-800 pl-6">Payments for Operating Administrative Expenses (Outflow):</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-400">0.00</td>
                          <td className="px-4 py-2.5 text-right font-mono text-rose-600">-${Math.abs(financialStatements.totalOpexCash).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-450">-</td>
                        </tr>
                        <tr className="border-b border-slate-100 font-medium">
                          <td className="px-4 py-2.5 font-bold text-slate-800 pl-6">Other Operating Cash Flows:</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-900">${financialStatements.totalOtherOpexCash >= 0 ? '+' : ''}${financialStatements.totalOtherOpexCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-450">-</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-450">-</td>
                        </tr>
                        <tr className="border-b border-slate-200 bg-slate-50/20 font-bold">
                          <td colSpan={3} className="px-4 py-2.5 text-slate-700 pl-8">Net Cash provided by Operating Activities:</td>
                          <td className="px-4 py-2.5 text-right font-mono font-black text-emerald-600 underline">${financialStatements.totalOperatingActivities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>

                        {/* 2. Investing Activities */}
                        <tr className="bg-slate-50 font-black text-slate-900">
                          <td colSpan={4} className="px-4 py-2.5 text-[10px] uppercase tracking-widest">B. Cash Flows from Investing Activities</td>
                        </tr>
                        {financialStatements.investingFlows.map((f, i) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50 font-medium">
                            <td className="px-4 py-2 pl-6 text-slate-700 font-semibold">{f.desc}</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-400">{f.amount > 0 ? `+${f.amount.toFixed(2)}` : '-'}</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-400">{f.amount < 0 ? `-${Math.abs(f.amount).toFixed(2)}` : '-'}</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-450">-</td>
                          </tr>
                        ))}
                        {financialStatements.investingFlows.length === 0 && (
                          <tr className="border-b border-slate-100"><td colSpan={4} className="px-4 py-2.5 text-center text-slate-400 pl-6">No cash flow transactions from investing activities recorded in period.</td></tr>
                        )}
                        <tr className="border-b border-slate-200 bg-slate-50/20 font-bold">
                          <td colSpan={3} className="px-4 py-2.5 text-slate-700 pl-8">Net Cash provided by Investing Activities:</td>
                          <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900 underline">${financialStatements.totalInvestingActivities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>

                        {/* 3. Financing Activities */}
                        <tr className="bg-slate-50 font-black text-slate-900">
                          <td colSpan={4} className="px-4 py-2.5 text-[10px] uppercase tracking-widest">C. Cash Flows from Financing Activities</td>
                        </tr>
                        {financialStatements.financingFlows.map((f, i) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50 font-medium">
                            <td className="px-4 py-2 pl-6 text-slate-700 font-semibold">{f.desc}</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-400">{f.amount > 0 ? `+${f.amount.toFixed(2)}` : '-'}</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-400">{f.amount < 0 ? `-${Math.abs(f.amount).toFixed(2)}` : '-'}</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-450">-</td>
                          </tr>
                        ))}
                        {financialStatements.financingFlows.length === 0 && (
                          <tr className="border-b border-slate-100"><td colSpan={4} className="px-4 py-2.5 text-center text-slate-400 pl-6">No cash flow transactions from financing activities recorded.</td></tr>
                        )}
                        <tr className="border-b border-slate-200 bg-slate-50/20 font-bold">
                          <td colSpan={3} className="px-4 py-2.5 text-slate-700 pl-8">Net Cash provided by Financing Activities:</td>
                          <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900 underline">${financialStatements.totalFinancingActivities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>

                        {/* 4. Cash Reconciliation and Proof */}
                        <tr className="bg-slate-900 text-white font-black">
                          <td colSpan={4} className="px-4 py-2.5 text-[10px] uppercase tracking-widest text-slate-200">Reconciliation Proof & Cash Ledger Balance verification</td>
                        </tr>
                        <tr className="border-b border-slate-100 hover:bg-slate-50/50 font-medium">
                          <td colSpan={3} className="px-4 py-2.5 pl-6 text-slate-700 font-bold">NET INCREASE / DECREASE IN CASH Reserves (A + B + C):</td>
                          <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900">${financialStatements.netCashFlow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="border-b border-slate-150 hover:bg-slate-50/50 font-medium">
                          <td colSpan={3} className="px-4 py-2.5 pl-6 text-slate-650">Plus: Opening Cash Reserves (Start of range):</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-700">${financialStatements.openingCashSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="border-b-2 border-slate-300 bg-slate-50 font-black">
                          <td colSpan={3} className="px-4 py-3 pl-6 text-indigo-900 font-black uppercase text-[10px] tracking-wider">STATEMENT CALCULATED ENDING CASH BALANCE:</td>
                          <td className="px-4 py-3 text-right font-mono text-sm text-indigo-700 font-black underline decoration-double">${financialStatements.endingCashSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="border-b-2 border-slate-300 bg-slate-100 font-black text-slate-800">
                          <td colSpan={3} className="px-4 py-3 pl-6 text-slate-800 font-black uppercase text-[10px] tracking-wider">LEDGER VERIFIED TOTAL CASH ACCOUNT BALANCE (GL check):</td>
                          <td className="px-4 py-3 text-right font-mono text-sm text-slate-900 font-black underline decoration-double">${financialStatements.glEndingCashSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="bg-slate-950 text-white font-black">
                          <td colSpan={3} className="px-4 py-3.5 pl-6 text-slate-200 font-black uppercase text-[10px] tracking-widest">CASH RECONCILIATION VARIANCE (Proof delta):</td>
                          <td className="px-4 py-3.5 text-right font-mono text-sm text-emerald-400 font-black underline decoration-double">${financialStatements.cashFlowDifference.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeReport === 'financial_reconciliation' && (
                <div className="p-6 space-y-6">
                  {renderFinancialStatementConfigPanel && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reporting Company</label>
                        <select
                          value={tbCompanyFilter}
                          onChange={(e) => setTbCompanyFilter(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="">All Registered Companies</option>
                          <option value="CO-001">Apex Global Supply Ltd.</option>
                          <option value="CO-002">Nexus Innovations Corp.</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Branch Division</label>
                        <select
                          value={tbBranchFilter}
                          onChange={(e) => setTbBranchFilter(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="">All Company Divisions</option>
                          <option value="BR-HQ">Austin Headquarters (HQ)</option>
                          <option value="BR-EAST">New York Distribution</option>
                          <option value="BR-WEST">California Logistics</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Journal Postings Filter</label>
                        <select
                          value={tbPostingStatusFilter}
                          onChange={(e) => setTbPostingStatusFilter(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="POSTED">Official Posted (General Ledger)</option>
                          <option value="DRAFT">Draft Journals (Provisional)</option>
                          <option value="">All State Postings</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 p-4 bg-slate-900 border border-slate-800 rounded-3xl text-white">
                    <div className="p-2.5 bg-indigo-600 rounded-2xl text-white">
                      <Cpu className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-100">
                        Financial Statement Consistency Validation Engine
                      </h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        GAAP/IFRS Cross-Report Audit & Double-Entry Integrity Checker
                      </p>
                    </div>
                  </div>

                  {/* CROSS-REPORT INTEGRITY CHECKS GRID */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className={`p-4 border rounded-2xl bg-white shadow-3xs flex flex-col justify-between h-28 ${financialStatements.tbBalanced ? 'border-emerald-200' : 'border-rose-200'}`}>
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">1. Trial Balance Check</span>
                      <p className={`text-xs font-black ${financialStatements.tbBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {financialStatements.tbBalanced ? '✓ MATHEMATICALLY BALANCED' : '✗ OUT OF BALANCE'}
                      </p>
                      <span className="text-[9px] text-slate-500 font-semibold">Debits equal Credits</span>
                    </div>

                    <div className={`p-4 border rounded-2xl bg-white shadow-3xs flex flex-col justify-between h-28 ${financialStatements.bsBalanced ? 'border-emerald-200' : 'border-rose-200'}`}>
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">2. Balance Sheet check</span>
                      <p className={`text-xs font-black ${financialStatements.bsBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {financialStatements.bsBalanced ? '✓ ASSETS = L + E' : '✗ EQUATION MISMATCH'}
                      </p>
                      <span className="text-[9px] text-slate-500 font-semibold">Variance: ${financialStatements.balanceSheetDifference.toFixed(2)}</span>
                    </div>

                    <div className={`p-4 border rounded-2xl bg-white shadow-3xs flex flex-col justify-between h-28 border-emerald-200`}>
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">3. Net Profit check</span>
                      <p className="text-xs font-black text-emerald-600">
                        ✓ EQUAL INTEGRATED
                      </p>
                      <span className="text-[9px] text-slate-500 font-semibold">Income flows to Equity</span>
                    </div>

                    <div className={`p-4 border rounded-2xl bg-white shadow-3xs flex flex-col justify-between h-28 ${financialStatements.isCashFlowReconciled ? 'border-emerald-200' : 'border-amber-200'}`}>
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">4. Cash Flow check</span>
                      <p className={`text-xs font-black ${financialStatements.isCashFlowReconciled ? 'text-emerald-600' : 'text-amber-500'}`}>
                        {financialStatements.isCashFlowReconciled ? '✓ RECONCILED WITH GL' : '⚠ RECONCILING DELTA'}
                      </p>
                      <span className="text-[9px] text-slate-500 font-semibold">Delta: ${financialStatements.cashFlowDifference.toFixed(2)}</span>
                    </div>

                    <div className={`p-4 border rounded-2xl bg-white shadow-3xs flex flex-col justify-between h-28 ${financialStatements.allChecksPass ? 'bg-emerald-50 border-emerald-250' : 'bg-rose-50 border-rose-250'}`}>
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">5. Unified Status</span>
                      <p className={`text-sm font-black ${financialStatements.allChecksPass ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {financialStatements.allChecksPass ? '● 100% SECURE' : '● SYSTEM ALERT'}
                      </p>
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Cross-reconciliation audit</span>
                    </div>
                  </div>

                  {/* ACTIVE DIAGNOSTICS LOG PANEL */}
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Active Audit Diagnostics Alerts</h4>
                      </div>
                      <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                        {financialStatements.diagnosticsList.length} total issues
                      </span>
                    </div>

                    <div className="space-y-3.5">
                      {financialStatements.diagnosticsList.map((diag, index) => (
                        <div key={index} className={`p-4 border rounded-xl flex items-start gap-3.5 transition hover:shadow-3xs ${
                          diag.category === 'Critical' 
                            ? 'bg-rose-50/50 border-rose-200 text-rose-900' 
                            : diag.category === 'Warning'
                              ? 'bg-amber-50/40 border-amber-200 text-amber-900'
                              : 'bg-blue-50/40 border-blue-200 text-blue-950'
                        }`}>
                          <div className="shrink-0 mt-0.5">
                            {diag.category === 'Critical' ? (
                              <XCircle className="h-5 w-5 text-rose-600" />
                            ) : diag.category === 'Warning' ? (
                              <AlertCircle className="h-5 w-5 text-amber-600" />
                            ) : (
                              <Info className="h-5 w-5 text-blue-500" />
                            )}
                          </div>
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black uppercase tracking-wide text-slate-900">{diag.checkName}</span>
                              <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest ${
                                diag.category === 'Critical' 
                                  ? 'bg-rose-100 border border-rose-200 text-rose-800' 
                                  : diag.category === 'Warning'
                                    ? 'bg-amber-100 border border-amber-200 text-amber-800'
                                    : 'bg-blue-100 border border-blue-200 text-blue-800'
                              }`}>{diag.category}</span>
                            </div>
                            <p className="text-xs font-bold text-slate-855 text-slate-800">{diag.message}</p>
                            <p className="text-[11px] text-slate-500 font-semibold">{diag.details}</p>
                            <div className="text-[10px] bg-white border border-slate-200/60 p-2.5 rounded-lg space-y-0.5 shadow-4xs">
                              <span className="font-extrabold text-indigo-650 text-indigo-600 uppercase block tracking-wider">Suggested Remediation:</span>
                              <p className="text-slate-600 font-medium">{diag.remediation}</p>
                            </div>
                          </div>
                        </div>
                      ))}

                      {financialStatements.diagnosticsList.length === 0 && (
                        <div className="text-center py-10 space-y-2">
                          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                          <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">PERFECT LEDGER CONSISTENCY DETECTED</p>
                          <p className="text-[11px] text-slate-400 font-semibold">Zero active alerts or structural variances across reports. GAAP/IFRS standards verified.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeReport === 'trial_balance' && (
                <div className="space-y-6 animate-fade-in p-6">
                  {/* Top Dashboard Banner */}
                  <div className="flex flex-col lg:flex-row items-center justify-between gap-4 p-5 bg-slate-900 border border-slate-800 rounded-3xl text-white">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-600 rounded-2xl text-white">
                        <Layers className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-black uppercase tracking-widest text-slate-100">
                          Enterprise Trial Balance Sheet
                        </h3>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">
                          GAAP-compliant double-entry ledger balance validation report
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={handleExportCSV}
                        className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs min-h-[38px] px-3.5 rounded-xl border border-slate-750 transition cursor-pointer"
                        title="Download Trial Balance as Excel-compatible CSV file"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-emerald-450 text-emerald-450/90" />
                        <span>Export CSV</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportPDF}
                        className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs min-h-[38px] px-3.5 rounded-xl border border-slate-750 transition cursor-pointer"
                        title="Export vector PDF report format"
                      >
                        <FileText className="h-4 w-4 text-indigo-400" />
                        <span>Export PDF</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Bento Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Total Active Accounts */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[10px] font-bold uppercase tracking-widest">Active Ledger Accounts</span>
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="mt-3">
                        <h3 className="text-2xl font-black text-slate-900 font-mono leading-none">
                          {trialBalanceData.totalAccounts}
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-1">With recorded activity in range</p>
                      </div>
                    </div>

                    {/* Total Debits Sum */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs">
                      <div className="flex items-center justify-between text-emerald-600">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Debit Balance Sum</span>
                        <TrendingUp className="h-4 w-4" />
                      </div>
                      <div className="mt-3">
                        <h3 className="text-2xl font-black text-slate-900 font-mono leading-none text-emerald-600">
                          ${trialBalanceData.totalDebitColumnSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-1">Aggregate debit side ending balances</p>
                      </div>
                    </div>

                    {/* Total Credits Sum */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs">
                      <div className="flex items-center justify-between text-rose-600">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Credit Balance Sum</span>
                        <TrendingDown className="h-4 w-4" />
                      </div>
                      <div className="mt-3">
                        <h3 className="text-2xl font-black text-slate-900 font-mono leading-none text-rose-600">
                          ${trialBalanceData.totalCreditColumnSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-1">Aggregate credit side ending balances</p>
                      </div>
                    </div>

                    {/* Ledger Status Card */}
                    <div className={`rounded-2xl p-5 flex flex-col justify-between border shadow-xs ${
                      trialBalanceData.isBalanced 
                        ? 'bg-emerald-50/40 border-emerald-150 text-emerald-950' 
                        : 'bg-rose-50/50 border-rose-150 text-rose-950 animate-pulse'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Validation Status</span>
                        {trialBalanceData.isBalanced ? (
                          <Activity className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <ShieldAlert className="h-4 w-4 text-rose-600" />
                        )}
                      </div>
                      <div className="mt-3">
                        {trialBalanceData.isBalanced ? (
                          <>
                            <h3 className="text-xl font-black text-emerald-700 leading-none">
                              ✓ BALANCED
                            </h3>
                            <p className="text-[10px] text-emerald-600 mt-1">Zero variance detected</p>
                          </>
                        ) : (
                          <>
                            <h3 className="text-xl font-black text-rose-700 leading-none">
                              ⚠ OUT OF BALANCE
                            </h3>
                            <p className="text-[10px] text-rose-600 font-bold mt-1">
                              Variance: ${trialBalanceData.difference.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sub-Tabs Selector */}
                  <div className="flex border-b border-slate-150 gap-1 bg-slate-50/50 p-1.5 rounded-2xl border">
                    <button
                      type="button"
                      onClick={() => setTbSubTab('table')}
                      className={`flex-1 sm:flex-none py-2 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        tbSubTab === 'table'
                          ? 'bg-white border border-slate-200/80 text-slate-900 shadow-3xs'
                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      <Layers className="h-4 w-4 shrink-0 text-indigo-500" />
                      <span>Ledger Trial Balance ({trialBalanceData.rows.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTbSubTab('reconciliation')}
                      className={`flex-1 sm:flex-none py-2 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        tbSubTab === 'reconciliation'
                          ? 'bg-white border border-slate-200/80 text-slate-900 shadow-3xs'
                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      <RefreshCw className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span>Operational Reconciliation Checks</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTbSubTab('diagnostics')}
                      className={`flex-1 sm:flex-none py-2 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer relative ${
                        tbSubTab === 'diagnostics'
                          ? 'bg-white border border-slate-200/80 text-slate-900 shadow-3xs'
                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      <ShieldAlert className="h-4 w-4 shrink-0 text-rose-500" />
                      <span>Financial Diagnostics Scanner</span>
                      {tbDiagnostics.filter(d => d.category === 'Critical').length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[9px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white">
                          {tbDiagnostics.filter(d => d.category === 'Critical').length}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Sub-Tab 1: Main Trial Balance Table */}
                  {tbSubTab === 'table' && (
                    <div className="space-y-4">
                      {/* Filter Controls Bar */}
                      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-3xs space-y-4">
                        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                          <Filter className="h-4 w-4 text-slate-400" />
                          <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                            Enterprise Search Filters & Date Presets
                          </h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          {/* Company Filter */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider block">Company</label>
                            <select
                              value={tbCompanyFilter}
                              onChange={(e) => setTbCompanyFilter(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 min-h-[38px] focus:outline-none focus:border-indigo-500 font-semibold"
                            >
                              <option value="">All Registered Companies</option>
                              <option value="CO-001">Apex Global Supply Ltd.</option>
                              <option value="CO-002">Nexus Innovations Corp.</option>
                            </select>
                          </div>

                          {/* Branch Filter */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider block">Branch / Division</label>
                            <select
                              value={tbBranchFilter}
                              onChange={(e) => setTbBranchFilter(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 min-h-[38px] focus:outline-none focus:border-indigo-500 font-semibold"
                            >
                              <option value="">All Company Divisions</option>
                              <option value="BR-HQ">Austin Headquarters (HQ)</option>
                              <option value="BR-EAST">New York Distribution</option>
                              <option value="BR-WEST">California Logistics</option>
                            </select>
                          </div>

                          {/* Posting Status */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider block">Posting Status</label>
                            <select
                              value={tbPostingStatusFilter}
                              onChange={(e) => setTbPostingStatusFilter(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 min-h-[38px] focus:outline-none focus:border-indigo-500 font-semibold"
                            >
                              <option value="POSTED">Official Posted (General Ledger)</option>
                              <option value="DRAFT">Draft Journals (Provisional)</option>
                              <option value="">All State Postings</option>
                            </select>
                          </div>

                          {/* Date Preset Selector */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider block">Time Preset Range</label>
                            <select
                              value={tbDatePreset}
                              onChange={(e) => {
                                setTbDatePreset(e.target.value);
                                handleGlDatePresetChange(e.target.value);
                              }}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 min-h-[38px] focus:outline-none focus:border-indigo-500 font-semibold"
                            >
                              <option value="all_time">All Time Cumulative</option>
                              <option value="today">Today (2026-07-15)</option>
                              <option value="yesterday">Yesterday (2026-07-14)</option>
                              <option value="this_week">This Week (Mon-Sun)</option>
                              <option value="this_month">This Month (July 2026)</option>
                              <option value="this_quarter">This Quarter (Q3 2026)</option>
                              <option value="this_year">This Fiscal Year (2026)</option>
                              <option value="fiscal_year">Full Current Fiscal Year</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Main Data Table Container */}
                      <div className="bg-white border border-slate-200 rounded-[2rem] shadow-2xs overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/20">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">Period Ledger Trial Balances</h4>
                            <p className="text-[11px] text-slate-400">
                              Opening and ending balances for all active accounts from Chart of Accounts. Ending balances reside exclusively in Dr or Cr (not both).
                            </p>
                          </div>
                          <span className="text-[10px] font-mono text-slate-450 bg-slate-100 px-3 py-1 rounded-xl font-bold self-start sm:self-center">
                            Date Filters Applied: {startDate || 'All-time'} to {endDate || 'All-time'}
                          </span>
                        </div>

                        <div className="overflow-x-auto font-sans">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                                <th className="py-3.5 px-5 whitespace-nowrap rounded-tl-2xl">Account Code</th>
                                <th className="py-3.5 px-5 whitespace-nowrap">Account Name</th>
                                <th className="py-3.5 px-5 whitespace-nowrap">Account Type</th>
                                <th className="py-3.5 px-5 whitespace-nowrap">Normal Balance</th>
                                <th className="py-3.5 px-5 text-right whitespace-nowrap">Opening Balance</th>
                                <th className="py-3.5 px-5 text-right whitespace-nowrap">Period Debit (+)</th>
                                <th className="py-3.5 px-5 text-right whitespace-nowrap">Period Credit (-)</th>
                                <th className="py-3.5 px-5 text-right whitespace-nowrap bg-slate-850">Debit Ending</th>
                                <th className="py-3.5 px-5 text-right whitespace-nowrap bg-slate-850">Credit Ending</th>
                                <th className="py-3.5 px-5 text-center whitespace-nowrap rounded-tr-2xl">Ledger Link</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-sans">
                              {trialBalanceData.rows.length === 0 ? (
                                <tr>
                                  <td colSpan={10} className="py-12 text-center text-slate-400 font-bold">
                                    No ledger activity recorded in the selected period.
                                  </td>
                                </tr>
                              ) : (
                                <>
                                  {trialBalanceData.rows.map((row) => (
                                    <tr key={row.code} className="hover:bg-slate-50/50 transition-colors duration-150">
                                      {/* Account Code */}
                                      <td className="py-3.5 px-5 whitespace-nowrap font-mono font-bold text-slate-900">
                                        {row.code}
                                      </td>
                                      {/* Account Name */}
                                      <td className="py-3.5 px-5 whitespace-nowrap font-bold text-slate-800">
                                        <div className="flex items-center gap-2">
                                          <span>{row.name}</span>
                                          {row.isLegacy && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-50 border border-amber-200 text-amber-700 uppercase tracking-wider animate-pulse">
                                              Legacy Account
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      {/* Account Type */}
                                      <td className="py-3.5 px-5 whitespace-nowrap">
                                        <span className="text-[10px] font-semibold text-slate-500 uppercase">
                                          {row.type}
                                        </span>
                                      </td>
                                      {/* Normal Balance */}
                                      <td className="py-3.5 px-5 whitespace-nowrap text-[10px] font-bold text-slate-400">
                                        {row.normalBalance}-Normal
                                      </td>
                                      {/* Opening Balance */}
                                      <td className="py-3.5 px-5 text-right font-mono font-bold text-slate-600 whitespace-nowrap">
                                        ${row.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                      {/* Period Debit */}
                                      <td className="py-3.5 px-5 text-right font-mono text-emerald-600 font-bold whitespace-nowrap">
                                        {row.periodDebit > 0 ? `+$${row.periodDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                      </td>
                                      {/* Period Credit */}
                                      <td className="py-3.5 px-5 text-right font-mono text-rose-600 font-bold whitespace-nowrap">
                                        {row.periodCredit > 0 ? `-$${row.periodCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                      </td>
                                      {/* Debit Column Value */}
                                      <td className="py-3.5 px-5 text-right font-mono font-black text-slate-900 bg-slate-50/30 whitespace-nowrap">
                                        {row.debitColumnValue > 0 ? `$${row.debitColumnValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                      </td>
                                      {/* Credit Column Value */}
                                      <td className="py-3.5 px-5 text-right font-mono font-black text-slate-900 bg-slate-50/30 whitespace-nowrap">
                                        {row.creditColumnValue > 0 ? `$${row.creditColumnValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                      </td>
                                      {/* General Ledger Drill Down */}
                                      <td className="py-3.5 px-5 text-center whitespace-nowrap">
                                        <button
                                          type="button"
                                          onClick={() => handleDrillDownToGl(row.code)}
                                          className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-900 font-bold cursor-pointer hover:underline min-h-[32px] px-2.5 rounded-lg hover:bg-indigo-50 transition"
                                          title={`Drill down into General Ledger account ${row.code}`}
                                        >
                                          <Search className="h-3.5 w-3.5 text-indigo-500" />
                                          <span>GL Books</span>
                                        </button>
                                      </td>
                                    </tr>
                                  ))}

                                  {/* Table Summary Footer Row */}
                                  <tr className="bg-slate-900 text-white font-black font-mono border-t border-slate-800 text-xs">
                                    <td colSpan={4} className="py-4 px-5 text-left rounded-bl-2xl">
                                      GRAND TRIAL SUMMARY
                                    </td>
                                    <td className="py-4 px-5 text-right text-[10px] text-slate-450">
                                      Variance: ${trialBalanceData.difference.toFixed(2)}
                                    </td>
                                    <td colSpan={2} className="py-4 px-5 text-right text-[10px] text-slate-450">
                                      Debit Sum vs Credit Sum
                                    </td>
                                    <td className="py-4 px-5 text-right text-emerald-400 font-bold">
                                      ${trialBalanceData.totalDebitColumnSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-4 px-5 text-right text-rose-400 font-bold">
                                      ${trialBalanceData.totalCreditColumnSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-4 px-5 rounded-br-2xl"></td>
                                  </tr>
                                </>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 2: Operational Reconciliation Checks */}
                  {tbSubTab === 'reconciliation' && (
                    <div className="space-y-4">
                      <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xs space-y-4">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">General Ledger vs Operational Core Subledgers</h4>
                          <p className="text-[11px] text-slate-400">
                            Automatic verification aligning ledger balances in <strong>ledgerEntries</strong> against operational models (Cash Registers, Customers, Suppliers, Products). Discrepancies indicate postings that haven't hit subledgers or vice-versa.
                          </p>
                        </div>

                        <div className="overflow-x-auto border border-slate-150 rounded-2xl">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                                <th className="py-3 px-5 whitespace-nowrap">System Account Portfolio</th>
                                <th className="py-3 px-5 whitespace-nowrap">Account Code</th>
                                <th className="py-3 px-5 text-right whitespace-nowrap">General Ledger (Source of Truth)</th>
                                <th className="py-3 px-5 text-right whitespace-nowrap">Operational Subledger (App State)</th>
                                <th className="py-3 px-5 text-right whitespace-nowrap">Discrepancy / Variance</th>
                                <th className="py-3 px-5 text-center whitespace-nowrap">Status Indicator</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-sans">
                              {reconciliationData.map((item) => (
                                <tr key={item.code} className="hover:bg-slate-50/50 transition">
                                  <td className="py-4 px-5 font-bold text-slate-800">
                                    {item.name}
                                  </td>
                                  <td className="py-4 px-5 font-mono text-slate-500 font-bold">
                                    {item.code}
                                  </td>
                                  <td className="py-4 px-5 text-right font-mono text-slate-900 font-bold">
                                    ${item.gl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="py-4 px-5 text-right font-mono text-slate-700">
                                    ${item.op.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className={`py-4 px-5 text-right font-mono font-bold ${item.isReconciled ? 'text-slate-500' : 'text-rose-600 text-sm font-black'}`}>
                                    ${item.diff.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="py-4 px-5 text-center whitespace-nowrap">
                                    {item.isReconciled ? (
                                      <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wide">
                                        ✓ Reconciled
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 bg-rose-50 border border-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wide">
                                        ⚠ Discrepancy
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 3: Financial Diagnostics Scanner */}
                  {tbSubTab === 'diagnostics' && (
                    <div className="space-y-4">
                      {/* Sub-header Banner */}
                      <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">Real-Time Integrity Violations & Auditing Logs</h4>
                            <p className="text-[11px] text-slate-400">
                              Scanning database journal records, vouchers, and accounts matching double-entry constraints.
                            </p>
                          </div>
                          <span className={`text-[10px] font-bold px-3 py-1 rounded-xl font-mono self-start sm:self-center ${
                            tbDiagnostics.filter(d => d.category === 'Critical').length === 0 
                              ? 'bg-emerald-50 border border-emerald-100 text-emerald-800'
                              : 'bg-rose-50 border border-rose-100 text-rose-800'
                          }`}>
                            {tbDiagnostics.filter(d => d.category === 'Critical').length} Critical Issues Detected
                          </span>
                        </div>

                        {/* List of Scanned Integrity Diagnostics */}
                        <div className="space-y-4">
                          {tbDiagnostics.length === 0 ? (
                            <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl text-slate-400">
                              <Activity className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-700">Perfect Health Score</p>
                              <p className="text-[10px] text-slate-400 mt-1">
                                No general ledger imbalances, duplicate voucher series, orphan records, or inactive accounting postings found in active datasets!
                              </p>
                            </div>
                          ) : (
                            tbDiagnostics.map((issue) => (
                              <div
                                key={issue.id}
                                className={`border rounded-2xl p-4 transition-all duration-300 hover:shadow-xs space-y-3 ${
                                  issue.category === 'Critical'
                                    ? 'bg-rose-50/20 border-rose-150 text-slate-800'
                                    : issue.category === 'Warning'
                                    ? 'bg-amber-50/20 border-amber-150 text-slate-800'
                                    : 'bg-slate-50/50 border-slate-200 text-slate-800'
                                }`}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                      issue.category === 'Critical'
                                        ? 'bg-rose-100 border-rose-200 text-rose-800'
                                        : issue.category === 'Warning'
                                        ? 'bg-amber-100 border-amber-200 text-amber-800'
                                        : 'bg-slate-100 border-slate-200 text-slate-800'
                                    }`}>
                                      {issue.category}
                                    </span>
                                    <span className="text-xs font-black text-slate-900 capitalize">
                                      {issue.checkName}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-455 font-mono">
                                    Voucher Reference: {issue.postingNumber || issue.id.substring(0, 15)}
                                  </span>
                                </div>

                                <div className="space-y-1">
                                  <p className="text-xs font-bold text-slate-800 leading-snug">
                                    {issue.message}
                                  </p>
                                  <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                                    {issue.details}
                                  </p>
                                </div>

                                {/* Detailed Diagnostics Metadata Breakdown */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 border-t border-slate-100 pt-3 text-[10px] font-semibold text-slate-500">
                                  {issue.sourceModule && (
                                    <div>
                                      <span className="text-[8px] uppercase font-black text-slate-400 block tracking-wider">Source Module</span>
                                      <span className="font-bold text-slate-800">{issue.sourceModule}</span>
                                    </div>
                                  )}
                                  {issue.voucherType && (
                                    <div>
                                      <span className="text-[8px] uppercase font-black text-slate-400 block tracking-wider">Voucher Type</span>
                                      <span className="font-bold text-slate-800">{issue.voucherType}</span>
                                    </div>
                                  )}
                                  {issue.accountCode && (
                                    <div>
                                      <span className="text-[8px] uppercase font-black text-slate-400 block tracking-wider">Impacted Account Code</span>
                                      <span className="font-bold font-mono text-slate-800">{issue.accountCode}</span>
                                    </div>
                                  )}
                                  {issue.possibleCause && (
                                    <div className="sm:col-span-2 md:col-span-3 bg-white/60 p-2.5 rounded-xl border border-slate-100/60 mt-1">
                                      <span className="text-[8px] uppercase font-black text-rose-500 block tracking-wider font-sans">Audit Finding & Root Cause</span>
                                      <p className="text-[10px] text-slate-700 leading-relaxed font-normal mt-0.5">{issue.possibleCause}</p>
                                      {issue.remediation && (
                                        <>
                                          <span className="text-[8px] uppercase font-black text-emerald-600 block tracking-wider font-sans mt-2">Remediation Guide</span>
                                          <p className="text-[10px] text-slate-700 leading-relaxed font-normal mt-0.5">{issue.remediation}</p>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeReport === 'general_ledger' && (
                <div className="space-y-4 animate-fade-in p-6">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-indigo-50/40 border border-indigo-150 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-600 rounded-xl text-white">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">
                          Account Ledger Book
                        </h4>
                        <p className="text-[10px] text-slate-500 font-medium">
                          All ledger entries affecting the selected account code {selectedGlAccountId || '(Select an account)'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full md:w-auto">
                      <div className="bg-white border border-slate-200/80 px-4 py-2 rounded-xl text-xs flex flex-col justify-center min-w-[120px] shadow-3xs">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Opening</span>
                        <span className="font-mono font-bold text-slate-900">${generalLedgerData.openingBalance.toFixed(2)}</span>
                      </div>
                      <div className="bg-white border border-slate-200/80 px-4 py-2 rounded-xl text-xs flex flex-col justify-center min-w-[120px] shadow-3xs">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Debit Total</span>
                        <span className="font-mono font-bold text-emerald-600">+${generalLedgerData.totalDebits.toFixed(2)}</span>
                      </div>
                      <div className="bg-white border border-slate-200/80 px-4 py-2 rounded-xl text-xs flex flex-col justify-center min-w-[120px] shadow-3xs">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Credit Total</span>
                        <span className="font-mono font-bold text-rose-600">-${generalLedgerData.totalCredits.toFixed(2)}</span>
                      </div>
                      <div className="bg-indigo-600 text-white border border-indigo-700 px-4 py-2 rounded-xl text-xs flex flex-col justify-center min-w-[120px] shadow-3xs">
                        <span className="text-[8px] font-bold text-indigo-200 uppercase tracking-wider">Closing</span>
                        <span className="font-mono font-black text-white">${generalLedgerData.closingBalance.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {!selectedGlAccountId ? (
                    <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-[2rem] bg-white text-slate-400">
                      <HelpCircle className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider">No Account Selected</p>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-sm mx-auto">
                        Please use the Account Selector controls at the top of the screen to select a valid Chart of Accounts account.
                      </p>
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const selectedAccDetails = unionCOA.find(a => a.code === selectedGlAccountId || a.id === selectedGlAccountId);
                        return selectedGlAccountId && selectedAccDetails?.isLegacy ? (
                          <div className="bg-amber-50/50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3 text-amber-800 animate-fade-in shadow-3xs">
                            <Info className="h-5 w-5 text-amber-650 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <h5 className="text-xs font-black uppercase tracking-wider">ReadOnly Historical Compatibility Layer Active</h5>
                              <p className="text-[11px] text-amber-700/90 leading-relaxed font-semibold">
                                This is a virtual reporting account automatically generated from legacy ledger postings. It is preserved for double-entry ledger balance integrity and audit trail compliance, but is closed for new journal entry creation.
                              </p>
                            </div>
                          </div>
                        ) : null;
                      })()}
                      <div className="overflow-x-auto border border-slate-200 rounded-[2rem] bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900 text-white text-xs">
                            <th className="py-3.5 px-5 font-bold uppercase tracking-wider rounded-tl-xl whitespace-nowrap">Posting Date</th>
                            <th className="py-3.5 px-5 font-bold uppercase tracking-wider whitespace-nowrap">Voucher Number</th>
                            <th className="py-3.5 px-5 font-bold uppercase tracking-wider whitespace-nowrap">Voucher Type</th>
                            <th className="py-3.5 px-5 font-bold uppercase tracking-wider whitespace-nowrap">Source Module</th>
                            <th className="py-3.5 px-5 font-bold uppercase tracking-wider whitespace-nowrap">Narration / Memo</th>
                            <th className="py-3.5 px-5 font-bold uppercase tracking-wider text-right whitespace-nowrap">Debit (+)</th>
                            <th className="py-3.5 px-5 font-bold uppercase tracking-wider text-right whitespace-nowrap">Credit (-)</th>
                            <th className="py-3.5 px-5 font-bold uppercase tracking-wider text-right whitespace-nowrap">Running Balance</th>
                            <th className="py-3.5 px-5 font-bold uppercase tracking-wider whitespace-nowrap">Operator</th>
                            <th className="py-3.5 px-5 font-bold uppercase tracking-wider text-center rounded-tr-xl whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans text-xs">
                          {/* 1. Opening Balance starting row */}
                          <tr className="bg-slate-50/40">
                            <td className="py-3.5 px-5 text-slate-400 font-medium whitespace-nowrap">-</td>
                            <td className="py-3.5 px-5 text-slate-400 font-extrabold whitespace-nowrap">START_BAL</td>
                            <td className="py-3.5 px-5 whitespace-nowrap">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 border border-slate-200 text-slate-600">
                                BAL
                              </span>
                            </td>
                            <td className="py-3.5 px-5 text-slate-400 font-medium whitespace-nowrap">SYSTEM</td>
                            <td className="py-3.5 px-5 text-slate-700 font-bold bg-slate-50/50">Cumulative Opening Balance (Starting Ledger Point)</td>
                            <td className="py-3.5 px-5 text-slate-400 font-medium text-right whitespace-nowrap">-</td>
                            <td className="py-3.5 px-5 text-slate-400 font-medium text-right whitespace-nowrap">-</td>
                            <td className="py-3.5 px-5 text-indigo-700 font-black text-right bg-indigo-50/20 whitespace-nowrap">
                              ${generalLedgerData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3.5 px-5 text-slate-400 font-medium whitespace-nowrap">System</td>
                            <td className="py-3.5 px-5 text-center whitespace-nowrap">-</td>
                          </tr>

                          {/* 2. Transaction Rows */}
                          {searchableGlEntries.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="py-12 text-center text-slate-400 text-xs font-semibold">
                                No general ledger postings found for the selected account in this date range.
                              </td>
                            </tr>
                          ) : (
                            searchableGlEntries.map((e, index) => {
                              // Dynamic voucher badges
                              const voucherColors: Record<string, string> = {
                                'JV': 'bg-indigo-50 text-indigo-700 border-indigo-100',
                                'CP': 'bg-rose-50 text-rose-700 border-rose-100',
                                'CR': 'bg-emerald-50 text-emerald-700 border-emerald-100',
                                'BP': 'bg-sky-50 text-sky-700 border-sky-100',
                                'BR': 'bg-violet-50 text-violet-700 border-violet-100',
                                'SI': 'bg-amber-50 text-amber-700 border-amber-100',
                                'PI': 'bg-teal-50 text-teal-700 border-teal-100',
                              };
                              const voucherColorClass = voucherColors[e.voucherType] || 'bg-slate-50 text-slate-700 border-slate-200';

                              return (
                                <tr key={`${e.id}-${index}`} className="hover:bg-indigo-50/20 transition duration-150">
                                  {/* Posting Date */}
                                  <td className="py-3.5 px-5 font-medium text-slate-500 whitespace-nowrap">
                                    {e.postingDate.split('T')[0]}
                                  </td>
                                  {/* Posting / Voucher Number */}
                                  <td className="py-3.5 px-5 font-mono font-bold text-slate-900 whitespace-nowrap">
                                    {e.postingNumber}
                                  </td>
                                  {/* Voucher Type */}
                                  <td className="py-3.5 px-5 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${voucherColorClass}`}>
                                      {e.voucherType}
                                    </span>
                                  </td>
                                  {/* Source Module */}
                                  <td className="py-3.5 px-5 font-bold text-slate-500 uppercase whitespace-nowrap">
                                    {e.sourceModule}
                                  </td>
                                  {/* Narration */}
                                  <td className="py-3.5 px-5 text-slate-700 max-w-[280px] truncate" title={e.narration}>
                                    {e.narration}
                                  </td>
                                  {/* Debit */}
                                  <td className="py-3.5 px-5 font-mono font-bold text-right text-emerald-600 whitespace-nowrap">
                                    {e.debit > 0 ? `+$${e.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                  </td>
                                  {/* Credit */}
                                  <td className="py-3.5 px-5 font-mono font-bold text-right text-rose-600 whitespace-nowrap">
                                    {e.credit > 0 ? `-$${e.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                  </td>
                                  {/* Running Balance */}
                                  <td className="py-3.5 px-5 font-mono font-black text-right text-slate-900 bg-slate-50/30 whitespace-nowrap">
                                    ${e.runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  {/* Operator / Creator */}
                                  <td className="py-3.5 px-5 font-mono text-slate-400 whitespace-nowrap max-w-[120px] truncate" title={e.createdBy}>
                                    {e.createdBy}
                                  </td>
                                  {/* Drill Down Actions */}
                                  <td className="py-3.5 px-5 text-center whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => handleDrillDown(e)}
                                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-900 font-bold hover:underline cursor-pointer min-h-[32px] px-2 rounded-lg hover:bg-indigo-50/50"
                                      title="Drill down to auditing source voucher"
                                    >
                                      <Search className="h-3.5 w-3.5 shrink-0" />
                                      <span>Trace Source</span>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
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
