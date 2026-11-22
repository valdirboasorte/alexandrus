import { AeroToggle, Segmented } from '../../components/ui/controls.tsx';
import { QUALITY_BITRATE, RESOLUTIONS, type CaptureSettings, type Quality, type Resolution } from '../../lib/capture.ts';

export function QualityControls({ value, onChange, tone = 'light' }: { value: CaptureSettings; onChange: (s: CaptureSettings) => void; tone?: 'light' | 'dark' }) {
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
      <div className="quality__row">
        <span className="quality__label">Prioridade</span>
        <Segmented
          label="Prioridade de imagem"
          value={value.content}
          onChange={(v) => set('content', v)}
          options={[
            { value: 'motion', label: 'Fluidez (jogos)', icon: 'gamepad' },
            { value: 'detail', label: 'Nitidez (texto)', icon: 'window' },
          ]}
        />
      </div>
    </div>
  );
}
