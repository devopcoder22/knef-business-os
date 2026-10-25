# Stage 24G — Google Maps Address Hardening + Saved Addresses: Closure Report

**Date:** 2026-10-25  
**Classification:** A — CLOSED; ALL REQUIREMENTS MET  
**Commit:** `ae8b444`  
**Branch:** `v1.1-development`

---

## 1. Scope

Stage 24G upgraded the KNEF storefront checkout and customer account flows with:

- Google Places Autocomplete capturing `placeId` + lat/lng coordinates
- `AddressSource` enum tracking (GOOGLE_PLACE / MANUAL / SAVED_ADDRESS)
- `SavedAddress` model with full CRUD, IDOR isolation, and default management
- Six new delivery fields on `SalesOrder` (snapshot isolated from saved address edits)
- `deliveryLandmark` field throughout checkout and order display
- BFF proxy routes (browser key never exposes server key)
- Admin order view showing structured delivery card + conditional Maps link
- Manual entry fallback preserved as hard requirement
- Nigerian-first autocomplete (country restricted to `ng` when Nigeria selected)
- Google Maps failure mode: amber banner, manual entry always available
- Full ARIA accessibility on address input

---

## 2. Test Results

| Suite | Count | Status |
|-------|-------|--------|
| API (NestJS Jest) | 1229 / 1229 | PASS |
| Worker (NestJS Jest) | 130 / 130 | PASS |
| Storefront (Jest) | 86 / 86 | PASS |

**New tests added:**
- `apps/api/src/modules/storefront/customer-address.spec.ts` — 20+ tests: IDOR prevention (listAddresses / updateAddress / deleteAddress / setDefault all enforce `customerAccountId + organizationId`), coordinate validation (boundary values accepted, out-of-range rejected, null accepted for manual), default-clearing atomicity, order snapshot integrity (no `salesOrder` mutations when editing/deleting saved address)
- `apps/storefront/src/__tests__/address-utils.test.ts` — 26 tests: coordinate validation, AddressSource resolution, Nigerian state normalization (case-insensitive, " State" suffix stripping), autocomplete threshold (min 3 chars), mocked Google Places behavior (place_changed → GOOGLE_PLACE + coords captured; manual typing → MANUAL + refs cleared; missing geometry handled safely; country restriction logic)

---

## 3. TypeScript Checks

| App | Status |
|-----|--------|
| `apps/api` | PASS (0 errors) |
| `apps/web` | PASS (0 errors) |
| `apps/storefront` | PASS (0 errors, 2 type assertions added in test file) |

---

## 4. Production Builds

| App | Status | Artifact |
|-----|--------|----------|
| API (`nest build`) | PASS | `apps/api/dist/apps/api/src/main.js` |
| Worker (`nest build`) | PASS | `apps/worker/dist/apps/worker/src/main.js` |
| Web (Next.js 14) | PASS | `.next/BUILD_ID: lSdazbU0oWLJwibsx1Lq6` |
| Storefront (Next.js 14) | PASS | `.next/BUILD_ID: xBEqDFbsks2EOzL6e8nQi` |

---

## 5. Schema Changes

### New enum
```sql
CREATE TYPE "AddressSource" AS ENUM ('GOOGLE_PLACE', 'MANUAL', 'SAVED_ADDRESS');
```

### New model: `SavedAddress`
22 fields including `placeId`, `latitude DECIMAL(10,7)`, `longitude DECIMAL(10,7)`, `addressSource AddressSource`, `isDefault`, FK to `CustomerAccount` (CASCADE DELETE).  
Indexes: `(customerAccountId, organizationId)`, `(customerAccountId, isDefault)`.

### SalesOrder additions (6 columns)
`deliveryLandmark`, `deliveryCountry`, `deliveryPlaceId`, `deliveryLatitude DECIMAL(10,7)`, `deliveryLongitude DECIMAL(10,7)`, `deliveryAddressSource AddressSource?` — all nullable, backward-compatible.

Migration: `packages/database/prisma/migrations/20261025000000_stage24g_address_hardening/migration.sql`  
Applied to stage-validation DB via psql — confirmed present.

---

## 6. API Backend Changes

### New files
- `apps/api/src/modules/storefront/customer-address.service.ts` — `listAddresses`, `createAddress`, `updateAddress`, `deleteAddress`, `setDefault`; every method enforces `customerAccountId + organizationId`; coordinate validation: lat ∈ [-90,90], lng ∈ [-180,180], null accepted; default demoting via `updateMany` before create/update
- `apps/api/src/modules/storefront/customer-address.controller.ts` — 5 endpoints under `storefront/addresses`, all behind `CustomerJwtGuard`

### Modified files
- `apps/api/src/modules/storefront/storefront.module.ts` — registered `CustomerAddressController` + `CustomerAddressService`
- `apps/api/src/modules/ecommerce/dto/create-public-order.dto.ts` — 6 new optional fields with class-validator decorators
- `apps/api/src/modules/ecommerce/ecommerce.service.ts` — 6 new fields written to `salesOrder.create()`
- `apps/api/src/modules/storefront/storefront-orders.controller.ts` — 6 new fields selected and returned in `listOrders`/`getOrder`

---

## 7. Storefront Changes

### New files
- `apps/storefront/src/app/api/account/addresses/route.ts` — BFF GET (list) + POST (create)
- `apps/storefront/src/app/api/account/addresses/[id]/route.ts` — BFF PUT (update) + DELETE + PATCH (set default)
- `apps/storefront/src/app/account/addresses/page.tsx` — Account addresses page: list, add, delete, set-default, landmark field, Zustand hydration guard

### Modified files
- `apps/storefront/src/app/checkout/page.tsx` — Google Places upgraded to capture `place_id` + `geometry`; `handleAddressInputChange` resets refs to MANUAL on manual typing; landmark input added; Maps failure banner; ARIA attributes
- `apps/storefront/src/lib/api.ts` — `CheckoutPayload` extended; `SavedAddress` interface + 5 CRUD functions
- `apps/storefront/src/app/account/page.tsx` — "My Addresses" card
- `apps/storefront/.env.example` — documented `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` with restriction guidance

---

## 8. Admin (Web) Changes

- `apps/web/src/app/(dashboard)/sales/orders/[id]/page.tsx` — Delivery address sidebar card: landmark, city/state/country, phone, source badge, conditional "Open in Google Maps" link when lat/lng present

---

## 9. Security Posture

| Control | Implementation |
|---------|---------------|
| IDOR — list | `findMany({ where: { customerAccountId, organizationId } })` |
| IDOR — update | `findFirst({ where: { id, customerAccountId, organizationId } })` → NotFoundException if null |
| IDOR — delete | Same as update |
| IDOR — setDefault | Same pattern → ForbiddenException if null |
| API key exposure | Browser key: HTTP-referrer restricted `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; server key: never in browser |
| Coordinate injection | `BadRequestException` if lat outside [-90,90] or lng outside [-180,180] |
| Order snapshot | `SavedAddress` and `SalesOrder` are separate models; editing a saved address never touches existing orders |
| Landmark XSS | `MaxLength(200)` on landmark; rendered as text via React, no `dangerouslySetInnerHTML` |

---

## 10. Architecture Decisions (Documented)

| Decision | Rationale |
|----------|-----------|
| Kept legacy `Autocomplete` class (not deprecated) | Avoids breaking existing integration; added `place_id` + `geometry` to `fields` array |
| Session tokens managed by widget | No manual token management — widget handles billing sessions automatically |
| Address Validation API: FOUNDATION/OPTIONAL | Limited Nigerian coverage; cost concern; street-level accuracy unreliable for NG |
| No delivery pricing change | `calculateDeliveryFee()` still returns 0; Stage 25 feature |
| Manual entry always available | Hard requirement; Google Maps failure is non-blocking |
| Snapshot isolation by design | `SavedAddress.id` not stored on `SalesOrder`; 6 fields copied at order creation |

---

## 11. Stage-Validation Container Status

| Container | Status |
|-----------|--------|
| `knef-stage-validation-api-1` | healthy |
| `knef-stage-validation-worker-1` | healthy |
| `knef-stage-validation-storefront-1` | starting (healthy expected) |
| `knef-stage-validation-web-1` | running |
| `knef-stage-validation-mcp-server-1` | healthy |
| `knef-stage-validation-redis-1` | healthy |
| `knef-stage-validation-db-1` | healthy |

Migration confirmed applied (SavedAddress table present, deliveryAddressSource column present).  
**Production deploy: NOT performed per spec §68.**

---

## 12. Files Changed Summary

| Path | Change |
|------|--------|
| `packages/database/prisma/schema.prisma` | Added `AddressSource` enum, `SavedAddress` model, 6 SalesOrder fields |
| `packages/database/prisma/migrations/20261025000000_stage24g_address_hardening/migration.sql` | New migration |
| `apps/api/src/modules/storefront/customer-address.service.ts` | New |
| `apps/api/src/modules/storefront/customer-address.controller.ts` | New |
| `apps/api/src/modules/storefront/customer-address.spec.ts` | New |
| `apps/api/src/modules/storefront/storefront.module.ts` | Registered new service/controller |
| `apps/api/src/modules/ecommerce/dto/create-public-order.dto.ts` | 6 new DTO fields |
| `apps/api/src/modules/ecommerce/ecommerce.service.ts` | 6 new fields in order create |
| `apps/api/src/modules/storefront/storefront-orders.controller.ts` | 6 new fields in order selects |
| `apps/storefront/src/lib/api.ts` | `CheckoutPayload` extension + `SavedAddress` CRUD |
| `apps/storefront/src/app/checkout/page.tsx` | Places upgrade, landmark, ARIA, failure banner |
| `apps/storefront/src/app/account/page.tsx` | "My Addresses" card |
| `apps/storefront/src/app/account/addresses/page.tsx` | New |
| `apps/storefront/src/app/api/account/addresses/route.ts` | New BFF route |
| `apps/storefront/src/app/api/account/addresses/[id]/route.ts` | New BFF route |
| `apps/storefront/src/__tests__/address-utils.test.ts` | New |
| `apps/storefront/.env.example` | API key documentation |
| `apps/web/src/app/(dashboard)/sales/orders/[id]/page.tsx` | Delivery address card |
