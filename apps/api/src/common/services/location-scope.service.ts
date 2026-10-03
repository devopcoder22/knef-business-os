import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class LocationScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Derives a user's authorized location IDs from their UserRole records.
   *
   * Return semantics (fail-closed):
   *   null  — user has at least one org-wide role (locationId = null): unrestricted access
   *   []    — user has NO roles at all: deny all location access (fail-closed)
   *   [...] — user has only location-scoped roles: access limited to listed IDs
   *
   * Org-wide access is ONLY granted from explicit org-wide role assignment.
   * Absence of any role is NOT treated as org-wide access.
   */
  async getUserLocationIds(userId: string): Promise<string[] | null> {
    const roles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { locationId: true },
    });

    // No roles: fail-closed — user has no authorized locations
    if (roles.length === 0) return [];

    // Any org-wide role (locationId = null) → user has org-wide location access
    if (roles.some((r) => r.locationId === null)) return null;

    // All roles are location-scoped → return the authorized set
    return roles.map((r) => r.locationId as string);
  }

  /** True when locationIds is null — meaning the user has org-wide data access. */
  isOrgWide(locationIds: string[] | null): boolean {
    return locationIds === null;
  }

  /**
   * Throws ForbiddenException if the user is location-scoped and locationId
   * is not within their authorized set.
   */
  assertAccess(locationIds: string[] | null, locationId: string): void {
    if (locationIds === null) return;
    if (!locationIds.includes(locationId)) {
      throw new ForbiddenException('Not authorized for this location');
    }
  }

  /**
   * Throws ForbiddenException if any of the requested location IDs fall
   * outside the user's authorized set.
   */
  assertAllAccess(locationIds: string[] | null, requestedIds: string[]): void {
    if (locationIds === null) return;
    const unauthorized = requestedIds.filter((id) => !locationIds.includes(id));
    if (unauthorized.length > 0) {
      throw new ForbiddenException(`Not authorized for locations: ${unauthorized.join(', ')}`);
    }
  }

  /**
   * Merges a location filter into an existing Prisma WHERE object.
   * - If user is org-wide (null): WHERE is unchanged.
   * - If caller supplied a specific locationId AND user is location-scoped:
   *   validates the requested locationId, then uses it as-is.
   * - If no specific locationId supplied AND user is location-scoped:
   *   restricts to the user's authorized set.
   */
  applyToWhere(
    where: Record<string, unknown>,
    locationIds: string[] | null,
    requestedLocationId?: string | null,
    field = 'locationId',
  ): void {
    if (locationIds === null) {
      // Org-wide user: respect caller-supplied locationId as a filter, not a gate
      if (requestedLocationId) {
        where[field] = requestedLocationId;
      }
      return;
    }

    if (requestedLocationId) {
      this.assertAccess(locationIds, requestedLocationId);
      where[field] = requestedLocationId;
    } else {
      where[field] = { in: locationIds };
    }
  }

  /**
   * Returns true if the given locationId is accessible to the user.
   */
  canAccess(locationIds: string[] | null, locationId: string): boolean {
    if (locationIds === null) return true;
    return locationIds.includes(locationId);
  }
}
