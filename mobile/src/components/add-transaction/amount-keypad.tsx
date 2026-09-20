import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

type AmountKeypadProps = {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saveDisabled?: boolean;
};

// 按行排而不是用 flexWrap：整块键盘要按"给多少高度就占多少"来缩放，
// 而 wrap 布局里的行没法 flex——每一行必须是一个真的 View 才分得到剩余高度
const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0'],
] as const;

// 数字键盘，自己管键位解释逻辑（点几次小数点、退格怎么删），只通过 value/onChange 跟外部同步当前金额字符串，
// 不知道也不关心这个金额最终要存进哪张表——纯 UI 组件。
// 高度不自己定，完全听外面给的（记账页把它塞进一个 55% 屏高的面板里）
export function AmountKeypad({ value, onChange, onSave, saveDisabled }: AmountKeypadProps) {
  const theme = useTheme();

  const handleBackspace = () => {
    onChange(value.length > 1 ? value.slice(0, -1) : '0');
  };

  const handleKeyPress = (key: string) => {
    if (key === '.') {
      if (value.includes('.')) return;
      onChange(`${value}.`);
      return;
    }
    onChange(value === '0' ? key : `${value}${key}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {ROWS.map((row) => (
          <View key={row.join()} style={styles.row}>
            {row.map((key) => (
              <Pressable key={key} onPress={() => handleKeyPress(key)} style={styles.key}>
                <View style={[styles.keyBox, { borderColor: theme.backgroundSelected }]}>
                  <ThemedText style={styles.keyLabel}>{key}</ThemedText>
                </View>
              </Pressable>
            ))}
            {/* 最后一行只有两个键，补一个空格子占位，免得 0 被拉宽成一行半 */}
            {row.length < 3 ? <View style={styles.key} /> : null}
          </View>
        ))}
      </View>

      <View style={styles.sideColumn}>
        <Pressable onPress={handleBackspace} style={styles.backspaceKey}>
          <View style={[styles.keyBox, { borderColor: theme.backgroundSelected }]}>
            <Ionicons name="backspace-outline" size={20} color={theme.text} />
          </View>
        </Pressable>

        <Pressable
          onPress={onSave}
          disabled={saveDisabled}
          style={[styles.saveButton, { backgroundColor: theme.cardHighlight, opacity: saveDisabled ? 0.5 : 1 }]}>
          <ThemedText style={[styles.saveLabel, { color: theme.onCardHighlight }]}>保存</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // 撑满外面给的高度，四行平分——外面把面板调成屏高的百分之多少，这里跟着变
    flex: 1,
    flexDirection: 'row',
  },
  grid: {
    flex: 3,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  key: {
    flex: 1,
  },
  keyBox: {
    flex: 1,
    margin: 3,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
  },
  sideColumn: {
    flex: 1,
  },
  backspaceKey: {
    flex: 1,
  },
  // 保存键占三行高：它是这一页唯一的终点，比退格更该大
  saveButton: {
    flex: 3,
    margin: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: {
    fontWeight: '700',
    fontSize: 16,
  },
});
