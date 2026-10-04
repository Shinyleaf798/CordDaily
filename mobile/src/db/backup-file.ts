import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { buildBackup, buildCsv, type BackupRange } from './backup';
import { markFileBackupDone } from './settings';

/**
 * 备份文件怎么出去、怎么进来。
 *
 * 放在 `db/` 而不是 `utils/`：它跟 `backup.ts` 是同一件事的两半（一个管内容、一个管搬运），
 * 而 `utils/` 按约定放的是纯函数。
 *
 * **写到缓存目录 + 系统分享面板**，不往相册或公共目录写：这样不需要任何存储权限，
 * 也不会在用户的文件系统里留下他没同意过的东西。存哪儿由他在分享面板里决定
 * （云盘、聊天软件、本地文件夹都行）。缓存目录里那份由系统在空间紧张时自己清掉。
 */

function stamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type ExportFormat = 'json' | 'csv';

export type ExportResult = {
  /** 用户实际点了分享才算导出成功；点了取消返回 false，「上次备份」不会往前跳 */
  shared: boolean;
  fileName: string;
};

export async function exportToFile(format: ExportFormat, range: BackupRange = {}): Promise<ExportResult> {
  const fileName =
    format === 'json' ? `corddaily-backup-${stamp()}.json` : `corddaily-${stamp()}.csv`;

  const content = format === 'json' ? JSON.stringify(await buildBackup(range)) : await buildCsv(range);

  const file = new File(Paths.cache, fileName);
  // overwrite 必须显式开：同一天导第二次时文件已经在了，默认的 create() 会直接抛错
  file.create({ overwrite: true });
  file.write(content);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('这台设备没有可用的分享方式，没法把文件交出去');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: format === 'json' ? 'application/json' : 'text/csv',
    dialogTitle: format === 'json' ? '保存备份文件' : '保存账单表格',
    UTI: format === 'json' ? 'public.json' : 'public.comma-separated-values-text',
  });

  // shareAsync 在两个平台上都区分不出"真的存下来了"和"打开面板又划掉了"，
  // 所以这里只能当作成功。宁可把"上次备份"记早一点，也好过用户明明存了却一直显示从没备份过
  await markFileBackupDone();

  return { shared: true, fileName };
}

export type PickedFile = { name: string; text: string };

/**
 * 让用户挑一个备份文件。取消返回 null——那是正常操作，不是错误。
 *
 * **用 expo-file-system 自带的 picker，不用 expo-document-picker。** 后者在 Android 上会把
 * 选中的文件拷进 `cacheDir/DocumentPicker/`，再交给我们 `new File(file://...)` 去读——
 * 而新版 FileSystem 对 `file://` 路径要查权限：`FilePermissionService` 只放行
 * `filesDir` / `cacheDir`，但那个类是 `open` 的，**Expo Go 继承它之后收窄到了自己那个
 * scoped experience 目录**，裸 cacheDir 就落在作用域外，于是报
 * 「Missing 'READ' permission for accessing the file」。这个错只在 Expo Go 里出现，
 * 用 dev build 装的同一份代码不会——所以很容易误判成模拟器的权限没开。
 *
 * `File.pickFileAsync()` 返回的是 SAF 的 `content://` uri，而 `checkPermission` 对
 * content uri 是直接放行的（不走路径校验那一支），两种运行方式下都读得到。
 *
 * 不传 `mimeTypes` 就是不限类型：很多文件管理器把 .json 报成 text/plain 或
 * application/octet-stream，限死之后用户会发现自己的备份文件是灰的、点不了。
 * 格式对不对交给 parseBundle 判断，那里给得出「这个文件不是 CordDaily 的备份」这种能看懂的话。
 */
export async function pickBackupFile(): Promise<PickedFile | null> {
  // multipleFiles: false 是为了锁住重载——不传参数会落到那个已废弃的 (initialUri, mimeType) 签名上
  const picked = await File.pickFileAsync({ multipleFiles: false });
  if (picked.canceled) return null;

  const file = picked.result;
  return { name: file.name, text: await file.text() };
}
