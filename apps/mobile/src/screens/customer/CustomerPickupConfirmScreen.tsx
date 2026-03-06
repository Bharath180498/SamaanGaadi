import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, Region } from 'react-native-maps';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { type RoutePoint, useCustomerStore } from '../../store/useCustomerStore';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerPickupConfirm'>;

type SelectionStep = 'PICKUP' | 'DROP';

interface AddressSuggestion {
  id: string;
  address: string;
  lat: number;
  lng: number;
}

const FALLBACK_REGION: Region = {
  latitude: 12.9716,
  longitude: 77.5946,
  latitudeDelta: 0.009,
  longitudeDelta: 0.009
};

const SEARCH_DEBOUNCE_MS = 280;

const LOCAL_ADDRESS_CATALOG: AddressSuggestion[] = [
  { id: 'blr-koramangala', address: 'Koramangala, Bengaluru', lat: 12.9352, lng: 77.6245 },
  { id: 'blr-indiranagar', address: 'Indiranagar, Bengaluru', lat: 12.9784, lng: 77.6408 },
  { id: 'blr-whitefield', address: 'Whitefield, Bengaluru', lat: 12.9698, lng: 77.7499 },
  { id: 'blr-hsr', address: 'HSR Layout, Bengaluru', lat: 12.9116, lng: 77.6474 },
  { id: 'blr-ecity', address: 'Electronic City Phase 1, Bengaluru', lat: 12.8399, lng: 77.677 },
  { id: 'blr-marathahalli', address: 'Marathahalli, Bengaluru', lat: 12.9591, lng: 77.6974 },
  { id: 'blr-yeshwanthpur', address: 'Yeshwanthpur, Bengaluru', lat: 13.0285, lng: 77.542 },
  { id: 'blr-malleswaram', address: 'Malleswaram, Bengaluru', lat: 13.0035, lng: 77.5683 },
  { id: 'blr-btm', address: 'BTM Layout, Bengaluru', lat: 12.9166, lng: 77.6101 },
  { id: 'blr-jayanagar', address: 'Jayanagar, Bengaluru', lat: 12.925, lng: 77.5938 },
  { id: 'blr-kengeri', address: 'Kengeri, Bengaluru', lat: 12.9081, lng: 77.4824 },
  { id: 'blr-hebbal', address: 'Hebbal, Bengaluru', lat: 13.0358, lng: 77.597 },
  { id: 'blr-airport', address: 'Kempegowda International Airport, Bengaluru', lat: 13.1986, lng: 77.7066 }
];

function formatCoordinateAddress(lat: number, lng: number) {
  return `Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`;
}

function searchLocalSuggestions(query: string): AddressSuggestion[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) {
    return [];
  }

  return LOCAL_ADDRESS_CATALOG.filter((entry) => entry.address.toLowerCase().includes(normalized)).slice(0, 6);
}

async function fetchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  const normalized = query.trim();
  if (normalized.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    format: 'jsonv2',
    q: normalized,
    countrycodes: 'in',
    limit: '6',
    addressdetails: '1'
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const json = (await response.json()) as Array<{
      place_id?: number;
      display_name?: string;
      lat?: string;
      lon?: string;
    }>;

    const parsed = json
      .map((item) => {
        const lat = Number(item.lat);
        const lng = Number(item.lon);

        if (!item.display_name || Number.isNaN(lat) || Number.isNaN(lng)) {
          return null;
        }

        return {
          id: String(item.place_id ?? `${lat}-${lng}`),
          address: item.display_name,
          lat,
          lng
        } satisfies AddressSuggestion;
      })
      .filter((item): item is AddressSuggestion => item !== null);

    return parsed.length > 0 ? parsed : searchLocalSuggestions(normalized);
  } catch {
    return searchLocalSuggestions(normalized);
  } finally {
    clearTimeout(timeoutId);
  }
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

  const mapRef = useRef<MapView | null>(null);

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
  const [initializing, setInitializing] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const activeQuery = step === 'PICKUP' ? pickupQuery : dropQuery;
  const activeSearchSelected = step === 'PICKUP' ? pickupSearchSelected : dropSearchSelected;

  useEffect(() => {
    const initialize = async () => {
      let seededPickup = draftPickup;

      if (!seededPickup) {
        try {
          const permission = await Location.requestForegroundPermissionsAsync();

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

      const nextDrop = draftDrop;

      setPickupPoint(nextPickup);
      setDropPoint(nextDrop);
      setPickupQuery(draftPickup?.address ?? '');
      setDropQuery(draftDrop?.address ?? '');
      setPickupSearchSelected(Boolean(draftPickup));
      setDropSearchSelected(Boolean(draftDrop));
      setMapRegion((current) => ({
        ...current,
        latitude: nextPickup.lat,
        longitude: nextPickup.lng
      }));
      setInitializing(false);
    };

    void initialize();
  }, [draftDrop, draftPickup]);

  useEffect(() => {
    const query = activeQuery.trim();

    if (activeSearchSelected || query.length < 2) {
      setSuggestions(query.length >= 2 && !activeSearchSelected ? searchLocalSuggestions(query) : []);
      setSearchLoading(false);
      setSearchMessage(undefined);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    setSearchMessage(undefined);

    const timeoutId = setTimeout(() => {
      void fetchAddressSuggestions(query)
        .then((results) => {
          if (cancelled) {
            return;
          }

          setSuggestions(results);

          if (results.length === 0) {
            setSearchMessage('No nearby matches. Try landmark + area name.');
          }
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setSuggestions(searchLocalSuggestions(query));
          setSearchMessage('Online search is unavailable. Showing local suggestions.');
        })
        .finally(() => {
          if (!cancelled) {
            setSearchLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [activeQuery, activeSearchSelected]);

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
      return;
    }

    setDropQuery(value);
    setDropSearchSelected(false);
  };

  const onSelectSuggestion = (suggestion: AddressSuggestion) => {
    const point: RoutePoint = {
      address: suggestion.address,
      lat: suggestion.lat,
      lng: suggestion.lng
    };

    if (step === 'PICKUP') {
      setPickupPoint(point);
      setPickupQuery(point.address);
      setPickupSearchSelected(true);
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
    } catch {
      Alert.alert('Could not continue', 'Unable to fetch trips. Verify backend and internet access.');
    } finally {
      setConfirming(false);
    }
  };

  const onBlockedConfirm = () => {
    Alert.alert(
      step === 'PICKUP' ? 'Pick-up search required' : 'Drop-off search required',
      step === 'PICKUP'
        ? 'Type your pick-up address and select one of the suggestions before confirming the pin.'
        : 'Type your drop-off address and select one of the suggestions before confirming the pin.'
    );
  };

  const activeButtonText =
    !activeSearchSelected
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
          region={mapRegion}
          onRegionChangeComplete={onRegionChangeComplete}
        >
          {pickupPoint ? (
            <Marker
              coordinate={{ latitude: pickupPoint.lat, longitude: pickupPoint.lng }}
              pinColor={step === 'PICKUP' ? '#0F766E' : '#0EA5E9'}
            />
          ) : null}

          {dropPoint ? <Marker coordinate={{ latitude: dropPoint.lat, longitude: dropPoint.lng }} pinColor="#F97316" /> : null}
        </MapView>

        <View style={styles.topControls}>
          <Pressable style={styles.circleButton} onPress={onBack}>
            <Text style={styles.circleButtonText}>{'<'}</Text>
          </Pressable>

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
        </View>

        <View style={styles.centerPin}>
          <View style={[styles.centerPinDot, step === 'DROP' && styles.centerPinDotDrop]} />
        </View>

        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{activeTitle}</Text>
          <Text style={styles.sheetSubtitle}>{activeSubtitle}</Text>

          <View style={styles.searchBlock}>
            <Text style={styles.searchPrompt}>{step === 'PICKUP' ? 'Type pick-up location' : 'Type drop-off location'}</Text>
            <TextInput
              placeholder={step === 'PICKUP' ? 'Search pickup area, road, landmark' : 'Search drop area, road, landmark'}
              value={activeQuery}
              onChangeText={setActiveQuery}
              autoCorrect={false}
              autoCapitalize="words"
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
            />

            {searchLoading ? <ActivityIndicator color="#0F766E" style={styles.searchLoading} /> : null}
            {searchMessage ? <Text style={styles.searchMessage}>{searchMessage}</Text> : null}

            {suggestions.length > 0 ? (
              <View style={styles.suggestionsList}>
                {suggestions.map((item) => (
                  <Pressable key={item.id} style={styles.suggestionItem} onPress={() => onSelectSuggestion(item)}>
                    <Text style={styles.suggestionTitle} numberOfLines={1}>
                      {item.address.split(',')[0]}
                    </Text>
                    <Text style={styles.suggestionSub} numberOfLines={1}>
                      {item.address}
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
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFF8F1'
  },
  container: {
    flex: 1,
    backgroundColor: '#FFF8F1'
  },
  map: {
    ...StyleSheet.absoluteFillObject
  },
  topControls: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  circleButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0'
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
    backgroundColor: '#0F766E'
  },
  stepToggleText: {
    color: '#334155',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  stepToggleTextActive: {
    color: '#ECFEFF'
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
    backgroundColor: '#0F766E'
  },
  centerPinDotDrop: {
    backgroundColor: '#F97316'
  },
  sheet: {
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
  suggestionsList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    maxHeight: 160,
    overflow: 'hidden'
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
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  badgePillText: {
    color: '#115E59',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11
  },
  confirmButton: {
    marginTop: 6,
    borderRadius: 14,
    backgroundColor: '#0F766E',
    paddingVertical: 12,
    alignItems: 'center'
  },
  confirmButtonMuted: {
    backgroundColor: '#64748B'
  },
  confirmText: {
    color: '#ECFEFF',
    fontFamily: 'Sora_700Bold',
    fontSize: 16
  }
});
