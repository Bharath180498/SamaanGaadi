import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../types';
import { OnboardingProfileScreen } from '../screens/onboarding/OnboardingProfileScreen';
import { OnboardingVehicleScreen } from '../screens/onboarding/OnboardingVehicleScreen';
import { useDriverI18n } from '../i18n/useDriverI18n';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingNavigator() {
  const { t } = useDriverI18n();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false
      }}
    >
      <Stack.Screen
        name="OnboardingProfile"
        component={OnboardingProfileScreen}
        options={{
          title: t('nav.onboarding.profile'),
          headerBackVisible: false
        }}
      />
      <Stack.Screen
        name="OnboardingVehicle"
        component={OnboardingVehicleScreen}
        options={{ title: t('nav.onboarding.vehicle') }}
      />
    </Stack.Navigator>
  );
}
