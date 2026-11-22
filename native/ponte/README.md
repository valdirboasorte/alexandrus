# Alexandrus Ponte

App auxiliar minúsculo para Windows que captura o áudio de **um único processo** (WASAPI application/process loopback) e o transmite como PCM por um WebSocket em localhost para a página web.

- Formato: PCM s16le, estéreo, 48 kHz, em quadros binários enviados assim que cada pacote do WASAPI é lido.
- Protocolo: ver a seção "Alexandrus Ponte" em `packages/protocol/src/index.ts`.

## Requisitos

- Windows 10 2004 (build 19041) ou superior, ou Windows 11. A Microsoft documenta o process loopback a partir do build 20348, mas o OBS o usa desde o Windows 10 2004; o app testa a ativação em tempo de execução.
- .NET Framework 4.x (já incluso no Windows). Nada a instalar.

## Compilar

```powershell
powershell -ExecutionPolicy Bypass -File native/ponte/build.ps1
```

Gera `native/ponte/bin/AlexandrusPonte.exe` (usa o `csc.exe` do .NET Framework; C# 5).

## Executar

```powershell
bin\AlexandrusPonte.exe                    # serve em ws://127.0.0.1:47613
bin\AlexandrusPonte.exe --port 50000
bin\AlexandrusPonte.exe --allow-origin https://meu.site   # repetível
bin\AlexandrusPonte.exe --allow-no-origin                 # só para testes locais
bin\AlexandrusPonte.exe --list                            # lista sessões de áudio (JSON)
bin\AlexandrusPonte.exe --capture <pid> <segundos> saida.wav [--exclude]
```

`--capture` grava um WAV e imprime o pico (valor absoluto máximo de amostra) e o total de bytes.

## Teste com Node

```powershell
node native/ponte/tools/ws-smoke.mjs <pid-com-audio> [porta]
```

Com o Ponte rodando, verifica que uma origem não permitida recebe 403, faz hello/ping/list/start, conta os bytes binários por 2 s (esperado ~384000) e envia stop. Usa o pacote `ws` de `node_modules`.

## Status sem WebSocket

`GET http://127.0.0.1:47613/status` devolve `{ app, version, windowsBuild, processLoopback, connected, capturing }`, com CORS liberado só para as origens permitidas (outras recebem `403`). O site usa isso na verificação “Seu computador está pronto?”: como a Ponte atende um WebSocket por vez, abrir um segundo derrubaria a captura de uma transmissão em andamento.

## Segurança

- Escuta apenas em `127.0.0.1`.
- Checa o cabeçalho `Origin` contra uma lista: `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:8790`, `http://127.0.0.1:8790`, o site publicado `https://alexandrus.vercel.app` e as passadas com `--allow-origin`. Origem ausente ou fora da lista recebe `403 Forbidden` (ausente só é aceita com `--allow-no-origin`).
- Um cliente por vez: nova conexão substitui a anterior. Mensagens de entrada limitadas a 64 KB.

## Limitações conhecidas

- O processo precisa estar produzindo áudio pelo motor de áudio do Windows.
- Streams WASAPI em modo exclusivo e alguns jogos protegidos por anti-cheat podem não ser capturáveis.
- Áudio de processo filho/auxiliar (ex.: navegadores): capture o PID que é dono da sessão de áudio (veja `list`). O modo `include` inclui a árvore de processos filhos do PID alvo; `exclude` captura tudo menos essa árvore.
- Só o modo `include` detecta o fim do processo (`process-exited`).
