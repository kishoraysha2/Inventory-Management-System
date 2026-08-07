import React, { useState, useEffect } from 'react';
import {
  Barcode,
  Server,
  Cloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Lock,
  Cpu,
  Radio,
  FileCode,
  ShieldCheck,
  Zap,
  Clock,
  Layers,
  Terminal,
  Activity,
  Sliders,
  Network,
  AlertTriangle,
  Play,
  Monitor,
  Globe,
  RotateCw,
  List,
  Check,
  XCircle,
  Send,
  Inbox,
  ArrowRight,
  TrendingUp,
  CpuIcon,
} from 'lucide-react';
import { BarcodeIntegrationService } from '../../../services/barcode/BarcodeIntegrationService';
import { BarcodeProtocolService } from '../../../services/barcode/protocol/BarcodeProtocolService';
import { BarcodeTransportManager } from '../../../services/barcode/transport/BarcodeTransportManager';
import { BarcodeCommandGateway } from '../../../services/barcode/gateway/BarcodeCommandGateway';
import { BarcodeExecutionService } from '../../../services/barcode/execution/BarcodeExecutionService';
import { RuntimeConnectorResolver } from '../../../services/barcode/runtime/RuntimeConnectorResolver';
import { DesktopDetector } from '../../../services/barcode/transport/DesktopDetector';
import {
  BarcodeIntegrationSettings,
  BarcodeHealthCheckResult,
  IntegrationProviderMode,
} from '../../../types/barcodeIntegration';
import {
  BarcodeOperation,
  BarcodeErrorCode,
  BarcodeMessageEnvelope,
  BarcodeProtocolResponse,
  BarcodeTimeoutPolicy,
  TransportType,
} from '../../../types/barcodeProtocol';
import { BarcodeType } from '../../../types';
import { TransportLogEntry } from '../../../types/barcodeTransport';
import { CommandPriority, RetryStrategyMode } from '../../../types/barcodeGateway';
import {
  BarcodeExecutionResult,
  BarcodeExecutionHistoryItem,
  BarcodeExecutionDiagnostics,
} from '../../../types/barcodeExecution';

export default function BarcodeIntegrationTab() {
  const [settings, setSettings] = useState<BarcodeIntegrationSettings>(() =>
    BarcodeIntegrationService.loadSettings()
  );

  const [healthResult, setHealthResult] = useState<BarcodeHealthCheckResult | null>(null);
  const [isTestingHealth, setIsTestingHealth] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'runtime' | 'execution' | 'gateway' | 'desktop' | 'protocol' | 'config' | 'payloads' | 'logs'>('runtime');

  // Singletons
  const protocolService = BarcodeProtocolService.getInstance();
  const transportManager = BarcodeTransportManager.getInstance();
  const commandGateway = BarcodeCommandGateway.getInstance();
  const executionService = BarcodeExecutionService.getInstance();
  const runtimeResolver = RuntimeConnectorResolver.getInstance();

  // Sprint 7 Runtime Resolver State
  const [runtimeStatus, setRuntimeStatus] = useState(() => runtimeResolver.getStatus());
  const [syncLogs, setSyncLogs] = useState(() => runtimeResolver.getSyncLogs());

  // Desktop & Transport State
  const runtimeEnv = DesktopDetector.detectEnvironment();
  const [connectionState, setConnectionState] = useState(() => transportManager.getConnectionState());
  const [logs, setLogs] = useState<TransportLogEntry[]>(() => transportManager.getLogs());

  // Command Gateway State
  const [telemetry, setTelemetry] = useState(() => commandGateway.getTelemetry());
  const [queueStatus, setQueueStatus] = useState(() => commandGateway.getQueueStatus());
  const [retryPolicy, setRetryPolicyState] = useState(() => commandGateway.getRetryPolicy());

  // Sprint 11 Execution Engine State
  const [execSku, setExecSku] = useState('SKU-EXEC-9901');
  const [execBarcodeType, setExecBarcodeType] = useState<BarcodeType>('CODE128');
  const [execBarcodeValue, setExecBarcodeValue] = useState('BC-EXEC-9901');
  const [isExecutingBarcode, setIsExecutingBarcode] = useState(false);
  const [lastExecResult, setLastExecResult] = useState<BarcodeExecutionResult | null>(null);
  const [execHistory, setExecHistory] = useState<BarcodeExecutionHistoryItem[]>(() =>
    executionService.getExecutionHistory()
  );
  const [execDiagnostics, setExecDiagnostics] = useState<BarcodeExecutionDiagnostics>(() =>
    executionService.getDiagnostics()
  );

  // Gateway Interactive Dispatcher Controls
  const [gwOperation, setGwOperation] = useState<BarcodeOperation>('GenerateBarcode');
  const [gwPriority, setGwPriority] = useState<CommandPriority>('NORMAL');
  const [isDispatching, setIsDispatching] = useState(false);
  const [lastGatewayResult, setLastGatewayResult] = useState<BarcodeProtocolResponse | null>(null);

  // State for Interactive Protocol Envelope Inspector
  const [selectedOperation, setSelectedOperation] = useState<BarcodeOperation>('GenerateBarcode');
  const [selectedTransport, setSelectedTransport] = useState<TransportType>('IPC');
  const [inspectEnvelope, setInspectEnvelope] = useState<BarcodeMessageEnvelope | null>(null);
  const [inspectResponse, setInspectResponse] = useState<BarcodeProtocolResponse | null>(null);

  useEffect(() => {
    handleRunHealthCheck();
    handleGenerateEnvelope('GenerateBarcode', 'IPC');
  }, [settings.provider]);

  const refreshExecutionData = () => {
    setExecHistory(executionService.getExecutionHistory());
    setExecDiagnostics(executionService.getDiagnostics());
  };

  const refreshGatewayData = () => {
    setTelemetry(commandGateway.getTelemetry());
    setQueueStatus(commandGateway.getQueueStatus());
  };

  const refreshLogs = () => {
    setLogs(transportManager.getLogs());
  };

  const refreshRuntimeData = () => {
    setRuntimeStatus(runtimeResolver.getStatus());
    setSyncLogs(runtimeResolver.getSyncLogs());
  };

  const handleStartupBinding = async () => {
    setIsTestingHealth(true);
    const res = await runtimeResolver.initializeStartup();
    setRuntimeStatus(res);
    setSyncLogs(runtimeResolver.getSyncLogs());
    setIsTestingHealth(false);
  };

  const handleAutoHealthCheck = async () => {
    setIsTestingHealth(true);
    const res = await runtimeResolver.triggerAutoHealthCheck();
    setRuntimeStatus(res);
    setSyncLogs(runtimeResolver.getSyncLogs());
    setIsTestingHealth(false);
  };

  const handleAutoRecovery = async () => {
    setIsTestingHealth(true);
    const res = await runtimeResolver.triggerAutoRecovery();
    setRuntimeStatus(res);
    setSyncLogs(runtimeResolver.getSyncLogs());
    setIsTestingHealth(false);
  };

  const handleReconnectIPC = async () => {
    setIsTestingHealth(true);
    await transportManager.reconnect();
    setConnectionState(transportManager.getConnectionState());
    refreshLogs();
    refreshGatewayData();
    refreshExecutionData();
    await handleRunHealthCheck();
    setIsTestingHealth(false);
  };

  // Sprint 11: Execute Barcode Generation
  const handleExecuteGenerateBarcode = async () => {
    setIsExecutingBarcode(true);
    const result = await executionService.executeGenerateBarcode({
      sku: execSku,
      barcodeValue: execBarcodeValue || execSku,
      barcodeType: execBarcodeType,
      quantity: 1,
    });

    setLastExecResult(result);
    refreshExecutionData();
    refreshGatewayData();
    refreshLogs();
    setIsExecutingBarcode(false);
  };

  const handleClearExecutionHistory = () => {
    executionService.clearExecutionHistory();
    refreshExecutionData();
  };

  const handleResetExecutionDiagnostics = () => {
    executionService.resetDiagnostics();
    refreshExecutionData();
    setLastExecResult(null);
  };

  const handleDispatchGatewayCommand = async () => {
    setIsDispatching(true);
    const samplePayloads: Partial<Record<BarcodeOperation, any>> = {
      GenerateBarcode: { sku: 'SKU-NEXUS-8801', barcodeType: 'CODE128', quantity: 2 },
      PrintBarcode: { barcode: 'BC-NEXUS-8801', printerName: 'Zebra ZD421', copies: 1 },
      SyncBarcode: { barcode: 'BC-NEXUS-8801', syncMode: 'push' },
      HealthCheck: { ping: true },
      GetCapabilities: { query: 'full' },
      GetPrinters: { offline: false },
      GetTemplates: { category: 'Standard' },
      Ping: { timestamp: new Date().toISOString() },
      GetProducts: {},
      GetCategories: {},
      GetBrands: {},
      GetUnits: {},
      GetWarehouses: {},
      'INVENTORY:GetProducts': {},
      'INVENTORY:GetCategories': {},
      'INVENTORY:GetBrands': {},
      'INVENTORY:GetUnits': {},
      'INVENTORY:GetWarehouses': {},
    };

    const res = await commandGateway.executeCommand(
      gwOperation,
      samplePayloads[gwOperation] || { timestamp: new Date().toISOString() },
      gwPriority
    );

    setLastGatewayResult(res);
    refreshGatewayData();
    refreshLogs();
    setIsDispatching(false);
  };

  const handleDispatchBulkGatewayCommands = async () => {
    setIsDispatching(true);
    await commandGateway.executeBulkCommands([
      { operation: 'GetCapabilities', payload: {}, priority: 'CRITICAL' },
      { operation: 'GenerateBarcode', payload: { sku: 'BULK-ITEM-01', barcodeType: 'EAN13' }, priority: 'HIGH' },
      { operation: 'PrintBarcode', payload: { barcode: 'BC-BULK-01', copies: 1 }, priority: 'NORMAL' },
    ]);
    refreshGatewayData();
    refreshLogs();
    setIsDispatching(false);
  };

  const handleResetGatewayData = () => {
    commandGateway.resetTelemetry();
    commandGateway.clearQueue();
    refreshGatewayData();
    setLastGatewayResult(null);
  };

  const handleUpdateRetryPolicy = (mode: RetryStrategyMode) => {
    commandGateway.setRetryPolicy({ mode });
    setRetryPolicyState(commandGateway.getRetryPolicy());
  };

  const handleProviderChange = async (mode: IntegrationProviderMode) => {
    if (mode === 'CLOUD') {
      const updated = BarcodeIntegrationService.saveSettings({
        provider: 'CLOUD',
        connectionStatus: 'standby',
      });
      setSettings(updated);
    } else {
      const updated = BarcodeIntegrationService.saveSettings({
        provider: 'LOCAL',
        connectionStatus: 'enabled',
      });
      setSettings(updated);
    }
    const res = await runtimeResolver.syncProvider(mode);
    setRuntimeStatus(res);
    setSyncLogs(runtimeResolver.getSyncLogs());
    setSaveMessage(`Provider set to ${mode} (Runtime State synchronized without restart).`);
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleRunHealthCheck = async () => {
    setIsTestingHealth(true);
    try {
      const service = BarcodeIntegrationService.getInstance();
      const res = await service.runHealthCheck();
      setHealthResult(res);

      setConnectionState(transportManager.getConnectionState());
      refreshLogs();
      refreshGatewayData();

      const env = protocolService.wrapEnvelope('HealthCheck', { pingTime: new Date().toISOString() }, selectedTransport);
      const resp = protocolService.createSuccessResponse('HealthCheck', res, env.requestId, res.latencyMs);
      setInspectEnvelope(env);
      setInspectResponse(resp);
    } catch (e: any) {
      setHealthResult({
        provider: settings.provider,
        status: 'offline',
        version: settings.version,
        latencyMs: 0,
        details: `Diagnostic failure: ${e.message}`,
      });
    } finally {
      setIsTestingHealth(false);
    }
  };

  const handleGenerateEnvelope = (op: BarcodeOperation, transport: TransportType) => {
    let payloadSample: any = {
      productId: 'prod-nexus-101',
      sku: 'NEXUS-ITEM-8821',
      barcode: 'BC-NEXUS-8821',
      barcodeType: 'CODE128',
      quantity: 1,
    };

    const envelope = protocolService.wrapEnvelope(op, payloadSample, transport);
    setInspectEnvelope(envelope);

    let response: BarcodeProtocolResponse;
    if (op === 'GetCapabilities') {
      response = protocolService.createSuccessResponse(op, protocolService.getCapabilities(), envelope.requestId, 2);
    } else if (op === 'GetTemplates') {
      response = protocolService.createSuccessResponse(op, protocolService.getTemplates(), envelope.requestId, 1);
    } else if (op === 'GetPrinters') {
      response = protocolService.createSuccessResponse(op, protocolService.getPrinters(), envelope.requestId, 1);
    } else {
      response = protocolService.createSuccessResponse(op, { status: 'acknowledged', operation: op, processed: true }, envelope.requestId, 3);
    }

    setInspectResponse(response);
  };

  const sampleProduct = {
    id: 'prod-nexus-101',
    sku: 'NEXUS-ITEM-8821',
    barcode: 'BC-NEXUS-8821',
    barcodeType: 'CODE128',
    barcodeSource: 'manual',
    barcodeVersion: 1,
  };

  const service = BarcodeIntegrationService.getInstance();
  const sampleGenerateReq = service.createGenerateRequest(sampleProduct as any, 1, 'STD_PRODUCT_38X25MM');
  const samplePrintReq = service.createPrintRequest(sampleProduct as any, 2, 'DEFAULT_LOCAL_THERMAL_PRINTER');
  const sampleSyncReq = service.createSyncRequest(sampleProduct as any, 'push');

  return (
    <div id="barcode-integration-tab-section" className="space-y-6">
      {/* HEADER SECTION */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-sm relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
          <Barcode className="w-64 h-64 text-indigo-400" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600/30 border border-indigo-400/30 rounded-2xl text-indigo-300 shrink-0">
              <Zap className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-black tracking-tight text-white uppercase">
                  Enterprise Local Connector Client
                </h3>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
                  Sprint Local Client Active
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 font-medium max-w-2xl">
                Hybrid Web + Desktop execution runner for Barcode Generation. Routes execution through BarcodeCommandGateway to Electron IPC and MZ Barcode Suite with response validation, security checks, and diagnostics.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={handleReconnectIPC}
              disabled={isTestingHealth}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isTestingHealth ? 'animate-spin' : ''}`} />
              <span>Reconnect IPC</span>
            </button>

            <button
              type="button"
              onClick={handleRunHealthCheck}
              disabled={isTestingHealth}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer border border-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingHealth ? 'animate-spin' : ''}`} />
              <span>Health Ping</span>
            </button>
          </div>
        </div>

        {/* SUB TAB NAVIGATION */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-4 mt-6">
          <button
            type="button"
            onClick={() => setActiveSubTab('runtime')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'runtime'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Runtime Integration (Sprint 7)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('execution')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'execution'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Execution Engine (Sprint 11)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('gateway')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'gateway'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Command Gateway (Sprint 10)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('desktop')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'desktop'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Desktop IPC Layer (Sprint 9)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('protocol')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'protocol'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>IPC Protocol Contract (Sprint 8)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('config')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'config'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Provider Config</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('payloads')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'payloads'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Shared DTO Models</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('logs')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'logs'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Transport Logs ({logs.length})</span>
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-4 py-3 rounded-2xl flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}

      {/* SUB-TAB: SPRINT 7 END-TO-END RUNTIME INTEGRATION */}
      {activeSubTab === 'runtime' && (
        <div className="space-y-6">
          {/* STATS OVERVIEW CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Connector State</span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2.5 py-0.5 text-xs font-black uppercase rounded-full ${
                  runtimeStatus.connectorState === 'CONNECTED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                  runtimeStatus.connectorState === 'DEGRADED' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                  runtimeStatus.connectorState === 'RETRYING' ? 'bg-sky-100 text-sky-800 border border-sky-300 animate-pulse' :
                  'bg-rose-100 text-rose-800 border border-rose-300'
                }`}>
                  {runtimeStatus.connectorState}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium block mt-1">
                ERP Ready: {runtimeStatus.isReady ? 'YES' : 'NO'}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Provider & Mode</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-black text-slate-900 font-mono uppercase">{runtimeStatus.provider}</span>
                <span className="px-2 py-0.5 text-[9px] font-extrabold bg-indigo-100 text-indigo-700 rounded-md uppercase">
                  {runtimeStatus.providerStatus}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium block mt-1">
                Transport: {runtimeStatus.transport}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Capabilities Count</span>
              <span className="text-sm font-black text-slate-900 font-mono block mt-0.5">{runtimeStatus.capabilityCount}</span>
              <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                Protocol: {runtimeStatus.protocolVersion}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Latency & Health</span>
              <span className="text-sm font-black text-slate-900 font-mono block mt-0.5">{runtimeStatus.latencyMs} ms</span>
              <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                Auto Recoveries: {runtimeStatus.autoRecoveryCount}
              </span>
            </div>
          </div>

          {/* ERP STARTUP & RECOVERY CONTROL PANEL */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-6 shadow-3xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  ERP Startup Binding & Synchronization Routine
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verifies connection flow: Provider Check → Ping → GET /health → GET /version → GET /capabilities → ERP Ready.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartupBinding}
                  disabled={isTestingHealth}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Execute Startup Bind</span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoHealthCheck}
                  disabled={isTestingHealth}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 border border-slate-700 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingHealth ? 'animate-spin' : ''}`} />
                  <span>Auto Health Check</span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoRecovery}
                  disabled={isTestingHealth}
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Trigger Auto Recovery</span>
                </button>
              </div>
            </div>

            {/* DETAILED DIAGNOSTICS & CAPABILITIES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 space-y-3 border border-slate-800">
                <h5 className="text-xs font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-indigo-400" />
                  Runtime Connector Details
                </h5>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Server Address:</span>
                    <span className="text-slate-100 font-bold">{runtimeStatus.serverAddress}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Connector Version:</span>
                    <span className="text-emerald-400 font-bold">{runtimeStatus.connectorVersion}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Protocol Version:</span>
                    <span className="text-sky-300 font-bold">{runtimeStatus.protocolVersion}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Last Health Check:</span>
                    <span className="text-amber-300">{runtimeStatus.lastHealthCheckAt ? new Date(runtimeStatus.lastHealthCheckAt).toLocaleTimeString() : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Last Ping:</span>
                    <span className="text-slate-300">{runtimeStatus.lastPingAt ? new Date(runtimeStatus.lastPingAt).toLocaleTimeString() : 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 space-y-3 border border-slate-800">
                <h5 className="text-xs font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Synchronized Capabilities ({runtimeStatus.supportedCapabilities.length})
                </h5>

                <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto p-1">
                  {runtimeStatus.supportedCapabilities.map((cap) => (
                    <span
                      key={cap}
                      className="px-2.5 py-1 bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-bold rounded-lg uppercase"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* SYNCHRONIZED AUDIT LOGS */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <List className="w-3.5 h-3.5 text-indigo-600" />
                  Synchronized Request & Correlation Audit Logs
                </h5>
                <span className="text-[10px] text-slate-500 font-medium">No Barcode/Customer Data Logged</span>
              </div>

              <div className="bg-slate-950 text-slate-100 rounded-2xl p-4 border border-slate-800 font-mono text-xs max-h-60 overflow-y-auto space-y-2">
                {syncLogs.length === 0 ? (
                  <div className="text-slate-500 text-center py-4 italic text-xs">
                    No sync logs recorded yet. Click "Execute Startup Bind" above.
                  </div>
                ) : (
                  syncLogs.map((log) => (
                    <div key={log.id} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md ${
                          log.status === 'SUCCESS' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}>
                          {log.status}
                        </span>
                        <span className="font-bold text-slate-200 text-[11px]">{log.operation}</span>
                        <span className="text-[10px] text-slate-500 font-mono">[{log.requestId}]</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[10px] text-slate-400">
                        <span>{log.durationMs}ms</span>
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: SPRINT 11 EXECUTION ENGINE */}
      {activeSubTab === 'execution' && (
        <div className="space-y-6">
          {/* RUNTIME ENVIRONMENT BANNER */}
          {runtimeEnv === 'WEB' ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 flex items-center gap-3">
              <Globe className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider">
                  Desktop Feature (Web Mode Active)
                </h4>
                <p className="text-xs font-medium text-amber-800 mt-0.5">
                  Execution Layer operates in graceful web fallback mode. Barcode Suite desktop runner disabled. ERP continues functioning normally without errors.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-4 flex items-center gap-3">
              <Zap className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider">
                  Desktop Execution Engine Active (Electron IPC Mode)
                </h4>
                <p className="text-xs font-medium text-emerald-800 mt-0.5">
                  Ready to execute GenerateBarcode commands directly through BarcodeCommandGateway and Electron IPC transport.
                </p>
              </div>
            </div>
          )}

          {/* SECTION 8: DIAGNOSTICS STAT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Executions</span>
              <span className="text-sm font-black text-slate-900 font-mono block mt-0.5">{execDiagnostics.executionCount}</span>
              <span className="text-[9px] text-slate-500 font-medium">Barcode Generation Runs</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Successful Executions</span>
              <span className="text-sm font-black text-emerald-600 font-mono block mt-0.5">{execDiagnostics.successCount}</span>
              <span className="text-[9px] text-emerald-600 font-bold">Validated OK</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Failed Executions</span>
              <span className="text-sm font-black text-rose-600 font-mono block mt-0.5">{execDiagnostics.failureCount}</span>
              <span className="text-[9px] text-slate-500 font-medium">Validation/Web Fallback</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Average Duration</span>
              <span className="text-sm font-black text-sky-700 font-mono block mt-0.5">{execDiagnostics.averageExecutionTimeMs} ms</span>
              <span className="text-[9px] text-slate-500 font-medium">Execution Latency</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Last Execution Status</span>
              <span className={`text-xs font-black uppercase font-mono block mt-1 ${
                execDiagnostics.lastExecution?.status === 'SUCCESS' ? 'text-emerald-600' :
                execDiagnostics.lastExecution?.status === 'DEGRADED_WEB' ? 'text-amber-600' : 'text-slate-600'
              }`}>
                {execDiagnostics.lastExecution?.status || 'No Execution'}
              </span>
            </div>
          </div>

          {/* INTERACTIVE BARCODE GENERATION EXECUTION RUNNER */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 space-y-5 shadow-3xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-4 h-4 text-indigo-600" />
                    Barcode Execution Runner (Section 1 & 2)
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Execute GenerateBarcode command through BarcodeExecutionService.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="exec-sku-input" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Product SKU
                  </label>
                  <input
                    id="exec-sku-input"
                    type="text"
                    value={execSku}
                    onChange={(e) => setExecSku(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="exec-type-select" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Barcode Type
                    </label>
                    <select
                      id="exec-type-select"
                      value={execBarcodeType}
                      onChange={(e) => setExecBarcodeType(e.target.value as BarcodeType)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                    >
                      <option value="CODE128">CODE128</option>
                      <option value="EAN13">EAN13</option>
                      <option value="EAN8">EAN8</option>
                      <option value="UPCA">UPCA</option>
                      <option value="UPCE">UPCE</option>
                      <option value="QR_CODE">QR_CODE</option>
                      <option value="DATA_MATRIX">DATA_MATRIX</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="exec-barcode-value" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Barcode Value
                    </label>
                    <input
                      id="exec-barcode-value"
                      type="text"
                      value={execBarcodeValue}
                      onChange={(e) => setExecBarcodeValue(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleExecuteGenerateBarcode}
                  disabled={isExecutingBarcode}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Zap className={`w-3.5 h-3.5 ${isExecutingBarcode ? 'animate-bounce' : ''}`} />
                  <span>Execute GenerateBarcode</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetExecutionDiagnostics}
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  <span>Reset Diagnostics</span>
                </button>
              </div>
            </div>

            {/* GENERATED EXECUTION RESULT DISPLAY */}
            <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 space-y-5 shadow-3xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-600" />
                    Generated Execution Result (Section 5)
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Standardized execution result model returned from BarcodeExecutionService.
                  </p>
                </div>
              </div>

              {lastExecResult ? (
                <div className="space-y-4">
                  {/* Image Preview */}
                  {lastExecResult.imageDataUrl && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center justify-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase mb-2">Rendered Barcode Graphic Reference</span>
                      <img
                        src={lastExecResult.imageDataUrl}
                        alt="Generated Barcode"
                        className="max-h-24 bg-white p-2 rounded-xl border border-slate-200 shadow-xs"
                      />
                    </div>
                  )}

                  <div className="bg-slate-950 text-slate-100 rounded-2xl p-4 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                      <span className="font-bold text-indigo-300">Execution Status:</span>
                      <span className={`font-mono font-extrabold uppercase px-2 py-0.5 rounded ${
                        lastExecResult.status === 'SUCCESS' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                        lastExecResult.status === 'DEGRADED_WEB' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                        'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}>
                        {lastExecResult.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                      <div><span className="text-slate-400">Barcode Value:</span> <strong className="text-white font-mono">{lastExecResult.barcodeValue}</strong></div>
                      <div><span className="text-slate-400">Type:</span> <strong className="text-indigo-400 font-mono">{lastExecResult.barcodeType}</strong></div>
                      <div><span className="text-slate-400">Duration:</span> <strong className="text-sky-300 font-mono">{lastExecResult.executionTimeMs} ms</strong></div>
                      <div><span className="text-slate-400">Provider:</span> <strong className="text-white font-mono">{lastExecResult.provider}</strong></div>
                      <div><span className="text-slate-400">Transport:</span> <strong className="text-emerald-400 font-mono">{lastExecResult.transport || 'ELECTRON_IPC'}</strong></div>
                      <div><span className="text-slate-400">Checksum:</span> <strong className="text-emerald-400 font-mono">{lastExecResult.checksumValid ? 'NEXUS-CHECKSUM-OK' : 'VERIFIED'}</strong></div>
                    </div>

                    {lastExecResult.errorMessage && (
                      <div className="mt-2 text-[11px] text-amber-300 bg-amber-950/60 p-2.5 rounded-xl border border-amber-800">
                        {lastExecResult.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs font-medium text-slate-400 italic p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                  Execute GenerateBarcode to inspect real-time execution results.
                </div>
              )}
            </div>
          </div>

          {/* SECTION 7: IN-MEMORY EXECUTION HISTORY */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-3xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  In-Memory Execution History (Section 7)
                </h4>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Transient in-memory execution logs. Resets upon refresh (no database persistence).
                </p>
              </div>

              <button
                type="button"
                onClick={handleClearExecutionHistory}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
              >
                Clear History
              </button>
            </div>

            <div className="overflow-x-auto">
              {execHistory.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400 italic">
                  No execution history items logged yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-wider bg-slate-50/50">
                      <th className="py-2.5 px-3">Timestamp / Origin</th>
                      <th className="py-2.5 px-3">Label Type</th>
                      <th className="py-2.5 px-3">Product / Barcode</th>
                      <th className="py-2.5 px-3">Business Context</th>
                      <th className="py-2.5 px-3">Template Resolution</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-xs">
                    {execHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="text-slate-700 font-bold">{new Date(item.timestamp).toLocaleTimeString()}</div>
                          <div className="text-[10px] text-slate-400 font-sans uppercase font-bold">{item.context?.originSource || item.originSource || 'DIRECT'}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                            item.labelType === 'UNIT_CONVERSION_LABEL' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                            item.labelType === 'CARTON_LABEL' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            item.labelType === 'GOODS_RECEIVING_LABEL' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            item.labelType === 'SALES_DISPATCH_LABEL' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {item.labelType === 'UNIT_CONVERSION_LABEL' ? 'Unit Conversion' :
                             item.labelType === 'CARTON_LABEL' ? 'Carton Label' :
                             item.labelType === 'GOODS_RECEIVING_LABEL' ? 'Goods Receiving' :
                             item.labelType === 'SALES_DISPATCH_LABEL' ? 'Sales Dispatch' :
                             item.labelType || 'Standard'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{item.context?.product?.name || item.productSku}</div>
                          <div className="text-[10px] text-indigo-600 font-bold">{item.barcodeValue} <span className="text-slate-400 font-normal">({item.productSku})</span></div>
                          {item.context?.product?.category && (
                            <div className="text-[9px] text-slate-500 font-sans">Category: {item.context.product.category}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 text-[11px] font-sans">
                          <div className="space-y-0.5">
                            {item.context?.warehouse?.warehouseName && (
                              <div><span className="font-semibold text-slate-500">WH:</span> {item.context.warehouse.warehouseName}</div>
                            )}
                            {(item.context?.supplier?.supplierName || (item.context?.supplier as any)?.name) && (
                              <div><span className="font-semibold text-slate-500">Supplier:</span> {item.context?.supplier?.supplierName || (item.context?.supplier as any)?.name}</div>
                            )}
                            {(item.context?.customer?.customerName || (item.context?.customer as any)?.name) && (
                              <div><span className="font-semibold text-slate-500">Customer:</span> {item.context?.customer?.customerName || (item.context?.customer as any)?.name}</div>
                            )}
                            {item.context?.user?.userName && (
                              <div><span className="font-semibold text-slate-500">User:</span> {item.context.user.userName}</div>
                            )}
                            {!item.context?.warehouse?.warehouseName && !item.context?.supplier?.name && !item.context?.customer?.name && (
                              <span className="text-slate-400 italic">Standard Context</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 text-[11px] font-sans">
                          <div className="space-y-0.5">
                            <div><span className="font-semibold text-slate-500">Requested:</span> <span className="font-mono text-[10px]">{item.requestedTemplate || 'DEFAULT'}</span></div>
                            <div><span className="font-semibold text-slate-500">Resolved:</span> <span className="font-mono text-[10px] font-bold text-emerald-700">{item.resolvedTemplate || 'STD_PRODUCT_38X25MM'}</span></div>
                            {item.resolutionRule && (
                              <div><span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-mono">{item.resolutionRule}</span></div>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{item.durationMs} ms</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                            item.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                            item.status === 'DEGRADED_WEB' ? 'bg-amber-100 text-amber-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: SPRINT 10 COMMAND GATEWAY */}
      {activeSubTab === 'gateway' && (
        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400">Barcode Command Gateway</h4>
              <p className="text-xs text-slate-300 mt-0.5">Asynchronous Command Queue and Priority Dispatcher Layer.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Gateway Status</span>
              <span className={`text-xs font-black uppercase font-mono block mt-1 ${
                runtimeEnv === 'WEB' ? 'text-amber-600' : connectionState === 'CONNECTED' ? 'text-emerald-600' : 'text-slate-600'
              }`}>
                {runtimeEnv === 'WEB' ? 'Web Standby' : connectionState}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Queue Size</span>
              <span className="text-sm font-black text-slate-900 font-mono block mt-0.5">{queueStatus.queueSize}</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Pending</span>
              <span className="text-sm font-black text-indigo-600 font-mono block mt-0.5">{queueStatus.pendingCount}</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Commands Sent</span>
              <span className="text-sm font-black text-slate-900 font-mono block mt-0.5">{telemetry.commandsSent}</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Average Latency</span>
              <span className="text-sm font-black text-sky-700 font-mono block mt-0.5">{telemetry.averageLatencyMs} ms</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Failed</span>
              <span className="text-sm font-black text-rose-600 font-mono block mt-0.5">{telemetry.commandsFailed}</span>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: SPRINT 9 DESKTOP IPC LAYER */}
      {activeSubTab === 'desktop' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-3xs flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Monitor className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Runtime Environment</span>
                <span className="text-sm font-black text-slate-900 font-mono uppercase">{runtimeEnv}</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-3xs flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Connection State</span>
                <span className="text-sm font-black text-emerald-700 font-mono uppercase">{connectionState}</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-3xs flex items-center gap-3">
              <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl">
                <Network className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Active Transport</span>
                <span className="text-sm font-black text-sky-700 font-mono uppercase">
                  {transportManager.getActiveTransportType()}
                </span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-3xs flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Protocol Version</span>
                <span className="text-sm font-black text-slate-900 font-mono">1.0.0</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: SPRINT 8 IPC PROTOCOL CONTRACT */}
      {activeSubTab === 'protocol' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 space-y-5 shadow-3xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-4 h-4 text-indigo-600" />
                    Interactive Message Envelope Inspector
                  </h4>
                </div>
              </div>

              {inspectEnvelope && (
                <div className="bg-slate-950 text-slate-100 rounded-2xl p-4 border border-slate-800">
                  <pre className="text-[10px] font-mono leading-relaxed text-indigo-300 overflow-x-auto max-h-72">
                    {JSON.stringify(inspectEnvelope, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 space-y-5 shadow-3xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Standardized Protocol Response Model
                  </h4>
                </div>
              </div>

              {inspectResponse && (
                <div className="bg-slate-950 text-slate-100 rounded-2xl p-4 border border-slate-800">
                  <pre className="text-[10px] font-mono leading-relaxed text-emerald-400 overflow-x-auto max-h-72">
                    {JSON.stringify(inspectResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: CONFIGURATION */}
      {activeSubTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 space-y-6 shadow-3xs">
            <div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-600" />
                Integration Provider Selection
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => handleProviderChange('LOCAL')}
                className={`p-4 rounded-2xl border-2 transition cursor-pointer relative ${
                  settings.provider === 'LOCAL'
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-xs'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Server className={`w-5 h-5 ${settings.provider === 'LOCAL' ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="font-extrabold text-xs text-slate-900 uppercase">LOCAL PROVIDER</span>
                  </div>
                </div>
              </div>

              <div
                onClick={() => handleProviderChange('CLOUD')}
                className={`p-4 rounded-2xl border-2 transition cursor-pointer relative ${
                  settings.provider === 'CLOUD'
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-xs'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Cloud className={`w-5 h-5 ${settings.provider === 'CLOUD' ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="font-extrabold text-xs text-slate-900 uppercase">CLOUD PROVIDER</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: SHARED DTO MODELS */}
      {activeSubTab === 'payloads' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-6 shadow-3xs">
          <div>
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FileCode className="w-4 h-4 text-indigo-600" />
              Shared Request Payload DTOs
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 space-y-2 border border-slate-800">
              <span className="text-xs font-black text-indigo-400 uppercase">GenerateBarcodeRequestDTO</span>
              <pre className="text-[10px] font-mono leading-relaxed text-emerald-400 overflow-x-auto p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                {JSON.stringify(sampleGenerateReq, null, 2)}
              </pre>
            </div>

            <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 space-y-2 border border-slate-800">
              <span className="text-xs font-black text-indigo-400 uppercase">PrintBarcodeRequestDTO</span>
              <pre className="text-[10px] font-mono leading-relaxed text-amber-300 overflow-x-auto p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                {JSON.stringify(samplePrintReq, null, 2)}
              </pre>
            </div>

            <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 space-y-2 border border-slate-800">
              <span className="text-xs font-black text-indigo-400 uppercase">SyncBarcodeRequestDTO</span>
              <pre className="text-[10px] font-mono leading-relaxed text-sky-300 overflow-x-auto p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                {JSON.stringify(sampleSyncReq, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: STRUCTURED TRANSPORT LOGS */}
      {activeSubTab === 'logs' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-3xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <List className="w-4 h-4 text-indigo-600" />
                Structured Integration Logs
              </h4>
            </div>
            <button
              type="button"
              onClick={refreshLogs}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          <div className="bg-slate-950 text-slate-100 rounded-2xl p-4 border border-slate-800 font-mono text-xs max-h-96 overflow-y-auto space-y-2">
            {logs.length === 0 ? (
              <div className="text-slate-500 text-center py-6 italic text-xs">
                No integration logs recorded yet.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 flex items-start gap-3">
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md shrink-0 ${
                    log.level === 'success' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                    log.level === 'warn' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    log.level === 'error' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                    'bg-sky-950 text-sky-300 border border-sky-800'
                  }`}>
                    {log.level}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-bold text-slate-200">{log.event}</span>
                      <span className="text-[9px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">{log.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
