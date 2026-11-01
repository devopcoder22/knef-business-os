import { SetMetadata } from '@nestjs/common';
import type { ApiScope } from '@knef/constants';

export const API_SCOPE_KEY = 'api_scopes';

export const RequireApiScope = (...scopes: ApiScope[]) =>
  SetMetadata(API_SCOPE_KEY, scopes);
