import { z } from "zod";
import * as categoryIconService from "../services/categoryIcon.service.js";
import { ok } from "../utils/response.js";

/**
 * 名字必须长成手机端生成的那个样子。它会被手机端当成**文件名**写进沙盒
 * （`category-icons/<name>`），所以 `../` 这种东西一个都不能放进来——
 * 手机端恢复时自己也挡了一道，两边都挡是因为这两道门将来不一定同时在。
 */
const nameSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Icon name may only contain letters, digits, dot, dash and underscore");

const iconSchema = z.object({
  name: nameSchema,
  // 标准 base64。不校验的话非法字符会被 Buffer.from 悄悄吞掉，
  // 存进去的是一张解不开的图，而错误要等几个月后恢复时才显形
  data: z.string().min(1).regex(/^[A-Za-z0-9+/]+={0,2}$/, "data must be standard base64"),
  // 客户端说自己是什么只是参考，真正算数的是文件头（见 service 里的 sniffMimeType）
  mimeType: z.string().optional(),
});

// 上限 20 张一批。手机端一次备份要传的通常是 1–2 张（只有新加的那几张），
// 给一个量级的余量就够——请求体里是图片，放宽的代价是真金白银的内存
const batchSchema = z.object({ icons: z.array(iconSchema).min(1).max(20) });

export async function list(req, res, next) {
  try {
    ok(res, await categoryIconService.listNames(req.userId));
  } catch (err) {
    next(err);
  }
}

// 取回用 POST 不用 GET，因为名字是一串 UUID：20 个就一千多字符，
// 塞进查询串要闯代理和服务器各自的 URL 长度限制，而这条路没有任何缓存价值可言
const fetchSchema = z.object({ names: z.array(nameSchema).min(1).max(50) });

export async function fetchByNames(req, res, next) {
  try {
    const { names } = fetchSchema.parse(req.body);
    ok(res, { icons: await categoryIconService.listByNames(req.userId, names) });
  } catch (err) {
    next(err);
  }
}

export async function batchUpload(req, res, next) {
  try {
    const { icons } = batchSchema.parse(req.body);
    ok(res, await categoryIconService.batchUpload(req.userId, icons), 201);
  } catch (err) {
    next(err);
  }
}
