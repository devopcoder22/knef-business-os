import { SetMetadata } from '@nestjs/common';
import type { FeatureFlagKey } from '@knef/constants';

export const FEATURE_KEY = 'requiredFeature';
export const RequireFeature = (
  feature: FeatureFlagKey,
): ReturnType<typeof SetMetadata> => SetMetadata(FEATURE_KEY, feature);
