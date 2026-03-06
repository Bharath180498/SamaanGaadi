import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, typography, radius } from '../theme';

interface BrandHeaderProps {
  title: string;
  subtitle: string;
}

export function BrandHeader({ title, subtitle }: BrandHeaderProps) {
  return (
    <LinearGradient
      colors={['#F97316', '#FB923C', '#0F766E']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <Text style={styles.brand}>PORTERX BHARAT</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    shadowColor: '#7C2D12',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  brand: {
    fontFamily: typography.bodyBold,
    fontSize: 11,
    color: '#FED7AA',
    letterSpacing: 1.6
  },
  title: {
    fontFamily: typography.heading,
    fontSize: 26,
    color: colors.white
  },
  subtitle: {
    fontFamily: typography.body,
    color: '#FFF7ED'
  }
});
