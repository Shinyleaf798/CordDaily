import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { ThemedText } from '@/components/ui/themed-text';
import {
  BUILTIN_CATEGORY_ICONS,
  EMOJI_CATEGORY_ICONS,
  builtinIconRef,
  customIconRef,
  parseCategoryIcon,
} from '@/constants/category-icons';
import { Spacing } from '@/constants/theme';
import {
  listCustomIconFiles,
  pickCustomCategoryIcon,
  pickCustomCategoryIconFromFile,
} from '@/db/category-icon-files';
import { useTheme } from '@/hooks/use-theme';

type IconTab = 'builtin' | 'mine' | 'emoji';

/**
 * 每一页顶上那句话回答的都是同一个问题：**这一页的图从哪来、跟着不跟着我走。**
 *
 * 三页看上去都是一格一格的方块，差别全在看不见的地方——换手机之后还在不在、
 * 备份包里带不带得走、在别人手机上长相一不一样。不写出来的话，用户挑图标时
 * 唯一的依据就是"哪个好看"，而三者在这几件事上的表现差得很远。
 */
const TABS: { key: IconTab; label: string; hint: string }[] = [
  {
    key: 'builtin',
    label: '内置图标',
    hint: '跟 App 一起打包的图。换手机、从备份恢复，它们都还在',
  },
  {
    key: 'mine',
    label: '我的图片',
    hint: '你自己的图，会缩小存一份、原图不动，备份时跟着账单一起走。下载来的图要走「文件」，相册看不见 Download',
  },
  {
    key: 'emoji',
    label: '表情',
    hint: '系统字体里的字符，不占地方、备份里只是一个符号。换一台手机长相可能略有不同',
  },
];

/**
 * 一个 icon 值属于哪一页。打开选择器时直接落在它所在的那一页——
 * 用户想换掉一个表情，多半还想换成另一个表情。
 *
 * 空串（还没选）落在内置：那是三页里最可能有用户要的东西的一页。
 * `file` 那种早期的绝对路径归到「我的图片」——它本来就是用户自己的图。
 */
function tabOf(icon: string): IconTab {
  if (!icon) return 'builtin';
  const source = parseCategoryIcon(icon);
  if (source.kind === 'custom' || source.kind === 'file') return 'mine';
  if (source.kind === 'emoji') return 'emoji';
  return 'builtin';
}

type CategoryIconPickerProps = {
  /** 当前选中的 icon 字符串，形状跟 categories.icon 一致。还没选时传空串 */
  value: string;
  onChange: (icon: string) => void;
};

/**
 * 新建/编辑分类时挑图标。三页：内置图标 / 我的图片 / 表情。
 *
 * **三组是分页，不是上下堆着的三段。** 原来是一个滚动区里依次排「自己的图片」
 * 「内置图标」「表情」，小标题只是两行灰字——四十多个内置图标一铺开，表情那组就在
 * 两屏以外，而那几行小标题混在格子中间根本不像分界。三组的来源彼此无关
 * （打包进 App 的图 / 用户自己的图 / 字体里的字符），本来就该是三个并列的去处，
 * 而不是一条要翻到底的长廊。
 *
 * **「我的图片」列出盘上所有传过的图，不只是当前这一张。** 原来那一格是个只读预览，
 * 想用回上个月传的那张 logo 只能重新传一遍。现在它是一格一格的，跟另外两页一样能点。
 * 注意这一页的数据源是**目录**不是数据库（`listCustomIconFiles`）——刚挑完还没点保存的
 * 那张图在库里查不到，而它恰恰是此刻最该被摆在第一格的。
 *
 * **上传的两个按钮留在这一页顶上**，而且是两个不是一个：系统相册选择器看不见 `Download/`，
 * 而分类图标最常见的来源就是下载来的品牌 logo。只给「相册」的话，那种用户会以为
 * 自己的图凭空消失了（详见 db/category-icon-files.ts 的 pickCustomCategoryIconFromFile）。
 *
 * 选完图**只把引用交给上层的表单**（`onChange`），照片此刻已经落进沙盒，
 * 但那一行分类要等用户点「确定」才更新。所以选完又关掉弹层会留下一个没人用的文件，
 * 由 `pruneUnusedCategoryIcons` 事后对账收走——这个方向的错（多一个孤儿文件）
 * 比反过来（先改库、用户却没保存）轻得多。
 */
export function CategoryIconPicker({ value, onChange }: CategoryIconPickerProps) {
  const theme = useTheme();
  const [tab, setTab] = useState<IconTab>(() => tabOf(value));
  // 存的是"哪个按钮在忙"而不是一个布尔：转圈要转在被按的那个上，
  // 两个按钮一起变灰、却看不出是哪个在动，用户会以为自己点错了
  const [picking, setPicking] = useState<'library' | 'file' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 惰性初始值而不是 useEffect 里取：读目录是同步的，
  // 而在 effect 里 setState 要多渲染一轮，也正是 react-hooks/set-state-in-effect 拦的写法
  const [mine, setMine] = useState<string[]>(listCustomIconFiles);

  const upload = async (from: 'library' | 'file') => {
    if (picking) return;
    setPicking(from);
    setError(null);
    try {
      const icon = from === 'library' ? await pickCustomCategoryIcon() : await pickCustomCategoryIconFromFile();
      // null = 用户在选择器里点了取消。那不是错，什么都不做就对了
      if (icon) {
        // 先把新文件收进这一页再交出去：调用方不一定会关掉选择器，
        // 那种情况下这张图得立刻出现在格子里，而且是选中状态
        setMine(listCustomIconFiles());
        onChange(icon);
      }
    } catch (caught) {
      // 权限被拒、图片解不开，都在这儿说出来。弹 Alert 会盖住刚打开的弹层，
      // 而这句话要跟那两个按钮挨着才知道说的是谁
      setError(caught instanceof Error ? caught.message : '没能用这张图，换一张试试');
    } finally {
      setPicking(null);
    }
  };

  const renderPickButton = (from: 'library' | 'file', icon: 'images-outline' | 'folder-open-outline', label: string) => (
    <Pressable
      onPress={() => upload(from)}
      disabled={!!picking}
      style={[
        styles.pickButton,
        { borderColor: theme.textSecondary + '55', opacity: picking && picking !== from ? 0.4 : 1 },
      ]}>
      {picking === from ? (
        <ActivityIndicator size="small" color={theme.textSecondary} />
      ) : (
        <Ionicons name={icon} size={15} color={theme.textSecondary} />
      )}
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );

  const renderTile = (icon: string, key: string) => {
    const isSelected = icon === value;
    return (
      <Pressable
        key={key}
        onPress={() => onChange(icon)}
        style={[
          styles.tile,
          {
            backgroundColor: isSelected ? theme.cardHighlight + '22' : theme.background,
            borderColor: isSelected ? theme.cardHighlight : 'transparent',
          },
        ]}>
        <CategoryIcon icon={icon} size={22} />
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      {/* 分页条跟导出弹层那个是同一套（segment / segmentItem），
          这个 App 里"在几个并列的去处之间挑一个"一直长这样 */}
      <View style={[styles.segment, { backgroundColor: theme.tabTrackBackground }]}>
        {TABS.map((entry) => (
          <Pressable
            key={entry.key}
            onPress={() => setTab(entry.key)}
            style={[styles.segmentItem, tab === entry.key && { backgroundColor: theme.background }]}>
            <ThemedText type="small" themeColor={tab === entry.key ? 'text' : 'textSecondary'}>
              {entry.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* 滚动区定高而不是让它撑开：图标有五六十个，撑开的话下面的「确定」会被挤出屏幕。
          分页条留在外面不跟着滚——它是这一层的方向盘，翻到一半找不着它就只能倒回去 */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* 解释放在**滚动区里面**，跟着格子一起滚走：它是进这一页时读一遍的东西，
            钉在外面的话每一页都被它占掉一行，而那一行只有第一次有用 */}
        <ThemedText type="small" themeColor="textSecondary">
          {TABS.find((entry) => entry.key === tab)?.hint}
        </ThemedText>

        {tab === 'builtin' ? (
          <View style={styles.grid}>
            {BUILTIN_CATEGORY_ICONS.map((entry) => renderTile(builtinIconRef(entry.key), entry.key))}
          </View>
        ) : tab === 'emoji' ? (
          <View style={styles.grid}>{EMOJI_CATEGORY_ICONS.map((emoji) => renderTile(emoji, emoji))}</View>
        ) : (
          <>
            <View style={styles.pickRow}>
              {renderPickButton('library', 'images-outline', '相册')}
              {renderPickButton('file', 'folder-open-outline', '文件')}
            </View>
            {error ? (
              <ThemedText type="small" style={{ color: theme.expense }}>
                {error}
              </ThemedText>
            ) : null}

            {mine.length > 0 ? (
              <View style={styles.grid}>{mine.map((fileName) => renderTile(customIconRef(fileName), fileName))}</View>
            ) : (
              // 空的时候要说清楚这一页**以后**会有什么，否则它看起来只是两个按钮加一片空白。
              // 说"用过的"不说"传过的"：传完没保存的那张会被 pruneUnusedCategoryIcons 收走，
              // 承诺一件做不到的事比不承诺更糟
              <ThemedText type="small" themeColor="textSecondary">
                还没传过图片。用过的图会留在这一页，下次建分类直接点就能用
              </ThemedText>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.two,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  scroll: {
    maxHeight: 200,
  },
  content: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pickRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.two,
    // 34 而不是更矮：这是个真要用手指点的按钮，比旁边 42 的图标格小一号就够了
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
  },
  tile: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
