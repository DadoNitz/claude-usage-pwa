# Telemetria · Claude Code (PWA + nuvem)

Estatísticas de uso de tokens do Claude Code (CLI): quanto, como e onde você
gastou, com heatmap estilo GitHub. Lê os logs locais `~/.claude/projects/*.jsonl`,
processa no navegador e **sincroniza via nuvem** pra você juntar vários aparelhos.

## Como usar
1. Abra o app. Ele gera um **código de sincronização** (guarde-o).
2. "Escolher pasta projects" → selecione `~/.claude/projects`
   (Windows: `C:\Users\SEU_USUARIO\.claude\projects`).
3. Em outro PC: abra o app, clique em "tenho um código de outro aparelho",
   cole o **mesmo código**, e faça o upload de lá. Os dados se somam (sem dobrar:
   cada mensagem tem ID único e é deduplicada no servidor).

## Sincronização automática (sem ficar subindo arquivo)
Em vez de repetir o passo 2/3 manualmente, dá pra deixar um script rodando
sozinho em cada computador que observa a pasta de logs e manda pra nuvem.

**Em cada um dos seus computadores** (precisa do [Node.js](https://nodejs.org)
18+ instalado):

1. Copie os arquivos `sync-daemon.js`, `install-windows-task.ps1` e
   `uninstall-windows-task.ps1` (desta pasta do repositório) pra uma pastinha
   fixa no PC, ex.: `C:\Ferramentas\claude-usage-sync\`.
2. Abra o app no navegador, copie o **mesmo código de sincronização** que você
   já usa nos outros aparelhos (botão "ver completo" na tela inicial).
3. Abra o PowerShell nessa pasta e rode, **uma vez só**:
   ```powershell
   .\install-windows-task.ps1 -Code SEUCODIGODESINCRONIZACAO
   ```
   Isso testa o envio, salva o código localmente e cria uma tarefa agendada do
   Windows (`ClaudeUsageSync`) que roda a cada 5 minutos — mesmo sem o
   navegador aberto.
4. Repita os passos 1–3 nos outros 2 computadores, **usando o mesmo código**.
   Como cada evento tem um ID único, não duplica nada — só soma.

A partir daí o app mostra dados sempre atualizados sem precisar abrir
"Escolher pasta" de novo. Pra desligar num PC: rode
`.\uninstall-windows-task.ps1` na mesma pasta (não apaga dados já enviados,
só para de mandar novos).

Se preferir não usar o Agendador de Tarefas, dá pra rodar
`node sync-daemon.js --watch` num terminal que você deixe aberto — ele observa
a pasta em tempo real em vez de rodar uma vez e sair.

## Sincronização / privacidade
- Backend: Supabase (projeto `gestaontz`), numa tabela isolada `cc_usage_events`,
  acessível só por 2 funções RPC com `SECURITY DEFINER` + RLS travada.
- O app só guarda: data, modelo, nome curto do projeto (2 últimos níveis do
  caminho) e contagem de tokens. **Nenhum conteúdo de conversa.** O script de
  sincronização automática (`sync-daemon.js`) lê e manda exatamente os mesmos
  campos — mesma regra, só que sem precisar abrir o navegador.
- O "código de sincronização" é a chave dos seus dados. Quem tiver o código vê os
  números daquele código — então não compartilhe à toa. Pra trocar, use o botão.

## Deploy na Vercel (estático, sem build)
**Site (mais fácil):** vercel.com → Add New → Project → arraste esta pasta inteira.
**CLI:**
```
npm i -g vercel && cd claude-usage-pwa && vercel --prod
```
Não precisa de variável de ambiente: URL e chave pública do Supabase já estão no
app (a chave pública é feita pra ficar no front; a segurança é por RLS + RPC).

## Observações
- Cobre o **Claude Code (CLI)**. Conversas no claude.ai/app não ficam nesses logs.
- O Claude Code apaga logs antigos por `cleanupPeriodDays` (~30 dias padrão).
  Aumente em `~/.claude/settings.json` pra acumular histórico longo.
- Preços de custo são estimativas editáveis no app.
