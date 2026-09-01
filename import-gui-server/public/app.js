/* Import GUI - vanilla JS, no build step. See server.js for the API this talks to. */

const CATEGORY_LABELS = { npc: 'NPCs', mech: 'Mechs', spaceship: 'Spaceships' };

// Synthetic filter/trait key for the category folder generate-npc.py sorts each
// NPC into (server.js derives it from the folder path; it isn't a real trait).
const ROLE_CATEGORY_KEY = 'Role Category';
// Fields that are noise in a trait list - the character's own name split three ways.
const TRAIT_KEY_EXCLUDE = ['name', 'Given names', 'Family names'];

const state = {
  category: null,
  items: [],
  visibleItems: [],
  selected: new Set(),
  pollTimer: null,
  search: '',
  sort: 'when-desc',
  filters: [], // { key, value }
  detailItemId: null,     // item currently shown in the detail overlay, if any
  regenLastStatus: null,  // that item's regenStatus as of the last render, to catch done/error transitions
};

const el = {
  categories: document.getElementById('categories'),
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  status: document.getElementById('status'),
  importBtn: document.getElementById('import-btn'),
  deleteBtn: document.getElementById('delete-btn'),
  selectAll: document.getElementById('select-all'),
  filterSearch: document.getElementById('filter-search'),
  sortSelect: document.getElementById('sort-select'),
  filterRows: document.getElementById('filter-rows'),
  addFilterBtn: document.getElementById('add-filter'),
  overlay: document.getElementById('detail-overlay'),
  detailClose: document.getElementById('detail-close'),
  detailPortrait: document.getElementById('detail-portrait'),
  detailToken: document.getElementById('detail-token'),
  detailName: document.getElementById('detail-name'),
  detailSub: document.getElementById('detail-sub'),
  detailGenerated: document.getElementById('detail-generated'),
  detailTraits: document.getElementById('detail-traits'),
  detailPrompts: document.getElementById('detail-prompts'),
  detailPortraitPrompt: document.getElementById('detail-portrait-prompt'),
  detailTokenPrompt: document.getElementById('detail-token-prompt'),
  imageZoom: document.getElementById('image-zoom'),
  imageZoomImg: document.getElementById('image-zoom-img'),
  regenPanel: document.getElementById('regen-panel'),
  regenSeedInput: document.getElementById('regen-seed-input'),
  regenCurrentSeed: document.getElementById('regen-current-seed'),
  regenBtn: document.getElementById('regen-btn'),
  regenStatus: document.getElementById('regen-status'),
  detailDeleteBtn: document.getElementById('detail-delete-btn'),
};

const elDeleteConfirm = {
  overlay: document.getElementById('delete-confirm-overlay'),
  message: document.getElementById('delete-confirm-message'),
  list: document.getElementById('delete-confirm-list'),
  cancel: document.getElementById('delete-confirm-cancel'),
  ok: document.getElementById('delete-confirm-ok'),
};

/** Shows the delete-confirmation modal for the given item names; resolves true/false. */
function confirmDelete(names) {
  return new Promise((resolve) => {
    elDeleteConfirm.message.textContent = names.length === 1
      ? `Permanently delete "${names[0]}"?`
      : `Permanently delete these ${names.length} items?`;
    elDeleteConfirm.list.innerHTML = names.length > 1
      ? names.map((n) => `<li>${escapeHtml(n)}</li>`).join('')
      : '';
    elDeleteConfirm.overlay.hidden = false;

    const cleanup = (result) => {
      elDeleteConfirm.overlay.hidden = true;
      elDeleteConfirm.ok.removeEventListener('click', onOk);
      elDeleteConfirm.cancel.removeEventListener('click', onCancel);
      elDeleteConfirm.overlay.removeEventListener('click', onBackdrop);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => { if (e.target === elDeleteConfirm.overlay) cleanup(false); };

    elDeleteConfirm.ok.addEventListener('click', onOk);
    elDeleteConfirm.cancel.addEventListener('click', onCancel);
    elDeleteConfirm.overlay.addEventListener('click', onBackdrop);
  });
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function loadCategories() {
  const { categories } = await api('/api/categories');
  el.categories.innerHTML = '';
  if (!categories.length) {
    el.categories.textContent = 'No generated content found yet.';
    return;
  }
  for (const cat of categories) {
    const btn = document.createElement('button');
    btn.textContent = `${CATEGORY_LABELS[cat.id] || cat.id} (${cat.count})`;
    btn.addEventListener('click', () => selectCategory(cat.id));
    btn.dataset.id = cat.id;
    el.categories.appendChild(btn);
  }
  selectCategory(categories[0].id);
}

async function selectCategory(id) {
  state.category = id;
  state.selected.clear();
  state.search = '';
  state.filters = [];
  el.filterSearch.value = '';
  for (const btn of el.categories.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.id === id);
  }
  await refreshItems();
}

async function refreshItems() {
  if (!state.category) return;
  const { items } = await api(`/api/items?category=${encodeURIComponent(state.category)}`);
  state.items = items;
  // Only drop selections for items that vanished entirely (e.g. deleted) -
  // an imported item stays selectable since selection also drives Delete Selected.
  for (const id of [...state.selected]) {
    if (!items.some((i) => i.id === id)) state.selected.delete(id);
  }
  renderFilterRows();
  render();
}

/* ---- filtering ---- */

/** The value a trait-or-synthetic filter key resolves to for one item. */
function fieldValue(item, key) {
  if (key === ROLE_CATEGORY_KEY) return item.roleCategory || '';
  return item.traits?.[key] || '';
}

/** Every filterable key present across the current category's items, sorted. */
function collectTraitKeys(items) {
  const keys = new Set();
  for (const item of items) {
    for (const key of Object.keys(item.traits || {})) {
      if (!TRAIT_KEY_EXCLUDE.includes(key)) keys.add(key);
    }
    if (item.roleCategory) keys.add(ROLE_CATEGORY_KEY);
  }
  return [...keys].sort();
}

/** Distinct values seen for one key, for the filter row's searchable dropdown. */
function collectDistinctValues(items, key) {
  const values = new Set();
  for (const item of items) {
    const v = fieldValue(item, key);
    if (v) values.add(v);
  }
  return [...values].sort();
}

function itemMatchesFilters(item) {
  const search = state.search.trim().toLowerCase();
  if (search) {
    const haystack = [item.name, item.callsign, item.roleCategory, ...Object.values(item.traits || {})]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  for (const filter of state.filters) {
    if (!filter.key || !filter.value.trim()) continue;
    const value = fieldValue(item, filter.key).toLowerCase();
    if (!value.includes(filter.value.trim().toLowerCase())) return false;
  }
  return true;
}

/** Comparators for the "Sort by" dropdown - `when` sorts lexicographically fine
 * since generate-npc.py writes it as "YYYY-MM-DD HH:MM:SS". */
const SORTERS = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
  'when-desc': (a, b) => (b.when || '').localeCompare(a.when || ''),
  'when-asc': (a, b) => (a.when || '').localeCompare(b.when || ''),
  'role-category': (a, b) =>
    (a.roleCategory || '').localeCompare(b.roleCategory || '') || a.name.localeCompare(b.name),
};

function sortItems(items) {
  const cmp = SORTERS[state.sort] || SORTERS['name-asc'];
  return [...items].sort(cmp);
}

function renderFilterRows() {
  const keys = collectTraitKeys(state.items);
  el.filterRows.innerHTML = '';

  state.filters.forEach((filter, index) => {
    if (!filter.key) filter.key = keys[0] || '';

    const row = document.createElement('div');
    row.className = 'filter-row';

    const keySelect = document.createElement('select');
    keySelect.className = 'filter-key';
    for (const key of keys) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      opt.selected = key === filter.key;
      keySelect.appendChild(opt);
    }
    keySelect.addEventListener('change', () => {
      filter.key = keySelect.value;
      filter.value = '';
      renderFilterRows();
      render();
    });
    row.appendChild(keySelect);

    const datalistId = `filter-values-${index}`;
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'filter-value';
    valueInput.placeholder = 'value contains…';
    valueInput.value = filter.value;
    valueInput.setAttribute('list', datalistId);
    valueInput.addEventListener('input', () => {
      filter.value = valueInput.value;
      render();
    });
    row.appendChild(valueInput);

    const datalist = document.createElement('datalist');
    datalist.id = datalistId;
    for (const value of collectDistinctValues(state.items, filter.key)) {
      const opt = document.createElement('option');
      opt.value = value;
      datalist.appendChild(opt);
    }
    row.appendChild(datalist);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'filter-remove';
    remove.textContent = '×';
    remove.title = 'Remove filter';
    remove.addEventListener('click', () => {
      state.filters.splice(index, 1);
      renderFilterRows();
      render();
    });
    row.appendChild(remove);

    el.filterRows.appendChild(row);
  });

  el.addFilterBtn.disabled = keys.length === 0;
}

function render() {
  el.grid.innerHTML = '';
  state.visibleItems = sortItems(state.items.filter(itemMatchesFilters));
  el.empty.textContent = state.items.length && !state.visibleItems.length
    ? 'No items match the current filters.'
    : 'Nothing here yet — run generate-npc.py, then reload.';
  el.empty.hidden = state.visibleItems.length > 0;

  for (const item of state.visibleItems) {
    const card = document.createElement('div');
    card.className = 'card' + (item.imported ? ' imported' : '');

    const img = document.createElement('img');
    img.src = item.portraitUrl || item.tokenUrl || '';
    img.alt = item.name;
    card.appendChild(img);

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'check';
    check.checked = state.selected.has(item.id);
    // Selection also drives Delete Selected, which makes sense for imported
    // and non-importable (missing-files) entries too - only Import Selected
    // itself skips those (server-side, with a reason shown in the status line).
    check.title = !item.importable ? 'Source images missing on disk' : '';
    check.addEventListener('click', (e) => e.stopPropagation());
    check.addEventListener('change', () => {
      if (check.checked) state.selected.add(item.id);
      else state.selected.delete(item.id);
      updateToolbar();
    });
    card.appendChild(check);

    if (item.imported) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Imported';
      card.appendChild(badge);
    } else if (item.jobStatus === 'sent' || item.jobStatus === 'queued') {
      const badge = document.createElement('span');
      badge.className = 'badge pending';
      badge.textContent = 'Importing…';
      card.appendChild(badge);
    } else if (item.jobStatus === 'error') {
      const badge = document.createElement('span');
      badge.className = 'badge error';
      badge.textContent = 'Failed';
      badge.title = item.jobError || '';
      card.appendChild(badge);
    } else if (item.regenStatus === 'running') {
      const badge = document.createElement('span');
      badge.className = 'badge pending';
      badge.textContent = 'Regenerating…';
      card.appendChild(badge);
    } else if (item.regenStatus === 'error') {
      const badge = document.createElement('span');
      badge.className = 'badge error';
      badge.textContent = 'Regen failed';
      badge.title = item.regenError || '';
      card.appendChild(badge);
    }

    const body = document.createElement('div');
    body.className = 'body';
    body.innerHTML = `<div class="name">${escapeHtml(item.name)}</div>
      <div class="sub">${escapeHtml(item.callsign || '')}</div>
      ${item.traits?.Role ? `<div class="role">${escapeHtml(item.traits.Role)}</div>` : ''}
      ${item.roleCategory ? `<div class="role-category">${escapeHtml(item.roleCategory)}</div>` : ''}`;
    card.appendChild(body);

    card.addEventListener('click', () => openDetail(item));
    el.grid.appendChild(card);
  }

  updateToolbar();
}

function updateToolbar() {
  el.importBtn.textContent = `Import Selected (${state.selected.size})`;
  el.importBtn.disabled = state.selected.size === 0;
  el.deleteBtn.textContent = `Delete Selected (${state.selected.size})`;
  el.deleteBtn.disabled = state.selected.size === 0;
  const notImported = state.visibleItems.filter((i) => !i.imported && i.importable);
  el.selectAll.checked = notImported.length > 0 && notImported.every((i) => state.selected.has(i.id));
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

/** item.when is generate-npc.py's "%Y-%m-%d %H:%M:%S" local-time string - parse
 * it explicitly rather than via `new Date(str)`, whose handling of a
 * space-separated (non-ISO) timestamp isn't reliable across engines. */
function formatGeneratedWhen(when) {
  if (!when) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(when);
  if (!m) return `Generated ${when}`;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(date.getTime())) return `Generated ${when}`;
  return `Generated ${date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;
}

function openDetail(item) {
  // portraitUrl/tokenUrl carry the source file's mtime as a version query
  // param (see itemView in server.js), so a Regenerate since this item was
  // last shown naturally produces a different src here - no manual
  // cache-busting needed.
  el.detailPortrait.src = item.portraitUrl || '';
  el.detailToken.src = item.tokenUrl || '';
  el.detailName.textContent = item.name;
  el.detailSub.textContent = [item.roleCategory, item.traits?.Role, item.traits?.Faction]
    .filter(Boolean)
    .join(' — ');
  el.detailGenerated.textContent = formatGeneratedWhen(item.when);
  el.detailTraits.innerHTML = Object.entries(item.traits || {})
    .filter(([k]) => !['name', 'Given names', 'Family names'].includes(k))
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join('');

  // Only recorded by generate-npc.py versions new enough to save it - older
  // manifest entries just hide this section rather than show it empty.
  el.detailPrompts.hidden = !item.portraitPrompt && !item.tokenPrompt;
  el.detailPortraitPrompt.textContent = item.portraitPrompt || '';
  el.detailTokenPrompt.textContent = item.tokenPrompt || '';

  state.detailItemId = item.id;
  state.regenLastStatus = item.regenStatus ?? null;
  document.querySelector('input[name="regen-which"][value="both"]').checked = true;
  document.querySelector('input[name="regen-seed-mode"][value="same"]').checked = true;
  el.regenSeedInput.disabled = true;
  el.regenSeedInput.value = '';
  renderRegenPanel(item);

  el.overlay.hidden = false;
}

/** The detail overlay's "Regenerate art" panel, for whichever item is open. */
function renderRegenPanel(item) {
  const supported = typeof item.seed === 'number';
  el.regenPanel.hidden = !supported;
  if (!supported) return;

  el.regenCurrentSeed.textContent = `Current seed: ${item.seed}`;

  const running = item.regenStatus === 'running';
  const seedMode = document.querySelector('input[name="regen-seed-mode"]:checked')?.value;
  el.regenBtn.disabled = running;
  el.regenBtn.textContent = running ? 'Regenerating…' : 'Regenerate';
  for (const radio of document.querySelectorAll('#regen-panel input[type="radio"]')) radio.disabled = running;
  el.regenSeedInput.disabled = running || seedMode !== 'specific';

  const justFinished = item.regenStatus === 'done' && state.regenLastStatus !== 'done';
  if (running) {
    el.regenStatus.textContent = 'Regenerating… this can take a few minutes (ComfyUI must be running).';
  } else if (item.regenStatus === 'error') {
    el.regenStatus.textContent = `Failed: ${item.regenError || 'unknown error'}`;
  } else if (justFinished) {
    el.regenStatus.textContent = `Done — new seed ${item.seed}.`;
  } else if (item.regenStatus !== 'done') {
    el.regenStatus.textContent = '';
  }

  // portraitUrl/tokenUrl already changed (their &v= mtime stamp) the moment
  // the regen job finished and rewrote the file, so just reassigning them
  // here picks up the new art - no manual cache-busting needed.
  if (justFinished) {
    if (item.portraitUrl) el.detailPortrait.src = item.portraitUrl;
    if (item.tokenUrl) el.detailToken.src = item.tokenUrl;
  }
  state.regenLastStatus = item.regenStatus ?? null;
}

for (const input of document.querySelectorAll('input[name="regen-seed-mode"]')) {
  input.addEventListener('change', () => {
    el.regenSeedInput.disabled = input.value !== 'specific';
    if (input.value === 'specific') el.regenSeedInput.focus();
  });
}

el.regenBtn.addEventListener('click', async () => {
  const id = state.detailItemId;
  if (!id) return;
  const which = document.querySelector('input[name="regen-which"]:checked')?.value || 'both';
  const seedMode = document.querySelector('input[name="regen-seed-mode"]:checked')?.value || 'same';
  const body = { id, which, seedMode };
  if (seedMode === 'specific') {
    const seed = Number(el.regenSeedInput.value);
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
      el.regenStatus.textContent = 'Enter a whole number seed between 0 and 4294967295.';
      return;
    }
    body.seed = seed;
  }

  el.regenBtn.disabled = true;
  el.regenBtn.textContent = 'Regenerating…';
  el.regenStatus.textContent = 'Starting…';
  try {
    const res = await fetch('/api/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) {
      el.regenStatus.textContent = `Couldn't start: ${result.reason || result.error || res.status}`;
      el.regenBtn.disabled = false;
      el.regenBtn.textContent = 'Regenerate';
      return;
    }
    el.regenStatus.textContent = 'Regenerating… this can take a few minutes (ComfyUI must be running).';
    await refreshItems();
    startPolling();
  } catch (err) {
    el.regenStatus.textContent = `Couldn't start: ${err.message}`;
    el.regenBtn.disabled = false;
    el.regenBtn.textContent = 'Regenerate';
  }
});

el.detailClose.addEventListener('click', () => {
  el.overlay.hidden = true;
  el.imageZoom.hidden = true;
  state.detailItemId = null;
});
el.overlay.addEventListener('click', (e) => {
  if (e.target === el.overlay) {
    el.overlay.hidden = true;
    el.imageZoom.hidden = true;
    state.detailItemId = null;
  }
});

function attachImageZoom(imgEl) {
  imgEl.addEventListener('mouseenter', () => {
    if (!imgEl.src) return;
    el.imageZoomImg.src = imgEl.src;
    el.imageZoomImg.alt = imgEl.alt;
    el.imageZoom.hidden = false;
  });
  imgEl.addEventListener('mouseleave', () => { el.imageZoom.hidden = true; });
}
attachImageZoom(el.detailPortrait);
attachImageZoom(el.detailToken);

el.selectAll.addEventListener('change', () => {
  const notImported = state.visibleItems.filter((i) => !i.imported && i.importable);
  if (el.selectAll.checked) notImported.forEach((i) => state.selected.add(i.id));
  else notImported.forEach((i) => state.selected.delete(i.id));
  render();
});

el.filterSearch.addEventListener('input', () => {
  state.search = el.filterSearch.value;
  render();
});

el.sortSelect.addEventListener('change', () => {
  state.sort = el.sortSelect.value;
  render();
});

el.addFilterBtn.addEventListener('click', () => {
  state.filters.push({ key: '', value: '' });
  renderFilterRows();
  render();
});

el.importBtn.addEventListener('click', async () => {
  const ids = [...state.selected];
  if (!ids.length) return;
  el.importBtn.disabled = true;
  const { results } = await api('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const skipped = results.filter((r) => !r.queued);
  el.status.textContent = skipped.length
    ? `Queued ${results.length - skipped.length}, skipped ${skipped.length} (${skipped.map((s) => s.reason).join('; ')})`
    : `Queued ${results.length} item(s) — waiting for Foundry to pick them up…`;
  state.selected.clear();
  await refreshItems();
  startPolling();
});

el.deleteBtn.addEventListener('click', async () => {
  const ids = [...state.selected];
  if (!ids.length) return;
  const names = ids.map((id) => state.items.find((i) => i.id === id)?.name || id);
  if (!(await confirmDelete(names))) return;

  el.deleteBtn.disabled = true;
  const { results } = await api('/api/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const failed = results.filter((r) => !r.deleted);
  el.status.textContent = failed.length
    ? `Deleted ${results.length - failed.length}, failed ${failed.length} (${failed.map((f) => f.reason).join('; ')})`
    : `Deleted ${results.length} item(s).`;
  state.selected.clear();
  await refreshItems();
});

el.detailDeleteBtn.addEventListener('click', async () => {
  const id = state.detailItemId;
  if (!id) return;
  const item = state.items.find((i) => i.id === id);
  const name = item?.name || id;
  if (!(await confirmDelete([name]))) return;

  const { results } = await api('/api/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [id] }),
  });
  const result = results[0];
  if (result?.deleted) {
    el.overlay.hidden = true;
    el.imageZoom.hidden = true;
    state.detailItemId = null;
    state.selected.delete(id);
    el.status.textContent = `Deleted "${name}".`;
    await refreshItems();
  } else {
    el.status.textContent = `Couldn't delete "${name}": ${result?.reason || 'unknown error'}`;
  }
});

/** Shared by the import flow and the regenerate-art flow - whichever queued something. */
function startPolling() {
  if (state.pollTimer) return;
  let ticks = 0;
  let sawImportPending = false;
  state.pollTimer = setInterval(async () => {
    ticks += 1;
    if (state.items.some((i) => i.jobStatus === 'queued' || i.jobStatus === 'sent')) sawImportPending = true;

    await refreshItems();
    if (state.detailItemId) {
      const openItem = state.items.find((i) => i.id === state.detailItemId);
      if (openItem) renderRegenPanel(openItem);
    }

    const stillPending = state.items.some((i) =>
      i.jobStatus === 'queued' || i.jobStatus === 'sent' || i.regenStatus === 'running');
    // 600 ticks (20 min) is just a safety net against a stuck/unreachable
    // ComfyUI - generate-npc.py's own per-image timeout defaults to 30 min.
    if (!stillPending || ticks > 600) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
      if (!stillPending && sawImportPending) el.status.textContent = 'Import complete.';
    }
  }, 2000);
}

/* ==================================================================== */
/* Tabs                                                                  */
/* ==================================================================== */

const tabState = { current: 'import' };

for (const btn of document.querySelectorAll('#tabs button')) {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
}

function switchTab(tab) {
  if (tab === tabState.current) return;
  tabState.current = tab;
  for (const btn of document.querySelectorAll('#tabs button')) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  }
  for (const panel of document.querySelectorAll('.tab-panel')) {
    panel.hidden = panel.id !== `tab-${tab}`;
  }
  if (tab === 'create' && !createState.tablesLoaded) loadOverrideTables();
  if (tab === 'traits') refreshTraitCandidates().catch((err) => {
    elTraits.status.textContent = `Failed to load: ${err.message}`;
  });
  if (tab === 'tables') {
    loadTables().catch((err) => {
      elTables.empty.hidden = false;
      elTables.empty.textContent = `Failed to load: ${err.message}`;
    });
    loadPresets().catch(() => { /* the preset list just stays empty on failure */ });
  }
}

/* ==================================================================== */
/* Create NPC                                                            */
/* ==================================================================== */

const createState = {
  overrideTables: [],
  tablesLoaded: false,
  overrides: [], // { table, value }
  pollTimer: null,
};

const elCreate = {
  count: document.getElementById('create-count'),
  seed: document.getElementById('create-seed'),
  name: document.getElementById('create-name'),
  pronouns: document.getElementById('create-pronouns'),
  server: document.getElementById('create-server'),
  portrait: document.getElementById('create-portrait'),
  token: document.getElementById('create-token'),
  keepRaw: document.getElementById('create-keep-raw'),
  overrideRows: document.getElementById('override-rows'),
  addOverrideBtn: document.getElementById('add-override'),
  dryRunBtn: document.getElementById('create-dry-run-btn'),
  generateBtn: document.getElementById('create-generate-btn'),
  status: document.getElementById('create-status'),
  log: document.getElementById('create-log'),
};

async function loadOverrideTables() {
  try {
    const { tables } = await api('/api/npc-tables');
    createState.overrideTables = tables;
    createState.tablesLoaded = true;
    renderOverrideRows();
  } catch (err) {
    elCreate.status.textContent = `Failed to load trait tables: ${err.message}`;
  }
}

function renderOverrideRows() {
  elCreate.overrideRows.innerHTML = '';
  createState.overrides.forEach((override, index) => {
    if (!override.table) override.table = createState.overrideTables[0] || '';

    const row = document.createElement('div');
    row.className = 'filter-row';

    const tableSelect = document.createElement('select');
    for (const t of createState.overrideTables) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      opt.selected = t === override.table;
      tableSelect.appendChild(opt);
    }
    tableSelect.addEventListener('change', () => { override.table = tableSelect.value; });
    row.appendChild(tableSelect);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'filter-value';
    valueInput.placeholder = 'value, e.g. "a field medic" or "in her sixties || young"';
    valueInput.value = override.value;
    valueInput.addEventListener('input', () => { override.value = valueInput.value; });
    row.appendChild(valueInput);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'filter-remove';
    remove.textContent = '×';
    remove.title = 'Remove override';
    remove.addEventListener('click', () => {
      createState.overrides.splice(index, 1);
      renderOverrideRows();
    });
    row.appendChild(remove);

    elCreate.overrideRows.appendChild(row);
  });
}

elCreate.addOverrideBtn.addEventListener('click', () => {
  createState.overrides.push({ table: '', value: '' });
  renderOverrideRows();
});

elCreate.count.addEventListener('input', () => {
  const single = Number(elCreate.count.value) === 1;
  elCreate.name.disabled = !single;
  if (!single) elCreate.name.value = '';
});

function createRequestBody(dryRun) {
  const count = Number(elCreate.count.value) || 1;
  const seed = elCreate.seed.value.trim() === '' ? null : Number(elCreate.seed.value);
  return {
    count,
    seed,
    name: elCreate.name.value.trim(),
    pronouns: elCreate.pronouns.value,
    server: elCreate.server.value.trim(),
    noPortrait: !elCreate.portrait.checked,
    noToken: !elCreate.token.checked,
    keepRawToken: elCreate.keepRaw.checked,
    overrides: createState.overrides.filter((o) => o.table && o.value.trim()),
    dryRun,
  };
}

async function startCreateJob(dryRun) {
  if (elCreate.portrait.checked === false && elCreate.token.checked === false) {
    elCreate.status.textContent = "Can't uncheck both portrait and token — nothing would be generated.";
    return;
  }
  elCreate.dryRunBtn.disabled = true;
  elCreate.generateBtn.disabled = true;
  elCreate.status.textContent = dryRun ? 'Rolling and building prompts…' : 'Starting…';
  elCreate.log.hidden = true;
  elCreate.log.textContent = '';

  try {
    const res = await fetch('/api/create-npc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createRequestBody(dryRun)),
    });
    const result = await res.json();
    if (!res.ok) {
      elCreate.status.textContent = `Couldn't start: ${result.reason || result.error || res.status}`;
      elCreate.dryRunBtn.disabled = false;
      elCreate.generateBtn.disabled = false;
      return;
    }
    pollCreateJob(result.jobId, dryRun);
  } catch (err) {
    elCreate.status.textContent = `Couldn't start: ${err.message}`;
    elCreate.dryRunBtn.disabled = false;
    elCreate.generateBtn.disabled = false;
  }
}

function pollCreateJob(jobId, dryRun) {
  if (createState.pollTimer) clearInterval(createState.pollTimer);
  let ticks = 0;
  createState.pollTimer = setInterval(async () => {
    ticks += 1;
    let job;
    try {
      job = await api(`/api/create-status?jobId=${encodeURIComponent(jobId)}`);
    } catch (err) {
      clearInterval(createState.pollTimer);
      createState.pollTimer = null;
      elCreate.status.textContent = `Lost track of the job: ${err.message}`;
      elCreate.dryRunBtn.disabled = false;
      elCreate.generateBtn.disabled = false;
      return;
    }

    elCreate.log.hidden = !job.log;
    elCreate.log.textContent = job.log || '';

    if (job.status === 'running') {
      elCreate.status.textContent = dryRun
        ? 'Rolling and building prompts…'
        : 'Generating… this can take a few minutes per image (ComfyUI must be running).';
      // 600 ticks (20 min) safety net, same as the import/regen poller.
      if (ticks > 600) {
        clearInterval(createState.pollTimer);
        createState.pollTimer = null;
      }
      return;
    }

    clearInterval(createState.pollTimer);
    createState.pollTimer = null;
    elCreate.dryRunBtn.disabled = false;
    elCreate.generateBtn.disabled = false;

    if (job.status === 'done') {
      elCreate.status.textContent = dryRun
        ? 'Preview complete — see the rolled NPC(s) and prompts below.'
        : 'Done — see the "Import Generated Art" tab for the new NPC(s).';
      if (!dryRun && state.category === 'npc') refreshItems();
    } else {
      elCreate.status.textContent = `Failed: ${job.error || 'unknown error'}`;
    }
  }, 2000);
}

elCreate.dryRunBtn.addEventListener('click', () => startCreateJob(true));
elCreate.generateBtn.addEventListener('click', () => startCreateJob(false));

/* ==================================================================== */
/* Trait imports                                                         */
/* ==================================================================== */

const traitState = {
  candidates: [],
  visible: [],
  selected: new Set(),
  search: '',
  tableFilter: '',
  sort: 'table',
};

const elTraits = {
  list: document.getElementById('trait-list'),
  empty: document.getElementById('trait-empty'),
  status: document.getElementById('trait-status'),
  importBtn: document.getElementById('trait-import-btn'),
  selectAll: document.getElementById('trait-select-all'),
  search: document.getElementById('trait-search'),
  tableFilter: document.getElementById('trait-table-filter'),
  sortSelect: document.getElementById('trait-sort-select'),
  overlay: document.getElementById('trait-detail-overlay'),
  detailClose: document.getElementById('trait-detail-close'),
  detailTable: document.getElementById('trait-detail-table'),
  detailSource: document.getElementById('trait-detail-source'),
  detailBullet: document.getElementById('trait-detail-bullet'),
  detailPlacement: document.getElementById('trait-detail-placement'),
  detailBookkeeping: document.getElementById('trait-detail-bookkeeping'),
  detailNotes: document.getElementById('trait-detail-notes'),
};

async function refreshTraitCandidates() {
  const { candidates } = await api('/api/trait-candidates');
  traitState.candidates = candidates;
  for (const id of [...traitState.selected]) {
    if (!candidates.some((c) => candidateKey(c) === id && !c.imported)) traitState.selected.delete(id);
  }
  renderTraitTableFilter();
  renderTraits();
}

function candidateKey(c) {
  return `${c.file}::${c.id}`;
}

function renderTraitTableFilter() {
  const tables = [...new Set(traitState.candidates.map((c) => c.table))].sort();
  const current = elTraits.tableFilter.value;
  elTraits.tableFilter.innerHTML = '<option value="">All tables</option>'
    + tables.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  if (tables.includes(current)) elTraits.tableFilter.value = current;
}

function traitMatchesFilters(c) {
  if (traitState.tableFilter && c.table !== traitState.tableFilter) return false;
  const search = traitState.search.trim().toLowerCase();
  if (!search) return true;
  return [c.bullet, c.sourceImage, c.notes, c.table].filter(Boolean).join('\n').toLowerCase().includes(search);
}

function compareTraitCandidates(a, b) {
  if (traitState.sort === 'when-asc') return (a.generatedAt || '').localeCompare(b.generatedAt || '');
  if (traitState.sort === 'table') {
    return a.table.localeCompare(b.table) || (b.generatedAt || '').localeCompare(a.generatedAt || '');
  }
  return (b.generatedAt || '').localeCompare(a.generatedAt || ''); // when-desc, the default
}

function renderTraits() {
  elTraits.list.innerHTML = '';
  traitState.visible = traitState.candidates.filter(traitMatchesFilters).sort(compareTraitCandidates);
  elTraits.empty.hidden = traitState.visible.length > 0;
  elTraits.empty.textContent = traitState.candidates.length
    ? 'No candidates match the current filters.'
    : 'No staged trait candidates yet — run the npc-trait-import skill, then reload.';

  for (const c of traitState.visible) {
    const key = candidateKey(c);
    const row = document.createElement('div');
    row.className = 'trait-row' + (c.imported ? ' imported' : '');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = traitState.selected.has(key);
    check.disabled = c.imported;
    check.addEventListener('click', (e) => e.stopPropagation());
    check.addEventListener('change', () => {
      if (check.checked) traitState.selected.add(key);
      else traitState.selected.delete(key);
      updateTraitToolbar();
    });
    row.appendChild(check);

    const badge = document.createElement('span');
    badge.className = 'badge table-badge';
    badge.textContent = c.table;
    row.appendChild(badge);

    const bullet = document.createElement('span');
    bullet.className = 'trait-bullet';
    bullet.textContent = c.bullet.length > 160 ? `${c.bullet.slice(0, 160)}…` : c.bullet;
    row.appendChild(bullet);

    if (c.generatedAt) {
      const generatedBadge = document.createElement('span');
      generatedBadge.className = 'badge date-badge';
      generatedBadge.textContent = new Date(c.generatedAt).toLocaleDateString();
      row.appendChild(generatedBadge);
    }

    if (c.imported) {
      const importedBadge = document.createElement('span');
      importedBadge.className = 'badge';
      importedBadge.textContent = 'Imported';
      row.appendChild(importedBadge);
      if (c.importedAt) {
        const importedDateBadge = document.createElement('span');
        importedDateBadge.className = 'badge date-badge';
        importedDateBadge.textContent = `on ${new Date(c.importedAt).toLocaleDateString()}`;
        row.appendChild(importedDateBadge);
      }
    }

    row.addEventListener('click', () => openTraitDetail(c));
    elTraits.list.appendChild(row);
  }

  updateTraitToolbar();
}

function updateTraitToolbar() {
  elTraits.importBtn.textContent = `Import Selected (${traitState.selected.size})`;
  elTraits.importBtn.disabled = traitState.selected.size === 0;
  const notImported = traitState.visible.filter((c) => !c.imported);
  elTraits.selectAll.checked = notImported.length > 0
    && notImported.every((c) => traitState.selected.has(candidateKey(c)));
}

function openTraitDetail(c) {
  elTraits.detailTable.textContent = c.table;
  elTraits.detailSource.textContent = c.sourceImage ? `From: ${c.sourceImage}` : '';
  elTraits.detailBullet.textContent = c.bullet;
  elTraits.detailPlacement.textContent = c.placementHint || '—';
  elTraits.detailBookkeeping.textContent = c.bookkeepingNote || '—';
  elTraits.detailNotes.textContent = c.notes || '—';
  elTraits.overlay.hidden = false;
}

elTraits.detailClose.addEventListener('click', () => { elTraits.overlay.hidden = true; });
elTraits.overlay.addEventListener('click', (e) => {
  if (e.target === elTraits.overlay) elTraits.overlay.hidden = true;
});

elTraits.search.addEventListener('input', () => {
  traitState.search = elTraits.search.value;
  renderTraits();
});
elTraits.tableFilter.addEventListener('change', () => {
  traitState.tableFilter = elTraits.tableFilter.value;
  renderTraits();
});
elTraits.sortSelect.addEventListener('change', () => {
  traitState.sort = elTraits.sortSelect.value;
  renderTraits();
});
elTraits.selectAll.addEventListener('change', () => {
  const notImported = traitState.visible.filter((c) => !c.imported);
  if (elTraits.selectAll.checked) notImported.forEach((c) => traitState.selected.add(candidateKey(c)));
  else notImported.forEach((c) => traitState.selected.delete(candidateKey(c)));
  renderTraits();
});

elTraits.importBtn.addEventListener('click', async () => {
  const items = [...traitState.selected].map((key) => {
    const [file, id] = key.split('::');
    return { file, id };
  });
  if (!items.length) return;
  elTraits.importBtn.disabled = true;
  const { results } = await api('/api/trait-candidates/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  const failed = results.filter((r) => !r.imported);
  elTraits.status.textContent = failed.length
    ? `Imported ${results.length - failed.length}, failed ${failed.length} (${failed.map((f) => f.reason).join('; ')})`
    : `Imported ${results.length} candidate(s) into npc-generator-tables.md.`;
  traitState.selected.clear();
  await refreshTraitCandidates();
});

loadCategories().catch((err) => {
  el.status.textContent = `Failed to load: ${err.message}`;
});

/* ==================================================================== */
/* Tables (per-bullet enable/disable)                                   */
/* ==================================================================== */

const tablesState = {
  tables: [],
  selectedTable: null,
  presets: [],
  pendingPreset: null, // the parsed preset object currently shown in the preview, or null
};

const elTables = {
  headingList: document.getElementById('table-heading-list'),
  bulletHeading: document.getElementById('table-bullet-heading'),
  bulletList: document.getElementById('table-bullet-list'),
  empty: document.getElementById('tables-empty'),
  presetList: document.getElementById('preset-list'),
  saveBtn: document.getElementById('preset-save-btn'),
  importInput: document.getElementById('preset-import-input'),
  preview: document.getElementById('preset-preview'),
  previewSummary: document.getElementById('preset-preview-summary'),
  previewList: document.getElementById('preset-preview-list'),
  applyBtn: document.getElementById('preset-apply-btn'),
  cancelBtn: document.getElementById('preset-cancel-btn'),
};

async function loadTables() {
  const { tables } = await api('/api/table-bullets');
  tablesState.tables = tables;
  elTables.empty.hidden = tables.length > 0;
  if (!tablesState.selectedTable || !tables.some((t) => t.name === tablesState.selectedTable)) {
    tablesState.selectedTable = tables[0]?.name ?? null;
  }
  renderTableHeadingList();
  renderTableBullets();
}

function renderTableHeadingList() {
  elTables.headingList.innerHTML = '';
  for (const table of tablesState.tables) {
    const disabledCount = table.bullets.filter((b) => !b.enabled).length;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'table-heading-row' + (table.name === tablesState.selectedTable ? ' active' : '');
    row.textContent = disabledCount
      ? `${table.name} (${table.bullets.length}, ${disabledCount} disabled)`
      : `${table.name} (${table.bullets.length})`;
    row.addEventListener('click', () => {
      tablesState.selectedTable = table.name;
      renderTableHeadingList();
      renderTableBullets();
    });
    elTables.headingList.appendChild(row);
  }
}

function renderTableBullets() {
  const table = tablesState.tables.find((t) => t.name === tablesState.selectedTable);
  elTables.bulletHeading.textContent = table ? table.name : 'Select a table';
  elTables.bulletList.innerHTML = '';
  if (!table) return;
  for (const bullet of table.bullets) {
    const row = document.createElement('label');
    row.className = 'table-bullet-row';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = bullet.enabled;
    check.addEventListener('change', () => toggleBullet(table.name, bullet, check));
    row.appendChild(check);

    const weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.className = 'weight-input';
    weightInput.min = '1';
    weightInput.step = '1';
    weightInput.value = String(bullet.weight);
    weightInput.title = 'Weight (relative roll chance)';
    weightInput.addEventListener('change', () => setBulletWeight(table.name, bullet, weightInput));
    row.appendChild(weightInput);

    const text = document.createElement('span');
    text.className = 'table-bullet-text';
    text.textContent = bullet.text;
    row.appendChild(text);
    elTables.bulletList.appendChild(row);
  }
}

async function toggleBullet(tableName, bullet, checkboxEl) {
  const nextEnabled = checkboxEl.checked;
  checkboxEl.disabled = true;
  try {
    await api('/api/table-bullets/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: tableName, text: bullet.text, enabled: nextEnabled }),
    });
    bullet.enabled = nextEnabled;
    renderTableHeadingList(); // the disabled-count badge changed
  } catch (err) {
    checkboxEl.checked = !nextEnabled; // revert - the write failed
    alert(`Couldn't update that bullet: ${err.message}`);
  } finally {
    checkboxEl.disabled = false;
  }
}

async function setBulletWeight(tableName, bullet, inputEl) {
  const nextWeight = Math.trunc(Number(inputEl.value));
  if (!Number.isInteger(nextWeight) || nextWeight < 1) {
    inputEl.value = bullet.weight;
    alert('Weight must be a whole number of 1 or more.');
    return;
  }
  if (nextWeight === bullet.weight) return;
  inputEl.disabled = true;
  try {
    await api('/api/table-bullets/set-weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: tableName, text: bullet.text, weight: nextWeight }),
    });
    bullet.weight = nextWeight;
  } catch (err) {
    inputEl.value = bullet.weight;
    alert(`Couldn't update that bullet's weight: ${err.message}`);
  } finally {
    inputEl.disabled = false;
  }
}

/* ==================================================================== */
/* Presets                                                               */
/* ==================================================================== */

async function loadPresets() {
  const { presets } = await api('/api/presets');
  tablesState.presets = presets;
  renderPresetList();
}

function renderPresetList() {
  elTables.presetList.innerHTML = '';
  if (!tablesState.presets.length) {
    elTables.presetList.textContent = 'No saved presets yet.';
    return;
  }
  for (const preset of tablesState.presets) {
    const row = document.createElement('div');
    row.className = 'preset-row';

    const name = document.createElement('span');
    name.className = 'preset-name';
    name.textContent = `${preset.name} (${preset.count})`;
    row.appendChild(name);

    const date = document.createElement('span');
    date.className = 'preset-date';
    date.textContent = new Date(preset.created).toLocaleDateString();
    row.appendChild(date);

    const download = document.createElement('a');
    download.className = 'preset-download';
    download.href = `/api/presets/export?slug=${encodeURIComponent(preset.slug)}`;
    download.textContent = 'Download';
    download.download = `${preset.slug}.json`;
    row.appendChild(download);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deletePresetRow(preset.slug));
    row.appendChild(del);

    elTables.presetList.appendChild(row);
  }
}

async function deletePresetRow(slug) {
  if (!confirm('Delete this preset? This cannot be undone.')) return;
  await api('/api/presets/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  await loadPresets();
}

elTables.saveBtn.addEventListener('click', async () => {
  const name = prompt('Name this preset:');
  if (!name || !name.trim()) return;
  try {
    await api('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    await loadPresets();
  } catch (err) {
    alert(`Couldn't save preset: ${err.message}`);
  }
});

elTables.importInput.addEventListener('change', async () => {
  const file = elTables.importInput.files[0];
  elTables.importInput.value = '';
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (err) {
    alert(`That file isn't valid JSON: ${err.message}`);
    return;
  }
  let diff;
  try {
    diff = await api('/api/presets/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });
  } catch (err) {
    alert(`Couldn't preview that preset: ${err.message}`);
    return;
  }
  tablesState.pendingPreset = parsed;
  renderPresetPreview(diff);
});

function renderPresetPreview(diff) {
  elTables.preview.hidden = false;
  const changing = diff.willEnable.length + diff.willDisable.length + diff.willReweight.length;
  elTables.previewSummary.textContent =
    `Will change ${changing} bullet(s): ${diff.willEnable.length} to enable, `
    + `${diff.willDisable.length} to disable, ${diff.willReweight.length} to reweight. `
    + `Already matching ${diff.alreadyMatching.length}, not found locally ${diff.notFound.length}.`;
  elTables.previewList.innerHTML = '';
  for (const { table, text, weight } of diff.willEnable) {
    const li = document.createElement('li');
    li.textContent = `${table}: enable "${text}" (x${weight})`;
    elTables.previewList.appendChild(li);
  }
  for (const { table, text, weight } of diff.willReweight) {
    const li = document.createElement('li');
    li.textContent = `${table}: reweight "${text}" to x${weight}`;
    elTables.previewList.appendChild(li);
  }
  for (const { table, text } of diff.willDisable) {
    const li = document.createElement('li');
    li.textContent = `${table}: disable "${text}"`;
    elTables.previewList.appendChild(li);
  }
  for (const { table, text } of diff.notFound) {
    const li = document.createElement('li');
    li.className = 'preset-preview-not-found';
    li.textContent = `${table}: ${text} (not found locally)`;
    elTables.previewList.appendChild(li);
  }
}

elTables.applyBtn.addEventListener('click', async () => {
  if (!tablesState.pendingPreset) return;
  try {
    await api('/api/presets/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tablesState.pendingPreset),
    });
  } catch (err) {
    alert(`Couldn't apply preset: ${err.message}`);
    return;
  }
  tablesState.pendingPreset = null;
  elTables.preview.hidden = true;
  await loadTables();
});

elTables.cancelBtn.addEventListener('click', () => {
  tablesState.pendingPreset = null;
  elTables.preview.hidden = true;
});
