# GitHub Pages

## 当前发布

| 项目 | 地址或状态 |
| --- | --- |
| 公开源码 | [LimeSeed/bass-shape-lab](https://github.com/LimeSeed/bass-shape-lab) |
| 在线应用 | [GitHub Pages](https://limeseed.github.io/bass-shape-lab/) |
| 应用版本 | 1.0.1 |
| 发布分支 | `main` |
| 工作流 | [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) |
| 首次通过的工作流运行 | [43397496063](https://github.com/LimeSeed/bass-shape-lab/actions/runs/43397496063) |
| 首次发布来源提交 | [`26e12fa21e83d9c7f640963be36cd3d9d4c14feb`](https://github.com/LimeSeed/bass-shape-lab/commit/26e12fa21e83d9c7f640963be36cd3d9d4c14feb) |

2026-11-13 已完成仓库公开发布及 Pages 发布，工作流中的完整测试、构建、部署均成功。首次发布检查使用现有代理网络路径，尚不能说明关闭代理后的中国大陆直接访问可用。

## 自动更新

每次推送到 `main`，GitHub Actions 会依次执行：

1. 取出源码，准备 Node.js 24，并用 `npm ci` 安装锁定依赖。
2. 运行 `npm test` 检查乐理、指板、URL 设置与 PWA 生命周期。
3. 运行 `npm run build`，生成静态应用和按内容版本化的离线缓存。
4. 安装 Chromium 并执行 `npm run test:browser`，覆盖交互、响应式布局和离线更新流程。
5. 仅在前面步骤成功后上传 `dist/`，再部署到 `github-pages` 环境。

也可在仓库 Actions 页面选择 **Test and deploy GitHub Pages → Run workflow** 手动运行。部署结果以 Actions 运行和 Pages 环境状态为准；提交源码后，网页不会在测试及部署结束前立即变化。

已经打开的 PWA 会在联网检查到新版本后显示更新提示。点击更新时保留当前练习 URL；缓存完整下载前继续使用当前版本。

## 权限与构建文件

构建阶段只读源码：`contents: read`。部署任务使用 `pages: write` 和 `id-token: write`，向 GitHub Pages 发布已验证的产物。当前工作流不需要在仓库保存个人访问令牌或其他部署密钥。

工作流中的 Actions 固定到提交哈希，依赖由 `package-lock.json` 锁定。`node_modules/`、`dist/`、本地预览数据、测试输出和平台关联目录不提交到仓库；Pages 使用工作流生成并上传的构建产物。

## 项目子路径与分享

应用入口为 `https://limeseed.github.io/bass-shape-lab/`，请保留 `/bass-shape-lab/` 子路径与最后的 `/`。项目使用 Vite `base: './'`；资源、清单、Service Worker 均相对应用入口解析，离线作用域限制在该子路径内。

练习设置保存在查询参数中，例如：

```text
https://limeseed.github.io/bass-shape-lab/?root=E&mode=interval&interval=7&view=degree&hidden=1
```

请通过应用内“分享设置”获取完整链接。修改根音、和弦、音程或隐藏状态不需要访问后端。首次缓存完成后，未曾打开过的设置查询也可离线使用。

## 与 Vercel 的关系

GitHub 保存源码，GitHub Pages 根据该仓库构建并托管应用；[Vercel](https://bass-shape-lab.vercel.app) 是另一个独立托管目标。首个 Vercel 版本通过源码快照上传；现有 Vercel 项目现已连接这个 GitHub 仓库。

向 `main` 推送会分别触发本仓库的 Pages 工作流和现有 Vercel 项目的生产部署。发布源码或切换源码存放位置不会改变已有网站的网络路径。大陆网络实测与 EdgeOne 备选说明见 [DEPLOYMENT.md](DEPLOYMENT.md)。
