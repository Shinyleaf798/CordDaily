import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { getSetting, removeSetting, setSetting } from './settings';

/**
 * 账号头像：从相册到沙盒，再到云端 `User.avatar` 那一列。
 *
 * ## 跟分类图标是同一套做法，但不共用代码
 *
 * 缩图、落沙盒、只在库里存文件名——都跟 `category-icon-files.ts` 一样，理由也一样
 * （那边文件头写得很全）。没有抽成公共函数是因为两者的**尺寸和数量级不同**：
 * 分类图标有几十张、34 点见方；头像只有一张、52 点但会被点开看。
 * 硬合一个函数就要开始传参数决定 max 像素、目录名、清理策略，
 * 读起来比两份各自直白的代码更难。
 *
 * ## 为什么本地存文件、云端存 bytea
 *
 * 本地跟分类图标同理：图片不进 SQLite，不然每次读设置都拖着一张图。
 * 云端那边反过来——`User` 就一行，一张头像跟着它走最省事，
 * 不用再为「一个文件」单独建一张表和一套引用关系。
 *
 * ## 不登录也能有头像
 *
 * 头像存在本地设置里，**没有云端账号照样能换**（CLAUDE.md 原则 1）。
 * 有账号时它会跟着备份推上去，换手机恢复时拉回来——但那是附带的，不是前提。
 */

/** 缩放后长边的像素上限。52 点的头像框在 3 倍屏上是 156 px，256 留了余量给以后放大显示 */
const AVATAR_MAX_PX = 256;
const AVATAR_QUALITY = 0.85;
const AVATAR_DIR_NAME = 'avatar';

/** 当前头像的文件名。跟分类图标一样，SQLite 里只存名字，图在文件系统 */
const AVATAR_FILE_KEY = 'avatarFile';
/** 上一次推到云端的是哪个文件名。换了图才重推，没换就不用把几十 KB 再发一遍 */
const AVATAR_PUSHED_KEY = 'avatarPushedFile';

// 每次现算，不缓存成模块级常量：iOS 每次装 App 都换一个沙盒容器 id
function avatarDir(): Directory {
  return new Directory(Paths.document, AVATAR_DIR_NAME);
}

function avatarFile(name: string): File {
  return new File(avatarDir(), name);
}

/** 现在这张头像的 uri，没设过返回 null。渲染层拿它喂给 expo-image */
export async function getAvatarUri(): Promise<string | null> {
  const name = await getSetting(AVATAR_FILE_KEY);
  if (!name) return null;
  const file = avatarFile(name);
  // 文件没了（用户清过数据、恢复只写了库没写图）就当没设过，而不是给出一个加载不出来的 uri
  return file.exists ? file.uri : null;
}

/**
 * 让用户挑一张图当头像，返回新的 uri；取消返回 null——那是正常操作，不是错误。
 *
 * 权限被拒时抛一句人话。这里**不自己弹二次请求**：系统的权限框一辈子只弹一次，
 * 之后再问都是静默拒绝，唯一的出路是系统设置，所以那句话得说清去哪儿开。
 */
export async function pickAvatar(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('没有相册权限。去系统设置里给 CordDaily 打开「照片」，再回来选图');
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // 头像框是圆的，先让系统裁剪框把图切成方的——事后盲切一刀常常把人脸切掉一半
    allowsEditing: true,
    aspect: [1, 1],
    // 这里不压，缩完再压。压两次是把已经有损的图再损一遍
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.length) return null;

  return saveAvatarFromUri(picked.assets[0].uri);
}

/** 缩小、转 JPEG、落沙盒、记进设置。返回新文件的 uri */
async function saveAvatarFromUri(uri: string): Promise<string> {
  // 先空跑一次拿真实尺寸：picker 给的 width/height 在裁剪框被某些 Android 图库跳过时是原图尺寸
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const landscape = source.width >= source.height;
  const rendered = await ImageManipulator.manipulate(source)
    .resize(landscape ? { width: AVATAR_MAX_PX } : { height: AVATAR_MAX_PX })
    .renderAsync();
  const resized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: AVATAR_QUALITY });

  const dir = avatarDir();
  if (!dir.exists) dir.create({ intermediates: true });

  // 新文件名而不是覆盖：同名覆盖会让屏幕上那张旧图因为 expo-image 的缓存继续显示，
  // 用户会以为换图没生效。旧的那张在下面顺手删掉——头像只有一张，不需要对账式清理
  const name = `${Crypto.randomUUID()}.jpg`;
  await new File(resized.uri).move(avatarFile(name));

  const previous = await getSetting(AVATAR_FILE_KEY);
  await setSetting(AVATAR_FILE_KEY, name);
  if (previous) deleteQuietly(previous);

  return avatarFile(name).uri;
}

/** 换回字母头像。文件和设置一起清，云端那一列下次备份时跟着置空 */
export async function clearAvatar(): Promise<void> {
  const name = await getSetting(AVATAR_FILE_KEY);
  await removeSetting(AVATAR_FILE_KEY);
  if (name) deleteQuietly(name);
}

/** 删一个文件，失败当没发生：留一个孤儿文件比让「换头像」整个失败强 */
function deleteQuietly(name: string): void {
  try {
    const file = avatarFile(name);
    if (file.exists) file.delete();
  } catch {
    /* 忽略 */
  }
}

/**
 * 这次备份要不要推头像，要推的话推什么。
 *
 * 返回 `null` 表示**这次不用管**（没换过图）；返回 `{ data: null }` 表示用户把头像删了，
 * 云端那一列也该清掉。两种"没有"必须分得开，不然删头像这件事永远同步不出去。
 */
export async function getAvatarPushPayload(): Promise<{ data: string | null } | null> {
  const [name, pushed] = await Promise.all([getSetting(AVATAR_FILE_KEY), getSetting(AVATAR_PUSHED_KEY)]);
  if (name === pushed) return null;

  if (!name) return { data: null };

  const file = avatarFile(name);
  if (!file.exists) return null;
  return { data: await file.base64() };
}

/** 推成功之后记一笔，下次同一张图就不再发了 */
export async function markAvatarPushed(): Promise<void> {
  const name = await getSetting(AVATAR_FILE_KEY);
  if (name) await setSetting(AVATAR_PUSHED_KEY, name);
  else await removeSetting(AVATAR_PUSHED_KEY);
}

/**
 * 把云端那张头像写回本地。**本地已经有就不动**——恢复只新增、不覆盖，
 * 跟整个恢复流程的口径一致（见 db/backup.ts）。
 */
export async function restoreAvatar(base64: string): Promise<boolean> {
  if (!base64) return false;
  if (await getSetting(AVATAR_FILE_KEY)) return false;

  const dir = avatarDir();
  if (!dir.exists) dir.create({ intermediates: true });

  const name = `${Crypto.randomUUID()}.jpg`;
  const file = avatarFile(name);
  file.create();
  file.write(base64, { encoding: 'base64' });

  await setSetting(AVATAR_FILE_KEY, name);
  // 刚从云端拉下来的，不必再推回去
  await setSetting(AVATAR_PUSHED_KEY, name);
  return true;
}
