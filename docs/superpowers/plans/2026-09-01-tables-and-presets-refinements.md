# Tables & Presets Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four follow-up refinements to the Import GUI's Trait Imports/Tables/Presets features shipped in `docs/superpowers/plans/2026-09-01-npc-tables-editor-and-presets.md`: default the Trait Imports sort to "Table", let the Tables tab edit each bullet's roll weight in place, fix the low-contrast preset "Download" link in dark mode, and change presets to snapshot every table's full selected set (instead of just the disabled bullets) so a preset stays correct as new bullets get added later.

**Architecture:** Extends the existing two pure Node modules (`lib/tableBullets.js`, `lib/presets.js`) with one new function each, adds one new `server.js` route, and updates the existing vanilla-JS Tables/Presets client code and its CSS. No new files, no new dependencies. The preset JSON format changes from a disabled-bullets delta to a full per-table selected-set snapshot — a deliberate breaking change (see Global Constraints).

**Tech Stack:** Same as the base feature — Node.js stdlib only, Node's built-in `node:test` + `node:assert/strict`, vanilla JS/CSS on the client.

**Spec:** This plan has no separate spec doc — it implements four scoped requests from the project owner, gathered and clarified directly in conversation (see Global Constraints for the specific decisions that were confirmed before writing this plan).

## Global Constraints

- Route/verb style matches `server.js`'s existing convention exactly: exact-string `url.pathname ===` matches, actions expressed as `POST /api/<noun>/<verb>`, reads as `GET` with query strings — the same convention the base Tables/Presets feature established.
- Weight is always a positive integer (>= 1). A weight of 1 is never written as `x1` — it's represented by a bare `- text` line, exactly like every plain bullet in `npc-generator-tables.md` already is.
- **This plan supersedes** the base feature's preset design constraint ("a preset only ever disables bullets it names; applying one never re-enables anything it doesn't mention"). The new rule, confirmed with the project owner: a preset's `selected` object has one key for every table that existed in `npc-generator-tables.md` when it was saved — even a table with zero enabled bullets at save time gets an empty-array key. Applying a preset makes every *covered* table (every key present in `selected`) match the preset exactly: it enables/re-weights the bullets it lists, and disables anything else in that same table that's currently enabled. A table with no key at all (because it didn't exist yet when the preset was saved) is left completely untouched — this is what keeps an old preset safe to apply after whole new tables get added.
- `/api/presets/apply` still re-diffs against the live file rather than trusting a client-supplied preview (unchanged from the base design).
- No migration path for presets saved under the old `{ disabled: {...} }` format — confirmed as an acceptable clean break. `listPresets` will report `count: 0` for an old-format file (no `selected` key, not an error), and `/api/presets/import`/`/api/presets/apply` will reject one with `400` ("missing \"selected\""). Any real preset files already saved under the old format should be deleted and re-saved once this plan lands.
- Tests never touch the real `config.json`, `npc-generator-tables.md`, or presets directory — every test spins up its own fixture directory and a real `server.js` child process pointed at it via the existing `test/helpers/testServer.js`, then tears both down.
- Run the whole suite at any point with (the plain directory form, `node --test import-gui-server/test/`, does not work in this environment — it errors immediately with `test server ... did not become ready` because Node treats the bare directory as a single test file):

```bash
node --test "import-gui-server/test/*.test.js" "import-gui-server/test/**/*.test.js"
```

---

## File Structure

- `import-gui-server/lib/tableBullets.js` (modify) — add `setBulletWeightInText`/`setBulletWeightOnDisk`.
- `import-gui-server/lib/presets.js` (modify) — replace `snapshotDisabled` with `snapshotSelected`; rewrite `diffPresetAgainstTables` for whitelist semantics; update `listPresets`'s count.
- `import-gui-server/server.js` (modify) — new `/api/table-bullets/set-weight` route; update the three preset routes (`POST /api/presets`, `POST /api/presets/import`, `POST /api/presets/apply`) for the new `selected` format.
- `import-gui-server/public/index.html` (modify) — Trait Imports sort-select default.
- `import-gui-server/public/app.js` (modify) — Trait Imports sort default; Tables tab weight input; preset preview rendering for the new diff shape; a CSS class on the preset download link.
- `import-gui-server/public/style.css` (modify) — weight-input styling (replacing the old static weight badge); preset-download link contrast fix.
- `import-gui-server/test/tableBullets.test.js` (modify) — add `setBulletWeightInText` tests.
- `import-gui-server/test/tableBullets.fs.test.js` (modify) — add `setBulletWeightOnDisk` tests.
- `import-gui-server/test/api.tableBullets.test.js` (modify) — add `/api/table-bullets/set-weight` route tests.
- `import-gui-server/test/presets.test.js` (modify — full rewrite) — `snapshotSelected`/new `diffPresetAgainstTables` tests.
- `import-gui-server/test/presets.fs.test.js` (modify — full rewrite) — disk wrapper tests against the new `selected` shape.
- `import-gui-server/test/api.presets.test.js` (modify — full rewrite) — route tests against the new format and whitelist apply behavior.
- `README.md` (modify) — describe weight editing and the new preset semantics.

---

### Task 1: Trait Imports — default "Sort by" to Table

**Files:**
- Modify: `import-gui-server/public/index.html` (`#trait-sort-select`)
- Modify: `import-gui-server/public/app.js` (`traitState.sort`)

**Interfaces:**
- Consumes: the existing `traitState.sort`/`compareTraitCandidates()`/`renderTraits()` machinery (unchanged, no other task touches this).
- Produces: nothing new — this only changes a default value.

- [ ] **Step 1: Change the default-selected option in `index.html`**

Find:

```html
    <label class="sort-by">
      Sort by
      <select id="trait-sort-select">
        <option value="when-desc" selected>Newest first</option>
        <option value="when-asc">Oldest first</option>
        <option value="table">Table</option>
      </select>
    </label>
```

Replace with:

```html
    <label class="sort-by">
      Sort by
      <select id="trait-sort-select">
        <option value="when-desc">Newest first</option>
        <option value="when-asc">Oldest first</option>
        <option value="table" selected>Table</option>
      </select>
    </label>
```

- [ ] **Step 2: Change the default in `app.js`'s `traitState`**

Find:

```js
const traitState = {
  candidates: [],
  visible: [],
  selected: new Set(),
  search: '',
  tableFilter: '',
  sort: 'when-desc',
};
```

Replace with:

```js
const traitState = {
  candidates: [],
  visible: [],
  selected: new Set(),
  search: '',
  tableFilter: '',
  sort: 'table',
};
```

- [ ] **Step 3: Verify manually against a fixture server**

There's no browser test tooling in this repo, so verify by hand against a real server pointed at a throwaway fixture — never the real `config.json`/`npc-generator-tables.md`.

In PowerShell, from `import-gui-server/`:

```powershell
$dir = New-Item -ItemType Directory -Path "$env:TEMP\sort-default-check" -Force
"## Outfit`n- a jacket`n`n## Gear`n- nothing at all`n" | Set-Content "$dir\npc-generator-tables.md"
New-Item -ItemType Directory -Path "$dir\FoundryData" -Force | Out-Null
New-Item -ItemType Directory -Path "$dir\staged-imports" -Force | Out-Null
"{}" | Set-Content "$dir\manifest.json"
@'
{
  "generated_at": "2026-08-20T10:00:00.000Z",
  "entries": [
    { "id": "a", "table": "Gear", "bullet": "a compact hold-out pistol", "imported": false },
    { "id": "b", "table": "Outfit", "bullet": "a scuffed leather jacket", "imported": false }
  ]
}
'@ | Set-Content "$dir\staged-imports\batch1.json"
@{
  port = 5195; host = "127.0.0.1"; secret = ""
  npcManifestPath = "$dir\manifest.json"
  foundryDataRoot = "$dir\FoundryData"
  npcTablesPath = "$dir\npc-generator-tables.md"
} | ConvertTo-Json | Set-Content "$dir\config.json"
$env:IMPORT_GUI_CONFIG = "$dir\config.json"
node server.js
```

With that running, open `http://127.0.0.1:5195`, click **Trait Imports**, and confirm:

1. The "Sort by" dropdown already shows "Table" selected, with no manual change needed.
2. The two candidate rows are grouped/ordered by table name ("Gear" before "Outfit").

Stop the server (Ctrl+C) and remove `$env:IMPORT_GUI_CONFIG` when done:

```powershell
Remove-Item Env:\IMPORT_GUI_CONFIG
```

- [ ] **Step 4: Commit**

```bash
git add import-gui-server/public/index.html import-gui-server/public/app.js
git commit -m "feat: default the Trait Imports sort to Table"
```

---

### Task 2: `lib/tableBullets.js` — per-bullet weight editing

**Files:**
- Modify: `import-gui-server/lib/tableBullets.js`
- Modify: `import-gui-server/test/tableBullets.test.js`
- Modify: `import-gui-server/test/tableBullets.fs.test.js`

**Interfaces:**
- Consumes: `matchBulletLine`, `splitWeight`, `HEADING_RE` (all already private to this module).
- Produces:
  - `setBulletWeightInText(fileText: string, tableName: string, bulletText: string, weight: number) -> { ok: true, text: string } | { ok: false, error: string }`
  - `setBulletWeightOnDisk(filePath: string, tableName: string, bulletText: string, weight: number) -> { ok: true } | { ok: false, error: string }`

  Both consumed by Task 3's route and Task 7's preset-apply route.

- [ ] **Step 1: Write the failing pure-logic tests**

In `import-gui-server/test/tableBullets.test.js`, find the top-of-file require:

```js
const { parseTableFile, toggleBulletInText } = require('../lib/tableBullets');
```

Replace with:

```js
const { parseTableFile, toggleBulletInText, setBulletWeightInText } = require('../lib/tableBullets');
```

Then append these tests to the end of the file:

```js
test('setBulletWeightInText changes an enabled bullet from weight 1 to a multiplier prefix', () => {
    const result = setBulletWeightInText(SAMPLE, 'Gear', 'nothing at all, hands loose and empty', 3);
    assert.equal(result.ok, true);
    assert.match(result.text, /^- x3 nothing at all, hands loose and empty$/m);
    const reparsed = parseTableFile(result.text);
    const bullet = reparsed.find((t) => t.name === 'Gear').bullets.find((b) => b.text === 'nothing at all, hands loose and empty');
    assert.equal(bullet.weight, 3);
});

test('setBulletWeightInText changes a weighted bullet back down to weight 1, dropping the xN prefix', () => {
    const result = setBulletWeightInText(SAMPLE, 'Outfit', 'nondescript grey work coveralls', 1);
    assert.equal(result.ok, true);
    assert.match(result.text, /^- nondescript grey work coveralls$/m);
});

test("setBulletWeightInText preserves a disabled bullet's comment wrapper while changing its weight", () => {
    const result = setBulletWeightInText(SAMPLE, 'Outfit',
        'a graffiti-tagged cropped t-shirt and cut-off shorts || civ', 2);
    assert.equal(result.ok, true);
    assert.match(result.text, /<!-- - x2 a graffiti-tagged cropped t-shirt and cut-off shorts \|\| civ -->/);
    const reparsed = parseTableFile(result.text);
    const bullet = reparsed.find((t) => t.name === 'Outfit')
        .bullets.find((b) => b.text === 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ');
    assert.equal(bullet.enabled, false);
    assert.equal(bullet.weight, 2);
});

test('setBulletWeightInText is a no-op when the bullet is already at that weight', () => {
    const result = setBulletWeightInText(SAMPLE, 'Outfit', 'nondescript grey work coveralls', 4);
    assert.equal(result.ok, true);
    assert.equal(result.text, SAMPLE);
});

test('setBulletWeightInText returns ok:false for a bullet that does not exist under that heading', () => {
    const result = setBulletWeightInText(SAMPLE, 'Outfit', 'a suit of powered armor', 2);
    assert.equal(result.ok, false);
    assert.match(result.error, /no bullet matching/);
});
```

(`SAMPLE` is the constant already defined near the top of this file by the base feature's tests — it has `'nondescript grey work coveralls'` at weight 4 via an `x4` prefix, which is what the no-op test relies on.)

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test import-gui-server/test/tableBullets.test.js`

Expected: FAIL — `setBulletWeightInText is not a function`.

- [ ] **Step 3: Implement `setBulletWeightInText`/`setBulletWeightOnDisk`**

In `import-gui-server/lib/tableBullets.js`, find `toggleBulletInText`'s closing brace and the `readTables` function after it:

```js
function toggleBulletInText(fileText, tableName, bulletText, enabled) {
    const lines = fileText.split('\n');
    let inTarget = false;
    for (let i = 0; i < lines.length; i++) {
        const heading = lines[i].match(HEADING_RE);
        if (heading) {
            inTarget = heading[1] === tableName;
            continue;
        }
        if (!inTarget) continue;
        const bullet = matchBulletLine(lines[i]);
        if (!bullet) continue;
        const { text } = splitWeight(bullet.raw);
        if (text !== bulletText) continue;

        if (bullet.enabled === enabled) return { ok: true, text: fileText }; // already in the requested state

        lines[i] = enabled ? `- ${bullet.raw}` : `<!-- - ${bullet.raw} -->`;
        return { ok: true, text: lines.join('\n') };
    }
    return { ok: false, error: `no bullet matching that text under "## ${tableName}"` };
}

function readTables(filePath) {
```

Replace with:

```js
function toggleBulletInText(fileText, tableName, bulletText, enabled) {
    const lines = fileText.split('\n');
    let inTarget = false;
    for (let i = 0; i < lines.length; i++) {
        const heading = lines[i].match(HEADING_RE);
        if (heading) {
            inTarget = heading[1] === tableName;
            continue;
        }
        if (!inTarget) continue;
        const bullet = matchBulletLine(lines[i]);
        if (!bullet) continue;
        const { text } = splitWeight(bullet.raw);
        if (text !== bulletText) continue;

        if (bullet.enabled === enabled) return { ok: true, text: fileText }; // already in the requested state

        lines[i] = enabled ? `- ${bullet.raw}` : `<!-- - ${bullet.raw} -->`;
        return { ok: true, text: lines.join('\n') };
    }
    return { ok: false, error: `no bullet matching that text under "## ${tableName}"` };
}

/** The inverse of splitWeight(): weight 1 has no prefix, matching every plain bullet already in the file. */
function formatRaw(weight, text) {
    return weight === 1 ? text : `x${weight} ${text}`;
}

function setBulletWeightInText(fileText, tableName, bulletText, weight) {
    const lines = fileText.split('\n');
    let inTarget = false;
    for (let i = 0; i < lines.length; i++) {
        const heading = lines[i].match(HEADING_RE);
        if (heading) {
            inTarget = heading[1] === tableName;
            continue;
        }
        if (!inTarget) continue;
        const bullet = matchBulletLine(lines[i]);
        if (!bullet) continue;
        const { weight: currentWeight, text } = splitWeight(bullet.raw);
        if (text !== bulletText) continue;

        if (currentWeight === weight) return { ok: true, text: fileText }; // already at that weight

        const raw = formatRaw(weight, text);
        lines[i] = bullet.enabled ? `- ${raw}` : `<!-- - ${raw} -->`;
        return { ok: true, text: lines.join('\n') };
    }
    return { ok: false, error: `no bullet matching that text under "## ${tableName}"` };
}

function readTables(filePath) {
```

Then find `toggleBulletOnDisk` and the `module.exports` line right after it:

```js
function toggleBulletOnDisk(filePath, tableName, bulletText, enabled) {
    const fileText = fs.readFileSync(filePath, 'utf8');
    const result = toggleBulletInText(fileText, tableName, bulletText, enabled);
    if (!result.ok) return result;
    fs.writeFileSync(filePath, result.text);
    return { ok: true };
}

module.exports = { parseTableFile, toggleBulletInText, readTables, toggleBulletOnDisk };
```

Replace with:

```js
function toggleBulletOnDisk(filePath, tableName, bulletText, enabled) {
    const fileText = fs.readFileSync(filePath, 'utf8');
    const result = toggleBulletInText(fileText, tableName, bulletText, enabled);
    if (!result.ok) return result;
    fs.writeFileSync(filePath, result.text);
    return { ok: true };
}

function setBulletWeightOnDisk(filePath, tableName, bulletText, weight) {
    const fileText = fs.readFileSync(filePath, 'utf8');
    const result = setBulletWeightInText(fileText, tableName, bulletText, weight);
    if (!result.ok) return result;
    fs.writeFileSync(filePath, result.text);
    return { ok: true };
}

module.exports = {
    parseTableFile, toggleBulletInText, readTables, toggleBulletOnDisk,
    setBulletWeightInText, setBulletWeightOnDisk,
};
```

- [ ] **Step 4: Run it again and confirm it passes**

Run: `node --test import-gui-server/test/tableBullets.test.js`

Expected: PASS (13 tests, 0 failures — 8 from the base feature plus 5 new).

- [ ] **Step 5: Add the disk-wrapper tests**

In `import-gui-server/test/tableBullets.fs.test.js`, find the require line:

```js
const { readTables, toggleBulletOnDisk } = require('../lib/tableBullets');
```

Replace with:

```js
const { readTables, toggleBulletOnDisk, setBulletWeightOnDisk } = require('../lib/tableBullets');
```

Append these tests to the end of the file:

```js
test('setBulletWeightOnDisk writes the new weight back to the file', () => {
    withTempTablesFile('## Gear\n- nothing at all, hands loose and empty\n', (file) => {
        const result = setBulletWeightOnDisk(file, 'Gear', 'nothing at all, hands loose and empty', 5);
        assert.equal(result.ok, true);
        const onDisk = fs.readFileSync(file, 'utf8');
        assert.match(onDisk, /^- x5 nothing at all, hands loose and empty$/m);
    });
});

test('setBulletWeightOnDisk leaves the file byte-for-byte untouched when the bullet is not found', () => {
    withTempTablesFile('## Gear\n- nothing at all, hands loose and empty\n', (file) => {
        const before = fs.readFileSync(file, 'utf8');
        const result = setBulletWeightOnDisk(file, 'Gear', 'not a real bullet', 2);
        assert.equal(result.ok, false);
        assert.equal(fs.readFileSync(file, 'utf8'), before);
    });
});
```

- [ ] **Step 6: Run it and confirm it passes**

Run: `node --test import-gui-server/test/tableBullets.fs.test.js`

Expected: PASS (5 tests, 0 failures) immediately, since `setBulletWeightOnDisk` already exists from Step 3. If it fails, the bug is in Step 3's implementation.

- [ ] **Step 7: Commit**

```bash
git add import-gui-server/lib/tableBullets.js import-gui-server/test/tableBullets.test.js import-gui-server/test/tableBullets.fs.test.js
git commit -m "feat: add per-bullet weight editing to lib/tableBullets.js"
```

---

### Task 3: `server.js` route — `/api/table-bullets/set-weight`

**Files:**
- Modify: `import-gui-server/server.js`
- Modify: `import-gui-server/test/api.tableBullets.test.js`

**Interfaces:**
- Consumes: `tableBullets.setBulletWeightOnDisk` (Task 2).
- Produces: `POST /api/table-bullets/set-weight` body `{ table: string, text: string, weight: number }` `-> 200 { ok: true }` / `400 { error: string }`.

  Consumed by the client in Task 4 and directly by `lib` calls in Task 7's preset-apply route (not over HTTP — same pattern `toggleBulletOnDisk` already uses from the apply route).

- [ ] **Step 1: Write the failing tests**

Append to `import-gui-server/test/api.tableBullets.test.js`:

```js
test("POST /api/table-bullets/set-weight changes a bullet's weight, reflected on the next GET", async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5199 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/table-bullets/set-weight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'Outfit', text: 'nondescript grey work coveralls', weight: 6 }),
    });
    assert.equal(res.status, 200);

    const tablesRes = await fetch(`${server.baseUrl}/api/table-bullets`);
    const { tables } = await tablesRes.json();
    const outfit = tables.find((t) => t.name === 'Outfit');
    const bullet = outfit.bullets.find((b) => b.text === 'nondescript grey work coveralls');
    assert.equal(bullet.weight, 6);
});

test('POST /api/table-bullets/set-weight returns 400 for a non-integer weight', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5199 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/table-bullets/set-weight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'Outfit', text: 'nondescript grey work coveralls', weight: 0 }),
    });
    assert.equal(res.status, 400);
});

test('POST /api/table-bullets/set-weight returns 400 for a bullet that does not exist', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5199 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/table-bullets/set-weight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'Outfit', text: 'not a real bullet', weight: 2 }),
    });
    assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test import-gui-server/test/api.tableBullets.test.js`

Expected: FAIL — all three get 404s (no such route yet).

- [ ] **Step 3: Add the route**

In `import-gui-server/server.js`, find the `/api/table-bullets/toggle` route and the `/api/presets` GET route right after it:

```js
    if (url.pathname === '/api/table-bullets/toggle' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const { table, text, enabled } = body;
        if (typeof table !== 'string' || !table || typeof text !== 'string' || typeof enabled !== 'boolean') {
            return sendJson(res, 400, { error: 'table (string), text (string), and enabled (boolean) are required' });
        }
        const result = tableBullets.toggleBulletOnDisk(NPC_TABLES_PATH, table, text, enabled);
        if (!result.ok) return sendJson(res, 400, { error: result.error });
        return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === '/api/presets' && req.method === 'GET') {
```

Add the new route directly between them:

```js
    if (url.pathname === '/api/table-bullets/toggle' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const { table, text, enabled } = body;
        if (typeof table !== 'string' || !table || typeof text !== 'string' || typeof enabled !== 'boolean') {
            return sendJson(res, 400, { error: 'table (string), text (string), and enabled (boolean) are required' });
        }
        const result = tableBullets.toggleBulletOnDisk(NPC_TABLES_PATH, table, text, enabled);
        if (!result.ok) return sendJson(res, 400, { error: result.error });
        return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === '/api/table-bullets/set-weight' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const { table, text, weight } = body;
        if (typeof table !== 'string' || !table || typeof text !== 'string'
            || !Number.isInteger(weight) || weight < 1) {
            return sendJson(res, 400, { error: 'table (string), text (string), and weight (integer >= 1) are required' });
        }
        const result = tableBullets.setBulletWeightOnDisk(NPC_TABLES_PATH, table, text, weight);
        if (!result.ok) return sendJson(res, 400, { error: result.error });
        return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === '/api/presets' && req.method === 'GET') {
```

- [ ] **Step 4: Run it again and confirm it passes**

Run: `node --test import-gui-server/test/api.tableBullets.test.js`

Expected: PASS (7 tests, 0 failures — 4 from the base feature plus 3 new).

- [ ] **Step 5: Run the full suite to confirm nothing else broke**

Run: `node --test "import-gui-server/test/*.test.js" "import-gui-server/test/**/*.test.js"`

Expected: PASS, everything green.

- [ ] **Step 6: Commit**

```bash
git add import-gui-server/server.js import-gui-server/test/api.tableBullets.test.js
git commit -m "feat: add POST /api/table-bullets/set-weight"
```

---

### Task 4: Client — editable weight input on the Tables tab

**Files:**
- Modify: `import-gui-server/public/app.js`
- Modify: `import-gui-server/public/style.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: `POST /api/table-bullets/set-weight` (Task 3); `tablesState`, `elTables`, `renderTableBullets()` (all pre-existing).
- Produces: nothing new for later tasks — this is the leaf UI piece for item 2.

- [ ] **Step 1: Replace the static weight badge with an editable number input**

In `import-gui-server/public/app.js`, find `renderTableBullets()`:

```js
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
    if (bullet.weight > 1) {
      const badge = document.createElement('span');
      badge.className = 'badge weight-badge';
      badge.textContent = `x${bullet.weight}`;
      row.appendChild(badge);
    }
    const text = document.createElement('span');
    text.className = 'table-bullet-text';
    text.textContent = bullet.text;
    row.appendChild(text);
    elTables.bulletList.appendChild(row);
  }
}
```

Replace with:

```js
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
```

- [ ] **Step 2: Add the `setBulletWeight` handler**

Find `toggleBullet()`:

```js
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
```

Add directly after it:

```js
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
```

- [ ] **Step 3: Restyle the weight control in `style.css`**

Find:

```css
.table-bullet-row .weight-badge {
  position: static;
  background: #262a33;
  color: #7c8ba1;
  white-space: nowrap;
}
```

Replace with:

```css
.table-bullet-row .weight-input {
  width: 3rem;
  background: #262a33;
  border: 1px solid #363b47;
  color: #e6e6e6;
  padding: 0.15rem 0.3rem;
  border-radius: 4px;
  font-size: 0.8rem;
  text-align: center;
}
.table-bullet-row .weight-input:disabled { opacity: 0.5; }
```

- [ ] **Step 4: Verify manually against a fixture server**

In PowerShell, from `import-gui-server/`:

```powershell
$dir = New-Item -ItemType Directory -Path "$env:TEMP\weight-edit-check" -Force
"## Gear`n- x4 nondescript grey work coveralls`n- nothing at all, hands loose and empty`n" | Set-Content "$dir\npc-generator-tables.md"
New-Item -ItemType Directory -Path "$dir\FoundryData" -Force | Out-Null
"{}" | Set-Content "$dir\manifest.json"
@{
  port = 5194; host = "127.0.0.1"; secret = ""
  npcManifestPath = "$dir\manifest.json"
  foundryDataRoot = "$dir\FoundryData"
  npcTablesPath = "$dir\npc-generator-tables.md"
} | ConvertTo-Json | Set-Content "$dir\config.json"
$env:IMPORT_GUI_CONFIG = "$dir\config.json"
node server.js
```

With that running, open `http://127.0.0.1:5194`, click **Tables**, click **Gear**, and confirm:

1. The first bullet's weight input shows `4`; the second shows `1`.
2. Changing the second bullet's weight input to `2` and tabbing away produces no error.
3. Opening `$dir\npc-generator-tables.md` shows that line now reads `- x2 nothing at all, hands loose and empty`.
4. Reloading the page still shows `2` in that input.

Stop the server (Ctrl+C) and remove `$env:IMPORT_GUI_CONFIG` when done:

```powershell
Remove-Item Env:\IMPORT_GUI_CONFIG
```

- [ ] **Step 5: Add a README mention**

In `README.md`, find:

```markdown
- **Tables** — shows every bullet in every table of
  `npc-generator-tables.md` and lets you disable ones you don't want
  rolled, without deleting them, so they can be re-enabled later. Save
  your current set of disabled bullets as a named preset, download it, and
  hand the file to someone else; they can import it into their own copy of
  this GUI, preview exactly what it would change, and apply it.
```

Replace with:

```markdown
- **Tables** — shows every bullet in every table of
  `npc-generator-tables.md` and lets you disable ones you don't want
  rolled, without deleting them, so they can be re-enabled later, and edit
  each bullet's roll weight (multiplier) in place. Save your current set
  of disabled bullets as a named preset, download it, and hand the file to
  someone else; they can import it into their own copy of this GUI,
  preview exactly what it would change, and apply it.
```

- [ ] **Step 6: Commit**

```bash
git add import-gui-server/public/app.js import-gui-server/public/style.css README.md
git commit -m "feat: add editable per-bullet weight input to the Tables tab"
```

---

### Task 5: Presets — fix low-contrast "Download" link in dark mode

**Files:**
- Modify: `import-gui-server/public/app.js`
- Modify: `import-gui-server/public/style.css`

**Interfaces:** none — purely visual, no data or API changes.

- [ ] **Step 1: Add a class to the download link**

In `import-gui-server/public/app.js`, find `renderPresetList()`'s download-link block:

```js
    const download = document.createElement('a');
    download.href = `/api/presets/export?slug=${encodeURIComponent(preset.slug)}`;
    download.textContent = 'Download';
    download.download = `${preset.slug}.json`;
    row.appendChild(download);
```

Replace with:

```js
    const download = document.createElement('a');
    download.className = 'preset-download';
    download.href = `/api/presets/export?slug=${encodeURIComponent(preset.slug)}`;
    download.textContent = 'Download';
    download.download = `${preset.slug}.json`;
    row.appendChild(download);
```

- [ ] **Step 2: Style it as a readable chip instead of the browser's default link color**

In `import-gui-server/public/style.css`, find:

```css
.preset-name { flex: 1; }
.preset-date { color: #9aa1ad; font-size: 0.78rem; }
```

Replace with:

```css
.preset-name { flex: 1; }
.preset-date { color: #9aa1ad; font-size: 0.78rem; }
.preset-download {
  color: #8fb3ff;
  text-decoration: none;
  font-size: 0.82rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid #363b47;
  border-radius: 4px;
  background: #262a33;
}
.preset-download:hover, .preset-download:focus-visible { background: #2c2f38; border-color: #3d6ef0; }
.preset-download:visited { color: #8fb3ff; }
```

- [ ] **Step 3: Verify manually against a fixture server**

Reuse Task 4's fixture server (same `npc-generator-tables.md`/config pattern), or start a fresh one on a free port. With the server running, open the **Tables** tab, click **Save current as preset…**, name it anything, and confirm the resulting **Download** link now renders as a visible light-blue chip with a border against the dark row background, instead of the browser's default dark-blue/purple link color.

- [ ] **Step 4: Commit**

```bash
git add import-gui-server/public/app.js import-gui-server/public/style.css
git commit -m "fix: raise contrast on the preset Download link in dark mode"
```

---

### Task 6: `lib/presets.js` — full selected-set snapshot and whitelist diff

**Files:**
- Modify: `import-gui-server/lib/presets.js`
- Modify: `import-gui-server/test/presets.test.js` (full rewrite)
- Modify: `import-gui-server/test/presets.fs.test.js` (full rewrite)

**Interfaces:**
- Consumes: the `{ name, bullets: [{text, weight, enabled}] }` shape `tableBullets.readTables`/`parseTableFile` produce (unchanged from the base feature).
- Produces:
  - `snapshotSelected(parsedTables: Array<{name, bullets}>) -> { [table: string]: Array<{ text: string, weight: number }> }` — one key per table in `parsedTables`, listing only its currently-enabled bullets.
  - `diffPresetAgainstTables(presetSelected: { [table]: Array<{text, weight}> }, parsedTables: Array<{name, bullets}>) -> { willEnable: Array<{table, text, weight}>, willDisable: Array<{table, text}>, willReweight: Array<{table, text, weight}>, alreadyMatching: Array<{table, text}>, notFound: Array<{table, text}> }`

  Both consumed by Task 7's routes. This replaces `snapshotDisabled`, which is removed.

- [ ] **Step 1: Write the new failing tests**

Replace the entire contents of `import-gui-server/test/presets.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, snapshotSelected, diffPresetAgainstTables } = require('../lib/presets');

test('slugify lowercases, hyphenates, and strips punctuation', () => {
    assert.equal(slugify('Grittier Frontier!'), 'grittier-frontier');
    assert.equal(slugify('  Leading/trailing spaces  '), 'leading-trailing-spaces');
});

test('snapshotSelected captures every table, listing only enabled bullets with their weight', () => {
    const parsed = [
        { name: 'Outfit', bullets: [
            { text: 'a jacket', weight: 1, enabled: true },
            { text: 'a graffiti tee', weight: 2, enabled: false },
        ] },
        { name: 'Gear', bullets: [
            { text: 'nothing at all', weight: 1, enabled: true },
        ] },
        { name: 'Headgear', bullets: [
            { text: 'a helmet', weight: 1, enabled: false },
        ] },
    ];
    assert.deepEqual(snapshotSelected(parsed), {
        Outfit: [{ text: 'a jacket', weight: 1 }],
        Gear: [{ text: 'nothing at all', weight: 1 }],
        Headgear: [], // every bullet disabled - the table still gets a key, so it stays covered
    });
});

test('diffPresetAgainstTables enables a selected bullet that is currently disabled, at its recorded weight', () => {
    const parsed = [{ name: 'Outfit', bullets: [
        { text: 'a graffiti tee', weight: 1, enabled: false },
    ] }];
    const preset = { Outfit: [{ text: 'a graffiti tee', weight: 3 }] };
    const diff = diffPresetAgainstTables(preset, parsed);
    assert.deepEqual(diff.willEnable, [{ table: 'Outfit', text: 'a graffiti tee', weight: 3 }]);
    assert.deepEqual(diff.willDisable, []);
    assert.deepEqual(diff.willReweight, []);
});

test('diffPresetAgainstTables reweights a selected bullet that is already enabled at a different weight', () => {
    const parsed = [{ name: 'Outfit', bullets: [
        { text: 'a jacket', weight: 1, enabled: true },
    ] }];
    const preset = { Outfit: [{ text: 'a jacket', weight: 4 }] };
    const diff = diffPresetAgainstTables(preset, parsed);
    assert.deepEqual(diff.willReweight, [{ table: 'Outfit', text: 'a jacket', weight: 4 }]);
    assert.deepEqual(diff.willEnable, []);
});

test('diffPresetAgainstTables disables an enabled bullet in a covered table that the preset does not select', () => {
    const parsed = [{ name: 'Outfit', bullets: [
        { text: 'a jacket', weight: 1, enabled: true },
        { text: 'a hat', weight: 1, enabled: true },
    ] }];
    const preset = { Outfit: [{ text: 'a jacket', weight: 1 }] };
    const diff = diffPresetAgainstTables(preset, parsed);
    assert.deepEqual(diff.willDisable, [{ table: 'Outfit', text: 'a hat' }]);
});

test('diffPresetAgainstTables treats a matching bullet, and an already-unselected disabled one, as alreadyMatching', () => {
    const parsed = [{ name: 'Outfit', bullets: [
        { text: 'a jacket', weight: 1, enabled: true },
        { text: 'a hat', weight: 1, enabled: false },
    ] }];
    const preset = { Outfit: [{ text: 'a jacket', weight: 1 }] };
    const diff = diffPresetAgainstTables(preset, parsed);
    assert.deepEqual(diff.alreadyMatching, [
        { table: 'Outfit', text: 'a jacket' },
        { table: 'Outfit', text: 'a hat' },
    ]);
});

test('diffPresetAgainstTables reports a selected bullet as notFound when its text no longer exists locally', () => {
    const parsed = [{ name: 'Outfit', bullets: [] }];
    const preset = { Outfit: [{ text: 'a bullet that got removed', weight: 1 }] };
    const diff = diffPresetAgainstTables(preset, parsed);
    assert.deepEqual(diff.notFound, [{ table: 'Outfit', text: 'a bullet that got removed' }]);
});

test('diffPresetAgainstTables reports every entry notFound, and touches nothing, when the whole table is missing locally', () => {
    const diff = diffPresetAgainstTables({ Headgear: [{ text: 'a helmet', weight: 1 }] }, [{ name: 'Outfit', bullets: [] }]);
    assert.deepEqual(diff.notFound, [{ table: 'Headgear', text: 'a helmet' }]);
    assert.deepEqual(diff.willDisable, []);
});

test('diffPresetAgainstTables leaves a table with no key in the preset completely untouched', () => {
    const parsed = [
        { name: 'Outfit', bullets: [{ text: 'a jacket', weight: 1, enabled: true }] },
        { name: 'Cybernetics', bullets: [{ text: 'a chrome arm', weight: 1, enabled: true }] },
    ];
    // preset was saved before "Cybernetics" existed - it has no key for it at all
    const preset = { Outfit: [{ text: 'a jacket', weight: 1 }] };
    const diff = diffPresetAgainstTables(preset, parsed);
    assert.deepEqual(diff.willDisable, []);
    assert.deepEqual(diff.alreadyMatching, [{ table: 'Outfit', text: 'a jacket' }]);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test import-gui-server/test/presets.test.js`

Expected: FAIL — `snapshotSelected is not a function`.

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `import-gui-server/lib/presets.js` with:

```js
/**
 * Preset save/export/import logic for the Tables tab. A preset is a full
 * snapshot, at the moment it's saved, of every table that existed in
 * npc-generator-tables.md and every bullet that was enabled in each one:
 * { name, created, selected: { [table]: Array<{ text, weight }> } }.
 * Every table gets a key, even one with an empty array (every bullet
 * disabled at save time) - that's what "covers" it.
 *
 * Applying a preset treats it as the definitive configuration for every
 * table it covers: bullets it lists get enabled at their listed weight,
 * and any other bullet currently enabled in that same table gets
 * disabled. A table that didn't exist yet when the preset was saved has
 * no key in `selected` and is left completely untouched by apply - this
 * is what keeps an old preset safe to apply after you've added whole new
 * tables later.
 */

const fs = require('node:fs');
const path = require('node:path');

function slugify(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function snapshotSelected(parsedTables) {
    const out = {};
    for (const table of parsedTables) {
        out[table.name] = table.bullets
            .filter((b) => b.enabled)
            .map((b) => ({ text: b.text, weight: b.weight }));
    }
    return out;
}

function diffPresetAgainstTables(presetSelected, parsedTables) {
    const byTable = new Map(parsedTables.map((t) => [t.name, t.bullets]));
    const willEnable = [];
    const willDisable = [];
    const willReweight = [];
    const alreadyMatching = [];
    const notFound = [];

    for (const [table, entries] of Object.entries(presetSelected || {})) {
        const bullets = byTable.get(table);
        if (!bullets) {
            for (const { text } of entries) notFound.push({ table, text });
            continue;
        }
        const selected = new Map(entries.map((e) => [e.text, e.weight]));
        for (const { text } of entries) {
            if (!bullets.some((b) => b.text === text)) notFound.push({ table, text });
        }
        for (const bullet of bullets) {
            const wantWeight = selected.get(bullet.text);
            if (wantWeight === undefined) {
                if (bullet.enabled) willDisable.push({ table, text: bullet.text });
                else alreadyMatching.push({ table, text: bullet.text });
            } else if (!bullet.enabled) {
                willEnable.push({ table, text: bullet.text, weight: wantWeight });
            } else if (bullet.weight !== wantWeight) {
                willReweight.push({ table, text: bullet.text, weight: wantWeight });
            } else {
                alreadyMatching.push({ table, text: bullet.text });
            }
        }
    }
    return { willEnable, willDisable, willReweight, alreadyMatching, notFound };
}

function presetFile(dir, slug) {
    return path.join(dir, `${slug}.json`);
}

function presetExists(dir, slug) {
    return fs.existsSync(presetFile(dir, slug));
}

function readPreset(dir, slug) {
    const file = presetFile(dir, slug);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writePreset(dir, slug, presetObject) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(presetFile(dir, slug), JSON.stringify(presetObject, null, 2));
}

function deletePreset(dir, slug) {
    const file = presetFile(dir, slug);
    if (!fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
}

function listPresets(dir) {
    let files;
    try {
        files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
    const out = files.map((f) => {
        const slug = f.slice(0, -'.json'.length);
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        const count = Object.values(data.selected || {}).reduce((n, arr) => n + arr.length, 0);
        return { name: data.name, slug, created: data.created, count };
    });
    out.sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0));
    return out;
}

module.exports = {
    slugify, snapshotSelected, diffPresetAgainstTables,
    listPresets, presetExists, readPreset, writePreset, deletePreset,
};
```

- [ ] **Step 4: Run it again and confirm it passes**

Run: `node --test import-gui-server/test/presets.test.js`

Expected: PASS (9 tests, 0 failures).

- [ ] **Step 5: Update the disk-wrapper tests for the new shape**

Replace the entire contents of `import-gui-server/test/presets.fs.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listPresets, presetExists, readPreset, writePreset, deletePreset } = require('../lib/presets');

function withTempPresetsDir(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presets-fs-test-'));
    try {
        return fn(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('listPresets returns an empty array when the directory does not exist yet', () => {
    withTempPresetsDir((dir) => {
        assert.deepEqual(listPresets(path.join(dir, 'does-not-exist')), []);
    });
});

test('writePreset then readPreset round-trips the same data', () => {
    withTempPresetsDir((dir) => {
        const preset = {
            name: 'Grittier Frontier',
            created: '2026-09-01T00:00:00.000Z',
            selected: { Outfit: [{ text: 'a jacket', weight: 1 }], Headgear: [] },
        };
        writePreset(dir, 'grittier-frontier', preset);
        assert.deepEqual(readPreset(dir, 'grittier-frontier'), preset);
    });
});

test('presetExists is false before writing and true after', () => {
    withTempPresetsDir((dir) => {
        assert.equal(presetExists(dir, 'x'), false);
        writePreset(dir, 'x', { name: 'x', created: 'now', selected: {} });
        assert.equal(presetExists(dir, 'x'), true);
    });
});

test('listPresets sorts newest-created first and reports bullet counts', () => {
    withTempPresetsDir((dir) => {
        writePreset(dir, 'older', { name: 'Older', created: '2026-01-01T00:00:00.000Z', selected: { Outfit: [{ text: 'a', weight: 1 }] } });
        writePreset(dir, 'newer', {
            name: 'Newer', created: '2026-06-01T00:00:00.000Z',
            selected: { Outfit: [{ text: 'a', weight: 1 }, { text: 'b', weight: 2 }], Gear: [{ text: 'c', weight: 1 }] },
        });
        const list = listPresets(dir);
        assert.equal(list.length, 2);
        assert.equal(list[0].slug, 'newer');
        assert.equal(list[0].count, 3);
        assert.equal(list[1].slug, 'older');
        assert.equal(list[1].count, 1);
    });
});

test('deletePreset removes the file and returns true, then false on a second call', () => {
    withTempPresetsDir((dir) => {
        writePreset(dir, 'x', { name: 'x', created: 'now', selected: {} });
        assert.equal(deletePreset(dir, 'x'), true);
        assert.equal(presetExists(dir, 'x'), false);
        assert.equal(deletePreset(dir, 'x'), false);
    });
});

test('readPreset returns null for an unknown slug', () => {
    withTempPresetsDir((dir) => {
        assert.equal(readPreset(dir, 'nope'), null);
    });
});
```

- [ ] **Step 6: Run it and confirm it passes**

Run: `node --test import-gui-server/test/presets.fs.test.js`

Expected: PASS (6 tests, 0 failures) immediately, since these functions' signatures didn't change — only `listPresets`'s `count` computation did, in Step 3. If it fails, the bug is there.

- [ ] **Step 7: Commit**

```bash
git add import-gui-server/lib/presets.js import-gui-server/test/presets.test.js import-gui-server/test/presets.fs.test.js
git commit -m "feat: snapshot every table's full selected set in presets, with a whitelist diff"
```

---

### Task 7: `server.js` routes — presets on the new format

**Files:**
- Modify: `import-gui-server/server.js`
- Modify: `import-gui-server/test/api.presets.test.js` (full rewrite)

**Interfaces:**
- Consumes: `tableBullets.readTables`, `tableBullets.toggleBulletOnDisk`, `tableBullets.setBulletWeightOnDisk` (Task 2); `presets.snapshotSelected`, `presets.diffPresetAgainstTables` (Task 6).
- Produces: the same five preset endpoints as the base feature, with `disabled` replaced by `selected` in every request/response body, and `apply` now able to enable/reweight as well as disable. Consumed by the client in Task 8.

- [ ] **Step 1: Write the new failing tests**

Replace the entire contents of `import-gui-server/test/api.presets.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers/testServer');

const TABLES_FIXTURE = [
    '## Outfit',
    '- a heavy work jacket over a stained undersuit || civ',
    '- a graffiti-tagged cropped t-shirt and cut-off shorts || civ',
    '',
    '## Gear',
    '- nothing at all, hands loose and empty',
    '',
].join('\n');

async function toggle(server, table, text, enabled) {
    return fetch(`${server.baseUrl}/api/table-bullets/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, text, enabled }),
    });
}

async function savePreset(server, name) {
    return fetch(`${server.baseUrl}/api/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
}

test('POST /api/presets saves a snapshot of every table, listing only currently-enabled bullets', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    await toggle(server, 'Outfit', 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ', false);

    const saveRes = await savePreset(server, 'Grittier Frontier');
    assert.equal(saveRes.status, 200);
    const { slug } = await saveRes.json();
    assert.equal(slug, 'grittier-frontier');

    const exportRes = await fetch(`${server.baseUrl}/api/presets/export?slug=grittier-frontier`);
    const saved = await exportRes.json();
    assert.deepEqual(saved.selected, {
        Outfit: [{ text: 'a heavy work jacket over a stained undersuit || civ', weight: 1 }],
        Gear: [{ text: 'nothing at all, hands loose and empty', weight: 1 }],
    });

    const listRes = await fetch(`${server.baseUrl}/api/presets`);
    const { presets } = await listRes.json();
    assert.equal(presets.length, 1);
    assert.equal(presets[0].slug, 'grittier-frontier');
    assert.equal(presets[0].count, 2);
});

test('POST /api/presets returns 409 for a duplicate name', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    const first = await savePreset(server, 'Same Name');
    assert.equal(first.status, 200);
    const second = await savePreset(server, 'Same Name');
    assert.equal(second.status, 409);
});

test('GET /api/presets/export downloads the raw preset JSON with a Content-Disposition header', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    await savePreset(server, 'Export Me');
    const res = await fetch(`${server.baseUrl}/api/presets/export?slug=export-me`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="export-me\.json"/);
    const data = await res.json();
    assert.equal(data.name, 'Export Me');
});

test('GET /api/presets/export returns 404 for an unknown slug', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/presets/export?slug=nope`);
    assert.equal(res.status, 404);
});

test('POST /api/presets/import previews without writing anything to disk', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    const preset = {
        name: "Someone Else's Preset",
        created: '2026-01-01T00:00:00.000Z',
        selected: {
            Outfit: [{ text: 'a heavy work jacket over a stained undersuit || civ', weight: 2 }],
            Headgear: [{ text: 'a hat that does not exist', weight: 1 }],
        },
    };
    const res = await fetch(`${server.baseUrl}/api/presets/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preset),
    });
    assert.equal(res.status, 200);
    const diff = await res.json();
    assert.deepEqual(diff.willReweight, [{ table: 'Outfit', text: 'a heavy work jacket over a stained undersuit || civ', weight: 2 }]);
    assert.deepEqual(diff.willDisable, [{ table: 'Outfit', text: 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ' }]);
    assert.deepEqual(diff.notFound, [{ table: 'Headgear', text: 'a hat that does not exist' }]);

    const tablesRes = await fetch(`${server.baseUrl}/api/table-bullets`);
    const { tables } = await tablesRes.json();
    const outfit = tables.find((t) => t.name === 'Outfit');
    const jacket = outfit.bullets.find((b) => b.text === 'a heavy work jacket over a stained undersuit || civ');
    assert.equal(jacket.weight, 1, 'import must not write anything - the weight should be untouched');
});

test('POST /api/presets/apply enables and reweights bullets in a covered table, leaving an uncovered table untouched', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    const preset = {
        name: 'Apply Me',
        created: '2026-01-01T00:00:00.000Z',
        selected: {
            Outfit: [
                { text: 'a heavy work jacket over a stained undersuit || civ', weight: 3 },
                { text: 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ', weight: 1 },
            ],
        },
    };
    const res = await fetch(`${server.baseUrl}/api/presets/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preset),
    });
    assert.equal(res.status, 200);
    const diff = await res.json();
    assert.deepEqual(diff.willReweight, [{ table: 'Outfit', text: 'a heavy work jacket over a stained undersuit || civ', weight: 3 }]);
    assert.deepEqual(diff.willEnable, [{ table: 'Outfit', text: 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ', weight: 1 }]);
    assert.deepEqual(diff.willDisable, []);

    const tablesRes = await fetch(`${server.baseUrl}/api/table-bullets`);
    const { tables } = await tablesRes.json();
    const outfit = tables.find((t) => t.name === 'Outfit');
    const jacket = outfit.bullets.find((b) => b.text === 'a heavy work jacket over a stained undersuit || civ');
    assert.equal(jacket.weight, 3);
    const tee = outfit.bullets.find((b) => b.text === 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ');
    assert.equal(tee.enabled, true);
    assert.equal(tee.weight, 1);
    const gear = tables.find((t) => t.name === 'Gear');
    assert.equal(gear.bullets[0].enabled, true, 'Gear was not covered by this preset and must stay untouched');
});

test('POST /api/presets/apply disables an enabled bullet the preset does not select in a table it covers', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    const preset = {
        name: 'Trim Outfit',
        created: '2026-01-01T00:00:00.000Z',
        selected: { Outfit: [{ text: 'a heavy work jacket over a stained undersuit || civ', weight: 1 }] },
    };
    const res = await fetch(`${server.baseUrl}/api/presets/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preset),
    });
    const diff = await res.json();
    assert.deepEqual(diff.willDisable, [{ table: 'Outfit', text: 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ' }]);

    const tablesRes = await fetch(`${server.baseUrl}/api/table-bullets`);
    const { tables } = await tablesRes.json();
    const outfit = tables.find((t) => t.name === 'Outfit');
    const tee = outfit.bullets.find((b) => b.text === 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ');
    assert.equal(tee.enabled, false);
    const gear = tables.find((t) => t.name === 'Gear');
    assert.equal(gear.bullets[0].enabled, true, 'Gear was not covered by this preset and must stay untouched');
});

test('POST /api/presets/delete removes a saved preset', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    await savePreset(server, 'Delete Me');
    const del = await fetch(`${server.baseUrl}/api/presets/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'delete-me' }),
    });
    assert.equal(del.status, 200);
    const listRes = await fetch(`${server.baseUrl}/api/presets`);
    const { presets } = await listRes.json();
    assert.equal(presets.length, 0);
});

test('POST /api/presets/delete returns 404 for an unknown slug', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/presets/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'nope' }),
    });
    assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test import-gui-server/test/api.presets.test.js`

Expected: FAIL — the save/import/apply tests all fail their `assert.deepEqual`/`assert.equal` checks against `selected`, since the routes still read/write `disabled`.

- [ ] **Step 3: Update the routes**

In `import-gui-server/server.js`, find the `PRESETS_DIR` comment:

```js
// presets/ - saved snapshots of disabled table bullets - defaults to a
// sibling of staged-imports/, both alongside npc-generator-tables.md.
```

Replace with:

```js
// presets/ - saved snapshots of each table's selected bullets - defaults
// to a sibling of staged-imports/, both alongside npc-generator-tables.md.
```

Find the `POST /api/presets` handler:

```js
        const parsed = tableBullets.readTables(NPC_TABLES_PATH);
        const preset = { name, created: new Date().toISOString(), disabled: presets.snapshotDisabled(parsed) };
        presets.writePreset(PRESETS_DIR, slug, preset);
```

Replace with:

```js
        const parsed = tableBullets.readTables(NPC_TABLES_PATH);
        const preset = { name, created: new Date().toISOString(), selected: presets.snapshotSelected(parsed) };
        presets.writePreset(PRESETS_DIR, slug, preset);
```

Find the `POST /api/presets/import` handler:

```js
    if (url.pathname === '/api/presets/import' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        if (!body || typeof body.disabled !== 'object' || body.disabled === null) {
            return sendJson(res, 400, { error: 'not a valid preset file - missing "disabled"' });
        }
        const parsed = tableBullets.readTables(NPC_TABLES_PATH);
        return sendJson(res, 200, presets.diffPresetAgainstTables(body.disabled, parsed));
    }
```

Replace with:

```js
    if (url.pathname === '/api/presets/import' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        if (!body || typeof body.selected !== 'object' || body.selected === null) {
            return sendJson(res, 400, { error: 'not a valid preset file - missing "selected"' });
        }
        const parsed = tableBullets.readTables(NPC_TABLES_PATH);
        return sendJson(res, 200, presets.diffPresetAgainstTables(body.selected, parsed));
    }
```

Find the `POST /api/presets/apply` handler:

```js
    if (url.pathname === '/api/presets/apply' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        if (!body || typeof body.disabled !== 'object' || body.disabled === null) {
            return sendJson(res, 400, { error: 'not a valid preset file - missing "disabled"' });
        }
        // Re-diff against the live file rather than trusting a preview the
        // client may have shown a while ago - the file could have changed.
        const parsed = tableBullets.readTables(NPC_TABLES_PATH);
        const diff = presets.diffPresetAgainstTables(body.disabled, parsed);
        for (const { table, text } of diff.willDisable) {
            tableBullets.toggleBulletOnDisk(NPC_TABLES_PATH, table, text, false);
        }
        return sendJson(res, 200, diff);
    }
```

Replace with:

```js
    if (url.pathname === '/api/presets/apply' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        if (!body || typeof body.selected !== 'object' || body.selected === null) {
            return sendJson(res, 400, { error: 'not a valid preset file - missing "selected"' });
        }
        // Re-diff against the live file rather than trusting a preview the
        // client may have shown a while ago - the file could have changed.
        const parsed = tableBullets.readTables(NPC_TABLES_PATH);
        const diff = presets.diffPresetAgainstTables(body.selected, parsed);
        for (const { table, text, weight } of [...diff.willEnable, ...diff.willReweight]) {
            tableBullets.toggleBulletOnDisk(NPC_TABLES_PATH, table, text, true);
            tableBullets.setBulletWeightOnDisk(NPC_TABLES_PATH, table, text, weight);
        }
        for (const { table, text } of diff.willDisable) {
            tableBullets.toggleBulletOnDisk(NPC_TABLES_PATH, table, text, false);
        }
        return sendJson(res, 200, diff);
    }
```

- [ ] **Step 4: Run it again and confirm it passes**

Run: `node --test import-gui-server/test/api.presets.test.js`

Expected: PASS (9 tests, 0 failures).

- [ ] **Step 5: Run the full suite**

Run: `node --test "import-gui-server/test/*.test.js" "import-gui-server/test/**/*.test.js"`

Expected: PASS, everything green.

- [ ] **Step 6: Commit**

```bash
git add import-gui-server/server.js import-gui-server/test/api.presets.test.js
git commit -m "feat: switch preset routes to the full selected-set format and whitelist apply"
```

---

### Task 8: Client — preset preview for the new diff shape

**Files:**
- Modify: `import-gui-server/public/app.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: the new `{ willEnable, willDisable, willReweight, alreadyMatching, notFound }` shape from `POST /api/presets/import`/`POST /api/presets/apply` (Task 7).
- Produces: nothing new for later tasks — this is the leaf UI piece for item 4.

- [ ] **Step 1: Update `renderPresetPreview()`**

In `import-gui-server/public/app.js`, find:

```js
function renderPresetPreview(diff) {
  elTables.preview.hidden = false;
  elTables.previewSummary.textContent =
    `Will disable ${diff.willDisable.length}, already disabled ${diff.alreadyDisabled.length}, `
    + `not found locally ${diff.notFound.length}.`;
  elTables.previewList.innerHTML = '';
  for (const { table, text } of diff.willDisable) {
    const li = document.createElement('li');
    li.textContent = `${table}: ${text}`;
    elTables.previewList.appendChild(li);
  }
  for (const { table, text } of diff.notFound) {
    const li = document.createElement('li');
    li.className = 'preset-preview-not-found';
    li.textContent = `${table}: ${text} (not found locally)`;
    elTables.previewList.appendChild(li);
  }
}
```

Replace with:

```js
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
```

- [ ] **Step 2: Verify manually against a fixture server**

In PowerShell, from `import-gui-server/`:

```powershell
$dir = New-Item -ItemType Directory -Path "$env:TEMP\preset-format-check" -Force
"## Outfit`n- a jacket`n- a hat`n`n## Gear`n- nothing at all`n" | Set-Content "$dir\npc-generator-tables.md"
New-Item -ItemType Directory -Path "$dir\FoundryData" -Force | Out-Null
"{}" | Set-Content "$dir\manifest.json"
@{
  port = 5193; host = "127.0.0.1"; secret = ""
  npcManifestPath = "$dir\manifest.json"
  foundryDataRoot = "$dir\FoundryData"
  npcTablesPath = "$dir\npc-generator-tables.md"
} | ConvertTo-Json | Set-Content "$dir\config.json"
$env:IMPORT_GUI_CONFIG = "$dir\config.json"
node server.js
```

With that running, open `http://127.0.0.1:5193`, click **Tables**, click **Save current as preset…**, name it `baseline`. Then, in the running Outfit table, uncheck "a hat" and change "a jacket"'s weight to `3`. Click **Download** on the `baseline` preset row to save the old (pre-edit) file, then use **Import preset…** to re-import that same file and confirm:

1. The preview summary shows `1 to enable, 0 to disable, 1 to reweight` (re-enabling "a hat", re-weighting "a jacket" back to 1).
2. Clicking **Apply** restores both, and the "Gear" table (not touched by either edit) is unaffected.

Stop the server (Ctrl+C) and remove `$env:IMPORT_GUI_CONFIG` when done:

```powershell
Remove-Item Env:\IMPORT_GUI_CONFIG
```

- [ ] **Step 3: Update the README's preset description**

In `README.md`, find (this is the text left by Task 4's Step 5):

```markdown
- **Tables** — shows every bullet in every table of
  `npc-generator-tables.md` and lets you disable ones you don't want
  rolled, without deleting them, so they can be re-enabled later, and edit
  each bullet's roll weight (multiplier) in place. Save your current set
  of disabled bullets as a named preset, download it, and hand the file to
  someone else; they can import it into their own copy of this GUI,
  preview exactly what it would change, and apply it.
```

Replace with:

```markdown
- **Tables** — shows every bullet in every table of
  `npc-generator-tables.md` and lets you disable ones you don't want
  rolled, without deleting them, so they can be re-enabled later, and edit
  each bullet's roll weight (multiplier) in place. Save your current
  selection — which bullets are on, and each one's weight — as a named
  preset, download it, and hand the file to someone else; applying one
  makes their tables match your selection exactly, disabling anything in
  a table it covers that isn't part of the preset, so it stays correct
  even after you add new bullets later.
```

- [ ] **Step 4: Commit**

```bash
git add import-gui-server/public/app.js README.md
git commit -m "feat: update the preset preview UI for the full selected-set diff"
```

---

## Final verification

After all 8 tasks:

```bash
node --test "import-gui-server/test/*.test.js" "import-gui-server/test/**/*.test.js"
```

Expected: every test across every file passes — this covers Tasks 1–3 and 5–7's server/lib changes end-to-end (item 3 has no automated test, being CSS-only). Tasks 1, 4, 5, and 8's client-side pieces were verified manually per their own steps, since no browser test tooling exists in this repo yet.
