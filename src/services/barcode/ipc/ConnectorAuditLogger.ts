import { ConnectorAuditLogEntry } from '../../../types/barcodeConnectorHost';
import { BarcodeOperation, BarcodeErrorCode } from '../../../types/barcodeProtocol';

export class ConnectorAuditLogger {
  private static instance: ConnectorAuditLogger | null = null;
  private logBuffer: ConnectorAuditLogEntry[] = [];
  private maxBufferSize = 200;

  private constructor() {}

  public static getInstance(): ConnectorAuditLogger {
    if (!ConnectorAuditLogger.instance) {
      ConnectorAuditLogger.instance = new ConnectorAuditLogger();
    }
    return ConnectorAuditLogger.instance;
  }

  /**
   * Records transaction metrics.
   * STRICT SECURITY RULE: Never record business or customer information.
   */
  public logTransaction(
    operation: BarcodeOperation | string,
    latencyMs: number,
    result: 'SUCCESS' | 'FAILED',
    requestId: string,
    errorCode?: BarcodeErrorCode | string,
    transport: 'IPC' | 'PIPES' | 'REST' | 'WS' | 'TCP' = 'IPC'
  ): ConnectorAuditLogEntry {
    const entry: ConnectorAuditLogEntry = {
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      operation,
      latencyMs,
      transport,
      result,
      errorCode,
      requestId,
    };

    this.logBuffer.unshift(entry);

    // Maintain ring buffer limit
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(0, this.maxBufferSize);
    }

    return entry;
  }

  public getLogs(): ConnectorAuditLogEntry[] {
    return [...this.logBuffer];
  }

  public clearLogs(): void {
    this.logBuffer = [];
  }

  public getMetrics() {
    const total = this.logBuffer.length;
    const successes = this.logBuffer.filter((l) => l.result === 'SUCCESS').length;
    const failures = this.logBuffer.filter((l) => l.result === 'FAILED').length;
    const avgLatency = total > 0 ? Math.round(this.logBuffer.reduce((acc, l) => acc + l.latencyMs, 0) / total) : 0;

    return {
      totalTransactions: total,
      successes,
      failures,
      avgLatencyMs: avgLatency,
      successRatePct: total > 0 ? Math.round((successes / total) * 100) : 100,
    };
  }
}
