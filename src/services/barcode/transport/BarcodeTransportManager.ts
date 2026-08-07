import {
  RuntimeEnvironment,
  TransportConnectionState,
  TransportLogEntry,
  IBarcodeTransport,
} from '../../../types/barcodeTransport';
import {
  BarcodeMessageEnvelope,
  BarcodeOperation,
  BarcodeProtocolResponse,
  CURRENT_PROTOCOL_VERSION,
} from '../../../types/barcodeProtocol';
import { DesktopDetector } from './DesktopDetector';
import { ElectronIPCTransport } from './transports/ElectronIPCTransport';
import { LocalHTTPTransport } from './transports/LocalHTTPTransport';
import { NamedPipeTransport } from './transports/NamedPipeTransport';
import { BarcodeProtocolService } from '../protocol/BarcodeProtocolService';

export class BarcodeTransportManager {
  private static instance: BarcodeTransportManager | null = null;

  private state: TransportConnectionState = 'NOT_INITIALIZED';
  private env: RuntimeEnvironment = 'WEB';
  private activeTransport: IBarcodeTransport;
  private logs: TransportLogEntry[] = [];
  private protocolService = BarcodeProtocolService.getInstance();
  private reconnectTimer: any = null;

  private constructor() {
    this.env = DesktopDetector.detectEnvironment();
    this.activeTransport = new ElectronIPCTransport();
    this.addLog('info', 'Transport Manager Instantiated', `Runtime Environment detected as: ${this.env}`);
  }

  public static getInstance(): BarcodeTransportManager {
    if (!BarcodeTransportManager.instance) {
      BarcodeTransportManager.instance = new BarcodeTransportManager();
    }
    return BarcodeTransportManager.instance;
  }

  public getEnvironment(): RuntimeEnvironment {
    return this.env;
  }

  public getConnectionState(): TransportConnectionState {
    return this.state;
  }

  public getActiveTransportType(): string {
    return this.activeTransport.getTransportType();
  }

  // Lazy Initialization & Connection Lifecycle (Section 3 & 4 & 11)
  public async initialize(): Promise<boolean> {
    if (this.state === 'CONNECTED') {
      return true;
    }

    this.state = 'INITIALIZING';
    this.addLog('info', 'Initializing Transport', `Selected transport: ${this.activeTransport.getTransportType()}`);

    if (this.env === 'WEB') {
      this.activeTransport = new LocalHTTPTransport();
      try {
        const ok = await this.activeTransport.connect();
        if (ok) {
          this.state = 'CONNECTED';
          this.addLog('success', 'HTTP Connector Active', 'Connected to Local HTTP Connector (http://127.0.0.1:9123)');
          return true;
        } else {
          this.state = 'DISCONNECTED';
          this.addLog('warn', 'HTTP Connector Standby', 'Local HTTP Connector at http://127.0.0.1:9123 is standby or offline');
          return false;
        }
      } catch {
        this.state = 'DISCONNECTED';
        return false;
      }
    }

    try {
      const ok = await this.activeTransport.connect();
      if (ok) {
        this.state = 'CONNECTED';
        this.addLog('success', 'IPC Connected', `Established bridge on ${this.activeTransport.getTransportType()}`);
        return true;
      } else {
        this.state = 'FAILED';
        this.addLog('error', 'IPC Connection Failed', 'Failed to connect to local desktop process.');
        return false;
      }
    } catch (e: any) {
      this.state = 'FAILED';
      this.addLog('error', 'IPC Connection Error', e.message || 'Unknown initialization error');
      return false;
    }
  }

  public async reconnect(): Promise<boolean> {
    this.state = 'RECONNECTING';
    this.addLog('info', 'Reconnecting Transport', 'Attempting manual reconnect...');
    return await this.initialize();
  }

  public async shutdown(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.activeTransport.disconnect();
    this.state = 'DISCONNECTED';
    this.addLog('info', 'Transport Shutdown', 'Active IPC transport disconnected.');
  }

  // Request Routing through Transport Layer (Section 6)
  public async sendRequest<TReq = any, TRes = any>(
    operation: BarcodeOperation,
    payload: TReq
  ): Promise<BarcodeProtocolResponse<TRes>> {
    // Lazy initialize on first request if needed
    if (this.state === 'NOT_INITIALIZED') {
      await this.initialize();
    }

    const envelope = this.protocolService.wrapEnvelope(
      operation,
      payload,
      'IPC'
    );

    // Security Check Placeholder (Section 10)
    if (!envelope.metadata.authToken) {
      this.addLog('error', 'Security Validation Failed', 'Missing message envelope security token');
      return this.protocolService.createErrorResponse(
        'INVALID_PAYLOAD',
        'Security token missing in request envelope.',
        envelope.requestId
      );
    }

    // Route message through transport
    const response = await this.activeTransport.send<TReq, TRes>(envelope);

    if (response.success) {
      this.addLog(
        'success',
        `Operation: ${operation}`,
        `Success (Latency: ${response.durationMs}ms, Provider: ${response.provider})`
      );
    } else {
      this.addLog(
        'error',
        `Operation Failed: ${operation}`,
        `Error [${response.errorCode}]: ${response.errorMessage}`
      );
    }

    return response;
  }

  // Heartbeat & Health Monitor (Section 5)
  public async runHealthCheck(): Promise<{
    status: 'online' | 'offline' | 'standby';
    latencyMs: number;
    environment: RuntimeEnvironment;
    protocolVersion: string;
    details: string;
  }> {
    const start = Date.now();

    if (this.env === 'WEB') {
      return {
        status: 'offline',
        latencyMs: 0,
        environment: 'WEB',
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        details: 'Desktop Barcode Suite not available in web mode. Graceful degradation active.',
      };
    }

    if (this.state !== 'CONNECTED') {
      const connected = await this.initialize();
      if (!connected) {
        return {
          status: 'offline',
          latencyMs: 0,
          environment: 'DESKTOP',
          protocolVersion: CURRENT_PROTOCOL_VERSION,
          details: 'Desktop process disconnected or not installed.',
        };
      }
    }

    const pingMs = await this.activeTransport.ping();
    const duration = Date.now() - start;

    return {
      status: 'online',
      latencyMs: pingMs || duration,
      environment: 'DESKTOP',
      protocolVersion: CURRENT_PROTOCOL_VERSION,
      details: `Electron IPC Bridge Active & Healthy (${pingMs}ms latency)`,
    };
  }

  // Structured Logging (Section 9)
  public getLogs(): TransportLogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }

  private addLog(level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: any) {
    const entry: TransportLogEntry = {
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      details,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 100) {
      this.logs.pop();
    }
  }
}
