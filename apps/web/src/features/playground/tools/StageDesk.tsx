import { useEffect, useRef, useState } from 'react';
import { PG_COOLDOWN, PG_LIMITS, VFX, type AskKind, type AskStatus, type PgErrCode } from '@protocol';
import { AeroButton } from '../../../components/ui/AeroButton.tsx';
import { Segmented } from '../../../components/ui/controls.tsx';
import { usePgEnv } from '../context.ts';
import { usePg, usePgEvent, useCooldown } from '../hooks.ts';
import { ERR_TEXT } from '../store.ts';
import { PgSection, PgNotice, PgEmpty, CooldownRing, secondsLabel } from '../ui.tsx';
import { Glyph, Orb, type GlyphName, type OrbTone } from '../art.tsx';
import './tools.css';

const ACTS = ['ask', 'ask-answer', 'vfx'];
const VFX_ART: Record<string, { glyph: GlyphName; tone: OrbTone }> = {
  bolhas: { glyph: 'bubbles', tone: 'sky' },
  cardume: { glyph: 'fish', tone: 'aqua' },
  'arco-iris': { glyph: 'sparkle', tone: 'pink' },
  folhas: { glyph: 'leaf', tone: 'green' },
};
const STATUS_TEXT: Record<AskStatus, string> = { pending: 'Aguardando', accepted: 'Aceito', rejected: 'Recusado', done: 'Feito' };
const KIND_TEXT: Record<AskKind, string> = { challenge: 'Desafio', suggestion: 'Sugestão' };

export default function StageDesk() {
  const { store, isHost, go } = usePgEnv();
  const snap = usePg(store, (s) => s.snap);
  const askLeft = useCooldown(store, 'ask');
  const vfxLeft = useCooldown(store, 'vfx');
  const [kind, setKind] = useState<AskKind>('challenge');
  const [text, setText] = useState('');
  const [err, setErr] = useState<PgErrCode | null>(null);
  const timer = useRef(0);

  usePgEvent(store, 'err', (e) => {
    if (!ACTS.includes(e.act)) return;
    setErr(e.code);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setErr(null), 4000);
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!snap) return null;
  const { settings, you } = snap;
  const muted = you.muted;
  const mine = snap.asks.filter((a) => a.by === you.pid);
  const accepted = snap.asks.filter((a) => a.status === 'accepted' || a.status === 'done');
  const pending = snap.asks.filter((a) => a.status === 'pending');
  const canAsk = settings.asks && !muted;
  const canWheel = isHost || settings.polls === 'all';
  const showVfx = settings.vfx && !settings.calm;

  const send = () => {
    const t = text.trim();
    if (!t || !canAsk || askLeft > 0) return;
    if (store.sendCooled({ k: 'ask', kind, text: t }, PG_COOLDOWN.ask)) {
      setText('');
      setErr(null);
    }
  };

  const wheel = () => {
    if (canWheel) go('wheel');
    else if (canAsk) store.sendCooled({ k: 'ask', kind: 'suggestion', text: 'Faz um sorteio pra gente!' }, PG_COOLDOWN.ask);
  };

  const answer = (id: string, status: 'accepted' | 'rejected' | 'done') => store.send({ k: 'ask-answer', id, status });

  return (
    <div className="pg-tool">
      {err && <PgNotice tone="warn">{ERR_TEXT[err]}</PgNotice>}
      {muted && <PgNotice>O anfitrião silenciou você no Playground.</PgNotice>}

      {!isHost && (
        <PgSection title="Fale com quem transmite">
          {!settings.asks ? (
            <PgNotice>O anfitrião pausou os pedidos.</PgNotice>
          ) : (
            <>
              <Segmented
                label="Tipo de pedido"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'challenge', label: 'Desafio' },
                  { value: 'suggestion', label: 'Sugestão' },
                ]}
              />
              <textarea
                className="pg-input pg-stage-text"
                aria-label={kind === 'challenge' ? 'Seu desafio' : 'Sua sugestão'}
                placeholder={kind === 'challenge' ? 'Que desafio você quer ver?' : 'O que você sugere?'}
                maxLength={PG_LIMITS.textMax}
                rows={3}
                value={text}
                disabled={!canAsk}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="pg-row pg-stage-send">
                <span className="pg-hint">
                  {text.length}/{PG_LIMITS.textMax}
                </span>
                <AeroButton variant="green" size="md" icon="check" disabled={!canAsk || !text.trim() || askLeft > 0} onClick={send}>
                  {askLeft > 0 ? `Espere ${secondsLabel(askLeft)}` : 'Enviar pedido'}
                </AeroButton>
              </div>
            </>
          )}
        </PgSection>
      )}

      {!isHost && mine.length > 0 && (
        <PgSection title="Seus pedidos">
          <ul className="pg-stage-list">
            {mine.map((a) => (
              <li key={a.id} className="pg-stage-item">
                <span className="pg-stage-kind">{KIND_TEXT[a.kind]}</span>
                <span className="pg-stage-txt">{a.text}</span>
                <span className={`pg-stage-pill is-${a.status}`}>{STATUS_TEXT[a.status]}</span>
              </li>
            ))}
          </ul>
        </PgSection>
      )}

      {isHost && (
        <PgSection title="Pedidos chegando">
          {pending.length === 0 ? (
            <PgEmpty glyph="stage" title="Nada na fila">
              Quando alguém mandar um desafio ou sugestão, ele aparece aqui.
            </PgEmpty>
          ) : (
            <ul className="pg-stage-list">
              {pending.map((a) => (
                <li key={a.id} className="pg-stage-item pg-stage-item--col">
                  <span className="pg-stage-kind">
                    {KIND_TEXT[a.kind]} de {a.byName}
                  </span>
                  <span className="pg-stage-txt">{a.text}</span>
                  <span className="pg-row">
                    <AeroButton variant="green" size="sm" icon="check" onClick={() => answer(a.id, 'accepted')}>
                      Aceitar
                    </AeroButton>
                    <AeroButton variant="glass" size="sm" icon="x" onClick={() => answer(a.id, 'rejected')}>
                      Recusar
                    </AeroButton>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PgSection>
      )}

      <PgSection title="Aceitos pelo anfitrião">
        {accepted.length === 0 ? (
          <p className="pg-hint">Nenhum pedido aceito ainda.</p>
        ) : (
          <ul className="pg-stage-list">
            {accepted.map((a) => (
              <li key={a.id} className={`pg-stage-item${a.status === 'done' ? ' is-done' : ''}`}>
                {a.status === 'done' && (
                  <span className="pg-stage-check">
                    <Glyph name="check" size={16} />
                  </span>
                )}
                <span className="pg-stage-kind">{KIND_TEXT[a.kind]}</span>
                <span className="pg-stage-txt">
                  {a.text} <small>({a.byName})</small>
                </span>
                {isHost && a.status === 'accepted' && (
                  <AeroButton variant="blue" size="sm" icon="check" onClick={() => answer(a.id, 'done')}>
                    Feito
                  </AeroButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </PgSection>

      {showVfx && (
        <PgSection title="Eventos visuais">
          <p className="pg-hint">Aparece por alguns segundos para todo mundo na sala.</p>
          <div className="pg-stage-vfx">
            {VFX.map((v) => {
              const art = VFX_ART[v.id] ?? { glyph: 'sparkle' as GlyphName, tone: 'aqua' as OrbTone };
              return (
                <button
                  key={v.id}
                  type="button"
                  className="pg-stage-vbtn"
                  disabled={muted || vfxLeft > 0}
                  onClick={() => store.sendCooled({ k: 'vfx', v: v.id }, PG_COOLDOWN.vfx)}
                >
                  <CooldownRing left={vfxLeft} total={PG_COOLDOWN.vfx} />
                  <Orb tone={art.tone} glyph={art.glyph} size={44} />
                  <span>{v.name}</span>
                </button>
              );
            })}
          </div>
          {vfxLeft > 0 && <p className="pg-hint">Pode lançar de novo em {secondsLabel(vfxLeft)}.</p>}
        </PgSection>
      )}

      <PgSection title="Pedir um sorteio">
        <p className="pg-hint">{canWheel ? 'Abra a Roda da Sorte e gire para a sala.' : 'Só o anfitrião sorteia. Dá para sugerir um.'}</p>
        <div className="pg-row">
          <AeroButton variant="blue" size="md" icon="play" disabled={!canWheel && (!canAsk || askLeft > 0)} onClick={wheel}>
            {canWheel ? 'Ir para a Roda da Sorte' : 'Sugerir um sorteio'}
          </AeroButton>
        </div>
      </PgSection>
    </div>
  );
}
