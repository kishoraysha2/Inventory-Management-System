import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
  CatalogProductDTO,
  CatalogCategoryDTO,
  CatalogBrandDTO,
  CatalogUnitDTO,
  CatalogWarehouseDTO,
} from '../../../types/barcodeProtocol';
import { INITIAL_PRODUCTS } from '../../../data';
import { INITIAL_UNITS } from '../../../data/defaultUnits';
import { Product } from '../../../types';

export class EnterpriseMasterCatalogConnectorService {
  private static instance: EnterpriseMasterCatalogConnectorService | null = null;
  private cachedProducts: Product[] = [];
  private cachedUnits: any[] = [];
  private isProductsSnapshotActive = false;

  private constructor() {
    this.initRealtimeListeners();
  }

  public static getInstance(): EnterpriseMasterCatalogConnectorService {
    if (!EnterpriseMasterCatalogConnectorService.instance) {
      EnterpriseMasterCatalogConnectorService.instance = new EnterpriseMasterCatalogConnectorService();
    }
    return EnterpriseMasterCatalogConnectorService.instance;
  }

  private initRealtimeListeners() {
    try {
      if (db) {
        onSnapshot(
          collection(db, 'products'),
          (snapshot) => {
            this.cachedProducts = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Product),
            }));
            this.isProductsSnapshotActive = true;
          },
          (err) => {
            console.warn('Firestore products listener warning:', err);
          }
        );

        onSnapshot(
          collection(db, 'units'),
          (snapshot) => {
            this.cachedUnits = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }));
          },
          (err) => {
            console.warn('Firestore units listener warning:', err);
          }
        );
      }
    } catch (err) {
      console.warn('Failed to attach Firestore realtime listeners:', err);
    }
  }

  /**
   * Retrieves ERP Master Products directly from live Firestore Master Database.
   * Format includes complete ERP Master metadata.
   */
  public async getProducts(requestId?: string, clientSource?: string): Promise<CatalogProductDTO[]> {
    const timestamp = new Date().toISOString();
    console.log(`[ENTERPRISE CATALOG DEBUG] [${timestamp}] Request received: GetProducts`);
    console.log(`[ENTERPRISE CATALOG DEBUG] RequestId: ${requestId || 'N/A'}`);
    console.log(`[ENTERPRISE CATALOG DEBUG] ClientSource: ${clientSource || 'N/A'}`);

    let rawProducts: Product[] = [];
    let firestoreFoundCount = 0;

    // Query live Firestore directly first
    try {
      if (db) {
        const snap = await getDocs(collection(db, 'products'));
        firestoreFoundCount = snap.docs.length;
        if (!snap.empty) {
          rawProducts = snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Product),
          }));
          this.cachedProducts = rawProducts;
          this.isProductsSnapshotActive = true;
        }
      }
    } catch (err) {
      console.warn('Firestore getDocs query failed, falling back to realtime cache/offline:', err);
    }

    // Fallback to active realtime snapshot cache if getDocs was empty/failed
    if (rawProducts.length === 0 && this.isProductsSnapshotActive && this.cachedProducts.length > 0) {
      rawProducts = this.cachedProducts;
      firestoreFoundCount = rawProducts.length;
    }

    // Fallback to INITIAL_PRODUCTS ONLY if explicitly running in offline demo mode and Firestore returned no data
    if (rawProducts.length === 0 && typeof localStorage !== 'undefined' && localStorage.getItem('offline_demo_mode') === 'true') {
      rawProducts = INITIAL_PRODUCTS;
    }

    const resultDTOs = this.mapProductsToDTO(rawProducts);

    console.log(`[ENTERPRISE CATALOG DEBUG] Number of Firestore products found: ${firestoreFoundCount}`);
    console.log(`[ENTERPRISE CATALOG DEBUG] Number of products returned: ${resultDTOs.length}`);

    return resultDTOs;
  }

  /**
   * Synchronous accessor for callers requiring non-async returns.
   * Returns cached live Firestore products.
   */
  public getProductsSync(): CatalogProductDTO[] {
    let rawProducts: Product[] = this.cachedProducts;

    if (rawProducts.length === 0 && typeof localStorage !== 'undefined' && localStorage.getItem('offline_demo_mode') === 'true') {
      rawProducts = INITIAL_PRODUCTS;
    }

    return this.mapProductsToDTO(rawProducts);
  }

  private mapProductsToDTO(products: Product[]): CatalogProductDTO[] {
    return products.map((p) => {
      const cat = p.category || 'General';
      const br = p.brand || 'Generic';
      const uCode = p.unitCode || p.unitName || 'PCS';
      const uName = p.unitName || p.unitCode || 'PCS';
      const whName = p.location || 'Main Warehouse';
      const whId = p.location ? `wh-${p.location.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : 'WH-MAIN';

      return {
        id: p.id || `prod-${p.sku}`,
        name: p.name || '',
        sku: p.sku || '',
        barcode: p.barcode || p.sku || '',
        barcodeType: p.barcodeType || 'CODE128',
        category: cat,
        categoryName: cat,
        brand: br,
        brandName: br,
        unit: uCode,
        unitName: uName,
        warehouse: whId,
        warehouseName: whName,
        purchasePrice: p.purchasePrice ?? 0,
        sellingPrice: p.sellingPrice ?? 0,
        currentStock: p.currentStock ?? 0,
        minimumStockAlert: p.minimumStockAlert ?? 0,
        isActive: p.status !== 'inactive',
      };
    });
  }

  /**
   * Retrieves ERP Category Master from ERP Master Database.
   */
  public async getCategories(): Promise<CatalogCategoryDTO[]> {
    const products = await this.getProducts();
    const categorySet = new Set<string>();

    products.forEach((p) => {
      if (p.category) categorySet.add(p.category);
    });

    // Default system categories
    const defaults = ['Grocery', 'Electronics', 'Apparel', 'Footwear', 'Furniture', 'Accessories', 'Hardware'];
    defaults.forEach((c) => categorySet.add(c));

    return Array.from(categorySet).map((catName) => ({
      id: `cat-${catName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      name: catName,
      code: catName.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
    }));
  }

  /**
   * Retrieves ERP Brand Master from ERP Master Database.
   */
  public async getBrands(): Promise<CatalogBrandDTO[]> {
    const products = await this.getProducts();
    const brandSet = new Set<string>();

    products.forEach((p) => {
      if (p.brand) brandSet.add(p.brand);
    });

    const defaults = ['GrainMaster', 'Apple', 'Nike', 'Samsung', 'Sony', 'LG', 'Generic'];
    defaults.forEach((b) => brandSet.add(b));

    return Array.from(brandSet).map((brandName) => ({
      id: `brand-${brandName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      name: brandName,
      code: brandName.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
    }));
  }

  /**
   * Retrieves ERP Unit Master from ERP Master Database.
   */
  public async getUnits(): Promise<CatalogUnitDTO[]> {
    let rawUnits: any[] = [];

    try {
      if (db) {
        const snap = await getDocs(collection(db, 'units'));
        if (!snap.empty) {
          rawUnits = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          this.cachedUnits = rawUnits;
        }
      }
    } catch (err) {
      console.warn('Firestore units query failed:', err);
    }

    if (rawUnits.length === 0 && this.cachedUnits.length > 0) {
      rawUnits = this.cachedUnits;
    }

    if (rawUnits.length === 0 && typeof localStorage !== 'undefined' && localStorage.getItem('offline_demo_mode') === 'true') {
      rawUnits = INITIAL_UNITS as any[];
    }

    const unitMap = new Map<string, CatalogUnitDTO>();

    rawUnits.forEach((u) => {
      const code = u.code || u.symbol || u.unitCode || u.name || 'PCS';
      const name = u.name || u.unitName || code;
      const id = u.id || `unit-${code.toLowerCase()}`;
      unitMap.set(code.toUpperCase(), { id, name, code: code.toUpperCase() });
    });

    if (!unitMap.has('KG')) {
      unitMap.set('KG', { id: 'unit-kg', name: 'KG', code: 'KG' });
    }
    if (!unitMap.has('PCS')) {
      unitMap.set('PCS', { id: 'unit-pcs', name: 'PCS', code: 'PCS' });
    }

    return Array.from(unitMap.values());
  }

  /**
   * Retrieves ERP Warehouse Master from ERP Master Database.
   */
  public async getWarehouses(): Promise<CatalogWarehouseDTO[]> {
    const products = await this.getProducts();
    const warehouseMap = new Map<string, CatalogWarehouseDTO>();

    // Standard main warehouse
    warehouseMap.set('WH-MAIN', {
      id: 'wh-main',
      name: 'Main Warehouse',
      code: 'WH-MAIN',
    });

    products.forEach((p) => {
      if (p.warehouseName && p.warehouseName !== 'Main Warehouse') {
        const id = p.warehouse || `wh-${p.warehouseName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        const code = id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        warehouseMap.set(id, {
          id,
          name: p.warehouseName,
          code,
        });
      }
    });

    return Array.from(warehouseMap.values());
  }
}
