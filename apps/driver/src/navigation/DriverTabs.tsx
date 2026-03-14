import { useEffect, useRef, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Alert, Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import type { DriverTabParamList } from '../types';
import { HomeScreen } from '../screens/tabs/HomeScreen';
import { EarningsScreen } from '../screens/tabs/EarningsScreen';
import { HistoryScreen } from '../screens/tabs/HistoryScreen';
import { ProfileScreen } from '../screens/tabs/ProfileScreen';
import { SupportScreen } from '../screens/tabs/SupportScreen';
import { colors, typography } from '../theme';
import { useDriverAppStore } from '../store/useDriverAppStore';
import { useDriverUxStore } from '../store/useDriverUxStore';
import { SupportFab } from '../components/SupportFab';
import { useDriverI18n } from '../i18n/useDriverI18n';

const Tab = createBottomTabNavigator<DriverTabParamList>();

export function DriverTabs() {
  const { t } = useDriverI18n();
  const bootstrap = useDriverAppStore((state) => state.bootstrap);
  const refreshJobs = useDriverAppStore((state) => state.refreshJobs);
  const refreshEarnings = useDriverAppStore((state) => state.refreshEarnings);
  const refreshSubscriptionCatalog = useDriverAppStore((state) => state.refreshSubscriptionCatalog);
  const pendingOffers = useDriverAppStore((state) => state.pendingOffers);
  const currentJob = useDriverAppStore((state) => state.currentJob);
  const currentTopOfferId = pendingOffers[0]?.id as string | undefined;
  const lastSeenOfferId = useRef<string | undefined>(undefined);
  const isOfferTrackerReady = useRef(false);
  const [activeTab, setActiveTab] = useState<keyof DriverTabParamList>('Home');
  const [focusModalVisible, setFocusModalVisible] = useState(false);
  const lastFocusedTripId = useRef<string | undefined>(undefined);
  const simpleMode = useDriverUxStore((state) => state.simpleMode);
  const currentJobId = typeof currentJob?.id === 'string' ? currentJob.id : undefined;
  const currentJobStatus = String(currentJob?.status ?? '').toUpperCase();
  const tripFocusModeEnabled = Boolean(
    currentJobId && currentJobStatus !== 'COMPLETED' && currentJobStatus !== 'CANCELLED'
  );

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const timer = setInterval(() => {
      void Promise.all([refreshJobs(), refreshEarnings(), refreshSubscriptionCatalog()]);
    }, 6000);

    return () => clearInterval(timer);
  }, [refreshEarnings, refreshJobs, refreshSubscriptionCatalog]);

  useEffect(() => {
    if (!isOfferTrackerReady.current) {
      lastSeenOfferId.current = currentTopOfferId;
      isOfferTrackerReady.current = true;
      return;
    }

    if (!currentTopOfferId) {
      lastSeenOfferId.current = undefined;
      return;
    }

    if (currentTopOfferId === lastSeenOfferId.current) {
      return;
    }

    lastSeenOfferId.current = currentTopOfferId;
    Vibration.vibrate([0, 250, 120, 250]);
    Alert.alert(t('nav.offerAlertTitle'), t('nav.offerAlertBody'));
  }, [currentTopOfferId, t]);

  useEffect(() => {
    if (!tripFocusModeEnabled || !currentJobId) {
      lastFocusedTripId.current = undefined;
      setFocusModalVisible(false);
      return;
    }

    if (lastFocusedTripId.current !== currentJobId) {
      lastFocusedTripId.current = currentJobId;
      setFocusModalVisible(true);
    }
  }, [currentJobId, tripFocusModeEnabled]);

  useEffect(() => {
    if (!tripFocusModeEnabled) {
      return;
    }

    if (activeTab !== 'Home' && activeTab !== 'Support') {
      setFocusModalVisible(true);
    }
  }, [activeTab, tripFocusModeEnabled]);

  const lockDistractionTab = (
    event: { preventDefault: () => void },
    tabName: keyof DriverTabParamList
  ) => {
    if (!tripFocusModeEnabled) {
      return;
    }
    if (tabName === 'Home' || tabName === 'Support') {
      return;
    }
    event.preventDefault();
    setFocusModalVisible(true);
  };

  return (
    <>
      <Tab.Navigator
        screenListeners={{
          state: (event) => {
            const navState = event.data.state as
              | {
                  index?: number;
                  routes?: Array<{ name?: string }>;
                }
              | undefined;
            const index = navState?.index ?? 0;
            const routeName = navState?.routes?.[index]?.name;
            if (
              routeName === 'Home' ||
              routeName === 'Earnings' ||
              routeName === 'History' ||
              routeName === 'Support' ||
              routeName === 'Profile'
            ) {
              setActiveTab(routeName);
            }
          }
        }}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedText,
          tabBarStyle: {
            borderTopWidth: 1,
            borderTopColor: '#BFDBFE',
            backgroundColor: '#EFF6FF'
          },
          tabBarLabelStyle: {
            fontFamily: typography.body,
            fontSize: 12
          }
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          listeners={{
            tabPress: (event) => lockDistractionTab(event, 'Home')
          }}
          options={{ tabBarLabel: t('nav.tabs.home') }}
        />
        <Tab.Screen
          name="Earnings"
          component={EarningsScreen}
          listeners={{
            tabPress: (event) => lockDistractionTab(event, 'Earnings')
          }}
          options={{ tabBarLabel: t('nav.tabs.earnings') }}
        />
        {!simpleMode ? (
          <Tab.Screen
            name="History"
            component={HistoryScreen}
            listeners={{
              tabPress: (event) => lockDistractionTab(event, 'History')
            }}
            options={{ tabBarLabel: t('nav.tabs.history') }}
          />
        ) : null}
        <Tab.Screen
          name="Support"
          component={SupportScreen}
          listeners={{
            tabPress: (event) => lockDistractionTab(event, 'Support')
          }}
          options={{ tabBarLabel: t('nav.tabs.support') }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          listeners={{
            tabPress: (event) => lockDistractionTab(event, 'Profile')
          }}
          options={{ tabBarLabel: t('nav.tabs.profile') }}
        />
      </Tab.Navigator>
      <Modal
        animationType="fade"
        transparent
        visible={focusModalVisible}
        onRequestClose={() => setFocusModalVisible(false)}
      >
        <View style={styles.focusBackdrop}>
          <View style={styles.focusCard}>
            <Text style={styles.focusTitle}>{t('nav.focus.title')}</Text>
            <Text style={styles.focusBody}>{t('nav.focus.body')}</Text>
            <View style={styles.focusActions}>
              <Pressable
                style={styles.focusPrimary}
                onPress={() => {
                  setFocusModalVisible(false);
                }}
              >
                <Text style={styles.focusPrimaryText}>{t('nav.focus.openRide')}</Text>
              </Pressable>
              <Pressable
                style={styles.focusSecondary}
                onPress={() => {
                  setFocusModalVisible(false);
                }}
              >
                <Text style={styles.focusSecondaryText}>{t('nav.focus.support')}</Text>
              </Pressable>
            </View>
            <Text style={styles.focusHint}>{t('nav.focus.lockHint')}</Text>
          </View>
        </View>
      </Modal>
      <SupportFab />
    </>
  );
}

const styles = StyleSheet.create({
  focusBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.74)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  focusCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    padding: 18,
    gap: 10
  },
  focusTitle: {
    fontFamily: typography.heading,
    color: '#0F172A',
    fontSize: 22
  },
  focusBody: {
    fontFamily: typography.body,
    color: '#334155',
    fontSize: 14,
    lineHeight: 20
  },
  focusActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4
  },
  focusPrimary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  focusPrimaryText: {
    fontFamily: typography.bodyBold,
    color: '#EFF6FF',
    fontSize: 13
  },
  focusSecondary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  focusSecondaryText: {
    fontFamily: typography.bodyBold,
    color: '#1E3A8A',
    fontSize: 13
  },
  focusHint: {
    fontFamily: typography.body,
    color: '#475569',
    fontSize: 12
  }
});
