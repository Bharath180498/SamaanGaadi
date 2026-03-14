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

type Props = NativeStackScreenProps<AuthStackParamList, 'DriverPhone'>;

export function DriverPhoneScreen({ navigation }: Props) {
  const { t } = useDriverI18n();
  const requestOtp = useDriverSessionStore((state) => state.requestOtp);
  const loading = useDriverSessionStore((state) => state.loading);
  const error = useDriverSessionStore((state) => state.error);
  const lastOtpCode = useDriverSessionStore((state) => state.lastOtpCode);

  const [name, setName] = useState('Driver Demo');
  const [phone, setPhone] = useState('+919000000101');

  const continueToOtp = async () => {
    if (!phone.trim()) {
      Alert.alert(t('auth.phoneRequiredTitle'), t('auth.phoneRequiredBody'));
      return;
    }

    try {
      await requestOtp(phone.trim(), name.trim() || undefined);
      navigation.navigate('DriverOtp', {
        phone: phone.trim(),
        role: 'DRIVER',
        name: name.trim() || undefined
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
          <AnimatedTextField
            label={t('auth.name')}
            value={name}
            onChangeText={setName}
            placeholder={t('auth.namePlaceholder')}
            returnKeyType="next"
          />
          <AnimatedTextField
            label={t('auth.phone')}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('auth.phonePlaceholder')}
            keyboardType="phone-pad"
            autoCapitalize="none"
            returnKeyType="done"
          />

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
