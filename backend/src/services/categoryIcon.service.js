import prisma from "../config/prisma.js";
import { ApiError } from "../utils/response.js";

/**
 * 用户自己上传的分类图标。**图片本体存在 Neon 里**（`CategoryIcon.data`，bytea），
 * 不走图床——为什么这里对「图片只存网址」破例，理由写在 schema.prisma 那个 model 上面。
 *
 * 三个动作：**问云端已经有哪些**（manifest）、**把缺的传上去**、**按名字取回几张**。
 *
 * 最后那个是后加的。原来没有，理由是"需要图片的场景只有一个——重装后的首次恢复，
 * 那一刻本来就要拉整包"。这个前提后来不成立了：手机端点备份时会先拉一遍云端的分类合并回本地
 * （见 mobile/src/db/sync-merge.ts），那一步会把一行 `icon = custom:xxx.jpg` 带下来，
 * 而它**不拉整包**——没有取回单张的路，用户看到的就是一个指向空气的引用（一个 📦）。
 */

/**
 * `Category.icon` 里表示"用户上传的图"的前缀。
 *
 * 这是服务器唯一一处**认得 icon 字段的内部写法**的地方——别处都把它当一个不透明的字符串转发。
 * 破这个例是因为清理绕不开：要知道哪张图没人用了，只能自己去读那一列。
 * 跟手机端 `constants/category-icons.ts` 里的 CUSTOM_PREFIX 必须一致。
 */
const CUSTOM_ICON_PREFIX = "custom:";

/** 单张上限。手机端缩完是 10–20 KB，这个数是给"以后改大尺寸"留的余量，不是常态 */
const MAX_ICON_BYTES = 512 * 1024;
/** 一个账号最多存这么多张。分类总共几十个，超过这个数说明客户端在刷，不是人在用 */
const MAX_ICONS_PER_USER = 200;

/** 只认这两种格式，而且**按字节认，不看客户端说自己是什么** */
const SIGNATURES = [
  { mimeType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mimeType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/**
 * 从文件头认格式。客户端报的 mimeType 一律不信：这些字节以后要原样发给电脑端的浏览器，
 * 一个声称是 image/png 的 HTML 片段就是一个存在数据库里的 XSS。
 * 认不出来就拒绝——我们只有两种来源（手机端 JPEG、以后可能的 PNG），没有第三种需要宽容。
 */
function sniffMimeType(buffer) {
  const match = SIGNATURES.find(
    (signature) =>
      buffer.length > signature.bytes.length &&
      signature.bytes.every((byte, index) => buffer[index] === byte),
  );
  return match ? match.mimeType : null;
}

/**
 * 云端已经有哪些图标，只回名字。
 *
 * 手机端拿它来决定"这次要传哪几张"，所以**不能**把 data 一起回去——
 * 那等于每次备份前先把所有图片下载一遍，只为了知道它们在。
 */
export async function listNames(userId) {
  const rows = await prisma.categoryIcon.findMany({
    where: { userId },
    select: { name: true },
    orderBy: { createdAt: "asc" },
  });
  return { names: rows.map((row) => row.name) };
}

/**
 * 一批图标传上来。**已经在的直接跳过，不覆盖**：文件名是手机端生成的 UUID，
 * 换一张图就是换一个名字（见 mobile/src/db/category-icon-files.ts），
 * 所以同名必然同图，重写一遍只是白白多写一次库。
 *
 * 跟分类批量那条路一样**不包事务**：全是互相独立的插入，
 * 半途失败时手机端不会把它们当成已上传，下次整批重来的结果完全一样。
 */
export async function batchUpload(userId, icons) {
  // **先验完整批再碰数据库。** 校验一个字节都不需要库里的东西，而一批里只要有一张是坏的，
  // 这次调用就整个不算数——为它先查一轮 existing 是白查。
  // 顺带这条失败路径就完全不依赖数据库了，测起来不用先有一个 Neon
  const decoded = icons.map(decodeIcon);

  const existing = await prisma.categoryIcon.findMany({
    where: { userId, name: { in: icons.map((icon) => icon.name) } },
    select: { name: true },
  });
  const alreadyThere = new Set(existing.map((row) => row.name));
  const incoming = decoded.filter((icon) => !alreadyThere.has(icon.name));

  if (incoming.length) {
    const count = await prisma.categoryIcon.count({ where: { userId } });
    if (count + incoming.length > MAX_ICONS_PER_USER) {
      throw new ApiError(400, "TOO_MANY_ICONS", `A user can store at most ${MAX_ICONS_PER_USER} category icons`);
    }
  }

  let inserted = 0;
  for (const { name, mimeType, data } of incoming) {
    await prisma.categoryIcon.create({
      data: { userId, name, mimeType, data, size: data.length },
    });
    inserted += 1;
  }

  return { inserted, skipped: icons.length - incoming.length };
}

/**
 * 一张图从 base64 变成可以直接入库的三件套，顺便把该拒的拒掉。
 *
 * 导出是为了能单独测——这是整个接口里唯一有分支的地方，而它一行数据库都不需要。
 */
export function decodeIcon(icon) {
  const data = Buffer.from(icon.data, "base64");
  if (!data.length) {
    throw new ApiError(400, "INVALID_IMAGE", `Icon ${icon.name} is empty`);
  }
  if (data.length > MAX_ICON_BYTES) {
    throw new ApiError(413, "IMAGE_TOO_LARGE", `Icon ${icon.name} exceeds ${MAX_ICON_BYTES} bytes`);
  }
  const mimeType = sniffMimeType(data);
  if (!mimeType) {
    throw new ApiError(400, "INVALID_IMAGE", `Icon ${icon.name} is not a JPEG or PNG`);
  }
  return { name: icon.name, mimeType, data };
}

/**
 * 整包恢复时要带回去的那些图。给 sync.service.js 用。
 *
 * base64 而不是二进制：这份 bundle 是 JSON，而且要跟手机端导出的 .json 文件**结构完全一样**
 * （CLAUDE.md 原则#3，一份格式两个来源），文件那条路本来就是 base64。
 */
export async function listForBundle(userId) {
  const rows = await prisma.categoryIcon.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    name: row.name,
    mimeType: row.mimeType,
    data: Buffer.from(row.data).toString("base64"),
  }));
}

/**
 * 按名字取回几张图。手机端合并完分类后，拿它把本地缺的那几张补下来。
 *
 * **只回点名要的那几张**，不像 listForBundle 那样整份回去：合并是每次备份都会跑的一步，
 * 而绝大多数时候一张都不缺，缺也就缺刚换的那一两张。
 *
 * 名字对不上的静默忽略，不报错：调用方要的是"把能补的补上"，
 * 为一个云端已经清理掉的孤儿名字让整次备份失败，代价完全不成比例。
 */
export async function listByNames(userId, names) {
  if (!names.length) return [];
  const rows = await prisma.categoryIcon.findMany({
    where: { userId, name: { in: names } },
  });
  return rows.map((row) => ({
    name: row.name,
    mimeType: row.mimeType,
    data: Buffer.from(row.data).toString("base64"),
  }));
}

/**
 * 删掉这个用户名下**没有任何分类在引用**的图标。
 *
 * ## 为什么是服务端自己对账，不是客户端点名删
 *
 * 客户端那条路（本地清掉一个文件就发一个 DELETE）会在错误的时刻开火：
 * 手机在**换完图的当下**就把旧文件清了，而那次改动还没推上云端——
 * 于是云端那行分类还指着旧图，图却先没了。要避开就得给删除排队、等推送成功再发，
 * 那正是「墓碑」那一套机制，而图标在本地根本不是一行记录，套不进去。
 * 服务端对账不需要任何这些：它看的是**自己库里此刻的样子**。
 *
 * ## 为什么触发点必须在「分类推完之后」
 *
 * 备份的顺序是**先传图、后推分类**（手机端 db/sync.ts 里的理由）。所以在
 * `/category-icons/batch` 结束时扫是**致命的**：那一刻新图已经上来了，
 * 而引用它的那行分类还是旧的——刚传上来的图会被当场删掉。
 * 挂在 `/categories/batch` 和 `DELETE /categories/:id` 之后才成立：
 * 这两个时刻云端的分类表就是手机此刻的样子。
 *
 * ## 扫早了也不会烂
 *
 * 万一还是在"图已上传、分类还没推"的窗口里被扫掉（比如上一轮推分类失败了），
 * 下次备份会自动补传——手机端要传哪几张是拿 `GET /category-icons` 的实际情况现算的，
 * 不是查本地台账。最坏情况只是白传一次 15 KB。
 *
 * ## 一张都没在用时，就是全删
 *
 * 显式写成两个分支而不是依赖 `notIn: []`：Prisma 会把空数组的 notIn 优化成恒真，
 * 结果**正好**是删光——对是对的，但让一次全表删除的正确性依赖于一条没人记得的优化规则，
 * 是早晚要出事的写法。
 */
export async function pruneOrphans(userId) {
  const rows = await prisma.category.findMany({
    where: { userId, icon: { startsWith: CUSTOM_ICON_PREFIX } },
    select: { icon: true },
  });
  const inUse = inUseIconNames(rows);

  const { count } = inUse.length
    ? await prisma.categoryIcon.deleteMany({ where: { userId, name: { notIn: inUse } } })
    : await prisma.categoryIcon.deleteMany({ where: { userId } });

  return count;
}

/**
 * 从分类行里挑出还在用的图标文件名。单独拎出来是因为它是这段清理里唯一有判断的地方，
 * 而且一行数据库都不需要——能单独测的那部分就不该埋在一个要连库的函数里。
 *
 * `custom:` 后面是空的（脏数据）要滤掉：留着它会变成一个空字符串名字，
 * 挡不住任何东西，反而让下面走成"有在用的图"分支。
 */
export function inUseIconNames(rows) {
  const names = rows
    .map((row) => (row.icon ?? "").slice(CUSTOM_ICON_PREFIX.length))
    .filter(Boolean);
  return [...new Set(names)];
}
