export interface JwtPayload {
  sub: string;      // userId
  orgId: string;    // organizationId
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
  locationIds: string[] | null; // null = all locations
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  expiresIn: number;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}
