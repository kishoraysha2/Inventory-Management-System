import {
  BarcodeMessageEnvelope,
  BarcodeProtocolResponse,
  GenerateBarcodeRequestDTO,
  GenerateBarcodeResponseDTO,
  PrintBarcodeRequestDTO,
  PrintBarcodeResponseDTO,
  HealthCheckRequestDTO,
  HealthCheckResponseDTO,
  GetTemplatesRequestDTO,
  GetTemplatesResponseDTO,
  GetPrintersRequestDTO,
  GetPrintersResponseDTO,
  CapabilityResponseDTO,
  PingRequestDTO,
  PingResponseDTO,
  CatalogProductDTO,
  CatalogCategoryDTO,
  CatalogBrandDTO,
  CatalogUnitDTO,
  CatalogWarehouseDTO,
} from './barcodeProtocol';

export interface IPCHealthCheckResult extends HealthCheckResponseDTO {
  desktopConnected: boolean;
  suiteConnected: boolean;
  connectorConnected: boolean;
  protocolVersion: string;
  provider: 'LOCAL' | 'CLOUD';
  latency: number;
  licenseState: 'VALID' | 'EXPIRED' | 'TRIAL' | 'INVALID';
  suiteVersion: string;
  connectorVersion: string;
}

export interface NexusBarcodePreloadAPI {
  generateBarcode: (
    envelope: BarcodeMessageEnvelope<GenerateBarcodeRequestDTO>
  ) => Promise<BarcodeProtocolResponse<GenerateBarcodeResponseDTO>>;
  printBarcode: (
    envelope: BarcodeMessageEnvelope<PrintBarcodeRequestDTO>
  ) => Promise<BarcodeProtocolResponse<PrintBarcodeResponseDTO>>;
  healthCheck: (
    envelope: BarcodeMessageEnvelope<HealthCheckRequestDTO>
  ) => Promise<BarcodeProtocolResponse<IPCHealthCheckResult>>;
  getTemplates: (
    envelope: BarcodeMessageEnvelope<GetTemplatesRequestDTO>
  ) => Promise<BarcodeProtocolResponse<GetTemplatesResponseDTO>>;
  getPrinters: (
    envelope: BarcodeMessageEnvelope<GetPrintersRequestDTO>
  ) => Promise<BarcodeProtocolResponse<GetPrintersResponseDTO>>;
  getCapabilities: (
    envelope: BarcodeMessageEnvelope
  ) => Promise<BarcodeProtocolResponse<CapabilityResponseDTO>>;
  ping: (
    envelope: BarcodeMessageEnvelope<PingRequestDTO>
  ) => Promise<BarcodeProtocolResponse<PingResponseDTO>>;
  getProducts: (
    envelope: BarcodeMessageEnvelope
  ) => Promise<BarcodeProtocolResponse<CatalogProductDTO[]>>;
  getCategories: (
    envelope: BarcodeMessageEnvelope
  ) => Promise<BarcodeProtocolResponse<CatalogCategoryDTO[]>>;
  getBrands: (
    envelope: BarcodeMessageEnvelope
  ) => Promise<BarcodeProtocolResponse<CatalogBrandDTO[]>>;
  getUnits: (
    envelope: BarcodeMessageEnvelope
  ) => Promise<BarcodeProtocolResponse<CatalogUnitDTO[]>>;
  getWarehouses: (
    envelope: BarcodeMessageEnvelope
  ) => Promise<BarcodeProtocolResponse<CatalogWarehouseDTO[]>>;
}

declare global {
  interface Window {
    NexusBarcode?: NexusBarcodePreloadAPI;
    electron?: any;
    electronAPI?: any;
    __NEXUS_ELECTRON__?: boolean;
  }
}
