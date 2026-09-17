# 分类图标图片

这个文件夹放**内置分类**的图标图片。现在是空的——图片放进来之前，整个 App 会退回显示
`src/constants/category-icons.ts` 里给每个 key 配的兜底 emoji，不会出现一片问号。

## 怎么加一张内置图标

1. 把图片放进这个文件夹，文件名用 key：`food.png`、`transport.png`……
   建议 PNG、方形、边长 ≥ 144px（网格里最大显示 48pt，@3x 屏要 144px）。
2. 打开 `src/constants/category-icons.ts`，在 `BUILTIN_ICON_IMAGES` 里把注释掉的那一行放开：
   ```ts
   food: require('../../assets/categories/food.png'),
   ```
   `require` 的路径必须是写死的字面量——Metro 打包时要静态扫出所有被引用的资源，
   拼出来的路径（`require('../../assets/categories/' + key + '.png')`）打不进包，运行时会报错。
   这就是为什么需要这张登记表，而不是"往文件夹里一丢就自动生效"。
3. key 已经在 `BUILTIN_CATEGORY_ICONS` 里登记过的话，到这步就完事了：数据库里存的是
   `builtin:food` 这个引用，不是图片本身，所以老数据会自动开始显示新图。

## 两种图标，只有一种放在这里

| 来源 | 存在哪 | 数据库 `categories.icon` 存什么 |
|---|---|---|
| 内置（跟 App 一起打包） | **这个文件夹** | `builtin:food` |
| 用户自己提交的图片 | App 沙盒目录（运行时写入，不在仓库里） | `file:///.../category-icons/xxx.png` |

用户上传的图片进不了这个文件夹：打进 App 包里的资源是只读的，装到手机上之后没法往里写东西。
所以那一类将来存到 `FileSystem.documentDirectory/category-icons/`，`icon` 字段存 `file://` 路径。
`parseCategoryIcon()` 三种写法都认得，现在就已经能渲染 `file://`，只是还没有选图的入口
（选图要装 `expo-image-picker`，等接 Cloudinary 直传时一起做）。
