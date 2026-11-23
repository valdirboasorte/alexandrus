import { createContext, useContext } from 'react';
import type { PeerInfo, RoomSummary } from '@protocol';
import type { OrbTone, GlyphName } from './art.tsx';
import type { PlaygroundStore } from './store.ts';

export type PlaceId = 'world' | 'aqua' | 'bubbles' | 'paint' | 'wheel' | 'sounds' | 'toys' | 'poll' | 'stage' | 'stats' | 'pet' | 'settings';

export interface Place {
  id: Exclude<PlaceId, 'world'>;
  name: string;
  /** O que é, em poucas palavras (aparece no mapa e no cabeçalho). */
  tag: string;
  glyph: GlyphName;
  tone: OrbTone;
}

/** Os lugares do mundo, na ordem do dock. */
export const PLACES: Place[] = [
  { id: 'aqua', name: 'Lagoa Aqua', tag: 'Aquário da sala', glyph: 'fish', tone: 'aqua' },
  { id: 'bubbles', name: 'Bolhas', tag: 'Estoure e pontue', glyph: 'bubbles', tone: 'sky' },
  { id: 'paint', name: 'Ateliê', tag: 'Quadro coletivo', glyph: 'brush', tone: 'pink' },
  { id: 'wheel', name: 'Roda da Sorte', tag: 'Sorteios e desafios', glyph: 'wheel', tone: 'gold' },
  { id: 'sounds', name: 'Concha Sonora', tag: 'Sons para a sala', glyph: 'shell', tone: 'violet' },
  { id: 'toys', name: 'Nuvens', tag: 'Brinquedos do céu', glyph: 'cloud', tone: 'teal' },
  { id: 'poll', name: 'Praça', tag: 'Votações', glyph: 'poll', tone: 'green' },
  { id: 'stage', name: 'Palco', tag: 'Fale com quem transmite', glyph: 'stage', tone: 'orange' },
  { id: 'stats', name: 'Farol', tag: 'Números da sala', glyph: 'lighthouse', tone: 'coral' },
  { id: 'pet', name: 'Ninho', tag: 'Mascote da sala', glyph: 'drop', tone: 'lime' },
];

export const placeById = (id: PlaceId) => PLACES.find((p) => p.id === id);

export interface PgEnv {
  store: PlaygroundStore;
  isHost: boolean;
  myName: string;
  /** Os outros participantes (ids de conexão). */
  people: PeerInfo[];
  room: RoomSummary;
  /** A minha transmissão capta o som desta aba: efeitos sonoros ficam mudos aqui. */
  leak: boolean;
  go: (p: PlaceId) => void;
  /** O lugar que está na tela agora (com o painel aberto). */
  current: PlaceId | null;
}

export const PgEnvContext = createContext<PgEnv | null>(null);

export function usePgEnv(): PgEnv {
  const env = useContext(PgEnvContext);
  if (!env) throw new Error('usePgEnv fora do Playground');
  return env;
}
