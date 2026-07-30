/** Loopback-only operator console. Served as one static document; all data comes from the authenticated JSON API. */
export const consoleHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Codex Patty</title>
<style>
:root { color-scheme: dark; --bg:#0b0d12; --panel:#141821; --line:#232937; --text:#e6e9f0; --muted:#8d97ad; --accent:#7cc4ff; --good:#5ddc9a; --warn:#ffcf6b; --bad:#ff7a7a; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
header { display:flex; align-items:center; gap:12px; padding:14px 20px; border-bottom:1px solid var(--line); background:var(--panel); position:sticky; top:0; z-index:2; }
header h1 { font-size:16px; margin:0; letter-spacing:.02em; }
header .tag { color:var(--muted); font-size:12px; }
header .spacer { flex:1; }
main { padding:20px; display:grid; gap:20px; grid-template-columns:repeat(auto-fit,minmax(420px,1fr)); align-items:start; max-width:1600px; }
section { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; }
section h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:0 0 12px; }
section.wide { grid-column:1/-1; }
table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
th, td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); }
th { color:var(--muted); font-weight:500; font-size:12px; }
tr:last-child td { border-bottom:none; }
input, select, textarea, button { font:inherit; color:var(--text); background:#0e121a; border:1px solid var(--line); border-radius:7px; padding:7px 10px; }
textarea { width:100%; min-height:76px; resize:vertical; }
button { background:#1d2532; cursor:pointer; }
button:hover:enabled { border-color:var(--accent); }
button:disabled { opacity:.5; cursor:default; }
button.primary { background:var(--accent); color:#08111b; border-color:var(--accent); font-weight:600; }
button.danger { color:var(--bad); }
.row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.row > .grow { flex:1; min-width:120px; }
.cards { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); }
.card { background:#0e121a; border:1px solid var(--line); border-radius:8px; padding:10px 12px; }
.card .k { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
.card .v { font-size:22px; font-variant-numeric:tabular-nums; }
.bar { height:8px; border-radius:4px; background:#0e121a; overflow:hidden; }
.bar > i { display:block; height:100%; background:var(--accent); }
.pill { font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid var(--line); color:var(--muted); }
.pill.ready { color:var(--good); border-color:#255c44; }
.pill.pending_login { color:var(--warn); border-color:#5c4b22; }
.pill.reconnect_required, .pill.login_failed, .pill.removed { color:var(--bad); border-color:#5c2a2a; }
pre { margin:0; background:#0e121a; border:1px solid var(--line); border-radius:8px; padding:12px; min-height:150px; max-height:340px; overflow:auto; white-space:pre-wrap; word-break:break-word; }
.muted { color:var(--muted); }
.err { color:var(--bad); }
.ok { color:var(--good); }
code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
</style>
</head>
<body>
<header>
  <h1>Codex Patty</h1>
  <span class="tag">local sub router &middot; <span id="health" class="muted">checking…</span></span>
  <span class="spacer"></span>
  <input id="key" type="password" placeholder="cp_live_… API key" size="28" />
  <button id="connect" class="primary">Connect</button>
  <span id="auth" class="muted"></span>
</header>
<main>
  <section class="wide">
    <h2>Quota windows</h2>
    <div class="cards" id="quota-strip"><div class="card"><div class="k">no subs stacked yet</div><div class="v">—</div></div></div>
  </section>

  <section class="wide">
    <h2>Usage</h2>
    <div class="cards">
      <div class="card"><div class="k">Tokens in</div><div class="v" id="t-in">0</div></div>
      <div class="card"><div class="k">Tokens out</div><div class="v" id="t-out">0</div></div>
      <div class="card"><div class="k">Total tokens</div><div class="v" id="t-total">0</div></div>
      <div class="card"><div class="k">Cached in</div><div class="v" id="t-cached">0</div></div>
      <div class="card"><div class="k">Reasoning out</div><div class="v" id="t-reasoning">0</div></div>
      <div class="card"><div class="k">Runs measured</div><div class="v" id="t-runs">0</div></div>
    </div>
  </section>

  <section>
    <h2>Subs</h2>
    <table><thead><tr><th>Alias</th><th>State</th><th>Quota left</th><th>Health</th><th>Active</th><th>Models</th><th></th></tr></thead><tbody id="accounts"><tr><td colspan="7" class="muted">connect to load</td></tr></tbody></table>
    <div class="row" style="margin-top:12px">
      <input id="alias" class="grow" placeholder="new sub alias" />
      <select id="mode"><option value="browser">browser</option><option value="device_code">device code</option></select>
      <button id="add">Add sub</button>
      <button id="refresh-all">Refresh</button>
    </div>
    <p id="login" class="muted"></p>
  </section>

  <section>
    <h2>Router</h2>
    <table><thead><tr><th>Alias</th><th>Eligible</th><th>Score</th><th>Score inputs</th></tr></thead><tbody id="router"><tr><td colspan="4" class="muted">connect to load</td></tr></tbody></table>
    <p class="muted" id="routing-why"></p>
    <p class="muted" id="models"></p>
  </section>

  <section class="wide">
    <h2>Inference</h2>
    <div class="row">
      <select id="model" class="grow"></select>
      <label class="muted"><input type="checkbox" id="pin-thread" /> keep thread</label>
      <button id="send" class="primary">Send</button>
      <button id="cancel" disabled>Cancel</button>
    </div>
    <textarea id="prompt" placeholder="Ask the stacked subs something…">Say hello from Codex Patty.</textarea>
    <p class="muted" id="run-meta"></p>
    <pre id="output" class="muted">output appears here</pre>
  </section>

  <section class="wide">
    <h2>API keys</h2>
    <table><thead><tr><th>Name</th><th>Prefix</th><th>Created</th><th>Last used</th><th>State</th><th></th></tr></thead><tbody id="keys"><tr><td colspan="6" class="muted">connect to load</td></tr></tbody></table>
    <div class="row" style="margin-top:12px">
      <input id="key-name" class="grow" placeholder="key name, e.g. puffle-prod" />
      <button id="issue-key">Create key</button>
    </div>
    <p id="issued" class="muted"></p>
  </section>

  <section class="wide">
    <h2>Usage per key</h2>
    <table><thead><tr><th>Key</th><th>Runs</th><th>Tokens in</th><th>Tokens out</th><th>Total</th></tr></thead><tbody id="per-key"><tr><td colspan="5" class="muted">no usage recorded yet</td></tr></tbody></table>
  </section>

  <section class="wide">
    <h2>Usage per sub</h2>
    <table><thead><tr><th>Alias</th><th>Runs</th><th>Tokens in</th><th>Tokens out</th><th>Total</th><th style="width:32%">Share</th></tr></thead><tbody id="per-account"><tr><td colspan="6" class="muted">no usage recorded yet</td></tr></tbody></table>
  </section>

  <section class="wide">
    <h2>Recent runs</h2>
    <table><thead><tr><th>Run</th><th>Sub</th><th>Key</th><th>Model</th><th>In</th><th>Out</th><th>Total</th><th>Observed</th></tr></thead><tbody id="recent"><tr><td colspan="8" class="muted">no usage recorded yet</td></tr></tbody></table>
  </section>
</main>
<script type="module">
const el = id => document.getElementById(id);
const fmt = value => Number(value ?? 0).toLocaleString();
let key = localStorage.getItem('patty.key') ?? '';
let threadId = null, runId = null, stream = null;
el('key').value = key;

const api = async (path, init = {}) => {
  const response = await fetch(path, { ...init, headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.code ?? 'request failed: ' + response.status);
  return body;
};

const setAuth = (text, className = 'muted') => { el('auth').textContent = text; el('auth').className = className; };

async function health() { try { const body = await (await fetch('/healthz')).json(); el('health').textContent = body.ok ? 'daemon up' : 'daemon down'; } catch { el('health').textContent = 'daemon unreachable'; } }

function renderAccounts(accounts) {
  el('accounts').innerHTML = accounts.length ? accounts.map(account => \`<tr>
    <td><code>\${account.alias}</code></td>
    <td><span class="pill \${account.state}">\${account.state}</span></td>
    <td>\${account.quota?.remaining === undefined ? '<span class="muted">unknown</span>' : Math.round(account.quota.remaining * 100) + '%'}</td>
    <td>\${account.health.toFixed(2)}</td>
    <td>\${account.activeRuns}</td>
    <td class="muted">\${account.models.join(', ') || '—'}</td>
    <td><button class="danger" data-remove="\${account.id}">remove</button></td></tr>\`).join('') : '<tr><td colspan="7" class="muted">no subs stacked yet</td></tr>';
  for (const button of el('accounts').querySelectorAll('[data-remove]')) button.onclick = async () => { if (confirm('Remove this sub?')) { await api('/v1/accounts/' + button.dataset.remove, { method: 'DELETE' }); await load(); } };
}

const pct = value => value === undefined ? '?' : Math.round(value * 100) + '%';
const countdown = ms => { if (ms === undefined) return 'no reset reported'; if (ms <= 0) return 'window rolled over'; const minutes = Math.round(ms / 60000); return minutes < 60 ? 'resets in ' + minutes + 'm' : 'resets in ' + Math.floor(minutes / 60) + 'h' + String(minutes % 60).padStart(2, '0') + 'm'; };

function renderRouter(status) {
  el('router').innerHTML = status.length ? status.map(entry => {
    const inputs = \`quota \${pct(entry.effectiveQuota)}\${entry.quotaRemaining !== entry.effectiveQuota ? ' (snapshot ' + pct(entry.quotaRemaining) + ', window rolled over)' : ''} · health \${entry.health.toFixed(2)} · active \${entry.activeRuns}/2 · \${countdown(entry.resetsInMs)}\`;
    return \`<tr><td><code>\${entry.alias}</code></td><td class="\${entry.ready ? 'ok' : 'err'}">\${entry.ready ? 'yes' : 'no'}</td><td>\${entry.score.toFixed(3)}</td><td class="muted">\${inputs}</td></tr>\`;
  }).join('') : '<tr><td colspan="4" class="muted">no subs stacked yet</td></tr>';
  el('routing-why').textContent = explainRouting(status);
  el('quota-strip').innerHTML = status.length ? status.map(entry => \`<div class="card">
    <div class="k"><code>\${entry.alias}</code></div>
    <div class="v">\${pct(entry.effectiveQuota)}</div>
    <div class="k">\${countdown(entry.resetsInMs)}\${entry.cooldownUntil && Date.parse(entry.cooldownUntil) > Date.now() ? ' · cooling down' : ''}</div></div>\`).join('') : '<div class="card"><div class="k">no subs stacked yet</div><div class="v">—</div></div>';
}

/** The router already computes why it prefers a sub; saying it in words is what makes the choice reviewable. */
function explainRouting(status) {
  const ready = status.filter(entry => entry.ready);
  if (!ready.length) return status.length ? 'no sub is ready to serve a request' : '';
  const [best, ...rest] = ready;
  const headroom = pct(best.effectiveQuota) + (rest.length ? ' vs ' + rest.map(entry => pct(entry.effectiveQuota)).join(' vs ') : '');
  const soonest = ready.filter(entry => entry.resetsInMs !== undefined).sort((a, b) => a.resetsInMs - b.resetsInMs)[0];
  const urgency = soonest && soonest.alias === best.alias && rest.length ? ', and its window ' + countdown(best.resetsInMs) + ' so that headroom is use-it-or-lose-it' : '';
  return 'next request routes to ' + best.alias + ' — most headroom (' + headroom + ')' + urgency;
}

function renderUsage(report) {
  el('t-in').textContent = fmt(report.totals.inputTokens);
  el('t-out').textContent = fmt(report.totals.outputTokens);
  el('t-total').textContent = fmt(report.totals.totalTokens);
  el('t-cached').textContent = fmt(report.totals.cachedInputTokens);
  el('t-reasoning').textContent = fmt(report.totals.reasoningOutputTokens);
  el('t-runs').textContent = fmt(report.totals.runs);
  const max = Math.max(1, ...report.accounts.map(account => account.totalTokens));
  el('per-account').innerHTML = report.accounts.length ? report.accounts.map(account => \`<tr>
    <td><code>\${account.alias}</code></td><td>\${fmt(account.runs)}</td><td>\${fmt(account.inputTokens)}</td><td>\${fmt(account.outputTokens)}</td><td>\${fmt(account.totalTokens)}</td>
    <td><div class="bar"><i style="width:\${Math.round((account.totalTokens / max) * 100)}%"></i></div></td></tr>\`).join('') : '<tr><td colspan="6" class="muted">no usage recorded yet</td></tr>';
  el('recent').innerHTML = report.runs.length ? report.runs.map(run => \`<tr>
    <td><code>\${run.runId}</code></td><td><code>\${run.alias}</code></td><td class="muted">\${keyLabel(run.keyName, run.keyId)}</td><td class="muted">\${run.model}</td>
    <td>\${fmt(run.inputTokens)}</td><td>\${fmt(run.outputTokens)}</td><td>\${fmt(run.totalTokens)}</td><td class="muted">\${new Date(run.observedAt).toLocaleTimeString()}</td></tr>\`).join('') : '<tr><td colspan="8" class="muted">no usage recorded yet</td></tr>';
  el('per-key').innerHTML = report.keys.length ? report.keys.map(entry => \`<tr>
    <td>\${keyLabel(entry.name, entry.keyId, entry.prefix)}</td><td>\${fmt(entry.runs)}</td><td>\${fmt(entry.inputTokens)}</td><td>\${fmt(entry.outputTokens)}</td><td>\${fmt(entry.totalTokens)}</td></tr>\`).join('') : '<tr><td colspan="5" class="muted">no usage recorded yet</td></tr>';
}

/** Runs recorded before named keys existed, or issued by a key since deleted, still need an honest label. */
function keyLabel(name, keyId, prefix) {
  if (!keyId) return 'unattributed';
  return name ? '<code>' + name + '</code>' : '<code>' + (prefix ? 'cp_live_' + prefix : keyId) + '</code>';
}

function renderKeys(keys) {
  el('keys').innerHTML = keys.length ? keys.map(entry => \`<tr>
    <td>\${entry.name ? '<code>' + entry.name + '</code>' : '<span class="muted">unnamed</span>'}</td>
    <td class="muted"><code>cp_live_\${entry.prefix}_…</code></td>
    <td class="muted">\${new Date(entry.created_at).toLocaleString()}</td>
    <td class="muted">\${entry.last_used_at ? new Date(entry.last_used_at).toLocaleString() : 'never'}</td>
    <td class="\${entry.revoked_at ? 'err' : 'ok'}">\${entry.revoked_at ? 'revoked' : 'active'}</td>
    <td>\${entry.revoked_at ? '' : '<button class="danger" data-revoke="' + entry.id + '">revoke</button>'}</td></tr>\`).join('') : '<tr><td colspan="6" class="muted">no keys issued</td></tr>';
  for (const button of el('keys').querySelectorAll('[data-revoke]')) button.onclick = async () => { if (confirm('Revoke this key? Anything using it stops working immediately.')) { await api('/v1/api-keys/' + button.dataset.revoke, { method: 'DELETE' }); await load(); } };
}

function renderModels(entries) {
  const models = entries.map(entry => entry.id);
  const select = el('model'), previous = select.value;
  select.innerHTML = models.map(model => \`<option value="\${model}">\${model}</option>\`).join('') || '<option value="">no models available</option>';
  if (models.includes(previous)) select.value = previous;
  el('models').textContent = models.length ? models.length + ' model(s) across stacked subs' : 'stack a sub to discover models';
}

async function load() {
  if (!key) { setAuth('no key', 'err'); return; }
  try {
    const [accounts, router, models, usage, keys] = await Promise.all([api('/v1/accounts'), api('/v1/router/status'), api('/v1/models'), api('/v1/usage'), api('/v1/api-keys')]);
    renderAccounts(accounts.data); renderRouter(router.data); renderModels(models.data); renderUsage(usage.data); renderKeys(keys.data);
    setAuth('connected', 'ok');
  } catch (error) { setAuth(String(error.message), 'err'); }
}

el('issue-key').onclick = async () => {
  try {
    const issued = await api('/v1/api-keys', { method: 'POST', body: JSON.stringify({ name: el('key-name').value.trim() }) });
    el('issued').className = 'ok';
    el('issued').textContent = 'copy this now, it is never shown again: ' + issued.key;
    el('key-name').value = '';
  } catch (error) { el('issued').className = 'err'; el('issued').textContent = 'could not issue key: ' + error.message; }
  await load();
};

el('connect').onclick = () => { key = el('key').value.trim(); localStorage.setItem('patty.key', key); load(); };
el('refresh-all').onclick = async () => { const accounts = await api('/v1/accounts'); await Promise.allSettled(accounts.data.map(account => api('/v1/accounts/' + account.id + '/refresh', { method: 'POST' }))); await load(); };
el('add').onclick = async () => {
  const alias = el('alias').value.trim(); if (!alias) return;
  el('login').className = 'muted'; el('login').textContent = 'starting login…';
  try {
    const challenge = await api('/v1/accounts/codex/login', { method: 'POST', body: JSON.stringify({ alias, mode: el('mode').value }) });
    el('login').innerHTML = 'finish login for <code>' + alias + '</code>: ' + (challenge.url ? '<a href="' + challenge.url + '" target="_blank" rel="noreferrer">open provider login</a>' : 'no url returned') + (challenge.code ? ' &middot; code <code>' + challenge.code + '</code>' : '');
    el('alias').value = '';
  } catch (error) { el('login').className = 'err'; el('login').textContent = 'login failed: ' + error.message + ' (live mode requires the local authorization gate)'; }
  await load();
};

/** The stream runs concurrently with the routing lookup, so meta text is composed instead of appended. */
let metaBase = '', metaSuffix = '';
function meta(base, suffix) { if (base !== undefined) metaBase = base; if (suffix) metaSuffix += suffix; el('run-meta').textContent = metaBase + metaSuffix; }

function closeStream() { stream?.abort(); stream = null; el('cancel').disabled = true; el('send').disabled = false; }

async function subscribe(id) {
  stream = new AbortController();
  const response = await fetch('/v1/runs/' + id + '/events', { headers: { authorization: 'Bearer ' + key }, signal: stream.signal });
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\\n\\n'); buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\\n').find(part => part.startsWith('data: ')); if (!line) continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === 'delta' && event.data?.text) { el('output').classList.remove('muted'); el('output').textContent += event.data.text; }
      if (event.type === 'usage') meta(undefined, ' · ' + event.data.inputTokens + ' in / ' + event.data.outputTokens + ' out tokens');
      if (['completed', 'failed', 'cancelled'].includes(event.type)) { meta(undefined, ' · ' + event.type); closeStream(); await load(); return; }
    }
  }
  closeStream(); await load();
}

el('send').onclick = async () => {
  const model = el('model').value, input = el('prompt').value.trim();
  if (!model || !input) return;
  el('send').disabled = true; el('output').textContent = ''; el('output').classList.add('muted'); metaSuffix = ''; meta('routing…');
  try {
    if (el('pin-thread').checked && !threadId) threadId = (await api('/v1/threads', { method: 'POST', body: JSON.stringify({ model }) })).threadId;
    if (!el('pin-thread').checked) threadId = null;
    const accepted = threadId
      ? await api('/v1/threads/' + threadId + '/turns', { method: 'POST', body: JSON.stringify({ model, input }) })
      : await api('/v1/runs', { method: 'POST', body: JSON.stringify({ model, input }) });
    runId = accepted.id;
    el('cancel').disabled = false;
    const streamed = subscribe(runId);
    const [run, accounts] = await Promise.all([api('/v1/runs/' + runId), api('/v1/accounts')]);
    const alias = accounts.data.find(account => account.id === run.accountId)?.alias ?? run.accountId;
    meta('run ' + runId + ' routed to ' + alias);
    await streamed;
  } catch (error) { el('run-meta').innerHTML = '<span class="err">' + error.message + '</span>'; el('send').disabled = false; }
};

el('cancel').onclick = async () => { if (runId) { try { await api('/v1/runs/' + runId + '/cancel', { method: 'POST' }); } catch {} closeStream(); await load(); } };

await health(); await load();
setInterval(health, 15000);
</script>
</body>
</html>
`;
