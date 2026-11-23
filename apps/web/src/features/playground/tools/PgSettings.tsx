import { useRef, useState } from 'react';
import type { PgErrCode, PgSettings as Settings } from '@protocol';
import { AeroToggle, Segmented } from '../../../components/ui/controls.tsx';
import { usePgEnv } from '../context.ts';
import { usePg, usePgEvent } from '../hooks.ts';
import { usePrefs, setPrefs } from '../prefs.ts';
import { ERR_TEXT } from '../store.ts';
import { PgSection, PgNotice } from '../ui.tsx';
import './tools.css';

type BoolKey = 'enabled' | 'sounds' | 'reactions' | 'vfx' | 'asks' | 'calm';

const ROWS: { key: BoolKey; label: string; on: string }[] = [
  { key: 'enabled', label: 'Playground ligado', on: 'Playground ligado' },
  { key: 'sounds', label: 'Sons da Concha Sonora', on: 'Sons liberados' },
  { key: 'reactions', label: 'Reações', on: 'Reações liberadas' },
  { key: 'vfx', label: 'Eventos visuais', on: 'Eventos visuais liberados' },
  { key: 'asks', label: 'Pedidos para o anfitrião', on: 'Pedidos liberados' },
  { key: 'calm', label: 'Modo calmo: sem sons nem eventos, reações espaçadas', on: 'Modo calmo ligado' },
];

function Row({ id, label, checked, onChange, disabled }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="pg-set-row">
      <label htmlFor={id}>{label}</label>
      <AeroToggle id={id} label={label} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

export default function PgSettings() {
  const { store, isHost, people } = usePgEnv();
  const snap = usePg(store, (s) => s.snap);
  const prefs = usePrefs();
  const [err, setErr] = useState<PgErrCode | null>(null);
  const timer = useRef(0);

  usePgEvent(store, 'err', (e) => {
    if (e.act !== 'settings' && e.act !== 'mute') return;
    setErr(e.code);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setErr(null), 4000);
  });

  if (!snap) return null;
  const s = snap.settings;
  const patch = (p: Partial<Settings>) => store.send({ k: 'settings', patch: p });
  const guests = people.filter((p) => p.role !== 'host');
  const allowed = ROWS.filter((r) => r.key !== 'enabled' && (r.key === 'calm' ? s.calm : s[r.key])).map((r) => r.on);

  return (
    <div className="pg-tool">
      {err && <PgNotice tone="warn">{ERR_TEXT[err]}</PgNotice>}

      <PgSection title="Para você">
        <label className="pg-label" htmlFor="pg-set-vol">
          Volume dos efeitos
        </label>
        <input id="pg-set-vol" className="aero-range" type="range" min={0} max={1} step={0.05} value={prefs.volume} onChange={(e) => setPrefs({ volume: Number(e.target.value) })} />
        <Row id="pg-set-mute" label="Silenciar efeitos" checked={prefs.muted} onChange={(v) => setPrefs({ muted: v })} />
        <Row id="pg-set-fx" label="Mostrar reações e eventos na tela" checked={prefs.showFx} onChange={(v) => setPrefs({ showFx: v })} />
        <Row id="pg-set-light" label="Efeitos leves" checked={prefs.light} onChange={(v) => setPrefs({ light: v })} />
        <p className="pg-hint">Isso vale só para você, ninguém mais vê.</p>
      </PgSection>

      {isHost ? (
        <>
          <PgSection title="Controles do anfitrião">
            {ROWS.map((r) => (
              <Row key={r.key} id={`pg-set-${r.key}`} label={r.label} checked={s[r.key]} onChange={(v) => patch({ [r.key]: v })} />
            ))}
            <div className="pg-set-field">
              <span className="pg-label">Quem cria votações e sorteios</span>
              <Segmented
                label="Quem cria votações e sorteios"
                value={s.polls}
                onChange={(v) => patch({ polls: v })}
                options={[
                  { value: 'host', label: 'Só eu' },
                  { value: 'all', label: 'Todos' },
                ]}
              />
            </div>
            <div className="pg-set-field">
              <span className="pg-label">Quem limpa o quadro</span>
              <Segmented
                label="Quem limpa o quadro"
                value={s.clear}
                onChange={(v) => patch({ clear: v })}
                options={[
                  { value: 'host', label: 'Só eu' },
                  { value: 'all', label: 'Todos' },
                ]}
              />
            </div>
          </PgSection>

          <PgSection title="Silenciar no Playground">
            {guests.length === 0 ? (
              <p className="pg-hint">Ninguém além de você na sala.</p>
            ) : (
              guests.map((p) => (
                <Row
                  key={p.id}
                  id={`pg-set-mute-${p.id}`}
                  label={p.name}
                  checked={snap.mutedPeers.includes(p.id)}
                  onChange={(on) => store.send({ k: 'mute', peer: p.id, on })}
                />
              ))
            )}
            <p className="pg-hint">Quem está silenciado continua assistindo e brincando sozinho; só não manda nada para a sala.</p>
          </PgSection>
        </>
      ) : (
        <PgSection title="O que o anfitrião liberou">
          <ul className="pg-set-sum">
            {allowed.length === 0 ? <li>Nada além de ver e brincar sozinho.</li> : allowed.map((t) => <li key={t}>{t}</li>)}
            <li>{s.polls === 'all' ? 'Todos criam votações e sorteios' : 'Só o anfitrião cria votações e sorteios'}</li>
            <li>{s.clear === 'all' ? 'Todos limpam o quadro' : 'Só o anfitrião limpa o quadro'}</li>
          </ul>
        </PgSection>
      )}
    </div>
  );
}
