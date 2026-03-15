import { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { OnboardingCoachBanner } from '../../components/OnboardingCoachBanner';
import { useDriverI18n } from '../../i18n/useDriverI18n';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingDocuments'>;

const requiredDocs = ['LICENSE_FRONT', 'RC_FRONT', 'SELFIE'];

function normalizeType(value: string) {
  return value.trim().toUpperCase();
}

function documentLabelKey(docType: string) {
  const normalized = normalizeType(docType);
  if (normalized === 'LICENSE_FRONT') {
    return 'onboarding.doc.license';
  }
  if (normalized === 'RC_FRONT') {
    return 'onboarding.doc.rc';
  }
  if (normalized === 'SELFIE') {
    return 'onboarding.doc.selfie';
  }
  return docType.replace(/_/g, ' ');
}

export function OnboardingDocumentsScreen({ navigation }: Props) {
  const { t } = useDriverI18n();
  const loading = useOnboardingStore((state) => state.loading);
  const load = useOnboardingStore((state) => state.load);
  const uploadDoc = useOnboardingStore((state) => state.uploadDoc);
  const submit = useOnboardingStore((state) => state.submit);
  const uploadedDocs = useOnboardingStore((state) => state.uploadedDocs);
  const fullName = useOnboardingStore((state) => state.fullName);
  const phone = useOnboardingStore((state) => state.phone);
  const vehicleType = useOnboardingStore((state) => state.vehicleType);
  const vehicleNumber = useOnboardingStore((state) => state.vehicleNumber);
  const licenseNumber = useOnboardingStore((state) => state.licenseNumber);
  const dateOfBirth = useOnboardingStore((state) => state.dateOfBirth);
  const accountHolderName = useOnboardingStore((state) => state.accountHolderName);
  const bankName = useOnboardingStore((state) => state.bankName);
  const accountNumber = useOnboardingStore((state) => state.accountNumber);
  const ifscCode = useOnboardingStore((state) => state.ifscCode);
  const upiId = useOnboardingStore((state) => state.upiId);
  const paymentMethods = useOnboardingStore((state) => state.paymentMethods);
  const error = useOnboardingStore((state) => state.error);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadedSet = useMemo(
    () => new Set(uploadedDocs.map((docType) => normalizeType(docType))),
    [uploadedDocs]
  );
  const missingDocs = useMemo(
    () => requiredDocs.filter((doc) => !uploadedSet.has(normalizeType(doc))),
    [uploadedSet]
  );
  const allUploaded = missingDocs.length === 0;
  const missingOnboardingFields = useMemo(
    () =>
      [
        ['onboarding.field.fullNameShort', fullName],
        ['onboarding.field.phoneShort', phone],
        ['onboarding.field.vehicleTypeShort', vehicleType],
        ['onboarding.field.vehicleNumberShort', vehicleNumber],
        ['onboarding.field.licenseNumberShort', licenseNumber],
        ['onboarding.field.dateOfBirthShort', dateOfBirth],
        ['onboarding.field.accountHolderShort', accountHolderName],
        ['onboarding.field.bankNameShort', bankName],
        ['onboarding.field.accountNumberShort', accountNumber],
        ['onboarding.field.ifscShort', ifscCode],
        ['onboarding.field.upiIdShort', upiId]
      ]
        .filter(([, value]) => !String(value ?? '').trim())
        .map(([key]) => t(key)),
    [
      accountHolderName,
      accountNumber,
      bankName,
      dateOfBirth,
      fullName,
      ifscCode,
      licenseNumber,
      phone,
      t,
      upiId,
      vehicleNumber,
      vehicleType
    ]
  );

  const upload = async (type: string) => {
    try {
      await uploadDoc(type);
    } catch {
      Alert.alert(t('onboarding.docs.uploadFailedTitle'), t('onboarding.docs.uploadFailedBody'));
    }
  };

  const submitForReview = async () => {
    if (!allUploaded) {
      Alert.alert(
        t('onboarding.docs.uploadRemainingTitle'),
        t('onboarding.docs.uploadRemainingBody', {
          items: missingDocs.map((item) => t(documentLabelKey(item))).join(', ')
        })
      );
      return;
    }

    if (missingOnboardingFields.length > 0) {
      Alert.alert(
        t('onboarding.docs.completeDetailsTitle'),
        t('onboarding.docs.completeDetailsBody', {
          items: missingOnboardingFields.join(', ')
        })
      );
      return;
    }

    if (paymentMethods.length === 0) {
      Alert.alert(t('onboarding.docs.addUpiTitle'), t('onboarding.docs.addUpiBody'));
      return;
    }

    try {
      await submit();
      navigation.navigate('OnboardingStatus');
    } catch {
      const latestError = useOnboardingStore.getState().error;
      Alert.alert(
        t('onboarding.docs.submitFailedTitle'),
        latestError ??
          error ??
          t('onboarding.docs.submitFailedBody')
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <OnboardingCoachBanner step={4} total={5} tipKey="onboarding.help.docs" />
        <Text style={styles.title}>{t('onboarding.docs.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.docs.subtitle')}</Text>

        <View style={styles.card}>
          {requiredDocs.map((docType) => {
            const isUploaded = uploadedSet.has(docType);
            return (
              <View key={docType} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.docTitle}>{t(documentLabelKey(docType))}</Text>
                  <Text style={[styles.docState, isUploaded ? styles.docStateOk : styles.docStatePending]}>
                    {isUploaded ? t('onboarding.docs.uploaded') : t('onboarding.docs.pending')}
                  </Text>
                </View>
                <Pressable style={styles.uploadButton} onPress={() => void upload(docType)} disabled={loading}>
                  <Text style={styles.uploadButtonText}>
                    {isUploaded ? t('onboarding.docs.reupload') : t('onboarding.docs.upload')}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Pressable style={[styles.submitButton, !allUploaded && styles.submitButtonDisabled]} onPress={() => void submitForReview()} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitButtonText}>{t('onboarding.docs.submitReview')}</Text>}
        </Pressable>

        {!allUploaded ? (
          <Text style={styles.hint}>
            {t('onboarding.docs.missingPrefix', {
              items: missingDocs.map((item) => t(documentLabelKey(item))).join(', ')
            })}
          </Text>
        ) : null}
        {missingOnboardingFields.length > 0 ? (
          <Text style={styles.hint}>
            {t('onboarding.docs.completePrefix', { items: missingOnboardingFields.join(', ') })}
          </Text>
        ) : null}
        {paymentMethods.length === 0 ? (
          <Text style={styles.hint}>{t('onboarding.docs.addUpiHint')}</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: typography.heading, fontSize: 28, color: colors.accent },
  subtitle: { fontFamily: typography.body, color: colors.mutedText },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: radius.sm,
    padding: spacing.sm,
    backgroundColor: '#F8FAFF'
  },
  rowText: {
    gap: 2,
    flex: 1
  },
  docTitle: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 13
  },
  docState: {
    fontFamily: typography.body,
    fontSize: 12
  },
  docStateOk: {
    color: colors.success
  },
  docStatePending: {
    color: colors.warning
  },
  uploadButton: {
    backgroundColor: colors.secondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  uploadButtonText: {
    color: colors.white,
    fontFamily: typography.bodyBold,
    fontSize: 12
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm
  },
  submitButtonDisabled: {
    opacity: 0.5
  },
  submitButtonText: {
    color: colors.white,
    fontFamily: typography.bodyBold
  },
  hint: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 12
  },
  error: {
    fontFamily: typography.body,
    color: '#B91C1C',
    fontSize: 12
  }
});
