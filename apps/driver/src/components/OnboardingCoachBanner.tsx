import { StyleSheet, Text, View } from 'react-native';
import { useDriverI18n } from '../i18n/useDriverI18n';
import type { TranslationKey } from '../i18n/translations';
import { colors, radius, spacing, typography } from '../theme';

interface OnboardingCoachBannerProps {
  step: number;
  total: number;
  tipKey: TranslationKey;
}

export function OnboardingCoachBanner({ step, total, tipKey }: OnboardingCoachBannerProps) {
  const { t } = useDriverI18n();
  const progressPercent = Math.max(0, Math.min(100, Math.round((step / total) * 100)));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('onboarding.help.title')}</Text>
      <Text style={styles.tip}>{t(tipKey)}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
      </View>
      <Text style={styles.stepText}>{t('onboarding.stepProgress', { step, total })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#F8FAFF',
    padding: spacing.sm,
    gap: 6
  },
  title: {
    fontFamily: typography.bodyBold,
    color: '#9A3412',
    fontSize: 13
  },
  tip: {
    fontFamily: typography.body,
    color: colors.accent,
    fontSize: 12
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: '#BFDBFE',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563EB'
  },
  stepText: {
    fontFamily: typography.body,
    color: '#9A3412',
    fontSize: 11
  }
});
