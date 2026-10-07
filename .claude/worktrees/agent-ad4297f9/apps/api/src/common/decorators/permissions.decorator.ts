import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@knef/constants';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (
  ...permissions: Permission[]
): ReturnType<typeof SetMetadata> => SetMetadata(PERMISSIONS_KEY, permissions);
