import { HomeSlotThumbnails } from '@/components/home/home-style-thumbnails';
import { StyleChoiceGroup, StyleOptionGroup, type StyleChoice } from '@/components/ui/page-style-sheet';
import {
  HomeLayoutLabels,
  HomeLayoutNames,
  HomeSlotHints,
  HomeSlotLabels,
  HomeSlots,
  type HomeLayoutName,
  type HomeSlot,
} from '@/constants/home-layout';
import { HomeRangeLabels, HomeRanges } from '@/constants/home-range';
import { useHomeStore } from '@/store/home.store';

/** 上半、下半各自的两张图卡。按段分开，因为同一个「金环」在两段里画的是两样东西（见 HomeSlotHints） */
const SLOT_CHOICES: Record<HomeSlot, StyleChoice<HomeLayoutName>[]> = Object.fromEntries(
  HomeSlots.map((slot) => [
    slot,
    HomeLayoutNames.map((name) => ({
      key: name,
      label: HomeLayoutLabels[name],
      hint: HomeSlotHints[slot][name],
      Thumbnail: HomeSlotThumbnails[slot][name],
    })),
  ]),
) as Record<HomeSlot, StyleChoice<HomeLayoutName>[]>;

/**
 * 首页「编辑」弹层的第二层：上下两段各用哪种画法 + 账单看多长。
 * 原来是「我的 → 首页设置」那一整页（已删），内容一样，只是挪进了弹层。
 *
 * 两段用跟第一层同样的图卡，不用胶囊：只写「节奏条 / 金环」三个字，没见过的人猜不出
 * 那一段会变成什么样；一张小图一眼就看懂。账单看多长没有图可画，还是胶囊
 */
export function HomeStyleOptions() {
  const top = useHomeStore((s) => s.top);
  const bills = useHomeStore((s) => s.bills);
  const range = useHomeStore((s) => s.range);
  const setSlot = useHomeStore((s) => s.setSlot);
  const setRange = useHomeStore((s) => s.setRange);

  return (
    <>
      <StyleChoiceGroup
        title={HomeSlotLabels.top}
        choices={SLOT_CHOICES.top}
        selected={top}
        onSelect={(name) => setSlot('top', name)}
      />
      <StyleChoiceGroup
        title={HomeSlotLabels.bills}
        choices={SLOT_CHOICES.bills}
        selected={bills}
        onSelect={(name) => setSlot('bills', name)}
      />
      <StyleOptionGroup
        title="账单看多长"
        values={HomeRanges}
        labels={HomeRangeLabels}
        selected={range}
        onSelect={setRange}
      />
    </>
  );
}
