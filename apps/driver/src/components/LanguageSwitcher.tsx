import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DriverLanguage } from '../i18n/translations';
import { useDriverI18n } from '../i18n/useDriverI18n';
import { colors, radius, spacing, typography } from '../theme';

const languages: DriverLanguage[] = ['en', 'hi', 'kn'];

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useDriverI18n();

  return (
    <View style={styles.row}>
      {languages.map((entry) => {
        const selected = entry === language;
        return (
          <Pressable
            key={entry}
            style={[styles.chip, selected && styles.chipActive]}
            onPress={() => setLanguage(entry)}
          >
            <Text style={[styles.text, selected && styles.textActive]}>{t(`lang.${entry}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap'
  },
  chip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  chipActive: {
    borderColor: colors.secondary,
    backgroundColor: '#EFF6FF'
  },
  text: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 12
  },
  textActive: {
    color: colors.secondary
  }
});
