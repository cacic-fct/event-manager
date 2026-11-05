import { Injectable } from '@nestjs/common';
import { S3Service, S3ServiceError } from '../s3/s3.service';
import { CERTIFICATE_PREVIEW_MAX_BYTES } from './certificate-preview-source';

export const CERTIFICATE_PREVIEW_PREFIX = 'certificate-previews/v1/';
const MIME_TYPE = 'image/avif';
const TTL_MS = 24 * 60 * 60_000;
const SLOT_COUNT = 512;
const STORAGE_TIMEOUT_MS = 2500;

type ObjectMetadata = {
  contentType?: string;
  size?: number;
  metadata?: Record<string, string>;
};

@Injectable()
export class CertificatePreviewCache {
  constructor(private readonly storage: S3Service) {}

  get enabled(): boolean {
    return this.storage.isConfigured;
  }

  async assertBoundedStorage(): Promise<void> {
    await this.storage.assertUnversionedBucket(AbortSignal.timeout(STORAGE_TIMEOUT_MS));
  }

  async has(revision: string): Promise<boolean> {
    try {
      const object = await this.storage.getFileMetadata(this.key(revision), AbortSignal.timeout(STORAGE_TIMEOUT_MS));
      return this.matches(object, revision);
    } catch (error) {
      if (this.isMissing(error)) {
        return false;
      }
      throw error;
    }
  }

  async read(revision: string): Promise<Buffer | null> {
    const signal = AbortSignal.timeout(STORAGE_TIMEOUT_MS);
    try {
      const { stream, contentLength: size, ...metadata } = await this.storage.downloadFile(this.key(revision), signal);
      if (!this.matches({ ...metadata, size }, revision)) {
        stream.destroy();
        return null;
      }

      const abort = () => stream.destroy(new Error('Preview read timed out.'));
      signal.addEventListener('abort', abort, { once: true });
      try {
        signal.throwIfAborted();
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          bytes += chunk.length;
          if (bytes > CERTIFICATE_PREVIEW_MAX_BYTES) {
            return null;
          }
          chunks.push(chunk);
        }
        return bytes === size ? Buffer.concat(chunks, bytes) : null;
      } finally {
        signal.removeEventListener('abort', abort);
        stream.destroy();
      }
    } catch (error) {
      if (this.isMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  async store(revision: string, image: Buffer): Promise<void> {
    if (image.length === 0 || image.length > CERTIFICATE_PREVIEW_MAX_BYTES) {
      throw new Error('Certificate preview exceeds the cache object limit.');
    }
    const expiresAt = new Date(Date.now() + TTL_MS);
    await this.storage.putSmallObject(
      this.key(revision),
      image,
      MIME_TYPE,
      { revision, expires: expiresAt.getTime().toString() },
      expiresAt,
      AbortSignal.timeout(STORAGE_TIMEOUT_MS),
    );
  }

  async expire(): Promise<void> {
    // This runs on the same globally serial queue as writes, so cleanup cannot
    // delete a newer occupant of the slot between listing and deleting it.
    const signal = AbortSignal.timeout(10_000);
    const cutoff = Date.now() - TTL_MS;
    const objects = await this.storage.listFiles(CERTIFICATE_PREVIEW_PREFIX, signal);
    for (const { key, lastModified } of objects) {
      const slot = key.slice(CERTIFICATE_PREVIEW_PREFIX.length);
      if (/^[01][0-9a-f]{2}\.avif$/.test(slot) && lastModified && lastModified.getTime() <= cutoff) {
        await this.storage.deleteFile(key, signal);
      }
    }
  }

  private key(revision: string): string {
    // Direct-mapped cache: replacing a slot evicts its old object. The exact
    // revision is checked in the same S3 response as the image before serving.
    const slot = Number.parseInt(revision.slice(0, 3), 16) % SLOT_COUNT;
    return `${CERTIFICATE_PREVIEW_PREFIX}${slot.toString(16).padStart(3, '0')}.avif`;
  }

  private matches(object: ObjectMetadata, revision: string): boolean {
    const expiresAt = Number(object.metadata?.['expires']);
    return (
      object.contentType === MIME_TYPE &&
      object.metadata?.['revision'] === revision &&
      expiresAt > Date.now() &&
      Boolean(object.size && object.size <= CERTIFICATE_PREVIEW_MAX_BYTES)
    );
  }

  private isMissing(error: unknown): boolean {
    return error instanceof S3ServiceError && error.statusCode === 404;
  }
}
