import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Package, 
  Search, 
  Trash2, 
  Edit2, 
  Plus, 
  X, 
  Save, 
  AlertTriangle, 
  Calendar, 
  DollarSign, 
  TrendingUp,
  Tag,
  Hash,
  ShoppingBag,
  Bell,
  Scale,
  Sparkles,
  Layers,
  Archive,
  BookOpen,
  Lock,
  Eye,
  Info,
  Barcode,
  Zap,
  Globe,
  RefreshCw,
  Printer,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError, logSystemActivity } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, getDocs, runTransaction } from 'firebase/firestore';
import { Product, UnitMaster, UnitConversion, BarcodeType, BarcodeStatus, BarcodeSource, BarcodeExecutionResult, BarcodePrintExecutionResult, LedgerEntry, LedgerEntryLine } from '../types';
import { INITIAL_UNITS } from '../data/defaultUnits';
import { isInactiveStatus } from '../lib/utils';
import { ResponsiveKPIValue } from './MetricCard';
import { usePermission, UserRole } from '../hooks/usePermission';
import { formatCurrency } from '../utils/currencyFormatter';
import { UnitConversionService } from '../services/unitConversionService';
import { BarcodeService } from '../services/barcodeService';
import { BarcodeExecutionService } from '../services/barcode/execution/BarcodeExecutionService';
import { DesktopDetector } from '../services/barcode/transport/DesktopDetector';
import { TranslationService } from '../services/translation/TranslationService';
import { UnitBadge } from './ui/UnitBadge';
import { formatConversionText } from '../lib/unitConversion';
import { 
  getNextPostingNumber, 
  commitNextPostingNumber, 
  ensureSystemAccountsExist, 
  resolveSystemAccount, 
  validateJournalBalance 
} from '../lib/postingEngine';
import { INITIAL_CHART_OF_ACCOUNTS } from '../data';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: "prod-rice-001",
    name: "RICE",
    sku: "RE-1",
    category: "Grocery",
    brand: "GrainMaster",
    purchasePrice: 15.00,
    sellingPrice: 25.00,
    currentStock: 100,
    minimumStockAlert: 20,
    createdDate: "2026-06-01T08:00:00Z",
    barcode: "RE-1",
    barcodeType: "CODE128",
    unitCode: "KG",
    unitName: "KG"
  },
  {
    id: "prod-1",
    name: "AeroGrip Pro Athletic Shoes",
    sku: "AGP-ATH-001",
    category: "Footwear",
    purchasePrice: 45.00,
    sellingPrice: 110.00,
    currentStock: 18,
    minimumStockAlert: 10,
    createdDate: "2026-05-15T08:00:00Z"
  },
  {
    id: "prod-2",
    name: "UltraLight Rain Jacket",
    sku: "ULR-JKT-004",
    category: "Apparel",
    purchasePrice: 32.50,
    sellingPrice: 85.00,
    currentStock: 5,
    minimumStockAlert: 12,
    createdDate: "2026-05-16T09:12:00Z"
  },
  {
    id: "prod-3",
    name: "ChronoSync Smartwatch Steel",
    sku: "CSS-WCH-012",
    category: "Electronics",
    purchasePrice: 110.00,
    sellingPrice: 249.00,
    currentStock: 25,
    minimumStockAlert: 8,
    createdDate: "2026-05-20T14:30:00Z"
  },
  {
    id: "prod-4",
    name: "AeroFlow Carbon Fiber Helmet",
    sku: "AFC-HLM-088",
    category: "Safety Gear",
    purchasePrice: 65.00,
    sellingPrice: 145.00,
    currentStock: 3,
    minimumStockAlert: 5,
    createdDate: "2026-05-21T11:45:00Z"
  },
  {
    id: "prod-5",
    name: "Apex Grip Training Gloves",
    sku: "ATG-GLV-034",
    category: "Fitness",
    purchasePrice: 12.00,
    sellingPrice: 28.00,
    currentStock: 50,
    minimumStockAlert: 15,
    createdDate: "2026-05-24T16:05:00Z"
  }
];

export default function ProductManagement({ userRole = 'admin' }: { userRole?: UserRole }) {
  const { permissions } = usePermission({ role: userRole });

  // --- States ---
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<UnitMaster[]>([]);
  const [allConversions, setAllConversions] = useState<UnitConversion[]>([]);
  const [selectedProductDetails, setSelectedProductDetails] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [stockStatusFilter, setStockStatusFilter] = useState<'All' | 'Alert Only' | 'In Stock'>('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [translationNotice, setTranslationNotice] = useState<{ type: 'success' | 'warning'; message: string } | null>(null);
  
  // --- Sprint 11 & Sprint 10 Execution Engine States ---
  const [isExecutingBarcode, setIsExecutingBarcode] = useState(false);
  const [barcodeExecResult, setBarcodeExecResult] = useState<BarcodeExecutionResult | null>(null);

  const [isExecutingPrint, setIsExecutingPrint] = useState(false);
  const [printExecResult, setPrintExecResult] = useState<BarcodePrintExecutionResult | null>(null);

  const handleGenerateBarcodeForProduct = async (product: Product) => {
    setIsExecutingBarcode(true);
    const service = BarcodeExecutionService.getInstance();
    const result = await service.executeGenerateBarcode({
      productId: product.id,
      sku: product.sku,
      barcodeValue: product.barcode || product.sku,
      barcodeType: product.barcodeType || 'CODE128',
      quantity: 1,
    });

    setBarcodeExecResult(result);
    setIsExecutingBarcode(false);
  };

  const handlePrintBarcodeForProduct = async (product: Product) => {
    setIsExecutingPrint(true);
    const unitVal = product.unitCode || product.unitName || 'PCS';
    const service = BarcodeExecutionService.getInstance();
    const result = await service.executePrintBarcode({
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      barcodeValue: product.barcode || product.sku,
      barcodeType: product.barcodeType || 'CODE128',
      category: product.category,
      categoryName: product.category,
      brand: product.brand,
      brandName: product.brand,
      unit: unitVal,
      unitName: unitVal,
      warehouse: 'WH-MAIN',
      warehouseName: 'Main Warehouse',
      printerName: 'MZ Thermal Printer ZD421',
      labelTemplateId: 'STD_PRODUCT_38X25MM',
      copies: 1,
      labelWidthMm: 38,
      labelHeightMm: 25,
      rotation: 0,
      printDensity: 15,
      originSource: 'PRODUCT_MANAGEMENT',
      context: {
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode || product.sku,
          barcodeType: product.barcodeType || 'CODE128',
          category: product.category,
          brand: product.brand,
          unit: unitVal,
        },
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

    setPrintExecResult(result);
    setIsExecutingPrint(false);
  };

  // --- Multi Label Print States ---
  const [multiPrintQuantity, setMultiPrintQuantity] = useState<number>(5);
  const [multiPrintCopies, setMultiPrintCopies] = useState<number>(1);
  const [multiPrintTemplate, setMultiPrintTemplate] = useState<string>('STD_PRODUCT_38X25MM');
  const [multiPrintPrinter, setMultiPrintPrinter] = useState<string>('MZ Thermal Printer ZD421');
  const [isMultiPrinting, setIsMultiPrinting] = useState<boolean>(false);
  const [multiPrintProgress, setMultiPrintProgress] = useState<{
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

  const cancelMultiPrintRef = useRef<boolean>(false);

  const handleBatchPrintBarcodeForProduct = async (product: Product) => {
    if (!product) return;
    setIsMultiPrinting(true);
    cancelMultiPrintRef.current = false;

    const total = Math.max(1, multiPrintQuantity);
    const copies = Math.max(1, multiPrintCopies);
    const startTime = Date.now();

    setMultiPrintProgress({
      current: 0,
      total,
      statusMessage: 'Preparing labels...',
      completed: 0,
      failed: 0,
      skipped: 0,
      startTime,
    });

    let completed = 0;
    let failed = 0;
    let skipped = 0;
    let lastJobId = '';

    const service = BarcodeExecutionService.getInstance();

    for (let i = 1; i <= total; i++) {
      if (cancelMultiPrintRef.current) {
        skipped = total - i + 1;
        setMultiPrintProgress(prev => prev ? {
          ...prev,
          statusMessage: 'Printing Cancelled by User',
          skipped,
          endTime: Date.now(),
        } : null);
        break;
      }

      setMultiPrintProgress(prev => prev ? {
        ...prev,
        current: i,
        statusMessage: `Printing ${i} / ${total}`,
      } : null);

      try {
        const unitVal = product.unitCode || product.unitName || 'PCS';
        const result = await service.executePrintBarcode({
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          barcodeValue: product.barcode || product.sku,
          barcodeType: product.barcodeType || 'CODE128',
          category: product.category,
          categoryName: product.category,
          brand: product.brand,
          brandName: product.brand,
          unit: unitVal,
          unitName: unitVal,
          warehouse: 'WH-MAIN',
          warehouseName: 'Main Warehouse',
          printerName: multiPrintPrinter || 'MZ Thermal Printer ZD421',
          labelTemplateId: multiPrintTemplate || 'STD_PRODUCT_38X25MM',
          copies,
          labelWidthMm: 38,
          labelHeightMm: 25,
          rotation: 0,
          printDensity: 15,
          originSource: 'PRODUCT_BATCH_PRINT',
          context: {
            product: {
              id: product.id,
              name: product.name,
              sku: product.sku,
              barcode: product.barcode || product.sku,
              barcodeType: product.barcodeType || 'CODE128',
              category: product.category,
              brand: product.brand,
              unit: unitVal,
            },
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

      setMultiPrintProgress(prev => prev ? {
        ...prev,
        completed,
        failed,
        skipped,
        lastJobId,
      } : null);
    }

    const endTime = Date.now();
    setMultiPrintProgress(prev => prev ? {
      ...prev,
      statusMessage: cancelMultiPrintRef.current ? 'Batch Printing Cancelled' : 'Printing Complete',
      endTime,
    } : null);

    setIsMultiPrinting(false);
  };

  const handleCancelMultiPrint = () => {
    cancelMultiPrintRef.current = true;
  };
  
  // --- Carton Label Print States (Sprint 11.3) ---
  const [cartonQuantity, setCartonQuantity] = useState<number>(1);
  const [cartonNumber, setCartonNumber] = useState<string>('');
  const [totalCartons, setTotalCartons] = useState<string>('');
  const [cartonCopies, setCartonCopies] = useState<number>(1);
  const [cartonTemplate, setCartonTemplate] = useState<string>('STD_PRODUCT_38X25MM');
  const [cartonPrinter, setCartonPrinter] = useState<string>('MZ Thermal Printer ZD421');
  const [isPrintingCarton, setIsPrintingCarton] = useState<boolean>(false);
  const [cartonPrintResult, setCartonPrintResult] = useState<BarcodePrintExecutionResult | null>(null);

  const handlePrintCartonLabelForProduct = async (product: Product) => {
    if (!product) return;
    setIsPrintingCarton(true);
    setCartonPrintResult(null);

    const unitVal = product.unitCode || product.unitName || 'PCS';
    const service = BarcodeExecutionService.getInstance();
    const result = await service.executePrintBarcode({
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      barcodeValue: product.barcode || product.sku,
      barcodeType: product.barcodeType || 'CODE128',
      category: product.category,
      categoryName: product.category,
      brand: product.brand,
      brandName: product.brand,
      unit: unitVal,
      unitName: unitVal,
      warehouse: 'WH-MAIN',
      warehouseName: 'Main Warehouse',
      printerName: cartonPrinter || 'MZ Thermal Printer ZD421',
      labelTemplateId: cartonTemplate || 'STD_PRODUCT_38X25MM',
      copies: Math.max(1, cartonCopies),
      labelWidthMm: 38,
      labelHeightMm: 25,
      rotation: 0,
      printDensity: 15,
      labelType: 'CARTON_LABEL',
      cartonQuantity: cartonQuantity,
      cartonNumber: cartonNumber || undefined,
      totalCartons: totalCartons || undefined,
      originSource: 'PRODUCT_CARTON_LABEL',
      context: {
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode || product.sku,
          barcodeType: product.barcodeType || 'CODE128',
          category: product.category,
          brand: product.brand,
          unit: unitVal,
        },
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

    setCartonPrintResult(result);
    setIsPrintingCarton(false);
  };

  // --- Unit Conversion Label Print States (Sprint 11.4) ---
  const [unitConversionUnit, setUnitConversionUnit] = useState<string>('Box');
  const [unitConversionQty, setUnitConversionQty] = useState<number>(10);
  const [unitConversionCopies, setUnitConversionCopies] = useState<number>(1);
  const [unitConversionTemplate, setUnitConversionTemplate] = useState<string>('STD_PRODUCT_38X25MM');
  const [unitConversionPrinter, setUnitConversionPrinter] = useState<string>('MZ Thermal Printer ZD421');
  const [isPrintingUnitConversion, setIsPrintingUnitConversion] = useState<boolean>(false);
  const [unitConversionPrintResult, setUnitConversionPrintResult] = useState<BarcodePrintExecutionResult | null>(null);

  const handlePrintUnitConversionLabelForProduct = async (product: Product) => {
    if (!product) return;
    setIsPrintingUnitConversion(true);
    setUnitConversionPrintResult(null);

    const baseUnitCode = product.unitCode || product.unitName || 'PCS';

    const service = BarcodeExecutionService.getInstance();
    const result = await service.executePrintBarcode({
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      barcodeValue: product.barcode || product.sku,
      barcodeType: product.barcodeType || 'CODE128',
      category: product.category,
      categoryName: product.category,
      brand: product.brand,
      brandName: product.brand,
      unit: unitConversionUnit,
      unitName: unitConversionUnit,
      warehouse: 'WH-MAIN',
      warehouseName: 'Main Warehouse',
      printerName: unitConversionPrinter || 'MZ Thermal Printer ZD421',
      labelTemplateId: unitConversionTemplate || 'STD_PRODUCT_38X25MM',
      copies: Math.max(1, unitConversionCopies),
      labelWidthMm: 38,
      labelHeightMm: 25,
      rotation: 0,
      printDensity: 15,
      labelType: 'UNIT_CONVERSION_LABEL',
      conversionUnit: unitConversionUnit,
      conversionQuantity: unitConversionQty,
      baseUnit: baseUnitCode,
      originSource: 'PRODUCT_UNIT_CONVERSION',
      context: {
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode || product.sku,
          barcodeType: product.barcodeType || 'CODE128',
          category: product.category,
          brand: product.brand,
          unit: baseUnitCode,
        },
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

    setUnitConversionPrintResult(result);
    setIsPrintingUnitConversion(false);
  };
  
  // --- Form Field States ---
  const [formData, setFormData] = useState({
    name: '',
    nameArabic: '',
    sku: '',
    category: '',
    unitId: '',
    purchasePrice: '',
    sellingPrice: '',
    currentStock: '',
    minimumStockAlert: '',
    status: 'active',
    barcode: '',
    barcodeType: 'CODE128' as BarcodeType,
    barcodeStatus: 'unassigned' as BarcodeStatus,
    barcodeSource: 'manual' as BarcodeSource,
    isBarcodeLocked: false,
  });

  // --- Validation Errors State ---
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Synchronize Chart of Accounts ---
  const [coa, setCoa] = useState<any[]>([]);

  useEffect(() => {
    if (!auth.currentUser) {
      const saved = localStorage.getItem('nexus_chart_of_accounts');
      setCoa(saved ? JSON.parse(saved) : INITIAL_CHART_OF_ACCOUNTS);
      return;
    }

    const unsubCoa = onSnapshot(collection(db, 'chartOfAccounts'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setCoa(list.length > 0 ? list : INITIAL_CHART_OF_ACCOUNTS);
    }, (err) => {
      console.error("COA sync error in ProductManagement:", err);
      setCoa(INITIAL_CHART_OF_ACCOUNTS);
    });

    return () => unsubCoa();
  }, []);

  // --- Synchronize Units ---
  useEffect(() => {
    if (!auth.currentUser) {
      const saved = localStorage.getItem('inventory_units');
      setUnits(saved ? JSON.parse(saved) : INITIAL_UNITS);
      return;
    }

    const unsubUnits = onSnapshot(collection(db, 'units'), (snapshot) => {
      const list: UnitMaster[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as UnitMaster);
      });
      setUnits(list.length > 0 ? list : INITIAL_UNITS);
    }, (err) => {
      console.error("Units sync error in ProductManagement:", err);
      setUnits(INITIAL_UNITS);
    });

    return () => unsubUnits();
  }, []);

  // --- Synchronize Unit Conversions ---
  useEffect(() => {
    const unsubConversions = UnitConversionService.subscribeAllConversions(
      (data) => setAllConversions(data),
      (err) => console.error('Conversions sync error:', err)
    );
    return () => unsubConversions();
  }, []);

  const activeUnits = useMemo(() => {
    const source = units.length > 0 ? units : INITIAL_UNITS;
    return source
      .filter((u) => u.status === 'active')
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.unitName.localeCompare(b.unitName));
  }, [units]);

  // Inventory transaction guard: product has movement if currentStock > 0 or currentStock differs from initialStock
  const hasMovement = useMemo(() => {
    if (!editingProduct) return false;
    return editingProduct.currentStock > 0 || (editingProduct.initialStock !== undefined && editingProduct.currentStock !== editingProduct.initialStock);
  }, [editingProduct]);

  // --- Real-time Firestore Sync ---
  useEffect(() => {
    if (!auth.currentUser) {
      // Local fallback
      const saved = localStorage.getItem('inventory_products');
      const loadedProducts = saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
      setProducts(loadedProducts);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const unsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productList: Product[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Product;
        productList.push({
          ...data,
          id: data.id || docSnap.id
        });
      });

      if (productList.length > 0) {
        // Sort products by createdDate descending (fall back on SKU/ID if createdDate is missing)
        productList.sort((a, b) => {
          const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
          const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
          if (dateA !== dateB) return dateB - dateA;
          return b.id.localeCompare(a.id);
        });
        setProducts(productList);
        setLoading(false);
      } else {
        setProducts([]);
        setLoading(false);
      }
    }, (err) => {
      console.error("Products sync error:", err);
      let errMsg = 'Failed to synchronize products list with Firestore database.';
      try {
        handleFirestoreError(err, OperationType.LIST, 'products');
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }
      setError(errMsg);
      setFeedback({ message: errMsg, type: 'error' });
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // --- Auto-hide Feedback ---
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  useEffect(() => {
    const handleTrigger = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.tab === 'products') {
        openForm();
      }
    };
    window.addEventListener('nexus-trigger-add-modal', handleTrigger);
    return () => window.removeEventListener('nexus-trigger-add-modal', handleTrigger);
  }, []);

  // --- Derived Categories ---
  const categoriesList = ['All', ...Array.from(new Set(products.map(p => p.category))).filter(Boolean)];

  // --- Form Modal Toggle ---
  const openForm = (product: Product | null = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        nameArabic: product.nameArabic || '',
        sku: product.sku,
        category: product.category,
        unitId: product.unitId || activeUnits[0]?.id || '',
        purchasePrice: product.purchasePrice.toString(),
        sellingPrice: product.sellingPrice.toString(),
        currentStock: product.currentStock.toString(),
        minimumStockAlert: product.minimumStockAlert.toString(),
        status: product.status || 'active',
        barcode: product.barcode || '',
        barcodeType: product.barcodeType || 'CODE128',
        barcodeStatus: product.barcodeStatus || (product.barcode ? 'assigned' : 'unassigned'),
        barcodeSource: product.barcodeSource || 'manual',
        isBarcodeLocked: product.isBarcodeLocked || false,
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        nameArabic: '',
        sku: '',
        category: '',
        unitId: activeUnits[0]?.id || '',
        purchasePrice: permissions?.viewProductCost !== false ? '' : '0',
        sellingPrice: '',
        currentStock: '0',
        minimumStockAlert: '',
        status: 'active',
        barcode: '',
        barcodeType: 'CODE128',
        barcodeStatus: 'unassigned',
        barcodeSource: 'manual',
        isBarcodeLocked: false,
      });
    }
    setErrors({});
    setIsFormOpen(true);
  };

  // --- Validate Input Feeds ---
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Product name is required';
    if (formData.name.length > 200) newErrors.name = 'Name must be 200 characters or less';
    
    if (!formData.sku.trim()) {
      newErrors.sku = 'SKU code is required';
    } else if (formData.sku.length > 100) {
      newErrors.sku = 'SKU code must be 100 characters or less';
    }

    if (!formData.category.trim()) {
      newErrors.category = 'Category designation is required';
    } else if (formData.category.length > 100) {
      newErrors.category = 'Category must be 100 characters or less';
    }

    if (!formData.unitId) {
      newErrors.unitId = 'Base Unit selection is required';
    }

    const costPrice = permissions?.viewProductCost !== false ? parseFloat(formData.purchasePrice) : 0;
    if (permissions?.viewProductCost !== false && (isNaN(costPrice) || costPrice < 0)) {
      newErrors.purchasePrice = 'Enter a valid positive purchase cost';
    }

    const salePrice = parseFloat(formData.sellingPrice);
    if (isNaN(salePrice) || salePrice < 0) {
      newErrors.sellingPrice = 'Enter a valid positive retail price';
    }

    const stock = parseInt(formData.currentStock);
    if (isNaN(stock) || stock < 0) {
      newErrors.currentStock = 'Stock level must be 0 or greater';
    }

    const minAlert = parseInt(formData.minimumStockAlert);
    if (isNaN(minAlert) || minAlert < 0) {
      newErrors.minimumStockAlert = 'Minimum stock alert level must be 0 or greater';
    }

    // Barcode validation
    const trimmedBc = formData.barcode.trim();
    if (trimmedBc) {
      const bcRes = BarcodeService.validateBarcode(
        trimmedBc,
        formData.barcodeType,
        editingProduct?.id,
        products
      );
      if (!bcRes.isValid && bcRes.error) {
        newErrors.barcode = bcRes.error;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Save / Create Product Handler ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSaving(true);
    const productId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
    const timestamp = editingProduct?.createdDate || new Date().toISOString();

    const selectedUnit = activeUnits.find(u => u.id === formData.unitId) || activeUnits[0];

    const trimmedBarcode = formData.barcode.trim();
    const isBarcodeChanged = (editingProduct?.barcode || '') !== trimmedBarcode;

    const finalizedData: Product = {
      id: productId,
      name: formData.name.trim(),
      nameArabic: formData.nameArabic.trim() ? formData.nameArabic.trim() : undefined,
      sku: formData.sku.trim().toUpperCase(),
      category: formData.category.trim(),
      unitId: selectedUnit?.id || formData.unitId,
      unitCode: selectedUnit?.unitCode || editingProduct?.unitCode || '',
      unitName: selectedUnit?.unitName || editingProduct?.unitName || '',
      purchasePrice: permissions?.viewProductCost !== false ? parseFloat(formData.purchasePrice) : (parseFloat(formData.purchasePrice) || 0),
      sellingPrice: parseFloat(formData.sellingPrice),
      currentStock: editingProduct ? editingProduct.currentStock : (parseInt(formData.currentStock) || 0),
      minimumStockAlert: parseInt(formData.minimumStockAlert),
      createdDate: timestamp,
      status: (formData.status as 'active' | 'inactive') || 'active',
      barcode: trimmedBarcode || undefined,
      barcodeType: trimmedBarcode ? formData.barcodeType : undefined,
      barcodeStatus: trimmedBarcode ? (formData.isBarcodeLocked ? 'locked' : 'assigned') : 'unassigned',
      barcodeSource: trimmedBarcode ? formData.barcodeSource : undefined,
      isBarcodeLocked: formData.isBarcodeLocked,
      generatedAt: editingProduct?.generatedAt || (trimmedBarcode ? new Date().toISOString() : undefined),
      generatedBy: editingProduct?.generatedBy || (trimmedBarcode ? 'System Admin' : undefined),
      barcodeVersion: (editingProduct?.barcodeVersion ?? 1) + (isBarcodeChanged ? 1 : 0),
      ...(editingProduct 
        ? (editingProduct.initialStock !== undefined ? { initialStock: editingProduct.initialStock } : {}) 
        : { initialStock: parseInt(formData.currentStock) || 0 }
      )
    };

    try {
      const openingStock = parseInt(formData.currentStock) || 0;
      const purchasePrice = permissions?.viewProductCost !== false ? parseFloat(formData.purchasePrice) : (parseFloat(formData.purchasePrice) || 0);
      const openingValue = !editingProduct ? (openingStock * purchasePrice) : 0;

      if (!auth.currentUser) {
        const saved = localStorage.getItem('inventory_products');
        let currentList: Product[] = saved ? JSON.parse(saved) : INITIAL_PRODUCTS;

        const isSkuDuplicate = currentList.some(p => p.id !== productId && p.sku === finalizedData.sku);
        if (isSkuDuplicate) {
          setErrors(prev => ({ ...prev, sku: 'SKU already exists. SKU must be unique.' }));
          setIsSaving(false);
          return;
        }

        const isNameDuplicate = currentList.some(p => p.id !== productId && p.name.toLowerCase() === finalizedData.name.toLowerCase());
        if (isNameDuplicate) {
          setErrors(prev => ({ ...prev, name: 'A product with this name already exists.' }));
          setIsSaving(false);
          return;
        }

        if (editingProduct) {
          currentList = currentList.map(p => p.id === productId ? finalizedData : p);
        } else {
          currentList = [finalizedData, ...currentList];
        }
        localStorage.setItem('inventory_products', JSON.stringify(currentList));
        setProducts(currentList);

        // Generate Opening Inventory Journal Entry for local offline mode
        if (!editingProduct && openingValue > 0) {
          const savedLedgers = localStorage.getItem('inventory_ledger_entries');
          const localLedgers: LedgerEntry[] = savedLedgers ? JSON.parse(savedLedgers) : [];

          const existingEntry = localLedgers.find(e => e.createdFrom === productId && e.sourceModule === 'OPENING_BALANCE');
          if (!existingEntry) {
            const entryId = `le-opening-${productId}`;
            const postingDate = new Date().toISOString();
            const transDateYear = new Date().getFullYear();
            const periodMonth = String(new Date().getMonth() + 1).padStart(2, '0');
            const accountingPeriod = `${transDateYear}-${periodMonth}`;
            const postingNumber = `JV-${transDateYear}-${String(localLedgers.length + 1).padStart(6, '0')}`;

            const activeCoa = coa.length > 0 ? coa : INITIAL_CHART_OF_ACCOUNTS;
            const inventoryAcc = resolveSystemAccount('INVENTORY', activeCoa);
            const capitalAcc = resolveSystemAccount('CAPITAL', activeCoa);

            const lines: LedgerEntryLine[] = [
              {
                accountId: inventoryAcc.id,
                accountCode: inventoryAcc.code,
                accountName: inventoryAcc.name,
                debit: openingValue,
                credit: 0,
                baseCurrencyDebit: openingValue,
                baseCurrencyCredit: 0
              },
              {
                accountId: capitalAcc.id,
                accountCode: capitalAcc.code,
                accountName: capitalAcc.name,
                debit: 0,
                credit: openingValue,
                baseCurrencyDebit: 0,
                baseCurrencyCredit: openingValue
              }
            ];

            validateJournalBalance(lines);

            const openingLedgerEntry: LedgerEntry = {
              id: entryId,
              postingNumber,
              companyId: 'comp-default',
              branchId: 'branch-main',
              fiscalYear: transDateYear,
              accountingPeriod,
              sourceModule: 'OPENING_BALANCE',
              postingStatus: 'POSTED',
              currency: 'USD',
              exchangeRate: 1,
              baseCurrencyCode: 'USD',
              version: 1,
              narration: `Opening Inventory Valuation for product "${finalizedData.name}" (${finalizedData.sku}) - Qty: ${finalizedData.currentStock} @ $${finalizedData.purchasePrice}`,
              createdFrom: productId,
              approvalStatus: 'APPROVED',
              postingDate,
              createdAt: postingDate,
              createdBy: 'Offline User',
              lines
            };

            localLedgers.push(openingLedgerEntry);
            localStorage.setItem('inventory_ledger_entries', JSON.stringify(localLedgers));
          }
        }

        setFeedback({
          message: editingProduct 
            ? `Successfully synchronized product alterations for "${finalizedData.name}" (Local Only)` 
            : `Permanently logged product record "${finalizedData.name}" locally.`,
          type: 'success'
        });
        setIsFormOpen(false);
        setIsSaving(false);
        return;
      }

      // 1. Live Firestore SKU check
      const productsRef = collection(db, 'products');
      const q = query(productsRef, where('sku', '==', finalizedData.sku));
      const querySnapshot = await getDocs(q);
      const isSkuDuplicate = querySnapshot.docs.some(docSnap => {
        const docData = docSnap.data();
        const resolvedId = docData?.id || docSnap.id;
        return resolvedId !== productId;
      });

      if (isSkuDuplicate) {
        setErrors(prev => ({ ...prev, sku: 'SKU already exists. SKU must be unique.' }));
        setIsSaving(false);
        return;
      }

      // 2. Prevent duplicate product names with same SKU
      const isNameWithSameSkuDuplicate = querySnapshot.docs.some(docSnap => {
        const prod = docSnap.data() as Product;
        const resolvedId = prod?.id || docSnap.id;
        return resolvedId !== productId && prod.name.trim().toLowerCase() === finalizedData.name.toLowerCase();
      });

      if (isNameWithSameSkuDuplicate) {
        setErrors(prev => ({ ...prev, name: 'A product with this name and SKU already exists.' }));
        setIsSaving(false);
        return;
      }

      await runTransaction(db, async (transaction) => {
        const isNewProduct = !editingProduct;
        const shouldCreateOpeningJournal = isNewProduct && openingValue > 0;

        let postingNumber = '';
        let nextVal = 0;
        const transDateYear = new Date().getFullYear();

        if (shouldCreateOpeningJournal) {
          const seqAlloc = await getNextPostingNumber(transaction, 'JV', transDateYear);
          postingNumber = seqAlloc.postingNumber;
          nextVal = seqAlloc.nextVal;
        }

        // Save product document
        const prodRef = doc(db, 'products', productId);
        transaction.set(prodRef, finalizedData);

        if (shouldCreateOpeningJournal) {
          const activeCoa = coa.length > 0 ? coa : INITIAL_CHART_OF_ACCOUNTS;
          const inventoryAcc = resolveSystemAccount('INVENTORY', activeCoa);
          const capitalAcc = resolveSystemAccount('CAPITAL', activeCoa);

          const lines: LedgerEntryLine[] = [
            {
              accountId: inventoryAcc.id,
              accountCode: inventoryAcc.code,
              accountName: inventoryAcc.name,
              debit: openingValue,
              credit: 0,
              baseCurrencyDebit: openingValue,
              baseCurrencyCredit: 0
            },
            {
              accountId: capitalAcc.id,
              accountCode: capitalAcc.code,
              accountName: capitalAcc.name,
              debit: 0,
              credit: openingValue,
              baseCurrencyDebit: 0,
              baseCurrencyCredit: openingValue
            }
          ];

          validateJournalBalance(lines);

          const periodMonth = String(new Date().getMonth() + 1).padStart(2, '0');
          const accountingPeriod = `${transDateYear}-${periodMonth}`;
          const entryId = `le-opening-${productId}`;
          const postingDate = new Date().toISOString();

          const ledgerEntry: LedgerEntry = {
            id: entryId,
            postingNumber,
            companyId: 'comp-default',
            branchId: 'branch-main',
            fiscalYear: transDateYear,
            accountingPeriod,
            sourceModule: 'OPENING_BALANCE',
            postingStatus: 'POSTED',
            currency: 'USD',
            exchangeRate: 1,
            baseCurrencyCode: 'USD',
            version: 1,
            narration: `Opening Inventory Valuation for product "${finalizedData.name}" (${finalizedData.sku}) - Qty: ${finalizedData.currentStock} @ $${finalizedData.purchasePrice}`,
            createdFrom: productId,
            approvalStatus: 'APPROVED',
            postingDate,
            createdAt: postingDate,
            createdBy: auth.currentUser?.email || 'admin_01@nexus.erp',
            lines
          };

          const ledgerRef = doc(db, 'ledgerEntries', entryId);
          transaction.set(ledgerRef, ledgerEntry);

          commitNextPostingNumber(transaction, 'JV', nextVal);

          const currentCoaIds = activeCoa.map(c => c.id);
          await ensureSystemAccountsExist(transaction, currentCoaIds);
        }
      });

      if (editingProduct) {
        await logSystemActivity(
          "Product edited",
          `Updated product: "${finalizedData.name}" (SKU: ${finalizedData.sku}, Price: $${finalizedData.sellingPrice}, Stock: ${finalizedData.currentStock} units)`
        );
      } else {
        await logSystemActivity(
          "Product added",
          `Added product: "${finalizedData.name}" (SKU: ${finalizedData.sku}, Price: $${finalizedData.sellingPrice}, Initial Stock: ${finalizedData.currentStock} units)`
        );
      }
      setFeedback({
        message: editingProduct 
          ? `Successfully synchronized product alterations for "${finalizedData.name}"` 
          : `Permanently logged product record "${finalizedData.name}" in index.`,
        type: 'success'
      });
      setIsFormOpen(false);
    } catch (err: any) {
      if (err?.message === 'SKU_DUPLICATE') {
        setErrors(prev => ({ ...prev, sku: 'SKU already exists. SKU must be unique.' }));
        setIsSaving(false);
        return;
      }
      if (err?.message === 'NAME_DUPLICATE') {
        setErrors(prev => ({ ...prev, name: 'A product with this name and SKU already exists.' }));
        setIsSaving(false);
        return;
      }
      console.error("Save product error:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
      } catch (dbErr: any) {
        setFeedback({ message: `Firestore Write Failed: ${dbErr.message}`, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Confirm Delete Trigger ---
  const handleDeleteTrigger = (product: Product) => {
    setProductToDelete(product);
  };

  // --- Confirm Delete Execution ---
  const handleConfirmDeleteField = async () => {
    if (!productToDelete) return;
    const name = productToDelete.name;
    const id = productToDelete.id;
    setProductToDelete(null);

    setIsSaving(true);
    try {
      if (!auth.currentUser) {
        const saved = localStorage.getItem('inventory_products');
        let currentList: Product[] = saved ? JSON.parse(saved) : INITIAL_PRODUCTS;

        const savedSales = localStorage.getItem('inventory_sales') || '[]';
        const salesList = JSON.parse(savedSales);
        const hasSales = salesList.some((s: any) => s.productId === id);

        const savedPurchases = localStorage.getItem('inventory_purchases') || '[]';
        const purchasesList = JSON.parse(savedPurchases);
        const hasPurchases = purchasesList.some((p: any) => p.productId === id);

        if (hasSales || hasPurchases) {
          const updatedProduct: Product = {
            ...productToDelete,
            status: 'inactive'
          };
          currentList = currentList.map(p => p.id === id ? updatedProduct : p);
          localStorage.setItem('inventory_products', JSON.stringify(currentList));
          setProducts(currentList);

          let reason = "";
          if (hasSales && hasPurchases) {
            reason = "existing sales and purchase history";
          } else if (hasSales) {
            reason = "existing sales history";
          } else {
            reason = "existing purchase history";
          }
          setFeedback({ message: `Product record "${name}" has ${reason} and has been safely marked as "inactive" instead of being deleted.`, type: 'success' });
        } else {
          const updatedProduct: Product = {
            ...productToDelete,
            status: 'inactive'
          };
          currentList = currentList.map(p => p.id === id ? updatedProduct : p);
          localStorage.setItem('inventory_products', JSON.stringify(currentList));
          setProducts(currentList);
          setFeedback({ message: `Product record "${name}" has been safely retired as "inactive" instead of being deleted.`, type: 'success' });
        }
        setIsSaving(false);
        return;
      }

      // Always soft-delete to preserve catalog integrity and history references
      const updatedProduct: Product = {
        ...productToDelete,
        status: 'inactive'
      };
      await setDoc(doc(db, 'products', id), updatedProduct);

      await logSystemActivity(
        "Product inactivated",
        `Marked product "${name}" (ID: ${id}) as inactive.`
      );
      setFeedback({ message: `Product record "${name}" has been safely retired and marked as "inactive".`, type: 'success' });
    } catch (err: any) {
      console.error("Delete product error:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `products/${id}`);
      } catch (dbErr: any) {
        setFeedback({ message: `Inactivation unsuccessful: ${dbErr.message}`, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Filter and Search logic ---
  const filteredProducts = products.filter((prod) => {
    // Hide inactive/retired products from standard lists
    if (isInactiveStatus(prod.status)) return false;

    const matchesSearch = 
      prod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prod.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prod.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (prod.barcode && prod.barcode.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'All' || prod.category === selectedCategory;

    let matchesStockFilter = true;
    if (stockStatusFilter === 'Alert Only') {
      matchesStockFilter = prod.currentStock <= prod.minimumStockAlert;
    } else if (stockStatusFilter === 'In Stock') {
      matchesStockFilter = prod.currentStock > prod.minimumStockAlert;
    }

    return matchesSearch && matchesCategory && matchesStockFilter;
  });

  // --- Dashboard Calculation Metrics ---
  const activeProductsForTotals = products.filter(p => !isInactiveStatus(p.status));
  const totalsCount = activeProductsForTotals.length;
  const criticalAlertsCount = activeProductsForTotals.filter(p => p.currentStock <= p.minimumStockAlert).length;
  const totalValuationPurchase = activeProductsForTotals.reduce((sum, p) => sum + (p.purchasePrice * p.currentStock), 0);
  const potentialRevenueValue = activeProductsForTotals.reduce((sum, p) => sum + (p.sellingPrice * p.currentStock), 0);
  const potentialProfitValue = potentialRevenueValue - totalValuationPurchase;

  return (
    <div id="product-management-system-root" className="space-y-8 animate-fade-in font-sans pb-12">
      
      {/* POPUP FEEDBACK ALERT BANNER */}
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
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            )}
            <p>{feedback.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* THREE BENTO METRIC CARDS */}
      <div className={`grid grid-cols-1 gap-4 sm:gap-6 ${permissions?.viewProductCost !== false ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {/* Total Registered Products */}
        <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between w-full min-w-0 animate-fade-in">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Cataloged Items</span>
              <span className="p-1 px-2.5 rounded-full text-[10px] font-extrabold bg-indigo-50 border border-indigo-100 text-indigo-600 shrink-0">
                Core Index
              </span>
            </div>
            {loading ? (
              <div className="h-8 w-12 bg-slate-100 rounded-lg animate-pulse"></div>
            ) : (
              <ResponsiveKPIValue value={totalsCount} className="text-slate-900" />
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1 truncate">
            <Archive className="h-3 w-3 text-indigo-500 shrink-0" /> Unique product configurations
          </div>
        </div>

        {/* Low Stock Warning Alert State */}
        <div className={`rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border transition flex flex-col justify-between w-full min-w-0 animate-fade-in ${
          criticalAlertsCount > 0 
            ? 'bg-amber-50 border-amber-200 text-amber-900' 
            : 'bg-emerald-50 border-emerald-100 text-emerald-950'
        }`}>
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Low-Stock Warnings</span>
              {criticalAlertsCount > 0 ? (
                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping shrink-0"></span>
              ) : (
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
              )}
            </div>
            {loading ? (
              <div className="h-8 w-12 bg-amber-200/50 rounded-lg animate-pulse"></div>
            ) : (
              <ResponsiveKPIValue value={criticalAlertsCount} className={criticalAlertsCount > 0 ? 'text-amber-900' : 'text-emerald-950'} />
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-dashed border-current/20 text-[11px] opacity-80 flex items-center gap-1.5 truncate">
            <Bell className="h-3.5 w-3.5 shrink-0" />
            {criticalAlertsCount > 0 
              ? `${criticalAlertsCount} products require restock` 
              : 'All registered stock levels safe'}
          </div>
        </div>

        {/* Asset Capital Valuation */}
        {permissions?.viewProductCost !== false && (
          <div className="bg-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between w-full min-w-0 animate-fade-in">
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none whitespace-nowrap truncate min-w-0">Net Asset Capital value</span>
                <DollarSign className="h-4 w-4 text-emerald-600 shrink-0" />
              </div>
              {loading ? (
                <div className="h-8 w-28 bg-slate-100 rounded-lg animate-pulse"></div>
              ) : (
                <ResponsiveKPIValue value={formatCurrency(totalValuationPurchase)} className="text-slate-900" />
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex justify-between items-center gap-2">
              <span className="truncate">Potential: {formatCurrency(potentialRevenueValue)}</span>
              <span className="text-emerald-600 font-bold shrink-0">+{totalValuationPurchase > 0 ? Math.round((potentialProfitValue / totalValuationPurchase) * 100) : 0}%</span>
            </div>
          </div>
        )}
      </div>

      {/* CORE CONTROL AREA */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Side: Product Master Lists */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
            
            {/* Tab header buttons */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-sans text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-indigo-500 shrink-0" />
                  Product Directory Desk
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update product SKUs, classification, pricing limits and warehouse stock
                </p>
              </div>

              {permissions.createProduct && (
                <button
                  type="button"
                  onClick={() => openForm()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Product (Opening Stock)</span>
                </button>
              )}
            </div>

            {/* Filter controls panel */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 pt-2 border-t border-slate-100">
              {/* Search input field */}
              <div className="sm:col-span-2 relative">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by product name, SKU or categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-xs font-medium text-slate-800 placeholder:text-slate-450 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-505 outline-none font-sans"
                />
              </div>

              {/* Category Dropdown Selection */}
              <div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 px-3.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                >
                  <option value="All">All Categories</option>
                  {categoriesList.filter(c => c !== 'All').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Stock Status Selection Filters */}
              <div className="flex bg-slate-50 border border-slate-100 p-1 rounded-xl">
                {([ 'All', 'Alert Only' ] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStockStatusFilter(status)}
                    className={`flex-1 text-center py-2 text-[10px] font-bold tracking-tight rounded-lg transition ${
                      stockStatusFilter === status 
                        ? 'bg-white text-indigo-600 shadow-xs border border-slate-100' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {status === 'Alert Only' ? '⚠️ Alerts' : 'All Stock'}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Product Lists */}
            <div className="space-y-4 pt-2">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="border border-slate-200 rounded-2xl p-5 bg-white animate-pulse flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-3 flex-grow">
                        <div className="h-4 bg-slate-100 rounded-md w-1/3"></div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                          <div className="h-3.5 bg-slate-50 rounded-md w-1/2"></div>
                          <div className="h-3.5 bg-slate-50 rounded-md w-2/3"></div>
                          <div className="h-3.5 bg-slate-50 rounded-md w-1/2"></div>
                          <div className="h-3.5 bg-slate-50 rounded-md w-2/3"></div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0 shrink-0">
                        <div className="h-5 bg-slate-100 rounded-md w-24"></div>
                        <div className="flex gap-2">
                          <div className="w-8 h-8 bg-slate-50 rounded-lg"></div>
                          <div className="w-8 h-8 bg-slate-50 rounded-lg"></div>
                        </div>
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
              ) : filteredProducts.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, y: 12 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ duration: 0.3 }}
                  className="mx-auto max-w-md w-full my-6 bg-slate-50/50 border border-slate-200/60 rounded-3xl p-8 text-center flex flex-col items-center gap-4.5 shadow-3xs hover:shadow-2xs transition-all"
                >
                  <div className="relative group">
                    <div className="absolute inset-0 bg-indigo-200/20 rounded-full blur-xl group-hover:scale-125 transition duration-300"></div>
                    <div className="relative w-16 h-16 bg-white border border-slate-100 rounded-2xl shadow-3xs flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-all duration-300">
                      <Package className="h-8 w-8 text-slate-400 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest leading-none">
                      {products.length === 0 ? 'No Inventory Items' : 'No Products Found'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed font-semibold">
                      {products.length === 0 
                        ? 'Initialize and catalogue your product catalog items to calculate margins, manage stock limits, and track sales.'
                        : searchQuery || selectedCategory !== 'All' || stockStatusFilter !== 'All'
                          ? "We couldn't locate any products matching your active search context or category filters."
                          : 'No matching components were found. Revise your search attributes or append a new item.'}
                    </p>
                  </div>
                  <div className="flex gap-2.5 pt-1.5 flex-wrap justify-center">
                    {products.length > 0 && (searchQuery || selectedCategory !== 'All' || stockStatusFilter !== 'All') ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedCategory('All');
                          setStockStatusFilter('All');
                        }}
                        className="bg-white border border-slate-200 hover:border-slate-350 text-slate-700 font-extrabold text-[11px] uppercase tracking-wider px-5 py-2.5 rounded-xl transition cursor-pointer shadow-3xs"
                      >
                        Reset Search Filters
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openForm(null)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] uppercase tracking-wider h-10 px-5 rounded-xl transition cursor-pointer shadow-xs hover:shadow-md inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Initialize Catalog Item</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-left border-collapse table-auto">
                      <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-4 px-6">Product Item</th>
                          <th className="py-4 px-5">SKU / Code</th>
                          <th className="py-4 px-5">Barcode</th>
                          <th className="py-4 px-5 text-center">Base Unit</th>
                          {permissions?.viewProductCost !== false && <th className="py-4 px-5 text-right font-mono">Purchase Cost</th>}
                          <th className="py-4 px-5 text-right font-mono">Retail Price</th>
                          <th className="py-4 px-5 text-center">Warehouse Stock</th>
                          <th className="py-4 px-5 text-center">Min Alert</th>
                          <th className="py-4 px-5 text-center">Status</th>
                          {(permissions.editProduct || permissions.deleteProduct) && <th className="py-4 px-6 text-center">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                        {filteredProducts.map((product) => {
                          const isLowStock = product.currentStock <= product.minimumStockAlert;
                          const isInactive = isInactiveStatus(product.status);
                          return (
                            <tr 
                              key={product.id} 
                              className={`hover:bg-indigo-50/20 transition duration-150 ${
                                isInactive 
                                  ? 'bg-slate-50/40 opacity-70' 
                                  : isLowStock 
                                  ? 'bg-amber-50/15 hover:bg-amber-50/25' 
                                  : 'even:bg-slate-50/30'
                              }`}
                            >
                              <td className="py-4 px-6 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">{product.name}</span>
                                  {product.initialStock !== undefined && product.initialStock > 0 && (
                                    <span className="inline-flex items-center rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-emerald-700 shadow-3xs">
                                      Opening Stock
                                    </span>
                                  )}
                                </div>
                                <div className="inline-flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                                  <Tag className="h-3 w-3 shrink-0 text-slate-400" />
                                  <span>{product.category}</span>
                                </div>
                              </td>
                              <td className="py-4 px-5 font-mono text-indigo-700 whitespace-nowrap">
                                <span className="bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 font-bold">
                                  {product.sku}
                                </span>
                              </td>
                              <td className="py-4 px-5 whitespace-nowrap">
                                {product.barcode ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold font-mono bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded-md">
                                      <Barcode className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                      {product.barcode}
                                    </span>
                                    <span className="text-[9px] font-semibold text-slate-400 pl-0.5">
                                      {product.barcodeType || 'CODE128'} • {product.barcodeStatus || 'assigned'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px] font-medium">No Barcode</span>
                                )}
                              </td>
                              <td className="py-4 px-5 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <UnitBadge unitCode={product.unitCode || product.unitName || 'No Unit'} size="md" />
                                  
                                  {/* Alternate Unit Conversions */}
                                  {(() => {
                                    const pConvs = allConversions.filter(
                                      (c) => c.productId === product.id && c.status === 'active'
                                    );
                                    if (pConvs.length === 0) return null;
                                    return (
                                      <div className="flex flex-wrap justify-center gap-1 mt-0.5">
                                        {pConvs.map((conv) => (
                                          <span
                                            key={conv.id}
                                            className="text-[10px] font-mono font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200/80 px-1.5 py-0.2 rounded"
                                            title={`1 ${conv.alternateUnitCode} = ${conv.conversionFactor} ${conv.baseUnitCode}`}
                                          >
                                            {formatConversionText(conv)}
                                          </span>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </td>
                              {permissions?.viewProductCost !== false && (
                                <td className="py-4 px-5 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                                  {formatCurrency(product.purchasePrice)}
                                </td>
                              )}
                              <td className="py-4 px-5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                {formatCurrency(product.sellingPrice)}
                              </td>
                              <td className="py-4 px-5 text-center whitespace-nowrap">
                                <span className={`font-mono font-black text-sm ${isLowStock ? 'text-rose-600' : 'text-slate-900'}`}>
                                  {product.currentStock} {product.unitCode || 'No Unit'}
                                </span>
                              </td>
                              <td className="py-4 px-5 text-center font-mono text-slate-500 whitespace-nowrap">
                                {product.minimumStockAlert} {product.unitCode || 'No Unit'}
                              </td>
                              <td className="py-4 px-5 text-center whitespace-nowrap">
                                {isInactive ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 shadow-3xs">
                                    Retired
                                  </span>
                                ) : isLowStock ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-orange-700 shadow-3xs">
                                    <AlertTriangle className="h-2.5 w-2.5 text-orange-600 animate-pulse shrink-0" />
                                    Low Stock
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-250/60 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 shadow-3xs">
                                    Class Safe
                                  </span>
                                )}
                              </td>
                              <td className="py-4 px-6 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedProductDetails(product)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition cursor-pointer"
                                    title="View Product Details & Unit Hierarchy"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>

                                  {permissions.editProduct && (
                                      <button
                                        type="button"
                                        onClick={() => openForm(product)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition"
                                        title="Edit product parameters"
                                      >
                                        <Edit2 className="h-4 w-4" />
                                      </button>
                                    )}
                                    {permissions.deleteProduct && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTrigger(product)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition"
                                        title="Permanently delete product description"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
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

        {/* Right Columns: Critical Alerts Panel & Audit Guides */}
        <div className="space-y-6">
          
          {/* List of outstanding critical product alerts */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Stock Alerts Panel</h4>
              <Bell className="h-4 w-4 text-amber-500 shrink-0" />
            </div>

            <div className="space-y-3">
              {products.filter(p => !isInactiveStatus(p.status) && p.currentStock <= p.minimumStockAlert).length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <p className="text-xs font-semibold text-slate-500">Systems Safe</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">All item levels exceed alert trigger settings</p>
                </div>
              ) : (
                products.filter(p => !isInactiveStatus(p.status) && p.currentStock <= p.minimumStockAlert).slice(0, 4).map((prod) => (
                  <div key={prod.id} className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-amber-900 truncate">{prod.name}</p>
                      <p className="text-[10px] text-amber-705 font-medium mt-0.5">
                        SKU: {prod.sku} • Limit: {prod.minimumStockAlert}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-rose-650 text-rose-600 block">{prod.currentStock} left</span>
                      <span className="text-[9px] text-slate-400 block">Restock needed</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Guidelines on markup/revenue rules */}
          <div className="bg-slate-900 text-white rounded-[2rem] p-6 sm:p-8 space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-bold uppercase text-[10px] tracking-widest text-slate-400">Inventory Guidelines</h4>
              <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              When configuring <strong className="text-white font-bold">Minimum Stock levels</strong>, ensure the threshold covers the standard lead times for vendor shipments to avoid stockout scenarios.
            </p>
            <div className="mt-4 border-t border-slate-800 pt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-450 text-slate-400">Asset Valuation Sync</span>
                <span className="font-mono text-[9px] bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded">Active</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-450 text-slate-400">Form Validation Engine</span>
                <span className="font-mono text-[9px] text-emerald-400 font-semibold">Strict</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* FORM MODAL COMPONENT */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden"
            >
              {/* Form title */}
              <div className="flex items-center justify-between border-b border-slate-100 px-6 sm:px-8 py-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingProduct ? `Modify Product: ${editingProduct.name}` : 'Catalog New Inventory Product (Opening Stock)'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Assign product identification, current inventories, and price margins
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsFormOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-800 transition rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-40"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form inputs body */}
              <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
                
                {/* Name */}
                <div className="relative w-full">
                  <input
                    type="text"
                    required
                    disabled={isSaving}
                    id="product-form-name-field"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder=" "
                    className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                      errors.name 
                        ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                        : 'border-slate-200 focus:border-indigo-605'
                    }`}
                  />
                  <label htmlFor="product-form-name-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                    Product Name <span className="text-rose-500 font-extrabold">*</span>
                  </label>
                  {errors.name && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      <span>{errors.name}</span>
                    </div>
                  )}
                </div>

                {/* Product Name (Arabic) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="product-form-name-arabic-field" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Product Name (Arabic)
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        setTranslationNotice(null);
                        const sourceName = (formData.name || '').trim();
                        if (!sourceName) {
                          setTranslationNotice({ type: 'warning', message: 'Please enter a Product Name first.' });
                          return;
                        }
                        const res = await TranslationService.translateToArabic(sourceName);
                        if (res.success && res.translatedText) {
                          setFormData(prev => ({ ...prev, nameArabic: res.translatedText }));
                          setTranslationNotice({ type: 'success', message: `Arabic name generated: ${res.translatedText}` });
                        } else {
                          setTranslationNotice({ type: 'warning', message: res.message || 'Translation not found in offline dictionary.' });
                        }
                      }}
                      className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md transition border border-indigo-100/80 cursor-pointer"
                    >
                      Generate Arabic
                    </button>
                  </div>
                  <input
                    type="text"
                    id="product-form-name-arabic-field"
                    dir="rtl"
                    disabled={isSaving}
                    value={formData.nameArabic}
                    onChange={(e) => setFormData({ ...formData, nameArabic: e.target.value })}
                    placeholder="اسم المنتج (اختياري)"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 focus:border-indigo-650 h-[42px] text-right font-sans"
                  />
                  {translationNotice && (
                    <div className={`mt-1.5 text-[11px] font-semibold px-3 py-2 rounded-xl flex items-center justify-between border shadow-3xs transition-all ${
                      translationNotice.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                        : 'bg-amber-50 text-amber-800 border-amber-200/80'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        {translationNotice.type === 'success' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        )}
                        <span>{translationNotice.message}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTranslationNotice(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* SKU */}
                  <div className="relative w-full">
                    <input
                      type="text"
                      required
                      disabled={isSaving}
                      id="product-form-sku-field"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                        errors.sku 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                          : 'border-slate-200 focus:border-indigo-605'
                      }`}
                    />
                    <label htmlFor="product-form-sku-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      SKU Code <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {errors.sku && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                        <span>{errors.sku}</span>
                      </div>
                    )}
                  </div>

                  {/* Category */}
                  <div className="relative w-full">
                    <input
                      type="text"
                      required
                      disabled={isSaving}
                      id="product-form-cat-field"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                        errors.category 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                          : 'border-slate-200 focus:border-indigo-605'
                      }`}
                    />
                    <label htmlFor="product-form-cat-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      Category Designation <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {errors.category && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                        <span>{errors.category}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Base Unit Select */}
                <div className="relative w-full">
                  <label htmlFor="product-form-unit-select" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Base Unit <span className="text-rose-500 font-extrabold">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="product-form-unit-select"
                      disabled={isSaving || hasMovement}
                      value={formData.unitId}
                      onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                      className={`w-full rounded-xl border px-3.5 py-3 text-xs font-semibold focus:outline-none transition-all appearance-none bg-white focus:ring-1 focus:ring-indigo-600 disabled:opacity-75 disabled:bg-slate-50 ${
                        errors.unitId
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10'
                          : 'border-slate-200 focus:border-indigo-600 text-slate-800'
                      }`}
                    >
                      <option value="">Select Base Unit...</option>
                      {activeUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.unitName} ({u.unitCode})
                        </option>
                      ))}
                    </select>
                    {hasMovement && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-amber-500">
                        <Lock className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  {hasMovement && (
                    <p className="mt-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span>This product already contains inventory transactions. Base Unit cannot be changed.</span>
                    </p>
                  )}
                  {errors.unitId && !hasMovement && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      <span>{errors.unitId}</span>
                    </div>
                  )}
                </div>

                <div className={`grid grid-cols-1 ${permissions?.viewProductCost !== false ? 'sm:grid-cols-2' : ''} gap-5`}>
                  {/* Purchase Price */}
                  {permissions?.viewProductCost !== false && (
                    <div className="relative w-full">
                      <span className="absolute left-3.5 top-[18px] text-slate-400 text-xs font-bold leading-none">$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        disabled={isSaving}
                        id="product-form-purchasePrice-field"
                        value={formData.purchasePrice}
                        onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                        placeholder=" "
                        className={`peer w-full rounded-xl border pl-[26px] pr-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                          errors.purchasePrice 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                            : 'border-slate-200 focus:border-indigo-605'
                        }`}
                      />
                      <label htmlFor="product-form-purchasePrice-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-placeholder-shown:left-[26px] peer-focus:top-1.5 peer-focus:left-3.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                        Purchase Unit Cost ($) <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                      {errors.purchasePrice && (
                        <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-505 shrink-0" />
                          <span>{errors.purchasePrice}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selling Price */}
                  <div className="relative w-full">
                    <span className="absolute left-3.5 top-[18px] text-slate-400 text-xs font-bold leading-none">$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      disabled={isSaving}
                      id="product-form-sellingPrice-field"
                      value={formData.sellingPrice}
                      onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border pl-[26px] pr-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                        errors.sellingPrice 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                          : 'border-slate-200 focus:border-indigo-605'
                      }`}
                    />
                    <label htmlFor="product-form-sellingPrice-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-placeholder-shown:left-[26px] peer-focus:top-1.5 peer-focus:left-3.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      Retail Selling Price ($) <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {errors.sellingPrice && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-505 shrink-0" />
                        <span>{errors.sellingPrice}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Current Stock */}
                  <div className="relative w-full">
                    <input
                      type="number"
                      required
                      disabled={isSaving || !!editingProduct}
                      id="product-form-currentStock-field"
                      value={formData.currentStock}
                      onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                        errors.currentStock 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                          : 'border-slate-200 focus:border-indigo-605'
                      }`}
                    />
                    <label htmlFor="product-form-currentStock-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      Current Stock Units <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {errors.currentStock && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                        <span>{errors.currentStock}</span>
                      </div>
                    )}
                  </div>

                  {/* Minimum alert */}
                  <div className="relative w-full">
                    <input
                      type="number"
                      required
                      disabled={isSaving}
                      id="product-form-min-field"
                      value={formData.minimumStockAlert}
                      onChange={(e) => setFormData({ ...formData, minimumStockAlert: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                        errors.minimumStockAlert 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                          : 'border-slate-200 focus:border-indigo-605'
                      }`}
                    />
                    <label htmlFor="product-form-min-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      Minimum Alert Threshold <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {errors.minimumStockAlert && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                        <span>{errors.minimumStockAlert}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Show status selection only when editing an existing product */}
                {editingProduct && (
                  <div className="relative w-full">
                    <select
                      id="product-form-status-field"
                      disabled={isSaving}
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="peer w-full rounded-xl border border-slate-200 px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 bg-white appearance-none cursor-pointer disabled:opacity-60 disabled:bg-slate-50 h-[52px] text-slate-700"
                    >
                      <option value="active">Active (Available for sales/procurements)</option>
                      <option value="inactive">Inactive / Retired (Archived and read-only)</option>
                    </select>
                    <label htmlFor="product-form-status-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                      Product Status <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                  </div>
                )}

                {/* Submit / actions */}
                <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer font-semibold disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></span>
                        <span>Saving Catalog...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>{editingProduct ? 'Save Product' : 'Catalog Item (Opening Stock)'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION SYSTEM MODAL */}
      <AnimatePresence>
        {productToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 sm:p-8 space-y-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center text-rose-600 mb-4">
                    <AlertTriangle className="h-6 w-6 animate-pulse" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    Purge Product Catalog Record?
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Are you absolutely certain you want to permanently delete product descriptor{' '}
                    <strong className="text-slate-900 font-extrabold">"{productToDelete.name}"</strong>? 
                    This deletion will erase SKU registries, classifications, and all recorded inventory counts.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setProductToDelete(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer disabled:opacity-40"
                  >
                    Cancel, Keep Record
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleConfirmDeleteField}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 transition shadow-xs hover:shadow-md cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-75"
                  >
                    {isSaving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></span>
                        <span>Purging Catalog...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        <span>Yes, Purge Catalog</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PRODUCT DETAILS MODAL (SECTION 6: SPRINT 4) */}
      <AnimatePresence>
        {selectedProductDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {selectedProductDetails.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                        {selectedProductDetails.sku}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        Category: {selectedProductDetails.category}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedProductDetails(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6 text-xs">
                {/* ENTERPRISE BARCODE METADATA & INTEGRATION LAYER (SPRINT 6 & 7) */}
                <div className="bg-indigo-50/50 rounded-2xl border border-indigo-150 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Barcode className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                        Enterprise Barcode Integration
                      </h4>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                        Local First Active
                      </span>
                    </div>
                  </div>

                  {/* Section 7 Read-Only Provider Indicators */}
                  <div className="bg-slate-900 text-white p-3.5 rounded-xl border border-slate-800 grid grid-cols-3 gap-2 text-center">
                    <div className="p-1.5 bg-slate-800/80 rounded-lg border border-slate-700/60">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block">Integration Provider</span>
                      <span className="text-xs font-black text-indigo-400 mt-0.5 block uppercase">LOCAL</span>
                    </div>

                    <div className="p-1.5 bg-slate-800/80 rounded-lg border border-slate-700/60">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block">Integration Status</span>
                      <span className="text-xs font-black text-emerald-400 mt-0.5 block uppercase">Ready</span>
                    </div>

                    <div className="p-1.5 bg-slate-800/80 rounded-lg border border-slate-700/60">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block">Future Cloud</span>
                      <span className="text-xs font-black text-amber-300 mt-0.5 block uppercase">Available</span>
                    </div>
                  </div>

                  {selectedProductDetails.barcode ? (
                    <div className="grid grid-cols-2 gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Barcode Value</span>
                        <span className="text-xs font-mono font-black text-slate-900 mt-0.5 block">
                          {selectedProductDetails.barcode}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Barcode Standard</span>
                        <span className="text-xs font-mono font-bold text-indigo-700 mt-0.5 block uppercase">
                          {selectedProductDetails.barcodeType || 'CODE128'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Status & Source</span>
                        <span className="text-[11px] font-semibold text-slate-700 mt-0.5 block capitalize">
                          {selectedProductDetails.barcodeStatus || 'assigned'} ({selectedProductDetails.barcodeSource || 'manual'})
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Lock & Version</span>
                        <span className="text-[11px] font-semibold text-slate-700 mt-0.5 block">
                          {selectedProductDetails.isBarcodeLocked ? '🔒 Locked' : '🔓 Unlocked'} • v{selectedProductDetails.barcodeVersion || 1}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-white rounded-xl border border-dashed border-slate-200 text-center text-slate-400 italic">
                      No Barcode Assigned to this Product.
                    </div>
                  )}

                  {/* SPRINT 11 EXECUTION ENGINE: GENERATE BARCODE ACTION & RESULT */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider block">
                          Sprint 13 Desktop Connector Host
                        </span>
                        <span className="text-xs font-bold text-slate-900 block mt-0.5">
                          Execute Barcode Generation
                        </span>
                      </div>

                      {DesktopDetector.isWeb() ? (
                        <span className="text-[9px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Globe className="w-3 h-3 text-amber-600" />
                          Web Mode Active
                        </span>
                      ) : (
                        <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Zap className="w-3 h-3 text-emerald-600" />
                          Desktop Mode
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleGenerateBarcodeForProduct(selectedProductDetails)}
                      disabled={isExecutingBarcode}
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Zap className={`w-4 h-4 ${isExecutingBarcode ? 'animate-bounce' : ''}`} />
                      <span>{isExecutingBarcode ? 'Executing Barcode Generation...' : 'Generate Barcode'}</span>
                    </button>

                    {barcodeExecResult && (
                      <div className="bg-slate-950 text-slate-100 p-3.5 rounded-xl border border-slate-800 space-y-3 mt-2">
                        <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-2">
                          <span className="font-bold text-indigo-300">Execution Status:</span>
                          <span className={`font-mono font-extrabold uppercase px-2 py-0.5 rounded text-[10px] ${
                            barcodeExecResult.status === 'SUCCESS' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                            barcodeExecResult.status === 'OFFLINE' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                            barcodeExecResult.status === 'TIMEOUT' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                            barcodeExecResult.status === 'PROTOCOL_MISMATCH' ? 'bg-purple-950 text-purple-400 border border-purple-800' :
                            'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {barcodeExecResult.status}
                          </span>
                        </div>

                        {/* 1. SVG PREVIEW */}
                        {barcodeExecResult.imageDataUrl && (
                          <div className="p-2.5 bg-white rounded-lg flex flex-col items-center justify-center border border-slate-200">
                            <img src={barcodeExecResult.imageDataUrl} alt="Barcode Preview" className="max-h-20" />
                            <span className="text-[10px] font-mono font-bold text-slate-600 mt-1">
                              {barcodeExecResult.barcodeType}: {barcodeExecResult.barcodeValue}
                            </span>
                          </div>
                        )}

                        {/* 2 - 10: METADATA GRID */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-mono border-t border-b border-slate-800 py-2">
                          <div><span className="text-slate-400">Barcode Type:</span> <strong className="text-white">{barcodeExecResult.barcodeType || selectedProductDetails.barcodeType || 'CODE128'}</strong></div>
                          <div><span className="text-slate-400">Barcode Value:</span> <strong className="text-white">{barcodeExecResult.barcodeValue}</strong></div>
                          <div><span className="text-slate-400">Execution Time:</span> <strong className="text-sky-300">{barcodeExecResult.executionTimeMs} ms</strong></div>
                          <div><span className="text-slate-400">Provider:</span> <strong className="text-white">{barcodeExecResult.provider}</strong></div>
                          <div><span className="text-slate-400">Connector Ver:</span> <strong className="text-indigo-300">{barcodeExecResult.connectorVersion || '1.3.0'}</strong></div>
                          <div><span className="text-slate-400">Protocol Ver:</span> <strong className="text-indigo-300">{barcodeExecResult.protocolVersion || 'v1.0'}</strong></div>
                          <div><span className="text-slate-400">Conn Status:</span> <strong className={barcodeExecResult.connectionStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-rose-400'}>{barcodeExecResult.connectionStatus || (barcodeExecResult.success ? 'CONNECTED' : 'OFFLINE')}</strong></div>
                          <div><span className="text-slate-400">Transport:</span> <strong className="text-emerald-400">{barcodeExecResult.transport || 'LOCAL_HTTP'}</strong></div>
                          <div className="col-span-2 truncate"><span className="text-slate-400">Request ID:</span> <strong className="text-slate-200">{barcodeExecResult.requestId || 'REQ-DEV-001'}</strong></div>
                          <div className="col-span-2 truncate"><span className="text-slate-400">Correlation ID:</span> <strong className="text-slate-200">{barcodeExecResult.correlationId || 'CORR-DEV-001'}</strong></div>
                        </div>

                        {/* ERROR & RETRY CONTROL */}
                        {!barcodeExecResult.success && (
                          <div className="space-y-2 pt-1">
                            <div className="text-[10px] text-rose-300 bg-rose-950/70 p-2.5 rounded-lg border border-rose-800 space-y-1">
                              <div className="font-bold flex items-center gap-1.5 text-rose-200">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                {barcodeExecResult.status === 'OFFLINE' ? 'Connector Offline' :
                                 barcodeExecResult.status === 'TIMEOUT' ? 'HTTP Request Timeout' :
                                 barcodeExecResult.status === 'PROTOCOL_MISMATCH' ? 'Protocol Mismatch' :
                                 'Execution Failed'}
                              </div>
                              <p className="text-rose-300 text-[10px] leading-relaxed">
                                {barcodeExecResult.errorMessage}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleGenerateBarcodeForProduct(selectedProductDetails)}
                              disabled={isExecutingBarcode}
                              className="w-full py-1.5 px-3 bg-rose-900/50 hover:bg-rose-800/60 text-rose-200 border border-rose-700/50 text-[10px] font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3 h-3 ${isExecutingBarcode ? 'animate-spin' : ''}`} />
                              <span>Retry Barcode Generation</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* SPRINT 10 EXECUTION ENGINE: PRINT BARCODE ACTION & RESULT */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 mt-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider block">
                          Sprint 10 Real Thermal Print
                        </span>
                        <span className="text-xs font-bold text-slate-900 block mt-0.5">
                          Execute Thermal Print
                        </span>
                      </div>

                      {DesktopDetector.isWeb() ? (
                        <span className="text-[9px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Globe className="w-3 h-3 text-amber-600" />
                          Web Mode Active
                        </span>
                      ) : (
                        <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Zap className="w-3 h-3 text-emerald-600" />
                          Desktop Mode
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePrintBarcodeForProduct(selectedProductDetails)}
                      disabled={isExecutingPrint}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Printer className={`w-4 h-4 ${isExecutingPrint ? 'animate-bounce' : ''}`} />
                      <span>{isExecutingPrint ? 'Executing Thermal Print...' : 'Print Barcode'}</span>
                    </button>

                    {printExecResult && (
                      <div className="bg-slate-950 text-slate-100 p-3.5 rounded-xl border border-slate-800 space-y-3 mt-2">
                        <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-2">
                          <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                            {printExecResult.success ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span>Print Successful</span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                <span>Print Execution Failed</span>
                              </>
                            )}
                          </span>
                          <span className={`font-mono font-extrabold uppercase px-2 py-0.5 rounded text-[10px] ${
                            printExecResult.success ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                            printExecResult.status === 'OFFLINE' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                            printExecResult.status === 'TIMEOUT' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                            'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {printExecResult.success ? '✓ PRINT COMPLETED' : printExecResult.status}
                          </span>
                        </div>

                        {/* METADATA GRID */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-mono border-t border-b border-slate-800 py-2">
                          <div><span className="text-slate-400">Print Status:</span> <strong className={printExecResult.success ? 'text-emerald-400' : 'text-rose-400'}>{printExecResult.success ? '✓ PRINT COMPLETED' : 'PRINT FAILED'}</strong></div>
                          <div><span className="text-slate-400">Printer Name:</span> <strong className="text-white truncate block">{printExecResult.printerName || 'MZ Thermal Printer ZD421'}</strong></div>
                          <div><span className="text-slate-400">Job ID:</span> <strong className="text-emerald-300">{printExecResult.jobId || 'N/A'}</strong></div>
                          <div><span className="text-slate-400">Spool Status:</span> <strong className="text-sky-300">{printExecResult.spoolStatus || 'spooled'}</strong></div>
                          <div><span className="text-slate-400">Copies:</span> <strong className="text-white">{printExecResult.copies || 1}</strong></div>
                          <div><span className="text-slate-400">Execution Time:</span> <strong className="text-sky-300">{printExecResult.executionTimeMs} ms</strong></div>
                          <div><span className="text-slate-400">Provider:</span> <strong className="text-white">{printExecResult.provider}</strong></div>
                          <div><span className="text-slate-400">Transport:</span> <strong className="text-emerald-400">{printExecResult.transport || 'LOCAL_HTTP'}</strong></div>
                          <div><span className="text-slate-400">Connector Ver:</span> <strong className="text-indigo-300">{printExecResult.connectorVersion || '1.3.0'}</strong></div>
                          <div><span className="text-slate-400">Protocol Ver:</span> <strong className="text-indigo-300">{printExecResult.protocolVersion || 'v1.0'}</strong></div>
                          <div className="col-span-2 truncate"><span className="text-slate-400">Request ID:</span> <strong className="text-slate-200">{printExecResult.requestId || 'REQ-PRINT-001'}</strong></div>
                          <div className="col-span-2 truncate"><span className="text-slate-400">Correlation ID:</span> <strong className="text-slate-200">{printExecResult.correlationId || 'CORR-PRINT-001'}</strong></div>
                        </div>

                        {/* ERROR & RETRY CONTROL */}
                        {!printExecResult.success && (
                          <div className="space-y-2 pt-1">
                            <div className="text-[10px] text-rose-300 bg-rose-950/70 p-2.5 rounded-lg border border-rose-800 space-y-1">
                              <div className="font-bold flex items-center gap-1.5 text-rose-200">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                {printExecResult.errorCode === 'PRINTER_OFFLINE' ? 'Printer Offline' :
                                 printExecResult.errorCode === 'PRINTER_NOT_FOUND' ? 'Printer Not Found' :
                                 printExecResult.errorCode === 'PAPER_OUT' ? 'Paper Out' :
                                 printExecResult.errorCode === 'SPOOLER_ERROR' ? 'Spooler Error' :
                                 printExecResult.status === 'OFFLINE' ? 'Connector Offline' :
                                 printExecResult.status === 'TIMEOUT' ? 'HTTP Request Timeout' :
                                 'Print Execution Failed'}
                              </div>
                              <p className="text-rose-300 text-[10px] leading-relaxed">
                                {printExecResult.errorMessage}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handlePrintBarcodeForProduct(selectedProductDetails)}
                              disabled={isExecutingPrint}
                              className="w-full py-1.5 px-3 bg-rose-900/50 hover:bg-rose-800/60 text-rose-200 border border-rose-700/50 text-[10px] font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3 h-3 ${isExecutingPrint ? 'animate-spin' : ''}`} />
                              <span>Retry Thermal Print</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* SPRINT 10.9 MULTI LABEL PRINTING */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 mt-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider block">
                          Enterprise Batch Dispatch
                        </span>
                        <span className="text-xs font-bold text-slate-900 block mt-0.5">
                          Multi Label Printing
                        </span>
                      </div>
                      <span className="text-[9px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Printer className="w-3 h-3 text-indigo-600" />
                        Batch Engine
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Quantity (Labels)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={multiPrintQuantity}
                          onChange={(e) => setMultiPrintQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          disabled={isMultiPrinting}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Copies per Label
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={multiPrintCopies}
                          onChange={(e) => setMultiPrintCopies(Math.max(1, parseInt(e.target.value) || 1))}
                          disabled={isMultiPrinting}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Label Template
                        </label>
                        <select
                          value={multiPrintTemplate}
                          onChange={(e) => setMultiPrintTemplate(e.target.value)}
                          disabled={isMultiPrinting}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        >
                          <option value="STD_PRODUCT_38X25MM">Standard Product Label (38x25 mm)</option>
                          <option value="COMPACT_PRICE_25X15MM">Compact Price Tag (25x15 mm)</option>
                          <option value="SHIPPING_TAG_50X30MM">Shipping Tag (50x30 mm)</option>
                          <option value="LARGE_PALLET_100X150MM">Large Pallet Label (100x150 mm)</option>
                        </select>
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Target Thermal Printer
                        </label>
                        <input
                          type="text"
                          value={multiPrintPrinter}
                          onChange={(e) => setMultiPrintPrinter(e.target.value)}
                          disabled={isMultiPrinting}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          placeholder="e.g. MZ Thermal Printer ZD421"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleBatchPrintBarcodeForProduct(selectedProductDetails)}
                        disabled={isMultiPrinting}
                        className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <Printer className={`w-4 h-4 ${isMultiPrinting ? 'animate-bounce' : ''}`} />
                        <span>{isMultiPrinting ? 'Printing Batch...' : `Print ${multiPrintQuantity} Labels`}</span>
                      </button>

                      {isMultiPrinting && (
                        <button
                          type="button"
                          onClick={handleCancelMultiPrint}
                          className="py-2.5 px-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    {multiPrintProgress && (
                      <div className="bg-slate-950 text-slate-100 p-3.5 rounded-xl border border-slate-800 space-y-3 mt-2">
                        <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-2">
                          <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                            {isMultiPrinting ? (
                              <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
                            ) : multiPrintProgress.failed === 0 && multiPrintProgress.skipped === 0 ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                            <span>{multiPrintProgress.statusMessage}</span>
                          </span>
                          <span className={`font-mono font-extrabold uppercase px-2 py-0.5 rounded text-[10px] ${
                            isMultiPrinting ? 'bg-indigo-950 text-indigo-400 border border-indigo-800' :
                            multiPrintProgress.failed === 0 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                            'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}>
                            {isMultiPrinting ? `${multiPrintProgress.current} / ${multiPrintProgress.total}` : 'BATCH COMPLETE'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-mono border-b border-slate-800 pb-2">
                          <div><span className="text-slate-400">Total Requested:</span> <strong className="text-white">{multiPrintProgress.total}</strong></div>
                          <div><span className="text-slate-400">Completed:</span> <strong className="text-emerald-400">{multiPrintProgress.completed}</strong></div>
                          <div><span className="text-slate-400">Failed:</span> <strong className={multiPrintProgress.failed > 0 ? 'text-rose-400' : 'text-slate-200'}>{multiPrintProgress.failed}</strong></div>
                          <div><span className="text-slate-400">Skipped:</span> <strong className={multiPrintProgress.skipped > 0 ? 'text-amber-400' : 'text-slate-200'}>{multiPrintProgress.skipped}</strong></div>
                          <div><span className="text-slate-400">Elapsed Time:</span> <strong className="text-sky-300">{((multiPrintProgress.endTime || Date.now()) - multiPrintProgress.startTime)} ms</strong></div>
                          <div><span className="text-slate-400">Last Job ID:</span> <strong className="text-indigo-300">{multiPrintProgress.lastJobId || 'N/A'}</strong></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* CARTON LABEL PRINTING CARD (Sprint 11.3) */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                        📦 Carton Label Printing
                      </h4>
                    </div>
                    <span className="text-[10px] font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                      Sprint 11.3 Standard
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Carton Quantity
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={cartonQuantity}
                          onChange={(e) => setCartonQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          disabled={isPrintingCarton}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          placeholder="e.g. 24"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Copies
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={cartonCopies}
                          onChange={(e) => setCartonCopies(Math.max(1, parseInt(e.target.value) || 1))}
                          disabled={isPrintingCarton}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Carton Number <span className="font-normal text-slate-400">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={cartonNumber}
                          onChange={(e) => setCartonNumber(e.target.value)}
                          disabled={isPrintingCarton}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          placeholder="e.g. CTN-01 or 1"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Total Cartons <span className="font-normal text-slate-400">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={totalCartons}
                          onChange={(e) => setTotalCartons(e.target.value)}
                          disabled={isPrintingCarton}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          placeholder="e.g. 10"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Label Template
                        </label>
                        <select
                          value={cartonTemplate}
                          onChange={(e) => setCartonTemplate(e.target.value)}
                          disabled={isPrintingCarton}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        >
                          <option value="STD_PRODUCT_38X25MM">Standard Product Label (38x25 mm)</option>
                          <option value="SHIPPING_TAG_50X30MM">Shipping Tag (50x30 mm)</option>
                          <option value="LARGE_PALLET_100X150MM">Large Pallet Label (100x150 mm)</option>
                        </select>
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Target Thermal Printer
                        </label>
                        <input
                          type="text"
                          value={cartonPrinter}
                          onChange={(e) => setCartonPrinter(e.target.value)}
                          disabled={isPrintingCarton}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          placeholder="e.g. MZ Thermal Printer ZD421"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handlePrintCartonLabelForProduct(selectedProductDetails)}
                        disabled={isPrintingCarton}
                        className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <Printer className={`w-4 h-4 ${isPrintingCarton ? 'animate-spin' : ''}`} />
                        <span>{isPrintingCarton ? 'Printing Carton Label...' : 'Print Carton Label'}</span>
                      </button>

                      {isPrintingCarton && (
                        <button
                          type="button"
                          onClick={() => setIsPrintingCarton(false)}
                          className="py-2.5 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    {cartonPrintResult && (
                      <div className="bg-slate-950 text-slate-100 p-3.5 rounded-xl border border-slate-800 space-y-2 mt-2">
                        <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-2">
                          <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                            {cartonPrintResult.success ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                            <span>{cartonPrintResult.success ? 'Carton Label Printed Successfully' : 'Carton Print Execution Failed'}</span>
                          </span>
                          <span className={`font-mono font-extrabold uppercase px-2 py-0.5 rounded text-[10px] ${
                            cartonPrintResult.success ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {cartonPrintResult.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono">
                          <div><span className="text-slate-400">Carton Qty:</span> <strong className="text-white">{cartonQuantity} {selectedProductDetails.unitCode || 'PCS'}</strong></div>
                          {cartonNumber && <div><span className="text-slate-400">Carton #:</span> <strong className="text-white">{cartonNumber}</strong></div>}
                          {totalCartons && <div><span className="text-slate-400">Total Cartons:</span> <strong className="text-white">{totalCartons}</strong></div>}
                          <div><span className="text-slate-400">Printer:</span> <strong className="text-indigo-300">{cartonPrintResult.printerName}</strong></div>
                          <div><span className="text-slate-400">Job ID:</span> <strong className="text-emerald-400">{cartonPrintResult.jobId || 'N/A'}</strong></div>
                          <div><span className="text-slate-400">Execution Time:</span> <strong className="text-sky-300">{cartonPrintResult.executionTimeMs} ms</strong></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* UNIT CONVERSION LABEL PRINTING CARD (Sprint 11.4) */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Scale className="w-4 h-4 text-emerald-600" />
                      <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                        ⚖️ Unit Conversion Label Printing
                      </h4>
                    </div>
                    <span className="text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Sprint 11.4 Standard
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
                    {/* Read-Only Product & Base Unit Info Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px]">
                      <div>
                        <span className="text-slate-400 block font-medium">Base Product</span>
                        <strong className="text-slate-800 font-mono">{selectedProductDetails.unitCode || selectedProductDetails.unitName || 'PCS'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Product Name</span>
                        <strong className="text-slate-800 truncate block">{selectedProductDetails.name}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">SKU</span>
                        <strong className="text-slate-800 font-mono">{selectedProductDetails.sku}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Barcode</span>
                        <strong className="text-slate-800 font-mono">{selectedProductDetails.barcode || selectedProductDetails.sku}</strong>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Conversion Unit
                        </label>
                        <select
                          value={unitConversionUnit}
                          onChange={(e) => setUnitConversionUnit(e.target.value)}
                          disabled={isPrintingUnitConversion}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        >
                          <option value="Piece">Piece (PCS)</option>
                          <option value="Box">Box (BOX)</option>
                          <option value="Pack">Pack (PACK)</option>
                          <option value="KG">KG (Kilogram)</option>
                          <option value="Gram">Gram (g)</option>
                          <option value="Liter">Liter (L)</option>
                          <option value="ML">ML (Milliliter)</option>
                          <option value="Carton">Carton (CTN)</option>
                          <option value="Bundle">Bundle (BDL)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Conversion Quantity
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={unitConversionQty}
                          onChange={(e) => setUnitConversionQty(Math.max(1, parseInt(e.target.value) || 1))}
                          disabled={isPrintingUnitConversion}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          placeholder="e.g. 10 or 25"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Copies
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={unitConversionCopies}
                          onChange={(e) => setUnitConversionCopies(Math.max(1, parseInt(e.target.value) || 1))}
                          disabled={isPrintingUnitConversion}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Label Template
                        </label>
                        <select
                          value={unitConversionTemplate}
                          onChange={(e) => setUnitConversionTemplate(e.target.value)}
                          disabled={isPrintingUnitConversion}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        >
                          <option value="STD_PRODUCT_38X25MM">Standard Product Label (38x25 mm)</option>
                          <option value="UNIT_CONVERSION_50X30MM">Unit Conversion Label (50x30 mm)</option>
                          <option value="LARGE_SHELF_100X50MM">Large Shelf Label (100x50 mm)</option>
                        </select>
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Target Thermal Printer
                        </label>
                        <input
                          type="text"
                          value={unitConversionPrinter}
                          onChange={(e) => setUnitConversionPrinter(e.target.value)}
                          disabled={isPrintingUnitConversion}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          placeholder="e.g. MZ Thermal Printer ZD421"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handlePrintUnitConversionLabelForProduct(selectedProductDetails)}
                        disabled={isPrintingUnitConversion}
                        className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <Printer className={`w-4 h-4 ${isPrintingUnitConversion ? 'animate-spin' : ''}`} />
                        <span>{isPrintingUnitConversion ? 'Printing Unit Label...' : 'Print Unit Label'}</span>
                      </button>

                      {isPrintingUnitConversion && (
                        <button
                          type="button"
                          onClick={() => setIsPrintingUnitConversion(false)}
                          className="py-2.5 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    {unitConversionPrintResult && (
                      <div className="bg-slate-950 text-slate-100 p-3.5 rounded-xl border border-slate-800 space-y-2 mt-2">
                        <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-2">
                          <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                            {unitConversionPrintResult.success ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                            <span>{unitConversionPrintResult.success ? 'Unit Conversion Label Printed Successfully' : 'Unit Label Print Execution Failed'}</span>
                          </span>
                          <span className={`font-mono font-extrabold uppercase px-2 py-0.5 rounded text-[10px] ${
                            unitConversionPrintResult.success ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {unitConversionPrintResult.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono">
                          <div><span className="text-slate-400">Conversion Unit:</span> <strong className="text-white">{unitConversionUnit}</strong></div>
                          <div><span className="text-slate-400">Conversion Qty:</span> <strong className="text-white">{unitConversionQty} {selectedProductDetails.unitCode || 'PCS'}</strong></div>
                          <div><span className="text-slate-400">Base Unit:</span> <strong className="text-slate-300">{selectedProductDetails.unitCode || 'PCS'}</strong></div>
                          <div><span className="text-slate-400">Printer:</span> <strong className="text-emerald-300">{unitConversionPrintResult.printerName}</strong></div>
                          <div><span className="text-slate-400">Job ID:</span> <strong className="text-emerald-400">{unitConversionPrintResult.jobId || 'N/A'}</strong></div>
                          <div><span className="text-slate-400">Execution Time:</span> <strong className="text-sky-300">{unitConversionPrintResult.executionTimeMs} ms</strong></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION 6: UNIT HIERARCHY */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Scale className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                        Enterprise Unit Hierarchy
                      </h4>
                    </div>
                    <span className="text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Sprint 4 Foundation
                    </span>
                  </div>

                  {/* Base Unit */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Base Unit (Primary Stock Unit)
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <UnitBadge unitCode={selectedProductDetails.unitCode || selectedProductDetails.unitName || 'PCS'} size="md" />
                        <span className="font-extrabold text-slate-800">
                          {selectedProductDetails.unitName || selectedProductDetails.unitCode || 'PCS'}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 italic bg-slate-50 px-2 py-1 rounded-lg">
                      1.00 Base Ratio
                    </span>
                  </div>

                  {/* Alternate Units & Conversion List */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      Alternate Unit Conversion List
                    </span>

                    {(() => {
                      const pConvs = allConversions.filter(
                        (c) => c.productId === selectedProductDetails.id
                      );

                      if (pConvs.length === 0) {
                        return (
                          <div className="p-3 bg-white rounded-xl border border-dashed border-slate-200 text-center text-slate-400 italic">
                            No alternate unit conversions configured for this product.
                          </div>
                        );
                      }

                      return (
                        <div className="divide-y divide-slate-100 bg-white rounded-xl border border-slate-200 overflow-hidden">
                          {pConvs.map((conv) => (
                            <div key={conv.id} className="p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <UnitBadge unitCode={conv.alternateUnitCode} size="sm" />
                                <div>
                                  <span className="font-bold text-slate-900 block">
                                    1 {conv.alternateUnitCode}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    Alternate Unit Ratio
                                  </span>
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="font-mono font-extrabold text-indigo-900 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded text-xs block">
                                  {formatConversionText(conv)}
                                </span>
                                <span className={`text-[9px] font-bold uppercase mt-0.5 inline-block ${
                                  conv.status === 'active' ? 'text-emerald-600' : 'text-amber-600'
                                }`}>
                                  Status: {conv.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Stock & Commercial Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Current Stock
                    </span>
                    <span className="text-base font-mono font-black text-slate-900 mt-0.5 block">
                      {selectedProductDetails.currentStock} {selectedProductDetails.unitCode || 'PCS'}
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Min Alert Threshold
                    </span>
                    <span className="text-base font-mono font-black text-slate-700 mt-0.5 block">
                      {selectedProductDetails.minimumStockAlert} {selectedProductDetails.unitCode || 'PCS'}
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Retail Selling Price
                    </span>
                    <span className="text-base font-mono font-black text-indigo-700 mt-0.5 block">
                      {formatCurrency(selectedProductDetails.sellingPrice)}
                    </span>
                  </div>

                  {permissions.viewProductCost !== false && (
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Purchase Cost
                      </span>
                      <span className="text-base font-mono font-black text-slate-700 mt-0.5 block">
                        {formatCurrency(selectedProductDetails.purchasePrice)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Location & Supplier Info */}
                {(selectedProductDetails.location || selectedProductDetails.supplierName) && (
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    {selectedProductDetails.location && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          Warehouse Location
                        </span>
                        <span className="font-semibold text-slate-800">
                          {selectedProductDetails.location}
                        </span>
                      </div>
                    )}
                    {selectedProductDetails.supplierName && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          Supplier
                        </span>
                        <span className="font-semibold text-slate-800">
                          {selectedProductDetails.supplierName} ({selectedProductDetails.supplierEmail || 'No Email'})
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    const prod = selectedProductDetails;
                    setSelectedProductDetails(null);
                    openForm(prod);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Product & Conversions</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedProductDetails(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
