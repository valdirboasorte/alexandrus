# Alexandrus — arquitetura

Alexandrus transmite a tela (ou uma janela, uma aba, um jogo) para outras pessoas
em tempo real, levando junto **só o som da fonte**. A voz continua no Discord.
Este documento explica o que cada parte faz, por que foi escolhida e onde estão
os limites reais de cada método.

```
┌───────────────────────────── PC do anfitrião (Windows) ─────────────────────────────┐
│                                                                                     │
│  Jogo.exe ──(áudio)──┐                          Discord.exe (voz)  ✗ não capturado   │
│      │               │ WASAPI process loopback                                      │
│      │ (imagem)      ▼                                                              │
│      │        Alexandrus Ponte  ── ws://127.0.0.1:47613 (PCM 48 kHz s16) ──┐        │
│      ▼                                                                  │          │
│  getDisplayMedia (Chrome/Edge) ── vídeo ──► Alexandrus (navegador) ◄─────┘          │
│                                                │ AudioWorklet → faixa de áudio      │
└────────────────────────────────────────────────┼────────────────────────────────────┘
                                                 │ WebRTC (vídeo + áudio, DTLS-SRTP)
                     sinalização (WebSocket /ws) │ uma conexão por espectador (malha)
┌────────────────────┐                           ▼
│ Servidor Alexandrus│◄────────────── Navegador do espectador (PC, tablet, celular)
│ salas, ofertas/ICE,│
│ STUN/TURN, estático│
└────────────────────┘
```

## Partes

| Parte | Onde | Tecnologia | Papel |
| --- | --- | --- | --- |
| Web | `apps/web` | Vite, React 19, TypeScript, CSS próprio | Interface, captura (`getDisplayMedia`), WebRTC, player |
| Servidor | `apps/server` | Node 24 (TypeScript sem build), `ws` | Salas, sinalização, credenciais STUN/TURN, arquivos estáticos |
| Protocolo | `packages/protocol` | TypeScript puro | Tipos e regras compartilhados (mensagens, códigos de sala, limites) |
| Ponte | `native/ponte` | C# (.NET Framework 4.8, já presente no Windows), WASAPI | Captura o áudio de **um processo** e entrega ao navegador |

### Por que estas escolhas

- **Navegador como cliente principal.** Chrome e Edge no Windows já têm captura de
  tela com aceleração (Windows Graphics Capture), codificação por hardware e
  WebRTC maduro. Quem assiste não instala nada, inclusive no celular.
- **React + CSS próprio, sem framework de UI.** A identidade Frutiger Aero vive de
  gradientes, vidro, reflexos e camadas; bibliotecas de componentes trazem uma
  estética pronta que teríamos que desfazer. Rotas com `react-router`.
- **Node com TypeScript nativo.** O servidor é pequeno e de I/O; rodar `.ts` direto
  no Node 24 elimina etapa de build e compartilha o protocolo com o navegador.
- **Ponte em C#/.NET Framework.** O .NET Framework 4.8 vem com o Windows 10/11, então
  a ponte é um `.exe` de poucos KB sem instalador nem runtime extra. A API que
  importa (process loopback) é COM puro; não precisa de Electron nem Rust.
- **Malha (mesh) antes de SFU.** Para o caso de uso (amigos numa call) a malha é
  a menor latência possível e não exige servidor de mídia. O custo é o upload do
  anfitrião: cada espectador recebe uma cópia. Limite padrão: 12 espectadores.

## Áudio — o problema central

Objetivo: o espectador ouve o jogo pelo Alexandrus e a voz pelo Discord, sem ouvir
a própria voz de volta e sem som duplicado. Para isso o Alexandrus **não pode
capturar a saída inteira do Windows** (que contém a call do Discord).

### O que cada método entrega de verdade

| Método | Vídeo | Áudio | Isolado do Discord? | Requisito |
| --- | --- | --- | --- | --- |
| Aba do navegador | aba | som da aba | **Sim** | Chrome/Edge |
| Janela (navegador) | janela | som da janela, quando o navegador oferece (`windowAudio`, Chrome 141+) | Sim, quando há faixa de áudio | Chrome/Edge recentes; o Alexandrus verifica se a faixa veio |
| Tela inteira (navegador) | monitor | som do **sistema inteiro** | **Não** — inclui a call | Chrome/Edge; o Alexandrus avisa e deixa desligado por padrão |
| Jogo/app com a Ponte | janela ou monitor (navegador) | som **de um processo** (WASAPI process loopback) | **Sim** | Windows 10 2004+ / 11 e a Ponte aberta |
| Tudo menos o Discord (Ponte) | qualquer | sistema inteiro **exceto** a árvore de processos escolhida | Sim | Windows 10 2004+ / 11 e a Ponte aberta |

Regras que o Alexandrus segue:

1. **Microfone nunca é capturado.** Nenhuma chamada a `getUserMedia` existe no projeto.
2. **"Áudio da fonte" é um interruptor real**: desligar põe a faixa em
   `enabled = false`, o que faz o WebRTC enviar silêncio imediatamente.
3. **O rótulo diz a verdade.** Depois da captura, o Alexandrus lê
   `track.getSettings().displaySurface` e quantas faixas de áudio vieram, e só então
   decide o rótulo (`tab`, `window`, `system`, `process`…). Se o navegador não
   entregou áudio, a interface diz isso e sugere a Ponte.
4. **Áudio do sistema inteiro é opt-in e vem com aviso** de eco.
5. **Processamento de voz desligado** na faixa de áudio da fonte
   (`echoCancellation`, `noiseSuppression`, `autoGainControl` = false) e Opus estéreo
   a 128–192 kbps: é música e efeito de jogo, não voz.

### Por que existe uma Ponte

O navegador não expõe "capturar o áudio do processo X". A API do Windows que faz
isso é o **WASAPI application loopback** (`ActivateAudioInterfaceAsync` com
`VAD\Process_Loopback` e `PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE`, ou
`EXCLUDE_…` para "tudo menos X"). A mesma API é usada pelo OBS na fonte "Captura
de áudio de aplicativo".

- A Microsoft documenta o recurso a partir do build 20348; o OBS o usa desde o
  Windows 10 2004 (build 19041). A Ponte testa a ativação em tempo de execução e
  informa falha com o código de erro, em vez de supor.
- Só funciona para processos que tocam som pelo mecanismo de áudio do Windows.
  Fluxos em modo exclusivo e alguns jogos com anti-cheat podem não ser capturáveis.
- O modo INCLUDE pega o processo e os filhos. Escolha o processo que aparece na
  lista de sessões de áudio (a Ponte lista exatamente esses).

**Transporte Ponte → página:** WebSocket em `127.0.0.1:47613`, PCM 16-bit estéreo
48 kHz, pacotes enviados assim que o WASAPI os entrega (~10 ms). Na página, um
`AudioWorklet` com buffer elástico (alvo ~40 ms, descarta excesso acima de ~150 ms)
alimenta um `MediaStreamAudioDestinationNode`, cuja faixa entra na conexão WebRTC
como qualquer outra.

**Segurança da Ponte:** escuta só em loopback e recusa qualquer `Origin` fora da
lista permitida (servidor de desenvolvimento e o domínio de produção, configurável
com `--allow-origin`). O Chrome 142+ ainda pede ao usuário a permissão de "rede
local" quando uma página pública fala com `127.0.0.1`; por isso, fora do
localhost, o site só procura a Ponte depois de um clique.

**Um cliente por vez:** a Ponte atende um único WebSocket; uma conexão nova
encerra a anterior. A verificação do site ("Seu computador está pronto?") usa
`GET /status` (JSON com CORS restrito às mesmas origens) justamente para não
derrubar a captura de uma transmissão aberta em outra aba.

### Eco do lado de quem assiste

Se o espectador usa caixas de som, o microfone dele no Discord pode captar o som
do jogo que o Alexandrus está tocando, e esse som volta para a call. Isso é
resolvido pelo cancelamento de eco do Discord ou por fone de ouvido; o Alexandrus
mostra a dica uma vez, na entrada da sala.

## Vídeo e latência

- `contentHint` da faixa: `motion` para jogos/vídeo, `detail` para texto e apps.
- `degradationPreference`: `maintain-framerate` em jogos, `maintain-resolution` em texto.
- Teto de bitrate por espectador (`RTCRtpSender.setParameters`) conforme a qualidade
  escolhida (Leve 2,5 · Equilibrada 6 · Alta 12 · Máxima 20 Mbps).
- Preferência de codec: H.264 (codificação por hardware no Windows) e depois VP9/AV1/VP8.
- No espectador, `jitterBufferTarget = 0` pede o menor buffer de reprodução possível.
- Painel de conexão com números reais de `getStats()`: resolução, FPS, bitrate,
  perda de pacotes, RTT.
- Jogos em **tela cheia exclusiva** podem aparecer pretos na captura de janela; use
  "tela cheia sem bordas" ou capture o monitor.

## Salas e sinalização

- Criação por `POST /api/rooms` → código de 6 caracteres (alfabeto sem 0/O/1/I/L) e um
  `hostKey` secreto guardado só no navegador do anfitrião (sessionStorage).
- Pública aparece em "Salas"; privada só por código ou link.
- WebSocket `/ws`: entrar, trocar ofertas/respostas/ICE (o anfitrião sempre oferece),
  estado da transmissão, contagem de espectadores.
- Se o anfitrião cair ou recarregar a página, a sala espera 60 s antes de encerrar.
- `GET /api/ice` entrega STUN e, se configurado, credenciais TURN temporárias
  (formato REST do coturn: HMAC-SHA1 com segredo compartilhado).

## Como cresce

| Quando | Mudança | Por quê |
| --- | --- | --- |
| Mais de ~8 espectadores por sala | SFU (LiveKit auto-hospedado ou mediasoup) atrás da mesma interface `Broadcaster` | Tira o custo de upload do anfitrião |
| Muitas salas / vários servidores | Registro de salas em Redis ou um Durable Object por sala | O registro já é uma interface |
| Redes restritas (4G, empresas) | coturn próprio ou TURN gerenciado | Já suportado por variáveis de ambiente |
| Captura sem navegador no PC do anfitrião | App desktop (Tauri/WebView2) reaproveitando a web e a Ponte | Um único instalador; Windows Graphics Capture direto |
| Contas, salas fixas, convites | Autenticação + banco | Hoje as salas são efêmeras por desenho |

## O que ainda não existe (honestidade)

Veja a seção "Estado" do `README.md`; tudo que a interface mostra está ligado a
código real ou aparece marcado como indisponível, com o motivo.
