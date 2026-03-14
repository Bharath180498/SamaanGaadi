import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import api from '../../services/api';
import { isOngoingOrderStatus, useCustomerStore } from '../../store/useCustomerStore';
import { useSessionStore } from '../../store/useSessionStore';
import type { RootStackParamList } from '../../types/navigation';
import { CustomerSideDrawer, type DrawerRoute } from '../../components/CustomerSideDrawer';
import { isCustomerPaymentPending } from './paymentState';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerRides'>;
type RideFilter = 'ALL' | 'ONGOING' | 'DELIVERED' | 'CANCELLED';

interface OrderRow {
  id: string;
  status: string;
  pickupAddress: string;
  dropAddress: string;
  finalPrice?: number;
  estimatedPrice?: number;
  createdAt: string;
  trip?: {
    deliveryProof?: {
      id?: string;
    } | null;
  } | null;
  payment?: {
    provider?: string | null;
    status?: string | null;
    directPayToDriver?: boolean | null;
  } | null;
}

function readableStatus(status: string) {
  return status.replace(/_/g, ' ');
}

function readableDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function CustomerRidesScreen({ navigation }: Props) {
  const user = useSessionStore((state) => state.user);
  const activeOrderId = useCustomerStore((state) => state.activeOrderId);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [rideFilter, setRideFilter] = useState<RideFilter>('ALL');

  const loadOrders = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    setLoading(true);
    try {
      const response = await api.get('/orders', {
        params: {
          customerId: user.id
        }
      });
      const payload = Array.isArray(response.data) ? (response.data as OrderRow[]) : [];
      setOrders(payload);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesFilter =
        rideFilter === 'ALL'
          ? true
          : rideFilter === 'ONGOING'
            ? isOngoingOrderStatus(order.status)
            : order.status === rideFilter;

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchable = [order.id, order.pickupAddress, order.dropAddress, order.status, readableStatus(order.status)]
        .join(' ')
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [normalizedQuery, orders, rideFilter]);

  const ongoing = useMemo(
    () => filteredOrders.filter((item) => isOngoingOrderStatus(item.status)),
    [filteredOrders]
  );
  const history = useMemo(
    () => filteredOrders.filter((item) => !isOngoingOrderStatus(item.status)),
    [filteredOrders]
  );

  const openRideDetails = (order: OrderRow) => {
    navigation.navigate('CustomerRideDetails', { orderId: order.id });
  };

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
          <Text style={styles.title}>Ride History</Text>
          <Pressable style={styles.refreshButton} onPress={() => void loadOrders()}>
            <Text style={styles.refreshText}>{loading ? '...' : 'Refresh'}</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          alwaysBounceHorizontal={false}
          bounces={false}
          directionalLockEnabled
        >
          <View style={styles.filterCard}>
            <View style={styles.searchRow}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by ride ID, pickup, drop or status"
                placeholderTextColor="#94A3B8"
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.trim() ? (
                <Pressable style={styles.clearSearchButton} onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearSearchButtonText}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
              {(['ALL', 'ONGOING', 'DELIVERED', 'CANCELLED'] as RideFilter[]).map((filterOption) => (
                <Pressable
                  key={filterOption}
                  style={[styles.filterChip, rideFilter === filterOption && styles.filterChipActive]}
                  onPress={() => setRideFilter(filterOption)}
                >
                  <Text style={[styles.filterChipText, rideFilter === filterOption && styles.filterChipTextActive]}>
                    {filterOption === 'ALL' ? 'All rides' : readableStatus(filterOption)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ongoing</Text>
            {ongoing.length === 0 ? (
              <Text style={styles.emptyCopy}>
                {normalizedQuery || rideFilter !== 'ALL' ? 'No ongoing rides match the current filter.' : 'No ongoing trips right now.'}
              </Text>
            ) : (
              ongoing.map((order) => (
                <Pressable key={order.id} style={styles.card} onPress={() => openRideDetails(order)}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardStatus}>{readableStatus(order.status)}</Text>
                    <Text style={styles.cardPrice}>INR {Number(order.finalPrice ?? order.estimatedPrice ?? 0).toFixed(0)}</Text>
                  </View>
                  <Text style={styles.cardLine}>From: {order.pickupAddress}</Text>
                  <Text style={styles.cardLine}>To: {order.dropAddress}</Text>
                  <Text style={styles.cardMeta}>{order.id === activeOrderId ? 'Active on this device' : readableDate(order.createdAt)}</Text>
                  <Text style={styles.cardAction}>Tap for full details</Text>
                </Pressable>
              ))
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Completed & Cancelled</Text>
            {history.length === 0 ? (
              <Text style={styles.emptyCopy}>
                {normalizedQuery || rideFilter !== 'ALL' ? 'No completed rides match the current filter.' : 'No previous rides yet.'}
              </Text>
            ) : (
              history.map((order) => (
                <Pressable key={order.id} style={styles.card} onPress={() => openRideDetails(order)}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardStatus}>{readableStatus(order.status)}</Text>
                    <Text style={styles.cardPrice}>INR {Number(order.finalPrice ?? order.estimatedPrice ?? 0).toFixed(0)}</Text>
                  </View>
                  <Text style={styles.cardLine}>From: {order.pickupAddress}</Text>
                  <Text style={styles.cardLine}>To: {order.dropAddress}</Text>
                  {order.status === 'DELIVERED' &&
                  isCustomerPaymentPending({
                    orderStatus: order.status,
                    payment: order.payment
                  }) ? (
                    <Text style={styles.paymentPendingBadge}>Payment pending • Tap to pay</Text>
                  ) : null}
                  {order.status === 'DELIVERED' && order.trip?.deliveryProof?.id ? (
                    <Text style={styles.proofBadge}>Proof captured</Text>
                  ) : null}
                  <Text style={styles.cardMeta}>{readableDate(order.createdAt)}</Text>
                  <Text style={styles.cardAction}>Tap for full bill & driver details</Text>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      </View>

      <CustomerSideDrawer
        visible={drawerVisible}
        activeRoute="CustomerRides"
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
  refreshButton: {
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  refreshText: {
    fontFamily: 'Manrope_700Bold',
    color: '#1D4ED8',
    fontSize: 12
  },
  scroll: {
    width: '100%',
    maxWidth: 440,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14
  },
  section: {
    gap: 10
  },
  filterCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#F8FAFF',
    padding: 10,
    gap: 9
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  searchInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  clearSearchButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  clearSearchButtonText: {
    fontFamily: 'Manrope_700Bold',
    color: '#1D4ED8',
    fontSize: 12
  },
  filterChipsRow: {
    gap: 8,
    paddingRight: 4
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 6
  },
  filterChipActive: {
    borderColor: '#1D4ED8',
    backgroundColor: '#DBEAFE'
  },
  filterChipText: {
    color: '#334155',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12
  },
  filterChipTextActive: {
    color: '#1D4ED8'
  },
  sectionTitle: {
    fontFamily: 'Sora_700Bold',
    fontSize: 17,
    color: '#334155'
  },
  emptyCopy: {
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
    fontSize: 13
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 4
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cardStatus: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F172A',
    fontSize: 13
  },
  cardPrice: {
    fontFamily: 'Sora_700Bold',
    color: '#1D4ED8',
    fontSize: 14
  },
  cardLine: {
    fontFamily: 'Manrope_500Medium',
    color: '#334155',
    fontSize: 13
  },
  cardMeta: {
    marginTop: 2,
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
    fontSize: 12
  },
  proofBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6EE7B7',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 9,
    paddingVertical: 3,
    fontFamily: 'Manrope_700Bold',
    color: '#2563EB',
    fontSize: 11
  },
  paymentPendingBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 9,
    paddingVertical: 3,
    fontFamily: 'Manrope_700Bold',
    color: '#1D4ED8',
    fontSize: 11
  },
  cardAction: {
    marginTop: 4,
    fontFamily: 'Manrope_700Bold',
    color: '#1D4ED8',
    fontSize: 12
  }
});
