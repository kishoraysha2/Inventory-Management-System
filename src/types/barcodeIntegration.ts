import { BarcodeType, BarcodeSource } from '../types';

export type IntegrationProviderMode = 'LOCAL' | 'CLOUD';

export interface BarcodeIntegrationSettings {
  provider: IntegrationProviderMode;
  connectionStatus: 'enabled' | 'disabled' | 'standby' | 'error';
  serverAddress: string;
  apiUrl: string;
  apiKey: string;
  timeoutMs: number;
  retryCount: number;
  autoSync: boolean;
  version: string;
  lastSync: string | null;
}

export const DEFAULT_BARCODE_SETTINGS: BarcodeIntegrationSettings = {
  provider: 'LOCAL',
  connectionStatus: 'enabled',
  serverAddress: 'http://127.0.0.1:9123',
  apiUrl: 'https://api.mzbarcodesuite.com/v1',
  apiKey: 'mz_live_************************',
  timeoutMs: 5000,
  retryCount: 3,
  autoSync: false,
  version: '7.0.0-Sprint7',
  lastSync: null,
};

export interface GenerateBarcodeRequest {
  productId: string;
  sku: string;
  barcode: string;
  barcodeType: BarcodeType;
  labelTemplate?: string;
  quantity: number;
  timestamp: string;
  source: BarcodeSource;
  version: number;
}

export interface PrintBarcodeRequest {
  productId: string;
  barcode: string;
  barcodeType: BarcodeType;
  copies: number;
  printerName?: string;
  labelTemplate?: string;
  timestamp: string;
  productName?: string;
}

export interface SyncBarcodeRequest {
  productId: string;
  sku: string;
  barcode: string;
  barcodeType: BarcodeType;
  syncMode: 'push' | 'pull' | 'bidirectional';
  timestamp: string;
  source: BarcodeSource;
}

export interface BarcodeResponseModel {
  success: boolean;
  provider: IntegrationProviderMode;
  operation: 'generate' | 'print' | 'sync' | 'health_check';
  message: string;
  payload?: any;
  timestamp: string;
  errorCode?: string;
}

export interface BarcodeHealthCheckResult {
  provider: IntegrationProviderMode;
  status: 'online' | 'offline' | 'standby';
  version: string;
  latencyMs: number;
  details: string;
}

export interface IBarcodeProvider {
  getProviderMode(): IntegrationProviderMode;
  healthCheck(): Promise<BarcodeHealthCheckResult>;
  prepareGenerateRequest(request: GenerateBarcodeRequest): GenerateBarcodeRequest;
  preparePrintRequest(request: PrintBarcodeRequest): PrintBarcodeRequest;
  prepareSyncRequest(request: SyncBarcodeRequest): SyncBarcodeRequest;
  validatePayload(payload: any): { isValid: boolean; errors?: string[] };
  executeGenerate(request: GenerateBarcodeRequest): Promise<BarcodeResponseModel>;
  executePrint(request: PrintBarcodeRequest): Promise<BarcodeResponseModel>;
  executeSync(request: SyncBarcodeRequest): Promise<BarcodeResponseModel>;
}
