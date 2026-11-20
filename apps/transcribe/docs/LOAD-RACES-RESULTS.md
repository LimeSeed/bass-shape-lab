# 歌曲加载与删除竞态回归

2026-11-19，本机Edge无界面浏览器、隔离测试数据。实际解码合成WAV，用可控解码延迟复现竞态，并模拟数据库删除失败。

通过：two song selections in one event turn start only the first load

通过：failed import releases busy state and preserves the current song and parameters

通过：user import replaces a delayed automatic restore and the old restore cannot overwrite it

通过：deleting a loaded song survives late autosave and refresh without resurrecting audio

通过：database deletion failure leaves the original song usable and unlocks controls

通过：reopening the current song reads parameters after its final save rather than an old snapshot

通过：double click or saved section click during slow loading cannot restart the previous song

通过：failed progress save stops an update refresh and retains unsaved markers

8/8 项完成；页面异常：[]。
