import { IntegrationProviderMode } from './barcodeIntegration';
import { TransportType } from './barcodeProtocol';

export type RuntimeConnectorState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'WAITING'
  | 'FAILED'
  | 'RETRYING'
  | 'DEGRADED'
  | 'OFFLINE';

export interface RuntimeConnectorStatus {
  provider: IntegrationProviderMode;
  providerStatus: 'ACTIVE' | 'STANDBY';
  transport: TransportType | 'LOCAL_HTTP' | 'CLOUD_REST';
  serverAddress: string;
  protocolVersion: string;
  connectorState: RuntimeConnectorState;
  isReady: boolean;
  connectorVersion: string | null;
  latencyMs: number;
  capabilityCount: number;
  supportedCapabilities: string[];
  lastPingAt: string | null;
  lastHealthCheckAt: string | null;
  autoRecoveryCount: number;
  retryAttempts: number;
}

export interface RuntimeSyncLogEntry {
  id: string;
  timestamp: string;
  requestId: string;
  correlationId: string;
  operation: string;
  status: 'SUCCESS' | 'FAILED' | 'RETRYING';
  durationMs: number;
  provider: IntegrationProviderMode;
  transport: string;
}
