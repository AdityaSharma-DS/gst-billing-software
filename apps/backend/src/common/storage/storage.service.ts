import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join, dirname } from 'path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';

/**
 * Per-tenant document storage. Every object is namespaced under the tenant id so
 * documents are isolated per tenant (mirrors the RLS isolation for DB rows).
 *
 * Drivers (auto-selected, in priority order):
 *  1. Vercel Blob  — when BLOB_READ_WRITE_TOKEN is set. Durable, CDN-served
 *     public URLs. Recommended for the Vercel serverless deployment.
 *  2. S3-compatible — when S3_BUCKET (+ S3_ACCESS_KEY_ID) is set (AWS S3,
 *     Cloudflare R2, Backblaze B2…). Objects go under tenants/<tenantId>/…
 *  3. Local disk   — default for dev: <cwd>/storage/… served at /uploads/**
 *     (see main.ts). On Vercel this falls back to /tmp, which is EPHEMERAL, so
 *     configure Blob or S3 for durable documents in production.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  readonly root = process.env.VERCEL ? '/tmp/storage' : join(process.cwd(), 'storage');
  private s3: any = null;
  private bucket = '';
  private blobToken = '';

  constructor(private readonly config: ConfigService) {
    this.blobToken = this.config.get<string>('BLOB_READ_WRITE_TOKEN') || '';
    this.bucket = this.config.get<string>('S3_BUCKET') || '';
    if (!this.blobToken && this.bucket && this.config.get('S3_ACCESS_KEY_ID')) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { S3Client } = require('@aws-sdk/client-s3');
      this.s3 = new S3Client({
        region: this.config.get('S3_REGION', 'ap-south-1'),
        endpoint: this.config.get('S3_ENDPOINT') || undefined, // set for R2/B2/MinIO
        forcePathStyle: this.config.get('S3_FORCE_PATH_STYLE') === 'true',
        credentials: {
          accessKeyId: this.config.get('S3_ACCESS_KEY_ID'),
          secretAccessKey: this.config.get('S3_SECRET_ACCESS_KEY'),
        },
      });
    }
    this.logger.log(`Storage driver: ${this.blobToken ? 'Vercel Blob' : this.s3 ? 'S3' : 'local disk'}`);
  }

  /** True when a durable (non-ephemeral) driver is configured. */
  get isDurable(): boolean {
    return !!this.blobToken || !!this.s3;
  }

  private tenantKey(tenantId: string, category: string, filename: string) {
    return `tenants/${tenantId}/${category}/${filename}`;
  }

  private bucketFor(tenantId: string) {
    return this.config.get('S3_BUCKET_PER_TENANT') === 'true' ? `${this.bucket}-${tenantId}` : this.bucket;
  }

  /** Store an object for a tenant. Returns a URL usable by the frontend / PDFs. */
  async put(tenantId: string, category: string, filename: string, data: Buffer, contentType: string): Promise<{ key: string; url: string }> {
    const key = this.tenantKey(tenantId, category, filename);

    if (this.blobToken) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { put } = require('@vercel/blob');
      const res = await put(key, data, {
        access: 'public',
        contentType,
        token: this.blobToken,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return { key, url: res.url };
    }

    if (this.s3) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      const bucket = this.bucketFor(tenantId);
      await this.s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: contentType }));
      const base = this.config.get<string>('S3_PUBLIC_URL')
        || `https://${bucket}.s3.${this.config.get('S3_REGION', 'ap-south-1')}.amazonaws.com`;
      return { key, url: `${base.replace(/\/+$/, '')}/${key}` };
    }

    // local disk
    const full = join(this.root, key);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, data);
    return { key, url: `/uploads/${key}` };
  }

  /**
   * Read a stored object by its URL (used to embed logos in PDFs and to
   * re-download archived return JSON). Handles both local `/uploads/…` paths
   * and remote http(s) URLs (Vercel Blob / S3).
   */
  async readByUrl(url?: string | null): Promise<Buffer | null> {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
      } catch (e: any) {
        this.logger.warn(`Failed to fetch stored object ${url}: ${e?.message}`);
        return null;
      }
    }
    if (url.startsWith('/uploads/')) {
      const full = join(this.root, url.replace('/uploads/', ''));
      try {
        return existsSync(full) ? readFileSync(full) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}
