# 统一循环触控、保存和快捷键回归

2026/11/19 18:30:06（Asia/Shanghai）。本机 Microsoft Edge Chromium / Playwright 无界面，独立临时浏览器配置。生产预览http://127.0.0.1:4173。触控仿真390×844和320×844，hasTouch/isMobile，CDP派发touchStart/touchMove/touchEnd；桌面兼容夹具1440×1000。示例真实启动后暂停，没有放宽自动播放策略。

**18/18 项通过。**

| 行为 | 结果 | 证据 |
| --- | --- | --- |
| 390px初始未建loop：无overlay、无AB双边界、禁止保存 | 通过 | {"touchPoints":1,"regionSet":false} |
| 390pxTouch第一标记仅pending A，第二标记统一生成唯一AB | 通过 | {"a":2,"b":6} |
| 390px Touch非中心抓取A/B和整条：位移不跳边界 | 通过 | {"before":{"a":2,"b":6},"first":{"a":2.4,"b":6},"second":{"a":2.4,"b":6.8},"after":{"a":3.2,"b":7.6}} |
| 390px保存当前循环→命名同一band，tag改名/选择不溢出 | 通过 | {"bounds":{"a":3.2,"b":7.6},"panel":{"x":18,"y":468,"width":360,"height":187},"activeMarkerId":"8864e435-4887-43ea-b32c-41675e3e2793","marker":{"id":"8864e435-4887-43ea-b32c-41675e3e2793","time":3.2,"end":7.6,"label":"统一循环390"}} |
| 390px已保存loop拖动两端/整条：关联marker同步，无第二lane | 通过 | {"before":{"a":3.2,"b":7.6},"after":{"a":4.4,"b":8},"marker":{"id":"8864e435-4887-43ea-b32c-41675e3e2793","time":4.4,"end":8,"label":"统一循环390"}} |
| 390pxR固定目标和O三档仍正确，名称输入不触发播放快捷键 | 通过 | {"r":[65,100,80],"target":80,"octave":[12,24,0],"textInputProtected":true} |
| 390px刷新恢复activeMarkerId/AB/名称与同一音频Blob | 通过 | {"ab":{"a":4.4,"b":8},"activeMarkerId":"8864e435-4887-43ea-b32c-41675e3e2793","audioSize":1411244,"audioSHA256":"d54cd9ab81544c8d7cf5e6c374d3a3ed29cb9ea2c5ae3577348188ee099a70c1"} |
| 390px重新添加第一标记禁保存，选择已存循环结束pending | 通过 | {"pendingCannotSave":true,"selectedRange":{"a":4.4,"b":8}} |
| 390px统一loop的Touch水平pan与页面纵向滚动不误改范围 | 通过 | {"pan":{"left":13,"moved":140},"vertical":{"startY":125,"endY":291},"unchanged":{"a":4.4,"b":8}} |
| 320px初始未建loop：无overlay、无AB双边界、禁止保存 | 通过 | {"touchPoints":1,"regionSet":false} |
| 320pxTouch第一标记仅pending A，第二标记统一生成唯一AB | 通过 | {"a":2,"b":6} |
| 320px保存当前循环→命名同一band，tag改名/选择不溢出 | 通过 | {"bounds":{"a":2,"b":6},"panel":{"x":12,"y":532,"width":296,"height":187},"activeMarkerId":"84b202cc-153c-4b51-aa8a-d1badf8eafb6","marker":{"id":"84b202cc-153c-4b51-aa8a-d1badf8eafb6","time":2,"end":6,"label":"统一循环320"}} |
| 320px刷新恢复activeMarkerId/AB/名称与同一音频Blob | 通过 | {"ab":{"a":2,"b":6},"activeMarkerId":"84b202cc-153c-4b51-aa8a-d1badf8eafb6","audioSize":1411244,"audioSHA256":"d54cd9ab81544c8d7cf5e6c374d3a3ed29cb9ea2c5ae3577348188ee099a70c1"} |
| 320px重新添加第一标记禁保存，选择已存循环结束pending | 通过 | {"pendingCannotSave":true,"selectedRange":{"a":2,"b":6}} |
| 真实旧IDB无regionSet的point/end兼容：推断当前loop和关联、Blob字节保留 | 通过 | {"markers":[{"id":"old-point","label":"旧点段落","time":0.5,"end":1.5},{"id":"old-end","label":"旧范围段落","time":1.5,"end":2.6}],"activeMarkerId":"old-point","audioSize":264644,"audioSHA256":"722e4b570219f8b6c59de45ef20fd820c31b737ed1590a3d513bdb5b9ac7d332"} |
| 旧整曲默认0/duration且loop关闭，恢复后仍无loop而非默认整曲选中 | 通过 | {"regionSet":false,"audioSHA256":"722e4b570219f8b6c59de45ef20fd820c31b737ed1590a3d513bdb5b9ac7d332"} |
| 新数据显式regionSet且未关联：同范围marker不会在刷新时自动接管AB | 通过 | {"activeMarkerId":null,"ab":{"a":0.5,"b":1.5},"audioSHA256":"722e4b570219f8b6c59de45ef20fd820c31b737ed1590a3d513bdb5b9ac7d332"} |
| 所有生产页面无未捕获JavaScript异常 | 通过 | {"errors":[]} |

唯一工作流：添加两个标记或拖出范围建立当前AB；“保存当前循环”仅给该范围增加名称和保存关联；命名后的范围仍使用同一overlay和可拖动上沿，不绘制独立段落lane。测试同时检查保存后拖动同步marker、未完成标记禁保存、刷新关联、旧point/end兼容和新未关联范围不被旧marker接管。旧音频使用合法合成WAV，按完整SHA-256比较保存前后字节。

截图unified-loop-mobile.png来自正常应用页面，390px浏览器触控仿真，非浏览器插件。

限制：未验证实体手机、iOS/Safari、Android硬件、系统软键盘/音频后台行为。本轮不重测DSP频谱和SW升级；未执行外部部署或中国大陆网络访问验收。
