/*
 * Alexandrus — reprodutor de PCM vindo da Ponte.
 * Recebe blocos Int16 estéreo intercalados (48 kHz) pela porta e os entrega
 * ao grafo de áudio. Buffer elástico: alvo ~40 ms; acima de ~150 ms descarta o
 * excesso para não acumular atraso; sem dados, toca silêncio.
 */
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 48000 * 2; // 2 s de estéreo, em frames
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.read = 0;
    this.write = 0;
    this.size = 0;
    this.targetFrames = 1920; // 40 ms
    this.maxFrames = 7200; // 150 ms
    this.started = false;
    this.underruns = 0;
    this.dropped = 0;
    this.statsTimer = 0;

    this.port.onmessage = (ev) => {
      const data = ev.data;
      if (data instanceof ArrayBuffer) this.push(new Int16Array(data));
      else if (data && data.type === 'reset') this.reset();
    };
  }

  reset() {
    this.read = this.write = this.size = 0;
    this.started = false;
  }

  push(samples) {
    const frames = samples.length >> 1;
    for (let i = 0; i < frames; i++) {
      this.left[this.write] = samples[2 * i] / 32768;
      this.right[this.write] = samples[2 * i + 1] / 32768;
      this.write = (this.write + 1) % this.capacity;
    }
    this.size += frames;
    if (this.size > this.capacity) {
      // transbordou: mantém só o mais recente
      this.read = (this.write - this.capacity + this.capacity) % this.capacity;
      this.size = this.capacity;
    }
    if (this.size > this.maxFrames) {
      const drop = this.size - this.targetFrames;
      this.read = (this.read + drop) % this.capacity;
      this.size -= drop;
      this.dropped += drop;
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const l = out[0];
    const r = out[1] ?? out[0];
    const n = l.length;

    if (!this.started) {
      if (this.size < this.targetFrames) {
        l.fill(0);
        r.fill(0);
        return true;
      }
      this.started = true;
    }

    for (let i = 0; i < n; i++) {
      if (this.size > 0) {
        l[i] = this.left[this.read];
        r[i] = this.right[this.read];
        this.read = (this.read + 1) % this.capacity;
        this.size--;
      } else {
        l[i] = 0;
        r[i] = 0;
        if (i === 0) {
          this.underruns++;
          this.started = false; // re-encher até o alvo antes de voltar a tocar
        }
      }
    }

    this.statsTimer += n;
    if (this.statsTimer >= 48000) {
      this.statsTimer = 0;
      this.port.postMessage({
        type: 'stats',
        bufferedMs: Math.round((this.size / 48000) * 1000),
        underruns: this.underruns,
        droppedMs: Math.round((this.dropped / 48000) * 1000),
      });
    }
    return true;
  }
}

registerProcessor('alexandrus-pcm-player', PcmPlayer);
