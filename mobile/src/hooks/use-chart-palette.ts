import { chartPalette, type ChartPalette } from '@/constants/chart-palette';
import { ThemeScheme } from '@/constants/theme';
import { useThemeStore } from '@/store/theme.store';

/**
 * 当前主题该用哪套分类色板。
 *
 * 看的是 `ThemeScheme`（light / dark）而不是主题名：三套主题里有两套是深色的，
 * 它们共用同一组步进——真正决定颜色怎么取的是底色是黑还是白，不是强调色是金还是紫。
 * 以后再加一套深色主题，这里一行都不用改。
 *
 * 跟 useTheme 分开：那个返回的是**主题色板**（文字、底色、强调色），
 * 这个返回的是**数据色板**。两者的取值规则完全不同——主题色是设计选的，
 * 数据色是按色觉障碍区分度算出来的（见 constants/chart-palette），混在一起会让人
 * 以为数据色也可以随便调。
 */
export function useChartPalette(): ChartPalette {
  const themeName = useThemeStore((s) => s.themeName);
  return chartPalette(ThemeScheme[themeName] === 'dark');
}
