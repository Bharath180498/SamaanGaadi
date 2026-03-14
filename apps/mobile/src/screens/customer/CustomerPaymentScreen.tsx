import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import api from '../../services/api';
import {
  type CustomerWalletMethod,
  type CustomerWalletMethodType,
  type PaymentMethod,
  useCustomerStore
} from '../../store/useCustomerStore';
import type { RootStackParamList } from '../../types/navigation';
import { getCustomerPaymentStatusLabel, isCustomerPaymentPending } from './paymentState';
import { openBestUpiApp } from '../../utils/upiApps';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerPayment'>;

const CARD_METHODS: PaymentMethod[] = ['VISA_5496', 'MASTERCARD_6802'];
const UPI_PATTERN = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/i;

interface DriverDirectPaymentProfile {
  name?: string;
  upiId?: string;
  upiQrImageUrl?: string;
  paymentMethodId?: string;
  tripPreferredPaymentMethodId?: string;
  tripPreferredUpiId?: string;
  tripPreferredPaymentLabel?: string;
  tripPreferredUpiQrImageUrl?: string;
  paymentMethods: Array<{
    id: string;
    label?: string;
    upiId: string;
    qrImageUrl?: string;
    isPreferred: boolean;
  }>;
}

function normalize(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }
  return amount;
}

function normalizeStatus(value: unknown) {
  const status = normalize(value);
  return status ? status.toUpperCase() : undefined;
}

function readApiError(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object' &&
    (error as { response?: unknown }).response !== null
  ) {
    const response = (error as { response: { data?: { message?: unknown } } }).response;
    const message = response.data?.message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
    if (Array.isArray(message) && message.length > 0) {
      return message.map((entry) => String(entry)).join('\n');
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function walletMethodToRail(method: CustomerWalletMethod): PaymentMethod {
  return method.type === 'UPI_ID' ? 'UPI_SCAN_PAY' : 'VISA_5496';
}

function walletMethodLabel(method: CustomerWalletMethod) {
  if (method.type === 'UPI_ID') {
    return method.upiId ?? method.label;
  }
  return method.label;
}

function walletMethodDescription(method: CustomerWalletMethod) {
  if (method.type === 'UPI_ID') {
    return 'UPI ID';
  }
  return method.type === 'DEBIT_CARD' ? 'Debit Card' : 'Credit Card';
}

export function CustomerPaymentScreen({ navigation }: Props) {
  const selectedMethod = useCustomerStore((state) => state.paymentMethod);
  const setPaymentMethod = useCustomerStore((state) => state.setPaymentMethod);
  const walletMethods = useCustomerStore((state) => state.walletMethods);
  const defaultWalletMethodId = useCustomerStore((state) => state.defaultWalletMethodId);
  const addWalletMethod = useCustomerStore((state) => state.addWalletMethod);
  const setDefaultWalletMethod = useCustomerStore((state) => state.setDefaultWalletMethod);
  const removeWalletMethod = useCustomerStore((state) => state.removeWalletMethod);
  const orderId = useCustomerStore((state) => state.activeOrderId);
  const estimatedPrice = useCustomerStore((state) => state.estimatedPrice);
  const refreshOrder = useCustomerStore((state) => state.refreshOrder);
  const refreshTimeline = useCustomerStore((state) => state.refreshTimeline);

  const [submitting, setSubmitting] = useState(false);
  const [driverDirectProfile, setDriverDirectProfile] = useState<DriverDirectPaymentProfile>({
    paymentMethods: []
  });
  const [loadingDriverProfile, setLoadingDriverProfile] = useState(false);
  const [selectedDriverPaymentMethodId, setSelectedDriverPaymentMethodId] = useState<string>();
  const [selectedWalletMethodId, setSelectedWalletMethodId] = useState<string | undefined>(
    defaultWalletMethodId
  );

  const [newWalletType, setNewWalletType] = useState<CustomerWalletMethodType>('UPI_ID');
  const [newWalletValue, setNewWalletValue] = useState('');
  const [newWalletLabel, setNewWalletLabel] = useState('');
  const [newWalletSetDefault, setNewWalletSetDefault] = useState(false);

  const [orderAmount, setOrderAmount] = useState<number>(parseAmount(estimatedPrice) ?? 0);
  const [orderStatus, setOrderStatus] = useState<string>();
  const [tripStatus, setTripStatus] = useState<string>();
  const [paymentStatus, setPaymentStatus] = useState<string>();
  const [paymentProvider, setPaymentProvider] = useState<string>();
  const [paymentDirectToDriver, setPaymentDirectToDriver] = useState(false);

  const paymentStatusLabel = getCustomerPaymentStatusLabel({
    orderStatus,
    payment: {
      provider: paymentProvider,
      status: paymentStatus,
      directPayToDriver: paymentDirectToDriver
    }
  });
  const paymentPending = isCustomerPaymentPending({
    orderStatus,
    payment: {
      provider: paymentProvider,
      status: paymentStatus,
      directPayToDriver: paymentDirectToDriver
    }
  });

  const defaultWalletMethod = useMemo(
    () =>
      walletMethods.find((method) => method.id === defaultWalletMethodId) ??
      walletMethods.find((method) => method.isDefault) ??
      walletMethods[0],
    [defaultWalletMethodId, walletMethods]
  );

  const selectedWalletMethod = useMemo(() => {
    if (!walletMethods.length) {
      return undefined;
    }

    return (
      walletMethods.find((method) => method.id === selectedWalletMethodId) ??
      defaultWalletMethod
    );
  }, [defaultWalletMethod, selectedWalletMethodId, walletMethods]);

  const baseAmount = orderAmount > 0 ? orderAmount : Number(estimatedPrice ?? 0);
  const walletCardSelected = Boolean(
    selectedWalletMethod && selectedWalletMethod.type !== 'UPI_ID' && selectedMethod !== 'DRIVER_UPI_DIRECT'
  );
  const isCardMethod = CARD_METHODS.includes(selectedMethod) && walletCardSelected;
  const cardSurchargeAmount = isCardMethod ? Math.round(baseAmount * 0.025 * 100) / 100 : 0;
  const payableAmount = Math.round((baseAmount + cardSurchargeAmount) * 100) / 100;

  const upiEnabled = Boolean(
    (tripStatus && tripStatus !== 'CANCELLED') ||
      orderStatus === 'ASSIGNED' ||
      orderStatus === 'AT_PICKUP' ||
      orderStatus === 'LOADING' ||
      orderStatus === 'IN_TRANSIT' ||
      orderStatus === 'DELIVERED'
  );

  useEffect(() => {
    if (!walletMethods.length) {
      setSelectedWalletMethodId(undefined);
      return;
    }

    const exists = selectedWalletMethodId
      ? walletMethods.some((method) => method.id === selectedWalletMethodId)
      : false;

    if (!exists) {
      setSelectedWalletMethodId(defaultWalletMethodId ?? walletMethods[0]?.id);
    }
  }, [defaultWalletMethodId, selectedWalletMethodId, walletMethods]);

  useEffect(() => {
    if (selectedMethod === 'DRIVER_UPI_DIRECT' || selectedMethod === 'CASH') {
      return;
    }

    if (!selectedWalletMethod) {
      return;
    }

    const expected = walletMethodToRail(selectedWalletMethod);
    if (selectedMethod !== expected) {
      setPaymentMethod(expected);
    }
  }, [selectedMethod, selectedWalletMethod, setPaymentMethod]);

  const loadOrderPaymentProfile = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!orderId) {
        setDriverDirectProfile({ paymentMethods: [] });
        setSelectedDriverPaymentMethodId(undefined);
        setOrderAmount(parseAmount(estimatedPrice) ?? 0);
        setOrderStatus(undefined);
        setTripStatus(undefined);
        setPaymentProvider(undefined);
        setPaymentStatus(undefined);
        setPaymentDirectToDriver(false);
        return;
      }

      if (!options?.silent) {
        setLoadingDriverProfile(true);
      }

      try {
        const response = await api.get(`/orders/${orderId}`);
        const payload = response.data as {
          status?: string;
          estimatedPrice?: number | string;
          finalPrice?: number | string;
          payment?: {
            provider?: string;
            status?: string;
            directPayToDriver?: boolean;
          };
          trip?: {
            status?: string;
            driverPreferredPaymentMethodId?: string;
            driverPreferredUpiId?: string;
            driverPreferredPaymentLabel?: string;
            driverPreferredUpiQrImageUrl?: string;
            driver?: {
              user?: {
                name?: string;
              };
              payoutAccount?: {
                upiId?: string;
                upiQrImageUrl?: string;
              };
              paymentMethods?: Array<{
                id?: string;
                label?: string;
                upiId?: string;
                qrImageUrl?: string;
                isPreferred?: boolean;
              }>;
            };
          };
        };

        const tripPreferredPaymentMethodId = normalize(payload.trip?.driverPreferredPaymentMethodId);
        const tripPreferredUpiId = normalize(payload.trip?.driverPreferredUpiId);
        const tripPreferredPaymentLabel = normalize(payload.trip?.driverPreferredPaymentLabel);
        const tripPreferredUpiQrImageUrl = normalize(payload.trip?.driverPreferredUpiQrImageUrl);
        const resolvedAmount =
          parseAmount(payload.finalPrice) ??
          parseAmount(payload.estimatedPrice) ??
          parseAmount(estimatedPrice) ??
          0;

        const paymentMethods = Array.isArray(payload.trip?.driver?.paymentMethods)
          ? payload.trip?.driver?.paymentMethods
              .map((method) => {
                const id = normalize(method.id);
                const upiId = normalize(method.upiId);
                if (!id || !upiId) {
                  return null;
                }
                return {
                  id,
                  label: normalize(method.label),
                  upiId,
                  qrImageUrl: normalize(method.qrImageUrl),
                  isPreferred: Boolean(method.isPreferred)
                };
              })
              .filter(Boolean) as Array<{
              id: string;
              label?: string;
              upiId: string;
              qrImageUrl?: string;
              isPreferred: boolean;
            }>
          : [];

        const tripPreferredMethod = tripPreferredPaymentMethodId
          ? paymentMethods.find((method) => method.id === tripPreferredPaymentMethodId)
          : undefined;
        const preferredMethod =
          tripPreferredMethod ??
          paymentMethods.find((method) => method.isPreferred) ??
          paymentMethods[0];

        setOrderAmount(resolvedAmount);
        setOrderStatus(normalizeStatus(payload.status));
        setTripStatus(normalizeStatus(payload.trip?.status));
        setPaymentProvider(normalizeStatus(payload.payment?.provider));
        setPaymentStatus(normalizeStatus(payload.payment?.status));
        setPaymentDirectToDriver(Boolean(payload.payment?.directPayToDriver));
        setDriverDirectProfile({
          name: normalize(payload.trip?.driver?.user?.name),
          upiId:
            tripPreferredUpiId ??
            preferredMethod?.upiId ??
            normalize(payload.trip?.driver?.payoutAccount?.upiId),
          upiQrImageUrl:
            tripPreferredUpiQrImageUrl ??
            preferredMethod?.qrImageUrl ??
            normalize(payload.trip?.driver?.payoutAccount?.upiQrImageUrl),
          paymentMethodId: preferredMethod?.id,
          tripPreferredPaymentMethodId,
          tripPreferredUpiId,
          tripPreferredPaymentLabel,
          tripPreferredUpiQrImageUrl,
          paymentMethods
        });
        setSelectedDriverPaymentMethodId(tripPreferredMethod?.id ?? preferredMethod?.id);
      } catch {
        setDriverDirectProfile({ paymentMethods: [] });
        setSelectedDriverPaymentMethodId(undefined);
        setOrderAmount(parseAmount(estimatedPrice) ?? 0);
        setOrderStatus(undefined);
        setTripStatus(undefined);
        setPaymentProvider(undefined);
        setPaymentStatus(undefined);
        setPaymentDirectToDriver(false);
      } finally {
        if (!options?.silent) {
          setLoadingDriverProfile(false);
        }
      }
    },
    [estimatedPrice, orderId]
  );

  useEffect(() => {
    void loadOrderPaymentProfile();
  }, [loadOrderPaymentProfile]);

  useEffect(() => {
    if (!orderId) {
      return;
    }

    const interval = setInterval(() => {
      void loadOrderPaymentProfile({ silent: true });
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [loadOrderPaymentProfile, orderId]);

  const selectedDriverPaymentMethod = useMemo(() => {
    const methods = driverDirectProfile.paymentMethods;
    if (!methods.length) {
      return undefined;
    }

    const tripPreferredMethod = driverDirectProfile.tripPreferredPaymentMethodId
      ? methods.find((method) => method.id === driverDirectProfile.tripPreferredPaymentMethodId)
      : undefined;

    return (
      methods.find((method) => method.id === selectedDriverPaymentMethodId) ??
      tripPreferredMethod ??
      methods.find((method) => method.isPreferred) ??
      methods[0]
    );
  }, [
    driverDirectProfile.paymentMethods,
    driverDirectProfile.tripPreferredPaymentMethodId,
    selectedDriverPaymentMethodId
  ]);

  const resolvedDriverUpiId =
    selectedDriverPaymentMethod?.upiId ??
    driverDirectProfile.tripPreferredUpiId ??
    driverDirectProfile.upiId;
  const hasDriverDirectUpi = Boolean(resolvedDriverUpiId);

  useEffect(() => {
    if (!orderId || !paymentPending || !upiEnabled || !hasDriverDirectUpi) {
      return;
    }

    if (selectedMethod === 'DRIVER_UPI_DIRECT') {
      return;
    }

    if (selectedMethod !== 'CASH' && selectedMethod !== 'UPI_SCAN_PAY') {
      setPaymentMethod('DRIVER_UPI_DIRECT');
    }
  }, [hasDriverDirectUpi, orderId, paymentPending, selectedMethod, setPaymentMethod, upiEnabled]);

  useEffect(() => {
    if (
      (selectedMethod === 'DRIVER_UPI_DIRECT' && !hasDriverDirectUpi) ||
      ((selectedMethod === 'DRIVER_UPI_DIRECT' || selectedMethod === 'UPI_SCAN_PAY') && !upiEnabled)
    ) {
      if (defaultWalletMethod) {
        setPaymentMethod(walletMethodToRail(defaultWalletMethod));
      } else {
        setPaymentMethod('CASH');
      }
    }
  }, [defaultWalletMethod, hasDriverDirectUpi, selectedMethod, setPaymentMethod, upiEnabled]);

  const chosenPaymentLabel = useMemo(() => {
    if (selectedMethod === 'DRIVER_UPI_DIRECT') {
      return `Driver UPI${resolvedDriverUpiId ? ` · ${resolvedDriverUpiId}` : ''}`;
    }
    if (selectedMethod === 'CASH') {
      return 'Cash on delivery';
    }
    if (selectedWalletMethod) {
      return walletMethodLabel(selectedWalletMethod);
    }
    return 'No method selected';
  }, [resolvedDriverUpiId, selectedMethod, selectedWalletMethod]);

  const buttonLabel = useMemo(() => {
    if (orderId && baseAmount > 0) {
      if (selectedMethod === 'CASH') {
        return 'Confirm Cash on Delivery';
      }
      if (selectedMethod === 'DRIVER_UPI_DIRECT') {
        return `Pay INR ${baseAmount.toFixed(2)}`;
      }
      if (selectedMethod === 'UPI_SCAN_PAY') {
        return `Pay INR ${baseAmount.toFixed(2)}`;
      }
      return `Pay INR ${payableAmount.toFixed(2)}`;
    }

    return orderId ? 'Confirm payment setup' : 'Done';
  }, [baseAmount, orderId, payableAmount, selectedMethod]);

  const askForPaymentConfirmation = (title: string, message: string) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(
        title,
        message,
        [
          {
            text: 'No',
            style: 'cancel',
            onPress: () => resolve(false)
          },
          {
            text: 'Yes, paid',
            onPress: () => resolve(true)
          }
        ],
        { cancelable: false }
      );
    });

  const getLatestPaymentStatusFromOrder = useCallback(async () => {
    if (!orderId) {
      return undefined;
    }

    try {
      const response = await api.get(`/orders/${orderId}`);
      const latest = String(response.data?.payment?.status ?? '').toUpperCase();
      if (latest === 'CAPTURED' || latest === 'FAILED' || latest === 'PENDING') {
        return latest;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }, [orderId]);

  const waitForGatewayFinalStatus = useCallback(async () => {
    const deadline = Date.now() + 45_000;

    while (Date.now() < deadline) {
      const latest = await getLatestPaymentStatusFromOrder();
      if (latest === 'CAPTURED' || latest === 'FAILED') {
        return latest;
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    return 'PENDING' as const;
  }, [getLatestPaymentStatusFromOrder]);

  const addWalletEntry = () => {
    if (newWalletType === 'UPI_ID') {
      const normalizedUpi = newWalletValue.trim().toLowerCase();
      if (!UPI_PATTERN.test(normalizedUpi)) {
        Alert.alert('Invalid UPI', 'Enter valid UPI ID (example: name@bank).');
        return;
      }

      addWalletMethod({
        type: 'UPI_ID',
        upiId: normalizedUpi,
        label: newWalletLabel.trim() || undefined,
        setAsDefault: newWalletSetDefault
      });
    } else {
      const last4 = newWalletValue.replace(/\D/g, '').slice(-4);
      if (!/^\d{4}$/.test(last4)) {
        Alert.alert('Invalid card', 'Enter card last 4 digits.');
        return;
      }

      addWalletMethod({
        type: newWalletType,
        cardLast4: last4,
        label: newWalletLabel.trim() || undefined,
        setAsDefault: newWalletSetDefault
      });
    }

    setNewWalletValue('');
    setNewWalletLabel('');
    setNewWalletSetDefault(false);
  };

  const onSubmit = async () => {
    if (!orderId) {
      navigation.goBack();
      return;
    }

    if (!paymentPending) {
      Alert.alert('Already settled', 'Payment for this ride is already settled.');
      return;
    }

    if (!(baseAmount > 0)) {
      Alert.alert('Amount unavailable', 'Please refresh trip details and retry payment.');
      return;
    }

    if (selectedMethod !== 'DRIVER_UPI_DIRECT' && selectedMethod !== 'CASH' && !selectedWalletMethod) {
      Alert.alert('Add payment method', 'Add a card or UPI ID in wallet before paying.');
      return;
    }

    const usingDriverPreferredRail = selectedMethod === 'DRIVER_UPI_DIRECT';
    const usingCash = selectedMethod === 'CASH';
    const usingWalletUpi =
      !usingDriverPreferredRail && !usingCash && selectedWalletMethod?.type === 'UPI_ID';

    if ((usingDriverPreferredRail || usingWalletUpi) && !upiEnabled) {
      Alert.alert(
        'UPI available after driver acceptance',
        'UPI unlocks once the driver accepts your ride. You can continue with card or cash for now.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const provider = usingCash
        ? 'WALLET'
        : usingDriverPreferredRail
          ? 'UPI'
          : 'CASHFREE';
      const applySurcharge = provider === 'CASHFREE' ? !usingWalletUpi : undefined;

      const intent = await api.post('/payments/create-intent', {
        orderId,
        provider,
        amount: provider === 'CASHFREE' ? (applySurcharge ? payableAmount : baseAmount) : baseAmount,
        driverPaymentMethodId: usingDriverPreferredRail ? selectedDriverPaymentMethod?.id : undefined,
        directPayToDriver: usingDriverPreferredRail,
        directUpiVpa: usingDriverPreferredRail ? resolvedDriverUpiId : undefined,
        directUpiName: usingDriverPreferredRail ? driverDirectProfile.name : undefined,
        applySurcharge
      });

      if (provider === 'WALLET') {
        Alert.alert('Cash selected', 'Customer will pay driver on delivery.');
        await Promise.all([refreshOrder(), refreshTimeline()]);
        navigation.goBack();
        return;
      }

      let success = true;
      let providerReference = String(intent.data?.providerRef ?? `PAY_${Date.now()}`);

      if (provider === 'UPI') {
        setSubmitting(false);
        const upiIntentUrl = intent.data?.upiIntentUrl as string | undefined;
        if (upiIntentUrl) {
          const upiLaunch = await openBestUpiApp(upiIntentUrl);
          if (!upiLaunch.opened) {
            Alert.alert(
              'UPI app not found',
              'Install a UPI app (Google Pay, PhonePe, Paytm, BHIM) and try again.'
            );
          } else {
            Alert.alert(
              'Complete payment',
              `Opening ${upiLaunch.appLabel ?? 'UPI app'}. Complete payment and return to Qargo.`
            );
          }
        } else {
          Alert.alert('Open UPI app', 'Use any UPI app and complete payment.');
        }

        success = await askForPaymentConfirmation(
          'UPI Payment',
          usingDriverPreferredRail
            ? `Did payment succeed to ${resolvedDriverUpiId ?? 'driver UPI'}?`
            : 'Did your UPI app show payment success?'
        );
        providerReference = String(intent.data?.providerRef ?? `UPI_${Date.now()}`);
      } else if (provider === 'CASHFREE') {
        setSubmitting(false);
        const checkoutUrl = intent.data?.checkoutUrl as string | undefined;
        if (checkoutUrl) {
          const canOpen = await Linking.canOpenURL(checkoutUrl);
          if (canOpen) {
            await Linking.openURL(checkoutUrl);
          }
        }
        Alert.alert(
          'Awaiting gateway confirmation',
          'Complete payment in Cashfree and return. We will verify status automatically.'
        );
        const gatewayStatus = await waitForGatewayFinalStatus();
        await Promise.allSettled([refreshOrder(), refreshTimeline()]);

        if (gatewayStatus === 'CAPTURED') {
          Alert.alert('Payment Complete', 'Payment verified by gateway.');
          navigation.goBack();
          return;
        }

        if (gatewayStatus === 'FAILED') {
          Alert.alert('Payment failed', 'Gateway marked this payment as failed.');
          return;
        }

        Alert.alert(
          'Payment pending',
          'Gateway confirmation is still pending. Please check again in a few moments.'
        );
        return;
      }

      setSubmitting(true);
      await api.post('/payments/confirm', {
        paymentId: intent.data.paymentId,
        success,
        providerReference
      });
      await Promise.allSettled([refreshOrder(), refreshTimeline()]);

      if (success) {
        Alert.alert('Payment Complete', 'Payment confirmed.');
      } else {
        Alert.alert('Payment Pending', 'Payment marked pending/failed. You can retry from tracking.');
      }
      navigation.goBack();
    } catch (error: unknown) {
      Alert.alert('Payment failed', readApiError(error, 'Could not confirm payment right now.'));
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
          <Text style={styles.headerTitle}>Payment</Text>
          <View style={styles.closeButton} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Ride Payment</Text>
            <Text style={styles.summaryAmount}>INR {baseAmount.toFixed(2)}</Text>
            <Text style={styles.summaryLine}>Chosen option: {chosenPaymentLabel}</Text>
            <Text style={styles.summaryLine}>Status: {paymentStatusLabel}</Text>
            {!paymentPending ? <Text style={styles.summaryPaid}>Already paid</Text> : null}
          </View>

          {selectedMethod === 'DRIVER_UPI_DIRECT' ? (
            <View style={styles.driverDirectCard}>
              <Text style={styles.sectionTitle}>Driver Direct UPI</Text>
              {loadingDriverProfile ? (
                <ActivityIndicator color="#1D4ED8" />
              ) : (
                <>
                  <Text style={styles.infoLine}>Driver: {driverDirectProfile.name ?? 'Assigned driver'}</Text>
                  <Text style={styles.infoLine}>UPI ID: {resolvedDriverUpiId ?? 'Not available'}</Text>
                  {driverDirectProfile.paymentMethods.length > 1 ? (
                    <View style={styles.driverMethodChipRow}>
                      {driverDirectProfile.paymentMethods.map((method) => {
                        const isSelected = method.id === selectedDriverPaymentMethod?.id;
                        return (
                          <Pressable
                            key={method.id}
                            style={[styles.driverMethodChip, isSelected && styles.driverMethodChipSelected]}
                            onPress={() => setSelectedDriverPaymentMethodId(method.id)}
                          >
                            <Text style={[styles.driverMethodChipText, isSelected && styles.driverMethodChipTextSelected]}>
                              {method.label ?? method.upiId}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          <View style={styles.optionCard}>
            <Text style={styles.sectionTitle}>Choose Payment Option</Text>
            <Text style={styles.defaultInfo}>
              Default wallet: {defaultWalletMethod ? walletMethodLabel(defaultWalletMethod) : 'None'}
            </Text>

            {walletMethods.map((method) => {
              const selected =
                selectedMethod !== 'DRIVER_UPI_DIRECT' &&
                selectedMethod !== 'CASH' &&
                method.id === selectedWalletMethod?.id;
              const unavailable = method.type === 'UPI_ID' && !upiEnabled;
              return (
                <Pressable
                  key={method.id}
                  style={[styles.optionRow, selected && styles.optionRowSelected, unavailable && styles.optionRowDisabled]}
                  onPress={() => {
                    if (unavailable) {
                      Alert.alert('UPI unavailable', 'UPI unlocks once driver accepts your ride.');
                      return;
                    }
                    setSelectedWalletMethodId(method.id);
                    setPaymentMethod(walletMethodToRail(method));
                  }}
                >
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionTitle}>{walletMethodLabel(method)}</Text>
                    <Text style={styles.optionMeta}>{walletMethodDescription(method)}</Text>
                  </View>
                  <Text style={styles.optionState}>{selected ? 'Selected' : method.isDefault ? 'Default' : 'Choose'}</Text>
                </Pressable>
              );
            })}

            {hasDriverDirectUpi ? (
              <Pressable
                style={[styles.optionRow, selectedMethod === 'DRIVER_UPI_DIRECT' && styles.optionRowSelected, !upiEnabled && styles.optionRowDisabled]}
                onPress={() => {
                  if (!upiEnabled) {
                    Alert.alert('UPI unavailable', 'UPI unlocks once driver accepts your ride.');
                    return;
                  }
                  setPaymentMethod('DRIVER_UPI_DIRECT');
                }}
              >
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>
                    {driverDirectProfile.tripPreferredPaymentLabel
                      ? `Pay to Driver · ${driverDirectProfile.tripPreferredPaymentLabel}`
                      : 'Pay to Driver UPI'}
                  </Text>
                  <Text style={styles.optionMeta}>
                    {resolvedDriverUpiId
                      ? `${resolvedDriverUpiId} · Opens installed UPI app`
                      : 'Driver preferred UPI'}
                  </Text>
                </View>
                <Text style={styles.optionState}>{selectedMethod === 'DRIVER_UPI_DIRECT' ? 'Selected' : 'Choose'}</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.optionRow, selectedMethod === 'CASH' && styles.optionRowSelected]}
              onPress={() => setPaymentMethod('CASH')}
            >
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Cash on Delivery</Text>
                <Text style={styles.optionMeta}>Pay driver at delivery</Text>
              </View>
              <Text style={styles.optionState}>{selectedMethod === 'CASH' ? 'Selected' : 'Choose'}</Text>
            </Pressable>

            {isCardMethod ? (
              <Text style={styles.surchargeNote}>Card processing fee 2.5% included: INR {cardSurchargeAmount.toFixed(2)}</Text>
            ) : null}
          </View>

          <View style={styles.walletCard}>
            <Text style={styles.sectionTitle}>Wallet</Text>
            <Text style={styles.defaultInfo}>Add cards or UPI ID and set one default method.</Text>

            {walletMethods.map((method) => (
              <View key={`manage-${method.id}`} style={styles.walletMethodRow}>
                <View style={styles.walletMethodInfo}>
                  <Text style={styles.walletMethodTitle}>{walletMethodLabel(method)}</Text>
                  <Text style={styles.walletMethodMeta}>{walletMethodDescription(method)}</Text>
                </View>
                <View style={styles.walletMethodActions}>
                  {!method.isDefault ? (
                    <Pressable
                      style={styles.inlineButton}
                      onPress={() => setDefaultWalletMethod(method.id)}
                    >
                      <Text style={styles.inlineButtonText}>Set default</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.defaultBadge}>Default</Text>
                  )}
                  {walletMethods.length > 1 ? (
                    <Pressable
                      style={[styles.inlineButton, styles.inlineButtonDanger]}
                      onPress={() => removeWalletMethod(method.id)}
                    >
                      <Text style={styles.inlineButtonDangerText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}

            <View style={styles.addTypeRow}>
              {(['UPI_ID', 'CREDIT_CARD', 'DEBIT_CARD'] as const).map((type) => {
                const active = newWalletType === type;
                return (
                  <Pressable
                    key={type}
                    style={[styles.addTypeChip, active && styles.addTypeChipActive]}
                    onPress={() => setNewWalletType(type)}
                  >
                    <Text style={[styles.addTypeChipText, active && styles.addTypeChipTextActive]}>
                      {type === 'UPI_ID' ? 'UPI' : type === 'CREDIT_CARD' ? 'Credit Card' : 'Debit Card'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={styles.input}
              value={newWalletValue}
              onChangeText={setNewWalletValue}
              autoCapitalize="none"
              keyboardType={newWalletType === 'UPI_ID' ? 'default' : 'number-pad'}
              placeholder={newWalletType === 'UPI_ID' ? 'name@bank' : 'Last 4 digits'}
              placeholderTextColor="#64748B"
            />
            <TextInput
              style={styles.input}
              value={newWalletLabel}
              onChangeText={setNewWalletLabel}
              placeholder="Label (optional)"
              placeholderTextColor="#64748B"
            />

            <Pressable
              style={[styles.defaultToggle, newWalletSetDefault && styles.defaultToggleActive]}
              onPress={() => setNewWalletSetDefault((prev) => !prev)}
            >
              <Text style={[styles.defaultToggleText, newWalletSetDefault && styles.defaultToggleTextActive]}>
                Set as default: {newWalletSetDefault ? 'Yes' : 'No'}
              </Text>
            </Pressable>

            <Pressable style={styles.addWalletButton} onPress={addWalletEntry}>
              <Text style={styles.addWalletButtonText}>Add Method</Text>
            </Pressable>
          </View>
        </ScrollView>

        <Pressable style={styles.primaryButton} onPress={() => void onSubmit()} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#EFF6FF" />
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
    backgroundColor: '#EFF6FF'
  },
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
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
    color: '#0F172A',
    fontFamily: 'Sora_700Bold',
    fontSize: 18
  },
  scroll: {
    flex: 1,
    marginTop: 8
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 16
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 4
  },
  summaryTitle: {
    color: '#1E3A8A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  summaryAmount: {
    color: '#0F172A',
    fontFamily: 'Sora_700Bold',
    fontSize: 24
  },
  summaryLine: {
    color: '#334155',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12
  },
  summaryPaid: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  sectionTitle: {
    color: '#0F172A',
    fontFamily: 'Sora_700Bold',
    fontSize: 15
  },
  defaultInfo: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12
  },
  driverDirectCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 6
  },
  infoLine: {
    color: '#334155',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12
  },
  driverMethodChipRow: {
    marginTop: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  driverMethodChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  driverMethodChipSelected: {
    borderColor: '#1D4ED8',
    backgroundColor: '#DBEAFE'
  },
  driverMethodChipText: {
    color: '#1E3A8A',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11
  },
  driverMethodChipTextSelected: {
    color: '#1E40AF'
  },
  optionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8
  },
  optionRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  optionRowSelected: {
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF'
  },
  optionRowDisabled: {
    opacity: 0.55
  },
  optionTextWrap: {
    flex: 1,
    gap: 1
  },
  optionTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  optionMeta: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11
  },
  optionState: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11
  },
  surchargeNote: {
    marginTop: 2,
    color: '#1E3A8A',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11
  },
  walletCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8
  },
  walletMethodRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  walletMethodInfo: {
    flex: 1,
    gap: 1
  },
  walletMethodTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  walletMethodMeta: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11
  },
  walletMethodActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  inlineButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  inlineButtonText: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 10
  },
  inlineButtonDanger: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2'
  },
  inlineButtonDangerText: {
    color: '#B91C1C',
    fontFamily: 'Manrope_700Bold',
    fontSize: 10
  },
  defaultBadge: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 10
  },
  addTypeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap'
  },
  addTypeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  addTypeChipActive: {
    borderColor: '#1D4ED8',
    backgroundColor: '#DBEAFE'
  },
  addTypeChipText: {
    color: '#475569',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11
  },
  addTypeChipTextActive: {
    color: '#1E3A8A'
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: '#0F172A',
    fontFamily: 'Manrope_500Medium',
    fontSize: 13
  },
  defaultToggle: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  defaultToggleActive: {
    borderColor: '#1D4ED8',
    backgroundColor: '#DBEAFE'
  },
  defaultToggleText: {
    color: '#475569',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  defaultToggleTextActive: {
    color: '#1E3A8A'
  },
  addWalletButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    paddingVertical: 10
  },
  addWalletButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  primaryButton: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12
  },
  primaryButtonText: {
    color: '#EFF6FF',
    fontFamily: 'Sora_700Bold',
    fontSize: 14
  }
});
