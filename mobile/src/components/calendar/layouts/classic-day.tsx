import { StyleSheet, View } from 'react-native';

import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail';
import type { CalendarDayProps } from '@/components/calendar/layouts/types';
import { ThemedText } from '@/components/ui/themed-text';

/** 下半 · 经典：当天一张卡（跟首页的"当天卡片"同一个长相，见 CalendarDayDetail） */
export function ClassicDay({ selection, onSelectTransaction }: CalendarDayProps) {
  if (!selection) {
    return (
      <View style={styles.hint}>
        <ThemedText themeColor="textSecondary" style={styles.hintText}>
          点一天查看当天账单
        </ThemedText>
      </View>
    );
  }
  return <CalendarDayDetail selection={selection} onSelectTransaction={onSelectTransaction} />;
}

const styles = StyleSheet.create({
  hint: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
});
