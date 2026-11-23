import { useEffect, useId, useState } from 'react';
import type { PgStatsView } from '@protocol';
import { usePgEnv } from '../context.ts';
import { usePg, usePgEvent, useServerClock } from '../hooks.ts';
import { PgSection } from '../ui.tsx';
import { Glyph, type GlyphName } from '../art.tsx';
import './tools.css';

const nf = (n: number) => n.toLocaleString('pt-BR');

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

function Chart({ points }: { points: [number, number][] }) {
  const id = useId().replace(/:/g, '');
  if (points.length < 2) return <p className="pg-hint">Ainda não há dados suficientes. Volte daqui a pouco.</p>;
  const W = 300;
  const H = 90;
  const t0 = points[0]![0];
  const t1 = points[points.length - 1]![0];
  const span = Math.max(1, t1 - t0);
  const max = Math.max(1, ...points.map((p) => p[1]));
  const xy = points.map(([t, n]) => `${(((t - t0) / span) * W).toFixed(1)},${(H - 6 - (n / max) * (H - 16)).toFixed(1)}`);
  const line = `M${xy.join(' L')}`;
  return (
    <svg className="pg-stats-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pessoas no Playground ao longo do tempo, pico de ${max}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`a${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2ab4ee" stopOpacity="0.7" />
          <stop offset="1" stopColor="#7ee9ff" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#a${id})`} />
      <path d={line} fill="none" stroke="#0b6fd6" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function RoomStats() {
  const { store, room } = usePgEnv();
  const snap = usePg(store, (s) => s.snap);
  const now = useServerClock(store, 1000);
  const [view, setView] = useState<PgStatsView | null>(null);
  const ready = snap !== null;

  usePgEvent(store, 'stats', (e) => setView(e.v));
  useEffect(() => {
    if (!ready) return;
    store.send({ k: 'stats' });
    const id = window.setInterval(() => store.send({ k: 'stats' }), 4000);
    return () => window.clearInterval(id);
  }, [store, ready]);

  if (!snap) return null;
  const st = view?.stats ?? snap.stats;

  const starts = room.streams.map((s) => s.info.startedAt).filter((t): t is number => typeof t === 'number');
  const liveFrom = starts.length ? Math.min(...starts) : null;
  const active = view ? view.activeMs + (view.activeSince !== null ? Math.max(0, now - view.activeSince) : 0) : 0;
  const watching = room.viewers + (room.hostOnline ? 1 : 0);

  const bubbles: { glyph: GlyphName; label: string; v: number }[] = [
    { glyph: 'users', label: 'Espectadores agora', v: watching },
    { glyph: 'users', label: 'Pessoas que passaram', v: st.visitors },
    { glyph: 'crown', label: 'Pico de gente', v: st.peak },
    { glyph: 'smile', label: 'Reações', v: st.reactions },
    { glyph: 'bubbles', label: 'Bolhas estouradas', v: st.bubbles },
    { glyph: 'sparkle', label: 'Pontos no Playground', v: st.score },
    { glyph: 'brush', label: 'Desenhos', v: st.strokes },
    { glyph: 'shell', label: 'Sons tocados', v: st.sounds },
    { glyph: 'poll', label: 'Votações', v: st.polls },
    { glyph: 'wheel', label: 'Sorteios', v: st.spins },
    { glyph: 'apple', label: 'Comidas no aquário', v: st.feeds },
    { glyph: 'stage', label: 'Desafios e sugestões', v: st.asks },
    { glyph: 'bolt', label: 'Eventos visuais', v: st.vfx },
  ];

  return (
    <div className="pg-tool">
      <section className="pg-stats-hero">
        <div className="pg-stats-beam" aria-hidden />
        <div className="pg-stats-time">
          <Glyph name="lighthouse" size={22} />
          <span className="pg-stats-cap">Tempo de transmissão</span>
          {liveFrom !== null ? <strong className="pg-stats-big">{clock(now - liveFrom)}</strong> : <strong className="pg-stats-none">Ninguém ao vivo agora</strong>}
        </div>
        <div className="pg-stats-time">
          <Glyph name="clock" size={22} />
          <span className="pg-stats-cap">Sala com gente</span>
          <strong className="pg-stats-big">{view ? clock(active) : '--:--'}</strong>
        </div>
      </section>

      <PgSection title="Mar de números">
        <ul className="pg-stats-sea">
          {bubbles.map((b, i) => {
            const size = Math.round(Math.min(112, Math.max(66, 60 + Math.log10(b.v + 1) * 16)));
            return (
              <li key={b.label} className="pg-stats-bubble" style={{ width: size, height: size, ['--d' as string]: `${(i % 5) * -1.1}s` }} aria-label={`${b.label}: ${nf(b.v)}`}>
                <Glyph name={b.glyph} size={16} />
                <strong>{nf(b.v)}</strong>
                <span>{b.label}</span>
              </li>
            );
          })}
        </ul>
      </PgSection>

      <PgSection title="Pessoas no Playground ao longo do tempo">
        <Chart points={view?.timeline ?? []} />
      </PgSection>
    </div>
  );
}
