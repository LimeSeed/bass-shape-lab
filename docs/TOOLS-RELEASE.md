# Bass Lab 同仓库工具站验证

日期：2026-11-20，Asia/Shanghai。

## 发布结构

沿用既有公开仓库 `LimeSeed/bass-shape-lab` 和 `main` 分支，不重命名仓库、不覆盖本机原指板或独立扒谱目录。

| 相对入口 | 内容 |
| --- | --- |
| `./` | 原 Bass Shape Lab 指板；现有 URL 查询参数和 PWA 安装身份保持不变 |
| `tools/` | 新增 Bass Lab 工具入口 |
| `transcribe/` | Bass Transcribe Lab；独立音频库、manifest 与 Service Worker |

根构建先构建指板，再构建 `apps/transcribe`，组合到同一 `dist/`。根缓存只含指板与工具入口，明确排除 `transcribe/` 及发布标记 `.nojekyll`；扒谱缓存按自身作用域和版本维护，双方不互相清理。移除了旧的指板静态副本，后续修改指板会直接从源码构建。

## 本轮实测

使用锁定依赖的生产构建，在 macOS 的独立 Microsoft Edge Chromium 配置中运行自动化浏览器测试；没有使用用户浏览器配置。

- `npm test`：522/522 通过，包含原有520条和新增两条缓存隔离检查。
- `npm run test:transcribe`：24/24 通过，覆盖独立节点、段落范围、旧数据规范化、O八度循环和固定R练习速度。
- `npm run build`：通过，两套TypeScript检查及Vite生产构建均成功。
- `npm run test:browser`：15/15 通过。原指板13条全部保留；新增两条整合检查覆盖下述行为。
- 使用本地静态服务器真实挂载 `/bass-shape-lab/`；没有使用开发服务器的SPA回退掩盖错误路径。
- 原指板和弦/隐藏答案分享链接正常；两个应用从工具入口及顶部链接往返正常。
- 实际导入自产3秒WAV，建立蓝色节点、绿色循环和橙色段落，设置65%速度和+12半音；真实点击播放后时间轴推进。
- 刷新、断网刷新均恢复音频、速度、音高、节点和段落；断网下跨工具访问、未访问过的指板参数链接与再次进入扒谱正常。
- 根缓存中不含任何 `transcribe/` 资源，两个Service Worker各自控制对应页面，两套缓存均保留。
- 1440、390、320像素宽度的三个页面均无横向溢出；为新增导航修复320像素扒谱页排版。
- 整合用例没有页面JavaScript异常。独立DSP源码和worklet未在本次整合中改动；本轮未重新进行频谱和听觉音质测量，既有实验报告保留于 `apps/transcribe/docs/`。

## 触控回归

组合构建预览 `http://127.0.0.1:4176/transcribe/` 上重新运行 `tests/independent-touch.mjs`：23/23 通过。使用390和320像素的触控模拟，覆盖两次范围标记、边界及整体拖动、蓝色节点独立编辑/拖动、橙色段落点击循环与空白退出、手形平移和纵向滚动、刷新恢复与原音频SHA256保持、R固定速度与O三档、旧歌曲兼容。不是实机测试。明细和当前截图见 [触控报告](../apps/transcribe/docs/INDEPENDENT-TOUCH-RESULTS.md)。

## 发布核对

GitHub Actions 完成测试后才发布 Pages；当前结果应从 [工作流运行记录](https://github.com/LimeSeed/bass-shape-lab/actions/workflows/pages.yml) 和提交对应的部署环境核对。网站目标入口为 [工具](https://limeseed.github.io/bass-shape-lab/tools/)、[指板](https://limeseed.github.io/bass-shape-lab/)、[扒谱](https://limeseed.github.io/bass-shape-lab/transcribe/)。以上本地结果不等于公共部署成功，实际上传及线上结果另在交付记录中核实。

既有Vercel项目也连接此仓库；`vercel.json` 已同步两套依赖安装与组合构建。不创建额外项目或购买服务。

已打开的旧指板PWA需在发现新版本后点击“立即更新”，才会显示新导航；在线直接打开 `transcribe/` 可进入扒谱。更换浏览器或网址时，原网址的歌曲库不会自动迁移，需要重新导入。

未验证真手机、Safari/Firefox、移动端系统安装与后台音频、以及关闭代理后的中国大陆直接访问。浏览器触控模拟的实测结果单列，不作为真设备验证。
