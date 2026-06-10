import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { calculateCustomerLedger } from '../lib/utils';
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
  Printer
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Sale, Customer, Product, Supplier } from '../types';

type ReportType = 'sales' | 'purchases' | 'profit_loss' | 'customer_due' | 'supplier_due' | 'tax_vat' | 'activity_logs';

export default function ReportsPage() {
  // --- States ---
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customersState, setCustomersState] = useState<Customer[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<ReportType>('sales');

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
        prodList.push(docSnap.data() as Product);
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

    return () => {
      unsubSales();
      unsubProducts();
      unsubCustomers();
      unsubPayments();
      unsubSuppliers();
      unsubLogs();
    };
  }, []);

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

  const filteredSales = sales.filter(s => isDateInRange(s.saleDate) && s.status !== 'voided' && s.status !== 'VOID').map(s => {
    const subtotal = s.subtotal !== undefined ? s.subtotal : (s.totalAmount - (s.taxAmount ?? 0));
    const totalAmount = s.totalAmount !== undefined ? s.totalAmount : subtotal;
    const taxAmount = s.taxAmount !== undefined ? s.taxAmount : (totalAmount - subtotal);
    const costOfGoodsSold = s.costOfGoodsSold !== undefined ? s.costOfGoodsSold : (s.productPurchasePriceAtSale !== undefined ? s.productPurchasePriceAtSale : s.sellingPrice * 0.6) * s.quantity;
    const grossProfit = s.grossProfit !== undefined ? s.grossProfit : (subtotal - costOfGoodsSold);
    const saleDate = s.saleDate;
    
    return {
      ...s,
      subtotal,
      totalAmount,
      costOfGoodsSold,
      grossProfit,
      taxAmount,
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
  const totalItemsSold = filteredSales.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const avgOrderValue = filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0;
  const cashSalesTotal = filteredSales.filter(s => s.paymentType === 'Cash').reduce((sum, s) => sum + s.totalAmount, 0);
  const creditSalesTotal = filteredSales.filter(s => s.paymentType === 'Credit').reduce((sum, s) => sum + s.totalAmount, 0);

  // 2. Purchase / Asset Valuation Report Math
  // Total purchase asset value acquired during this range
  const totalPurchaseValue = products.reduce((sum, p) => {
    return sum + (p.purchasePrice * p.currentStock);
  }, 0);
  const potentialSellingValue = products.reduce((sum, p) => {
    return sum + (p.sellingPrice * p.currentStock);
  }, 0);
  const unrealizedProfitValuation = potentialSellingValue - totalPurchaseValue;

  // 3. Profit / Loss Report Math
  const costOfGoodsSold = filteredSales.reduce((sum, s) => sum + s.costOfGoodsSold, 0);
  const totalSubtotal = filteredSales.reduce((sum, s) => sum + s.subtotal, 0);
  const grossProfit = filteredSales.reduce((sum, s) => sum + s.grossProfit, 0);
  const marginPercentage = totalSubtotal > 0 ? (grossProfit / totalSubtotal) * 100 : 0;

  // 4. Customer Due Math (Direct Outstanding Receivables)
  const customersWithDue = customers.filter(c => c.dueBalance > 0);
  const totalCustomerDueOutstanding = customers.reduce((sum, c) => sum + (c.dueBalance || 0), 0);

  // 5. Supplier Due Math (Direct Outstanding Payables)
  const suppliersWithDue = suppliers.filter(s => (s.dueBalance ?? 0) > 0);
  const totalSupplierDueOutstanding = suppliers.reduce((sum, s) => sum + (s.dueBalance ?? 0), 0);

  // 6. Regional VAT / Tax Math
  const totalTaxableNet = totalSubtotal;
  const calculatedTaxCollected = filteredSales.reduce((sum, s) => sum + s.taxAmount, 0);
  const grossRevenueWithTax = totalRevenue;

  // --- Action: Beautiful CSV Generator (Excel Native Compatible Format) ---
  const handleExportCSV = () => {
    let csvContent = "";
    let fileName = `report_${activeReport}_${startDate}_to_${endDate}.csv`;

    // 1. Construct customized layout streams depending on report types
    if (activeReport === 'sales') {
      csvContent = "Invoice ID,Customer ID,Customer Name,Product SKU,Product Name,Quantity,Selling Price ($),Total Revenue ($),Payment Type,Sale Date\n";
      filteredSales.forEach(s => {
        const prodMatch = products.find(p => p.id === s.productId);
        const sku = prodMatch?.sku || "N/A";
        csvContent += `"${s.id}","${s.customerId}","${s.customerName.replace(/"/g, '""')}","${sku}","${s.productName.replace(/"/g, '""')}",${s.quantity},${s.sellingPrice},${s.totalAmount},"${s.paymentType}","${s.saleDate}"\n`;
      });
      csvContent += `\nSUMMARY,Total Transactions,${filteredSales.length},Total Revenue,${totalRevenue},Items Sold,${totalItemsSold},Cash Amount,${cashSalesTotal},Credit Amount,${creditSalesTotal}\n`;
    } 
    else if (activeReport === 'purchases') {
      csvContent = "Product ID,Product Name,SKU,Category,Current Stock,Unit Purchase Price ($),Unit Selling Price ($),Total Purchase Asset Valuation ($)\n";
      products.forEach(p => {
        const valuation = p.purchasePrice * p.currentStock;
        csvContent += `"${p.id}","${p.name.replace(/"/g, '""')}","${p.sku}","${p.category}",${p.currentStock},${p.purchasePrice},${p.sellingPrice},${valuation}\n`;
      });
      csvContent += `\nSUMMARY,Total Active Catalog Items,${products.length},Accumulated Purchase Stock Asset Valuation,${totalPurchaseValue},Potential Inbound Selling Valuation,${potentialSellingValue},Unrealized Stock Margin,${unrealizedProfitValuation}\n`;
    } 
    else if (activeReport === 'profit_loss') {
      csvContent = "Financial Indicator Metric,Calculated Value ($),Proportion Ratio (%)\n";
      csvContent += `"Gross Revenue (Excluding Tax)",${totalSubtotal},100%\n`;
      csvContent += `"Cost of Goods Sold (COGS)",${costOfGoodsSold},${totalSubtotal > 0 ? ((costOfGoodsSold / totalSubtotal) * 100).toFixed(1) : '0'}%\n`;
      csvContent += `"Net Gross Margin/Profit Balance",${grossProfit},${marginPercentage.toFixed(1)}%\n`;
      csvContent += `"Asset Stock Value Added",${totalPurchaseValue},-\n`;
    } 
    else if (activeReport === 'customer_due') {
      csvContent = "Customer Account ID,Recipient Name,Contact Phone,Address Label,Account Type,Ledger Due Balance Receivables ($)\n";
      customers.forEach(c => {
        csvContent += `"${c.id}","${c.name.replace(/"/g, '""')}","${c.phone}","${c.address.replace(/"/g, '""')}","${c.customerType}",${c.dueBalance}\n`;
      });
      csvContent += `\nSUMMARY,Total Active Customers registered,${customers.length},Customers with Unsettled Credit Balances,${customersWithDue.length},Gross Outstanding Due Receivables,${totalCustomerDueOutstanding}\n`;
    } 
    else if (activeReport === 'supplier_due') {
      csvContent = "Supplier ID,Supplier Entity Name,Contact Person,Email Address,Phone,Category Term,Account Payables Balance ($)\n";
      suppliers.forEach(s => {
        csvContent += `"${s.id}","${s.name.replace(/"/g, '""')}","${s.contactPerson ?? ''}","${s.email ?? ''}","${s.phone}","${s.category ?? ''}",${s.dueBalance ?? 0}\n`;
      });
      csvContent += `\nSUMMARY,Total Active Suppliers list,${suppliers.length},Suppliers Outstanding Bills,${suppliersWithDue.length},Gross Outstanding Trade Debts,${totalSupplierDueOutstanding}\n`;
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
      doc.text("SALES REPORT HIGH-LEVEL SUMMARY:", 20, startY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Total Sales Value: $${totalRevenue.toFixed(2)}`, 20, startY + 14);
      doc.text(`Average Basket Size: $${avgOrderValue.toFixed(2)}`, 85, startY + 14);
      doc.text(`Total Goods Dispatched: ${totalItemsSold} Units`, 150, startY + 14);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 26, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("DATE", 18, startY + 31.5);
      doc.text("CUSTOMER RECIPIENT", 42, startY + 31.5);
      doc.text("PRODUCT NAME", 90, startY + 31.5);
      doc.text("QTY", 145, startY + 31.5);
      doc.text("METHOD", 160, startY + 31.5);
      doc.text("TOTAL ($)", 180, startY + 31.5);

      // Table data
      let rowY = startY + 38;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      filteredSales.slice(0, 18).forEach(s => {
        if (rowY > 260) return; // safeguard page overflow
        doc.text(s.saleDate.split('T')[0], 18, rowY);
        doc.text(s.customerName.length > 20 ? s.customerName.substring(0, 20) + '...' : s.customerName, 42, rowY);
        doc.text(s.productName.length > 24 ? s.productName.substring(0, 24) + '...' : s.productName, 90, rowY);
        doc.text(s.quantity.toString(), 145, rowY);
        doc.text(s.paymentType, 160, rowY);
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
      doc.text("STOCK ASSETS & VALUATIONS SUMMARY:", 20, startY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Inventory Purchase Cost: $${totalPurchaseValue.toFixed(2)}`, 20, startY + 14);
      doc.text(`Inbound Market Value: $${potentialSellingValue.toFixed(2)}`, 85, startY + 14);
      doc.text(`Unrealized Margins: $${unrealizedProfitValuation.toFixed(2)}`, 140, startY + 14);

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(15, startY + 26, 180, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("SKU", 18, startY + 31.5);
      doc.text("PRODUCT NAME", 40, startY + 31.5);
      doc.text("CATEGORY", 95, startY + 31.5);
      doc.text("STOCK", 135, startY + 31.5);
      doc.text("UNIT PUR ($)", 150, startY + 31.5);
      doc.text("UNIT SEL ($)", 168, startY + 31.5);
      doc.text("TOTAL VAL ($)", 184, startY + 31.5);

      let rowY = startY + 38;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(7.5);

      products.slice(0, 18).forEach(p => {
        if (rowY > 260) return;
        doc.text(p.sku, 18, rowY);
        doc.text(p.name.length > 24 ? p.name.substring(0, 24) + '...' : p.name, 40, rowY);
        doc.text(p.category, 95, rowY);
        doc.text(p.currentStock.toString(), 135, rowY);
        doc.text(`$${p.purchasePrice.toFixed(2)}`, 150, rowY);
        doc.text(`$${p.sellingPrice.toFixed(2)}`, 168, rowY);
        doc.text(`$${(p.purchasePrice * p.currentStock).toFixed(2)}`, 184, rowY);
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
        { label: "3. Net Margins / Operating Profits", value: grossProfit, color: [5, 150, 105], bold: true },
        { label: "4. Internal Inventory Active Purchase Stock Assets", value: totalPurchaseValue, color: [71, 85, 105] }
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
    return s.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || 
           s.productName.toLowerCase().includes(searchQuery.toLowerCase()) || 
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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start print:grid-cols-4">
        
        {/* REPORT TYPE SELECTOR (LEFT COLUMN) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-col gap-2 lg:col-span-1 print:hidden">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1 col-span-full">Select Report View</span>
          
          {(['sales', 'purchases', 'profit_loss', 'customer_due', 'supplier_due', 'tax_vat', 'activity_logs'] as ReportType[]).map((type) => {
            const isActive = activeReport === type;
            const labelsMap: Record<ReportType, string> = {
              'sales': 'Sales Report',
              'purchases': 'Product Stock Report',
              'profit_loss': 'Profit & Loss Statement',
              'customer_due': 'Customer Due Report',
              'supplier_due': 'Supplier Due Report',
              'tax_vat': 'VAT/Tax Collected Report',
              'activity_logs': 'System Activity Audit Log'
            };

            const colorsMap: Record<ReportType, string> = {
              'sales': 'text-indigo-600 bg-indigo-50 border-indigo-150',
              'purchases': 'text-emerald-700 bg-emerald-50 border-emerald-150',
              'profit_loss': 'text-violet-600 bg-violet-50 border-violet-150',
              'customer_due': 'text-amber-700 bg-amber-50 border-amber-150',
              'supplier_due': 'text-sky-700 bg-sky-50 border-sky-150',
              'tax_vat': 'text-rose-600 bg-rose-50 border-rose-150',
              'activity_logs': 'text-slate-700 bg-slate-50 border-slate-150'
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
                    <p className="text-2xl font-black text-slate-900">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Over {filteredSales.length} transaction entries</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Items Dispatched</span>
                    <p className="text-2xl font-black text-slate-900">{totalItemsSold} Products</p>
                    <p className="text-[10px] text-emerald-600 font-semibold font-mono">Dispatched successfully</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Average Voucher basket</span>
                    <p className="text-2xl font-black text-indigo-600">${avgOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Total / count ratios</p>
                  </div>
                </>
              )}

              {activeReport === 'purchases' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Accumulated Stock Purchase Value</span>
                    <p className="text-2xl font-black text-slate-900">${totalPurchaseValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Based on catalog purchase valuations</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Current Selling Valuation estimate</span>
                    <p className="text-2xl font-black text-slate-900">${potentialSellingValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">At standard pricing ratios</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Catalog Asset Stock Count</span>
                    <p className="text-2xl font-black text-emerald-600">{products.reduce((sum, p) => sum + p.currentStock, 0)} Units</p>
                    <p className="text-[10px] text-slate-400">Across {products.length} catalog items</p>
                  </div>
                </>
              )}

              {activeReport === 'profit_loss' && (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Reconciled Sales Subtotal (Excl. Tax)</span>
                    <p className="text-2xl font-black text-slate-900">${totalSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Within filtered dates</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest block">Cost of Goods Sold (cogs)</span>
                    <p className="text-2xl font-black text-rose-600">${costOfGoodsSold.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400">Calculated inventory costs</p>
                  </div>
                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest block">Net Gross Operating Profits</span>
                    <p className="text-2xl font-black text-emerald-600">${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-emerald-600 font-bold font-mono">Margin: {marginPercentage.toFixed(1)}%</p>
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
                      ${customers.length > 0 ? Math.max(...customers.map(c => c.dueBalance || 0), 0).toFixed(2) : '0.00'}
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
                      ${suppliers.length > 0 ? Math.max(...suppliers.map(s => s.dueBalance || 0), 0).toFixed(2) : '0.00'}
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
                          : "Filter by supplier entity name, category class or contact details..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-xs font-semibold focus:outline-none focus:border-indigo-505 focus:border-indigo-500 transition shadow-2xs placeholder-slate-400"
              />
            </div>
          )}

          {/* TABULAR LAYOUT FOR SELECTED REPORT */}
          <div className="bg-white border border-slate-200 rounded-[2rem] shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              
              {activeReport === 'sales' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white rounded-t-2xl">
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-tl-xl min-w-[120px] whitespace-nowrap">Sale ID / Date</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[140px] whitespace-nowrap">Customer</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[160px] whitespace-nowrap">Product Item</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-center min-w-[70px] whitespace-nowrap">Qty</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[100px] whitespace-nowrap">Payment</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right rounded-tr-xl min-w-[110px] whitespace-nowrap">Nett Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchableSales.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-semibold">
                          No transaction records found matching the criteria
                        </td>
                      </tr>
                    ) : (
                      searchableSales.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition duration-150">
                          <td className="py-4 px-5 whitespace-nowrap">
                            <span className="font-mono font-bold text-xs text-indigo-600 block">{item.id.substring(item.id.length - 8).toUpperCase()}</span>
                            <span className="text-[10px] text-slate-440 text-slate-400 font-semibold">{item.saleDate.split('T')[0]}</span>
                          </td>
                          <td className="py-4 px-5 text-xs font-bold text-slate-800 capitalize whitespace-nowrap">{item.customerName}</td>
                          <td className="py-4 px-5 whitespace-nowrap">
                            <span className="text-xs font-bold text-slate-800 block">{item.productName}</span>
                          </td>
                          <td className="py-4 px-5 text-xs font-bold text-center text-slate-700 whitespace-nowrap">x{item.quantity}</td>
                          <td className="py-4 px-5 text-xs whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-bold text-[9px] ${
                              item.paymentType === 'Cash' 
                                ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                                : 'bg-amber-50 border-amber-100 text-amber-800'
                            }`}>
                              {item.paymentType}
                            </span>
                          </td>
                          <td className="py-4 px-5 text-xs font-bold text-slate-900 text-right whitespace-nowrap">${item.totalAmount.toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeReport === 'purchases' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-tl-xl min-w-[120px] whitespace-nowrap">SKU / Code</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[160px] whitespace-nowrap">Product Name</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider min-w-[130px] whitespace-nowrap">Category</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-center min-w-[140px] whitespace-nowrap">Remaining Stock</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right min-w-[125px] whitespace-nowrap">Unit Purchase</th>
                      <th className="py-3 px-5 text-xs font-bold uppercase tracking-wider text-right rounded-tr-xl min-w-[160px] whitespace-nowrap">Current Stock Valuation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchableProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-semibold">
                          No product catalog profiles available in this filter
                        </td>
                      </tr>
                    ) : (
                      searchableProducts.map((p) => {
                        const stockVal = p.purchasePrice * p.currentStock;
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition duration-150">
                            <td className="py-4 px-5 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">{p.sku}</td>
                            <td className="py-4 px-5 text-xs font-bold text-slate-800 whitespace-nowrap">{p.name}</td>
                            <td className="py-4 px-5 text-xs text-slate-500 capitalize whitespace-nowrap">{p.category}</td>
                            <td className="py-4 px-5 text-xs text-center whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                p.currentStock <= p.minimumStockAlert 
                                  ? 'bg-rose-50 border border-rose-100 text-rose-700' 
                                  : 'bg-slate-50 border border-slate-100 text-slate-700'
                              }`}>
                                {p.currentStock} Units
                              </span>
                            </td>
                            <td className="py-4 px-5 text-xs font-semibold text-right text-slate-600 whitespace-nowrap">${p.purchasePrice.toFixed(2)}</td>
                            <td className="py-4 px-5 text-xs font-bold text-right text-slate-900 whitespace-nowrap">${stockVal.toFixed(2)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
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
                    <div className="flex justify-between items-center py-4 text-sm font-black bg-indigo-50/30 px-4 rounded-xl">
                      <span className="text-indigo-605 text-indigo-600">Net Operating Profits Margin:</span>
                      <span className="text-emerald-600">${grossProfit.toFixed(2)} ({marginPercentage.toFixed(1)}%)</span>
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

            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
