import { useEffect, useMemo, useRef, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View
} from 'react-native';
import type { DriverTabParamList } from '../types';
import { HomeScreen } from '../screens/tabs/HomeScreen';
import { EarningsScreen } from '../screens/tabs/EarningsScreen';
import { HistoryScreen } from '../screens/tabs/HistoryScreen';
import { ProfileScreen } from '../screens/tabs/ProfileScreen';
import { SupportScreen } from '../screens/tabs/SupportScreen';
import { colors, typography } from '../theme';
import { useDriverAppStore } from '../store/useDriverAppStore';
import { useDriverSessionStore } from '../store/useDriverSessionStore';
import { useDriverUxStore } from '../store/useDriverUxStore';
import { SupportFab } from '../components/SupportFab';
import { useDriverI18n } from '../i18n/useDriverI18n';

const Tab = createBottomTabNavigator<DriverTabParamList>();
type TabPressEvent = {
  preventDefault: () => void;
  defaultPrevented?: boolean;
};
const TOUR_TAB_SEQUENCE: Array<keyof DriverTabParamList> = ['Home', 'Earnings', 'Support', 'Profile'];

export function DriverTabs() {
  const { t } = useDriverI18n();
  const { width: windowWidth } = useWindowDimensions();
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
  const [verifiedCelebrationVisible, setVerifiedCelebrationVisible] = useState(false);
  const [tourVisible, setTourVisible] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const lastFocusedTripId = useRef<string | undefined>(undefined);
  const tourAdvanceLockRef = useRef<number | null>(null);
  const tourAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simpleMode = useDriverUxStore((state) => state.simpleMode);
  const onboardingStatus = useDriverSessionStore((state) => state.onboardingStatus);
  const hasSeenVerifiedCelebration = useDriverUxStore((state) => state.hasSeenVerifiedCelebration);
  const markVerifiedCelebrationSeen = useDriverUxStore((state) => state.markVerifiedCelebrationSeen);
  const hasCompletedFirstTour = useDriverUxStore((state) => state.hasCompletedFirstTour);
  const completeFirstTour = useDriverUxStore((state) => state.completeFirstTour);
  const tourReplayRequested = useDriverUxStore((state) => state.tourReplayRequested);
  const clearTourReplay = useDriverUxStore((state) => state.clearTourReplay);
  const currentJobId = typeof currentJob?.id === 'string' ? currentJob.id : undefined;
  const currentJobStatus = String(currentJob?.status ?? '').toUpperCase();
  const tourPulse = useRef(new Animated.Value(0)).current;
  const tourSteps = useMemo(
    () => [
      {
        id: 'home',
        tabName: 'Home' as keyof DriverTabParamList,
        tabLabel: t('nav.tabs.home'),
        title: t('tour.step.home.title'),
        body: t('tour.step.home.body')
      },
      {
        id: 'earnings',
        tabName: 'Earnings' as keyof DriverTabParamList,
        tabLabel: t('nav.tabs.earnings'),
        title: t('tour.step.earnings.title'),
        body: t('tour.step.earnings.body')
      },
      {
        id: 'support',
        tabName: 'Support' as keyof DriverTabParamList,
        tabLabel: t('nav.tabs.support'),
        title: t('tour.step.support.title'),
        body: t('tour.step.support.body')
      },
      {
        id: 'profile',
        tabName: 'Profile' as keyof DriverTabParamList,
        tabLabel: t('nav.tabs.profile'),
        title: t('tour.step.profile.title'),
        body: t('tour.step.profile.body')
      }
    ],
    [t]
  );
  const tripFocusModeEnabled = Boolean(
    currentJobId && currentJobStatus !== 'COMPLETED' && currentJobStatus !== 'CANCELLED'
  );
  const activeTourStep = tourSteps[tourStepIndex] ?? tourSteps[0];
  const requiredTourTab = TOUR_TAB_SEQUENCE[tourStepIndex] ?? TOUR_TAB_SEQUENCE[0];
  const visibleTabOrder = useMemo<Array<keyof DriverTabParamList>>(
    () => (simpleMode ? ['Home', 'Earnings', 'Support', 'Profile'] : ['Home', 'Earnings', 'History', 'Support', 'Profile']),
    [simpleMode]
  );
  const targetTabIndex = Math.max(0, visibleTabOrder.indexOf(requiredTourTab));
  const tabSlotWidth = windowWidth / Math.max(visibleTabOrder.length, 1);
  const targetTabCenterX = tabSlotWidth * targetTabIndex + tabSlotWidth / 2;
  const tourHighlightSize = 74;
  const tourHighlightLeft = Math.max(
    12,
    Math.min(windowWidth - tourHighlightSize - 12, targetTabCenterX - tourHighlightSize / 2)
  );
  const tourTooltipWidth = Math.min(windowWidth - 24, 340);
  const tourTooltipLeft = Math.max(
    12,
    Math.min(windowWidth - tourTooltipWidth - 12, targetTabCenterX - tourTooltipWidth / 2)
  );
  const tourArrowLeft = Math.max(18, Math.min(tourTooltipWidth - 18, targetTabCenterX - tourTooltipLeft));

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

  useEffect(() => {
    if (onboardingStatus !== 'APPROVED') {
      return;
    }

    if (!hasSeenVerifiedCelebration) {
      setVerifiedCelebrationVisible(true);
      return;
    }

    if (!hasCompletedFirstTour || tourReplayRequested) {
      setTourStepIndex(0);
      setTourVisible(true);
      if (tourReplayRequested) {
        clearTourReplay();
      }
    }
  }, [
    clearTourReplay,
    hasCompletedFirstTour,
    hasSeenVerifiedCelebration,
    onboardingStatus,
    tourReplayRequested
  ]);

  useEffect(() => {
    if (!tourVisible) {
      tourAdvanceLockRef.current = null;
      if (tourAdvanceTimerRef.current) {
        clearTimeout(tourAdvanceTimerRef.current);
        tourAdvanceTimerRef.current = null;
      }
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(tourPulse, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(tourPulse, {
          toValue: 0,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    );
    animation.start();

    return () => {
      animation.stop();
      tourPulse.setValue(0);
    };
  }, [tourPulse, tourVisible]);

  useEffect(() => {
    return () => {
      if (tourAdvanceTimerRef.current) {
        clearTimeout(tourAdvanceTimerRef.current);
      }
    };
  }, []);

  const lockDistractionTab = (
    event: TabPressEvent,
    tabName: keyof DriverTabParamList
  ) => {
    if (!tripFocusModeEnabled) {
      return false;
    }
    if (tabName === 'Home' || tabName === 'Support') {
      return false;
    }
    event.preventDefault();
    setFocusModalVisible(true);
    return true;
  };

  const pulseScale = tourPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12]
  });
  const pulseOpacity = tourPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1]
  });
  const completeTour = () => {
    completeFirstTour();
    clearTourReplay();
    setTourVisible(false);
    setTourStepIndex(0);
  };
  const handleTabPress = (event: TabPressEvent, tabName: keyof DriverTabParamList) => {
    if (lockDistractionTab(event, tabName)) {
      return;
    }

    if (!tourVisible) {
      return;
    }

    if (tabName !== requiredTourTab) {
      event.preventDefault();
      return;
    }

    if (tourAdvanceLockRef.current === tourStepIndex) {
      return;
    }

    tourAdvanceLockRef.current = tourStepIndex;
    if (tourAdvanceTimerRef.current) {
      clearTimeout(tourAdvanceTimerRef.current);
    }
    const stepAtPress = tourStepIndex;
    tourAdvanceTimerRef.current = setTimeout(() => {
      if (stepAtPress >= TOUR_TAB_SEQUENCE.length - 1) {
        completeTour();
      } else {
        setTourStepIndex(stepAtPress + 1);
      }
      tourAdvanceLockRef.current = null;
      tourAdvanceTimerRef.current = null;
    }, 220);
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
            tabPress: (event) => handleTabPress(event, 'Home')
          }}
          options={{ tabBarLabel: t('nav.tabs.home') }}
        />
        <Tab.Screen
          name="Earnings"
          component={EarningsScreen}
          listeners={{
            tabPress: (event) => handleTabPress(event, 'Earnings')
          }}
          options={{ tabBarLabel: t('nav.tabs.earnings') }}
        />
        {!simpleMode ? (
          <Tab.Screen
            name="History"
            component={HistoryScreen}
            listeners={{
              tabPress: (event) => handleTabPress(event, 'History')
            }}
            options={{ tabBarLabel: t('nav.tabs.history') }}
          />
        ) : null}
        <Tab.Screen
          name="Support"
          component={SupportScreen}
          listeners={{
            tabPress: (event) => handleTabPress(event, 'Support')
          }}
          options={{ tabBarLabel: t('nav.tabs.support') }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          listeners={{
            tabPress: (event) => handleTabPress(event, 'Profile')
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
      <Modal
        animationType="fade"
        transparent
        visible={verifiedCelebrationVisible}
        onRequestClose={() => setVerifiedCelebrationVisible(false)}
      >
        <View style={styles.verifyBackdrop}>
          <View style={styles.verifyCard}>
            <Text style={styles.verifyBadge}>{t('tour.verified.badge')}</Text>
            <Text style={styles.verifyTitle}>{t('tour.verified.title')}</Text>
            <Text style={styles.verifyBody}>{t('tour.verified.body')}</Text>
            <Pressable
              style={styles.verifyPrimary}
              onPress={() => {
                markVerifiedCelebrationSeen();
                setVerifiedCelebrationVisible(false);
                if (!hasCompletedFirstTour) {
                  setTourStepIndex(0);
                  setTourVisible(true);
                }
              }}
            >
              <Text style={styles.verifyPrimaryText}>{t('tour.verified.startAction')}</Text>
            </Pressable>
            <Pressable
              style={styles.verifySecondary}
              onPress={() => {
                markVerifiedCelebrationSeen();
                completeFirstTour();
                setVerifiedCelebrationVisible(false);
              }}
            >
              <Text style={styles.verifySecondaryText}>{t('tour.verified.skipAction')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {tourVisible ? (
        <View pointerEvents="box-none" style={styles.tourOverlayRoot}>
          <View pointerEvents="none" style={styles.tourDimmer} />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.tourHighlightRing,
              {
                left: tourHighlightLeft,
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity
              }
            ]}
          />

          <View
            pointerEvents="none"
            style={[styles.tourTooltip, { width: tourTooltipWidth, left: tourTooltipLeft }]}
          >
            <Text style={styles.tourStepCounter}>
              {t('tour.progress', { step: tourStepIndex + 1, total: tourSteps.length })}
            </Text>
            <Text style={styles.tourTitle}>{activeTourStep?.title}</Text>
            <Text style={styles.tourBody}>{activeTourStep?.body}</Text>
            <Text style={styles.tourTapHint}>
              {t('tour.tapHint', { tab: activeTourStep?.tabLabel ?? '' })}
            </Text>
            <View style={[styles.tourArrow, { left: tourArrowLeft - 10 }]} />
          </View>

          <View style={styles.tourSkipWrap} pointerEvents="box-none">
            <Pressable style={styles.tourSkipButton} onPress={completeTour}>
              <Text style={styles.tourSkipButtonText}>{t('tour.skip')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
  },
  verifyBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  verifyCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#0EA5E9',
    backgroundColor: '#F0F9FF',
    padding: 20,
    gap: 10
  },
  verifyBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#67E8F9',
    backgroundColor: '#ECFEFF',
    color: '#0E7490',
    fontFamily: typography.bodyBold,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  verifyTitle: {
    fontFamily: typography.heading,
    color: '#0C4A6E',
    fontSize: 24
  },
  verifyBody: {
    fontFamily: typography.body,
    color: '#0F172A',
    fontSize: 14,
    lineHeight: 20
  },
  verifyPrimary: {
    marginTop: 8,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7'
  },
  verifyPrimaryText: {
    fontFamily: typography.bodyBold,
    color: '#F8FAFC'
  },
  verifySecondary: {
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#7DD3FC',
    backgroundColor: '#FFFFFF'
  },
  verifySecondaryText: {
    fontFamily: typography.bodyBold,
    color: '#0C4A6E'
  },
  tourOverlayRoot: {
    ...StyleSheet.absoluteFillObject
  },
  tourDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.52)'
  },
  tourHighlightRing: {
    position: 'absolute',
    bottom: 10,
    width: 74,
    height: 74,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#FDE68A',
    backgroundColor: 'rgba(251, 191, 36, 0.2)'
  },
  tourTooltip: {
    position: 'absolute',
    bottom: 126,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
    padding: 16,
    gap: 8
  },
  tourStepCounter: {
    fontFamily: typography.bodyBold,
    color: '#1D4ED8',
    fontSize: 12
  },
  tourTitle: {
    fontFamily: typography.heading,
    color: '#0F172A',
    fontSize: 22
  },
  tourBody: {
    fontFamily: typography.body,
    color: '#334155',
    fontSize: 14,
    lineHeight: 20
  },
  tourTapHint: {
    marginTop: 2,
    fontFamily: typography.bodyBold,
    color: '#1E3A8A',
    fontSize: 13
  },
  tourArrow: {
    position: 'absolute',
    bottom: -12,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#EFF6FF'
  },
  tourSkipWrap: {
    position: 'absolute',
    top: 74,
    right: 14
  },
  tourSkipButton: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  tourSkipButtonText: {
    fontFamily: typography.bodyBold,
    color: '#1E3A8A'
  }
});
