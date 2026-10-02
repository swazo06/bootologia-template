export interface StoredObject {
  key: string;
  url: string;
  contentType: string;
}

export interface StorageProvider {
  upload(input: {
    key: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<StoredObject>;
  getPublicUrl(key: string): string;
}

export class MockStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, StoredObject>();

  async upload(input: {
    key: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<StoredObject> {
    const url = `https://storage.local/${input.key}`;
    const obj = { key: input.key, url, contentType: input.contentType };
    this.objects.set(input.key, obj);
    return obj;
  }

  getPublicUrl(key: string): string {
    return this.objects.get(key)?.url ?? `https://storage.local/${key}`;
  }
}

export const storageProvider: StorageProvider = new MockStorageProvider();
