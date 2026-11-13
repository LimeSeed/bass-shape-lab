# 静态部署说明

核对日期：2026-11-13。V1.0.1 已发布到 [GitHub Pages](https://limeseed.github.io/bass-shape-lab/) 和 [Vercel Production](https://bass-shape-lab.vercel.app)。[公开源码仓库](https://github.com/LimeSeed/bass-shape-lab) 已建立；EdgeOne Pages 仍是备选方案，尚未执行部署。

生产浏览器验证已通过；后续使用反馈中国大陆直接访问不稳定。首次检查时命令行直连超时，浏览器经其环境网络路径访问成功；这不能保证其他网络可达性。详见 [Vercel 发布记录](VERCEL-RELEASE.md) 和 [测试结果](TESTING.md)。

## 当前 GitHub Pages 部署

仓库 `main` 分支通过 `.github/workflows/pages.yml` 自动完成依赖安装、单元测试、生产构建、浏览器测试，然后发布 `dist/`。所有检查成功后才执行部署，也可从 Actions 手动运行。Pages 使用项目子路径 `/bass-shape-lab/`，保留结尾 `/` 即可正确加载相对资源和离线作用域。

本次发布检查使用现有代理网络路径，尚未完成大陆直连验收。工作流与权限说明见 [GITHUB-PAGES.md](GITHUB-PAGES.md)。

## 当前 Vercel 部署

首个 Vercel 生产版本直接发布本地源码快照，当时未使用 Git 提交。Vercel 使用 `npm run build` 构建，静态输出为 `dist/`，生产别名公开提供匿名访问。项目根目录 `vercel.json` 配置入口、Service Worker、清单重新验证，以及带哈希资源的长期缓存。

项目没有后端函数，静态资源由全球 CDN 分发；函数区域设为香港不会把整个静态站固定在香港。Vercel 官方说明其没有中国大陆节点，无法保证大陆访问表现；后续如需提高教学访问可靠性，可实测自定义域名或使用下面的 EdgeOne 备选部署。[官方函数区域说明](https://vercel.com/docs/functions/configuring-functions/region)、[官方大陆访问说明](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)

再次发布前重新执行本地测试与构建，核对目标项目、版本和完整输出。现有 Vercel 项目已连接 `LimeSeed/bass-shape-lab`，`main` 分支更新会触发自动生产部署；上传源码本身不会改变现有网站的网络路径。

## 通用静态托管

1. 使用 Node.js 22.12+（建议 24 LTS）执行 `npm ci`、`npm test`、`npm run build`。
2. 将 **`dist/` 内的全部文件** 上传到支持 HTTPS 的静态托管服务。目录包含 `index.html`、`assets/`、`icons/`、`manifest.webmanifest` 和 `sw.js`；不能只上传 HTML。
3. 入口为根目录 `/`，或固定子目录 `/bass/`。项目的相对资源路径支持两者；子目录入口需保留结尾 `/`，可由托管端将 `/bass` 重定向到 `/bass/`。Vite 的相对 `base` 用法见 [Vite 构建文档](https://vite.dev/guide/build.html#relative-base)。
4. 查询参数保存练习设置，无需把所有路径重写到 HTML。请让不存在的资源真实返回 404，以便识别发布不完整。
5. 检查音阶、和弦、单个音程三种模式及固定 1–12 品的显示；再检查首次在线加载与离线缓存、带查询参数的链接、断网重开以及更新流程。旧调内级数链接应转成对应和弦 Shape。

建议响应头：

| 路径 | Cache-Control |
| --- | --- |
| `/`、`/index.html`、`/sw.js`、`/manifest.webmanifest` | `no-cache` |
| `/assets/*`（文件名含内容哈希） | `public, max-age=31536000, immutable` |
| `/icons/*` | 短缓存或 `no-cache` |

Service Worker 应以 JavaScript 类型返回，清单以 `application/manifest+json` 返回。浏览器缓存之外的 CDN 缓存也应允许 `sw.js` 与入口及时重新验证。发布时应原子替换整套资源；支持保留旧哈希资源的平台可保留上一版文件以照顾仍在运行的旧页面。

## EdgeOne Pages

官方部分文档和控制台现使用 **EdgeOne Makers** 名称，原 Pages 文档地址仍可用。以下继续沿用“EdgeOne Pages”称呼。

### Git 导入与构建

后续决定使用 EdgeOne Pages 时，可将本项目仓库导入平台；当前尚未执行 EdgeOne 部署。

| 平台设置 | 本项目值 |
| --- | --- |
| 根目录 | 独立仓库时为 `./` |
| 框架 | Vite，或选择自定义构建 |
| 安装命令 | `npm ci` |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| Node.js | 选择平台支持的 22.12+ 版本，例如 22.21.1 或 24.18.0 |
| 环境变量 | 无 |
| 服务端函数 / 数据库 | 无 |

官方构建文档支持指定安装、构建和输出目录；请将输出目录明确设为本项目的 `dist`，避免套用其他 React 模板的 `build`。当前可选 Node 版本以控制台为准，本项目不适用旧示例中的 22.11.0。[官方 Build Guide](https://pages.edgeone.ai/document/build-guide)

可以在平台设置中配置缓存响应头；如需把配置纳入仓库，可添加下面的 `edgeone.json`。它是可选的平台配置，应用本身仍为通用静态构建。[官方 edgeone.json](https://pages.edgeone.ai/document/edgeone-json)

```json
{
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "headers": [
    { "source": "/", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/manifest.webmanifest", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/assets/*", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
  ]
}
```

上例以域名根目录发布为前提。若改用子目录，应相应调整响应头匹配路径。

### 区域、域名和大陆访问

如启用此备选方案，优先选择 **Global availability zone (excluding Chinese mainland)**，绑定已有或另行决定购买的自定义域名。官方域名说明将该区域列为无需 ICP 备案的区域；包含大陆节点的区域要求相应备案。这里描述的是平台接入条件，不能据此推断实际网络质量。[官方区域与域名说明](https://pages.edgeone.ai/document/domain-overview)

默认项目域名、部署域名只作为临时预览使用。官方域名概览说明大陆访问预览链接存在三小时有效期；错误码文档还明确列出“非大陆区域的默认域名在大陆返回 401”。两页措辞并不完全一致，因此正式教学分享应使用自定义域名，并以目标网络实测为准。[官方域名概览](https://pages.edgeone.ai/document/domain-overview)、[官方 401 说明](https://pages.edgeone.ai/document/error-codes)

有可用域名并决定正式发布后：

1. 在项目“域名管理”添加子域名，例如 `bass.example.com`（示例地址）。
2. 按平台给出的记录验证域名所有权，并在 DNS 管理处配置平台指定 CNAME；不要照抄其他项目的目标值。
3. 关联 Production 环境，完成 HTTPS 证书配置，等待域名与证书状态正常。
4. 用自定义域名进行首次加载、分享、安装、离线、更新测试，再开展下方真实网络测试。[官方自定义域名步骤](https://pages.edgeone.ai/document/custom-domain)

### 发布与回滚

代码更新后重新运行测试与构建，上传整套 `dist/` 或由 Git 构建触发发布。缓存版本由资源内容计算，不依赖手动修改版本号。至少验证旧页面能提示更新，确认后当前练习设置仍在。回滚也需发布完整旧构建；旧内容会产生对应缓存版本，按同一流程切换。

## 中国大陆真实网络验收

生产浏览器通过不等于大陆直连通过。当前 Vercel 地址可先按下表实测；后续绑定自定义域名或使用其他托管平台时，需针对新域名再次测试。在关闭代理的真实目标设备上记录：日期、城市、运营商、Wi-Fi / 流量、设备、系统、浏览器、域名、首屏耗时、错误码、结果。

| 网络 / 浏览器 | 首次打开与 HTTPS | 分享链接恢复 | 安装入口 | 缓存后断网重开 | 新版本提示 |
| --- | --- | --- | --- | --- | --- |
| 校园 Wi-Fi · iPhone Safari | 待测 | 待测 | 待测 | 待测 | 待测 |
| 家庭宽带 · 桌面浏览器 | 待测 | 待测 | 待测 | 待测 | 待测 |
| 移动 / 联通 / 电信流量 · Safari 或 Chrome | 待测 | 待测 | 待测 | 待测 | 待测 |
| 微信内置浏览器 | 待测 | 待测 | 记录是否提供 | 待测 | 待测 |

安装入口受浏览器支持情况影响。微信中无法安装时，应记录情况并用系统浏览器复测。至少在不同时间段重复首次在线打开；将“首次访问不通”和“已有缓存可离线打开”分开记录。全部完成后才可对外陈述已验证的网络范围。
