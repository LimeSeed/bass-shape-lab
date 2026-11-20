import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import './cue-editor.css';

export interface CueEditorProps {
  cue: { id: string; time: number; label: string } | null;
  focusName?: boolean;
  onRename: (id: string, label: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

const timeLabel = (seconds: number) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60)}:${(safe % 60).toFixed(2).padStart(5, '0')}`;
};

export default function CueEditor({ cue, focusName = true, onRename, onRemove, onClose }: CueEditorProps) {
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState({ id: '', label: '' });
  const currentDraft = useRef(draft);
  const committed = useRef({ id: '', label: '' });
  const ignoreBlur = useRef(false);
  const latest = useRef({ cue, onRename, onRemove, onClose });
  latest.current = { cue, onRename, onRemove, onClose };

  useLayoutEffect(() => {
    const next = { id: cue?.id ?? '', label: cue?.label ?? '' };
    currentDraft.current = next;
    committed.current = next;
    ignoreBlur.current = false;
    setDraft(next);
    if (cue && focusName) {
      input.current?.focus();
      input.current?.select();
    }
  }, [cue?.id, focusName]);

  function commit() {
    const value = latest.current;
    if (!value.cue || ignoreBlur.current) return;
    const sameCue = currentDraft.current.id === value.cue.id;
    const proposed = (sameCue ? currentDraft.current.label : value.cue.label).trim().slice(0, 40);
    const previous = committed.current.id === value.cue.id ? committed.current.label : value.cue.label;
    // Empty edits restore the last committed name; they never delete a marker.
    const label = proposed || previous;
    const next = { id: value.cue.id, label };
    currentDraft.current = next;
    committed.current = next;
    setDraft(next);
    if (proposed && label !== previous) value.onRename(value.cue.id, label);
  }

  function close(save: boolean) {
    if (save) commit();
    ignoreBlur.current = true;
    latest.current.onClose();
  }

  useEffect(() => {
    if (!cue) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) close(true);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      close(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [cue?.id]);

  if (!cue) return null;

  return createPortal(<div ref={panel} className="cue-editor" role="region" aria-label="节点标记编辑"
    data-testid="cue-editor" onKeyDown={event => event.stopPropagation()}>
    <div className="cue-editor-heading">
      <span>节点标记</span><span className="cue-editor-time">{timeLabel(cue.time)}</span>
      <div className="cue-editor-actions">
        <button type="button" className="cue-editor-icon cue-editor-remove" aria-label="删除节点标记"
          onPointerDown={event => event.preventDefault()} onClick={() => {
            ignoreBlur.current = true;
            onRemove(cue.id);
            onClose();
          }}><Trash2 size={16} /></button>
        <button type="button" className="cue-editor-icon" aria-label="关闭节点标记"
          onPointerDown={event => event.preventDefault()} onClick={() => close(true)}><X size={17} /></button>
      </div>
    </div>
    <input ref={input} type="text" aria-label="节点标记名称" data-testid="cue-name" maxLength={40}
      value={draft.id === cue.id ? draft.label : cue.label}
      onChange={event => {
        const next = { id: cue.id, label: event.target.value };
        currentDraft.current = next;
        setDraft(next);
      }} onBlur={commit} onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          commit();
        }
      }} />
  </div>, document.body);
}
