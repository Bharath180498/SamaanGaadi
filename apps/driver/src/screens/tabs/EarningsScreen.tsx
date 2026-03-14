import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import api from '../../services/api';
import { useDriverAppStore } from '../../store/useDriverAppStore';
import { colors, radius, spacing, typography } from '../../theme';
import { useDriverI18n } from '../../i18n/useDriverI18n';

type EarningsWindow = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

const EARNINGS_WINDOWS: Array<{ key: EarningsWindow; labelKey: string; subtitleKey: string }> = [
  { key: 'DAY', labelKey: 'earnings.window.day', subtitleKey: 'earnings.window.daySub' },
  { key: 'WEEK', labelKey: 'earnings.window.week', subtitleKey: 'earnings.window.weekSub' },
  { key: 'MONTH', labelKey: 'earnings.window.month', subtitleKey: 'earnings.window.monthSub' },
  { key: 'YEAR', labelKey: 'earnings.window.year', subtitleKey: 'earnings.window.yearSub' }
];

interface EarningsTrip {
  tripId: string;
  orderId: string;
  fare: number;
  waitingCharge?: number;
  distanceKm?: number;
  durationMinutes?: number;
  deliveredAt?: string;
}

interface WindowBounds {
  from: Date;
  to: Date;
}

interface TimelineBucket {
  key: string;
  label: string;
  from: Date;
  to: Date;
  amount: number;
  rides: number;
}

function parseMoney(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function payoutForTrip(trip: EarningsTrip) {
  return Number((parseMoney(trip.fare) + parseMoney(trip.waitingCharge)).toFixed(2));
}

function formatInr(value?: number | null) {
  if (value === null || value === undefined) {
    return 'INR 0.00';
  }
  const safeValue = Number(value ?? 0);
  return `INR ${safeValue.toFixed(2)}`;
}

function formatInrCompact(value: number) {
  return `INR ${new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0
  }).format(Math.max(0, value))}`;
}

function formatDate(value?: string, fallback = 'N/A') {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatDateTime(value?: string, fallback = 'N/A') {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatPeriodRange(bounds: WindowBounds) {
  return `${bounds.from.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short'
  })} - ${bounds.to.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short'
  })}`;
}

function getWindowBounds(window: EarningsWindow, anchor = new Date()): WindowBounds {
  const to = new Date(anchor);
  const from = new Date(anchor);
  if (window === 'DAY') {
    from.setHours(from.getHours() - 24);
  } else if (window === 'WEEK') {
    from.setDate(from.getDate() - 7);
  } else if (window === 'MONTH') {
    from.setDate(from.getDate() - 30);
  } else {
    from.setFullYear(from.getFullYear() - 1);
  }
  return { from, to };
}

function getPreviousWindow(bounds: WindowBounds): WindowBounds {
  const spanMs = Math.max(60 * 1000, bounds.to.getTime() - bounds.from.getTime());
  const to = new Date(bounds.from.getTime() - 1);
  const from = new Date(to.getTime() - spanMs);
  return { from, to };
}

function buildTimelineBuckets(window: EarningsWindow, bounds: WindowBounds): TimelineBucket[] {
  if (window === 'YEAR') {
    const monthStart = new Date(bounds.to);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    monthStart.setMonth(monthStart.getMonth() - 11);

    return Array.from({ length: 12 }, (_, index) => {
      const from = new Date(monthStart);
      from.setMonth(monthStart.getMonth() + index);
      const to = new Date(from);
      to.setMonth(to.getMonth() + 1);
      return {
        key: `m-${index}`,
        label: from.toLocaleDateString('en-IN', { month: 'short' }),
        from,
        to,
        amount: 0,
        rides: 0
      };
    });
  }

  const bucketCount = window === 'DAY' ? 6 : window === 'WEEK' ? 7 : 5;
  const spanMs = Math.max(bucketCount, bounds.to.getTime() - bounds.from.getTime());
  const bucketMs = spanMs / bucketCount;

  return Array.from({ length: bucketCount }, (_, index) => {
    const from = new Date(bounds.from.getTime() + bucketMs * index);
    const to = new Date(bounds.from.getTime() + bucketMs * (index + 1));
    const label =
      window === 'DAY'
        ? from.toLocaleTimeString('en-IN', { hour: 'numeric' })
        : from.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: window === 'MONTH' ? 'short' : undefined,
            weekday: window === 'WEEK' ? 'short' : undefined
          });
    return {
      key: `${window}-${index}`,
      label,
      from,
      to,
      amount: 0,
      rides: 0
    };
  });
}

function buildTimeline(window: EarningsWindow, bounds: WindowBounds, trips: EarningsTrip[]) {
  const buckets = buildTimelineBuckets(window, bounds);
  if (buckets.length === 0) {
    return buckets;
  }

  for (const trip of trips) {
    if (!trip.deliveredAt) {
      continue;
    }
    const deliveredAt = new Date(trip.deliveredAt);
    if (Number.isNaN(deliveredAt.getTime())) {
      continue;
    }
    const index = buckets.findIndex((bucket, bucketIndex) => {
      const isLast = bucketIndex === buckets.length - 1;
      return deliveredAt >= bucket.from && (isLast ? deliveredAt <= bucket.to : deliveredAt < bucket.to);
    });
    if (index < 0) {
      continue;
    }
    buckets[index].rides += 1;
    buckets[index].amount = Number((buckets[index].amount + payoutForTrip(trip)).toFixed(2));
  }

  return buckets;
}

function getPlanLabel(
  plan: 'GO' | 'PRO' | 'ENTERPRISE' | string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string
) {
  if (plan === 'PRO') {
    return t('earnings.plan.pro');
  }
  if (plan === 'ENTERPRISE') {
    return t('earnings.plan.enterprise');
  }
  return t('earnings.plan.go');
}

export function EarningsScreen() {
  const { t } = useDriverI18n();
  const driverProfileId = useDriverAppStore((state) => state.driverProfileId);
  const earnings = useDriverAppStore((state) => state.earnings);
  const subscriptionCatalog = useDriverAppStore((state) => state.subscriptionCatalog);
  const refreshEarnings = useDriverAppStore((state) => state.refreshEarnings);
  const refreshSubscriptionCatalog = useDriverAppStore((state) => state.refreshSubscriptionCatalog);
  const setSubscriptionPlan = useDriverAppStore((state) => state.setSubscriptionPlan);

  const [selectedWindow, setSelectedWindow] = useState<EarningsWindow>('MONTH');
  const [windowBounds, setWindowBounds] = useState<WindowBounds>(() => getWindowBounds('MONTH'));
  const [comparisonTakeHome, setComparisonTakeHome] = useState<number | null>(null);
  const [comparisonTrips, setComparisonTrips] = useState<number | null>(null);
  const [loadingWindow, setLoadingWindow] = useState(false);
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [enterpriseNotes, setEnterpriseNotes] = useState('');
  const [fleetSize, setFleetSize] = useState('');

  const loadWindowData = useCallback(
    async (window: EarningsWindow) => {
      if (!driverProfileId) {
        return;
      }

      const bounds = getWindowBounds(window);
      const previousBounds = getPreviousWindow(bounds);
      setWindowBounds(bounds);
      setLoadingWindow(true);

      try {
        const [, previousResponse] = await Promise.all([
          refreshEarnings({
            from: bounds.from.toISOString(),
            to: bounds.to.toISOString()
          }),
          api.get(`/drivers/${driverProfileId}/earnings`, {
            params: {
              from: previousBounds.from.toISOString(),
              to: previousBounds.to.toISOString()
            }
          })
        ]);

        const previousTakeHome = Number(
          previousResponse.data?.summary?.takeHomeAfterSubscription ??
            previousResponse.data?.summary?.netPayout ??
            0
        );
        const previousTripCount = Number(previousResponse.data?.tripCount ?? 0);

        setComparisonTakeHome(previousTakeHome);
        setComparisonTrips(previousTripCount);
      } catch (error: unknown) {
        const fallback =
          typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message?: unknown }).message ?? t('earnings.refreshErrorBody'))
            : t('earnings.refreshErrorBody');
        Alert.alert(t('earnings.refreshErrorTitle'), fallback);
      } finally {
        setLoadingWindow(false);
      }
    },
    [driverProfileId, refreshEarnings, t]
  );

  useEffect(() => {
    void refreshSubscriptionCatalog();
  }, [refreshSubscriptionCatalog]);

  useEffect(() => {
    void loadWindowData(selectedWindow);
  }, [loadWindowData, selectedWindow]);

  const subscription = earnings?.subscription;
  const selectedPlan = subscription?.plan ?? 'GO';
  const trialMessage = useMemo(() => {
    if (!subscription?.trial) {
      return t('earnings.trialLoading');
    }

    if (subscription.trial.isActive) {
      return t('earnings.trialActive', {
        days: subscription.trial.daysLeft,
        date: formatDate(subscription.trial.endsAt, t('common.na'))
      });
    }

    return t('earnings.trialComplete', {
      date: formatDate(subscription.trial.endsAt, t('common.na'))
    });
  }, [subscription?.trial, t]);

  const planOptions = useMemo(
    () =>
      subscriptionCatalog?.options ?? [
        {
          plan: 'GO' as const,
          monthlyFeeInr: 1000,
          billing: 'monthly' as const,
          features: [
            t('earnings.feature.freeTrial'),
            t('earnings.feature.goFee'),
            t('earnings.feature.goLimit')
          ]
        },
        {
          plan: 'PRO' as const,
          monthlyFeeInr: 1500,
          billing: 'monthly' as const,
          features: [
            t('earnings.feature.freeTrial'),
            t('earnings.feature.proFee'),
            t('earnings.feature.proLimit')
          ]
        }
      ],
    [subscriptionCatalog?.options, t]
  );

  const trips = useMemo(
    () =>
      [...(earnings?.recentTrips ?? [])]
        .map((trip) => ({
          tripId: String(trip.tripId),
          orderId: String(trip.orderId),
          fare: parseMoney(trip.fare),
          waitingCharge: parseMoney(trip.waitingCharge),
          distanceKm: typeof trip.distanceKm === 'number' ? trip.distanceKm : undefined,
          durationMinutes: typeof trip.durationMinutes === 'number' ? trip.durationMinutes : undefined,
          deliveredAt: trip.deliveredAt
        }))
        .sort((a, b) => {
          const left = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
          const right = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
          return right - left;
        }),
    [earnings?.recentTrips]
  );

  const takeHome = earnings?.summary.takeHomeAfterSubscription ?? earnings?.summary.netPayout ?? 0;
  const grossFare = earnings?.summary.grossFare ?? 0;
  const waitingCharges = earnings?.summary.waitingCharges ?? 0;
  const tripCount = earnings?.tripCount ?? trips.length;
  const averagePerRide = tripCount > 0 ? takeHome / tripCount : 0;

  const trendInfo = useMemo(() => {
    if (comparisonTakeHome === null) {
      return {
        label: t('earnings.compareLoading'),
        tone: 'neutral' as const
      };
    }

    const deltaAmount = Number((takeHome - comparisonTakeHome).toFixed(2));
    if (comparisonTakeHome <= 0) {
      if (takeHome > 0) {
        return {
          label: t('earnings.compareUp', { amount: formatInr(takeHome) }),
          tone: 'positive' as const
        };
      }
      return {
        label: t('earnings.compareFlat'),
        tone: 'neutral' as const
      };
    }

    const deltaPercent = ((takeHome - comparisonTakeHome) / comparisonTakeHome) * 100;
    const sign = deltaPercent >= 0 ? '+' : '';
    return {
      label: t('earnings.compareDelta', {
        percent: `${sign}${deltaPercent.toFixed(1)}`,
        amount: formatInr(deltaAmount)
      }),
      tone: deltaPercent >= 0 ? ('positive' as const) : ('negative' as const)
    };
  }, [comparisonTakeHome, t, takeHome]);

  const tripDeltaLabel = useMemo(() => {
    if (comparisonTrips === null) {
      return t('earnings.tripDeltaLoading');
    }
    const delta = tripCount - comparisonTrips;
    const sign = delta > 0 ? '+' : '';
    return t('earnings.tripDelta', { delta: `${sign}${delta}` });
  }, [comparisonTrips, t, tripCount]);

  const timeline = useMemo(() => buildTimeline(selectedWindow, windowBounds, trips), [selectedWindow, trips, windowBounds]);
  const maxTimelineAmount = useMemo(
    () =>
      timeline.reduce((max, bucket) => {
        if (bucket.amount > max) {
          return bucket.amount;
        }
        return max;
      }, 0),
    [timeline]
  );

  const executePlanChange = async (plan: 'GO' | 'PRO' | 'ENTERPRISE') => {
    if (updatingPlan) {
      return;
    }

    const fleetCount = Number.parseInt(fleetSize.trim(), 10);

    try {
      setUpdatingPlan(true);
      const result = await setSubscriptionPlan(
        plan,
        plan === 'ENTERPRISE'
          ? {
              notes: enterpriseNotes.trim() || 'Enterprise interest from driver app',
              fleetSize: Number.isFinite(fleetCount) && fleetCount > 0 ? fleetCount : undefined
            }
          : undefined
      );
      Alert.alert(
        t('earnings.planUpdatedTitle'),
        result.message ??
          t('earnings.planUpdatedBody', {
            plan: getPlanLabel(plan, t)
          })
      );
      if (plan === 'ENTERPRISE') {
        setEnterpriseNotes('');
        setFleetSize('');
      }
    } catch (error: unknown) {
      const fallback =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: unknown }).message ?? t('earnings.updateFailedBody'))
          : t('earnings.updateFailedBody');
      Alert.alert(t('earnings.updateFailedTitle'), fallback);
    } finally {
      setUpdatingPlan(false);
    }
  };

  const onSelectPlan = (plan: 'GO' | 'PRO' | 'ENTERPRISE') => {
    if (plan === selectedPlan) {
      Alert.alert(
        t('earnings.alreadyActiveTitle'),
        t('earnings.alreadyActiveBody', { plan: getPlanLabel(plan, t) })
      );
      return;
    }

    const option = planOptions.find((entry) => entry.plan === plan);
    const feeLine = option
      ? option.monthlyFeeInr
        ? t('earnings.confirmFeeMonthly', { fee: option.monthlyFeeInr })
        : t('earnings.confirmFeeContract')
      : '';

    const trialLine =
      subscription?.trial?.isActive && plan !== 'ENTERPRISE'
        ? t('earnings.confirmTrial', { date: formatDate(subscription.trial.endsAt, t('common.na')) })
        : '';

    const description =
      plan === 'ENTERPRISE'
        ? t('earnings.confirmDescriptionEnterprise')
        : plan === 'GO'
          ? t('earnings.confirmDescriptionGo')
          : t('earnings.confirmDescriptionPro');

    Alert.alert(t('earnings.confirmTitle'), [description, feeLine, trialLine].filter(Boolean).join('\n\n'), [
      { text: t('earnings.confirmCancel'), style: 'cancel' },
      { text: t('earnings.confirmContinue'), onPress: () => void executePlanChange(plan) }
    ]);
  };

  const enterpriseRequest = subscriptionCatalog?.enterpriseRequest;
  const showEnterpriseCard = planOptions.some((option) => option.plan === 'ENTERPRISE');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t('earnings.title')}</Text>
        <Text style={styles.subtitle}>{t('earnings.subtitle')}</Text>

        <View style={styles.windowTabs}>
          {EARNINGS_WINDOWS.map((windowOption) => {
            const active = windowOption.key === selectedWindow;
            return (
              <Pressable
                key={windowOption.key}
                style={[styles.windowTab, active && styles.windowTabActive]}
                onPress={() => setSelectedWindow(windowOption.key)}
                disabled={loadingWindow}
              >
                <Text style={[styles.windowTabLabel, active && styles.windowTabLabelActive]}>
                  {t(windowOption.labelKey)}
                </Text>
                <Text style={[styles.windowTabSub, active && styles.windowTabLabelActive]}>
                  {t(windowOption.subtitleKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.card, styles.highlightCard]}>
          <View style={styles.metricHeaderRow}>
            <View>
              <Text style={styles.metricLabel}>
                {t('earnings.takeHome', { window: t(`earnings.window.${selectedWindow.toLowerCase()}`) })}
              </Text>
              <Text style={styles.metricValue}>{formatInr(takeHome)}</Text>
              <Text style={styles.metricSub}>{formatPeriodRange(windowBounds)}</Text>
            </View>
            {loadingWindow ? <ActivityIndicator color={colors.secondary} /> : null}
          </View>
          <Text
            style={[
              styles.deltaText,
              trendInfo.tone === 'positive'
                ? styles.deltaPositive
                : trendInfo.tone === 'negative'
                  ? styles.deltaNegative
                  : styles.deltaNeutral
            ]}
          >
            {trendInfo.label}
          </Text>
          <Text style={styles.metricSub}>{tripDeltaLabel}</Text>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricCardLabel}>{t('earnings.metrics.rides')}</Text>
            <Text style={styles.metricCardValue}>{tripCount}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricCardLabel}>{t('earnings.metrics.avgRide')}</Text>
            <Text style={styles.metricCardValue}>{formatInrCompact(averagePerRide)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricCardLabel}>{t('earnings.metrics.grossFare')}</Text>
            <Text style={styles.metricCardValue}>{formatInrCompact(grossFare)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricCardLabel}>{t('earnings.metrics.waiting')}</Text>
            <Text style={styles.metricCardValue}>{formatInrCompact(waitingCharges)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('earnings.trendTitle')}</Text>
          <Text style={styles.subscriptionHint}>{t('earnings.trendSub')}</Text>
          <View style={styles.chartRow}>
            {timeline.map((bucket) => {
              const rawHeight = maxTimelineAmount > 0 ? (bucket.amount / maxTimelineAmount) * 100 : 0;
              const clampedHeight = bucket.amount > 0 ? Math.max(10, rawHeight) : 0;
              return (
                <View key={bucket.key} style={styles.chartColumn}>
                  <Text style={styles.chartAmount}>{bucket.amount > 0 ? formatInrCompact(bucket.amount) : ''}</Text>
                  <View style={styles.chartTrack}>
                    <View style={[styles.chartBar, { height: `${clampedHeight}%` }]} />
                  </View>
                  <Text style={styles.chartLabel}>{bucket.label}</Text>
                  <Text style={styles.chartCount}>{t('earnings.ridesSuffix', { count: bucket.rides })}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('earnings.rideWiseTitle', { count: tripCount })}</Text>
          <Text style={styles.subscriptionHint}>{t('earnings.rideWiseSub')}</Text>
          {trips.length === 0 ? (
            <Text style={styles.emptyHint}>{t('earnings.rideWiseEmpty')}</Text>
          ) : null}
          {trips.map((trip) => {
            const payout = payoutForTrip(trip);
            return (
              <View key={trip.tripId} style={styles.tripRow}>
                <View style={styles.tripMain}>
                  <Text style={styles.tripPayout}>{formatInr(payout)}</Text>
                  <Text style={styles.tripMeta}>
                    {t('earnings.tripOrder', {
                      trip: trip.tripId.slice(0, 8),
                      order: trip.orderId.slice(0, 8)
                    })}
                  </Text>
                  <Text style={styles.tripMeta}>
                    {t('earnings.deliveredAt', { value: formatDateTime(trip.deliveredAt, t('common.na')) })}
                  </Text>
                  <Text style={styles.tripMeta}>
                    {t('earnings.fareWaiting', {
                      fare: formatInr(trip.fare),
                      waiting: formatInr(trip.waitingCharge ?? 0)
                    })}
                  </Text>
                  {(typeof trip.distanceKm === 'number' || typeof trip.durationMinutes === 'number') && (
                    <Text style={styles.tripMeta}>
                      {t('earnings.distanceDuration', {
                        distance: typeof trip.distanceKm === 'number' ? `${trip.distanceKm.toFixed(1)} km` : '--',
                        duration: typeof trip.durationMinutes === 'number' ? `${trip.durationMinutes} min` : '--'
                      })}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('earnings.subscriptionTitle')}</Text>
          <Text style={styles.subscriptionHint}>{trialMessage}</Text>
          <Text style={styles.subscriptionHint}>
            {t('earnings.currentPlan', { plan: getPlanLabel(selectedPlan, t) })}
          </Text>
          <Text style={styles.subscriptionHint}>
            {subscription?.monthlyFeeInr
              ? t('earnings.currentFee', { fee: formatInrCompact(subscription.monthlyFeeInr) })
              : t('earnings.currentFeeContract')}
          </Text>
          <Text style={styles.subscriptionHint}>{subscription?.note ?? t('earnings.choosePlan')}</Text>

          <View style={styles.planGrid}>
            {planOptions.map((option) => {
              const active = option.plan === selectedPlan;
              return (
                <Pressable
                  key={option.plan}
                  style={[styles.planCard, active && styles.planCardActive]}
                  onPress={() => onSelectPlan(option.plan)}
                  disabled={updatingPlan}
                >
                  <Text style={[styles.planTitle, active && styles.planTitleActive]}>
                    {getPlanLabel(option.plan, t)}
                  </Text>
                  <Text style={[styles.planFee, active && styles.planTitleActive]}>
                    {option.monthlyFeeInr
                      ? t('earnings.feeMonthly', { fee: option.monthlyFeeInr })
                      : t('earnings.feeContactSales')}
                  </Text>
                  {option.features.map((feature) => (
                    <Text key={`${option.plan}-${feature}`} style={[styles.planCopy, active && styles.planTitleActive]}>
                      • {feature}
                    </Text>
                  ))}
                </Pressable>
              );
            })}
          </View>

          {updatingPlan ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.secondary} />
              <Text style={styles.loadingText}>{t('earnings.updatingPlan')}</Text>
            </View>
          ) : null}
        </View>

        {showEnterpriseCard ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('earnings.enterpriseTitle')}</Text>
            <Text style={styles.subscriptionHint}>{t('earnings.enterpriseHint')}</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={enterpriseNotes}
              onChangeText={setEnterpriseNotes}
              placeholder={t('earnings.enterprisePlaceholder')}
              placeholderTextColor={colors.mutedText}
              multiline
              numberOfLines={3}
            />
            <TextInput
              style={styles.input}
              value={fleetSize}
              onChangeText={setFleetSize}
              placeholder={t('earnings.enterpriseFleetPlaceholder')}
              placeholderTextColor={colors.mutedText}
              keyboardType="number-pad"
            />
            {enterpriseRequest ? (
              <View style={styles.enterpriseStatusBox}>
                <Text style={styles.enterpriseStatusTitle}>{t('earnings.enterpriseLatest')}</Text>
                <Text style={styles.subscriptionHint}>
                  {t('earnings.enterpriseStatus', { status: enterpriseRequest.status })}
                </Text>
                <Text style={styles.subscriptionHint}>
                  {t('earnings.enterpriseRequested', {
                    date: formatDate(enterpriseRequest.createdAt, t('common.na'))
                  })}
                </Text>
                {enterpriseRequest.notes ? (
                  <Text style={styles.subscriptionHint}>{t('earnings.enterpriseNote', { note: enterpriseRequest.notes })}</Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.subscriptionHint}>{t('earnings.enterpriseNone')}</Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper
  },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center'
  },
  title: {
    fontFamily: typography.heading,
    fontSize: 28,
    color: colors.accent
  },
  subtitle: {
    fontFamily: typography.body,
    color: colors.mutedText,
    marginTop: -4
  },
  windowTabs: {
    flexDirection: 'row',
    gap: spacing.xs
  },
  windowTab: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#EAF2FF',
    paddingVertical: spacing.xs,
    alignItems: 'center',
    gap: 2
  },
  windowTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  windowTabLabel: {
    fontFamily: typography.bodyBold,
    color: colors.accent
  },
  windowTabSub: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 11
  },
  windowTabLabelActive: {
    color: colors.white
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs
  },
  highlightCard: {
    borderColor: colors.secondary,
    backgroundColor: '#EFF6FF'
  },
  metricHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  metricLabel: {
    fontFamily: typography.bodyBold,
    color: colors.accent
  },
  metricValue: {
    fontFamily: typography.heading,
    color: colors.primary,
    fontSize: 34
  },
  metricSub: {
    fontFamily: typography.body,
    color: colors.mutedText
  },
  deltaText: {
    fontFamily: typography.bodyBold
  },
  deltaPositive: {
    color: '#047857'
  },
  deltaNegative: {
    color: colors.danger
  },
  deltaNeutral: {
    color: colors.mutedText
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  metricCard: {
    width: '48%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: '#F7FBFF',
    gap: 2
  },
  metricCardLabel: {
    fontFamily: typography.body,
    color: colors.mutedText
  },
  metricCardValue: {
    fontFamily: typography.bodyBold,
    color: colors.primary,
    fontSize: 18
  },
  cardTitle: {
    fontFamily: typography.bodyBold,
    color: colors.accent
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: spacing.xs
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4
  },
  chartAmount: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 10,
    minHeight: 14
  },
  chartTrack: {
    width: '100%',
    height: 108,
    justifyContent: 'flex-end',
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    overflow: 'hidden'
  },
  chartBar: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 8
  },
  chartLabel: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 11
  },
  chartCount: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 10
  },
  subscriptionHint: {
    fontFamily: typography.body,
    color: colors.mutedText
  },
  emptyHint: {
    fontFamily: typography.body,
    color: colors.mutedText,
    marginTop: spacing.xs
  },
  tripRow: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FBFF',
    padding: spacing.sm
  },
  tripMain: {
    gap: 2
  },
  tripPayout: {
    fontFamily: typography.bodyBold,
    color: colors.primary,
    fontSize: 18
  },
  tripMeta: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 12
  },
  planGrid: {
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  planCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    backgroundColor: '#EFF6FF',
    gap: 2
  },
  planCardActive: {
    borderColor: colors.secondary,
    backgroundColor: '#2563EB'
  },
  planTitle: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 16
  },
  planFee: {
    fontFamily: typography.bodyBold,
    color: colors.primary
  },
  planCopy: {
    fontFamily: typography.body,
    color: colors.mutedText
  },
  planTitleActive: {
    color: colors.white
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs
  },
  loadingText: {
    fontFamily: typography.body,
    color: colors.mutedText
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: typography.body,
    color: colors.accent,
    backgroundColor: colors.paper
  },
  inputMultiline: {
    minHeight: 82,
    textAlignVertical: 'top'
  },
  enterpriseStatusBox: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F7FBFF',
    gap: 2
  },
  enterpriseStatusTitle: {
    fontFamily: typography.bodyBold,
    color: colors.accent
  }
});
