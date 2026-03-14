import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../types';
import { OnboardingProfileScreen } from '../screens/onboarding/OnboardingProfileScreen';
import { OnboardingVehicleScreen } from '../screens/onboarding/OnboardingVehicleScreen';
import { OnboardingBankScreen } from '../screens/onboarding/OnboardingBankScreen';
import { OnboardingDocumentsScreen } from '../screens/onboarding/OnboardingDocumentsScreen';
import { OnboardingStatusScreen } from '../screens/onboarding/OnboardingStatusScreen';
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
      <Stack.Screen
        name="OnboardingBank"
        component={OnboardingBankScreen}
        options={{ title: t('nav.onboarding.payout') }}
      />
      <Stack.Screen
        name="OnboardingDocuments"
        component={OnboardingDocumentsScreen}
        options={{ title: t('nav.onboarding.documents') }}
      />
      <Stack.Screen
        name="OnboardingStatus"
        component={OnboardingStatusScreen}
        options={{ title: t('nav.onboarding.status') }}
      />
    </Stack.Navigator>
  );
}
