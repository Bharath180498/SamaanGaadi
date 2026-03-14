import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { buildUpiQrImageUrl, isValidUpiId, normalizeUpiId } from '../../utils/upi';
import { useDriverI18n } from '../../i18n/useDriverI18n';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingBank'>;

export function OnboardingBankScreen({ navigation }: Props) {
  const { t } = useDriverI18n();
  const loading = useOnboardingStore((state) => state.loading);
  const load = useOnboardingStore((state) => state.load);
  const updateBank = useOnboardingStore((state) => state.updateBank);
  const setPreferredPaymentMethod = useOnboardingStore((state) => state.setPreferredPaymentMethod);
  const removePaymentMethod = useOnboardingStore((state) => state.removePaymentMethod);
  const paymentMethods = useOnboardingStore((state) => state.paymentMethods);
  const storeAccountHolderName = useOnboardingStore((state) => state.accountHolderName);
  const storeBankName = useOnboardingStore((state) => state.bankName);
  const storeAccountNumber = useOnboardingStore((state) => state.accountNumber);
  const storeIfscCode = useOnboardingStore((state) => state.ifscCode);
  const storeUpiId = useOnboardingStore((state) => state.upiId);
  const error = useOnboardingStore((state) => state.error);

  const [accountHolderName, setAccountHolderName] = useState(storeAccountHolderName);
  const [bankName, setBankName] = useState(storeBankName);
  const [accountNumber, setAccountNumber] = useState(storeAccountNumber);
  const [ifscCode, setIfscCode] = useState(storeIfscCode);
  const [upiId, setUpiId] = useState(storeUpiId);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (hasLocalEdits) {
      return;
    }

    setAccountHolderName(storeAccountHolderName);
    setBankName(storeBankName);
    setAccountNumber(storeAccountNumber);
    setIfscCode(storeIfscCode);
    setUpiId(storeUpiId);
  }, [
    hasLocalEdits,
    storeAccountHolderName,
    storeAccountNumber,
    storeBankName,
    storeIfscCode,
    storeUpiId
  ]);

  const save = async () => {
    const normalizedUpi = normalizeUpiId(upiId);

    if (!accountHolderName.trim() || !bankName.trim() || !accountNumber.trim() || !ifscCode.trim() || !normalizedUpi) {
      Alert.alert(t('onboarding.bank.requiredTitle'), t('onboarding.bank.requiredBody'));
      return;
    }

    if (!isValidUpiId(normalizedUpi)) {
      Alert.alert(t('onboarding.bank.invalidUpiTitle'), t('onboarding.bank.invalidUpiBody'));
      return;
    }

    try {
      await updateBank({
        accountHolderName: accountHolderName.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim().toUpperCase(),
        upiId: normalizedUpi
      });
      setHasLocalEdits(false);
      navigation.navigate('OnboardingDocuments');
    } catch {
      const latestError = useOnboardingStore.getState().error;
      Alert.alert(t('onboarding.bank.saveErrorTitle'), latestError ?? t('onboarding.bank.saveErrorBody'));
    }
  };

  return (
    <FormScreen>
      <View style={styles.container}>
        <OnboardingCoachBanner step={3} total={5} tipKey="onboarding.help.payout" />
        <Text style={styles.title}>{t('onboarding.bank.title')}</Text>
        <View style={styles.card}>
          <AnimatedTextField
            label={t('onboarding.bank.accountHolder')}
            value={accountHolderName}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setAccountHolderName(value);
            }}
            placeholder={t('onboarding.placeholder.fullName')}
            returnKeyType="next"
          />
          <AnimatedTextField
            label={t('onboarding.bank.bankName')}
            value={bankName}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setBankName(value);
            }}
            placeholder={t('onboarding.placeholder.bankName')}
            returnKeyType="next"
          />
          <AnimatedTextField
            label={t('onboarding.bank.accountNumber')}
            value={accountNumber}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setAccountNumber(value);
            }}
            keyboardType="number-pad"
            placeholder={t('onboarding.placeholder.accountNumber')}
            returnKeyType="next"
          />
          <AnimatedTextField
            label={t('onboarding.bank.ifsc')}
            value={ifscCode}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setIfscCode(value);
            }}
            autoCapitalize="characters"
            placeholder={t('onboarding.placeholder.ifsc')}
            returnKeyType="next"
          />
          <AnimatedTextField
            label={t('onboarding.bank.primaryUpi')}
            value={upiId}
            onChangeText={(value) => {
              setHasLocalEdits(true);
              setUpiId(value);
            }}
            autoCapitalize="none"
            placeholder={t('onboarding.placeholder.upiId')}
            returnKeyType="done"
          />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('onboarding.bank.upiMethods')}</Text>
          </View>
          <Text style={styles.helperText}>
            {t('onboarding.bank.autoQrHint')}
          </Text>

          <View style={styles.methodList}>
            {paymentMethods.length === 0 ? (
              <Text style={styles.helperText}>{t('onboarding.bank.noMethods')}</Text>
            ) : (
              paymentMethods.map((method) => {
                const autoQrUrl = isValidUpiId(method.upiId)
                  ? buildUpiQrImageUrl({
                      upiId: method.upiId,
                      payeeName: accountHolderName.trim() || 'Qargo Driver'
                    })
                  : undefined;
                const qrImageUrl = method.qrImageUrl ?? autoQrUrl;

                return (
                  <View key={method.id} style={[styles.methodCard, method.isPreferred && styles.methodCardPreferred]}>
                    <View style={styles.methodTopRow}>
                      <View style={styles.methodMeta}>
                        <Text style={styles.methodTitle}>{method.label ?? t('onboarding.bank.methodLabelFallback')}</Text>
                        <Text style={styles.methodSubtitle}>{method.upiId}</Text>
                      </View>
                      {method.isPreferred ? <Text style={styles.preferredBadge}>{t('onboarding.bank.preferredBadge')}</Text> : null}
                    </View>
                    {qrImageUrl ? (
                      <Image source={{ uri: qrImageUrl }} style={styles.qrPreview} />
                    ) : (
                      <Text style={styles.helperText}>{t('onboarding.bank.invalidQr')}</Text>
                    )}
                    <View style={styles.methodActions}>
                      {!method.isPreferred ? (
                        <Pressable
                          style={styles.methodActionButton}
                          onPress={() => void setPreferredPaymentMethod(method.id)}
                          disabled={loading}
                        >
                          <Text style={styles.methodActionText}>{t('onboarding.bank.setPreferred')}</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={[styles.methodActionButton, styles.methodActionDanger]}
                        onPress={() => void removePaymentMethod(method.id)}
                        disabled={loading}
                      >
                        <Text style={[styles.methodActionText, styles.methodActionDangerText]}>{t('common.remove')}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>

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
  sectionHeader: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sectionTitle: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 14
  },
  uploadQrButton: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: colors.secondary
  },
  uploadQrButtonText: {
    fontFamily: typography.bodyBold,
    color: colors.secondary,
    fontSize: 12
  },
  methodList: {
    gap: spacing.xs,
    marginTop: spacing.xs
  },
  methodCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.paper
  },
  methodCardPreferred: {
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF'
  },
  methodTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  methodMeta: {
    gap: 2
  },
  methodTitle: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 13
  },
  methodSubtitle: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 12
  },
  preferredBadge: {
    fontFamily: typography.bodyBold,
    fontSize: 11,
    color: '#1D4ED8',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999
  },
  qrPreview: {
    width: 128,
    height: 128,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white
  },
  methodActions: {
    flexDirection: 'row',
    gap: spacing.xs
  },
  methodActionButton: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD'
  },
  methodActionDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5'
  },
  methodActionText: {
    fontFamily: typography.bodyBold,
    color: '#1D4ED8',
    fontSize: 12
  },
  methodActionDangerText: {
    color: '#B91C1C'
  },
  errorText: {
    fontFamily: typography.body,
    color: colors.danger,
    fontSize: 12
  },
  helperText: {
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
  buttonText: { fontFamily: typography.bodyBold, color: colors.white }
});
