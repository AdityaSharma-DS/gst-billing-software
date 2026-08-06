import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join, dirname } from 'path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';

/**
 * Per-tenant document storage. Every object is namespaced under the tenant id so
 * documents are isolated per tenant (mirrors the RLS isolation for DB rows).
 *
 * - Default driver: local disk under <cwd>/storage/tenants/<tenantId>/...
 *   served read-only at /uploads/** (see main.ts).
 * - S3 driver (when S3_BUCKET is configured): objects go to
 *   s3://<bucket>/tenants/<tenantId>/... — i.e. a per-tenant prefix. Set
 *   S3_BUCKET_PER_TENANT=true to instead use a bucket named "<bucket>-<tenantId>".
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  readonly root = join(process.cwd(), 'storage');
  private s3: any = null;
  private bucket = '';

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET') || '';
    if (this.bucket && this.config.get('S3_ACCESS_KEY_ID')) {
      // Lazy-load the SDK only when S3 is actually configured.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { S3Client } = require('@aws-sdk/client-s3');
      this.s3 = new S3Client({
        region: this.config.get('S3_REGION', 'ap-south-1'),
        credentials: {
          accessKeyId: this.config.get('S3_ACCESS_KEY_ID'),
          secretAccessKey: this.config.get('S3_SECRET_ACCESS_KEY'),
        },
      });
    }
  }

  private tenantKey(tenantId: string, category: string, filename: string) {
    return `tenants/${tenantId}/${category}/${filename}`;
  }

  private bucketFor(tenantId: string) {
    return this.config.get('S3_BUCKET_PER_TENANT') === 'true' ? `${this.bucket}-${tenantId}` : this.bucket;
  }

  /** Store an object for a tenant. Returns a URL usable by the frontend. */
  async put(tenantId: string, category: string, filename: string, data: Buffer, contentType: string): Promise<{ key: string; url: string }> {
    const key = this.tenantKey(tenantId, category, filename);
    if (this.s3) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      const bucket = this.bucketFor(tenantId);
      await this.s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: contentType }));
      const url = `https://${bucket}.s3.${this.config.get('S3_REGION', 'ap-south-1')}.amazonaws.com/${key}`;
      return { key, url };
    }
    // local disk
    const full = join(this.root, key);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, data);
    return { key, url: `/uploads/${key}` };
  }

  /** Read a locally-stored object by its public URL (used to embed logos in PDFs). */
  readByUrl(url?: string | null): Buffer | null {
    if (!url || !url.startsWith('/uploads/')) return null;
    const full = join(this.root, url.replace('/uploads/', ''));
    try {
      return existsSync(full) ? readFileSync(full) : null;
    } catch {
      return null;
    }
  }
}
