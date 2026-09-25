import { router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountPickerSheet } from '@/components/add-transaction/account-picker-sheet';
import { AmountKeypad } from '@/components/add-transaction/amount-keypad';
import { CategoryGrid, type CategoryGridItem } from '@/components/add-transaction/category-grid';
import { TransactionNoteFields } from '@/components/add-transaction/transaction-note-fields';
import { TransactionOptionsRow } from '@/components/add-transaction/transaction-options-row';
import { TransactionTypeTabs, type TransactionTypeTab } from '@/components/transaction/transaction-type-tabs';
import { DateTimePickerSheet } from '@/components/ui/datetime-picker-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import type { TransactionDetail } from '@/db/transactions';
import { useAccounts, useLastUsedAccountId } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-categories';
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/use-transactions';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useTheme } from '@/hooks/use-theme';

type TransactionFormProps = {
  /** 传了就是编辑那一笔，不传是记新的一笔 */
  initial: TransactionDetail | null;
};

/**
 * 记一笔 / 改一笔的表单。新建和编辑共用同一套字段，所以共用同一个组件——
 * 拆成两个只会有两份要同步维护的表单，而它们之间唯一的差别是保存时调 create 还是 update。
 *
 * 调用方（app/add.tsx）**等数据到齐了才挂载它**，所以下面十几个 useState 可以直接用 props 当初始值，
 * 不需要 useEffect 把查询结果同步进 state（那会多渲染一轮，也是 eslint 的
 * react-hooks/set-state-in-effect 要拦的写法）。
 */
export function TransactionForm({ initial }: TransactionFormProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  // 两个高度都实测，不按屏幕比例硬算——外壳的 55% 还要扣掉安全区，算出来的和实际差一截
  const [sheetHeight, setSheetHeight] = useState(0);
  const [noteFieldsHeight, setNoteFieldsHeight] = useState(0);

  // 输入块底边离屏幕底边本来就有这么远，键盘只要没盖过这个距离就不用动它
  const restingGap = Math.max(0, sheetHeight - noteFieldsHeight);
  const targetLift = Math.max(0, keyboardHeight - restingGap);
  const [lift] = useState(() => new Animated.Value(0));
  // 负值才是"往上"，所以取反一次给 translateY
  const liftY = useMemo(() => Animated.multiply(lift, -1), [lift]);

  useEffect(() => {
    Animated.timing(lift, {
      toValue: targetLift,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [lift, targetLift]);


  const { data: accounts } = useAccounts();
  const { data: lastUsedAccountId } = useLastUsedAccountId();
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();

  const [type, setType] = useState<TransactionTypeTab>(initial?.type ?? 'EXPENSE');

  /**
   * 已选分类**按收支类型各存一份**，而不是一个共用的 id。
   *
   * 支出和收入是两套分类，一个共用的 id 在切换之后会指向一个网格里不存在的格子，
   * 所以原来的做法是切换时把它清掉——代价是切过去看一眼再切回来，选好的分类就没了。
   * 分成两格之后这个问题自己消失：切换只是换一个格子读，两边的选择都留在原地，
   * 而「收入那格里存着一个支出分类」这种状态从一开始就构造不出来。
   *
   * 编辑模式下只有 initial.type 那一格有值，另一格是 null——那笔账本来就只属于一种类型。
   */
  const [categoryByType, setCategoryByType] = useState<Record<TransactionTypeTab, string | null>>(() => ({
    EXPENSE: initial?.type === 'EXPENSE' ? initial.categoryId : null,
    INCOME: initial?.type === 'INCOME' ? initial.categoryId : null,
  }));
  const selectedCategoryId = categoryByType[type];
  const selectCategory = (id: string) => setCategoryByType((prev) => ({ ...prev, [type]: id }));
  // null 表示"没手动选过"，落回账户列表第一个。存 null 而不是在 effect 里 setState：
  // 后者要多渲染一轮，还是 eslint 的 react-hooks/set-state-in-effect 要拦的写法
  const [pickedAccountId, setPickedAccountId] = useState<string | null>(initial?.accountId ?? null);
  const [date, setDate] = useState(() => (initial ? new Date(initial.date) : new Date()));
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '0');
  // 编辑时用存下来的 title 回填主题。title 可能是当初从店名或分类名兜底来的，
  // 回填后看着像是用户填过主题——但这是唯一存下来的那个字符串，分不出它当初的来源
  const [topic, setTopic] = useState(initial?.title ?? '');
  const [remark, setRemark] = useState(initial?.remarks ?? '');
  const [merchant, setMerchant] = useState(initial?.merchant ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [isReimbursable, setIsReimbursable] = useState(initial?.isReimbursable ?? false);
  const [excludeFromStats, setExcludeFromStats] = useState(initial?.excludeFromStats ?? false);
  // 同一时刻最多开一个选择器，所以存"哪个开着"而不是两个 boolean——
  // 两个 boolean 就存在"两个都为 true"这种本不该存在的状态
  const [openSheet, setOpenSheet] = useState<'date' | 'account' | null>(null);

  const isEditing = !!initial;
  const mutation = isEditing ? updateTransaction : createTransaction;

  // 默认值按这个顺序退：手动选的 → 上次记账用的 → 列表第一个。
  // （改账单时不用再单独兜一层：pickedAccountId 的初始值就是 initial.accountId）
  //
  // "上次用的"是这里的重点：两个默认账户（「不选择任何账户」和「现金」）之间，
  // 用户只需要选一次，之后就一直沿用，不用每笔账都想一遍。
  // 真要换的人点一下 chip 就换了，下一笔又会记住新的那个。
  const accountId = pickedAccountId ?? lastUsedAccountId ?? accounts?.[0]?.id ?? null;
  const accountName = accounts?.find((a) => a.id === accountId)?.name ?? null;

  // 勾上报销时顺带打开"不计入统计"：这笔钱之后会回来，算进消费统计会让当月分类金额虚高，
  // 而且收回时记一笔收入也抵消不掉支出分类的数字。仍然允许用户手动再关掉，所以只在打开的那一刻联动
  const handleReimbursableChange = (value: boolean) => {
    setIsReimbursable(value);
    if (value) setExcludeFromStats(true);
  };

  const { data: categoryRows } = useCategories(type);
  // parentId 一起传进去，网格自己分一级二级——表单不需要知道分类有几层，
  // 它只关心最后选中的那一个 id（选了子分类就是子分类的 id）
  const categories: CategoryGridItem[] = (categoryRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    parentId: c.parentId,
  }));

  const numericAmount = Number(amount);

  // 保存的硬门槛：**选了分类**、**填了主题**、**金额大于 0**。
  // 其余字段（备注、店名、地点、标签）空着也能存——记账一旦要求填满才让存，
  // 人就会在"懒得填"的时候干脆不记，那才是真正的损失。
  //
  // 金额留在门槛里：一笔 0 块的账在账本里没有意义，
  // 存下来之后它还会进每一条统计（笔数 +1、金额 +0），把日均和构成图的分母悄悄冲淡。
  //
  // 账户不是用户要做的选择（默认账户是灌好的，见 db/accounts.ts 的 seed），
  // 它留在这里纯粹是**数据层的硬约束**：transactions.accountId 是 NOT NULL，
  // 一个账户都没有时插不进去。排在金额前面是因为只有它有话可说（见下面的提示），
  // 两个条件同时不满足时该让能解释的那个赢。
  const blocker = !selectedCategoryId
    ? 'category'
    : !topic.trim()
      ? 'topic'
      : !accountId
        ? 'account'
        : !(numericAmount > 0)
          ? 'amount'
          : null;
  const canSave = !blocker && !mutation.isPending;

  // 判断和提示是两件事：四个条件都拦着保存，但只有一个值得写出来。
  // "没选分类""没填主题""金额是 0"都是抬眼就看见的空位，写出来是废话；
  // 而账户列表为空时（accountId 恒为 null）用户会以为按钮坏了，
  // 根本想不到"我还没有账户"——这一条不说就真的没人能猜到。
  //
  // 加上 `accounts &&`：账户还没查出来时 accountId 也是 null，但那是"还不知道"不是"一个都没有"。
  // 不区分的话，本地库读完之前的那几毫秒会闪一句"去账本里新建一个"，
  // 而用户根本不缺账户——默认账户是灌好的，他只需要再等一帧
  const blockerHint = blocker === 'account' && accounts ? '先选一个账户——我的 → 账本 → 账户 里新建' : null;

  const handleSave = () => {
    if (!canSave || !selectedCategoryId || !accountId) return;
    mutation.reset();
    const category = categories.find((c) => c.id === selectedCategoryId);

    const payload = {
      // 主题现在是必填的（canSave 拦着），所以这里的兜底链走不到了——留着是因为
      // title 在 schema 里是 NOT NULL，这一行是它最后一道保险。
      // 老账单里仍然存着当初从店名或分类名兜底来的 title，
      // 账单行的"主题只是分类名的回声就不显示"那段判断因此还得留着（见 transaction-list-item）
      title: topic.trim() || merchant.trim() || category?.name || '',
      merchant,
      location,
      remarks: remark,
      amount: numericAmount,
      type,
      categoryId: selectedCategoryId,
      accountId,
      // 日期选择器连时分一起给回来，这里直接存，不用再补时间点
      date: date.toISOString(),
      tags,
      isReimbursable,
      excludeFromStats,
    };

    // 记完/改完都回首页，而不是 router.back()。
    // ＋号是全局动作（它不属于任何一个 tab），从统计页按的＋，back 会把人送回统计页，
    // 那笔刚记的账落在哪里完全看不见；编辑是从首页的详情弹层进来的，回首页也正是原路。
    // dismissTo 会一路关掉栈顶直到首页，首页不在历史里时退化成 replace，两种情况都落在首页。
    //
    // 失败不跳转：留在原地把错误显示在保存键上方。静默失败会让人以为记上了，
    // 而记账这件事一旦以为记上了就不会再记第二遍（同 3f14b1b 修过的预算那处）
    const onSuccess = () => router.dismissTo('/');

    if (initial) {
      updateTransaction.mutate({ ...payload, id: initial.id }, { onSuccess });
    } else {
      createTransaction.mutate(payload, { onSuccess });
    }
  };

  return (
    // 自己铺主题底色，不靠导航器的默认背景——那个是 react-navigation 的 light/dark 两档，
    // 跟这个 App 的三套色板对不上，浅色主题下就是一片白
    //
    // edges 里没有 bottom：底部安全区归下面那块面板自己补（跟 ModalSheet 一个做法）。
    // 交给 SafeAreaView 的话，那条安全区是**外壳的**，铺的是页面底色（黑），
    // 于是屏幕最底下会出现一条黑带把键盘面板托着——这台手机的按键就在屏幕上，那条带子一直看得见
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right']}>
      <Stack.Screen
        options={{
          headerShown: true,
          // 切换只换 type，不清任何东西——分类按收支类型各存一份（见 categoryByType），
          // 金额、主题、备注这些本来就跟收支类型无关
          headerTitle: () => <TransactionTypeTabs value={type} onChange={setType} />,
          // 返回键不自己画，交给导航器的默认那个。
          //
          // 原来这里是个自定义的叉号（Pressable + Ionicons）。换成箭头之后要跟分类管理页
          // 长得一样，而那一页根本没写 headerLeft——用的就是默认返回键。
          // 与其去抄它的尺寸和边距（那些数字来自 react-navigation 内部，改版就对不上了），
          // 不如两边都用同一个东西：一致是**构造出来的**，不是对出来的。
          //
          // 行为也没变：默认返回键做的就是 goBack()，跟原来那个 router.back() 是同一件事。
        }}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <ThemedView type="backgroundElement" style={[styles.categoryCard, { borderColor: theme.backgroundSelected }]}>
          <CategoryGrid
            categories={categories}
            selectedId={selectedCategoryId}
            onSelect={selectCategory}
            // 带上当前收支类型，进去就停在对应那一组，不用再切一次。
            // 新建的分类由 useCreateCategory 失效缓存后自动出现在这个网格里，回来不用手动刷新
            onSettingsPress={() => router.push({ pathname: '/categories', params: { type } })}
          />
        </ThemedView>
      </ScrollView>

      {/* 外壳也要有底色：输入块滑上去之后原来那块地方得有人画，否则露出的是页面黑底。
          圆角两层都画——贴合时看着是一张卡，输入块滑上去时露出的也还是个圆角顶 */}
      <ThemedView
        type="backgroundElement"
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        style={[styles.bottomSheet, { paddingBottom: insets.bottom }]}>
        {/* 键盘弹出时这一块滑到键盘顶边。位移量是算出来的而不是直接用键盘高度：
            它本来就离屏幕底边有 (外壳高 - 自己高) 那么远，只需要补上不够的那一截，
            直接按键盘高度位移会冲过头。差值 <= 0 就说明本来就在键盘上方，不用动。

            用 transform 而不是 position: absolute：transform 不参与布局，
            所以它动的时候下面几块一格不挪，也不需要占位 View。
            走 Animated 是为了跟键盘一起滑——直接改值会在键盘还没滑上来时先跳上去，
            中间那一瞬间就会露出背景 */}
        <Animated.View
          onLayout={(e) => setNoteFieldsHeight(e.nativeEvent.layout.height)}
          style={[
            styles.noteFields,
            { backgroundColor: theme.backgroundElement, transform: [{ translateY: liftY }] },
          ]}>
          <TransactionNoteFields
            topic={topic}
            onTopicChange={setTopic}
            remark={remark}
            onRemarkChange={setRemark}
            merchant={merchant}
            onMerchantChange={setMerchant}
            location={location}
            onLocationChange={setLocation}
            amount={numericAmount}
          />
        </Animated.View>

        {/* 下半块：方角，因为它永远接在输入块下面，自己不是顶部 */}
        <ThemedView type="backgroundElement" style={styles.actionBlock}>
          <TransactionOptionsRow
            date={date}
            onDatePress={() => setOpenSheet('date')}
            accountName={accountName}
            onAccountPress={() => setOpenSheet('account')}
            tags={tags}
            onTagsChange={setTags}
            isReimbursable={isReimbursable}
            onReimbursableChange={handleReimbursableChange}
            excludeFromStats={excludeFromStats}
            onExcludeFromStatsChange={setExcludeFromStats}
            onCameraPress={() => {
              // TODO(dummy data): 接 Cloudinary 客户端直传后开放拍照/选图，当前只是 UI 占位
              console.log('camera pressed (todo: Cloudinary upload)');
            }}
          />

          {mutation.error ? (
            <ThemedText type="small" style={[styles.saveHint, { color: theme.expense }]}>
              没能保存：{mutation.error.message}
            </ThemedText>
          ) : blockerHint ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.saveHint}>
              {blockerHint}
            </ThemedText>
          ) : null}

          <AmountKeypad value={amount} onChange={setAmount} onSave={handleSave} saveDisabled={!canSave} />
        </ThemedView>
      </ThemedView>

      {openSheet === 'date' ? (
        <DateTimePickerSheet
          value={date}
          onSelect={(picked) => {
            setDate(picked);
            setOpenSheet(null);
          }}
          onDismiss={() => setOpenSheet(null)}
        />
      ) : null}

      {openSheet === 'account' ? (
        <AccountPickerSheet
          accounts={accounts ?? []}
          selectedId={accountId}
          onSelect={(id) => {
            setPickedAccountId(id);
            setOpenSheet(null);
          }}
          onDismiss={() => setOpenSheet(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  // 圆角跟底部面板的 20 对齐。不描边：深色主题下底色差已经把卡和页面分开了，
  // 再画一圈线是同一件事说两遍
  categoryCard: {
    borderRadius: 20,
    paddingHorizontal: Spacing.half,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  // 圆角画在这里：不管它在原位还是被钉到键盘顶边，顶部永远是它，圆角就永远在对的地方。
  // 不用 elevation：Android 上它会在底边拖一道投影，而两块之间本来就有 margin 隔开，
  // 那道影子只会让缝看起来脏。压过下半块交给 zIndex
  noteFields: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    zIndex: 2,
  },
  // 方角：它永远接在输入块下面，自己不是顶部。flex: 1 吃掉外壳剩下的高度。
  //
  // 上边距用 padding 不用 margin：margin 是块外面的空隙，露出来的是页面底色（黑），
  // 看着就像 chips 那行上面缺了一截背景；padding 在块里面，间距一样但底色是连着的。
  // 也不写成上面那块的 marginBottom——它钉到键盘顶边时会脱离文档流，margin 跟着失效
  actionBlock: {
    flex: 1,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  // 跟底部面板的 gap 是 Spacing.three，这行提示自己不再加上边距，免得跟保存键之间空出一大块
  saveHint: {
    paddingHorizontal: Spacing.two,
  },
  // 主题那一行到键盘底部固定占屏幕的 55%，上面的分类网格拿剩下的 45%。
  // 写百分比而不是像素：换台屏幕更长的手机，两边的比例不会跟着变形。
  // 键盘自己是 flex: 1，所以这个数一改，键位跟着缩放，不用再调它内部的高度。
  // 高度不含底部安全区：安全区是额外加在下面的 paddingBottom，
  // 所以键盘那 55% 不会被导航栏吃掉一截
  bottomSheet: {
    height: '55%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
});
