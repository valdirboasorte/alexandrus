import { useEffect, useRef, useState } from 'react';
import { PG_LIMITS, type PgErrCode } from '@protocol';
import { AeroButton } from '../../../components/ui/AeroButton.tsx';
import { usePgEnv } from '../context.ts';
import { usePg, usePgEvent, useCooldown } from '../hooks.ts';
import { ERR_TEXT } from '../store.ts';
import { PgSection, PgChip, PgNotice, PgEmpty } from '../ui.tsx';
import { Glyph } from '../art.tsx';
import './tools.css';

const ACTS = ['poll-new', 'vote', 'poll-close'];

const IDEAS: { q: string; opts?: string[] }[] = [
  { q: 'Qual personagem escolher?' },
  { q: 'Qual caminho seguir?' },
  { q: 'Qual arma usar?' },
  { q: 'Vai ganhar ou perder?', opts: ['Ganha', 'Perde'] },
  { q: 'Qual jogo depois?' },
];

export default function LivePoll() {
  const { store, isHost } = usePgEnv();
  const snap = usePg(store, (s) => s.snap);
  const voteLeft = useCooldown(store, 'vote');
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<string[]>(['', '']);
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
  const poll = snap.poll;
  const muted = snap.you.muted;
  const canCreate = isHost || snap.settings.polls === 'all';
  const canClose = poll !== null && poll.open && (isHost || poll.by === snap.you.pid);
  const total = poll ? poll.opts.reduce((a, o) => a + o.n, 0) : 0;
  const top = poll ? Math.max(...poll.opts.map((o) => o.n)) : 0;
  const winners = poll ? poll.opts.filter((o) => o.n === top) : [];
  const tie = !!poll && !poll.open && total > 0 && winners.length > 1;

  const vote = (i: number) => {
    if (!poll || !poll.open || muted) return;
    if (store.sendCooled({ k: 'vote', poll: poll.id, o: i }, 400)) setErr(null);
  };

  const setOpt = (i: number, v: string) => setOpts((o) => o.map((x, j) => (j === i ? v : x)));
  const filled = opts.map((o) => o.trim()).filter(Boolean);
  const canSend = q.trim().length > 0 && filled.length >= PG_LIMITS.pollOptionsMin && !muted;

  const submit = () => {
    if (!canSend) return;
    if (store.send({ k: 'poll-new', q: q.trim(), opts: filled })) {
      setQ('');
      setOpts(['', '']);
      setErr(null);
    }
  };

  const showForm = !(poll && poll.open);

  return (
    <div className="pg-tool">
      {err && (
        <PgNotice tone="warn">{ERR_TEXT[err]}</PgNotice>
      )}
      {muted && <PgNotice>O anfitrião silenciou você no Playground.</PgNotice>}

      {poll ? (
        <PgSection
          title={poll.open ? 'Votação rolando' : 'Resultado final'}
          aside={
            canClose ? (
              <AeroButton variant="red" size="sm" icon="stop" onClick={() => store.send({ k: 'poll-close', poll: poll.id })}>
                Encerrar votação
              </AeroButton>
            ) : undefined
          }
        >
          <p className="pg-poll-q">{poll.q}</p>
          <p className="pg-hint">Criada por {poll.byName}</p>
          <ul className="pg-poll-list">
            {poll.opts.map((o, i) => {
              const pct = total > 0 ? o.n / total : 0;
              const win = !poll.open && total > 0 && o.n === top;
              const mine = poll.mine === i;
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={`pg-poll-bar${mine ? ' is-mine' : ''}${win ? ' is-win' : ''}`}
                    disabled={!poll.open || muted || voteLeft > 0}
                    aria-pressed={mine}
                    onClick={() => vote(i)}
                  >
                    <span className="pg-poll-fill" style={{ transform: `scaleX(${pct})` }} aria-hidden />
                    <span className="pg-poll-text">
                      {mine && <Glyph name="check" size={16} />}
                      <span className="pg-poll-label">{o.t}</span>
                    </span>
                    <span className="pg-poll-num">
                      {Math.round(pct * 100)}%<small>{o.n} {o.n === 1 ? 'voto' : 'votos'}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="pg-hint">
            {total} {total === 1 ? 'voto' : 'votos'} no total
            {!poll.open && total > 0 && (tie ? ' · Empate' : ` · Venceu: ${winners[0]?.t ?? ''}`)}
            {!poll.open && total === 0 && ' · Ninguém votou'}
          </p>
        </PgSection>
      ) : (
        <PgEmpty glyph="poll" title="Nenhuma votação por aqui">
          Crie uma pergunta e a sala toda responde na hora.
        </PgEmpty>
      )}

      {showForm &&
        (canCreate ? (
          <PgSection title="Nova votação">
            <div className="pg-row">
              {IDEAS.map((idea) => (
                <PgChip
                  key={idea.q}
                  onClick={() => {
                    setQ(idea.q);
                    if (idea.opts) setOpts(idea.opts);
                  }}
                >
                  {idea.q}
                </PgChip>
              ))}
            </div>
            <label className="pg-label" htmlFor="pg-poll-q">
              Pergunta
            </label>
            <input
              id="pg-poll-q"
              className="pg-input"
              value={q}
              maxLength={PG_LIMITS.pollQuestionMax}
              placeholder="O que a sala decide?"
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="pg-poll-opts">
              {opts.map((o, i) => (
                <div className="pg-poll-opt" key={i}>
                  <input
                    className="pg-input"
                    aria-label={`Opção ${i + 1}`}
                    value={o}
                    maxLength={PG_LIMITS.pollOptionMax}
                    placeholder={`Opção ${i + 1}`}
                    onChange={(e) => setOpt(i, e.target.value)}
                  />
                  {opts.length > PG_LIMITS.pollOptionsMin && (
                    <button type="button" className="pg-poll-x" aria-label={`Tirar opção ${i + 1}`} onClick={() => setOpts((l) => l.filter((_, j) => j !== i))}>
                      <Glyph name="x" size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="pg-row">
              {opts.length < PG_LIMITS.pollOptionsMax && (
                <PgChip glyph="plus" onClick={() => setOpts((l) => [...l, ''])}>
                  Adicionar opção
                </PgChip>
              )}
              <AeroButton variant="green" size="md" icon="check" disabled={!canSend} onClick={submit}>
                Criar votação
              </AeroButton>
            </div>
          </PgSection>
        ) : (
          <PgNotice>Só o anfitrião cria votações nesta sala.</PgNotice>
        ))}
    </div>
  );
}
