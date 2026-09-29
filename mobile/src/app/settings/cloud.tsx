import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { probeAccounts } from '@/db/neon/account';
import { checkConnectionString } from '@/db/neon/client';
import type { CloudSession } from '@/db/neon/session';
import {
  useCloudSession,
  useConnectRemote,
  useDisconnectRemote,
  useHasRemote,
  useRemoteStatus,
  useSignOutCloud,
} from '@/hooks/use-cloud';
import { useTheme } from '@/hooks/use-theme';

/**
 * 「云端备份」——用户自己填一条 Neon 连接串，App 自动建表，注册一个账号，之后备份就有地方去了。
 *
 * ## 为什么是用户自己的库，不是我的服务器
 *
 * 这个 App 要打成 APK 发到 GitHub Release 上给陌生人下载。我不想（也没打算花钱）
 * 替所有人存账单：那要一台一直开着的服务器、一个会涨的数据库、一套密码找回，
 * 以及别人把财务数据交给我之后我得负的那份责任。
 *
 * 让每个人连自己的 Neon（免费额度对一个人记账绰绰有余），这几样一次性全都消失了：
 * **没有我的服务器，谁的账在谁自己的库里。** 我拿不到任何人的数据——
 * 这不是妥协，是这个方案最好的一面。连注册也是在他自己那个库里注册的。
 *
 * ## 两道门，各挡各的
 *
 * 1. **连接串**——库的地址加密码，还带建表权限。丢了没有「忘记密码」可走，
 *    没有服务器能证明你是你。
 * 2. **账号**——库里 `User` 表的一行。它挡不住已经拿到连接串的人（那人能直接读表），
 *    买的是另外两样：一个库能放好几本账（家里两个人共用一个免费 project），
 *    以及换手机时输一次密码，粘错成别人的串不会直接把人家的账拉下来。
 *
 * 所以这一页是上下两段：上面连库，下面进账本。没连库时下面那段根本不出现——
 * 先让他解决第一件事。
 *
 * ## 一个按钮做完四件事
 *
 * 全新的空库、另一台手机已经建好的库、以前用后端注册过的库、App 升级后落后一版的库——
 * 「连接」对这四种情况走的是同一条路（见 db/neon/client.ts 的 connectRemote），
 * 因为每一步都幂等。分成「初始化」和「连接」两个按钮的话，
 * 用户得先自己判断属于哪一种，而他判断不了。
 */
export default function CloudSettingsScreen() {
  const theme = useTheme();
  const { data: connected, isLoading: loadingRemote } = useHasRemote();
  const { data: session, isLoading: loadingSession } = useCloudSession();
  const { data: status, error: statusError } = useRemoteStatus();
  const connect = useConnectRemote();
  const disconnect = useDisconnectRemote();

  const [draft, setDraft] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoading = loadingRemote || loadingSession;
  const showConnectionForm = (!connected || editing) && !isLoading;
  // 库连上了、账号还没登：这时候才去问库里有没有账号
  const needsAccount = !!connected && !editing && !session;

  const handleConnect = () => {
    const problem = checkConnectionString(draft);
    if (problem) {
      setError(problem.message);
      return;
    }
    setError(null);
    connect.mutate(draft, {
      onSuccess: async () => {
        // 连上之后立刻把输入框清空：那条串已经进 SecureStore 了，
        // 让它继续留在一个屏幕上（还可能是明文）没有任何好处
        setDraft('');
        setRevealed(false);
        setEditing(false);

        // 连库只是第一步，账号才是第二步。**直接把人送过去**，不要求他自己发现
        // 下面还有一张卡——库里有没有账号这件事这里已经问得出来，
        // 让用户再判断一次「我该点登录还是注册」是多余的
        try {
          const probe = await probeAccounts();
          router.push(probe.total > 0 && !probe.legacyId ? '/login' : '/register');
        } catch {
          // 探测失败（网络断在这一下）就留在本页，下面那张卡照样给两个入口
        }
      },
      onError: (connectError) => setError((connectError as Error).message),
    });
  };

  /**
   * 断开要二次确认，但确认文案的重点是**它不会删数据**。
   *
   * 这个弹窗存在的理由不是"防止误触"，是防止另一种更常见的误解：
   * 以为断开会把云端的账一起清掉，于是不敢点。说清楚之后，
   * 真正不可逆的那件事（删库）被明确推给了 Neon 控制台。
   */
  const handleDisconnect = () => {
    Alert.alert(
      '断开云端？',
      '只会清掉这台手机上存的连接串和登录状态，云端的账单一条都不会动。把连接串再粘一次就能连回来。',
      [
        { text: '取消', style: 'cancel' },
        { text: '断开', style: 'destructive', onPress: () => disconnect.mutate() },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {isLoading ? (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <ActivityIndicator color={theme.cardHighlight} />
            </View>
          ) : null}

          {session && status && !editing ? (
            <ConnectedPanel
              status={status}
              session={session}
              onSwitch={() => {
                setEditing(true);
                setError(null);
              }}
              onDisconnect={handleDisconnect}
              disconnecting={disconnect.isPending}
            />
          ) : null}

          {/* 已经登录、但云端那一侧读不出来（库被删了、密码改了、Neon 在维护）。
              这时候**不把页面退回未连接状态**：连接串还在手机上，退回去会让用户
              以为得重新找一条。只说这次读不到 */}
          {session && statusError && !editing ? (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="default" style={{ color: theme.expense }}>
                云端读不出来
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {(statusError as Error).message}
              </ThemedText>
            </View>
          ) : null}

          {needsAccount ? <NeedsAccountCard /> : null}

          {showConnectionForm ? (
            <>
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="default">连一个自己的数据库</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  账单会备份到你自己的 Neon 库里，不经过任何别人的服务器。下面这条连接串
                  就是这个库的钥匙，连上之后再在库里注册一个账号。
                </ThemedText>
              </View>

              <View style={styles.group}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.groupLabel}>
                  连接串
                </ThemedText>
                <View style={[styles.inputRow, { backgroundColor: theme.backgroundElement }]}>
                  <TextInput
                    value={draft}
                    onChangeText={(next) => {
                      setDraft(next);
                      setError(null);
                    }}
                    placeholder="postgresql://..."
                    placeholderTextColor={theme.textSecondary}
                    // 连接串里有密码，默认遮起来；但要给一个看得见的开关——
                    // 粘贴完全靠手感的话，粘错了要等到「连接」失败才知道
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
                    连接并建表
                  </ThemedText>
                )}
              </Pressable>

              {editing ? (
                <Pressable onPress={() => setEditing(false)} style={styles.ghost}>
                  <ThemedText type="small" themeColor="textSecondary">
                    取消，保留现在这条
                  </ThemedText>
                </Pressable>
              ) : null}

              <Steps />
            </>
          ) : null}

          <Warnings />
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

/**
 * 库连上了，还差一个账号。
 *
 * 这里**只给入口，不放表单**：注册和登录是两个独立页面（`app/register.tsx` / `app/login.tsx`），
 * 从「我的」页那张备份卡也能走到同一个地方。同一张表单在两处各写一遍，
 * 迟早有一处忘了改——上一版就是这么长出来的。
 */
function NeedsAccountCard() {
  const theme = useTheme();

  return (
    <>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.cardHead}>
          <Ionicons name="lock-closed-outline" size={20} color={theme.cardHighlight} />
          <ThemedText type="default" style={styles.grow}>
            还差一步：进一本账
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          库已经连上了。账号建在这个库里面，决定备份进哪一本账——一个库可以放好几本，
          家里两个人各记各的也行。
        </ThemedText>
      </View>

      <Pressable
        onPress={() => router.push('/register')}
        style={[styles.primary, { backgroundColor: theme.cardHighlight }]}>
        <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
          在这个库里注册
        </ThemedText>
      </Pressable>

      <Pressable onPress={() => router.push('/login')} style={styles.ghost}>
        <ThemedText type="small" themeColor="textSecondary">
          已经有账号了，去登录
        </ThemedText>
      </Pressable>
    </>
  );
}

function ConnectedPanel({
  status,
  session,
  onSwitch,
  onDisconnect,
  disconnecting,
}: {
  status: NonNullable<ReturnType<typeof useRemoteStatus>['data']>;
  session: CloudSession;
  onSwitch: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const theme = useTheme();
  const signOut = useSignOutCloud();

  return (
    <>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.cardHead}>
          <Ionicons name="cloud-done-outline" size={20} color={theme.cardHighlight} />
          <ThemedText type="default" style={styles.grow}>
            已连接
          </ThemedText>
        </View>
        {/* 主机名而不是整条连接串：这一屏可能被截图、可能有人在旁边。
            主机名足够回答"我连的是不是那个库"，邮箱足够回答"我在哪本账里" */}
        <ThemedText type="small" themeColor="textSecondary">
          {status.host}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {session.email}
        </ThemedText>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" themeColor="textSecondary">
          云端现在有
        </ThemedText>
        <Line label="账单" value={`${status.transactions} 笔`} />
        <Line label="分类" value={`${status.categories} 个`} />
        <Line label="账户" value={`${status.accounts} 个`} />
        <Line label="上次推送" value={status.lastPushAt ? formatMoment(status.lastPushAt) : '从没'} />
      </View>

      <Pressable onPress={onSwitch} style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="swap-horizontal-outline" size={20} color={theme.cardHighlight} />
        <View style={styles.rowText}>
          <ThemedText type="default">换一条连接串</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            换到另一个库，或者重新粘一条修好过的
          </ThemedText>
        </View>
      </Pressable>

      {/* 退出账号和断开库分成两个按钮：同一个库里换一本账（家里两个人共用一个 project）
          是个日常操作，不该逼人把连接串再粘一遍 */}
      <Pressable
        onPress={() => signOut.mutate(undefined)}
        disabled={signOut.isPending}
        style={[styles.row, { backgroundColor: theme.backgroundElement }, signOut.isPending && styles.dimmed]}>
        <Ionicons name="person-outline" size={20} color={theme.cardHighlight} />
        <View style={styles.rowText}>
          <ThemedText type="default">退出这个账号</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            连接串留着，换个账号登进去就能用另一本账
          </ThemedText>
        </View>
      </Pressable>

      <Pressable
        onPress={onDisconnect}
        disabled={disconnecting}
        style={[styles.row, { backgroundColor: theme.backgroundElement }, disconnecting && styles.dimmed]}>
        <Ionicons name="log-out-outline" size={20} color={theme.expense} />
        <View style={styles.rowText}>
          <ThemedText type="default" style={{ color: theme.expense }}>
            断开
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            只清这台手机上的连接串，云端的账一条都不动
          </ThemedText>
        </View>
      </Pressable>
    </>
  );
}

/** 拿连接串的三步。写在 App 里而不是丢一条文档链接：这是挡在功能前面唯一的门槛 */
function Steps() {
  const theme = useTheme();
  const steps = [
    '去 neon.tech 注册一个免费账号',
    '建一个 project（地区随便选，离你近的快一点）',
    '在 Dashboard 上点 Connection string，先点「Show password」，再复制一整条',
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary">
        连接串在哪拿
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
 * 三条提醒。它们不是免责声明，是**用户真的会踩到的三件事**：
 * 丢了取不回、别外传、断开不等于删库。每一条都短，因为写长了就没人看。
 */
function Warnings() {
  const theme = useTheme();
  const items: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
    {
      icon: 'key-outline',
      text: '连接串要自己保管好。丢了就取不回云端的备份——没有服务器能证明你是你，所以没有「忘记密码」这条路，账号密码也一样。',
    },
    {
      icon: 'eye-off-outline',
      text: '别把它发给任何人，也别贴进截图或者聊天窗口。拿到它的人能读走你全部的账，账号密码拦不住。导出的备份文件里不含这条串。',
    },
    {
      icon: 'phone-portrait-outline',
      text: '换手机：新手机上粘同一条连接串，用同一个账号登进去，再点「恢复」就行。',
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

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <ThemedText type="default">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {value}
      </ThemedText>
    </View>
  );
}

function formatMoment(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingVertical: Spacing.four, gap: Spacing.three },
  grow: { flex: 1 },
  card: { padding: Spacing.three, borderRadius: 12, gap: Spacing.one },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
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
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primary: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ghost: { height: 40, alignItems: 'center', justifyContent: 'center' },
  switchRow: { alignItems: 'center' },
  dimmed: { opacity: 0.4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepIndex: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
