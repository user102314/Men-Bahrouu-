export interface PrinterTarget {
  host: string;
  port: number;
}

export interface SendOptions {
  connectTimeoutMs: number;
  writeTimeoutMs: number;
}

export interface PrinterGateway {
  send(target: PrinterTarget, data: Buffer, options: SendOptions): Promise<void>;
}
