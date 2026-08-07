import { ClientAuditLogEntry } from '../../../types/barcodeLocalClient';
import { BarcodeErrorCode } from '../../../types/barcodeProtocol';

export class ClientAuditLogger {
  private static instance: ClientAuditLogger | null = null;
  private logs: ClientAuditLogEntry[] = [];
  private maxBufferSize = 200;

  private constructor() {}

  public static getInstance(): ClientAuditLogger {
    if (!ClientAuditLogger.instance) {
      ClientAuditLogger.instance = new ClientAuditLogger();
    }
    return ClientAuditLogger.instance;
  }

  /**
   * Logs a client transaction without capturing sensitive barcode values or business data.
   */
  public logTransaction(
    endpoint: string,
    durationMs: number,
    status: 'SUCCESS' | 'FAILED',
    requestId: string,
    correlationId: string,
    errorCode?: BarcodeErrorCode | string
  ): ClientAuditLogEntry {
    const entry: ClientAuditLogEntry = {
      id: `CLIENT-LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      requestId: requestId || 'N/A',
      correlationId: correlationId || 'N/A',
      endpoint,
      durationMs,
      status,
      errorCode,
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxBufferSize) {
      this.logs = this.logs.slice(0, this.maxBufferSize);
    }

    return entry;
  }

  public getLogs(): ClientAuditLogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }
}
