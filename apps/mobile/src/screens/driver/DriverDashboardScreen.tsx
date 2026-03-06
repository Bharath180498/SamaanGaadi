import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import * as Location from 'expo-location';
import { BrandHeader } from '../../components/BrandHeader';
import { useDriverStore } from '../../store/useDriverStore';
import { colors, radius, spacing, typography } from '../../theme';
import api from '../../services/api';

const actionMap: Array<{ status: string; endpoint: string; label: string }> = [
  { status: 'ASSIGNED', endpoint: 'accept', label: 'Accept Job' },
  { status: 'DRIVER_EN_ROUTE', endpoint: 'arrived-pickup', label: 'Reached Pickup' },
  { status: 'ARRIVED_PICKUP', endpoint: 'start-loading', label: 'Start Loading Timer' },
  { status: 'LOADING', endpoint: 'start-transit', label: 'Start Trip' },
  { status: 'IN_TRANSIT', endpoint: 'complete', label: 'Complete Delivery' }
];

export function DriverDashboardScreen() {
  const {
    bootstrap,
    loading,
    availabilityStatus,
    toggleOnline,
    refreshJobs,
    refreshEarnings,
    currentJob,
    nextJob,
    updateLocation,
    earnings,
    error
  } = useDriverStore();

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshJobs();
      void refreshEarnings();
    }, 10_000);

    return () => clearInterval(timer);
  }, [refreshJobs, refreshEarnings]);

  useEffect(() => {
    const startLocationStreaming = async () => {
      if (availabilityStatus === 'OFFLINE') {
        if (locationSubscription.current) {
          locationSubscription.current.remove();
          locationSubscription.current = null;
        }
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location access needed', 'Enable location access to receive trips and share live tracking.');
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      await updateLocation(current.coords.latitude, current.coords.longitude, currentJob?.orderId);

      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 15
        },
        (position) => {
          void updateLocation(position.coords.latitude, position.coords.longitude, currentJob?.orderId);
        }
      );
    };

    void startLocationStreaming();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [availabilityStatus, currentJob?.orderId, updateLocation]);

  const activeAction = useMemo(
    () => actionMap.find((entry) => entry.status === currentJob?.status),
    [currentJob?.status]
  );

  const runTripAction = async () => {
    if (!currentJob || !activeAction) {
      return;
    }

    try {
      if (activeAction.endpoint === 'complete') {
        await api.post(`/trips/${currentJob.id}/complete`, {
          driverId: currentJob.driverId,
          distanceKm: 18,
          durationMinutes: 42
        });
      } else {
        await api.post(`/trips/${currentJob.id}/${activeAction.endpoint}`, {
          driverId: currentJob.driverId
        });
      }

      await Promise.all([refreshJobs(), refreshEarnings()]);
    } catch {
      Alert.alert('Action failed', 'Unable to update trip state. Please retry.');
    }
  };

  const triggerSos = async () => {
    if (!currentJob) {
      return;
    }

    try {
      await api.post(`/trips/${currentJob.id}/sos`, {
        driverId: currentJob.driverId
      });
      Alert.alert('SOS triggered', 'Safety alert shared with customer and control center.');
    } catch {
      Alert.alert('SOS failed', 'Could not trigger SOS. Retry immediately.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <BrandHeader
          title="Driver Command"
          subtitle="Live jobs, queued assignments, waiting-charge automation, and earnings in one view."
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Status: {availabilityStatus ?? 'OFFLINE'}</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.toggleButton, styles.onlineButton]}
              onPress={() => void toggleOnline('ONLINE')}
            >
              <Text style={styles.toggleText}>Go Online</Text>
            </Pressable>
            <Pressable
              style={[styles.toggleButton, styles.offlineButton]}
              onPress={() => void toggleOnline('OFFLINE')}
            >
              <Text style={[styles.toggleText, { color: colors.accent }]}>Go Offline</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.earningsCard}>
          <Text style={styles.earningsTitle}>Earnings (30d)</Text>
          {earnings ? (
            <>
              <Text style={styles.earningsValue}>INR {earnings.summary.netPayout.toFixed(2)}</Text>
              <Text style={styles.earningsMeta}>
                Trips: {earnings.tripCount} • Gross: INR {earnings.summary.grossFare.toFixed(2)} • Waiting:{' '}
                INR {earnings.summary.waitingCharges.toFixed(2)}
              </Text>
            </>
          ) : (
            <Text style={styles.earningsMeta}>No earnings data yet.</Text>
          )}
        </View>

        <View style={styles.jobCard}>
          <Text style={styles.jobTitle}>Current Job</Text>
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
          {currentJob ? (
            <>
              <Text style={styles.jobText}>Trip: {currentJob.id}</Text>
              <Text style={styles.jobText}>Order: {currentJob.orderId}</Text>
              <Text style={styles.jobText}>Pickup: {currentJob.order?.pickupAddress}</Text>
              <Text style={styles.jobText}>Drop: {currentJob.order?.dropAddress}</Text>
              <Text style={styles.jobText}>Stage: {currentJob.status}</Text>

              {activeAction ? (
                <Pressable style={styles.actionButton} onPress={() => void runTripAction()}>
                  <Text style={styles.actionText}>{activeAction.label}</Text>
                </Pressable>
              ) : null}

              <Pressable style={styles.sosButton} onPress={() => void triggerSos()}>
                <Text style={styles.sosText}>SOS</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.jobText}>No current trip</Text>
          )}
        </View>

        <View style={styles.jobCard}>
          <Text style={styles.jobTitle}>Next Job (Queued)</Text>
          {nextJob ? (
            <>
              <Text style={styles.jobText}>Order: {nextJob.id}</Text>
              <Text style={styles.jobText}>Pickup: {nextJob.pickupAddress}</Text>
              <Text style={styles.jobText}>Drop: {nextJob.dropAddress}</Text>
              <Text style={styles.jobText}>Vehicle: {nextJob.vehicleType}</Text>
            </>
          ) : (
            <Text style={styles.jobText}>No queued job</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper
  },
  container: {
    padding: spacing.lg,
    gap: spacing.lg
  },
  error: {
    fontFamily: typography.body,
    color: colors.danger
  },
  statusCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm
  },
  statusTitle: {
    fontFamily: typography.heading,
    color: colors.accent
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  toggleButton: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center'
  },
  onlineButton: {
    backgroundColor: colors.secondary
  },
  offlineButton: {
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FDBA74'
  },
  toggleText: {
    color: colors.white,
    fontFamily: typography.bodyBold
  },
  earningsCard: {
    backgroundColor: '#FFF1E7',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FDBA74',
    padding: spacing.md,
    gap: 4
  },
  earningsTitle: {
    fontFamily: typography.bodyBold,
    color: colors.accent
  },
  earningsValue: {
    fontFamily: typography.heading,
    fontSize: 28,
    color: colors.primary
  },
  earningsMeta: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 12
  },
  jobCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs
  },
  jobTitle: {
    fontFamily: typography.heading,
    color: colors.accent,
    marginBottom: spacing.xs
  },
  jobText: {
    fontFamily: typography.body,
    color: colors.mutedText
  },
  actionButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center'
  },
  actionText: {
    color: colors.white,
    fontFamily: typography.bodyBold
  },
  sosButton: {
    marginTop: spacing.xs,
    backgroundColor: '#DC2626',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center'
  },
  sosText: {
    color: colors.white,
    fontFamily: typography.bodyBold
  }
});
