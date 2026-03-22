import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts as useSoraFonts, Sora_700Bold } from '@expo-google-fonts/sora';
import {
  useFonts as useManropeFonts,
  Manrope_500Medium,
  Manrope_700Bold
} from '@expo-google-fonts/manrope';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { io } from 'socket.io-client';
import { CustomerHomeScreen } from './src/screens/customer/CustomerHomeScreen';
import { CustomerRidesScreen } from './src/screens/customer/CustomerRidesScreen';
import { CustomerRideDetailsScreen } from './src/screens/customer/CustomerRideDetailsScreen';
import { CustomerProfileScreen } from './src/screens/customer/CustomerProfileScreen';
import { CustomerPickupConfirmScreen } from './src/screens/customer/CustomerPickupConfirmScreen';
import { CustomerTripSelectScreen } from './src/screens/customer/CustomerTripSelectScreen';
import { CustomerShipmentDetailsScreen } from './src/screens/customer/CustomerShipmentDetailsScreen';
import { CustomerTrackingScreen } from './src/screens/customer/CustomerTrackingScreen';
import { CustomerPaymentScreen } from './src/screens/customer/CustomerPaymentScreen';
import { CustomerSupportScreen } from './src/screens/customer/CustomerSupportScreen';
import { useSessionStore } from './src/store/useSessionStore';
import { useCustomerStore } from './src/store/useCustomerStore';
import { REALTIME_BASE_URL } from './src/services/api';
import { ensureCustomerPushRegistered } from './src/services/pushNotifications';
import { colors } from './src/theme';
import type { RootStackParamList } from './src/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.paper
      }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function SessionErrorScreen({
  message,
  onRetry
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.paper,
        paddingHorizontal: 24,
        gap: 12
      }}
    >
      <Text
        style={{
          fontFamily: 'Manrope_700Bold',
          fontSize: 18,
          color: colors.accent,
          textAlign: 'center'
        }}
      >
        Could not start customer session
      </Text>
      <Text
        style={{
          fontFamily: 'Manrope_500Medium',
          fontSize: 14,
          color: colors.mutedText,
          textAlign: 'center'
        }}
      >
        {message ?? 'Please check backend connectivity and retry.'}
      </Text>
      <Pressable
        style={{
          marginTop: 4,
          minWidth: 160,
          minHeight: 44,
          borderRadius: 12,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 16,
          paddingVertical: 10
        }}
        onPress={onRetry}
      >
        <Text
          style={{
            fontFamily: 'Manrope_700Bold',
            color: colors.white,
            fontSize: 14
          }}
        >
          Retry
        </Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  const loadingSession = useSessionStore((state) => state.loading);
  const hydrated = useSessionStore((state) => state.hydrated);
  const token = useSessionStore((state) => state.token);
  const user = useSessionStore((state) => state.user);
  const sessionError = useSessionStore((state) => state.error);
  const markHydrated = useSessionStore((state) => state.markHydrated);
  const bootstrapCustomerSession = useSessionStore((state) => state.bootstrapCustomerSession);
  const activeOrderId = useCustomerStore((state) => state.activeOrderId);
  const syncActiveOrder = useCustomerStore((state) => state.syncActiveOrder);
  const refreshOrder = useCustomerStore((state) => state.refreshOrder);

  const [soraLoaded, soraError] = useSoraFonts({ Sora_700Bold });
  const [manropeLoaded, manropeError] = useManropeFonts({ Manrope_500Medium, Manrope_700Bold });

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    void bootstrapCustomerSession();
  }, [bootstrapCustomerSession, hydrated]);

  useEffect(() => {
    if (hydrated) {
      return;
    }

    const timer = setTimeout(() => {
      if (!useSessionStore.getState().hydrated) {
        markHydrated();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [hydrated, markHydrated]);

  useEffect(() => {
    if (!token || !user?.id) {
      return;
    }

    void ensureCustomerPushRegistered(user.id);
  }, [token, user?.id]);

  useEffect(() => {
    if (!token || !user?.id) {
      return;
    }

    let cancelled = false;

    const syncSnapshot = async () => {
      if (cancelled) {
        return;
      }

      try {
        await syncActiveOrder();
        await refreshOrder();
      } catch {
        // Keep UI responsive; next sync tick will retry.
      }
    };

    void syncSnapshot();
    const interval = setInterval(() => {
      void syncSnapshot();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshOrder, syncActiveOrder, token, user?.id]);

  useEffect(() => {
    if (!token || !activeOrderId) {
      return;
    }

    const socket = io(`${REALTIME_BASE_URL}/realtime`, {
      transports: ['websocket'],
      timeout: 7000
    });

    let refreshInFlight = false;
    let refreshQueued = false;

    const refreshSnapshot = async () => {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      refreshInFlight = true;
      try {
        await refreshOrder();
      } finally {
        refreshInFlight = false;
        if (refreshQueued) {
          refreshQueued = false;
          void refreshSnapshot();
        }
      }
    };

    const subscribeToOrder = () => {
      socket.emit('subscribe:order', { orderId: activeOrderId });
    };

    socket.on('connect', subscribeToOrder);
    subscribeToOrder();

    const tripEvents = [
      'trip:driver-en-route',
      'trip:arrived-pickup',
      'trip:loading-started',
      'trip:in-transit',
      'trip:completed',
      'trip:customer-cancelled'
    ] as const;

    tripEvents.forEach((eventName) => {
      socket.on(eventName, () => {
        void refreshSnapshot();
      });
    });

    const fallbackInterval = setInterval(() => {
      void refreshSnapshot();
    }, 10000);

    return () => {
      clearInterval(fallbackInterval);
      socket.disconnect();
    };
  }, [activeOrderId, refreshOrder, token]);

  const fontsReady = (soraLoaded || Boolean(soraError)) && (manropeLoaded || Boolean(manropeError));

  if (!fontsReady) {
    return <LoadingScreen />;
  }

  if (!hydrated || loadingSession) {
    return <LoadingScreen />;
  }

  if (!token) {
    return <SessionErrorScreen message={sessionError} onRetry={() => void bootstrapCustomerSession()} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="CustomerHome"
        screenOptions={{
          headerShown: false,
          gestureEnabled: false
        }}
      >
        <Stack.Screen name="CustomerHome" component={CustomerHomeScreen} />
        <Stack.Screen name="CustomerRides" component={CustomerRidesScreen} />
        <Stack.Screen name="CustomerRideDetails" component={CustomerRideDetailsScreen} />
        <Stack.Screen name="CustomerProfile" component={CustomerProfileScreen} />
        <Stack.Screen name="CustomerPickupConfirm" component={CustomerPickupConfirmScreen} />
        <Stack.Screen name="CustomerTripSelect" component={CustomerTripSelectScreen} />
        <Stack.Screen
          name="CustomerShipmentDetails"
          component={CustomerShipmentDetailsScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="CustomerTracking" component={CustomerTrackingScreen} />
        <Stack.Screen
          name="CustomerPayment"
          component={CustomerPaymentScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="CustomerSupport"
          component={CustomerSupportScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
