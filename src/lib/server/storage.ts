import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { db } from "./db";

// Private object storage. Keys are random server-generated identifiers; user input never
// becomes part of a key, so path traversal and overwrites are impossible by construction.

export interface ObjectStore {
  driver: "db" | "local" | "s3";
  /** Writes a new object; fails if the key already exists (no overwrite). */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  /** Short-lived direct URL (S3 only). Offloads photo traffic from the app servers. */
  signedUrl?(key: string, ttlSec: number, opts?: { disposition?: string; contentType?: string }): Promise<string>;
  /** Object size in bytes without downloading it (null if missing). */
  size?(key: string): Promise<number | null>;
  /** Short-lived presigned PUT for a quarantine key (S3 only). Other drivers upload through the app. */
  signedUploadUrl?(key: string, ttlSec: number, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
}

// photos/<patient>/<uuid>[-thumb].webp  ·  (lesions|remote)/<patient>/<uuid>.(jpg|png|webp) + -preview.webp
// quarantine/<patient>/<uuid>.upload (untrusted, unvalidated browser uploads; deleted after checks)
const KEY_RE = /^(photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}(-thumb)?\.webp|(lesions|remote)\/[0-9a-f-]{36}\/[0-9a-f-]{36}(\.(jpg|png|webp)|-preview\.webp)|quarantine\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.upload)$/;
function assertKey(key: string) {
  if (!KEY_RE.test(key)) throw new Error("invalid object key");
}

const dbStore: ObjectStore = {
  driver: "db",
  async put(key, data, contentType) {
    assertKey(key);
    const d = await db();
    await d.query("insert into blob_objects (key, content_type, bytes, data) values ($1, $2, $3, $4)", [key, contentType, data.length, data]);
  },
  async get(key) {
    assertKey(key);
    const d = await db();
    const r = await d.query<{ data: Uint8Array; content_type: string }>("select data, content_type from blob_objects where key = $1", [key]);
    const row = r.rows[0];
    return row ? { data: Buffer.from(row.data), contentType: row.content_type } : null;
  },
  async delete(key) {
    assertKey(key);
    const d = await db();
    await d.query("delete from blob_objects where key = $1", [key]);
  },
};

function localStore(): ObjectStore {
  const root = path.resolve(config().LOCAL_STORAGE_DIR);
  const resolve = (key: string) => {
    assertKey(key);
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error("invalid object path");
    return p;
  };
  return {
    driver: "local",
    async put(key, data) {
      const p = resolve(key);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, data, { flag: "wx", mode: 0o600 });
    },
    async get(key) {
      try {
        const ext = key.slice(key.lastIndexOf(".") + 1);
        return { data: await fs.readFile(resolve(key)), contentType: ext === "jpg" ? "image/jpeg" : ext === "upload" ? "application/octet-stream" : `image/${ext}` };
      } catch {
        return null;
      }
    },
    async delete(key) {
      await fs.rm(resolve(key), { force: true });
    },
  };
}

function s3Store(kind: StoreKind): ObjectStore {
  const c = config();
  const clinical = kind === "clinical";
  const bucket = clinical ? c.CLINICAL_S3_BUCKET! : c.S3_BUCKET!;
  const kmsKey = clinical ? c.CLINICAL_S3_KMS_KEY_ID : c.S3_KMS_KEY_ID;
  const clientP = import("@aws-sdk/client-s3").then(({ S3Client }) => new S3Client({ region: c.AWS_REGION }));
  return {
    driver: "s3",
    async put(key, data, contentType) {
      assertKey(key);
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      await (await clientP).send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
          IfNoneMatch: "*", // never overwrite
          ServerSideEncryption: kmsKey ? "aws:kms" : "AES256",
          SSEKMSKeyId: kmsKey || undefined,
          CacheControl: clinical ? "private, no-store" : "private, max-age=3600, immutable",
        }),
      );
    },
    async get(key) {
      assertKey(key);
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      try {
        const r = await (await clientP).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = await r.Body!.transformToByteArray();
        return { data: Buffer.from(bytes), contentType: r.ContentType ?? "image/webp" };
      } catch {
        return null;
      }
    },
    async signedUrl(key, ttlSec, opts) {
      assertKey(key);
      const [{ GetObjectCommand }, { getSignedUrl }] = await Promise.all([import("@aws-sdk/client-s3"), import("@aws-sdk/s3-request-presigner")]);
      return getSignedUrl(
        await clientP,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentDisposition: opts?.disposition,
          ResponseContentType: opts?.contentType,
          ResponseCacheControl: clinical ? "private, no-store" : undefined,
        }),
        { expiresIn: ttlSec },
      );
    },
    async size(key) {
      assertKey(key);
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      try {
        return (await (await clientP).send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength ?? null;
      } catch {
        return null;
      }
    },
    async signedUploadUrl(key, ttlSec, contentType) {
      assertKey(key);
      if (!key.startsWith("quarantine/")) throw new Error("uploads go to quarantine only");
      const [{ PutObjectCommand }, { getSignedUrl }] = await Promise.all([import("@aws-sdk/client-s3"), import("@aws-sdk/s3-request-presigner")]);
      return getSignedUrl(
        await clientP,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ServerSideEncryption: kmsKey ? "aws:kms" : "AES256", SSEKMSKeyId: kmsKey || undefined }),
        { expiresIn: ttlSec },
      );
    },
    async delete(key) {
      assertKey(key);
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await (await clientP).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

export type StoreKind = "photos" | "clinical";
const stores = new Map<StoreKind, ObjectStore>();
/**
 * Identity photos and clinical lesion images use separate stores; in production clinical images
 * go to their own private, KMS-encrypted bucket (never the report or photo bucket).
 */
export function objectStore(kind: StoreKind = "photos"): ObjectStore {
  let s = stores.get(kind);
  if (!s) {
    const d = config().STORAGE_DRIVER;
    s = d === "s3" ? s3Store(kind) : d === "local" ? localStore() : dbStore;
    stores.set(kind, s);
  }
  return s;
}
export function resetObjectStoreForTests() {
  stores.clear();
}
