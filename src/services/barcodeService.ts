import { Product, BarcodeType, BarcodeStatus, BarcodeSource } from '../types';

export interface BarcodeValidationResult {
  isValid: boolean;
  error?: string;
  normalizedValue?: string;
}

export interface MZBarcodeSyncPayload {
  productId: string;
  sku: string;
  barcode: string;
  barcodeType: BarcodeType;
  source: BarcodeSource;
  requestedBy?: string;
}

export interface MZBarcodeSyncResult {
  success: boolean;
  message: string;
  syncedBarcode?: string;
  syncedAt?: string;
}

export class BarcodeService {
  /**
   * Normalizes barcode string by removing leading/trailing spaces and converting to uppercase.
   */
  static normalizeBarcode(barcode?: string | null): string {
    if (!barcode) return '';
    return barcode.trim().toUpperCase();
  }

  /**
   * Validates format of the barcode according to specified type.
   */
  static validateFormat(barcode: string, type: BarcodeType): { isValid: boolean; error?: string } {
    const trimmed = barcode.trim();
    if (!trimmed) {
      return { isValid: false, error: 'Barcode value cannot be empty or only spaces.' };
    }

    switch (type) {
      case 'CODE128':
        // ASCII printable characters (space to ~)
        if (!/^[\x20-\x7E]+$/.test(trimmed)) {
          return { isValid: false, error: 'Code 128 must contain only standard ASCII characters.' };
        }
        if (trimmed.length > 80) {
          return { isValid: false, error: 'Code 128 length must be 80 characters or fewer.' };
        }
        break;

      case 'EAN13':
        if (!/^\d{13}$/.test(trimmed)) {
          return { isValid: false, error: 'EAN-13 barcode must consist of exactly 13 numeric digits.' };
        }
        break;

      case 'EAN8':
        if (!/^\d{8}$/.test(trimmed)) {
          return { isValid: false, error: 'EAN-8 barcode must consist of exactly 8 numeric digits.' };
        }
        break;

      case 'UPCA':
        if (!/^\d{12}$/.test(trimmed)) {
          return { isValid: false, error: 'UPC-A barcode must consist of exactly 12 numeric digits.' };
        }
        break;

      case 'UPCE':
        if (!/^\d{8}$/.test(trimmed)) {
          return { isValid: false, error: 'UPC-E barcode must consist of exactly 8 numeric digits.' };
        }
        break;

      case 'QR_CODE':
        if (trimmed.length < 1 || trimmed.length > 500) {
          return { isValid: false, error: 'QR Code payload length must be between 1 and 500 characters.' };
        }
        break;

      case 'DATA_MATRIX':
        if (trimmed.length < 1 || trimmed.length > 500) {
          return { isValid: false, error: 'Data Matrix payload length must be between 1 and 500 characters.' };
        }
        break;

      default:
        return { isValid: false, error: `Invalid barcode type: ${type}` };
    }

    return { isValid: true };
  }

  /**
   * Checks if barcode value is already assigned to another product.
   */
  static isDuplicateBarcode(
    barcode: string,
    currentProductId?: string | null,
    existingProducts: Product[] = []
  ): boolean {
    const normalized = this.normalizeBarcode(barcode);
    if (!normalized) return false;

    return existingProducts.some((p) => {
      if (currentProductId && p.id === currentProductId) return false;
      if (!p.barcode) return false;
      return this.normalizeBarcode(p.barcode) === normalized;
    });
  }

  /**
   * Comprehensive validation combining format check and duplicate detection.
   */
  static validateBarcode(
    barcode: string,
    type: BarcodeType,
    currentProductId?: string | null,
    existingProducts: Product[] = []
  ): BarcodeValidationResult {
    const normalized = this.normalizeBarcode(barcode);
    if (!normalized) {
      return { isValid: true, normalizedValue: '' };
    }

    const formatResult = this.validateFormat(barcode, type);
    if (!formatResult.isValid) {
      return { isValid: false, error: formatResult.error };
    }

    if (this.isDuplicateBarcode(barcode, currentProductId, existingProducts)) {
      return {
        isValid: false,
        error: `Barcode "${normalized}" is already assigned to another product in the catalog.`,
      };
    }

    return { isValid: true, normalizedValue: normalized };
  }

  /**
   * MZ Barcode Suite Integration Placeholder Interface
   * Allows future auto-generation and sync without runtime execution.
   */
  static prepareMZSuiteSyncPayload(product: Product): MZBarcodeSyncPayload {
    return {
      productId: product.id,
      sku: product.sku,
      barcode: product.barcode || '',
      barcodeType: product.barcodeType || 'CODE128',
      source: product.barcodeSource || 'mz_suite',
      requestedBy: 'Nexus ERP Sync Engine',
    };
  }

  /**
   * Future auto-generation simulation helper for UI placeholders.
   */
  static generatePlaceholderBarcode(sku: string, type: BarcodeType = 'CODE128'): { barcode: string; type: BarcodeType } {
    const cleanSku = sku.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    let code = '';
    
    switch (type) {
      case 'EAN13':
        // Generate pseudo 13-digit number
        code = '200' + Math.floor(100000500000 + Math.random() * 89999900000).toString().slice(0, 10);
        break;
      case 'EAN8':
        code = '20' + Math.floor(100005 + Math.random() * 899990).toString().slice(0, 6);
        break;
      case 'UPCA':
        code = '0' + Math.floor(10000050000 + Math.random() * 8999990000).toString().slice(0, 11);
        break;
      case 'UPCE':
        code = '0' + Math.floor(100005 + Math.random() * 899990).toString().slice(0, 7);
        break;
      case 'QR_CODE':
      case 'DATA_MATRIX':
        code = `NEXUS-BC-${cleanSku || 'ITEM'}-${Date.now().toString().slice(-6)}`;
        break;
      case 'CODE128':
      default:
        code = `BC-${cleanSku || 'ITEM'}-${Math.floor(1000 + Math.random() * 9000)}`;
        break;
    }

    return { barcode: code, type };
  }
}
