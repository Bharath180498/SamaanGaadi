import { useEffect, useMemo, useState } from 'react';
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
import { colors, radius, spacing, typography } from '../../theme';
import { useDriverAppStore } from '../../store/useDriverAppStore';

const PLAN_LABELS: Record<'GO' | 'PRO' | 'ENTERPRISE', string> = {
  GO: 'Go',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise'
};

function formatInr(value?: number | null) {
  if (value === null || value === undefined) {
    return 'Contract billing';
  }
  const safeValue = Number(value ?? 0);
  return `INR ${safeValue.toFixed(2)}`;
}

function formatDate(value?: string) {
  if (!value) {
    return 'N/A';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function EarningsScreen() {
  const earnings = useDriverAppStore((state) => state.earnings);
  const subscriptionCatalog = useDriverAppStore((state) => state.subscriptionCatalog);
  const refreshEarnings = useDriverAppStore((state) => state.refreshEarnings);
  const refreshSubscriptionCatalog = useDriverAppStore((state) => state.refreshSubscriptionCatalog);
  const setSubscriptionPlan = useDriverAppStore((state) => state.setSubscriptionPlan);
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [enterpriseNotes, setEnterpriseNotes] = useState('');
  const [fleetSize, setFleetSize] = useState('');

  useEffect(() => {
    void Promise.all([refreshEarnings(), refreshSubscriptionCatalog()]);
  }, [refreshEarnings, refreshSubscriptionCatalog]);

  const subscription = earnings?.subscription;
  const selectedPlan = subscription?.plan ?? 'GO';
  const trialMessage = useMemo(() => {
    if (!subscription?.trial) {
      return 'Loading subscription details...';
    }

    if (subscription.trial.isActive) {
      return `Trial active • ${subscription.trial.daysLeft} day(s) left • Ends ${formatDate(subscription.trial.endsAt)}`;
    }

    return `Trial completed on ${formatDate(subscription.trial.endsAt)}`;
  }, [subscription?.trial]);

  const planOptions = useMemo(
    () =>
      subscriptionCatalog?.options ?? [
        {
          plan: 'GO' as const,
          monthlyFeeInr: 500,
          billing: 'monthly' as const,
          features: ['Access all local trips', 'Basic support', 'Solo driver plan']
        },
        {
          plan: 'PRO' as const,
          monthlyFeeInr: 1000,
          billing: 'monthly' as const,
          features: ['Priority dispatch', 'Support priority', 'Pro tools']
        },
        {
          plan: 'ENTERPRISE' as const,
          monthlyFeeInr: null,
          billing: 'contract' as const,
          features: ['Fleet support', 'Contract billing', 'Enterprise workflows']
        }
      ],
    [subscriptionCatalog?.options]
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
      Alert.alert('Plan updated', result.message ?? `Driver subscription switched to ${plan}.`);
      if (plan === 'ENTERPRISE') {
        setEnterpriseNotes('');
        setFleetSize('');
      }
    } catch (error: unknown) {
      const fallback =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: unknown }).message ?? 'Please retry in a few seconds.')
          : 'Please retry in a few seconds.';
      Alert.alert('Could not update plan', fallback);
    } finally {
      setUpdatingPlan(false);
    }
  };

  const onSelectPlan = (plan: 'GO' | 'PRO' | 'ENTERPRISE') => {
    if (plan === selectedPlan) {
      Alert.alert('Already active', `${PLAN_LABELS[plan]} plan is already active.`);
      return;
    }

    const option = planOptions.find((entry) => entry.plan === plan);
    const feeLine = option
      ? option.monthlyFeeInr
        ? `Monthly fee: INR ${option.monthlyFeeInr}`
        : 'Monthly fee: Contract billing'
      : '';

    const trialLine =
      subscription?.trial?.isActive && plan !== 'ENTERPRISE'
        ? `Trial is active. Billing starts after ${formatDate(subscription.trial.endsAt)}.`
        : '';

    const description =
      plan === 'ENTERPRISE'
        ? 'We will submit your enterprise request and our team will contact you.'
        : 'Your driver account will switch to this plan immediately.';

    Alert.alert('Confirm plan change', [description, feeLine, trialLine].filter(Boolean).join('\n\n'), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', onPress: () => void executePlanChange(plan) }
    ]);
  };

  const enterpriseRequest = subscriptionCatalog?.enterpriseRequest;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Earnings</Text>
        <Text style={styles.subtitle}>Drivers keep 100% trip earnings during trial. Choose your monthly plan any time.</Text>

        <View style={[styles.card, styles.highlightCard]}>
          <Text style={styles.metricLabel}>Take-home (30d)</Text>
          <Text style={styles.metricValue}>{formatInr(earnings?.summary.takeHomeAfterSubscription ?? earnings?.summary.netPayout)}</Text>
          <Text style={styles.metricSub}>Trips completed: {earnings?.tripCount ?? 0}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Breakdown</Text>
          <Text style={styles.row}>Gross Fare: {formatInr(earnings?.summary.grossFare)}</Text>
          <Text style={styles.row}>Waiting Charges: {formatInr(earnings?.summary.waitingCharges)}</Text>
          <Text style={styles.row}>Trip Commission: {formatInr(earnings?.summary.commission)}</Text>
          <Text style={styles.row}>Subscription Fee (range): {formatInr(earnings?.summary.subscriptionFee)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Subscription</Text>
          <Text style={styles.subscriptionHint}>{trialMessage}</Text>
          <Text style={styles.subscriptionHint}>Current Plan: {PLAN_LABELS[selectedPlan]}</Text>
          <Text style={styles.subscriptionHint}>
            Current Monthly Fee: {subscription?.monthlyFeeInr ? `INR ${subscription.monthlyFeeInr}` : 'Contract sales'}
          </Text>
          <Text style={styles.subscriptionHint}>{subscription?.note ?? 'Choose plan below to upgrade or switch.'}</Text>

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
                  <Text style={[styles.planTitle, active && styles.planTitleActive]}>{PLAN_LABELS[option.plan]}</Text>
                  <Text style={[styles.planFee, active && styles.planTitleActive]}>
                    {option.monthlyFeeInr ? `INR ${option.monthlyFeeInr} / month` : 'Contact sales'}
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
              <Text style={styles.loadingText}>Updating plan...</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Enterprise request details</Text>
          <Text style={styles.subscriptionHint}>Add notes before choosing Enterprise to speed up approval.</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={enterpriseNotes}
            onChangeText={setEnterpriseNotes}
            placeholder="Example: 15 trucks in Bengaluru with daily bulk loads"
            placeholderTextColor={colors.mutedText}
            multiline
            numberOfLines={3}
          />
          <TextInput
            style={styles.input}
            value={fleetSize}
            onChangeText={setFleetSize}
            placeholder="Fleet size (optional)"
            placeholderTextColor={colors.mutedText}
            keyboardType="number-pad"
          />
          {enterpriseRequest ? (
            <View style={styles.enterpriseStatusBox}>
              <Text style={styles.enterpriseStatusTitle}>Latest request</Text>
              <Text style={styles.subscriptionHint}>Status: {enterpriseRequest.status}</Text>
              <Text style={styles.subscriptionHint}>Requested: {formatDate(enterpriseRequest.createdAt)}</Text>
              {enterpriseRequest.notes ? <Text style={styles.subscriptionHint}>Note: {enterpriseRequest.notes}</Text> : null}
            </View>
          ) : (
            <Text style={styles.subscriptionHint}>No enterprise request submitted yet.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { padding: spacing.lg, gap: spacing.md, width: '100%', maxWidth: 460, alignSelf: 'center' },
  title: { fontFamily: typography.heading, fontSize: 28, color: colors.accent },
  subtitle: { fontFamily: typography.body, color: colors.mutedText, marginTop: -4 },
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
    backgroundColor: '#EEFFF9'
  },
  cardTitle: {
    fontFamily: typography.bodyBold,
    color: colors.accent
  },
  metricLabel: { fontFamily: typography.bodyBold, color: colors.accent },
  metricValue: { fontFamily: typography.heading, color: colors.primary, fontSize: 34 },
  metricSub: { fontFamily: typography.body, color: colors.mutedText },
  row: { fontFamily: typography.body, color: colors.mutedText },
  subscriptionHint: { fontFamily: typography.body, color: colors.mutedText },
  planGrid: {
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  planCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    backgroundColor: '#FFF9F2',
    gap: 2
  },
  planCardActive: {
    borderColor: colors.secondary,
    backgroundColor: '#0B6B5A'
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
