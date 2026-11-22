/*
 * O que este navegador e este computador conseguem fazer — medido, não suposto.
 */

export interface BrowserInfo {
  name: 'Chrome' | 'Edge' | 'Opera' | 'Firefox' | 'Safari' | 'Outro';
  major: number | null;
  chromium: boolean;
  mobile: boolean;
  os: 'Windows 11' | 'Windows 10' | 'Windows' | 'macOS' | 'Android' | 'iOS' | 'Linux' | 'Outro';
}

interface UAData {
  brands: { brand: string; version: string }[];
  mobile: boolean;
  platform: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ platformVersion?: string }>;
}

export async function detectBrowser(): Promise<BrowserInfo> {
  const ua = navigator.userAgent;
  const data = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  let name: BrowserInfo['name'] = 'Outro';
  let major: number | null = null;
  let chromium = false;
  let mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  let os: BrowserInfo['os'] = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Outro';

  if (data) {
    mobile = data.mobile;
    chromium = data.brands.some((b) => b.brand === 'Chromium');
    const pick = (brand: string) => data.brands.find((b) => b.brand === brand);
    const edge = pick('Microsoft Edge');
    const chrome = pick('Google Chrome');
    const opera = pick('Opera');
    const hit = edge ?? chrome ?? opera ?? pick('Chromium');
    name = edge ? 'Edge' : chrome ? 'Chrome' : opera ? 'Opera' : 'Outro';
    major = hit ? Number.parseInt(hit.version, 10) : null;
    if (data.platform === 'Windows' && data.getHighEntropyValues) {
      try {
        const { platformVersion } = await data.getHighEntropyValues(['platformVersion']);
        const v = Number.parseInt(platformVersion ?? '0', 10);
        // Convenção documentada pela Microsoft: platformVersion >= 13 é Windows 11.
        os = v >= 13 ? 'Windows 11' : v > 0 ? 'Windows 10' : 'Windows';
      } catch {
        os = 'Windows';
      }
    }
  } else {
    const ff = ua.match(/Firefox\/(\d+)/);
    const sf = ua.match(/Version\/(\d+).*Safari/);
    if (ff) {
      name = 'Firefox';
      major = Number(ff[1]);
    } else if (sf) {
      name = 'Safari';
      major = Number(sf[1]);
    }
  }
  return { name, major, chromium, mobile, os };
}

export function canCaptureScreen() {
  return typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

export function canWebRTC() {
  return typeof window.RTCPeerConnection === 'function';
}

export function canAudioWorklet() {
  return typeof window.AudioWorkletNode === 'function';
}

/** Chrome/Edge em computador: a plataforma principal para transmitir. */
export function isPreferredHostBrowser(b: BrowserInfo) {
  return (b.name === 'Chrome' || b.name === 'Edge') && !b.mobile;
}
