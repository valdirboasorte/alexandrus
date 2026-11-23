/**
 * Rádio do site: o mix "nintendo frutiger aero chill mix 2025", do canal
 * ninchrisu, tocado pelo player oficial do YouTube (nada é baixado nem
 * hospedado aqui). As faixas e os tempos vêm da descrição do vídeo.
 */

export const RADIO = {
  videoId: 'v3gOQbh32Pg',
  title: 'nintendo frutiger aero chill mix 2025',
  channel: 'ninchrisu',
  channelUrl: 'https://www.youtube.com/@ninchrisu',
  /** Duração do vídeo em segundos. */
  length: 8019,
} as const;

export interface RadioTrack {
  /** Início, em segundos. */
  at: number;
  title: string;
  from: string;
}

const RAW: [number, string, string][] = [
  [0, "editing a mii", "nintendo wii u"],
  [153, "tennis result", "wii sports"],
  [237, "submission plaza", "check mii out channel"],
  [419, "slideshow (daytime)", "wii news channel"],
  [649, "golf results", "wii sports"],
  [784, "main menu", "wii party"],
  [936, "credits", "wii fit"],
  [1067, "january 2014", "nintendo eshop"],
  [1237, "november 2012", "nintendo eshop"],
  [1518, "parental controls", "nintendo wii u"],
  [1744, "january 2015", "nintendo eshop"],
  [1927, "amiibo settings", "nintendo 3ds"],
  [2025, "shop theme", "nintendo dsi"],
  [2139, "lobby", "wii u chat"],
  [2286, "slideshow memories", "nintendo dsi camera"],
  [2464, "transferring data", "wii u"],
  [2709, "the homebrew channel", "wii"],
  [2865, "tilt city", "wii fit plus"],
  [3033, "bowling results", "wii sports"],
  [3297, "yoga", "wii fit"],
  [3495, "puzzle", "photo channel"],
  [3713, "album", "nintendo 3ds camera"],
  [3950, "downloading the latest news", "wii news channel"],
  [4073, "voter data", "everybody votes channel"],
  [4225, "friend list", "nintendo wii u"],
  [4377, "home menu", "nintendo 3ds"],
  [4506, "july 2014", "nintendo eshop"],
  [4830, "news articles", "wii news channel"],
  [5057, "local forecast (night)", "wii forecast channel"],
  [5208, "june 2011", "nintendo eshop"],
  [5330, "local forecast (daytime)", "wii forecast channel"],
  [5474, "main menu", "nintendo dsi"],
  [5594, "september 2015", "nintendo eshop"],
  [5838, "sd card gallery", "photo channel"],
  [5992, "theme shop", "nintendo 3ds"],
  [6152, "friend list", "nintendo 3ds"],
  [6240, "mii maker", "nintendo 3ds"],
  [6381, "intro & menu", "nintendo channel"],
  [6521, "nighttime (globe)", "nintendo wii"],
  [6854, "purchase software music", "nintendo eshop"],
  [6991, "september 2013", "nintendo eshop"],
  [7130, "video", "nintendo 3ds"],
  [7250, "initial setup", "nintendo 3ds"],
  [7378, "wifi menu", "mario kart wii"],
  [7532, "downloading latest news (tip cat)", "wii news channel"],
  [7659, "main theme", "news channel"],
  [7882, "main theme", "wii sports resort"],
];

export const RADIO_TRACKS: RadioTrack[] = RAW.map(([at, title, from]) => ({ at, title, from }));

/** Índice da faixa tocando no segundo t. */
export function trackAt(t: number): number {
  let i = 0;
  for (let k = 0; k < RADIO_TRACKS.length; k++) if (RADIO_TRACKS[k].at <= t + 0.5) i = k;
  return i;
}
