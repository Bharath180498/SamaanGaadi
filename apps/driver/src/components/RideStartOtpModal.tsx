import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface RideStartOtpModalProps {
  visible: boolean;
  submitting?: boolean;
  title: string;
  subtitle: string;
  cancelLabel: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (otpCode: string) => void;
}

export function RideStartOtpModal({
  visible,
  submitting = false,
  title,
  subtitle,
  cancelLabel,
  submitLabel,
  onClose,
  onSubmit
}: RideStartOtpModalProps) {
  const [otpCode, setOtpCode] = useState('');

  useEffect(() => {
    if (visible) {
      setOtpCode('');
    }
  }, [visible]);

  const canSubmit = useMemo(() => /^\d{6}$/.test(otpCode), [otpCode]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <TextInput
            value={otpCode}
            onChangeText={(value) => setOtpCode(value.replace(/\D+/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
            maxLength={6}
            style={styles.input}
            editable={!submitting}
            autoFocus
            textAlign="center"
          />
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              disabled={submitting}
              style={[styles.actionButton, styles.cancelButton]}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => onSubmit(otpCode)}
              disabled={submitting || !canSubmit}
              style={[
                styles.actionButton,
                styles.submitButton,
                (submitting || !canSubmit) && styles.submitButtonDisabled
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#EFF6FF" />
              ) : (
                <Text style={styles.submitText}>{submitLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FBFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm
  },
  title: {
    fontFamily: typography.heading,
    color: colors.accent,
    fontSize: 19
  },
  subtitle: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 13
  },
  input: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#FFFFFF',
    color: colors.accent,
    fontFamily: typography.heading,
    fontSize: 28,
    letterSpacing: 6,
    paddingVertical: spacing.sm
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  actionButton: {
    flex: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF'
  },
  cancelText: {
    fontFamily: typography.bodyBold,
    color: colors.secondary
  },
  submitButton: {
    backgroundColor: colors.primary
  },
  submitButtonDisabled: {
    backgroundColor: '#93C5FD'
  },
  submitText: {
    fontFamily: typography.bodyBold,
    color: '#EFF6FF'
  }
});
