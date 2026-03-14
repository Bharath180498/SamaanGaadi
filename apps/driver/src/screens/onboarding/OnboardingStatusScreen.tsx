import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { useDriverSessionStore } from '../../store/useDriverSessionStore';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { OnboardingCoachBanner } from '../../components/OnboardingCoachBanner';
import { useDriverI18n } from '../../i18n/useDriverI18n';

export function OnboardingStatusScreen() {
  const { t } = useDriverI18n();
  const sessionRefresh = useDriverSessionStore((state) => state.refreshOnboardingStatus);
  const onboardingStatus = useDriverSessionStore((state) => state.onboardingStatus);
  const load = useOnboardingStore((state) => state.load);
  const loading = useOnboardingStore((state) => state.loading);

  useEffect(() => {
    void Promise.all([load(), sessionRefresh()]);
  }, [load, sessionRefresh]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <OnboardingCoachBanner step={5} total={5} tipKey="onboarding.help.status" />
        <Text style={styles.title}>{t('onboarding.status.title')}</Text>
        <View style={styles.card}>
          <Text style={styles.label}>{t('onboarding.status.current')}</Text>
          <Text style={styles.status}>{onboardingStatus ?? t('onboarding.status.defaultSubmitted')}</Text>

          <Text style={styles.subtitle}>
            {t('onboarding.status.subtitle')}
          </Text>

          <Pressable style={styles.refreshButton} onPress={() => void Promise.all([load(), sessionRefresh()])}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.refreshText}>{t('onboarding.status.refresh')}</Text>}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.md },
  title: { fontFamily: typography.heading, fontSize: 28, color: colors.accent },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm
  },
  label: { fontFamily: typography.bodyBold, color: colors.mutedText },
  status: { fontFamily: typography.heading, fontSize: 30, color: colors.secondary },
  subtitle: { fontFamily: typography.body, color: colors.mutedText, fontSize: 13 },
  refreshButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm
  },
  refreshText: {
    color: colors.white,
    fontFamily: typography.bodyBold
  }
});
