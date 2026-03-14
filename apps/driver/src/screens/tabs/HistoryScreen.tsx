import { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { useDriverAppStore } from '../../store/useDriverAppStore';
import { useDriverI18n } from '../../i18n/useDriverI18n';

export function HistoryScreen() {
  const { t } = useDriverI18n();
  const earnings = useDriverAppStore((state) => state.earnings);

  const trips = useMemo(() => earnings?.recentTrips ?? [], [earnings?.recentTrips]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t('history.title')}</Text>

        {trips.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>{t('history.empty')}</Text>
          </View>
        ) : null}

        {trips.map((trip) => (
          <View key={trip.tripId} style={styles.card}>
            <Text style={styles.tripTitle}>{t('history.trip', { id: trip.tripId.slice(0, 8) })}</Text>
            <Text style={styles.tripMeta}>{t('history.order', { id: trip.orderId.slice(0, 8) })}</Text>
            <Text style={styles.tripMeta}>{t('history.fare', { value: trip.fare.toFixed(2) })}</Text>
            <Text style={styles.tripMeta}>
              {t('history.delivered', {
                value: trip.deliveredAt ? new Date(trip.deliveredAt).toLocaleString() : t('common.na')
              })}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { padding: spacing.lg, gap: spacing.md, width: '100%', maxWidth: 460, alignSelf: 'center' },
  title: { fontFamily: typography.heading, fontSize: 28, color: colors.accent },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs
  },
  empty: { fontFamily: typography.body, color: colors.mutedText },
  tripTitle: { fontFamily: typography.bodyBold, color: colors.accent },
  tripMeta: { fontFamily: typography.body, color: colors.mutedText }
});
