import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

// Lazy singleton — created on first use so importing this module during tests
// doesn't throw if R2 env vars aren't set.
let _r2: S3Client | null = null;

function getR2Client(): S3Client {
  if (!_r2) {
    _r2 = new S3Client({
      region: "auto",
      endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return _r2;
}

function getBucket(): string {
  return requireEnv("R2_BUCKET_NAME");
}

/** Download an object from R2 and return it as a Buffer for the AI pipeline. */
export async function downloadFromR2(key: string): Promise<Buffer> {
  const response = await getR2Client().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key })
  );

  if (!response.Body) {
    throw new Error(`R2 object "${key}" returned an empty body.`);
  }

  return streamToBuffer(response.Body as Readable);
}

/** Collect a Node.js Readable stream into a single Buffer. */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Throw clearly if a required env var is missing — fail at call time, not import time. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Check your .env file and docker-compose.yml.`
    );
  }
  return value;
}
