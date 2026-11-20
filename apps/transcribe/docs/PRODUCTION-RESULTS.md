# 生产版本、解码与离线测试

2026-11-19，本机 Edge 无界面浏览器；所有输入是自产 110 Hz、3 秒合成音。测试通过网页文件控件导入并实际播放，也直接调用浏览器解码检验时长和非静音 PCM。MP4 包含黑色画面 H.264 + AAC 音轨。

- 通过：生产构建和本地离线资源就绪。{"controller":true,"cached":1}
- 通过：实际 WAV 导入解码和播放。{"duration":3,"channels":1,"rms":0.25894066439458263,"sampleRate":44100,"playbackStartedMs":276,"playedPosition":0.21}
- 通过：实际 MP3 导入解码和播放。{"duration":3,"channels":1,"rms":0.24599771883455576,"sampleRate":44100,"playbackStartedMs":265,"playedPosition":0.23}
- 通过：实际 FLAC 导入解码和播放。{"duration":3,"channels":1,"rms":0.25894066439458263,"sampleRate":44100,"playbackStartedMs":264,"playedPosition":0.23}
- 通过：实际 M4A 导入解码和播放。{"duration":3,"channels":1,"rms":0.2579684381370662,"sampleRate":44100,"playbackStartedMs":264,"playedPosition":0.23}
- 通过：实际 OGG 导入解码和播放。{"duration":3,"channels":1,"rms":0.2601950449130048,"sampleRate":44100,"playbackStartedMs":263,"playedPosition":0.23}
- 通过：实际 MP4 导入解码和播放。{"duration":3,"channels":1,"rms":0.2579684381370662,"sampleRate":44100,"playbackStartedMs":262,"playedPosition":0.23}
- 通过：无效文件明确信息且原歌曲仍可用。""
- 通过：刷新后恢复音频、段落范围和固定R速度。{"positionBefore":0.88,"positionAfter":0.88}
- 通过：网络断开后刷新和保存的音频DSP播放。"音频与进度已保存到此设备当前离线 | 使用指南"
- 通过：音频删除及刷新后保持删除。""
- 通过：全部网页请求留在本地且无页面异常。{"outbound":[],"errors":[]}

未验证真实移动设备、其他浏览器、所有编码组合和外网部署。
