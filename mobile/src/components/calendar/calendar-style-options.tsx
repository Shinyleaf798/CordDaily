import { CalendarSlotThumbnails } from '@/components/calendar/calendar-style-thumbnails';
import { StyleChoiceGroup, type StyleChoice } from '@/components/ui/page-style-sheet';
import {
  CalendarLayoutLabels,
  CalendarLayoutNames,
  CalendarSlotHints,
  CalendarSlotLabels,
  CalendarSlots,
  type CalendarLayoutName,
  type CalendarSlot,
} from '@/constants/calendar-layout';
import { useCalendarStore } from '@/store/calendar.store';

const SLOT_CHOICES = Object.fromEntries(
  CalendarSlots.map((slot) => [
    slot,
    CalendarLayoutNames.map((name) => ({
      key: name,
      label: CalendarLayoutLabels[name],
      hint: CalendarSlotHints[slot][name],
      Thumbnail: CalendarSlotThumbnails[slot][name],
    })),
  ]),
) as Record<CalendarSlot, StyleChoice<CalendarLayoutName>[]>;

/** 日历「编辑」弹层的第二层：上下两半各自看图选（同首页的 HomeStyleOptions，只是没有「账单看多长」） */
export function CalendarStyleOptions() {
  const top = useCalendarStore((s) => s.top);
  const day = useCalendarStore((s) => s.day);
  const setSlot = useCalendarStore((s) => s.setSlot);

  return (
    <>
      {CalendarSlots.map((slot) => (
        <StyleChoiceGroup
          key={slot}
          title={CalendarSlotLabels[slot]}
          choices={SLOT_CHOICES[slot]}
          selected={slot === 'top' ? top : day}
          onSelect={(name) => setSlot(slot, name)}
        />
      ))}
    </>
  );
}
