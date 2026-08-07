import { RuntimeEnvironment } from '../../../types/barcodeTransport';

export class DesktopDetector {
  /**
   * Safe runtime environment detection for Web vs Electron Desktop
   */
  public static detectEnvironment(): RuntimeEnvironment {
    if (typeof window === 'undefined') {
      return 'WEB';
    }

    const win = window as any;

    // Check for explicit IPC bridge injected by Electron preload
    if (win.NexusBarcode || win.electron || win.electronAPI || win.__NEXUS_ELECTRON__) {
      return 'DESKTOP';
    }

    // Check for Node/Electron process flags
    if (win.process && win.process.versions && win.process.versions.electron) {
      return 'DESKTOP';
    }

    // Check User-Agent string
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      if (navigator.userAgent.toLowerCase().includes('electron')) {
        return 'DESKTOP';
      }
    }

    return 'WEB';
  }

  public static isDesktop(): boolean {
    return this.detectEnvironment() === 'DESKTOP';
  }

  public static isWeb(): boolean {
    return this.detectEnvironment() === 'WEB';
  }
}
