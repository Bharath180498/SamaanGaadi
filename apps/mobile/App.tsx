import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts as useSoraFonts, Sora_700Bold } from '@expo-google-fonts/sora';
import {
  useFonts as useManropeFonts,
  Manrope_500Medium,
  Manrope_700Bold
} from '@expo-google-fonts/manrope';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
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

export default function App() {
  const loadingSession = useSessionStore((state) => state.loading);
  const hydrated = useSessionStore((state) => state.hydrated);
  const token = useSessionStore((state) => state.token);
  const user = useSessionStore((state) => state.user);
  const bootstrapCustomerSession = useSessionStore((state) => state.bootstrapCustomerSession);

  const [soraLoaded] = useSoraFonts({ Sora_700Bold });
  const [manropeLoaded] = useManropeFonts({ Manrope_500Medium, Manrope_700Bold });

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    void bootstrapCustomerSession();
  }, [bootstrapCustomerSession, hydrated]);

  useEffect(() => {
    if (!token || !user?.id) {
      return;
    }

    void ensureCustomerPushRegistered(user.id);
  }, [token, user?.id]);

  if (!soraLoaded || !manropeLoaded) {
    return <LoadingScreen />;
  }

  if (!hydrated || loadingSession || !token) {
    return <LoadingScreen />;
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
