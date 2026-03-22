import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { useDriverAppStore } from '../../store/useDriverAppStore';
import { openGoogleMapsNavigation } from '../../utils/mapsNavigation';
import { DeliveryProofModal, type DeliveryProofSubmission } from '../../components/DeliveryProofModal';
import { RideStartOtpModal } from '../../components/RideStartOtpModal';
import { useDriverI18n } from '../../i18n/useDriverI18n';

const actionMap: Array<{ status: string; endpoint: string; labelKey: string; payload?: Record<string, unknown> }> = [
  { status: 'ASSIGNED', endpoint: 'accept', labelKey: 'jobs.action.accept' },
  { status: 'DRIVER_EN_ROUTE', endpoint: 'arrived-pickup', labelKey: 'jobs.action.reachedPickup' },
  { status: 'ARRIVED_PICKUP', endpoint: 'start-loading', labelKey: 'jobs.action.startLoading' },
  { status: 'LOADING', endpoint: 'start-transit', labelKey: 'jobs.action.startTransit' },
  {
    status: 'IN_TRANSIT',
    endpoint: 'complete',
    labelKey: 'jobs.action.completeDelivery',
    payload: { distanceKm: 14, durationMinutes: 38 }
  }
];

interface CompletionMetrics {
  distanceKm?: number;
  durationMinutes?: number;
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

export function JobsScreen() {
  const { t } = useDriverI18n();
  const currentJob = useDriverAppStore((state) => state.currentJob);
  const nextJob = useDriverAppStore((state) => state.nextJob);
  const pendingOffers = useDriverAppStore((state) => state.pendingOffers);
  const refreshJobs = useDriverAppStore((state) => state.refreshJobs);
  const acceptOffer = useDriverAppStore((state) => state.acceptOffer);
  const rejectOffer = useDriverAppStore((state) => state.rejectOffer);
  const runTripAction = useDriverAppStore((state) => state.runTripAction);
  const completeTripWithDeliveryProof = useDriverAppStore((state) => state.completeTripWithDeliveryProof);
  const [deliveryProofVisible, setDeliveryProofVisible] = useState(false);
  const [deliveryProofSubmitting, setDeliveryProofSubmitting] = useState(false);
  const [rideStartOtpVisible, setRideStartOtpVisible] = useState(false);
  const [rideStartOtpSubmitting, setRideStartOtpSubmitting] = useState(false);
  const [completionMetrics, setCompletionMetrics] = useState<CompletionMetrics>({});

  const activeAction = useMemo(
    () => actionMap.find((item) => item.status === currentJob?.status),
    [currentJob?.status]
  );
  const currentNavigationTarget = useMemo(() => {
    if (!currentJob?.order) {
      return null;
    }

    if (currentJob.status === 'IN_TRANSIT') {
      return {
        lat: currentJob.order.dropLat,
        lng: currentJob.order.dropLng,
        label: t('jobs.navigateDrop')
      };
    }

    return {
      lat: currentJob.order.pickupLat,
      lng: currentJob.order.pickupLng,
      label: t('jobs.navigatePickup')
    };
  }, [currentJob, t]);

  const runAction = async () => {
    if (!currentJob || !activeAction) {
      return;
    }

    if (activeAction.endpoint === 'complete') {
      setCompletionMetrics(extractCompletionMetrics(activeAction.payload));
      setDeliveryProofVisible(true);
      return;
    }

    if (activeAction.endpoint === 'start-loading') {
      setRideStartOtpVisible(true);
      return;
    }

    try {
      await runTripAction(currentJob.id, activeAction.endpoint, activeAction.payload);
    } catch {
      Alert.alert(t('jobs.alert.actionFailedTitle'), t('jobs.alert.actionFailedBody'));
    }
  };

  const submitRideStartOtp = async (otpCode: string) => {
    if (!currentJob) {
      Alert.alert(t('jobs.alert.noActiveTripTitle'), t('jobs.alert.noActiveTripBody'));
      return;
    }

    setRideStartOtpSubmitting(true);
    try {
      await runTripAction(currentJob.id, 'start-loading', { rideStartOtp: otpCode });
      setRideStartOtpVisible(false);
    } catch (error: unknown) {
      const responseMessage = (
        error as {
          response?: { data?: { message?: unknown } };
        }
      )?.response?.data?.message;
      const message =
        Array.isArray(responseMessage)
          ? responseMessage.join('\n')
          : typeof responseMessage === 'string'
            ? responseMessage
            : t('jobs.alert.otpFailedBody');
      Alert.alert(t('jobs.alert.otpFailedTitle'), message);
    } finally {
      setRideStartOtpSubmitting(false);
    }
  };

  const submitDeliveryProof = async (payload: DeliveryProofSubmission) => {
    if (!currentJob) {
      Alert.alert(t('jobs.alert.noActiveTripTitle'), t('jobs.alert.noActiveTripBody'));
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
    } catch {
      Alert.alert(t('jobs.alert.completionFailedTitle'), t('jobs.alert.completionFailedBody'));
    } finally {
      setDeliveryProofSubmitting(false);
    }
  };

  const navigateToTarget = async (target?: { lat?: number; lng?: number }, fallbackMessage?: string) => {
    if (typeof target?.lat !== 'number' || typeof target?.lng !== 'number') {
      Alert.alert(t('jobs.alert.locationUnavailableTitle'), fallbackMessage ?? t('jobs.alert.locationUnavailableBody'));
      return;
    }

    await openGoogleMapsNavigation({
      lat: target.lat,
      lng: target.lng
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t('jobs.title')}</Text>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{t('jobs.incoming')}</Text>
            <Pressable onPress={() => void refreshJobs()}>
              <Text style={styles.refresh}>{t('jobs.refresh')}</Text>
            </Pressable>
          </View>

          {pendingOffers.length === 0 ? (
            <Text style={styles.info}>{t('jobs.noneOffers')}</Text>
          ) : null}

          {pendingOffers.map((offer) => {
            const offerEarning = getOfferEarningAmount(offer);

            return (
              <View key={offer.id} style={styles.offerItem}>
                <View style={styles.offerCopy}>
                  <Text style={styles.offerTitle}>{t('jobs.offerOrder', { id: offer.orderId.slice(0, 8) })}</Text>
                  {typeof offerEarning === 'number' ? (
                    <Text style={styles.offerEarning}>{t('jobs.offerEarning', { value: offerEarning.toFixed(2) })}</Text>
                  ) : null}
                  <Text style={styles.offerMeta}>{offer.order?.pickupAddress}</Text>
                  <Text style={styles.offerMeta}>
                    {t('jobs.offerEtaVehicle', { eta: offer.routeEtaMinutes, vehicle: offer.vehicleMatchType })}
                  </Text>
                </View>
                <View style={styles.offerActions}>
                  <Pressable style={[styles.offerButton, styles.offerAccept]} onPress={() => void acceptOffer(offer.id)}>
                    <Text style={styles.offerButtonText}>{t('jobs.accept')}</Text>
                  </Pressable>
                  <Pressable style={[styles.offerButton, styles.offerReject]} onPress={() => void rejectOffer(offer.id)}>
                    <Text style={[styles.offerButtonText, { color: colors.accent }]}>{t('jobs.reject')}</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={styles.offerNavButton}
                  onPress={() =>
                    void navigateToTarget(
                      { lat: offer.order?.pickupLat, lng: offer.order?.pickupLng },
                      t('jobs.alert.locationUnavailableBody')
                    )
                  }
                >
                  <Text style={styles.offerNavButtonText}>{t('jobs.openPickup')}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('jobs.current')}</Text>
          {currentJob ? (
            <>
              <Text style={styles.info}>{t('jobs.trip', { value: currentJob.id })}</Text>
              <Text style={styles.info}>{t('jobs.status', { value: currentJob.status })}</Text>
              <Text style={styles.info}>{t('jobs.pickup', { value: currentJob.order?.pickupAddress ?? '--' })}</Text>
              <Text style={styles.info}>{t('jobs.drop', { value: currentJob.order?.dropAddress ?? '--' })}</Text>

              <Pressable
                style={styles.navButton}
                onPress={() =>
                  void navigateToTarget(
                    { lat: currentNavigationTarget?.lat, lng: currentNavigationTarget?.lng },
                    t('jobs.alert.locationUnavailableBody')
                  )
                }
              >
                <Text style={styles.navButtonText}>{currentNavigationTarget?.label ?? t('jobs.openMaps')}</Text>
              </Pressable>

              {activeAction ? (
                <Pressable style={styles.mainActionButton} onPress={() => void runAction()}>
                  <Text style={styles.mainActionText}>{t(activeAction.labelKey)}</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Text style={styles.info}>{t('jobs.noCurrent')}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('jobs.next')}</Text>
          {nextJob ? (
            <>
              <Text style={styles.info}>{t('jobs.offerOrder', { id: nextJob.id })}</Text>
              <Text style={styles.info}>{t('jobs.pickup', { value: nextJob.pickupAddress })}</Text>
              <Text style={styles.info}>{t('jobs.drop', { value: nextJob.dropAddress })}</Text>
              <Pressable
                style={styles.navButton}
                onPress={() =>
                  void navigateToTarget(
                    { lat: nextJob.pickupLat, lng: nextJob.pickupLng },
                    t('jobs.alert.locationUnavailableBody')
                  )
                }
              >
                <Text style={styles.navButtonText}>{t('jobs.navigateQueued')}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.info}>{t('jobs.noNext')}</Text>
          )}
        </View>
      </ScrollView>
      <DeliveryProofModal
        visible={deliveryProofVisible}
        submitting={deliveryProofSubmitting}
        onClose={() => {
          setDeliveryProofVisible(false);
          setCompletionMetrics({});
        }}
        onSubmit={submitDeliveryProof}
      />
      <RideStartOtpModal
        visible={rideStartOtpVisible}
        submitting={rideStartOtpSubmitting}
        title={t('jobs.otp.title')}
        subtitle={t('jobs.otp.subtitle')}
        cancelLabel={t('common.cancel')}
        submitLabel={t('jobs.otp.submit')}
        onClose={() => setRideStartOtpVisible(false)}
        onSubmit={submitRideStartOtp}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: typography.heading, fontSize: 28, color: colors.accent },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cardTitle: { fontFamily: typography.bodyBold, color: colors.accent },
  refresh: { fontFamily: typography.bodyBold, color: colors.secondary },
  info: { fontFamily: typography.body, color: colors.mutedText },
  offerItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: '#F8FAFF'
  },
  offerCopy: { gap: 2 },
  offerTitle: { fontFamily: typography.bodyBold, color: colors.accent },
  offerEarning: {
    fontFamily: typography.bodyBold,
    color: '#1E3A8A',
    fontSize: 14
  },
  offerMeta: { fontFamily: typography.body, color: colors.mutedText, fontSize: 12 },
  offerActions: { flexDirection: 'row', gap: spacing.xs },
  offerButton: {
    flex: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    paddingVertical: spacing.xs
  },
  offerAccept: { backgroundColor: colors.secondary },
  offerReject: {
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#93C5FD'
  },
  offerButtonText: { color: colors.white, fontFamily: typography.bodyBold },
  offerNavButton: {
    marginTop: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.secondary,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    backgroundColor: '#EFF6FF'
  },
  offerNavButtonText: {
    color: colors.secondary,
    fontFamily: typography.bodyBold,
    fontSize: 12
  },
  navButton: {
    marginTop: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.secondary,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    backgroundColor: '#EFF6FF'
  },
  navButtonText: {
    color: colors.secondary,
    fontFamily: typography.bodyBold
  },
  mainActionButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm
  },
  mainActionText: {
    color: colors.white,
    fontFamily: typography.bodyBold
  }
});
