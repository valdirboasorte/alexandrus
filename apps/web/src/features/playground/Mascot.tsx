import { useEffect, useRef, useState } from 'react';
import {
  PET_ACCESSORIES,
  PET_STAGE_NAMES,
  PET_STAGES,
  petHungry,
  petMood,
  petStage,
  petTotalXp,
  unlockedAccessories,
  type PetAccessory,
  type PetMood,
  type PetView,
} from '@protocol';
import { AeroButton } from '../../components/ui/AeroButton.tsx';
import { Glyph } from './art.tsx';
import { usePgEnv } from './context.ts';
import { useCooldown, usePg, usePgEvent, useServerClock } from './hooks.ts';
import { getPrefs } from './prefs.ts';
import { playUi, unlockAudio } from './sfx.ts';
import { ERR_TEXT } from './store.ts';
import { PgNotice, PgSection } from './ui.tsx';

/*
 * O mascote da sala: uma gotinha d'água que brota folhas conforme a sala
 * vive. Desenhado em camadas HTML (corpo, olhos, folhas, acessório) para
 * que piscar, respirar e pular animem só transform/opacity de elementos
 * inteiros, nunca o interior de um SVG.
 */

export const MOOD_TEXT: Record<PetMood, string> = {
  eating: 'comendo, nhac nhac',
  happy: 'feliz da vida',
  calm: 'de boa, só olhando',
  missing: 'com saudade de um carinho',
  sleeping: 'dormindo',
};

interface FigureProps {
  stage: number;
  mood: PetMood;
  acc: PetAccessory | null;
  size?: number;
  /** Pulinho de reação (muda a chave a cada clique). */
  hop?: number;
  hungry?: boolean;
}

export function MascotFigure({ stage, mood, acc, size = 120, hop = 0, hungry }: FigureProps) {
  const s = size / 120;
  const asleep = mood === 'sleeping';
  return (
    <span className="pg-pet" data-mood={mood} data-stage={stage} style={{ width: size, height: size * 1.12, ['--s' as string]: s }} aria-hidden>
      {stage >= 3 && <span className="pg-pet__halo" />}
      <span className="pg-pet__shadow" />
      <span className="pg-pet__hop" key={hop}>
        <span className="pg-pet__breathe" data-loop>
          {/* nadadeiras (fase 2+) */}
          {stage >= 2 && (
            <>
              <span className="pg-pet__fin pg-pet__fin--l" data-loop>
                <svg viewBox="0 0 40 30" width={34 * s} height={26 * s}>
                  <path d="M38 6C26 2 8 6 2 22c10 4 26 0 36-16Z" fill="url(#pgFin)" stroke="#fff" strokeWidth="1.6" />
                </svg>
              </span>
              <span className="pg-pet__fin pg-pet__fin--r" data-loop>
                <svg viewBox="0 0 40 30" width={34 * s} height={26 * s}>
                  <path d="M2 6c12-4 30 0 36 16C28 26 12 22 2 6Z" fill="url(#pgFin)" stroke="#fff" strokeWidth="1.6" />
                </svg>
              </span>
            </>
          )}
          <svg className="pg-pet__body" viewBox="0 0 120 134" width={size} height={size * 1.12}>
            <defs>
              <radialGradient id="pgBody" cx="42%" cy="40%" r="70%">
                <stop offset="0" stopColor="#d9fbff" />
                <stop offset="0.45" stopColor="#4fd3f7" />
                <stop offset="1" stopColor="#0b7fd0" />
              </radialGradient>
              <linearGradient id="pgShine" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="pgFin" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#c9ff9a" />
                <stop offset="1" stopColor="#3fb52c" />
              </linearGradient>
              <linearGradient id="pgLeaf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#e2ff9c" />
                <stop offset="1" stopColor="#3aa82a" />
              </linearGradient>
            </defs>
            {/* broto (fase 1+) */}
            {stage >= 1 && (
              <g>
                <path d="M60 22c0-8 1-14 3-18" stroke="#3a9a22" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                <path d="M62 10c6-9 18-10 24-6-4 9-15 12-24 6Z" fill="url(#pgLeaf)" stroke="#fff" strokeWidth="1.5" />
                {stage >= 2 && <path d="M61 13c-6-8-17-9-23-5 4 8 14 11 23 5Z" fill="url(#pgLeaf)" stroke="#fff" strokeWidth="1.5" />}
              </g>
            )}
            <path d="M60 18C60 18 104 64 104 92a44 44 0 0 1-88 0C16 64 60 18 60 18Z" fill="url(#pgBody)" stroke="#fff" strokeWidth="2.5" />
            <path d="M33 76c3-14 13-28 25-40-6 14-9 26-8 40-6 2-12 2-17 0Z" fill="url(#pgShine)" opacity="0.85" />
            <ellipse cx="80" cy="116" rx="12" ry="5" fill="#fff" opacity="0.25" />
            {/* bochechas */}
            <ellipse cx="38" cy="100" rx="8" ry="5" fill="#ff8fb8" opacity={mood === 'missing' ? 0.25 : 0.55} />
            <ellipse cx="82" cy="100" rx="8" ry="5" fill="#ff8fb8" opacity={mood === 'missing' ? 0.25 : 0.55} />
            {/* boca */}
            {mood === 'eating' ? (
              <ellipse cx="60" cy="104" rx="7" ry="6" fill="#0a3c7a" />
            ) : mood === 'happy' ? (
              <path d="M49 100c5 8 17 8 22 0" stroke="#0a3c7a" strokeWidth="3.5" strokeLinecap="round" fill="#ff6f9a" />
            ) : mood === 'missing' ? (
              <path d="M52 106c4-4 12-4 16 0" stroke="#0a3c7a" strokeWidth="3" strokeLinecap="round" fill="none" />
            ) : asleep ? (
              <ellipse cx="60" cy="104" rx="3.5" ry="2.5" fill="#0a3c7a" />
            ) : (
              <path d="M52 102c4 4 12 4 16 0" stroke="#0a3c7a" strokeWidth="3" strokeLinecap="round" fill="none" />
            )}
            {/* flor (fase 3) */}
            {stage >= 3 && (
              <g transform="translate(88 50)">
                {[0, 72, 144, 216, 288].map((r) => (
                  <ellipse key={r} cx="0" cy="-7" rx="5" ry="7" fill="#ffd1ea" stroke="#fff" strokeWidth="1" transform={`rotate(${r})`} />
                ))}
                <circle r="4.5" fill="#ffd23c" />
              </g>
            )}
          </svg>
          {/* olhos: camada própria para piscar */}
          <span className="pg-pet__eyes" data-loop>
            {asleep ? (
              <svg viewBox="0 0 60 20" width={60 * s} height={20 * s}>
                <path d="M6 10c4 4 10 4 14 0M40 10c4 4 10 4 14 0" stroke="#0a3c7a" strokeWidth="3.2" strokeLinecap="round" fill="none" />
              </svg>
            ) : mood === 'happy' || mood === 'eating' ? (
              <svg viewBox="0 0 60 20" width={60 * s} height={20 * s}>
                <path d="M6 13c4-7 10-7 14 0M40 13c4-7 10-7 14 0" stroke="#0a3c7a" strokeWidth="3.2" strokeLinecap="round" fill="none" />
              </svg>
            ) : (
              <svg viewBox="0 0 60 20" width={60 * s} height={20 * s}>
                <ellipse cx="13" cy="10" rx="6" ry="7.5" fill="#0a3c7a" />
                <ellipse cx="47" cy="10" rx="6" ry="7.5" fill="#0a3c7a" />
                <circle cx="15" cy="7" r="2.3" fill="#fff" />
                <circle cx="49" cy="7" r="2.3" fill="#fff" />
                {mood === 'missing' && <path d="M4 1l9 3M56 1l-9 3" stroke="#0a3c7a" strokeWidth="2.4" strokeLinecap="round" />}
              </svg>
            )}
          </span>
          {acc && <Accessory acc={acc} s={s} />}
        </span>
      </span>
      {asleep && (
        <span className="pg-pet__zz" data-loop>
          z<span>z</span>
        </span>
      )}
      {hungry && !asleep && mood !== 'eating' && (
        <span className="pg-pet__think" title="Com fominha">
          <Glyph name="apple" size={16 * Math.max(0.8, s)} />
        </span>
      )}
    </span>
  );
}

function Accessory({ acc, s }: { acc: PetAccessory; s: number }) {
  const w = 120 * s;
  let art;
  switch (acc) {
    case 'folha':
      art = (
        <svg viewBox="0 0 120 60" width={w} height={w / 2}>
          <path d="M34 44c6-20 26-30 52-26-4 18-24 30-52 26Z" fill="#8fdc4a" stroke="#fff" strokeWidth="2" />
          <path d="M40 41c14-8 28-14 42-18" stroke="#3a8f1c" strokeWidth="2" fill="none" />
        </svg>
      );
      return <span className="pg-pet__acc pg-pet__acc--hat">{art}</span>;
    case 'oculos':
      art = (
        <svg viewBox="0 0 120 40" width={w} height={w / 3}>
          <rect x="28" y="10" width="26" height="18" rx="8" fill="#0a2f66" stroke="#fff" strokeWidth="2" />
          <rect x="66" y="10" width="26" height="18" rx="8" fill="#0a2f66" stroke="#fff" strokeWidth="2" />
          <path d="M54 17h12" stroke="#fff" strokeWidth="3" />
          <path d="M32 14l8-2M70 14l8-2" stroke="#7ee9ff" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
      return <span className="pg-pet__acc pg-pet__acc--eyes">{art}</span>;
    case 'coroa':
      art = (
        <svg viewBox="0 0 120 50" width={w} height={w / 2.4}>
          {[38, 52, 66, 80].map((x, i) => (
            <circle key={x} cx={x} cy={i % 3 === 0 ? 30 : 22} r={i % 3 === 0 ? 8 : 10} fill="rgba(170,240,255,0.55)" stroke="#fff" strokeWidth="2" />
          ))}
          <circle cx="50" cy="18" r="3" fill="#fff" />
        </svg>
      );
      return <span className="pg-pet__acc pg-pet__acc--hat">{art}</span>;
    case 'cachecol':
      art = (
        <svg viewBox="0 0 120 50" width={w} height={w / 2.4}>
          <path d="M22 14c20 10 56 10 76 0l2 12c-22 10-58 10-80 0l2-12Z" fill="#ff6a55" stroke="#fff" strokeWidth="2" />
          <path d="M78 22l6 24 10-4-6-22" fill="#ff8b70" stroke="#fff" strokeWidth="2" />
          <path d="M40 20v10M56 22v10M72 20v10" stroke="#fff" strokeWidth="2" opacity="0.7" />
        </svg>
      );
      return <span className="pg-pet__acc pg-pet__acc--neck">{art}</span>;
    case 'fones':
      art = (
        <svg viewBox="0 0 120 70" width={w} height={w * 0.58}>
          <path d="M18 52c0-30 18-46 42-46s42 16 42 46" stroke="#e9f6ff" strokeWidth="6" fill="none" />
          <rect x="8" y="44" width="18" height="24" rx="8" fill="#9a72ff" stroke="#fff" strokeWidth="2" />
          <rect x="94" y="44" width="18" height="24" rx="8" fill="#9a72ff" stroke="#fff" strokeWidth="2" />
        </svg>
      );
      return <span className="pg-pet__acc pg-pet__acc--ears">{art}</span>;
    case 'boina':
      art = (
        <svg viewBox="0 0 120 50" width={w} height={w / 2.4}>
          <ellipse cx="62" cy="30" rx="30" ry="13" fill="#ff5c9a" stroke="#fff" strokeWidth="2" />
          <circle cx="62" cy="16" r="4" fill="#ff5c9a" stroke="#fff" strokeWidth="1.5" />
          <circle cx="50" cy="30" r="3" fill="#ffd23c" />
          <circle cx="66" cy="34" r="3" fill="#2ea5f5" />
          <circle cx="76" cy="27" r="3" fill="#8fdc4a" />
        </svg>
      );
      return <span className="pg-pet__acc pg-pet__acc--hat">{art}</span>;
    case 'peixinho':
      art = (
        <svg viewBox="0 0 40 24" width={36 * s} height={22 * s}>
          <path d="M4 12c4-6 10-8 18-8 7 0 11 4 14 8-3 4-7 8-14 8-8 0-14-2-18-8Z" fill="#ff9a3c" stroke="#fff" strokeWidth="1.6" />
          <path d="M4 12 0 6v12l4-6Z" fill="#ff7a1a" />
          <circle cx="29" cy="10" r="2" fill="#0a3c7a" />
        </svg>
      );
      return (
        <span className="pg-pet__acc pg-pet__acc--buddy" data-loop>
          {art}
        </span>
      );
    case 'aureola':
      art = (
        <svg viewBox="0 0 120 30" width={w} height={w / 4}>
          <ellipse cx="60" cy="16" rx="30" ry="8" fill="none" stroke="#ffe066" strokeWidth="4" />
          {[34, 60, 86].map((x) => (
            <path key={x} d={`M${x} 6l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1 2-5Z`} fill="#fff6b0" stroke="#ffb800" strokeWidth="1" />
          ))}
        </svg>
      );
      return <span className="pg-pet__acc pg-pet__acc--halo">{art}</span>;
  }
}

/** Estado derivado do mascote agora (fase, humor, fome). */
export function usePetNow(pet: PetView, now: number) {
  const xp = petTotalXp(pet, now);
  const st = petStage(xp);
  return { xp, ...st, mood: petMood(pet, now), hungry: petHungry(pet, now) };
}

/* ------------------------------------------------------------------ */
/* Ninho: a casa do mascote                                             */
/* ------------------------------------------------------------------ */

export default function PetNest() {
  const { store, isHost } = usePgEnv();
  const snap = usePg(store, (s) => s.snap);
  const now = useServerClock(store, 1000);
  const [hop, setHop] = useState(0);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const petLeft = useCooldown(store, 'pet');
  const errTimer = useRef(0);

  usePgEvent(store, 'err', (e) => {
    if (!['pet', 'pet-name', 'pet-vote', 'pet-pick', 'pet-acc'].includes(e.act)) return;
    setError(ERR_TEXT[e.code]);
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setError(null), 4000);
  });

  // gesto de outra pessoa: o mascote reage aqui também
  const lastAt = useRef(snap?.pet.last?.at ?? 0);
  useEffect(() => {
    const last = snap?.pet.last;
    if (!last || last.at <= lastAt.current) return;
    lastAt.current = last.at;
    setHop((h) => h + 1);
    setToast(last.act === 'feed' ? `${last.by} deu comida` : last.act === 'pet' ? `${last.by} fez carinho` : `${last.by} pôs para dormir`);
    const prefs = getPrefs();
    if (!prefs.muted) playUi('chirp', prefs.volume * 0.7, last.act === 'tuck' ? 0.8 : 1.1);
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [snap?.pet.last]);

  useEffect(() => () => window.clearTimeout(errTimer.current), []);

  if (!snap) return null;
  const pet = snap.pet;
  const st = petStage(petTotalXp(pet, now));
  const mood = petMood(pet, now);
  const hungry = petHungry(pet, now);
  const xp = petTotalXp(pet, now);
  const unlocked = unlockedAccessories(snap.stats, st.stage);
  const act = (a: 'pet' | 'feed' | 'tuck') => {
    unlockAudio();
    store.sendCooled({ k: 'pet', act: a }, 2500);
  };

  return (
    <div className="pg-tool pg-nest">
      <div className="pg-nest__stage">
        <button type="button" className="pg-nest__pet" onClick={() => act('pet')} aria-label={`Fazer carinho em ${pet.name ?? 'mascote'}`} disabled={petLeft > 0}>
          <MascotFigure stage={st.stage} mood={mood} acc={pet.acc} size={150} hop={hop} hungry={hungry} />
        </button>
        {toast && <span className="pg-nest__toast">{toast}</span>}
        <div className="pg-nest__id">
          <strong>{pet.name ?? 'Sem nome ainda'}</strong>
          <span>
            {PET_STAGE_NAMES[st.stage]} · {MOOD_TEXT[mood]}
          </span>
        </div>
      </div>

      <div className="pg-row pg-nest__acts">
        <AeroButton size="sm" variant="blue" icon="sparkle" onClick={() => act('pet')} disabled={petLeft > 0}>
          Carinho
        </AeroButton>
        <AeroButton size="sm" variant="green" icon="plus" onClick={() => act('feed')} disabled={petLeft > 0}>
          Dar comida
        </AeroButton>
        <AeroButton size="sm" variant="glass" icon="power" onClick={() => act('tuck')} disabled={petLeft > 0 || mood === 'sleeping'}>
          Pôr para dormir
        </AeroButton>
      </div>
      {error && <PgNotice tone="warn">{error}</PgNotice>}

      <PgSection title="Crescendo">
        <div className="pg-grow" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(st.progress * 100)} aria-label="Até a próxima fase">
          <span className="pg-grow__fill" style={{ transform: `scaleX(${st.progress})` }} />
        </div>
        <p className="pg-hint">
          {st.next === null
            ? 'Fase final: Gota-flor. Ela continua feliz com cada carinho.'
            : `Faltam ${Math.max(0, st.next - xp)} pontos para virar ${PET_STAGE_NAMES[st.stage + 1]}. Cada minuto com gente na sala vale 1, cada carinho ou comida vale 1.`}
        </p>
        <ol className="pg-grow__steps">
          {PET_STAGE_NAMES.map((n, i) => (
            <li key={n} data-on={i <= st.stage || undefined}>
              {n}
              <small>{PET_STAGES[i]} pts</small>
            </li>
          ))}
        </ol>
      </PgSection>

      <PgSection title={pet.name ? 'Trocar o nome' : 'Dar um nome'}>
        <p className="pg-hint">Sugira um nome; ele vale quando mais da metade de quem está no Playground votar nele.{isHost ? ' Você também pode escolher direto.' : ''}</p>
        <form
          className="pg-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            if (store.send({ k: 'pet-name', name: name.trim() })) setName('');
          }}
        >
          <input className="pg-input pg-nest__name" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pingo" aria-label="Nome sugerido" />
          <AeroButton size="sm" variant="blue" type="submit" disabled={!name.trim() || snap.you.muted}>
            Sugerir
          </AeroButton>
        </form>
        {pet.suggestions.length > 0 && (
          <ul className="pg-names">
            {pet.suggestions.map((sug) => (
              <li key={sug.id}>
                <span className="pg-names__name">{sug.name}</span>
                <span className="pg-names__votes">{sug.votes === 1 ? '1 voto' : `${sug.votes} votos`}</span>
                <button type="button" className="pg-chip" aria-pressed={pet.myVote === sug.id} onClick={() => store.send({ k: 'pet-vote', id: sug.id })}>
                  {pet.myVote === sug.id ? 'Seu voto' : 'Votar'}
                </button>
                {isHost && (
                  <button type="button" className="pg-chip pg-chip--go" onClick={() => store.send({ k: 'pet-pick', id: sug.id })}>
                    Escolher
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PgSection>

      <PgSection title="Acessórios">
        <p className="pg-hint">Liberados pelo que a sala faz junto. Qualquer um pode trocar.</p>
        <div className="pg-accs">
          {PET_ACCESSORIES.map((a) => {
            const open = unlocked.includes(a.id);
            const need =
              a.stat === null ? '' : a.stat === 'stage' ? 'Na fase Gota-flor' : `${a.n} ${STAT_WORD[a.stat]}`;
            return (
              <button
                key={a.id}
                type="button"
                className="pg-acc"
                aria-pressed={pet.acc === a.id}
                disabled={!open}
                onClick={() => store.send({ k: 'pet-acc', acc: pet.acc === a.id ? null : a.id })}
                title={open ? a.name : `Libera com: ${need}`}
              >
                <span className="pg-acc__name">{a.name}</span>
                <small>{open ? (pet.acc === a.id ? 'Usando' : 'Usar') : need}</small>
              </button>
            );
          })}
        </div>
      </PgSection>
    </div>
  );
}

const STAT_WORD: Record<string, string> = {
  reactions: 'reações',
  bubbles: 'bolhas estouradas',
  polls: 'votações',
  sounds: 'sons tocados',
  strokes: 'desenhos',
  feeds: 'comidas no aquário',
};
