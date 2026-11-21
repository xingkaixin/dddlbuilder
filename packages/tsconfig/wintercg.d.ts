interface TextEncoder {
  readonly encoding: string;
  encode(input?: string): Uint8Array<ArrayBuffer>;
}

declare var TextEncoder: {
  prototype: TextEncoder;
  new (): TextEncoder;
};

interface SubtleCrypto {
  digest(
    algorithm: string | { name: string },
    data: ArrayBuffer | ArrayBufferView<ArrayBuffer>,
  ): Promise<ArrayBuffer>;
}

interface Crypto {
  readonly subtle: SubtleCrypto;
  randomUUID(): string;
}

declare var crypto: Crypto;
