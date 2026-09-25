import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import type { SuggestionField, TransactionType } from '@/db/transactions';
import { useFieldSuggestions } from '@/hooks/use-transactions';
import { useTheme } from '@/hooks/use-theme';

/** 历史条目左边那一格要显示的分类。调用方从它手上已有的分类列表里查出来给 */
export type SuggestionCategory = { name: string; icon: string | null };

type SuggestionPopupProps = {
  field: SuggestionField;
  /** 这个字段当前输入了什么。既是查询的关键词，也是高亮要标的那一段 */
  keyword: string;
  /** 当前记的是支出还是收入。历史和跟着回来的分类都只在这一边找 */
  type: TransactionType;
  /** 按 id 取分类的名字和图标。分类数据在表单那边已经查过了，不在这里重查一遍 */
  resolveCategory: (id: string) => SuggestionCategory | null;
  /**
   * 选中一条历史：填上文字，以及分类（只有主题会带，其余字段固定传 null，见 carriesCategory）。
   *
   * **第一个参数把字段名一起带出去**，不让调用方从"当前聚焦的是哪个字段"去反推：
   * 点浮层这一下会让输入框先失焦，那个状态很可能已经被清掉了，
   * 反推出来的字段就会落到兜底值上，把店名的历史写进主题里。
   */
  onPick: (field: SuggestionField, value: string, categoryId: string | null) => void;
};

/** 一次最多列几条。浮层是盖在分类网格上的，列太多等于把整页挡住 */
const MAX_ITEMS = 3;

const FIELD_LABEL: Record<SuggestionField, string> = {
  title: '历史主题',
  merchant: '历史店名',
  location: '历史地点',
};

/**
 * 这个字段的历史选中后，要不要连分类一起填上。
 *
 * 只有主题算数。主题是「加油」「早餐」「剪头发」这种具体的事，跟分类几乎一一对应，
 * 上次归哪一类这次基本还是哪一类；而一家商场、一个地点底下什么都有（吃饭、购物、看电影），
 * 拿店名去推分类，猜错的次数会比猜对多——而猜错的代价是把用户已经选好的分类悄悄换掉。
 *
 * 这个判断同时决定**左边那一格画不画**：不会被应用的分类不该显示出来，
 * 否则看起来像"点下去会连它一起选上"。一条规则管两件事，两者不会走散。
 */
function carriesCategory(field: SuggestionField): boolean {
  return field === 'title';
}

/**
 * 输入历史的浮层：按这个字段历史上出现的次数排，常写的排最前。
 * 每条左边带着**上次用这个值时选的那个分类**，点一下文字和分类一起填好。
 *
 * **它自己不定位**——定位由调用方负责（见 transaction-form 里那层 suggestionLayer）。
 * 原因是 Android 上画到父容器外面的东西收不到触摸，所以浮层必须挂在整页的根上、
 * 绝对定位到输入块的顶边，而不能塞在输入块内部往上顶。
 *
 * 也不用 Modal 来做这件事，尽管项目里选分类的二级面板用的就是 Modal：
 * Modal 是独立的原生窗口，一弹出来就抢走焦点，输入框失焦、键盘收起，
 * 而这个浮层存在的前提恰恰是"用户正在那个输入框里打字"。
 *
 * 哪些字段配它，判断标准是"会不会被反复输入同样的值"：
 * 主题（午餐、打车、买菜）、店名、地点都会；备注记的是"这一笔具体买了啥"，每笔都不一样。
 */
export function SuggestionPopup({ field, keyword, type, resolveCategory, onPick }: SuggestionPopupProps) {
  const theme = useTheme();
  const needle = keyword.trim();

  // **打了字才查**。一点进输入框就把最近用过的几条推上来，等于每次记账都先挨一层弹窗，
  // 而那几条多半跟这一笔无关；有了关键词，列出来的每一条都是确实匹配的。
  // 关掉查询而不是查完再丢，省的是一次本地 SQLite 的 GROUP BY
  const { data: suggestions } = useFieldSuggestions(field, keyword, type, !!needle);

  /**
   * **完全匹配的那条也要留着**。
   *
   * 这里一度滤掉「跟已输入内容一模一样」的建议，理由是"文字都填好了，没必要再列一遍"。
   * 那条理由在历史只能填文字的时候成立，等历史带上分类之后就反了过来：
   * 完全匹配的恰恰是最该点的一条——它替你回答"上次这笔归哪一类"。
   * 滤掉的表现是把主题一字不差打完，浮层反而消失了，看起来像匹配坏了。
   */
  const items = (suggestions ?? []).slice(0, MAX_ITEMS);
  if (!needle || items.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.kicker}>
        {FIELD_LABEL[field]}
      </ThemedText>

      {items.map((item) => {
        const categoryId = carriesCategory(field) ? item.categoryId : null;
        const category = categoryId ? resolveCategory(categoryId) : null;

        return (
          <Pressable
            key={item.value}
            // onPress 会在 TextInput 的 onBlur 之后才触发（那时浮层已经卸载了），
            // 用 onPressIn 才能在列表被收起前拿到这一下点击
            onPressIn={() => onPick(field, item.value, categoryId)}
            style={styles.row}>
            {/* 这一格只在"分类会跟着填上"时才画（见 carriesCategory）。
                分类本身也可能查不到——被停用或删了。查不到就只填文字，不画这一格：
                留个空框比没有更让人困惑 */}
            {category ? (
              <>
                <View style={styles.categoryColumn}>
                  <CategoryIcon icon={category.icon} size={20} />
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {category.name}
                  </ThemedText>
                </View>
                <View style={[styles.divider, { backgroundColor: theme.textSecondary }]} />
              </>
            ) : null}

            <View style={styles.valueColumn}>
              <MatchedText text={item.value} keyword={keyword} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * 把命中的那一段套上强调色，一眼能看出这条为什么被推上来——
 * 不标的话，输入"游"弹出一串看似不相干的历史，用户得自己在每条里找那个字。
 *
 * 嵌套的 ThemedText 在 RN 里就是一段行内文字，不会另起一行。
 */
function MatchedText({ text, keyword }: { text: string; keyword: string }) {
  const theme = useTheme();
  const needle = keyword.trim();
  // 两边都 toLowerCase：查询用的是 LIKE + COLLATE NOCASE，大小写不一致时照样算命中
  const at = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;

  if (at < 0) {
    return (
      <ThemedText type="small" numberOfLines={1}>
        {text}
      </ThemedText>
    );
  }

  return (
    <ThemedText type="small" numberOfLines={1}>
      {text.slice(0, at)}
      <ThemedText type="small" style={{ color: theme.cardHighlight }}>
        {text.slice(at, at + needle.length)}
      </ThemedText>
      {text.slice(at + needle.length)}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  card: {
    // 宽度跟着内容走：外层那一条是满屏宽的，但它 alignItems: 'flex-start'，
    // 所以这张卡缩到自己最宽那一行的宽度。maxWidth 兜住特别长的历史，免得顶出屏幕
    maxWidth: '100%',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
    // 浮层要浮得起来。底色本身跟下面那张卡已经差一级，阴影是补上"它盖在别的东西上面"这层意思。
    // elevation 画在这一层是安全的：它有底色，而且是静态的（挂上/卸下，不是来回改）
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  kicker: {
    // 整张卡只写一次"这是历史"，不用每条都重复一遍
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 38,
  },
  // 图标和分类名竖着放，占一个窄列——它是"这条历史属于哪一类"的标签，不该跟正文抢宽度
  categoryColumn: {
    width: 44,
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: Spacing.one,
    opacity: 0.4,
  },
  // flexShrink 而不是 flex: 1。`flex: 1` 会把基准宽度设成 0，
  // 在"宽度由内容决定"的卡里就等于这一列不贡献任何宽度，文字会被压成一条
  valueColumn: {
    flexShrink: 1,
  },
});
