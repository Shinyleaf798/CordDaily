import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { customIconFileName, customIconRef } from '@/constants/category-icons';

import { getDb } from './client';

/**
 * 用户自己上传的分类图标，从相册到沙盒再到备份包的全程。
 *
 * 放 `db/` 而不是 `utils/`：它跟 `backup-file.ts` 是同一类东西——"一份要跟数据库对得上的
 * 本地存储"，而 `utils/` 按约定只放纯函数。选图这件事也留在这里，跟那边
 * DocumentPicker 留在 `backup-file.ts` 是同一个理由：挑文件和存文件是一件事的两半，
 * 拆开之后两边都得知道对方的格式约定。
 *
 * **存进沙盒的是缩过的副本，不是相册里那张原图。** 一张手机拍的照片 3–5 MB，
 * 而它最终出现在屏幕上的尺寸是 34 点见方。不缩的代价有三笔：沙盒被几十 MB 的图占着、
 * 每次导出备份都要把它们整个 base64 塞进 JSON、列表滚动时解码整张大图。
 * 缩到 {@link ICON_MAX_PX} 之后单张在 10–20 KB，上面三件事就都不成立了。
 *
 * **图片不进数据库。** SQLite 里那一行只存 `custom:文件名`（见 constants/category-icons.ts），
 * 二进制留在文件系统。塞进 BLOB 的话，每次 `SELECT * FROM categories`——记账页、管理页、
 * 账单列表的 JOIN 全都在做——都会把几十张图一起读进内存。
 */

/** 缩放后长边的像素上限。34 点的图标框在 3 倍屏上是 102 px，192 留了足够余量，再大就是浪费 */
const ICON_MAX_PX = 192;
/** JPEG 压缩质量。0.8 在这个尺寸下肉眼看不出损失，文件却比 1.0 小一半 */
const ICON_QUALITY = 0.8;
const ICON_DIR_NAME = 'category-icons';

/**
 * 图标目录。**每次现算，不缓存成模块级常量**：iOS 每次装 App 都换一个沙盒容器 id，
 * 缓存下来的绝对路径在升级后就指向一个不存在的地方了。
 */
function iconsDir(): Directory {
  return new Directory(Paths.document, ICON_DIR_NAME);
}

function iconFile(fileName: string): File {
  return new File(iconsDir(), fileName);
}

/** `custom:a1b2.jpg` 里那个文件名 → 这台设备上此刻的完整 uri。渲染层拿它去加载图片 */
export function customIconUri(fileName: string): string {
  return iconFile(fileName).uri;
}

/**
 * 挡住备份包里伪造的文件名。包是用户从文件管理器挑进来的，内容完全可以是手改的，
 * 一个 `../../../databases/corddaily.db` 就能让恢复往沙盒外面写。
 * 文件名只允许是我们自己生成的那个形状：UUID + 扩展名。
 */
function isSafeIconFileName(name: string): boolean {
  // 跟后端 controllers/categoryIcon.controller.js 里那条**逐字一致**：
  // 同一个名字要同时当 SQLite 的值、手机沙盒里的文件名、和 Postgres 的主键，
  // 两边的门宽度不一样的话，总有一天会有一个名字在这边进得来、在那边进不去
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && name.length <= 120;
}

/**
 * 让用户从相册挑一张图当分类图标，返回可以直接写进 `categories.icon` 的引用；
 * 用户中途取消返回 null——那是正常操作，不是错误。
 *
 * 权限被拒时抛一句人话。这里**不自己弹二次请求**：系统的权限框一辈子只弹一次，
 * 之后再问都是静默拒绝，唯一的出路是系统设置，所以那句话得说清去哪儿开。
 */
export async function pickCustomCategoryIcon(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('没有相册权限。去系统设置里给 CordDaily 打开「照片」，再回来选图');
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // 先让系统的裁剪框把图切成方的：图标位是方的，与其我们事后盲切一刀，
    // 不如让用户自己决定哪半张脸留下
    allowsEditing: true,
    aspect: [1, 1],
    // 这里不压，缩完再压。压两次是把已经有损的图再损一遍，白白多一层噪点
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.length) return null;

  return importIconFromUri(picked.assets[0].uri);
}

/**
 * 从**文件**里挑一张，返回同样的引用；取消返回 null。
 *
 * 为什么相册之外还要这一条：系统相册选择器（`PickVisualMedia`）给的是「照片库」——
 * `DCIM/` 和 `Pictures/`，**看不见 `Download/`**。而分类图标最常见的来源恰恰是
 * "上网搜一个品牌 logo 下载下来"，那张图就落在 `Download/`，在相册里一辈子找不到。
 *
 * 走 expo-document-picker（`ACTION_OPEN_DOCUMENT`）而不是 image-picker 的 `legacy` 选项：
 * 后者发的是 `ACTION_GET_CONTENT`，而 Android 13+ 会把图片类的 `GET_CONTENT` 重定向回
 * 相册选择器——那等于没改。`OPEN_DOCUMENT` 不在重定向范围内，而且同样一个权限都不要
 * （拿到的是一次性的 uri 授权）。备份文件也是用这个包挑的，不是新依赖。
 *
 * 代价：这条路没有系统裁剪框，非方形的图会在显示时按 cover 裁。
 * logo 基本都是方的，为这条路单独做一个裁剪界面不划算。
 */
export async function pickCustomCategoryIconFromFile(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: 'image/*',
    // 必须复制到缓存：SAF 给的 content:// uri 是一次性授权，
    // 而我们接下来要把它交给 ImageManipulator，那已经是另一个进程边界了
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.length) return null;

  return importIconFromUri(picked.assets[0].uri);
}

/**
 * 两个入口共用的后半段：缩小、转 JPEG、落进沙盒，返回 `custom:文件名`。
 *
 * 合成一个函数不只是省几行——两条路**必须**产出完全一样的东西。
 * 各写一遍的话，迟早出现"从相册传的图是 192px，从文件传的是原图"这种只在某条路上才有的毛病。
 */
async function importIconFromUri(uri: string): Promise<string> {
  // 先空跑一次拿真实尺寸。不用 picker 返回的 width/height：文件那条路根本没有这两个值，
  // 而且相册那条路在裁剪框被某些 Android 图库跳过时给的是原图尺寸——两边都不可靠
  const source = await ImageManipulator.manipulate(uri).renderAsync();

  // 只锁长边，另一边按比例走。两边都锁的话，非方形的图会被压扁成方的，文字和人脸全变形
  const landscape = source.width >= source.height;
  const rendered = await ImageManipulator.manipulate(source)
    .resize(landscape ? { width: ICON_MAX_PX } : { height: ICON_MAX_PX })
    .renderAsync();
  const resized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: ICON_QUALITY });

  const dir = iconsDir();
  if (!dir.exists) dir.create({ intermediates: true });

  // 每次挑图都是一个新文件名，**不复用旧的**：同名覆盖会让还在屏幕上的那张旧图
  // 因为 expo-image 的缓存而继续显示——用户会以为换图没生效。
  // 代价是换一次图留一个孤儿文件，由 pruneUnusedCategoryIcons 收走
  const fileName = `${Crypto.randomUUID()}.jpg`;
  // move 不是 copy：缩放后的那份在缓存目录里，是个中间产物，没有留下的理由
  await new File(resized.uri).move(iconFile(fileName));

  return customIconRef(fileName);
}

/**
 * 扫一遍图标目录，删掉当前没有任何分类在用的文件。
 *
 * **对账式清理，不是"改一条删一条"。** 图标会在好几个地方变成孤儿：换了一张图、
 * 把图标改回内置的、删掉整个分类、在编辑框里选完图又点了取消。逐个出口去删的写法
 * 要求每个出口都记得，而漏掉任何一个都是永久泄漏、且事后看不出来。
 * 以数据库为准反过来对一次账，逻辑只有一份，而且能把历史上已经漏掉的一并收走。
 *
 * 目录不存在（从没传过图的用户）时立刻返回，代价为零。
 */
export async function pruneUnusedCategoryIcons(): Promise<number> {
  const dir = iconsDir();
  if (!dir.exists) return 0;

  const inUse = new Set(await listUsedCategoryIconNames());

  let removed = 0;
  for (const entry of dir.list()) {
    if (entry instanceof Directory) continue;
    if (inUse.has(entry.name)) continue;
    entry.delete();
    removed += 1;
  }
  return removed;
}

/**
 * 此刻真的有分类在用的图标文件名。
 *
 * 备份和清理都要问这个问题，而且必须是**同一个答案**：两边各写一遍 SQL 的话，
 * 某一天改了 icon 的写法，清理那边会开始删备份那边还要用的文件。
 */
export async function listUsedCategoryIconNames(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ icon: string | null }>(
    "SELECT icon FROM categories WHERE icon LIKE 'custom:%'",
  );
  const names = rows.map((row) => customIconFileName(row.icon)).filter((name): name is string => !!name);
  return [...new Set(names)];
}

/**
 * 沙盒里现在有哪些图标文件，**刚传的在最前**。
 *
 * 跟 listUsedCategoryIconNames 不是同一个问题，两个都要：那个问"库里还有谁在引用"
 * （备份和清理要的答案），这个问"盘上现在有哪些图"。差别正是**刚挑完、还没点保存的那一张**——
 * 它此刻在 categories 表里查不到，而选择器必须立刻把它摆在第一格。
 *
 * 同步的：`Directory.list()` 本来就是同步 API（pruneUnusedCategoryIcons 也这么用它）。
 * 目录不存在或者读不动就当空的——选择器少列几张图，不该让整张弹层打不开。
 */
export function listCustomIconFiles(): string[] {
  try {
    const dir = iconsDir();
    if (!dir.exists) return [];
    return dir
      .list()
      .filter((entry): entry is File => entry instanceof File)
      // 按修改时间倒序：刚传的那张要落在第一格，否则用户得在几十张里找自己两秒前选的图。
      // modificationTime 是可选字段（平台不给就没有），取不到的沉底
      .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0))
      .map((file) => file.name);
  } catch {
    return [];
  }
}

/** 备份包里一张图标的样子：文件名 + base64 的图片内容 */
export type CategoryIconBlob = { name: string; data: string; mimeType?: string };

/**
 * 把这些 icon 值里用到的自定义图读成 base64，塞进备份包。
 *
 * **图必须跟着包走**（CLAUDE.md 原则#3：备份包要自解释）。只备份 `custom:a1b2.jpg`
 * 这个字符串的话，重装恢复后每个自定义图标都是一个指向空气的引用——用户看到的是
 * 一排 📦，而且无从知道当初那张图是什么。
 *
 * 文件不在了就跳过，不报错：恢复一份缺了图的账，比因为一张图标失败而整个导不出来强得多。
 */
export async function collectCategoryIconBlobs(icons: (string | null | undefined)[]): Promise<CategoryIconBlob[]> {
  const names = icons.map((icon) => customIconFileName(icon)).filter((name): name is string => !!name);
  return readCategoryIconBlobs([...new Set(names)]);
}

/** 按文件名读。云端上传那条路已经知道要传哪几个名字了，不必绕一圈 icon 字符串 */
export async function readCategoryIconBlobs(names: string[]): Promise<CategoryIconBlob[]> {
  const blobs: CategoryIconBlob[] = [];
  for (const name of names) {
    const file = iconFile(name);
    if (!file.exists) continue;
    blobs.push({ name, data: await file.base64() });
  }
  return blobs;
}

/**
 * 把包里的图标写回沙盒。**已经在的不动**：同名文件必然是同一张图（名字是 UUID），
 * 重写一遍只会让同一份数据多走一次磁盘。
 *
 * 写文件**不在恢复那个 SQLite 事务里**，也不可能在——文件系统没有回滚。
 * 所以顺序是先落图、后写库：反过来的话，事务提交和写图之间任何一次闪退都会留下
 * 一批指向空气的引用；而先落图、库没写成，留下的只是几个孤儿文件，下次对账就收走了。
 */
export async function restoreCategoryIconBlobs(blobs: CategoryIconBlob[]): Promise<number> {
  if (!blobs.length) return 0;

  const dir = iconsDir();
  if (!dir.exists) dir.create({ intermediates: true });

  let written = 0;
  for (const blob of blobs) {
    if (!blob?.name || !blob?.data || !isSafeIconFileName(blob.name)) continue;
    const file = iconFile(blob.name);
    if (file.exists) continue;
    file.create();
    file.write(blob.data, { encoding: 'base64' });
    written += 1;
  }
  return written;
}
