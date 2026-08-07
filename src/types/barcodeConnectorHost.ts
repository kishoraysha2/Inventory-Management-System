import {
  BarcodeOperation,
  BarcodeErrorCode,
} from './barcodeProtocol';
import { BarcodeType } from '../types';

export type HostLicenseState = 'VALID' | 'EXPIRED' | 'TRIAL' | 'INVALID';

export interface ConnectorHostHealth {
  connectorReady: boolean;
  connectorVersion: string;
  protocolVersion: string;
  licenseState: HostLicenseState;
  provider: 'LOCAL';
  activeTransport: 'IPC';
  supportedBarcodeTypes: BarcodeType[];
  supportedLabelTemplates: string[];
  supportedPrinterTypes: string[];
  processedRequestsCount: number;
  uptimeSeconds: number;
  timestamp: string;
}

export interface ConnectorAuditLogEntry {
  id: string;
  timestamp: string;
  operation: BarcodeOperation | string;
  latencyMs: number;
  transport: 'IPC' | 'PIPES' | 'REST' | 'WS' | 'TCP';
  result: 'SUCCESS' | 'FAILED';
  errorCode?: BarcodeErrorCode | string;
  requestId: string;
}

export interface ConnectorHostConfig {
  maxRequestIdCacheSize?: number;
  maxAuditLogBufferSize?: number;
  enforceChecksum?: boolean;
}
