import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import type { InsurancePlan, VehicleType } from '@porter/shared';
import { VEHICLE_UI_META } from '@porter/shared';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { type PaymentMethod, useCustomerStore } from '../../store/useCustomerStore';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerTripSelect'>;

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  VISA_5496: 'Visa ....5496',
  MASTERCARD_6802: 'Mastercard ....6802',
  UPI_SCAN_PAY: 'UPI Scan and Pay',
  CASH: 'Cash'
};

const INSURANCE_LABELS: Record<InsurancePlan, string> = {
  NONE: 'No cover',
  BASIC: 'Basic cover',
  PREMIUM: 'Premium cover',
  HIGH_VALUE: 'High-value cover'
};

const FALLBACK_CENTER = {
  lat: 12.9716,
  lng: 77.5946
};

function getVehicleSymbol(vehicleType: VehicleType) {
  if (vehicleType === 'THREE_WHEELER') {
    return '3W';
  }

  if (vehicleType === 'MINI_TRUCK') {
    return 'MT';
  }

  return 'TR';
}

export function CustomerTripSelectScreen({ navigation }: Props) {
  const {
    quotes,
    selectedVehicle,
    selectVehicle,
    draftPickup,
    draftDrop,
    goodsDescription,
    goodsType,
    goodsValue,
    insuranceSelected,
    minDriverRating,
    paymentMethod,
    createBooking,
    creating,
    estimateLoading,
    fetchQuotes,
    clearError
  } = useCustomerStore();

  const hasRoute = Boolean(draftPickup && draftDrop);
  const selectedMeta = selectedVehicle ? VEHICLE_UI_META[selectedVehicle.vehicleType] : null;

  const region = useMemo(
    () => ({
      latitude: hasRoute ? (draftPickup!.lat + draftDrop!.lat) / 2 : FALLBACK_CENTER.lat,
      longitude: hasRoute ? (draftPickup!.lng + draftDrop!.lng) / 2 : FALLBACK_CENTER.lng,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08
    }),
    [draftDrop?.lat, draftDrop?.lng, draftPickup?.lat, draftPickup?.lng, hasRoute]
  );

  const submitBooking = async () => {
    if (!selectedVehicle) {
      Alert.alert('Select a vehicle', 'Choose one vehicle option to continue.');
      return;
    }

    if (!draftPickup || !draftDrop) {
      Alert.alert('Route required', 'Please choose pick-up and drop points first.');
      navigation.navigate('CustomerPickupConfirm');
      return;
    }

    try {
      await createBooking({
        pickup: draftPickup,
        drop: draftDrop,
        vehicleType: selectedVehicle.vehicleType,
        goodsDescription,
        goodsType,
        goodsValue,
        insuranceSelected
      });

      navigation.navigate('CustomerTracking');
    } catch {
      Alert.alert('Booking failed', 'Could not create booking. Please retry.');
    }
  };

  const refreshQuotes = async () => {
    if (!draftPickup || !draftDrop) {
      Alert.alert('Route required', 'Please confirm pick-up and drop-off first.');
      navigation.navigate('CustomerPickupConfirm');
      return;
    }

    clearError();

    try {
      await fetchQuotes({
        pickup: draftPickup,
        drop: draftDrop,
        goodsType,
        goodsValue,
        insuranceSelected,
        minDriverRating
      });
    } catch {
      Alert.alert('Quote refresh failed', 'Backend may not be reachable from this phone.');
    }
  };

  const pickupLabel = draftPickup?.address ?? 'Pick-up not selected';
  const dropLabel = draftDrop?.address ?? 'Drop-off not selected';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.mapBlock}>
          <MapView style={styles.map} initialRegion={region} region={region}>
            {draftPickup ? (
              <Marker coordinate={{ latitude: draftPickup.lat, longitude: draftPickup.lng }} title="Pickup" />
            ) : null}
            {draftDrop ? (
              <Marker coordinate={{ latitude: draftDrop.lat, longitude: draftDrop.lng }} title="Drop" pinColor="#F97316" />
            ) : null}
            {draftPickup && draftDrop ? (
              <Polyline
                coordinates={[
                  { latitude: draftPickup.lat, longitude: draftPickup.lng },
                  { latitude: draftDrop.lat, longitude: draftDrop.lng }
                ]}
                strokeColor="#0F766E"
                strokeWidth={4}
              />
            ) : null}
          </MapView>

          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>{'<'}</Text>
          </Pressable>

          <Pressable style={styles.routeBadgeTop} onPress={() => navigation.navigate('CustomerPickupConfirm')}>
            <Text style={styles.routeTitleTop} numberOfLines={1}>
              {pickupLabel.split(',')[0]}
            </Text>
            <Text style={styles.routeSubtitleTop} numberOfLines={1}>
              {pickupLabel}
            </Text>
          </Pressable>

          <Pressable style={styles.routeBadgeBottom} onPress={() => navigation.navigate('CustomerPickupConfirm')}>
            <View style={styles.etaPill}>
              <Text style={styles.etaText}>{selectedVehicle?.etaMinutes ?? 3} min</Text>
            </View>
            <View style={styles.routeCopyBottom}>
              <Text style={styles.routeTitleBottom} numberOfLines={1}>
                {dropLabel.split(',')[0]}
              </Text>
              <Text style={styles.routeSubtitleBottom} numberOfLines={1}>
                {dropLabel}
              </Text>
            </View>
            <Text style={styles.routeArrow}>{'>'}</Text>
          </Pressable>
        </View>

        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Choose Vehicle</Text>
            <Pressable style={styles.detailsButton} onPress={() => navigation.navigate('CustomerShipmentDetails')}>
              <Text style={styles.detailsText}>Edit details</Text>
            </Pressable>
          </View>

          <View style={styles.filtersRow}>
            <Text style={styles.filterChip}>{INSURANCE_LABELS[insuranceSelected]}</Text>
            <Text style={styles.filterChip}>Min rating {minDriverRating.toFixed(1)}</Text>
            <Text style={styles.filterChip}>INR {goodsValue.toFixed(0)}</Text>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {quotes.map((quote) => {
              const meta = VEHICLE_UI_META[quote.vehicleType as VehicleType];
              const active = selectedVehicle?.vehicleType === quote.vehicleType;

              return (
                <Pressable
                  key={quote.vehicleType}
                  style={[styles.tripCard, active && styles.tripCardActive]}
                  onPress={() => selectVehicle(quote.vehicleType as VehicleType)}
                >
                  <View style={styles.tripLeftIcon}>
                    <Text style={styles.tripLeftIconText}>
                      {getVehicleSymbol(quote.vehicleType as VehicleType)}
                    </Text>
                  </View>
                  <View style={styles.tripMain}>
                    <View style={styles.tripTopRow}>
                      <Text style={styles.tripTitle}>{meta.label}</Text>
                      <Text style={styles.tripPrice}>INR {quote.pricing.total.toFixed(0)}</Text>
                    </View>
                    <Text style={styles.tripEta}>ETA {quote.etaMinutes} min</Text>
                    <Text style={styles.tripMeta}>
                      {quote.availableDrivers} drivers nearby · Rating x{quote.pricing.multiplier.toFixed(2)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            {quotes.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No quotes yet</Text>
                <Text style={styles.emptySubtitle}>Refresh after selecting route and shipment details.</Text>
              </View>
            ) : null}
          </ScrollView>

          <Pressable style={styles.paymentRow} onPress={() => navigation.navigate('CustomerPayment')}>
            <View style={styles.paymentLeft}>
              <View style={styles.cardChip}>
                <Text style={styles.cardChipText}>PAY</Text>
              </View>
              <Text style={styles.paymentLabel}>{PAYMENT_LABELS[paymentMethod]}</Text>
            </View>
            <Text style={styles.routeArrow}>{'>'}</Text>
          </Pressable>

          <View style={styles.ctaRow}>
            <Pressable style={styles.refreshButton} onPress={() => void refreshQuotes()} disabled={estimateLoading}>
              {estimateLoading ? (
                <ActivityIndicator color="#0F766E" />
              ) : (
                <Text style={styles.smallButtonText}>Refresh</Text>
              )}
            </Pressable>

            <Pressable style={styles.chooseButton} onPress={() => void submitBooking()} disabled={creating}>
              {creating ? (
                <ActivityIndicator color="#ECFEFF" />
              ) : (
                <Text style={styles.chooseText}>{selectedMeta ? `Book ${selectedMeta.label}` : 'Book vehicle'}</Text>
              )}
            </Pressable>
          </View>
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
  mapBlock: {
    height: '40%',
    position: 'relative'
  },
  map: {
    flex: 1
  },
  backButton: {
    position: 'absolute',
    top: 14,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  backButtonText: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 18
  },
  routeBadgeTop: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 64,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  routeTitleTop: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14
  },
  routeSubtitleTop: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12
  },
  routeBadgeBottom: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  etaPill: {
    borderRadius: 8,
    backgroundColor: '#ECFEFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  etaText: {
    color: '#0F766E',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11
  },
  routeCopyBottom: {
    flex: 1
  },
  routeTitleBottom: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  routeSubtitleBottom: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11
  },
  routeArrow: {
    color: '#0F766E',
    fontFamily: 'Manrope_700Bold',
    fontSize: 16
  },
  sheet: {
    flex: 1,
    marginTop: -8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12
  },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sheetTitle: {
    color: '#0F172A',
    fontFamily: 'Sora_700Bold',
    fontSize: 20
  },
  detailsButton: {
    borderRadius: 999,
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  detailsText: {
    color: '#9A3412',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 4
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    backgroundColor: '#F0FDFA',
    color: '#0F766E',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  list: {
    flex: 1
  },
  listContent: {
    gap: 8,
    paddingVertical: 8
  },
  tripCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10,
    flexDirection: 'row',
    gap: 10
  },
  tripCardActive: {
    borderColor: '#0F766E',
    backgroundColor: '#ECFDF5'
  },
  tripLeftIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#CCFBF1'
  },
  tripLeftIconText: {
    color: '#0F766E',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  tripMain: {
    flex: 1,
    gap: 2
  },
  tripTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  tripTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 18
  },
  tripPrice: {
    color: '#0F172A',
    fontFamily: 'Sora_700Bold',
    fontSize: 16
  },
  tripEta: {
    color: '#334155',
    fontFamily: 'Manrope_500Medium',
    fontSize: 13
  },
  tripMeta: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11
  },
  emptyState: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    backgroundColor: '#F8FAFC'
  },
  emptyTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14
  },
  emptySubtitle: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12,
    marginTop: 2
  },
  paymentRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  paymentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  cardChip: {
    backgroundColor: '#0F766E',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  cardChipText: {
    color: '#ECFEFF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 10
  },
  paymentLabel: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  refreshButton: {
    minWidth: 86,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center'
  },
  chooseButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48
  },
  chooseText: {
    color: '#ECFEFF',
    fontFamily: 'Sora_700Bold',
    fontSize: 16
  },
  smallButtonText: {
    color: '#0F766E',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  }
});
