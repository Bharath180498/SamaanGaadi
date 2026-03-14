import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useDriverI18n } from '../i18n/useDriverI18n';
import { radius, spacing, typography } from '../theme';
import type { DriverTabParamList } from '../types';

export function SupportFab() {
  const { t } = useDriverI18n();
  const navigation = useNavigation<BottomTabNavigationProp<DriverTabParamList>>();

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Pressable style={styles.button} onPress={() => navigation.navigate('Support')}>
        <Text style={styles.title}>{t('home.support')}</Text>
        <Text style={styles.sub}>{t('home.supportSub')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    right: spacing.md,
    bottom: 86,
    zIndex: 40
  },
  button: {
    borderRadius: radius.md,
    backgroundColor: '#0F172A',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 168,
    alignItems: 'center'
  },
  title: {
    color: '#EFF6FF',
    fontFamily: typography.bodyBold,
    fontSize: 12
  },
  sub: {
    marginTop: 2,
    color: '#93C5FD',
    fontFamily: typography.body,
    fontSize: 11
  }
});
