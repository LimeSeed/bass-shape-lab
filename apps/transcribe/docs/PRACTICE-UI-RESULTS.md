# 段落、R/O快捷键与窄屏触控回归

2026/11/19 16:26:16（Asia/Shanghai）。本机 Microsoft Edge Chromium / Playwright 无界面生产预览 http://127.0.0.1:4173。独立临时浏览器配置，桌面1440×1000；触控仿真390×844和320×844，hasTouch/isMobile，CDP派发touchStart/touchMove/touchEnd。未接触用户现有浏览器配置。未放宽自动播放策略；示例真实启动后先暂停再测试快捷键。

**16/16 项通过。**

| 行为 | 结果 | 证据 |
| --- | --- | --- |
| 桌面生产包：示例实际启动后暂停，已移除旧全览/定位和AB数值框 | 通过 | {"url":"http://127.0.0.1:4173/","playing":false} |
| 固定R目标80%，手调65%后R先100%再80%，不覆盖目标 | 通过 | {"sequence":[65,100,80],"target":80} |
| 正在使用旧R目标时改为85%，当前速度同步85%；上下键不改目标 | 通过 | {"target":85,"manualDoesNotOverwrite":true} |
| O三档0→12→24→0，细调先回0，重复keydown不连跳 | 通过 | {"sequence":[12,24,0],"repeatIgnored":true} |
| 系统组合键不触发播放器R/O或速度变化 | 通过 | {"speed":85,"pitch":0,"target":85} |
| 创建AB后段落默认折叠，添加保存当前范围并自动聚焦名称 | 通过 | {"marker":{"id":"db5f6911-5c8b-4018-9420-65afc293b975","time":3.2,"end":8,"label":"主歌范围"},"ab":{"a":3.2,"b":8}} |
| 段落名称输入保护播放快捷键，空名回退，外部点击保存并关闭 | 通过 | {"textInputProtected":true,"waveSectionsRetained":true} |
| 刷新恢复固定R速度、段落end和歌曲Blob，选择段落设循环 | 通过 | {"target":85,"marker":{"id":"db5f6911-5c8b-4018-9420-65afc293b975","label":"主歌范围","time":3.2,"end":8},"audioSize":1411244} |
| 旧point数据真实IDB迁移：保留id/时间/名称，补范围，音频Blob不丢 | 通过 | {"markers":[{"id":"old-a","label":"旧主歌","time":0.5,"end":1.5},{"id":"old-b","label":"旧过门","time":1.5,"end":3}],"audioSize":264644,"secondRestoreStable":true} |
| 390px触控仿真：展开/添加/改名/关闭无横向溢出 | 通过 | {"bounds":{"x":18,"y":523.5,"width":360,"height":187},"metrics":{"viewport":390,"doc":390},"touchPoints":1} |
| 390px真实Touch序列：创建loop、拖动A/B边界与整体平移 | 通过 | {"a":4.8,"b":8} |
| 390px Touch段落两端和整体移动，当前选中循环同步范围 | 通过 | {"section":{"start":6,"end":9.6},"ab":{"a":6,"b":9.6},"steps":[{"stage":"before","ab":{"a":4.8,"b":8}},{"stage":"start-drag","ab":{"a":5.2,"b":8}},{"stage":"end-drag","ab":{"a":5.2,"b":8.8}},{"stage":"whole-drag","ab":{"a":6,"b":9.6}}]} |
| 390px手形水平pan只移动视图，不重选loop/段落 | 通过 | {"scrollBefore":35,"scrollAfter":180,"region":{"a":6,"b":9.6},"point":{"x":195,"y":499,"hit":"wave-inner is-panning"}} |
| 390px普通波形纵向Touch滚动页面，取消选区拖动且不改loop | 通过 | {"scrollBefore":0,"scrollAfter":170,"region":{"a":6,"b":9.6}} |
| 320px触控仿真：展开/添加/改名/关闭无横向溢出 | 通过 | {"bounds":{"x":12,"y":604,"width":296,"height":187},"metrics":{"viewport":320,"doc":320},"touchPoints":1} |
| 全部页面没有未捕获JavaScript异常 | 通过 | {"errors":[]} |

R行为按本轮约定：任意非原速先回100%，100%时再切固定R目标；滑块和上下键不重写目标。O为0/12/24循环，非预设细调值先回0。旧point fixture直接写入IndexedDB，并通过生产界面加载和再次刷新验证范围迁移、id/名称/起点稳定及完整WAV Blob字节不变。

截图：regions-mobile.png，为390px浏览器触控仿真。

限制：这不是实体手机测试；没有验证iOS/Safari、Android硬件、系统软键盘弹起后的视口变化、真实扬声器音质。本轮不重新进行DSP频谱测量，也未执行外部部署或中国大陆网络访问验收。
