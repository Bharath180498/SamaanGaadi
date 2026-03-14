import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../../theme';
import type { AuthStackParamList } from '../../types';
import { useDriverSessionStore } from '../../store/useDriverSessionStore';
import { AnimatedTextField } from '../../components/AnimatedTextField';
import { FormScreen } from '../../components/FormScreen';
import { useDriverI18n } from '../../i18n/useDriverI18n';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';

type Props = NativeStackScreenProps<AuthStackParamList, 'DriverOtp'>;

export function DriverOtpScreen({ route }: Props) {
  const { t } = useDriverI18n();
  const requestOtp = useDriverSessionStore((state) => state.requestOtp);
  const verifyOtp = useDriverSessionStore((state) => state.verifyOtp);
  const loading = useDriverSessionStore((state) => state.loading);
  const error = useDriverSessionStore((state) => state.error);
  const lastOtpCode = useDriverSessionStore((state) => state.lastOtpCode);

  const [code, setCode] = useState('');

  const verify = async () => {
    if (code.trim().length < 4) {
      Alert.alert(t('auth.enterOtpTitle'), t('auth.enterOtpBody'));
      return;
    }

    try {
      await verifyOtp({
        phone: route.params.phone,
        code: code.trim(),
        name: route.params.name
      });
    } catch {
      Alert.alert(t('auth.invalidOtpTitle'), error ?? t('auth.invalidOtpBody'));
    }
  };

  const resend = async () => {
    try {
      await requestOtp(route.params.phone, route.params.name);
      Alert.alert(t('auth.otpSentTitle'), t('auth.otpSentBody'));
    } catch {
      Alert.alert(t('auth.resendFailedTitle'), error ?? t('auth.resendFailedBody'));
    }
  };

  return (
    <FormScreen>
      <View style={styles.container}>
        <Text style={styles.title}>{t('auth.verifyTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.verifySubtitle', { phone: route.params.phone })}</Text>
        <LanguageSwitcher />

        <View style={styles.card}>
          <AnimatedTextField
            label={t('auth.enterCode')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder={t('auth.codePlaceholder')}
          />

          <Pressable style={styles.button} onPress={() => void verify()} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>{t('auth.verifyContinue')}</Text>
            )}
          </Pressable>

          <Pressable style={styles.linkButton} onPress={() => void resend()} disabled={loading}>
            <Text style={styles.linkText}>{t('auth.resendOtp')}</Text>
          </Pressable>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {lastOtpCode ? <Text style={styles.mockHint}>{t('auth.mockOtpDemo', { code: lastOtpCode })}</Text> : null}
        </View>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg
  },
  title: {
    fontFamily: typography.heading,
    fontSize: 30,
    color: colors.accent
  },
  subtitle: {
    fontFamily: typography.body,
    color: colors.mutedText
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm
  },
  button: {
    marginTop: spacing.sm,
    backgroundColor: colors.secondary,
    borderRadius: radius.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm
  },
  buttonText: {
    color: colors.white,
    fontFamily: typography.bodyBold
  },
  errorText: {
    fontFamily: typography.body,
    color: '#B91C1C',
    fontSize: 12
  },
  linkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4
  },
  linkText: {
    fontFamily: typography.bodyBold,
    color: colors.primary,
    fontSize: 13
  },
  mockHint: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 12
  }
});
