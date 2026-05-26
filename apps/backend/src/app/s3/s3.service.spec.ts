import { Readable } from 'stream';
import { S3Service } from './s3.service';

const sendMock = jest.fn();
const uploadDoneMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: sendMock,
  })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ kind: 'GetObjectCommand', input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ kind: 'DeleteObjectCommand', input })),
  HeadObjectCommand: jest.fn().mockImplementation((input) => ({ kind: 'HeadObjectCommand', input })),
  ListObjectsV2Command: jest.fn().mockImplementation((input) => ({ kind: 'ListObjectsV2Command', input })),
}));

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation((input) => ({
    input,
    done: uploadDoneMock,
  })),
}));

describe('S3Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates stable file keys with sanitized timestamps', () => {
    const service = new S3Service(configServiceMock() as never);

    expect(
      service.generateFileKey('lgpd', 'user-1', 'document.pdf', new Date('2026-05-21T12:34:56.789Z')),
    ).toBe('lgpd/user-1/2026-05-21T12-34-56-789Z-document.pdf');
  });

  it('fails storage operations when S3 configuration is incomplete', async () => {
    const service = new S3Service(configServiceMock({ S3_SECRET_KEY: undefined }) as never);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    await expect(service.downloadFile('missing-key')).rejects.toThrow('S3 configuration is incomplete');
  });

  it('uploads buffers and returns the object size from metadata', async () => {
    const service = new S3Service(configServiceMock() as never);
    sendMock.mockResolvedValue({ ContentLength: 42 });

    await expect(
      service.uploadFile(
        'receipts/file.png',
        Buffer.from('receipt'),
        'image/png',
        { source: 'test' },
        new Date('2027-01-01T00:00:00.000Z'),
      ),
    ).resolves.toEqual({
      key: 'receipts/file.png',
      size: 42,
    });

    expect(uploadDoneMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'HeadObjectCommand',
        input: {
          Bucket: 'bucket',
          Key: 'receipts/file.png',
        },
      }),
    );
  });

  it('wraps upload failures with a storage-specific message', async () => {
    const service = new S3Service(configServiceMock() as never);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    uploadDoneMock.mockRejectedValue(new Error('network down'));

    await expect(service.uploadFile('key', Buffer.from('file'))).rejects.toThrow(
      'Failed to upload file: network down',
    );
  });

  it('downloads object streams and metadata', async () => {
    const service = new S3Service(configServiceMock() as never);
    const stream = Readable.from(['file']);
    sendMock.mockResolvedValue({
      Body: stream,
      ContentType: 'text/plain',
      ContentLength: 4,
      Metadata: { owner: 'user-1' },
    });

    await expect(service.downloadFile('files/readme.txt')).resolves.toEqual({
      stream,
      contentType: 'text/plain',
      contentLength: 4,
      metadata: { owner: 'user-1' },
    });
  });

  it('rejects empty downloads as missing files', async () => {
    const service = new S3Service(configServiceMock() as never);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    sendMock.mockResolvedValue({});

    await expect(service.downloadFile('empty')).rejects.toThrow('Failed to download file: File not found or empty');
  });

  it('deletes files and wraps delete errors', async () => {
    const service = new S3Service(configServiceMock() as never);

    await expect(service.deleteFile('files/remove.txt')).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'DeleteObjectCommand',
        input: {
          Bucket: 'bucket',
          Key: 'files/remove.txt',
        },
      }),
    );

    sendMock.mockRejectedValueOnce(new Error('access denied'));
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    await expect(service.deleteFile('files/remove.txt')).rejects.toThrow('Failed to delete file: access denied');
  });

  it('checks existence using both S3 not-found shapes', async () => {
    const service = new S3Service(configServiceMock() as never);

    sendMock.mockResolvedValueOnce({});
    await expect(service.fileExists('present')).resolves.toBe(true);

    sendMock.mockRejectedValueOnce({ name: 'NotFound' });
    await expect(service.fileExists('missing-by-name')).resolves.toBe(false);

    sendMock.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await expect(service.fileExists('missing-by-status')).resolves.toBe(false);

    sendMock.mockRejectedValueOnce(new Error('boom'));
    await expect(service.fileExists('error')).rejects.toThrow('boom');
  });

  it('reads metadata and lists prefixed files', async () => {
    const service = new S3Service(configServiceMock() as never);
    const lastModified = new Date('2026-05-21T12:00:00.000Z');

    sendMock.mockResolvedValueOnce({
      ContentLength: 123,
      LastModified: lastModified,
      ContentType: 'image/png',
      Metadata: { majorEventId: 'major-1' },
    });
    await expect(service.getFileMetadata('receipts/file.png')).resolves.toEqual({
      size: 123,
      lastModified,
      contentType: 'image/png',
      metadata: { majorEventId: 'major-1' },
    });

    sendMock.mockResolvedValueOnce({
      Contents: [
        { Key: 'prefix/a.txt', Size: 1, LastModified: lastModified },
        { Key: 'prefix/b.txt' },
      ],
    });
    await expect(service.listFiles('prefix/')).resolves.toEqual([
      { key: 'prefix/a.txt', size: 1, lastModified },
      { key: 'prefix/b.txt', size: 0, lastModified: undefined },
    ]);
  });
});

function configServiceMock(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    S3_ENDPOINT: 'http://localhost:8333',
    S3_ACCESS_KEY: 'access',
    S3_SECRET_KEY: 'secret',
    S3_BUCKET_NAME: 'bucket',
    S3_REGION: 'sa-east-1',
    ...overrides,
  };

  return {
    get: jest.fn((key: string, defaultValue?: string) => values[key] ?? defaultValue),
  };
}
