import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Calendar, 
  AlertTriangle, 
  Truck, 
  Box, 
  TrendingUp, 
  DollarSign, 
  PlusCircle, 
  CornerDownLeft,
  X,
  RefreshCw,
  Clock,
  Filter,
  Printer,
  CheckCircle2,
  Check,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, OperationType, handleFirestoreError, logSystemActivity, logFinancialAudit } from '../lib/firebase';
import { collection, onSnapshot, doc, runTransaction, setDoc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import { Purchase, Supplier, Product, CashLedgerEntry, Capital, CompanySnapshot, UnitConversion, Unit, BarcodeType } from '../types';
import { BarcodeExecutionService } from '../services/barcode/execution/BarcodeExecutionService';
import { UnitConversionService } from '../services/unitConversionService';
import { convertToBase, formatConversionText } from '../lib/unitConversion';
import { usePermission, UserRole } from '../hooks/usePermission';
import { PurchaseDetailModal } from './PurchaseDetailModal';
import { isVoidStatus, isInactiveStatus, formatQuantity, formatUnitPrice } from '../lib/utils';
import { formatCurrency } from '../utils/currencyFormatter';
import { UnitBadge } from './ui/UnitBadge';
import { ResponsiveKPIValue } from './MetricCard';
import { getNextPostingNumber, commitNextPostingNumber, ensureSystemAccountsExist, SYSTEM_ACCOUNTS, resolveSystemAccount, validateJournalBalance } from '../lib/postingEngine';

interface PrintablePurchaseItem {
  productId: string;
  productName: string;
  sku: string;
  barcodeValue: string;
  barcodeType: BarcodeType;
  quantityToPrint: number;
  copies: number;
  selected: boolean;
}

export default function ProcurementManagement({ userRole = 'admin' }: { userRole?: UserRole }) {
  const { permissions } = usePermission({ role: userRole });

  // --- States ---
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>([]);
  const [capital, setCapital] = useState<Capital[]>([]);
  const [coa, setCoa] = useState<any[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanySnapshot>({
    name: "Nexus Enterprise Solutions",
    taxRegistrationId: "300012345600003",
    crNumber: "CR-10102020",
    address: "Enterprise Blvd, Silicon District, Riyadh, Saudi Arabia",
    phone: "+966 11 234 5678",
    email: "info@nexus-erp.com",
    taxRatePercent: 15
  });
  const [loading, setLoading] = useState(true);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // --- Search & Filter States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'All' | 'Cash' | 'Credit'>('All');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [diagnosticTrace, setDiagnosticTrace] = useState<{
    step: string;
    path: string;
    op: string;
    payload: string;
    status: 'PASS' | 'FAIL' | 'PENDING';
    expression?: string;
    reason?: string;
  }[] | null>(null);
  const [voidConfirmationPurchase, setVoidConfirmationPurchase] = useState<Purchase | null>(null);

  // --- Barcode & Invoice Print States (Sprint 11.0A Integration) ---
  const [pendingBarcodePurchase, setPendingBarcodePurchase] = useState<Purchase | null>(null);
  const [showPrintOfferModal, setShowPrintOfferModal] = useState<boolean>(false);
  const [showBarcodePrintDialog, setShowBarcodePrintDialog] = useState<boolean>(false);
  const [selectedPurchaseForInvoice, setSelectedPurchaseForInvoice] = useState<Purchase | null>(null);

  const [printableItems, setPrintableItems] = useState<PrintablePurchaseItem[]>([]);
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

  const openBarcodePrintForPurchase = (purchase: Purchase) => {
    let itemsToProcess: any[] = [];
    if (purchase.items && purchase.items.length > 0) {
      itemsToProcess = purchase.items;
    } else {
      itemsToProcess = [{
        productId: purchase.productId,
        productName: purchase.productName,
        quantity: purchase.enteredQuantity || purchase.quantity || 1,
        productSnapshot: purchase.productSnapshot
      }];
    }

    const items: PrintablePurchaseItem[] = itemsToProcess.map((item) => {
      const matchedProduct = products.find(p => p.id === item.productId) || item.productSnapshot;
      const prodName = item.productName || matchedProduct?.name || purchase.productName || 'Unknown Product';
      const prodSku = matchedProduct?.sku || `SKU-${(item.productId || '000').substring(0, 6).toUpperCase()}`;
      const prodBarcode = matchedProduct?.barcode || prodSku;
      const prodBarcodeType: BarcodeType = (matchedProduct?.barcodeType as BarcodeType) || 'CODE128';
      const qty = Math.max(1, Math.round(item.enteredQuantity || item.quantity || purchase.enteredQuantity || purchase.quantity || 1));

      return {
        productId: item.productId || purchase.productId,
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
    setPendingBarcodePurchase(purchase);
    setShowPrintOfferModal(false);
    setShowBarcodePrintDialog(true);
    setBatchProgress(null);
  };

  const executeBatchPrintForPurchase = async () => {
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
          const whId = pendingBarcodePurchase?.warehouseId || 'WH-MAIN';
          const whName = pendingBarcodePurchase?.warehouseName || 'Main Warehouse';

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
            labelType: 'GOODS_RECEIVING_LABEL',
            originSource: 'PURCHASE_RECEIVING',
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
              supplier: pendingBarcodePurchase?.supplierSnapshot ? {
                supplierId: pendingBarcodePurchase.supplierSnapshot.id,
                supplierName: pendingBarcodePurchase.supplierSnapshot.name,
              } : (pendingBarcodePurchase?.supplierName ? {
                supplierId: pendingBarcodePurchase.supplierId,
                supplierName: pendingBarcodePurchase.supplierName,
              } : undefined),
              purchaseOrder: pendingBarcodePurchase ? {
                poId: pendingBarcodePurchase.id,
                purchaseDate: pendingBarcodePurchase.purchaseDate,
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

    const endTime = Date.now();
    setBatchProgress(prev => prev ? {
      ...prev,
      statusMessage: cancelBatchRef.current ? 'Batch Printing Cancelled' : 'Printing Complete',
      endTime,
    } : null);

    setIsPrintingBatch(false);
  };

  // --- Form States ---
  const [formData, setFormData] = useState({
    supplierId: '',
    productId: '',
    quantity: '1',
    unitCode: '',
    purchasePrice: '',
    paymentType: 'Cash' as 'Cash' | 'Credit',
    purchaseDate: new Date().toISOString().split('T')[0]
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Real-time Firestore Sync ---
  useEffect(() => {
    if (!auth.currentUser) {
      // Local fallback
      const savedPurchases = localStorage.getItem('inventory_purchases');
      setPurchases(savedPurchases ? JSON.parse(savedPurchases) : []);

      const savedSuppliers = localStorage.getItem('inventory_suppliers');
      setSuppliers(savedSuppliers ? JSON.parse(savedSuppliers) : []);

      const savedProducts = localStorage.getItem('inventory_products');
      setProducts(savedProducts ? JSON.parse(savedProducts) : []);

      const savedLedger = localStorage.getItem('inventory_cash_ledger');
      setCashLedger(savedLedger ? JSON.parse(savedLedger) : []);

      const savedCapital = localStorage.getItem('inventory_capital');
      setCapital(savedCapital ? JSON.parse(savedCapital) : []);

      const savedCOA = localStorage.getItem('nexus_chart_of_accounts');
      setCoa(savedCOA ? JSON.parse(savedCOA) : []);

      const savedUnits = localStorage.getItem('inventory_units');
      setUnits(savedUnits ? JSON.parse(savedUnits) : []);

      const savedConversions = localStorage.getItem('inventory_conversions');
      setConversions(savedConversions ? JSON.parse(savedConversions) : []);

      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. Sync Purchases
    const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snapshot) => {
      const purchaseList: Purchase[] = [];
      snapshot.forEach((docSnap) => {
        purchaseList.push(docSnap.data() as Purchase);
      });
      const sorted = purchaseList.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
      setPurchases(sorted);
      setLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'purchases');
      } catch (err: any) {
        setFeedback({ message: `Purchases read error: ${err.message}`, type: 'error' });
      }
      setLoading(false);
    });

    // 2. Sync Suppliers
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const supplierList: Supplier[] = [];
      snapshot.forEach((docSnap) => {
        supplierList.push(docSnap.data() as Supplier);
      });
      setSuppliers(supplierList);
    }, (error) => {
      console.error('Error syncing suppliers:', error);
    });

    // 3. Sync Products
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productList: Product[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Product;
        productList.push({
          ...data,
          id: data.id || docSnap.id
        });
      });
      setProducts(productList);
    }, (error) => {
      console.error('Error syncing products:', error);
    });

    // 4. Sync Cash Ledger
    const unsubCashLedger = onSnapshot(collection(db, 'cashLedger'), (snapshot) => {
      const ledgerList: CashLedgerEntry[] = [];
      snapshot.forEach((docSnap) => {
        ledgerList.push(docSnap.data() as CashLedgerEntry);
      });
      setCashLedger(ledgerList);
    }, (error) => {
      console.error('Error syncing cash ledger in procurement modal:', error);
    });

    // 5. Sync Capital
    const unsubCapital = onSnapshot(collection(db, 'capital'), (snapshot) => {
      const capitalList: Capital[] = [];
      snapshot.forEach((docSnap) => {
        capitalList.push(docSnap.data() as Capital);
      });
      setCapital(capitalList);
    }, (error) => {
      console.error('Error syncing capital in procurement modal:', error);
    });

    // 6. Sync Chart of Accounts
    const unsubCOA = onSnapshot(collection(db, 'chartOfAccounts'), (snapshot) => {
      const coaList: any[] = [];
      snapshot.forEach((docSnap) => {
        coaList.push(docSnap.data());
      });
      setCoa(coaList);
    }, (error) => {
      console.error('Error syncing COA in procurement modal:', error);
    });

    // 7. Sync Company Business Profile
    const unsubCompany = onSnapshot(doc(db, 'businessProfile', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        setCompanyProfile(prev => ({ ...prev, ...(docSnap.data() as Partial<CompanySnapshot>) }));
      }
    }, (error) => {
      console.error('Error syncing company profile in procurement modal:', error);
    });

    // 8. Sync Units
    const unsubUnits = onSnapshot(collection(db, 'units'), (snapshot) => {
      const unitList: Unit[] = [];
      snapshot.forEach((docSnap) => {
        unitList.push(docSnap.data() as Unit);
      });
      setUnits(unitList);
    });

    // 9. Sync Unit Conversions
    const unsubConversions = UnitConversionService.subscribeAllConversions((list) => {
      setConversions(list);
    });

    return () => {
      unsubPurchases();
      unsubSuppliers();
      unsubProducts();
      unsubCashLedger();
      unsubCapital();
      unsubCOA();
      unsubCompany();
      unsubUnits();
      unsubConversions();
    };
  }, []);

  useEffect(() => {
    const handleTrigger = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.tab === 'procurement') {
        openForm();
      }
    };
    window.addEventListener('nexus-trigger-add-modal', handleTrigger);
    return () => window.removeEventListener('nexus-trigger-add-modal', handleTrigger);
  }, []);

  // --- Form Helper: Pre-fill purchase price and unit upon product selection ---
  const handleProductSelect = (selectedId: string) => {
    const selectedProd = products.find(p => p.id === selectedId);
    setFormData(prev => ({
      ...prev,
      productId: selectedId,
      unitCode: selectedProd ? selectedProd.unitCode : '',
      purchasePrice: selectedProd ? selectedProd.purchasePrice.toString() : ''
    }));
    setErrors(prev => {
      const copy = { ...prev };
      delete copy.productId;
      delete copy.unitCode;
      return copy;
    });
  };

  // --- Open form in Create / Edit mode ---
  const openForm = (purchase: Purchase | null = null) => {
    setErrors({});
    if (purchase) {
      setEditingPurchase(purchase);
      setFormData({
        supplierId: purchase.supplierId,
        productId: purchase.productId,
        quantity: (purchase.enteredQuantity ?? purchase.quantity).toString(),
        unitCode: purchase.enteredUnitCode || purchase.unitCode,
        purchasePrice: purchase.purchasePrice.toString(),
        paymentType: purchase.paymentType,
        purchaseDate: purchase.purchaseDate.split('T')[0]
      });
    } else {
      setEditingPurchase(null);
      setFormData({
        supplierId: '',
        productId: '',
        quantity: '1',
        unitCode: '',
        purchasePrice: '',
        paymentType: 'Cash',
        purchaseDate: new Date().toISOString().split('T')[0]
      });
    }
    setIsFormOpen(true);
  };

  // --- Form Validation ---
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.supplierId) newErrors.supplierId = 'Please select a supplier';
    if (!formData.productId) newErrors.productId = 'Please select a product';
    
    const qty = parseInt(formData.quantity);
    if (isNaN(qty) || qty < 1) {
      newErrors.quantity = 'Quantity must be 1 or greater';
    }

    const price = parseFloat(formData.purchasePrice);
    if (isNaN(price) || price < 0) {
      newErrors.purchasePrice = 'Enter a valid positive unit price';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Handles Adding and Editing of Purchases securely ---
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const chosenSupplier = suppliers.find(s => s.id === formData.supplierId);
    const chosenProduct = products.find(p => p.id === formData.productId);

    if (!chosenSupplier || !chosenProduct) {
      setFeedback({ message: 'Selected Supplier or Product not resolved.', type: 'error' });
      return;
    }

    const numQty = parseInt(formData.quantity);
    const numPrice = parseFloat(formData.purchasePrice);
    const selectedUnitCode = formData.unitCode || chosenProduct.unitCode || 'PCS';
    const rawSelUnit = selectedUnitCode || '';
    const safeSelUnit = typeof rawSelUnit === 'string' ? rawSelUnit : String(rawSelUnit || '');
    const rawProdUnit = chosenProduct.unitCode || '';
    const safeProdUnit = typeof rawProdUnit === 'string' ? rawProdUnit : String(rawProdUnit || '');

    const isAlternateUnit = safeSelUnit.trim().toUpperCase() !== safeProdUnit.trim().toUpperCase();

    let conversionFactor = 1;
    let baseQty = numQty;

    if (isAlternateUnit) {
      const rule = conversions.find(c => {
        if (!c || c.productId !== chosenProduct.id) return false;
        const rawAlt = c.alternateUnitCode || '';
        const altCode = typeof rawAlt === 'string' ? rawAlt : String(rawAlt || '');
        return altCode.trim().toUpperCase() === safeSelUnit.trim().toUpperCase() && (c.status === 'active' || c.isActive);
      });

      if (!rule) {
        setErrors(prev => ({ ...prev, unitCode: 'No conversion defined for this unit.' }));
        setFeedback({ message: 'No conversion defined for this unit.', type: 'error' });
        return;
      }

      conversionFactor = Number(rule.conversionFactor) || 1;
      baseQty = convertToBase(numQty, rule.conversionFactor, rule.direction);
    }

    const subtotalCalc = numQty * numPrice;
    const taxRatePercent = companyProfile.taxRatePercent ?? 15;
    const vatCalc = (subtotalCalc * taxRatePercent) / 100;
    const totalCalc = subtotalCalc + vatCalc;

    // --- Cash balance validation to prevent negative cash in hand ---
    if (formData.paymentType === 'Cash') {
      const startingCapital = capital.reduce((sum, entry) => sum + entry.amount, 0);
      const totalInflow = cashLedger
        .filter(entry => entry.type === 'inflow' && !isVoidStatus(entry.status))
        .reduce((sum, entry) => sum + entry.amount, 0);
      const totalOutflow = cashLedger
        .filter(entry => entry.type === 'outflow' && !isVoidStatus(entry.status))
        .reduce((sum, entry) => sum + entry.amount, 0);
      const currentCashInHand = startingCapital + totalInflow - totalOutflow;

      const rollbackAmount = (editingPurchase && editingPurchase.paymentType === 'Cash') ? editingPurchase.totalAmount : 0;
      const effectiveCash = currentCashInHand + rollbackAmount;

      if (totalCalc > effectiveCash) {
        setFeedback({
          message: `Insufficient Cash Balance (Available Cash: ${formatCurrency(effectiveCash)}, Required Payment: ${formatCurrency(totalCalc)}). Available Cash is lower than the payment amount. Please add business capital or use Credit Purchase.`,
          type: 'error'
        });
        setErrors(prev => ({
          ...prev,
          paymentType: `Insufficient cash balance. Available: ${formatCurrency(effectiveCash)}, Required: ${formatCurrency(totalCalc)}.`
        }));
        return;
      }
    }
    
    const purchaseId = editingPurchase ? editingPurchase.id : `purchase-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    const finalizedPurchaseData: Purchase = {
      id: purchaseId,
      supplierId: chosenSupplier.id,
      supplierName: chosenSupplier.name,
      productId: chosenProduct.id,
      productName: chosenProduct.name,
      quantity: baseQty,
      enteredQuantity: numQty,
      enteredUnitCode: selectedUnitCode,
      baseQuantity: baseQty,
      baseUnitCode: chosenProduct.unitCode,
      conversionFactor: conversionFactor,
      isAlternateUnit: isAlternateUnit,
      purchasePrice: numPrice,
      subtotal: subtotalCalc,
      vatAmount: vatCalc,
      taxAmount: vatCalc,
      taxRatePercent: taxRatePercent,
      totalAmount: totalCalc,
      paymentType: formData.paymentType,
      purchaseDate: new Date(formData.purchaseDate).toISOString(),
      companySnapshot: companyProfile,
      supplierSnapshot: chosenSupplier,
      productSnapshot: chosenProduct,
      unitId: chosenProduct.unitId,
      unitCode: selectedUnitCode,
      unitName: chosenProduct.unitName,
      items: [{
        productId: chosenProduct.id,
        productName: chosenProduct.name,
        quantity: baseQty,
        enteredQuantity: numQty,
        enteredUnitCode: selectedUnitCode,
        baseQuantity: baseQty,
        baseUnitCode: chosenProduct.unitCode,
        conversionFactor: conversionFactor,
        isAlternateUnit: isAlternateUnit,
        unitPrice: numPrice,
        subtotal: subtotalCalc,
        taxRatePercent: taxRatePercent,
        taxAmount: vatCalc,
        totalAmount: totalCalc,
        unitId: chosenProduct.unitId,
        unitCode: selectedUnitCode,
        unitName: chosenProduct.unitName,
        productSnapshot: chosenProduct
      }]
    };

    setIsSaving(true);
    setFeedback(null);
    setDiagnosticTrace(null);

    try {
      if (!auth.currentUser) {
        // Local state rollback/calculations for edit mode
        const savedPurchases = localStorage.getItem('inventory_purchases') || '[]';
        let purchasesList: Purchase[] = JSON.parse(savedPurchases);

        const savedProducts = localStorage.getItem('inventory_products') || '[]';
        let productsList: Product[] = JSON.parse(savedProducts);

        const savedSuppliers = localStorage.getItem('inventory_suppliers') || '[]';
        let suppliersList: Supplier[] = JSON.parse(savedSuppliers);

        // A. Handle product stock edits & supplier balance adjustments if we are editing an existing purchase
        if (editingPurchase) {
          // Rollback old product stock
          productsList = productsList.map(p => {
            if (p.id === editingPurchase.productId) {
              return { ...p, currentStock: Math.max(0, (p.currentStock ?? 0) - editingPurchase.quantity) };
            }
            return p;
          });

          // Rollback old supplier metrics
          suppliersList = suppliersList.map(s => {
            if (s.id === editingPurchase.supplierId) {
              const oldTotal = Math.max(0, (s.totalPurchase ?? 0) - editingPurchase.totalAmount);
              const oldCount = Math.max(0, (s.purchaseCount ?? 0) - 1);
              const oldDue = editingPurchase.paymentType === 'Credit' 
                ? Math.max(0, (s.dueBalance ?? 0) - editingPurchase.totalAmount) 
                : (s.dueBalance ?? 0);
              return { ...s, totalPurchase: oldTotal, purchaseCount: oldCount, dueBalance: oldDue };
            }
            return s;
          });

          // Apply current product stock
          productsList = productsList.map(p => {
            if (p.id === chosenProduct.id) {
              return { ...p, currentStock: (p.currentStock ?? 0) + baseQty };
            }
            return p;
          });

          // Apply current supplier metrics
          suppliersList = suppliersList.map(s => {
            if (s.id === chosenSupplier.id) {
              const newTotal = (s.totalPurchase ?? 0) + totalCalc;
              const newCount = (s.purchaseCount ?? 0) + 1;
              const newDue = formData.paymentType === 'Credit' 
                ? (s.dueBalance ?? 0) + totalCalc 
                : (s.dueBalance ?? 0);
              return {
                ...s,
                totalPurchase: newTotal,
                purchaseCount: newCount,
                lastPurchaseDate: formData.purchaseDate,
                dueBalance: newDue
              };
            }
            return s;
          });

          // Update purchase in list
          purchasesList = purchasesList.map(p => p.id === purchaseId ? finalizedPurchaseData : p);
        } else {
          // Adding a brand new purchase
          // Increase product stock
          productsList = productsList.map(p => {
            if (p.id === chosenProduct.id) {
              return { ...p, currentStock: (p.currentStock ?? 0) + baseQty };
            }
            return p;
          });

          // Update supplier metrics (Total Purchase, Count, Last Date, Due Balance)
          suppliersList = suppliersList.map(s => {
            if (s.id === chosenSupplier.id) {
              const newTotal = (s.totalPurchase ?? 0) + totalCalc;
              const newCount = (s.purchaseCount ?? 0) + 1;
              const newDue = formData.paymentType === 'Credit' 
                ? (s.dueBalance ?? 0) + totalCalc 
                : (s.dueBalance ?? 0);
              return {
                ...s,
                totalPurchase: newTotal,
                purchaseCount: newCount,
                lastPurchaseDate: formData.purchaseDate,
                dueBalance: newDue
              };
            }
            return s;
          });

          // Add to Cash Ledger if it was Cash
          if (formData.paymentType === 'Cash') {
            const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
            const ledgerList = JSON.parse(savedLedger);
            ledgerList.unshift({
              id: `cl-${purchaseId}`,
              type: 'outflow',
              source: 'procurement',
              amount: totalCalc,
              referenceId: purchaseId,
              description: `Purchased "${chosenProduct.name}" from supplier "${chosenSupplier.name}"`,
              timestamp: new Date().toISOString()
            });
            localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));
          }

          purchasesList = [finalizedPurchaseData, ...purchasesList];
        }

        // Save everything locally and update local states
        localStorage.setItem('inventory_purchases', JSON.stringify(purchasesList));
        localStorage.setItem('inventory_products', JSON.stringify(productsList));
        localStorage.setItem('inventory_suppliers', JSON.stringify(suppliersList));

        setPurchases(purchasesList);
        setProducts(productsList);
        setSuppliers(suppliersList);

        setFeedback({
          message: editingPurchase 
            ? `Successfully synchronized purchase corrections for "${finalizedPurchaseData.productName}" (Local Only)` 
            : `Permanently logged procurement transaction for "${finalizedPurchaseData.productName}" locally.`,
          type: 'success'
        });
        setIsFormOpen(false);
        setIsSaving(false);
        setPendingBarcodePurchase(finalizedPurchaseData);
        setShowPrintOfferModal(true);
        return;
      }

      await runTransaction(db, async (transaction) => {
        // --- 1. Define all references ---
        const purchaseRef = doc(db, 'purchases', purchaseId);
        const productRef = doc(db, 'products', chosenProduct.id);
        const supplierRef = doc(db, 'suppliers', chosenSupplier.id);

        let oldProductRef = null;
        let oldSupplierRef = null;

        if (editingPurchase) {
          if (editingPurchase.productId !== chosenProduct.id) {
            oldProductRef = doc(db, 'products', editingPurchase.productId);
          }
          if (editingPurchase.supplierId !== chosenSupplier.id) {
            oldSupplierRef = doc(db, 'suppliers', editingPurchase.supplierId);
          }
        }

        // --- 2. Execute ALL reads up front (before any writes) ---
        const productSnap = await transaction.get(productRef);
        const supplierSnap = await transaction.get(supplierRef);

        let oldProductSnap = null;
        if (oldProductRef) {
          oldProductSnap = await transaction.get(oldProductRef);
        }

        let oldSupplierSnap = null;
        if (oldSupplierRef) {
          oldSupplierSnap = await transaction.get(oldSupplierRef);
        }

        const transDateYear = new Date(formData.purchaseDate).getFullYear() || 2026;
        const voucherType = formData.paymentType === 'Cash' ? 'CV' : 'JV';

        // Resolve new entry sequence
        const { postingNumber, nextVal: newNextVal } = await getNextPostingNumber(transaction, voucherType, transDateYear);

        // Resolve reversal entry sequence if editing
        let revPostingNumber = '';
        let rNV = 0;
        if (editingPurchase) {
          const oldDateYear = new Date(editingPurchase.purchaseDate).getFullYear() || 2026;
          const jvAlloc = await getNextPostingNumber(transaction, 'JV', oldDateYear);
          revPostingNumber = jvAlloc.postingNumber;
          rNV = jvAlloc.nextVal;
        }

        // --- 3. Perform writes ---

        // A. Handle rollbacks if we are editing
        if (editingPurchase) {
          // Roll back stock from the old product
          const actualOldProductRef = oldProductRef || productRef;
          const actualOldProductSnap = oldProductRef ? oldProductSnap : productSnap;
          if (actualOldProductSnap && actualOldProductSnap.exists()) {
            const oldProductData = actualOldProductSnap.data() as Product;
            transaction.update(actualOldProductRef, {
              currentStock: Math.max(0, (oldProductData.currentStock ?? 0) - editingPurchase.quantity)
            });
          }

          // Roll back supplier metrics from the old supplier
          const actualOldSupplierRef = oldSupplierRef || supplierRef;
          const actualOldSupplierSnap = oldSupplierRef ? oldSupplierSnap : supplierSnap;
          if (actualOldSupplierSnap && actualOldSupplierSnap.exists()) {
            const oldSupplierData = actualOldSupplierSnap.data() as Supplier;
            const updatedTotal = Math.max(0, (oldSupplierData.totalPurchase ?? 0) - editingPurchase.totalAmount);
            const updatedCount = Math.max(0, (oldSupplierData.purchaseCount ?? 0) - 1);
            const updatedDue = editingPurchase.paymentType === 'Credit' 
              ? Math.max(0, (oldSupplierData.dueBalance ?? 0) - editingPurchase.totalAmount)
              : (oldSupplierData.dueBalance ?? 0);
            transaction.update(actualOldSupplierRef, {
              totalPurchase: updatedTotal,
              purchaseCount: updatedCount,
              dueBalance: updatedDue
            });
          }

          // --- REVERSAL LEDGER POSTING ---
          const invAcc = resolveSystemAccount('INVENTORY', coa);
          const vatAcc = resolveSystemAccount('INPUT_VAT', coa);
          const contraAcc = editingPurchase.paymentType === 'Cash' 
            ? resolveSystemAccount('CASH', coa) 
            : resolveSystemAccount('ACCOUNTS_PAYABLE', coa);

          const oldSubtotal = editingPurchase.subtotal ?? (editingPurchase.totalAmount - (editingPurchase.vatAmount ?? 0));
          const oldVat = editingPurchase.vatAmount ?? 0;

          const revLines = [
            // Credit: Inventory Asset (1300) = oldSubtotal
            {
              accountId: invAcc.id,
              accountCode: invAcc.code,
              accountName: invAcc.name,
              debit: 0,
              credit: oldSubtotal,
              baseCurrencyDebit: 0,
              baseCurrencyCredit: oldSubtotal
            },
            // Credit: Input VAT Receivable (1400) = oldVat (if > 0)
            ...(oldVat > 0 ? [{
              accountId: vatAcc.id,
              accountCode: vatAcc.code,
              accountName: vatAcc.name,
              debit: 0,
              credit: oldVat,
              baseCurrencyDebit: 0,
              baseCurrencyCredit: oldVat
            }] : []),
            // Debit: Cash (1100) or Accounts Payable (2100) = editingPurchase.totalAmount
            {
              accountId: contraAcc.id,
              accountCode: contraAcc.code,
              accountName: contraAcc.name,
              debit: editingPurchase.totalAmount,
              credit: 0,
              baseCurrencyDebit: editingPurchase.totalAmount,
              baseCurrencyCredit: 0
            }
          ];

          const oldPeriodMonth = String(new Date(editingPurchase.purchaseDate).getMonth() + 1).padStart(2, '0');
          const oldAccountingPeriod = `${new Date(editingPurchase.purchaseDate).getFullYear() || 2026}-${oldPeriodMonth}`;
          const revEntryId = `le-purchase-rev-${editingPurchase.id}-${Date.now()}`;

          const reversalLedgerEntry = {
            id: revEntryId,
            postingNumber: revPostingNumber,
            companyId: 'comp-default',
            branchId: 'branch-main',
            fiscalYear: new Date(editingPurchase.purchaseDate).getFullYear() || 2026,
            accountingPeriod: oldAccountingPeriod,
            sourceModule: 'PROCUREMENT' as const,
            postingStatus: 'POSTED' as const,
            currency: 'USD',
            exchangeRate: 1,
            baseCurrencyCode: 'USD',
            version: 1,
            narration: `Reversal of Procurement Entry due to Edit - Original: ${editingPurchase.id}`,
            createdFrom: editingPurchase.id,
            approvalStatus: 'APPROVED' as const,
            postingDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
            lines: revLines,
            originalEntryId: `le-purchase-${editingPurchase.id}`,
            isReversal: true,
            reversesEntryId: `le-purchase-${editingPurchase.id}`,
            supplierId: editingPurchase.supplierId,
            supplierName: editingPurchase.supplierName
          };

          // Mandatory Enterprise Journal Integrity Validation (Phase X)
          validateJournalBalance(revLines);

          const revLedgerRef = doc(db, 'ledgerEntries', revEntryId);
          transaction.set(revLedgerRef, reversalLedgerEntry);
        }

        // B. Update target product with new stock level
        if (!productSnap.exists()) {
          throw new Error(`Standard inventory error: target product "${chosenProduct.name}" does not exist.`);
        }
        
        const currentProductData = productSnap.data() as Product;
        let initialStockForCalc = currentProductData.currentStock ?? 0;
        
        // If this is an edit and it's the exact same product, factor in the rollback subtraction locally
        if (editingPurchase && editingPurchase.productId === chosenProduct.id) {
          initialStockForCalc = Math.max(0, initialStockForCalc - editingPurchase.quantity);
        }

        const finalProductStock = initialStockForCalc + baseQty;
        transaction.update(productRef, {
          currentStock: finalProductStock
        });

        // C. Update target supplier accounts (Total Purchase, Count, Last Date, Due Balance)
        if (!supplierSnap.exists()) {
          throw new Error(`Standard account error: target supplier "${chosenSupplier.name}" is missing.`);
        }
        const currentSupplierData = supplierSnap.data() as Supplier;
        let initialDueForCalc = currentSupplierData.dueBalance ?? 0;
        let initialTotalForCalc = currentSupplierData.totalPurchase ?? 0;
        let initialCountForCalc = currentSupplierData.purchaseCount ?? 0;

        // If this is an edit and it's the exact same supplier, factor in the rollback subtraction locally
        if (editingPurchase && editingPurchase.supplierId === chosenSupplier.id) {
          initialTotalForCalc = Math.max(0, initialTotalForCalc - editingPurchase.totalAmount);
          initialCountForCalc = Math.max(0, initialCountForCalc - 1);
          if (editingPurchase.paymentType === 'Credit') {
            initialDueForCalc = Math.max(0, initialDueForCalc - editingPurchase.totalAmount);
          }
        }

        const finalSupplierDue = formData.paymentType === 'Credit' ? initialDueForCalc + totalCalc : initialDueForCalc;
        const finalSupplierTotal = initialTotalForCalc + totalCalc;
        const finalSupplierCount = initialCountForCalc + 1;
        const purchaseDateStr = formData.purchaseDate || new Date().toISOString().split('T')[0];

        transaction.update(supplierRef, {
          dueBalance: finalSupplierDue,
          totalPurchase: finalSupplierTotal,
          purchaseCount: finalSupplierCount,
          lastPurchaseDate: purchaseDateStr
        });

        // D. Commit final purchase ledger
        transaction.set(purchaseRef, finalizedPurchaseData);

        // --- E. Cash & Capital Accounting Layer ---
        const cashLedgerId = `cl-${purchaseId}`;
        const cashLedgerRef = doc(db, 'cashLedger', cashLedgerId);
        if (formData.paymentType === 'Cash') {
          transaction.set(cashLedgerRef, {
            id: cashLedgerId,
            type: 'outflow',
            source: 'purchase',
            amount: totalCalc,
            referenceId: purchaseId,
            description: `Procured x${numQty} "${chosenProduct.name}" from "${chosenSupplier.name}"`,
            timestamp: new Date(formData.purchaseDate).toISOString()
          });
        } else {
          // If edited and changed from Cash to Credit, delete the CashLedger entry
          if (editingPurchase && editingPurchase.paymentType === 'Cash') {
            transaction.delete(cashLedgerRef);
          }
        }

        // --- F. Double-Entry General Ledger Posting ---
        const invAcc = resolveSystemAccount('INVENTORY', coa);
        const vatAcc = resolveSystemAccount('INPUT_VAT', coa);
        const contraAcc = formData.paymentType === 'Cash'
          ? resolveSystemAccount('CASH', coa)
          : resolveSystemAccount('ACCOUNTS_PAYABLE', coa);

        const lines = [
          // Debit: Inventory Asset (1300) = subtotalCalc
          {
            accountId: invAcc.id,
            accountCode: invAcc.code,
            accountName: invAcc.name,
            debit: subtotalCalc,
            credit: 0,
            baseCurrencyDebit: subtotalCalc,
            baseCurrencyCredit: 0
          },
          // Debit: Input VAT Receivable (1400) = vatCalc (if > 0)
          ...(vatCalc > 0 ? [{
            accountId: vatAcc.id,
            accountCode: vatAcc.code,
            accountName: vatAcc.name,
            debit: vatCalc,
            credit: 0,
            baseCurrencyDebit: vatCalc,
            baseCurrencyCredit: 0
          }] : []),
          // Credit: Cash in Hand (1100) or Accounts Payable (2100) = totalCalc
          {
            accountId: contraAcc.id,
            accountCode: contraAcc.code,
            accountName: contraAcc.name,
            debit: 0,
            credit: totalCalc,
            baseCurrencyDebit: 0,
            baseCurrencyCredit: totalCalc
          }
        ];

        // Mandatory Enterprise Journal Integrity Validation (Phase X)
        validateJournalBalance(lines);

        const periodMonth = String(new Date(formData.purchaseDate).getMonth() + 1).padStart(2, '0');
        const accountingPeriod = `${transDateYear}-${periodMonth}`;
        const entryId = `le-purchase-${purchaseId}`;

        const ledgerEntry = {
          id: entryId,
          postingNumber,
          companyId: 'comp-default',
          branchId: 'branch-main',
          fiscalYear: transDateYear,
          accountingPeriod,
          sourceModule: 'PROCUREMENT' as const,
          postingStatus: 'POSTED' as const,
          currency: 'USD',
          exchangeRate: 1,
          baseCurrencyCode: 'USD',
          version: 1,
          narration: `Procured x${numQty} "${chosenProduct.name}" from "${chosenSupplier.name}" (${formData.paymentType} Purchase)`,
          createdFrom: purchaseId,
          approvalStatus: 'APPROVED' as const,
          postingDate: new Date(formData.purchaseDate + 'T12:00:00Z').toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
          lines,
          supplierId: chosenSupplier.id,
          supplierName: chosenSupplier.name
        };

        const ledgerEntryRef = doc(db, 'ledgerEntries', entryId);
        transaction.set(ledgerEntryRef, ledgerEntry);

        // Commit sequence counters
        commitNextPostingNumber(transaction, voucherType, newNextVal);
        if (editingPurchase && rNV > 0) {
          commitNextPostingNumber(transaction, 'JV', rNV);
        }

        // Ensure default system accounts exist in COA
        const currentCoaIds = coa.map(c => c.id);
        await ensureSystemAccountsExist(transaction, currentCoaIds);
      });

      // Log financial Audit
      await logFinancialAudit({
        action: editingPurchase ? 'UPDATE_PROCUREMENT' : 'CREATE_PROCUREMENT',
        entityType: 'purchase',
        entityId: purchaseId,
        referenceId: formData.paymentType === 'Cash' ? `cl-${purchaseId}` : null,
        customerId: null,
        supplierId: chosenSupplier.id,
        productId: chosenProduct.id,
        amount: totalCalc,
        paymentType: formData.paymentType,
        previousState: editingPurchase || {},
        newState: finalizedPurchaseData,
        notes: editingPurchase 
          ? `Updated procurement of x${numQty} "${chosenProduct.name}" from "${chosenSupplier.name}"`
          : `Procured x${numQty} "${chosenProduct.name}" from "${chosenSupplier.name}"`,
        userRole: userRole
      });

      // Log system operations
      if (editingPurchase) {
        await logSystemActivity(
          "Purchase Edited",
          `Adjusted procurement ledger entry: x${numQty} units of "${chosenProduct.name}" from "${chosenSupplier.name}" (Subtotal: ${formatCurrency(totalCalc)}, Account: ${formData.paymentType})`
        );
      } else {
        await logSystemActivity(
          "Procurement recorded",
          `Procured x${numQty} units of "${chosenProduct.name}" from "${chosenSupplier.name}" (Subtotal: ${formatCurrency(totalCalc)}, Account: ${formData.paymentType})`
        );
      }

      await logSystemActivity(
        "Stock levels adjusted",
        `Increased current stock level for "${chosenProduct.name}" (SKU: ${chosenProduct.sku}) by +${numQty} units.`
      );

      setFeedback({
        message: editingPurchase 
          ? `Successfully adjusted procurement entry for "${chosenProduct.name}".`
          : `Procurement recorded for x${numQty} units of "${chosenProduct.name}".`,
        type: 'success'
      });
      setIsFormOpen(false);
      setPendingBarcodePurchase(finalizedPurchaseData);
      setShowPrintOfferModal(true);
    } catch (err: any) {
      console.error("Procurement writing abort:", err);
      let errMsg = err.message || 'Failed to execute transactional writes.';
      if (err.message && err.message.includes("Accounting validation failed")) {
        setFeedback({ message: err.message, type: 'error' });
      } else {
        try {
          handleFirestoreError(err, OperationType.WRITE, `purchases/${purchaseId}`);
        } catch (dbErr: any) {
          errMsg = dbErr.message;
        }
      }

      // --- RUN TIME SEQUENTIAL DIAGNOSTIC TRACE ---
      const trace: {
        step: string;
        path: string;
        op: string;
        payload: string;
        status: 'PASS' | 'FAIL' | 'PENDING';
        expression?: string;
        reason?: string;
      }[] = [];

      try {
        const productRef = doc(db, 'products', chosenProduct.id);
        const purchaseRef = doc(db, 'purchases', purchaseId);
        const cashLedgerId = `cl-${purchaseId}`;
        const cashLedgerRef = doc(db, 'cashLedger', cashLedgerId);

        // Fetch product data to compute exact stock levels
        const productSnap = await getDoc(productRef);
        const currentProductData = productSnap.exists() ? (productSnap.data() as Product) : null;
        let initialStockForCalc = currentProductData?.currentStock ?? 0;
        if (editingPurchase && editingPurchase.productId === chosenProduct.id) {
          initialStockForCalc = Math.max(0, initialStockForCalc - editingPurchase.quantity);
        }
        const finalProductStock = initialStockForCalc + numQty;

        // Step 1: Product stock level update check
        let step1Pass = false;
        try {
          trace.push({
            step: 'STEP 1',
            path: `products/${chosenProduct.id}`,
            op: 'UPDATE',
            payload: JSON.stringify({ currentStock: finalProductStock }, null, 2),
            status: 'PENDING'
          });

          // Perform individual update
          await updateDoc(productRef, { currentStock: finalProductStock });

          // Succeeded! Instantly rollback to preserve pristine database consistency
          if (currentProductData) {
            await updateDoc(productRef, { currentStock: currentProductData.currentStock ?? 0 });
          }

          trace[trace.length - 1].status = 'PASS';
          step1Pass = true;
        } catch (step1Err: any) {
          console.error("Step 1 Probe Error:", step1Err);
          trace[trace.length - 1].status = 'FAIL';
          trace[trace.length - 1].expression = 'isValidProduct(request.resource.data) && (hasRole("admin") || hasRole("accountant") || (hasRole("cashier") && affectedKeys().hasOnly(["currentStock"])))';
          trace[trace.length - 1].reason = step1Err.message || 'Permission denied on update';
        }

        // Step 2: Purchase entry creation check
        let step2Pass = false;
        if (step1Pass) {
          try {
            trace.push({
              step: 'STEP 2',
              path: `purchases/${purchaseId}`,
              op: 'CREATE',
              payload: JSON.stringify(finalizedPurchaseData, null, 2),
              status: 'PENDING'
            });

            // Perform individual write
            await setDoc(purchaseRef, finalizedPurchaseData);

            // Succeeded! Clean up immediately
            await deleteDoc(purchaseRef);

            trace[trace.length - 1].status = 'PASS';
            step2Pass = true;
          } catch (step2Err: any) {
            console.error("Step 2 Probe Error:", step2Err);
            trace[trace.length - 1].status = 'FAIL';
            trace[trace.length - 1].expression = 'isValidPurchase(request.resource.data) && (hasRole("admin") || hasRole("accountant"))';
            trace[trace.length - 1].reason = step2Err.message || 'Permission denied on create';
          }
        }

        // Step 3: Cash Accounting ledger entry creation check
        if (step1Pass && step2Pass && formData.paymentType === 'Cash') {
          const cashLedgerPayload = {
            id: cashLedgerId,
            type: 'outflow',
            source: 'purchase',
            amount: totalCalc,
            referenceId: purchaseId,
            description: `Procured x${numQty} "${chosenProduct.name}" from "${chosenSupplier.name}"`,
            timestamp: new Date(formData.purchaseDate).toISOString()
          };

          try {
            trace.push({
              step: 'STEP 3',
              path: `cashLedger/${cashLedgerId}`,
              op: 'CREATE',
              payload: JSON.stringify(cashLedgerPayload, null, 2),
              status: 'PENDING'
            });

            // Perform individual write
            await setDoc(cashLedgerRef, cashLedgerPayload);

            // Succeeded! Clean up immediately
            await deleteDoc(cashLedgerRef);

            trace[trace.length - 1].status = 'PASS';
          } catch (step3Err: any) {
            console.error("Step 3 Probe Error:", step3Err);
            trace[trace.length - 1].status = 'FAIL';
            trace[trace.length - 1].expression = 'isValidCashLedgerEntry(request.resource.data) && (hasRole("admin") || hasRole("accountant") || hasRole("cashier"))';
            trace[trace.length - 1].reason = step3Err.message || 'Permission denied on create';
          }
        }

      } catch (probeErr: any) {
        console.error("Diagnostic execution failed:", probeErr);
      }

      setDiagnosticTrace(trace);
      setFeedback({ message: `Transaction failed: ${errMsg}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Transaction Voiding securely via Transactions (instead of deletions) ---
  const voidTransaction = async (purchaseId: string) => {
    console.log("VOID triggered", purchaseId);
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) {
      console.error("Purchase not found for voiding:", purchaseId);
      return;
    }
    setVoidConfirmationPurchase(purchase);
  };

  const handleVoidPurchase = async (purchase: Purchase) => {
    console.log("handleVoidPurchase direct invocation for:", purchase.id);
    setFeedback(null);
    try {
      if (!auth.currentUser) {
        // Local Voiding Fallback
        const savedPurchases = localStorage.getItem('inventory_purchases') || '[]';
        let purchasesList: Purchase[] = JSON.parse(savedPurchases);

        const savedProducts = localStorage.getItem('inventory_products') || '[]';
        let productsList: Product[] = JSON.parse(savedProducts);

        const savedSuppliers = localStorage.getItem('inventory_suppliers') || '[]';
        let suppliersList: Supplier[] = JSON.parse(savedSuppliers);

        productsList = productsList.map(p => {
          if (p.id === purchase.productId) {
            return { ...p, currentStock: Math.max(0, (p.currentStock ?? 0) - purchase.quantity) };
          }
          return p;
        });

        suppliersList = suppliersList.map(s => {
          if (s.id === purchase.supplierId) {
            const oldTotal = Math.max(0, (s.totalPurchase ?? 0) - purchase.totalAmount);
            const oldCount = Math.max(0, (s.purchaseCount ?? 0) - 1);
            const oldDue = purchase.paymentType === 'Credit' 
              ? Math.max(0, (s.dueBalance ?? 0) - purchase.totalAmount) 
              : (s.dueBalance ?? 0);
            return { ...s, totalPurchase: oldTotal, purchaseCount: oldCount, dueBalance: oldDue };
          }
          return s;
        });

        purchasesList = purchasesList.map(p => p.id === purchase.id ? { ...p, status: 'VOID' } : p);

        if (purchase.paymentType === 'Cash') {
          const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
          let ledgerList = JSON.parse(savedLedger);
          const revCashEntry = {
            id: `cl-rev-${purchase.id}`,
            type: 'inflow',
            source: 'procurement',
            amount: purchase.totalAmount,
            referenceId: purchase.id,
            description: `Cash Reversal for Voided Purchase #${purchase.invoiceNumber || purchase.id}`,
            timestamp: new Date().toISOString(),
            status: 'active',
            isReversal: true,
            reversesCashEntryId: `cl-${purchase.id}`,
            postingStatus: 'POSTED'
          };
          ledgerList.push(revCashEntry);
          localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));
        }

        localStorage.setItem('inventory_purchases', JSON.stringify(purchasesList));
        localStorage.setItem('inventory_products', JSON.stringify(productsList));
        localStorage.setItem('inventory_suppliers', JSON.stringify(suppliersList));

        setPurchases(purchasesList);
        setProducts(productsList);
        setSuppliers(suppliersList);

        setFeedback({
          message: `Procurement log for "${purchase.productName}" has been successfully VOIDED locally.`,
          type: 'success'
        });
        return;
      }

      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'products', purchase.productId);
        const supplierRef = doc(db, 'suppliers', purchase.supplierId);

        // -- 1. Gather all READS first --
        const productSnap = await transaction.get(productRef);
        const supplierSnap = await transaction.get(supplierRef);

        const purchaseDate = purchase.purchaseDate || new Date().toISOString().split('T')[0];
        const purchaseYear = new Date(purchaseDate).getFullYear() || 2026;
        const { postingNumber: jvPostingNumber, nextVal: jvNextVal } = await getNextPostingNumber(transaction, 'JV', purchaseYear);

        // -- 2. Perform WRITES --
        if (productSnap.exists()) {
          const productData = productSnap.data() as Product;
          transaction.update(productRef, {
            currentStock: Math.max(0, (productData.currentStock ?? 0) - purchase.quantity)
          });
        }

        if (supplierSnap && supplierSnap.exists()) {
          const supplierData = supplierSnap.data() as Supplier;
          const updatedTotal = Math.max(0, (supplierData.totalPurchase ?? 0) - purchase.totalAmount);
          const updatedCount = Math.max(0, (supplierData.purchaseCount ?? 0) - 1);
          const updatedDue = purchase.paymentType === 'Credit' 
            ? Math.max(0, (supplierData.dueBalance ?? 0) - purchase.totalAmount) 
            : (supplierData.dueBalance ?? 0);
          transaction.update(supplierRef, {
            totalPurchase: updatedTotal,
            purchaseCount: updatedCount,
            dueBalance: updatedDue
          });
        }

        const purchaseRef = doc(db, 'purchases', purchase.id);
        transaction.update(purchaseRef, { status: 'VOID' });

        // --- CASH LEDGER REVERSAL ---
        // Original cash ledger entry remains immutable. Create a separate reversing cash entry.
        if (purchase.paymentType === 'Cash') {
          const revCashId = `cl-rev-${purchase.id}`;
          const revCashRef = doc(db, 'cashLedger', revCashId);
          transaction.set(revCashRef, {
            id: revCashId,
            type: 'inflow',
            source: 'procurement',
            amount: purchase.totalAmount,
            referenceId: purchase.id,
            description: `Cash Reversal for Voided Purchase #${purchase.invoiceNumber || purchase.id}`,
            timestamp: new Date().toISOString(),
            status: 'active',
            isReversal: true,
            reversesCashEntryId: `cl-${purchase.id}`,
            postingStatus: 'POSTED'
          });
        }

        // --- REVERSAL LEDGER POSTING ---
        const invAcc = resolveSystemAccount('INVENTORY', coa);
        const vatAcc = resolveSystemAccount('INPUT_VAT', coa);
        const contraAcc = purchase.paymentType === 'Cash' 
          ? resolveSystemAccount('CASH', coa) 
          : resolveSystemAccount('ACCOUNTS_PAYABLE', coa);

        const oldSubtotal = purchase.subtotal ?? (purchase.totalAmount - (purchase.vatAmount ?? 0));
        const oldVat = purchase.vatAmount ?? 0;

        const revLines = [
          // Debit: Cash (1100) or Accounts Payable (2100) is debited to reverse credit
          {
            accountId: contraAcc.id,
            accountCode: contraAcc.code,
            accountName: contraAcc.name,
            debit: purchase.totalAmount,
            credit: 0,
            baseCurrencyDebit: purchase.totalAmount,
            baseCurrencyCredit: 0
          },
          // Credit: Inventory Asset (1300) = oldSubtotal
          {
            accountId: invAcc.id,
            accountCode: invAcc.code,
            accountName: invAcc.name,
            debit: 0,
            credit: oldSubtotal,
            baseCurrencyDebit: 0,
            baseCurrencyCredit: oldSubtotal
          },
          // Credit: Input VAT Receivable (1400) = oldVat (if > 0)
          ...(oldVat > 0 ? [{
            accountId: vatAcc.id,
            accountCode: vatAcc.code,
            accountName: vatAcc.name,
            debit: 0,
            credit: oldVat,
            baseCurrencyDebit: 0,
            baseCurrencyCredit: oldVat
          }] : [])
        ];

        const periodMonth = String(new Date(purchaseDate).getMonth() + 1).padStart(2, '0');
        const accountingPeriod = `${purchaseYear}-${periodMonth}`;
        const revEntryId = `le-purchase-void-${purchase.id}`;
        const origEntryId = `le-purchase-${purchase.id}`;

        // Update metadata on original entry without modifying debit/credit lines
        const origLedgerRef = doc(db, 'ledgerEntries', origEntryId);
        transaction.set(origLedgerRef, {
          isVoided: true,
          voidedAt: new Date().toISOString(),
          voidedBy: auth.currentUser?.email || 'admin_01@nexus.erp',
          voidReason: 'Procurement transaction voided',
          reversalEntryId: revEntryId
        }, { merge: true });

        const reversalLedgerEntry = {
          id: revEntryId,
          postingNumber: jvPostingNumber,
          companyId: 'comp-default',
          branchId: 'branch-main',
          fiscalYear: purchaseYear,
          accountingPeriod,
          sourceModule: 'PROCUREMENT' as const,
          postingStatus: 'POSTED' as const,
          currency: 'USD',
          exchangeRate: 1,
          baseCurrencyCode: 'USD',
          version: 1,
          narration: `Reversal of Procurement Entry due to Void - Original: ${purchase.id}`,
          createdFrom: purchase.id,
          approvalStatus: 'APPROVED' as const,
          postingDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
          lines: revLines,
          originalEntryId: origEntryId,
          isReversal: true,
          reversesEntryId: origEntryId,
          supplierId: purchase.supplierId,
          supplierName: purchase.supplierName
        };

        // Mandatory Enterprise Journal Integrity Validation (Phase X)
        validateJournalBalance(revLines);

        const revLedgerRef = doc(db, 'ledgerEntries', revEntryId);
        transaction.set(revLedgerRef, reversalLedgerEntry);

        // Commit sequence counters
        commitNextPostingNumber(transaction, 'JV', jvNextVal);
      });

      // Log financial Audit
      await logFinancialAudit({
        action: 'VOID_PROCUREMENT',
        entityType: 'purchase',
        entityId: purchase.id,
        referenceId: purchase.paymentType === 'Cash' ? `cl-${purchase.id}` : null,
        customerId: null,
        supplierId: purchase.supplierId,
        productId: purchase.productId,
        amount: purchase.totalAmount,
        paymentType: purchase.paymentType,
        previousState: purchase,
        newState: { ...purchase, status: 'VOID' },
        notes: `Voided procurement ID: ${purchase.id}`,
        userRole: userRole
      });

      // Log system/void activity
      await logSystemActivity(
        "Procurement Voided",
        `Permanently marked purchase record ID: ${purchase.id} as VOID. Restored associated stock levels and supplier liabilities.`
      );

      setFeedback({
        message: `Procurement log for "${purchase.productName}" has been successfully VOIDED. Stocks and supplier due credits are reversed securely.`,
        type: 'success'
      });
    } catch (err: any) {
      console.error("Void operations abort:", err);
      let errMsg = err.message || 'Failed to void the transaction record.';
      if (err.message && err.message.includes("Accounting validation failed")) {
        setFeedback({ message: err.message, type: 'error' });
      } else {
        try {
          handleFirestoreError(err, OperationType.UPDATE, `purchases/${purchase.id}`);
        } catch (dbErr: any) {
          errMsg = dbErr.message;
        }
        setFeedback({ message: `Access Abort: ${errMsg}`, type: 'error' });
      }
    }
  };

  // --- Calculate Procurement Intelligence parameters ---
  const activePurchases = purchases.filter(p => !isVoidStatus(p.status));
  const totalPurchasesVolume = activePurchases.reduce((sum, p) => sum + p.totalAmount, 0);
  const totalUnitsProcured = activePurchases.reduce((sum, p) => sum + p.quantity, 0);
  const totalCreditDueOutstanding = suppliers.filter(s => !isInactiveStatus(s.status)).reduce((sum, s) => sum + (s.dueBalance ?? 0), 0);

  // --- Listing Filters ---
  const filteredPurchases = purchases.filter((item) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      (item.supplierName || '').toLowerCase().includes(query) ||
      (item.productName || '').toLowerCase().includes(query) ||
      (item.paymentType || '').toLowerCase().includes(query) ||
      (item.id || '').toLowerCase().includes(query);

    const matchesType = paymentFilter === 'All' || item.paymentType === paymentFilter;
    return matchesSearch && matchesType;
  });

  const selectedProductDetails = products.find(p => p.id === formData.productId);

  return (
    <div id="procurement-management-system" className="space-y-8 animate-fade-in font-sans pb-12">
      
      {/* POPUP ALERT BANNER */}
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
            <button 
              type="button"
              className="ml-2 font-black opacity-60 hover:opacity-100 cursor-pointer text-slate-500"
              onClick={() => setFeedback(null)}
            >
              &times;
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* METRIC BENTO CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-3">
        {/* Total Cost Outlaid */}
        <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between w-full min-w-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Gross Procurement Budget</span>
              <DollarSign className="h-4 w-4 text-indigo-600 shrink-0" />
            </div>
            {loading ? (
              <div className="h-8 w-28 bg-slate-100 rounded-lg animate-pulse"></div>
            ) : (
              <ResponsiveKPIValue value={formatCurrency(totalPurchasesVolume)} className="text-slate-900" />
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="font-medium truncate">Direct expense outlays</span>
            {loading ? (
              <div className="h-4 w-12 bg-slate-100 rounded animate-pulse"></div>
            ) : (
              <span className="text-indigo-600 font-bold shrink-0">{purchases.length} orders</span>
            )}
          </div>
        </div>

        {/* Total Received stock */}
        <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between w-full min-w-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Total Units Procured</span>
              <Box className="h-4 w-4 text-emerald-500 shrink-0" />
            </div>
            {loading ? (
              <div className="h-8 w-20 bg-slate-100 rounded-lg animate-pulse"></div>
            ) : (
              <ResponsiveKPIValue value={`${totalUnitsProcured.toLocaleString()} Units`} className="text-slate-900" />
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="truncate">Seeded warehouse inputs</span>
            {loading ? (
              <div className="h-4 w-16 bg-slate-100 rounded animate-pulse"></div>
            ) : (
              <span className="text-emerald-600 font-semibold font-mono shrink-0">+{totalUnitsProcured > 0 ? Math.round((filteredPurchases.reduce((sum, p) => sum + p.quantity, 0) / totalUnitsProcured) * 100) : 0}% view</span>
            )}
          </div>
        </div>

        {/* Total Credit Accounts Due */}
        <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between w-full min-w-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Outstanding Account Payables</span>
              <Truck className="h-4 w-4 text-amber-500 shrink-0" />
            </div>
            {loading ? (
              <div className="h-8 w-24 bg-slate-100 rounded-lg animate-pulse"></div>
            ) : (
              <ResponsiveKPIValue value={formatCurrency(totalCreditDueOutstanding)} className="text-slate-900" />
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="truncate">Supplier ledger debits</span>
            {loading ? (
              <div className="h-4 w-16 bg-slate-100 rounded animate-pulse"></div>
            ) : (
              <span className="text-amber-500 font-extrabold font-mono">
                {suppliers.filter(s => (s.dueBalance ?? 0) > 0).length} Outstanding Bills
              </span>
            )}
          </div>
        </div>
      </div>

      {/* FILTER CONTROL RAILS */}
      <div className="bg-white border border-slate-200 rounded-[2rem] p-4 shadow-3xs flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 sm:gap-4 min-w-0 w-full">
        {/* Search */}
        <div className="relative w-full xl:flex-1 xl:min-w-[280px] shrink-0 xl:shrink min-w-0">
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
          <input 
            type="text"
            placeholder="Search by supplier, item description, payments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs font-semibold border border-slate-200 rounded-2xl py-3.5 pl-11 pr-4 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-550 focus:ring-1 focus:ring-indigo-500 transition duration-150 h-11"
          />
        </div>

        {/* Tab filters and Action Button stacked on mobile, row on tablet/desktop */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between sm:justify-end gap-3 w-full xl:w-auto font-sans shrink-0 min-w-0">
          
          <div className="w-full sm:w-auto flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/60 shrink-0 h-11">
            {(['All', 'Cash', 'Credit'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setPaymentFilter(filter)}
                className={`flex-1 sm:flex-initial text-center px-4 py-2 text-xs sm:text-[10px] sm:px-3 sm:py-1.5 font-extrabold rounded-lg uppercase tracking-widest transition cursor-pointer whitespace-nowrap min-h-[36px] flex items-center justify-center shrink-0 ${
                  paymentFilter === filter 
                    ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200/40' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {permissions.createProcurement && (
            <button
              type="button"
              onClick={() => openForm()}
              className="w-full sm:w-auto h-11 min-h-[44px] inline-flex items-center justify-center gap-1.5 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2.5 text-xs font-bold transition shadow-xs hover:shadow-sm shrink-0 whitespace-nowrap min-w-[200px] sm:min-w-[210px]"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Enter Purchase Order</span>
            </button>
          )}
        </div>
      </div>

      {/* PURCHASE HISTORY TABLE */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-3xs overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Procurement Registry Logs</h3>
            <p className="text-[10px] text-slate-400 uppercase mt-0.5 font-semibold font-mono tracking-wider">Purchase History & Ledger reconciliations</p>
          </div>
          <span className="text-[11px] py-1 px-3 bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold rounded-full font-mono uppercase">
            Showing {filteredPurchases.length} Items
          </span>
        </div>

        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
          {loading ? (
            <div className="space-y-4 p-5 animate-pulse">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                  <div className="space-y-2 flex-grow">
                    <div className="h-4 bg-slate-100 rounded-md w-1/3"></div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                      <div className="h-3.5 bg-[#f1f5f9] rounded-md w-1/2"></div>
                      <div className="h-3.5 bg-[#f1f5f9] rounded-md w-2/3"></div>
                      <div className="h-3.5 bg-[#f1f5f9] rounded-md w-1/2"></div>
                      <div className="h-3.5 bg-[#f1f5f9] rounded-md w-1/3"></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto opacity-40">
                    <div className="h-5 bg-slate-100 rounded-md w-20"></div>
                    <div className="w-8 h-8 bg-slate-50 rounded-lg"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPurchases.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 12 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.3 }}
              className="mx-auto max-w-md w-full my-8 text-center flex flex-col items-center gap-4.5"
            >
              <div className="relative group">
                <div className="absolute inset-0 bg-indigo-200/20 rounded-full blur-xl group-hover:scale-125 transition duration-300"></div>
                <div className="relative w-16 h-16 bg-white border border-slate-100 rounded-2xl shadow-3xs flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-all duration-300">
                  <Box className="h-8 w-8 text-slate-400 transition-transform duration-300 group-hover:scale-110" />
                </div>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest leading-none">
                  {purchases.length === 0 ? 'No Procurement Logs' : 'No Procurements Found'}
                </h4>
                <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed font-semibold">
                  {purchases.length === 0 
                    ? 'Log company product purchases from designated suppliers to automatically restock inventories and maintain trade accounts.'
                    : searchQuery || paymentFilter !== 'All'
                      ? "No records matched your actively specified searching terms or settlement choices."
                      : 'No procurement transactions detected. Empty your filters or record a new buy.'}
                </p>
              </div>
              <div className="flex gap-2.5 pt-1.5 flex-wrap justify-center">
                {purchases.length > 0 && (searchQuery || paymentFilter !== 'All') ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setPaymentFilter('All');
                    }}
                    className="bg-white border border-slate-200 hover:border-slate-350 text-slate-700 font-extrabold text-[11px] uppercase tracking-wider px-5 py-2.5 rounded-xl transition cursor-pointer shadow-3xs"
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
                    <span>Record New Procurement</span>
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse table-auto">
                <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                  <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <th className="py-3 px-3 sm:py-4 sm:px-8 min-w-[100px] md:min-w-[120px] whitespace-nowrap">Date</th>
                    <th className="py-3 px-4 sm:py-4 sm:px-5 min-w-[110px] md:min-w-[150px] whitespace-nowrap">Procurement Reference</th>
                    <th className="py-3 px-4 sm:py-4 sm:px-5 min-w-[130px] md:min-w-[165px] whitespace-nowrap">Supplier Channel</th>
                    <th className="py-3 px-4 sm:py-4 sm:px-5 min-w-[140px] md:min-w-[190px] whitespace-nowrap">Product Unit</th>
                    <th className="py-3 px-4 sm:py-4 sm:px-5 text-center min-w-[80px] md:min-w-[100px] whitespace-nowrap">Unit Cost</th>
                    <th className="py-3 px-4 sm:py-4 sm:px-5 text-center min-w-[70px] md:min-w-[120px] whitespace-nowrap">Purchased Qty</th>
                    <th className="py-3 px-4 sm:py-4 sm:px-5 text-right min-w-[110px] md:min-w-[130px] whitespace-nowrap">Debit Total</th>
                    <th className="py-3 px-3 sm:py-4 sm:px-8 text-center min-w-[70px] md:min-w-[100px] shrink-0 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredPurchases.map((purchase) => (
                    <tr 
                      key={purchase.id} 
                      className={`hover:bg-indigo-50/20 even:bg-slate-50/30 transition duration-150 group ${
                        isVoidStatus(purchase.status) 
                          ? 'opacity-40 bg-slate-50/50 line-through text-slate-400' 
                          : ''
                      }`}
                    >
                       <td className="py-3 px-3 sm:py-4 sm:px-8 font-mono text-slate-500 font-bold whitespace-nowrap">
                        {new Date(purchase.purchaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-3 px-4 sm:py-4 sm:px-5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-indigo-600 font-bold uppercase">
                          <span>{purchase.id.substring(0, 15)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 sm:py-4 sm:px-5 font-bold text-slate-900 whitespace-nowrap">
                        {purchase.supplierName}
                      </td>
                      <td className="py-3 px-4 sm:py-4 sm:px-5 whitespace-nowrap">
                        <div className="font-bold text-slate-800 flex items-center gap-2">
                          <span>{purchase.productName}</span>
                          <UnitBadge unitCode={purchase.unitCode} unitName={purchase.unitName} size="sm" />
                        </div>
                        <div className="font-mono text-[9px] text-slate-450 uppercase mt-0.5">Product ID: {purchase.productId.substring(0, 8)}</div>
                      </td>
                      <td className="py-3 px-4 sm:py-4 sm:px-5 text-center font-bold text-slate-800 font-mono whitespace-nowrap">
                        {formatUnitPrice(purchase.purchasePrice, purchase.unitCode)}
                      </td>
                      <td className="py-3 px-4 sm:py-4 sm:px-5 text-center font-bold text-slate-900 font-mono whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 bg-slate-100/80 px-2.5 py-1 rounded-lg text-slate-800 border border-slate-200/60">
                          {formatQuantity(purchase.quantity, purchase.unitCode)}
                        </span>
                      </td>
                      <td className="py-3 px-4 sm:py-4 sm:px-5 text-right whitespace-nowrap">
                        <span className="text-slate-900 font-black font-mono font-sans block text-sm">{formatCurrency(purchase.totalAmount)}</span>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border uppercase tracking-wider mt-1.5 ${
                          purchase.paymentType === 'Cash' 
                            ? 'bg-emerald-50 border-emerald-250/60 text-emerald-700 shadow-3xs' 
                            : 'bg-blue-50 border-blue-200 text-blue-700 shadow-3xs'
                        }`}>
                          {purchase.paymentType === 'Cash' ? 'Paid / Cash' : 'Credit / Terms'}
                        </span>
                      </td>
                      <td className="py-3 px-3 sm:py-4 sm:px-8 text-center whitespace-nowrap">
                        {isVoidStatus(purchase.status) ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 shadow-3xs animate-fade-in">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                            Void
                          </span>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedPurchaseForInvoice(purchase)}
                              title="View and Print Purchase Invoice"
                              className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-xl transition cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openBarcodePrintForPurchase(purchase)}
                              title="Print Barcode Labels for this purchase"
                              className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-xl transition cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {permissions.voidProcurement && (
                              <button
                                type="button"
                                onClick={() => voidTransaction(purchase.id)}
                                title="Void procurement log and reverse parameters"
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* COMPACT ENTRY MODAL DIALOG */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Modal Overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFormOpen(false)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm"
            />

            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative w-full max-w-xl rounded-[2.5rem] bg-white border border-slate-200/80 p-8 shadow-2xl space-y-6 overflow-hidden"
              >
                {/* Header title */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-950 uppercase tracking-widest">
                      {editingPurchase ? 'Modify Procurement Entry' : 'Log New Procurement Order'}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-bold font-mono uppercase tracking-wider">
                      {editingPurchase ? `ID: ${editingPurchase.id}` : 'Syncs stock levels & supplier credit balances'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Form fields */}
                <form onSubmit={handleSavePurchase} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Supplier Field */}
                    <div className="relative w-full">
                      <select
                        id="form-procurement-supplier-field"
                        disabled={isSaving}
                        value={formData.supplierId}
                        onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                        className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 bg-white appearance-none cursor-pointer disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                          errors.supplierId 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455 focus:ring-rose-450' 
                            : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                        }`}
                      >
                        <option value="">-- Choose Supplier --</option>
                        {suppliers.filter(s => !isInactiveStatus(s.status)).map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.category || 'Trading Channel'})
                          </option>
                        ))}
                      </select>
                      <label htmlFor="form-procurement-supplier-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                        Target Supplier <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                      {errors.supplierId && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                          <span>{errors.supplierId}</span>
                        </div>
                      )}
                    </div>

                    {/* Product Selection */}
                    <div className="relative w-full">
                      <select
                        id="form-procurement-product-field"
                        disabled={isSaving}
                        value={formData.productId}
                        onChange={(e) => handleProductSelect(e.target.value)}
                        className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 bg-white appearance-none cursor-pointer disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                          errors.productId 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455 focus:ring-rose-450' 
                            : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                        }`}
                      >
                        <option value="">-- Choose Product --</option>
                        {products.filter(p => !isInactiveStatus(p.status)).map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Stock: {p.currentStock})
                          </option>
                        ))}
                      </select>
                      <label htmlFor="form-procurement-product-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                        Inventory Product <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                      {errors.productId && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                          <span>{errors.productId}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    {/* Unit Purchase Price */}
                    <div className="relative w-full sm:col-span-1">
                      <span className="absolute left-3.5 top-[18px] text-slate-400 text-xs font-bold leading-none">$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        id="form-procurement-price-field"
                        disabled={isSaving}
                        value={formData.purchasePrice}
                        onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                        placeholder=" "
                        className={`peer w-full rounded-xl border pl-7 pr-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                          errors.purchasePrice 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455 focus:ring-rose-450' 
                            : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                        }`}
                      />
                      <label htmlFor="form-procurement-price-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-placeholder-shown:left-7 peer-focus:top-1.5 peer-focus:left-3.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                        Unit Cost ($) <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                      {errors.purchasePrice && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                          <span>{errors.purchasePrice}</span>
                        </div>
                      )}
                    </div>

                    {/* Quantity Procured */}
                    <div className="relative w-full sm:col-span-1">
                      <input
                        type="number"
                        min="1"
                        required
                        id="form-procurement-qty-field"
                        disabled={isSaving}
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        placeholder=" "
                        className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                          errors.quantity 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455 focus:ring-rose-450' 
                            : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                        }`}
                      />
                      <label htmlFor="form-procurement-qty-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                        Quantity Purchased <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                      {errors.quantity && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                          <span>{errors.quantity}</span>
                        </div>
                      )}
                    </div>

                    {/* Purchase Unit Selection */}
                    <div className="relative w-full sm:col-span-1">
                      <select
                        id="form-procurement-unit-field"
                        disabled={isSaving || !formData.productId}
                        value={formData.unitCode}
                        onChange={(e) => {
                          setFormData({ ...formData, unitCode: e.target.value });
                          setErrors(prev => {
                            const copy = { ...prev };
                            delete copy.unitCode;
                            return copy;
                          });
                        }}
                        className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] appearance-none bg-white ${
                          errors.unitCode 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                            : 'border-slate-200 focus:border-indigo-605'
                        }`}
                      >
                        {(() => {
                          const prod = products.find(p => p && p.id === formData.productId);
                          const baseCode = prod?.unitCode || 'PCS';
                          const prodConversions = conversions.filter(c => c && c.productId === formData.productId && (c.status === 'active' || c.isActive));
                          const altCodes = prodConversions.map(c => {
                            const raw = c.alternateUnitCode || '';
                            return typeof raw === 'string' ? raw : String(raw || '');
                          });
                          const allSystemUnits = units.map(u => {
                            const raw = u?.code || '';
                            return typeof raw === 'string' ? raw : String(raw || '');
                          });
                          const uniqueUnits = Array.from(new Set([baseCode, ...altCodes, ...allSystemUnits].filter(Boolean)));
                          return uniqueUnits.map(code => (
                            <option key={code} value={code}>
                              {code} {code === baseCode ? '(Base Unit)' : altCodes.includes(code) ? '(Alternate Unit)' : ''}
                            </option>
                          ));
                        })()}
                      </select>
                      <label htmlFor="form-procurement-unit-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-600">
                        Purchase Unit <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                      {errors.unitCode && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                          <span>{errors.unitCode}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Multi-Unit Conversion Impact Banner */}
                  {(() => {
                    if (!formData.productId) return null;
                    const prod = products.find(p => p && p.id === formData.productId);
                    if (!prod) return null;

                    const rawSelUnit = formData.unitCode || prod.unitCode || '';
                    const selUnit = typeof rawSelUnit === 'string' ? rawSelUnit : String(rawSelUnit || '');
                    const rawProdUnit = prod.unitCode || '';
                    const prodUnit = typeof rawProdUnit === 'string' ? rawProdUnit : String(rawProdUnit || '');

                    const isAlt = selUnit.trim().toUpperCase() !== prodUnit.trim().toUpperCase();
                    if (!isAlt) return null;

                    const rule = conversions.find(c => {
                      if (!c || c.productId !== prod.id) return false;
                      const rawAlt = c.alternateUnitCode || '';
                      const altCode = typeof rawAlt === 'string' ? rawAlt : String(rawAlt || '');
                      return altCode.trim().toUpperCase() === selUnit.trim().toUpperCase() && (c.status === 'active' || c.isActive);
                    });

                    const qty = parseInt(formData.quantity) || 1;

                    if (!rule) {
                      return (
                        <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                          <span>No conversion defined for this unit.</span>
                        </div>
                      );
                    }

                    const baseVal = convertToBase(qty, rule.conversionFactor, rule.direction);
                    return (
                      <div className="mt-3 bg-indigo-50/80 border border-indigo-200/80 text-indigo-900 p-3 rounded-xl text-xs font-bold flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Box className="h-4 w-4 text-indigo-600 shrink-0" />
                          <span>
                            Conversion Impact: <strong className="text-indigo-700">{qty} {selUnit}</strong> = <strong className="text-indigo-700">{baseVal} {prod.unitCode}</strong>
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-indigo-600 bg-indigo-100/80 px-2 py-0.5 rounded-md">
                          ({formatConversionText(rule)})
                        </span>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Payment Account Type */}
                    <div className="relative w-full">
                      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 h-[52.2px] items-center">
                        {(['Cash', 'Credit'] as const).map((method) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, paymentType: method });
                              setErrors(prev => {
                                const copy = { ...prev };
                                delete copy.paymentType;
                                return copy;
                              });
                            }}
                            className={`flex-1 text-center py-2 text-xs font-extrabold rounded-lg uppercase tracking-wider transition cursor-pointer ${
                              formData.paymentType === method 
                                ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200/40' 
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {method}
                          </button>
                        ))}
                      </div>
                      <span className="absolute -top-2.5 left-3 px-1.5 bg-white text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                        Supplier Terms <span className="text-rose-500 font-extrabold">*</span>
                      </span>
                      {errors.paymentType && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                          <span>{errors.paymentType}</span>
                        </div>
                      )}
                    </div>

                    {/* Purchase date */}
                    <div className="relative w-full">
                      <input 
                        type="date"
                        required
                        id="form-procurement-date-field"
                        disabled={isSaving}
                        value={formData.purchaseDate}
                        onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                        className="peer w-full rounded-xl border border-slate-200 bg-white px-3.5 pt-5 pb-1.5 text-xs font-semibold text-slate-850 focus:border-indigo-605 focus:ring-1 focus:ring-indigo-605 focus:outline-none transition duration-150 cursor-pointer h-[52px]"
                      />
                      <label htmlFor="form-procurement-date-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                        Date Settled <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                    </div>
                  </div>

                  {/* dynamic total preview */}
                  {formData.productId && formData.supplierId && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2 mt-4 shadow-3xs"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-bold uppercase tracking-wider">Item details:</span>
                        <span className="font-extrabold text-slate-700">
                          {selectedProductDetails?.name || 'Item'} (x{parseInt(formData.quantity) || 1})
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-bold uppercase tracking-wider">Subtotal (Excl. VAT):</span>
                        <span className="font-extrabold text-slate-700 font-mono">
                          {formatCurrency((parseInt(formData.quantity) || 1) * (parseFloat(formData.purchasePrice) || 0))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-bold uppercase tracking-wider">Input VAT ({companyProfile.taxRatePercent ?? 15}%):</span>
                        <span className="font-extrabold text-indigo-600 font-mono">
                          +{formatCurrency(((parseInt(formData.quantity) || 1) * (parseFloat(formData.purchasePrice) || 0) * (companyProfile.taxRatePercent ?? 15)) / 100)}
                        </span>
                      </div>
                      <div className="border-t border-slate-200/60 my-2 pt-2 flex justify-between items-center">
                        <span className="text-xs font-black text-slate-900 uppercase tracking-wider">Gross Debit Sum (Incl. VAT):</span>
                        <span className="text-sm font-black text-indigo-600 font-mono">
                          {formatCurrency(((parseInt(formData.quantity) || 1) * (parseFloat(formData.purchasePrice) || 0)) * (1 + (companyProfile.taxRatePercent ?? 15) / 100))}
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {/* DIAGNOSTIC RUNTIME TRACE PANEL */}
                  {diagnosticTrace && (
                    <div id="diagnostic-trace-panel" className="bg-slate-950 text-slate-100 rounded-2xl p-5 font-mono text-[11px] space-y-4 border border-slate-800 shadow-xl animate-fade-in">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <span className="font-extrabold uppercase tracking-widest text-[10px] text-rose-500 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                          Runtime Write Transaction Failure Trace
                        </span>
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                          ABAC Gatekeeper Audit
                        </span>
                      </div>
                      
                      <div className="space-y-3.5 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                        {diagnosticTrace.map((op, idx) => (
                          <div key={idx} className="border-b border-slate-900 pb-3 last:border-b-0 last:pb-0">
                            <div className="flex items-center justify-between font-bold mb-1.5">
                              <span className="text-slate-300 font-black">{op.step}</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-black ${
                                op.status === 'PASS' 
                                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900' 
                                  : op.status === 'FAIL' 
                                    ? 'bg-rose-950/80 text-rose-400 border border-rose-900' 
                                    : 'bg-amber-950/80 text-amber-400 border border-amber-900'
                              }`}>
                                {op.status}
                              </span>
                            </div>
                            
                            <div className="space-y-1 text-[11px] text-slate-400 leading-relaxed">
                              <div>
                                <span className="text-slate-500 font-bold">Path:</span> <span className="text-indigo-400 font-semibold">{op.path}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 font-bold">Operation:</span> <span className="text-sky-400 font-semibold">{op.op}</span>
                              </div>
                              <div className="bg-slate-905/80 rounded p-1.5 mt-1 overflow-x-auto text-[10px] border border-slate-900 font-mono text-slate-300">
                                <span className="text-slate-500 font-bold block mb-0.5">Payload:</span>
                                <code>{op.payload}</code>
                              </div>
                              {op.status === 'FAIL' && (
                                <>
                                  <div className="mt-2 text-rose-400 font-semibold">
                                    <span className="text-rose-500 font-black block mb-0.5">Rule Checked Expression:</span>
                                    <span className="font-mono bg-rose-950/30 px-1 py-0.5 rounded border border-rose-900/40 text-[10px] break-all block">{op.expression}</span>
                                  </div>
                                  <div className="mt-2 text-slate-400 font-bold">
                                    <span className="text-slate-500 block mb-0.5">Root Cause Reason:</span>
                                    <span className="font-normal text-rose-300 block bg-slate-900/50 p-1 rounded border border-slate-800">{op.reason}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Submission and Cancel controls */}
                  <div className="flex items-center justify-end gap-3 pt-5 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => setIsFormOpen(false)}
                      className="cursor-pointer border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 py-2.5 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-60"
                    >
                      {isSaving && <RefreshCw className="w-3 h-3 animate-spin" />}
                      <span>{editingPurchase ? 'Update Order' : 'Commit Order'}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {voidConfirmationPurchase && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xl animate-in duration-200 fade-in zoom-in-95"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-sans text-sm font-bold tracking-tight text-slate-850">
                    Confirm Void Procurement Log
                  </h3>
                  <p className="text-xs text-slate-550 leading-relaxed">
                    Are you sure you want to VOID this procurement log? This will permanently mark it as VOID, rollback stock, reverse liabilities, and flag the ledger record. This action is irreversible.
                  </p>
                  <div className="text-[10px] font-mono text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                    <div><span className="font-bold">Purchase ID:</span> {voidConfirmationPurchase.id}</div>
                    <div><span className="font-bold">Product Name:</span> {voidConfirmationPurchase.productName} (x{voidConfirmationPurchase.quantity})</div>
                    <div><span className="font-bold">Log Date:</span> {new Date(voidConfirmationPurchase.purchaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                    <div><span className="font-bold">Grand Total:</span> {formatCurrency(voidConfirmationPurchase.totalAmount)}</div>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setVoidConfirmationPurchase(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const purchaseToVoid = voidConfirmationPurchase;
                    setVoidConfirmationPurchase(null);
                    await handleVoidPurchase(purchaseToVoid);
                  }}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition cursor-pointer shadow-xs"
                >
                  Yes, Void Procurement
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Purchase Saved Successfully Modal (Sprint 11.0A Enterprise Standard) */}
      <AnimatePresence>
        {showPrintOfferModal && pendingBarcodePurchase && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="space-y-1.5 flex-1">
                  <h3 className="font-sans text-lg font-extrabold tracking-tight text-slate-900">
                    Purchase Saved Successfully
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">
                    PO #{pendingBarcodePurchase.invoiceNumber || pendingBarcodePurchase.id.substring(0, 12)} • Product: {pendingBarcodePurchase.productName} ({pendingBarcodePurchase.quantity} units)
                  </p>
                  <p className="text-sm font-medium text-slate-700 pt-2 border-t border-slate-100 mt-2">
                    What would you like to print?
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowPrintOfferModal(false);
                    setPendingBarcodePurchase(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = pendingBarcodePurchase;
                    setShowPrintOfferModal(false);
                    setSelectedPurchaseForInvoice(p);
                  }}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition cursor-pointer shadow-xs flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>🖨 Print Purchase Invoice</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = pendingBarcodePurchase;
                    setShowPrintOfferModal(false);
                    openBarcodePrintForPurchase(p);
                  }}
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition cursor-pointer shadow-xs flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>🏷 Print Barcode Labels</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Render Purchase Detail Modal (Invoice View / Print) */}
      {selectedPurchaseForInvoice && (
        <PurchaseDetailModal
          purchase={selectedPurchaseForInvoice}
          suppliers={suppliers}
          products={products}
          companyProfile={companyProfile}
          onClose={() => setSelectedPurchaseForInvoice(null)}
        />
      )}

      {/* Main Barcode Print Dialog Modal */}
      <AnimatePresence>
        {showBarcodePrintDialog && pendingBarcodePurchase && (
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
                    <h2 className="text-base font-extrabold text-slate-900">Purchase Barcode Print Dialog</h2>
                    <p className="text-xs text-slate-500">
                      PO #{pendingBarcodePurchase.id.substring(0, 15)} • Supplier: {pendingBarcodePurchase.supplierName}
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
                  <span className="text-xs font-bold text-slate-700">Products in Purchase Voucher</span>
                  <div className="flex gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPrintableItems(prev => prev.map(i => ({ ...i, selected: true })))}
                      className="text-indigo-600 hover:underline font-semibold cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => setPrintableItems(prev => prev.map(i => ({ ...i, selected: false })))}
                      className="text-slate-500 hover:underline font-semibold cursor-pointer"
                    >
                      Deselect All
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
                          <div className="text-xs font-extrabold text-slate-900">{item.productName} <span className="text-[10px] font-mono text-slate-400">(Read Only)</span></div>
                          <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500 mt-0.5">
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
                          <label className="block text-[9px] font-bold text-slate-500 uppercase">Quantity</label>
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

              {/* Batch Execution Live Progress Feedback */}
              {batchProgress && (
                <div className="mb-6 p-4 rounded-2xl bg-slate-900 text-white space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-indigo-400 flex items-center gap-1.5">
                      {isPrintingBatch && <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />}
                      {batchProgress.statusMessage}
                    </span>
                    <span className="font-mono">{batchProgress.current} / {batchProgress.total}</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full transition-all duration-200"
                      style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
                    />
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-mono pt-1 border-t border-slate-800">
                    <div>
                      <span className="text-slate-400 block uppercase">Requested</span>
                      <span className="text-slate-200 font-bold">{batchProgress.total}</span>
                    </div>
                    <div>
                      <span className="text-emerald-400 block uppercase">Completed</span>
                      <span className="text-emerald-400 font-bold">{batchProgress.completed}</span>
                    </div>
                    <div>
                      <span className="text-rose-400 block uppercase">Failed</span>
                      <span className="text-rose-400 font-bold">{batchProgress.failed}</span>
                    </div>
                    <div>
                      <span className="text-amber-400 block uppercase">Elapsed</span>
                      <span className="text-amber-300 font-bold">{((batchProgress.endTime || Date.now()) - batchProgress.startTime)}ms</span>
                    </div>
                  </div>

                  {isPrintingBatch && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => { cancelBatchRef.current = true; }}
                        className="text-[10px] bg-rose-600/80 hover:bg-rose-600 text-white font-bold px-3 py-1 rounded-lg transition cursor-pointer"
                      >
                        Cancel Remaining
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Footer Action Controls */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isPrintingBatch}
                  onClick={() => setShowBarcodePrintDialog(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={isPrintingBatch || printableItems.filter(i => i.selected).length === 0}
                  onClick={executeBatchPrintForPurchase}
                  className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-2"
                >
                  {isPrintingBatch ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  <span>Print Selected Labels ({printableItems.filter(i => i.selected).reduce((s, i) => s + i.quantityToPrint, 0)})</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
