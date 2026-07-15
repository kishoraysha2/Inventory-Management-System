import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Search,
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  Box,
  ArrowUpDown,
  Filter,
  User,
  AlertCircle,
  Clock,
  RotateCcw,
  CheckCircle2,
  ListFilter,
  RefreshCw,
  ChevronRight,
  Info
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Product, Sale, Purchase, ActivityLog } from '../types';
import { isVoidStatus } from '../lib/utils';
import { jsPDF } from 'jspdf';

interface LedgerMovement {
  id: string;
  date: string;
  type: 'OPENING' | 'SALE' | 'PROCUREMENT' | 'ADJUSTMENT' | 'VOID_SALE' | 'VOID_PURCHASE';
  refId: string;
  invoiceNumber?: string;
  counterparty: string;
  qtyIn: number;
  qtyOut: number;
  runningBalance: number;
  unitCost: number;
  unitPrice: number;
  totalValue: number;
  operator: string;
  status: 'COMPLETED' | 'VOID';
  notes: string;
}

export default function ProductLedger({ userRole = 'viewer' }: { userRole?: string }) {
  // --- Core States ---
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  // --- Filtering & Sorting States ---
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [movementType, setMovementType] = useState<string>('ALL');
  const [showVoided, setShowVoided] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // --- Synchronize Collections in Real-Time ---
  useEffect(() => {
    if (!auth.currentUser) {
      // Local fallbacks
      const localProducts = localStorage.getItem('inventory_products');
      setProducts(localProducts ? JSON.parse(localProducts) : []);

      const localSales = localStorage.getItem('inventory_sales');
      setSales(localSales ? JSON.parse(localSales) : []);

      const localPurchases = localStorage.getItem('inventory_purchases');
      setPurchases(localPurchases ? JSON.parse(localPurchases) : []);

      const localLogs = localStorage.getItem('inventory_logs');
      setLogs(localLogs ? JSON.parse(localLogs) : []);

      setLoading(false);
      return;
    }

    setLoading(true);

    // Subscribe to products
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Product);
      });
      setProducts(list);
    }, (err) => {
      console.error('Ledger: Products Sync Error', err);
    });

    // Subscribe to sales
    const unsubSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
      const list: Sale[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Sale);
      });
      setSales(list);
    }, (err) => {
      console.error('Ledger: Sales Sync Error', err);
    });

    // Subscribe to purchases
    const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snapshot) => {
      const list: Purchase[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Purchase);
      });
      setPurchases(list);
    }, (err) => {
      console.error('Ledger: Purchases Sync Error', err);
    });

    // Subscribe to logs
    const unsubLogs = onSnapshot(collection(db, 'logs'), (snapshot) => {
      const list: ActivityLog[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as ActivityLog);
      });
      setLogs(list);
    }, (err) => {
      console.error('Ledger: Logs Sync Error', err);
    });

    setLoading(false);

    return () => {
      unsubProducts();
      unsubSales();
      unsubPurchases();
      unsubLogs();
    };
  }, []);

  // --- Auto-select first product if none selected ---
  useEffect(() => {
    if (products.length > 0 && !selectedProductId) {
      const activeProducts = products.filter(p => p.status !== 'inactive');
      if (activeProducts.length > 0) {
        setSelectedProductId(activeProducts[0].id);
      } else {
        setSelectedProductId(products[0].id);
      }
    }
  }, [products, selectedProductId]);

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  // --- Reconstruct Stock Movements Chronologically (with Running Balance) ---
  const rawMovements = useMemo(() => {
    if (!selectedProductId || !selectedProduct) return [];

    const list: Omit<LedgerMovement, 'runningBalance'>[] = [];

    // 1. Process Supplier Procurements (Purchases)
    purchases.forEach((pur) => {
      if (pur.productId === selectedProductId) {
        const isVoid = isVoidStatus((pur as any).status);
        list.push({
          id: pur.id,
          date: pur.purchaseDate || new Date().toISOString(),
          type: 'PROCUREMENT',
          refId: pur.id,
          counterparty: pur.supplierName,
          qtyIn: pur.quantity,
          qtyOut: 0,
          unitCost: pur.purchasePrice,
          unitPrice: 0,
          totalValue: pur.totalAmount,
          operator: 'System/Procurement',
          status: isVoid ? 'VOID' : 'COMPLETED',
          notes: isVoid ? 'VOIDED - Supplier Procurement Reversal' : 'Supplier Procurement'
        });
      }
    });

    // 2. Process Customer Sales (Outflows)
    sales.forEach((sale) => {
      const isVoid = isVoidStatus(sale.status);
      
      // Handle multi-line sales vs legacy single-line sales
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item, index) => {
          if (item.productId === selectedProductId) {
            list.push({
              id: `${sale.id}-${index}`,
              date: sale.saleDate || sale.timestamp || new Date().toISOString(),
              type: 'SALE',
              refId: sale.id,
              invoiceNumber: sale.invoiceNumber,
              counterparty: sale.customerName,
              qtyIn: 0,
              qtyOut: item.quantity,
              unitCost: item.purchasePriceAtSale ?? sale.productPurchasePriceAtSale ?? 0,
              unitPrice: item.unitPrice,
              totalValue: item.totalAmount,
              operator: sale.companySnapshot?.ownerName || 'System/Sales',
              status: isVoid ? 'VOID' : 'COMPLETED',
              notes: isVoid ? 'VOIDED - Customer Sale Reversal' : 'Customer Sale'
            });
          }
        });
      } else if (sale.productId === selectedProductId) {
        list.push({
          id: sale.id,
          date: sale.saleDate || sale.timestamp || new Date().toISOString(),
          type: 'SALE',
          refId: sale.id,
          invoiceNumber: sale.invoiceNumber,
          counterparty: sale.customerName,
          qtyIn: 0,
          qtyOut: sale.quantity,
          unitCost: sale.productPurchasePriceAtSale ?? 0,
          unitPrice: sale.sellingPrice,
          totalValue: sale.totalAmount,
          operator: sale.companySnapshot?.ownerName || 'System/Sales',
          status: isVoid ? 'VOID' : 'COMPLETED',
          notes: isVoid ? 'VOIDED - Customer Sale Reversal' : 'Customer Sale'
        });
      }
    });

    // 3. Process Manual Adjustments (from Logs)
    logs.forEach((log) => {
      if (log.itemId === selectedProductId && log.type === 'stock_change') {
        const delta = log.quantityDifference ?? 0;
        if (delta !== 0) {
          const isPositive = delta > 0;
          list.push({
            id: log.id,
            date: log.timestamp || new Date().toISOString(),
            type: 'ADJUSTMENT',
            refId: log.id,
            counterparty: 'Internal Warehouse',
            qtyIn: isPositive ? delta : 0,
            qtyOut: !isPositive ? Math.abs(delta) : 0,
            unitCost: selectedProduct.purchasePrice,
            unitPrice: 0,
            totalValue: Math.abs(delta) * selectedProduct.purchasePrice,
            operator: log.description.includes('by') ? log.description.split('by').pop()?.trim() || 'Staff' : 'Staff',
            status: 'COMPLETED',
            notes: log.reason || log.description
          });
        }
      }
    });

    // Sort chronologically ascending to calculate running balance working forward,
    // but wait! As analyzed, we should compute the running balance WORKING BACKWARD
    // from the actual current live stock! This is the most accurate, bulletproof way to sync with current stock.
    
    // Sort descending chronologically
    const sortedDesc = [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    let balanceAccumulator = selectedProduct.currentStock;
    const movementsWithBalance: LedgerMovement[] = [];

    // Work backwards through sorted desc list to set running balance, then reverse it.
    sortedDesc.forEach((mov) => {
      if (mov.status === 'VOID') {
        // Voided movements had their stock reversed, meaning they currently contribute 0 net impact.
        // So working backwards, they don't shift the balance accumulator.
        movementsWithBalance.push({
          ...mov,
          runningBalance: balanceAccumulator
        } as LedgerMovement);
      } else {
        // This was an active movement.
        // Balance before this movement was:
        // If it was Qty In (Procurement/Positive Adjust): previous balance was lower (balance - qtyIn)
        // If it was Qty Out (Sale/Negative Adjust): previous balance was higher (balance + qtyOut)
        movementsWithBalance.push({
          ...mov,
          runningBalance: balanceAccumulator
        } as LedgerMovement);

        balanceAccumulator = balanceAccumulator - mov.qtyIn + mov.qtyOut;
      }
    });

    // Reverse back to chronological order (ascending)
    const chronologicalMovements = movementsWithBalance.reverse();

    // Add an explicit Opening Stock card entry if we have a starting balance
    const openingEntry: LedgerMovement = {
      id: `open-${selectedProductId}`,
      date: selectedProduct.createdDate || new Date().toISOString(),
      type: 'OPENING',
      refId: 'N/A',
      counterparty: 'N/A',
      qtyIn: selectedProduct.initialStock || balanceAccumulator,
      qtyOut: 0,
      runningBalance: balanceAccumulator,
      unitCost: selectedProduct.purchasePrice,
      unitPrice: 0,
      totalValue: balanceAccumulator * selectedProduct.purchasePrice,
      operator: 'System',
      status: 'COMPLETED',
      notes: 'Opening inventory stock registered'
    };

    return [openingEntry, ...chronologicalMovements];
  }, [selectedProductId, selectedProduct, sales, purchases, logs]);

  // --- Filter and Sort Movements ---
  const filteredMovements = useMemo(() => {
    let result = [...rawMovements];

    // Filter by search query (Ref, Customer, Supplier, Notes)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.refId.toLowerCase().includes(q) ||
          (m.invoiceNumber && m.invoiceNumber.toLowerCase().includes(q)) ||
          m.counterparty.toLowerCase().includes(q) ||
          m.notes.toLowerCase().includes(q) ||
          m.operator.toLowerCase().includes(q)
      );
    }

    // Filter by type
    if (movementType !== 'ALL') {
      result = result.filter((m) => m.type === movementType);
    }

    // Filter by void status
    if (!showVoided) {
      result = result.filter((m) => m.status !== 'VOID');
    }

    // Filter by Date Range
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime();
      result = result.filter((m) => new Date(m.date).getTime() >= fromTime);
    }
    if (dateTo) {
      // End of day for To Date
      const toTime = new Date(dateTo).getTime() + 86400000;
      result = result.filter((m) => new Date(m.date).getTime() <= toTime);
    }

    // Apply sorting
    return result.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }, [rawMovements, searchQuery, movementType, showVoided, dateFrom, dateTo, sortOrder]);

  // --- Calculate Dynamic Metric Totals ---
  const metrics = useMemo(() => {
    // Filter active movements in current view (excluding Opening Stock entry and Voids)
    const activeInView = filteredMovements.filter((m) => m.type !== 'OPENING' && m.status !== 'VOID');
    
    const totalIn = activeInView.reduce((sum, m) => sum + m.qtyIn, 0);
    const totalOut = activeInView.reduce((sum, m) => sum + m.qtyOut, 0);
    const netChange = totalIn - totalOut;
    
    // Valuation changes: Qty In * purchasePrice - Qty Out * purchasePrice (using selected product's cost)
    const cost = selectedProduct?.purchasePrice ?? 0;
    const valuationChange = netChange * cost;

    return {
      totalIn,
      totalOut,
      netChange,
      valuationChange,
      openingStock: filteredMovements.find(m => m.type === 'OPENING')?.runningBalance ?? 0,
      closingStock: selectedProduct?.currentStock ?? 0
    };
  }, [filteredMovements, selectedProduct]);

  // --- Export PDF ---
  const exportPDF = () => {
    if (!selectedProduct) {
      setFeedback({ message: 'No product selected to generate PDF ledger.', type: 'error' });
      return;
    }

    try {
      const doc = new jsPDF();
      const margin = 14;
      let y = 20;

      // Header Banner
      doc.setFillColor(79, 70, 229); // indigo-600
      doc.rect(0, 0, 220, 38, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('NEXUS ENTERPRISE ERP', margin, y);
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`STOCK MOVEMENT CARD (PRODUCT LEDGER) | GENERATED: ${new Date().toLocaleString()}`, margin, y);

      y = 50;
      doc.setTextColor(15, 23, 42); // slate-900
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(`PRODUCT: ${selectedProduct.name}`, margin, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`SKU: ${selectedProduct.sku}  |  Category: ${selectedProduct.category}  |  Location: ${selectedProduct.location || 'N/A'}`, margin, y);
      y += 10;

      // Filter summary line
      let filterStr = 'Filters: ALL Movements';
      if (dateFrom || dateTo) {
        filterStr += ` | Date Range: ${dateFrom || 'Start'} to ${dateTo || 'End'}`;
      }
      if (movementType !== 'ALL') {
        filterStr += ` | Type: ${movementType}`;
      }
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(filterStr, margin, y);
      y += 8;

      // Metrics Summary Panel box
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.roundedRect(margin, y, 182, 22, 3, 3, 'FD');

      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('OPENING STOCK', margin + 6, y + 8);
      doc.text('TOTAL QTY IN (+)', margin + 42, y + 8);
      doc.text('TOTAL QTY OUT (-)', margin + 80, y + 8);
      doc.text('NET STOCK CHANGE', margin + 120, y + 8);
      doc.text('CURRENT CLOSING', margin + 152, y + 8);

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.text(`${metrics.openingStock}`, margin + 6, y + 16);
      doc.text(`${metrics.totalIn}`, margin + 42, y + 16);
      doc.text(`${metrics.totalOut}`, margin + 80, y + 16);
      
      const changePrefix = metrics.netChange > 0 ? '+' : '';
      doc.text(`${changePrefix}${metrics.netChange}`, margin + 120, y + 16);
      doc.text(`${metrics.closingStock}`, margin + 152, y + 16);

      y += 32;

      // Ledger Table Header
      doc.setFillColor(241, 245, 249); // slate-100
      doc.rect(margin, y, 182, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('DATE/TIME', margin + 2, y + 5.5);
      doc.text('TYPE', margin + 35, y + 5.5);
      doc.text('REF ID', margin + 62, y + 5.5);
      doc.text('COUNTERPARTY', margin + 90, y + 5.5);
      doc.text('QTY IN', margin + 130, y + 5.5);
      doc.text('QTY OUT', margin + 148, y + 5.5);
      doc.text('BALANCE', margin + 168, y + 5.5);

      y += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);

      // Print rows
      filteredMovements.forEach((m) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
          // Sub-header for page change
          doc.setFillColor(241, 245, 249);
          doc.rect(margin, y, 182, 8, 'F');
          doc.setFont('helvetica', 'bold');
          doc.text('DATE/TIME', margin + 2, y + 5.5);
          doc.text('TYPE', margin + 35, y + 5.5);
          doc.text('REF ID', margin + 62, y + 5.5);
          doc.text('COUNTERPARTY', margin + 90, y + 5.5);
          doc.text('QTY IN', margin + 130, y + 5.5);
          doc.text('QTY OUT', margin + 148, y + 5.5);
          doc.text('BALANCE', margin + 168, y + 5.5);
          y += 8;
          doc.setFont('helvetica', 'normal');
        }

        // Zebra lines
        doc.setDrawColor(241, 245, 249);
        doc.line(margin, y + 6, margin + 182, y + 6);

        const dateStr = new Date(m.date).toLocaleDateString() + ' ' + new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        doc.text(dateStr, margin + 2, y + 4.5);
        doc.text(m.type, margin + 35, y + 4.5);
        
        const refStr = m.invoiceNumber ? `${m.invoiceNumber}` : m.refId;
        doc.text(refStr.substring(0, 15), margin + 62, y + 4.5);
        doc.text(m.counterparty.substring(0, 20), margin + 90, y + 4.5);
        
        doc.text(m.qtyIn > 0 ? `+${m.qtyIn}` : '-', margin + 130, y + 4.5);
        doc.text(m.qtyOut > 0 ? `-${m.qtyOut}` : '-', margin + 148, y + 4.5);
        doc.text(`${m.runningBalance}`, margin + 168, y + 4.5);

        y += 7;
      });

      doc.save(`stock-card-${selectedProduct.sku}-${new Date().toISOString().split('T')[0]}.pdf`);
      setFeedback({ message: 'Fidelity PDF Stock Card downloaded successfully.', type: 'success' });
    } catch (e: any) {
      console.error(e);
      setFeedback({ message: `PDF Generation failed: ${e.message}`, type: 'error' });
    }
  };

  // --- Export CSV ---
  const exportCSV = () => {
    if (!selectedProduct) {
      setFeedback({ message: 'No product selected to generate CSV ledger.', type: 'error' });
      return;
    }

    try {
      const headers = ['Date', 'Type', 'Ref ID', 'Invoice Number', 'Counterparty', 'Qty In', 'Qty Out', 'Running Balance', 'Unit Cost', 'Unit Price', 'Total Value', 'Operator', 'Status', 'Notes'];
      const rows = filteredMovements.map((m) => [
        new Date(m.date).toISOString(),
        m.type,
        m.refId,
        m.invoiceNumber || 'N/A',
        m.counterparty,
        m.qtyIn,
        m.qtyOut,
        m.runningBalance,
        m.unitCost,
        m.unitPrice,
        m.totalValue,
        m.operator,
        m.status,
        m.notes.replace(/,/g, ';')
      ]);

      const csvContent =
        'data:text/csv;charset=utf-8,' +
        [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `stock-card-${selectedProduct.sku}-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setFeedback({ message: 'Stock card CSV exported successfully.', type: 'success' });
    } catch (e: any) {
      setFeedback({ message: `CSV export failed: ${e.message}`, type: 'error' });
    }
  };

  return (
    <div id="product-ledger-workspace" className="space-y-8 animate-fade-in font-sans pb-12">
      
      {/* POPUP FEEDBACK ALERT BANNER */}
      {feedback && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold shadow-lg border animate-fade-in ${
          feedback.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-600" />
          )}
          <span>{feedback.message}</span>
          <button
            type="button"
            className="ml-2 font-bold opacity-60 hover:opacity-100 cursor-pointer"
            onClick={() => setFeedback(null)}
          >
            &times;
          </button>
        </div>
      )}

      {/* CORE CONTROL HEADER BAR */}
      <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xs space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-sans text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Box className="h-5 w-5 text-indigo-600 shrink-0" />
              Product Ledger (Stock Card)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Auditor-grade single source of truth tracking historic stock receipts, issues, and running balances
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={exportPDF}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-600 cursor-pointer transition shadow-2xs"
            >
              <FileText className="h-4 w-4" />
              <span>Export PDF Stock Card</span>
            </button>
            <button
              type="button"
              onClick={exportCSV}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-600 cursor-pointer transition shadow-2xs"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV Ledger</span>
            </button>
          </div>
        </div>

        {/* CONTROLS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 pt-4 border-t border-slate-100">
          
          {/* Product selector dropdown */}
          <div className="lg:col-span-2 space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Selected Product Catalog
            </label>
            <div className="relative">
              <select
                id="ledger-product-select-filter"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-2.5 outline-none font-sans text-xs focus:border-slate-400 transition cursor-pointer font-bold appearance-none pr-10"
              >
                {products.length === 0 ? (
                  <option value="">No products found</option>
                ) : (
                  products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) [Qty: {p.currentStock}]
                    </option>
                  ))
                )}
              </select>
              <Box className="absolute right-3.5 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Movement Type filter */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Movement Category
            </label>
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3.5 py-2.5 outline-none font-sans text-xs focus:border-slate-400 transition cursor-pointer font-medium"
            >
              <option value="ALL">All Movements</option>
              <option value="SALE">Sales (Outflow)</option>
              <option value="PROCUREMENT">Procurements (Inflow)</option>
              <option value="ADJUSTMENT">Adjustments</option>
              <option value="OPENING">Opening Stock</option>
            </select>
          </div>

          {/* Date From */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3.5 py-2.5 outline-none font-sans text-xs focus:border-slate-400 transition cursor-pointer font-medium"
            />
          </div>

          {/* Date To */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              To Date
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3.5 py-2.5 outline-none font-sans text-xs focus:border-slate-400 transition cursor-pointer font-medium"
            />
          </div>

        </div>

        {/* EXTRA ADVANCED FILTERS */}
        <div className="flex flex-col sm:flex-row items-center gap-4 justify-between pt-2">
          {/* Query search text */}
          <div className="relative w-full sm:max-w-md shrink-0">
            <Search className="absolute left-3.5 top-3 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Operator, Ref, Customer, Supplier, or Reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs font-semibold border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-indigo-550 focus:ring-1 focus:ring-indigo-500 transition duration-150"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-xs"
              >
                &times;
              </button>
            )}
          </div>

          <div className="flex items-center gap-4 self-end sm:self-auto select-none">
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-500 font-medium">
              <input
                type="checkbox"
                checked={showVoided}
                onChange={(e) => setShowVoided(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <span>Include Voided Reversals</span>
            </label>

            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setMovementType('ALL');
                setSearchQuery('');
                setShowVoided(false);
              }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* DYNAMIC METRIC BENTO GRID */}
      {selectedProduct && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          
          {/* Card 1: Opening balance */}
          <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Opening Balance</span>
                <Clock className="h-4 w-4 text-slate-400" />
              </div>
              <p className="text-2xl font-bold tracking-tight text-slate-900 mt-2 font-mono">
                {metrics.openingStock} <span className="text-xs text-slate-400 font-normal uppercase">Units</span>
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 font-medium">
              Calculated starting level in view range
            </div>
          </div>

          {/* Card 2: Stock receipts (IN) */}
          <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Gross Stock In (Receipts)</span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold tracking-tight text-emerald-600 mt-2 font-mono">
                +{metrics.totalIn} <span className="text-xs text-slate-400 font-normal uppercase">Units</span>
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 font-medium">
              Purchases & physical count additions
            </div>
          </div>

          {/* Card 3: Stock issues (OUT) */}
          <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Gross Stock Out (Issues)</span>
                <TrendingDown className="h-4 w-4 text-rose-500" />
              </div>
              <p className="text-2xl font-bold tracking-tight text-rose-600 mt-2 font-mono">
                -{metrics.totalOut} <span className="text-xs text-slate-400 font-normal uppercase">Units</span>
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 font-medium">
              Sales, scrap, & physical count deductions
            </div>
          </div>

          {/* Card 4: Closing balance */}
          <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Closing Balance (Live)</span>
                <Box className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="text-2xl font-bold tracking-tight text-slate-900 mt-2 font-mono">
                {metrics.closingStock} <span className="text-xs text-slate-400 font-normal uppercase">Units</span>
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Value: <strong className="font-bold font-mono text-indigo-600">${(metrics.closingStock * selectedProduct.sellingPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
              <span className={`font-bold font-mono text-[9px] px-1.5 py-0.5 rounded ${
                metrics.netChange >= 0 ? 'bg-emerald-50 text-emerald-705' : 'bg-rose-50 text-rose-705'
              }`}>
                {metrics.netChange >= 0 ? '+' : ''}{metrics.netChange} net change
              </span>
            </div>
          </div>

        </div>
      )}

      {/* STOCK CARD TABLE REGISTRY */}
      <div className="border border-slate-200 rounded-[2rem] overflow-hidden shadow-xs bg-white">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h4 className="font-sans text-sm font-bold text-slate-900">
              Movement Activity Ledger Timeline
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Showing {filteredMovements.length} audit lines sorted by date
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-indigo-600 transition cursor-pointer"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>Sorted {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto text-xs">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <th className="py-4 px-6">Timestamp</th>
                <th className="py-4 px-5">Type</th>
                <th className="py-4 px-5">Reference Ref</th>
                <th className="py-4 px-5">Counterparty</th>
                <th className="py-4 px-5 text-right">Qty IN (+)</th>
                <th className="py-4 px-5 text-right">Qty OUT (-)</th>
                <th className="py-4 px-5 text-right font-bold">Running Balance</th>
                <th className="py-4 px-5 text-right">Value (Cost / Price)</th>
                <th className="py-4 px-5">User</th>
                <th className="py-4 px-6">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <RefreshCw className="h-6 w-6 animate-spin text-indigo-600 mb-2" />
                      <p className="font-bold text-xs">Synchronizing Stock Card Ledger...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <AlertCircle className="h-8 w-8 text-slate-200 mb-2" />
                      <p className="font-semibold text-slate-500">No stock movements found matching filter criteria.</p>
                      <p className="text-[10px] text-slate-450 mt-1">Try widening your date filters or toggling void visibility.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMovements.map((mov) => {
                  const isVoid = mov.status === 'VOID';
                  return (
                    <tr
                      key={mov.id}
                      className={`hover:bg-indigo-50/20 transition duration-150 ${
                        isVoid ? 'opacity-40 bg-slate-100 line-through text-slate-400' : ''
                      }`}
                    >
                      {/* Date */}
                      <td className="py-4 px-6 font-mono text-slate-500 font-bold whitespace-nowrap">
                        {new Date(mov.date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}{' '}
                        <span className="text-[10px] text-slate-400 font-normal">
                          {new Date(mov.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>

                      {/* Type Badge */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          mov.type === 'OPENING'
                            ? 'bg-slate-50 border-slate-200 text-slate-600'
                            : mov.type === 'SALE'
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : mov.type === 'PROCUREMENT'
                            ? 'bg-emerald-50 border-emerald-250/60 text-emerald-700'
                            : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}>
                          {mov.type}
                        </span>
                      </td>

                      {/* Reference */}
                      <td className="py-4 px-5 font-mono font-bold text-slate-600 whitespace-nowrap">
                        {mov.invoiceNumber ? (
                          <div className="flex flex-col">
                            <span className="text-slate-800 font-extrabold">{mov.invoiceNumber}</span>
                            <span className="text-[9px] text-slate-400 font-normal">ID: {mov.refId.substring(0, 8)}...</span>
                          </div>
                        ) : mov.refId === 'N/A' ? (
                          <span className="text-slate-400">N/A</span>
                        ) : (
                          <span>{mov.refId.substring(0, 12)}...</span>
                        )}
                      </td>

                      {/* Counterparty */}
                      <td className="py-4 px-5 font-bold text-slate-800 capitalize max-w-[150px] truncate">
                        {mov.counterparty}
                      </td>

                      {/* Qty IN */}
                      <td className="py-4 px-5 text-right font-mono text-emerald-600 font-extrabold whitespace-nowrap">
                        {mov.qtyIn > 0 ? `+${mov.qtyIn}` : <span className="text-slate-300">-</span>}
                      </td>

                      {/* Qty OUT */}
                      <td className="py-4 px-5 text-right font-mono text-rose-600 font-extrabold whitespace-nowrap">
                        {mov.qtyOut > 0 ? `-${mov.qtyOut}` : <span className="text-slate-300">-</span>}
                      </td>

                      {/* Running Balance */}
                      <td className="py-4 px-5 text-right font-mono font-black text-sm text-slate-900 bg-slate-50/45 border-x border-slate-50/80">
                        {mov.runningBalance}
                      </td>

                      {/* Value Breakdown */}
                      <td className="py-4 px-5 text-right font-mono whitespace-nowrap">
                        {mov.type === 'SALE' ? (
                          <div className="flex flex-col items-end">
                            <span className="text-slate-800 font-bold">${mov.unitPrice.toFixed(2)}</span>
                            <span className="text-[9px] text-slate-400">Cost: ${mov.unitCost.toFixed(2)}</span>
                          </div>
                        ) : mov.type === 'PROCUREMENT' || mov.type === 'OPENING' ? (
                          <span className="text-slate-800 font-bold">${mov.unitCost.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Operator */}
                      <td className="py-4 px-5 text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-[11px]">
                          <User className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[100px]">{mov.operator}</span>
                        </div>
                      </td>

                      {/* Notes / Reason */}
                      <td className="py-4 px-6 text-slate-500 font-normal max-w-[200px] truncate" title={mov.notes}>
                        {mov.notes}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SYSTEM ARCHITECTURE COMPLIANCE DISCLOSURE */}
      <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6 flex gap-4">
        <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-1.5 text-xs text-slate-500 leading-normal">
          <h5 className="font-extrabold text-slate-800 uppercase tracking-wider text-[10px]">
            Accounting & Audit Trail Compliance Statement
          </h5>
          <p>
            The Nexus Enterprise Product Ledger acts as a completely deterministic, real-time index of inventory state changes. Running balances are mathematically reconstructed backwards from live physical counts to prevent database lockups, race conditions, or race-induced drift. Under Strict GAAP Compliance rules, voided sales or procurements are retained for journal consistency but flag a reversal movement with zero net influence on active stock totals.
          </p>
        </div>
      </div>

    </div>
  );
}
