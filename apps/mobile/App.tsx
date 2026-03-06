import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts as useSoraFonts, Sora_700Bold } from '@expo-google-fonts/sora';
import {
  useFonts as useManropeFonts,
  Manrope_500Medium,
  Manrope_700Bold
} from '@expo-google-fonts/manrope';
import { ActivityIndicator, View } from 'react-native';
import { RoleSelectionScreen } from './src/screens/shared/RoleSelectionScreen';
import { CustomerHomeScreen } from './src/screens/customer/CustomerHomeScreen';
import { CustomerPickupConfirmScreen } from './src/screens/customer/CustomerPickupConfirmScreen';
import { CustomerTripSelectScreen } from './src/screens/customer/CustomerTripSelectScreen';
import { CustomerShipmentDetailsScreen } from './src/screens/customer/CustomerShipmentDetailsScreen';
import { CustomerTrackingScreen } from './src/screens/customer/CustomerTrackingScreen';
import { CustomerPaymentScreen } from './src/screens/customer/CustomerPaymentScreen';
import { DriverDashboardScreen } from './src/screens/driver/DriverDashboardScreen';
import { useSessionStore } from './src/store/useSessionStore';
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
  const role = useSessionStore((state) => state.role);

  const [soraLoaded] = useSoraFonts({ Sora_700Bold });
  const [manropeLoaded] = useManropeFonts({ Manrope_500Medium, Manrope_700Bold });

  if (!soraLoaded || !manropeLoaded) {
    return <LoadingScreen />;
  }

  if (!role) {
    return <RoleSelectionScreen />;
  }

  if (role === 'CUSTOMER') {
    return (
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="CustomerHome"
          screenOptions={{
            headerShown: false,
            animation: 'fade'
          }}
        >
          <Stack.Screen name="CustomerHome" component={CustomerHomeScreen} />
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
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="DriverDashboard"
        screenOptions={{
          headerShown: false,
          animation: 'fade'
        }}
      >
        <Stack.Screen name="DriverDashboard" component={DriverDashboardScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
