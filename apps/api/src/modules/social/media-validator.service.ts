import { Injectable } from '@nestjs/common';
import { MediaAsset } from '@prisma/client';

export interface PlatformMediaSpec {
  allowedMimeTypes: string[];
  maxFileSizeBytes: number;
  maxDurationSeconds?: number;
  minWidth?: number;
  minHeight?: number;
}

const SPECS: Record<string, PlatformMediaSpec> = {
  FACEBOOK_IMAGE: {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxFileSizeBytes: 10_485_760,
  },
  FACEBOOK_VIDEO: {
    allowedMimeTypes: ['video/mp4', 'video/quicktime'],
    maxFileSizeBytes: 4_000_000_000,
    maxDurationSeconds: 14400,
  },
  INSTAGRAM_IMAGE: {
    allowedMimeTypes: ['image/jpeg'],
    maxFileSizeBytes: 8_388_608,
    minWidth: 320,
    minHeight: 320,
  },
  INSTAGRAM_VIDEO: {
    allowedMimeTypes: ['video/mp4', 'video/quicktime'],
    maxFileSizeBytes: 100_000_000,
    maxDurationSeconds: 3600,
  },
  TIKTOK_VIDEO: {
    allowedMimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    maxFileSizeBytes: 4_000_000_000,
    maxDurationSeconds: 600,
  },
  TIKTOK_PHOTO: {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSizeBytes: 20_971_520,
  },
};

@Injectable()
export class MediaValidatorService {
  validateAsset(asset: MediaAsset, specKey: string): string[] {
    const spec = SPECS[specKey];
    if (!spec) return [];
    const errors: string[] = [];
    if (!spec.allowedMimeTypes.includes(asset.mimeType)) {
      errors.push(
        `${asset.filename}: unsupported format ${asset.mimeType} for ${specKey}. Allowed: ${spec.allowedMimeTypes.join(', ')}.`,
      );
    }
    if (asset.size > spec.maxFileSizeBytes) {
      errors.push(
        `${asset.filename}: file size ${asset.size} exceeds ${spec.maxFileSizeBytes / 1_048_576} MB limit for ${specKey}.`,
      );
    }
    if (spec.minWidth && asset.width && asset.width < spec.minWidth) {
      errors.push(
        `${asset.filename}: width ${asset.width}px is below minimum ${spec.minWidth}px.`,
      );
    }
    if (spec.minHeight && asset.height && asset.height < spec.minHeight) {
      errors.push(
        `${asset.filename}: height ${asset.height}px is below minimum ${spec.minHeight}px.`,
      );
    }
    return errors;
  }
}
