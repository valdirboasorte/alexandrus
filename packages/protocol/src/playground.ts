/**
 * Alexandrus Playground — o pequeno mundo de cada sala.
 *
 * Tipos, limites e validação compartilhados entre o navegador e os dois
 * servidores (Node e Cloudflare). Mesmas regras de index.ts: só sintaxe
 * apagável de TypeScript, imports relativos.
 *
 * O que é compartilhado e o que é local:
 * - Compartilhado (passa pelo servidor): reações, sons, eventos visuais,
 *   aquário (peixes, comida), quadro de desenho, roleta da sala, votações,
 *   desafios/sugestões, mascote, ranking das bolhas, estatísticas.
 * - Local (nunca sai do navegador): as bolhas do jogo em si, os Brinquedos do
 *   Céu, listas salvas da roleta, volume e silêncio dos efeitos.
 *
 * O movimento dos peixes e o humor do mascote não trafegam: cada navegador
 * calcula a partir do relógio do servidor e de poucos carimbos de tempo.
 */

/** Anunciado em `joined.features` pelos servidores que têm o Playground. */
export const PG_FEATURE = 'playground';

/* ------------------------------------------------------------------ */
/* Catálogos                                                            */
/* ------------------------------------------------------------------ */

export const REACTIONS = ['heart', 'star', 'bubble', 'rocket', 'fish', 'cloud', 'laugh', 'fire', 'thumbs'] as const;
export type ReactionKind = (typeof REACTIONS)[number];

export const SOUND_CATEGORIES = [
  { id: 'memes', name: 'Memes' },
  { id: 'efeitos', name: 'Efeitos' },
  { id: 'engracados', name: 'Engraçados' },
  { id: 'jogos', name: 'Jogos' },
  { id: 'alertas', name: 'Alertas' },
  { id: 'ambiente', name: 'Ambiente' },
] as const;
export type SoundCategory = (typeof SOUND_CATEGORIES)[number]['id'];

/** Todos sintetizados no navegador (Web Audio): nenhum arquivo de áudio de terceiros. */
export const SOUNDS = [
  { id: 'badum', cat: 'memes', name: 'Ba-dum-tss' },
  { id: 'trombone', cat: 'memes', name: 'Trombone triste' },
  { id: 'grilos', cat: 'memes', name: 'Grilos' },
  { id: 'suspense', cat: 'memes', name: 'Suspense' },
  { id: 'tada', cat: 'memes', name: 'Tcharã!' },
  { id: 'corneta', cat: 'memes', name: 'Corneta' },
  { id: 'boing', cat: 'efeitos', name: 'Boing' },
  { id: 'pop', cat: 'efeitos', name: 'Pop' },
  { id: 'whoosh', cat: 'efeitos', name: 'Vush' },
  { id: 'laser', cat: 'efeitos', name: 'Laser' },
  { id: 'splash', cat: 'efeitos', name: 'Splash' },
  { id: 'zap', cat: 'efeitos', name: 'Zap' },
  { id: 'apito', cat: 'engracados', name: 'Apito de desenho' },
  { id: 'buzina', cat: 'engracados', name: 'Buzina de palhaço' },
  { id: 'mola', cat: 'engracados', name: 'Mola' },
  { id: 'queda', cat: 'engracados', name: 'Queda' },
  { id: 'kazoo', cat: 'engracados', name: 'Kazoo' },
  { id: 'moeda', cat: 'jogos', name: 'Moeda' },
  { id: 'nivel', cat: 'jogos', name: 'Subiu de nível' },
  { id: 'fim', cat: 'jogos', name: 'Fim de jogo' },
  { id: 'poder', cat: 'jogos', name: 'Poder extra' },
  { id: 'pulo', cat: 'jogos', name: 'Pulo' },
  { id: 'ding', cat: 'alertas', name: 'Ding' },
  { id: 'carrilhao', cat: 'alertas', name: 'Carrilhão' },
  { id: 'alarme', cat: 'alertas', name: 'Alarme' },
  { id: 'aviso', cat: 'alertas', name: 'Aviso' },
  { id: 'chuva', cat: 'ambiente', name: 'Chuva' },
  { id: 'ondas', cat: 'ambiente', name: 'Ondas' },
  { id: 'passaros', cat: 'ambiente', name: 'Passarinhos' },
  { id: 'vento', cat: 'ambiente', name: 'Vento' },
  { id: 'riacho', cat: 'ambiente', name: 'Riacho' },
] as const satisfies readonly { id: string; cat: SoundCategory; name: string }[];
export type SoundId = (typeof SOUNDS)[number]['id'];

/** Eventos visuais que alguém lança para a sala inteira. */
export const VFX = [
  { id: 'bolhas', name: 'Chuva de bolhas' },
  { id: 'cardume', name: 'Cardume' },
  { id: 'arco-iris', name: 'Arco-íris' },
  { id: 'folhas', name: 'Folhas ao vento' },
] as const;
export type VfxKind = (typeof VFX)[number]['id'];

/** Espécies do aquário; `unlock` = comidas servidas na sala para liberar. */
export const FISH_SPECIES = [
  { id: 'bolinha', name: 'Bolinha', unlock: 0 },
  { id: 'listrado', name: 'Listrado', unlock: 0 },
  { id: 'veu', name: 'Cauda-véu', unlock: 0 },
  { id: 'neon', name: 'Neon', unlock: 10 },
  { id: 'lua', name: 'Peixe-lua', unlock: 25 },
  { id: 'arraia', name: 'Arraia', unlock: 50 },
  { id: 'agua-viva', name: 'Água-viva', unlock: 80 },
  { id: 'dourado', name: 'Dourado', unlock: 120 },
] as const;
export type FishSpecies = (typeof FISH_SPECIES)[number]['id'];

export const FISH_PATTERNS = [
  { id: 'liso', name: 'Liso' },
  { id: 'listras', name: 'Listras' },
  { id: 'pintas', name: 'Pintas' },
  { id: 'degrade', name: 'Degradê' },
] as const;
export type FishPattern = (typeof FISH_PATTERNS)[number]['id'];

export type PgStatKey = keyof PgStats;

/** Acessórios do mascote: liberados por marcos reais da sala. */
export const PET_ACCESSORIES = [
  { id: 'folha', name: 'Chapéu de folha', stat: null, n: 0 },
  { id: 'oculos', name: 'Óculos de sol', stat: 'reactions', n: 30 },
  { id: 'coroa', name: 'Coroa de bolhas', stat: 'bubbles', n: 300 },
  { id: 'cachecol', name: 'Cachecol', stat: 'polls', n: 3 },
  { id: 'fones', name: 'Fones', stat: 'sounds', n: 25 },
  { id: 'boina', name: 'Boina de pintor', stat: 'strokes', n: 40 },
  { id: 'peixinho', name: 'Peixinho amigo', stat: 'feeds', n: 30 },
  { id: 'aureola', name: 'Auréola de estrelas', stat: 'stage', n: 3 },
] as const satisfies readonly { id: string; name: string; stat: PgStatKey | 'stage' | null; n: number }[];
export type PetAccessory = (typeof PET_ACCESSORIES)[number]['id'];

/** XP necessário para cada fase do mascote (fase 0 a 3). */
export const PET_STAGES = [0, 25, 90, 220] as const;
export const PET_STAGE_NAMES = ['Orvalho', 'Broto', 'Gota-folha', 'Gota-flor'] as const;

/* ------------------------------------------------------------------ */
/* Limites                                                              */
/* ------------------------------------------------------------------ */

export const PG_LIMITS = {
  /** Quadro: coordenadas inteiras neste espaço, qualquer tamanho de tela. */
  boardW: 1600,
  boardH: 1000,
  strokeMaxPoints: 1500,
  /** Números por pedaço de traço (pares x,y). */
  chunkMaxNums: 160,
  boardMaxStrokes: 500,
  boardMaxPoints: 36_000,
  brushMin: 2,
  brushMax: 56,
  textMax: 140,
  pollQuestionMax: 100,
  pollOptionMax: 40,
  pollOptionsMin: 2,
  pollOptionsMax: 6,
  spinTitleMax: 40,
  spinOptionMax: 32,
  spinOptionsMin: 2,
  spinOptionsMax: 16,
  fishNameMax: 20,
  petNameMax: 16,
  maxFish: 24,
  petSuggestionsMax: 6,
  asksPendingMax: 25,
  asksKept: 40,
  boardRows: 20,
  /** Uma rodada de Bubble Pop. */
  bubbleRoundMs: 60_000,
  bubbleMaxPops: 320,
  bubbleMaxScore: 60_000,
  /** Duração da animação da roleta: nenhuma outra começa antes. */
  spinMs: 5_600,
  timelineMax: 96,
  peopleKept: 300,
} as const;

/** Intervalos mínimos por pessoa (ms). `calm` = modo de baixa interação. */
export const PG_COOLDOWN = {
  react: 450,
  reactCalm: 5_000,
  sound: 4_000,
  vfx: 45_000,
  feed: 1_500,
  spin: 8_000,
  pollNew: 15_000,
  vote: 400,
  ask: 30_000,
  pet: 2_500,
  petName: 20_000,
  petVote: 800,
  petAcc: 3_000,
  fishEdit: 1_500,
  stats: 1_500,
  settings: 250,
  undo: 150,
  clear: 2_000,
} as const;

/** Limites da sala inteira, somando todo mundo. */
export const PG_ROOM_RATE = {
  /** Reações por segundo na sala. */
  reactsPerSec: 24,
  /** Sons em qualquer janela de 6 s. */
  soundsPer6s: 4,
  /** Intervalo mínimo entre eventos visuais de pessoas diferentes. */
  vfxGapMs: 15_000,
  feedsPerSec: 6,
} as const;

/* ------------------------------------------------------------------ */
/* Modelos                                                              */
/* ------------------------------------------------------------------ */

export interface PgSettings {
  /** Desligado = o Playground some para todos (o anfitrião ainda vê os controles). */
  enabled: boolean;
  sounds: boolean;
  reactions: boolean;
  vfx: boolean;
  /** Desafios e sugestões para o anfitrião. */
  asks: boolean;
  /** Quem cria votações e roletas da sala. */
  polls: 'host' | 'all';
  /** Quem limpa o quadro inteiro (cada um sempre pode apagar os próprios traços). */
  clear: 'host' | 'all';
  /** Modo calmo: sem sons nem eventos visuais, reações bem espaçadas. */
  calm: boolean;
}

export const DEFAULT_PG_SETTINGS: PgSettings = {
  enabled: true,
  sounds: true,
  reactions: true,
  vfx: true,
  asks: true,
  polls: 'all',
  clear: 'host',
  calm: false,
};

export interface PgStats {
  reactions: number;
  bubbles: number;
  score: number;
  rounds: number;
  strokes: number;
  sounds: number;
  polls: number;
  spins: number;
  feeds: number;
  asks: number;
  vfx: number;
  pets: number;
  /** Pessoas diferentes que entraram no Playground desta sala. */
  visitors: number;
  /** Maior número de pessoas ao mesmo tempo. */
  peak: number;
}

export const EMPTY_PG_STATS: PgStats = {
  reactions: 0,
  bubbles: 0,
  score: 0,
  rounds: 0,
  strokes: 0,
  sounds: 0,
  polls: 0,
  spins: 0,
  feeds: 0,
  asks: 0,
  vfx: 0,
  pets: 0,
  visitors: 0,
  peak: 0,
};

export interface FishView {
  id: string;
  /** Id público do dono (PgYou.pid). */
  owner: string;
  ownerName: string;
  online: boolean;
  name: string;
  species: FishSpecies;
  pattern: FishPattern;
  /** Matiz do corpo e das nadadeiras, 0–359. */
  hue: number;
  hue2: number;
  /** Cresce comendo: 1 a 1.6. */
  size: number;
  fed: number;
  /** Semente do trajeto (igual em todos os navegadores). */
  seed: number;
  born: number;
}

export interface BoardRow {
  pid: string;
  name: string;
  best: number;
  rounds: number;
}

export interface StrokeView {
  n: number;
  by: string;
  byName: string;
  /** Cor #rrggbb. */
  c: string;
  w: number;
  /** Borracha. */
  er: boolean;
  /** x,y,x,y… no espaço do quadro. */
  p: number[];
  done: boolean;
}

export interface PollView {
  id: string;
  q: string;
  opts: { t: string; n: number }[];
  by: string;
  byName: string;
  open: boolean;
  at: number;
  closedAt: number | null;
  /** O meu voto (índice), personalizado por destinatário. */
  mine: number | null;
}

export type AskKind = 'challenge' | 'suggestion';
export type AskStatus = 'pending' | 'accepted' | 'rejected' | 'done';

export interface AskView {
  id: string;
  kind: AskKind;
  text: string;
  by: string;
  byName: string;
  status: AskStatus;
  at: number;
}

export interface SpinView {
  id: string;
  title: string;
  opts: string[];
  pick: number;
  from: string;
  by: string;
  at: number;
}

export interface PetView {
  name: string | null;
  /** XP de interações; o tempo de atividade da sala soma por cima (1 por minuto). */
  xp: number;
  activeMs: number;
  activeSince: number | null;
  born: number;
  fedAt: number;
  pettedAt: number;
  tuckedAt: number;
  acc: PetAccessory | null;
  suggestions: { id: string; name: string; by: string; votes: number }[];
  /** Sugestão em que eu votei (personalizado). */
  myVote: string | null;
  /** Último gesto, para a animação: quem e o quê. */
  last: { act: PetAct; by: string; at: number } | null;
}

export type PetAct = 'pet' | 'feed' | 'tuck';

export interface PgYou {
  pid: string;
  fish: string | null;
  muted: boolean;
  best: number;
}

export interface PgSnapshot {
  /** Relógio do servidor, para sincronizar peixes, mascote e roleta. */
  now: number;
  settings: PgSettings;
  you: PgYou;
  fish: FishView[];
  board: BoardRow[];
  poll: PollView | null;
  asks: AskView[];
  pet: PetView;
  stats: PgStats;
  spin: SpinView | null;
  strokes: number;
  /** Só para o anfitrião: ids de quem está silenciado no Playground. */
  mutedPeers: string[];
}

export interface PgStatsView {
  now: number;
  stats: PgStats;
  /** [carimbo, pessoas no Playground]. */
  timeline: [number, number][];
  activeMs: number;
  activeSince: number | null;
  present: number;
}

/* ------------------------------------------------------------------ */
/* Mensagens                                                            */
/* ------------------------------------------------------------------ */

export type PgAction =
  /** Entrar no Playground. `cid` é um segredo do navegador (nunca é repassado a ninguém). */
  | { k: 'sync'; cid: string }
  | { k: 'sub'; ch: 'paint'; on: boolean }
  | { k: 'settings'; patch: Partial<PgSettings> }
  | { k: 'mute'; peer: string; on: boolean }
  | { k: 'react'; r: ReactionKind }
  | { k: 'sound'; s: SoundId }
  | { k: 'vfx'; v: VfxKind }
  | { k: 'bubble-start' }
  | { k: 'bubble-end'; score: number; pops: number; combo: number }
  | { k: 'fish-edit'; name?: string; species?: FishSpecies; pattern?: FishPattern; hue?: number; hue2?: number }
  /** Comida no aquário, x de 0 a 1000. `fish` = alimentar um peixe específico. */
  | { k: 'feed'; x: number; fish?: string }
  /** Pedaço de traço: o primeiro cria, os seguintes acrescentam, `end` fecha. */
  | { k: 'stroke'; id: string; c: string; w: number; er: boolean; p: number[]; end: boolean }
  | { k: 'undo' }
  | { k: 'clear'; mine: boolean }
  | { k: 'spin'; title: string; opts: string[] }
  | { k: 'poll-new'; q: string; opts: string[] }
  | { k: 'vote'; poll: string; o: number }
  | { k: 'poll-close'; poll: string }
  | { k: 'ask'; kind: AskKind; text: string }
  | { k: 'ask-answer'; id: string; status: 'accepted' | 'rejected' | 'done' }
  | { k: 'pet'; act: PetAct }
  | { k: 'pet-name'; name: string }
  | { k: 'pet-vote'; id: string }
  | { k: 'pet-pick'; id: string }
  | { k: 'pet-acc'; acc: PetAccessory | null }
  | { k: 'stats' };

export type PgErrCode = 'cooldown' | 'busy' | 'disabled' | 'muted' | 'not-allowed' | 'invalid' | 'full' | 'locked';

export type PgEvent =
  | { k: 'state'; s: PgSnapshot }
  | { k: 'settings'; settings: PgSettings }
  | { k: 'muted'; me: boolean; peers: string[] }
  | { k: 'react'; r: ReactionKind; from: string; by: string }
  | { k: 'sound'; s: SoundId; from: string; by: string }
  | { k: 'vfx'; v: VfxKind; from: string; by: string }
  | { k: 'board'; rows: BoardRow[] }
  | { k: 'fish'; fish: FishView[] }
  | { k: 'food'; x: number; fish: string | null; size: number; fed: number; from: string; by: string; at: number }
  | { k: 'unlock'; species: FishSpecies }
  | { k: 'paint'; strokes: StrokeView[] }
  | { k: 'stroke'; s: StrokeView; id?: string }
  | { k: 'stroke-ack'; id: string; n: number }
  | { k: 'unstroke'; ns: number[] }
  | { k: 'paint-clear'; by: string }
  | { k: 'spin'; spin: SpinView }
  | { k: 'poll'; poll: PollView | null }
  | { k: 'asks'; items: AskView[]; changed?: { id: string; status: AskStatus; text: string; kind: AskKind; byName: string } }
  | { k: 'pet'; pet: PetView }
  | { k: 'stats'; v: PgStatsView }
  | { k: 'err'; code: PgErrCode; act: PgAction['k']; retry?: number };

/* ------------------------------------------------------------------ */
/* Regras compartilhadas                                                */
/* ------------------------------------------------------------------ */

const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;

/** Texto curto de pessoa: sem caracteres de controle, espaços colapsados, cortado. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function unlockedSpecies(feeds: number): FishSpecies[] {
  return FISH_SPECIES.filter((s) => feeds >= s.unlock).map((s) => s.id);
}

/** XP total do mascote agora (interações + minutos de sala com gente). */
export function petTotalXp(pet: Pick<PetView, 'xp' | 'activeMs' | 'activeSince'>, now: number): number {
  const active = pet.activeMs + (pet.activeSince !== null ? Math.max(0, now - pet.activeSince) : 0);
  return pet.xp + Math.floor(active / 60_000);
}

export function petStage(xp: number): { stage: number; progress: number; next: number | null } {
  let stage = 0;
  for (let i = PET_STAGES.length - 1; i >= 0; i--) {
    if (xp >= PET_STAGES[i]) {
      stage = i;
      break;
    }
  }
  const next = stage < PET_STAGES.length - 1 ? PET_STAGES[stage + 1] : null;
  const base = PET_STAGES[stage];
  return { stage, next, progress: next === null ? 1 : (xp - base) / (next - base) };
}

export type PetMood = 'eating' | 'happy' | 'calm' | 'missing' | 'sleeping';

/**
 * Humor sem castigo: feliz logo depois de carinho, tranquilo por um tempo,
 * com saudade se ninguém aparece (nunca piora além disso) e depois dorme.
 * Sem ninguém na sala, dorme. Nunca regride de fase.
 */
export function petMood(pet: Pick<PetView, 'fedAt' | 'pettedAt' | 'tuckedAt' | 'activeSince' | 'born'>, now: number): PetMood {
  if (pet.activeSince === null) return 'sleeping';
  if (now - pet.fedAt < 3_500) return 'eating';
  // sala nova conta como 'acabou de receber carinho': ninguém começa com saudade
  const lastCare = Math.max(pet.fedAt, pet.pettedAt, pet.born);
  if (pet.tuckedAt > lastCare && now - pet.tuckedAt < 10 * 60_000) return 'sleeping';
  const quiet = now - lastCare;
  if (quiet < 90_000) return 'happy';
  if (quiet < 6 * 60_000) return 'calm';
  if (quiet < 12 * 60_000) return 'missing';
  return 'sleeping';
}

export function petHungry(pet: Pick<PetView, 'fedAt' | 'born'>, now: number): boolean {
  return now - Math.max(pet.fedAt, pet.born) > 20 * 60_000;
}

export function unlockedAccessories(stats: PgStats, stage: number): PetAccessory[] {
  return PET_ACCESSORIES.filter((a) => (a.stat === null ? true : a.stat === 'stage' ? stage >= a.n : stats[a.stat] >= a.n)).map((a) => a.id);
}

/* ------------------------------------------------------------------ */
/* Validação (servidor)                                                 */
/* ------------------------------------------------------------------ */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

const REACTION_IDS: readonly string[] = REACTIONS;
const SOUND_LIST: readonly string[] = SOUNDS.map((s) => s.id);
const VFX_LIST: readonly string[] = VFX.map((v) => v.id);
const SPECIES_LIST: readonly string[] = FISH_SPECIES.map((s) => s.id);
const PATTERN_LIST: readonly string[] = FISH_PATTERNS.map((p) => p.id);
const ACC_LIST: readonly string[] = PET_ACCESSORIES.map((a) => a.id);
const ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
const CID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/;

function cleanOptions(v: unknown, min: number, max: number, len: number): string[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  const out = v.map((o) => cleanText(o, len)).filter((o) => o.length > 0);
  return out.length >= min ? out : null;
}

/** Valida e normaliza uma ação vinda da rede. Inválida → null. */
export function parsePgAction(raw: unknown): PgAction | null {
  if (!isObj(raw) || typeof raw.k !== 'string') return null;
  const L = PG_LIMITS;
  switch (raw.k) {
    case 'sync':
      return typeof raw.cid === 'string' && CID_RE.test(raw.cid) ? { k: 'sync', cid: raw.cid } : null;
    case 'sub':
      return raw.ch === 'paint' && typeof raw.on === 'boolean' ? { k: 'sub', ch: 'paint', on: raw.on } : null;
    case 'settings': {
      if (!isObj(raw.patch)) return null;
      const p = raw.patch;
      const patch: Partial<PgSettings> = {};
      for (const key of ['enabled', 'sounds', 'reactions', 'vfx', 'asks', 'calm'] as const) {
        if (p[key] === undefined) continue;
        if (typeof p[key] !== 'boolean') return null;
        patch[key] = p[key] as boolean;
      }
      for (const key of ['polls', 'clear'] as const) {
        if (p[key] === undefined) continue;
        if (p[key] !== 'host' && p[key] !== 'all') return null;
        patch[key] = p[key] as 'host' | 'all';
      }
      return Object.keys(patch).length ? { k: 'settings', patch } : null;
    }
    case 'mute':
      return typeof raw.peer === 'string' && raw.peer.length <= 32 && typeof raw.on === 'boolean' ? { k: 'mute', peer: raw.peer, on: raw.on } : null;
    case 'react':
      return oneOf(REACTION_IDS, raw.r) ? { k: 'react', r: raw.r as ReactionKind } : null;
    case 'sound':
      return oneOf(SOUND_LIST, raw.s) ? { k: 'sound', s: raw.s as SoundId } : null;
    case 'vfx':
      return oneOf(VFX_LIST, raw.v) ? { k: 'vfx', v: raw.v as VfxKind } : null;
    case 'bubble-start':
      return { k: 'bubble-start' };
    case 'bubble-end':
      return isInt(raw.score, 0, L.bubbleMaxScore) && isInt(raw.pops, 0, L.bubbleMaxPops) && isInt(raw.combo, 0, L.bubbleMaxPops)
        ? { k: 'bubble-end', score: raw.score, pops: raw.pops, combo: raw.combo }
        : null;
    case 'fish-edit': {
      const out: Extract<PgAction, { k: 'fish-edit' }> = { k: 'fish-edit' };
      if (raw.name !== undefined) {
        const name = cleanText(raw.name, L.fishNameMax);
        if (!name) return null;
        out.name = name;
      }
      if (raw.species !== undefined) {
        if (!oneOf(SPECIES_LIST, raw.species)) return null;
        out.species = raw.species as FishSpecies;
      }
      if (raw.pattern !== undefined) {
        if (!oneOf(PATTERN_LIST, raw.pattern)) return null;
        out.pattern = raw.pattern as FishPattern;
      }
      if (raw.hue !== undefined) {
        if (!isInt(raw.hue, 0, 359)) return null;
        out.hue = raw.hue;
      }
      if (raw.hue2 !== undefined) {
        if (!isInt(raw.hue2, 0, 359)) return null;
        out.hue2 = raw.hue2;
      }
      return Object.keys(out).length > 1 ? out : null;
    }
    case 'feed': {
      if (!isNum(raw.x, 0, 1000)) return null;
      if (raw.fish !== undefined && !(typeof raw.fish === 'string' && ID_RE.test(raw.fish))) return null;
      return { k: 'feed', x: Math.round(raw.x), ...(typeof raw.fish === 'string' ? { fish: raw.fish } : {}) };
    }
    case 'stroke': {
      if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
      if (typeof raw.c !== 'string' || !COLOR_RE.test(raw.c)) return null;
      if (!isInt(raw.w, L.brushMin, L.brushMax) || typeof raw.er !== 'boolean' || typeof raw.end !== 'boolean') return null;
      if (!Array.isArray(raw.p) || raw.p.length % 2 !== 0 || raw.p.length > L.chunkMaxNums) return null;
      const p: number[] = [];
      for (let i = 0; i < raw.p.length; i += 2) {
        const x = raw.p[i];
        const y = raw.p[i + 1];
        if (!isInt(x, -100, L.boardW + 100) || !isInt(y, -100, L.boardH + 100)) return null;
        p.push(x, y);
      }
      return { k: 'stroke', id: raw.id, c: raw.c, w: raw.w, er: raw.er, p, end: raw.end };
    }
    case 'undo':
      return { k: 'undo' };
    case 'clear':
      return typeof raw.mine === 'boolean' ? { k: 'clear', mine: raw.mine } : null;
    case 'spin': {
      const title = cleanText(raw.title, L.spinTitleMax);
      const opts = cleanOptions(raw.opts, L.spinOptionsMin, L.spinOptionsMax, L.spinOptionMax);
      return opts ? { k: 'spin', title: title || 'Sorteio', opts } : null;
    }
    case 'poll-new': {
      const q = cleanText(raw.q, L.pollQuestionMax);
      const opts = cleanOptions(raw.opts, L.pollOptionsMin, L.pollOptionsMax, L.pollOptionMax);
      return q && opts ? { k: 'poll-new', q, opts } : null;
    }
    case 'vote':
      return typeof raw.poll === 'string' && ID_RE.test(raw.poll) && isInt(raw.o, 0, L.pollOptionsMax - 1) ? { k: 'vote', poll: raw.poll, o: raw.o } : null;
    case 'poll-close':
      return typeof raw.poll === 'string' && ID_RE.test(raw.poll) ? { k: 'poll-close', poll: raw.poll } : null;
    case 'ask': {
      if (raw.kind !== 'challenge' && raw.kind !== 'suggestion') return null;
      const text = cleanText(raw.text, L.textMax);
      return text ? { k: 'ask', kind: raw.kind, text } : null;
    }
    case 'ask-answer':
      return typeof raw.id === 'string' && ID_RE.test(raw.id) && (raw.status === 'accepted' || raw.status === 'rejected' || raw.status === 'done')
        ? { k: 'ask-answer', id: raw.id, status: raw.status }
        : null;
    case 'pet':
      return raw.act === 'pet' || raw.act === 'feed' || raw.act === 'tuck' ? { k: 'pet', act: raw.act } : null;
    case 'pet-name': {
      const name = cleanText(raw.name, L.petNameMax);
      return name ? { k: 'pet-name', name } : null;
    }
    case 'pet-vote':
      return typeof raw.id === 'string' && ID_RE.test(raw.id) ? { k: 'pet-vote', id: raw.id } : null;
    case 'pet-pick':
      return typeof raw.id === 'string' && ID_RE.test(raw.id) ? { k: 'pet-pick', id: raw.id } : null;
    case 'pet-acc':
      return raw.acc === null || oneOf(ACC_LIST, raw.acc) ? { k: 'pet-acc', acc: raw.acc as PetAccessory | null } : null;
    case 'stats':
      return { k: 'stats' };
    default:
      return null;
  }
}
