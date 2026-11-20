# Bass Lab 工具站 V1.0.1

贝斯练习工具站，包含指板与音频扒谱两个独立应用。React + TypeScript + Vite 静态构建，运行资源和音频处理依赖随站点提供；无需账户或后端。

当前版本 **1.0.1**：

- [GitHub Pages 在线使用](https://limeseed.github.io/bass-shape-lab/)
- [Vercel 在线使用](https://bass-shape-lab.vercel.app)
- [GitHub 公开源码](https://github.com/LimeSeed/bass-shape-lab)

GitHub Pages 会在 `main` 分支更新后自动测试、构建和发布；现有 Vercel 项目也已连接同一仓库，自动构建并更新生产网站。本地项目及静态构建可独立运行、迁移到其他静态托管平台。[GitHub Pages 说明](docs/GITHUB-PAGES.md)

Vercel 生产版本已通过匿名浏览器访问、分享设置及离线重载验证，后续使用反馈中国大陆直接访问不稳定。GitHub Pages 已完成自动测试、构建和发布；本次线上检查使用现有代理网络路径，不代表中国大陆直连验收。[Vercel 发布记录](docs/VERCEL-RELEASE.md)

## 工具入口与目录

本仓库现在同时维护指板与扒谱两个独立应用，统一构建、测试和发布：

| 入口（相对于站点目录） | 工具 | 源码 |
| --- | --- | --- |
| `./` | Bass Shape Lab 指板，保留原网址与分享参数 | `src/` |
| `tools/` | Bass Lab 工具入口 | `public/tools/` |
| `transcribe/` | Bass Transcribe Lab 扒谱 | `apps/transcribe/src/` |

线上合并发布结果请以 [整合验证与发布记录](docs/TOOLS-RELEASE.md) 为准。旧指板已安装 PWA 的身份及启动入口不变；指板根缓存和扒谱子目录缓存分别维护。原本地独立项目目录保留。

## 本地运行

需要 Node.js 24 和 pnpm 11.25.0。两套锁定文件分别管理各自依赖：

```sh
npm ci
npx --yes pnpm@11.25.0 --dir apps/transcribe install --frozen-lockfile
npm test
npm run test:transcribe
npm run build
npm run preview -- --port 4175
```

预览时打开 `http://127.0.0.1:4175/tools/`。指板开发使用 `npm run dev`，扒谱开发使用 `npm run dev:transcribe`；完整工具导航与离线功能请使用生产构建预览。

```sh
npx playwright install chromium
npm run test:browser
```

浏览器测试使用独立端口 4175，可通过 `BASS_TEST_PORT` 调整；可用 `PLAYWRIGHT_EXECUTABLE_PATH` 指定本机 Chromium 系浏览器。生产构建输出完整 `dist/`，不要只发布某个子目录。

## 练习方式

| 模式 | 内容 |
| --- | --- |
| 音阶 | 十二根音的自然大调音阶、自然小调音阶 |
| 和弦 | 大三、小三、减三、大七、小七、属七、半减七 |
| 音程 | 选择一个音程，同时显示根音与该音程的指板位置；默认纯五度 |

默认 E 自然大调音阶、固定 1–12 品、音名显示。标准调弦低到高为 E–A–D–G。绿色圆点突出当前音阶、和弦或音程的根音。

- **音名 / 音级**：切换指板标签；音级始终相对于当前根音。例如 Cm7 的音级显示为 1、♭3、5、♭7。
- **指板范围**：始终显示第 1 到 12 品，不含空弦。
- **单个音程**：从同度到大七度选择一个音程。例如 E 的纯五度显示 E 与 B；选择同度时只显示根音，不重复绘制。
- **隐藏答案**：保留 Shape 和根音颜色，隐藏指板标签及构成音列表；点击“揭晓答案”恢复。属于记忆训练，答案不构成访问权限限制。
- **分享设置**：复制含全部设置的链接。无法使用剪贴板时显示可手动复制的文本框。链接也保留隐藏答案状态；刷新、另一设备打开均可恢复。
- **手机**：竖屏可在指板区域左右滑动；横屏优先展示完整十二品，桌面随可用宽度展开。

十二根音入口采用 C、D♭、D、E♭、E、F、G♭、G、A♭、A、B♭、B。构成音由字母级进与音程规则计算，保留正确拼写；例如 E 自然大调音阶为 E、F♯、G♯、A、B、C♯、D♯。理论上需要重升、重降的和弦会如实显示。音程采用 ♭2、♭3、♭5、♭6、♭7 的拼写约定。

早期分享链接中的调内级数设置会转换为对应的和弦 Shape，并使用十二根音入口的标准拼写；旧的跟随范围设置会归一到固定 1–12 品。当前界面只包含音阶、和弦和音程三种模式。

## 安装、离线与更新

生产版本使用浏览器 Service Worker 缓存本地页面、脚本、样式、图标和清单。必须完成首次联网加载；浏览器清除站点数据后需重新缓存。运行环境需 HTTPS，本机 `localhost` / `127.0.0.1` 可用于开发验证。

支持安装的浏览器可使用“安装应用”按钮或浏览器菜单；iPhone / iPad 在 Safari 的“分享 → 添加到主屏幕”完成安装。安装入口及提示由浏览器决定。普通浏览器打开也可练习。

新版文件会先完整下载到独立缓存，显示“发现新版本”。点击“立即更新”后刷新并保留当前 URL 设置；未确认时继续使用当前版本。联网恢复或返回应用前台时会检查更新。HTML 或资源变化均会改变缓存版本，下载中断不会替换完整旧缓存。

## 项目结构

```text
src/lib/musicTheory.ts   独立乐理引擎：拼写、音阶、和弦与音程
src/lib/fretboard.ts     调弦与品位位置计算
src/lib/settings.ts      URL 校验、序列化及旧链接兼容
src/lib/pwa.ts           离线状态和用户确认更新
src/components/         SVG 指板
src/App.tsx             练习与安装交互
scripts/generate-sw.mjs  按构建内容生成离线缓存
public/                 本地图标与 PWA 清单
tests/                  单元测试及浏览器测试
docs/                   部署、验证及真实网络测试说明
```

`base: './'` 让静态构建可移到域名根目录或固定子目录，URL 设置使用查询参数，不需要服务端路由。部署到子目录时使用以 `/` 结尾的入口，例如 `/bass/`。

乐理引擎保留调内和弦计算，以兼容早期链接并单独验证；不作为当前界面的一个模式。
