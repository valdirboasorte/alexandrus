/*
 * Playground de ponta a ponta, com o Chrome de verdade e três pessoas:
 *   anfitrião transmitindo uma aba (vídeo + som), Bia e Caio assistindo, cada
 *   um no seu perfil (identidades diferentes no Playground).
 * Confere pela interface: reação que chega aos outros, traço no quadro que
 * aparece na tela do outro e some no "Desfazer", votação com o voto contado,
 * comida no aquário, mascote, roleta da sala — e que o vídeo continua
 * fluindo com o painel aberto.
 *
 *   node apps/web/e2e/playground.e2e.mjs
 *
 * Requer o servidor (8790) e o Vite (5173) rodando.
 */
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SOURCE_TITLE = 'Fonte de teste Alexandrus';
const SOURCE_HTML = `<!doctype html><title>${SOURCE_TITLE}</title><body style="margin:0;background:#1a8ae6">
  <canvas id=c width=640 height=360></canvas><script>
  const ctx=c.getContext('2d');let t=0;(function f(){t++;ctx.fillStyle='hsl('+(t%360)+',80%,55%)';ctx.fillRect(0,0,640,360);ctx.fillStyle='#fff';ctx.font='48px sans-serif';ctx.fillText('quadro '+t,40,200);requestAnimationFrame(f)})();
  const a=new AudioContext();const o=a.createOscillator();o.frequency.value=440;const g=a.createGain();g.gain.value=0.2;o.connect(g).connect(a.destination);o.start();
  </script>`;

const log = (...m) => console.log('[pg-e2e]', ...m);
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${extra}`}`);
  if (!ok) failed++;
};
const within = async (fn, ms = 8000) => {
  try {
    await fn(ms);
    return true;
  } catch {
    return false;
  }
};

/** Quadros de vídeo apresentados em `ms` (requestVideoFrameCallback). */
const videoFps = (page, ms = 3000) =>
  page.evaluate(
    (ms) =>
      new Promise((res) => {
        const v = [...document.querySelectorAll('video')].find((x) => !x.paused && x.readyState >= 2);
        if (!v) return res(0);
        let n = 0;
        const tick = () => {
          n++;
          v.requestVideoFrameCallback(tick);
        };
        v.requestVideoFrameCallback(tick);
        setTimeout(() => res(Math.round((n / ms) * 1000)), ms);
      }),
    ms,
  );

/** O canvas do quadro tem tinta? (soma do alfa) */
const inkOf = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('.pg-paint__canvas');
    if (!c) return -1;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 3; i < d.length; i += 4) s += d[i];
    return s;
  });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: false,
  args: ['--window-position=-2400,0', '--window-size=1280,800', '--autoplay-policy=no-user-gesture-required', '--disable-audio-output', '--lang=en-US', `--auto-select-tab-capture-source-by-title=${SOURCE_TITLE}`],
});

const person = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
  await ctx.addInitScript((n) => {
    try {
      localStorage.setItem('alexandrus:name', n);
      localStorage.setItem('alexandrus:radio:off', '1');
    } catch {}
  }, name);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`erro na página de ${name}:`, e.message));
  page.on('console', (m) => m.type() === 'error' && log(`console de ${name}:`, m.text()));
  return page;
};

/** Os controles do palco somem com o mouse parado: mexe antes de clicar no dock. */
const wake = async (page) => {
  await page.mouse.move(300, 300);
  await page.mouse.move(320, 330, { steps: 3 });
};

const openPlace = async (page, tag) => {
  await page.locator(`.pg-dock__btn[title="${tag}"]`).click();
};

try {
  /* ---------------- anfitrião transmitindo ---------------- */
  const host = await person('Ana');
  const src = await host.context().newPage();
  await src.setContent(SOURCE_HTML);
  await host.bringToFront();
  await host.goto(`${BASE}/criar`);
  await host.getByLabel('Nome da sala').fill('Playground automático');
  await host.getByLabel('Seu nome').fill('Ana');
  await host.getByRole('button', { name: 'Criar sala' }).click();
  await host.waitForURL(/\/sala\/[A-Z0-9]{6}$/);
  const roomUrl = host.url();
  await host.getByRole('radio', { name: /Aba do navegador/ }).click();
  await host.getByRole('button', { name: 'Iniciar compartilhamento' }).click();
  await host.waitForSelector('.stage', { timeout: 15000 });
  log('sala ao vivo:', roomUrl);

  const bia = await person('Bia');
  const caio = await person('Caio');
  for (const p of [bia, caio]) {
    await p.goto(roomUrl);
    await p.waitForFunction(() => [...document.querySelectorAll('video')].some((v) => !v.paused && v.readyState >= 2), null, { timeout: 20000 });
  }
  log('Bia e Caio assistindo');

  /* ---------------- painel abre sem parar o vídeo ---------------- */
  const fpsBefore = await videoFps(bia);
  await wake(bia);
  await bia.getByRole('button', { name: /Playground/ }).click();
  await bia.waitForSelector('.pg-world', { timeout: 8000 });
  check('painel abre no mapa do mundo', true);
  await openPlace(bia, 'Aquário da sala');
  await bia.waitForSelector('.pg-aqua__canvas');
  await bia.waitForTimeout(800);
  const fpsAfter = await videoFps(bia);
  log(`vídeo na Bia: ${fpsBefore} fps sem painel, ${fpsAfter} fps com o aquário aberto`);
  check('vídeo continua fluindo com o aquário aberto', fpsAfter >= Math.min(24, fpsBefore * 0.7), `${fpsBefore} -> ${fpsAfter}`);
  const stillPlaying = await bia.evaluate(() => [...document.querySelectorAll('video')].some((v) => !v.paused));
  check('o vídeo não foi recriado nem pausado', stillPlaying);

  /* ---------------- reação ---------------- */
  await wake(caio);
  await caio.getByRole('button', { name: 'Reagir' }).click();
  await caio.getByRole('button', { name: 'Coração' }).click();
  check(
    'reação do Caio aparece para a Bia e para o anfitrião',
    (await within((t) => bia.locator('.pg-float', { hasText: 'Caio' }).first().waitFor({ timeout: t }))) &&
      (await within((t) => host.locator('.pg-float', { hasText: 'Caio' }).first().waitFor({ timeout: t }))),
  );
  check('quem reagiu vê "você"', await within((t) => caio.locator('.pg-float', { hasText: 'você' }).first().waitFor({ timeout: t })));

  /* ---------------- aquário: comida ---------------- */
  const fedBefore = await bia.locator('.pg-aqua .pg-hint').last().innerText();
  const tank = bia.locator('.pg-aqua__canvas');
  const box = await tank.boundingBox();
  await bia.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.12);
  await bia.waitForTimeout(900);
  const fedAfter = await bia.locator('.pg-aqua .pg-hint').last().innerText();
  check('comida jogada conta para a sala', fedBefore !== fedAfter, `${fedBefore} | ${fedAfter}`);

  /* ---------------- quadro compartilhado ---------------- */
  await openPlace(bia, 'Quadro coletivo');
  await wake(caio);
  await caio.getByRole('button', { name: /Playground/ }).click();
  await caio.waitForSelector('.pg-world');
  await openPlace(caio, 'Quadro coletivo');
  await bia.waitForSelector('.pg-paint__canvas');
  await caio.waitForSelector('.pg-paint__canvas');
  await caio.waitForTimeout(600);
  const empty = await inkOf(caio);
  const pb = await bia.locator('.pg-paint__canvas').boundingBox();
  await bia.mouse.move(pb.x + pb.width * 0.2, pb.y + pb.height * 0.3);
  await bia.mouse.down();
  for (let i = 0; i <= 20; i++) await bia.mouse.move(pb.x + pb.width * (0.2 + i * 0.03), pb.y + pb.height * (0.3 + Math.sin(i / 3) * 0.2), { steps: 2 });
  await bia.mouse.up();
  const drawn = await within(async (t) => caio.waitForFunction(() => {
    const c = document.querySelector('.pg-paint__canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  }, null, { timeout: t }));
  check('traço da Bia aparece no quadro do Caio', drawn && empty === 0, `antes=${empty}`);
  await bia.getByRole('button', { name: 'Desfazer' }).click();
  const undone = await within(async (t) => caio.waitForFunction(() => {
    const c = document.querySelector('.pg-paint__canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return false;
    return true;
  }, null, { timeout: t }));
  check('"Desfazer" da Bia apaga o traço no quadro do Caio', undone, String(await inkOf(caio)));

  /* ---------------- votação ---------------- */
  await openPlace(caio, 'Votações');
  await caio.getByPlaceholder('O que a sala decide?').fill('Qual fase agora?');
  await caio.getByLabel('Opção 1').fill('Gelo');
  await caio.getByLabel('Opção 2').fill('Fogo');
  await caio.getByRole('button', { name: 'Criar votação' }).click();
  const chip = bia.locator('.pg-pollchip');
  check('votação nova aparece no palco da Bia', await within((t) => chip.waitFor({ timeout: t })));
  await wake(bia);
  await chip.click();
  await bia.locator('.pg-poll-bar', { hasText: 'Fogo' }).click();
  check(
    'voto da Bia chega ao Caio em tempo real',
    await within((t) => caio.locator('.pg-poll-bar', { hasText: 'Fogo' }).filter({ hasText: '1 voto' }).waitFor({ timeout: t })),
  );
  await bia.locator('.pg-poll-bar', { hasText: 'Fogo' }).click();
  await bia.waitForTimeout(600);
  const total = await caio.locator('.pg-poll-bar', { hasText: 'Fogo' }).innerText();
  check('votar de novo na mesma opção não conta duas vezes', /1 voto/.test(total), total);

  /* ---------------- mascote ---------------- */
  await openPlace(bia, 'Mascote da sala');
  await bia.getByRole('button', { name: 'Dar comida' }).click();
  check('Caio vê a reação do mascote ao gesto da Bia', await (async () => {
    await openPlace(caio, 'Mascote da sala');
    return within((t) => caio.locator('.pg-nest__id', { hasText: 'comendo' }).waitFor({ timeout: t }), 4000);
  })());

  /* ---------------- roleta da sala ---------------- */
  await openPlace(bia, 'Sorteios e desafios');
  await bia.getByRole('button', { name: /Girar para a sala/ }).click();
  check('roleta da Bia aparece no palco do anfitrião', await within((t) => host.locator('.pg-spincard').waitFor({ timeout: t })));
  const result = await within((t) => host.locator('.pg-spincard__result').filter({ hasNotText: 'Girando' }).waitFor({ timeout: t }), 9000);
  check('a roleta para num resultado', result, await host.locator('.pg-spincard__result').innerText().catch(() => '?'));

  /* ---------------- o vídeo ainda está lá ---------------- */
  const fpsEnd = await videoFps(bia);
  check('vídeo segue fluindo no fim', fpsEnd >= Math.min(24, fpsBefore * 0.7), `${fpsEnd} fps`);
  await bia.screenshot({ path: 'apps/web/e2e/saida/playground-bia.png' });
  await host.screenshot({ path: 'apps/web/e2e/saida/playground-anfitriao.png' });
} catch (e) {
  failed++;
  console.error('[pg-e2e] erro:', e);
} finally {
  await browser.close();
}
log(failed ? `${failed} falha(s)` : 'tudo certo');
process.exit(failed ? 1 : 0);
