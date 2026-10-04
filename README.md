# 简易中文字帖

一个运行在 Cloudflare Workers 上的中文字帖练习应用。前端使用 React + Vite 开发和构建，Worker 提供 JSON API，使用 Cloudflare D1 保存用户及字帖数据。

## 功能

- 注册和登录，包含算术验证码。
- 创建字帖，选择网格大小（6 至 12 格）和字体，并输入要临摹的汉字。
- 在网格中用鼠标或触屏书写，可选择笔色和笔粗。
- 保存、打开、修改和删除个人字帖；笔迹以 canvas 图片数据保存。
- 登录失败达到 5 次后，按客户端 IP 锁定 30 分钟；验证码有效期为 5 分钟。

字帖字体优先使用客户端已安装的系统字体；系统字体缺失时，通过 ZSFT FontsAPI 加载开源近似字体：霞鹜臻楷（楷书）、志莽行书（行书风格，近似行楷）和洄波隶书（CC0）。洄波隶书仅含 308 个字形，未收录的汉字会继续回退到系统字体。

## 技术栈

- Cloudflare Workers：前端页面和 API 的运行环境。
- Cloudflare D1：SQLite 数据库，绑定名为 `DB`，数据库名为 `zhitie-db`。
- Vite：前端开发服务器和生产构建工具。
- Wrangler：Worker 本地运行、数据库管理和部署工具。
- React 18：前端组件化开发，由 Vite 打包。
- Tailwind CSS v4 + DaisyUI v5：现代轻量 UI 组件系统，支持多主题切换（宣纸复古、素绢雅致、清新自然等）。
- Lucide React：轻量优雅的矢量图标库。

## 环境要求

- Node.js 20.19+ 或 22.12+，以及 npm
- Cloudflare 账号（远程数据库操作和部署需要）
- Wrangler CLI 随项目依赖安装

## 本地开发

```sh
npm install
npm run dev
```

Vite 前端运行在 `http://localhost:5173`，支持热更新；本地 Wrangler Worker 运行在 `http://localhost:8791`，Vite 会将 `/api` 请求代理到 Worker。启动时会构建前端并初始化本地 D1 schema。

只构建前端静态资源：

```sh
npm run build
```

构建产物写入 `dist/`，该目录由 Wrangler 作为静态资源发布。

## 数据库

`schema.sql` 定义了用户、字帖、登录失败记录和验证码表。初始化本地 D1：

```sh
npx wrangler d1 execute zhitie-db --local --file=./schema.sql
```

初始化 Cloudflare 上的远程 D1：

```sh
npx wrangler d1 execute zhitie-db --remote --file=./schema.sql
```

远程操作前请先登录 Wrangler，并确认 `wrangler.toml` 中的 D1 数据库配置指向目标数据库。Worker 每次处理 API 请求时也会尝试补充 `display_name` 字段及登录限制、验证码表；正式环境仍建议通过版本化 SQL migration 管理 schema 变更。

## API

所有接口都在同源 `/api` 路径下。除验证码、注册和登录接口外，字帖接口需要在请求头中携带 `Authorization: Bearer <token>`。请求和响应均为 JSON。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/captcha` | 获取算术题及验证码 ID |
| `POST` | `/api/register` | 注册；需要 `username`、`password`、`confirm_password`、`display_name`、`captcha_id`、`captcha_answer` |
| `POST` | `/api/login` | 登录；需要 `username`、`password`、`captcha_id`、`captcha_answer` |
| `GET` | `/api/copybooks` | 获取当前用户的字帖列表 |
| `POST` | `/api/copybooks` | 创建字帖；请求字段包括 `title`、`chars`、`strokes`、`grid_size`、`font_family` |
| `PUT` | `/api/copybooks/:id` | 更新当前用户的字帖 |
| `DELETE` | `/api/copybooks/:id` | 删除当前用户的字帖 |

字帖接口支持的字体标识为 `KaiTi`、`XingKai`、`SimSun`、`LiSu`。错误响应格式为 `{"error":"..."}`。

## 部署

```sh
npx wrangler login
npm run deploy
```

`npm run deploy` 会先执行 Vite production build，再由 Wrangler 打包 Worker 并发布 `dist/` 静态资源。`worker.js` 是 Wrangler 的轻量入口，业务 API 在 `src/worker.js`；无需手工将前端编译并覆盖成单个 `worker.js`。部署前检查 `wrangler.toml` 中的 Worker 名称、兼容日期和 D1 绑定，并确认远程数据库已初始化。

## 安全说明

当前认证实现仅适合开发验证，不应直接用于生产环境：

- 密码使用固定盐的 SHA-256 摘要；该方式不适合作为密码存储方案。应迁移到带随机盐和足够工作因子的密码哈希方案。
- Bearer token 中包含用户 ID，但服务端只解析用户 ID 并查询用户，没有验证 token 签名、随机部分或有效期。用户 ID 可被伪造，不能视为可靠的身份认证。
- 算术验证码及按 IP 登录失败限制已在 Worker 中实现，但它们不能弥补上述认证缺陷。

在对外开放服务前，应先修复认证与密码存储，并评估请求体大小限制、滥用防护及外部 CDN 可用性。

## 文件结构

```text
.
├── index.html
├── package.json
├── package-lock.json
├── README.md
├── schema.sql
├── public/
│   └── favicon.ico
├── src/
│   ├── main.jsx
│   ├── style.css
│   └── worker.js
├── vite.config.js
├── worker.js
└── wrangler.toml
```