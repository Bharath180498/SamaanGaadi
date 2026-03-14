import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isUnsetOrPlaceholder } from './config-placeholder.util';

const DEFAULT_S3_REGION = 'ap-south-1';
const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;

interface S3UploadConfig {
  endpoint?: string | null;
  region?: string | null;
  bucket?: string | null;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
}

interface BuildS3UploadUrlInput {
  fileKey: string;
  contentType?: string;
  expiresInSeconds?: number;
}

interface S3UploadUrlResult {
  uploadUrl: string;
  fileUrl: string;
  mode: string;
}

interface BuildS3DownloadUrlInput {
  fileKey: string;
  expiresInSeconds?: number;
}

function encodeObjectKeyForUrl(fileKey: string) {
  return fileKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizeRegion(value?: string | null) {
  const normalized = (value ?? '').trim();
  return normalized || DEFAULT_S3_REGION;
}

export function isS3UploadConfigured(config: S3UploadConfig) {
  return (
    !isUnsetOrPlaceholder(config.endpoint) &&
    !isUnsetOrPlaceholder(config.bucket) &&
    !isUnsetOrPlaceholder(config.accessKeyId) &&
    !isUnsetOrPlaceholder(config.secretAccessKey)
  );
}

export async function buildS3UploadUrl(
  config: S3UploadConfig,
  input: BuildS3UploadUrlInput
): Promise<S3UploadUrlResult | null> {
  if (!isS3UploadConfigured(config)) {
    return null;
  }

  const endpoint = String(config.endpoint).trim().replace(/\/$/, '');
  const bucket = String(config.bucket).trim();
  const region = normalizeRegion(config.region);
  const accessKeyId = String(config.accessKeyId).trim();
  const secretAccessKey = String(config.secretAccessKey).trim();
  const contentType = input.contentType?.trim();

  const s3 = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  const putCommand = new PutObjectCommand({
    Bucket: bucket,
    Key: input.fileKey,
    ...(contentType ? { ContentType: contentType } : {})
  });

  const uploadUrl = await getSignedUrl(s3, putCommand, {
    expiresIn: input.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS
  });

  return {
    uploadUrl,
    fileUrl: `${endpoint}/${bucket}/${encodeObjectKeyForUrl(input.fileKey)}`,
    mode: `s3-${region}`
  };
}

export async function buildS3DownloadUrl(
  config: S3UploadConfig,
  input: BuildS3DownloadUrlInput
): Promise<string | null> {
  if (!isS3UploadConfigured(config)) {
    return null;
  }

  const normalizedKey = input.fileKey.trim();
  if (!normalizedKey) {
    return null;
  }

  const endpoint = String(config.endpoint).trim().replace(/\/$/, '');
  const bucket = String(config.bucket).trim();
  const region = normalizeRegion(config.region);
  const accessKeyId = String(config.accessKeyId).trim();
  const secretAccessKey = String(config.secretAccessKey).trim();

  const s3 = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  try {
    return await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucket,
        Key: normalizedKey
      }),
      {
        expiresIn: input.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS
      }
    );
  } catch {
    return null;
  }
}
