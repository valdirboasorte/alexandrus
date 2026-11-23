import { AeroToggle, Segmented } from '../../components/ui/controls.tsx';
import { QUALITY_BITRATE, RESOLUTIONS, withContent, type CaptureSettings, type ContentKind, type Quality, type Resolution } from '../../lib/capture.ts';
import type { SegmentOption } from '../../components/ui/controls.tsx';

export const CONTENT_OPTIONS: SegmentOption<ContentKind>[] = [
  { value: 'motion', label: 'Jogo', icon: 'gamepad' },
  { value: 'film', label: 'Filme ou série', icon: 'film' },
  { value: 'detail', label: 'Texto e apps', icon: 'window' },
];

export const CONTENT_HINT: Record<ContentKind, string> = {
  motion: 'Prioriza a fluidez e o menor atraso possível.',
  film: 'Imagem mais nítida e mais banda (no mínimo Alta). Quem assiste fica meio segundo atrás para o vídeo não travar.',
  detail: 'Prioriza a nitidez de letras e detalhes; o FPS cai antes.',
};

export function QualityControls({
  value,
  onChange,
  tone = 'light',
  hideContent = false,
}: {
  value: CaptureSettings;
  onChange: (s: CaptureSettings) => void;
  tone?: 'light' | 'dark';
  /** O painel de fonte já mostra "O que vai passar" fora daqui. */
  hideContent?: boolean;
}) {
  const set = <K extends keyof CaptureSettings>(k: K, v: CaptureSettings[K]) => onChange({ ...value, [k]: v });
  return (
    <div className={`quality quality--${tone}`}>
      <div className="quality__row">
        <span className="quality__label" id="q-res">Resolução</span>
        <Segmented
          label="Resolução"
          value={value.resolution}
          onChange={(v: Resolution) => set('resolution', v)}
          options={(Object.keys(RESOLUTIONS) as Resolution[]).map((r) => ({ value: r, label: RESOLUTIONS[r].label }))}
        />
      </div>
      <div className="quality__row">
        <span className="quality__label">FPS</span>
        <Segmented
          label="Quadros por segundo"
          value={String(value.fps) as '30' | '60'}
          onChange={(v) => set('fps', Number(v) as 30 | 60)}
          options={[
            { value: '30', label: '30' },
            { value: '60', label: '60' },
          ]}
        />
      </div>
      <div className="quality__row">
        <span className="quality__label">Qualidade</span>
        <Segmented
          label="Qualidade da imagem"
          value={value.quality}
          onChange={(v: Quality) => set('quality', v)}
          options={(Object.keys(QUALITY_BITRATE) as Quality[]).map((q) => ({ value: q, label: QUALITY_BITRATE[q].label }))}
        />
        <span className="quality__hint">
          até {(QUALITY_BITRATE[value.quality].bps / 1_000_000).toLocaleString('pt-BR')} Mbps por espectador. Cada pessoa assistindo usa essa banda do
          seu upload.
        </span>
      </div>
      <div className="quality__auto">
        <label htmlFor="q-auto" className="quality__auto-label">
          Ajuste automático pela conexão
          <span>
            {value.auto
              ? 'Se a rede de alguém piorar, a qualidade dessa pessoa baixa sozinha e volta quando melhorar.'
              : 'Todos recebem sempre a qualidade escolhida, mesmo com rede ruim.'}
          </span>
        </label>
        <AeroToggle id="q-auto" checked={value.auto} onChange={(v) => set('auto', v)} label="Ajuste automático pela conexão" />
      </div>
      {!hideContent && (
        <div className="quality__row">
          <span className="quality__label">O que passa</span>
          <Segmented label="O que vai passar" value={value.content} onChange={(v) => onChange(withContent(value, v))} options={CONTENT_OPTIONS} />
          <span className="quality__hint">{CONTENT_HINT[value.content]}</span>
        </div>
      )}
    </div>
  );
}
