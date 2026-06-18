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

## Sincronização / privacidade
- Backend: Supabase (projeto `gestaontz`), numa tabela isolada `cc_usage_events`,
  acessível só por 2 funções RPC com `SECURITY DEFINER` + RLS travada.
- O app só guarda: data, modelo, nome curto do projeto (2 últimos níveis do
  caminho) e contagem de tokens. **Nenhum conteúdo de conversa.**
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
