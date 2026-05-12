import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('S3_SECRET_KEY');
    const bucketName = this.configService.get<string>('S3_BUCKET_NAME');
    const region = this.configService.get<string>('S3_REGION', 'us-east-1');

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error(
        'S3 configuration is incomplete. Please check S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET_NAME environment variables.',
      );
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

  /**
   * Upload a file to S3-compatible storage
   */
  async uploadFile(
    key: string,
    body: Buffer | Readable,
    contentType?: string,
    metadata?: Record<string, string>,
  ): Promise<{ key: string; size: number }> {
    try {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body instanceof Buffer ? body.length : undefined,
          Metadata: metadata,
        },
      });

      await upload.done();

      // Get file size
      const headResult = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      this.logger.log(`File uploaded successfully: ${key}`);
      return {
        key,
        size: headResult.ContentLength || 0,
      };
    } catch (error: unknown) {
      this.logger.error(`Failed to upload file ${key}:`, error);
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

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
      throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a file from S3-compatible storage
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error: unknown) {
      this.logger.error(`Failed to delete file ${key}:`, error);
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a file exists in S3-compatible storage
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
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
      const response = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
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
      throw new Error(`Failed to get file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const response = await this.s3Client.send(command);

      return (response.Contents || []).map((obj) => ({
        key: obj.Key!,
        size: obj.Size || 0,
        lastModified: obj.LastModified,
      }));
    } catch (error: unknown) {
      this.logger.error(`Failed to list files with prefix ${prefix}:`, error);
      throw new Error(`Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
}
