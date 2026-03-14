import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View
} from 'react-native';
import { io } from 'socket.io-client';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import api, { REALTIME_BASE_URL } from '../../services/api';
import { useCustomerStore } from '../../store/useCustomerStore';
import type { RootStackParamList } from '../../types/navigation';
import MapView, { Marker, Polyline } from '../../components/maps';
import { DeliverySignaturePreview } from '../../components/DeliverySignaturePreview';
import { getCustomerPaymentStatusLabel, isCustomerPaymentPending } from './paymentState';
import appConfig from '../../../app.json';

interface DriverPoint {
  lat: number;
  lng: number;
  timestamp: string;
}

interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

const TRIP_STAGES: Array<{ key: string; label: string }> = [
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'DRIVER_EN_ROUTE', label: 'En route' },
  { key: 'ARRIVED_PICKUP', label: 'At pickup' },
  { key: 'LOADING', label: 'Loading' },
  { key: 'IN_TRANSIT', label: 'In transit' },
  { key: 'COMPLETED', label: 'Delivered' }
];

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

function decodePolyline(encoded: string) {
  const points: RouteCoordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length + 1);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length + 1);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5
    });
  }

  return points;
}

function haversineDistanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function vehicleEmoji(vehicleType?: string) {
  if (vehicleType === 'THREE_WHEELER') {
    return '🛺';
  }
  if (vehicleType === 'MINI_TRUCK') {
    return '🚚';
  }
  return '🚛';
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

async function fetchRouteDirect(input: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}) {
  if (!MOBILE_GOOGLE_MAPS_API_KEY) {
    return null;
  }

  const params = new URLSearchParams({
    origin: `${input.originLat},${input.originLng}`,
    destination: `${input.destinationLat},${input.destinationLng}`,
    mode: 'driving',
    alternatives: 'false',
    departure_time: 'now',
    key: MOBILE_GOOGLE_MAPS_API_KEY
  });

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
    if (response.ok) {
      const payload = (await response.json()) as {
        routes?: Array<{
          overview_polyline?: { points?: string };
          legs?: Array<{
            distance?: { value?: number };
          }>;
        }>;
      };

      const route = payload.routes?.[0];
      const encodedPolyline = route?.overview_polyline?.points;
      if (encodedPolyline) {
        return {
          coordinates: decodePolyline(encodedPolyline),
          distanceKm: Number((Number(route?.legs?.[0]?.distance?.value ?? 0) / 1000).toFixed(2))
        };
      }
    }
  } catch {
    // Fallback to Routes API (new)
  }

  try {
    const modernResponse = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': MOBILE_GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.polyline.encodedPolyline'
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: input.originLat,
              longitude: input.originLng
            }
          }
        },
        destination: {
          location: {
            latLng: {
              latitude: input.destinationLat,
              longitude: input.destinationLng
            }
          }
        },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: false,
        polylineQuality: 'HIGH_QUALITY',
        units: 'METRIC',
        languageCode: 'en-US'
      })
    });

    if (!modernResponse.ok) {
      return null;
    }

    const payload = (await modernResponse.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        polyline?: {
          encodedPolyline?: string;
        };
      }>;
    };

    const route = payload.routes?.[0];
    const encodedPolyline = route?.polyline?.encodedPolyline;
    if (!route || !encodedPolyline) {
      return null;
    }

    return {
      coordinates: decodePolyline(encodedPolyline),
      distanceKm: Number((Number(route.distanceMeters ?? 0) / 1000).toFixed(2))
    };
  } catch {
    return null;
  }
}

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerTracking'>;

function vehicleLabel(vehicleType?: string) {
  if (!vehicleType) {
    return 'Pending';
  }

  if (vehicleType === 'THREE_WHEELER') {
    return '3 Wheeler';
  }

  if (vehicleType === 'MINI_TRUCK') {
    return 'Mini Truck';
  }

  return 'Truck';
}

export function CustomerTrackingScreen({ navigation }: Props) {
  const refreshOrder = useCustomerStore((state) => state.refreshOrder);
  const refreshTimeline = useCustomerStore((state) => state.refreshTimeline);
  const refreshLocationHistory = useCustomerStore((state) => state.refreshLocationHistory);
  const activeOrderId = useCustomerStore((state) => state.activeOrderId);
  const generatedEwayBillNumber = useCustomerStore((state) => state.generatedEwayBillNumber);
  const dismissActiveOrder = useCustomerStore((state) => state.dismissActiveOrder);

  const [order, setOrder] = useState<any>();
  const [timeline, setTimeline] = useState<any[]>([]);
  const [points, setPoints] = useState<DriverPoint[]>([]);
  const [dispatchDecisions, setDispatchDecisions] = useState<any[]>([]);
  const [rating, setRating] = useState(5);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);
  const [summaryClosed, setSummaryClosed] = useState(false);
  const [proofImageFailed, setProofImageFailed] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinate[]>([]);
  const [driverDistanceKm, setDriverDistanceKm] = useState<number | undefined>();
  const arrivalAlertedOrderRef = useRef<string | null>(null);
  const deliveryAlertedOrderRef = useRef<string | null>(null);

  useEffect(() => {
    setOrder(undefined);
    setTimeline([]);
    setPoints([]);
    setDispatchDecisions([]);
    setRouteCoordinates([]);
    setDriverDistanceKm(undefined);
    arrivalAlertedOrderRef.current = null;
    deliveryAlertedOrderRef.current = null;
  }, [activeOrderId]);

  useEffect(() => {
    const load = async () => {
      const [orderPayload, timelinePayload, historyPayload] = await Promise.all([
        refreshOrder(),
        refreshTimeline(),
        refreshLocationHistory()
      ]);

      const decisionsPayload = activeOrderId
        ? await api
            .get(`/dispatch/orders/${activeOrderId}/decisions`)
            .then((response) => response.data)
            .catch(() => [])
        : [];

      setOrder(orderPayload);
      setTimeline(timelinePayload?.timeline ?? []);
      setDispatchDecisions(Array.isArray(decisionsPayload) ? decisionsPayload : []);
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
  }, [activeOrderId, refreshLocationHistory, refreshOrder, refreshTimeline]);

  useEffect(() => {
    setSummaryClosed(false);
    setRatingSubmitted(false);
    setTipAmount(0);
  }, [activeOrderId]);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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

    const refreshSnapshot = () => {
      void Promise.all([refreshOrder(), refreshTimeline(), refreshLocationHistory()]).then(
        ([latestOrder, latestTimeline, latestHistory]) => {
          if (latestOrder) {
            setOrder(latestOrder);
          }

          if (latestTimeline?.timeline) {
            setTimeline(latestTimeline.timeline);
          }

          if (latestHistory?.points) {
            setPoints(
              (latestHistory.points ?? [])
                .map((item: any) => ({
                  lat: Number(item.lat),
                  lng: Number(item.lng),
                  timestamp: item.timestamp
                }))
                .filter((item: DriverPoint) => !Number.isNaN(item.lat) && !Number.isNaN(item.lng))
                .reverse()
            );
          }
        }
      );
    };

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
      refreshSnapshot();
    });
    socket.on('trip:driver-en-route', refreshSnapshot);
    socket.on('trip:arrived-pickup', refreshSnapshot);
    socket.on('trip:loading-started', refreshSnapshot);
    socket.on('trip:in-transit', refreshSnapshot);

    return () => {
      socket.disconnect();
    };
  }, [activeOrderId, refreshLocationHistory, refreshOrder, refreshTimeline]);

  const pickup = {
    latitude: order?.pickupLat ?? 12.9716,
    longitude: order?.pickupLng ?? 77.5946
  };
  const drop = {
    latitude: order?.dropLat ?? 12.9816,
    longitude: order?.dropLng ?? 77.6046
  };

  const assignedDriver = order?.trip?.driver;
  const assignedDriverUser = assignedDriver?.user;
  const assignedDriverVehicle = assignedDriver?.vehicles?.[0];
  const deliveryProof = order?.trip?.deliveryProof;
  const proofReceiverName = typeof deliveryProof?.receiverName === 'string' ? deliveryProof.receiverName : '';
  const proofPhotoUrl = normalizeImageUrl(deliveryProof?.photoUrl);
  const proofCapturedAt =
    typeof deliveryProof?.signatureCapturedAt === 'string'
      ? deliveryProof.signatureCapturedAt
      : typeof deliveryProof?.createdAt === 'string'
      ? deliveryProof.createdAt
      : undefined;
  const showProofPhoto = Boolean(proofPhotoUrl) && !proofImageFailed;
  const hasDeliveryProof = Boolean(proofReceiverName || proofPhotoUrl || deliveryProof?.receiverSignature);
  useEffect(() => {
    setProofImageFailed(false);
  }, [proofPhotoUrl]);
  const tripPreferredUpiId = order?.trip?.driverPreferredUpiId;
  const tripPreferredPaymentLabel = order?.trip?.driverPreferredPaymentLabel;
  const assignedDriverUpiId = tripPreferredUpiId ?? assignedDriver?.payoutAccount?.upiId;
  const assignedDriverStaticPoint =
    typeof assignedDriver?.currentLat === 'number' && typeof assignedDriver?.currentLng === 'number'
      ? {
          lat: Number(assignedDriver.currentLat),
          lng: Number(assignedDriver.currentLng),
          timestamp: new Date().toISOString()
        }
      : undefined;
  const liveDriver = points.at(-1) ?? assignedDriverStaticPoint;
  const driverInitial = assignedDriverUser?.name ? assignedDriverUser.name[0]?.toUpperCase() : 'D';

  const region = useMemo(
    () => ({
      latitude: liveDriver?.lat ?? pickup.latitude,
      longitude: liveDriver?.lng ?? pickup.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08
    }),
    [liveDriver?.lat, liveDriver?.lng, pickup.latitude, pickup.longitude]
  );

  const hasAssignedDriver = Boolean(assignedDriver);
  const matchingProgress = useMemo(() => {
    if (hasAssignedDriver) {
      return 1;
    }

    const attempts = dispatchDecisions.length;
    return Math.min(0.92, 0.18 + attempts * 0.18);
  }, [dispatchDecisions.length, hasAssignedDriver]);
  const matchingHeadline = hasAssignedDriver ? 'Driver assigned' : 'Finding your driver';
  const matchingSubtitle = hasAssignedDriver
    ? 'Pickup ETA and driver details are ready.'
    : dispatchDecisions.length > 1
      ? `Checked ${dispatchDecisions.length} nearby driver option(s).`
      : 'Checking nearby available drivers now.';
  const normalizedTripStatus =
    order?.trip?.status === 'COMPLETED' || order?.status === 'DELIVERED'
      ? 'COMPLETED'
      : order?.trip?.status;
  const currentStageIndex = useMemo(
    () => TRIP_STAGES.findIndex((stage) => stage.key === (normalizedTripStatus ?? 'ASSIGNED')),
    [normalizedTripStatus]
  );
  const paymentStatusDisplay = getCustomerPaymentStatusLabel({
    orderStatus: order?.status,
    payment: order?.payment
  });
  const paymentPending = isCustomerPaymentPending({
    orderStatus: order?.status,
    payment: order?.payment
  });
  const paymentDirectToDriver = Boolean(order?.payment?.directPayToDriver);
  const driverPaymentPreference = tripPreferredPaymentLabel ?? tripPreferredUpiId;
  const paymentSubtitle = [
    driverPaymentPreference ? `Driver prefers ${driverPaymentPreference}` : undefined,
    paymentPending && order?.payment?.provider === 'WALLET'
      ? 'Cash selected, to be collected at delivery'
      : paymentPending
      ? `${paymentStatusDisplay} - tap to pay or change method`
      : `${paymentStatusDisplay} - no action needed`,
    hasAssignedDriver
      ? 'UPI is available during or after the ride'
      : 'UPI unlocks once driver accepts your ride',
    paymentDirectToDriver
      ? 'Direct UPI mode: payment goes to driver UPI. Driver gets instant confirmation.'
      : 'Digital payments are held by QARGO and settled after delivery'
  ]
    .filter(Boolean)
    .join(' • ');
  const isCancelledOrder = order?.status === 'CANCELLED';
  const showCompletionSheet = order?.status === 'DELIVERED' && !summaryClosed && !isCancelledOrder;
  const cancellationState = useMemo(() => {
    if (!activeOrderId || !order) {
      return {
        canCancel: false,
        remainingSeconds: 0,
        hint: '',
        mode: 'NONE' as 'NONE' | 'PRE_MATCH' | 'POST_MATCH'
      };
    }

    const status = String(order.status ?? '');
    if (status === 'CREATED' || status === 'MATCHING') {
      return {
        canCancel: true,
        remainingSeconds: 0,
        hint: 'Cancel available until a driver is matched.',
        mode: 'PRE_MATCH' as const
      };
    }

    if (status === 'ASSIGNED' && order.trip?.createdAt) {
      const matchedAtMs = new Date(order.trip.createdAt).getTime();
      if (!Number.isNaN(matchedAtMs)) {
        const remainingSeconds = Math.max(0, Math.ceil((matchedAtMs + 60 * 1000 - clockNow) / 1000));
        return {
          canCancel: remainingSeconds > 0,
          remainingSeconds,
          hint:
            remainingSeconds > 0
              ? `Cancel available for ${remainingSeconds}s after match.`
              : 'Cancellation window closed after driver match.',
          mode: 'POST_MATCH' as const
        };
      }
    }

    return {
      canCancel: false,
      remainingSeconds: 0,
      hint: 'Cancellation is no longer available at this trip stage.',
      mode: 'NONE' as const
    };
  }, [activeOrderId, clockNow, order]);
  const canCancelBooking = cancellationState.canCancel;
  const isTransitStage = normalizedTripStatus === 'IN_TRANSIT' || normalizedTripStatus === 'COMPLETED';
  const routeDestinationLabel =
    isTransitStage ? 'drop' : 'pickup';
  const routeDestinationLat =
    isTransitStage ? drop.latitude : pickup.latitude;
  const routeDestinationLng =
    isTransitStage ? drop.longitude : pickup.longitude;
  const routeOriginLat = liveDriver?.lat ?? pickup.latitude;
  const routeOriginLng = liveDriver?.lng ?? pickup.longitude;
  const pickupDistanceKm = liveDriver
    ? haversineDistanceKm(
        { lat: liveDriver.lat, lng: liveDriver.lng },
        { lat: pickup.latitude, lng: pickup.longitude }
      )
    : undefined;
  const dropDistanceKm = liveDriver
    ? haversineDistanceKm(
        { lat: liveDriver.lat, lng: liveDriver.lng },
        { lat: drop.latitude, lng: drop.longitude }
      )
    : undefined;
  const driverAtPickup = Boolean(!isTransitStage && typeof pickupDistanceKm === 'number' && pickupDistanceKm <= 0.15);
  const effectiveDriverDistanceKm =
    (isTransitStage ? dropDistanceKm : pickupDistanceKm) ?? driverDistanceKm;
  const driverDistanceLabel =
    driverAtPickup
      ? 'Driver is at pickup'
      : typeof effectiveDriverDistanceKm === 'number'
      ? `${effectiveDriverDistanceKm.toFixed(1)} km to ${routeDestinationLabel}`
      : 'Distance will appear once driver location is live';

  useEffect(() => {
    if (!activeOrderId || !hasAssignedDriver) {
      return;
    }

    if (arrivalAlertedOrderRef.current === activeOrderId) {
      return;
    }

    const arrivedByStatus = normalizedTripStatus === 'ARRIVED_PICKUP';
    if (!driverAtPickup && !arrivedByStatus) {
      return;
    }

    arrivalAlertedOrderRef.current = activeOrderId;
    Vibration.vibrate([0, 250, 120, 350], false);
    Alert.alert('Driver has arrived', 'Your driver is at pickup. Please hand over your items.');
  }, [activeOrderId, driverAtPickup, hasAssignedDriver, normalizedTripStatus]);

  useEffect(() => {
    if (!activeOrderId || order?.status !== 'DELIVERED' || !hasDeliveryProof) {
      return;
    }

    if (deliveryAlertedOrderRef.current === activeOrderId) {
      return;
    }

    deliveryAlertedOrderRef.current = activeOrderId;
    Vibration.vibrate([0, 220, 100, 220], false);
    Alert.alert(
      'Delivery completed',
      proofReceiverName
        ? `Delivered successfully to ${proofReceiverName}. Proof of delivery is available in this trip.`
        : 'Delivered successfully. Proof of delivery is available in this trip.'
    );
  }, [activeOrderId, hasDeliveryProof, order?.status, proofReceiverName]);

  useEffect(() => {
    if (!activeOrderId) {
      setRouteCoordinates([]);
      setDriverDistanceKm(undefined);
      return;
    }

    let cancelled = false;

    const loadRoute = async () => {
      try {
        const response = await api.get('/maps/routes', {
          params: {
            originLat: routeOriginLat,
            originLng: routeOriginLng,
            destinationLat: routeDestinationLat,
            destinationLng: routeDestinationLng
          }
        });

        if (cancelled) {
          return;
        }

        const payload = response.data as {
          route?: {
            distanceMeters?: number;
            polyline?: Array<{ lat: number; lng: number }>;
          };
        };

        const polyline = Array.isArray(payload.route?.polyline) ? payload.route?.polyline : [];
        const coordinates = polyline
          .map((point) => ({
            latitude: Number(point.lat),
            longitude: Number(point.lng)
          }))
          .filter((point) => !Number.isNaN(point.latitude) && !Number.isNaN(point.longitude));

        if (coordinates.length > 1) {
          setRouteCoordinates(coordinates);
        } else {
          setRouteCoordinates([
            { latitude: routeOriginLat, longitude: routeOriginLng },
            { latitude: routeDestinationLat, longitude: routeDestinationLng }
          ]);
        }

        if (liveDriver && typeof payload.route?.distanceMeters === 'number') {
          setDriverDistanceKm(Number((payload.route.distanceMeters / 1000).toFixed(2)));
        } else if (liveDriver) {
          setDriverDistanceKm(
            Number(
              haversineDistanceKm(
                { lat: routeOriginLat, lng: routeOriginLng },
                { lat: routeDestinationLat, lng: routeDestinationLng }
              ).toFixed(2)
            )
          );
        } else {
          setDriverDistanceKm(undefined);
        }
      } catch {
        const direct = await fetchRouteDirect({
          originLat: routeOriginLat,
          originLng: routeOriginLng,
          destinationLat: routeDestinationLat,
          destinationLng: routeDestinationLng
        });

        if (cancelled) {
          return;
        }

        if (direct && direct.coordinates.length > 1) {
          setRouteCoordinates(direct.coordinates);
          setDriverDistanceKm(liveDriver ? direct.distanceKm : undefined);
          return;
        }

        setRouteCoordinates([
          { latitude: routeOriginLat, longitude: routeOriginLng },
          { latitude: routeDestinationLat, longitude: routeDestinationLng }
        ]);
        setDriverDistanceKm(
          liveDriver
            ? Number(
                haversineDistanceKm(
                  { lat: routeOriginLat, lng: routeOriginLng },
                  { lat: routeDestinationLat, lng: routeDestinationLng }
                ).toFixed(2)
              )
            : undefined
        );
      }
    };

    void loadRoute();

    return () => {
      cancelled = true;
    };
  }, [
    activeOrderId,
    liveDriver,
    routeDestinationLat,
    routeDestinationLng,
    routeOriginLat,
    routeOriginLng
  ]);

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

  const callDriver = async () => {
    const phone = assignedDriverUser?.phone;
    if (!phone) {
      Alert.alert('Driver contact unavailable', 'Phone number is not available yet.');
      return;
    }

    const telUrl = `tel:${phone.replace(/\s+/g, '')}`;

    try {
      const canOpen = await Linking.canOpenURL(telUrl);
      if (!canOpen) {
        Alert.alert('Cannot place call', 'This device cannot place phone calls right now.');
        return;
      }

      await Linking.openURL(telUrl);
    } catch {
      Alert.alert('Cannot place call', 'Please try again after a moment.');
    }
  };

  const ewayDisplay = order?.ewayBillNumber ?? generatedEwayBillNumber;
  const finishTripSummary = () => {
    if (tipAmount > 0) {
      Alert.alert('Tip noted', `Thanks for adding INR ${tipAmount}.`);
    }

    setSummaryClosed(true);
    dismissActiveOrder();
    navigation.navigate('CustomerHome');
  };

  const clearCancelledTrip = () => {
    dismissActiveOrder();
    navigation.navigate('CustomerHome');
  };

  const cancelBooking = async () => {
    if (!activeOrderId) {
      return;
    }

    const cancelPolicyMessage =
      cancellationState.mode === 'POST_MATCH'
        ? 'You can cancel only within 1 minute after driver assignment.'
        : 'You can cancel anytime until a driver is matched.';

    Alert.alert('Cancel booking?', cancelPolicyMessage, [
      { text: 'Keep booking', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/orders/${activeOrderId}/cancel`);
            dismissActiveOrder();
            Alert.alert('Booking cancelled', 'Your booking has been cancelled successfully.');
            navigation.navigate('CustomerHome');
          } catch (error: any) {
            const message =
              error?.response?.data?.message ??
              (typeof error?.message === 'string' ? error.message : 'Could not cancel booking.');
            Alert.alert('Unable to cancel', Array.isArray(message) ? message.join('\n') : String(message));
          }
        }
      }
    ]);
  };

  if (!activeOrderId) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No active trip right now</Text>
          <Text style={styles.emptySubtitle}>Book a new goods delivery from Home.</Text>
          <Pressable style={styles.emptyButton} onPress={() => navigation.navigate('CustomerHome')}>
            <Text style={styles.emptyButtonText}>Go to Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Loading trip details...</Text>
          <Text style={styles.emptySubtitle}>Fetching latest status from server.</Text>
          <Pressable style={styles.emptyButton} onPress={() => navigation.navigate('CustomerHome')}>
            <Text style={styles.emptyButtonText}>Go to Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isCancelledOrder) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>This booking was cancelled</Text>
          <Text style={styles.emptySubtitle}>
            The trip is not active anymore. You can create a fresh booking now.
          </Text>
          <View style={styles.cancelledActions}>
            <Pressable style={styles.emptyButton} onPress={clearCancelledTrip}>
              <Text style={styles.emptyButtonText}>Back to Home</Text>
            </Pressable>
            <Pressable
              style={styles.cancelledSecondary}
              onPress={() => {
                clearCancelledTrip();
                navigation.navigate('CustomerPickupConfirm');
              }}
            >
              <Text style={styles.cancelledSecondaryText}>Book Again</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.mapWrap}>
          <MapView style={styles.map} initialRegion={region}>
            <Marker coordinate={pickup} title="Pickup" />
            <Marker coordinate={drop} title="Drop" pinColor="#2563EB" />

            {liveDriver ? (
              <Marker
                coordinate={{ latitude: liveDriver.lat, longitude: liveDriver.lng }}
                title="Driver"
              >
                <View style={styles.driverMarker}>
                  <Text style={styles.driverMarkerEmoji}>{vehicleEmoji(assignedDriverVehicle?.type)}</Text>
                </View>
              </Marker>
            ) : null}

            {routeCoordinates.length > 1 ? (
              <Polyline coordinates={routeCoordinates} strokeColor="#2563EB" strokeWidth={4} />
            ) : (
              <Polyline coordinates={[pickup, drop]} strokeColor="#94A3B8" strokeWidth={3} />
            )}

            {points.length > 1 ? (
              <Polyline
                coordinates={points.map((point) => ({
                  latitude: point.lat,
                  longitude: point.lng
                }))}
                strokeColor="#1D4ED8"
                strokeWidth={4}
              />
            ) : null}
          </MapView>

          <Pressable style={styles.backButton} onPress={() => navigation.navigate('CustomerHome')}>
            <Text style={styles.backButtonText}>Home</Text>
          </Pressable>
        </View>

        <View style={styles.sheet}>
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Live Delivery</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{order?.status ?? 'CREATED'}</Text>
              </View>
            </View>

            <View style={styles.screenNavRow}>
              <Pressable style={styles.screenNavButton} onPress={() => navigation.navigate('CustomerHome')}>
                <Text style={styles.screenNavText}>Home</Text>
              </Pressable>
              <Pressable style={styles.screenNavButton} onPress={() => navigation.navigate('CustomerRides')}>
                <Text style={styles.screenNavText}>Rides</Text>
              </Pressable>
              <Pressable style={styles.screenNavButton} onPress={() => navigation.navigate('CustomerProfile')}>
                <Text style={styles.screenNavText}>Profile</Text>
              </Pressable>
            </View>

            <View style={styles.matchingCard}>
              <Text style={styles.matchingTitle}>{matchingHeadline}</Text>
              <Text style={styles.matchingSubtitle}>{matchingSubtitle}</Text>
              <View style={styles.matchingTrack}>
                <View style={[styles.matchingFill, { width: `${Math.round(matchingProgress * 100)}%` }]} />
              </View>
              {hasAssignedDriver ? <Text style={styles.driverDistanceText}>{driverDistanceLabel}</Text> : null}
              {canCancelBooking ? (
                <View style={styles.cancelRow}>
                  <Text style={styles.cancelHint}>{cancellationState.hint}</Text>
                  <Pressable style={styles.cancelButton} onPress={() => void cancelBooking()}>
                    <Text style={styles.cancelButtonText}>Cancel booking</Text>
                  </Pressable>
                </View>
              ) : null}
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
                <Text style={styles.infoValue}>{paymentStatusDisplay}</Text>
              </View>
            </View>

            <Pressable style={styles.paymentAction} onPress={() => navigation.navigate('CustomerPayment')}>
              <Text style={styles.paymentActionTitle}>Payment</Text>
              <Text style={styles.paymentActionSubtitle}>{paymentSubtitle}</Text>
            </Pressable>

            <View style={styles.stageCard}>
              <Text style={styles.stageTitle}>Trip stage map</Text>
              <View style={styles.stageRow}>
                {TRIP_STAGES.map((stage, index) => {
                  const completed = currentStageIndex >= index;
                  const active = currentStageIndex === index;

                  return (
                    <View key={stage.key} style={styles.stageItem}>
                      <View style={styles.stageNodeWrap}>
                        <View
                          style={[styles.stageNode, completed && styles.stageNodeDone, active && styles.stageNodeActive]}
                        />
                        {index < TRIP_STAGES.length - 1 ? (
                          <View style={[styles.stageLine, currentStageIndex > index && styles.stageLineDone]} />
                        ) : null}
                      </View>
                      <Text style={[styles.stageLabel, completed && styles.stageLabelDone]}>{stage.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {assignedDriver ? (
              <View style={styles.driverCard}>
                <View style={styles.driverCardHead}>
                  <View style={styles.driverAvatar}>
                    <Text style={styles.driverAvatarText}>{driverInitial}</Text>
                  </View>
                  <View style={styles.driverHeadCopy}>
                    <Text style={styles.driverName}>{assignedDriverUser?.name ?? 'Driver assigned'}</Text>
                    <Text style={styles.driverMetaLine}>
                      {typeof assignedDriverUser?.rating === 'number'
                        ? `${assignedDriverUser.rating.toFixed(1)} rating`
                        : 'Rating pending'}
                      {typeof assignedDriver?._count?.trips === 'number'
                        ? ` • ${assignedDriver._count.trips} trips`
                        : ''}
                    </Text>
                  </View>
                  <Pressable style={styles.callButton} onPress={() => void callDriver()}>
                    <Text style={styles.callButtonText}>Call</Text>
                  </Pressable>
                </View>

                <View style={styles.driverInfoGrid}>
                  <View style={styles.driverInfoItem}>
                    <Text style={styles.driverInfoLabel}>Vehicle</Text>
                    <Text style={styles.driverInfoValue}>
                      {vehicleLabel(assignedDriverVehicle?.type ?? assignedDriver?.vehicleType)}
                    </Text>
                  </View>
                  <View style={styles.driverInfoItem}>
                    <Text style={styles.driverInfoLabel}>Vehicle No.</Text>
                    <Text style={styles.driverInfoValue}>{assignedDriver?.vehicleNumber ?? 'Pending'}</Text>
                  </View>
                  <View style={styles.driverInfoItem}>
                    <Text style={styles.driverInfoLabel}>Phone</Text>
                    <Text style={styles.driverInfoValue}>{assignedDriverUser?.phone ?? 'Pending'}</Text>
                  </View>
                  <View style={styles.driverInfoItem}>
                    <Text style={styles.driverInfoLabel}>License</Text>
                    <Text style={styles.driverInfoValue}>{assignedDriver?.licenseNumber ?? 'Pending'}</Text>
                  </View>
                  <View style={styles.driverInfoItem}>
                    <Text style={styles.driverInfoLabel}>
                      {tripPreferredUpiId ? 'Driver preferred UPI' : 'Driver UPI'}
                    </Text>
                    <Text style={styles.driverInfoValue}>
                      {assignedDriverUpiId ?? 'Pending'}
                      {tripPreferredPaymentLabel ? ` (${tripPreferredPaymentLabel})` : ''}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.driverWaitingCard}>
                <Text style={styles.driverWaitingTitle}>Looking for your driver</Text>
                <Text style={styles.driverWaitingSubtitle}>
                  Driver profile, vehicle number, and contact will show up as soon as assignment is done.
                </Text>
              </View>
            )}

            {ewayDisplay ? (
              <View style={styles.ewayCard}>
                <Text style={styles.ewayLabel}>GST e-way bill</Text>
                <Text style={styles.ewayNumber}>{ewayDisplay}</Text>
              </View>
            ) : null}

            {hasDeliveryProof ? (
              <View style={styles.proofCard}>
                <Text style={styles.proofTitle}>Proof of delivery</Text>
                <ScrollView
                  style={styles.proofBodyScroll}
                  contentContainerStyle={styles.proofBodyContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.proofMeta}>Receiver: {proofReceiverName || 'Captured'}</Text>
                  <Text style={styles.proofMeta}>
                    Captured: {proofCapturedAt ? new Date(proofCapturedAt).toLocaleString() : 'N/A'}
                  </Text>
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
                  <DeliverySignaturePreview signature={deliveryProof?.receiverSignature} height={96} />
                </ScrollView>
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
          </ScrollView>
        </View>
      </View>

      <Modal visible={showCompletionSheet} transparent animationType="slide" onRequestClose={finishTripSummary}>
        <View style={styles.summaryBackdrop}>
          <View style={styles.summarySheet}>
            <ScrollView
              style={styles.summaryScroll}
              contentContainerStyle={styles.summaryScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.summaryHandle} />
              <Text style={styles.summaryTitle}>Trip completed</Text>
              <Text style={styles.summarySub}>Review summary and tip your driver</Text>

              <View style={styles.summaryStatsRow}>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatLabel}>Final fare</Text>
                  <Text style={styles.summaryStatValue}>
                    INR {Number(order?.finalPrice ?? order?.estimatedPrice ?? 0).toFixed(0)}
                  </Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatLabel}>Waiting charge</Text>
                  <Text style={styles.summaryStatValue}>INR {Number(order?.waitingCharge ?? 0).toFixed(0)}</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatLabel}>Payment</Text>
                  <Text style={styles.summaryStatValue}>{paymentStatusDisplay}</Text>
                </View>
              </View>

              {hasDeliveryProof ? (
                <View style={styles.summaryProofCard}>
                  <Text style={styles.summarySectionTitle}>Proof of delivery</Text>
                  <ScrollView
                    style={styles.summaryProofBodyScroll}
                    contentContainerStyle={styles.summaryProofBodyContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    <Text style={styles.summaryProofMeta}>Receiver: {proofReceiverName || 'Captured'}</Text>
                    <Text style={styles.summaryProofMeta}>
                      Captured: {proofCapturedAt ? new Date(proofCapturedAt).toLocaleString() : 'N/A'}
                    </Text>
                    {showProofPhoto ? (
                      <Image
                        source={{ uri: proofPhotoUrl }}
                        style={styles.summaryProofImage}
                        resizeMode="cover"
                        onError={() => setProofImageFailed(true)}
                      />
                    ) : proofPhotoUrl ? (
                      <Text style={styles.proofFallbackText}>
                        Photo preview is unavailable for this trip. Pull to refresh and try again.
                      </Text>
                    ) : null}
                    <DeliverySignaturePreview signature={deliveryProof?.receiverSignature} height={88} />
                  </ScrollView>
                </View>
              ) : null}

              <Text style={styles.summarySectionTitle}>Tip your driver</Text>
              <View style={styles.tipRow}>
                {[0, 20, 50, 100].map((amount) => (
                  <Pressable
                    key={amount}
                    style={[styles.tipChip, tipAmount === amount && styles.tipChipActive]}
                    onPress={() => setTipAmount(amount)}
                  >
                    <Text style={[styles.tipChipText, tipAmount === amount && styles.tipChipTextActive]}>
                      {amount === 0 ? 'No tip' : `+INR ${amount}`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.summarySectionTitle}>Rate driver</Text>
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

              <View style={styles.summaryActions}>
                {paymentPending ? (
                  <Pressable style={styles.summaryPayButton} onPress={() => navigation.navigate('CustomerPayment')}>
                    <Text style={styles.summaryPayButtonText}>Pay now</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.rateButton} onPress={() => void submitRating()} disabled={ratingSubmitted}>
                  <Text style={styles.rateButtonText}>{ratingSubmitted ? 'Rating submitted' : 'Submit rating'}</Text>
                </Pressable>
                <Pressable style={styles.summaryDoneButton} onPress={finishTripSummary}>
                  <Text style={styles.summaryDoneButtonText}>Done</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    overflow: 'hidden'
  },
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    overflow: 'hidden'
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 10
  },
  emptyTitle: {
    color: '#0F172A',
    fontFamily: 'Sora_700Bold',
    fontSize: 22,
    textAlign: 'center'
  },
  emptySubtitle: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    textAlign: 'center'
  },
  emptyButton: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  emptyButtonText: {
    color: '#EFF6FF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14
  },
  cancelledActions: {
    marginTop: 4,
    width: '100%',
    maxWidth: 280,
    gap: 10
  },
  cancelledSecondary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingVertical: 10
  },
  cancelledSecondaryText: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14
  },
  mapWrap: {
    height: '48%',
    minHeight: 250,
    position: 'relative'
  },
  map: {
    flex: 1
  },
  backButton: {
    position: 'absolute',
    top: 14,
    left: 14,
    minWidth: 58,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  backButtonText: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  driverMarker: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5
  },
  driverMarkerEmoji: {
    fontSize: 18
  },
  sheet: {
    flex: 1,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    marginTop: -4,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden'
  },
  sheetScroll: {
    flex: 1
  },
  sheetScrollContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 10
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  screenNavRow: {
    flexDirection: 'row',
    gap: 8
  },
  screenNavButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  screenNavText: {
    color: '#334155',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  sheetTitle: {
    color: '#0F172A',
    fontFamily: 'Sora_700Bold',
    fontSize: 20
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusPillText: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11
  },
  matchingCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6
  },
  matchingTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 15
  },
  matchingSubtitle: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12
  },
  matchingTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden'
  },
  matchingFill: {
    height: '100%',
    backgroundColor: '#1D4ED8'
  },
  driverDistanceText: {
    color: '#1E3A8A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  cancelRow: {
    marginTop: 4,
    gap: 8
  },
  cancelHint: {
    color: '#9A3412',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  cancelButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    paddingVertical: 8
  },
  cancelButtonText: {
    color: '#B91C1C',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  paymentAction: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 2
  },
  paymentActionTitle: {
    color: '#1E3A8A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14
  },
  paymentActionSubtitle: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12
  },
  stageCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10,
    gap: 8
  },
  stageTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  stageRow: {
    gap: 6
  },
  stageItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  stageNodeWrap: {
    alignItems: 'center'
  },
  stageNode: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    marginTop: 2
  },
  stageNodeDone: {
    borderColor: '#1D4ED8',
    backgroundColor: '#BFDBFE'
  },
  stageNodeActive: {
    backgroundColor: '#1D4ED8'
  },
  stageLine: {
    width: 2,
    height: 18,
    backgroundColor: '#CBD5E1',
    marginTop: 2
  },
  stageLineDone: {
    backgroundColor: '#1D4ED8'
  },
  stageLabel: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12
  },
  stageLabelDone: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold'
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8
  },
  infoCard: {
    width: '49%',
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
  driverCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#F8FAFF',
    padding: 10,
    gap: 10
  },
  driverCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center'
  },
  driverAvatarText: {
    color: '#1D4ED8',
    fontFamily: 'Sora_700Bold',
    fontSize: 16
  },
  driverHeadCopy: {
    flex: 1
  },
  driverName: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14
  },
  driverMetaLine: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12,
    marginTop: 1
  },
  callButton: {
    borderRadius: 999,
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  callButtonText: {
    color: '#EFF6FF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  driverInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8
  },
  driverInfoItem: {
    width: '49%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#FFFFFF',
    padding: 8
  },
  driverInfoLabel: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11
  },
  driverInfoValue: {
    marginTop: 2,
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  driverWaitingCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10
  },
  driverWaitingTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  driverWaitingSubtitle: {
    marginTop: 2,
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12
  },
  ewayCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#EFF6FF',
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
  proofCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#EFF6FF',
    padding: 10,
    gap: 6
  },
  proofBodyScroll: {
    maxHeight: 312
  },
  proofBodyContent: {
    gap: 6
  },
  proofTitle: {
    color: '#1E40AF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  proofMeta: {
    color: '#0F172A',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12
  },
  proofImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#DBEAFE'
  },
  proofFallbackText: {
    color: '#B45309',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
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
    borderColor: '#1D4ED8',
    backgroundColor: '#DBEAFE'
  },
  ratingDotText: {
    color: '#475569',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  ratingDotTextActive: {
    color: '#1D4ED8'
  },
  rateButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10
  },
  rateButtonText: {
    color: '#EFF6FF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  summaryBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.36)'
  },
  summarySheet: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24
  },
  summaryScroll: {
    maxHeight: '92%'
  },
  summaryScrollContent: {
    gap: 10
  },
  summaryHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center'
  },
  summaryTitle: {
    color: '#0F172A',
    fontFamily: 'Sora_700Bold',
    fontSize: 20
  },
  summarySub: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 13
  },
  summaryStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8
  },
  summaryStat: {
    width: '32%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 8
  },
  summaryStatLabel: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11
  },
  summaryStatValue: {
    marginTop: 2,
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  summarySectionTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  summaryProofCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#F8FAFF',
    padding: 10,
    gap: 6
  },
  summaryProofBodyScroll: {
    maxHeight: 280
  },
  summaryProofBodyContent: {
    gap: 6
  },
  summaryProofMeta: {
    color: '#334155',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12
  },
  summaryProofImage: {
    width: '100%',
    height: 130,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#DBEAFE'
  },
  tipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  tipChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  tipChipActive: {
    borderColor: '#1D4ED8',
    backgroundColor: '#DBEAFE'
  },
  tipChipText: {
    color: '#334155',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  tipChipTextActive: {
    color: '#1E3A8A'
  },
  summaryActions: {
    flexDirection: 'row',
    gap: 10
  },
  summaryPayButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10
  },
  summaryPayButtonText: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  summaryDoneButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#FFFFFF'
  },
  summaryDoneButtonText: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  }
});
