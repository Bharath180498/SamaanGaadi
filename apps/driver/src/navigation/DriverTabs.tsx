import { useEffect, useRef } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Alert, Vibration } from 'react-native';
import type { DriverTabParamList } from '../types';
import { HomeScreen } from '../screens/tabs/HomeScreen';
import { EarningsScreen } from '../screens/tabs/EarningsScreen';
import { HistoryScreen } from '../screens/tabs/HistoryScreen';
import { ProfileScreen } from '../screens/tabs/ProfileScreen';
import { colors, typography } from '../theme';
import { useDriverAppStore } from '../store/useDriverAppStore';
import { useDriverUxStore } from '../store/useDriverUxStore';
import { SupportFab } from '../components/SupportFab';

const Tab = createBottomTabNavigator<DriverTabParamList>();

export function DriverTabs() {
  const bootstrap = useDriverAppStore((state) => state.bootstrap);
  const refreshJobs = useDriverAppStore((state) => state.refreshJobs);
  const refreshEarnings = useDriverAppStore((state) => state.refreshEarnings);
  const refreshSubscriptionCatalog = useDriverAppStore((state) => state.refreshSubscriptionCatalog);
  const pendingOffers = useDriverAppStore((state) => state.pendingOffers);
  const currentTopOfferId = pendingOffers[0]?.id as string | undefined;
  const lastSeenOfferId = useRef<string | undefined>(undefined);
  const isOfferTrackerReady = useRef(false);
  const simpleMode = useDriverUxStore((state) => state.simpleMode);

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
    Alert.alert('New job request', 'A nearby trip request is waiting. Open Home to accept.');
  }, [currentTopOfferId]);

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedText,
          tabBarStyle: {
            borderTopWidth: 1,
            borderTopColor: '#FAD4B4',
            backgroundColor: '#FFF8F1'
          },
          tabBarLabelStyle: {
            fontFamily: typography.body,
            fontSize: 12
          }
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Earnings" component={EarningsScreen} />
        {!simpleMode ? <Tab.Screen name="History" component={HistoryScreen} /> : null}
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
      <SupportFab />
    </>
  );
}
