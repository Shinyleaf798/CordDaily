import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { authScreenStyles as styles } from './auth-screen.styles';

/**
 * 登录页和注册页在**还没连数据库**时显示的东西。
 *
 * 这两页的账号建在用户自己那个 Neon 库里，所以没有连接串的时候它们连去哪儿验密码都不知道。
 * 让表单照样显示、等用户填完再报一句「还没连接云端数据库」是最差的做法——
 * 他会以为是密码错了。直接把表单换掉，只给一条路：先去连库。
 */
export function NeedsConnection() {
  const theme = useTheme();

  return (
    <View style={{ gap: 12 }}>
      <ThemedText type="default" style={styles.title}>
        还没连数据库
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.error}>
        账号是建在你自己的 Neon 库里的，所以得先把库连上。记账不需要这一步，
        只有备份到云端才需要。
      </ThemedText>
      <Pressable
        onPress={() => router.replace('/settings/cloud')}
        style={[styles.button, { backgroundColor: theme.cardHighlight }]}>
        <ThemedText style={[styles.buttonText, { color: theme.onCardHighlight }]}>去连接数据库</ThemedText>
      </Pressable>
    </View>
  );
}
