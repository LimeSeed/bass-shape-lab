import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Flag, MapPin, Play, Save, Trash2, X } from 'lucide-react';
import type { Marker } from '../storage';
import './sections.css';

export interface SectionsProps {
  markers: Marker[];
  disabled: boolean;
  kind?: 'sections' | 'nodes';
  canSave?: boolean;
  onSave?: () => void;
  onRename: (id: string, label: string) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
}

const time = (seconds: number) => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(safe / 60)}:${(safe % 60).toFixed(2).padStart(5, '0')}`;
};

export default function Sections({ markers, disabled, kind = 'sections', canSave, onSave, onRename, onRemove, onSelect }: SectionsProps) {
  const isNodes = kind === 'nodes';
  const title = isNodes ? '节点' : '段落';
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [placement, setPlacement] = useState<CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const names = useRef(new Map<string, HTMLInputElement>());
  const pendingSave = useRef<Set<string> | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const skipBlur = useRef(false);
  const panelId = useId();

  function saveName(marker: Marker, value = drafts[marker.id]) {
    if (skipBlur.current || value === undefined) return;
    const label = value.trim().slice(0, 40);
    if (label && label !== marker.label) onRename(marker.id, label);
    setDrafts(previous => {
      const next = { ...previous };
      delete next[marker.id];
      return next;
    });
  }

  function saveDrafts() {
    for (const marker of markers) {
      const label = drafts[marker.id]?.trim().slice(0, 40);
      if (label && label !== marker.label) onRename(marker.id, label);
    }
    setDrafts({});
  }

  function close(restoreFocus = false, discard = false) {
    skipBlur.current = discard;
    if (!discard) saveDrafts();
    else setDrafts({});
    pendingSave.current = null;
    setOpen(false);
    if (restoreFocus) toggle.current?.focus();
  }

  function handleBlur(_event: FocusEvent) {
    clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      const focused = document.activeElement;
      if (!root.current?.contains(focused) && !panel.current?.contains(focused)) {
        // Inputs commit on blur before focus leaves; do not submit them twice.
        pendingSave.current = null;
        setDrafts({});
        setOpen(false);
      }
    }, 0);
  }

  useEffect(() => () => clearTimeout(blurTimer.current), []);

  useLayoutEffect(() => {
    if (!open) return;
    skipBlur.current = false;
    const position = () => {
      const rect = toggle.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 20;
      const above = rect.top - 20;
      const useAbove = below < 180 && above > below;
      setPlacement({ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        ...(useAbove ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
        maxHeight: Math.max(80, Math.min(380, useAbove ? above : below)) });
    };
    position();
    panel.current?.focus();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, drafts, markers]);

  useEffect(() => {
    if (!open || !pendingSave.current) return;
    const added = markers.find(marker => !pendingSave.current!.has(marker.id));
    if (!added) return;
    pendingSave.current = null;
    names.current.get(added.id)?.focus();
    names.current.get(added.id)?.select();
  }, [markers, open]);

  useEffect(() => { if (disabled && open) close(); }, [disabled]);

  const contents = open && <div ref={panel} id={panelId} className="sections-popover" style={placement}
    role="region" aria-label={`${title}管理`} tabIndex={-1} data-testid={`${kind}-panel`} onBlur={handleBlur}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(true, true); }
    }}>
    <div className="sections-heading"><span>{title} <span className="sections-count">{markers.length}</span></span>
      <button type="button" className="sections-icon" aria-label={`关闭${title}管理`} onClick={() => close(true)}><X size={16} /></button>
    </div>
    {markers.length > 0 && <div className="sections-list">
      {markers.map(marker => <div className="sections-row" key={marker.id}>
        <div className="sections-row-main">
          <input ref={element => { if (element) names.current.set(marker.id, element); else names.current.delete(marker.id); }}
            aria-label={`${title}名称 ${marker.label}`} value={drafts[marker.id] ?? marker.label} maxLength={40} disabled={disabled}
            onChange={event => setDrafts(previous => ({ ...previous, [marker.id]: event.target.value }))}
            onBlur={() => saveName(marker)} onKeyDown={event => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); saveName(marker); }
            }} />
          <button type="button" className="sections-select" disabled={disabled} aria-label={`${isNodes ? '定位节点' : '选择段落'} ${marker.label}`}
            onClick={() => onSelect(marker.id)}>{isNodes ? <MapPin size={12} /> : <Play size={12} />}<span>{time(marker.time)}{'end' in marker && typeof marker.end === 'number' ? `–${time(marker.end)}` : ''}</span></button>
        </div>
        <button type="button" className="sections-icon sections-remove" disabled={disabled} aria-label={`删除${title} ${marker.label}`}
          onClick={() => {
            const remaining = markers.find(item => item.id !== marker.id);
            onRemove(marker.id);
            requestAnimationFrame(() => (remaining ? names.current.get(remaining.id) : panel.current)?.focus());
          }}><Trash2 size={16} /></button>
      </div>)}
    </div>}
    {isNodes && markers.length === 0 && <p className="sections-empty">暂无节点</p>}
    {!isNodes && <button type="button" className="sections-save" disabled={disabled || !canSave} onClick={() => {
      pendingSave.current = new Set(markers.map(marker => marker.id));
      onSave?.();
    }}><Save size={16} /> 保存当前循环</button>}
  </div>;

  return <div ref={root} className="sections-control" onBlur={handleBlur} onKeyDown={event => {
    event.stopPropagation();
    if (open && event.key === 'Escape') { event.preventDefault(); close(true, true); }
  }}>
    <button ref={toggle} type="button" className={`sections-toggle ${open ? 'is-open' : ''}`} data-testid={`${kind}-toggle`}
      disabled={disabled} aria-expanded={open} aria-controls={panelId} onClick={() => { if (open) close(); else setOpen(true); }}>
      {isNodes ? <Flag size={16} /> : <Bookmark size={16} />}<span>{title}</span><span className="sections-count">{markers.length}</span>
    </button>
    {contents && createPortal(contents, document.body)}
  </div>;
}
