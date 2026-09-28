import express from "express";
import cors from "cors";
import env from "./config/env.js";
import routes from "./routes/index.js";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.use(cors());

/**
 * 分类图标那条路的请求体是 base64 图片，比其他接口大一个量级，
 * 所以**单独给它一个更大的上限**，而不是把全局那个 100 KB 放宽。
 *
 * 必须注册在下面那个全局 `express.json()` **之前**：body-parser 认 `req._body`，
 * 先跑的那个解析完，后面的就不再碰了。反过来的话，全局那个会先用 100 KB 把请求 413 掉，
 * 这条路由永远等不到。
 *
 * 4 MB 才是真正的那堵墙——controller 里"一批 20 张、单张 512 KB"的上限算出来比这大得多，
 * 但那两个数是为了报出说得清的错（"第 3 张不是 JPEG"），挡住恶意请求的是这里：
 * 超过 4 MB 的 body 在进到我们任何一行代码之前就被拒了，内存里不会留下它。
 */
app.use("/category-icons", express.json({ limit: "4mb" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ success: true, data: { status: "ok" }, error: null }));

app.use("/", routes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`CordDaily backend listening on port ${env.port}`);
});
