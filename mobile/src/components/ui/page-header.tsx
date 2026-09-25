import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';

type PageHeaderProps = {
  title: string;
  /** 标题右侧的位置，留给搜索、图表这类页面级入口 */
  right?: ReactNode;
};

/**
 * 底部四个 tab 页共用的顶部标题条。
 *
 * 在这之前每页各写一行 `<ThemedText type="pageTitle">`，字号是一致的（都走 pageTitle），
 * 但**上下占多高**各页说了算——我的那页顶上留 24、其余留 12，切 tab 时标题会上下跳一格。
 * 没人是故意的：一行裸文字的高度是由它所在容器的 padding 和 gap 拼出来的，
 * 而那两个数在每个页面的 styles 里，谁也看不见谁。
 *
 * 所以这里给它一个**写死的高度**：不管字号怎么改、右边挂不挂图标，这一条永远这么高。
 * 高度 44 = pageTitle 的 lineHeight 34 + 上下各 5 的呼吸，同时也正好是触控目标的常规尺寸，
 * 以后右边真放按钮进来，不用再调整这一条的高度。
 *
 * 它不认识任何业务概念（只有一个字符串和一个插槽），所以归 ui/ 而不是某个页面目录。
 */
export function PageHeader({ title, right }: PageHeaderProps) {
  return (
    <View style={styles.header}>
      <ThemedText type="pageTitle">{title}</ThemedText>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
