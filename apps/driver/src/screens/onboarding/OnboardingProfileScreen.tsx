import { useEffect, useState } from 'react';
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
import { AnimatedTextField } from '../../components/AnimatedTextField';
import { FormScreen } from '../../components/FormScreen';
import { OnboardingCoachBanner } from '../../components/OnboardingCoachBanner';
import { useDriverI18n } from '../../i18n/useDriverI18n';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingProfile'>;

export function OnboardingProfileScreen({ navigation }: Props) {
  const { t } = useDriverI18n();
  const loading = useOnboardingStore((state) => state.loading);
  const load = useOnboardingStore((state) => state.load);
  const updateProfile = useOnboardingStore((state) => state.updateProfile);
  const storeFullName = useOnboardingStore((state) => state.fullName);
  const storePhone = useOnboardingStore((state) => state.phone);
  const storeEmail = useOnboardingStore((state) => state.email);
  const storeCity = useOnboardingStore((state) => state.city);
  const error = useOnboardingStore((state) => state.error);

  const [fullName, setFullName] = useState(storeFullName);
  const [phone, setPhone] = useState(storePhone);
  const [email, setEmail] = useState(storeEmail);
  const [city, setCity] = useState(storeCity);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (hasLocalEdits) {
      return;
    }

    setFullName(storeFullName);
    setPhone(storePhone);
    setEmail(storeEmail);
    setCity(storeCity);
  }, [hasLocalEdits, storeCity, storeEmail, storeFullName, storePhone]);

  const save = async () => {
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert(t('onboarding.profile.requiredTitle'), t('onboarding.profile.requiredBody'));
      return;
    }

    try {
      await updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        city: city.trim()
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
        <OnboardingCoachBanner step={1} total={5} tipKey="onboarding.help.profile" />
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
            value={phone}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setPhone(value);
            }}
            keyboardType="phone-pad"
            placeholder={t('onboarding.placeholder.phone')}
            autoCapitalize="none"
            returnKeyType="next"
          />
          <AnimatedTextField
            label={t('onboarding.field.email')}
            value={email}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setEmail(value);
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder={t('onboarding.placeholder.email')}
            returnKeyType="next"
          />
          <AnimatedTextField
            label={t('onboarding.field.city')}
            value={city}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setCity(value);
            }}
            placeholder={t('onboarding.placeholder.city')}
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
