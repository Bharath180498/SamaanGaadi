import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../../theme';
import type { AuthStackParamList } from '../../types';
import { useDriverSessionStore } from '../../store/useDriverSessionStore';
import { FormScreen } from '../../components/FormScreen';
import { useDriverI18n } from '../../i18n/useDriverI18n';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';

type Props = NativeStackScreenProps<AuthStackParamList, 'DriverPhone'>;

function normalizeIndianDigits(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

export function DriverPhoneScreen({ navigation }: Props) {
  const { t } = useDriverI18n();
  const requestOtp = useDriverSessionStore((state) => state.requestOtp);
  const loading = useDriverSessionStore((state) => state.loading);
  const error = useDriverSessionStore((state) => state.error);
  const lastOtpCode = useDriverSessionStore((state) => state.lastOtpCode);

  const [phoneDigits, setPhoneDigits] = useState('9000000101');

  const continueToOtp = async () => {
    const normalizedDigits = normalizeIndianDigits(phoneDigits);
    if (normalizedDigits.length !== 10) {
      Alert.alert(t('auth.phoneRequiredTitle'), t('auth.phoneRequiredBody'));
      return;
    }

    const normalizedPhone = `+91${normalizedDigits}`;

    try {
      await requestOtp(normalizedPhone);
      navigation.navigate('DriverOtp', {
        phone: normalizedPhone,
        role: 'DRIVER'
      });
    } catch {
      Alert.alert(t('auth.requestFailedTitle'), error ?? t('auth.requestFailedBody'));
    }
  };

  return (
    <FormScreen>
      <View style={styles.container}>
        <Text style={styles.title}>{t('auth.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
        <LanguageSwitcher />

        <View style={styles.formCard}>
          <Text style={styles.phoneLabel}>{t('auth.phone')}</Text>
          <View style={styles.phoneRow}>
            <View style={styles.phonePrefixChip}>
              <Text style={styles.phonePrefixText}>+91</Text>
            </View>
            <TextInput
              value={phoneDigits}
              onChangeText={(value) => {
                setPhoneDigits(normalizeIndianDigits(value).slice(0, 10));
              }}
              placeholder={t('auth.phonePlaceholder')}
              keyboardType="number-pad"
              style={styles.phoneInput}
              maxLength={10}
            />
          </View>
          <Text style={styles.phoneHint}>{t('auth.phoneIndiaHint')}</Text>

          <Pressable style={styles.button} onPress={() => void continueToOtp()} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>{t('auth.sendOtp')}</Text>
            )}
          </Pressable>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {lastOtpCode ? (
            <Text style={styles.mockHint}>{t('auth.mockOtpDemo', { code: lastOtpCode })}</Text>
          ) : (
            <Text style={styles.mockHint}>{t('auth.mockOtpProvider')}</Text>
          )}
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
  formCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm
  },
  phoneLabel: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 12
  },
  phoneRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm
  },
  phonePrefixChip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  phonePrefixText: {
    fontFamily: typography.bodyBold,
    color: colors.accent
  },
  phoneInput: {
    flex: 1,
    fontFamily: typography.body,
    color: colors.accent,
    fontSize: 16
  },
  phoneHint: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 12
  },
  button: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
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
  mockHint: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 12
  }
});
