import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { type RoutePoint, isOngoingOrderStatus, useCustomerStore } from '../../store/useCustomerStore';
import { useSessionStore } from '../../store/useSessionStore';
import { CustomerSideDrawer, type DrawerRoute } from '../../components/CustomerSideDrawer';
import api from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerHome'>;

const MAX_CONCURRENT_RIDES = 3;
const ONGOING_ORDER_STATUSES = new Set(['CREATED', 'MATCHING', 'ASSIGNED', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT']);
const MAX_RECENT_DROPS = 3;

interface HomeOrderRow {
  id: string;
  status?: string;
  dropAddress?: string;
  dropLat?: number;
  dropLng?: number;
  createdAt?: string;
  updatedAt?: string;
  trip?: {
    deliveryTime?: string | null;
  } | null;
}

interface RecentDropItem {
  orderId: string;
  address: string;
  drop: RoutePoint;
  completedAt: string;
}

interface HomePromoCard {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  cta: string;
  colors: [string, string];
}

interface HomeBillboardConfig {
  eyebrow: string;
  title: string;
  subtitle: string;
  tags: string[];
}

interface HomeConfigResponse {
  billboard?: Partial<HomeBillboardConfig>;
  promos?: Partial<HomePromoCard>[];
}

const DEFAULT_HOME_BILLBOARD: HomeBillboardConfig = {
  eyebrow: 'HOME OFFER',
  title: 'First 3 rides at launch discount.',
  subtitle: 'Set route now and QARGO applies the best available customer offer.',
  tags: ['Instant pickup', 'Live ETA', 'Transparent fares']
};

const DEFAULT_HOME_PROMOS: HomePromoCard[] = [
  {
    id: 'promo-first-load',
    tag: 'New User Offer',
    title: 'Get 15% off on your first three rides',
    subtitle: 'Apply automatically after route setup.',
    cta: 'Start now',
    colors: ['#1D4ED8', '#1D4ED8']
  },
  {
    id: 'promo-bangalore-rush',
    tag: 'Rush Hours',
    title: 'Priority matching in Bengaluru city lanes',
    subtitle: 'Faster assignment during office peaks.',
    cta: 'Book priority',
    colors: ['#0F172A', '#2563EB']
  },
  {
    id: 'promo-fleet',
    tag: 'Multi-vehicle',
    title: 'Mini-truck and 3W availability today',
    subtitle: 'Choose the best fit once drop is set.',
    cta: 'Explore rides',
    colors: ['#7C3AED', '#1D4ED8']
  }
];

function pickText(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function pickTags(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const tags = value
    .map((entry) => pickText(entry, ''))
    .filter((entry) => entry.length > 0)
    .slice(0, 6);

  return tags.length > 0 ? tags : fallback;
}

function pickColors(value: unknown, fallback: [string, string]): [string, string] {
  if (!Array.isArray(value) || value.length < 2) {
    return fallback;
  }

  const first = pickText(value[0], fallback[0]);
  const second = pickText(value[1], fallback[1]);

  return [first, second];
}

function normalizeBillboard(
  value: Partial<HomeBillboardConfig> | undefined,
  fallback: HomeBillboardConfig
): HomeBillboardConfig {
  return {
    eyebrow: pickText(value?.eyebrow, fallback.eyebrow),
    title: pickText(value?.title, fallback.title),
    subtitle: pickText(value?.subtitle, fallback.subtitle),
    tags: pickTags(value?.tags, fallback.tags)
  };
}

function normalizePromo(
  value: Partial<HomePromoCard> | undefined,
  fallback: HomePromoCard,
  index: number
): HomePromoCard {
  const fallbackId = fallback.id || `promo-${index + 1}`;
  const id =
    pickText(value?.id, fallbackId)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallbackId;

  return {
    id,
    tag: pickText(value?.tag, fallback.tag),
    title: pickText(value?.title, fallback.title),
    subtitle: pickText(value?.subtitle, fallback.subtitle),
    cta: pickText(value?.cta, fallback.cta),
    colors: pickColors(value?.colors, fallback.colors)
  };
}

function completionTimestamp(order: HomeOrderRow) {
  const value = order.trip?.deliveryTime ?? order.updatedAt ?? order.createdAt ?? '';
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function buildRecentDrops(orders: HomeOrderRow[]) {
  return orders
    .filter(
      (order) =>
        order.status === 'DELIVERED' &&
        typeof order.dropAddress === 'string' &&
        order.dropAddress.trim().length > 0 &&
        typeof order.dropLat === 'number' &&
        typeof order.dropLng === 'number'
    )
    .sort((a, b) => completionTimestamp(b) - completionTimestamp(a))
    .slice(0, MAX_RECENT_DROPS)
    .map((order) => ({
      orderId: order.id,
      address: order.dropAddress!.trim(),
      drop: {
        address: order.dropAddress!.trim(),
        lat: order.dropLat!,
        lng: order.dropLng!
      },
      completedAt: order.trip?.deliveryTime ?? order.updatedAt ?? order.createdAt ?? ''
    })) as RecentDropItem[];
}

export function CustomerHomeScreen({ navigation }: Props) {
  const user = useSessionStore((state) => state.user);
  const setDraftRoute = useCustomerStore((state) => state.setDraftRoute);
  const activeOrderId = useCustomerStore((state) => state.activeOrderId);
  const activeOrderStatus = useCustomerStore((state) => state.activeOrderStatus);
  const refreshOrder = useCustomerStore((state) => state.refreshOrder);
  const dismissActiveOrder = useCustomerStore((state) => state.dismissActiveOrder);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [recentDrops, setRecentDrops] = useState<RecentDropItem[]>([]);
  const [homeBillboard, setHomeBillboard] = useState<HomeBillboardConfig>(DEFAULT_HOME_BILLBOARD);
  const [homePromos, setHomePromos] = useState<HomePromoCard[]>(DEFAULT_HOME_PROMOS);

  const fetchCustomerOrders = useCallback(async () => {
    if (!user?.id) {
      return [] as HomeOrderRow[];
    }

    try {
      const response = await api.get('/orders', {
        params: { customerId: user.id }
      });
      return Array.isArray(response.data) ? (response.data as HomeOrderRow[]) : [];
    } catch {
      return [] as HomeOrderRow[];
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeOrderId) {
      void refreshOrder();
    }
  }, [activeOrderId, refreshOrder]);

  useEffect(() => {
    let cancelled = false;

    const loadRecentDrops = async () => {
      const orders = await fetchCustomerOrders();
      if (cancelled) {
        return;
      }
      setRecentDrops(buildRecentDrops(orders));
    };

    void loadRecentDrops();

    return () => {
      cancelled = true;
    };
  }, [activeOrderId, activeOrderStatus, fetchCustomerOrders]);

  useEffect(() => {
    if (activeOrderId && activeOrderStatus === 'CANCELLED') {
      dismissActiveOrder();
    }
  }, [activeOrderId, activeOrderStatus, dismissActiveOrder]);

  useEffect(() => {
    let cancelled = false;

    const loadHomeContent = async () => {
      try {
        const response = await api.get('/app-config/mobile-home');

        if (cancelled) {
          return;
        }

        const payload = (response.data ?? {}) as HomeConfigResponse;
        const nextBillboard = normalizeBillboard(payload.billboard, DEFAULT_HOME_BILLBOARD);

        const incomingPromos = Array.isArray(payload.promos) ? payload.promos : [];
        const sourcePromos = incomingPromos.length > 0 ? incomingPromos : DEFAULT_HOME_PROMOS;
        const nextPromos = sourcePromos.slice(0, 8).map((promo, index) =>
          normalizePromo(
            promo,
            DEFAULT_HOME_PROMOS[index] ?? DEFAULT_HOME_PROMOS[DEFAULT_HOME_PROMOS.length - 1],
            index
          )
        );

        setHomeBillboard(nextBillboard);
        setHomePromos(nextPromos.length > 0 ? nextPromos : DEFAULT_HOME_PROMOS);
      } catch {
        if (cancelled) {
          return;
        }

        setHomeBillboard(DEFAULT_HOME_BILLBOARD);
        setHomePromos(DEFAULT_HOME_PROMOS);
      }
    };

    void loadHomeContent();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasOngoingOrder = Boolean(activeOrderId && isOngoingOrderStatus(activeOrderStatus));
  const hasSummaryPending = Boolean(activeOrderId && activeOrderStatus === 'DELIVERED');
  const hasOpenOrder = hasOngoingOrder || hasSummaryPending;
  const recentDropLabel = useMemo(() => {
    const count = recentDrops.length;
    if (count === 0) {
      return 'No completed drops yet';
    }
    return `Recent completed drops (${count})`;
  }, [recentDrops.length]);

  const navigateFromDrawer = (route: DrawerRoute) => {
    navigation.navigate(route);
  };

  const startBookingFlow = async (drop?: RoutePoint) => {
    if (activeOrderId) {
      try {
        await refreshOrder();
      } catch {
        // Keep local state if refresh fails.
      }
    }

    let ongoingCount = 0;
    if (user?.id) {
      const payload = await fetchCustomerOrders();
      ongoingCount = payload.filter((item) => ONGOING_ORDER_STATUSES.has(String(item?.status ?? ''))).length;
      setRecentDrops(buildRecentDrops(payload));
    }

    if (ongoingCount >= MAX_CONCURRENT_RIDES) {
      Alert.alert(
        'Ride limit reached',
        'You already have the maximum active rides. Complete or cancel one ride first.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Open Ride History',
            onPress: () => navigation.navigate('CustomerRides')
          }
        ]
      );
      return;
    }

    setDraftRoute({
      pickup: null,
      drop: drop ?? null,
      goodsDescription: 'General merchandise',
      goodsValue: 45000
    });

    navigation.navigate('CustomerPickupConfirm');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          alwaysBounceHorizontal={false}
          bounces={false}
          directionalLockEnabled
        >
          <View style={styles.topBar}>
            <Pressable style={styles.menuButton} onPress={() => setDrawerVisible(true)}>
              <Text style={styles.menuButtonText}>≡</Text>
            </Pressable>
            <Text style={styles.topBarTitle}>Home</Text>
            <View style={styles.topBarSpacer} />
          </View>

          <View style={styles.headlineSection}>
            <Text style={styles.headlineEyebrow}>WELCOME TO QARGO</Text>
            <Text style={styles.headlineTitle}>Book pickup and drop in seconds.</Text>
            <Text style={styles.headlineSubtitle}>Start with pickup, then choose drop, then see live fares.</Text>
          </View>

          <Pressable style={styles.billboardShell} onPress={() => void startBookingFlow()}>
            <LinearGradient colors={['#0B1E49', '#154FA4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.billboard}>
              <Text style={styles.billboardEyebrow}>{homeBillboard.eyebrow}</Text>
              <Text style={styles.billboardTitle}>{homeBillboard.title}</Text>
              <Text style={styles.billboardSubtitle}>{homeBillboard.subtitle}</Text>
              <View style={styles.billboardPills}>
                {homeBillboard.tags.map((tag) => (
                  <View key={tag} style={styles.billboardPill}>
                    <Text style={styles.billboardPillText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </LinearGradient>
          </Pressable>

          {hasOngoingOrder ? (
            <View style={styles.ongoingCard}>
              <View style={styles.ongoingHeader}>
                <Text style={styles.ongoingTitle}>Ongoing trip</Text>
                <Text style={styles.ongoingStatus}>{activeOrderStatus ?? 'MATCHING'}</Text>
              </View>
              <Text style={styles.ongoingSubtitle}>Your current booking is active. Resume to track driver and payment.</Text>
              <View style={styles.ongoingActions}>
                <Pressable style={styles.ongoingPrimaryButton} onPress={() => navigation.navigate('CustomerTracking')}>
                  <Text style={styles.ongoingPrimaryText}>Resume trip</Text>
                </Pressable>
                <Pressable style={styles.ongoingSecondaryButton} onPress={() => navigation.navigate('CustomerPayment')}>
                  <Text style={styles.ongoingSecondaryText}>Payments</Text>
                </Pressable>
              </View>
            </View>
          ) : hasOpenOrder ? (
            <View style={styles.ongoingCard}>
              <View style={styles.ongoingHeader}>
                <Text style={styles.ongoingTitle}>Trip completed</Text>
                <Text style={styles.ongoingStatus}>{activeOrderStatus ?? 'DELIVERED'}</Text>
              </View>
              <Text style={styles.ongoingSubtitle}>Review summary and complete payment before next booking.</Text>
              <View style={styles.ongoingActions}>
                <Pressable style={styles.ongoingPrimaryButton} onPress={() => navigation.navigate('CustomerTracking')}>
                  <Text style={styles.ongoingPrimaryText}>View summary</Text>
                </Pressable>
                <Pressable style={styles.ongoingSecondaryButton} onPress={() => navigation.navigate('CustomerPayment')}>
                  <Text style={styles.ongoingSecondaryText}>Pay now</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Pressable style={styles.searchCard} onPress={() => void startBookingFlow()}>
            <View>
              <Text style={styles.searchLabel}>Pickup and drop</Text>
              <Text style={styles.searchTitle}>Set your route</Text>
            </View>
            <View style={styles.searchArrowWrap}>
              <Text style={styles.searchArrow}>{'>'}</Text>
            </View>
          </Pressable>

          <View style={styles.promoHeader}>
            <Text style={styles.promoHeaderTitle}>Offers and updates</Text>
            <Text style={styles.promoHeaderMeta}>Swipe</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.promoRail}
            style={styles.promoRailScroll}
          >
            {homePromos.map((promo) => (
              <Pressable key={promo.id} style={styles.promoCard} onPress={() => void startBookingFlow()}>
                <LinearGradient colors={promo.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.promoCardGradient}>
                  <Text style={styles.promoCardTag}>{promo.tag}</Text>
                  <Text style={styles.promoCardTitle}>{promo.title}</Text>
                  <Text style={styles.promoCardSubtitle}>{promo.subtitle}</Text>
                  <Text style={styles.promoCardCta}>{promo.cta}</Text>
                </LinearGradient>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.recentDropsCard}>
            <View style={styles.recentDropsHeader}>
              <Text style={styles.recentDropsTitle}>Recent drops</Text>
              <Text style={styles.recentDropsMeta}>{recentDropLabel}</Text>
            </View>
            {recentDrops.length === 0 ? (
              <Text style={styles.recentDropsEmpty}>Completed deliveries will appear here.</Text>
            ) : (
              recentDrops.map((item) => (
                <Pressable
                  key={item.orderId}
                  style={styles.recentDropItem}
                  onPress={() => void startBookingFlow(item.drop)}
                >
                  <View style={styles.recentDropCopy}>
                    <Text style={styles.recentDropAddress} numberOfLines={1}>
                      {item.address}
                    </Text>
                    <Text style={styles.recentDropTime} numberOfLines={1}>
                      {item.completedAt ? new Date(item.completedAt).toLocaleString() : 'Completed'}
                    </Text>
                  </View>
                  <Text style={styles.recentDropAction}>Use</Text>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      </View>

      <CustomerSideDrawer
        visible={drawerVisible}
        activeRoute="CustomerHome"
        onClose={() => setDrawerVisible(false)}
        onNavigate={navigateFromDrawer}
        showTracking={hasOpenOrder}
        onNavigateTracking={() => navigation.navigate('CustomerTracking')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#EAF1FF',
    overflow: 'hidden'
  },
  container: {
    flex: 1,
    backgroundColor: '#EAF1FF',
    alignItems: 'center',
    overflow: 'hidden'
  },
  scrollView: {
    width: '100%'
  },
  scroll: {
    width: '100%',
    maxWidth: 440,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 14
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuButtonText: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F172A',
    fontSize: 18,
    lineHeight: 22
  },
  topBarTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#1E293B',
    fontSize: 16
  },
  topBarSpacer: {
    width: 40,
    height: 40
  },
  headlineSection: {
    gap: 4,
    paddingTop: 4,
    paddingBottom: 4
  },
  headlineEyebrow: {
    fontFamily: 'Manrope_700Bold',
    color: '#1D4ED8',
    fontSize: 11,
    letterSpacing: 1.1
  },
  headlineTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#102A43',
    fontSize: 22,
    lineHeight: 28
  },
  headlineSubtitle: {
    fontFamily: 'Manrope_500Medium',
    color: '#4B5C7A',
    fontSize: 13,
    lineHeight: 18
  },
  billboardShell: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  billboard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6
  },
  billboardEyebrow: {
    fontFamily: 'Manrope_700Bold',
    color: '#BFDBFE',
    fontSize: 11,
    letterSpacing: 1
  },
  billboardTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#F8FAFC',
    fontSize: 20,
    lineHeight: 24
  },
  billboardSubtitle: {
    fontFamily: 'Manrope_500Medium',
    color: '#DBEAFE',
    fontSize: 13,
    lineHeight: 18
  },
  billboardPills: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  billboardPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(219, 234, 254, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(219, 234, 254, 0.35)'
  },
  billboardPillText: {
    fontFamily: 'Manrope_700Bold',
    color: '#EFF6FF',
    fontSize: 11
  },
  searchCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  searchLabel: {
    fontFamily: 'Manrope_700Bold',
    color: '#1D4ED8',
    fontSize: 12
  },
  searchTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#0F172A',
    fontSize: 17,
    marginTop: 2
  },
  searchArrowWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchArrow: {
    fontFamily: 'Manrope_700Bold',
    color: '#EFF6FF',
    fontSize: 16
  },
  promoHeader: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  promoHeaderTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#102A43',
    fontSize: 15
  },
  promoHeaderMeta: {
    fontFamily: 'Manrope_600SemiBold',
    color: '#4B5C7A',
    fontSize: 11
  },
  promoRailScroll: {
    marginHorizontal: -2
  },
  promoRail: {
    gap: 10,
    paddingHorizontal: 2
  },
  promoCard: {
    width: 236,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  promoCardGradient: {
    minHeight: 146,
    padding: 12,
    justifyContent: 'space-between',
    gap: 6
  },
  promoCardTag: {
    fontFamily: 'Manrope_700Bold',
    color: '#BFDBFE',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  promoCardTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#F8FAFC',
    fontSize: 16,
    lineHeight: 21
  },
  promoCardSubtitle: {
    fontFamily: 'Manrope_500Medium',
    color: '#DBEAFE',
    fontSize: 12,
    lineHeight: 16
  },
  promoCardCta: {
    fontFamily: 'Manrope_700Bold',
    color: '#E0F2FE',
    fontSize: 12
  },
  ongoingCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 8
  },
  ongoingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  ongoingTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#1E3A8A',
    fontSize: 16
  },
  ongoingStatus: {
    fontFamily: 'Manrope_700Bold',
    color: '#1D4ED8',
    fontSize: 12
  },
  ongoingSubtitle: {
    fontFamily: 'Manrope_500Medium',
    color: '#334E68',
    fontSize: 13
  },
  ongoingActions: {
    flexDirection: 'row',
    gap: 8
  },
  ongoingPrimaryButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10
  },
  ongoingPrimaryText: {
    fontFamily: 'Manrope_700Bold',
    color: '#EFF6FF',
    fontSize: 13
  },
  ongoingSecondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF'
  },
  ongoingSecondaryText: {
    fontFamily: 'Manrope_700Bold',
    color: '#1D4ED8',
    fontSize: 13
  },
  recentDropsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8
  },
  recentDropsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8
  },
  recentDropsTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#0F172A',
    fontSize: 15
  },
  recentDropsMeta: {
    fontFamily: 'Manrope_600SemiBold',
    color: '#64748B',
    fontSize: 11
  },
  recentDropsEmpty: {
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
    fontSize: 12
  },
  recentDropItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  recentDropCopy: {
    flex: 1
  },
  recentDropAddress: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F172A',
    fontSize: 12
  },
  recentDropTime: {
    marginTop: 2,
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
    fontSize: 11
  },
  recentDropAction: {
    fontFamily: 'Manrope_700Bold',
    color: '#1D4ED8',
    fontSize: 12
  }
});
