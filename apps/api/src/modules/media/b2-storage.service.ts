import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { Readable } from "node:stream";

export type MediaVisibility = "staged" | "public";

export type B2Settings = {
  endpoint: string;
  region: string;
  bucket: string;
};

function assertHttpsUrl(name: string, value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} debe ser una URL HTTPS válida.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${name} debe ser una URL HTTPS sin credenciales embebidas.`);
  }
}

@Injectable()
export class B2StorageService implements OnModuleInit {
  private client: S3Client | null = null;

  onModuleInit() {
    if (this.isConfigured) this.settings();
  }

  get isConfigured() {
    return process.env.MEDIA_STORAGE_PROVIDER === "b2";
  }

  settings(): B2Settings {
    const endpoint = process.env.B2_ENDPOINT;
    const region = process.env.B2_REGION;
    const bucket = process.env.B2_BUCKET;
    if (
      !endpoint ||
      !region ||
      !bucket ||
      !process.env.B2_ACCESS_KEY_ID ||
      !process.env.B2_SECRET_ACCESS_KEY
    ) {
      throw new Error(
        "B2 requiere B2_ENDPOINT, B2_REGION, B2_BUCKET, B2_ACCESS_KEY_ID y B2_SECRET_ACCESS_KEY.",
      );
    }
    assertHttpsUrl("B2_ENDPOINT", endpoint);
    return {
      endpoint: endpoint.replace(/\/$/, ""),
      region,
      bucket,
    };
  }

  bucket(_visibility: MediaVisibility) {
    // Application visibility does not change bucket ACLs; every object stays private in B2.
    return this.settings().bucket;
  }

  async createPresignedPutUrl(args: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds?: number;
  }) {
    const command = new PutObjectCommand({
      Bucket: this.bucket("staged"),
      Key: args.key,
      ContentType: args.contentType,
      ContentLength: args.contentLength,
    });
    return getSignedUrl(this.getClient(), command, {
      expiresIn: args.expiresInSeconds ?? 600,
    });
  }

  async createPresignedGetUrl(args: {
    key: string;
    expiresInSeconds?: number;
  }) {
    const command = new GetObjectCommand({
      Bucket: this.bucket("public"),
      Key: args.key,
    });
    return getSignedUrl(this.getClient(), command, {
      expiresIn: args.expiresInSeconds ?? 600,
    });
  }

  async head(key: string, visibility: MediaVisibility) {
    const response = await this.getClient().send(
      new HeadObjectCommand({ Bucket: this.bucket(visibility), Key: key }),
    );
    return {
      sizeBytes: response.ContentLength ?? 0,
      mimeType: response.ContentType ?? "application/octet-stream",
    };
  }

  async getBuffer(
    key: string,
    visibility: MediaVisibility,
    maxBytes: number,
  ) {
    const response = await this.getClient().send(
      new GetObjectCommand({ Bucket: this.bucket(visibility), Key: key }),
    );
    if (!response.Body) throw new Error("B2 devolvió un objeto sin contenido.");
    if ((response.ContentLength ?? 0) > maxBytes) {
      throw new Error("El objeto supera el tamaño máximo permitido.");
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of response.Body as Readable) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        throw new Error("El objeto supera el tamaño máximo permitido.");
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, total);
  }

  async getStream(key: string, visibility: MediaVisibility) {
    const response = await this.getClient().send(
      new GetObjectCommand({ Bucket: this.bucket(visibility), Key: key }),
    );
    if (!response.Body) throw new Error("B2 devolvió un objeto sin contenido.");
    return response.Body as Readable;
  }

  async putBuffer(
    key: string,
    body: Buffer,
    contentType: string,
    visibility: MediaVisibility,
  ) {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket(visibility),
        Key: key,
        Body: body,
        ContentLength: body.length,
        ContentType: contentType,
        CacheControl:
          visibility === "public"
            ? "public, max-age=31536000, immutable"
            : "private, no-store",
      }),
    );
  }

  async delete(key: string) {
    await this.getClient().send(
      new DeleteObjectCommand({ Bucket: this.bucket("staged"), Key: key }),
    );
  }

  private getClient() {
    if (this.client) return this.client;
    const settings = this.settings();
    const accessKeyId = process.env.B2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.B2_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("Faltan las credenciales S3 de B2 para el bucket privado.");
    }
    this.client = new S3Client({
      region: settings.region,
      endpoint: settings.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }
}
