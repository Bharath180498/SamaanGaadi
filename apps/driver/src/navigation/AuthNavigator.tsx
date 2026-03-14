import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../types';
import { DriverPhoneScreen } from '../screens/auth/DriverPhoneScreen';
import { DriverOtpScreen } from '../screens/auth/DriverOtpScreen';
import { useDriverI18n } from '../i18n/useDriverI18n';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  const { t } = useDriverI18n();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false
      }}
    >
      <Stack.Screen
        name="DriverPhone"
        component={DriverPhoneScreen}
        options={{
          title: t('nav.auth.signIn'),
          headerBackVisible: false
        }}
      />
      <Stack.Screen
        name="DriverOtp"
        component={DriverOtpScreen}
        options={{
          title: t('nav.auth.verifyOtp')
        }}
      />
    </Stack.Navigator>
  );
}
