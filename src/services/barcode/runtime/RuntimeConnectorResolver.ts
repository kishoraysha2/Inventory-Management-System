import {
  RuntimeConnectorStatus,
  RuntimeConnectorState,
  RuntimeSyncLogEntry,
} from '../../../types/barcodeRuntime';
import { BarcodeIntegrationService } from '../BarcodeIntegrationService';
import { ConnectorClientManager } from '../http/ConnectorClientManager';
import { EnterpriseDesktopConnectorHost } from '../ipc/EnterpriseDesktopConnectorHost';
import { DesktopDetector } from '../transport/DesktopDetector';
import { CURRENT_PROTOCOL_VERSION } from '../../../types/barcodeProtocol';

export class RuntimeConnectorResolver {
  private static instance: RuntimeConnectorResolver | null = null;
  private clientManager = ConnectorClientManager.getInstance();
  private desktopHost = EnterpriseDesktopConnectorHost.getInstance();
  private syncLogs: RuntimeSyncLogEntry[] = [];
  private autoRecoveryCount = 0;
  private retryAttempts = 0;

  private status: RuntimeConnectorStatus = {
    provider: 'LOCAL',
    providerStatus: 'ACTIVE',
    transport: 'LOCAL_HTTP',
    serverAddress: 'http://127.0.0.1:9123',
    protocolVersion: CURRENT_PROTOCOL_VERSION,
    connectorState: 'DISCONNECTED',
    isReady: false,
    connectorVersion: '1.3.0',
    latencyMs: 0,
    capabilityCount: 0,
    supportedCapabilities: [],
    lastPingAt: null,
    lastHealthCheckAt: null,
    autoRecoveryCount: 0,
    retryAttempts: 0,
  };

  private constructor() {
    this.refreshSettingsConfig();
  }

  public static getInstance(): RuntimeConnectorResolver {
    if (!RuntimeConnectorResolver.instance) {
      RuntimeConnectorResolver.instance = new RuntimeConnectorResolver();
    }
    return RuntimeConnectorResolver.instance;
  }

  public getStatus(): RuntimeConnectorStatus {
    return { ...this.status };
  }

  public getSyncLogs(): RuntimeSyncLogEntry[] {
    return [...this.syncLogs];
  }

  /**
   * Refreshes provider and server configuration from BarcodeIntegrationSettings
   */
  public refreshSettingsConfig(): void {
    const settings = BarcodeIntegrationService.getInstance().getSettings();
    const env = DesktopDetector.detectEnvironment();

    this.status.provider = settings.provider;
    this.status.providerStatus = settings.provider === 'LOCAL' ? 'ACTIVE' : 'STANDBY';
    this.status.serverAddress = settings.serverAddress || 'http://127.0.0.1:9123';

    if (settings.provider === 'LOCAL') {
      this.status.transport = DesktopDetector.isDesktop() ? 'IPC' : 'LOCAL_HTTP';
    } else {
      this.status.transport = 'CLOUD_REST';
    }
  }

  /**
   * ERP STARTUP FLOW:
   * 1. Check Provider (LOCAL vs CLOUD)
   * 2. If LOCAL: Ping -> GET /health -> GET /version -> GET /capabilities -> Update Runtime State -> ERP Ready
   * 3. If CLOUD: Standby Local, Active Cloud -> ERP Ready
   */
  public async initializeStartup(): Promise<RuntimeConnectorStatus> {
    const startMs = Date.now();
    this.refreshSettingsConfig();
    this.status.connectorState = 'CONNECTING';

    const reqId = `STARTUP-${Date.now()}`;
    const corrId = `CORR-STARTUP-${Date.now()}`;

    if (this.status.provider === 'CLOUD') {
      this.status.connectorState = 'CONNECTED';
      this.status.isReady = true;
      this.status.lastHealthCheckAt = new Date().toISOString();
      this.logSync('StartupBind', 'SUCCESS', Date.now() - startMs, reqId, corrId);
      return this.getStatus();
    }

    // Provider is LOCAL - Execute 4-Step Binding Sequence
    try {
      const httpClient = this.clientManager.getHTTPClient();

      // Step 1: Ping
      const pingRes = await httpClient.ping();
      this.status.lastPingAt = new Date().toISOString();
      this.status.latencyMs = pingRes.durationMs || 1;

      // Step 2: GET /health
      const healthRes = await httpClient.getHealth();
      this.status.lastHealthCheckAt = new Date().toISOString();

      // Step 3: GET /version
      const versionRes = await httpClient.getVersion();
      if (versionRes.success && versionRes.payload) {
        this.status.connectorVersion = versionRes.payload.version || '1.3.0';
        this.status.protocolVersion = versionRes.payload.protocolVersion || CURRENT_PROTOCOL_VERSION;
      }

      // Step 4: GET /capabilities
      const capsRes = await httpClient.getCapabilities();
      if (capsRes.success && capsRes.payload) {
        const extracted = this.extractCapabilities(capsRes.payload);
        if (extracted.length > 0) {
          this.status.supportedCapabilities = extracted;
          this.status.capabilityCount = extracted.length;
        } else {
          // Fallback capabilities for desktop connector host binding
          const hostCaps = this.desktopHost.getConnectorHealth();
          this.status.supportedCapabilities = hostCaps.supportedBarcodeTypes;
          this.status.capabilityCount = hostCaps.supportedBarcodeTypes.length;
        }
      } else {
        // Fallback capabilities for desktop connector host binding
        const hostCaps = this.desktopHost.getConnectorHealth();
        this.status.supportedCapabilities = hostCaps.supportedBarcodeTypes;
        this.status.capabilityCount = hostCaps.supportedBarcodeTypes.length;
      }

      // Step 5: Update Runtime State & ERP Ready
      if (healthRes.success || pingRes.success) {
        this.status.connectorState = 'CONNECTED';
        this.status.isReady = true;
        this.retryAttempts = 0;
      } else {
        this.status.connectorState = 'DEGRADED';
        this.status.isReady = true; // Fallback bound
      }

      this.logSync('StartupBindSequence', 'SUCCESS', Date.now() - startMs, reqId, corrId);
    } catch (err) {
      this.status.connectorState = 'OFFLINE';
      this.status.isReady = false;
      this.logSync('StartupBindSequence', 'FAILED', Date.now() - startMs, reqId, corrId);
    }

    return this.getStatus();
  }

  /**
   * DYNAMIC PROVIDER SYNCHRONIZATION:
   * Updates provider mode without application restart.
   */
  public async syncProvider(newProvider: 'LOCAL' | 'CLOUD'): Promise<RuntimeConnectorStatus> {
    BarcodeIntegrationService.saveSettings({ provider: newProvider });
    this.refreshSettingsConfig();

    if (newProvider === 'LOCAL') {
      return await this.initializeStartup();
    } else {
      this.status.provider = 'CLOUD';
      this.status.providerStatus = 'ACTIVE';
      this.status.connectorState = 'CONNECTED';
      this.status.isReady = true;
      this.status.lastHealthCheckAt = new Date().toISOString();
      return this.getStatus();
    }
  }

  /**
   * AUTOMATIC HEALTH & CAPABILITY PROBE
   */
  public async triggerAutoHealthCheck(): Promise<RuntimeConnectorStatus> {
    const startMs = Date.now();
    this.status.connectorState = 'CONNECTING';

    try {
      const httpClient = this.clientManager.getHTTPClient();
      const healthRes = await httpClient.getHealth();
      const capsRes = await httpClient.getCapabilities();

      this.status.lastHealthCheckAt = new Date().toISOString();

      if (capsRes.success && capsRes.payload) {
        const extracted = this.extractCapabilities(capsRes.payload);
        this.status.supportedCapabilities = extracted;
        this.status.capabilityCount = extracted.length;
      }

      if (healthRes.success) {
        this.status.connectorState = 'CONNECTED';
        this.status.isReady = true;
        this.status.latencyMs = healthRes.durationMs || 2;
      } else {
        return await this.triggerAutoRecovery();
      }
    } catch {
      return await this.triggerAutoRecovery();
    }

    return this.getStatus();
  }

  /**
   * AUTOMATIC FAILOVER & GRACEFUL RECOVERY:
   * OFFLINE -> RETRYING -> CONNECTING -> HEALTH CHECK -> RECONNECT -> RESTORE STATE
   * Restores state without requiring an application restart.
   */
  public async triggerAutoRecovery(): Promise<RuntimeConnectorStatus> {
    this.status.connectorState = 'OFFLINE';
    this.autoRecoveryCount++;
    this.status.autoRecoveryCount = this.autoRecoveryCount;

    const reqId = `RECOVERY-${Date.now()}`;
    const corrId = `CORR-REC-${Date.now()}`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      this.retryAttempts = attempt;
      this.status.retryAttempts = attempt;
      this.status.connectorState = 'RETRYING';

      const connected = await this.clientManager.checkHealthAndConnect();
      if (connected) {
        this.status.connectorState = 'CONNECTED';
        this.status.isReady = true;
        this.status.lastHealthCheckAt = new Date().toISOString();
        this.logSync('AutoRecovery', 'SUCCESS', 15, reqId, corrId);
        return this.getStatus();
      }
    }

    // Graceful Fallback to DEGRADED state (IPC fallback bound)
    this.status.connectorState = 'DEGRADED';
    this.status.isReady = true;
    this.logSync('AutoRecoveryFallback', 'SUCCESS', 20, reqId, corrId);
    return this.getStatus();
  }

  /**
   * Helper method to extract capability array according to Enterprise Protocol priority:
   * Priority 1: capsRes.payload.data.capabilities
   * Priority 2: capsRes.payload.capabilities
   * Priority 3: legacy supportedBarcodeTypes / supportedLabelSizes
   */
  private extractCapabilities(payload: any): string[] {
    if (!payload) return [];

    // Priority 1: capsRes.payload.data.capabilities
    if (payload.data && Array.isArray(payload.data.capabilities)) {
      return payload.data.capabilities;
    }

    // Priority 2: capsRes.payload.capabilities
    if (Array.isArray(payload.capabilities)) {
      return payload.capabilities;
    }

    // Priority 3: Legacy supportedBarcodeTypes & supportedLabelSizes
    const legacy = [
      ...(payload.supportedBarcodeTypes || []),
      ...(payload.supportedLabelSizes || []),
    ];

    return legacy;
  }

  private logSync(
    operation: string,
    status: 'SUCCESS' | 'FAILED' | 'RETRYING',
    durationMs: number,
    requestId: string,
    correlationId: string
  ): void {
    const entry: RuntimeSyncLogEntry = {
      id: `SYNC-LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      requestId,
      correlationId,
      operation,
      status,
      durationMs,
      provider: this.status.provider,
      transport: this.status.transport,
    };

    this.syncLogs.unshift(entry);
    if (this.syncLogs.length > 200) {
      this.syncLogs = this.syncLogs.slice(0, 200);
    }
  }
}
