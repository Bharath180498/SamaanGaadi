import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import api from '../../services/api';
import { isOngoingOrderStatus, useCustomerStore } from '../../store/useCustomerStore';
import type { RootStackParamList } from '../../types/navigation';
import { DeliverySignaturePreview } from '../../components/DeliverySignaturePreview';
import { getCustomerPaymentStatusLabel, isCustomerPaymentPending } from './paymentState';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerRideDetails'>;

interface TimelineEvent {
  key: string;
  status: string;
  timestamp: string;
}

interface RideDetailsResponse {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  scheduledAt?: string | null;
  pickupAddress: string;
  dropAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  vehicleType: string;
  goodsDescription: string;
  goodsType?: string | null;
  goodsValue: string | number;
  insuranceSelected: string;
  insurancePremium?: string | number | null;
  gstin?: string | null;
  hsnCode?: string | null;
  invoiceValue?: string | number | null;
  ewayBillNumber?: string | null;
  estimatedPrice?: string | number | null;
  finalPrice?: string | number | null;
  waitingCharge?: string | number | null;
  payment?: {
    provider?: string | null;
    status?: string | null;
    amount?: string | number | null;
    providerRef?: string | null;
    directPayToDriver?: boolean | null;
    directUpiVpa?: string | null;
    createdAt?: string;
    updatedAt?: string;
  } | null;
  trip?: {
    status?: string | null;
    driverPreferredUpiId?: string | null;
    driverPreferredPaymentLabel?: string | null;
    etaMinutes?: number | null;
    pickupTime?: string | null;
    loadingStart?: string | null;
    loadingEnd?: string | null;
    deliveryTime?: string | null;
    distanceKm?: number | null;
    durationMinutes?: number | null;
    waitingCharge?: string | number | null;
    driver?: {
      vehicleNumber?: string | null;
      licenseNumber?: string | null;
      payoutAccount?: {
        upiId?: string | null;
      } | null;
      user?: {
        name?: string | null;
        phone?: string | null;
        rating?: number | null;
      } | null;
      vehicles?: Array<{
        type?: string | null;
        capacityKg?: number | null;
        insuranceStatus?: string | null;
      }> | null;
    } | null;
    rating?: {
      driverRating?: number | null;
      customerRating?: number | null;
      review?: string | null;
    } | null;
    deliveryProof?: {
      id?: string;
      receiverName?: string | null;
      receiverSignature?: unknown;
      photoUrl?: string | null;
      signatureCapturedAt?: string | null;
      createdAt?: string;
    } | null;
  } | null;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatInr(value: unknown) {
  return `INR ${asNumber(value).toFixed(0)}`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'N/A';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function prettify(input?: string | null) {
  if (!input) {
    return 'N/A';
  }
  return input.replace(/_/g, ' ');
}

function normalizeImageUrl(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:') ||
    /^https?:\/\//i.test(trimmed)
  ) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (/^[\w.-]+\.[A-Za-z]{2,}(?:\/|$)/.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

export function CustomerRideDetailsScreen({ navigation, route }: Props) {
  const setActiveOrder = useCustomerStore((state) => state.setActiveOrder);
  const [ride, setRide] = useState<RideDetailsResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [proofImageFailed, setProofImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(undefined);
      try {
        const [orderResponse, timelineResponse] = await Promise.all([
          api.get(`/orders/${route.params.orderId}`),
          api.get(`/orders/${route.params.orderId}/timeline`)
        ]);

        if (cancelled) {
          return;
        }

        const orderPayload = orderResponse.data as RideDetailsResponse;
        const timelinePayload = timelineResponse.data as { timeline?: TimelineEvent[] };
        setRide(orderPayload);
        setTimeline(Array.isArray(timelinePayload.timeline) ? timelinePayload.timeline : []);
      } catch {
        if (!cancelled) {
          setError('Unable to load this ride right now.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [route.params.orderId]);

  const computedFinalFare = useMemo(() => {
    if (!ride) {
      return 0;
    }
    if (ride.finalPrice !== null && ride.finalPrice !== undefined) {
      return asNumber(ride.finalPrice);
    }
    return asNumber(ride.estimatedPrice) + asNumber(ride.waitingCharge) + asNumber(ride.insurancePremium);
  }, [ride]);

  const deliveryProof = ride?.trip?.deliveryProof;
  const proofReceiver = typeof deliveryProof?.receiverName === 'string' ? deliveryProof.receiverName : '';
  const proofPhotoUrl = normalizeImageUrl(deliveryProof?.photoUrl);
  const proofCapturedAt =
    typeof deliveryProof?.signatureCapturedAt === 'string'
      ? deliveryProof.signatureCapturedAt
      : typeof deliveryProof?.createdAt === 'string'
      ? deliveryProof.createdAt
      : undefined;
  const showProofPhoto = Boolean(proofPhotoUrl) && !proofImageFailed;
  const hasDeliveryProof = Boolean(proofReceiver || proofPhotoUrl || deliveryProof?.receiverSignature);
  const paymentStatusLabel = getCustomerPaymentStatusLabel({
    orderStatus: ride?.status,
    payment: ride?.payment
  });
  const paymentPending = isCustomerPaymentPending({
    orderStatus: ride?.status,
    payment: ride?.payment
  });
  const paymentDirectToDriver = Boolean(ride?.payment?.directPayToDriver);
  const driverPreferredPayment = ride?.trip?.driverPreferredPaymentLabel ?? ride?.trip?.driverPreferredUpiId;

  const openTracking = () => {
    if (!ride) {
      return;
    }
    setActiveOrder(ride.id, ride.status);
    navigation.navigate('CustomerTracking');
  };

  const openPayment = () => {
    if (!ride) {
      return;
    }
    setActiveOrder(ride.id, ride.status);
    navigation.navigate('CustomerPayment');
  };

  useEffect(() => {
    setProofImageFailed(false);
  }, [proofPhotoUrl]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>{'<'}</Text>
          </Pressable>
          <Text style={styles.title}>Ride Details</Text>
          <View style={styles.backButton} />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#1D4ED8" size="large" />
            <Text style={styles.loadingText}>Loading ride details...</Text>
          </View>
        ) : error || !ride ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.errorText}>{error ?? 'Ride not found.'}</Text>
            <Pressable style={styles.retryButton} onPress={() => navigation.goBack()}>
              <Text style={styles.retryText}>Back</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            alwaysBounceHorizontal={false}
            bounces={false}
            directionalLockEnabled
          >
            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <Text style={styles.statusTitle}>{prettify(ride.status)}</Text>
                <Text style={styles.statusMeta}>{formatDateTime(ride.createdAt)}</Text>
              </View>
              <Text style={styles.statusSub}>Ride ID: {ride.id}</Text>
              {isOngoingOrderStatus(ride.status) ? (
                <Pressable style={styles.trackButton} onPress={openTracking}>
                  <Text style={styles.trackButtonText}>Open Live Tracking</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Route</Text>
              <Text style={styles.lineItem}>Pickup: {ride.pickupAddress}</Text>
              <Text style={styles.lineItem}>Drop: {ride.dropAddress}</Text>
              <Text style={styles.lineItem}>
                Coordinates: {ride.pickupLat.toFixed(5)}, {ride.pickupLng.toFixed(5)} → {ride.dropLat.toFixed(5)},{' '}
                {ride.dropLng.toFixed(5)}
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Driver & Vehicle</Text>
              <Text style={styles.lineItem}>Driver: {ride.trip?.driver?.user?.name ?? 'N/A'}</Text>
              <Text style={styles.lineItem}>Phone: {ride.trip?.driver?.user?.phone ?? 'N/A'}</Text>
              <Text style={styles.lineItem}>Rating: {ride.trip?.driver?.user?.rating?.toFixed(1) ?? 'N/A'}</Text>
              <Text style={styles.lineItem}>Vehicle No: {ride.trip?.driver?.vehicleNumber ?? 'N/A'}</Text>
              <Text style={styles.lineItem}>
                Vehicle Type: {prettify(ride.trip?.driver?.vehicles?.[0]?.type ?? ride.vehicleType)}
              </Text>
              <Text style={styles.lineItem}>License: {ride.trip?.driver?.licenseNumber ?? 'N/A'}</Text>
              <Text style={styles.lineItem}>Driver UPI: {ride.trip?.driver?.payoutAccount?.upiId ?? 'N/A'}</Text>
            </View>

            {hasDeliveryProof ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Proof of Delivery</Text>
                <ScrollView
                  style={styles.proofBodyScroll}
                  contentContainerStyle={styles.proofBodyContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.lineItem}>Receiver: {proofReceiver || 'Captured'}</Text>
                  <Text style={styles.lineItem}>Captured: {formatDateTime(proofCapturedAt)}</Text>
                  {showProofPhoto ? (
                    <Image
                      source={{ uri: proofPhotoUrl }}
                      style={styles.proofImage}
                      resizeMode="cover"
                      onError={() => setProofImageFailed(true)}
                    />
                  ) : proofPhotoUrl ? (
                    <Text style={styles.proofFallbackText}>
                      Photo preview is unavailable for this trip. Pull to refresh and try again.
                    </Text>
                  ) : null}
                  <DeliverySignaturePreview signature={deliveryProof?.receiverSignature} height={108} />
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Bill Summary</Text>
              <Text style={styles.lineItem}>Estimated Fare: {formatInr(ride.estimatedPrice)}</Text>
              <Text style={styles.lineItem}>Insurance Premium: {formatInr(ride.insurancePremium)}</Text>
              <Text style={styles.lineItem}>Waiting Charge: {formatInr(ride.waitingCharge)}</Text>
              <Text style={styles.billFinal}>Final Fare: {formatInr(computedFinalFare)}</Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Payment</Text>
              <Text style={styles.lineItem}>Provider: {prettify(ride.payment?.provider)}</Text>
              <Text style={styles.lineItem}>Status: {prettify(paymentStatusLabel)}</Text>
              <Text style={styles.lineItem}>
                Settlement: {paymentDirectToDriver ? 'Driver UPI Direct' : 'QARGO Escrow'}
              </Text>
              {paymentDirectToDriver ? (
                <Text style={styles.lineItem}>Direct UPI: {ride.payment?.directUpiVpa ?? 'N/A'}</Text>
              ) : null}
              <Text style={styles.lineItem}>Amount: {formatInr(ride.payment?.amount ?? ride.finalPrice ?? ride.estimatedPrice)}</Text>
              <Text style={styles.lineItem}>Provider Ref: {ride.payment?.providerRef ?? 'N/A'}</Text>
              <Text style={styles.lineItem}>Updated: {formatDateTime(ride.payment?.updatedAt)}</Text>
              {driverPreferredPayment ? (
                <Text style={styles.lineItem}>Driver preferred payment: {driverPreferredPayment}</Text>
              ) : null}
              {paymentPending ? (
                <>
                  <Text style={styles.pendingPaymentCopy}>Payment is still pending for this ride.</Text>
                  <Pressable style={styles.payNowButton} onPress={openPayment}>
                    <Text style={styles.payNowButtonText}>Pay now</Text>
                  </Pressable>
                </>
              ) : null}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Shipment & Compliance</Text>
              <Text style={styles.lineItem}>Goods: {ride.goodsDescription}</Text>
              <Text style={styles.lineItem}>Category: {ride.goodsType ?? 'N/A'}</Text>
              <Text style={styles.lineItem}>Goods Value: {formatInr(ride.goodsValue)}</Text>
              <Text style={styles.lineItem}>Insurance Plan: {prettify(ride.insuranceSelected)}</Text>
              <Text style={styles.lineItem}>GSTIN: {ride.gstin ?? 'N/A'}</Text>
              <Text style={styles.lineItem}>HSN Code: {ride.hsnCode ?? 'N/A'}</Text>
              <Text style={styles.lineItem}>Invoice Value: {formatInr(ride.invoiceValue)}</Text>
              <Text style={styles.lineItem}>E-way Bill: {ride.ewayBillNumber ?? 'N/A'}</Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Trip Timeline</Text>
              {timeline.length === 0 ? (
                <Text style={styles.lineItem}>No timeline events available.</Text>
              ) : (
                timeline.map((event) => (
                  <View key={`${event.key}-${event.timestamp}`} style={styles.timelineItem}>
                    <Text style={styles.timelineStatus}>{prettify(event.status)}</Text>
                    <Text style={styles.timelineTime}>{formatDateTime(event.timestamp)}</Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFF6FF' },
  container: {
    flex: 1,
    alignItems: 'center',
    overflow: 'hidden'
  },
  scrollView: {
    width: '100%'
  },
  headerRow: {
    width: '100%',
    maxWidth: 460,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center'
  },
  backText: {
    color: '#FFF',
    fontSize: 20,
    fontFamily: 'Manrope_700Bold'
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 22,
    color: '#7C2D12'
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  loadingText: {
    color: '#334155',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14
  },
  errorText: {
    color: '#B91C1C',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14
  },
  retryButton: {
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  retryText: {
    color: '#EFF6FF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  scroll: {
    width: '100%',
    maxWidth: 440,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12
  },
  statusCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#F8FAFF',
    padding: 12,
    gap: 6
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8
  },
  statusTitle: {
    color: '#1E40AF',
    fontFamily: 'Sora_700Bold',
    fontSize: 16
  },
  statusMeta: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11
  },
  statusSub: {
    color: '#14532D',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12
  },
  trackButton: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    paddingVertical: 10,
    alignItems: 'center'
  },
  trackButtonText: {
    color: '#EFF6FF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 6
  },
  sectionTitle: {
    color: '#0F172A',
    fontFamily: 'Sora_700Bold',
    fontSize: 15
  },
  lineItem: {
    color: '#334155',
    fontFamily: 'Manrope_500Medium',
    fontSize: 13
  },
  pendingPaymentCopy: {
    marginTop: 4,
    color: '#9A3412',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  payNowButton: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10
  },
  payNowButtonText: {
    color: '#EFF6FF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  billFinal: {
    marginTop: 2,
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14
  },
  proofImage: {
    width: '100%',
    height: 150,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#DBEAFE'
  },
  proofBodyScroll: {
    maxHeight: 320
  },
  proofBodyContent: {
    gap: 6
  },
  proofFallbackText: {
    color: '#B45309',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  timelineItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 8
  },
  timelineStatus: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  timelineTime: {
    marginTop: 2,
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12
  }
});
