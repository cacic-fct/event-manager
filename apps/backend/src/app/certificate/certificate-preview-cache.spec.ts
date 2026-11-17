import { Readable } from 'node:stream';
import type { S3Service } from '../s3/s3.service';
import { CertificatePreviewCache } from './certificate-preview-cache';
import { CERTIFICATE_PREVIEW_MAX_BYTES } from './certificate-preview-source';

const { jest } = import.meta;
const revision = '000' + 'a'.repeat(61);
const collidingRevision = '200' + 'b'.repeat(61);
const dayMs = 24 * 60 * 60_000;

function createCache() {
  const storage = {
    putSmallObject: jest.fn().mockResolvedValue(undefined),
    getFileMetadata: jest.fn(),
    downloadFile: jest.fn(),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    listFiles: jest.fn(),
  };
  return { storage, cache: new CertificatePreviewCache(storage as unknown as S3Service) };
}

describe('CertificatePreviewCache', () => {
  it('caps each slot and sends the expiration to S3', async () => {
    const { storage, cache } = createCache();
    const now = Date.now();
    const image = Buffer.from('image');

    await cache.store(revision, image);
    await cache.store(collidingRevision, image);
    await expect(cache.store(revision, Buffer.alloc(CERTIFICATE_PREVIEW_MAX_BYTES + 1))).rejects.toThrow('limit');

    const [key, body, mime, metadata, expiresAt] = storage.putSmallObject.mock.calls[0];
    expect(key).toBe(storage.putSmallObject.mock.calls[1][0]);
    expect(body).toBe(image);
    expect(mime).toBe('image/avif');
    expect(metadata).toEqual({ revision, expires: String((expiresAt as Date).getTime()) });
    expect((expiresAt as Date).getTime()).toBeGreaterThanOrEqual(now + dayMs);
    expect(storage.putSmallObject).toHaveBeenCalledTimes(2);
  });

  it('rejects expired objects and never returns an image from a colliding revision', async () => {
    const { storage, cache } = createCache();
    const content = Buffer.from('image');
    const expires = String(Date.now() + 60_000);
    const stream = Readable.from([content]);
    storage.downloadFile.mockResolvedValueOnce({
      stream,
      contentType: 'image/avif',
      contentLength: content.length,
      metadata: { revision: collidingRevision, expires },
    });

    await expect(cache.read(revision)).resolves.toBeNull();
    expect(stream.destroyed).toBe(true);

    storage.getFileMetadata.mockResolvedValueOnce({
      contentType: 'image/avif',
      size: content.length,
      metadata: { revision, expires: String(Date.now() - 1) },
    });
    await expect(cache.has(revision)).resolves.toBe(false);

    storage.downloadFile.mockResolvedValueOnce({
      stream: Readable.from([content]),
      contentType: 'image/avif',
      contentLength: content.length,
      metadata: { revision, expires },
    });
    await expect(cache.read(revision)).resolves.toEqual(content);
  });

  it('deletes expired slot objects and leaves fresh or unrelated objects alone', async () => {
    const { storage, cache } = createCache();
    const expiredAt = new Date(Date.now() - 2 * dayMs);
    storage.listFiles.mockResolvedValue([
      { key: 'certificate-previews/v1/000.avif', lastModified: expiredAt },
      { key: 'certificate-previews/v1/001.avif', lastModified: new Date() },
      { key: 'certificate-previews/v1/200.avif', lastModified: expiredAt },
      { key: 'unrelated-folder/000.avif', lastModified: expiredAt },
    ]);

    await cache.expire();

    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledWith('certificate-previews/v1/000.avif', expect.any(AbortSignal));
  });
});
