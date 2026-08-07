import { BarcodeErrorCode } from './barcodeProtocol';

export type ClientConnectionState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'TIMEOUT'
  | 'FAILED'
  | 'RECONNECT_REQUIRED';

export interface LocalHTTPClientConfig {
  host: string;
  port: number;
  baseUrl: string;
  timeoutMs: number;
  retryCount: number;
}

export interface ClientAuditLogEntry {
  id: string;
  timestamp: string;
  requestId: string;
  correlationId: string;
  endpoint: string;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED';
  errorCode?: BarcodeErrorCode | string;
}

export interface ClientConnectionDiagnostics {
  state: ClientConnectionState;
  baseUrl: string;
  timeoutMs: number;
  lastConnectedAt: string | null;
  failedAttempts: number;
  reconnectState: {
    active: boolean;
    attempt: number;
    maxAttempts: number;
  };
}

export interface ValidateBarcodeRequestDTO {
  barcode: string;
  barcodeType?: string;
  sku?: string;
}

export interface ValidateBarcodeResponseDTO {
  isValid: boolean;
  barcode: string;
  barcodeType: string;
  checksumValid: boolean;
  error?: string;
}
