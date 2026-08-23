import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

export interface S3Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region: string;
}

export class S3ServiceError extends Error {
  readonly code?: string;
  readonly statusCode?: number;
  readonly requestId?: string;

  constructor(message: string, cause: unknown) {
    super(message);
    Object.defineProperty(this, 'cause', { value: cause, configurable: true });
    this.name = 'S3ServiceError';
    const metadata = readAwsMetadata(cause);
    this.code = metadata.code;
    this.statusCode = metadata.statusCode;
    this.requestId = metadata.requestId;
  }
}

@Injectable()
export class S3Service implements OnModuleDestroy {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client?: S3Client;
  private readonly bucketName?: string;
  private destroyed = false;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('S3_SECRET_KEY');
    const bucketName = this.configService.get<string>('S3_BUCKET_NAME');
    const region = this.configService.get<string>('S3_REGION', 'us-east-1');

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
      this.logger.warn(
        'S3 configuration is incomplete. Please check S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET_NAME environment variables.',
      );
      return;
    }

    this.bucketName = bucketName;

    // Configure S3 client for SeaweedFS
    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Required for SeaweedFS S3 API
    });

    this.logger.log(`S3Service initialized with endpoint: ${endpoint}, bucket: ${bucketName}`);
  }

  onModuleDestroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.s3Client?.destroy();
  }

  /**
   * Upload a file to S3-compatible storage
   */
  async uploadFile(
    key: string,
    body: Buffer | Readable,
    contentType?: string,
    metadata?: Record<string, string>,
    expiresAt?: Date,
  ): Promise<{ key: string; size: number }> {
    try {
      const { s3Client, bucketName } = this.requireConfig();
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: bucketName,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body instanceof Buffer ? body.length : undefined,
          Metadata: metadata,
          Expires: expiresAt,
        },
      });

      await upload.done();

      // Buffer uploads already know their size. A post-upload HEAD request
      // must not turn a successful write into a retryable failure.
      let size = body instanceof Buffer ? body.length : 0;
      if (!(body instanceof Buffer)) {
        try {
          const headResult = await s3Client.send(
            new HeadObjectCommand({
              Bucket: bucketName,
              Key: key,
            }),
          );
          size = headResult.ContentLength || 0;
        } catch (error: unknown) {
          this.logger.warn(`Uploaded file ${key}, but metadata verification failed: ${formatAwsError(error)}`);
        }
      }

      this.logger.log(`File uploaded successfully: ${key}`);
      return {
        key,
        size,
      };
    } catch (error: unknown) {
      this.logger.error(`Failed to upload file ${key}:`, error);
      throw new S3ServiceError(`Failed to upload file: ${formatAwsError(error)}`, error);
    }
  }

  /**
   * Download a file from S3-compatible storage
   */
  async downloadFile(key: string): Promise<{
    stream: Readable;
    contentType?: string;
    contentLength?: number;
    metadata?: Record<string, string>;
  }> {
    try {
      const { s3Client, bucketName } = this.requireConfig();
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const response = await s3Client.send(command);

      if (!response.Body) {
        throw new Error('File not found or empty');
      }

      return {
        stream: response.Body as Readable,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        metadata: response.Metadata,
      };
    } catch (error: unknown) {
      this.logger.error(`Failed to download file ${key}:`, error);
      throw new S3ServiceError(`Failed to download file: ${formatAwsError(error)}`, error);
    }
  }

  /**
   * Delete a file from S3-compatible storage
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const { s3Client, bucketName } = this.requireConfig();
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
      );

      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error: unknown) {
      this.logger.error(`Failed to delete file ${key}:`, error);
      throw new S3ServiceError(`Failed to delete file: ${formatAwsError(error)}`, error);
    }
  }

  /**
   * Check if a file exists in S3-compatible storage
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const { s3Client, bucketName } = this.requireConfig();
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
      );
      return true;
    } catch (error: unknown) {
      // Check if this is an S3 NotFound error
      const isNotFound =
        (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') ||
        (error &&
          typeof error === 'object' &&
          '$metadata' in error &&
          error.$metadata &&
          typeof error.$metadata === 'object' &&
          'httpStatusCode' in error.$metadata &&
          error.$metadata.httpStatusCode === 404);

      if (isNotFound) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata without downloading the content
   */
  async getFileMetadata(key: string): Promise<{
    size: number;
    lastModified?: Date;
    contentType?: string;
    metadata?: Record<string, string>;
  }> {
    try {
      const { s3Client, bucketName } = this.requireConfig();
      const response = await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
      );

      return {
        size: response.ContentLength || 0,
        lastModified: response.LastModified,
        contentType: response.ContentType,
        metadata: response.Metadata,
      };
    } catch (error: unknown) {
      this.logger.error(`Failed to get metadata for file ${key}:`, error);
      throw new S3ServiceError(`Failed to get file metadata: ${formatAwsError(error)}`, error);
    }
  }

  /**
   * List files in a directory (prefix)
   */
  async listFiles(prefix?: string): Promise<
    Array<{
      key: string;
      size: number;
      lastModified?: Date;
    }>
  > {
    try {
      const { s3Client, bucketName } = this.requireConfig();
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
      });

      const response = await s3Client.send(command);

      return (response.Contents || []).map((obj) => ({
        key: obj.Key ?? '',
        size: obj.Size || 0,
        lastModified: obj.LastModified,
      }));
    } catch (error: unknown) {
      this.logger.error(`Failed to list files with prefix ${prefix}:`, error);
      throw new S3ServiceError(`Failed to list files: ${formatAwsError(error)}`, error);
    }
  }

  /**
   * Generate a standard key for file storage
   * Format: {category}/{userId}/{timestamp}-{filename}
   */
  generateFileKey(
    category: 'lgpd' | 'student-verification',
    userId: string,
    filename: string,
    timestamp?: Date,
  ): string {
    const ts = timestamp || new Date();
    const timestampStr = ts.toISOString().replace(/[:.]/g, '-');
    return `${category}/${userId}/${timestampStr}-${filename}`;
  }

  private requireConfig(): { s3Client: S3Client; bucketName: string } {
    if (!this.s3Client || !this.bucketName) {
      throw new Error(
        'S3 configuration is incomplete. Please check S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET_NAME environment variables.',
      );
    }

    return {
      s3Client: this.s3Client,
      bucketName: this.bucketName,
    };
  }
}

function formatAwsError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

function readAwsMetadata(error: unknown): {
  code?: string;
  statusCode?: number;
  requestId?: string;
} {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const record = error as Record<string, unknown>;
  const metadata = record['$metadata'];
  const metadataRecord = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : undefined;
  return {
    code:
      typeof record['Code'] === 'string'
        ? record['Code']
        : typeof record['code'] === 'string'
          ? record['code']
          : typeof record['name'] === 'string'
            ? record['name']
            : undefined,
    statusCode:
      typeof metadataRecord?.['httpStatusCode'] === 'number' ? metadataRecord['httpStatusCode'] : undefined,
    requestId:
      typeof metadataRecord?.['requestId'] === 'string' ? metadataRecord['requestId'] : undefined,
  };
}
