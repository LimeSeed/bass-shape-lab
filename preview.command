#!/bin/zsh
# macOS: serve the included static build without installing Node or dependencies.
cd -- "${0:A:h}"
if [[ ! -f dist/index.html ]]; then
  print "请先构建项目：npm ci && npm run build"
  read -k 1
  exit 1
fi
if ! command -v python3 >/dev/null; then
  print "需要 Python 3，或改用 npm run preview。"
  read -k 1
  exit 1
fi
print "Bass Shape Lab — http://127.0.0.1:4173/"
print "保持此窗口打开。按 Control+C 停止预览。"
(/bin/sleep 1; /usr/bin/open 'http://127.0.0.1:4173/') &
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
