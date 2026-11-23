import { useEffect, useRef, useState } from 'react';
import { PG_LIMITS, type StrokeView } from '@protocol';
import { Glyph, type GlyphName } from '../art.tsx';
import { usePgEnv } from '../context.ts';
import { usePg, usePgEvent } from '../hooks.ts';
import { ERR_TEXT } from '../store.ts';
import { PgNotice } from '../ui.tsx';
import './paint.css';

/*
 * Ateliê: o quadro coletivo. Cada traço sai em pedaços curtos (a cada 60 ms)
 * e aparece na hora na tela de quem desenha; o servidor numera, guarda e
 * repassa só para quem está com o quadro aberto. Desfazer e limpar passam
 * pelo servidor, então o quadro é o mesmo para todo mundo. Coordenadas num
 * espaço fixo (1600×1000): qualquer tamanho de tela vê o mesmo desenho.
 */

const BW = PG_LIMITS.boardW;
const BH = PG_LIMITS.boardH;
const FLUSH_MS = 60;
const COLORS = ['#052c63', '#0a86d6', '#18c6f2', '#7ee9ff', '#23801d', '#48b52c', '#a6e64c', '#ffc53d', '#ff8a2a', '#ff3d2e', '#ff6fae', '#9a72ff', '#7a5a2c', '#ffffff'];

interface Local {
  id: string;
  n: number | null;
  c: string;
  w: number;
  er: boolean;
  p: number[];
  sent: number;
  done: boolean;
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function strokePath(ctx: CanvasRenderingContext2D, s: { c: string; w: number; er: boolean }, pts: number[], from: number, k: number) {
  if (pts.length < 2) return;
  ctx.globalCompositeOperation = s.er ? 'destination-out' : 'source-over';
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineWidth = s.w * k;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const start = Math.max(0, from - 2);
  if (pts.length - start === 2) {
    // um ponto só: bolinha
    ctx.beginPath();
    ctx.arc(pts[start] * k, pts[start + 1] * k, (s.w * k) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[start] * k, pts[start + 1] * k);
  for (let i = start + 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * k, pts[i + 1] * k);
  ctx.stroke();
}

export default function AeroPaint() {
  const { store, isHost } = usePgEnv();
  const snap = usePg(store, (s) => s.snap);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [color, setColor] = useState(COLORS[1]);
  const [size, setSize] = useState(8);
  const [authors, setAuthors] = useState(false);
  const [drawers, setDrawers] = useState<{ n: number; name: string; x: number; y: number }[]>([]);
  const [labels, setLabels] = useState<{ n: number; name: string; x: number; y: number }[]>([]);
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* estado do quadro, fora do React */
  const strokes = useRef(new Map<number, StrokeView>());
  const order = useRef<number[]>([]);
  const locals = useRef(new Map<string, Local>());
  const k = useRef(1);
  const drawing = useRef<Local | null>(null);
  const toolRef = useRef({ tool, color, size });
  toolRef.current = { tool, color, size };
  const authorsRef = useRef(authors);
  authorsRef.current = authors;

  const ctx = () => canvas.current?.getContext('2d') ?? null;

  /** Redesenha tudo (depois de desfazer, limpar, podar ou mudar de tamanho). */
  const redraw = useRef(() => {
    const cv = canvas.current;
    const c = ctx();
    if (!cv || !c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    const dpr = cv.width / Math.max(1, cv.getBoundingClientRect().width);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const n of order.current) {
      const s = strokes.current.get(n);
      if (s) strokePath(c, s, s.p, 0, k.current);
    }
    // traços meus ainda sem número do servidor
    for (const l of locals.current.values()) if (l.n === null) strokePath(c, l, l.p, 0, k.current);
    c.globalCompositeOperation = 'source-over';
    setCount(order.current.length);
    if (authorsRef.current) refreshLabels();
  }).current;

  const refreshLabels = () => {
    const out: { n: number; name: string; x: number; y: number }[] = [];
    for (const n of order.current) {
      const s = strokes.current.get(n);
      if (!s || s.er || s.p.length < 2) continue;
      const x = s.p[0];
      const y = s.p[1];
      if (out.some((o) => Math.abs(o.x - x) < 60 && Math.abs(o.y - y) < 40)) continue;
      out.push({ n, name: s.byName, x, y });
      if (out.length >= 50) break;
    }
    setLabels(out);
  };

  /* tamanho e assinatura */
  useEffect(() => {
    const cv = canvas.current;
    const el = box.current;
    if (!cv || !el) return;
    const ro = new ResizeObserver(() => {
      const rect = cv.getBoundingClientRect();
      if (rect.width < 20) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(rect.width * dpr);
      cv.height = Math.round(rect.height * dpr);
      k.current = rect.width / BW;
      redraw();
    });
    ro.observe(el);
    const unsub = store.subscribePaint();
    return () => {
      ro.disconnect();
      unsub();
    };
  }, [store, redraw]);

  useEffect(() => {
    if (authors) refreshLabels();
    else setLabels([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authors]);

  /* eventos do servidor */
  usePgEvent(store, 'paint', (e) => {
    strokes.current = new Map(e.strokes.map((s) => [s.n, { ...s, p: s.p.slice() }]));
    order.current = e.strokes.map((s) => s.n);
    for (const [id, l] of locals.current) if (l.done) locals.current.delete(id);
    setLoaded(true);
    redraw();
  });

  usePgEvent(store, 'stroke-ack', (e) => {
    const l = locals.current.get(e.id);
    if (!l) return;
    l.n = e.n;
    strokes.current.set(e.n, { n: e.n, by: snap?.you.pid ?? '', byName: 'Você', c: l.c, w: l.w, er: l.er, p: l.p, done: l.done });
    order.current.push(e.n);
    setCount(order.current.length);
  });

  usePgEvent(store, 'stroke', (e) => {
    const s = e.s;
    let cur = strokes.current.get(s.n);
    const c = ctx();
    if (!cur) {
      cur = { ...s, p: [] };
      strokes.current.set(s.n, cur);
      order.current.push(s.n);
      setCount(order.current.length);
    }
    const from = cur.p.length;
    for (const v of s.p) cur.p.push(v);
    cur.done = s.done;
    if (c) {
      strokePath(c, cur, cur.p, from, k.current);
      c.globalCompositeOperation = 'source-over';
    }
    // etiqueta de quem está desenhando agora
    const lx = cur.p[cur.p.length - 2];
    const ly = cur.p[cur.p.length - 1];
    setDrawers((d) => {
      const rest = d.filter((x) => x.n !== s.n);
      return s.done ? rest : [...rest.slice(-5), { n: s.n, name: s.byName, x: lx, y: ly }];
    });
  });

  usePgEvent(store, 'unstroke', (e) => {
    for (const n of e.ns) {
      strokes.current.delete(n);
      for (const [id, l] of locals.current) if (l.n === n) locals.current.delete(id);
    }
    const gone = new Set(e.ns);
    order.current = order.current.filter((n) => !gone.has(n));
    redraw();
  });

  usePgEvent(store, 'paint-clear', () => {
    strokes.current.clear();
    order.current = [];
    locals.current.clear();
    setDrawers([]);
    redraw();
  });

  usePgEvent(store, 'err', (e) => {
    if (e.act !== 'stroke' && e.act !== 'clear' && e.act !== 'undo') return;
    if (e.act === 'stroke' && e.code === 'cooldown') return;
    setError(ERR_TEXT[e.code]);
    window.setTimeout(() => setError(null), 3500);
  });

  /* envio em pedaços */
  useEffect(() => {
    const id = window.setInterval(() => flush(false), FLUSH_MS);
    return () => window.clearInterval(id);
  });

  const flush = (end: boolean) => {
    const l = drawing.current;
    if (!l) return;
    while (l.sent < l.p.length || end) {
      const chunk = l.p.slice(l.sent, l.sent + PG_LIMITS.chunkMaxNums);
      const last = l.sent + chunk.length >= l.p.length;
      const ok = store.send({ k: 'stroke', id: l.id, c: l.c, w: l.w, er: l.er, p: chunk, end: end && last });
      if (!ok) break;
      l.sent += chunk.length;
      if (last) break;
    }
    if (end) {
      l.done = true;
      drawing.current = null;
    }
  };

  const toBoard = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * BW), Math.round(((e.clientY - r.top) / r.height) * BH)] as const;
  };

  const muted = snap?.you.muted ?? false;

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (muted || !e.isPrimary) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = toolRef.current;
    const [x, y] = toBoard(e);
    const l: Local = { id: randomId(), n: null, c: t.tool === 'eraser' ? '#000000' : t.color, w: t.tool === 'eraser' ? Math.max(14, t.size * 2) : t.size, er: t.tool === 'eraser', p: [x, y], sent: 0, done: false };
    locals.current.set(l.id, l);
    drawing.current = l;
    const c = ctx();
    if (c) {
      strokePath(c, l, l.p, 0, k.current);
      c.globalCompositeOperation = 'source-over';
    }
    flush(false);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const l = drawing.current;
    if (!l || !e.isPrimary) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const c = ctx();
    const r = e.currentTarget.getBoundingClientRect();
    for (const ev of events) {
      const x = Math.round(((ev.clientX - r.left) / r.width) * BW);
      const y = Math.round(((ev.clientY - r.top) / r.height) * BH);
      const lx = l.p[l.p.length - 2];
      const ly = l.p[l.p.length - 1];
      if (Math.hypot(x - lx, y - ly) < 3) continue;
      if (l.p.length >= PG_LIMITS.strokeMaxPoints * 2) {
        flush(true);
        return;
      }
      l.p.push(x, y);
      if (c) strokePath(c, l, l.p, l.p.length - 2, k.current);
    }
    if (c) c.globalCompositeOperation = 'source-over';
  };

  const onUp = () => {
    if (drawing.current) flush(true);
  };

  if (!snap) return null;
  const canClearAll = isHost || snap.settings.clear === 'all';
  const tools: { id: 'brush' | 'eraser'; glyph: GlyphName; label: string }[] = [
    { id: 'brush', glyph: 'brush', label: 'Pincel' },
    { id: 'eraser', glyph: 'eraser', label: 'Borracha' },
  ];

  return (
    <div className="pg-tool pg-paint">
      <div className="pg-paint__window">
        <div className="pg-paint__bar" role="toolbar" aria-label="Ferramentas de desenho">
          {tools.map((t) => (
            <button key={t.id} type="button" className="pg-paint__tool" aria-pressed={tool === t.id} onClick={() => setTool(t.id)} title={t.label}>
              <Glyph name={t.glyph} size={20} />
              <span>{t.label}</span>
            </button>
          ))}
          <span className="pg-paint__sep" aria-hidden />
          <label className="pg-paint__size" title="Tamanho do pincel">
            <span className="pg-paint__dot" style={{ width: Math.min(28, size), height: Math.min(28, size), background: tool === 'eraser' ? '#fff' : color }} aria-hidden />
            <input type="range" className="aero-range" min={PG_LIMITS.brushMin} max={32} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Tamanho do pincel" style={{ ['--fill' as string]: `${((size - 2) / 30) * 100}%` }} />
          </label>
        </div>

        <div className="pg-paint__palette" role="radiogroup" aria-label="Cor">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c && tool === 'brush'}
              className="pg-paint__swatch"
              style={{ background: c }}
              onClick={() => {
                setColor(c);
                setTool('brush');
              }}
              aria-label={`Cor ${c}`}
            />
          ))}
          <label className="pg-paint__custom" title="Outra cor">
            <input type="color" value={color} onChange={(e) => {
              setColor(e.target.value);
              setTool('brush');
            }} aria-label="Escolher outra cor" />
            <Glyph name="plus" size={16} />
          </label>
        </div>

        <div ref={box} className="pg-paint__board" data-eraser={tool === 'eraser' || undefined}>
          <canvas
            ref={canvas}
            className="pg-paint__canvas"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onLostPointerCapture={onUp}
            role="img"
            aria-label="Quadro de desenho compartilhado"
          />
          {drawers.map((d) => (
            <span key={d.n} className="pg-paint__pen" style={{ left: `${(d.x / BW) * 100}%`, top: `${(d.y / BH) * 100}%` }}>
              {d.name}
            </span>
          ))}
          {authors &&
            labels.map((l) => (
              <span key={l.n} className="pg-paint__author" style={{ left: `${(l.x / BW) * 100}%`, top: `${(l.y / BH) * 100}%` }}>
                {l.name}
              </span>
            ))}
          {!loaded && <span className="pg-paint__loading">Carregando o quadro…</span>}
        </div>

        <div className="pg-paint__status">
          <span>{count === 1 ? '1 traço' : `${count} traços`} no quadro</span>
          {drawers.length > 0 && <span>Desenhando: {[...new Set(drawers.map((d) => d.name))].join(', ')}</span>}
        </div>
      </div>

      {muted && <PgNotice tone="warn">O anfitrião silenciou você: o quadro fica só para ver.</PgNotice>}
      {error && <PgNotice tone="warn">{error}</PgNotice>}

      <div className="pg-row">
        <button type="button" className="pg-chip" onClick={() => store.send({ k: 'undo' })} disabled={muted}>
          <Glyph name="undo" size={18} />
          Desfazer
        </button>
        <button type="button" className="pg-chip" onClick={() => store.send({ k: 'clear', mine: true })}>
          <Glyph name="eraser" size={18} />
          Apagar meus traços
        </button>
        {canClearAll && (
          <button type="button" className="pg-chip pg-chip--danger" onClick={() => store.send({ k: 'clear', mine: false })} disabled={muted && !isHost}>
            <Glyph name="trash" size={18} />
            Limpar quadro
          </button>
        )}
        <button type="button" className="pg-chip" aria-pressed={authors} onClick={() => setAuthors((a) => !a)}>
          <Glyph name="users" size={18} />
          Autores
        </button>
      </div>
      <p className="pg-hint">Todo mundo desenha ao mesmo tempo. Quando o quadro enche, os traços mais antigos saem para dar lugar aos novos.</p>
    </div>
  );
}
