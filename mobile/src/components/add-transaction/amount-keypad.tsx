import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type AmountKeypadProps = {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saveDisabled?: boolean;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'] as const;

// 数字键盘，自己管键位解释逻辑（点几次小数点、退格怎么删），只通过 value/onChange 跟外部同步当前金额字符串，
// 不知道也不关心这个金额最终要存进哪张表——纯 UI 组件
export function AmountKeypad({ value, onChange, onSave, saveDisabled }: AmountKeypadProps) {
  const theme = useTheme();

  const handleBackspace = () => {
    onChange(value.length > 1 ? value.slice(0, -1) : '0');
  };

  const handleKeyPress = (key: (typeof KEYS)[number]) => {
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
        {KEYS.map((key) => (
          <Pressable key={key} onPress={() => handleKeyPress(key)} style={styles.key}>
            <View style={[styles.keyBox, { borderColor: theme.backgroundSelected }]}>
              <ThemedText type="title" style={styles.keyLabel}>
                {key}
              </ThemedText>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.sideColumn}>
        <Pressable onPress={handleBackspace} style={styles.backspaceKey}>
          <View style={[styles.keyBox, { borderColor: theme.backgroundSelected }]}>
            <Ionicons name="backspace-outline" size={22} color={theme.text} />
          </View>
        </Pressable>

        <Pressable
          onPress={onSave}
          disabled={saveDisabled}
          style={[styles.saveButton, { backgroundColor: theme.accent, opacity: saveDisabled ? 0.5 : 1 }]}>
          <ThemedText style={styles.saveLabel}>保存</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
  grid: {
    flex: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  key: {
    width: '33.33%',
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBox: {
    flex: 1,
    alignSelf: 'stretch',
    margin: 3,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: {
    fontSize: 24,
    lineHeight: 28,
  },
  sideColumn: {
    flex: 1,
    flexDirection: 'column',
  },
  backspaceKey: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flex: 1,
    height: 64 * 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
});
