import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { canAudioWorklet, canCaptureScreen, canWebRTC, detectBrowser, isPreferredHostBrowser, type BrowserInfo } from '../../lib/capabilities.ts';
import { probePonte, type PonteStatusInfo } from '../../lib/ponte.ts';
import { useServerHealth } from '../../hooks/useServerHealth.ts';
import { AeroButton } from '../ui/AeroButton.tsx';
import { StatusOrb, type OrbState } from '../ui/controls.tsx';
import './system-check.css';

interface Row {
  key: string;
  title: string;
  state: OrbState;
  detail: ReactNode;
}

type PonteProbe = { status: 'idle' | 'checking' } | { status: 'found'; hello: PonteStatusInfo } | { status: 'missing' };

/** Em produção, falar com 127.0.0.1 pode pedir permissão de rede local: só com clique. */
const LOCAL_ORIGIN = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

export function SystemCheck({ compact = false }: { compact?: boolean }) {
  const [browser, setBrowser] = useState<BrowserInfo | null>(null);
  const { state: server, recheck } = useServerHealth(60000);
  const [ponte, setPonte] = useState<PonteProbe>({ status: 'idle' });

  const checkPonte = useCallback(async () => {
    setPonte({ status: 'checking' });
    const info = await probePonte();
    setPonte(info ? { status: 'found', hello: info } : { status: 'missing' });
  }, []);

  useEffect(() => {
    void detectBrowser().then(setBrowser);
    if (LOCAL_ORIGIN) void checkPonte();
  }, [checkPonte]);

  const windows = browser?.os.startsWith('Windows') ?? false;
  const rows: Row[] = [];

  if (browser) {
    const name = `${browser.name}${browser.major ? ` ${browser.major}` : ''} · ${browser.os}`;
    rows.push(
      isPreferredHostBrowser(browser)
        ? { key: 'browser', title: 'Navegador', state: 'ok', detail: `${name}. Pronto para transmitir e assistir.` }
        : browser.mobile
          ? { key: 'browser', title: 'Navegador', state: 'warn', detail: `${name}. No celular dá para assistir; para transmitir, use Chrome ou Edge num computador.` }
          : { key: 'browser', title: 'Navegador', state: 'warn', detail: `${name}. Assistir funciona; para transmitir com som, use Chrome ou Edge.` },
    );
  } else {
    rows.push({ key: 'browser', title: 'Navegador', state: 'busy', detail: 'Identificando…' });
  }

  rows.push(
    canCaptureScreen()
      ? { key: 'capture', title: 'Captura de tela', state: 'ok', detail: 'Tela inteira, janela e aba disponíveis neste navegador.' }
      : { key: 'capture', title: 'Captura de tela', state: browser?.mobile ? 'idle' : 'bad', detail: 'Este navegador não captura a tela. Assistir continua funcionando.' },
  );

  rows.push(
    canWebRTC()
      ? { key: 'rtc', title: 'Vídeo em tempo real', state: 'ok', detail: 'WebRTC disponível.' }
      : { key: 'rtc', title: 'Vídeo em tempo real', state: 'bad', detail: 'WebRTC indisponível: não dá para transmitir nem assistir aqui.' },
  );

  rows.push(
    server.status === 'ok'
      ? { key: 'server', title: 'Servidor do Alexandrus', state: 'ok', detail: `Respondeu em ${server.ms} ms.` }
      : server.status === 'checking'
        ? { key: 'server', title: 'Servidor do Alexandrus', state: 'busy', detail: 'Perguntando…' }
        : { key: 'server', title: 'Servidor do Alexandrus', state: 'bad', detail: server.message },
  );

  if (browser && !windows) {
    rows.push({ key: 'ponte', title: 'Som de jogos e apps', state: 'idle', detail: 'A Alexandrus Ponte existe só para Windows. Aqui, o som vem de abas do navegador.' });
  } else {
    rows.push(
      ponte.status === 'found'
        ? {
            key: 'ponte',
            title: 'Alexandrus Ponte',
            state: ponte.hello.processLoopback ? 'ok' : 'warn',
            detail: ponte.hello.processLoopback
              ? `Versão ${ponte.hello.version} aberta. Captura de som por aplicativo disponível (Windows build ${ponte.hello.windowsBuild}).${
                  ponte.hello.capturing ? ' Neste momento ela está levando o som de uma transmissão.' : ''
                }`
              : `Versão ${ponte.hello.version} aberta, mas este Windows (build ${ponte.hello.windowsBuild}) é antigo demais para captura por aplicativo.`,
          }
        : ponte.status === 'missing'
          ? {
              key: 'ponte',
              title: 'Alexandrus Ponte',
              state: 'warn',
              detail: (
                <>
                  Não encontrada. Ela só é necessária para levar o som de jogos e aplicativos. <Link to="/ponte">Como abrir a Ponte</Link>
                </>
              ),
            }
          : ponte.status === 'checking'
            ? { key: 'ponte', title: 'Alexandrus Ponte', state: 'busy', detail: 'Procurando no seu computador…' }
            : {
                key: 'ponte',
                title: 'Alexandrus Ponte',
                state: 'idle',
                detail: 'Para som de jogos e apps. O navegador pode pedir permissão para falar com o seu computador.',
              },
    );
  }

  if (!canAudioWorklet()) {
    rows.push({ key: 'worklet', title: 'Áudio da Ponte', state: 'bad', detail: 'Este navegador não tem AudioWorklet; o som da Ponte não funcionaria aqui.' });
  }

  return (
    <div className={`system-check${compact ? ' system-check--compact' : ''}`}>
      <ul className="system-check__list">
        {rows.map((r) => (
          <li key={r.key} className="system-check__row">
            <StatusOrb state={r.state} label={ORB_LABEL[r.state]} />
            <div>
              <p className="system-check__title">{r.title}</p>
              <p className="system-check__detail">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="system-check__actions">
        <AeroButton
          variant="glass"
          size="md"
          icon="refresh"
          onClick={() => {
            void recheck();
            if (!browser || windows) void checkPonte();
          }}
        >
          {ponte.status === 'idle' ? 'Verificar, incluindo a Ponte' : 'Verificar de novo'}
        </AeroButton>
      </div>
    </div>
  );
}

const ORB_LABEL: Record<OrbState, string> = {
  ok: 'Pronto',
  warn: 'Atenção',
  bad: 'Indisponível',
  idle: 'Não se aplica',
  busy: 'Verificando',
};
