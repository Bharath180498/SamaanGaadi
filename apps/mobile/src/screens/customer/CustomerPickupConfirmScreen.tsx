import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  Keyboard,
  KeyboardEvent,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import api from '../../services/api';
import type { RootStackParamList } from '../../types/navigation';
import { type RoutePoint, useCustomerStore } from '../../store/useCustomerStore';
import MapView, { type MapViewRef, Marker, type Region } from '../../components/maps';
import appConfig from '../../../app.json';
import {
  buildSimulatedNearbyVehicles,
  shouldRecenterSimulatedVehicles
} from '../../utils/nearbyVehicleSimulation';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerPickupConfirm'>;

type SelectionStep = 'PICKUP' | 'DROP';

interface AddressSuggestion {
  id: string;
  placeId: string;
  primaryText: string;
  secondaryText: string;
  address: string;
  provider?: 'google' | 'nominatim';
  lat?: number;
  lng?: number;
}

interface NearbyRideMarker {
  id: string;
  latitude: number;
  longitude: number;
  etaMinutes: number;
  symbol: string;
}

const FALLBACK_REGION: Region = {
  latitude: 12.9716,
  longitude: 77.5946,
  latitudeDelta: 0.009,
  longitudeDelta: 0.009
};

const SEARCH_DEBOUNCE_MS = 160;
const AUTOCOMPLETE_BACKEND_TIMEOUT_MS = 1800;
const AUTOCOMPLETE_DIRECT_TIMEOUT_MS = 1800;
const AUTOCOMPLETE_RADIUS_METERS = 20000;
const MOBILE_GOOGLE_MAPS_API_KEY =
  typeof (
    appConfig as {
      expo?: { extra?: { googleMapsApiKey?: unknown } };
    }
  ).expo?.extra?.googleMapsApiKey === 'string'
    ? String(
        (
          appConfig as {
            expo?: { extra?: { googleMapsApiKey?: unknown } };
          }
        ).expo?.extra?.googleMapsApiKey
      ).trim()
    : '';

function formatCoordinateAddress(lat: number, lng: number) {
  return `Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`;
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    if ('response' in error) {
      const response = (error as { response?: { data?: { message?: unknown } } }).response;
      const message = response?.data?.message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
      if (Array.isArray(message) && typeof message[0] === 'string') {
        return message[0];
      }
    }
    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }
  }

  return fallback;
}

function createPlacesSessionToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface BackendAutocompleteResult {
  suggestions: AddressSuggestion[];
  keyConfigured?: boolean;
  message?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function mergeAddressSuggestions(primary: AddressSuggestion[], secondary: AddressSuggestion[]) {
  const seen = new Set<string>();
  const merged: AddressSuggestion[] = [];

  for (const item of [...primary, ...secondary]) {
    if (!item.placeId || seen.has(item.placeId)) {
      continue;
    }

    seen.add(item.placeId);
    merged.push(item);

    if (merged.length >= 8) {
      break;
    }
  }

  return merged;
}

async function awaitFirstNonEmptySuggestions(tasks: Array<Promise<AddressSuggestion[]>>) {
  if (tasks.length === 0) {
    return [] as AddressSuggestion[];
  }

  return new Promise<AddressSuggestion[]>((resolve) => {
    let pending = tasks.length;
    let resolved = false;

    const finishIfDone = () => {
      pending -= 1;
      if (!resolved && pending <= 0) {
        resolve([]);
      }
    };

    tasks.forEach((task) => {
      task
        .then((result) => {
          if (resolved) {
            return;
          }

          if (result.length > 0) {
            resolved = true;
            resolve(result);
            return;
          }

          finishIfDone();
        })
        .catch(() => {
          finishIfDone();
        });
    });
  });
}

async function fetchBackendAutocomplete(input: {
  query: string;
  lat: number;
  lng: number;
  sessionToken: string;
}): Promise<BackendAutocompleteResult> {
  try {
    const response = await api.get('/maps/places/autocomplete', {
      timeout: AUTOCOMPLETE_BACKEND_TIMEOUT_MS,
      params: {
        input: input.query,
        lat: input.lat,
        lng: input.lng,
        sessionToken: input.sessionToken,
        countryCode: 'IN'
      }
    });

    const payload = response.data as {
      suggestions?: AddressSuggestion[];
      keyConfigured?: boolean;
      message?: string;
    };

    return {
      suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
      keyConfigured: payload.keyConfigured,
      message: payload.message
    };
  } catch {
    return {
      suggestions: []
    };
  }
}

async function fetchGoogleAutocompleteLegacy(input: {
  query: string;
  lat: number;
  lng: number;
  sessionToken: string;
}) {
  if (!MOBILE_GOOGLE_MAPS_API_KEY) {
    return [] as AddressSuggestion[];
  }

  const params = new URLSearchParams({
    input: input.query,
    key: MOBILE_GOOGLE_MAPS_API_KEY,
    language: 'en',
    components: 'country:in',
    types: 'geocode',
    location: `${input.lat},${input.lng}`,
    radius: String(AUTOCOMPLETE_RADIUS_METERS),
    sessiontoken: input.sessionToken
  });

  const response = await fetchWithTimeout(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    },
    AUTOCOMPLETE_DIRECT_TIMEOUT_MS
  );

  if (!response) {
    return [] as AddressSuggestion[];
  }

  if (!response.ok) {
    return [] as AddressSuggestion[];
  }

  const payload = (await response.json()) as {
    predictions?: Array<{
      description?: string;
      place_id?: string;
      structured_formatting?: {
        main_text?: string;
        secondary_text?: string;
      };
    }>;
  };

  const suggestions = (payload.predictions ?? [])
    .map((entry, index) => {
      const placeId = entry.place_id?.trim();
      const address = entry.description?.trim();
      if (!placeId || !address) {
        return null;
      }

      return {
        id: `${placeId}-${index}`,
        placeId,
        primaryText: entry.structured_formatting?.main_text?.trim() || address.split(',')[0] || address,
        secondaryText: entry.structured_formatting?.secondary_text?.trim() || address,
        address,
        provider: 'google'
      } satisfies AddressSuggestion;
    })
    .filter(Boolean) as AddressSuggestion[];

  return suggestions.slice(0, 8);
}

async function fetchGoogleAutocompleteNew(input: {
  query: string;
  lat: number;
  lng: number;
  sessionToken: string;
}) {
  if (!MOBILE_GOOGLE_MAPS_API_KEY) {
    return [] as AddressSuggestion[];
  }

  const response = await fetchWithTimeout(
    'https://places.googleapis.com/v1/places:autocomplete',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': MOBILE_GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text'
      },
      body: JSON.stringify({
        input: input.query,
        languageCode: 'en',
        regionCode: 'IN',
        includeQueryPredictions: false,
        sessionToken: input.sessionToken,
        locationBias: {
          circle: {
            center: {
              latitude: input.lat,
              longitude: input.lng
            },
            radius: AUTOCOMPLETE_RADIUS_METERS
          }
        },
        origin: {
          latitude: input.lat,
          longitude: input.lng
        }
      })
    },
    AUTOCOMPLETE_DIRECT_TIMEOUT_MS
  );

  if (!response) {
    return [] as AddressSuggestion[];
  }

  if (!response.ok) {
    return [] as AddressSuggestion[];
  }

  const payload = (await response.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  };

  const suggestions = (payload.suggestions ?? [])
    .map((entry, index) => {
      const place = entry.placePrediction;
      const placeId = place?.placeId?.trim();
      const address = place?.text?.text?.trim();
      if (!placeId || !address) {
        return null;
      }

      return {
        id: `${placeId}-${index}`,
        placeId,
        primaryText: place?.structuredFormat?.mainText?.text?.trim() || address.split(',')[0] || address,
        secondaryText: place?.structuredFormat?.secondaryText?.text?.trim() || address,
        address,
        provider: 'google'
      } satisfies AddressSuggestion;
    })
    .filter(Boolean) as AddressSuggestion[];

  return suggestions.slice(0, 8);
}

async function fetchGoogleAutocompleteDirect(input: {
  query: string;
  lat: number;
  lng: number;
  sessionToken: string;
}) {
  const [modern, legacy] = await Promise.all([
    fetchGoogleAutocompleteNew(input),
    fetchGoogleAutocompleteLegacy(input)
  ]);

  return mergeAddressSuggestions(modern, legacy);
}

async function fetchGooglePlaceDetailsLegacy(placeId: string) {
  if (!MOBILE_GOOGLE_MAPS_API_KEY) {
    return null;
  }

  const params = new URLSearchParams({
    place_id: placeId,
    key: MOBILE_GOOGLE_MAPS_API_KEY,
    fields: 'place_id,formatted_address,geometry/location',
    language: 'en'
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    result?: {
      formatted_address?: string;
      geometry?: {
        location?: {
          lat?: number;
          lng?: number;
        };
      };
    };
  };

  const lat = payload.result?.geometry?.location?.lat;
  const lng = payload.result?.geometry?.location?.lng;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  return {
    lat,
    lng,
    address: payload.result?.formatted_address
  };
}

async function fetchGooglePlaceDetailsNew(placeId: string) {
  if (!MOBILE_GOOGLE_MAPS_API_KEY) {
    return null;
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Goog-Api-Key': MOBILE_GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'id,formattedAddress,location'
    }
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    formattedAddress?: string;
    location?: {
      latitude?: number;
      longitude?: number;
    };
  };

  const lat = payload.location?.latitude;
  const lng = payload.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  return {
    lat,
    lng,
    address: payload.formattedAddress
  };
}

async function fetchGooglePlaceDetailsDirect(placeId: string) {
  const legacy = await fetchGooglePlaceDetailsLegacy(placeId);
  if (legacy) {
    return legacy;
  }

  return fetchGooglePlaceDetailsNew(placeId);
}

async function reverseGeocodeAddress(lat: number, lng: number, fallbackLabel: string) {
  try {
    const response = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const first = response[0];

    if (!first) {
      return `${fallbackLabel} (${formatCoordinateAddress(lat, lng)})`;
    }

    const parts = [
      first.name,
      first.street,
      first.district,
      first.city,
      first.region,
      first.postalCode
    ].filter((value): value is string => Boolean(value));

    if (parts.length === 0) {
      return `${fallbackLabel} (${formatCoordinateAddress(lat, lng)})`;
    }

    return parts.join(', ');
  } catch {
    return `${fallbackLabel} (${formatCoordinateAddress(lat, lng)})`;
  }
}

export function CustomerPickupConfirmScreen({ navigation }: Props) {
  const draftPickup = useCustomerStore((state) => state.draftPickup);
  const draftDrop = useCustomerStore((state) => state.draftDrop);
  const goodsValue = useCustomerStore((state) => state.goodsValue);
  const setDraftRoute = useCustomerStore((state) => state.setDraftRoute);
  const fetchQuotes = useCustomerStore((state) => state.fetchQuotes);
  const estimateLoading = useCustomerStore((state) => state.estimateLoading);

  const mapRef = useRef<MapViewRef | null>(null);
  const keyboardLift = useRef(new Animated.Value(0)).current;
  const autocompleteCacheRef = useRef<Map<string, AddressSuggestion[]>>(new Map());

  const [mapRegion, setMapRegion] = useState<Region>(FALLBACK_REGION);
  const [step, setStep] = useState<SelectionStep>('PICKUP');
  const [pickupPoint, setPickupPoint] = useState<RoutePoint | undefined>(draftPickup);
  const [dropPoint, setDropPoint] = useState<RoutePoint | undefined>(draftDrop);
  const [pickupQuery, setPickupQuery] = useState(draftPickup?.address ?? '');
  const [dropQuery, setDropQuery] = useState(draftDrop?.address ?? '');
  const [pickupSearchSelected, setPickupSearchSelected] = useState(Boolean(draftPickup));
  const [dropSearchSelected, setDropSearchSelected] = useState(Boolean(draftDrop));
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | undefined>();
  const [searchSessionToken, setSearchSessionToken] = useState(() => createPlacesSessionToken());
  const [initializing, setInitializing] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [keyboardRaised, setKeyboardRaised] = useState(false);
  const [pickupAutoPinnedFromLocation, setPickupAutoPinnedFromLocation] = useState(false);
  const [nearbyMarkerAnchor, setNearbyMarkerAnchor] = useState({
    lat: draftPickup?.lat ?? FALLBACK_REGION.latitude,
    lng: draftPickup?.lng ?? FALLBACK_REGION.longitude
  });

  const activeQuery = step === 'PICKUP' ? pickupQuery : dropQuery;
  const activeSearchSelected = step === 'PICKUP' ? pickupSearchSelected : dropSearchSelected;
  const showManualPinFallback =
    !activeSearchSelected &&
    suggestions.length === 0 &&
    activeQuery.trim().length >= 2 &&
    Boolean(searchMessage);
  const hudOpacity = keyboardLift.interpolate({
    inputRange: [0, 120],
    outputRange: [1, 0.2],
    extrapolate: 'clamp'
  });
  const sheetTranslateY = keyboardLift.interpolate({
    inputRange: [0, 260],
    outputRange: [0, -260],
    extrapolate: 'clamp'
  });
  const nearbyMarkerAnchorCandidate = useMemo(
    () => ({
      lat: pickupPoint?.lat ?? mapRegion.latitude,
      lng: pickupPoint?.lng ?? mapRegion.longitude
    }),
    [mapRegion.latitude, mapRegion.longitude, pickupPoint?.lat, pickupPoint?.lng]
  );

  useEffect(() => {
    if (shouldRecenterSimulatedVehicles(nearbyMarkerAnchor, nearbyMarkerAnchorCandidate)) {
      setNearbyMarkerAnchor(nearbyMarkerAnchorCandidate);
    }
  }, [nearbyMarkerAnchor, nearbyMarkerAnchorCandidate]);

  const nearbyRideMarkers = useMemo(
    () =>
      buildSimulatedNearbyVehicles(nearbyMarkerAnchor, 4).map((vehicle) => ({
        id: vehicle.id,
        latitude: vehicle.latitude,
        longitude: vehicle.longitude,
        etaMinutes: vehicle.etaMinutes,
        symbol: vehicle.symbol
      })),
    [nearbyMarkerAnchor]
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const moveSheet = (event: KeyboardEvent) => {
      const keyboardHeight = event.endCoordinates?.height ?? 0;
      const target = Math.min(Math.max(keyboardHeight - (Platform.OS === 'ios' ? 24 : 10), 0), 260);

      setKeyboardRaised(target > 0);
      Animated.timing(keyboardLift, {
        toValue: target,
        duration: event.duration ?? 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start();
    };

    const resetSheet = (event?: KeyboardEvent) => {
      setKeyboardRaised(false);
      Animated.timing(keyboardLift, {
        toValue: 0,
        duration: event?.duration ?? 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start();
    };

    const showSubscription = Keyboard.addListener(showEvent, moveSheet);
    const hideSubscription = Keyboard.addListener(hideEvent, resetSheet);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [keyboardLift]);

  useEffect(() => {
    const initialize = async () => {
      let seededPickup = draftPickup;
      let locationPermissionDenied = false;
      let locationPermissionCanAskAgain = true;

      if (!seededPickup) {
        try {
          const existingPermission = await Location.getForegroundPermissionsAsync();
          const permission =
            existingPermission.status === 'granted'
              ? existingPermission
              : await Location.requestForegroundPermissionsAsync();

          if (permission.status === 'granted') {
            const lastKnown = await Location.getLastKnownPositionAsync();
            const position =
              lastKnown ??
              (await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced
              }));

            seededPickup = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              address: 'Current location'
              };
          } else {
            locationPermissionDenied = true;
            locationPermissionCanAskAgain = permission.canAskAgain;
          }
        } catch {
          seededPickup = undefined;
        }
      }

      const nextPickup = seededPickup ?? {
        lat: FALLBACK_REGION.latitude,
        lng: FALLBACK_REGION.longitude,
        address: 'Pickup location'
      };
      const pickupSeededFromCurrentLocation = Boolean(seededPickup) && !Boolean(draftPickup);

      const nextDrop = draftDrop;

      setPickupPoint(nextPickup);
      setDropPoint(nextDrop);
      setPickupQuery(draftPickup?.address ?? '');
      setDropQuery(draftDrop?.address ?? '');
      setPickupSearchSelected(Boolean(draftPickup) || pickupSeededFromCurrentLocation);
      setDropSearchSelected(Boolean(draftDrop));
      setPickupAutoPinnedFromLocation(pickupSeededFromCurrentLocation);
      setMapRegion((current) => ({
        ...current,
        latitude: nextPickup.lat,
        longitude: nextPickup.lng
      }));
      setInitializing(false);

      if (locationPermissionDenied) {
        Alert.alert(
          'Allow location for auto pickup',
          locationPermissionCanAskAgain
            ? 'Enable location access so we can pin pickup at your current position automatically.'
            : 'Location access is blocked. Open phone settings and allow location to auto-pin pickup.',
          locationPermissionCanAskAgain
            ? [{ text: 'OK' }]
            : [
                { text: 'Not now', style: 'cancel' },
                {
                  text: 'Open settings',
                  onPress: () => {
                    void Linking.openSettings();
                  }
                }
              ]
        );
      }
    };

    void initialize();
  }, [draftDrop, draftPickup]);

  useEffect(() => {
    const query = activeQuery.trim();

    if (activeSearchSelected || query.length < 2) {
      setSuggestions([]);
      setSearchLoading(false);
      setSearchMessage(undefined);
      return;
    }

    const cacheKey = `${step}:${query.toLowerCase()}`;
    const cached = autocompleteCacheRef.current.get(cacheKey);

    if (cached && cached.length > 0) {
      setSuggestions(cached);
      setSearchMessage(undefined);
    }

    let cancelled = false;
    setSearchLoading(!cached || cached.length === 0);
    setSearchMessage(undefined);

    const timeoutId = setTimeout(() => {
      void (async () => {
        const backendPromise = fetchBackendAutocomplete({
          query,
          lat: mapRegion.latitude,
          lng: mapRegion.longitude,
          sessionToken: searchSessionToken
        });
        const directPromise = MOBILE_GOOGLE_MAPS_API_KEY
          ? fetchGoogleAutocompleteDirect({
              query,
              lat: mapRegion.latitude,
              lng: mapRegion.longitude,
              sessionToken: searchSessionToken
            })
          : Promise.resolve([] as AddressSuggestion[]);

        const firstFastResults = await awaitFirstNonEmptySuggestions([
          backendPromise.then((result) => result.suggestions),
          directPromise
        ]);

        if (cancelled) {
          return;
        }

        if (firstFastResults.length > 0) {
          autocompleteCacheRef.current.set(cacheKey, firstFastResults);
          setSuggestions(firstFastResults);
          setSearchMessage(undefined);
          setSearchLoading(false);
          return;
        }

        const [backendResult, directResult] = await Promise.all([backendPromise, directPromise]);

        if (cancelled) {
          return;
        }

        const mergedResults = mergeAddressSuggestions(backendResult.suggestions, directResult);

        if (mergedResults.length > 0) {
          autocompleteCacheRef.current.set(cacheKey, mergedResults);
          setSuggestions(mergedResults);
          setSearchMessage(undefined);
          setSearchLoading(false);
          return;
        }

        setSuggestions([]);

        if (backendResult.keyConfigured === false && !MOBILE_GOOGLE_MAPS_API_KEY) {
          setSearchMessage('Google Maps key is missing for places search.');
        } else if (backendResult.message) {
          setSearchMessage(backendResult.message);
        } else {
          setSearchMessage('No nearby Google Maps matches for this query.');
        }

        setSearchLoading(false);
      })().catch(() => {
        if (cancelled) {
          return;
        }

        setSuggestions([]);

        if (MOBILE_GOOGLE_MAPS_API_KEY) {
          setSearchMessage('Google Maps suggestions are temporarily unavailable.');
        } else {
          setSearchMessage('Google Maps suggestion service unavailable right now.');
        }
      }).finally(() => {
        if (!cancelled) {
          setSearchLoading(false);
        }
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [activeQuery, activeSearchSelected, mapRegion.latitude, mapRegion.longitude, searchSessionToken, step]);

  const activeTitle = useMemo(
    () => (step === 'PICKUP' ? 'Search pick-up, then pin exact spot' : 'Search drop-off, then pin exact spot'),
    [step]
  );

  const activeSubtitle = useMemo(
    () =>
      activeSearchSelected
        ? 'Drag map for accurate pin placement before confirming.'
        : 'Type address and pick one of the live suggestions first.',
    [activeSearchSelected]
  );

  const activeAddress = useMemo(() => {
    if (step === 'PICKUP') {
      return pickupPoint?.address ?? formatCoordinateAddress(mapRegion.latitude, mapRegion.longitude);
    }

    return dropPoint?.address ?? formatCoordinateAddress(mapRegion.latitude, mapRegion.longitude);
  }, [dropPoint?.address, mapRegion.latitude, mapRegion.longitude, pickupPoint?.address, step]);

  const setActiveQuery = (value: string) => {
    if (step === 'PICKUP') {
      setPickupQuery(value);
      setPickupSearchSelected(false);
      if (value.trim().length > 0) {
        setPickupAutoPinnedFromLocation(false);
      }
      return;
    }

    setDropQuery(value);
    setDropSearchSelected(false);
  };

  const onSelectSuggestion = async (suggestion: AddressSuggestion) => {
    Keyboard.dismiss();
    setSearchLoading(true);
    setSearchMessage(undefined);

    try {
      let details: { lat?: number; lng?: number; address?: string } | null =
        typeof suggestion.lat === 'number' && typeof suggestion.lng === 'number'
          ? { lat: suggestion.lat, lng: suggestion.lng, address: suggestion.address }
          : null;

      if (!details) {
        try {
          const response = await api.get(`/maps/places/${encodeURIComponent(suggestion.placeId)}`);
          details = response.data as { lat?: number; lng?: number; address?: string };
        } catch {
          details = await fetchGooglePlaceDetailsDirect(suggestion.placeId);
        }
      }

      if (!details || typeof details.lat !== 'number' || typeof details.lng !== 'number') {
        throw new Error('Missing place coordinates');
      }

      const point: RoutePoint = {
        address: details.address ?? suggestion.address,
        lat: details.lat,
        lng: details.lng
      };

      if (step === 'PICKUP') {
        setPickupPoint(point);
        setPickupQuery(point.address);
        setPickupSearchSelected(true);
        setPickupAutoPinnedFromLocation(false);
      } else {
        setDropPoint(point);
        setDropQuery(point.address);
        setDropSearchSelected(true);
      }

      const nextRegion: Region = {
        latitude: point.lat,
        longitude: point.lng,
        latitudeDelta: mapRegion.latitudeDelta,
        longitudeDelta: mapRegion.longitudeDelta
      };

      setMapRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 260);
      setSuggestions([]);
      setSearchMessage(undefined);
      setSearchSessionToken(createPlacesSessionToken());
    } catch {
      Alert.alert('Address unavailable', 'Could not load this Google Maps place. Try another suggestion.');
    } finally {
      setSearchLoading(false);
    }
  };

  const onRegionChangeComplete = (region: Region) => {
    setMapRegion(region);

    if (step === 'PICKUP') {
      setPickupPoint((current) => ({
        lat: region.latitude,
        lng: region.longitude,
        address: current?.address ?? formatCoordinateAddress(region.latitude, region.longitude)
      }));
      return;
    }

    setDropPoint((current) => ({
      lat: region.latitude,
      lng: region.longitude,
      address: current?.address ?? formatCoordinateAddress(region.latitude, region.longitude)
    }));
  };

  const switchStep = (nextStep: SelectionStep) => {
    setStep(nextStep);
    setSuggestions([]);
    setSearchMessage(undefined);
    setSearchSessionToken(createPlacesSessionToken());

    const target = nextStep === 'PICKUP' ? pickupPoint : dropPoint;
    if (!target) {
      return;
    }

    const targetRegion: Region = {
      latitude: target.lat,
      longitude: target.lng,
      latitudeDelta: mapRegion.latitudeDelta,
      longitudeDelta: mapRegion.longitudeDelta
    };

    setMapRegion(targetRegion);
    mapRef.current?.animateToRegion(targetRegion, 220);
  };

  const onBack = () => {
    if (step === 'DROP') {
      switchStep('PICKUP');
      return;
    }

    navigation.goBack();
  };

  const onConfirm = async () => {
    if (confirming || estimateLoading || !activeSearchSelected) {
      return;
    }

    setConfirming(true);

    try {
      if (step === 'PICKUP') {
        const pickupLat = mapRegion.latitude;
        const pickupLng = mapRegion.longitude;
        const pickupAddress = await reverseGeocodeAddress(pickupLat, pickupLng, 'Pickup location');

        const resolvedPickup: RoutePoint = {
          lat: pickupLat,
          lng: pickupLng,
          address: pickupAddress
        };

        const seededDrop = draftDrop ?? dropPoint;

        setPickupPoint(resolvedPickup);
        setPickupQuery(resolvedPickup.address);
        setPickupSearchSelected(true);
        setDraftRoute({ pickup: resolvedPickup, drop: seededDrop ?? null });
        setStep('DROP');

        if (seededDrop) {
          const nextRegion: Region = {
            latitude: seededDrop.lat,
            longitude: seededDrop.lng,
            latitudeDelta: mapRegion.latitudeDelta,
            longitudeDelta: mapRegion.longitudeDelta
          };

          setMapRegion(nextRegion);
          mapRef.current?.animateToRegion(nextRegion, 260);
          setDropSearchSelected(true);
        } else {
          setDropSearchSelected(false);
        }

        return;
      }

      const dropLat = mapRegion.latitude;
      const dropLng = mapRegion.longitude;
      const dropAddress = await reverseGeocodeAddress(dropLat, dropLng, 'Drop location');

      const resolvedDrop: RoutePoint = {
        lat: dropLat,
        lng: dropLng,
        address: dropAddress
      };

      const resolvedPickup =
        pickupPoint ?? {
          lat: FALLBACK_REGION.latitude,
          lng: FALLBACK_REGION.longitude,
          address: 'Pickup location'
        };

      setDropPoint(resolvedDrop);
      setDropQuery(resolvedDrop.address);
      setDropSearchSelected(true);
      setDraftRoute({ pickup: resolvedPickup, drop: resolvedDrop });

      await fetchQuotes({
        pickup: resolvedPickup,
        drop: resolvedDrop,
        goodsValue
      });

      navigation.navigate('CustomerTripSelect');
    } catch (error) {
      const message = extractErrorMessage(error, 'Unable to fetch trips. Verify backend and internet access.');
      if (message.toLowerCase().includes('city-to-city') || message.toLowerCase().includes('coming soon')) {
        Alert.alert('City-to-city coming soon', message);
      } else {
        Alert.alert('Could not continue', message);
      }
    } finally {
      setConfirming(false);
    }
  };

  const onBlockedConfirm = () => {
    if (showManualPinFallback) {
      Alert.alert(
        'Suggestions unavailable',
        step === 'PICKUP'
          ? 'Google suggestions are unavailable. Use the current map pin as pickup?'
          : 'Google suggestions are unavailable. Use the current map pin as drop-off?',
        [
          { text: 'Go back', style: 'cancel' },
          {
            text: 'Use current pin',
            onPress: () => {
              if (step === 'PICKUP') {
                setPickupSearchSelected(true);
              } else {
                setDropSearchSelected(true);
              }
            }
          }
        ]
      );
      return;
    }

    Alert.alert(
      step === 'PICKUP' ? 'Pick-up search required' : 'Drop-off search required',
      step === 'PICKUP'
        ? 'Type your pick-up address and select one of the suggestions before confirming the pin.'
        : 'Type your drop-off address and select one of the suggestions before confirming the pin.'
    );
  };

  const activeButtonText =
    showManualPinFallback
      ? step === 'PICKUP'
        ? 'Use current pin as pickup'
        : 'Use current pin as drop-off'
      : !activeSearchSelected
      ? step === 'PICKUP'
        ? 'Select pick-up from suggestions'
        : 'Select drop-off from suggestions'
      : step === 'PICKUP'
        ? 'Confirm pick-up pin'
        : 'Confirm drop and continue';

  const confirmDisabled = estimateLoading || confirming || initializing;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={mapRegion}
          onRegionChangeComplete={onRegionChangeComplete}
        >
          {nearbyRideMarkers.map((ride) => (
            <Marker
              key={ride.id}
              coordinate={{ latitude: ride.latitude, longitude: ride.longitude }}
              title="Nearby QARGO ride"
              description={`${ride.etaMinutes} min away`}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.nearbyMarker}>
                <Text style={styles.nearbyMarkerEmoji}>{ride.symbol}</Text>
                <Text style={styles.nearbyMarkerEta}>{ride.etaMinutes}m</Text>
              </View>
            </Marker>
          ))}
          {pickupPoint ? (
            <Marker
              coordinate={{ latitude: pickupPoint.lat, longitude: pickupPoint.lng }}
              pinColor={step === 'PICKUP' ? '#1D4ED8' : '#0EA5E9'}
            />
          ) : null}

          {dropPoint ? <Marker coordinate={{ latitude: dropPoint.lat, longitude: dropPoint.lng }} pinColor="#2563EB" /> : null}
        </MapView>

        <View style={styles.nearbyBadge}>
          <Text style={styles.nearbyBadgeText}>{nearbyRideMarkers.length} rides available nearby</Text>
        </View>

        <View style={styles.topControls}>
          <Pressable style={styles.circleButton} onPress={onBack}>
            <Text style={styles.circleButtonText}>{'<'}</Text>
          </Pressable>

          <Animated.View style={{ opacity: hudOpacity }}>
            <View style={styles.stepToggle}>
              <Pressable
                style={[styles.stepToggleItem, step === 'PICKUP' && styles.stepToggleItemActive]}
                onPress={() => switchStep('PICKUP')}
              >
                <Text style={[styles.stepToggleText, step === 'PICKUP' && styles.stepToggleTextActive]}>Pickup</Text>
              </Pressable>
              <Pressable
                style={[styles.stepToggleItem, step === 'DROP' && styles.stepToggleItemActive]}
                onPress={() => switchStep('DROP')}
              >
                <Text style={[styles.stepToggleText, step === 'DROP' && styles.stepToggleTextActive]}>Drop</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>

        <Animated.View pointerEvents="none" style={[styles.centerPin, { opacity: hudOpacity }]}>
          <View style={[styles.centerPinDot, step === 'DROP' && styles.centerPinDotDrop]} />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, keyboardRaised && styles.sheetRaised, { transform: [{ translateY: sheetTranslateY }] }]}
        >
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{activeTitle}</Text>
          <Text style={styles.sheetSubtitle}>{activeSubtitle}</Text>
          <View style={styles.sheetNavRow}>
            <Pressable style={styles.sheetBackButton} onPress={onBack}>
              <Text style={styles.sheetBackButtonText}>{step === 'DROP' ? 'Back to pickup' : 'Back'}</Text>
            </Pressable>
            <Text style={styles.sheetStepText}>{step === 'PICKUP' ? 'Step 1 of 2' : 'Step 2 of 2'}</Text>
          </View>

          <View style={styles.searchBlock}>
            <Text style={styles.searchPrompt}>{step === 'PICKUP' ? 'Type pick-up location' : 'Type drop-off location'}</Text>
            <TextInput
              placeholder={
                step === 'PICKUP'
                  ? pickupAutoPinnedFromLocation && pickupQuery.trim().length === 0
                    ? 'Pinned at your current location - type to change'
                    : 'Search pickup area, road, landmark'
                  : 'Search drop area, road, landmark'
              }
              value={activeQuery}
              onChangeText={setActiveQuery}
              autoCorrect={false}
              autoCapitalize="words"
              placeholderTextColor="#94A3B8"
              returnKeyType="search"
              blurOnSubmit={false}
              onFocus={() => setKeyboardRaised(true)}
              style={styles.searchInput}
            />

            {searchLoading ? <ActivityIndicator color="#1D4ED8" style={styles.searchLoading} /> : null}
            {searchMessage ? <Text style={styles.searchMessage}>{searchMessage}</Text> : null}
            {showManualPinFallback ? (
              <Pressable
                style={styles.manualPinButton}
                onPress={() => {
                  if (step === 'PICKUP') {
                    setPickupSearchSelected(true);
                  } else {
                    setDropSearchSelected(true);
                  }
                }}
              >
                <Text style={styles.manualPinButtonText}>
                  Suggestions not loading? Continue with map pin
                </Text>
              </Pressable>
            ) : null}

            {suggestions.length > 0 ? (
              <View style={[styles.suggestionsList, keyboardRaised && styles.suggestionsListRaised]}>
                {suggestions.map((item) => (
                  <Pressable key={item.id} style={styles.suggestionItem} onPress={() => onSelectSuggestion(item)}>
                    <Text style={styles.suggestionTitle} numberOfLines={1}>
                      {item.primaryText}
                    </Text>
                    <Text style={styles.suggestionSub} numberOfLines={1}>
                      {item.secondaryText}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.addressCard}>
            <View style={styles.addressCopy}>
              <Text style={styles.addressTitle}>{step === 'PICKUP' ? 'Pick-up point' : 'Drop-off point'}</Text>
              <Text style={styles.addressSubtitle} numberOfLines={2}>
                {activeAddress}
              </Text>
            </View>
            <View style={styles.badgePill}>
              <Text style={styles.badgePillText}>{step === 'PICKUP' ? 'Step 1 of 2' : 'Step 2 of 2'}</Text>
            </View>
          </View>

          <Pressable
            style={[styles.confirmButton, !activeSearchSelected && styles.confirmButtonMuted]}
            onPress={() => (activeSearchSelected ? void onConfirm() : onBlockedConfirm())}
            disabled={confirmDisabled}
          >
            {estimateLoading || confirming || initializing ? (
              <ActivityIndicator color="#F8FAFC" />
            ) : (
              <Text style={styles.confirmText}>{activeButtonText}</Text>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#EFF6FF'
  },
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF'
  },
  map: {
    ...StyleSheet.absoluteFillObject
  },
  nearbyBadge: {
    position: 'absolute',
    top: 24,
    right: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 21
  },
  nearbyBadgeText: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11
  },
  nearbyMarker: {
    minWidth: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2
  },
  nearbyMarkerEmoji: {
    fontSize: 14
  },
  nearbyMarkerEta: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 10
  },
  topControls: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20
  },
  circleButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5
  },
  circleButtonText: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 18
  },
  stepToggle: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  stepToggleItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999
  },
  stepToggleItemActive: {
    backgroundColor: '#1D4ED8'
  },
  stepToggleText: {
    color: '#334155',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  stepToggleTextActive: {
    color: '#EFF6FF'
  },
  centerPin: {
    position: 'absolute',
    top: '47%',
    left: '50%',
    marginLeft: -14,
    marginTop: -28,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#334155',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 }
  },
  centerPinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1D4ED8'
  },
  centerPinDotDrop: {
    backgroundColor: '#2563EB'
  },
  sheet: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    marginTop: 'auto',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10
  },
  sheetRaised: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -8 },
    elevation: 10
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    marginBottom: 2
  },
  sheetTitle: {
    textAlign: 'center',
    color: '#0F172A',
    fontFamily: 'Sora_700Bold',
    fontSize: 21
  },
  sheetSubtitle: {
    textAlign: 'center',
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    marginTop: -3
  },
  sheetNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sheetBackButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  sheetBackButtonText: {
    color: '#334155',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  sheetStepText: {
    color: '#64748B',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  searchBlock: {
    gap: 6
  },
  searchPrompt: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0F172A',
    fontFamily: 'Manrope_500Medium',
    fontSize: 14
  },
  searchLoading: {
    alignSelf: 'flex-start'
  },
  searchMessage: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12
  },
  manualPinButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  manualPinButtonText: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  suggestionsList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    maxHeight: 160,
    overflow: 'hidden'
  },
  suggestionsListRaised: {
    maxHeight: 220
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  suggestionTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  suggestionSub: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12,
    marginTop: 2
  },
  addressCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  addressCopy: {
    flex: 1
  },
  addressTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 15
  },
  addressSubtitle: {
    color: '#475569',
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    marginTop: 3
  },
  badgePill: {
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  badgePillText: {
    color: '#1E3A8A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11
  },
  confirmButton: {
    marginTop: 6,
    borderRadius: 14,
    backgroundColor: '#1D4ED8',
    paddingVertical: 12,
    alignItems: 'center'
  },
  confirmButtonMuted: {
    backgroundColor: '#64748B'
  },
  confirmText: {
    color: '#EFF6FF',
    fontFamily: 'Sora_700Bold',
    fontSize: 16
  }
});
