import { useEffect } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { type RoutePoint, useCustomerStore } from '../../store/useCustomerStore';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerHome'>;

const RECENT_DROPS: RoutePoint[] = [
  {
    address: 'KR Market, Bengaluru',
    lat: 12.9622,
    lng: 77.5777
  },
  {
    address: 'Peenya Industrial Area, Bengaluru',
    lat: 13.0307,
    lng: 77.5169
  },
  {
    address: 'Electronic City Phase 1, Bengaluru',
    lat: 12.8399,
    lng: 77.677
  }
];

const SERVICES = [
  { key: '3w', title: '3-Wheeler', subtitle: 'Light cargo', accent: '#F97316' },
  { key: 'mini', title: 'Mini Truck', subtitle: 'Most booked', accent: '#0F766E' },
  { key: 'truck', title: 'Truck', subtitle: 'Bulk loads', accent: '#1D4ED8' },
  { key: 'city', title: 'City-to-City', subtitle: 'Intercity', accent: '#7C3AED' }
] as const;

export function CustomerHomeScreen({ navigation }: Props) {
  const setDraftRoute = useCustomerStore((state) => state.setDraftRoute);
  const resetBookingFlow = useCustomerStore((state) => state.resetBookingFlow);

  useEffect(() => {
    resetBookingFlow();
  }, [resetBookingFlow]);

  const startBookingFlow = (drop?: RoutePoint) => {
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
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.headlineSection}>
            <Text style={styles.headlineEyebrow}>PORTERX BHARAT</Text>
            <Text style={styles.headlineTitle}>Move goods fast across the city, without the calling chase.</Text>
            <Text style={styles.headlineSubtitle}>
              Live trucks, transparent pricing, and GST-ready workflows built for Indian businesses.
            </Text>

            <View style={styles.quickPills}>
              <View style={styles.quickPill}>
                <Text style={styles.quickPillText}>Live tracking</Text>
              </View>
              <View style={styles.quickPill}>
                <Text style={styles.quickPillText}>Instant dispatch</Text>
              </View>
              <View style={styles.quickPill}>
                <Text style={styles.quickPillText}>GST-ready</Text>
              </View>
            </View>
          </View>

          <Pressable style={styles.searchCard} onPress={() => startBookingFlow()}>
            <View>
              <Text style={styles.searchLabel}>Pick-up and drop</Text>
              <Text style={styles.searchTitle}>Where should we deliver?</Text>
            </View>
            <View style={styles.searchArrowWrap}>
              <Text style={styles.searchArrow}>{'>'}</Text>
            </View>
          </Pressable>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Vehicle Services</Text>
            <Text style={styles.sectionCaption}>India-first load plans</Text>
          </View>

          <View style={styles.servicesGrid}>
            {SERVICES.map((service) => (
              <Pressable key={service.key} style={styles.serviceCard} onPress={() => startBookingFlow()}>
                <View style={[styles.serviceIcon, { backgroundColor: service.accent }]}>
                  <Text style={styles.serviceIconText}>{service.title.slice(0, 2).toUpperCase()}</Text>
                </View>
                <Text style={styles.serviceTitle}>{service.title}</Text>
                <Text style={styles.serviceSubtitle}>{service.subtitle}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Drops</Text>
            <Text style={styles.sectionCaption}>Fast re-booking</Text>
          </View>

          <View style={styles.recentList}>
            {RECENT_DROPS.map((place) => (
              <Pressable key={place.address} style={styles.recentCard} onPress={() => startBookingFlow(place)}>
                <View style={styles.recentDot} />
                <View style={styles.recentCopy}>
                  <Text style={styles.recentMain}>{place.address.split(',')[0]}</Text>
                  <Text style={styles.recentSub}>{place.address}</Text>
                </View>
                <Text style={styles.recentArrow}>{'>'}</Text>
              </Pressable>
            ))}
          </View>

          <LinearGradient
            colors={['#F1F5F9', '#FFEDD5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.promoCard}
          >
            <Text style={styles.promoTitle}>Festive freight offer</Text>
            <Text style={styles.promoText}>Save up to 18% on mini-truck routes in Bengaluru this month.</Text>
          </LinearGradient>
        </ScrollView>
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
    backgroundColor: '#FFF8F1'
  },
  scroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 14
  },
  headlineSection: {
    gap: 8,
    paddingTop: 2,
    paddingBottom: 4
  },
  headlineEyebrow: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F766E',
    fontSize: 11,
    letterSpacing: 1.3
  },
  headlineTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#7C2D12',
    fontSize: 26,
    lineHeight: 32
  },
  headlineSubtitle: {
    fontFamily: 'Manrope_500Medium',
    color: '#475569',
    fontSize: 14,
    lineHeight: 20
  },
  quickPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2
  },
  quickPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  quickPillText: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F766E',
    fontSize: 11
  },
  searchCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDBA74',
    backgroundColor: '#FFF7ED',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  searchLabel: {
    fontFamily: 'Manrope_700Bold',
    color: '#9A3412',
    fontSize: 12
  },
  searchTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#7C2D12',
    fontSize: 17,
    marginTop: 2
  },
  searchArrowWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchArrow: {
    fontFamily: 'Manrope_700Bold',
    color: '#ECFEFF',
    fontSize: 16
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline'
  },
  sectionTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#0F172A',
    fontSize: 18
  },
  sectionCaption: {
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
    fontSize: 12
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  serviceCard: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 5
  },
  serviceIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center'
  },
  serviceIconText: {
    fontFamily: 'Manrope_700Bold',
    color: '#FFFFFF',
    fontSize: 11
  },
  serviceTitle: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F172A',
    fontSize: 14
  },
  serviceSubtitle: {
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
    fontSize: 12
  },
  recentList: {
    gap: 8
  },
  recentCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  recentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F766E'
  },
  recentCopy: {
    flex: 1
  },
  recentMain: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F172A',
    fontSize: 14
  },
  recentSub: {
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
    fontSize: 12
  },
  recentArrow: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F766E',
    fontSize: 16
  },
  promoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDBA74',
    padding: 14,
    marginBottom: 12
  },
  promoTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#7C2D12',
    fontSize: 16
  },
  promoText: {
    marginTop: 4,
    fontFamily: 'Manrope_500Medium',
    color: '#9A3412',
    fontSize: 12
  }
});
