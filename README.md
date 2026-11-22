# Alexandrus

Compartilhamento de tela ao vivo, com identidade Frutiger Aero, que leva **só o som da fonte**: o jogo vai pelo Alexandrus, a voz continua no Discord, sem eco.

- Arquitetura e decisões: [ARCHITECTURE.md](ARCHITECTURE.md)
- App auxiliar de áudio para Windows: [native/ponte/README.md](native/ponte/README.md)

## Rodar

Requisitos: Node 22.18+ (testado no 24), Windows 10/11 com Chrome ou Edge para transmitir.

```powershell
npm install
npm run dev
```

Abre o servidor em `http://localhost:8790` (API + WebSocket) e o site em `http://localhost:5173`.

Para levar o som de um jogo ou app (captura por processo):

```powershell
npm run ponte:build
```

```powershell
native\ponte\bin\AlexandrusPonte.exe
```

O build usa o compilador C# que já vem no .NET Framework do Windows e copia o `.exe` para `apps/web/public/downloads`, de onde a página `/ponte` oferece o download.

Produção (site estático servido pelo próprio servidor):

```powershell
npm run build
```

```powershell
npm start
```

Variáveis do servidor: `PORT` (8790), `HOST`, `STUN_URLS`, `TURN_URLS` + `TURN_SECRET` (credenciais temporárias no formato REST do coturn), `TURN_TTL`, `MAX_VIEWERS` (12), `TRUST_PROXY=1` atrás de proxy. Em produção, abra a Ponte com `--allow-origin https://seu-dominio` para ela aceitar o site.

## Testes

```powershell
npm test
```

Servidor de salas: 10 testes (criação, lista pública, chave do anfitrião, sinalização, sala cheia, queda e volta do anfitrião).

Ponta a ponta com o Chrome real (precisa de `npm run dev` rodando):

```powershell
node apps/web/e2e/transmissao.e2e.mjs
```

Cria a sala, transmite uma aba que toca 440 Hz e confere no espectador quadros de vídeo e energia de áudio. Com a Ponte aberta e algum programa tocando som:

```powershell
node apps/web/e2e/transmissao.e2e.mjs --ponte --app powershell.exe
```

## Estado

Funciona hoje, verificado:

- Página inicial, criar sala, entrar (com prévia da sala), salas públicas, como funciona, sobre, Ponte; desktop e celular.
- Salas públicas/privadas com código de 6 caracteres e link; anfitrião volta em até 60 s se recarregar a página.
- Transmissão WebRTC anfitrião → espectadores (malha), troca de fonte sem derrubar quem assiste.
- Som da aba (isolado pelo navegador), som da janela quando o navegador entrega, som do sistema só com consentimento e aviso de eco.
- Som de **um aplicativo** pela Ponte (WASAPI process loopback) e modo “tudo menos a call”.
- “Áudio da fonte” liga/desliga na hora; resolução, FPS, qualidade e prioridade (fluidez/nitidez) ajustáveis ao vivo.
- Espectador: volume, mudo, tela cheia, copiar link, sair, controles que somem sozinhos, estatísticas reais (resolução, FPS, bitrate, atraso, perda, buffer, codec, caminho direto/TURN).

Ainda não existe:

- Servidor de mídia (SFU) para salas grandes — a malha limita a ~12 espectadores e depende do upload do anfitrião.
- Servidor TURN próprio (o código suporta; falta hospedar um coturn).
- Executável da Ponte assinado e instalador; ícone na bandeja.
- Contas, salas fixas, moderação.

## Estrutura

```
apps/web        site e app (React 19, Vite, CSS próprio)
  src/components  vidro, botões, cenário (céu, nuvens, colinas, água, peixes, bolhas)
  src/features/room  estúdio do anfitrião, palco, espectador
  src/lib         captura, WebRTC, sinalização, Ponte, estatísticas
  public/worklets reprodutor PCM da Ponte (AudioWorklet)
  e2e             teste de ponta a ponta com Chrome
apps/server     API, sinalização WebSocket, arquivos estáticos (Node, TypeScript sem build)
packages/protocol  tipos e regras compartilhados
native/ponte    Alexandrus Ponte (C#, WASAPI)
```

## Fotos

Fotos de acervos abertos, com crédito no rodapé e na página Sobre: “Landscape1” (Peter Gorissen, CC BY 3.0), “CSIRO ScienceImage 2879 Tropical Reef Fish” (Robert Kerton, CSIRO, CC BY 3.0) e “Whaleshark and sunlight” (Derek Keats, CC BY 2.0), via Wikimedia Commons. Cenário, ícones e logotipo foram desenhados em código.
