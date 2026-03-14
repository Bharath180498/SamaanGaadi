import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { colors, radius, spacing, typography } from '../../theme';
import { useDriverAppStore } from '../../store/useDriverAppStore';
import { useDriverI18n } from '../../i18n/useDriverI18n';
import { useDriverUxStore } from '../../store/useDriverUxStore';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { openGoogleMapsNavigation } from '../../utils/mapsNavigation';
import { speakDriverMessage } from '../../utils/voiceGuide';
import { buildUpiQrImageUrl, isValidUpiId } from '../../utils/upi';
import { DeliveryProofModal, type DeliveryProofSubmission } from '../../components/DeliveryProofModal';
import type { DriverTabParamList } from '../../types';
import api from '../../services/api';
import { useDriverSessionStore } from '../../store/useDriverSessionStore';

const actionMap: Array<{ status: string; endpoint: string; labelKey: string; payload?: Record<string, unknown> }> = [
  { status: 'ASSIGNED', endpoint: 'accept', labelKey: 'home.action.startTrip' },
  { status: 'DRIVER_EN_ROUTE', endpoint: 'arrived-pickup', labelKey: 'home.action.reachedPickup' },
  { status: 'ARRIVED_PICKUP', endpoint: 'start-loading', labelKey: 'home.action.startLoading' },
  { status: 'LOADING', endpoint: 'start-transit', labelKey: 'home.action.startTransit' },
  {
    status: 'IN_TRANSIT',
    endpoint: 'complete',
    labelKey: 'home.action.completeDelivery',
    payload: { distanceKm: 14, durationMinutes: 38 }
  }
];

const TRIP_STAGES: Array<{ key: string; labelKey: string }> = [
  { key: 'ASSIGNED', labelKey: 'home.stage.assigned' },
  { key: 'DRIVER_EN_ROUTE', labelKey: 'home.stage.toPickup' },
  { key: 'ARRIVED_PICKUP', labelKey: 'home.stage.atPickup' },
  { key: 'LOADING', labelKey: 'home.stage.loading' },
  { key: 'IN_TRANSIT', labelKey: 'home.stage.inTransit' },
  { key: 'COMPLETED', labelKey: 'home.stage.delivered' }
];
const QUEUE_OVERLAY_DECISION_SECONDS = 15;

interface CompletionMetrics {
  distanceKm?: number;
  durationMinutes?: number;
}

interface OfferPaymentMethod {
  id: string;
  label?: string;
  upiId: string;
  isPreferred: boolean;
}

interface OfferWithPayout {
  estimatedDriverPayoutInr?: number | string;
  order?: {
    estimatedPrice?: number | string;
    finalPrice?: number | string;
    waitingCharge?: number | string;
  };
}

function parseCompletionMetric(value: unknown) {
  const candidate = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(candidate) || candidate < 0) {
    return undefined;
  }
  return candidate;
}

function extractCompletionMetrics(payload?: Record<string, unknown>): CompletionMetrics {
  if (!payload) {
    return {};
  }

  return {
    distanceKm: parseCompletionMetric(payload.distanceKm),
    durationMinutes: parseCompletionMetric(payload.durationMinutes)
  };
}

function parseMoney(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function getOfferEarningAmount(offer?: OfferWithPayout | null) {
  if (!offer) {
    return undefined;
  }

  const explicitPayout = parseMoney(offer.estimatedDriverPayoutInr);
  if (typeof explicitPayout === 'number') {
    return explicitPayout;
  }

  const fare = parseMoney(offer.order?.finalPrice ?? offer.order?.estimatedPrice);
  if (typeof fare !== 'number') {
    return undefined;
  }

  const waitingCharge = parseMoney(offer.order?.waitingCharge) ?? 0;
  return Number((fare + waitingCharge).toFixed(2));
}

function getAvailabilityCopy(status?: 'ONLINE' | 'OFFLINE' | 'BUSY', t?: (key: any) => string) {
  if (!t) {
    return '';
  }

  if (status === 'ONLINE') {
    return t('home.availability.online');
  }
  if (status === 'BUSY') {
    return t('home.availability.busy');
  }
  return t('home.availability.offline');
}

function getPlanLabel(plan: unknown, t: (key: string, params?: Record<string, string | number>) => string) {
  const normalized = String(plan ?? '').toUpperCase();
  if (normalized === 'PRO') {
    return t('earnings.plan.pro');
  }
  if (normalized === 'ENTERPRISE') {
    return t('earnings.plan.enterprise');
  }
  return t('earnings.plan.go');
}

export function HomeScreen() {
  const { t } = useDriverI18n();
  const navigation = useNavigation<BottomTabNavigationProp<DriverTabParamList>>();
  const availabilityStatus = useDriverAppStore((state) => state.availabilityStatus);
  const setAvailability = useDriverAppStore((state) => state.setAvailability);
  const updateLocation = useDriverAppStore((state) => state.updateLocation);
  const currentJob = useDriverAppStore((state) => state.currentJob);
  const nextJob = useDriverAppStore((state) => state.nextJob);
  const pendingOffers = useDriverAppStore((state) => state.pendingOffers);
  const earnings = useDriverAppStore((state) => state.earnings);
  const acceptOffer = useDriverAppStore((state) => state.acceptOffer);
  const rejectOffer = useDriverAppStore((state) => state.rejectOffer);
  const runTripAction = useDriverAppStore((state) => state.runTripAction);
  const completeTripWithDeliveryProof = useDriverAppStore((state) => state.completeTripWithDeliveryProof);
  const sessionUser = useDriverSessionStore((state) => state.user);

  const voiceGuidanceEnabled = useDriverUxStore((state) => state.voiceGuidanceEnabled);
  const guidedHintsEnabled = useDriverUxStore((state) => state.guidedHintsEnabled);

  const [lastKnownLocation, setLastKnownLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [deliveryProofVisible, setDeliveryProofVisible] = useState(false);
  const [deliveryProofSubmitting, setDeliveryProofSubmitting] = useState(false);
  const [completionMetrics, setCompletionMetrics] = useState<CompletionMetrics>({});
  const [offerPaymentPickerVisible, setOfferPaymentPickerVisible] = useState(false);
  const [offerPaymentMethods, setOfferPaymentMethods] = useState<OfferPaymentMethod[]>([]);
  const [selectedOfferPaymentMethodId, setSelectedOfferPaymentMethodId] = useState<string>();
  const [acceptingOffer, setAcceptingOffer] = useState(false);
  const [paymentConfirming, setPaymentConfirming] = useState(false);
  const [qrPreviewVisible, setQrPreviewVisible] = useState(false);
  const [fullHomeUnlockedTripId, setFullHomeUnlockedTripId] = useState<string>();
  const [queueOverlayOfferId, setQueueOverlayOfferId] = useState<string>();
  const [queueOverlaySecondsLeft, setQueueOverlaySecondsLeft] = useState(
    QUEUE_OVERLAY_DECISION_SECONDS
  );
  const [queueOverlayVisible, setQueueOverlayVisible] = useState(false);
  const queueOverlayTranslateX = useRef(new Animated.Value(360)).current;
  const queueOverlayHandledOfferIdsRef = useRef<Set<string>>(new Set());
  const queueOverlayActionInFlightRef = useRef(false);

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const previousOfferId = useRef<string | undefined>(undefined);
  const previousStatus = useRef<string | undefined>(undefined);

  const activeOffer = pendingOffers[0];
  const currentTripId = typeof currentJob?.id === 'string' ? currentJob.id : undefined;
  const activeAction = useMemo(
    () => actionMap.find((item) => item.status === currentJob?.status),
    [currentJob?.status]
  );
  const currentStageIndex = useMemo(
    () => TRIP_STAGES.findIndex((stage) => stage.key === (currentJob?.status ?? 'ASSIGNED')),
    [currentJob?.status]
  );
  const offerSecondsLeft = useMemo(() => {
    if (!activeOffer?.expiresAt) {
      return 0;
    }
    const ms = new Date(activeOffer.expiresAt).getTime() - now;
    return Math.max(0, Math.floor(ms / 1000));
  }, [activeOffer?.expiresAt, now]);
  const offerProgress = useMemo(() => {
    if (!activeOffer?.expiresAt) {
      return 0;
    }
    const createdMs = activeOffer.createdAt ? new Date(activeOffer.createdAt).getTime() : now;
    const expiryMs = new Date(activeOffer.expiresAt).getTime();
    const total = Math.max(1, expiryMs - createdMs);
    const elapsed = Math.max(0, now - createdMs);
    return Math.min(1, elapsed / total);
  }, [activeOffer?.createdAt, activeOffer?.expiresAt, now]);
  const offerEarningAmount = useMemo(() => getOfferEarningAmount(activeOffer), [activeOffer]);
  const queueOverlayOffer = useMemo(
    () =>
      queueOverlayOfferId
        ? pendingOffers.find((offer) => offer?.id === queueOverlayOfferId)
        : undefined,
    [pendingOffers, queueOverlayOfferId]
  );
  const queueOverlayEarningAmount = useMemo(
    () => getOfferEarningAmount(queueOverlayOffer),
    [queueOverlayOffer]
  );
  const currentPaymentStatus = String(currentJob?.order?.payment?.status ?? 'PENDING').toUpperCase();
  const currentPaymentProvider = String(currentJob?.order?.payment?.provider ?? '').toUpperCase();
  const directToDriverPaymentMode =
    currentPaymentProvider === 'UPI' && Boolean(currentJob?.order?.payment?.directPayToDriver);
  const directPaymentCaptured = currentPaymentStatus === 'CAPTURED';
  const directPaymentUpiId =
    currentJob?.order?.payment?.directUpiVpa ??
    currentJob?.driverPreferredUpiId ??
    undefined;
  const directPaymentQrUrl =
    currentJob?.driverPreferredUpiQrImageUrl ??
    (directPaymentUpiId && isValidUpiId(directPaymentUpiId)
      ? buildUpiQrImageUrl({
          upiId: directPaymentUpiId,
          payeeName: currentJob?.order?.payment?.directUpiName ?? sessionUser?.name ?? 'Qargo Driver'
        })
      : undefined);
  const completionBlockedByDirectPayment = Boolean(
    currentJob && activeAction?.endpoint === 'complete' && directToDriverPaymentMode && !directPaymentCaptured
  );
  const tripFocusTakeoverEnabled = Boolean(
    currentTripId && fullHomeUnlockedTripId !== currentTripId
  );
  const shouldShowQueueOverlay = Boolean(
    currentJob?.id && queueOverlayOfferId && queueOverlayOffer
  );

  const assistantText = useMemo(() => {
    if (activeOffer) {
      return t('home.assistant.offer');
    }
    if (currentJob) {
      return t('home.assistant.current');
    }
    return t('home.assistant.idle');
  }, [activeOffer, currentJob, t]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeOffer?.id && previousOfferId.current !== activeOffer.id) {
      previousOfferId.current = activeOffer.id;
      speakDriverMessage(t('home.assistant.offer'), voiceGuidanceEnabled);
    }

    if (!activeOffer?.id) {
      previousOfferId.current = undefined;
    }
  }, [activeOffer?.id, t, voiceGuidanceEnabled]);

  useEffect(() => {
    if (activeOffer?.id) {
      return;
    }
    setOfferPaymentPickerVisible(false);
    setOfferPaymentMethods([]);
    setSelectedOfferPaymentMethodId(undefined);
  }, [activeOffer?.id]);

  useEffect(() => {
    if (!currentJob?.id || !activeOffer?.id) {
      return;
    }

    if (queueOverlayHandledOfferIdsRef.current.has(activeOffer.id)) {
      return;
    }

    if (queueOverlayOfferId === activeOffer.id) {
      return;
    }

    setQueueOverlayOfferId(activeOffer.id);
    setQueueOverlaySecondsLeft(QUEUE_OVERLAY_DECISION_SECONDS);
  }, [activeOffer?.id, currentJob?.id, queueOverlayOfferId]);

  useEffect(() => {
    if (!queueOverlayOfferId || !queueOverlayOffer || !currentJob?.id) {
      if (queueOverlayVisible) {
        Animated.timing(queueOverlayTranslateX, {
          toValue: 360,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }).start(() => {
          setQueueOverlayVisible(false);
        });
      }
      return;
    }

    setQueueOverlayVisible(true);
    Animated.timing(queueOverlayTranslateX, {
      toValue: 0,
      duration: 230,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [currentJob?.id, queueOverlayOffer, queueOverlayOfferId, queueOverlayTranslateX, queueOverlayVisible]);

  useEffect(() => {
    if (!currentTripId) {
      setFullHomeUnlockedTripId(undefined);
      return;
    }
    if (fullHomeUnlockedTripId && fullHomeUnlockedTripId !== currentTripId) {
      setFullHomeUnlockedTripId(undefined);
    }
  }, [currentTripId, fullHomeUnlockedTripId]);

  useEffect(() => {
    const currentStatus = currentJob?.status;
    if (!currentStatus) {
      previousStatus.current = undefined;
      return;
    }

    if (previousStatus.current !== currentStatus) {
      previousStatus.current = currentStatus;
      const stageLabelKey = TRIP_STAGES.find((entry) => entry.key === currentStatus)?.labelKey;
      const stageLabel = stageLabelKey ? t(stageLabelKey) : currentStatus;
      speakDriverMessage(t('home.voice.tripStage', { stage: stageLabel }), voiceGuidanceEnabled);
    }
  }, [currentJob?.status, t, voiceGuidanceEnabled]);

  useEffect(() => {
    const startTracking = async () => {
      if (availabilityStatus === 'OFFLINE' || !availabilityStatus) {
        if (locationSubscription.current) {
          locationSubscription.current.remove();
          locationSubscription.current = null;
        }
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(t('home.alert.locationRequiredTitle'), t('home.alert.locationRequiredBody'));
        return;
      }

      const initialPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      setLastKnownLocation({
        lat: initialPosition.coords.latitude,
        lng: initialPosition.coords.longitude
      });

      await updateLocation(initialPosition.coords.latitude, initialPosition.coords.longitude, currentJob?.orderId);

      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 10
        },
        (position) => {
          setLastKnownLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          void updateLocation(position.coords.latitude, position.coords.longitude, currentJob?.orderId);
        }
      );
    };

    void startTracking();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [availabilityStatus, currentJob?.orderId, updateLocation]);

  const runCurrentAction = async () => {
    if (!currentJob || !activeAction) {
      return;
    }

    if (activeAction.endpoint === 'complete' && completionBlockedByDirectPayment) {
      Alert.alert(
        t('home.alert.paymentPendingTitle'),
        t('home.alert.paymentPendingBody')
      );
      return;
    }

    if (activeAction.endpoint === 'complete') {
      setCompletionMetrics(extractCompletionMetrics(activeAction.payload));
      setDeliveryProofVisible(true);
      return;
    }

    try {
      await runTripAction(currentJob.id, activeAction.endpoint, activeAction.payload);
      speakDriverMessage(t(activeAction.labelKey), voiceGuidanceEnabled);
    } catch {
      Alert.alert(t('home.alert.actionFailedTitle'), t('home.alert.actionFailedBody'));
    }
  };

  const submitDeliveryProof = async (payload: DeliveryProofSubmission) => {
    if (!currentJob) {
      Alert.alert(t('home.alert.noActiveTripTitle'), t('home.alert.noActiveTripBody'));
      return;
    }

    setDeliveryProofSubmitting(true);
    try {
      await completeTripWithDeliveryProof(currentJob.id, {
        ...payload,
        ...completionMetrics
      });
      setDeliveryProofVisible(false);
      setCompletionMetrics({});
      speakDriverMessage(t('home.voice.deliveryDone'), voiceGuidanceEnabled);
    } catch {
      Alert.alert(t('home.alert.completionFailedTitle'), t('home.alert.completionFailedBody'));
    } finally {
      setDeliveryProofSubmitting(false);
    }
  };

  const quickNavigateCurrent = async () => {
    if (!currentJob?.order) {
      Alert.alert(t('home.alert.noActiveTripTitle'), t('home.alert.noActiveTripBody'));
      return;
    }

    const toDrop = currentJob.status === 'IN_TRANSIT';
    const targetLat = toDrop ? currentJob.order.dropLat : currentJob.order.pickupLat;
    const targetLng = toDrop ? currentJob.order.dropLng : currentJob.order.pickupLng;

    if (typeof targetLat !== 'number' || typeof targetLng !== 'number') {
      Alert.alert(t('home.alert.locationUnavailableTitle'), t('home.alert.locationUnavailableBody'));
      return;
    }

    await openGoogleMapsNavigation({
      lat: targetLat,
      lng: targetLng,
      originLat: lastKnownLocation?.lat,
      originLng: lastKnownLocation?.lng
    });
  };

  const navigateToOfferPickup = async () => {
    if (!activeOffer?.order) {
      Alert.alert(t('home.alert.noOfferTitle'), t('home.alert.noOfferBody'));
      return;
    }

    await openGoogleMapsNavigation({
      lat: activeOffer.order.pickupLat,
      lng: activeOffer.order.pickupLng,
      originLat: lastKnownLocation?.lat,
      originLng: lastKnownLocation?.lng
    });
  };

  const acceptOfferWithPreferredMethod = useCallback(async (offerId: string) => {
    const userId = sessionUser?.id;
    if (!userId) {
      await acceptOffer(offerId);
      speakDriverMessage(t('home.voice.jobAccepted'), voiceGuidanceEnabled);
      return;
    }

    try {
      const response = await api.get('/driver-onboarding/payment-methods', {
        params: { userId }
      });

      const methods = Array.isArray(response.data)
        ? (response.data
            .map((row) => {
              if (!row || typeof row !== 'object') {
                return null;
              }
              const candidate = row as Record<string, unknown>;
              const id = typeof candidate.id === 'string' ? candidate.id : '';
              const upiId = typeof candidate.upiId === 'string' ? candidate.upiId : '';
              if (!id || !upiId) {
                return null;
              }
              return {
                id,
                label:
                  typeof candidate.label === 'string' && candidate.label.trim()
                    ? candidate.label.trim()
                    : undefined,
                upiId: upiId.trim().toLowerCase(),
                isPreferred: Boolean(candidate.isPreferred)
              } satisfies OfferPaymentMethod;
            })
            .filter((method) => method !== null) as OfferPaymentMethod[])
        : [];

      const preferred = methods.find((method) => method.isPreferred) ?? methods[0];
      await acceptOffer(offerId, preferred?.id);
    } catch {
      await acceptOffer(offerId);
    }

    speakDriverMessage(t('home.voice.jobAccepted'), voiceGuidanceEnabled);
  }, [acceptOffer, sessionUser?.id, t, voiceGuidanceEnabled]);

  const onAcceptOffer = async () => {
    if (!activeOffer?.id) {
      return;
    }

    setAcceptingOffer(true);
    try {
      await acceptOfferWithPreferredMethod(activeOffer.id);
    } catch {
      Alert.alert(t('home.alert.acceptFailedTitle'), t('home.alert.acceptFailedBody'));
    } finally {
      setAcceptingOffer(false);
    }
  };

  const confirmOfferPaymentMethod = async () => {
    if (!activeOffer?.id) {
      return;
    }

    setAcceptingOffer(true);
    try {
      await acceptOffer(activeOffer.id, selectedOfferPaymentMethodId);
      setOfferPaymentPickerVisible(false);
      setOfferPaymentMethods([]);
      setSelectedOfferPaymentMethodId(undefined);
      speakDriverMessage(t('home.voice.jobAccepted'), voiceGuidanceEnabled);
    } catch {
      Alert.alert(t('home.alert.acceptFailedTitle'), t('home.alert.acceptFailedBody'));
    } finally {
      setAcceptingOffer(false);
    }
  };

  const onRejectOffer = async () => {
    if (!activeOffer?.id) {
      return;
    }
    await rejectOffer(activeOffer.id);
  };

  const confirmDirectPaymentReceived = async () => {
    if (!currentJob?.orderId || !currentJob?.driverId) {
      Alert.alert(t('home.alert.tripUnavailableTitle'), t('home.alert.tripUnavailableBody'));
      return;
    }

    setPaymentConfirming(true);
    try {
      await api.post('/payments/driver-confirm', {
        orderId: currentJob.orderId,
        driverId: currentJob.driverId
      });
      await useDriverAppStore.getState().refreshJobs();
      Alert.alert(t('home.directPayment.confirmedTitle'), t('home.directPayment.confirmedBody'));
    } catch (error: unknown) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: unknown }).response === 'object' &&
        (error as { response?: unknown }).response !== null &&
        typeof ((error as { response: { data?: { message?: unknown } } }).response.data?.message) === 'string'
          ? String((error as { response: { data?: { message?: unknown } } }).response.data?.message)
          : t('home.directPayment.confirmFailBody');
      Alert.alert(t('home.directPayment.confirmFailTitle'), message);
    } finally {
      setPaymentConfirming(false);
    }
  };

  const clearQueueOverlay = useCallback(() => {
    setQueueOverlayOfferId(undefined);
    setQueueOverlaySecondsLeft(QUEUE_OVERLAY_DECISION_SECONDS);
  }, []);

  const acceptQueueOffer = useCallback(async (options?: { auto?: boolean }) => {
    const offerId = queueOverlayOfferId;
    if (!offerId || queueOverlayActionInFlightRef.current) {
      return;
    }

    queueOverlayActionInFlightRef.current = true;
    setAcceptingOffer(true);
    try {
      await acceptOfferWithPreferredMethod(offerId);
      queueOverlayHandledOfferIdsRef.current.add(offerId);
      clearQueueOverlay();
      if (options?.auto) {
        Alert.alert(t('home.queueOverlay.autoAcceptTitle'), t('home.queueOverlay.autoAcceptBody'));
      }
    } catch {
      Alert.alert(t('home.alert.acceptFailedTitle'), t('home.alert.acceptFailedBody'));
      setQueueOverlaySecondsLeft(8);
    } finally {
      setAcceptingOffer(false);
      queueOverlayActionInFlightRef.current = false;
    }
  }, [acceptOfferWithPreferredMethod, clearQueueOverlay, queueOverlayOfferId, t]);

  const rejectQueueOffer = useCallback(async () => {
    const offerId = queueOverlayOfferId;
    if (!offerId || queueOverlayActionInFlightRef.current) {
      return;
    }

    queueOverlayActionInFlightRef.current = true;
    try {
      await rejectOffer(offerId);
      queueOverlayHandledOfferIdsRef.current.add(offerId);
      clearQueueOverlay();
    } finally {
      queueOverlayActionInFlightRef.current = false;
    }
  }, [clearQueueOverlay, queueOverlayOfferId, rejectOffer]);

  useEffect(() => {
    if (!shouldShowQueueOverlay || queueOverlayActionInFlightRef.current) {
      return;
    }

    if (queueOverlaySecondsLeft <= 0) {
      void acceptQueueOffer({ auto: true });
      return;
    }

    const timer = setTimeout(() => {
      setQueueOverlaySecondsLeft((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [acceptQueueOffer, queueOverlaySecondsLeft, shouldShowQueueOverlay]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('home.title')}</Text>
          <LanguageSwitcher />
        </View>

        {guidedHintsEnabled ? (
          <View style={styles.assistantCard}>
            <Text style={styles.assistantTitle}>{t('home.assistant.title')}</Text>
            <Text style={styles.assistantText}>{assistantText}</Text>
          </View>
        ) : null}

        {tripFocusTakeoverEnabled ? (
          <View style={styles.focusModeCard}>
            <Text style={styles.focusModeTitle}>{t('nav.focus.title')}</Text>
            <Text style={styles.focusModeBody}>{t('nav.focus.body')}</Text>
            <View style={styles.focusModeActions}>
              <Pressable style={styles.focusModeSupportButton} onPress={() => navigation.navigate('Support')}>
                <Text style={styles.focusModeSupportText}>{t('home.support')}</Text>
              </Pressable>
              <Pressable
                style={styles.focusModeSecondaryButton}
                onPress={() => {
                  if (currentTripId) {
                    setFullHomeUnlockedTripId(currentTripId);
                  }
                }}
              >
                <Text style={styles.focusModeSecondaryText}>{t('home.focus.openFullHome')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!tripFocusTakeoverEnabled ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('home.availability.title')}</Text>
              <Text style={styles.status}>{getAvailabilityCopy(availabilityStatus, t)}</Text>
              <View style={styles.row}>
                <Pressable style={[styles.toggleButton, styles.onlineButton]} onPress={() => void setAvailability('ONLINE')}>
                  <Text style={styles.toggleButtonText}>{t('home.online')}</Text>
                </Pressable>
                <Pressable style={[styles.toggleButton, styles.offlineButton]} onPress={() => void setAvailability('OFFLINE')}>
                  <Text style={[styles.toggleButtonText, { color: colors.accent }]}>{t('home.offline')}</Text>
                </Pressable>
              </View>
            </View>

            <View style={[styles.card, styles.earningsCard]}>
              <Text style={styles.cardTitle}>{t('home.earnings.title')}</Text>
              <Text style={styles.earningsValue}>
                INR {(earnings?.summary.takeHomeAfterSubscription ?? earnings?.summary.netPayout ?? 0).toFixed(2)}
              </Text>
              <Text style={styles.info}>{t('home.earnings.trips30', { count: earnings?.tripCount ?? 0 })}</Text>
              <Text style={styles.info}>
                {t('home.earnings.plan', {
                  plan: getPlanLabel(earnings?.subscription?.plan, t)
                })}
              </Text>
              <Text style={styles.info}>{t('home.earnings.hint')}</Text>
            </View>

            <View style={[styles.card, activeOffer ? styles.offerCardHighlight : undefined]}>
              <View style={styles.offerHeaderRow}>
                <Text style={styles.cardTitle}>{t('home.offer.title')}</Text>
                <Text style={styles.offerTimer}>{offerSecondsLeft}s</Text>
              </View>
              {activeOffer ? (
                <>
                  {typeof offerEarningAmount === 'number' ? (
                    <View style={styles.offerEarningSpotlight}>
                      <Text style={styles.offerEarningLabel}>{t('home.offer.earnLabel')}</Text>
                      <Text style={styles.offerEarningValue}>INR {offerEarningAmount.toFixed(2)}</Text>
                      <Text style={styles.offerEarningHint}>{t('home.offer.earnHint')}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.offerMainText}>
                    {t('home.offer.pickup')}: {activeOffer.order?.pickupAddress}
                  </Text>
                  <Text style={styles.offerMetaText}>
                    {t('home.offer.drop')}: {activeOffer.order?.dropAddress}
                  </Text>
                  <Text style={styles.offerMetaText}>
                    {t('home.offer.etaVehicle', {
                      eta: activeOffer.routeEtaMinutes,
                      vehicle: activeOffer.vehicleMatchType
                    })}
                  </Text>
                  <View style={styles.offerProgressTrack}>
                    <View style={[styles.offerProgressFill, { width: `${Math.round(offerProgress * 100)}%` }]} />
                  </View>
                  <View style={styles.row}>
                    <Pressable
                      style={[styles.toggleButton, styles.onlineButton]}
                      onPress={() => void onAcceptOffer()}
                      disabled={acceptingOffer}
                    >
                      {acceptingOffer ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.toggleButtonText}>{t('home.offer.accept')}</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={[styles.toggleButton, styles.offlineButton]}
                      onPress={() => void onRejectOffer()}
                    >
                      <Text style={[styles.toggleButtonText, { color: colors.accent }]}>{t('home.offer.skip')}</Text>
                    </Pressable>
                  </View>
                  <Pressable style={styles.navButton} onPress={() => void navigateToOfferPickup()}>
                    <Text style={styles.navButtonText}>{t('home.offer.navigate')}</Text>
                  </Pressable>
                  {pendingOffers.length > 1 ? (
                    <Text style={styles.offerQueueNote}>{t('home.offer.moreWaiting', { count: pendingOffers.length - 1 })}</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.info}>{t('home.offer.none')}</Text>
              )}
            </View>
          </>
        ) : null}

        <View style={[styles.card, tripFocusTakeoverEnabled ? styles.tripFocusMainCard : undefined]}>
          <Text style={styles.cardTitle}>{t('home.trip.title')}</Text>
          {currentJob ? (
            <>
              <Text style={styles.info}>{t('home.trip.pickup', { value: currentJob.order?.pickupAddress ?? '--' })}</Text>
              <Text style={styles.info}>{t('home.trip.drop', { value: currentJob.order?.dropAddress ?? '--' })}</Text>
              <Text style={styles.info}>
                {t('home.trip.stage', {
                  value: t(TRIP_STAGES.find((stage) => stage.key === currentJob.status)?.labelKey ?? 'home.stage.assigned')
                })}
              </Text>
              <Text style={styles.info}>{t('home.trip.paymentStatus', { value: currentPaymentStatus })}</Text>
              <Text style={styles.info}>
                {t('home.trip.paymentMode', {
                  value: directToDriverPaymentMode ? t('home.paymentMode.direct') : t('home.paymentMode.escrow')
                })}
              </Text>
              <View style={styles.stageMap}>
                {TRIP_STAGES.map((stage, index) => {
                  const completed = currentStageIndex >= index;
                  const active = currentStageIndex === index;
                  return (
                    <View key={stage.key} style={styles.stageItem}>
                      <View style={styles.stageTrackColumn}>
                        <View style={[styles.stageDot, completed && styles.stageDotCompleted, active && styles.stageDotActive]} />
                        {index < TRIP_STAGES.length - 1 ? (
                          <View style={[styles.stageConnector, currentStageIndex > index && styles.stageConnectorCompleted]} />
                        ) : null}
                      </View>
                      <Text style={[styles.stageLabel, completed && styles.stageLabelCompleted]}>{t(stage.labelKey)}</Text>
                    </View>
                  );
                })}
              </View>
              <Pressable style={styles.navButton} onPress={() => void quickNavigateCurrent()}>
                <Text style={styles.navButtonText}>
                  {currentJob.status === 'IN_TRANSIT' ? t('home.trip.navigateDrop') : t('home.trip.navigatePickup')}
                </Text>
              </Pressable>
              {activeAction ? (
                <Pressable style={styles.mainActionButton} onPress={() => void runCurrentAction()}>
                  <Text style={styles.mainActionText}>{t(activeAction.labelKey)}</Text>
                </Pressable>
              ) : null}
              {directToDriverPaymentMode && !directPaymentCaptured ? (
                <View style={styles.directPaymentGateCard}>
                  <Text style={styles.directPaymentGateTitle}>{t('home.directPayment.requiredTitle')}</Text>
                  <Text style={styles.directPaymentGateHint}>
                    {t('home.directPayment.hint')}
                  </Text>
                  {directPaymentUpiId ? (
                    <Text style={styles.directPaymentUpiText}>{t('home.directPayment.upi', { upiId: directPaymentUpiId })}</Text>
                  ) : null}
                  {directPaymentQrUrl ? (
                    <Pressable
                      style={styles.directPaymentQrWrap}
                      onPress={() => setQrPreviewVisible(true)}
                    >
                      <Image source={{ uri: directPaymentQrUrl }} style={styles.directPaymentQrImage} />
                      <Text style={styles.directPaymentQrHint}>{t('home.directPayment.tapExpand')}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={styles.directPaymentConfirmButton}
                    onPress={() => void confirmDirectPaymentReceived()}
                    disabled={paymentConfirming}
                  >
                    {paymentConfirming ? (
                      <ActivityIndicator color="#EFF6FF" />
                    ) : (
                      <Text style={styles.directPaymentConfirmText}>{t('home.directPayment.markReceived')}</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.info}>{t('home.trip.none')}</Text>
          )}
        </View>

        {!tripFocusTakeoverEnabled ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('home.queue.title')}</Text>
            {nextJob ? (
              <>
                <Text style={styles.info}>{t('home.queue.orderId', { value: nextJob.id })}</Text>
                <Text style={styles.info}>{t('home.queue.pickup', { value: nextJob.pickupAddress })}</Text>
                <Text style={styles.info}>{t('home.queue.drop', { value: nextJob.dropAddress })}</Text>
              </>
            ) : (
              <Text style={styles.info}>{t('home.queue.none')}</Text>
            )}
          </View>
        ) : null}

        <View style={styles.supportCard}>
          <Text style={styles.supportTitle}>{t('home.support')}</Text>
          <Text style={styles.supportSub}>{t('home.supportCard.line1')}</Text>
          <View style={styles.supportActionRow}>
            <Pressable style={styles.supportActionPrimary} onPress={() => navigation.navigate('Support')}>
              <Text style={styles.supportActionPrimaryText}>{t('home.supportCard.openCenter')}</Text>
            </Pressable>
          </View>
          {!tripFocusTakeoverEnabled && currentTripId ? (
            <View style={styles.supportActionRow}>
              <Pressable
                style={styles.supportActionSecondary}
                onPress={() => setFullHomeUnlockedTripId(undefined)}
              >
                <Text style={styles.supportActionSecondaryText}>{t('home.focus.backToTrip')}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <Modal
        animationType="fade"
        transparent
        visible={qrPreviewVisible}
        onRequestClose={() => setQrPreviewVisible(false)}
      >
        <View style={styles.qrPreviewBackdrop}>
          <View style={styles.qrPreviewCard}>
            <Text style={styles.qrPreviewTitle}>{t('home.qr.title')}</Text>
            {directPaymentQrUrl ? (
              <Image source={{ uri: directPaymentQrUrl }} style={styles.qrPreviewImage} />
            ) : null}
            {directPaymentUpiId ? <Text style={styles.qrPreviewUpi}>{t('home.qr.upi', { upiId: directPaymentUpiId })}</Text> : null}
            <Pressable style={styles.qrPreviewClose} onPress={() => setQrPreviewVisible(false)}>
              <Text style={styles.qrPreviewCloseText}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        transparent
        visible={offerPaymentPickerVisible}
        onRequestClose={() => setOfferPaymentPickerVisible(false)}
      >
        <View style={styles.offerPaymentModalBackdrop}>
          <View style={styles.offerPaymentModalCard}>
            <Text style={styles.offerPaymentModalTitle}>{t('home.offerPayment.title')}</Text>
            <Text style={styles.offerPaymentModalSub}>{t('home.offerPayment.subtitle')}</Text>
            <View style={styles.offerPaymentMethodList}>
              {offerPaymentMethods.map((method) => {
                const selected = method.id === selectedOfferPaymentMethodId;
                return (
                  <Pressable
                    key={method.id}
                    style={[styles.offerPaymentMethodRow, selected && styles.offerPaymentMethodRowSelected]}
                    onPress={() => setSelectedOfferPaymentMethodId(method.id)}
                  >
                    <Text style={styles.offerPaymentMethodLabel}>
                      {method.label || method.upiId}
                      {method.isPreferred ? ` • ${t('home.offerPayment.primary')}` : ''}
                    </Text>
                    <Text style={styles.offerPaymentMethodUpi}>{method.upiId}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.offerPaymentModalActions}>
              <Pressable
                style={styles.offerPaymentCancelButton}
                onPress={() => {
                  setOfferPaymentPickerVisible(false);
                  setOfferPaymentMethods([]);
                  setSelectedOfferPaymentMethodId(undefined);
                }}
                disabled={acceptingOffer}
              >
                <Text style={styles.offerPaymentCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={styles.offerPaymentConfirmButton}
                onPress={() => void confirmOfferPaymentMethod()}
                disabled={acceptingOffer}
              >
                {acceptingOffer ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.offerPaymentConfirmText}>{t('home.offer.accept')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <DeliveryProofModal
        visible={deliveryProofVisible}
        submitting={deliveryProofSubmitting}
        onClose={() => {
          setDeliveryProofVisible(false);
          setCompletionMetrics({});
        }}
        onSubmit={submitDeliveryProof}
      />
      {queueOverlayVisible && queueOverlayOffer ? (
        <View pointerEvents="box-none" style={styles.queueOverlayRoot}>
          <Animated.View
            style={[
              styles.queueOverlayCard,
              {
                transform: [{ translateX: queueOverlayTranslateX }]
              }
            ]}
          >
            <Text style={styles.queueOverlayTitle}>{t('home.queueOverlay.title')}</Text>
            <Text style={styles.queueOverlaySubtitle}>
              {t('home.queueOverlay.subtitle', { seconds: queueOverlaySecondsLeft })}
            </Text>
            <Text style={styles.queueOverlayRoute}>{t('home.offer.pickup')}: {queueOverlayOffer.order?.pickupAddress ?? '--'}</Text>
            <Text style={styles.queueOverlayRoute}>{t('home.offer.drop')}: {queueOverlayOffer.order?.dropAddress ?? '--'}</Text>
            {typeof queueOverlayEarningAmount === 'number' ? (
              <Text style={styles.queueOverlayEarning}>
                {t('jobs.offerEarning', { value: queueOverlayEarningAmount.toFixed(2) })}
              </Text>
            ) : null}
            <View style={styles.queueOverlayTrack}>
              <View
                style={[
                  styles.queueOverlayTrackFill,
                  {
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        (queueOverlaySecondsLeft / QUEUE_OVERLAY_DECISION_SECONDS) * 100
                      )
                    )}%`
                  }
                ]}
              />
            </View>
            <Text style={styles.queueOverlayAutoText}>
              {t('home.queueOverlay.autoAcceptIn', { seconds: queueOverlaySecondsLeft })}
            </Text>
            <View style={styles.queueOverlayActions}>
              <Pressable
                style={[styles.queueOverlayButton, styles.queueOverlaySkip]}
                onPress={() => void rejectQueueOffer()}
              >
                <Text style={styles.queueOverlaySkipText}>{t('home.offer.skip')}</Text>
              </Pressable>
              <Pressable
                style={[styles.queueOverlayButton, styles.queueOverlayAccept]}
                onPress={() => void acceptQueueOffer()}
              >
                <Text style={styles.queueOverlayAcceptText}>{t('home.queueOverlay.accept')}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    paddingBottom: 120
  },
  earningsCard: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF'
  },
  earningsValue: {
    fontFamily: typography.heading,
    color: colors.secondary,
    fontSize: 28
  },
  headerRow: {
    gap: spacing.sm
  },
  title: { fontFamily: typography.heading, color: colors.accent, fontSize: 30 },
  assistantCard: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 6
  },
  assistantTitle: {
    fontFamily: typography.bodyBold,
    color: '#1E3A8A',
    fontSize: 14
  },
  assistantText: {
    fontFamily: typography.body,
    color: colors.accent,
    fontSize: 13
  },
  focusModeCard: {
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs
  },
  focusModeTitle: {
    fontFamily: typography.bodyBold,
    color: '#0F172A',
    fontSize: 16
  },
  focusModeBody: {
    fontFamily: typography.body,
    color: '#334155',
    fontSize: 13
  },
  focusModeActions: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    gap: spacing.xs
  },
  focusModeSupportButton: {
    flex: 1,
    borderRadius: radius.sm,
    backgroundColor: '#1D4ED8',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  focusModeSupportText: {
    fontFamily: typography.bodyBold,
    color: '#EFF6FF',
    fontSize: 13
  },
  focusModeSecondaryButton: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#FFFFFF',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  focusModeSecondaryText: {
    fontFamily: typography.bodyBold,
    color: '#1E3A8A',
    fontSize: 12
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs
  },
  tripFocusMainCard: {
    borderColor: '#1D4ED8',
    backgroundColor: '#FFFFFF'
  },
  cardTitle: { fontFamily: typography.bodyBold, color: colors.accent },
  status: { fontFamily: typography.body, color: colors.secondary },
  offerCardHighlight: {
    borderColor: '#93C5FD',
    backgroundColor: '#F8FAFF'
  },
  offerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  offerTimer: {
    fontFamily: typography.bodyBold,
    color: '#1E40AF'
  },
  offerMainText: {
    fontFamily: typography.bodyBold,
    color: colors.accent
  },
  offerEarningSpotlight: {
    borderWidth: 1,
    borderColor: '#1E40AF',
    backgroundColor: '#3B82F6',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: 2,
    marginTop: spacing.xs,
    marginBottom: spacing.xs
  },
  offerEarningLabel: {
    fontFamily: typography.bodyBold,
    color: '#DBEAFE',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  offerEarningValue: {
    fontFamily: typography.heading,
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 34
  },
  offerEarningHint: {
    fontFamily: typography.body,
    color: '#F8FAFF',
    fontSize: 12
  },
  offerMetaText: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 13
  },
  offerProgressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: '#BFDBFE',
    overflow: 'hidden',
    marginTop: spacing.xs
  },
  offerProgressFill: {
    height: '100%',
    backgroundColor: '#2563EB'
  },
  offerQueueNote: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 12
  },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  toggleButton: {
    flex: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: spacing.sm
  },
  onlineButton: { backgroundColor: colors.secondary },
  offlineButton: {
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#93C5FD'
  },
  toggleButtonText: {
    fontFamily: typography.bodyBold,
    color: colors.white,
    fontSize: 15
  },
  info: { fontFamily: typography.body, color: colors.mutedText },
  navButton: {
    marginTop: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.secondary,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: '#EFF6FF',
    minHeight: 48,
    justifyContent: 'center'
  },
  navButtonText: {
    fontFamily: typography.bodyBold,
    color: colors.secondary,
    fontSize: 14
  },
  mainActionButton: {
    marginTop: spacing.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    minHeight: 54,
    backgroundColor: colors.primary
  },
  mainActionText: {
    fontFamily: typography.bodyBold,
    color: colors.white,
    fontSize: 15
  },
  directPaymentGateCard: {
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#3B82F6',
    backgroundColor: '#F8FAFF',
    padding: spacing.sm,
    gap: spacing.xs
  },
  directPaymentGateTitle: {
    fontFamily: typography.bodyBold,
    color: '#1E3A8A',
    fontSize: 13
  },
  directPaymentGateHint: {
    fontFamily: typography.body,
    color: '#334155',
    fontSize: 12
  },
  directPaymentUpiText: {
    fontFamily: typography.bodyBold,
    color: '#0F172A',
    fontSize: 12
  },
  directPaymentQrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4
  },
  directPaymentQrImage: {
    width: 176,
    height: 176,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#FFFFFF'
  },
  directPaymentQrHint: {
    marginTop: 4,
    fontFamily: typography.body,
    color: '#64748B',
    fontSize: 11
  },
  qrPreviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg
  },
  qrPreviewCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs
  },
  qrPreviewTitle: {
    fontFamily: typography.bodyBold,
    color: '#0F172A',
    fontSize: 16
  },
  qrPreviewImage: {
    width: 300,
    height: 300,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF'
  },
  qrPreviewUpi: {
    fontFamily: typography.bodyBold,
    color: '#1E293B',
    fontSize: 12
  },
  qrPreviewClose: {
    marginTop: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  qrPreviewCloseText: {
    fontFamily: typography.bodyBold,
    color: '#1D4ED8',
    fontSize: 13
  },
  directPaymentConfirmButton: {
    marginTop: 2,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: '#1E40AF',
    minHeight: 46
  },
  directPaymentConfirmText: {
    fontFamily: typography.bodyBold,
    color: '#F8FAFF',
    fontSize: 13
  },
  stageMap: {
    marginTop: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FAFC',
    padding: spacing.sm,
    gap: spacing.xs
  },
  stageItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs
  },
  stageTrackColumn: {
    alignItems: 'center'
  },
  stageDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    marginTop: 2
  },
  stageDotCompleted: {
    borderColor: colors.secondary,
    backgroundColor: '#BFDBFE'
  },
  stageDotActive: {
    backgroundColor: '#1D4ED8'
  },
  stageConnector: {
    width: 2,
    height: 18,
    backgroundColor: '#CBD5E1',
    marginTop: 2
  },
  stageConnectorCompleted: {
    backgroundColor: '#1D4ED8'
  },
  stageLabel: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 12
  },
  stageLabelCompleted: {
    color: colors.accent,
    fontFamily: typography.bodyBold
  },
  supportCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    padding: spacing.sm,
    gap: 4
  },
  supportTitle: {
    fontFamily: typography.bodyBold,
    color: '#1D4ED8'
  },
  supportSub: {
    fontFamily: typography.body,
    color: '#334155',
    fontSize: 12
  },
  supportActionRow: {
    marginTop: spacing.xs,
    flexDirection: 'row'
  },
  supportActionPrimary: {
    width: '100%',
    borderRadius: 999,
    backgroundColor: '#1D4ED8',
    paddingVertical: 8,
    alignItems: 'center'
  },
  supportActionPrimaryText: {
    fontFamily: typography.bodyBold,
    color: '#EFF6FF',
    fontSize: 12
  },
  supportActionSecondary: {
    width: '100%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    alignItems: 'center'
  },
  supportActionSecondaryText: {
    fontFamily: typography.bodyBold,
    color: '#1E3A8A',
    fontSize: 12
  },
  offerPaymentModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    padding: spacing.md
  },
  offerPaymentModalCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    gap: spacing.sm
  },
  offerPaymentModalTitle: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 16
  },
  offerPaymentModalSub: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 12
  },
  offerPaymentMethodList: {
    gap: 8
  },
  offerPaymentMethodRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  offerPaymentMethodRowSelected: {
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF'
  },
  offerPaymentMethodLabel: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 13
  },
  offerPaymentMethodUpi: {
    marginTop: 2,
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 12
  },
  offerPaymentModalActions: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs
  },
  offerPaymentCancelButton: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    minWidth: 90,
    alignItems: 'center'
  },
  offerPaymentCancelText: {
    fontFamily: typography.bodyBold,
    color: '#334155',
    fontSize: 13
  },
  offerPaymentConfirmButton: {
    borderRadius: radius.sm,
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    minWidth: 110,
    alignItems: 'center'
  },
  offerPaymentConfirmText: {
    fontFamily: typography.bodyBold,
    color: colors.white,
    fontSize: 13
  },
  queueOverlayRoot: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md
  },
  queueOverlayCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    padding: spacing.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 10,
    gap: spacing.xs
  },
  queueOverlayTitle: {
    fontFamily: typography.bodyBold,
    color: '#0F172A',
    fontSize: 15
  },
  queueOverlaySubtitle: {
    fontFamily: typography.body,
    color: '#1E3A8A',
    fontSize: 12
  },
  queueOverlayRoute: {
    fontFamily: typography.body,
    color: '#334155',
    fontSize: 12
  },
  queueOverlayEarning: {
    marginTop: 2,
    fontFamily: typography.bodyBold,
    color: '#1E3A8A',
    fontSize: 14
  },
  queueOverlayTrack: {
    marginTop: 4,
    width: '100%',
    height: 7,
    borderRadius: 999,
    backgroundColor: '#BFDBFE',
    overflow: 'hidden'
  },
  queueOverlayTrackFill: {
    height: '100%',
    backgroundColor: '#2563EB'
  },
  queueOverlayAutoText: {
    fontFamily: typography.body,
    color: '#475569',
    fontSize: 11
  },
  queueOverlayActions: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    gap: spacing.xs
  },
  queueOverlayButton: {
    flex: 1,
    borderRadius: radius.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  queueOverlaySkip: {
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#FFFFFF'
  },
  queueOverlaySkipText: {
    fontFamily: typography.bodyBold,
    color: '#1E3A8A',
    fontSize: 13
  },
  queueOverlayAccept: {
    backgroundColor: '#1D4ED8'
  },
  queueOverlayAcceptText: {
    fontFamily: typography.bodyBold,
    color: '#EFF6FF',
    fontSize: 13
  }
});
