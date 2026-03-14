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
      colors={['#1D4ED8', '#3B82F6', '#2563EB']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <Text style={styles.brand}>QARGO INDIA</Text>
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
    color: '#BFDBFE',
    letterSpacing: 1.6
  },
  title: {
    fontFamily: typography.heading,
    fontSize: 26,
    color: colors.white
  },
  subtitle: {
    fontFamily: typography.body,
    color: '#F8FAFF'
  }
});
