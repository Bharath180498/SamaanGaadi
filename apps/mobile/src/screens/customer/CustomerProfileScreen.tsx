import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import api from '../../services/api';
import {
  isOngoingOrderStatus,
  type CustomerWalletMethod,
  useCustomerStore
} from '../../store/useCustomerStore';
import { useSessionStore } from '../../store/useSessionStore';
import type { RootStackParamList } from '../../types/navigation';
import { CustomerSideDrawer, type DrawerRoute } from '../../components/CustomerSideDrawer';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerProfile'>;

interface OrderSummaryRow {
  id: string;
  status: string;
  finalPrice?: number | string | null;
  estimatedPrice?: number | string | null;
  createdAt?: string;
  updatedAt?: string;
  vehicleType?: string;
}

const FALLBACK_PAYMENT_LABELS = {
  VISA_5496: 'Visa ...5496',
  MASTERCARD_6802: 'Mastercard ...6802',
  UPI_SCAN_PAY: 'UPI Scan & Pay',
  DRIVER_UPI_DIRECT: 'Driver UPI',
  CASH: 'Cash on delivery'
} as const;

function walletMethodLabel(method: CustomerWalletMethod) {
  if (method.type === 'UPI_ID') {
    return method.upiId ?? method.label;
  }
  return method.label;
}

function formatInr(amount: number) {
  return `INR ${amount.toFixed(0)}`;
}

function asAmount(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return amount;
}

function formatDateLabel(date?: Date) {
  if (!date || Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatMonthYear(date?: Date) {
  if (!date || Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric'
  });
}

function isTimeoutOrTransientNetworkError(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  if (error.code === 'ECONNABORTED') {
    return true;
  }

  const message = String(error.message ?? '').toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network error') ||
    message.includes('request failed') ||
    message.includes('socket hang up')
  );
}

async function waitMs(durationMs: number) {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

export function CustomerProfileScreen({ navigation }: Props) {
  const user = useSessionStore((state) => state.user);
  const activeOrderId = useCustomerStore((state) => state.activeOrderId);
  const activeOrderStatus = useCustomerStore((state) => state.activeOrderStatus);
  const paymentMethod = useCustomerStore((state) => state.paymentMethod);
  const walletMethods = useCustomerStore((state) => state.walletMethods);
  const defaultWalletMethodId = useCustomerStore((state) => state.defaultWalletMethodId);
  const insuranceSelected = useCustomerStore((state) => state.insuranceSelected);
  const minDriverRating = useCustomerStore((state) => state.minDriverRating);
  const goodsValue = useCustomerStore((state) => state.goodsValue);
  const autoGenerateEwayBill = useCustomerStore((state) => state.autoGenerateEwayBill);

  const [orders, setOrders] = useState<OrderSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [drawerVisible, setDrawerVisible] = useState(false);

  const defaultWalletMethod = useMemo(
    () =>
      walletMethods.find((method) => method.id === defaultWalletMethodId) ??
      walletMethods.find((method) => method.isDefault) ??
      walletMethods[0],
    [defaultWalletMethodId, walletMethods]
  );
  const preferredPaymentLabel = defaultWalletMethod
    ? walletMethodLabel(defaultWalletMethod)
    : FALLBACK_PAYMENT_LABELS[paymentMethod];

  const loadStats = useCallback(
    async (isRefresh = false) => {
      if (!user?.id) {
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(undefined);

      try {
        let response:
          | {
              data: unknown;
            }
          | undefined;

        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            response = await api.get('/orders', {
              params: {
                customerId: user.id
              },
              timeout: 20000
            });
            break;
          } catch (requestError: unknown) {
            const isLastAttempt = attempt === 1;
            if (!isLastAttempt && isTimeoutOrTransientNetworkError(requestError)) {
              await waitMs(700);
              continue;
            }
            throw requestError;
          }
        }

        setOrders(Array.isArray(response?.data) ? (response?.data as OrderSummaryRow[]) : []);
      } catch (nextError: unknown) {
        const message =
          typeof nextError === 'object' &&
          nextError !== null &&
          'message' in nextError &&
          typeof (nextError as { message?: unknown }).message === 'string'
            ? (nextError as { message: string }).message
            : 'Unable to load profile insights.';

        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const stats = useMemo(() => {
    const total = orders.length;
    const deliveredOrders = orders.filter((item) => item.status === 'DELIVERED');
    const completed = deliveredOrders.length;
    const cancelled = orders.filter((item) => item.status === 'CANCELLED').length;
    const ongoing = orders.filter((item) => isOngoingOrderStatus(item.status)).length;
    const spend = deliveredOrders.reduce(
      (sum, item) => sum + asAmount(item.finalPrice ?? item.estimatedPrice),
      0
    );
    const avgTicket = completed > 0 ? spend / completed : 0;
    const reliabilityScore = total > 0 ? Math.round((completed / total) * 100) : 100;

    const firstOrderDate = orders.reduce<Date | undefined>((earliest, item) => {
      const candidate = new Date(item.createdAt ?? item.updatedAt ?? '');
      if (Number.isNaN(candidate.getTime())) {
        return earliest;
      }
      if (!earliest || candidate < earliest) {
        return candidate;
      }
      return earliest;
    }, undefined);

    const lastDeliveredDate = deliveredOrders.reduce<Date | undefined>((latest, item) => {
      const candidate = new Date(item.updatedAt ?? item.createdAt ?? '');
      if (Number.isNaN(candidate.getTime())) {
        return latest;
      }
      if (!latest || candidate > latest) {
        return candidate;
      }
      return latest;
    }, undefined);

    const vehicleCounts = deliveredOrders.reduce<Record<string, number>>((acc, item) => {
      const key = item.vehicleType?.trim() || 'MIXED';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const favoriteVehicle =
      Object.entries(vehicleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'MIXED';

    return {
      total,
      completed,
      cancelled,
      ongoing,
      spend,
      avgTicket,
      reliabilityScore,
      firstOrderDate,
      lastDeliveredDate,
      favoriteVehicle
    };
  }, [orders]);

  const firstName = useMemo(() => {
    const value = user?.name?.trim();
    if (!value) {
      return 'Customer';
    }

    return value.split(/\s+/)[0] ?? value;
  }, [user?.name]);

  const navigateFromDrawer = (route: DrawerRoute) => {
    navigation.navigate(route);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => setDrawerVisible(true)}>
            <Text style={styles.backText}>≡</Text>
          </Pressable>
          <Text style={styles.title}>My Account</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void loadStats(true);
              }}
              tintColor="#1D4ED8"
            />
          }
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          alwaysBounceHorizontal={false}
          bounces={false}
          directionalLockEnabled
        >
          <LinearGradient
            colors={['#0F172A', '#1D4ED8', '#0EA5A4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user?.name?.slice(0, 1)?.toUpperCase() ?? 'Q'}</Text>
              </View>
              <View style={styles.heroBadges}>
                <Text style={styles.heroBadge}>{stats.reliabilityScore}% reliability</Text>
                <Text style={styles.heroBadge}>Member since {formatMonthYear(stats.firstOrderDate)}</Text>
              </View>
            </View>

            <View style={styles.profileCopy}>
              <Text style={styles.heroEyebrow}>QARGO PROFILE</Text>
              <Text style={styles.name}>Hi {firstName}, great to see you.</Text>
              <Text style={styles.meta}>{user?.phone ?? '+91 90000 00001'}</Text>
              <Text style={styles.meta}>Verified account · Priority support enabled</Text>
            </View>

            {activeOrderId ? (
              <View style={styles.activeTripPill}>
                <Text style={styles.activeTripLabel}>Active Trip</Text>
                <Text style={styles.activeTripValue}>{activeOrderStatus ?? 'IN_TRANSIT'}</Text>
              </View>
            ) : null}
          </LinearGradient>

          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color="#1D4ED8" />
              <Text style={styles.loadingText}>Loading profile insights...</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, styles.metricSpend]}>
              <Text style={styles.metricValueDark}>{formatInr(stats.spend)}</Text>
              <Text style={styles.metricLabelDark}>Lifetime spend</Text>
            </View>
            <View style={[styles.metricCard, styles.metricOrders]}>
              <Text style={styles.metricValueBlue}>{stats.total}</Text>
              <Text style={styles.metricLabelBlue}>Total orders</Text>
            </View>
            <View style={[styles.metricCard, styles.metricTrust]}>
              <Text style={styles.metricValueTeal}>{stats.completed}</Text>
              <Text style={styles.metricLabelTeal}>Delivered</Text>
            </View>
            <View style={[styles.metricCard, styles.metricRisk]}>
              <Text style={styles.metricValueOrange}>{stats.cancelled}</Text>
              <Text style={styles.metricLabelOrange}>Cancelled</Text>
            </View>
          </View>

          <View style={styles.storyCard}>
            <Text style={styles.storyTitle}>Delivery Story</Text>
            <View style={styles.storyGrid}>
              <View style={styles.storyItem}>
                <Text style={styles.storyValue}>{formatInr(stats.avgTicket)}</Text>
                <Text style={styles.storyLabel}>Avg order value</Text>
              </View>
              <View style={styles.storyItem}>
                <Text style={styles.storyValue}>{stats.favoriteVehicle.replace(/_/g, ' ')}</Text>
                <Text style={styles.storyLabel}>Most used vehicle</Text>
              </View>
              <View style={styles.storyItem}>
                <Text style={styles.storyValue}>{formatDateLabel(stats.lastDeliveredDate)}</Text>
                <Text style={styles.storyLabel}>Last delivery</Text>
              </View>
              <View style={styles.storyItem}>
                <Text style={styles.storyValue}>{stats.ongoing}</Text>
                <Text style={styles.storyLabel}>Ongoing now</Text>
              </View>
            </View>
          </View>

          <View style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>Quick Access</Text>
            <View style={styles.quickGrid}>
              <Pressable style={styles.quickCard} onPress={() => navigation.navigate('CustomerPayment')}>
                <Text style={styles.quickCardEyebrow}>PAYMENTS</Text>
                <Text style={styles.quickCardTitle}>Manage payment methods</Text>
                <Text style={styles.quickCardMeta}>{preferredPaymentLabel}</Text>
              </Pressable>

              <Pressable style={styles.quickCard} onPress={() => navigation.navigate('CustomerRides')}>
                <Text style={styles.quickCardEyebrow}>HISTORY</Text>
                <Text style={styles.quickCardTitle}>Review previous trips</Text>
                <Text style={styles.quickCardMeta}>Invoices, proofs, and timeline</Text>
              </Pressable>

              <Pressable
                style={[styles.quickCard, !activeOrderId && styles.quickCardDisabled]}
                onPress={() => activeOrderId && navigation.navigate('CustomerTracking')}
              >
                <Text style={styles.quickCardEyebrow}>TRACKING</Text>
                <Text style={styles.quickCardTitle}>
                  {activeOrderId ? 'Resume live tracking' : 'No active trip'}
                </Text>
                <Text style={styles.quickCardMeta}>
                  {activeOrderId ? 'Driver location and trip updates' : 'Book a new ride from Home'}
                </Text>
              </Pressable>

              <Pressable style={styles.quickCard} onPress={() => navigation.navigate('CustomerShipmentDetails')}>
                <Text style={styles.quickCardEyebrow}>SHIPMENT</Text>
                <Text style={styles.quickCardTitle}>Set shipment defaults</Text>
                <Text style={styles.quickCardMeta}>Insurance, GST, and goods value</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>Preferences Snapshot</Text>
            <View style={styles.preferenceRow}>
              <Text style={styles.preferenceLabel}>Preferred payment</Text>
              <Text style={styles.preferenceValue}>{preferredPaymentLabel}</Text>
            </View>
            <View style={styles.preferenceRow}>
              <Text style={styles.preferenceLabel}>Insurance plan</Text>
              <Text style={styles.preferenceValue}>{insuranceSelected}</Text>
            </View>
            <View style={styles.preferenceRow}>
              <Text style={styles.preferenceLabel}>Minimum driver rating</Text>
              <Text style={styles.preferenceValue}>{minDriverRating.toFixed(1)}+</Text>
            </View>
            <View style={styles.preferenceRow}>
              <Text style={styles.preferenceLabel}>Typical goods value</Text>
              <Text style={styles.preferenceValue}>{formatInr(goodsValue)}</Text>
            </View>
            <View style={styles.preferenceRow}>
              <Text style={styles.preferenceLabel}>Auto eWay bill</Text>
              <Text style={styles.preferenceValue}>{autoGenerateEwayBill ? 'Enabled' : 'Disabled'}</Text>
            </View>
          </View>

          <View style={styles.supportCard}>
            <Text style={styles.actionsTitle}>Need Help?</Text>
            <Text style={styles.supportSubtitle}>
              Please text support first and wait up to 6 hours. Phone escalation is intentionally hidden and unlocks
              only for unresolved tickets.
            </Text>

            <Pressable style={styles.supportButton} onPress={() => navigation.navigate('CustomerSupport')}>
              <Text style={styles.supportButtonText}>Open support center</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      <CustomerSideDrawer
        visible={drawerVisible}
        activeRoute="CustomerProfile"
        onClose={() => setDrawerVisible(false)}
        onNavigate={navigateFromDrawer}
        showTracking={Boolean(activeOrderId)}
        onNavigateTracking={() => navigation.navigate('CustomerTracking')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFF6FF' },
  container: {
    flex: 1,
    alignItems: 'center',
    overflow: 'hidden'
  },
  scrollView: {
    width: '100%'
  },
  headerRow: {
    width: '100%',
    maxWidth: 460,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center'
  },
  backText: {
    color: '#FFF',
    fontSize: 20,
    fontFamily: 'Manrope_700Bold'
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 22,
    color: '#7C2D12'
  },
  headerSpacer: {
    width: 36,
    height: 36
  },
  scroll: {
    width: '100%',
    maxWidth: 440,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14
  },
  heroCard: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: 14,
    gap: 10
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#2563EB',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    fontFamily: 'Sora_700Bold',
    color: '#FFF',
    fontSize: 22
  },
  heroBadges: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 6
  },
  heroBadge: {
    color: '#EFF6FF',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(236, 254, 255, 0.35)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11
  },
  profileCopy: {
    gap: 2
  },
  heroEyebrow: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    color: '#DBEAFE',
    letterSpacing: 0.9
  },
  name: {
    fontFamily: 'Sora_700Bold',
    fontSize: 20,
    color: '#FFFFFF'
  },
  meta: {
    fontFamily: 'Manrope_500Medium',
    color: '#E2E8F0',
    fontSize: 13
  },
  activeTripPill: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  activeTripLabel: {
    color: '#DBEAFE',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  activeTripValue: {
    color: '#FFFFFF',
    fontFamily: 'Sora_700Bold',
    fontSize: 12
  },
  loadingCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  loadingText: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  errorText: {
    color: '#B91C1C',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10
  },
  metricCard: {
    width: '49%',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 2
  },
  metricSpend: {
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF'
  },
  metricOrders: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF'
  },
  metricTrust: {
    borderColor: '#DBEAFE',
    backgroundColor: '#EFF6FF'
  },
  metricRisk: {
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FAFF'
  },
  metricValueDark: {
    fontFamily: 'Sora_700Bold',
    color: '#312E81',
    fontSize: 16
  },
  metricLabelDark: {
    fontFamily: 'Manrope_700Bold',
    color: '#4338CA',
    fontSize: 12
  },
  metricValueBlue: {
    fontFamily: 'Sora_700Bold',
    color: '#1E3A8A',
    fontSize: 16
  },
  metricLabelBlue: {
    fontFamily: 'Manrope_700Bold',
    color: '#1D4ED8',
    fontSize: 12
  },
  metricValueTeal: {
    fontFamily: 'Sora_700Bold',
    color: '#1E40AF',
    fontSize: 16
  },
  metricLabelTeal: {
    fontFamily: 'Manrope_700Bold',
    color: '#2563EB',
    fontSize: 12
  },
  metricValueOrange: {
    fontFamily: 'Sora_700Bold',
    color: '#9A3412',
    fontSize: 16
  },
  metricLabelOrange: {
    fontFamily: 'Manrope_700Bold',
    color: '#1E3A8A',
    fontSize: 12
  },
  storyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10
  },
  storyTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#334155',
    fontSize: 16
  },
  storyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    justifyContent: 'space-between'
  },
  storyItem: {
    width: '49%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 2
  },
  storyValue: {
    fontFamily: 'Sora_700Bold',
    color: '#0F172A',
    fontSize: 13
  },
  storyLabel: {
    fontFamily: 'Manrope_700Bold',
    color: '#64748B',
    fontSize: 11
  },
  actionsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10
  },
  actionsTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#334155',
    fontSize: 16
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10
  },
  quickCard: {
    width: '49%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 11,
    gap: 4
  },
  quickCardDisabled: {
    opacity: 0.55
  },
  quickCardEyebrow: {
    color: '#1D4ED8',
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 0.7
  },
  quickCardTitle: {
    color: '#0F172A',
    fontFamily: 'Sora_700Bold',
    fontSize: 12
  },
  quickCardMeta: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11
  },
  preferenceRow: {
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  preferenceLabel: {
    color: '#475569',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  preferenceValue: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F172A',
    fontSize: 12
  },
  supportCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    padding: 12,
    gap: 10
  },
  supportSubtitle: {
    color: '#475569',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12
  },
  supportButton: {
    borderRadius: 10,
    backgroundColor: '#0F172A',
    paddingVertical: 11,
    alignItems: 'center'
  },
  supportButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
});
