import {
  BarcodeOperation,
  BarcodeProtocolResponse,
  BarcodeMessageEnvelope,
  BarcodeErrorCode,
} from './barcodeProtocol';

export type RetryStrategyMode = 'NONE' | 'IMMEDIATE' | 'EXPONENTIAL';

export interface CommandRetryPolicy {
  mode: RetryStrategyMode;
  maxAttempts: number;
  initialDelayMs: number;
  backoffFactor: number;
}

export type CommandPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface QueuedCommandItem<T = any> {
  id: string;
  operation: BarcodeOperation;
  payload: T;
  priority: CommandPriority;
  queuedAt: string;
  correlationId?: string;
  retryPolicy?: CommandRetryPolicy;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

export interface GatewayTelemetryModel {
  commandsSent: number;
  commandsCompleted: number;
  commandsFailed: number;
  totalLatencyMs: number;
  averageLatencyMs: number;
  lastCommand: {
    operation: BarcodeOperation;
    requestId: string;
    timestamp: string;
  } | null;
  lastResponse: {
    success: boolean;
    durationMs: number;
    timestamp: string;
    errorCode?: BarcodeErrorCode;
  } | null;
}
