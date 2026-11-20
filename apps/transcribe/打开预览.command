#!/bin/zsh
cd "${0:A:h}"
if [[ ! -f dist/index.html ]]; then
  print '请先根据 README 构建项目，或使用已构建的静态站点压缩包。'
  read '?按回车关闭'
  exit 1
fi
print 'Bass Transcribe Lab: http://127.0.0.1:4173'
print '保持此窗口开启。结束时按 Control+C。'
open 'http://127.0.0.1:4173'
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
