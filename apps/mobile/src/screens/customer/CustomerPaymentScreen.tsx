import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import api from '../../services/api';
import { type PaymentMethod, useCustomerStore } from '../../store/useCustomerStore';
import type { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerPayment'>;

const METHODS: Array<{
  id: PaymentMethod;
  title: string;
  description: string;
}> = [
  { id: 'UPI_SCAN_PAY', title: 'UPI Scan and Pay', description: 'Fastest in India' },
  { id: 'VISA_5496', title: 'Visa ....5496', description: 'Credit / debit card' },
  { id: 'MASTERCARD_6802', title: 'Mastercard ....6802', description: 'Credit / debit card' },
  { id: 'CASH', title: 'Cash at delivery', description: 'Pay driver on completion' }
];

export function CustomerPaymentScreen({ navigation }: Props) {
  const selectedMethod = useCustomerStore((state) => state.paymentMethod);
  const setPaymentMethod = useCustomerStore((state) => state.setPaymentMethod);
  const orderId = useCustomerStore((state) => state.activeOrderId);
  const estimatedPrice = useCustomerStore((state) => state.estimatedPrice);

  const [submitting, setSubmitting] = useState(false);

  const buttonLabel = useMemo(() => {
    if (orderId && estimatedPrice) {
      return `Pay INR ${estimatedPrice.toFixed(2)}`;
    }

    return 'Done';
  }, [estimatedPrice, orderId]);

  const onSubmit = async () => {
    if (!orderId || !estimatedPrice) {
      navigation.goBack();
      return;
    }

    setSubmitting(true);
    try {
      const intent = await api.post('/payments/create-intent', {
        orderId,
        provider: selectedMethod === 'UPI_SCAN_PAY' ? 'UPI' : selectedMethod === 'CASH' ? 'WALLET' : 'RAZORPAY',
        amount: estimatedPrice
      });

      await api.post('/payments/confirm', {
        paymentId: intent.data.paymentId,
        success: true,
        providerReference: `PAY_${Date.now()}`
      });

      Alert.alert('Payment Complete', 'Payment confirmed for this order.');
      navigation.goBack();
    } catch {
      Alert.alert('Payment failed', 'Could not confirm payment right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={() => navigation.goBack()}>
            <Text style={styles.closeText}>x</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Payment Methods</Text>
          <View style={styles.closeButton} />
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Pay the Bharat way</Text>
          <Text style={styles.heroSub}>UPI, cards, or cash. Switch anytime before booking.</Text>
        </View>

        <View style={styles.methodList}>
          {METHODS.map((method) => {
            const selected = method.id === selectedMethod;
            return (
              <Pressable
                key={method.id}
                style={[styles.methodCard, selected && styles.methodCardSelected]}
                onPress={() => setPaymentMethod(method.id)}
              >
                <View style={styles.methodCopy}>
                  <Text style={styles.methodTitle}>{method.title}</Text>
                  <Text style={styles.methodDescription}>{method.description}</Text>
                </View>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <Text style={styles.radioTick}>v</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable style={styles.primaryButton} onPress={() => void onSubmit()} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#ECFEFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFF8F1'
  },
  container: {
    flex: 1,
    backgroundColor: '#FFF8F1',
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: {
    color: '#7C2D12',
    fontFamily: 'Manrope_700Bold',
    fontSize: 20
  },
  headerTitle: {
    color: '#7C2D12',
    fontFamily: 'Sora_700Bold',
    fontSize: 17
  },
  hero: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDBA74',
    backgroundColor: '#FFF7ED',
    padding: 14
  },
  heroTitle: {
    color: '#7C2D12',
    fontFamily: 'Sora_700Bold',
    fontSize: 18
  },
  heroSub: {
    marginTop: 4,
    color: '#9A3412',
    fontFamily: 'Manrope_500Medium',
    fontSize: 13
  },
  methodList: {
    marginTop: 12,
    gap: 8
  },
  methodCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  methodCardSelected: {
    borderColor: '#0F766E',
    backgroundColor: '#ECFDF5'
  },
  methodCopy: {
    flex: 1
  },
  methodTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 15
  },
  methodDescription: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12,
    marginTop: 2
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioSelected: {
    borderColor: '#0F766E',
    backgroundColor: '#CCFBF1'
  },
  radioTick: {
    color: '#0F766E',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  primaryButton: {
    marginTop: 'auto',
    borderRadius: 14,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12
  },
  primaryButtonText: {
    color: '#ECFEFF',
    fontFamily: 'Sora_700Bold',
    fontSize: 16,
    textAlign: 'center'
  }
});
