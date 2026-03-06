import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { io } from 'socket.io-client';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import api, { REALTIME_BASE_URL } from '../../services/api';
import { useCustomerStore } from '../../store/useCustomerStore';
import type { RootStackParamList } from '../../types/navigation';

interface DriverPoint {
  lat: number;
  lng: number;
  timestamp: string;
}

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerTracking'>;

export function CustomerTrackingScreen({ navigation }: Props) {
  const refreshOrder = useCustomerStore((state) => state.refreshOrder);
  const refreshTimeline = useCustomerStore((state) => state.refreshTimeline);
  const refreshLocationHistory = useCustomerStore((state) => state.refreshLocationHistory);
  const activeOrderId = useCustomerStore((state) => state.activeOrderId);
  const generatedEwayBillNumber = useCustomerStore((state) => state.generatedEwayBillNumber);

  const [order, setOrder] = useState<any>();
  const [timeline, setTimeline] = useState<any[]>([]);
  const [points, setPoints] = useState<DriverPoint[]>([]);
  const [rating, setRating] = useState(5);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [orderPayload, timelinePayload, historyPayload] = await Promise.all([
        refreshOrder(),
        refreshTimeline(),
        refreshLocationHistory()
      ]);

      setOrder(orderPayload);
      setTimeline(timelinePayload?.timeline ?? []);
      setPoints(
        (historyPayload?.points ?? [])
          .map((item: any) => ({
            lat: Number(item.lat),
            lng: Number(item.lng),
            timestamp: item.timestamp
          }))
          .filter((item: DriverPoint) => !Number.isNaN(item.lat) && !Number.isNaN(item.lng))
          .reverse()
      );
    };

    void load();
    const interval = setInterval(() => void load(), 5000);

    return () => clearInterval(interval);
  }, [refreshLocationHistory, refreshOrder, refreshTimeline]);

  useEffect(() => {
    if (!activeOrderId) {
      return;
    }

    const socket = io(`${REALTIME_BASE_URL}/realtime`, {
      transports: ['websocket'],
      timeout: 7000
    });

    socket.on('connect', () => {
      socket.emit('subscribe:order', { orderId: activeOrderId });
    });

    socket.on('driver:location', (payload) => {
      if (!payload || typeof payload.lat !== 'number' || typeof payload.lng !== 'number') {
        return;
      }

      setPoints((current) => [
        ...current,
        {
          lat: payload.lat,
          lng: payload.lng,
          timestamp: payload.timestamp ?? new Date().toISOString()
        }
      ]);
    });

    socket.on('trip:completed', () => {
      void refreshOrder().then(setOrder);
    });

    return () => {
      socket.disconnect();
    };
  }, [activeOrderId, refreshOrder]);

  const pickup = {
    latitude: order?.pickupLat ?? 12.9716,
    longitude: order?.pickupLng ?? 77.5946
  };
  const drop = {
    latitude: order?.dropLat ?? 12.9816,
    longitude: order?.dropLng ?? 77.6046
  };

  const liveDriver = points.at(-1);

  const region = useMemo(
    () => ({
      latitude: liveDriver?.lat ?? pickup.latitude,
      longitude: liveDriver?.lng ?? pickup.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08
    }),
    [liveDriver?.lat, liveDriver?.lng, pickup.latitude, pickup.longitude]
  );

  const submitRating = async () => {
    const tripId = order?.trip?.id;
    if (!tripId) {
      return;
    }

    try {
      await api.post(`/trips/${tripId}/rate`, {
        driverRating: rating,
        review: `Rated ${rating}/5 from customer app`
      });

      setRatingSubmitted(true);
      Alert.alert('Thanks', 'Driver rating submitted.');
    } catch {
      Alert.alert('Could not submit rating', 'Please try once again.');
    }
  };

  const ewayDisplay = order?.ewayBillNumber ?? generatedEwayBillNumber;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.mapWrap}>
          <MapView style={styles.map} initialRegion={region} region={region}>
            <Marker coordinate={pickup} title="Pickup" />
            <Marker coordinate={drop} title="Drop" pinColor="#F97316" />

            {liveDriver ? (
              <Marker
                coordinate={{ latitude: liveDriver.lat, longitude: liveDriver.lng }}
                title="Driver"
                pinColor="#0F766E"
              />
            ) : null}

            <Polyline coordinates={[pickup, drop]} strokeColor="#94A3B8" strokeWidth={3} />

            {points.length > 1 ? (
              <Polyline
                coordinates={points.map((point) => ({
                  latitude: point.lat,
                  longitude: point.lng
                }))}
                strokeColor="#0F766E"
                strokeWidth={4}
              />
            ) : null}
          </MapView>

          <Pressable style={styles.backButton} onPress={() => navigation.navigate('CustomerHome')}>
            <Text style={styles.backButtonText}>{'<'}</Text>
          </Pressable>
        </View>

        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Live Delivery</Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{order?.status ?? 'CREATED'}</Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Trip status</Text>
              <Text style={styles.infoValue}>{order?.trip?.status ?? 'MATCHING'}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>ETA</Text>
              <Text style={styles.infoValue}>{order?.trip?.etaMinutes ?? 15} min</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Waiting charge</Text>
              <Text style={styles.infoValue}>INR {Number(order?.waitingCharge ?? 0).toFixed(0)}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Payment</Text>
              <Text style={styles.infoValue}>{order?.payment?.status ?? 'PENDING'}</Text>
            </View>
          </View>

          {ewayDisplay ? (
            <View style={styles.ewayCard}>
              <Text style={styles.ewayLabel}>GST e-way bill</Text>
              <Text style={styles.ewayNumber}>{ewayDisplay}</Text>
            </View>
          ) : null}

          <Text style={styles.timelineTitle}>Trip timeline</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineRow}>
            {timeline.map((event) => (
              <View key={`${event.key}-${event.timestamp}`} style={styles.timelineItem}>
                <Text style={styles.timelineStatus}>{event.status}</Text>
                <Text style={styles.timelineTime}>
                  {new Date(event.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </Text>
              </View>
            ))}
          </ScrollView>

          {order?.status === 'DELIVERED' ? (
            <View style={styles.ratingCard}>
              <Text style={styles.ratingTitle}>Rate your driver</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable
                    key={value}
                    style={[styles.ratingDot, rating >= value && styles.ratingDotActive]}
                    onPress={() => setRating(value)}
                    disabled={ratingSubmitted}
                  >
                    <Text style={[styles.ratingDotText, rating >= value && styles.ratingDotTextActive]}>{value}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.rateButton} onPress={() => void submitRating()} disabled={ratingSubmitted}>
                <Text style={styles.rateButtonText}>{ratingSubmitted ? 'Rating submitted' : 'Submit rating'}</Text>
              </Pressable>
            </View>
          ) : null}
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
  mapWrap: {
    flex: 1,
    position: 'relative'
  },
  map: {
    flex: 1
  },
  backButton: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  backButtonText: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 18
  },
  sheet: {
    marginTop: -8,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 10
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sheetTitle: {
    color: '#0F172A',
    fontFamily: 'Sora_700Bold',
    fontSize: 20
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusPillText: {
    color: '#0F766E',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  infoCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 8
  },
  infoLabel: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11
  },
  infoValue: {
    marginTop: 2,
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  ewayCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    padding: 10
  },
  ewayLabel: {
    color: '#92400E',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  ewayNumber: {
    marginTop: 2,
    color: '#7C2D12',
    fontFamily: 'Sora_700Bold',
    fontSize: 14
  },
  timelineTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14
  },
  timelineRow: {
    gap: 8,
    paddingBottom: 2
  },
  timelineItem: {
    minWidth: 110,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    paddingHorizontal: 8
  },
  timelineStatus: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11
  },
  timelineTime: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 10,
    marginTop: 2
  },
  ratingCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10,
    gap: 8
  },
  ratingTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 6
  },
  ratingDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF'
  },
  ratingDotActive: {
    borderColor: '#0F766E',
    backgroundColor: '#CCFBF1'
  },
  ratingDotText: {
    color: '#475569',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  ratingDotTextActive: {
    color: '#0F766E'
  },
  rateButton: {
    borderRadius: 10,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10
  },
  rateButtonText: {
    color: '#ECFEFF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  }
});
