/*
 * Números reais da conexão, lidos de getStats(). Nada estimado.
 */

export interface ViewerStats {
  width: number | null;
  height: number | null;
  fps: number | null;
  videoKbps: number | null;
  audioKbps: number | null;
  rttMs: number | null;
  lossPct: number | null;
  jitterBufferMs: number | null;
  codec: string | null;
  transport: 'direta' | 'relay (TURN)' | null;
}

export interface SenderStats {
  width: number | null;
  height: number | null;
  fps: number | null;
  videoKbps: number | null;
  rttMs: number | null;
  lossPct: number | null;
  limitedBy: string | null;
  codec: string | null;
}

type Prev = Map<string, { bytes: number; ts: number }>;

function kbps(prev: Prev, key: string, bytes: number, ts: number): number | null {
  const p = prev.get(key);
  prev.set(key, { bytes, ts });
  if (!p || ts <= p.ts) return null;
  return Math.max(0, Math.round(((bytes - p.bytes) * 8) / (ts - p.ts)));
}

function selectedPair(report: RTCStatsReport): { rtt: number | null; relay: boolean | null } {
  let pairId: string | undefined;
  report.forEach((s) => {
    if (s.type === 'transport' && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId;
  });
  let pair: Record<string, unknown> | undefined;
  report.forEach((s) => {
    if (s.type === 'candidate-pair' && (s.id === pairId || (!pairId && s.nominated && s.state === 'succeeded'))) pair = s;
  });
  if (!pair) return { rtt: null, relay: null };
  const local = report.get(pair.localCandidateId as string) as { candidateType?: string } | undefined;
  const rtt = typeof pair.currentRoundTripTime === 'number' ? Math.round((pair.currentRoundTripTime as number) * 1000) : null;
  return { rtt, relay: local ? local.candidateType === 'relay' : null };
}

function codecName(report: RTCStatsReport, codecId?: string) {
  if (!codecId) return null;
  const c = report.get(codecId) as { mimeType?: string } | undefined;
  return c?.mimeType?.split('/')[1]?.toUpperCase() ?? null;
}

export function createViewerStatsReader(pc: RTCPeerConnection) {
  const prev: Prev = new Map();
  return async (): Promise<ViewerStats> => {
    const report = await pc.getStats();
    const out: ViewerStats = {
      width: null, height: null, fps: null, videoKbps: null, audioKbps: null,
      rttMs: null, lossPct: null, jitterBufferMs: null, codec: null, transport: null,
    };
    report.forEach((s) => {
      if (s.type !== 'inbound-rtp') return;
      if (s.kind === 'video') {
        out.width = s.frameWidth ?? null;
        out.height = s.frameHeight ?? null;
        out.fps = typeof s.framesPerSecond === 'number' ? Math.round(s.framesPerSecond) : null;
        out.videoKbps = kbps(prev, 'v', s.bytesReceived ?? 0, s.timestamp);
        const lost = s.packetsLost ?? 0;
        const recv = s.packetsReceived ?? 0;
        out.lossPct = recv + lost > 0 ? Math.round((lost / (recv + lost)) * 1000) / 10 : null;
        if (s.jitterBufferEmittedCount) out.jitterBufferMs = Math.round((s.jitterBufferDelay / s.jitterBufferEmittedCount) * 1000);
        out.codec = codecName(report, s.codecId);
      } else if (s.kind === 'audio') {
        out.audioKbps = kbps(prev, 'a', s.bytesReceived ?? 0, s.timestamp);
      }
    });
    const pair = selectedPair(report);
    out.rttMs = pair.rtt;
    out.transport = pair.relay === null ? null : pair.relay ? 'relay (TURN)' : 'direta';
    return out;
  };
}

export function createSenderStatsReader(pc: RTCPeerConnection) {
  const prev: Prev = new Map();
  return async (): Promise<SenderStats> => {
    const report = await pc.getStats();
    const out: SenderStats = { width: null, height: null, fps: null, videoKbps: null, rttMs: null, lossPct: null, limitedBy: null, codec: null };
    report.forEach((s) => {
      if (s.type === 'outbound-rtp' && s.kind === 'video') {
        out.width = s.frameWidth ?? null;
        out.height = s.frameHeight ?? null;
        out.fps = typeof s.framesPerSecond === 'number' ? Math.round(s.framesPerSecond) : null;
        out.videoKbps = kbps(prev, s.id, s.bytesSent ?? 0, s.timestamp);
        out.limitedBy = s.qualityLimitationReason && s.qualityLimitationReason !== 'none' ? s.qualityLimitationReason : null;
        out.codec = codecName(report, s.codecId);
      }
      if (s.type === 'remote-inbound-rtp' && s.kind === 'video') {
        if (typeof s.roundTripTime === 'number') out.rttMs = Math.round(s.roundTripTime * 1000);
        if (typeof s.fractionLost === 'number') out.lossPct = Math.round(s.fractionLost * 1000) / 10;
      }
    });
    if (out.rttMs === null) out.rttMs = selectedPair(report).rtt;
    return out;
  };
}

export const LIMIT_REASON: Record<string, string> = {
  cpu: 'processador',
  bandwidth: 'rede',
  other: 'outro motivo',
};
