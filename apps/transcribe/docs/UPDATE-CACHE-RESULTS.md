# 浏览器更新与离线缓存回归

2026-11-19，macOS Microsoft Edge 157.0.4341.60，无头模式。使用 Vite 实际构建的旧 bootstrap/旧 cache-first worker 与新版 app；同一浏览器上下文和同一网址连续切换发布目录，未清除站点数据。

- 通过：historical built app and cache-first worker are running。{"legacyCache":true,"audioPlaying":true}
- 通过：legacy client upgrades its worker without waiting forever or interrupting playback。{"activeVersion":"0bd525a49afb2111","oldPageStillPlaying":true,"oldLazyAssetStatus":200}
- 通过：ordinary browser refresh loads new shell and keeps song, localStorage and Shape cache。{"local":"keep-me","shape":true,"updateViaCache":"none"}
- 通过：new update notifies clients while both tabs stay on their current shell。{"noticeReceived":true,"secondTabStillPlaying":true}
- 通过：explicit apply reloads only the requesting tab once; other playing tab continues。{"requestingTabNavigations":1,"otherTabNavigations":0}
- 通过：old own caches retire after old tabs close; unrelated Shape cache remains。{"ownCacheCount":1,"shapeCacheRetained":true}
- 通过：offline refresh uses complete latest shell and stored audio can play。{"offlineShell":"bf06653b36492c32","audioPlayed":true}
- 通过：incomplete update never replaces the complete active offline version。{"failedVersion":"8f1100704bee288e","workingVersion":"bf06653b36492c32"}
- 通过：no uncaught browser errors。[]

旧版尚未下载新 worker 时，旧 cache-first 策略仍可能先返回旧 HTML；新 worker 完整安装后会立即激活，下一次普通刷新从网络取新版，不要求清缓存。更新不会自动刷新正在播放的标签页；点击更新的具体暂停和保存由 App 处理。未验证 Safari、Firefox、真实手机、外网 CDN 或长期跨多版本挂起标签页。测试故意使一个更新资源返回 503 验证失败回退，不涉及清理歌曲库。

复现：`node tests/update-cache.mjs`。可用 `BTL_BROWSER` 指定其他 Chromium 可执行文件。
