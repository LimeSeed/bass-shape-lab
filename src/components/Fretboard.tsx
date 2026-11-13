import { getPositions } from '../lib/fretboard';
import type { Note } from '../lib/musicTheory';
import { useEffect, useState } from 'react';

type Props = { notes: Note[]; start: number; view: 'name' | 'degree'; hidden: boolean };

export default function Fretboard({ notes, start, view, hidden }: Props) {
  const [compact, setCompact] = useState(() => matchMedia('(orientation: landscape) and (max-height: 550px)').matches);
  useEffect(() => {
    const media = matchMedia('(orientation: landscape) and (max-height: 550px)');
    const changed = () => setCompact(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  const positions = getPositions(notes, start);
  const left = 62, top = compact ? 43 : 66, cell = 78, gap = compact ? 40 : 64, width = left + 12 * cell + 22;
  const boardTop = compact ? 20 : 34, boardBottom = compact ? 185 : 282, height = compact ? 192 : 292;
  const frets = Array.from({ length: 12 }, (_, i) => start + i);
  return <div className="board-scroll" tabIndex={0} role="region" aria-label="四弦十二品指板，可横向滚动">
    <svg className="fretboard" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${start}至${start + 11}品，标准EADG调弦${hidden ? '，答案已隐藏' : ''}`}>
      <title>四弦贝斯指板，从上到下为 G、D、A、E 弦</title>
      <rect x={left} y={boardTop} width={12 * cell} height={boardBottom - boardTop} rx="4" fill="#203b39" />
      {frets.map((f, i) => <g key={f}>
        <text className="fret-number" x={left + (i + .5) * cell} y={compact ? 12 : 19} textAnchor="middle">{f}</text>
        <line x1={left + i * cell} x2={left + i * cell} y1={boardTop} y2={boardBottom} stroke="#6b817b" strokeWidth={i === 0 ? 3 : 1.5} />
        {[0, 12].includes(f % 12) ? [top + gap * 1.2, top + gap * 2.2].map(y => <circle key={y} cx={left + (i + .5) * cell} cy={y} r="4" fill="#5d7770" />) : [3, 5, 7, 9].includes(f % 12) && <circle cx={left + (i + .5) * cell} cy={top + gap * 1.7} r="4" fill="#5d7770" />}
      </g>)}
      <line x1={left + 12 * cell} x2={left + 12 * cell} y1={boardTop} y2={boardBottom} stroke="#6b817b" strokeWidth="1.5" />
      {['G', 'D', 'A', 'E'].map((s, i) => <g key={s}>
        <text className="string-label" x="24" y={top + i * gap + 5} textAnchor="middle">{s}</text>
        <line x1={left} x2={left + 12 * cell} y1={top + i * gap} y2={top + i * gap} stroke="#acb7ac" strokeWidth={1.5 + i * .75} />
      </g>)}
      {positions.map(p => {
        const root = p.note.interval === 0;
        const x = left + (p.fret - start + .5) * cell;
        const y = top + p.stringIndex * gap;
        const label = hidden ? '' : view === 'name' ? p.note.name : p.note.degree;
        return <g key={`${p.stringIndex}-${p.fret}`} className={root ? 'note root-note' : 'note'} data-root={root}>
          {!hidden && <title>{p.stringName}弦 {p.fret}品：{p.note.name}，{p.note.degree}级{root ? '，根音' : ''}</title>}
          <circle cx={x} cy={y} r="20" fill={root ? '#dfff8c' : '#e7eee6'} stroke={root ? '#dfff8c' : '#203b39'} strokeWidth="3" />
          {root && <circle cx={x} cy={y} r="24" fill="none" stroke="#dfff8c" strokeWidth="1" opacity=".5" />}
          <text x={x} y={y + .5} textAnchor="middle" dominantBaseline="central" className="note-label">{label}</text>
          {hidden && <circle cx={x} cy={y} r="3" fill="#45614e" />}
        </g>;
      })}
    </svg>
  </div>;
}
