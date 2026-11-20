# Bass Transcribe Lab 部署

本应用已经整合进 `LimeSeed/bass-shape-lab` 仓库，不再要求创建独立仓库。

- 根入口继续是原指板，统一工具入口为 `tools/`，扒谱为 `transcribe/`。
- 本目录单独构建只产生扒谱产物；正式发布请在仓库根按 [README](../../../README.md) 安装两套依赖并执行 `npm run build`。
- GitHub Pages 上传根 `dist/`，包含指板、工具入口及 `dist/transcribe/`。Pages 工作流位于仓库根 `.github/workflows/pages.yml`。
- 两个应用都使用相对资源、清单和 Service Worker；扒谱的 manifest `id/start_url/scope` 解析到 `transcribe/`。根指板缓存明确排除该目录，双方只清理自己的缓存前缀。
- 更换网址或浏览器不会自动搬运 IndexedDB 歌曲库；同一网址的正常更新保留数据。音频导入、存储失败和删除提示继续由应用处理。
- 最新发布状态与当前整合测试见 [TOOLS-RELEASE](../../../docs/TOOLS-RELEASE.md)。早期测试报告里的独立仓库或 `shape/` 路径仅代表当时预览环境。

无需域名购买、账户、后端或付费服务。实际公共网址必须在部署成功后验证；本地通过不代表中国大陆网络可达。
