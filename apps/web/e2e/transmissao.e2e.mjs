/*
 * Teste de ponta a ponta com o Chrome de verdade:
 *   1. anfitrião cria a sala e transmite uma ABA que toca um tom de 440 Hz;
 *   2. espectador (outro perfil) entra pelo link;
 *   3. confere no espectador: quadros de vídeo decodificados e energia de áudio > 0.
 * Com --ponte, a fonte do som passa a ser a Alexandrus Ponte (precisa dela aberta
 * e de um processo tocando som; o PID vem de --pid).
 *
 *   node apps/web/e2e/transmissao.e2e.mjs                 (som da aba)
 *   node apps/web/e2e/transmissao.e2e.mjs --ponte --pid N (som de um app pela Ponte)
 *   node apps/web/e2e/transmissao.e2e.mjs --varias        (duas pessoas compartilhando ao mesmo tempo)
 *
 * Requer o servidor (8790) e o Vite (5173) rodando.
 */
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const args = process.argv.slice(2);
const usePonte = args.includes('--ponte');
// --janela: "Jogo ou aplicativo" com o som da janela entregue pelo navegador (sem Ponte)
const useWindow = args.includes('--janela');
// --varias: um espectador também compartilha; um terceiro vê as duas telas (abas e lado a lado)
const useMany = args.includes('--varias');
const appName = args.includes('--app') ? args[args.indexOf('--app') + 1] : 'powershell.exe';
const SOURCE_TITLE = 'Fonte de teste Alexandrus';
// a aba que será compartilhada: imagem animada + tom de 440 Hz
const SOURCE_HTML = `<!doctype html><title>${SOURCE_TITLE}</title><body style="margin:0;background:#1a8ae6">
  <canvas id=c width=640 height=360></canvas><script>
  const ctx=c.getContext('2d');let t=0;(function f(){t++;ctx.fillStyle='hsl('+(t%360)+',80%,55%)';ctx.fillRect(0,0,640,360);ctx.fillStyle='#fff';ctx.font='48px sans-serif';ctx.fillText('quadro '+t,40,200);requestAnimationFrame(f)})();
  const a=new AudioContext();const o=a.createOscillator();o.frequency.value=440;const g=a.createGain();g.gain.value=0.2;o.connect(g).connect(a.destination);o.start();
  </script>`;

const log = (...m) => console.log('[e2e]', ...m);
const fail = (m) => {
  console.error('[e2e] FALHOU:', m);
  process.exitCode = 1;
};

// Guarda as RTCPeerConnection da página para ler getStats() de fora.
const SPY = () => {
  const Orig = window.RTCPeerConnection;
  window.__pcs = [];
  window.RTCPeerConnection = function (...a) {
    const pc = new Orig(...a);
    window.__pcs.push(pc);
    return pc;
  };
  window.RTCPeerConnection.prototype = Orig.prototype;
  Object.assign(window.RTCPeerConnection, Orig);
  // --rede-ruim: com window.__fakeLoss definido, o relatório do espectador
  // (remote-inbound-rtp) passa a dizer perda alta e 700 ms de atraso.
  const origGetStats = Orig.prototype.getStats;
  Orig.prototype.getStats = async function (...a) {
    const r = await origGetStats.apply(this, a);
    if (!window.__fakeLoss) return r;
    const m = new Map();
    r.forEach((v, k) => m.set(k, v.type === 'remote-inbound-rtp' && v.kind === 'video' ? { ...v, fractionLost: window.__fakeLoss, roundTripTime: 0.7 } : v));
    return m;
  };
  // diagnóstico: contextos de áudio e bytes binários vindos da Ponte
  const OrigCtx = window.AudioContext;
  window.__ctxs = [];
  window.AudioContext = function (...a) {
    const c = new OrigCtx(...a);
    window.__ctxs.push(c);
    return c;
  };
  window.AudioContext.prototype = OrigCtx.prototype;
  window.__ponteBytes = 0;
  const OrigWS = window.WebSocket;
  window.WebSocket = function (url, p) {
    const ws = new OrigWS(url, p);
    if (String(url).includes('47613')) ws.addEventListener('message', (e) => { if (typeof e.data !== 'string') window.__ponteBytes += e.data.byteLength ?? e.data.size ?? 0; });
    return ws;
  };
  window.WebSocket.prototype = OrigWS.prototype;
  Object.assign(window.WebSocket, OrigWS);
};

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: false,
  args: [
    '--window-position=-2400,0',
    '--window-size=1280,800',
    '--autoplay-policy=no-user-gesture-required',
    // o tom de teste não sai nas caixas de som de quem roda o teste (as estatísticas medem o áudio decodificado)
    '--disable-audio-output',
    '--lang=en-US',
    usePonte
      ? '--auto-select-desktop-capture-source=Entire screen'
      : useWindow
        ? `--auto-select-desktop-capture-source=${SOURCE_TITLE} - Google Chrome`
        : `--auto-select-tab-capture-source-by-title=${SOURCE_TITLE}`,
  ],
});

try {
  /* ---------------- anfitrião ---------------- */
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await hostCtx.addInitScript(SPY);

  if (!usePonte) {
    // a aba que será compartilhada: imagem animada + tom de 440 Hz
    // Com --janela, a fonte fica numa janela só dela (o título da janela é o da aba ativa).
    const src = useWindow ? await (await browser.newContext()).newPage() : await hostCtx.newPage();
    await src.setContent(SOURCE_HTML);
    log('aba de fonte aberta');
  }

  const host = await hostCtx.newPage();
  host.on('pageerror', (e) => log('erro na página do anfitrião:', e.message));
  await host.goto(`${BASE}/criar`);
  await host.getByLabel('Nome da sala').fill('Teste automático');
  await host.getByLabel('Seu nome').fill('Robô');
  await host.getByRole('button', { name: 'Criar sala' }).click();
  await host.waitForURL(/\/sala\/[A-Z0-9]{6}$/);
  const roomUrl = host.url();
  log('sala criada:', roomUrl);

  if (usePonte) {
    await host.getByRole('radio', { name: /Tela inteira/ }).click();
    await host.getByRole('radio', { name: 'Um app' }).click();
    // A Ponte atende uma aba por vez: se outra aba estiver usando, assumir.
    await host.waitForSelector('.ponte-item, button:has-text("Usar nesta aba")', { timeout: 15000 });
    const takeOver = host.getByRole('button', { name: 'Usar nesta aba' });
    if (await takeOver.count()) {
      log('Ponte em uso em outra aba: assumindo');
      await takeOver.click();
    }
    await host.waitForSelector('.ponte-item', { timeout: 10000 });
    const item = host.locator('.ponte-item', { hasText: appName }).first();
    await item.click();
    log('app escolhido na Ponte:', (await item.innerText()).replace(/\s+/g, ' '));
  } else if (useWindow) {
    await host.getByRole('radio', { name: /Jogo ou aplicativo/ }).click();
  } else {
    await host.getByRole('radio', { name: /Aba do navegador/ }).click();
  }
  await host.getByRole('button', { name: 'Iniciar compartilhamento' }).click();
  await host.waitForSelector('.stage', { timeout: 15000 });
  log('anfitrião ao vivo:', (await host.locator('.stage-chip__text').first().innerText()).replace(/\s+/g, ' '));

  /* ---------------- espectador ---------------- */
  const viewCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await viewCtx.addInitScript(SPY);
  const viewer = await viewCtx.newPage();
  viewer.on('pageerror', (e) => log('erro na página do espectador:', e.message));
  await viewer.goto(roomUrl);
  await viewer.waitForFunction(() => window.__pcs?.some((pc) => pc.connectionState === 'connected'), null, { timeout: 20000 });
  log('espectador conectado por WebRTC');

  await viewer.waitForTimeout(4000);
  const stats = await viewer.evaluate(async () => {
    const pc = window.__pcs.find((p) => p.connectionState === 'connected');
    const out = {};
    (await pc.getStats()).forEach((s) => {
      if (s.type === 'inbound-rtp') out[s.kind] = s;
    });
    const v = document.querySelector('video');
    return {
      framesDecoded: out.video?.framesDecoded ?? 0,
      size: `${out.video?.frameWidth}x${out.video?.frameHeight}`,
      fps: out.video?.framesPerSecond,
      audioEnergy: out.audio?.totalAudioEnergy ?? 0,
      audioSamples: out.audio?.totalSamplesReceived ?? 0,
      videoPlaying: v && !v.paused && v.readyState >= 2,
      overlay: document.querySelector('.stage__overlay')?.innerText ?? '',
    };
  });
  log('estatísticas do espectador:', JSON.stringify(stats));

  const hostViewers = await host.locator('.stage-chip__btn').first().innerText();
  log('contador do anfitrião:', hostViewers.replace(/\s+/g, ' '));
  const sent = await host.evaluate(async () => {
    const out = {};
    for (const pc of window.__pcs) {
      (await pc.getStats()).forEach((s) => {
        if (s.type === 'outbound-rtp') out[s.kind] = { bytesSent: s.bytesSent, packets: s.packetsSent };
        if (s.type === 'media-source' && s.kind === 'audio') out.audioLevel = s.audioLevel;
      });
    }
    out.senders = window.__pcs.flatMap((pc) => pc.getSenders().map((s) => s.track && `${s.track.kind}:${s.track.readyState}:${s.track.muted ? 'mudo' : 'som'}:${s.track.enabled ? 'on' : 'off'}`));
    out.ctxs = (window.__ctxs ?? []).map((c) => `${c.state}@${c.sampleRate}`);
    out.ponteBytes = window.__ponteBytes;
    return out;
  });
  log('envio do anfitrião:', JSON.stringify(sent));

  if (args.includes('--rede-ruim')) {
    const encs = () =>
      host.evaluate(() =>
        window.__pcs
          .filter((pc) => pc.connectionState === 'connected')
          .map((pc) => pc.getSenders().find((s) => s.track?.kind === 'video')?.getParameters().encodings?.[0])
          .filter(Boolean)
          .map((e) => ({ maxBitrate: e.maxBitrate, scale: e.scaleResolutionDownBy, fps: e.maxFramerate })),
      );
    const viewerWidth = () =>
      viewer.evaluate(async () => {
        const pc = window.__pcs.find((p) => p.connectionState === 'connected');
        let w = 0;
        (await pc.getStats()).forEach((s) => {
          if (s.type === 'inbound-rtp' && s.kind === 'video') w = s.frameWidth;
        });
        return w;
      });
    log('antes da rede ruim:', JSON.stringify(await encs()), 'largura no espectador:', await viewerWidth());
    await host.evaluate(() => (window.__fakeLoss = 0.35));
    await host.waitForTimeout(6000);
    const after = await encs();
    await viewer.waitForTimeout(2500);
    const wAfter = await viewerWidth();
    log('com 35% de perda e 700 ms:', JSON.stringify(after), 'largura no espectador:', wAfter);
    // os controles somem com o mouse parado: mexer antes de clicar
    await host.mouse.move(640, 400);
    await host.mouse.move(650, 420);
    await host.getByRole('button', { name: 'Conexão' }).click();
    await host.waitForTimeout(2000);
    const adaptText = await host.locator('.host-stats__adapt').first().innerText().catch(() => '(sem aviso)');
    log('painel do anfitrião:', adaptText);
    if (!(after[0]?.maxBitrate < 6_000_000 && after[0]?.scale > 1)) fail('o anfitrião não baixou a qualidade com a rede ruim');
    if (!(wAfter > 0 && wAfter < stats.size.split('x').map(Number)[0] * 0.85)) fail('a resolução no espectador não baixou');
    await host.evaluate(() => (window.__fakeLoss = 0));
  }

  // Tela inteira parada gera poucos quadros (só muda quando a tela muda).
  if (stats.framesDecoded < (usePonte ? 2 : 10)) fail('vídeo não chegou ao espectador');
  if (useWindow) {
    // A seleção automática do Chrome não liga "Compartilhar também o áudio do
    // app" (isso só existe no seletor de verdade). Aqui se confere o vídeo da
    // janela e o aviso honesto de que foi sem som.
    const aviso = await host.locator('.stage-alerts').innerText().catch(() => '');
    log('aviso no anfitrião:', aviso.replace(/\s+/g, ' '));
    if (!aviso.includes('só com imagem')) fail('a sala não avisou que a janela foi sem som');
  } else if (!(stats.audioEnergy > 0)) fail('áudio da fonte não chegou (energia zero)');
  if (!process.exitCode) log('OK: vídeo e áudio da fonte chegaram ao espectador.');

  if (useMany) {
    // quadros decodificados por conexão de chegada (uma por tela recebida)
    const inbound = (page) =>
      page.evaluate(async () => {
        const out = [];
        for (const pc of window.__pcs) {
          if (pc.connectionState !== 'connected') continue;
          let frames = 0;
          let energy = 0;
          (await pc.getStats()).forEach((s) => {
            if (s.type === 'inbound-rtp' && s.kind === 'video') frames = s.framesDecoded;
            if (s.type === 'inbound-rtp' && s.kind === 'audio') energy = s.totalAudioEnergy ?? 0;
          });
          if (frames) out.push({ frames, energy });
        }
        return out;
      });
    const wake = async (page) => {
      await page.mouse.move(600, 380);
      await page.mouse.move(640, 400);
    };

    /* o espectador compartilha a própria tela */
    await (await viewCtx.newPage()).setContent(SOURCE_HTML);
    await viewer.bringToFront();
    await wake(viewer);
    await viewer.getByRole('button', { name: 'Compartilhar tela' }).click();
    await viewer.getByRole('radio', { name: /Aba do navegador/ }).click();
    await viewer.getByRole('button', { name: 'Compartilhar', exact: true }).click();
    await viewer.waitForSelector('.stream-tab', { timeout: 15000 });
    log('espectador também ao vivo; abas:', (await viewer.locator('.stream-tabs').innerText()).replace(/\s+/g, ' '));

    /* o anfitrião vê a nova tela */
    await host.waitForSelector('.stream-tab', { timeout: 15000 });
    log('abas no anfitrião:', (await host.locator('.stream-tabs').innerText()).replace(/\s+/g, ' '));

    /* um terceiro entra e vê as duas */
    const thirdCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await thirdCtx.addInitScript(SPY);
    await thirdCtx.addInitScript(() => localStorage.setItem('alexandrus:name', 'Terceiro'));
    const third = await thirdCtx.newPage();
    third.on('pageerror', (e) => log('erro na página do terceiro:', e.message));
    await third.goto(roomUrl);
    await third.waitForSelector('.stream-tab', { timeout: 20000 });
    const tabs = (await third.locator('.stream-tab').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    log('abas no terceiro:', JSON.stringify(tabs));
    if (tabs.length !== 3) fail(`o terceiro devia ver 2 telas + "Lado a lado", viu ${tabs.length} abas`);
    await third.waitForFunction(() => window.__pcs?.some((pc) => pc.connectionState === 'connected'), null, { timeout: 20000 });
    await third.waitForTimeout(3000);
    const focoA = await inbound(third);
    log('terceiro, foco na primeira tela:', JSON.stringify(focoA));
    if (focoA.length !== 1 || focoA[0].frames < 10) fail('no modo foco o terceiro devia receber exatamente uma tela com vídeo');

    /* troca para a outra tela pela aba */
    await wake(third);
    const otherTab = third.locator('.stream-tab:not([aria-pressed="true"]):not(.stream-tab--grid)').first();
    const otherName = (await otherTab.innerText()).trim();
    await otherTab.click();
    await third.waitForTimeout(5000);
    const focoB = await inbound(third);
    log(`terceiro, foco em "${otherName}":`, JSON.stringify(focoB));
    if (focoB.length !== 1 || focoB[0].frames < 10) fail('ao trocar de aba o terceiro devia receber só a outra tela');
    await wake(third);
    await third.screenshot({ path: fileURLToPath(new URL('./saida/terceiro-abas.png', import.meta.url)) });

    /* lado a lado: as duas ao mesmo tempo */
    await wake(third);
    await third.getByRole('button', { name: 'Lado a lado' }).click();
    await third.waitForTimeout(5000);
    const grade = await inbound(third);
    const tiles = await third.evaluate(() =>
      [...document.querySelectorAll('.stage-tile__video')].map((v) => ({ playing: !v.paused && v.readyState >= 2, w: v.videoWidth, muted: v.muted })),
    );
    log('terceiro, lado a lado:', JSON.stringify(grade), 'vídeos:', JSON.stringify(tiles));
    if (grade.length !== 2 || grade.some((g) => g.frames < 10)) fail('no lado a lado o terceiro devia receber as duas telas');
    if (tiles.length !== 2 || tiles.some((t) => !t.playing)) fail('as duas telas deviam estar tocando lado a lado');
    if (tiles.filter((t) => !t.muted).length !== 1) fail('no lado a lado só uma tela deve tocar som');
    await third.screenshot({ path: fileURLToPath(new URL('./saida/terceiro.png', import.meta.url)) });

    /* o anfitrião desliga "Todos podem compartilhar": a tela do espectador cai */
    await wake(host);
    await host.getByRole('button', { name: 'Pessoas', exact: true }).click();
    await host.getByRole('switch', { name: 'Todos podem compartilhar a tela' }).click();
    await viewer.waitForSelector('.stream-tab', { state: 'detached', timeout: 10000 });
    await third.waitForSelector('.stream-tab', { state: 'detached', timeout: 10000 });
    const avisoEspectador = await viewer.locator('.stage-alerts').innerText().catch(() => '');
    log('aviso no espectador:', avisoEspectador.replace(/\s+/g, ' '));
    if (!avisoEspectador.includes('desligou o compartilhamento')) fail('o espectador não foi avisado que a tela dele caiu');
    const temBotao = await viewer.getByRole('button', { name: 'Compartilhar tela' }).count();
    if (temBotao) fail('com o compartilhamento desligado, o espectador não devia ver "Compartilhar tela"');
    if (!process.exitCode) log('OK: duas telas ao mesmo tempo, troca por aba, lado a lado e bloqueio pelo anfitrião.');
  }

  await host.screenshot({ path: fileURLToPath(new URL('./saida/anfitriao.png', import.meta.url)) });
  await viewer.screenshot({ path: fileURLToPath(new URL('./saida/espectador.png', import.meta.url)) });
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
}
