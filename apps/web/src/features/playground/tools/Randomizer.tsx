import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PG_COOLDOWN, PG_LIMITS, cleanText, type PgErrCode, type SpinView } from '@protocol';
import { usePgEnv } from '../context.ts';
import { usePg, usePgEvent, useCooldown } from '../hooks.ts';
import { getPrefs } from '../prefs.ts';
import { playUi, unlockAudio } from '../sfx.ts';
import { reducedMotion } from '../loop.ts';
import { ERR_TEXT } from '../store.ts';
import { PgSection, PgChip, PgNotice, CooldownRing, secondsLabel } from '../ui.tsx';
import { Glyph } from '../art.tsx';
import { Wheel, spinAnimation, targetRotation } from './Wheel.tsx';
import './randomizer.css';

const MIN = PG_LIMITS.spinOptionsMin;
const MAX = PG_LIMITS.spinOptionsMax;
const OPT_MAX = PG_LIMITS.spinOptionMax;
const TITLE_MAX = PG_LIMITS.spinTitleMax;
const SAVE_KEY = 'alexandrus:pg-wheel-lists';
const SAVE_MAX = 10;

const TEMPLATES: { name: string; title: string; opts: string[] }[] = [
  { name: 'Personagem', title: 'Qual personagem?', opts: ['Guerreiro', 'Mago', 'Arqueira', 'Ladino', 'Curandeira', 'Robô', 'Pirata'] },
  { name: 'Arma', title: 'Qual arma?', opts: ['Espada', 'Arco', 'Cajado', 'Machado', 'Adagas', 'Martelo', 'Só os punhos'] },
  { name: 'Desafio', title: 'Qual desafio?', opts: ['Sem pular', 'Sem usar mapa', 'Só com uma mão', 'Em 10 minutos', 'Sem comprar nada', 'Estilo furtivo'] },
  { name: 'Punição divertida', title: 'Qual punição?', opts: ['Jogar sem som', 'Só pode andar de lado', 'Falar como robô', 'Narrar tudo que faz', 'Trocar de lugar', 'Cantar uma musiquinha'] },
  { name: 'Regra da próxima rodada', title: 'Regra da próxima rodada', opts: ['Ninguém pode falar', 'Só vale o primeiro', 'Tudo em dobro', 'Câmera lenta', 'Troca de times', 'Vale sem olhar a tela', 'Só objetos novos'] },
];

interface SavedList {
  title: string;
  opts: string[];
}

function readSaved(): SavedList[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    const out: SavedList[] = [];
    for (const r of raw as Partial<SavedList>[]) {
      if (!r || typeof r.title !== 'string' || !Array.isArray(r.opts)) continue;
      const opts = r.opts.filter((o): o is string => typeof o === 'string').map((o) => cleanText(o, OPT_MAX)).filter(Boolean);
      if (opts.length >= MIN) out.push({ title: cleanText(r.title, TITLE_MAX) || 'Lista', opts: opts.slice(0, MAX) });
    }
    return out.slice(0, SAVE_MAX);
  } catch {
    return [];
  }
}

function writeSaved(l: SavedList[]) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(l));
  } catch {
    /* sem armazenamento: some ao recarregar */
  }
}

function randomInt(n: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! % n;
}

interface View {
  id: string;
  title: string;
  opts: string[];
  pick: number;
  by: string | null;
  from: number;
  target: number;
  ms: number;
  /** Mostra direto o resultado, sem girar. */
  jump: boolean;
}

function makeView(id: string, title: string, opts: string[], pick: number, by: string | null, from: number, ms: number, jump: boolean): View {
  const target = targetRotation(from, pick, opts.length, jump ? 0 : 5);
  return { id, title, opts, pick, by, from, target, ms, jump };
}

interface Bit {
  k: number;
  dx: number;
  dy: number;
  rot: number;
  d: number;
  c: string;
  leaf: boolean;
}

const BIT_COLORS = ['#7ee9ff', '#c4f566', '#ffe27a', '#ff9fcb', '#c3a2ff', '#6ff0d4', '#ffb673'];

function makeBurst(): Bit[] {
  return Array.from({ length: 24 }, (_, k) => {
    const ang = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 110;
    return {
      k,
      dx: Math.cos(ang) * dist,
      dy: Math.sin(ang) * dist * 0.8 - 20,
      rot: Math.round((Math.random() - 0.5) * 540),
      d: Math.random() * 0.15,
      c: BIT_COLORS[k % BIT_COLORS.length]!,
      leaf: k % 5 === 0,
    };
  });
}

let localSeq = 0;

export default function Randomizer() {
  const { store, isHost, leak } = usePgEnv();
  const snap = usePg(store, (s) => s.snap);
  const left = useCooldown(store, 'spin');

  const [title, setTitle] = useState('');
  const [opts, setOpts] = useState<string[]>(TEMPLATES[2]!.opts);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<SavedList[]>(readSaved);
  const [err, setErr] = useState<PgErrCode | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [burst, setBurst] = useState<Bit[] | null>(null);
  const [size, setSize] = useState(280);

  const rootRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef(0);
  const animRef = useRef<Animation | null>(null);
  const errTimer = useRef(0);
  const burstTimer = useRef(0);

  const [view, setView] = useState<View | null>(() => {
    const s = store.getState().snap?.spin;
    if (!s) return null;
    const age = store.serverNow() - s.at;
    if (age >= PG_LIMITS.spinMs + 8000) return null;
    return makeView(s.id, s.title, s.opts, s.pick, s.by, 0, 0, true);
  });

  const done = !!view && (view.jump || doneId === view.id);
  const spinning = !!view && !done;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fit = () => setSize(Math.max(200, Math.min(300, Math.floor(el.clientWidth - 32))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const begin = useCallback((id: string, t: string, o: string[], pick: number, by: string | null, ms: number, jump: boolean) => {
    window.clearTimeout(burstTimer.current);
    setBurst(null);
    const v = makeView(id, t, o, pick, by, rotRef.current, ms, jump);
    rotRef.current = v.target;
    setView(v);
  }, []);

  // Anima o disco (e toca os tiques) sempre que uma nova rodada começa.
  useEffect(() => {
    const disc = rootRef.current?.querySelector<HTMLElement>('.pg-wheel__disc');
    if (!disc) return;
    animRef.current?.cancel();
    animRef.current = null;
    if (!view) {
      rotRef.current = 0;
      return;
    }
    if (view.jump) return;
    const anim = spinAnimation(disc, view.from, view.target, Math.max(1, view.ms));
    animRef.current = anim;
    const step = 360 / view.opts.length;
    let raf = 0;
    let prev: number | null = null;
    let unwrapped = 0;
    let lastIdx = 0;
    let lastTick = 0;
    let alive = true;
    const loop = (now: number) => {
      if (!alive) return;
      const m = getComputedStyle(disc).transform;
      if (m && m !== 'none') {
        const mm = m.match(/matrix\(([^)]+)\)/);
        if (mm) {
          const p = mm[1]!.split(',').map(Number);
          const ang = (Math.atan2(p[1]!, p[0]!) * 180) / Math.PI;
          if (prev !== null) unwrapped += ((ang - prev + 540) % 360) - 180;
          prev = ang;
          const idx = Math.floor(unwrapped / step);
          if (idx !== lastIdx) {
            lastIdx = idx;
            const pr = getPrefs();
            if (!pr.muted && !leak && now - lastTick >= 40) {
              lastTick = now;
              playUi('tick', pr.volume * 0.5, 0.9 + Math.random() * 0.2);
            }
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    let cancelled = false;
    anim.finished
      .then(() => {
        if (cancelled) return;
        setDoneId(view.id);
        const pr = getPrefs();
        if (!pr.muted && !leak) playUi('win', pr.volume);
        if (!pr.light && !reducedMotion()) {
          setBurst(makeBurst());
          window.clearTimeout(burstTimer.current);
          burstTimer.current = window.setTimeout(() => setBurst(null), 1600);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [view, leak]);

  useEffect(
    () => () => {
      window.clearTimeout(errTimer.current);
      window.clearTimeout(burstTimer.current);
    },
    [],
  );

  usePgEvent(store, 'spin', (e) => {
    const s: SpinView = e.spin;
    const elapsed = Math.max(0, store.serverNow() - s.at);
    const full = PG_LIMITS.spinMs - 400;
    let ms = reducedMotion() ? 900 : full - elapsed;
    let jump = false;
    if (reducedMotion()) ms = Math.max(0, 900 - elapsed);
    if (ms <= 0) jump = true;
    begin(s.id, s.title, s.opts, s.pick, s.by, ms, jump);
  });
  usePgEvent(store, 'err', (e) => {
    if (e.act !== 'spin') return;
    setErr(e.code);
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setErr(null), 4000);
  });

  if (!snap) return null;
  const canShare = isHost || snap.settings.polls === 'all';
  const muted = snap.you.muted;
  const validOpts = opts.length >= MIN;
  const shareWhy = muted
    ? 'O anfitrião silenciou você no Playground.'
    : !canShare
      ? 'Só o anfitrião pode girar para a sala.'
      : !validOpts
        ? `Coloque pelo menos ${MIN} opções.`
        : null;
  const cleanTitle = cleanText(title, TITLE_MAX);

  const touch = () => {
    if (view && done) {
      setView(null);
      setDoneId(null);
      setBurst(null);
    }
  };

  const addOpt = () => {
    const t = cleanText(draft, OPT_MAX);
    if (!t || opts.length >= MAX || spinning) return;
    touch();
    setOpts([...opts, t]);
    setDraft('');
  };
  const removeOpt = (i: number) => {
    if (spinning) return;
    touch();
    setOpts(opts.filter((_, j) => j !== i));
  };
  const load = (t: string, o: string[]) => {
    if (spinning) return;
    touch();
    setTitle(t);
    setOpts(o.slice(0, MAX));
  };
  const saveList = () => {
    if (!validOpts) return;
    const name = cleanTitle || 'Minha lista';
    const next = [{ title: name, opts: [...opts] }, ...saved.filter((s) => s.title !== name)].slice(0, SAVE_MAX);
    setSaved(next);
    writeSaved(next);
  };
  const delSaved = (name: string) => {
    const next = saved.filter((s) => s.title !== name);
    setSaved(next);
    writeSaved(next);
  };

  const spinShared = () => {
    if (shareWhy || left > 0 || spinning) return;
    unlockAudio();
    store.send({ k: 'spin', title: cleanTitle || 'Sorteio', opts });
  };
  const spinLocal = () => {
    if (!validOpts || spinning) return;
    unlockAudio();
    const pick = randomInt(opts.length);
    begin(`local-${++localSeq}`, cleanTitle || 'Sorteio', opts, pick, null, reducedMotion() ? 900 : PG_LIMITS.spinMs - 600, false);
  };

  const shown = view ? view.opts : validOpts ? opts : ['?', '?'];

  return (
    <div className="pg-tool pg-wheel" ref={rootRef}>
      {muted && <PgNotice tone="warn">{ERR_TEXT.muted}</PgNotice>}
      {err && <PgNotice tone="warn">{err === 'busy' ? 'A roda já está girando, espera ela parar.' : ERR_TEXT[err]}</PgNotice>}

      <PgSection title={view ? view.title : cleanTitle || 'Roda da Sorte'}>
        <div className="pg-wheel__stage">
          <Wheel opts={shown} rotation={view ? (view.jump ? view.target : view.from) : 0} size={size} />
          {view && done && (
            <div className="pg-wheel__result" role="status">
              <div className="pg-wheel__result-by">{view.by ? 'Resultado' : 'Só para você'}</div>
              <div className="pg-wheel__result-title">Deu: {view.opts[view.pick]}</div>
              {view.by && <div className="pg-wheel__result-by">sorteado por {view.by}</div>}
              {burst && (
                <span className="pg-wheel__burst" aria-hidden>
                  {burst.map((b) => (
                    <i
                      key={b.k}
                      className={`pg-wheel__bit${b.leaf ? ' pg-wheel__bit--leaf' : ''}`}
                      style={{ ['--dx' as string]: `${b.dx}px`, ['--dy' as string]: `${b.dy}px`, ['--rot' as string]: `${b.rot}deg`, ['--d' as string]: `${b.d}s`, ['--c' as string]: b.c }}
                    />
                  ))}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="pg-wheel__go">
          <button type="button" className="pg-wheel__btn" onClick={spinShared} disabled={!!shareWhy || left > 0 || spinning}>
            <CooldownRing left={left} total={PG_COOLDOWN.spin} />
            <Glyph name="wheel" size={18} />
            Girar para a sala{left > 0 ? ` (${secondsLabel(left)})` : ''}
          </button>
          <button type="button" className="pg-wheel__btn pg-wheel__btn--green" onClick={spinLocal} disabled={!validOpts || spinning}>
            <Glyph name="play" size={18} />
            Só para mim
          </button>
        </div>
        {shareWhy && <p className="pg-wheel__why">{shareWhy}</p>}
      </PgSection>

      <PgSection title="Opções" aside={<span className="pg-hint">{opts.length}/{MAX}</span>}>
        <label className="pg-label">
          <span className="pg-hint">Título</span>
          <input
            className="pg-input"
            value={title}
            maxLength={TITLE_MAX}
            placeholder="O que vamos sortear?"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <ul className="pg-wheel__opts" aria-label="Opções da roda">
          {opts.map((o, i) => (
            <li key={`${i}-${o}`} className="pg-wheel__opt">
              <span>{o}</span>
              <button type="button" className="pg-wheel__x" aria-label={`Remover ${o}`} disabled={spinning} onClick={() => removeOpt(i)}>
                <Glyph name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="pg-wheel__add">
          <input
            className="pg-input"
            value={draft}
            maxLength={OPT_MAX}
            placeholder="Adicionar opção"
            aria-label="Adicionar opção"
            disabled={opts.length >= MAX}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addOpt();
              }
            }}
          />
          <button type="button" className="pg-wheel__btn pg-wheel__btn--add" onClick={addOpt} disabled={!draft.trim() || opts.length >= MAX || spinning}>
            <Glyph name="plus" size={16} />
            Incluir
          </button>
        </div>
        {!validOpts && <p className="pg-wheel__why">Coloque pelo menos {MIN} opções.</p>}
        <div className="pg-row">
          <PgChip glyph="check" onClick={saveList} disabled={!validOpts} title="Fica salva só neste navegador">
            Salvar lista
          </PgChip>
        </div>
      </PgSection>

      <PgSection title="Modelos" aside={<span className="pg-hint">Carregue e edite</span>}>
        <div className="pg-row">
          {TEMPLATES.map((t) => (
            <PgChip key={t.name} onClick={() => load(t.title, t.opts)} disabled={spinning}>
              {t.name}
            </PgChip>
          ))}
        </div>
      </PgSection>

      {saved.length > 0 && (
        <PgSection title="Listas salvas" aside={<span className="pg-hint">Só neste navegador</span>}>
          <div className="pg-wheel__saved">
            {saved.map((s) => (
              <span key={s.title} className="pg-wheel__saved-item">
                <PgChip onClick={() => load(s.title, s.opts)} disabled={spinning} title={`${s.opts.length} opções`}>
                  {s.title}
                </PgChip>
                <button type="button" className="pg-wheel__x" aria-label={`Apagar a lista ${s.title}`} onClick={() => delSaved(s.title)}>
                  <Glyph name="trash" size={14} />
                </button>
              </span>
            ))}
          </div>
        </PgSection>
      )}
    </div>
  );
}
