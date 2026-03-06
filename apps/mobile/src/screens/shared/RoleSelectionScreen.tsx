import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSessionStore } from '../../store/useSessionStore';
import { API_BASE_URL } from '../../services/api';
import { colors, radius, spacing, typography } from '../../theme';
import { BrandHeader } from '../../components/BrandHeader';

const roleItems = [
  { role: 'CUSTOMER', title: 'Book a Delivery', description: 'Create and track shipments in real time.' },
  { role: 'DRIVER', title: 'Drive & Earn', description: 'Accept jobs, chain trips, and maximize earnings.' }
] as const;

export function RoleSelectionScreen() {
  const login = useSessionStore((state) => state.login);
  const loading = useSessionStore((state) => state.loading);
  const error = useSessionStore((state) => state.error);

  const onSelectRole = async (role: 'CUSTOMER' | 'DRIVER') => {
    try {
      await login(role);
    } catch {
      Alert.alert(
        'Unable to continue',
        `Backend is unreachable at ${API_BASE_URL}. Make sure API server, Postgres, and Redis are running.`
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <BrandHeader title="Logistics That Moves" subtitle="Fast dispatch. Smart utilization. Seamless delivery." />

        <View style={styles.roleGrid}>
          {roleItems.map((item) => (
            <Pressable
              key={item.role}
              style={({ pressed }) => [styles.roleCard, pressed && styles.roleCardPressed]}
              onPress={() => void onSelectRole(item.role)}
              disabled={loading}
            >
              <Text style={styles.roleTitle}>{item.title}</Text>
              <Text style={styles.roleDescription}>{item.description}</Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        <Text style={styles.debugText}>API: {API_BASE_URL}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper
  },
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg,
    justifyContent: 'center'
  },
  roleGrid: {
    gap: spacing.md
  },
  roleCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#7C2D12',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 3
  },
  roleCardPressed: {
    transform: [{ scale: 0.98 }]
  },
  roleTitle: {
    fontFamily: typography.heading,
    color: colors.accent,
    fontSize: 22
  },
  roleDescription: {
    fontFamily: typography.body,
    color: colors.mutedText
  },
  errorText: {
    fontFamily: typography.body,
    color: colors.danger,
    textAlign: 'center'
  },
  debugText: {
    fontFamily: typography.body,
    color: colors.mutedText,
    textAlign: 'center',
    fontSize: 14
  }
});
