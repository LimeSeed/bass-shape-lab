import { useEffect, useRef, useState } from 'react';
import Fretboard from './components/Fretboard';
import { ROOTS, scale, chord, chromatic, resolveRoot, type ChordKind } from './lib/musicTheory';
import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type Settings } from './lib/settings';
import { registerPwa } from './lib/pwa';
import { version } from '../package.json';

const modes = [{ id: 'scale', label: '音阶' }, { id: 'chord', label: '和弦' }, { id: 'interval', label: '音程' }] as const;
const intervals = ['纯一度', '小二度', '大二度', '小三度', '大三度', '纯四度', '减五度', '纯五度', '小六度', '大六度', '小七度', '大七度'];
const qualities: { id: ChordKind; label: string; suffix: string }[] = [
  { id: 'major', label: '大三和弦', suffix: '' }, { id: 'minor', label: '小三和弦', suffix: 'm' }, { id: 'dim', label: '减三和弦', suffix: 'dim' },
  { id: 'maj7', label: '大七和弦', suffix: 'maj7' }, { id: 'min7', label: '小七和弦', suffix: 'm7' }, { id: 'dom7', label: '属七和弦', suffix: '7' }, { id: 'halfDim', label: '半减七和弦', suffix: 'm7♭5' },
];
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function App() {
  const [settings, setSettings] = useState(() => parseSettings(location.search));
  const [notice, setNotice] = useState('');
  const [offlineReady, setOfflineReady] = useState(false);
  const [pwaError, setPwaError] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [update, setUpdate] = useState<null | (() => void)>(null);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [manualShare, setManualShare] = useState('');
  const shareInput = useRef<HTMLInputElement>(null);
  const s = settings;
  const change = (patch: Partial<Settings>) => setSettings(current => ({ ...current, ...patch }));
  useEffect(() => { history.replaceState(null, '', `${location.pathname}${serializeSettings(settings)}${location.hash}`); }, [settings]);
  useEffect(() => {
    const onPop = () => setSettings(parseSettings(location.search));
    const onOnline = () => setOnline(navigator.onLine);
    const onInstall = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
    const onInstalled = () => { setInstall(null); setInstallHelp(false); setNotice('已添加到主屏幕'); };
    addEventListener('popstate', onPop); addEventListener('online', onOnline); addEventListener('offline', onOnline);
    addEventListener('beforeinstallprompt', onInstall); addEventListener('appinstalled', onInstalled);
    const cleanup = registerPwa({ onReady: () => { setOfflineReady(true); setPwaError(false); }, onUpdate: apply => setUpdate(() => apply), onError: message => { setPwaError(true); setNotice(message); } });
    return () => { cleanup(); removeEventListener('popstate', onPop); removeEventListener('online', onOnline); removeEventListener('offline', onOnline); removeEventListener('beforeinstallprompt', onInstall); removeEventListener('appinstalled', onInstalled); };
  }, []);
  useEffect(() => { if (manualShare) shareInput.current?.select(); }, [manualShare]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(id); }, [notice]);

  const rootName = resolveRoot(s.root).name;
  const intervalNotes = s.mode === 'interval' ? chromatic(s.root) : [];
  const notes = s.mode === 'scale' ? scale(s.root, s.scale) : s.mode === 'chord' ? chord(s.root, s.chord) : intervalNotes.filter(note => note.interval === 0 || note.interval === s.interval);
  const quality = qualities.find(q => q.id === s.chord)!;
  const title = s.mode === 'scale' ? `${rootName} ${s.scale === 'major' ? '自然大调音阶' : '自然小调音阶'}` : s.mode === 'chord' ? rootName + quality.suffix : `${rootName} · ${intervals[s.interval]}`;

  async function share() {
    const url = location.href;
    try { await navigator.clipboard.writeText(url); setNotice('当前设置链接已复制'); }
    catch { setManualShare(url); }
  }
  async function installApp() {
    if (!install) { setInstallHelp(v => !v); return; }
    try { await install.prompt(); await install.userChoice; }
    catch { setInstallHelp(true); }
    setInstall(null);
  }
  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="./" aria-label="Bass Shape Lab 首页"><span className="brand-icon" aria-hidden="true"><i /><i /><i /><i /></span><span>Bass Shape <b>Lab</b></span></a>
      <div className="header-actions"><span className="version">V{version}</span><button className="quiet-button" onClick={installApp}>安装应用 <span aria-hidden="true">↗</span></button></div>
    </header>
    {update && <div className="update-banner" role="status"><span>发现新版本，更新后继续当前练习。</span><button onClick={update}>立即更新 ↻</button></div>}
    {installHelp && <div className="help-panel"><strong>添加到主屏幕</strong><p>iPhone / iPad：在 Safari 中点“分享”，选择“添加到主屏幕”。Android 或桌面：在浏览器菜单中选择“安装应用”或“添加到主屏幕”。</p><p>{offlineReady ? '离线资源已缓存，之后可以断网练习。' : import.meta.env.DEV ? '当前为开发预览；构建后的版本支持离线缓存。' : '首次联网加载后，等待底部显示“离线已就绪”。'} 安装入口由浏览器提供。</p><button className="text-button" onClick={() => setInstallHelp(false)}>收起</button></div>}
    <main>
      <nav className="mode-tabs" aria-label="Shape 类型">{modes.map(mode => <button key={mode.id} aria-pressed={s.mode === mode.id} onClick={() => change({ mode: mode.id })}><span>{mode.label}</span></button>)}</nav>
      <section className="control-panel" aria-label="练习设置">
        <div className="root-control"><span className="field-label">根音</span><div className="root-picker" role="group" aria-label="十二根音">{ROOTS.map(root => <button key={root.id} className={s.root === root.id ? 'active' : ''} aria-pressed={s.root === root.id} onClick={() => change({ root: root.id })}>{root.label}</button>)}</div></div>
        <div className="type-control">
          {s.mode === 'scale' && <label><span className="field-label">音阶类型</span><select aria-label="音阶类型" value={s.scale} onChange={e => change({ scale: e.target.value as Settings['scale'] })}><option value="major">自然大调音阶</option><option value="minor">自然小调音阶</option></select></label>}
          {s.mode === 'chord' && <label><span className="field-label">和弦类型</span><select aria-label="和弦类型" value={s.chord} onChange={e => change({ chord: e.target.value as ChordKind })}>{qualities.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}</select></label>}
          {s.mode === 'interval' && <label><span className="field-label">音程</span><select aria-label="音程选择" value={s.interval} onChange={e => change({ interval: Number(e.target.value) })}>{intervals.map((label, interval) => <option key={interval} value={interval}>{label} · {intervalNotes[interval].degree}</option>)}</select></label>}
        </div>
      </section>
      <section className="board-panel" aria-label="当前指板">
        <div className="board-heading"><h1>{title}</h1><div className="board-meta"><span><i className="legend-dot" />根音</span><span>1–12 品</span></div></div>
        <Fretboard notes={notes} start={1} view={s.view} hidden={s.hidden} />
        <div className="board-bottom"><span className="scroll-hint">左右滑动查看指板</span></div>
      </section>
      <section className="display-controls" aria-label="显示与练习">
        <div className="display-field"><span className="field-label">显示</span><div className="segmented"><button aria-pressed={s.view === 'name'} onClick={() => change({ view: 'name' })}>音名</button><button aria-pressed={s.view === 'degree'} onClick={() => change({ view: 'degree' })}>音级</button></div></div>
        <div className="practice-actions"><button className={`memory-button ${s.hidden ? 'is-hidden' : ''}`} aria-pressed={s.hidden} onClick={() => change({ hidden: !s.hidden })}><span aria-hidden="true">{s.hidden ? '◉' : '◌'}</span>{s.hidden ? '揭晓答案' : '隐藏答案'}</button><button className="share-button" onClick={share}>分享设置 <span aria-hidden="true">↗</span></button></div>
      </section>
      <section className="note-summary" aria-label="构成音"><span className="field-label">{s.hidden ? '记忆训练' : '构成音'}</span>{s.hidden ? <p>观察位置与根音，试着说出每个音。准备好后，揭晓答案。</p> : <div className="note-list">{notes.map((note, i) => <div key={i} className={i === 0 ? 'summary-root' : ''}><b>{note.name}</b><span>{note.degree}</span></div>)}</div>}</section>
      {manualShare && <div className="help-panel"><label htmlFor="share-url">长按或选中下方链接复制，打开后会恢复当前设置。</label><input id="share-url" ref={shareInput} readOnly value={manualShare} /><button className="text-button" onClick={() => setManualShare('')}>收起链接</button></div>}
    </main>
    <footer><span className="connection"><i className={online ? 'online' : ''} />{!online ? offlineReady ? '离线练习中' : '当前离线' : offlineReady ? '离线已就绪' : import.meta.env.DEV ? '开发预览' : pwaError || !('serviceWorker' in navigator) ? '离线未就绪' : '准备离线资源…'}</span><button onClick={() => { setSettings({ ...DEFAULT_SETTINGS }); setNotice('已恢复 E 自然大调音阶'); }}>恢复默认</button></footer>
    <div className="toast" role="status" aria-live="polite">{notice}</div>
  </div>;
}
