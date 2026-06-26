#!/usr/bin/env node
'use strict';
/*
 * Claude Usage Sync — observador local dos logs do Claude Code.
 *
 * Lê ~/.claude/projects/**\/*.jsonl, manda os eventos de uso (token, modelo,
 * timestamp, projeto) pro mesmo backend Supabase que o app web usa, e lembra
 * até onde já leu de cada arquivo (não reenvia tudo a cada execução).
 *
 * Uso:
 *   node sync-daemon.js SEUCODIGODESINCRONIZACAO   # primeira vez: salva o código
 *   node sync-daemon.js                            # próximas vezes: usa o código salvo
 *   node sync-daemon.js --watch                    # fica rodando e observando mudanças,
 *                                                   # em vez de rodar uma vez e sair
 *
 * Sem dependências externas — só Node 18+ (usa fetch global).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SUPA_URL = 'https://vqivrfewauphzyfnoeal.supabase.co';
const SUPA_KEY = 'sb_publishable_JgCEVQhojxQE1IjWyg5Kow_ByjX936_';

const CONFIG_FILE = path.join(os.homedir(), '.claude-usage-sync.json');
const STATE_FILE = path.join(os.homedir(), '.claude-usage-sync-state.json');
const PROJECTS_DIR = process.env.CC_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');
const WATCH = process.argv.includes('--watch');
const codeArg = process.argv.slice(2).find(a => !a.startsWith('--'));

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg));
}
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { offsets: {} }; }
}
function saveState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); }
  catch (e) { console.error('aviso: não consegui salvar estado:', e.message); }
}

let WS = process.env.CC_SYNC_WS || codeArg;
const cfg = loadConfig();
if (WS) {
  saveConfig({ ...cfg, ws: WS });
} else {
  WS = cfg.ws;
}
if (!WS || WS.length < 8) {
  console.error('Faltou o código de sincronização.');
  console.error('Use:  node sync-daemon.js SEUCODIGODESINCRONIZACAO');
  console.error('(copie o código da tela inicial do app — botão "ver completo")');
  process.exit(1);
}

function log(msg) { console.log(`[${new Date().toLocaleString('pt-BR')}] ${msg}`); }

function projLabel(p) {
  if (!p) return '(desconhecido)';
  const seg = p.replace(/\\/g, '/').split('/').filter(Boolean);
  return seg.slice(-2).join('/') || p;
}

async function ingest(events) {
  if (!events.length) return 0;
  let total = 0;
  const N = 700;
  for (let i = 0; i < events.length; i += N) {
    const batch = events.slice(i, i + N);
    const r = await fetch(SUPA_URL + '/rest/v1/rpc/cc_ingest', {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ws: WS, p_events: batch }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
    total += (+(await r.json()) || 0);
  }
  return total;
}

function parseLines(text, fallbackProj) {
  const records = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let e;
    try { e = JSON.parse(s); } catch { continue; }
    const u = e && e.message && e.message.usage;
    if (!u) continue;
    const model = e.message.model || '';
    if (model === '<synthetic>') continue;
    const id = e.message.id, req = e.requestId;
    const inp = +u.input_tokens || 0, out = +u.output_tokens || 0,
          cw = +u.cache_creation_input_tokens || 0, cr = +u.cache_read_input_tokens || 0;
    if (inp + out + cw + cr === 0) continue;
    const ts = e.timestamp ? new Date(e.timestamp) : null;
    const proj = e.cwd || fallbackProj;
    const did = (id && req) ? (id + ':' + req) : ('h:' + [e.timestamp || '', model, inp, out, cw, cr, proj || ''].join('|'));
    records.push({
      id: did,
      ts: (ts && !isNaN(ts)) ? ts.toISOString() : null,
      model,
      project: projLabel(proj),
      input: inp, output: out, cw, cr,
    });
  }
  return records;
}

function listJsonlFiles(dir) {
  let out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listJsonlFiles(full));
    else if (ent.isFile() && /\.jsonl$/i.test(ent.name)) out.push(full);
  }
  return out;
}

async function processFile(filePath, state) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { return 0; }
  let offset = state.offsets[filePath] || 0;
  if (stat.size < offset) offset = 0; // arquivo foi truncado/rotacionado: relê do zero
  if (stat.size <= offset) return 0;

  const fd = fs.openSync(filePath, 'r');
  const len = stat.size - offset;
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, offset);
  fs.closeSync(fd);

  let text = buf.toString('utf8');
  const lastNl = text.lastIndexOf('\n');
  if (lastNl === -1) return 0; // ainda não tem linha completa nova

  const consumedUpTo = offset + Buffer.byteLength(text.slice(0, lastNl + 1), 'utf8');
  text = text.slice(0, lastNl + 1);

  const fallbackProj = path.basename(path.dirname(filePath));
  const records = parseLines(text, fallbackProj);
  state.offsets[filePath] = consumedUpTo;

  if (!records.length) return 0;
  try {
    const n = await ingest(records);
    log(`${path.basename(filePath)}: +${records.length} eventos lidos, ${n} novos salvos`);
    return n;
  } catch (e) {
    state.offsets[filePath] = offset; // não avança; tenta de novo na próxima passada
    log(`falha ao enviar (${path.basename(filePath)}): ${e.message} — vai tentar de novo`);
    return 0;
  }
}

async function scanAll(state) {
  const files = listJsonlFiles(PROJECTS_DIR);
  let total = 0;
  for (const f of files) total += await processFile(f, state);
  saveState(state);
  return total;
}

async function main() {
  log(`observando ${PROJECTS_DIR} · código ${WS.slice(0, 4)}····${WS.slice(-4)}`);
  if (!fs.existsSync(PROJECTS_DIR)) {
    console.error('Pasta não encontrada:', PROJECTS_DIR);
    process.exit(1);
  }
  const state = loadState();
  const n = await scanAll(state);
  log(n ? `pronto · ${n} eventos novos enviados` : 'pronto · nada novo');

  if (!WATCH) return; // modo padrão: roda uma vez e sai (use o Agendador de Tarefas pra repetir)

  const watched = new Set();
  let timer = null;
  function scheduleScan() {
    if (timer) return;
    timer = setTimeout(async () => { timer = null; await scanAll(state); }, 1500);
  }
  function watchDir(dir) {
    if (watched.has(dir)) return;
    watched.add(dir);
    try {
      fs.watch(dir, { persistent: true }, (_evt, filename) => {
        scheduleScan();
        if (filename) {
          const full = path.join(dir, filename);
          try { if (fs.statSync(full).isDirectory()) watchDir(full); } catch {}
        }
      });
    } catch {}
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) if (ent.isDirectory()) watchDir(path.join(dir, ent.name));
  }
  watchDir(PROJECTS_DIR);
  setInterval(() => scanAll(state), 60000); // rede de segurança, caso o fs.watch perca algo
  log('modo --watch: ficando de pé, observando mudanças (Ctrl+C pra sair)');
}

main().catch(e => { console.error('erro fatal:', e); process.exit(1); });
