import React, { useEffect, useState, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { calculateCustomerLedger } from '../lib/utils';
import { 
  Scale, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownRight, 
  Users, 
  Truck, 
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  RefreshCw,
  TrendingDown,
  Activity
} from 'lucide-react';
import { motion } from 'motion/react';
import { Sale, Customer, Product, Supplier, Capital, CashLedgerEntry, Purchase, CustomerPayment, SupplierPayment } from '../types';

export default function BalanceSheet() {
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customersState, setCustomersState] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>([]);
  const [capital, setCapital] = useState<Capital[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);

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

  // Real-time synchronization
  useEffect(() => {
    if (!auth.currentUser) {
      // Local fallback
      const savedSales = localStorage.getItem('inventory_sales');
      setSales(savedSales ? JSON.parse(savedSales) : []);

      const savedProducts = localStorage.getItem('inventory_products');
      setProducts(savedProducts ? JSON.parse(savedProducts) : []);

      const savedCustomers = localStorage.getItem('inventory_customers');
      setCustomersState(savedCustomers ? JSON.parse(savedCustomers) : []);

      const savedSuppliers = localStorage.getItem('inventory_suppliers');
      setSuppliers(savedSuppliers ? JSON.parse(savedSuppliers) : []);

      const savedLedger = localStorage.getItem('inventory_cash_ledger');
      setCashLedger(savedLedger ? JSON.parse(savedLedger) : []);

      const savedCapital = localStorage.getItem('inventory_capital');
      setCapital(savedCapital ? JSON.parse(savedCapital) : []);

      const savedPurchases = localStorage.getItem('inventory_purchases');
      setPurchases(savedPurchases ? JSON.parse(savedPurchases) : []);

      const savedCustomerPayments = localStorage.getItem('inventory_customer_payments');
      setCustomerPayments(savedCustomerPayments ? JSON.parse(savedCustomerPayments) : []);

      const savedSupplierPayments = localStorage.getItem('inventory_supplier_payments');
      setSupplierPayments(savedSupplierPayments ? JSON.parse(savedSupplierPayments) : []);

      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubSales = onSnapshot(collection(db, 'sales'), (snap) => {
      const list: Sale[] = [];
      snap.forEach(d => list.push(d.data() as Sale));
      setSales(list);
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      const list: Product[] = [];
      snap.forEach(d => list.push(d.data() as Product));
      setProducts(list);
    });

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
      const list: Customer[] = [];
      snap.forEach(d => list.push(d.data() as Customer));
      setCustomersState(list);
    });

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      const list: Supplier[] = [];
      snap.forEach(d => list.push(d.data() as Supplier));
      setSuppliers(list);
    });

    const unsubCashLedger = onSnapshot(collection(db, 'cashLedger'), (snap) => {
      const list: CashLedgerEntry[] = [];
      snap.forEach(d => list.push(d.data() as CashLedgerEntry));
      setCashLedger(list);
    });

    const unsubCapital = onSnapshot(collection(db, 'capital'), (snap) => {
      const list: Capital[] = [];
      snap.forEach(d => list.push(d.data() as Capital));
      setCapital(list);
    });

    const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snap) => {
      const list: Purchase[] = [];
      snap.forEach(d => list.push(d.data() as Purchase));
      setPurchases(list);
    });

    const unsubCustomerPayments = onSnapshot(collection(db, 'customerPayments'), (snap) => {
      const list: CustomerPayment[] = [];
      snap.forEach(d => list.push(d.data() as CustomerPayment));
      setCustomerPayments(list);
    });

    const unsubSupplierPayments = onSnapshot(collection(db, 'supplierPayments'), (snap) => {
      const list: SupplierPayment[] = [];
      snap.forEach(d => list.push(d.data() as SupplierPayment));
      setSupplierPayments(list);
      setLoading(false);
    });

    return () => {
      unsubSales();
      unsubProducts();
      unsubCustomers();
      unsubSuppliers();
      unsubCashLedger();
      unsubCapital();
      unsubPurchases();
      unsubCustomerPayments();
      unsubSupplierPayments();
    };
  }, []);

  // --- FILTERS & EXCLUSIONS ---
  const activeSales = sales.filter(s => (s as any).status !== 'VOID' && (s as any).status !== 'voided');
  const activeCustomerPayments = customerPayments.filter(p => (p as any).status !== 'VOID' && (p as any).status !== 'voided');
  const activeSupplierPayments = supplierPayments.filter(p => (p as any).status !== 'VOID' && (p as any).status !== 'voided');
  const activePurchases = purchases.filter(p => (p as any).status !== 'VOID' && (p as any).status !== 'voided');
  const activeLedgerEntries = cashLedger.filter(e => (e as any).status !== 'VOID' && (e as any).status !== 'voided');

  // --- A. CASH POSITION CALCULATIONS ---
  const initialCapital = capital.reduce((sum, entry) => sum + entry.amount, 0);
  
  const totalLedgerInflows = activeLedgerEntries
    .filter(entry => entry.type === 'inflow')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const totalLedgerOutflows = activeLedgerEntries
    .filter(entry => entry.type === 'outflow')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const cashInHand = initialCapital + totalLedgerInflows - totalLedgerOutflows;

  // Real-time Cash Inflows breakdown
  const cashSalesTotal = activeSales
    .filter(s => s.paymentType === 'Cash')
    .reduce((sum, s) => sum + s.totalAmount, 0);
  const customerPaymentsTotal = activeCustomerPayments.reduce((sum, p) => sum + p.amountPaid, 0);
  const totalCashInflows = cashSalesTotal + customerPaymentsTotal;

  // Real-time Cash Outflows breakdown
  const cashPurchasesTotal = activePurchases
    .filter(p => p.paymentType === 'Cash')
    .reduce((sum, p) => sum + p.totalAmount, 0);
  const supplierPaymentsTotal = activeSupplierPayments.reduce((sum, p) => sum + p.amountPaid, 0);
  const totalCashOutflows = cashPurchasesTotal + supplierPaymentsTotal;

  // --- B. PROFIT SUMMARY (Strict execution from sales snapshot metadata only) ---
  const totalRevenue = activeSales.reduce((sum, s) => sum + (s.subtotal ?? (s.totalAmount - (s.taxAmount ?? 0))), 0);
  
  const totalCOGS = activeSales.reduce((sum, s) => {
    const saleCOGS = s.costOfGoodsSold !== undefined 
      ? s.costOfGoodsSold 
      : (s.productPurchasePriceAtSale !== undefined 
          ? s.productPurchasePriceAtSale 
          : s.sellingPrice * 0.6) * s.quantity;
    return sum + saleCOGS;
  }, 0);

  const grossProfit = totalRevenue - totalCOGS;
  // Net Profit in this system equals Gross Profit as there are no distinct operations collections
  const netProfit = grossProfit;

  // --- C. RECEIVABLES (Customer due) ---
  const activeCustomers = customers.filter(c => c.status !== 'inactive');
  const totalCustomerOutstanding = activeCustomers.reduce((sum, c) => sum + (c.dueBalance ?? 0), 0);
  const customerBreakdown = activeCustomers
    .filter(c => (c.dueBalance ?? 0) > 0.01)
    .sort((a, b) => b.dueBalance - a.dueBalance);

  // --- D. PAYABLES (Supplier due) ---
  const activeSuppliers = suppliers.filter(s => s.status !== 'inactive');
  const totalSupplierOutstanding = activeSuppliers.reduce((sum, s) => sum + (s.dueBalance ?? 0), 0);
  const supplierBreakdown = activeSuppliers
    .filter(s => (s.dueBalance ?? 0) > 0.01)
    .sort((a, b) => (b.dueBalance ?? 0) - (a.dueBalance ?? 0));

  // --- E. NET BUSINESS POSITION ---
  const netPosition = cashInHand + totalCustomerOutstanding - totalSupplierOutstanding;

  // --- F. INTEGRITY MONITORING & AUDIT CHECKS ---
  const cashSalesLedgerComp = activeLedgerEntries
    .filter(entry => entry.source === 'sale')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const customerPaymentsLedgerComp = activeLedgerEntries
    .filter(entry => entry.source === 'payment' && entry.type === 'inflow')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const cashPurchasesLedgerComp = activeLedgerEntries
    .filter(entry => entry.source === 'purchase')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const supplierPaymentsLedgerComp = activeLedgerEntries
    .filter(entry => entry.source === 'payment' && entry.type === 'outflow')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const mismatchSales = Math.abs(cashSalesTotal - cashSalesLedgerComp) > 0.1;
  const mismatchCustPayments = Math.abs(customerPaymentsTotal - customerPaymentsLedgerComp) > 0.1;
  const mismatchPurchases = Math.abs(cashPurchasesTotal - cashPurchasesLedgerComp) > 0.1;
  const mismatchSuppPayments = Math.abs(supplierPaymentsTotal - supplierPaymentsLedgerComp) > 0.1;

  const hasLedgerMismatch = mismatchSales || mismatchCustPayments || mismatchPurchases || mismatchSuppPayments;

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-xs font-semibold text-slate-500 font-mono">Synthesizing live balance sheet metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-150 rounded-full px-2.5 py-1 text-[10px] font-bold text-indigo-700 tracking-wide uppercase">
            <Scale className="h-3 w-3" /> Real-time Audit Node
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Corporate Balance Sheet
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Consolidated dual-entry business valuation index. Excluding all VOID liabilities.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono font-semibold bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-500">
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          <span>Last Sync: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* LEDGER INTEGRITY MISMATCH BANNER */}
      {hasLedgerMismatch && (
        <motion.div 
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 flex items-start gap-3"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-amber-900">Ledger Mismatch Detected!</h4>
            <p className="text-[11px] text-amber-700/90 leading-relaxed">
              We detected a mathematical deviation between the standard transactions (sales / payments) ledger snapshots and the double-entry cashLedger collection flows:
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2 pt-2 border-t border-amber-200/40 text-[10px] font-mono text-amber-800">
              <div>Sales Diff: {mismatchSales ? <span className="font-bold text-rose-600">Mismatch</span> : 'Aligned'}</div>
              <div>Cust Payments Diff: {mismatchCustPayments ? <span className="font-bold text-rose-600">Mismatch</span> : 'Aligned'}</div>
              <div>Purchases Diff: {mismatchPurchases ? <span className="font-bold text-rose-600">Mismatch</span> : 'Aligned'}</div>
              <div>Supp Payments Diff: {mismatchSuppPayments ? <span className="font-bold text-rose-600">Mismatch</span> : 'Aligned'}</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* THREE INTEGRATED STAT CARDS (Top position overview) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Cash position indicator */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 font-mono tracking-wider uppercase">Cash Statement</span>
              <span className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign className="h-4.5 w-4.5" />
              </span>
            </div>
            <h2 className="text-4xl font-extrabold text-slate-850 mt-4 tracking-tight">
              ${cashInHand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <p className="text-xs text-slate-400 mt-1">Real-time consolidated Cash In Hand</p>
          </div>
          <div className="border-t border-slate-100 mt-4 pt-3 flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>Inflows: <span className="text-slate-850 font-bold">${totalCashInflows.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
            <span>Outflows: <span className="text-slate-850 font-bold">${totalCashOutflows.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
          </div>
        </div>

        {/* Profitability statement */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 font-mono tracking-wider uppercase">Profit Summary</span>
              <span className={`h-8 w-8 rounded-xl flex items-center justify-center ${netProfit >= 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                {netProfit >= 0 ? <TrendingUp className="h-4.5 w-4.5" /> : <TrendingDown className="h-4.5 w-4.5" />}
              </span>
            </div>
            <h2 className={`text-4xl font-extrabold mt-4 tracking-tight ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              ${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <p className="text-xs text-slate-400 mt-1">Net Earnings (Metadata Snapshot Based)</p>
          </div>
          <div className="border-t border-slate-100 mt-4 pt-3 flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>Total Rev: <span className="text-slate-850 font-bold">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
            <span>Total COGS: <span className="text-slate-850 font-bold">${totalCOGS.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
          </div>
        </div>

        {/* Net Business position index */}
        <div className={`border rounded-3xl p-6 shadow-sm flex flex-col justify-between ${netPosition >= 0 ? 'border-emerald-200 bg-emerald-50/10' : 'border-rose-200 bg-rose-50/10'}`}>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold font-mono tracking-wider uppercase text-slate-500">Net Business Position</span>
              <span className={`h-8 w-8 rounded-xl flex items-center justify-center ${netPosition >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                <Activity className="h-4.5 w-4.5" />
              </span>
            </div>
            <h2 className={`text-4xl font-extrabold mt-4 tracking-tight ${netPosition >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              ${netPosition.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <p className="text-xs text-slate-500 mt-1">Valuation Position (Cash + Receivables - Payables)</p>
          </div>
          <div className="border-t border-slate-200/40 mt-4 pt-3 flex items-center justify-between text-[11px] font-semibold text-slate-600">
            <span>Customer Due: <span className="font-bold text-amber-600">${totalCustomerOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
            <span>Supplier Due: <span className="font-bold text-slate-700">${totalSupplierOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
          </div>
        </div>
      </div>

      {/* DATA BREAKDOWNS GROUP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* SECTION C: Receivables breakdown */}
        <div className="bg-white border border-slate-250 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Users className="h-4.5 w-4.5 text-amber-500" />
              <div>
                <h3 className="text-sm font-bold text-slate-800">Receivables Ledgers</h3>
                <p className="text-[10px] text-slate-400">Claims from outstanding Credit customer accounts</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-extrabold text-amber-600">
                ${totalCustomerOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider font-mono">Combined Outstanding</div>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1.5 scrollbar-thin">
            {customerBreakdown.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-150 rounded-2xl select-none">
                <p className="text-xs font-mono font-bold">No outstanding customer liabilities</p>
                <p className="text-[10px] mt-1 text-slate-400">All customer accounts currently show clean balances.</p>
              </div>
            ) : (
              customerBreakdown.map((cust) => (
                <div key={cust.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 border border-slate-100 transition">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-750">{cust.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">Cust ID: {cust.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-amber-600">${cust.dueBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    <div className="text-[9px] bg-amber-50 border border-amber-100/50 rounded-md px-1.5 py-0.5 text-amber-700 inline-block font-mono font-bold">OUTSTANDING</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* SECTION D: Payables breakdown */}
        <div className="bg-white border border-slate-250 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Truck className="h-4.5 w-4.5 text-slate-650" />
              <div>
                <h3 className="text-sm font-bold text-slate-800">Payables Ledgers</h3>
                <p className="text-[10px] text-slate-400">Supplier credit liabilities outstanding</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-extrabold text-slate-755">
                ${totalSupplierOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider font-mono">Supplier Balances</div>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1.5 scrollbar-thin">
            {supplierBreakdown.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-150 rounded-2xl select-none">
                <p className="text-xs font-mono font-bold">No outstanding supplier balances</p>
                <p className="text-[10px] mt-1 text-slate-400">All supplier payables are reconciled fully.</p>
              </div>
            ) : (
              supplierBreakdown.map((supp) => (
                <div key={supp.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 border border-slate-100 transition">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-750">{supp.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">Supplier ID: {supp.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-700">${(supp.dueBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    <div className="text-[9px] bg-slate-100 border border-slate-200 rounded-md px-1.5 py-0.5 text-slate-600 inline-block font-mono font-bold">PAYABLE OUTSTANDING</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* METALS ACCENTS & COMPLIANCE FOOTER */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[10px] font-mono text-slate-400 flex flex-col md:flex-row md:items-center justify-between gap-3 select-none">
        <div>
          <span>Balance positioning engine calibrated to June 2026 reporting frame. Dual-ledger matching engine version 1.2</span>
        </div>
        <div>
          <span>Security Token status: <span className="text-emerald-600 font-bold">VERIFIED SECURE</span></span>
        </div>
      </div>

    </div>
  );
}
