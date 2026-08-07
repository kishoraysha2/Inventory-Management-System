import {
  BarcodeMessageEnvelope,
  BarcodeProtocolResponse,
} from '../../../types/barcodeProtocol';
import { EnterpriseDesktopConnectorHost } from './EnterpriseDesktopConnectorHost';

export class LocalBarcodeConnector {
  private static instance: LocalBarcodeConnector | null = null;
  private host = EnterpriseDesktopConnectorHost.getInstance();

  private constructor() {}

  public static getInstance(): LocalBarcodeConnector {
    if (!LocalBarcodeConnector.instance) {
      LocalBarcodeConnector.instance = new LocalBarcodeConnector();
    }
    return LocalBarcodeConnector.instance;
  }

  /**
   * Delegates IPC Requests directly to EnterpriseDesktopConnectorHost
   */
  public async handleIPCRequest<TReq = any, TRes = any>(
    channel: string,
    envelope: BarcodeMessageEnvelope<TReq>
  ): Promise<BarcodeProtocolResponse<TRes>> {
    return this.host.handleIPCRequest<TReq, TRes>(channel, envelope);
  }

  public getHost(): EnterpriseDesktopConnectorHost {
    return this.host;
  }
}
