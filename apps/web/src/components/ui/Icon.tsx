import type { SVGProps } from 'react';

/**
 * Ícones de linha, traço arredondado, 24×24. Desenhados para o Alexandrus.
 * Cor herdada de `currentColor`.
 */
const PATHS = {
  home: 'M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.4 9.2a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 4M12 17.4h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.6h.01',
  plus: 'M12 5v14M5 12h14',
  arrowRight: 'M5 12h13M13 6l6 6-6 6',
  arrowLeft: 'M19 12H6M11 6l-6 6 6 6',
  chevronRight: 'm9 5 7 7-7 7',
  chevronDown: 'm5 9 7 7 7-7',
  monitor: 'M3.5 5.5A1.5 1.5 0 0 1 5 4h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 16H5a1.5 1.5 0 0 1-1.5-1.5v-9ZM9 20h6M12 16v4',
  window: 'M3.5 6A1.5 1.5 0 0 1 5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6ZM3.5 9h17M6.5 6.8h.01M9 6.8h.01',
  tab: 'M3.5 9.5V18A1.5 1.5 0 0 0 5 19.5h14a1.5 1.5 0 0 0 1.5-1.5V9.5M3.5 9.5V6A1.5 1.5 0 0 1 5 4.5h5l2 3h7a1.5 1.5 0 0 1 1.5 1.5v.5M3.5 9.5h17',
  gamepad: 'M7.5 8h9a4.5 4.5 0 0 1 4.4 5.5l-.8 3.5a2.2 2.2 0 0 1-3.8.9L14.5 16h-5l-1.8 1.9a2.2 2.2 0 0 1-3.8-.9l-.8-3.5A4.5 4.5 0 0 1 7.5 8ZM8 11v3M6.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z',
  copy: 'M9 9.5A1.5 1.5 0 0 1 10.5 8h8A1.5 1.5 0 0 1 20 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 9 18.5v-9ZM15 8V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H9',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2',
  volume: 'M4 9.5v5h3.5L12 19V5L7.5 9.5H4ZM15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.4a8 8 0 0 1 0 11.2',
  volumeOff: 'M4 9.5v5h3.5L12 19V5L7.5 9.5H4ZM16 9.5l5 5M21 9.5l-5 5',
  maximize: 'M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15',
  minimize: 'M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20',
  stop: 'M7 5.5h10A1.5 1.5 0 0 1 18.5 7v10a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 17V7A1.5 1.5 0 0 1 7 5.5Z',
  power: 'M12 3.5v8M7 6.3a7.5 7.5 0 1 0 10 0',
  exit: 'M14 4.5h4A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16.5 5.5 12 10 7.5M5.5 12H15',
  signal: 'M4 20v-3M9 20v-7M14 20V9M19 20V4',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5',
  x: 'M6 6l12 12M18 6 6 18',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  mic: 'M12 14.5a3 3 0 0 0 3-3v-5a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3ZM6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3.5',
  micOff: 'M15 10.5V6.5a3 3 0 0 0-5.7-1.3M9 9v2.5a3 3 0 0 0 4.6 2.5M6.5 11.5a5.5 5.5 0 0 0 9.1 4.2M17.5 11.5a5.5 5.5 0 0 1-.4 2M12 17v3.5M4 4l16 16',
  headphones: 'M4 15.5V13a8 8 0 0 1 16 0v2.5M4 15.5A1.5 1.5 0 0 1 5.5 14H7v6H5.5A1.5 1.5 0 0 1 4 18.5v-3ZM20 15.5a1.5 1.5 0 0 0-1.5-1.5H17v6h1.5a1.5 1.5 0 0 0 1.5-1.5v-3Z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9.5h17M3.5 14.5h17M12 3c-2.5 2.7-3.5 5.7-3.5 9s1 6.3 3.5 9M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9',
  lock: 'M6.5 10.5h11A1.5 1.5 0 0 1 19 12v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5ZM8 10.5V8a4 4 0 0 1 8 0v2.5',
  alert: 'M12 4 2.8 19.5h18.4L12 4ZM12 10v4.5M12 17h.01',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 19.5h14',
  play: 'M8 5.5v13l10.5-6.5L8 5.5Z',
  ticket: 'M4 8V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V8a2.5 2.5 0 0 0 0 5v4.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5V13a2.5 2.5 0 0 0 0-5ZM14.5 5v14',
  wave: 'M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2',
  bridge: 'M3 16h18M5 16V11M19 16v-5M3 11c3-4 6-5.5 9-5.5s6 1.5 9 5.5M9 16v-4M15 16v-4',
  sparkle: 'M12 3.5 13.8 9 19.5 10.5 13.8 12 12 17.5 10.2 12 4.5 10.5 10.2 9 12 3.5ZM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  grid: 'M4.5 4.5h6v6h-6v-6ZM13.5 4.5h6v6h-6v-6ZM4.5 13.5h6v6h-6v-6ZM13.5 13.5h6v6h-6v-6Z',
  music: 'M9 18V5.5l11-2V16M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  pause: 'M8 5.5v13M16 5.5v13',
  next: 'M6 5.5v13l9-6.5-9-6.5ZM18 5.5v13',
  prev: 'M18 5.5v13l-9-6.5 9-6.5ZM6 5.5v13',
  list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Rótulo para leitores de tela. Sem rótulo, o ícone é decorativo. */
  label?: string;
}

export function Icon({ name, label, className, strokeWidth = 2, ...rest }: IconProps) {
  const filled = name === 'play';
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
