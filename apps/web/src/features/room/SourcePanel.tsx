import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AeroButton } from '../../components/ui/AeroButton.tsx';
import { Icon } from '../../components/ui/Icon.tsx';
import { AeroToggle, Note, Segmented } from '../../components/ui/controls.tsx';
import type { CaptureSettings, SourceChoice } from '../../lib/capture.ts';
import type { PonteClient, PonteStatus } from '../../lib/ponte.ts';
import { PonteSessions } from './PonteSessions.tsx';
import { QualityControls } from './QualityControls.tsx';
import { SourceGlyph } from './SourceGlyph.tsx';
import type { AudioRequest } from './useHostSession.ts';

const SOURCES: { id: SourceChoice; title: string; desc: string }[] = [
  { id: 'app', title: 'Jogo ou aplicativo', desc: 'A janela do jogo, com o som só dele' },
  { id: 'monitor', title: 'Tela inteira', desc: 'Tudo o que aparece no monitor' },
  { id: 'window', title: 'Janela', desc: 'Um programa específico' },
  { id: 'browser', title: 'Aba do navegador', desc: 'Um vídeo, um site, com o som da aba' },
];

const LOCAL_ORIGIN = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

type MonitorAudio = 'ponte-app' | 'ponte-exclude' | 'system';
type WindowAudio = 'browser' | 'ponte-app';

interface Props {
  ponte: PonteClient;
  ponteStatus: PonteStatus;
  windows: boolean;
  canCapture: boolean;
  settings: CaptureSettings;
  onSettings: (s: CaptureSettings) => void;
  audioEnabled: boolean;
  onAudioEnabled: (on: boolean) => void;
  busy: boolean;
  submitLabel: string;
  onStart: (choice: SourceChoice, audio: AudioRequest) => void;
}

/**
 * Escolha da fonte, do som e da qualidade. Cada opção diz o que entrega de
 * verdade; o que depende da Ponte só fica ativo quando a Ponte responde.
 */
export function SourcePanel(p: Props) {
  const [choice, setChoice] = useState<SourceChoice>(p.windows ? 'app' : 'browser');
  const [monitorAudio, setMonitorAudio] = useState<MonitorAudio>('ponte-app');
  const [windowAudio, setWindowAudio] = useState<WindowAudio>('browser');
  const [app, setApp] = useState<{ pid: number; name: string } | null>(null);
  const [excluded, setExcluded] = useState<{ pid: number; name: string } | null>(null);
  const [systemOk, setSystemOk] = useState(false);

  const ponteReady = p.ponteStatus === 'ready';
  const needsPonte =
    p.audioEnabled && (choice === 'app' || (choice === 'monitor' && monitorAudio !== 'system') || (choice === 'window' && windowAudio === 'ponte-app'));

  const connectPonte = useCallback(() => {
    if (p.ponteStatus !== 'ready' && p.ponteStatus !== 'connecting') void p.ponte.connect();
  }, [p.ponte, p.ponteStatus]);

  // Conecta à Ponte quando uma opção que precisa dela está escolhida. Fora do
  // localhost isso pode abrir o pedido de "rede local" do navegador, então lá
  // só acontece depois de um clique (ver `pick`).
  useEffect(() => {
    if (LOCAL_ORIGIN && needsPonte && p.windows && p.ponteStatus === 'idle') connectPonte();
  }, [needsPonte, p.windows, p.ponteStatus, connectPonte]);

  const pick = (next: () => void, usesPonte: boolean) => {
    next();
    if (usesPonte && p.windows && p.audioEnabled) connectPonte();
  };

  const onPickApp = useCallback((pid: number, name: string) => setApp({ pid, name }), []);
  const onPickExcluded = useCallback((pid: number, name: string) => setExcluded({ pid, name }), []);

  function request(): AudioRequest {
    if (!p.audioEnabled) return { kind: 'none' };
    switch (choice) {
      case 'browser':
        return { kind: 'browser' };
      case 'app':
        return app && ponteReady ? { kind: 'ponte', pid: app.pid, name: app.name, mode: 'include' } : { kind: 'none' };
      case 'window':
        if (windowAudio === 'browser') return { kind: 'browser' };
        return app && ponteReady ? { kind: 'ponte', pid: app.pid, name: app.name, mode: 'include' } : { kind: 'none' };
      case 'monitor':
        if (monitorAudio === 'system') return systemOk ? { kind: 'system' } : { kind: 'none' };
        if (monitorAudio === 'ponte-exclude')
          return excluded && ponteReady ? { kind: 'ponte', pid: excluded.pid, name: excluded.name, mode: 'exclude' } : { kind: 'none' };
        return app && ponteReady ? { kind: 'ponte', pid: app.pid, name: app.name, mode: 'include' } : { kind: 'none' };
    }
  }

  const req = request();
  const silentWarning = p.audioEnabled && req.kind === 'none';

  return (
    <div className="source-panel">
      <fieldset className="source-panel__group">
        <legend className="source-panel__legend">O que compartilhar</legend>
        <div className="source-tiles" role="radiogroup" aria-label="Fonte">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={choice === s.id}
              className="source-tile"
              onClick={() =>
                pick(
                  () => setChoice(s.id),
                  s.id === 'app' || (s.id === 'monitor' && monitorAudio !== 'system') || (s.id === 'window' && windowAudio === 'ponte-app'),
                )
              }
            >
              <SourceGlyph kind={s.id} />
              <span className="source-tile__title">{s.title}</span>
              <span className="source-tile__desc">{s.desc}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="source-panel__group">
        <legend className="visually-hidden">Som</legend>
        <div className="audio-switch">
          <span className="audio-switch__icon" aria-hidden>
            <Icon name={p.audioEnabled ? 'volume' : 'volumeOff'} />
          </span>
          <label htmlFor="audio-da-fonte" className="audio-switch__label">
            Áudio da fonte
            <span>{p.audioEnabled ? 'O som da fonte vai junto com a imagem' : 'Só imagem, sem som'}</span>
          </label>
          <AeroToggle id="audio-da-fonte" checked={p.audioEnabled} onChange={p.onAudioEnabled} label="Áudio da fonte" />
        </div>

        {p.audioEnabled && choice === 'browser' && (
          <Note tone="ok" icon="tab">
            O navegador entrega só o som da aba escolhida. A call e os outros programas ficam de fora.
          </Note>
        )}

        {p.audioEnabled && choice === 'window' && (
          <div className="audio-options">
            <Segmented
              label="De onde vem o som da janela"
              value={windowAudio}
              onChange={(v) => pick(() => setWindowAudio(v), v === 'ponte-app')}
              options={[
                { value: 'browser', label: 'Pelo navegador' },
                { value: 'ponte-app', label: 'Pela Ponte', disabled: !p.windows },
              ]}
            />
            {windowAudio === 'browser' && (
              <p className="audio-options__hint">
                Chrome e Edge recentes conseguem levar o som da própria janela. Se o seu não oferecer, a sala avisa que a transmissão ficou sem som.
              </p>
            )}
          </div>
        )}

        {p.audioEnabled && choice === 'monitor' && (
          <div className="audio-options">
            <Segmented
              label="Som da tela inteira"
              value={monitorAudio}
              onChange={(v) => pick(() => setMonitorAudio(v), v !== 'system')}
              options={[
                { value: 'ponte-app', label: 'Um app', disabled: !p.windows },
                { value: 'ponte-exclude', label: 'Tudo menos a call', disabled: !p.windows },
                { value: 'system', label: 'Sistema inteiro' },
              ]}
            />
            {monitorAudio === 'system' && (
              <Note tone="warn">
                O som do sistema inteiro inclui o Discord: quem está na call vai se ouvir de volta.
                <label className="consent">
                  <input type="checkbox" checked={systemOk} onChange={(e) => setSystemOk(e.target.checked)} />
                  Entendi, quero mesmo assim
                </label>
              </Note>
            )}
            {monitorAudio === 'ponte-exclude' && (
              <p className="audio-options__hint">Leva o som de todos os programas, menos o app escolhido abaixo (e tudo o que ele abrir).</p>
            )}
          </div>
        )}

        {needsPonte && !p.windows && <Note tone="warn">O som de aplicativos precisa da Alexandrus Ponte, que só existe para Windows.</Note>}

        {needsPonte && p.windows && !ponteReady && (
          <Note tone={p.ponteStatus === 'connecting' ? 'info' : 'warn'} icon="bridge">
            {p.ponteStatus === 'connecting' ? (
              'Procurando a Alexandrus Ponte no seu computador…'
            ) : (
              <>
                {p.ponteStatus === 'idle'
                  ? 'O som só do jogo vem pela Alexandrus Ponte. '
                  : 'A Ponte não respondeu. Para levar o som só do jogo, abra a '}
                {p.ponteStatus !== 'idle' && (
                  <Link to="/ponte" target="_blank">
                    Alexandrus Ponte
                  </Link>
                )}
                {p.ponteStatus !== 'idle' && '.'}
                <span className="note-actions">
                  <AeroButton size="sm" variant="glass" icon={p.ponteStatus === 'idle' ? 'bridge' : 'refresh'} onClick={connectPonte}>
                    {p.ponteStatus === 'idle' ? 'Conectar à Ponte' : 'Procurar de novo'}
                  </AeroButton>
                </span>
              </>
            )}
          </Note>
        )}

        {needsPonte && ponteReady && (
          <div className="ponte-pick">
            <p className="ponte-pick__title">
              {choice === 'monitor' && monitorAudio === 'ponte-exclude' ? 'Qual programa fica de fora?' : 'De qual programa vem o som?'}
            </p>
            <PonteSessions
              ponte={p.ponte}
              mode={choice === 'monitor' && monitorAudio === 'ponte-exclude' ? 'exclude' : 'include'}
              value={(choice === 'monitor' && monitorAudio === 'ponte-exclude' ? excluded : app)?.pid ?? null}
              onChange={choice === 'monitor' && monitorAudio === 'ponte-exclude' ? onPickExcluded : onPickApp}
            />
          </div>
        )}
      </fieldset>

      <details className="source-panel__group source-panel__quality">
        <summary>
          <Icon name="sliders" />
          Qualidade da imagem
          <span className="source-panel__summary-hint">
            {p.settings.resolution === 'native' ? 'Original' : p.settings.resolution} · {p.settings.fps} FPS
          </span>
          <Icon name="chevronDown" className="source-panel__chev" />
        </summary>
        <QualityControls value={p.settings} onChange={p.onSettings} />
      </details>

      {silentWarning && (
        <Note tone="warn">Do jeito que está, a transmissão vai sem som. {choice === 'app' || needsPonte ? 'Escolha um programa na lista.' : ''}</Note>
      )}
      {!p.canCapture && <Note tone="bad">Este navegador não captura a tela. Para transmitir, abra a sala no Chrome ou no Edge de um computador.</Note>}

      <AeroButton block icon="play" disabled={p.busy || !p.canCapture} onClick={() => p.onStart(choice, req)}>
        {p.busy ? 'Abrindo o seletor…' : p.submitLabel}
      </AeroButton>
      <p className="source-panel__foot">
        O navegador vai pedir para você escolher {choice === 'monitor' ? 'o monitor' : choice === 'browser' ? 'a aba' : 'a janela'}. Seu microfone não é usado.
      </p>
    </div>
  );
}
