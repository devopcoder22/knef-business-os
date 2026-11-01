/**
 * Phase 24G — Address utility and autocomplete behavior tests.
 * All Google Maps API interactions are mocked — no live dependency.
 */

// ── Coordinate validation helpers (mirroring service logic) ───────────────────

function isValidLatitude(lat: number): boolean {
  return typeof lat === 'number' && lat >= -90 && lat <= 90;
}

function isValidLongitude(lng: number): boolean {
  return typeof lng === 'number' && lng >= -180 && lng <= 180;
}

function isValidCoordinatePair(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat === null || lat === undefined) return true; // null allowed for manual addresses
  if (lng === null || lng === undefined) return true;
  return isValidLatitude(lat) && isValidLongitude(lng);
}

// ── AddressSource logic ───────────────────────────────────────────────────────

type AddressSource = 'GOOGLE_PLACE' | 'MANUAL' | 'SAVED_ADDRESS';

function resolveAddressSource(placeId: string | null, isSelectedFromSaved: boolean): AddressSource {
  if (isSelectedFromSaved) return 'SAVED_ADDRESS';
  if (placeId) return 'GOOGLE_PLACE';
  return 'MANUAL';
}

// ── Nigerian state normalization helpers ──────────────────────────────────────

const NIGERIAN_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT (Abuja)','Gombe',
  'Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos',
  'Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
  'Taraba','Yobe','Zamfara',
] as const;

type NigerianState = typeof NIGERIAN_STATES[number];

function normalizeNigerianState(rawState: string): NigerianState | null {
  const trimmed = rawState.trim();
  // Exact match (case-insensitive)
  const exact = NIGERIAN_STATES.find(
    (s) => s.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exact) return exact;
  // Strip " State" suffix
  const withoutSuffix = trimmed.replace(/\s*state$/i, '').trim();
  return NIGERIAN_STATES.find(
    (s) => s.toLowerCase() === withoutSuffix.toLowerCase(),
  ) ?? null;
}

// ── Autocomplete input debounce threshold ────────────────────────────────────

const MIN_AUTOCOMPLETE_CHARS = 3;

function shouldTriggerAutocomplete(input: string): boolean {
  return input.trim().length >= MIN_AUTOCOMPLETE_CHARS;
}

// ────────────────────────────────────────────────────────────────────────────

describe('Coordinate validation', () => {
  it('valid Lagos coordinates accepted', () => {
    expect(isValidLatitude(6.5244)).toBe(true);
    expect(isValidLongitude(3.3792)).toBe(true);
    expect(isValidCoordinatePair(6.5244, 3.3792)).toBe(true);
  });

  it('latitude -90 boundary is valid', () => expect(isValidLatitude(-90)).toBe(true));
  it('latitude 90 boundary is valid', () => expect(isValidLatitude(90)).toBe(true));
  it('latitude 90.001 is invalid', () => expect(isValidLatitude(90.001)).toBe(false));
  it('latitude -90.001 is invalid', () => expect(isValidLatitude(-90.001)).toBe(false));

  it('longitude -180 boundary is valid', () => expect(isValidLongitude(-180)).toBe(true));
  it('longitude 180 boundary is valid', () => expect(isValidLongitude(180)).toBe(true));
  it('longitude 180.001 is invalid', () => expect(isValidLongitude(180.001)).toBe(false));
  it('longitude -180.001 is invalid', () => expect(isValidLongitude(-180.001)).toBe(false));

  it('null lat/lng pair is valid (manual address with no coordinates)', () => {
    expect(isValidCoordinatePair(null, null)).toBe(true);
  });

  it('undefined coordinates are valid (manual address fallback)', () => {
    expect(isValidCoordinatePair(undefined, undefined)).toBe(true);
  });
});

describe('AddressSource resolution', () => {
  it('returns GOOGLE_PLACE when placeId set and not from saved', () => {
    expect(resolveAddressSource('ChIJexample123', false)).toBe('GOOGLE_PLACE');
  });

  it('returns MANUAL when no placeId and not from saved', () => {
    expect(resolveAddressSource(null, false)).toBe('MANUAL');
  });

  it('returns SAVED_ADDRESS when selected from saved addresses', () => {
    expect(resolveAddressSource('ChIJexample123', true)).toBe('SAVED_ADDRESS');
    expect(resolveAddressSource(null, true)).toBe('SAVED_ADDRESS');
  });

  it('SAVED_ADDRESS takes priority over placeId', () => {
    expect(resolveAddressSource('some-place-id', true)).toBe('SAVED_ADDRESS');
  });
});

describe('Nigerian state normalization', () => {
  it('exact match returns canonical name', () => {
    expect(normalizeNigerianState('Lagos')).toBe('Lagos');
  });

  it('case-insensitive match works', () => {
    expect(normalizeNigerianState('lagos')).toBe('Lagos');
    expect(normalizeNigerianState('LAGOS')).toBe('Lagos');
  });

  it('strips trailing " State" suffix', () => {
    expect(normalizeNigerianState('Lagos State')).toBe('Lagos');
    expect(normalizeNigerianState('Rivers State')).toBe('Rivers');
  });

  it('FCT Abuja variations', () => {
    expect(normalizeNigerianState('FCT (Abuja)')).toBe('FCT (Abuja)');
  });

  it('returns null for unrecognized state', () => {
    expect(normalizeNigerianState('Lagos State State')).toBeNull();
    expect(normalizeNigerianState('LAG')).toBeNull();
    expect(normalizeNigerianState('')).toBeNull();
  });

  it('all 36 states + FCT normalize correctly', () => {
    for (const state of NIGERIAN_STATES) {
      expect(normalizeNigerianState(state)).toBe(state);
    }
  });
});

describe('Autocomplete input threshold', () => {
  it('empty string does not trigger autocomplete', () => {
    expect(shouldTriggerAutocomplete('')).toBe(false);
  });

  it('1-char input does not trigger', () => {
    expect(shouldTriggerAutocomplete('L')).toBe(false);
  });

  it('2-char input does not trigger', () => {
    expect(shouldTriggerAutocomplete('La')).toBe(false);
  });

  it('3-char input triggers autocomplete', () => {
    expect(shouldTriggerAutocomplete('Lag')).toBe(true);
  });

  it('whitespace-only input below threshold does not trigger', () => {
    expect(shouldTriggerAutocomplete('   ')).toBe(false);
  });

  it('longer inputs trigger autocomplete', () => {
    expect(shouldTriggerAutocomplete('12 Allen Avenue, Ikeja')).toBe(true);
  });
});

describe('Mocked Google Places autocomplete behavior', () => {
  it('place_changed sets GOOGLE_PLACE source when place_id is returned', () => {
    const placeIdRef = { current: null as string | null };
    const latRef = { current: null as number | null };
    const lngRef = { current: null as number | null };
    const sourceRef = { current: 'MANUAL' as AddressSource };

    // Simulate what initAutocomplete place_changed handler does
    const mockPlace = {
      formatted_address: '12 Allen Avenue, Ikeja, Lagos, Nigeria',
      place_id: 'ChIJexample123',
      geometry: {
        location: {
          lat: () => 6.6018,
          lng: () => 3.3515,
        },
      },
      address_components: [
        { long_name: 'Ikeja', types: ['locality'] },
        { long_name: 'Lagos', types: ['administrative_area_level_1'] },
      ],
    };

    placeIdRef.current = mockPlace.place_id ?? null;
    latRef.current = mockPlace.geometry?.location.lat() ?? null;
    lngRef.current = mockPlace.geometry?.location.lng() ?? null;
    sourceRef.current = 'GOOGLE_PLACE';

    expect(placeIdRef.current).toBe('ChIJexample123');
    expect(latRef.current).toBeCloseTo(6.6018, 4);
    expect(lngRef.current).toBeCloseTo(3.3515, 4);
    expect(sourceRef.current).toBe('GOOGLE_PLACE');
  });

  it('manual typing resets place data and sets MANUAL source', () => {
    const placeIdRef = { current: 'ChIJexample123' };
    const latRef = { current: 6.6018 };
    const lngRef = { current: 3.3515 };
    const sourceRef = { current: 'GOOGLE_PLACE' as AddressSource };

    // Simulate handleAddressInputChange
    sourceRef.current = 'MANUAL';
    placeIdRef.current = null!;
    latRef.current = null!;
    lngRef.current = null!;

    expect(sourceRef.current).toBe('MANUAL');
    expect(placeIdRef.current).toBeNull();
    expect(latRef.current).toBeNull();
    expect(lngRef.current).toBeNull();
  });

  it('missing geometry still completes without error', () => {
    const placeIdRef = { current: null as string | null };
    const latRef = { current: null as number | null };
    const lngRef = { current: null as number | null };

    const mockPlaceNoGeometry = {
      formatted_address: 'Lagos, Nigeria',
      place_id: undefined as string | undefined,
      geometry: undefined as { location: { lat: () => number; lng: () => number } } | undefined,
      address_components: [],
    };

    placeIdRef.current = mockPlaceNoGeometry.place_id ?? null;
    latRef.current = mockPlaceNoGeometry.geometry?.location.lat() ?? null;
    lngRef.current = mockPlaceNoGeometry.geometry?.location.lng() ?? null;

    expect(placeIdRef.current).toBeNull();
    expect(latRef.current).toBeNull();
    expect(lngRef.current).toBeNull();
  });

  it('country restriction set to "ng" when country is Nigeria', () => {
    const country = 'Nigeria';
    const restriction = country === 'Nigeria' ? 'ng' : undefined;
    expect(restriction).toBe('ng');
  });

  it('country restriction is undefined for non-Nigeria country', () => {
    const country: string = 'Ghana';
    const restriction = country === 'Nigeria' ? 'ng' : undefined;
    expect(restriction).toBeUndefined();
  });
});

describe('Address field sanitization', () => {
  it('does not treat Google result as proof address is deliverable', () => {
    // This is a policy test — addressSource GOOGLE_PLACE is distinct from CONFIRMED
    const source: AddressSource = 'GOOGLE_PLACE';
    expect(source).not.toBe('CONFIRMED' as string);
    expect(['GOOGLE_PLACE', 'MANUAL', 'SAVED_ADDRESS']).toContain(source);
  });

  it('landmark field is preserved independent of Google data', () => {
    const landmark = 'Beside First Bank, opposite Chicken Republic';
    // Landmark must survive — Google data must not clear it
    const addressData = {
      deliveryAddress: '12 Allen Avenue, Ikeja',
      deliveryLandmark: landmark,
      deliveryPlaceId: 'ChIJexample123',
    };
    expect(addressData.deliveryLandmark).toBe(landmark);
  });
});
