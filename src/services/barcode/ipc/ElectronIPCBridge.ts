import { LocalBarcodeConnector } from './LocalBarcodeConnector';
import { NexusBarcodePreloadAPI } from '../../../types/barcodeBridge';

export class ElectronIPCBridge {
  private static initialized = false;

  /**
   * Initializes the Electron IPC preload bridge (`window.NexusBarcode`).
   * Follows performance rule: Lazy initialization only.
   */
  public static initializeBridge(): void {
    if (this.initialized) return;

    if (typeof window === 'undefined') return;

    const connector = LocalBarcodeConnector.getInstance();

    const nexusBarcodeAPI: NexusBarcodePreloadAPI = {
      generateBarcode: async (envelope) => {
        return connector.handleIPCRequest('barcode:generate', envelope);
      },
      printBarcode: async (envelope) => {
        return connector.handleIPCRequest('barcode:print', envelope);
      },
      healthCheck: async (envelope) => {
        return connector.handleIPCRequest('barcode:health', envelope);
      },
      getTemplates: async (envelope) => {
        return connector.handleIPCRequest('barcode:getTemplates', envelope);
      },
      getPrinters: async (envelope) => {
        return connector.handleIPCRequest('barcode:getPrinters', envelope);
      },
      getCapabilities: async (envelope) => {
        return connector.handleIPCRequest('barcode:getCapabilities', envelope);
      },
      ping: async (envelope) => {
        return connector.handleIPCRequest('barcode:ping', envelope);
      },
      getProducts: async (envelope) => {
        return connector.handleIPCRequest('barcode:inventory:getProducts', envelope);
      },
      getCategories: async (envelope) => {
        return connector.handleIPCRequest('barcode:inventory:getCategories', envelope);
      },
      getBrands: async (envelope) => {
        return connector.handleIPCRequest('barcode:inventory:getBrands', envelope);
      },
      getUnits: async (envelope) => {
        return connector.handleIPCRequest('barcode:inventory:getUnits', envelope);
      },
      getWarehouses: async (envelope) => {
        return connector.handleIPCRequest('barcode:inventory:getWarehouses', envelope);
      },
    };

    // Expose window.NexusBarcode
    (window as any).NexusBarcode = nexusBarcodeAPI;
    this.initialized = true;
  }

  public static isBridgeAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    return typeof (window as any).NexusBarcode !== 'undefined';
  }
}
