import { BarcodeType, BarcodeSource } from '../types';

// ============================================================================
// SECTION 1: PROTOCOL VERSIONING & COMPATIBILITY CONTRACT
// ============================================================================
export const CURRENT_PROTOCOL_VERSION = '1.0.0';
export const MINIMUM_PROTOCOL_VERSION = '1.0.0';
export const MAXIMUM_PROTOCOL_VERSION = '1.5.0';
export const SUPPORTED_PROTOCOL_VERSIONS = ['1.0.0', '1.1.0', '1.2.0', '1.5.0'];

export interface ProtocolVersionNegotiation {
  clientVersion: string;
  serverVersion: string;
  agreedVersion: string;
  isCompatible: boolean;
  supportedVersions: string[];
}

// ============================================================================
// SECTION 2 & 3: OPERATIONS & COMMUNICATION ENVELOPE
// ============================================================================
export type BarcodeOperation =
  | 'HealthCheck'
  | 'GenerateBarcode'
  | 'PrintBarcode'
  | 'SyncBarcode'
  | 'GetTemplates'
  | 'GetPrinters'
  | 'GetCapabilities'
  | 'Ping'
  | 'GetProducts'
  | 'GetCategories'
  | 'GetBrands'
  | 'GetUnits'
  | 'GetWarehouses'
  | 'INVENTORY:GetProducts'
  | 'INVENTORY:GetCategories'
  | 'INVENTORY:GetBrands'
  | 'INVENTORY:GetUnits'
  | 'INVENTORY:GetWarehouses'
  | (string & {});

export type TransportType = 'IPC' | 'PIPES' | 'REST' | 'WS' | 'TCP';

export interface BarcodeMessageMetadata {
  transportType?: TransportType;
  // Security placeholders (Section 13)
  authToken?: string;
  digitalSignature?: string;
  checksum?: string;
  nonce?: string;
  validatedAt?: string;
  batchSize?: number;
}

export interface BarcodeMessageEnvelope<T = any> {
  protocolVersion: string;
  requestId: string;
  correlationId: string;
  timestamp: string;
  sender: string; // e.g. 'NexusERP'
  receiver: string; // e.g. 'MZBarcodeSuite'
  operation: BarcodeOperation;
  payload: T;
  metadata: BarcodeMessageMetadata;
  targetDomain?: string;
  action?: string;
  clientSource?: string;
}

// ============================================================================
// SECTION 4 & 5: RESPONSE MODEL & STANDARD ERROR CODES
// ============================================================================
export type BarcodeErrorCode =
  | 'NO_PROVIDER'
  | 'INVALID_PROTOCOL'
  | 'INVALID_PAYLOAD'
  | 'INVALID_BARCODE'
  | 'INVALID_TEMPLATE'
  | 'PRINTER_NOT_FOUND'
  | 'TIMEOUT'
  | 'LICENSE_INVALID'
  | 'NOT_SUPPORTED'
  | 'UNKNOWN_ERROR'
  | 'DESKTOP_NOT_INSTALLED'
  | 'DESKTOP_OFFLINE'
  | 'IPC_FAILURE'
  | 'CONNECTOR_MISSING'
  | 'PROTOCOL_MISMATCH'
  | 'CHECKSUM_FAILURE'
  | 'PROVIDER_OFFLINE'
  | 'CONNECTOR_OFFLINE'
  | 'HTTP_TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'SERVER_ERROR';

export interface BarcodeProtocolResponse<T = any> {
  success: boolean;
  status?: string;
  message?: string;
  data?: T;
  errorCode?: BarcodeErrorCode;
  errorMessage?: string;
  provider: 'LOCAL' | 'CLOUD';
  durationMs: number;
  payload?: T;
  protocolVersion: string;
  requestId: string;
  timestamp: string;
}

// ============================================================================
// SECTION 6: CAPABILITY DISCOVERY MODEL
// ============================================================================
export interface CapabilityResponseDTO {
  supportedBarcodeTypes: BarcodeType[];
  supportedLabelSizes: string[];
  supportedPrinters: string[];
  supportedDPI: number[];
  supportsQR: boolean;
  supportsDataMatrix: boolean;
  supportsPDF417: boolean;
  supportsUSBScanner: boolean;
  supportsCamera: boolean;
  supportsBatchPrinting: boolean;
  supportsPreview: boolean;
  version: string;
  maxBatchSize: number;
}

// ============================================================================
// SECTION 8: TIMEOUT & RETRY POLICY MODEL
// ============================================================================
export interface BarcodeTimeoutPolicy {
  healthCheckMs: number; // Default 2000ms
  generateMs: number;    // Default 5000ms
  printMs: number;       // Default 10000ms
  syncMs: number;        // Default 15000ms
  pingMs: number;        // Default 1000ms
  maxRetries: number;    // Default 3
  backoffFactorMs: number; // Default 500ms
}

export const DEFAULT_TIMEOUT_POLICY: BarcodeTimeoutPolicy = {
  healthCheckMs: 2000,
  generateMs: 5000,
  printMs: 10000,
  syncMs: 15000,
  pingMs: 1000,
  maxRetries: 3,
  backoffFactorMs: 500,
};

// ============================================================================
// SECTION 9: COMMUNICATION STATES
// ============================================================================
export type BarcodeCommunicationState =
  | 'READY'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'BUSY'
  | 'SYNCING'
  | 'DISCONNECTED'
  | 'ERROR';

// ============================================================================
// SECTION 10: DIAGNOSTIC MODEL
// ============================================================================
export interface BarcodeDiagnosticModel {
  lastError: {
    code: BarcodeErrorCode;
    message: string;
    timestamp: string;
  } | null;
  lastSuccess: {
    operation: BarcodeOperation;
    timestamp: string;
  } | null;
  lastRequest: {
    requestId: string;
    operation: BarcodeOperation;
    timestamp: string;
  } | null;
  latencyMs: number;
  retryCount: number;
  heartbeatTime: string;
  communicationState: BarcodeCommunicationState;
}

// ============================================================================
// SECTION 12: SHARED DTO MODELS
// ============================================================================

export interface HealthCheckRequestDTO {
  pingTime: string;
  includeDiagnostics?: boolean;
}

export interface HealthCheckResponseDTO {
  status: 'online' | 'offline' | 'standby';
  version: string;
  latencyMs: number;
  details: string;
}

export interface GenerateBarcodeRequestDTO {
  productId: string;
  sku: string;
  barcode: string;
  barcodeType: BarcodeType;
  labelTemplate?: string;
  quantity: number;
  timestamp: string;
  source: BarcodeSource;
  version: number;
  bulkItems?: Array<{ productId: string; barcode: string; sku: string }>;
}

export interface GenerateBarcodeResponseDTO {
  barcodeValue: string;
  barcodeType: BarcodeType;
  renderedFormat?: string; // e.g. SVG or Base64 (Sprint 9+)
  generatedAt: string;
  status: 'success' | 'queued' | 'staged';
}

export interface PrintBarcodeRequestDTO {
  productId: string;
  barcode: string;
  barcodeType: BarcodeType;
  copies: number;
  printerName?: string;
  labelTemplate?: string;
  timestamp: string;
  batchPrinting?: boolean;
  productName?: string;
  sku?: string;
  category?: string;
  categoryName?: string;
  brand?: string;
  brandName?: string;
  unit?: string;
  unitName?: string;
  warehouse?: string;
  warehouseName?: string;
  originSource?: string;
  context?: any;
}

export interface PrintBarcodeResponseDTO {
  jobId: string;
  copies: number;
  printerName: string;
  spoolStatus: 'prepared' | 'queued' | 'spooled';
  timestamp: string;
}

export interface SyncRequestDTO {
  productId: string;
  sku: string;
  barcode: string;
  barcodeType: BarcodeType;
  syncMode: 'push' | 'pull' | 'bidirectional';
  timestamp: string;
  source: BarcodeSource;
}

export interface SyncResponseDTO {
  syncId: string;
  syncMode: string;
  itemsSynced: number;
  timestamp: string;
  status: 'synchronized' | 'staged';
}

export interface GetTemplatesRequestDTO {
  category?: string;
}

export interface GetTemplatesResponseDTO {
  templates: Array<{
    id: string;
    name: string;
    widthMm: number;
    heightMm: number;
    isDefault: boolean;
  }>;
}

export interface GetPrintersRequestDTO {
  includeOffline?: boolean;
}

export interface GetPrintersResponseDTO {
  printers: Array<{
    name: string;
    isDefault: boolean;
    status: 'ready' | 'offline' | 'busy';
    supportedDpi: number[];
  }>;
}

export interface PingRequestDTO {
  sentAt: string;
}

export interface PingResponseDTO {
  receivedAt: string;
  roundtripMs: number;
}

export interface ErrorResponseDTO {
  errorCode: BarcodeErrorCode;
  errorMessage: string;
  details?: string;
  timestamp: string;
}

// ============================================================================
// ENTERPRISE MASTER CATALOG DTOs
// ============================================================================
export interface CatalogProductDTO {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  barcodeType?: string;
  category: string;
  categoryName: string;
  brand: string;
  brandName: string;
  unit: string;
  unitName: string;
  warehouse: string;
  warehouseName: string;
  purchasePrice?: number;
  sellingPrice?: number;
  currentStock?: number;
  minimumStockAlert?: number;
  isActive: boolean;
}

export interface CatalogCategoryDTO {
  id: string;
  name: string;
  code: string;
}

export interface CatalogBrandDTO {
  id: string;
  name: string;
  code: string;
}

export interface CatalogUnitDTO {
  id: string;
  name: string;
  code: string;
}

export interface CatalogWarehouseDTO {
  id: string;
  name: string;
  code: string;
}

