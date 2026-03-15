import { useEffect, useMemo, useState } from 'react';
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
import type { OnboardingStackParamList } from '../../types';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { useDriverSessionStore } from '../../store/useDriverSessionStore';
import { AnimatedTextField } from '../../components/AnimatedTextField';
import { FormScreen } from '../../components/FormScreen';
import { OnboardingCoachBanner } from '../../components/OnboardingCoachBanner';
import { useDriverI18n } from '../../i18n/useDriverI18n';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingProfile'>;

function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  const localDigits = digits.length > 10 ? digits.slice(-10) : digits;
  return localDigits.length === 10 ? `+91${localDigits}` : '';
}

export function OnboardingProfileScreen({ navigation }: Props) {
  const { t } = useDriverI18n();
  const loading = useOnboardingStore((state) => state.loading);
  const load = useOnboardingStore((state) => state.load);
  const updateProfile = useOnboardingStore((state) => state.updateProfile);
  const storeFullName = useOnboardingStore((state) => state.fullName);
  const storePhone = useOnboardingStore((state) => state.phone);
  const sessionPhone = useDriverSessionStore((state) => state.user?.phone ?? '');
  const error = useOnboardingStore((state) => state.error);

  const [fullName, setFullName] = useState(storeFullName);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const normalizedPhone = useMemo(
    () => normalizeIndianPhone(storePhone || sessionPhone),
    [sessionPhone, storePhone]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (hasLocalEdits) {
      return;
    }

    setFullName(storeFullName);
  }, [hasLocalEdits, storeFullName]);

  const save = async () => {
    if (!fullName.trim() || !normalizedPhone) {
      Alert.alert(t('onboarding.profile.requiredTitle'), t('onboarding.profile.requiredBody'));
      return;
    }

    try {
      await updateProfile({
        fullName: fullName.trim(),
        phone: normalizedPhone
      });
      setHasLocalEdits(false);
      navigation.navigate('OnboardingVehicle');
    } catch {
      const latestError = useOnboardingStore.getState().error;
      Alert.alert(t('onboarding.profile.saveErrorTitle'), latestError ?? t('onboarding.profile.saveErrorBody'));
    }
  };

  return (
    <FormScreen>
      <View style={styles.container}>
        <OnboardingCoachBanner step={1} total={2} tipKey="onboarding.help.profile" />
        <Text style={styles.title}>{t('onboarding.profile.title')}</Text>
        <View style={styles.card}>
          <AnimatedTextField
            label={t('onboarding.field.fullName')}
            value={fullName}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setFullName(value);
            }}
            placeholder={t('onboarding.placeholder.fullName')}
            returnKeyType="next"
          />
          <AnimatedTextField
            label={t('onboarding.field.phone')}
            value={normalizedPhone}
            editable={false}
            autoCapitalize="none"
            returnKeyType="done"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable style={styles.button} onPress={() => void save()} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>{t('onboarding.saveContinue')}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  title: { fontFamily: typography.heading, fontSize: 28, color: colors.accent },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.xs
  },
  errorText: {
    fontFamily: typography.body,
    color: colors.danger,
    fontSize: 12
  },
  button: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm
  },
  buttonText: { fontFamily: typography.bodyBold, color: colors.white }
});
