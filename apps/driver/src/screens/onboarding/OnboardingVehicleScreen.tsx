import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
import { useDriverSessionStore } from '../../store/useDriverSessionStore';
import { AnimatedTextField } from '../../components/AnimatedTextField';
import { FormScreen } from '../../components/FormScreen';
import { OnboardingCoachBanner } from '../../components/OnboardingCoachBanner';
import { useDriverI18n } from '../../i18n/useDriverI18n';

type _Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingVehicle'>;

const vehicleOptions: VehicleType[] = ['THREE_WHEELER', 'MINI_TRUCK', 'TRUCK'];
const vehicleOptionLabelKeys: Record<VehicleType, string> = {
  THREE_WHEELER: 'onboarding.vehicle.option.threeWheeler',
  MINI_TRUCK: 'onboarding.vehicle.option.miniTruck',
  TRUCK: 'onboarding.vehicle.option.truck'
};

type DatePickerProps = {
  value: Date;
  mode: 'date';
  display?: 'default' | 'spinner' | 'calendar' | 'compact';
  maximumDate?: Date;
  minimumDate?: Date;
  onChange: (event: { type?: string }, date?: Date) => void;
};

type DatePickerAndroidApi = {
  open: (params: {
    value: Date;
    mode: 'date';
    display?: 'default' | 'spinner' | 'calendar';
    maximumDate?: Date;
    minimumDate?: Date;
    onChange: (event: { type?: string }, date?: Date) => void;
  }) => void;
};

let NativeDatePicker: ((props: DatePickerProps) => unknown) | null = null;
let NativeDatePickerAndroid: DatePickerAndroidApi | null = null;
try {
  const pickerModule = require('@react-native-community/datetimepicker') as {
    default?: (props: DatePickerProps) => unknown;
    DateTimePickerAndroid?: DatePickerAndroidApi;
  };
  NativeDatePicker = pickerModule.default ?? null;
  NativeDatePickerAndroid = pickerModule.DateTimePickerAndroid ?? null;
} catch {
  NativeDatePicker = null;
  NativeDatePickerAndroid = null;
}

function formatDateOfBirthInput(value: string) {
  const digits = value.replace(/[^0-9]/g, '').slice(0, 8);
  if (digits.length <= 4) {
    return digits;
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function isValidDateOfBirth(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const [year, month, day] = value.split('-').map((part) => Number(part));
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() + 1 === month &&
    parsed.getDate() === day
  );
}

function parseDateOfBirth(value: string) {
  if (!isValidDateOfBirth(value)) {
    return undefined;
  }
  const [year, month, day] = value.split('-').map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function formatDateOfBirth(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function OnboardingVehicleScreen(_: _Props) {
  const { t } = useDriverI18n();
  const DatePickerComponent = NativeDatePicker as any;
  const DatePickerAndroidApi = NativeDatePickerAndroid;
  const loading = useOnboardingStore((state) => state.loading);
  const updateVehicle = useOnboardingStore((state) => state.updateVehicle);
  const load = useOnboardingStore((state) => state.load);
  const storeVehicleType = useOnboardingStore((state) => state.vehicleType);
  const storeVehicleNumber = useOnboardingStore((state) => state.vehicleNumber);
  const storeLicenseNumber = useOnboardingStore((state) => state.licenseNumber);
  const storeDateOfBirth = useOnboardingStore((state) => state.dateOfBirth);
  const error = useOnboardingStore((state) => state.error);
  const onboardingStatus = useDriverSessionStore((state) => state.onboardingStatus);

  const [vehicleType, setVehicleType] = useState<VehicleType>(storeVehicleType);
  const [vehicleNumber, setVehicleNumber] = useState(storeVehicleNumber);
  const [licenseNumber, setLicenseNumber] = useState(storeLicenseNumber);
  const [dateOfBirth, setDateOfBirth] = useState(storeDateOfBirth);
  const [pickerDate, setPickerDate] = useState<Date>(() => parseDateOfBirth(storeDateOfBirth) ?? new Date(1995, 0, 1));
  const [showDatePicker, setShowDatePicker] = useState(false);
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
    setDateOfBirth(storeDateOfBirth);
    setPickerDate(parseDateOfBirth(storeDateOfBirth) ?? new Date(1995, 0, 1));
  }, [
    hasLocalEdits,
    storeDateOfBirth,
    storeLicenseNumber,
    storeVehicleNumber,
    storeVehicleType
  ]);

  const openDatePicker = () => {
    const existingDate = parseDateOfBirth(dateOfBirth);
    const initialDate = existingDate ?? pickerDate;

    if (Platform.OS === 'android' && DatePickerAndroidApi) {
      DatePickerAndroidApi.open({
        value: initialDate,
        mode: 'date',
        display: 'calendar',
        maximumDate: new Date(),
        minimumDate: new Date(1940, 0, 1),
        onChange: (event, selectedDate) => {
          if (event?.type === 'dismissed' || !selectedDate) {
            return;
          }
          applyDateSelection(selectedDate);
        }
      });
      return;
    }

    if (!DatePickerComponent) {
      Alert.alert(
        t('onboarding.vehicle.calendarUnavailableTitle'),
        t('onboarding.vehicle.calendarUnavailableBody')
      );
      return;
    }

    if (existingDate) {
      setPickerDate(existingDate);
    }
    setShowDatePicker(true);
  };

  const applyDateSelection = (value: Date) => {
    setHasLocalEdits(true);
    setDateOfBirth(formatDateOfBirth(value));
    setPickerDate(value);
    setShowDatePicker(false);
  };

  const save = async () => {
    if (!vehicleNumber.trim() || !licenseNumber.trim() || !dateOfBirth.trim()) {
      Alert.alert(t('onboarding.vehicle.requiredTitle'), t('onboarding.vehicle.requiredBody'));
      return;
    }

    const normalizedDob = dateOfBirth.trim();
    if (normalizedDob && !isValidDateOfBirth(normalizedDob)) {
      Alert.alert(t('onboarding.vehicle.invalidDobTitle'), t('onboarding.vehicle.invalidDobBody'));
      return;
    }

    try {
      await updateVehicle({
        vehicleType,
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        licenseNumber: licenseNumber.trim().toUpperCase(),
        dateOfBirth: normalizedDob
      });
      setHasLocalEdits(false);
      const latestStatus = useDriverSessionStore.getState().onboardingStatus ?? onboardingStatus;
      if (latestStatus !== 'APPROVED') {
        const latestError = useOnboardingStore.getState().error;
        if (latestError) {
          Alert.alert(t('onboarding.vehicle.saveErrorTitle'), latestError);
        }
      }
    } catch {
      const latestError = useOnboardingStore.getState().error;
      Alert.alert(t('onboarding.vehicle.saveErrorTitle'), latestError ?? t('onboarding.vehicle.saveErrorBody'));
    }
  };

  return (
    <FormScreen>
      <View style={styles.container}>
        <OnboardingCoachBanner step={2} total={2} tipKey="onboarding.help.vehicle" />
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
            label={t('onboarding.field.dateOfBirth')}
            value={dateOfBirth}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setDateOfBirth(formatDateOfBirthInput(value));
            }}
            autoCapitalize="none"
            keyboardType="number-pad"
            maxLength={10}
            placeholder={t('onboarding.placeholder.dateOfBirth')}
            returnKeyType="done"
          />
          <Pressable style={styles.openCalendarButton} onPress={openDatePicker}>
            <Text style={styles.openCalendarButtonText}>{t('onboarding.vehicle.pickDob')}</Text>
          </Pressable>

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
      {Platform.OS === 'ios' && DatePickerComponent && showDatePicker ? (
        <Modal transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{t('onboarding.vehicle.selectDob')}</Text>
              <DatePickerComponent
                value={pickerDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
                maximumDate={new Date()}
                minimumDate={new Date(1940, 0, 1)}
                onChange={(event: { type?: string }, selectedDate?: Date) => {
                  if (!selectedDate) {
                    if (Platform.OS === 'android') {
                      setShowDatePicker(false);
                    }
                    return;
                  }

                  if (Platform.OS === 'android') {
                    applyDateSelection(selectedDate);
                    return;
                  }

                  setPickerDate(selectedDate);
                }}
              />
              {Platform.OS === 'ios' ? (
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalButtonSecondary} onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.modalButtonSecondaryText}>{t('common.cancel')}</Text>
                  </Pressable>
                  <Pressable style={styles.modalButtonPrimary} onPress={() => applyDateSelection(pickerDate)}>
                    <Text style={styles.modalButtonPrimaryText}>{t('common.confirm')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        </Modal>
      ) : null}
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
  openCalendarButton: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: radius.sm,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start'
  },
  openCalendarButtonText: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 12
  },
  button: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm
  },
  buttonText: { fontFamily: typography.bodyBold, color: colors.white },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm
  },
  modalTitle: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 14
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm
  },
  modalButtonSecondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  modalButtonSecondaryText: {
    fontFamily: typography.bodyBold,
    color: colors.accent
  },
  modalButtonPrimary: {
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  modalButtonPrimaryText: {
    fontFamily: typography.bodyBold,
    color: colors.white
  }
});
