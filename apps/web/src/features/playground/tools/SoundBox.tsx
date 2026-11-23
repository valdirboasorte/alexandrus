import { useEffect, useRef, useState } from 'react';
import { PG_COOLDOWN, SOUNDS, SOUND_CATEGORIES, type PgErrCode, type SoundCategory } from '@protocol';
import { AeroToggle } from '../../../components/ui/controls.tsx';
import { usePgEnv } from '../context.ts';
import { usePg, usePgEvent, useCooldown } from '../hooks.ts';
import { usePrefs, setPrefs } from '../prefs.ts';
import { playSound, unlockAudio } from '../sfx.ts';
import { ERR_TEXT } from '../store.ts';
import { PgSection, PgNotice, CooldownRing, secondsLabel } from '../ui.tsx';
import { Glyph } from '../art.tsx';
import './tools.css';

interface Played {
  key: number;
  by: string;
  name: string;
}

let seq = 0;

export default function SoundBox() {
  const { store, leak } = usePgEnv();
  const snap = usePg(store, (s) => s.snap);
  const left = useCooldown(store, 'sound');
  const prefs = usePrefs();
  const [cat, setCat] = useState<SoundCategory>('memes');
  const [feed, setFeed] = useState<Played[]>([]);
  const [err, setErr] = useState<PgErrCode | null>(null);
  const timer = useRef(0);

  usePgEvent(store, 'sound', (e) => {
    const name = SOUNDS.find((s) => s.id === e.s)?.name ?? e.s;
    setFeed((f) => [{ key: ++seq, by: e.by, name }, ...f].slice(0, 6));
  });
  usePgEvent(store, 'err', (e) => {
    if (e.act !== 'sound') return;
    setErr(e.code);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setErr(null), 4000);
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!snap) return null;
  const { settings, you } = snap;
  const blocked = !settings.sounds || settings.calm || you.muted;
  const pads = SOUNDS.filter((s) => s.cat === cat);

  return (
    <div className="pg-tool">
      {!settings.sounds && <PgNotice>O anfitrião desligou a Concha Sonora.</PgNotice>}
      {settings.sounds && settings.calm && <PgNotice>Modo calmo: sons pausados.</PgNotice>}
      {you.muted && <PgNotice>O anfitrião silenciou você no Playground.</PgNotice>}
      {leak && <PgNotice tone="warn">Sua transmissão está levando o som desta aba, então os efeitos ficam mudos aqui para não irem junto.</PgNotice>}
      {err && <PgNotice tone="warn">{ERR_TEXT[err]}</PgNotice>}

      <div className="pg-sound-tabs" role="group" aria-label="Categorias de sons">
        {SOUND_CATEGORIES.map((c) => (
          <button key={c.id} type="button" className="pg-sound-tab" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="pg-sound-grid">
        {pads.map((s) => (
          <div key={s.id} className="pg-sound-cell">
            <button
              type="button"
              className="pg-sound-pad"
              disabled={blocked || left > 0}
              onClick={() => {
                unlockAudio();
                store.sendCooled({ k: 'sound', s: s.id }, PG_COOLDOWN.sound);
              }}
            >
              <CooldownRing left={left} total={PG_COOLDOWN.sound} />
              <Glyph name="shell" size={20} />
              <span>{s.name}</span>
            </button>
            <button
              type="button"
              className="pg-sound-ear"
              aria-label={`Ouvir só aqui: ${s.name}`}
              title="Ouvir só aqui"
              onClick={() => {
                unlockAudio();
                if (!prefs.muted && !leak) playSound(s.id, prefs.volume);
              }}
            >
              <Glyph name="volume" size={18} />
            </button>
          </div>
        ))}
      </div>
      <p className="pg-hint" aria-live="polite">
        {left > 0 ? `Pode tocar de novo em ${secondsLabel(left)}.` : 'Toque num som para tocar para a sala toda. O botão ao lado ouve só aqui.'}
      </p>

      <PgSection title="Tocados agora">
        {feed.length === 0 ? (
          <p className="pg-hint">Nada tocou ainda.</p>
        ) : (
          <ul className="pg-sound-feed">
            {feed.map((f) => (
              <li key={f.key}>
                <strong>{f.by}</strong> tocou {f.name}
              </li>
            ))}
          </ul>
        )}
      </PgSection>

      <PgSection title="Só para você">
        <label className="pg-label" htmlFor="pg-sound-vol">
          Volume
        </label>
        <input
          id="pg-sound-vol"
          className="aero-range"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={prefs.volume}
          onChange={(e) => setPrefs({ volume: Number(e.target.value) })}
        />
        <div className="pg-set-row">
          <span>Silenciar efeitos</span>
          <AeroToggle label="Silenciar efeitos" checked={prefs.muted} onChange={(v) => setPrefs({ muted: v })} />
        </div>
        <p className="pg-hint">Os sons tocam aqui no Alexandrus, nunca na transmissão nem no seu microfone.</p>
      </PgSection>
    </div>
  );
}
