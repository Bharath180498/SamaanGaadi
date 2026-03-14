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
import type { VehicleType } from '@porter/shared';
import { colors, radius, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { AnimatedTextField } from '../../components/AnimatedTextField';
import { FormScreen } from '../../components/FormScreen';
import { OnboardingCoachBanner } from '../../components/OnboardingCoachBanner';
import { useDriverI18n } from '../../i18n/useDriverI18n';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingVehicle'>;

const vehicleOptions: VehicleType[] = ['THREE_WHEELER', 'MINI_TRUCK', 'TRUCK'];
const vehicleOptionLabelKeys: Record<VehicleType, string> = {
  THREE_WHEELER: 'onboarding.vehicle.option.threeWheeler',
  MINI_TRUCK: 'onboarding.vehicle.option.miniTruck',
  TRUCK: 'onboarding.vehicle.option.truck'
};

export function OnboardingVehicleScreen({ navigation }: Props) {
  const { t } = useDriverI18n();
  const loading = useOnboardingStore((state) => state.loading);
  const updateVehicle = useOnboardingStore((state) => state.updateVehicle);
  const load = useOnboardingStore((state) => state.load);
  const storeVehicleType = useOnboardingStore((state) => state.vehicleType);
  const storeVehicleNumber = useOnboardingStore((state) => state.vehicleNumber);
  const storeLicenseNumber = useOnboardingStore((state) => state.licenseNumber);
  const storeAadhaarNumber = useOnboardingStore((state) => state.aadhaarNumber);
  const storeRcNumber = useOnboardingStore((state) => state.rcNumber);
  const error = useOnboardingStore((state) => state.error);

  const [vehicleType, setVehicleType] = useState<VehicleType>(storeVehicleType);
  const [vehicleNumber, setVehicleNumber] = useState(storeVehicleNumber);
  const [licenseNumber, setLicenseNumber] = useState(storeLicenseNumber);
  const [aadhaarNumber, setAadhaarNumber] = useState(storeAadhaarNumber);
  const [rcNumber, setRcNumber] = useState(storeRcNumber);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (hasLocalEdits) {
      return;
    }

    setVehicleType(storeVehicleType);
    setVehicleNumber(storeVehicleNumber);
    setLicenseNumber(storeLicenseNumber);
    setAadhaarNumber(storeAadhaarNumber);
    setRcNumber(storeRcNumber);
  }, [
    hasLocalEdits,
    storeAadhaarNumber,
    storeLicenseNumber,
    storeRcNumber,
    storeVehicleNumber,
    storeVehicleType
  ]);

  const save = async () => {
    if (!vehicleNumber.trim() || !licenseNumber.trim()) {
      Alert.alert(t('onboarding.vehicle.requiredTitle'), t('onboarding.vehicle.requiredBody'));
      return;
    }

    try {
      await updateVehicle({
        vehicleType,
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        licenseNumber: licenseNumber.trim().toUpperCase(),
        aadhaarNumber: aadhaarNumber.trim(),
        rcNumber: rcNumber.trim().toUpperCase()
      });
      setHasLocalEdits(false);
      navigation.navigate('OnboardingBank');
    } catch {
      const latestError = useOnboardingStore.getState().error;
      Alert.alert(t('onboarding.vehicle.saveErrorTitle'), latestError ?? t('onboarding.vehicle.saveErrorBody'));
    }
  };

  return (
    <FormScreen>
      <View style={styles.container}>
        <OnboardingCoachBanner step={2} total={5} tipKey="onboarding.help.vehicle" />
        <Text style={styles.title}>{t('onboarding.vehicle.title')}</Text>
        <View style={styles.card}>
          <Text style={styles.label}>{t('onboarding.vehicle.vehicleType')}</Text>
          <View style={styles.vehicleRow}>
            {vehicleOptions.map((option) => (
              <Pressable
                key={option}
                style={[styles.vehicleChip, vehicleType === option && styles.vehicleChipActive]}
                onPress={() => {
                  setHasLocalEdits(true);
                  setVehicleType(option);
                }}
              >
                <Text style={[styles.vehicleChipText, vehicleType === option && styles.vehicleChipTextActive]}>
                  {t(vehicleOptionLabelKeys[option])}
                </Text>
              </Pressable>
            ))}
          </View>

          <AnimatedTextField
            label={t('onboarding.field.vehicleNumber')}
            value={vehicleNumber}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setVehicleNumber(value);
            }}
            autoCapitalize="characters"
            placeholder={t('onboarding.placeholder.vehicleNumber')}
            returnKeyType="next"
          />
          <AnimatedTextField
            label={t('onboarding.field.licenseNumber')}
            value={licenseNumber}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setLicenseNumber(value);
            }}
            autoCapitalize="characters"
            placeholder={t('onboarding.placeholder.licenseNumber')}
            returnKeyType="next"
          />
          <AnimatedTextField
            label={t('onboarding.field.aadhaarNumber')}
            value={aadhaarNumber}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setAadhaarNumber(value);
            }}
            keyboardType="number-pad"
            placeholder={t('onboarding.placeholder.aadhaarNumber')}
            returnKeyType="next"
          />
          <AnimatedTextField
            label={t('onboarding.field.rcNumber')}
            value={rcNumber}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setRcNumber(value);
            }}
            autoCapitalize="characters"
            placeholder={t('onboarding.placeholder.rcNumber')}
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
  label: { fontFamily: typography.bodyBold, color: colors.accent },
  vehicleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  vehicleChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: '#F8FAFF'
  },
  vehicleChipActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary
  },
  vehicleChipText: {
    fontFamily: typography.body,
    color: colors.accent,
    fontSize: 12
  },
  vehicleChipTextActive: {
    color: colors.white
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
