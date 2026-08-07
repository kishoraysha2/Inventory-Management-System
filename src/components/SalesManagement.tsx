import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { calculateCustomerLedger, isVoidStatus, isInactiveStatus, formatQuantity, formatUnitPrice } from '../lib/utils';
import { formatCurrency } from '../utils/currencyFormatter';
import { UnitBadge } from './ui/UnitBadge';
import { ResponsiveKPIValue } from './MetricCard';
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
  FileText,
  Printer,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError, logSystemActivity, logFinancialAudit } from '../lib/firebase';
import { collection, onSnapshot, doc, runTransaction, setDoc } from 'firebase/firestore';
import { Sale, Customer, Product, LineItem, getNormalizedItems, calculateTransactionTotals, calculateLineTotals, BarcodeType } from '../types';
import { getNextPostingNumber, commitNextPostingNumber, ensureSystemAccountsExist, SYSTEM_ACCOUNTS, resolveSystemAccount, validateJournalBalance } from '../lib/postingEngine';
import TaxInvoiceModal from './TaxInvoiceModal';
import LineItemTable from './LineItemTable';
import { usePermission, UserRole } from '../hooks/usePermission';
import { BarcodeExecutionService } from '../services/barcode/execution/BarcodeExecutionService';

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

interface PrintableSaleItem {
  productId: string;
  productName: string;
  sku: string;
  barcodeValue: string;
  barcodeType: BarcodeType;
  quantityToPrint: number;
  copies: number;
  selected: boolean;
}

export default function SalesManagement({ userRole = 'admin' }: { userRole?: UserRole }) {
  const { permissions } = usePermission({ role: userRole });

  // --- Barcode & Invoice Print States (Enterprise Sprint 11.1A Integration) ---
  const [pendingBarcodeSale, setPendingBarcodeSale] = useState<Sale | null>(null);
  const [showSalesPrintOfferModal, setShowSalesPrintOfferModal] = useState<boolean>(false);
  const [showBarcodePrintDialog, setShowBarcodePrintDialog] = useState<boolean>(false);

  const [printableItems, setPrintableItems] = useState<PrintableSaleItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('STD_PRODUCT_38X25MM');
  const [selectedPrinter, setSelectedPrinter] = useState<string>('MZ Thermal Printer ZD421');

  const [isPrintingBatch, setIsPrintingBatch] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    statusMessage: string;
    completed: number;
    failed: number;
    skipped: number;
    startTime: number;
    endTime?: number;
    lastJobId?: string;
  } | null>(null);

  const cancelBatchRef = useRef<boolean>(false);

  const openBarcodePrintForSale = (sale: Sale) => {
    let itemsToProcess: any[] = [];
    if (sale.items && sale.items.length > 0) {
      itemsToProcess = sale.items;
    } else {
      itemsToProcess = [{
        productId: sale.productId,
        productName: sale.productName,
        quantity: sale.quantity || 1,
        productSnapshot: undefined
      }];
    }

    const items: PrintableSaleItem[] = itemsToProcess.map((item) => {
      const matchedProduct = products.find(p => p.id === item.productId) || item.productSnapshot;
      const prodName = item.productName || matchedProduct?.name || sale.productName || 'Unknown Product';
      const prodSku = matchedProduct?.sku || `SKU-${(item.productId || '000').substring(0, 6).toUpperCase()}`;
      const prodBarcode = matchedProduct?.barcode || prodSku;
      const prodBarcodeType: BarcodeType = (matchedProduct?.barcodeType as BarcodeType) || 'CODE128';
      const qty = Math.max(1, Math.round(item.quantity || sale.quantity || 1));

      return {
        productId: item.productId || sale.productId,
        productName: prodName,
        sku: prodSku,
        barcodeValue: prodBarcode,
        barcodeType: prodBarcodeType,
        quantityToPrint: qty,
        copies: 1,
        selected: true,
      };
    });

    setPrintableItems(items);
    setPendingBarcodeSale(sale);
    setShowSalesPrintOfferModal(false);
    setShowBarcodePrintDialog(true);
    setBatchProgress(null);
  };

  const executeBatchPrintForSale = async () => {
    const selectedItems = printableItems.filter(item => item.selected && item.quantityToPrint > 0);
    if (selectedItems.length === 0) return;

    setIsPrintingBatch(true);
    cancelBatchRef.current = false;

    const totalLabels = selectedItems.reduce((sum, item) => sum + item.quantityToPrint, 0);
    const startTime = Date.now();

    setBatchProgress({
      current: 0,
      total: totalLabels,
      statusMessage: 'Preparing labels...',
      completed: 0,
      failed: 0,
      skipped: 0,
      startTime,
    });

    let labelCounter = 0;
    let completed = 0;
    let failed = 0;
    let skipped = 0;
    let lastJobId = '';

    const service = BarcodeExecutionService.getInstance();

    for (const item of selectedItems) {
      for (let q = 1; q <= item.quantityToPrint; q++) {
        if (cancelBatchRef.current) {
          skipped = totalLabels - labelCounter;
          setBatchProgress(prev => prev ? {
            ...prev,
            statusMessage: 'Batch Printing Cancelled by User',
            skipped,
            endTime: Date.now(),
          } : null);
          break;
        }

        labelCounter++;
        setBatchProgress(prev => prev ? {
          ...prev,
          current: labelCounter,
          statusMessage: `Printing label ${labelCounter} / ${totalLabels}: ${item.productName}`,
        } : null);

        try {
          const matchedProd = products.find(p => p.id === item.productId || p.sku === item.sku);
          const categoryVal = matchedProd?.category;
          const brandVal = matchedProd?.brand;
          const unitVal = matchedProd?.unitCode || matchedProd?.unitName || 'PCS';
          const whId = pendingBarcodeSale?.warehouseId || 'WH-MAIN';
          const whName = pendingBarcodeSale?.warehouseName || 'Main Warehouse';

          const result = await service.executePrintBarcode({
            productId: item.productId,
            sku: item.sku,
            productName: item.productName,
            barcodeValue: item.barcodeValue,
            barcodeType: item.barcodeType,
            category: categoryVal,
            categoryName: categoryVal,
            brand: brandVal,
            brandName: brandVal,
            unit: unitVal,
            unitName: unitVal,
            warehouse: whId,
            warehouseName: whName,
            printerName: selectedPrinter || 'MZ Thermal Printer ZD421',
            labelTemplateId: selectedTemplate || 'STD_PRODUCT_38X25MM',
            copies: Math.max(1, item.copies),
            labelWidthMm: 38,
            labelHeightMm: 25,
            rotation: 0,
            printDensity: 15,
            labelType: 'SALES_DISPATCH_LABEL',
            originSource: 'SALES_DISPATCH',
            context: {
              product: {
                id: item.productId,
                name: item.productName,
                sku: item.sku,
                barcode: item.barcodeValue,
                barcodeType: item.barcodeType,
                category: categoryVal,
                brand: brandVal,
                unit: unitVal,
              },
              customer: pendingBarcodeSale?.customerSnapshot ? {
                customerId: pendingBarcodeSale.customerSnapshot.id,
                customerName: pendingBarcodeSale.customerSnapshot.name,
              } : (pendingBarcodeSale?.customerName ? {
                customerId: pendingBarcodeSale.customerId,
                customerName: pendingBarcodeSale.customerName,
              } : undefined),
              salesOrder: pendingBarcodeSale ? {
                soId: pendingBarcodeSale.id,
                invoiceNumber: pendingBarcodeSale.invoiceNumber,
                saleDate: pendingBarcodeSale.saleDate,
              } : undefined,
              warehouse: {
                warehouseId: 'WH-MAIN',
                warehouseName: 'Main Warehouse',
              },
              user: {
                userName: auth.currentUser?.email || 'admin_01@nexus.erp',
                role: userRole,
              },
            },
          });

          if (result.success) {
            completed++;
            lastJobId = result.jobId || lastJobId;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }

        setBatchProgress(prev => prev ? {
          ...prev,
          completed,
          failed,
          skipped,
          lastJobId,
        } : null);
      }

      if (cancelBatchRef.current) break;
    }

    setIsPrintingBatch(false);
    setBatchProgress(prev => prev ? {
      ...prev,
      statusMessage: cancelBatchRef.current ? 'Batch Printing Cancelled' : 'Batch Printing Completed',
      endTime: Date.now(),
    } : null);
  };

  // --- States ---
  const [sales, setSales] = useState<Sale[]>([]);
  const [customersState, setCustomersState] = useState<Customer[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [coa, setCoa] = useState<any[]>([]);
  const [companyProfile, setCompanyProfile] = useState<any>({ taxRatePercent: 15 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    customerId: '',
    productId: '',
    quantity: '1',
    sellingPrice: '',
    taxRatePercent: '15',
    paymentType: 'Cash' as 'Cash' | 'Credit',
    saleDate: new Date().toISOString().split('T')[0]
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [activeIntelligenceProductId, setActiveIntelligenceProductId] = useState<string>('');

  // Keep active intelligence product ID synced with available unique products in line items
  useEffect(() => {
    const selectedProductIds = lineItems.map(item => item.productId).filter(Boolean);
    if (selectedProductIds.length > 0) {
      if (!selectedProductIds.includes(activeIntelligenceProductId)) {
        setActiveIntelligenceProductId(selectedProductIds[0]);
      }
    } else {
      setActiveIntelligenceProductId('');
    }
  }, [lineItems, activeIntelligenceProductId]);

  const productPriceHistory = useMemo(() => {
    if (!activeIntelligenceProductId) return { customerHistory: [], generalHistory: [] };

    const customerHistory: Array<{ date: string; price: number; customerName: string }> = [];
    const generalHistory: Array<{ date: string; price: number; customerName: string }> = [];

    const sortedSales = [...sales]
      .filter(s => !isVoidStatus(s.status))
      .sort((a, b) => new Date(b.saleDate || b.timestamp || 0).getTime() - new Date(a.saleDate || a.timestamp || 0).getTime());

    sortedSales.forEach(s => {
      const items = s.items || [];
      if (items.length > 0) {
        items.forEach(item => {
          if (item.productId === activeIntelligenceProductId) {
            const pt = {
              date: s.saleDate || s.timestamp,
              price: item.unitPrice,
              customerName: s.customerName
            };
            generalHistory.push(pt);
            if (formData.customerId && s.customerId === formData.customerId) {
              customerHistory.push(pt);
            }
          }
        });
      } else if (s.productId === activeIntelligenceProductId) {
        const pt = {
          date: s.saleDate || s.timestamp,
          price: s.sellingPrice || s.unitPrice,
          customerName: s.customerName
        };
        generalHistory.push(pt);
        if (formData.customerId && s.customerId === formData.customerId) {
          customerHistory.push(pt);
        }
      }
    });

    return {
      customerHistory: customerHistory.slice(0, 3), // We only need last 3
      generalHistory: generalHistory.slice(0, 3)     // We only need last 3 for general
    };
  }, [sales, activeIntelligenceProductId, formData.customerId, lineItems]);

  const suggestedPriceInfo = useMemo(() => {
    if (!activeIntelligenceProductId) return { price: 0, source: 'catalog' as const };
    
    const prod = products.find(p => p.id === activeIntelligenceProductId);
    if (!prod) return { price: 0, source: 'catalog' as const };

    const { customerHistory, generalHistory } = productPriceHistory;

    if (customerHistory.length > 0) {
      const sum = customerHistory.reduce((s, pt) => s + pt.price, 0);
      const avg = sum / customerHistory.length;
      return {
        price: avg,
        source: 'customer_average' as const
      };
    }

    if (generalHistory.length > 0) {
      return {
        price: generalHistory[0].price,
        source: 'general_last' as const
      };
    }

    return {
      price: prod.sellingPrice,
      source: 'catalog' as const
    };
  }, [products, activeIntelligenceProductId, productPriceHistory]);

  const applySuggestedPrice = (prodId: string, suggestedPrice: number) => {
    const updatedItems = lineItems.map(item => {
      if (item.productId === prodId) {
        const totals = calculateLineTotals(item.quantity, suggestedPrice, parseFloat(formData.taxRatePercent) || 0);
        return {
          ...item,
          unitPrice: suggestedPrice,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount
        };
      }
      return item;
    });
    setLineItems(updatedItems);
  };

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

  const creditSalesPaymentInfo = useMemo(() => {
    const infoMap = new Map<string, { amountPaid: number; remainingBalance: number; status: 'Unpaid' | 'Partially Paid' | 'Fully Paid' }>();
    
    // Group sales (valid credit sales only) by customer ID
    const customerSalesGroup: Record<string, Sale[]> = {};
    sales.forEach(s => {
      const isVoid = isVoidStatus(s.status);
      const isCredit = (s.paymentType || '').toString().toUpperCase().trim() === 'CREDIT';
      if (!isVoid && isCredit) {
        if (!customerSalesGroup[s.customerId]) {
          customerSalesGroup[s.customerId] = [];
        }
        customerSalesGroup[s.customerId].push(s);
      }
    });

    // Group payments (valid customer payments only) by customer ID
    const customerPaymentsGroup: Record<string, any[]> = {};
    customerPayments.forEach(p => {
      const isVoid = isVoidStatus(p.status);
      if (!isVoid) {
        if (!customerPaymentsGroup[p.customerId]) {
          customerPaymentsGroup[p.customerId] = [];
        }
        customerPaymentsGroup[p.customerId].push(p);
      }
    });

    // For each customer, allocate payments FIFO style to credit sales
    Object.keys(customerSalesGroup).forEach(custId => {
      const custSales = [...customerSalesGroup[custId]];
      // Sort credit sales oldest to newest to allocate FIFO
      custSales.sort((a, b) => new Date(a.saleDate || a.timestamp || 0).getTime() - new Date(b.saleDate || b.timestamp || 0).getTime());

      const custPayments = customerPaymentsGroup[custId] || [];
      // Sum total paid by this customer
      let totalPaidPool = custPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);

      custSales.forEach(sale => {
        const invoiceTotal = sale.totalAmount;
        let allocated = 0;

        if (totalPaidPool > 0) {
          if (totalPaidPool >= invoiceTotal) {
            allocated = invoiceTotal;
            totalPaidPool -= invoiceTotal;
          } else {
            allocated = totalPaidPool;
            totalPaidPool = 0;
          }
        }

        const remaining = Math.max(0, invoiceTotal - allocated);
        let status: 'Unpaid' | 'Partially Paid' | 'Fully Paid' = 'Unpaid';
        if (allocated === 0) {
          status = 'Unpaid';
        } else if (remaining === 0) {
          status = 'Fully Paid';
        } else {
          status = 'Partially Paid';
        }

        infoMap.set(sale.id, {
          amountPaid: allocated,
          remainingBalance: remaining,
          status: status
        });
      });
    });

    return infoMap;
  }, [sales, customerPayments]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'All' | 'Cash' | 'Credit'>('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [selectedSaleForInvoice, setSelectedSaleForInvoice] = useState<Sale | null>(null);
  const [voidConfirmationSale, setVoidConfirmationSale] = useState<Sale | null>(null);
  const [blockedVoidInfo, setBlockedVoidInfo] = useState<{
    sale: Sale;
    invoiceAmount: number;
    settledAmount: number;
    outstandingBalance: number;
  } | null>(null);

  // --- Transaction Voiding securely via Transactions (instead of deletions) ---
  const voidTransaction = async (saleId: string) => {
    console.log("VOID triggered", saleId);
    const sale = sales.find(s => s.id === saleId);
    if (!sale) {
      console.error("Sale not found for voiding:", saleId);
      return;
    }

    // Check if customer payment(s) exist or settled amount > 0
    const payInfo = creditSalesPaymentInfo.get(sale.id);
    const invoiceAmount = sale.totalAmount || 0;
    const settledAmount = payInfo
      ? payInfo.amountPaid
      : (sale.paymentType === 'Credit' ? Math.max(0, invoiceAmount - ((sale as any).dueAmount ?? (sale as any).remainingBalance ?? invoiceAmount)) : 0);
    const outstandingBalance = payInfo
      ? payInfo.remainingBalance
      : (sale.paymentType === 'Credit' ? ((sale as any).dueAmount ?? (sale as any).remainingBalance ?? invoiceAmount) : 0);

    const hasPayments = customerPayments.some(p => 
      !isVoidStatus(p.status) && (p.saleId === sale.id || p.invoiceId === sale.id || (p.customerId === sale.customerId && sale.paymentType === 'Credit' && settledAmount > 0))
    );

    if (settledAmount > 0.001 || hasPayments) {
      setBlockedVoidInfo({
        sale,
        invoiceAmount,
        settledAmount,
        outstandingBalance: Math.max(0, outstandingBalance)
      });
      return;
    }

    setVoidConfirmationSale(sale);
  };

  const handleVoidSale = async (sale: Sale) => {
    console.log("handleVoidSale direct invocation for:", sale.id);
    setFeedback(null);

    // Safeguard check for applied payments
    const payInfo = creditSalesPaymentInfo.get(sale.id);
    const invoiceAmount = sale.totalAmount || 0;
    const settledAmount = payInfo
      ? payInfo.amountPaid
      : (sale.paymentType === 'Credit' ? Math.max(0, invoiceAmount - ((sale as any).dueAmount ?? (sale as any).remainingBalance ?? invoiceAmount)) : 0);
    const outstandingBalance = payInfo
      ? payInfo.remainingBalance
      : (sale.paymentType === 'Credit' ? ((sale as any).dueAmount ?? (sale as any).remainingBalance ?? invoiceAmount) : 0);

    const hasPayments = customerPayments.some(p => 
      !isVoidStatus(p.status) && (p.saleId === sale.id || p.invoiceId === sale.id || (p.customerId === sale.customerId && sale.paymentType === 'Credit' && settledAmount > 0))
    );

    if (settledAmount > 0.001 || hasPayments) {
      setBlockedVoidInfo({
        sale,
        invoiceAmount,
        settledAmount,
        outstandingBalance: Math.max(0, outstandingBalance)
      });
      return;
    }

    try {
      const normalizedItems = getNormalizedItems(sale);

      if (!auth.currentUser) {
        // Local Void Fallback
        const savedSales = localStorage.getItem('inventory_sales') || '[]';
        let salesList: Sale[] = JSON.parse(savedSales);

        const savedProducts = localStorage.getItem('inventory_products') || '[]';
        let productsList: Product[] = JSON.parse(savedProducts);

        const savedCustomers = localStorage.getItem('inventory_customers') || '[]';
        let customersList: Customer[] = JSON.parse(savedCustomers);

        // Restore product stock for all normalized items
        normalizedItems.forEach(item => {
          productsList = productsList.map(p => {
            if (p.id === item.productId) {
              return { ...p, currentStock: (p.currentStock ?? 0) + item.quantity };
            }
            return p;
          });
        });

        // If credit, rollback customer due balance
        if (sale.paymentType === 'Credit') {
          // Do not update dueBalance locally (it remains the Opening Balance)
          // The dynamic ledger recalculation handles the rollback automatically
        }

        // Void the Sale
        salesList = salesList.map(s => s.id === sale.id ? { ...s, status: 'VOID' } : s);

        // Void in Cash Ledger
        if (sale.paymentType === 'Cash') {
          const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
          let ledgerList = JSON.parse(savedLedger);
          const revCashEntry = {
            id: `cl-rev-${sale.id}`,
            type: 'outflow',
            source: 'sale',
            amount: sale.totalAmount ?? 0,
            referenceId: sale.id,
            description: `Cash Reversal for Voided Sale #${sale.invoiceNumber || sale.id}`,
            timestamp: new Date().toISOString(),
            status: 'active',
            isReversal: true,
            reversesCashEntryId: `cl-${sale.id}`,
            postingStatus: 'POSTED'
          };
          ledgerList.push(revCashEntry);
          localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));
        }

        // Save collections
        localStorage.setItem('inventory_sales', JSON.stringify(salesList));
        localStorage.setItem('inventory_products', JSON.stringify(productsList));
        localStorage.setItem('inventory_customers', JSON.stringify(customersList));

        setSales(salesList);
        setProducts(productsList);
        setCustomersState(customersList);

        setFeedback({
          message: `Sales transaction "${sale.id}" has been voided locally. Restored stocks and liabilities.`,
          type: 'success'
        });
        return;
      }

      await runTransaction(db, async (transaction) => {
        // Gather all reads first
        const productRefs = normalizedItems.map(item => doc(db, 'products', item.productId));
        const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

        let customerSnap = null;
        const customerRef = doc(db, 'customers', sale.customerId);
        if (sale.paymentType === 'Credit') {
          customerSnap = await transaction.get(customerRef);
        }

        // Retrieve posting number sequence in READ phase (Voucher type: JV)
        const year = new Date(sale.saleDate).getFullYear() || 2026;
        const { postingNumber: jvPostingNumber, nextVal: jvNextVal } = await getNextPostingNumber(transaction, 'JV', year);

        // Perform writes - update all items
        normalizedItems.forEach((item, idx) => {
          const productSnap = productSnaps[idx];
          if (productSnap.exists()) {
            const productData = productSnap.data() as Product;
            transaction.update(productRefs[idx], {
              currentStock: (productData.currentStock ?? 0) + item.quantity
            });
          }
        });

        if (sale.paymentType === 'Credit' && customerSnap && customerSnap.exists()) {
          // Do not update customer dueBalance on the document to preserve the Opening Balance
          // The dynamic ledger recalculation handles the rollback automatically
        }

        const saleRef = doc(db, 'sales', sale.id);
        transaction.update(saleRef, { status: 'VOID' });

        // --- CASH LEDGER REVERSAL ---
        if (sale.paymentType === 'Cash') {
          const revCashId = `cl-rev-${sale.id}`;
          const revCashRef = doc(db, 'cashLedger', revCashId);
          transaction.set(revCashRef, {
            id: revCashId,
            type: 'outflow',
            source: 'sale',
            amount: sale.totalAmount ?? 0,
            referenceId: sale.id,
            description: `Cash Reversal for Voided Sale #${sale.invoiceNumber || sale.id}`,
            timestamp: new Date().toISOString(),
            status: 'active',
            isReversal: true,
            reversesCashEntryId: `cl-${sale.id}`,
            postingStatus: 'POSTED'
          });
        }

        // --- REVERSAL LEDGER POSTING (JV) ---
        const periodMonth = String(new Date(sale.saleDate).getMonth() + 1).padStart(2, '0');
        const accountingPeriod = `${year}-${periodMonth}`;
        const narration = `Reversal of Sale: ${sale.paymentType} Sale of items to "${sale.customerName}" due to Voiding. Original Sale ID: ${sale.id}`;

        const lines: any[] = [];
        const subtotal = sale.subtotal ?? 0;
        const totalAmount = sale.totalAmount ?? 0;
        const taxAmount = sale.taxAmount ?? 0;

        // Resolve active system accounts dynamically
        const cashAcc = resolveSystemAccount('CASH', coa);
        const arAcc = resolveSystemAccount('ACCOUNTS_RECEIVABLE', coa);
        const salesRevenueAcc = resolveSystemAccount('SALES_REVENUE', coa);
        const outputVatAcc = resolveSystemAccount('OUTPUT_VAT', coa);
        const cogsAcc = resolveSystemAccount('COGS', coa);
        const inventoryAcc = resolveSystemAccount('INVENTORY', coa);

        // Debit: Sales Revenue (subtotal)
        lines.push({
          accountId: salesRevenueAcc.id,
          accountCode: salesRevenueAcc.code,
          accountName: salesRevenueAcc.name,
          debit: subtotal,
          credit: 0,
          baseCurrencyDebit: subtotal,
          baseCurrencyCredit: 0
        });

        // Debit: Output VAT Payable (if taxAmount > 0)
        if (taxAmount > 0) {
          lines.push({
            accountId: outputVatAcc.id,
            accountCode: outputVatAcc.code,
            accountName: outputVatAcc.name,
            debit: taxAmount,
            credit: 0,
            baseCurrencyDebit: taxAmount,
            baseCurrencyCredit: 0
          });
        }

        // Credit: Cash in Hand (if Cash) or Accounts Receivable (if Credit)
        if (sale.paymentType === 'Cash') {
          lines.push({
            accountId: cashAcc.id,
            accountCode: cashAcc.code,
            accountName: cashAcc.name,
            debit: 0,
            credit: totalAmount,
            baseCurrencyDebit: 0,
            baseCurrencyCredit: totalAmount
          });
        } else {
          lines.push({
            accountId: arAcc.id,
            accountCode: arAcc.code,
            accountName: arAcc.name,
            debit: 0,
            credit: totalAmount,
            baseCurrencyDebit: 0,
            baseCurrencyCredit: totalAmount
          });
        }

        // --- LAYER 2: Inventory Consumption Reversal ---
        const saleCogs = sale.costOfGoodsSold ?? 0;
        if (saleCogs > 0) {
          // Debit: Inventory Asset (1300)
          lines.push({
            accountId: inventoryAcc.id,
            accountCode: inventoryAcc.code,
            accountName: inventoryAcc.name,
            debit: saleCogs,
            credit: 0,
            baseCurrencyDebit: saleCogs,
            baseCurrencyCredit: 0
          });

          // Credit: Cost of Goods Sold (5100)
          lines.push({
            accountId: cogsAcc.id,
            accountCode: cogsAcc.code,
            accountName: cogsAcc.name,
            debit: 0,
            credit: saleCogs,
            baseCurrencyDebit: 0,
            baseCurrencyCredit: saleCogs
          });
        }

        // Mandatory Enterprise Journal Integrity Validation (Phase X)
        validateJournalBalance(lines);

        const entryId = `le-void-sale-${sale.id}`;
        const origEntryId = `le-sale-${sale.id}`;

        // Update metadata on original entry
        const origLedgerRef = doc(db, 'ledgerEntries', origEntryId);
        transaction.set(origLedgerRef, {
          isVoided: true,
          voidedAt: new Date().toISOString(),
          voidedBy: auth.currentUser?.email || 'admin_01@nexus.erp',
          voidReason: 'Sales transaction voided',
          reversalEntryId: entryId
        }, { merge: true });

        const ledgerEntry: any = {
          id: entryId,
          postingNumber: jvPostingNumber,
          companyId: sale.companySnapshot?.name ? `comp-${sale.companySnapshot.name.replace(/\s+/g, '-').toLowerCase()}` : 'comp-default',
          branchId: 'branch-main',
          fiscalYear: year,
          accountingPeriod,
          sourceModule: 'SALES',
          postingStatus: 'POSTED',
          currency: 'USD',
          exchangeRate: 1,
          baseCurrencyCode: 'USD',
          version: 1,
          narration,
          createdFrom: sale.id,
          approvalStatus: 'APPROVED',
          postingDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
          lines,
          originalEntryId: origEntryId,
          isReversal: true,
          reversesEntryId: origEntryId,
          customerId: sale.customerId,
          customerName: sale.customerName
        };

        const ledgerRef = doc(db, 'ledgerEntries', entryId);
        transaction.set(ledgerRef, ledgerEntry);

        // Commit sequence number
        commitNextPostingNumber(transaction, 'JV', jvNextVal);
      });

      // Log financial Audit
      await logFinancialAudit({
        action: 'VOID_SALE',
        entityType: 'sale',
        entityId: sale.id,
        referenceId: sale.paymentType === 'Cash' ? `cl-${sale.id}` : null,
        customerId: sale.customerId,
        supplierId: null,
        productId: sale.productId,
        amount: sale.totalAmount,
        paymentType: sale.paymentType,
        previousState: sale,
        newState: { ...sale, status: 'VOID' },
        notes: `Voided sale ID: ${sale.id}`,
        userRole: userRole
      });

      // Log deletions/voids in system activity
      await logSystemActivity(
        "Sale Voided",
        `Permanently marked sales invoice ID: ${sale.id} as VOID. Restored associated stock levels and reversed customer liabilities.`
      );

      setFeedback({
        message: `Sales transaction "${sale.id}" has been successfully VOIDED. Stock and credit ledger balances rolls back safely.`,
        type: 'success'
      });
    } catch (err: any) {
      console.error("Void operations abort:", err);
      let errMsg = err.message || 'Failed to void the sales transaction.';
      if (err.message && err.message.includes("Accounting validation failed")) {
        setFeedback({ message: err.message, type: 'error' });
      } else {
        try {
          handleFirestoreError(err, OperationType.UPDATE, `sales/${sale.id}`);
        } catch (dbErr: any) {
          errMsg = dbErr.message;
        }
        setFeedback({ message: `Access Abort: ${errMsg}`, type: 'error' });
      }
    }
  };


  // --- Validation Errors ---
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Real-time Firestore Sync for Sales, Customers, and Products ---
  useEffect(() => {
    if (!auth.currentUser) {
      // Local fallback
      const savedSales = localStorage.getItem('inventory_sales');
      setSales(savedSales ? JSON.parse(savedSales) : INITIAL_SALES);

      const savedCustomers = localStorage.getItem('inventory_customers');
      setCustomersState(savedCustomers ? JSON.parse(savedCustomers) : []);

      const savedProducts = localStorage.getItem('inventory_products');
      setProducts(savedProducts ? JSON.parse(savedProducts) : []);

      const savedPayments = localStorage.getItem('inventory_customer_payments');
      setCustomerPayments(savedPayments ? JSON.parse(savedPayments) : []);

      const savedCOA = localStorage.getItem('nexus_chart_of_accounts');
      setCoa(savedCOA ? JSON.parse(savedCOA) : []);

      setLoading(false);
      return;
    }

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
      setCustomersState(custList);
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
        const data = docSnap.data() as Product;
        prodList.push({
          ...data,
          id: data.id || docSnap.id
        });
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

    // 4. Sync Customer Payments
    const unsubPayments = onSnapshot(collection(db, 'customerPayments'), (snapshot) => {
      const paymentsList: any[] = [];
      snapshot.forEach((docSnap) => {
        paymentsList.push(docSnap.data());
      });
      setCustomerPayments(paymentsList);
    }, (error) => {
      console.error("Payments sync error in SalesManagement", error);
    });

    // 5. Sync Chart of Accounts
    const unsubCOA = onSnapshot(collection(db, 'chartOfAccounts'), (snapshot) => {
      const coaList: any[] = [];
      snapshot.forEach((docSnap) => {
        coaList.push(docSnap.data());
      });
      setCoa(coaList);
    }, (error) => {
      console.error("COA sync error in SalesManagement", error);
    });

    // 6. Sync Business Profile
    const unsubCompany = onSnapshot(doc(db, 'businessProfile', 'config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCompanyProfile(data);
        if (typeof data.taxRatePercent === 'number') {
          setFormData(prev => ({ ...prev, taxRatePercent: String(data.taxRatePercent) }));
        }
      }
    }, (err) => {
      console.error("Company profile sync error in SalesManagement", err);
    });

    return () => {
      unsubSales();
      unsubCustomers();
      unsubProducts();
      unsubPayments();
      unsubCOA();
      unsubCompany();
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

  useEffect(() => {
    const handleTrigger = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.tab === 'sales') {
        openForm();
      }
    };
    window.addEventListener('nexus-trigger-add-modal', handleTrigger);
    return () => window.removeEventListener('nexus-trigger-add-modal', handleTrigger);
  }, []);

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

  const handleTaxRateChange = (taxRateStr: string) => {
    const rate = parseFloat(taxRateStr) || 0;
    setFormData(prev => ({ ...prev, taxRatePercent: taxRateStr }));
    
    // Recalculate all line items with new tax rate
    const updated = lineItems.map(item => {
      const totals = calculateLineTotals(item.quantity, item.unitPrice, rate);
      return {
        ...item,
        taxRatePercent: rate,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
      };
    });
    setLineItems(updated);
  };

  // --- Form Validation ---
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.customerId) {
      newErrors.customerId = 'Choosing a customer is required';
    }

    if (lineItems.length === 0) {
      newErrors.lineItems = 'At least one product line item is required';
    } else {
      // Check each line item has selected product
      const emptyProductIdx = lineItems.findIndex(item => !item.productId);
      if (emptyProductIdx !== -1) {
        newErrors.lineItems = 'All rows must have a selected product';
      } else {
        // Aggregate requested quantities by productId
        const requestedQuantities: Record<string, number> = {};
        lineItems.forEach(item => {
          requestedQuantities[item.productId] = (requestedQuantities[item.productId] || 0) + item.quantity;
        });

        // Validate stock levels
        for (const [prodId, reqQty] of Object.entries(requestedQuantities)) {
          const product = products.find(p => p.id === prodId);
          if (product && reqQty > product.currentStock) {
            newErrors.lineItems = `Insufficient warehouse stock for "${product.name}". Requested total: ${reqQty} units, but only ${product.currentStock} units are available.`;
            break;
          }
        }
      }
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
    const rate = companyProfile?.taxRatePercent ?? 15;
    setFormData({
      customerId: '',
      productId: '',
      quantity: '1',
      sellingPrice: '',
      taxRatePercent: String(rate),
      paymentType: 'Cash',
      saleDate: new Date().toISOString().split('T')[0]
    });
    setLineItems([
      {
        productId: '',
        productName: '',
        quantity: 1,
        unitPrice: 0,
        subtotal: 0,
        taxRatePercent: rate,
        taxAmount: 0,
        totalAmount: 0,
      }
    ]);
    setErrors({});
    setIsFormOpen(true);
  };

  // --- Submit / Finalize Transaction ---
  const handleSubmitSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const chosenCust = customers.find(c => c.id === formData.customerId);
    if (!chosenCust) {
      setFeedback({ message: 'Selected customer not found.', type: 'error' });
      return;
    }

    const taxRatePercent = parseFloat(formData.taxRatePercent) || 0;

    // PHASE 1: Recalculate ALL Line Items using CURRENT formData.taxRatePercent
    const freshLineItems: LineItem[] = lineItems.map((item) => {
      const lineTotals = calculateLineTotals(item.quantity, item.unitPrice, taxRatePercent);
      return {
        ...item,
        subtotal: lineTotals.subtotal,
        taxRatePercent,
        taxAmount: lineTotals.taxAmount,
        totalAmount: lineTotals.totalAmount,
      };
    });

    // PHASE 2: Single Source of Truth - derive ONE final totals object
    const totalsSummary = calculateTransactionTotals(freshLineItems);
    const subtotal = totalsSummary.subtotal;
    const taxAmount = totalsSummary.taxAmount;
    const totalAmount = totalsSummary.totalAmount;
    const saleId = `sale-${Date.now()}`;

    setIsSaving(true);
    try {
      if (!auth.currentUser) {
        // Offline / local storage setup
        const savedSales = localStorage.getItem('inventory_sales') || '[]';
        let salesList: Sale[] = JSON.parse(savedSales);

        const savedProducts = localStorage.getItem('inventory_products') || '[]';
        let productsList: Product[] = JSON.parse(savedProducts);

        const savedCustomers = localStorage.getItem('inventory_customers') || '[]';
        let customersList: Customer[] = JSON.parse(savedCustomers);

        // First deduct stock for all items
        const offlineAggregated: Record<string, number> = {};
        freshLineItems.forEach(item => {
          offlineAggregated[item.productId] = (offlineAggregated[item.productId] || 0) + item.quantity;
        });

        for (const [prodId, reqQty] of Object.entries(offlineAggregated)) {
          const testProductIndex = productsList.findIndex(p => p.id === prodId);
          if (testProductIndex === -1) {
            const firstItem = freshLineItems.find(item => item.productId === prodId);
            throw new Error(`Product "${firstItem?.productName || 'Unknown'}" no longer exists locally.`);
          }
          const prodData = productsList[testProductIndex];
          if (prodData.currentStock < reqQty) {
            throw new Error(`Insufficient stock level for "${prodData.name}". Available: ${prodData.currentStock}, Requested total: ${reqQty}`);
          }
          // Update product stock
          productsList[testProductIndex] = {
            ...prodData,
            currentStock: prodData.currentStock - reqQty
          };
        }

        // Create customer snapshot
        const customerSnapshot = {
          id: chosenCust.id,
          name: chosenCust.name,
          nameArabic: chosenCust.nameArabic || "",
          phone: chosenCust.phone,
          address: chosenCust.address,
          customerType: chosenCust.customerType,
          vatNumber: chosenCust.vatNumber || "",
          email: chosenCust.email || ""
        };

        // Create company snapshot
        let companySnapshot = {
          name: companyProfile?.name || companyProfile?.companyName || "Apex Global Supply Ltd.",
          companyNameArabic: companyProfile?.companyNameArabic || "",
          address: companyProfile?.address || "740 Industrial Boulevard, Suite C, Austin, TX 78701",
          phone: companyProfile?.phone || "+1 (512) 555-0193",
          email: companyProfile?.email || "billing@apexsupply.com",
          website: companyProfile?.website || "www.apexsupply.com",
          taxRegistrationId: companyProfile?.taxRegistrationId || "VAT-US948301140B",
          taxRatePercent: companyProfile?.taxRatePercent ?? 15,
          tradeName: companyProfile?.tradeName || "Apex Global Supply",
          ownerName: companyProfile?.ownerName || "Apex Global LLC",
          crNumber: companyProfile?.crNumber || "CR-1010349283",
          logo: companyProfile?.logo || ""
        };

        const savedCompany = localStorage.getItem('invoice_company_profile');
        if (savedCompany) {
          try {
            const parsed = JSON.parse(savedCompany);
            companySnapshot = { ...companySnapshot, ...parsed };
          } catch (e) {
            console.error("Failed to parse saved company profile", e);
          }
        }

        // Generate invoice number
        const indexPart = saleId.replace('sale-', '');
        const invoiceNumber = `INV-2026-${indexPart.length > 5 ? indexPart.substring(indexPart.length - 5) : indexPart}`;

        // Create items array with snap values and product snapshots
        const itemsWithSnap = freshLineItems.map(item => {
          const lineTotals = calculateLineTotals(item.quantity, item.unitPrice, taxRatePercent);
          const prod = productsList.find(p => p.id === item.productId);
          const purchasePriceAtSale = prod?.purchasePrice ?? 0;
          const costOfGoodsSold = purchasePriceAtSale * item.quantity;
          const grossProfit = lineTotals.subtotal - costOfGoodsSold;
          const productNameArabic = item.productNameArabic || prod?.nameArabic || "";
          const productSnapshot = prod ? {
            id: prod.id,
            name: prod.name,
            nameArabic: prod.nameArabic || "",
            sku: prod.sku,
            category: prod.category,
            description: prod.description || "",
            unitId: prod.unitId,
            unitCode: prod.unitCode,
            unitName: prod.unitName
          } : undefined;

          return {
            ...item,
            productNameArabic,
            subtotal: lineTotals.subtotal,
            taxRatePercent,
            taxAmount: lineTotals.taxAmount,
            totalAmount: lineTotals.totalAmount,
            purchasePriceAtSale,
            costOfGoodsSold,
            grossProfit,
            unitId: item.unitId || prod?.unitId,
            unitCode: item.unitCode || prod?.unitCode,
            unitName: item.unitName || prod?.unitName,
            productSnapshot
          };
        });

        const totalCOGS = itemsWithSnap.reduce((sum, item) => sum + item.costOfGoodsSold, 0);
        const totalGrossProfit = subtotal - totalCOGS;

        const finalizedSaleWithSnapshot: Sale = {
          id: saleId,
          customerId: chosenCust.id,
          customerName: chosenCust.name,
          customerNameArabic: chosenCust.nameArabic || "",
          companyNameArabic: companySnapshot.companyNameArabic || "",
          productId: freshLineItems[0].productId,
          productName: freshLineItems.length > 1 ? `${freshLineItems[0].productName} + ${freshLineItems.length - 1} items` : freshLineItems[0].productName,
          productNameArabic: itemsWithSnap[0]?.productNameArabic || "",
          quantity: freshLineItems.reduce((sum, item) => sum + item.quantity, 0),
          sellingPrice: freshLineItems[0].unitPrice,
          unitPrice: freshLineItems[0].unitPrice,
          subtotal: subtotal,
          taxRatePercent: taxRatePercent,
          taxAmount: taxAmount,
          totalAmount: totalAmount,
          paymentType: formData.paymentType,
          saleDate: new Date(formData.saleDate).toISOString(),
          timestamp: new Date(formData.saleDate).toISOString(),
          productPurchasePriceAtSale: itemsWithSnap[0]?.purchasePriceAtSale ?? 0,
          productSellingPriceAtSale: freshLineItems[0].unitPrice,
          costOfGoodsSold: totalCOGS,
          grossProfit: totalGrossProfit,
          unitId: freshLineItems[0].unitId || itemsWithSnap[0]?.unitId,
          unitCode: freshLineItems[0].unitCode || itemsWithSnap[0]?.unitCode,
          unitName: freshLineItems[0].unitName || itemsWithSnap[0]?.unitName,
          items: itemsWithSnap,
          customerSnapshot,
          companySnapshot,
          invoiceNumber
        };

        // If Credit, update customer due balance
        if (formData.paymentType === 'Credit') {
          customersList = customersList.map(c => {
            if (c.id === chosenCust.id) {
              // Preserve original dueBalance (opening balance) and original credit
              return { ...c };
            }
            return c;
          });
        }

        // Add to Cash Ledger if Cash
        if (formData.paymentType === 'Cash') {
          const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
          const ledgerList = JSON.parse(savedLedger);
          const cashLedgerId = `cl-${saleId}`;
          ledgerList.unshift({
            id: cashLedgerId,
            type: 'inflow',
            source: 'sale',
            amount: totalAmount,
            referenceId: saleId,
            description: `Sold ${lineItems.length} items to Customer "${chosenCust.name}"`,
            timestamp: new Date().toISOString()
          });
          localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));
        }

        salesList.unshift(finalizedSaleWithSnapshot);

        localStorage.setItem('inventory_sales', JSON.stringify(salesList));
        localStorage.setItem('inventory_products', JSON.stringify(productsList));
        localStorage.setItem('inventory_customers', JSON.stringify(customersList));

        setSales(salesList);
        setProducts(productsList);
        setCustomersState(customersList);

        setFeedback({
          message: `Successfully logged offline multi-line sale of ${formatCurrency(totalAmount)} to "${chosenCust.name}".`,
          type: 'success'
        });
        setIsFormOpen(false);
        setIsSaving(false);
        setPendingBarcodeSale(finalizedSaleWithSnapshot);
        setShowSalesPrintOfferModal(true);
        return;
      }

      let completedSaleRecord: Sale | null = null;

      // Execute Atomic Database Updates
      await runTransaction(db, async (transaction) => {
        // Retrieve company profile configuration live inside the transaction (READ PHASE - must occur before any writes)
        let companySnapshot = {
          name: companyProfile?.name || companyProfile?.companyName || "Apex Global Supply Ltd.",
          companyNameArabic: companyProfile?.companyNameArabic || "",
          address: companyProfile?.address || "740 Industrial Boulevard, Suite C, Austin, TX 78701",
          phone: companyProfile?.phone || "+1 (512) 555-0193",
          email: companyProfile?.email || "billing@apexsupply.com",
          website: companyProfile?.website || "www.apexsupply.com",
          taxRegistrationId: companyProfile?.taxRegistrationId || "VAT-US948301140B",
          taxRatePercent: companyProfile?.taxRatePercent ?? 15,
          tradeName: companyProfile?.tradeName || "Apex Global Supply",
          ownerName: companyProfile?.ownerName || "Apex Global LLC",
          crNumber: companyProfile?.crNumber || "CR-1010349283",
          logo: companyProfile?.logo || ""
        };

        const companyConfigRef = doc(db, 'businessProfile', 'config');
        const companyConfigSnap = await transaction.get(companyConfigRef);
        if (companyConfigSnap.exists()) {
          const bizData = companyConfigSnap.data();
          companySnapshot = {
            name: bizData.name || companySnapshot.name,
            companyNameArabic: bizData.companyNameArabic || bizData.nameArabic || companySnapshot.companyNameArabic || "",
            address: bizData.address || companySnapshot.address,
            phone: bizData.phone || companySnapshot.phone,
            email: bizData.email || companySnapshot.email,
            website: bizData.website || companySnapshot.website,
            taxRegistrationId: bizData.taxRegistrationId || companySnapshot.taxRegistrationId,
            taxRatePercent: typeof bizData.taxRatePercent === 'number' ? bizData.taxRatePercent : companySnapshot.taxRatePercent,
            tradeName: bizData.tradeName || "",
            ownerName: bizData.ownerName || "",
            crNumber: bizData.crNumber || "",
            logo: bizData.logo || ""
          };
        } else {
          const savedCompany = localStorage.getItem('invoice_company_profile');
          if (savedCompany) {
            try {
              const parsed = JSON.parse(savedCompany);
              companySnapshot = { ...companySnapshot, ...parsed };
            } catch (e) {
              console.error("Failed to parse saved company profile", e);
            }
          }
        }

        // A. Verify and read Product stock live in transaction
        // Aggregate all quantities by productId first to enforce a product-level aggregated quantity map
        const aggregatedQuantities: Record<string, number> = {};
        freshLineItems.forEach(item => {
          aggregatedQuantities[item.productId] = (aggregatedQuantities[item.productId] || 0) + item.quantity;
        });

        const uniqueProductIds = Object.keys(aggregatedQuantities);
        const productRefsMap: Record<string, any> = {};
        const productSnapsMap: Record<string, any> = {};

        const uniqueRefs = uniqueProductIds.map(prodId => {
          const ref = doc(db, 'products', prodId);
          productRefsMap[prodId] = ref;
          return ref;
        });

        const uniqueSnaps = await Promise.all(uniqueRefs.map(ref => transaction.get(ref)));
        uniqueSnaps.forEach((snap, idx) => {
          productSnapsMap[uniqueProductIds[idx]] = snap;
        });

        const uniqueProductUpdates: Record<string, { ref: any; newStock: number; purchasePrice: number }> = {};

        for (const prodId of uniqueProductIds) {
          const snap = productSnapsMap[prodId];
          const totalReqQty = aggregatedQuantities[prodId];

          if (!snap.exists()) {
            const firstItem = freshLineItems.find(item => item.productId === prodId);
            throw new Error(`Product "${firstItem?.productName || 'Unknown'}" no longer exists.`);
          }
          const productData = snap.data() as Product;
          if (isInactiveStatus(productData.status)) {
            throw new Error(`Transactional abort: Product "${productData.name}" has been marked as inactive.`);
          }
          const liveProductStock = productData.currentStock ?? 0;

          if (liveProductStock < totalReqQty) {
            throw new Error(`Transactional abort: Insufficient stock for "${productData.name}". Live: ${liveProductStock}, Requested total: ${totalReqQty}`);
          }

          uniqueProductUpdates[prodId] = {
            ref: productRefsMap[prodId],
            newStock: liveProductStock - totalReqQty,
            purchasePrice: productData.purchasePrice ?? 0
          };
        }

        // B. Verify and read Customer balance if Credit Payment
        let liveCustBalance = 0;
        let newCredit = 0;
        let customerRef = null;
        if (formData.paymentType === 'Credit') {
          customerRef = doc(db, 'customers', chosenCust.id);
          const customerSnap = await transaction.get(customerRef);
          if (!customerSnap.exists()) {
            throw new Error(`Customer "${chosenCust.name}" profile was purged/not found.`);
          }
          const customerData = customerSnap.data() as Customer;
          const currentCredit = customerData.customerCredit ?? 0;
          const currentDue = customerData.dueBalance ?? 0;

          if (currentCredit >= totalAmount) {
            newCredit = currentCredit - totalAmount;
            liveCustBalance = currentDue;
          } else {
            const unpaidAmount = totalAmount - currentCredit;
            newCredit = 0;
            liveCustBalance = currentDue + unpaidAmount;
          }
        }

        // Retrieve posting number sequence in READ phase (Voucher type: SV & INV)
        const year = new Date(formData.saleDate).getFullYear() || 2026;
        const { postingNumber, nextVal } = await getNextPostingNumber(transaction, 'SV', year);
        const { postingNumber: invoiceNumber, nextVal: nextInvVal } = await getNextPostingNumber(transaction, 'INV', year);

        // C. WRITE operations (after all READS)
        // Apply one final stock update per unique product to prevent overwrite issues
        Object.values(uniqueProductUpdates).forEach(update => {
          transaction.update(update.ref, {
            currentStock: update.newStock
          });
        });

        if (formData.paymentType === 'Credit' && customerRef) {
          // Do not update dueBalance/customerCredit on Customer document to preserve Opening Balance
          // The dynamic ledger recalculation will automatically compute and reflect the correct balances
        }

        // D. Create items snapshot with correct snap prices
        const customerSnapshot = {
          id: chosenCust.id,
          name: chosenCust.name,
          nameArabic: chosenCust.nameArabic || "",
          phone: chosenCust.phone,
          address: chosenCust.address,
          customerType: chosenCust.customerType,
          vatNumber: chosenCust.vatNumber || "",
          email: chosenCust.email || ""
        };

        // Utilizing sequential transaction-safe invoiceNumber allocated from posting_sequences during READ phase

        const itemsWithSnap = freshLineItems.map((item) => {
          const lineTotals = calculateLineTotals(item.quantity, item.unitPrice, taxRatePercent);
          const pPrice = uniqueProductUpdates[item.productId].purchasePrice;
          const costOfGoodsSold = pPrice * item.quantity;
          const grossProfit = lineTotals.subtotal - costOfGoodsSold;
          
          const snap = productSnapsMap[item.productId];
          const productData = snap?.exists() ? snap.data() as Product : null;
          const productNameArabic = item.productNameArabic || productData?.nameArabic || "";
          const productSnapshot = productData ? {
            id: productData.id || item.productId,
            name: productData.name,
            nameArabic: productData.nameArabic || "",
            sku: productData.sku,
            category: productData.category,
            description: productData.description || "",
            unitId: productData.unitId,
            unitCode: productData.unitCode,
            unitName: productData.unitName
          } : undefined;

          return {
            ...item,
            productNameArabic,
            subtotal: lineTotals.subtotal,
            taxRatePercent,
            taxAmount: lineTotals.taxAmount,
            totalAmount: lineTotals.totalAmount,
            purchasePriceAtSale: pPrice,
            costOfGoodsSold,
            grossProfit,
            unitId: item.unitId || productData?.unitId,
            unitCode: item.unitCode || productData?.unitCode,
            unitName: item.unitName || productData?.unitName,
            productSnapshot
          };
        });

        // E. Log sale ledger block
        const totalCOGS = itemsWithSnap.reduce((sum, item) => sum + item.costOfGoodsSold, 0);
        const totalGrossProfit = subtotal - totalCOGS;

        const finalizedSaleWithSnapshot: Sale = {
          id: saleId,
          customerId: chosenCust.id,
          customerName: chosenCust.name,
          customerNameArabic: chosenCust.nameArabic || "",
          companyNameArabic: companySnapshot.companyNameArabic || "",
          productId: freshLineItems[0].productId,
          productName: freshLineItems.length > 1 ? `${freshLineItems[0].productName} + ${freshLineItems.length - 1} items` : freshLineItems[0].productName,
          productNameArabic: itemsWithSnap[0]?.productNameArabic || "",
          quantity: freshLineItems.reduce((sum, item) => sum + item.quantity, 0),
          sellingPrice: freshLineItems[0].unitPrice,
          unitPrice: freshLineItems[0].unitPrice,
          subtotal: subtotal,
          taxRatePercent: taxRatePercent,
          taxAmount: taxAmount,
          totalAmount: totalAmount,
          paymentType: formData.paymentType,
          saleDate: new Date(formData.saleDate).toISOString(),
          timestamp: new Date(formData.saleDate).toISOString(),
          productPurchasePriceAtSale: itemsWithSnap[0]?.purchasePriceAtSale ?? 0,
          productSellingPriceAtSale: freshLineItems[0].unitPrice,
          costOfGoodsSold: totalCOGS,
          grossProfit: totalGrossProfit,
          unitId: freshLineItems[0].unitId || itemsWithSnap[0]?.unitId,
          unitCode: freshLineItems[0].unitCode || itemsWithSnap[0]?.unitCode,
          unitName: freshLineItems[0].unitName || itemsWithSnap[0]?.unitName,
          items: itemsWithSnap,
          customerSnapshot,
          companySnapshot,
          invoiceNumber
        };

        const saleRef = doc(db, 'sales', saleId);
        transaction.set(saleRef, finalizedSaleWithSnapshot);
        completedSaleRecord = finalizedSaleWithSnapshot;

        if (formData.paymentType === 'Cash') {
          const cashLedgerId = `cl-${saleId}`;
          const cashLedgerRef = doc(db, 'cashLedger', cashLedgerId);
          transaction.set(cashLedgerRef, {
            id: cashLedgerId,
            type: 'inflow',
            source: 'sale',
            amount: totalAmount,
            referenceId: saleId,
            description: `Cash sale of ${freshLineItems.length} items to "${chosenCust.name}"`,
            timestamp: new Date(formData.saleDate).toISOString()
          });
        }

        // --- AUTOMATIC LEDGER POSTING (SV) ---
        const periodMonth = String(new Date(formData.saleDate).getMonth() + 1).padStart(2, '0');
        const accountingPeriod = `${year}-${periodMonth}`;
        const narration = `${formData.paymentType} Sale of ${freshLineItems.length} items to "${chosenCust.name}". Invoice #${invoiceNumber}`;

        const lines: any[] = [];

        // Resolve active system accounts dynamically
        const cashAcc = resolveSystemAccount('CASH', coa);
        const arAcc = resolveSystemAccount('ACCOUNTS_RECEIVABLE', coa);
        const salesRevenueAcc = resolveSystemAccount('SALES_REVENUE', coa);
        const outputVatAcc = resolveSystemAccount('OUTPUT_VAT', coa);
        const cogsAcc = resolveSystemAccount('COGS', coa);
        const inventoryAcc = resolveSystemAccount('INVENTORY', coa);

        // Debit: Cash in Hand (if Cash) or Accounts Receivable (if Credit)
        if (formData.paymentType === 'Cash') {
          lines.push({
            accountId: cashAcc.id,
            accountCode: cashAcc.code,
            accountName: cashAcc.name,
            debit: totalAmount,
            credit: 0,
            baseCurrencyDebit: totalAmount,
            baseCurrencyCredit: 0
          });
        } else {
          lines.push({
            accountId: arAcc.id,
            accountCode: arAcc.code,
            accountName: arAcc.name,
            debit: totalAmount,
            credit: 0,
            baseCurrencyDebit: totalAmount,
            baseCurrencyCredit: 0
          });
        }

        // Credit: Sales Revenue (subtotal)
        lines.push({
          accountId: salesRevenueAcc.id,
          accountCode: salesRevenueAcc.code,
          accountName: salesRevenueAcc.name,
          debit: 0,
          credit: subtotal,
          baseCurrencyDebit: 0,
          baseCurrencyCredit: subtotal
        });

        // Credit: Output VAT Payable (if taxAmount > 0)
        if (taxAmount > 0) {
          lines.push({
            accountId: outputVatAcc.id,
            accountCode: outputVatAcc.code,
            accountName: outputVatAcc.name,
            debit: 0,
            credit: taxAmount,
            baseCurrencyDebit: 0,
            baseCurrencyCredit: taxAmount
          });
        }

        // --- LAYER 2: Inventory Consumption ---
        if (totalCOGS > 0) {
          // Debit: Cost of Goods Sold (5100)
          lines.push({
            accountId: cogsAcc.id,
            accountCode: cogsAcc.code,
            accountName: cogsAcc.name,
            debit: totalCOGS,
            credit: 0,
            baseCurrencyDebit: totalCOGS,
            baseCurrencyCredit: 0
          });

          // Credit: Inventory Asset (1300)
          lines.push({
            accountId: inventoryAcc.id,
            accountCode: inventoryAcc.code,
            accountName: inventoryAcc.name,
            debit: 0,
            credit: totalCOGS,
            baseCurrencyDebit: 0,
            baseCurrencyCredit: totalCOGS
          });
        }

        // Phase 3: General Ledger Validation - verify AR (or Cash) Debit == Revenue Credit + VAT Credit
        const mainDebitLine = lines.find(l => l.accountId === (formData.paymentType === 'Cash' ? cashAcc.id : arAcc.id));
        const revLine = lines.find(l => l.accountId === salesRevenueAcc.id);
        const vatLine = lines.find(l => l.accountId === outputVatAcc.id);

        const debitVal = mainDebitLine ? mainDebitLine.debit : 0;
        const revVal = revLine ? revLine.credit : 0;
        const vatVal = vatLine ? vatLine.credit : 0;

        if (Math.abs(debitVal - (revVal + vatVal)) >= 0.01) {
          throw new Error(
            `Accounting validation failed: Accounts Receivable / Cash Debit (${debitVal}) does not equal Revenue Credit (${revVal}) + VAT Credit (${vatVal}).`
          );
        }

        // Mandatory Enterprise Journal Integrity Validation (Phase X)
        validateJournalBalance(lines);

        const entryId = `le-sale-${saleId}`;
        const ledgerEntry: any = {
          id: entryId,
          postingNumber,
          companyId: companySnapshot.name ? `comp-${companySnapshot.name.replace(/\s+/g, '-').toLowerCase()}` : 'comp-default',
          branchId: 'branch-main',
          fiscalYear: year,
          accountingPeriod,
          sourceModule: 'SALES',
          postingStatus: 'POSTED',
          currency: 'USD',
          exchangeRate: 1,
          baseCurrencyCode: 'USD',
          version: 1,
          narration,
          createdFrom: saleId,
          approvalStatus: 'APPROVED',
          postingDate: new Date(formData.saleDate).toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
          lines,
          customerId: chosenCust.id,
          customerName: chosenCust.name
        };

        const ledgerRef = doc(db, 'ledgerEntries', entryId);
        transaction.set(ledgerRef, ledgerEntry);

        // Commit sequence number
        commitNextPostingNumber(transaction, 'SV', nextVal);
        commitNextPostingNumber(transaction, 'INV', nextInvVal);

        // Ensure system accounts and VAT structures exist
        const currentCoaIds = coa.map(c => c.id);
        await ensureSystemAccountsExist(transaction, currentCoaIds);
      });

      // Log financial Audit
      await logFinancialAudit({
        action: 'CREATE_SALE',
        entityType: 'sale',
        entityId: saleId,
        referenceId: formData.paymentType === 'Cash' ? `cl-${saleId}` : null,
        customerId: chosenCust.id,
        supplierId: null,
        productId: lineItems[0].productId,
        amount: totalAmount,
        paymentType: formData.paymentType,
        previousState: {},
        newState: {
          id: saleId,
          customerId: chosenCust.id,
          customerName: chosenCust.name,
          productId: lineItems[0].productId,
          productName: lineItems.length > 1 ? `${lineItems[0].productName} + ${lineItems.length - 1} items` : lineItems[0].productName,
          quantity: lineItems.reduce((sum, item) => sum + item.quantity, 0),
          sellingPrice: lineItems[0].unitPrice,
          unitPrice: lineItems[0].unitPrice,
          subtotal: subtotal,
          taxRatePercent: taxRatePercent,
          taxAmount: taxAmount,
          totalAmount: totalAmount,
          paymentType: formData.paymentType,
          saleDate: new Date(formData.saleDate).toISOString(),
          timestamp: new Date(formData.saleDate).toISOString(),
          items: lineItems
        },
        notes: `Completed multi-line sale of ${lineItems.length} items to "${chosenCust.name}"`,
        userRole: userRole
      });

      // Log activity to the Logs collection
      await logSystemActivity(
        "Sale completed",
        `Completed multi-line sale of ${lineItems.length} items to "${chosenCust.name}" (Subtotal: ${formatCurrency(subtotal)}, VAT Applied: ${formatCurrency(taxAmount)}, Total: ${formatCurrency(totalAmount)}, Payment: ${formData.paymentType})`
      );
      
      for (const item of lineItems) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          await logSystemActivity(
            "Stock updated",
            `Decreased stock level for "${item.productName}" (SKU: ${product.sku}) by -${item.quantity} units.`
          );
        }
      }

      setFeedback({
        message: `Atomically recorded multi-line sale of ${lineItems.length} items to "${chosenCust.name}". Net amount with VAT: ${formatCurrency(totalAmount)}`,
        type: 'success'
      });
      setIsFormOpen(false);
      if (completedSaleRecord) {
        setPendingBarcodeSale(completedSaleRecord);
        setShowSalesPrintOfferModal(true);
      }
    } catch (err: any) {
      console.error("Save sale transaction error:", err);
      let errMsg = err.message || 'Failed to post sale transaction.';
      if (err.message && err.message.includes("Accounting validation failed")) {
        setFeedback({ message: err.message, type: 'error' });
      } else {
        try {
          handleFirestoreError(err, OperationType.WRITE, `sales/${saleId}`);
        } catch (dbErr: any) {
          errMsg = dbErr.message;
        }
        setFeedback({ message: `Database Abort: ${errMsg}`, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Calculate Dynamic Metrics ---
  const activeSales = sales.filter(s => !isVoidStatus(s.status));
  const totalSalesRevenue = activeSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalSalesCount = activeSales.length;
  const cashSalesTotal = activeSales.filter(s => s.paymentType === 'Cash').reduce((sum, s) => sum + s.totalAmount, 0);
  const creditSalesTotal = activeSales.filter(s => s.paymentType === 'Credit').reduce((sum, s) => sum + s.totalAmount, 0);
  const totalItemsSold = activeSales.reduce((sum, s) => sum + s.quantity, 0);

  // --- Filter and Search matching ---
  const filteredSalesList = sales.filter((sale) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      (sale.customerName || '').toLowerCase().includes(query) ||
      (sale.productName || '').toLowerCase().includes(query) ||
      (sale.paymentType || '').toLowerCase().includes(query);

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
      <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-3">
        {/* Total revenue */}
        <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between w-full min-w-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Net Sales Revenue</span>
              <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
            </div>
            <ResponsiveKPIValue value={formatCurrency(totalSalesRevenue)} className="text-slate-900" />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1.5 justify-between">
            <span className="font-medium truncate">Combined: {totalSalesCount} entries</span>
            <span className="text-indigo-600 font-bold shrink-0">{totalItemsSold} units</span>
          </div>
        </div>

        {/* Cash registers ledger breakdown */}
        <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between w-full min-w-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Cash Receipts</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-50 border border-emerald-100 text-emerald-700 uppercase shrink-0">
                Liquidity
              </span>
            </div>
            <ResponsiveKPIValue value={formatCurrency(cashSalesTotal)} className="text-slate-900" />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="truncate">Instant settled trades</span>
            <span className="font-semibold text-slate-700 shrink-0">
              {totalSalesRevenue > 0 ? Math.round((cashSalesTotal / totalSalesRevenue) * 100) : 0}% of net
            </span>
          </div>
        </div>

        {/* Credit registries outstanding billing */}
        <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between w-full min-w-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Total Credit Sales</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-50 border border-blue-100 text-blue-700 uppercase shrink-0">
                Receivables
              </span>
            </div>
            <ResponsiveKPIValue value={formatCurrency(creditSalesTotal)} className="text-slate-900" />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex justify-between items-center">
            <span className="truncate">Customer due invoice ledger</span>
            <span className="font-semibold text-amber-700 shrink-0">
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

              {permissions.createSale && (
                <button
                  type="button"
                  onClick={openForm}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Record New Sale</span>
                </button>
              )}
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
                <motion.div 
                  initial={{ opacity: 0, y: 12 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ duration: 0.3 }}
                  className="mx-auto max-w-md w-full my-6 bg-slate-50/50 border border-slate-200/60 rounded-3xl p-8 text-center flex flex-col items-center gap-4.5 shadow-3xs hover:shadow-2xs transition-all"
                >
                  <div className="relative group">
                    <div className="absolute inset-0 bg-indigo-200/20 rounded-full blur-xl group-hover:scale-125 transition duration-300"></div>
                    <div className="relative w-16 h-16 bg-white border border-slate-100 rounded-2xl shadow-3xs flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-all duration-300">
                      <ShoppingBag className="h-8 w-8 text-slate-400 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest leading-none">
                      {sales.length === 0 ? 'No Sales Yet' : 'No Sales Found'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed font-semibold">
                      {sales.length === 0 
                        ? 'Log your customer sales orders and settlements to build real-time profit reports, ledger charts, and inventory balances.'
                        : searchQuery || paymentFilter !== 'All'
                          ? "We couldn't identify any transactions mapping to your active filters or text inputs."
                          : 'No matched sales logs. Clean up filters or register a new transaction.'}
                    </p>
                  </div>
                  <div className="flex gap-2.5 pt-1.5 flex-wrap justify-center">
                    {sales.length > 0 && (searchQuery || paymentFilter !== 'All') ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setPaymentFilter('All');
                        }}
                        className="bg-white border border-slate-200 hover:border-slate-350 text-slate-705 font-extrabold text-[11px] uppercase tracking-wider px-5 py-2.5 rounded-xl transition cursor-pointer shadow-3xs"
                      >
                        Reset Search Filters
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openForm()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] uppercase tracking-wider h-10 px-5 rounded-xl transition cursor-pointer shadow-xs hover:shadow-md inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Log First Sales Order</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
                  <div className="overflow-x-auto max-h-[550px]">
                    <table className="w-full text-left border-collapse table-auto">
                      <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-4 px-6">Sale Date</th>
                          <th className="py-4 px-5">Customer & Product</th>
                          <th className="py-4 px-5">Qty & Unit Price</th>
                          <th className="py-4 px-5">Settlement Type</th>
                          <th className="py-4 px-5">Credit Status / Progress</th>
                          <th className="py-4 px-5 text-right font-mono">Invoice Total</th>
                          <th className="py-4 px-6 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                        {filteredSalesList.map((sale) => {
                          const isVoided = isVoidStatus(sale.status);
                          const isCredit = sale.paymentType === 'Credit';
                          const creditInfo = isCredit && !isVoided
                            ? creditSalesPaymentInfo.get(sale.id) || { amountPaid: 0, remainingBalance: sale.totalAmount, status: 'Unpaid' }
                            : null;

                          return (
                            <tr 
                              key={sale.id}
                              className={`hover:bg-indigo-50/20 even:bg-slate-50/30 transition duration-150 ${
                                isVoided ? 'opacity-40 bg-slate-50 line-through text-slate-400' : ''
                              }`}
                            >
                              {/* Date */}
                              <td className="py-4 px-6 font-mono text-slate-500 font-bold whitespace-nowrap">
                                {new Date(sale.saleDate).toLocaleDateString(undefined, { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  year: 'numeric' 
                                })}
                              </td>

                              {/* Customer & Product */}
                              <td className="py-4 px-5 whitespace-nowrap">
                                <div className="font-extrabold text-slate-900 capitalize">{sale.customerName}</div>
                                <div className="text-[11px] text-slate-500 font-normal flex items-center gap-1.5 mt-0.5">
                                  <span>{sale.productName}</span>
                                  <UnitBadge unitCode={sale.unitCode} unitName={sale.unitName} size="sm" />
                                </div>
                              </td>

                              {/* Qty & Unit Price */}
                              <td className="py-4 px-5 font-mono whitespace-nowrap text-slate-700">
                                <span className="font-bold text-slate-900 bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/60 mr-1.5">
                                  {formatQuantity(sale.quantity, sale.unitCode)}
                                </span>
                                @ {formatUnitPrice(sale.sellingPrice, sale.unitCode)}
                              </td>

                              {/* Settlement */}
                              <td className="py-4 px-5 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-0.5 rounded-full border ${
                                  sale.paymentType === 'Cash' 
                                    ? 'bg-emerald-50 border-emerald-250/60 text-emerald-700 shadow-3xs' 
                                    : 'bg-blue-50 border-blue-200 text-blue-700 shadow-3xs'
                                }`}>
                                  <CreditCard className="h-2.5 w-2.5 shrink-0" />
                                  {sale.paymentType}
                                </span>
                              </td>

                              {/* Credit progression */}
                              <td className="py-4 px-5">
                                {isVoided ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 shadow-3xs">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                    Void
                                  </span>
                                ) : isCredit && creditInfo ? (
                                  <div className="space-y-1.5 max-w-[200px]">
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold border uppercase tracking-wider ${
                                        creditInfo.status === 'Fully Paid'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-250/60 shadow-3xs'
                                          : 'bg-orange-55 bg-orange-50 text-orange-705 text-orange-700 border border-orange-200/60 shadow-3xs'
                                      }`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${
                                          creditInfo.status === 'Fully Paid' ? 'bg-emerald-500' : 'bg-orange-55 bg-orange-500'
                                        }`}></span>
                                        {creditInfo.status === 'Fully Paid' ? 'Paid' : 'Pending'}
                                      </span>
                                      <span className="font-mono text-slate-400 font-bold">
                                        {Math.round((creditInfo.amountPaid / sale.totalAmount) * 100)}%
                                      </span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full rounded-full transition-all duration-300 ${
                                          creditInfo.status === 'Fully Paid' ? 'bg-emerald-500' : 'bg-orange-55 bg-orange-400 bg-orange-500'
                                        }`}
                                        style={{ width: `${Math.min(100, (creditInfo.amountPaid / sale.totalAmount) * 100)}%` }}
                                      ></div>
                                    </div>
                                    <div className="flex justify-between font-mono text-[9px] text-slate-400">
                                      <span>Paid: {formatCurrency(creditInfo.amountPaid)}</span>
                                      <span>Bal: {formatCurrency(creditInfo.remainingBalance)}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-705 text-emerald-700 border border-emerald-250/60 shadow-3xs">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                    Success / Paid
                                  </span>
                                )}
                              </td>

                              {/* Total Price */}
                              <td className="py-4 px-5 text-right font-black font-mono text-sm text-indigo-600 whitespace-nowrap">
                                {formatCurrency(sale.totalAmount)}
                              </td>

                              {/* Actions */}
                              <td className="py-4 px-6 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedSaleForInvoice(sale)}
                                    className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-55 px-3 py-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition cursor-pointer"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                    <span>Tax Invoice</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openBarcodePrintForSale(sale)}
                                    className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100 px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:text-indigo-800 transition cursor-pointer"
                                    title="Print Barcode Labels for sold items"
                                  >
                                    <Tag className="h-3.5 w-3.5" />
                                    <span>Barcode Labels</span>
                                  </button>
                                  {isVoided ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-[9px] font-mono font-bold text-slate-400 select-none">
                                      VOIDED
                                    </span>
                                  ) : (
                                    permissions.voidSale && (
                                      <button
                                        type="button"
                                        onClick={() => voidTransaction(sale.id)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-50 text-[11px] font-bold text-rose-600 hover:text-rose-700 transition cursor-pointer"
                                        title="Void sale transaction"
                                      >
                                        <span>Void</span>
                                      </button>
                                    )
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-6 sm:px-8 py-5 shrink-0">
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

              {/* Form container with flex-1 overflow-hidden layout */}
              <form onSubmit={handleSubmitSymbol} className="flex flex-col flex-1 overflow-hidden min-h-0">
                {/* Scrollable Form body content */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 min-h-0">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    
                    {/* Main Form Block (Left 2 columns) */}
                    <div className="lg:col-span-2 space-y-6">
                      
                      {/* Select Customer */}
                      <div className="relative w-full">
                        {customers.length === 0 ? (
                          <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800 font-medium animate-fade-in shadow-3xs">
                            ⚠️ No customers registered in index. Please configure Customer profiles inside directory first.
                          </div>
                        ) : (
                          <div className="relative w-full">
                            <select
                              id="form-sales-customer-field"
                              value={formData.customerId}
                              onChange={(e) => handleCustomerChange(e.target.value)}
                              required
                              className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 bg-white appearance-none cursor-pointer disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                                errors.customerId 
                                  ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                                  : 'border-slate-200 focus:border-indigo-605'
                              }`}
                            >
                              <option value="">-- Choose Customer profile --</option>
                              {customers.filter(cust => !isInactiveStatus(cust.status)).map((cust) => (
                                <option key={cust.id} value={cust.id}>
                                  {cust.name} ({cust.customerType} - Due: {formatCurrency(cust.dueBalance)})
                                </option>
                              ))}
                            </select>
                            <label htmlFor="form-sales-customer-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                              Customer Name <span className="text-rose-500 font-extrabold">*</span>
                            </label>
                          </div>
                        )}
                        {errors.customerId && (
                          <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                            <span>{errors.customerId}</span>
                          </div>
                        )}
                      </div>

                      {/* Reusable LineItemTable Component */}
                      <LineItemTable
                        items={lineItems}
                        onChange={setLineItems}
                        products={products}
                        taxRatePercent={parseFloat(formData.taxRatePercent) || 0}
                        pricingMode="sellingPrice"
                      />

                      {errors.lineItems && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                          <span>{errors.lineItems}</span>
                        </div>
                      )}

                      {/* Date and Settlement selection */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {/* Settlement Segment Choice */}
                        <div className="relative w-full">
                          <div className="flex bg-slate-50 border border-slate-200 p-1 rounded-xl h-[52px] items-center">
                            {([ 'Cash', 'Credit' ] as const).map((typeOpt) => (
                              <button
                                key={typeOpt}
                                type="button"
                                onClick={() => setFormData({ ...formData, paymentType: typeOpt })}
                                className={`flex-1 text-center py-2 text-xs font-extrabold rounded-lg uppercase tracking-wider transition cursor-pointer ${
                                  formData.paymentType === typeOpt 
                                    ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/40' 
                                    : 'text-slate-500 hover:text-slate-800 opacity-80'
                                }`}
                              >
                                {typeOpt}
                              </button>
                            ))}
                          </div>
                          <span className="absolute -top-2.5 left-3 px-1.5 bg-white text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                            Settlement Type <span className="text-rose-500 font-extrabold">*</span>
                          </span>
                        </div>

                        {/* Completion date */}
                        <div className="relative w-full">
                          <input
                            type="date"
                            required
                            id="form-sales-date-field"
                            value={formData.saleDate}
                            onChange={(e) => setFormData({ ...formData, saleDate: e.target.value })}
                            className="peer w-full rounded-xl border border-slate-200 bg-white px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:border-indigo-605 focus:ring-1 focus:ring-indigo-605 focus:outline-none transition duration-150 cursor-pointer h-[52px]"
                          />
                          <label htmlFor="form-sales-date-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                            Sale Completion Date <span className="text-rose-500 font-extrabold">*</span>
                          </label>
                          {errors.saleDate && (
                            <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                              <AlertTriangle className="h-3.5 w-3.5 text-rose-505 shrink-0" />
                              <span>{errors.saleDate}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Tax Configuration Segment */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="relative w-full">
                          <span className="absolute right-3.5 top-4.5 text-slate-400 text-xs font-semibold leading-none">%</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            required
                            id="form-sales-tax-field"
                            value={formData.taxRatePercent}
                            onChange={(e) => handleTaxRateChange(e.target.value)}
                            placeholder=" "
                            className={`peer w-full rounded-xl border pl-3.5 pr-8 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                              errors.taxRatePercent 
                                ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                                : 'border-slate-200 focus:border-indigo-605'
                            }`}
                          />
                          <label htmlFor="form-sales-tax-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600 font-bold">
                            Tax / VAT Rate (%) <span className="text-rose-500 font-extrabold">*</span>
                          </label>
                          {errors.taxRatePercent && (
                            <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                              <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                              <span>{errors.taxRatePercent}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Dynamic Summary Breakdown Banner */}
                      {formData.customerId && lineItems.length > 0 && (() => {
                        const totalsSummary = calculateTransactionTotals(lineItems);
                        return (
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
                            <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Dynamic invoice Summary</p>
                            <div className="flex items-center justify-between font-medium">
                              <span className="text-slate-500">
                                Total Line Items ({lineItems.length})
                              </span>
                              <span className="text-slate-800 font-mono font-bold">
                                {formatCurrency(totalsSummary.subtotal)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between font-medium text-[11px] text-slate-500 border-t border-dashed border-slate-200/60 pt-1.5">
                              <span>Total Sales Tax / VAT ({parseFloat(formData.taxRatePercent) || 0}%)</span>
                              <span className="font-mono font-semibold">
                                {formatCurrency(totalsSummary.taxAmount)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between font-bold text-indigo-600 pt-1.5 border-t border-slate-200">
                              <span>Total Invoice Due (Locked)</span>
                              <span className="font-mono font-extrabold text-sm">
                                {formatCurrency(totalsSummary.totalAmount)}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                      
                    </div>

                    {/* Price Intelligence Sidebar (Right 1 column) */}
                    <div className="col-span-1 bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4 shadow-3xs">
                      <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-indigo-500 animate-pulse" />
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                            Price Intelligence
                          </h4>
                        </div>
                        <span className="text-[9px] bg-indigo-50 text-indigo-750 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">
                          Smart AI
                        </span>
                      </div>

                      {!formData.customerId ? (
                        <div className="py-8 text-center text-slate-400 text-xs font-semibold leading-relaxed">
                          Please select a customer first to load real-time pricing intelligence.
                        </div>
                      ) : lineItems.filter(item => item.productId).length === 0 ? (
                        <div className="py-8 text-center text-slate-400 text-xs font-semibold leading-relaxed">
                          No products added to this transaction. Select a product in your line items table to analyze price suggestions.
                        </div>
                      ) : (
                        <>
                          {/* Selected product tab selector if multiple unique products exist */}
                          {(() => {
                            const uniqueSelectedProducts = lineItems
                              .filter(item => item.productId)
                              .reduce((acc, item) => {
                                if (!acc.find(p => p.id === item.productId)) {
                                  const prod = products.find(p => p.id === item.productId);
                                  if (prod) acc.push(prod);
                                }
                                return acc;
                              }, [] as Product[]);

                            return (
                              uniqueSelectedProducts.length > 1 && (
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                    Select Product to Analyze:
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    {uniqueSelectedProducts.map(p => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setActiveIntelligenceProductId(p.id)}
                                        className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                                          activeIntelligenceProductId === p.id
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-3xs'
                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                      >
                                        {p.name.split(' ')[0]}...
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )
                            );
                          })()}

                          {/* Active Product analysis */}
                          {(() => {
                            const activeProd = products.find(p => p.id === activeIntelligenceProductId);
                            if (!activeProd) return null;

                            const { customerHistory, generalHistory } = productPriceHistory;
                            const suggestion = suggestedPriceInfo;

                            return (
                              <div className="space-y-4 text-xs">
                                {/* Selected Product info */}
                                <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-3xs">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                    Analyzing Pricing for:
                                  </span>
                                  <span className="font-bold text-slate-800 text-xs block mt-0.5 truncate">
                                    {activeProd.name}
                                  </span>
                                  <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 mt-1.5 border-t border-slate-100 pt-1.5">
                                    <span>Catalog Selling Price:</span>
                                    <span className="font-bold text-slate-900 font-mono">{formatCurrency(activeProd.sellingPrice)}</span>
                                  </div>
                                </div>

                                {/* Clickable Suggested Price block */}
                                <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 text-center space-y-2">
                                  <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest block">
                                    Suggested selling price
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => applySuggestedPrice(activeIntelligenceProductId, suggestion.price)}
                                    className="mx-auto block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm rounded-xl transition-all shadow-xs hover:shadow-md cursor-pointer group animate-pulse"
                                    title="Click to apply to Unit Price fields"
                                  >
                                    {formatCurrency(suggestion.price)}
                                    <span className="block text-[8px] font-semibold opacity-85 uppercase tracking-widest mt-0.5 group-hover:scale-105 transition-transform">
                                      {suggestion.source === 'customer_average' && '✨ Avg price paid by this customer'}
                                      {suggestion.source === 'general_last' && '✨ Last general sold price'}
                                      {suggestion.source === 'catalog' && '⚙️ Catalog retail standard'}
                                    </span>
                                  </button>
                                  <span className="text-[9px] text-slate-400 block font-medium leading-normal">
                                    Click button to instantly auto-fill the unit price fields for this item
                                  </span>
                                </div>

                                {/* Customer specific price history */}
                                <div className="space-y-2">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                    Customer purchase history
                                  </span>
                                  {customerHistory.length === 0 ? (
                                    <p className="text-[10px] text-slate-400 font-semibold italic bg-slate-100/50 p-3 rounded-xl border border-slate-200/50 text-center">
                                      No past invoices found of this product for this customer.
                                    </p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {customerHistory.map((pt, i) => (
                                        <div key={i} className="flex justify-between items-center bg-white border border-slate-100 p-2 rounded-xl text-[11px] shadow-4xs">
                                          <span className="text-slate-500 font-medium">
                                            {new Date(pt.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                          </span>
                                          <span className="font-mono font-black text-slate-800">{formatCurrency(pt.price)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Customer Stats summary (min, max, average) */}
                                {customerHistory.length > 0 && (() => {
                                  const prices = customerHistory.map(pt => pt.price);
                                  const minPrice = Math.min(...prices);
                                  const maxPrice = Math.max(...prices);
                                  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

                                  return (
                                    <div className="bg-slate-100 border border-slate-200 rounded-2xl p-3 grid grid-cols-3 text-center gap-1.5 shadow-4xs">
                                      <div>
                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Min Paid</span>
                                        <span className="font-mono text-[10px] font-bold text-slate-700">{formatCurrency(minPrice)}</span>
                                      </div>
                                      <div className="border-x border-slate-200">
                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Average</span>
                                        <span className="font-mono text-[10px] font-bold text-slate-800">{formatCurrency(avgPrice)}</span>
                                      </div>
                                      <div>
                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Max Paid</span>
                                        <span className="font-mono text-[10px] font-bold text-slate-700">{formatCurrency(maxPrice)}</span>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* General system-wide references */}
                                <div className="space-y-2 pt-1 border-t border-slate-200/50">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                    General System sales history
                                  </span>
                                  {generalHistory.length === 0 ? (
                                    <p className="text-[10px] text-slate-400 font-semibold italic bg-slate-100/50 p-3 rounded-xl border border-slate-200/50 text-center">
                                      No past transactions of this product logged across any profiles.
                                    </p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {generalHistory.slice(0, 2).map((pt, i) => (
                                        <div key={i} className="flex justify-between items-center bg-white/70 border border-slate-100 p-2 rounded-xl text-[10px] shadow-4xs">
                                          <div className="truncate pr-2 max-w-[120px]">
                                            <span className="font-bold text-slate-600 block truncate">{pt.customerName}</span>
                                            <span className="text-[9px] text-slate-400">{new Date(pt.date).toLocaleDateString()}</span>
                                          </div>
                                          <span className="font-mono font-bold text-slate-700 whitespace-nowrap">{formatCurrency(pt.price)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>

                  </div>
                </div>

                {/* Submits - Sticky Footer */}
                <div className="flex justify-end items-center gap-3 px-6 sm:px-8 py-5 border-t border-slate-100 bg-slate-50 shrink-0">
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

      {/* Enterprise Sales Completed Print Offer Modal (Sprint 11.1A Integration) */}
      <AnimatePresence>
        {showSalesPrintOfferModal && pendingBarcodeSale && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xl text-center space-y-6"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                <CheckCircle2 className="h-7 w-7" />
              </div>

              <div className="space-y-2">
                <h3 className="font-sans text-lg font-black tracking-tight text-slate-900">
                  Sales Completed Successfully
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Invoice #{pendingBarcodeSale.invoiceNumber || pendingBarcodeSale.id.substring(0, 12)} • Customer: <span className="font-bold text-slate-700">{pendingBarcodeSale.customerName}</span>
                </p>
                <div className="pt-2 text-xs font-bold text-slate-700 bg-slate-50 py-2.5 px-3 rounded-xl border border-slate-100">
                  What would you like to print?
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowSalesPrintOfferModal(false);
                    setPendingBarcodeSale(null);
                  }}
                  className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sale = pendingBarcodeSale;
                    setShowSalesPrintOfferModal(false);
                    setSelectedSaleForInvoice(sale);
                  }}
                  className="w-full sm:w-auto rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition cursor-pointer shadow-xs flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>🖨 Print Tax Invoice</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sale = pendingBarcodeSale;
                    setShowSalesPrintOfferModal(false);
                    openBarcodePrintForSale(sale);
                  }}
                  className="w-full sm:w-auto rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition cursor-pointer shadow-xs flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4 text-white" />
                  <span>🏷 Print Barcode Labels</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Barcode Print Dialog Modal for Sales */}
      <AnimatePresence>
        {showBarcodePrintDialog && pendingBarcodeSale && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl my-8"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                    <Printer className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">Sales Barcode Print Dialog</h2>
                    <p className="text-xs text-slate-500">
                      Invoice #{pendingBarcodeSale.invoiceNumber || pendingBarcodeSale.id.substring(0, 15)} • Customer: {pendingBarcodeSale.customerName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isPrintingBatch) cancelBatchRef.current = true;
                    setShowBarcodePrintDialog(false);
                  }}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Printing Parameters Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Target Printer</label>
                  <input
                    type="text"
                    value={selectedPrinter}
                    onChange={(e) => setSelectedPrinter(e.target.value)}
                    placeholder="MZ Thermal Printer ZD421"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Label Template</label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="STD_PRODUCT_38X25MM">Standard Product Label (38x25mm)</option>
                    <option value="COMPACT_PRICE_25X15MM">Compact Price Tag (25x15mm)</option>
                    <option value="SHIPPING_TAG_50X30MM">Shipping Tag (50x30mm)</option>
                    <option value="LARGE_PALLET_100X150MM">Large Pallet Label (100x150mm)</option>
                  </select>
                </div>
              </div>

              {/* Products Selection List */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-700">Sold Items in Transaction</span>
                  <div className="flex gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPrintableItems(prev => prev.map(i => ({ ...i, selected: true })))}
                      className="text-indigo-600 hover:underline font-semibold cursor-pointer"
                    >
                      ☑ Select All
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => setPrintableItems(prev => prev.map(i => ({ ...i, selected: false })))}
                      className="text-slate-500 hover:underline font-semibold cursor-pointer"
                    >
                      ☐ Unselect All
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {printableItems.map((item, idx) => (
                    <div key={idx} className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${item.selected ? 'bg-indigo-50/20' : 'bg-white opacity-60'}`}>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setPrintableItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: checked } : it));
                          }}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                        />
                        <div>
                          <div className="text-xs font-extrabold text-slate-900">{item.productName}</div>
                          <div className="flex items-center gap-2 sm:gap-3 text-[10px] font-mono text-slate-500 mt-0.5 flex-wrap">
                            <span>SKU: {item.sku}</span>
                            <span>•</span>
                            <span>Barcode: {item.barcodeValue}</span>
                            <span>•</span>
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-bold">{item.barcodeType}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 ml-7 sm:ml-0">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase">Quantity Sold</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantityToPrint}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setPrintableItems(prev => prev.map((it, i) => i === idx ? { ...it, quantityToPrint: val } : it));
                            }}
                            className="w-20 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 text-center"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase">Copies</label>
                          <input
                            type="number"
                            min="1"
                            value={item.copies}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setPrintableItems(prev => prev.map((it, i) => i === idx ? { ...it, copies: val } : it));
                            }}
                            className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 text-center"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Batch Progress Bar if active */}
              {batchProgress && (
                <div className="mb-6 p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-indigo-900">
                    <span>{batchProgress.statusMessage}</span>
                    <span>{batchProgress.current} / {batchProgress.total} Labels</span>
                  </div>
                  <div className="w-full bg-indigo-200/80 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-200"
                      style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-indigo-700 pt-1">
                    <span>Success: {batchProgress.completed} | Failed: {batchProgress.failed} | Skipped: {batchProgress.skipped}</span>
                    {batchProgress.lastJobId && <span>Job: {batchProgress.lastJobId}</span>}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    if (isPrintingBatch) cancelBatchRef.current = true;
                    setShowBarcodePrintDialog(false);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  {isPrintingBatch ? 'Cancel Printing' : 'Close'}
                </button>

                <button
                  type="button"
                  disabled={isPrintingBatch || printableItems.filter(i => i.selected && i.quantityToPrint > 0).length === 0}
                  onClick={executeBatchPrintForSale}
                  className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition cursor-pointer shadow-md flex items-center gap-2"
                >
                  {isPrintingBatch ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Printing Labels...</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" />
                      <span>Print Selected Labels ({printableItems.filter(i => i.selected).reduce((sum, i) => sum + i.quantityToPrint, 0)})</span>
                    </>
                  )}
                </button>
              </div>
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
            sales={sales}
            customerPayments={customerPayments}
            onClose={() => setSelectedSaleForInvoice(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {voidConfirmationSale && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xl"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-sans text-sm font-bold tracking-tight text-slate-850">
                    Confirm Void Transaction
                  </h3>
                  <p className="text-xs text-slate-550 leading-relaxed">
                    Are you sure you want to VOID this sales transaction? This will mark it as VOID, reverse customer due balances, rollback stock levels, and flag the transaction in the ledger. This action is irreversible.
                  </p>
                  <div className="text-[10px] font-mono text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                    <div><span className="font-bold">Transaction ID:</span> {voidConfirmationSale.id}</div>
                    <div><span className="font-bold">Customer:</span> {voidConfirmationSale.customerName}</div>
                    <div><span className="font-bold">Product:</span> {voidConfirmationSale.productName} (x{voidConfirmationSale.quantity})</div>
                    <div><span className="font-bold">Total Amount:</span> {formatCurrency(voidConfirmationSale.totalAmount)}</div>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setVoidConfirmationSale(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const saleToVoid = voidConfirmationSale;
                    setVoidConfirmationSale(null);
                    await handleVoidSale(saleToVoid);
                  }}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition cursor-pointer shadow-xs"
                >
                  Yes, Void Transaction
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {blockedVoidInfo && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-[2.5rem] border border-rose-200 bg-white p-6 sm:p-8 shadow-2xl space-y-5"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 ring-4 ring-rose-50">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-sans text-base font-bold tracking-tight text-slate-900">
                    Cannot Void Sale Transaction
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    Cannot void this sale because customer payment(s) have already been applied. Please void all related settlement transactions before voiding this sale.
                  </p>
                </div>
              </div>

              <div className="text-xs font-mono text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-slate-500 font-sans">Invoice Amount:</span>
                  <span className="font-bold text-slate-900">{formatCurrency(blockedVoidInfo.invoiceAmount)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-slate-500 font-sans">Settled Amount:</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(blockedVoidInfo.settledAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Outstanding Balance:</span>
                  <span className="font-bold text-rose-600">{formatCurrency(blockedVoidInfo.outstandingBalance)}</span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setBlockedVoidInfo(null)}
                  className="w-full sm:w-auto rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition cursor-pointer shadow-sm"
                >
                  Acknowledge & Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
