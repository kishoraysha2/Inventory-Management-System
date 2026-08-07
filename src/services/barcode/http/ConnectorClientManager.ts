import {
  ClientConnectionState,
  ClientConnectionDiagnostics,
} from '../../../types/barcodeLocalClient';
import { LocalBarcodeHTTPClient } from './LocalBarcodeHTTPClient';
import { ClientAuditLogger } from './ClientAuditLogger';

export class ConnectorClientManager {
  private static instance: ConnectorClientManager | null = null;

  private httpClient: LocalBarcodeHTTPClient;
  private state: ClientConnectionState = 'DISCONNECTED';
  private lastConnectedAt: string | null = null;
  private failedAttempts = 0;
  private maxRetryAttempts = 3;
  private isReconnecting = false;
  private auditLogger = ClientAuditLogger.getInstance();

  private constructor() {
    this.httpClient = new LocalBarcodeHTTPClient({
      host: '127.0.0.1',
      port: 9123,
      timeoutMs: 5000,
      retryCount: 3,
    });
  }

  public static getInstance(): ConnectorClientManager {
    if (!ConnectorClientManager.instance) {
      ConnectorClientManager.instance = new ConnectorClientManager();
    }
    return ConnectorClientManager.instance;
  }

  public getHTTPClient(): LocalBarcodeHTTPClient {
    return this.httpClient;
  }

  public getConnectionState(): ClientConnectionState {
    return this.state;
  }

  public getDiagnostics(): ClientConnectionDiagnostics {
    return {
      state: this.state,
      baseUrl: this.httpClient.getConfig().baseUrl,
      timeoutMs: this.httpClient.getConfig().timeoutMs,
      lastConnectedAt: this.lastConnectedAt,
      failedAttempts: this.failedAttempts,
      reconnectState: {
        active: this.isReconnecting,
        attempt: this.failedAttempts,
        maxAttempts: this.maxRetryAttempts,
      },
    };
  }

  /**
   * Evaluates health and updates connection state
   */
  public async checkHealthAndConnect(): Promise<boolean> {
    this.state = 'CONNECTING';

    try {
      const res = await this.httpClient.getHealth();

      if (res.success) {
        this.state = 'CONNECTED';
        this.lastConnectedAt = new Date().toISOString();
        this.failedAttempts = 0;
        this.isReconnecting = false;
        return true;
      } else {
        this.failedAttempts++;
        if (res.errorCode === 'HTTP_TIMEOUT') {
          this.state = 'TIMEOUT';
        } else if (this.failedAttempts >= this.maxRetryAttempts) {
          this.state = 'RECONNECT_REQUIRED';
        } else {
          this.state = 'FAILED';
        }
        return false;
      }
    } catch {
      this.failedAttempts++;
      this.state = this.failedAttempts >= this.maxRetryAttempts ? 'RECONNECT_REQUIRED' : 'FAILED';
      return false;
    }
  }

  /**
   * Connection Retry State management
   */
  public async attemptReconnect(): Promise<boolean> {
    if (this.isReconnecting) return false;

    this.isReconnecting = true;
    this.state = 'CONNECTING';

    let success = false;
    for (let attempt = 1; attempt <= this.maxRetryAttempts; attempt++) {
      this.failedAttempts = attempt;
      success = await this.checkHealthAndConnect();
      if (success) break;
    }

    this.isReconnecting = false;
    if (!success) {
      this.state = 'RECONNECT_REQUIRED';
    }
    return success;
  }

  public resetConnectionState(): void {
    this.state = 'DISCONNECTED';
    this.failedAttempts = 0;
    this.isReconnecting = false;
  }

  public getAuditLogs() {
    return this.auditLogger.getLogs();
  }
}
