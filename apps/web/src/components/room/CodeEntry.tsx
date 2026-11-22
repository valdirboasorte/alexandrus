import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { roomCodeFromInput } from '@protocol';
import { useServerHealth } from '../../hooks/useServerHealth.ts';
import { Icon } from '../ui/Icon.tsx';
import { StatusOrb } from '../ui/controls.tsx';
import './code-entry.css';

/** Formata enquanto digita: "k7q2mx" → "K7Q-2MX". Links colados passam intactos. */
function formatTyping(v: string) {
  if (/[/:.]/.test(v)) return v;
  const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw;
}

export function CodeEntry({ autoFocus = false, onCode }: { autoFocus?: boolean; onCode?: (code: string | null) => void }) {
  const navigate = useNavigate();
  const { state } = useServerHealth();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const code = roomCodeFromInput(value);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!code) {
      setError('O código tem 6 letras e números, como K7Q-2MX. Também dá para colar o link da sala.');
      return;
    }
    navigate(`/sala/${code}`, { viewTransition: true });
  }

  const status =
    state.status === 'ok'
      ? { orb: 'ok' as const, text: 'Conexão pronta' }
      : state.status === 'checking'
        ? { orb: 'busy' as const, text: 'Procurando o servidor…' }
        : { orb: 'bad' as const, text: 'Servidor fora do ar' };

  return (
    <form className="code-entry glass glass--frost" onSubmit={submit} noValidate>
      <label htmlFor="codigo-sala" className="visually-hidden">
        Código ou link da sala
      </label>
      <div className="aero-input code-entry__field">
        <Icon name="ticket" className="aero-input__icon" />
        <input
          id="codigo-sala"
          value={value}
          onChange={(e) => {
            const next = formatTyping(e.target.value);
            setValue(next);
            setError(null);
            onCode?.(roomCodeFromInput(next));
          }}
          placeholder="Código da sala"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="go"
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby="codigo-sala-status"
        />
        <button type="submit" className="orb-btn" aria-label="Entrar na sala" disabled={!value}>
          <Icon name="arrowRight" strokeWidth={2.8} />
        </button>
      </div>
      <p id="codigo-sala-status" className="code-entry__status" aria-live="polite">
        {error ? (
          <span className="code-entry__error">{error}</span>
        ) : (
          <>
            <StatusOrb state={status.orb} />
            {status.text}
          </>
        )}
      </p>
    </form>
  );
}
