import { BarcodeType } from '../types';

export type BarcodeExecutionStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'DEGRADED_WEB'
  | 'SECURITY_REJECTED'
  | 'INVALID_RESPONSE'
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'PROTOCOL_MISMATCH';

export interface BarcodeBusinessContext {
  product?: {
    id?: string;
    name?: string;
    sku?: string;
    barcode?: string;
    barcodeType?: string;
    category?: string;
    brand?: string;
    unit?: string;
    location?: string;
  };
  warehouse?: {
    warehouseId?: string;
    warehouseName?: string;
    location?: string;
  };
  supplier?: {
    supplierId?: string;
    supplierName?: string;
    purchaseOrderNumber?: string;
  };
  customer?: {
    customerId?: string;
    customerName?: string;
  };
  sales?: {
    invoiceNumber?: string;
  };
  user?: {
    userName?: string;
    role?: string;
  };
  requestedTemplate?: string;
  [key: string]: any;
}

export interface BarcodeExecutionParams {
  productId?: string;
  sku: string;
  barcodeValue?: string;
  barcodeType?: BarcodeType;
  quantity?: number;
  labelTemplateId?: string;
  correlationId?: string;
  context?: BarcodeBusinessContext;
}

export interface BarcodeExecutionResult {
  success: boolean;
  barcodeValue: string;
  barcodeType: BarcodeType;
  imageDataUrl?: string;
  executionTimeMs: number;
  provider: string;
  transport?: string;
  connectorVersion?: string;
  protocolVersion?: string;
  connectionStatus?: string;
  status: BarcodeExecutionStatus;
  errorMessage?: string;
  timestamp: string;
  requestId?: string;
  correlationId?: string;
  checksumValid?: boolean;
  errorCode?: string;
}

export interface BarcodeExecutionHistoryItem {
  id: string;
  timestamp: string;
  productSku: string;
  barcodeValue: string;
  barcodeType: string;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED' | 'DEGRADED_WEB';
  provider: string;
  errorMessage?: string;
  labelType?: string;
  cartonQuantity?: number;
  cartonNumber?: string | number;
  totalCartons?: string | number;
  conversionUnit?: string;
  conversionQuantity?: number;
  baseUnit?: string;
  originSource?: string;
  context?: BarcodeBusinessContext;
  requestedTemplate?: string;
  resolvedTemplate?: string;
  resolutionRule?: string;
}

export interface BarcodeExecutionDiagnostics {
  executionCount: number;
  successCount: number;
  failureCount: number;
  averageExecutionTimeMs: number;
  totalExecutionTimeMs: number;
  lastExecution: BarcodeExecutionHistoryItem | null;
}

export interface BarcodePrintExecutionParams {
  productId?: string;
  sku: string;
  productName?: string;
  barcodeValue?: string;
  barcodeType?: BarcodeType;
  printerName?: string;
  labelTemplateId?: string;
  copies?: number;
  labelWidthMm?: number;
  labelHeightMm?: number;
  rotation?: number;
  printDensity?: number;
  correlationId?: string;
  labelType?: string;
  cartonQuantity?: number;
  cartonNumber?: string | number;
  totalCartons?: string | number;
  conversionUnit?: string;
  conversionQuantity?: number;
  baseUnit?: string;
  category?: string;
  categoryName?: string;
  brand?: string;
  brandName?: string;
  unit?: string;
  unitName?: string;
  warehouse?: string;
  warehouseName?: string;
  originSource?: string;
  context?: BarcodeBusinessContext;
}

export interface BarcodePrintExecutionResult {
  success: boolean;
  barcodeValue: string;
  barcodeType: BarcodeType;
  printerName?: string;
  jobId?: string;
  copies?: number;
  spoolStatus?: string;
  executionTimeMs: number;
  provider: string;
  transport?: string;
  connectorVersion?: string;
  protocolVersion?: string;
  connectionStatus?: string;
  status: BarcodeExecutionStatus;
  errorMessage?: string;
  timestamp: string;
  requestId?: string;
  correlationId?: string;
  checksumValid?: boolean;
  errorCode?: string;
  requestedTemplate?: string;
  resolvedTemplate?: string;
  resolutionRule?: string;
}
