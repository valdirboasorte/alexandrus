import { useEffect, useState } from 'react';
import { LIMIT_REASON, type SenderStats, type ViewerStats } from '../../lib/rtc/stats.ts';
import type { Watcher } from './useRoomSession.ts';

const dash = '—';
const mbps = (kbps: number | null) => (kbps === null ? dash : kbps >= 1000 ? `${(kbps / 1000).toFixed(1).replace('.', ',')} Mbps` : `${kbps} kbps`);
const ms = (v: number | null) => (v === null ? dash : `${v} ms`);

function usePoll<T>(read: () => Promise<T> | null, every = 1500) {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const p = read();
      if (!p) return;
      try {
        const v = await p;
        if (alive) setValue(v);
      } catch {
        /* conexão fechando */
      }
    };
    void tick();
    const id = window.setInterval(tick, every);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [read, every]);
  return value;
}

function quality(rtt: number | null, loss: number | null): { label: string; tone: 'ok' | 'warn' | 'bad' } | null {
  if (rtt === null && loss === null) return null;
  if ((loss ?? 0) > 5 || (rtt ?? 0) > 250) return { label: 'Ruim', tone: 'bad' };
  if ((loss ?? 0) > 1.5 || (rtt ?? 0) > 120) return { label: 'Razoável', tone: 'warn' };
  return { label: 'Ótima', tone: 'ok' };
}

export function ViewerStatsView({ read, sourceWidth }: { read: () => Promise<ViewerStats> | null; sourceWidth?: number }) {
  const s = usePoll(read);
  if (!s) return <p className="stats-empty">Medindo a conexão…</p>;
  const q = quality(s.rttMs, s.lossPct);
  const reduced = !!(sourceWidth && s.width && s.width < sourceWidth * 0.85);
  return (
    <dl className="stats-grid">
      {q && (
        <div className="stats-grid__wide">
          <dt>Conexão agora</dt>
          <dd className={`stats-tone stats-tone--${q.tone}`}>{q.label}</dd>
        </div>
      )}
      <div>
        <dt>Imagem</dt>
        <dd>
          {s.width && s.height ? `${s.width}×${s.height}` : dash}
          {reduced && <span className="stats-note">reduzida pela conexão</span>}
        </dd>
      </div>
      <div>
        <dt>Quadros</dt>
        <dd className={s.fps === 0 ? 'stats-tone stats-tone--bad' : undefined}>{s.fps === null ? dash : s.fps === 0 ? 'travado' : `${s.fps} FPS`}</dd>
      </div>
      <div>
        <dt>Vídeo</dt>
        <dd>{mbps(s.videoKbps)}</dd>
      </div>
      <div>
        <dt>Áudio</dt>
        <dd>{mbps(s.audioKbps)}</dd>
      </div>
      <div>
        <dt>Atraso de rede</dt>
        <dd>{ms(s.rttMs)}</dd>
      </div>
      <div>
        <dt>Buffer</dt>
        <dd>{ms(s.jitterBufferMs)}</dd>
      </div>
      <div>
        <dt>Perda</dt>
        <dd>{s.lossPct !== null ? `${String(s.lossPct).replace('.', ',')}%` : dash}</dd>
      </div>
      <div>
        <dt>Caminho</dt>
        <dd>{s.transport ?? dash}</dd>
      </div>
      <div>
        <dt>Codec</dt>
        <dd>{s.codec ?? dash}</dd>
      </div>
    </dl>
  );
}

export function HostStatsView({ read, viewers }: { read: () => Promise<Map<string, SenderStats>>; viewers: Watcher[] }) {
  const map = usePoll(read);
  if (viewers.length === 0) return <p className="stats-empty">Ninguém está assistindo a sua tela agora. Os números aparecem por pessoa.</p>;
  if (!map) return <p className="stats-empty">Medindo…</p>;
  return (
    <ul className="host-stats">
      {viewers.map((v) => {
        const s = map.get(v.id);
        const q = s ? quality(s.rttMs, s.lossPct) : null;
        return (
          <li key={v.id}>
            <p className="host-stats__name">
              {v.name}
              {q && <span className={`stats-tone stats-tone--${q.tone}`}>{q.label}</span>}
            </p>
            {v.adaptLevel > 0 && (
              <p className="host-stats__adapt">
                Rede fraca: ajustado para até {mbps(Math.round(v.step.bps / 1000))}
                {v.step.scale > 1 ? `, resolução ÷${String(v.step.scale).replace('.', ',')}` : ''}
                {v.step.fps < 60 ? `, ${v.step.fps} FPS` : ''}
              </p>
            )}
            {s ? (
              <p className="host-stats__line">
                {s.width && s.height ? `${s.width}×${s.height}` : dash} · {s.fps ?? dash} FPS · {mbps(s.videoKbps)} · {ms(s.rttMs)}
                {s.codec ? ` · ${s.codec}` : ''}
                {s.limitedBy ? ` · limitado pelo ${LIMIT_REASON[s.limitedBy] ?? s.limitedBy}` : ''}
              </p>
            ) : (
              <p className="host-stats__line">conectando…</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
