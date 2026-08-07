import { BarcodeMessageEnvelope, BarcodeProtocolResponse, TransportType } from './barcodeProtocol';

export type RuntimeEnvironment = 'DESKTOP' | 'WEB';

export type TransportConnectionState =
  | 'NOT_INITIALIZED'
  | 'INITIALIZING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'FAILED'
  | 'RECONNECTING';

export interface TransportLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  event: string;
  message: string;
  details?: any;
}

export interface IBarcodeTransport {
  getTransportType(): TransportType | 'ELECTRON_IPC' | 'LOCAL_HTTP' | 'NAMED_PIPES';
  isAvailable(): boolean;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  send<TReq = any, TRes = any>(
    envelope: BarcodeMessageEnvelope<TReq>
  ): Promise<BarcodeProtocolResponse<TRes>>;
  ping(): Promise<number>;
}
