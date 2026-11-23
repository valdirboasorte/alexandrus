import type { ContentKind } from '@protocol';

/*
 * Ajustes de WebRTC: áudio estéreo de alta qualidade, codec de vídeo com
 * codificação por hardware primeiro, e buffer de quem assiste conforme o que
 * passa (mínimo para jogo, maior para filme).
 */

/** Opus estéreo, 192 kbps, FEC. Vale para oferta e resposta. */
export function tuneOpus(sdp: string): string {
  const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!m) return sdp;
  const pt = m[1];
  const want = { stereo: '1', 'sprop-stereo': '1', maxaveragebitrate: '192000', useinbandfec: '1', usedtx: '0' };
  const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
  const existing = sdp.match(fmtpRe);
  if (existing) {
    const params = new Map(
      existing[1]
        .split(';')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => p.split('=') as [string, string]),
    );
    for (const [k, v] of Object.entries(want)) params.set(k, v);
    const line = `a=fmtp:${pt} ${[...params].map(([k, v]) => `${k}=${v}`).join(';')}`;
    return sdp.replace(fmtpRe, line);
  }
  return sdp.replace(`a=rtpmap:${pt} opus/48000/2`, `a=rtpmap:${pt} opus/48000/2\r\na=fmtp:${pt} ${Object.entries(want).map(([k, v]) => `${k}=${v}`).join(';')}`);
}

/** Ordem de codecs: H.264 (hardware no Windows), VP9, AV1, VP8. Mantém RTX/RED/FEC. */
export function preferVideoCodecs(transceiver: RTCRtpTransceiver) {
  const caps = RTCRtpSender.getCapabilities?.('video');
  if (!caps || typeof transceiver.setCodecPreferences !== 'function') return;
  const rank = (c: RTCRtpCodec) => {
    const mime = c.mimeType.toLowerCase();
    if (mime === 'video/h264') return /profile-level-id=42e0|packetization-mode=1/.test(c.sdpFmtpLine ?? '') ? 0 : 1;
    if (mime === 'video/vp9') return 2;
    if (mime === 'video/av1') return 3;
    if (mime === 'video/vp8') return 4;
    return 10; // rtx, red, ulpfec, flexfec
  };
  const sorted = [...caps.codecs].sort((a, b) => rank(a) - rank(b));
  try {
    transceiver.setCodecPreferences(sorted);
  } catch {
    /* navegador recusou a lista: usa a padrão */
  }
}

/**
 * Teto de bitrate/FPS, divisor de resolução e preferência de degradação no
 * remetente de vídeo. Devolve false se o navegador recusou (ex.: duas chamadas
 * ao mesmo tempo); quem chama pode tentar de novo.
 */
export async function applySenderLimits(
  sender: RTCRtpSender,
  opts: { maxBitrate: number; maxFramerate: number; content: ContentKind; scale?: number },
): Promise<boolean> {
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
  for (const enc of params.encodings) {
    enc.maxBitrate = opts.maxBitrate;
    enc.maxFramerate = opts.maxFramerate;
    enc.scaleResolutionDownBy = opts.scale ?? 1;
    (enc as RTCRtpEncodingParameters & { priority?: string; networkPriority?: string }).priority = 'high';
    (enc as RTCRtpEncodingParameters & { networkPriority?: string }).networkPriority = 'high';
  }
  // jogo: segura o FPS; texto: segura a nitidez; filme: equilibra os dois
  (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
    opts.content === 'motion' ? 'maintain-framerate' : opts.content === 'detail' ? 'maintain-resolution' : 'balanced';
  try {
    await sender.setParameters(params);
    return true;
  } catch {
    /* sem negociação ainda, ou outra chamada no meio */
    return false;
  }
}

export async function applyAudioSenderLimits(sender: RTCRtpSender) {
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
  for (const enc of params.encodings) {
    enc.maxBitrate = 192_000;
    (enc as RTCRtpEncodingParameters & { priority?: string }).priority = 'high';
  }
  try {
    await sender.setParameters(params);
  } catch {
    /* idem */
  }
}

/**
 * Buffer de reprodução pedido ao receptor, em ms: 0 = o menor possível (jogo,
 * baixa latência); maior = absorve os solavancos da rede (filme).
 */
export function setReceiverBuffer(receiver: RTCRtpReceiver, ms: number) {
  const r = receiver as unknown as { jitterBufferTarget?: number | null; playoutDelayHint?: number };
  try {
    if ('jitterBufferTarget' in receiver) r.jitterBufferTarget = ms;
    else r.playoutDelayHint = ms / 1000;
  } catch {
    /* sem suporte */
  }
}
