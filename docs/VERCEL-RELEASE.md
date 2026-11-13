# Vercel 发布记录

## 当前版本

| 项目 | 记录 |
| --- | --- |
| 生产地址 | [https://bass-shape-lab.vercel.app](https://bass-shape-lab.vercel.app) |
| 应用版本 | 1.0.1 |
| 发布日期 | 2026-11-13（中国标准时间） |
| 目标 / 状态 | Production / READY |
| 访问 | 生产别名公开，已验证匿名访问 |
| 构建命令 / 输出 | `npm run build` / `dist` |
| 该次发布的 Git 提交 | 无；首个 Vercel 生产版本发布本地源码快照 |

发布输入源码快照的 SHA-256：

```text
34fc54500dd5f37b210d5d5cb3516454580479812db5f12cb519175ad6cfaac0
```

该值标识首次上传的源码快照，不是 Git 提交标识。后续源码更新是否触发线上发布，取决于是否已配置目标平台的自动部署。

## 发布验证

本地已通过 **520 项单元测试、13 项浏览器测试**，以及 TypeScript 检查与生产构建。

2026-11-13 16:05（中国标准时间），在全新 Microsoft Edge 会话中检查生产地址：

- 匿名访问 200，应用显示 V1.0.1；线上 Service Worker 的字节哈希与本地构建一致。
- Service Worker JavaScript 类型及重新验证响应头正常，清单为独立窗口模式，哈希资源长期缓存，缺失资源真实返回 404。
- 单个音程选择、隐藏答案与分享恢复正常。
- 离线缓存就绪后，未访问过的设置链接可断网打开并刷新。
- 没有浏览器错误或外部运行时资源请求。

完整测试范围与实机复核步骤见 [TESTING.md](TESTING.md)。

## 网络验证范围

命令行直连生产地址的检查超时；浏览器经其环境网络路径访问成功。后续使用反馈中国大陆直连不稳定，尚未完成校园网、家庭宽带、三家运营商流量、iPhone Safari 或微信内置浏览器的系统性访问验收。

Vercel 的静态资源使用全球 CDN，项目没有可供指定香港执行区域的后端函数。可先按 [大陆网络验收表](DEPLOYMENT.md#中国大陆真实网络验收) 测试当前地址，再决定是否绑定自定义域名或启用 EdgeOne Pages 备选；本次没有执行 EdgeOne 部署。[官方函数区域说明](https://vercel.com/docs/functions/configuring-functions/region)、[官方大陆访问说明](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)
