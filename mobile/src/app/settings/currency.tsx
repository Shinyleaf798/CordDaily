import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { CurrencyAddSheet } from '@/components/settings/currency-add-sheet';
import { checkWiseToken } from '@/api/wise';
import { BASE_CURRENCY } from '@/constants/currencies';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useEnabledCurrencies, useSetEnabledCurrencies } from '@/hooks/use-currencies';
import { useExchangeRates, useRefreshRates, useSaveManualRate } from '@/hooks/use-exchange-rates';
import { useTheme } from '@/hooks/use-theme';
import { useConnectWise, useDisconnectWise, useWiseToken } from '@/hooks/use-wise-token';
import { formatDateTimeLabel } from '@/utils/date';

/**
 * 汇率从哪来、现在是多少、手动改一个。
 *
 * **三段，顺序就是用户的路径**：先连上 Wise（一次性），然后看一眼这批汇率新不新
 * （日常只看这一眼），最后才是手填（例外情况）。手填放在最后而不是最前，
 * 是因为它虽然最灵活，却最不该被当成常规做法——手填的值不会自己更新。
 *
 * 结构刻意跟「云端备份」那一页对齐（app/settings/cloud.tsx）：**两页做的是同一类事**——
 * 用户从一个外部服务拿一串凭证粘进来，App 存进 SecureStore 然后拿它去打请求。
 * 于是这里照搬了那边四个已经踩过坑的做法：存之前先验证、明文/遮蔽切换、
 * 换一个不必先删、以及"去哪拿"写在 App 里而不是丢一条文档链接。
 *
 * 跟那页最大的不同是**这道门可以不进**：没有 token 照样能选外币记账，
 * 下面每一行汇率都能直接填数。Neon 那条连接串是"要不要云端"的总开关，
 * 而这个只是"汇率要不要自动填"。
 */
export default function CurrencySettingsScreen() {
  const theme = useTheme();
  const { data: rates } = useExchangeRates();
  const { data: token, isLoading } = useWiseToken();
  const connect = useConnectWise();
  const disconnect = useDisconnectWise();
  const refresh = useRefreshRates();
  const saveManual = useSaveManualRate();
  const { data: currencies } = useEnabledCurrencies();
  const setCurrencies = useSetEnabledCurrencies();

  const [draft, setDraft] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 正在手填哪一行，以及填到哪了。一次只开一行——同时开好几个输入框没有任何用处 */
  const [manual, setManual] = useState<{ code: string; value: string } | null>(null);
  const [addingCurrency, setAddingCurrency] = useState(false);

  const showTokenForm = (!token || editing) && !isLoading;

  const handleConnect = () => {
    const problem = checkWiseToken(draft);
    if (problem) {
      setError(problem.message);
      return;
    }
    setError(null);
    connect.mutate(draft.trim(), {
      onSuccess: () => {
        // 连上之后立刻清空：那串东西已经进 SecureStore 了，
        // 让它继续留在一个可能被截图的屏幕上没有任何好处（同 cloud.tsx）
        setDraft('');
        setRevealed(false);
        setEditing(false);
      },
      onError: (connectError) => setError((connectError as Error).message),
    });
  };

  const handleDisconnect = () => {
    Alert.alert(
      '删掉 token？',
      '只会清掉这台手机上存的那串字符。已经拉下来的汇率留着，记过的账一笔都不动——之后汇率改成自己填。',
      [
        { text: '取消', style: 'cancel' },
        { text: '删掉', style: 'destructive', onPress: () => disconnect.mutate() },
      ],
    );
  };

  const enabled = currencies?.foreign ?? [];

  const addCurrency = (code: string) => setCurrencies.mutate([...enabled.map((c) => c.code), code]);

  /**
   * 删一个币种。**要确认，但确认文案的重点是"不会动已经记的账"**——
   * 这跟 cloud.tsx 里「断开」那个弹窗是同一种顾虑：用户真正怕的不是误触，
   * 是以为删掉币种会把用这个币种记的账一起弄坏。
   */
  const removeCurrency = (code: string, name: string) => {
    Alert.alert(
      `不再使用${name}？`,
      '只是从记账时的可选列表里去掉。已经用它记过的账一笔都不动，金额和当时的汇率都还在。想用了再加回来就是。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '移除',
          style: 'destructive',
          onPress: () => setCurrencies.mutate(enabled.filter((c) => c.code !== code).map((c) => c.code)),
        },
      ],
    );
  };

  const commitManualRate = () => {
    if (!manual) return;
    const perBase = Number(manual.value);
    // 0 和负数会让折算出来的钱变成 0 或负的，而那笔账看起来仍然正常——挡在这里
    if (Number.isFinite(perBase) && perBase > 0) {
      saveManual.mutate({ code: manual.code, perBase });
    }
    setManual(null);
  };

  const fetchedAt = Object.values(rates?.byCode ?? {})[0]?.fetchedAt ?? null;
  const problem = refresh.error?.message ?? rates?.refreshError ?? null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {isLoading ? (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <ActivityIndicator color={theme.cardHighlight} />
            </View>
          ) : null}

          {/* ---- 第一段：连 Wise ---- */}
          {token && !editing ? (
            <>
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.cardHead}>
                  <Ionicons name="checkmark-circle" size={20} color={theme.cardHighlight} />
                  <ThemedText type="default" style={styles.grow}>
                    已连上 Wise
                  </ThemedText>
                </View>
                {/* 只露头尾各四个字符，中间打点。够回答"我填的是不是那一串"，
                    又不至于让旁边的人或一张截图把它整个拿走（同 cloud.tsx 只显示主机名） */}
                <ThemedText type="small" themeColor="textSecondary">
                  {maskToken(token)}
                </ThemedText>
              </View>

              <Pressable
                onPress={() => {
                  setEditing(true);
                  setError(null);
                }}
                style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name="swap-horizontal-outline" size={20} color={theme.cardHighlight} />
                <View style={styles.rowText}>
                  <ThemedText type="default">换一个 token</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    旧的作废了，或者重新生成过一个
                  </ThemedText>
                </View>
              </Pressable>

              <Pressable
                onPress={handleDisconnect}
                disabled={disconnect.isPending}
                style={[
                  styles.row,
                  { backgroundColor: theme.backgroundElement },
                  disconnect.isPending && styles.dimmed,
                ]}>
                <Ionicons name="log-out-outline" size={20} color={theme.expense} />
                <View style={styles.rowText}>
                  <ThemedText type="default" style={{ color: theme.expense }}>
                    删掉 token
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    汇率改成自己填，记过的账一笔不动
                  </ThemedText>
                </View>
              </Pressable>
            </>
          ) : null}

          {showTokenForm ? (
            <>
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="default">让汇率自己填上</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  粘一个 Wise API token，记外币账时汇率就自动带出来，拿的是 Wise 的中间价
                  （跟你在 Wise App 里看到的那个数一致，手续费不算进账单）。
                  不填也能用——下面每一行都可以自己填数。
                </ThemedText>
              </View>

              <View style={styles.group}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.groupLabel}>
                  API token
                </ThemedText>
                <View style={[styles.inputRow, { backgroundColor: theme.backgroundElement }]}>
                  <TextInput
                    value={draft}
                    onChangeText={(next) => {
                      setDraft(next);
                      setError(null);
                    }}
                    placeholder="粘贴 token"
                    placeholderTextColor={theme.textSecondary}
                    // 默认遮起来，但给一个看得见的开关：全凭手感粘贴的话，
                    // 粘错了要等到「连接」失败才知道（同 cloud.tsx 那条连接串）
                    secureTextEntry={!revealed}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    spellCheck={false}
                    style={[styles.input, { color: theme.text }]}
                  />
                  <Pressable onPress={() => setRevealed((value) => !value)} hitSlop={8}>
                    <Ionicons
                      name={revealed ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                </View>
                {error ? (
                  <ThemedText type="small" style={{ color: theme.expense }}>
                    {error}
                  </ThemedText>
                ) : null}
              </View>

              <Pressable
                onPress={handleConnect}
                disabled={connect.isPending || !draft.trim()}
                style={[
                  styles.primary,
                  { backgroundColor: theme.cardHighlight },
                  (connect.isPending || !draft.trim()) && styles.dimmed,
                ]}>
                {connect.isPending ? (
                  <ActivityIndicator color={theme.onCardHighlight} />
                ) : (
                  <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
                    连接并拉一次汇率
                  </ThemedText>
                )}
              </Pressable>

              {editing ? (
                <Pressable onPress={() => setEditing(false)} style={styles.ghost}>
                  <ThemedText type="small" themeColor="textSecondary">
                    取消，保留现在这个
                  </ThemedText>
                </Pressable>
              ) : null}

              <Steps />
            </>
          ) : null}

          {/* ---- 第二段：这批汇率有多新 ---- */}
          <View style={styles.groupHead}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
              {problem
                ? problem
                : fetchedAt
                  ? `1 ${BASE_CURRENCY} 换得到 · 更新于 ${formatDateTimeLabel(new Date(fetchedAt))}`
                  : `1 ${BASE_CURRENCY} 换得到`}
            </ThemedText>
            {/* 没 token 时刷新键不显示：按了必然失败，摆在那里只是一个骗人的按钮 */}
            {token ? (
              <Pressable onPress={() => refresh.mutate()} disabled={refresh.isPending} hitSlop={8}>
                {refresh.isPending ? (
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                ) : (
                  <Ionicons name="refresh" size={18} color={theme.textSecondary} />
                )}
              </Pressable>
            ) : null}
          </View>

          {/* ---- 第三段：一行一个币种。点行身手填汇率，点右边的 × 移除 ---- */}
          {enabled.map((currency) => {
            const rate = rates?.byCode[currency.code];
            const isEditing = manual?.code === currency.code;

            return (
              <Pressable
                key={currency.code}
                onPress={() => setManual({ code: currency.code, value: rate ? String(rate.perBase) : '' })}
                style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText style={styles.flag}>{currency.flag}</ThemedText>
                <View style={styles.rowText}>
                  <ThemedText type="default">{currency.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {currency.code}
                    {rate?.source === 'manual' ? ' · 手填' : ''}
                  </ThemedText>
                </View>

                {isEditing ? (
                  <TextInput
                    value={manual.value}
                    onChangeText={(value) => setManual({ code: currency.code, value })}
                    onBlur={commitManualRate}
                    onSubmitEditing={commitManualRate}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    autoFocus
                    style={[styles.rateInput, { color: theme.text, backgroundColor: theme.background }]}
                  />
                ) : (
                  <ThemedText type="default" style={styles.rate}>
                    {rate ? rate.perBase.toFixed(6) : '—'}
                  </ThemedText>
                )}

                {/* 移除键跟汇率并排，不藏在长按或左滑里：这一页本来就是"管币种"的地方，
                    藏起来的删除在一个一年用两次的页面上等于不存在。
                    hitSlop 给足，它紧挨着一个会弹出键盘的输入框 */}
                <Pressable onPress={() => removeCurrency(currency.code, currency.name)} hitSlop={12}>
                  <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                </Pressable>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => setAddingCurrency(true)}
            style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="add-circle-outline" size={24} color={theme.cardHighlight} />
            <View style={styles.rowText}>
              <ThemedText type="default">添加币种</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {currencies ? `还有 ${currencies.available.length} 种可以加` : ' '}
              </ThemedText>
            </View>
          </Pressable>

          <Warnings />
        </ScrollView>
      </ThemedView>

      {addingCurrency ? (
        <CurrencyAddSheet
          available={currencies?.available ?? []}
          onAdd={addCurrency}
          onDismiss={() => setAddingCurrency(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** 拿 token 的四步。写在 App 里而不是丢一条文档链接——这是挡在自动汇率前面唯一的门槛（同 cloud.tsx 的 Steps） */
function Steps() {
  const theme = useTheme();
  const steps = [
    '用浏览器登录 wise.com（手机 App 里没有这个设置）',
    'Your Account → Connect and manage apps → API tokens',
    'Add new token，过一次两步验证',
    '复制那串字符——它只显示这一次，关掉就再也看不到了',
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary">
        token 在哪拿
      </ThemedText>
      {steps.map((step, index) => (
        <View key={step} style={styles.step}>
          <View style={[styles.stepIndex, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small">{index + 1}</ThemedText>
          </View>
          <ThemedText type="small" style={styles.grow}>
            {step}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/**
 * 三条提醒。跟 cloud.tsx 那三条一样，不是免责声明，是**真的会踩到的事**。
 *
 * 第一条最重要：这串东西的权限远不止读汇率。用户很容易把它当成一个"查询用的 key"，
 * 而它实际上能建转账。
 */
function Warnings() {
  const theme = useTheme();
  const items: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
    {
      icon: 'warning-outline',
      text: '这串 token 的权限不止读汇率——拿到它的人能在你的 Wise 账户里建收款人和转账。别发给任何人，别贴进截图或聊天窗口。',
    },
    {
      icon: 'phone-portrait-outline',
      text: '它只存在这台手机上（跟 Neon 连接串同一个地方），不上传、也不进导出的备份文件。换手机要重新粘一次。',
    },
    {
      icon: 'refresh-outline',
      text: '万一泄露了：去 Wise 后台 revoke 掉再生成一个，粘进来就行。记过的账不受影响——每笔账的汇率在记账那一刻就存死了。',
    },
  ];

  return (
    <View style={styles.group}>
      {items.map((item) => (
        <View key={item.icon} style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name={item.icon} size={18} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
            {item.text}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** `58c3226d…f668f`。头尾各留四个，中间不管多长都是一个省略号 */
function maskToken(token: string): string {
  if (token.length <= 12) return '••••';
  return `${token.slice(0, 4)}…${token.slice(-5)}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingVertical: Spacing.four, gap: Spacing.two },
  grow: { flex: 1 },
  card: { padding: Spacing.three, borderRadius: 12, gap: Spacing.one },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.half,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  rowText: { flex: 1, gap: 2 },
  group: { gap: Spacing.two },
  groupLabel: { paddingHorizontal: Spacing.half },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
  },
  input: { flex: 1, height: 48, fontSize: 15 },
  flag: { fontSize: 24 },
  rate: { fontVariant: ['tabular-nums'] },
  rateInput: {
    minWidth: 120,
    height: 36,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    textAlign: 'right',
    fontSize: 14,
  },
  primary: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ghost: { height: 40, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepIndex: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
