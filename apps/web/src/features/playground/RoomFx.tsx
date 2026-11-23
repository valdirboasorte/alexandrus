import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FISH_SPECIES, PG_LIMITS, REACTIONS, SOUNDS, VFX, type ReactionKind, type SpinView, type VfxKind } from '@protocol';
import { Glyph, Orb, REACTION_LABEL, ReactionArt } from './art.tsx';
import { usePg, usePgEvent, useCooldown } from './hooks.ts';
import { reducedMotion } from './loop.ts';
import { getPrefs, usePrefs } from './prefs.ts';
import { playSound, playUi, unlockAudio } from './sfx.ts';
import type { PlaygroundStore } from './store.ts';
import { PgPollChip } from './RoomBits.tsx';
import { spinAnimation, targetRotation, Wheel } from './tools/Wheel.tsx';
import './tools/randomizer.css';

/*
 * Efeitos do Playground por cima do palco, para todo mundo na sala (inclusive
 * em tela cheia): reações subindo, eventos visuais, a roleta da sala, avisos de
 * desafio aceito e quem tocou um som. Tudo é decorativo e sem cliques no meio
 * do vídeo (pointer-events: none), com teto de elementos simultâneos.
 */

interface Float {
  id: number;
  kind: ReactionKind;
  by: string;
  x: number;
  rise: number;
  dur: number;
}

interface Banner {
  id: number;
  glyph: Parameters<typeof Glyph>[0]['name'];
  title: string;
  text: string;
}

const MAX_FLOATS = 22;
let seq = 0;

interface FxProps {
  store: PlaygroundStore;
  leak: boolean;
  wheelOpen: boolean;
  pollChip: boolean;
  onPoll: () => void;
  /** Bandeja de reações aberta (fica aqui, fora do dock, que rola e cortaria). */
  tray: boolean;
  onTrayClose: () => void;
}

export const RoomFx = memo(function RoomFx({ store, leak, wheelOpen, pollChip, onPoll, tray, onTrayClose }: FxProps) {
  const prefs = usePrefs();
  const [floats, setFloats] = useState<Float[]>([]);
  const [vfx, setVfx] = useState<{ id: number; v: VfxKind; by: string } | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [soundTag, setSoundTag] = useState<{ id: number; by: string; name: string } | null>(null);
  const [spin, setSpin] = useState<SpinView | null>(null);
  const enabled = usePg(store, (s) => s.snap?.settings.enabled ?? false);
  const pid = usePg(store, (s) => s.snap?.you.pid ?? null);
  const calm = usePg(store, (s) => s.snap?.settings.calm ?? false);
  const showFx = prefs.showFx && enabled;

  const removeFloat = useCallback((id: number) => setFloats((f) => f.filter((x) => x.id !== id)), []);

  usePgEvent(store, 'react', (e) => {
    if (!getPrefs().showFx) return;
    const light = getPrefs().light || calm;
    setFloats((f) => {
      if (light && f.length >= 8) return f;
      const next = [...f, { id: ++seq, kind: e.r, by: e.from === pid ? 'você' : e.by, x: 55 + Math.random() * 38, rise: -(220 + Math.random() * 180), dur: 2.8 + Math.random() * 1.2 }];
      return next.length > MAX_FLOATS ? next.slice(next.length - MAX_FLOATS) : next;
    });
  });

  usePgEvent(store, 'sound', (e) => {
    const p = getPrefs();
    const name = SOUNDS.find((s) => s.id === e.s)?.name ?? e.s;
    // o som toca só aqui na página; se a minha transmissão capta esta aba, fica mudo
    if (!p.muted && !leak) playSound(e.s, p.volume);
    setSoundTag({ id: ++seq, by: e.from === pid ? 'Você' : e.by, name });
  });

  usePgEvent(store, 'vfx', (e) => {
    if (!getPrefs().showFx) return;
    setVfx({ id: ++seq, v: e.v, by: e.from === pid ? 'Você' : e.by });
  });

  usePgEvent(store, 'spin', (e) => {
    if (!wheelOpen) setSpin(e.spin);
  });

  usePgEvent(store, 'asks', (e) => {
    const c = e.changed;
    if (!c) return;
    if (c.status === 'accepted') setBanner({ id: ++seq, glyph: 'flag', title: c.kind === 'challenge' ? 'Desafio aceito!' : 'Sugestão aceita!', text: `${c.text} — ${c.byName}` });
  });

  usePgEvent(store, 'unlock', (e) => {
    const name = FISH_SPECIES.find((s) => s.id === e.species)?.name ?? e.species;
    setBanner({ id: ++seq, glyph: 'fish', title: 'Espécie nova no aquário', text: `${name} foi liberado pela sala` });
  });

  useEffect(() => {
    if (!vfx) return;
    const t = window.setTimeout(() => setVfx(null), 8000);
    return () => window.clearTimeout(t);
  }, [vfx]);

  if (!enabled) return null;

  return (
    <div className="pg-fx" aria-live="polite">
      {showFx &&
        floats.map((f) => (
          <span
            key={f.id}
            className="pg-float"
            style={{ left: `${f.x}%`, ['--rise' as string]: `${f.rise}px`, ['--dur' as string]: `${f.dur}s` }}
            onAnimationEnd={(ev) => ev.target === ev.currentTarget && removeFloat(f.id)}
          >
            <span className="pg-float__sway">
              <ReactionArt kind={f.kind} size={48} />
            </span>
            <span className="pg-float__name">{f.by}</span>
          </span>
        ))}
      {showFx && vfx && <VfxLayer key={vfx.id} v={vfx.v} by={vfx.by} light={prefs.light || reducedMotion()} />}
      {banner && (
        <div key={banner.id} className="pg-banner glass glass--deep" onAnimationEnd={() => setBanner(null)}>
          <Orb tone="orange" glyph={banner.glyph} size={40} />
          <span className="pg-banner__text">
            <strong>{banner.title}</strong>
            <span>{banner.text}</span>
          </span>
        </div>
      )}
      {soundTag && (
        <span key={soundTag.id} className="pg-soundtag glass glass--deep" onAnimationEnd={() => setSoundTag(null)}>
          <Orb tone="violet" glyph="shell" size={28} />
          <span>
            <strong>{soundTag.by}</strong> tocou {soundTag.name}
          </span>
        </span>
      )}
      {tray && (
        <div className="pg-fx__tray">
          <ReactionTray store={store} onClose={onTrayClose} />
        </div>
      )}
      {pollChip && (
        <div className="pg-fx__poll">
          <PgPollChip store={store} onOpen={onPoll} />
        </div>
      )}
      {spin && !wheelOpen && <SpinCard key={spin.id} spin={spin} store={store} onDone={() => setSpin(null)} />}
    </div>
  );
});

/* ---------------- eventos visuais ---------------- */

function VfxLayer({ v, by, light }: { v: VfxKind; by: string; light: boolean }) {
  const name = VFX.find((x) => x.id === v)?.name ?? v;
  const n = light ? 8 : 22;
  const items = useRef(
    Array.from({ length: n }, (_, i) => ({
      i,
      x: Math.random() * 100,
      y: 20 + Math.random() * 60,
      size: 14 + Math.random() * 42,
      dur: 4 + Math.random() * 3,
      delay: Math.random() * 1.8,
      dx: (Math.random() - 0.5) * 120,
      dy: (Math.random() - 0.3) * 30,
      rot: 360 + Math.random() * 540,
      hue: Math.floor(Math.random() * 360),
    })),
  ).current;

  return (
    <>
      <span className="pg-vfx-caption glass glass--deep">
        <Orb tone="teal" glyph="sparkle" size={30} />
        <span className="pg-banner__text">
          <strong>{name}</strong>
          <span>por {by}</span>
        </span>
      </span>
      {v === 'arco-iris' && <span className="pg-vfx-item pg-vfx-rainbow" />}
      {v === 'bolhas' &&
        items.map((it) => (
          <span
            key={it.i}
            className="pg-vfx-item pg-vfx-bubble"
            style={{ left: `${it.x}%`, bottom: -60, width: it.size, height: it.size, animationDelay: `${it.delay}s`, ['--dur' as string]: `${it.dur}s`, ['--dx' as string]: `${it.dx}px` }}
          />
        ))}
      {v === 'folhas' &&
        items.map((it) => (
          <span
            key={it.i}
            className="pg-vfx-item pg-vfx-leaf"
            style={{ left: -60, top: `${it.y - 25}%`, animationDelay: `${it.delay}s`, ['--dur' as string]: `${it.dur + 1}s`, ['--dy' as string]: `${it.dy}vh`, ['--rot' as string]: `${it.rot}deg` }}
          >
            <svg width={it.size * 0.8} height={it.size * 0.8} viewBox="0 0 24 24" aria-hidden>
              <path d="M5 19c0-8 5-13.5 14-14.5-.5 9-6 14.5-14 14.5Z" fill={`hsl(${90 + (it.hue % 50)} 70% 50%)`} stroke="#fff" strokeWidth="1.2" />
              <path d="M5 19 13 11" stroke="#fff" strokeWidth="1.2" opacity="0.7" />
            </svg>
          </span>
        ))}
      {v === 'cardume' &&
        items.slice(0, light ? 6 : 14).map((it) => (
          <span
            key={it.i}
            className="pg-vfx-item pg-vfx-fish"
            style={{ left: 0, top: `${30 + (it.y - 20) * 0.6}%`, animationDelay: `${it.delay * 0.8}s`, ['--dur' as string]: `${it.dur + 1}s`, ['--dy' as string]: `${it.dy * 0.4}vh` }}
          >
            <svg width={it.size + 16} height={(it.size + 16) * 0.6} viewBox="0 0 40 24" aria-hidden>
              <path d="M4 12c4-6 10-8 18-8 7 0 11 4 14 8-3 4-7 8-14 8-8 0-14-2-18-8Z" fill={`hsl(${it.hue} 85% 58%)`} stroke="#fff" strokeWidth="1.4" />
              <path d="M4 12 0 5v14l4-7Z" fill={`hsl(${it.hue} 85% 48%)`} />
              <circle cx="29" cy="10" r="2" fill="#063a7a" />
              <ellipse cx="18" cy="8" rx="6" ry="1.8" fill="#fff" opacity="0.55" />
            </svg>
          </span>
        ))}
    </>
  );
}

/* ---------------- roleta da sala (cartão) ---------------- */

function SpinCard({ spin, store, onDone }: { spin: SpinView; store: PlaygroundStore; onDone: () => void }) {
  const disc = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    // só o disco gira; o ponteiro da roda fica parado em cima
    const el = disc.current?.querySelector<HTMLElement>('.pg-wheel__disc');
    if (!el) return;
    const elapsed = Math.max(0, store.serverNow() - spin.at);
    const total = reducedMotion() ? 900 : PG_LIMITS.spinMs - 400;
    const left = Math.max(0, total - elapsed);
    const to = targetRotation(0, spin.pick, spin.opts.length, 4);
    let anim: Animation | null = null;
    let t = 0;
    const finish = () => {
      setDone(true);
      const p = getPrefs();
      if (!p.muted) playUi('win', p.volume * 0.7);
      t = window.setTimeout(onDone, 5000);
    };
    if (left < 200) {
      el.style.transform = `rotate(${to}deg)`;
      finish();
    } else {
      anim = spinAnimation(el, 0, to, left);
      anim.onfinish = finish;
    }
    return () => {
      anim?.cancel();
      window.clearTimeout(t);
    };
  }, [spin, store, onDone]);

  return (
    <div className="pg-spincard glass glass--frost" role="status">
      <span className="pg-spincard__title">
        {spin.by} girou: {spin.title}
      </span>
      <div className="pg-spincard__wheel">
        <div ref={disc} className="pg-spincard__disc">
          <Wheel opts={spin.opts} rotation={0} size={150} />
        </div>
      </div>
      <span className="pg-spincard__result">{done ? spin.opts[spin.pick] : 'Girando…'}</span>
    </div>
  );
}

/* ---------------- bandeja de reações (no dock da sala) ---------------- */

export function ReactionTray({ store, onClose }: { store: PlaygroundStore; onClose: () => void }) {
  const settings = usePg(store, (s) => s.snap?.settings);
  const muted = usePg(store, (s) => s.snap?.you.muted ?? false);
  const left = useCooldown(store, 'react');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !(t instanceof Element && t.closest('[data-react-toggle]'))) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const off = !settings?.reactions || muted;
  const gap = settings?.calm ? 5000 : 450;
  return (
    <div ref={ref} className="pg-tray glass glass--deep" role="toolbar" aria-label={off ? 'Reações desligadas' : 'Mandar uma reação'}>
      {REACTIONS.map((r) => (
        <button
          key={r}
          type="button"
          className="pg-tray__btn"
          disabled={off || left > 0}
          aria-label={REACTION_LABEL[r]}
          title={off ? (muted ? 'O anfitrião silenciou você' : 'O anfitrião desligou as reações') : REACTION_LABEL[r]}
          onClick={() => {
            unlockAudio();
            store.sendCooled({ k: 'react', r }, gap);
          }}
        >
          <ReactionArt kind={r} size={36} />
        </button>
      ))}
    </div>
  );
}
