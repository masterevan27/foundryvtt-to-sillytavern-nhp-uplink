# NPC Tables Editor & Trait Import Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Tables" tab to the Import GUI for enabling/disabling individual bullets in `npc-generator-tables.md` in place, a save/export/import presets flow for sharing a curated set of disabled bullets, and a sort control plus a date column on the existing Trait Imports tab.

**Architecture:** Two new pure, unit-tested Node modules (`lib/tableBullets.js`, `lib/presets.js`) hold all the parsing/matching/diffing logic; `server.js` gets thin new routes that call them, following its existing "one `if (url.pathname === ...)` block per route" style. The client is vanilla JS/CSS additions to the existing three-tab pattern in `public/`, no build step, no new dependencies.

**Tech Stack:** Node.js stdlib only (`node:http`, `node:fs`, `node:path`), Node's built-in `node:test` + `node:assert/strict` test runner (first tests in this codebase — no framework existed before), vanilla JS/CSS on the client.

**Spec:** `docs/superpowers/specs/2026-09-01-npc-tables-editor-and-presets-design.md`

## Global Constraints

- Disabled bullets are represented by wrapping the line in an HTML comment (`<!-- - text -->`), never by deleting content. `generate-npc.py`'s parser already ignores such lines — no change to that script.
- Every endpoint re-reads `npc-generator-tables.md` fresh; nothing is cached in memory across requests (matches the rest of `server.js`).
- A preset only ever *disables* bullets it names; applying one never re-enables anything it doesn't mention.
- `/api/presets/apply` re-diffs against the live file rather than trusting a client-supplied preview.
- Route/verb style matches the existing codebase exactly: exact-string `url.pathname ===` matches (no path-parameter routing), actions expressed as `POST /api/<noun>/<verb>` rather than REST verbs (mirrors `/api/delete`, `/api/import`), reads as `GET` with query strings (mirrors `/api/image?id=...`). This refines the spec's illustrative route shapes (which used a path-segment `DELETE`) to match established convention — no behavior change from what the spec described.
- Tests never touch the real `config.json`, `npc-generator-tables.md`, or manifest — every test spins up its own fixture directory and a real `server.js` child process pointed at it, then tears both down.

---

## File Structure

- `import-gui-server/lib/tableBullets.js` (new) — parses `npc-generator-tables.md` text into tables/bullets, and toggles one bullet's enabled state. Pure text functions plus thin `fs` wrappers.
- `import-gui-server/lib/presets.js` (new) — preset slug/snapshot/diff logic, plus thin `fs` wrappers for reading/writing/listing/deleting preset files.
- `import-gui-server/server.js` (modify) — `IMPORT_GUI_CONFIG` env override in `loadConfig()`; new `PRESETS_DIR` constant; new `/api/table-bullets`, `/api/table-bullets/toggle`, `/api/presets`, `/api/presets/delete`, `/api/presets/export`, `/api/presets/import`, `/api/presets/apply` routes.
- `import-gui-server/config.example.json` (modify) — add `presetsDir`.
- `import-gui-server/public/index.html` (modify) — new "Tables" nav button/tab-panel; new "Sort by" control on the Trait Imports panel.
- `import-gui-server/public/app.js` (modify) — Tables tab state/rendering/toggle logic; presets panel logic; Trait Imports sort + date-badge rendering.
- `import-gui-server/public/style.css` (modify) — styling for the new tab and panels, following existing dark-theme conventions.
- `import-gui-server/test/helpers/testServer.js` (new) — spawns a real `server.js` child process against a synthetic fixture directory; used by every integration test.
- `import-gui-server/test/helpers.testServer.test.js` (new)
- `import-gui-server/test/tableBullets.test.js` (new)
- `import-gui-server/test/tableBullets.fs.test.js` (new)
- `import-gui-server/test/presets.test.js` (new)
- `import-gui-server/test/presets.fs.test.js` (new)
- `import-gui-server/test/api.tableBullets.test.js` (new)
- `import-gui-server/test/api.presets.test.js` (new)
- `README.md` (modify) — document the new Tables tab in the existing "Import GUI" section.

Run the whole suite at any point with:

```bash
node --test import-gui-server/test/
```

---

### Task 1: Test harness — config env override and spawn/teardown helper

**Files:**
- Modify: `import-gui-server/server.js` (`loadConfig()`)
- Create: `import-gui-server/test/helpers/testServer.js`
- Test: `import-gui-server/test/helpers.testServer.test.js`

**Interfaces:**
- Produces: `startTestServer({ tablesText: string, port: number }) -> Promise<{ baseUrl: string, dir: string, tablesPath: string, presetsDir: string, stop: () => Promise<void> }>`. Every later integration test task calls this. **`port` is required** (not defaulted) — `node --test` runs different test *files* concurrently by default, so each test file must pick its own port to avoid binding collisions; tests within one file run sequentially against that one port.

- [x] **Step 1: Write the test-server helper**

Create `import-gui-server/test/helpers/testServer.js`:

```js
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER_JS = path.join(__dirname, '..', '..', 'server.js');

/**
 * Spins up a real server.js child process against a synthetic fixture
 * directory - never the real config.json, npc-generator-tables.md, or
 * manifest. `port` must be unique per test file (see the module docstring
 * in the plan this came from): `node --test` runs different test files
 * concurrently, and every server in this suite binds a fixed port rather
 * than an OS-assigned one, so two files sharing a port would collide.
 */
async function startTestServer({ tablesText, port }) {
    if (!port) throw new Error('startTestServer requires an explicit port');
    const host = '127.0.0.1';
    const baseUrl = `http://${host}:${port}`;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-gui-test-'));
    const tablesPath = path.join(dir, 'npc-generator-tables.md');
    fs.writeFileSync(tablesPath, tablesText);
    const presetsDir = path.join(dir, 'presets');
    const manifestPath = path.join(dir, '.generated-npcs.json');
    fs.writeFileSync(manifestPath, '{}');
    const foundryRoot = path.join(dir, 'FoundryData');
    fs.mkdirSync(foundryRoot, { recursive: true });

    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
        port,
        host,
        secret: '',
        npcManifestPath: manifestPath,
        foundryDataRoot: foundryRoot,
        npcTablesPath: tablesPath,
        stagedImportsDir: path.join(dir, 'staged-imports'),
        presetsDir,
    }));

    const child = spawn(process.execPath, [SERVER_JS], {
        env: { ...process.env, IMPORT_GUI_CONFIG: configPath },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let ready = false;
    const deadline = Date.now() + 5000;
    while (!ready && Date.now() < deadline) {
        try {
            const res = await fetch(`${baseUrl}/health`);
            ready = res.ok;
        } catch {
            await new Promise((r) => setTimeout(r, 100));
        }
        if (!ready) await new Promise((r) => setTimeout(r, 50));
    }
    if (!ready) {
        child.kill();
        fs.rmSync(dir, { recursive: true, force: true });
        throw new Error(`test server on port ${port} did not become ready within 5s`);
    }

    return {
        baseUrl,
        dir,
        tablesPath,
        presetsDir,
        stop() {
            return new Promise((resolve) => {
                child.once('exit', () => {
                    fs.rmSync(dir, { recursive: true, force: true });
                    resolve();
                });
                child.kill();
            });
        },
    };
}

module.exports = { startTestServer };
```

- [x] **Step 2: Write the failing test**

Create `import-gui-server/test/helpers.testServer.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startTestServer } = require('./helpers/testServer');

test('startTestServer spins up a real server.js against a synthetic config and /health responds', async (t) => {
    const server = await startTestServer({ tablesText: '## Gear\n- nothing at all, hands loose and empty\n', port: 5197 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
});

test('stop() tears the process down and removes the fixture directory', async () => {
    const server = await startTestServer({ tablesText: '## Gear\n- nothing at all\n', port: 5197 });
    const { dir } = server;
    await server.stop();
    assert.equal(fs.existsSync(dir), false);
});
```

- [x] **Step 3: Run it and confirm it fails**

Run: `node --test import-gui-server/test/helpers.testServer.test.js`

Expected: FAIL — both tests time out with `test server on port 5197 did not become ready within 5s`. `config.json` doesn't exist in this worktree (it's gitignored) and `server.js` doesn't yet honor `IMPORT_GUI_CONFIG`, so the spawned child hits `loadConfig()`'s missing-`npcManifestPath`/`foundryDataRoot` check and calls `process.exit(1)` immediately.

- [x] **Step 4: Make `loadConfig()` honor `IMPORT_GUI_CONFIG`**

In `import-gui-server/server.js`, find:

```js
function loadConfig() {
    const file = path.join(__dirname, 'config.json');
```

Replace with:

```js
function loadConfig() {
    // Overridable so tests can point a real server.js process at a synthetic
    // fixture config without ever touching the real config.json.
    const file = process.env.IMPORT_GUI_CONFIG || path.join(__dirname, 'config.json');
```

- [x] **Step 5: Run it again and confirm it passes**

Run: `node --test import-gui-server/test/helpers.testServer.test.js`

Expected: PASS (2 tests, 0 failures).

- [x] **Step 6: Commit**

```bash
git add import-gui-server/server.js import-gui-server/test/helpers/testServer.js import-gui-server/test/helpers.testServer.test.js
git commit -m "test: add IMPORT_GUI_CONFIG override and a spawn/teardown test-server helper"
```

---

### Task 2: `lib/tableBullets.js` — parsing and in-memory toggling

**Files:**
- Create: `import-gui-server/lib/tableBullets.js`
- Test: `import-gui-server/test/tableBullets.test.js`

**Interfaces:**
- Consumes: nothing (no dependency on other tasks).
- Produces:
  - `parseTableFile(fileText: string) -> Array<{ name: string, bullets: Array<{ text: string, weight: number, enabled: boolean }> }>`
  - `toggleBulletInText(fileText: string, tableName: string, bulletText: string, enabled: boolean) -> { ok: true, text: string } | { ok: false, error: string }`

  Both consumed by Task 3's `fs` wrappers and directly by these tests.

- [x] **Step 1: Write the failing tests**

Create `import-gui-server/test/tableBullets.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTableFile, toggleBulletInText } = require('../lib/tableBullets');

const SAMPLE = [
    '# Random NPC Generator Tables',
    '',
    '## Outfit',
    '',
    '- a heavy work jacket over a stained undersuit || civ',
    '- x4 nondescript grey work coveralls',
    '<!-- - a graffiti-tagged cropped t-shirt and cut-off shorts || civ -->',
    '',
    '## Gear',
    '',
    '- nothing at all, hands loose and empty',
    '- a sidearm holstered high on a chest rig || mil',
    '',
].join('\n');

test('parseTableFile reads enabled, weighted, and disabled bullets', () => {
    const tables = parseTableFile(SAMPLE);
    assert.equal(tables.length, 2);
    assert.equal(tables[0].name, 'Outfit');
    assert.deepEqual(tables[0].bullets, [
        { text: 'a heavy work jacket over a stained undersuit || civ', weight: 1, enabled: true },
        { text: 'nondescript grey work coveralls', weight: 4, enabled: true },
        { text: 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ', weight: 1, enabled: false },
    ]);
    assert.equal(tables[1].name, 'Gear');
    assert.equal(tables[1].bullets.length, 2);
});

test('toggleBulletInText disables an enabled bullet by wrapping it in an HTML comment', () => {
    const result = toggleBulletInText(SAMPLE, 'Gear', 'nothing at all, hands loose and empty', false);
    assert.equal(result.ok, true);
    assert.match(result.text, /<!-- - nothing at all, hands loose and empty -->/);
    const reparsed = parseTableFile(result.text);
    const gear = reparsed.find((t) => t.name === 'Gear');
    const bullet = gear.bullets.find((b) => b.text === 'nothing at all, hands loose and empty');
    assert.equal(bullet.enabled, false);
});

test('toggleBulletInText re-enables a disabled bullet, recovering the original line exactly', () => {
    const result = toggleBulletInText(SAMPLE, 'Outfit',
        'a graffiti-tagged cropped t-shirt and cut-off shorts || civ', true);
    assert.equal(result.ok, true);
    assert.match(result.text, /^- a graffiti-tagged cropped t-shirt and cut-off shorts \|\| civ$/m);
    assert.doesNotMatch(result.text, /<!--.*graffiti/);
});

test('toggleBulletInText preserves an xN weight prefix across a disable/enable round trip', () => {
    const disabled = toggleBulletInText(SAMPLE, 'Outfit', 'nondescript grey work coveralls', false);
    assert.equal(disabled.ok, true);
    assert.match(disabled.text, /<!-- - x4 nondescript grey work coveralls -->/);
    const reEnabled = toggleBulletInText(disabled.text, 'Outfit', 'nondescript grey work coveralls', true);
    assert.equal(reEnabled.ok, true);
    assert.match(reEnabled.text, /^- x4 nondescript grey work coveralls$/m);
});

test('toggleBulletInText is a no-op when the bullet is already in the requested state', () => {
    const result = toggleBulletInText(SAMPLE, 'Gear', 'nothing at all, hands loose and empty', true);
    assert.equal(result.ok, true);
    assert.equal(result.text, SAMPLE);
});

test('toggleBulletInText returns ok:false for a bullet that does not exist under that heading', () => {
    const result = toggleBulletInText(SAMPLE, 'Outfit', 'a suit of powered armor', false);
    assert.equal(result.ok, false);
    assert.match(result.error, /no bullet matching/);
});

test('toggleBulletInText does not match a bullet that exists only under a different heading', () => {
    const result = toggleBulletInText(SAMPLE, 'Outfit', 'nothing at all, hands loose and empty', false);
    assert.equal(result.ok, false);
});

test('toggleBulletInText toggles the first line, in file order, when text is duplicated under one heading', () => {
    const dupe = ['## Callsigns', '- Ghost', '- Ghost'].join('\n');
    const result = toggleBulletInText(dupe, 'Callsigns', 'Ghost', false);
    assert.equal(result.ok, true);
    const lines = result.text.split('\n');
    assert.equal(lines[1], '<!-- - Ghost -->');
    assert.equal(lines[2], '- Ghost');
});
```

- [x] **Step 2: Run it and confirm it fails**

Run: `node --test import-gui-server/test/tableBullets.test.js`

Expected: FAIL — `Cannot find module '../lib/tableBullets'`.

- [x] **Step 3: Write the implementation**

Create `import-gui-server/lib/tableBullets.js`:

```js
/**
 * Parses and edits npc-generator-tables.md's bullet lists in place.
 *
 * Mirrors generate-npc.py's own parse_tables()/split_flags() conventions
 * closely enough to stay in sync with it: '## Heading' starts a table, a
 * '- ' line is a bullet, a leading 'xN ' on a bullet is its weight. This
 * module adds one convention generate-npc.py doesn't need to know about -
 * a bullet wrapped '<!-- - text -->' is disabled. generate-npc.py's own
 * parser already ignores any line that doesn't start with '-', so a
 * disabled bullet is silently skipped there with no change needed to that
 * script - see the design doc this implements.
 */

const fs = require('node:fs');

const HEADING_RE = /^##\s+(?!#)\s*(.*?)\s*$/;
const ENABLED_BULLET_RE = /^-\s+(.*?)\s*$/;
const DISABLED_BULLET_RE = /^<!--\s*-\s+(.*?)\s*-->\s*$/;
const WEIGHT_RE = /^x(\d+)\s+(.*)$/;

/** One bullet line -> { raw, enabled }, or null if the line isn't a bullet at all. */
function matchBulletLine(line) {
    const disabled = line.match(DISABLED_BULLET_RE);
    if (disabled) return { raw: disabled[1], enabled: false };
    const active = line.match(ENABLED_BULLET_RE);
    if (active) return { raw: active[1], enabled: true };
    return null;
}

/** A bullet's raw text (weight prefix still attached) -> { weight, text }. */
function splitWeight(raw) {
    const m = raw.match(WEIGHT_RE);
    return m ? { weight: Number(m[1]), text: m[2] } : { weight: 1, text: raw };
}

function parseTableFile(fileText) {
    const lines = fileText.split('\n');
    const tables = [];
    let current = null;
    for (const line of lines) {
        const heading = line.match(HEADING_RE);
        if (heading) {
            current = { name: heading[1], bullets: [] };
            tables.push(current);
            continue;
        }
        if (!current) continue;
        const bullet = matchBulletLine(line);
        if (!bullet) continue;
        const { weight, text } = splitWeight(bullet.raw);
        current.bullets.push({ text, weight, enabled: bullet.enabled });
    }
    return tables;
}

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
    return parseTableFile(fs.readFileSync(filePath, 'utf8'));
}

function toggleBulletOnDisk(filePath, tableName, bulletText, enabled) {
    const fileText = fs.readFileSync(filePath, 'utf8');
    const result = toggleBulletInText(fileText, tableName, bulletText, enabled);
    if (!result.ok) return result;
    fs.writeFileSync(filePath, result.text);
    return { ok: true };
}

module.exports = { parseTableFile, toggleBulletInText, readTables, toggleBulletOnDisk };
```

(`readTables`/`toggleBulletOnDisk` are implemented here now since they're one screenful and share this file, but Task 3 is where they get their own tests — this step just needs the module to exist and export everything Task 3 and the route tasks require.)

- [x] **Step 4: Run it again and confirm it passes**

Run: `node --test import-gui-server/test/tableBullets.test.js`

Expected: PASS (8 tests, 0 failures).

- [x] **Step 5: Commit**

```bash
git add import-gui-server/lib/tableBullets.js import-gui-server/test/tableBullets.test.js
git commit -m "feat: add pure table-bullet parsing and toggling logic"
```

---

### Task 3: `lib/tableBullets.js` — disk read/write wrappers

**Files:**
- Modify: none (implementation landed in Task 2's Step 3)
- Test: `import-gui-server/test/tableBullets.fs.test.js`

**Interfaces:**
- Consumes: `readTables`, `toggleBulletOnDisk` from Task 2.
- Produces: nothing new — this task is purely to give the disk-touching half of Task 2's module its own test coverage before Task 6 relies on it over HTTP.

- [x] **Step 1: Write the failing tests**

Create `import-gui-server/test/tableBullets.fs.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readTables, toggleBulletOnDisk } = require('../lib/tableBullets');

function withTempTablesFile(text, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tablebullets-fs-test-'));
    const file = path.join(dir, 'npc-generator-tables.md');
    fs.writeFileSync(file, text);
    try {
        return fn(file);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('readTables reads a real file off disk', () => {
    withTempTablesFile('## Gear\n- nothing at all, hands loose and empty\n', (file) => {
        const tables = readTables(file);
        assert.equal(tables[0].name, 'Gear');
        assert.equal(tables[0].bullets[0].enabled, true);
    });
});

test('toggleBulletOnDisk writes the change back to the file', () => {
    withTempTablesFile('## Gear\n- nothing at all, hands loose and empty\n', (file) => {
        const result = toggleBulletOnDisk(file, 'Gear', 'nothing at all, hands loose and empty', false);
        assert.equal(result.ok, true);
        const onDisk = fs.readFileSync(file, 'utf8');
        assert.match(onDisk, /<!-- - nothing at all, hands loose and empty -->/);
    });
});

test('toggleBulletOnDisk leaves the file byte-for-byte untouched when the bullet is not found', () => {
    withTempTablesFile('## Gear\n- nothing at all, hands loose and empty\n', (file) => {
        const before = fs.readFileSync(file, 'utf8');
        const result = toggleBulletOnDisk(file, 'Gear', 'not a real bullet', false);
        assert.equal(result.ok, false);
        assert.equal(fs.readFileSync(file, 'utf8'), before);
    });
});
```

- [x] **Step 2: Run it and confirm it fails, then confirm it passes**

Run: `node --test import-gui-server/test/tableBullets.fs.test.js`

Expected: PASS immediately — `readTables`/`toggleBulletOnDisk` already exist from Task 2. This step exists to lock their disk-facing behavior under its own test file rather than to drive new implementation; if it doesn't pass, Task 2's Step 3 has a bug — fix it there, not here.

- [x] **Step 3: Commit**

```bash
git add import-gui-server/test/tableBullets.fs.test.js
git commit -m "test: cover lib/tableBullets.js's disk read/write wrappers directly"
```

---

### Task 4: `lib/presets.js` — slug, snapshot, and diff logic

**Files:**
- Create: `import-gui-server/lib/presets.js`
- Test: `import-gui-server/test/presets.test.js`

**Interfaces:**
- Consumes: the `{ name, bullets: [{text, weight, enabled}] }` shape `tableBullets.parseTableFile`/`readTables` (Task 2) produce.
- Produces:
  - `slugify(name: string) -> string`
  - `snapshotDisabled(parsedTables: Array<{name, bullets}>) -> { [table: string]: string[] }`
  - `diffPresetAgainstTables(presetDisabled: { [table: string]: string[] }, parsedTables: Array<{name, bullets}>) -> { willDisable: Array<{table, text}>, alreadyDisabled: Array<{table, text}>, notFound: Array<{table, text}> }`

  Consumed by Task 5 (fs wrappers write the `disabled` shape `snapshotDisabled` produces) and Task 7's routes.

- [x] **Step 1: Write the failing tests**

Create `import-gui-server/test/presets.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, snapshotDisabled, diffPresetAgainstTables } = require('../lib/presets');

test('slugify lowercases, hyphenates, and strips punctuation', () => {
    assert.equal(slugify('Grittier Frontier!'), 'grittier-frontier');
    assert.equal(slugify('  Leading/trailing spaces  '), 'leading-trailing-spaces');
});

test('snapshotDisabled captures only disabled bullets, grouped by table', () => {
    const parsed = [
        { name: 'Outfit', bullets: [
            { text: 'a jacket', weight: 1, enabled: true },
            { text: 'a graffiti tee', weight: 1, enabled: false },
        ] },
        { name: 'Gear', bullets: [
            { text: 'nothing at all', weight: 1, enabled: true },
        ] },
    ];
    assert.deepEqual(snapshotDisabled(parsed), { Outfit: ['a graffiti tee'] });
});

test('diffPresetAgainstTables buckets matches into willDisable, alreadyDisabled, and notFound', () => {
    const parsed = [
        { name: 'Outfit', bullets: [
            { text: 'a jacket', weight: 1, enabled: true },
            { text: 'a graffiti tee', weight: 1, enabled: false },
        ] },
    ];
    const preset = { Outfit: ['a jacket', 'a graffiti tee', 'a bullet that got removed'] };
    const diff = diffPresetAgainstTables(preset, parsed);
    assert.deepEqual(diff.willDisable, [{ table: 'Outfit', text: 'a jacket' }]);
    assert.deepEqual(diff.alreadyDisabled, [{ table: 'Outfit', text: 'a graffiti tee' }]);
    assert.deepEqual(diff.notFound, [{ table: 'Outfit', text: 'a bullet that got removed' }]);
});

test('diffPresetAgainstTables reports every bullet not found when the whole table is missing locally', () => {
    const diff = diffPresetAgainstTables({ Headgear: ['a helmet'] }, [{ name: 'Outfit', bullets: [] }]);
    assert.deepEqual(diff.notFound, [{ table: 'Headgear', text: 'a helmet' }]);
});
```

- [x] **Step 2: Run it and confirm it fails**

Run: `node --test import-gui-server/test/presets.test.js`

Expected: FAIL — `Cannot find module '../lib/presets'`.

- [x] **Step 3: Write the implementation**

Create `import-gui-server/lib/presets.js`:

```js
/**
 * Preset save/export/import logic for the Tables tab. A preset is a
 * snapshot of every bullet disabled anywhere in npc-generator-tables.md at
 * the moment it's saved: { name, created, disabled: { [table]: text[] } }.
 * Applying one only ever disables bullets it names - it never re-enables
 * anything it doesn't mention, so importing someone else's preset can't
 * silently undo unrelated customizations of your own. See the design doc
 * this implements.
 */

const fs = require('node:fs');
const path = require('node:path');

function slugify(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function snapshotDisabled(parsedTables) {
    const out = {};
    for (const table of parsedTables) {
        const disabledTexts = table.bullets.filter((b) => !b.enabled).map((b) => b.text);
        if (disabledTexts.length) out[table.name] = disabledTexts;
    }
    return out;
}

function diffPresetAgainstTables(presetDisabled, parsedTables) {
    const byTable = new Map(parsedTables.map((t) => [t.name, t.bullets]));
    const willDisable = [];
    const alreadyDisabled = [];
    const notFound = [];
    for (const [table, texts] of Object.entries(presetDisabled || {})) {
        const bullets = byTable.get(table) || [];
        for (const text of texts) {
            const bullet = bullets.find((b) => b.text === text);
            if (!bullet) notFound.push({ table, text });
            else if (bullet.enabled) willDisable.push({ table, text });
            else alreadyDisabled.push({ table, text });
        }
    }
    return { willDisable, alreadyDisabled, notFound };
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
        const count = Object.values(data.disabled || {}).reduce((n, arr) => n + arr.length, 0);
        return { name: data.name, slug, created: data.created, count };
    });
    out.sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0));
    return out;
}

module.exports = {
    slugify, snapshotDisabled, diffPresetAgainstTables,
    listPresets, presetExists, readPreset, writePreset, deletePreset,
};
```

(Same note as Task 2: the `fs`-touching functions are implemented here now so the module is complete, but Task 5 gives them their own dedicated tests.)

- [x] **Step 4: Run it again and confirm it passes**

Run: `node --test import-gui-server/test/presets.test.js`

Expected: PASS (4 tests, 0 failures).

- [x] **Step 5: Commit**

```bash
git add import-gui-server/lib/presets.js import-gui-server/test/presets.test.js
git commit -m "feat: add pure preset slug/snapshot/diff logic"
```

---

### Task 5: `lib/presets.js` — disk read/write wrappers

**Files:**
- Modify: none (implementation landed in Task 4's Step 3)
- Test: `import-gui-server/test/presets.fs.test.js`

**Interfaces:**
- Consumes: `listPresets`, `presetExists`, `readPreset`, `writePreset`, `deletePreset` from Task 4.
- Produces: nothing new — dedicated coverage for the disk-touching half of Task 4's module before Task 7 relies on it over HTTP.

- [x] **Step 1: Write the failing tests**

Create `import-gui-server/test/presets.fs.test.js`:

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
        const preset = { name: 'Grittier Frontier', created: '2026-09-01T00:00:00.000Z', disabled: { Outfit: ['a graffiti tee'] } };
        writePreset(dir, 'grittier-frontier', preset);
        assert.deepEqual(readPreset(dir, 'grittier-frontier'), preset);
    });
});

test('presetExists is false before writing and true after', () => {
    withTempPresetsDir((dir) => {
        assert.equal(presetExists(dir, 'x'), false);
        writePreset(dir, 'x', { name: 'x', created: 'now', disabled: {} });
        assert.equal(presetExists(dir, 'x'), true);
    });
});

test('listPresets sorts newest-created first and reports bullet counts', () => {
    withTempPresetsDir((dir) => {
        writePreset(dir, 'older', { name: 'Older', created: '2026-01-01T00:00:00.000Z', disabled: { Outfit: ['a'] } });
        writePreset(dir, 'newer', { name: 'Newer', created: '2026-06-01T00:00:00.000Z', disabled: { Outfit: ['a', 'b'], Gear: ['c'] } });
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
        writePreset(dir, 'x', { name: 'x', created: 'now', disabled: {} });
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

- [x] **Step 2: Run it and confirm it passes**

Run: `node --test import-gui-server/test/presets.fs.test.js`

Expected: PASS (6 tests, 0 failures) immediately, same reasoning as Task 3's Step 2 — if it fails, the bug is in Task 4's Step 3 implementation.

- [x] **Step 3: Commit**

```bash
git add import-gui-server/test/presets.fs.test.js
git commit -m "test: cover lib/presets.js's disk read/write wrappers directly"
```

---

### Task 6: `server.js` routes — `/api/table-bullets` and `/api/table-bullets/toggle`

**Files:**
- Modify: `import-gui-server/server.js`
- Test: `import-gui-server/test/api.tableBullets.test.js`

**Interfaces:**
- Consumes: `tableBullets.readTables`, `tableBullets.toggleBulletOnDisk` (Task 2/3), `startTestServer` (Task 1).
- Produces:
  - `GET /api/table-bullets -> 200 { tables: Array<{name, bullets}> }` (the shape `readTables` returns, verbatim)
  - `POST /api/table-bullets/toggle` body `{ table: string, text: string, enabled: boolean }` `-> 200 { ok: true }` or `400 { error: string }`

  Consumed by the client in Task 8.

- [x] **Step 1: Write the failing tests**

Create `import-gui-server/test/api.tableBullets.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers/testServer');

const TABLES_FIXTURE = [
    '## Outfit',
    '- a heavy work jacket over a stained undersuit || civ',
    '- nondescript grey work coveralls',
    '',
    '## Gear',
    '- nothing at all, hands loose and empty',
    '- a sidearm holstered high on a chest rig || mil',
    '',
].join('\n');

test('GET /api/table-bullets returns every table with its bullets', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5199 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/table-bullets`);
    assert.equal(res.status, 200);
    const { tables } = await res.json();
    assert.equal(tables.length, 2);
    assert.equal(tables[0].name, 'Outfit');
    assert.equal(tables[0].bullets.length, 2);
    assert.ok(tables[0].bullets.every((b) => b.enabled));
});

test('POST /api/table-bullets/toggle disables a bullet, reflected on the next GET', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5199 });
    t.after(() => server.stop());

    const toggleRes = await fetch(`${server.baseUrl}/api/table-bullets/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'Gear', text: 'nothing at all, hands loose and empty', enabled: false }),
    });
    assert.equal(toggleRes.status, 200);

    const res = await fetch(`${server.baseUrl}/api/table-bullets`);
    const { tables } = await res.json();
    const gear = tables.find((t) => t.name === 'Gear');
    const bullet = gear.bullets.find((b) => b.text === 'nothing at all, hands loose and empty');
    assert.equal(bullet.enabled, false);
});

test('POST /api/table-bullets/toggle returns 400 for a bullet that does not exist', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5199 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/table-bullets/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'Gear', text: 'not a real bullet', enabled: false }),
    });
    assert.equal(res.status, 400);
});

test('POST /api/table-bullets/toggle returns 400 when the body is missing required fields', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5199 });
    t.after(() => server.stop());

    const res = await fetch(`${server.baseUrl}/api/table-bullets/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'Gear' }),
    });
    assert.equal(res.status, 400);
});
```

- [x] **Step 2: Run it and confirm it fails**

Run: `node --test import-gui-server/test/api.tableBullets.test.js`

Expected: FAIL — the first two tests get 404s (no such route yet); the third and fourth also fail their `assert.equal(..., 400)` since a 404 isn't a 400.

- [x] **Step 3: Add the routes**

In `import-gui-server/server.js`, add the require near the top, right after the existing requires:

```js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const tableBullets = require('./lib/tableBullets');
```

Then find the existing `/api/npc-tables` route:

```js
    if (url.pathname === '/api/npc-tables' && req.method === 'GET') {
        return sendJson(res, 200, { tables: OVERRIDE_TABLES });
    }
```

Add the two new routes directly after it (before `/api/create-npc`):

```js
    if (url.pathname === '/api/npc-tables' && req.method === 'GET') {
        return sendJson(res, 200, { tables: OVERRIDE_TABLES });
    }

    if (url.pathname === '/api/table-bullets' && req.method === 'GET') {
        return sendJson(res, 200, { tables: tableBullets.readTables(NPC_TABLES_PATH) });
    }

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
```

(`NPC_TABLES_PATH` already exists in `server.js` — it's what `insertBulletIntoTables` uses.)

- [x] **Step 4: Run it again and confirm it passes**

Run: `node --test import-gui-server/test/api.tableBullets.test.js`

Expected: PASS (4 tests, 0 failures).

- [x] **Step 5: Run the full suite to confirm nothing else broke**

Run: `node --test import-gui-server/test/`

Expected: PASS, all tests across all files so far.

- [x] **Step 6: Commit**

```bash
git add import-gui-server/server.js import-gui-server/test/api.tableBullets.test.js
git commit -m "feat: add GET /api/table-bullets and POST /api/table-bullets/toggle"
```

---

### Task 7: `server.js` routes — presets

**Files:**
- Modify: `import-gui-server/server.js`
- Modify: `import-gui-server/config.example.json`
- Test: `import-gui-server/test/api.presets.test.js`

**Interfaces:**
- Consumes: `tableBullets.readTables`, `tableBullets.toggleBulletOnDisk` (Task 2/3); `presets.*` (Task 4/5); `startTestServer` (Task 1).
- Produces:
  - `GET /api/presets -> 200 { presets: Array<{name, slug, created, count}> }`
  - `POST /api/presets` body `{ name: string } -> 200 { ok: true, slug: string }` / `400` / `409`
  - `POST /api/presets/delete` body `{ slug: string } -> 200 { ok: true }` / `404`
  - `GET /api/presets/export?slug=... ->` raw preset JSON with `Content-Disposition: attachment` / `404`
  - `POST /api/presets/import` body = a preset object `-> 200 { willDisable, alreadyDisabled, notFound }` / `400` (read-only, writes nothing)
  - `POST /api/presets/apply` body = a preset object `-> 200 { willDisable, alreadyDisabled, notFound }` / `400` (writes: disables everything in the returned `willDisable`)

  Consumed by the client in Task 9.

- [x] **Step 1: Write the failing tests**

Create `import-gui-server/test/api.presets.test.js`:

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

test('POST /api/presets saves a snapshot of every currently-disabled bullet', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    await toggle(server, 'Outfit', 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ', false);

    const saveRes = await savePreset(server, 'Grittier Frontier');
    assert.equal(saveRes.status, 200);
    const { slug } = await saveRes.json();
    assert.equal(slug, 'grittier-frontier');

    const listRes = await fetch(`${server.baseUrl}/api/presets`);
    const { presets } = await listRes.json();
    assert.equal(presets.length, 1);
    assert.equal(presets[0].slug, 'grittier-frontier');
    assert.equal(presets[0].count, 1);
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
        disabled: {
            Outfit: ['a heavy work jacket over a stained undersuit || civ'],
            Headgear: ['a hat that does not exist'],
        },
    };
    const res = await fetch(`${server.baseUrl}/api/presets/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preset),
    });
    assert.equal(res.status, 200);
    const diff = await res.json();
    assert.deepEqual(diff.willDisable, [{ table: 'Outfit', text: 'a heavy work jacket over a stained undersuit || civ' }]);
    assert.deepEqual(diff.notFound, [{ table: 'Headgear', text: 'a hat that does not exist' }]);

    const tablesRes = await fetch(`${server.baseUrl}/api/table-bullets`);
    const { tables } = await tablesRes.json();
    const outfit = tables.find((t) => t.name === 'Outfit');
    const bullet = outfit.bullets.find((b) => b.text === 'a heavy work jacket over a stained undersuit || civ');
    assert.equal(bullet.enabled, true, 'import must not write anything - the bullet should still be enabled');
});

test('POST /api/presets/apply disables only the willDisable bullets and leaves the rest untouched', async (t) => {
    const server = await startTestServer({ tablesText: TABLES_FIXTURE, port: 5198 });
    t.after(() => server.stop());

    const preset = {
        name: 'Apply Me',
        created: '2026-01-01T00:00:00.000Z',
        disabled: { Outfit: ['a heavy work jacket over a stained undersuit || civ'] },
    };
    const res = await fetch(`${server.baseUrl}/api/presets/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preset),
    });
    assert.equal(res.status, 200);
    const diff = await res.json();
    assert.deepEqual(diff.willDisable, [{ table: 'Outfit', text: 'a heavy work jacket over a stained undersuit || civ' }]);

    const tablesRes = await fetch(`${server.baseUrl}/api/table-bullets`);
    const { tables } = await tablesRes.json();
    const outfit = tables.find((t) => t.name === 'Outfit');
    const jacket = outfit.bullets.find((b) => b.text === 'a heavy work jacket over a stained undersuit || civ');
    assert.equal(jacket.enabled, false);
    const tee = outfit.bullets.find((b) => b.text === 'a graffiti-tagged cropped t-shirt and cut-off shorts || civ');
    assert.equal(tee.enabled, true, 'a bullet the preset never mentioned must stay untouched');
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

- [x] **Step 2: Run it and confirm it fails**

Run: `node --test import-gui-server/test/api.presets.test.js`

Expected: FAIL — every route 404s.

- [x] **Step 3: Add the `presets` require, `PRESETS_DIR` constant, and routes**

In `import-gui-server/server.js`, add the require next to `tableBullets`:

```js
const tableBullets = require('./lib/tableBullets');
const presets = require('./lib/presets');
```

Find `DEFAULT_CONFIG` and add `presetsDir` next to the other path overrides:

```js
    npcTablesPath: '',
    stagedImportsDir: '',
    presetsDir: '',
};
```

Find where `STAGED_IMPORTS_DIR` is derived:

```js
const STAGED_IMPORTS_DIR = config.stagedImportsDir
    || path.join(path.dirname(NPC_TABLES_PATH), 'staged-imports');
```

Add `PRESETS_DIR` right after it:

```js
const STAGED_IMPORTS_DIR = config.stagedImportsDir
    || path.join(path.dirname(NPC_TABLES_PATH), 'staged-imports');

// presets/ - saved snapshots of disabled table bullets - defaults to a
// sibling of staged-imports/, both alongside npc-generator-tables.md.
const PRESETS_DIR = config.presetsDir
    || path.join(path.dirname(NPC_TABLES_PATH), 'presets');
```

Find the `/api/table-bullets/toggle` route added in Task 6 and add the presets routes directly after it (before `/api/create-npc`):

```js
    if (url.pathname === '/api/presets' && req.method === 'GET') {
        return sendJson(res, 200, { presets: presets.listPresets(PRESETS_DIR) });
    }

    if (url.pathname === '/api/presets' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) return sendJson(res, 400, { error: 'name is required' });
        const slug = presets.slugify(name);
        if (!slug) return sendJson(res, 400, { error: 'name must contain at least one letter or digit' });
        if (presets.presetExists(PRESETS_DIR, slug)) {
            return sendJson(res, 409, { error: `a preset named "${name}" already exists` });
        }
        const parsed = tableBullets.readTables(NPC_TABLES_PATH);
        const preset = { name, created: new Date().toISOString(), disabled: presets.snapshotDisabled(parsed) };
        presets.writePreset(PRESETS_DIR, slug, preset);
        return sendJson(res, 200, { ok: true, slug });
    }

    if (url.pathname === '/api/presets/delete' && req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
            body = JSON.parse(raw || '{}');
        } catch (err) {
            return sendJson(res, 400, { error: err.message });
        }
        const slug = typeof body.slug === 'string' ? body.slug : '';
        const ok = slug && presets.deletePreset(PRESETS_DIR, slug);
        return ok ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'unknown preset' });
    }

    if (url.pathname === '/api/presets/export' && req.method === 'GET') {
        const slug = url.searchParams.get('slug') || '';
        const preset = slug && presets.readPreset(PRESETS_DIR, slug);
        if (!preset) return sendJson(res, 404, { error: 'unknown preset' });
        const payload = JSON.stringify(preset, null, 2);
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="${slug}.json"`,
            'Content-Length': Buffer.byteLength(payload),
        });
        return res.end(payload);
    }

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

- [x] **Step 4: Update `config.example.json`**

In `import-gui-server/config.example.json`, add `presetsDir` after `stagedImportsDir`:

```json
{
  "port": 5089,
  "host": "127.0.0.1",
  "secret": "",
  "npcManifestPath": "G:\\Documents\\Lancer TTRPG GM Hub\\AI GM\\ComfyUI\\Scripts\\.generated-npcs.json",
  "foundryDataRoot": "G:\\Programs\\FoundryVTT_v13\\FoundryVTT-Node-13.351\\data\\Data",
  "pythonExecutable": "python",
  "generateNpcScript": "",
  "foundryNpcSubdir": "LancerNPCs",
  "npcTablesPath": "",
  "stagedImportsDir": "",
  "presetsDir": ""
}
```

- [x] **Step 5: Run it again and confirm it passes**

Run: `node --test import-gui-server/test/api.presets.test.js`

Expected: PASS (8 tests, 0 failures).

- [x] **Step 6: Run the full suite**

Run: `node --test import-gui-server/test/`

Expected: PASS, everything green.

- [x] **Step 7: Commit**

```bash
git add import-gui-server/server.js import-gui-server/config.example.json import-gui-server/test/api.presets.test.js
git commit -m "feat: add preset save/list/delete/export/import/apply routes"
```

---

### Task 8: Client — Tables tab (heading list + bullet toggles)

**Files:**
- Modify: `import-gui-server/public/index.html`
- Modify: `import-gui-server/public/app.js`
- Modify: `import-gui-server/public/style.css`

**Interfaces:**
- Consumes: `GET /api/table-bullets`, `POST /api/table-bullets/toggle` (Task 6); the existing `api()` helper and `switchTab()` in `app.js`.
- Produces: `tablesState` object and `elTables` object in `app.js` — Task 9 adds more keys to both, so their exact names matter: `tablesState.tables`, `tablesState.selectedTable`; `elTables.headingList`, `elTables.bulletHeading`, `elTables.bulletList`, `elTables.empty`.

- [x] **Step 1: Add the tab button and panel to `index.html`**

Find:

```html
    <button type="button" data-tab="traits">Trait Imports</button>
  </nav>
```

Replace with:

```html
    <button type="button" data-tab="traits">Trait Imports</button>
    <button type="button" data-tab="tables">Tables</button>
  </nav>
```

Find the closing of the `tab-traits` section:

```html
  <div class="trait-list" id="trait-list"></div>
  <p class="empty" id="trait-empty" hidden>No staged trait candidates yet — run the npc-trait-import skill, then reload.</p>
</section>

</main>
```

Replace with:

```html
  <div class="trait-list" id="trait-list"></div>
  <p class="empty" id="trait-empty" hidden>No staged trait candidates yet — run the npc-trait-import skill, then reload.</p>
</section>

<section class="tab-panel" id="tab-tables" hidden>
  <div class="tables-layout">
    <div class="table-heading-list" id="table-heading-list"></div>
    <div class="table-bullet-panel">
      <h2 id="table-bullet-heading">Select a table</h2>
      <div class="table-bullet-list" id="table-bullet-list"></div>
    </div>
  </div>
  <p class="empty" id="tables-empty" hidden>No tables found — check npcTablesPath in config.json.</p>
</section>

</main>
```

- [x] **Step 2: Add the Tables tab logic to `app.js`**

At the end of `import-gui-server/public/app.js`, append:

```js
/* ==================================================================== */
/* Tables (per-bullet enable/disable)                                   */
/* ==================================================================== */

const tablesState = {
  tables: [],
  selectedTable: null,
};

const elTables = {
  headingList: document.getElementById('table-heading-list'),
  bulletHeading: document.getElementById('table-bullet-heading'),
  bulletList: document.getElementById('table-bullet-list'),
  empty: document.getElementById('tables-empty'),
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

Find `switchTab()`:

```js
  if (tab === 'create' && !createState.tablesLoaded) loadOverrideTables();
  if (tab === 'traits') refreshTraitCandidates().catch((err) => {
    elTraits.status.textContent = `Failed to load: ${err.message}`;
  });
}
```

Replace with:

```js
  if (tab === 'create' && !createState.tablesLoaded) loadOverrideTables();
  if (tab === 'traits') refreshTraitCandidates().catch((err) => {
    elTraits.status.textContent = `Failed to load: ${err.message}`;
  });
  if (tab === 'tables') loadTables().catch((err) => {
    elTables.empty.hidden = false;
    elTables.empty.textContent = `Failed to load: ${err.message}`;
  });
}
```

- [x] **Step 3: Add styling to `style.css`**

Append to `import-gui-server/public/style.css`:

```css
.tables-layout {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}
.table-heading-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 220px;
}
.table-heading-row {
  text-align: left;
  background: #1c1f26;
  border: 1px solid #363b47;
  color: #d7dae0;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
}
.table-heading-row.active { border-color: #7c8ba1; background: #262a33; color: #fff; }
.table-bullet-panel { flex: 1; min-width: 0; }
.table-bullet-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: #1c1f26;
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  margin-bottom: 0.3rem;
  font-size: 0.85rem;
  color: #d7dae0;
}
.table-bullet-row .weight-badge {
  position: static;
  background: #262a33;
  color: #7c8ba1;
  white-space: nowrap;
}
.table-bullet-text { flex: 1; }
```

- [x] **Step 4: Verify manually against a fixture server**

There's no browser test tooling in this repo yet, so verify this by hand against a real server pointed at a throwaway fixture — never the real `config.json`/`npc-generator-tables.md`.

In PowerShell, from `import-gui-server/`:

```powershell
$dir = New-Item -ItemType Directory -Path "$env:TEMP\tables-tab-check" -Force
@"
## Outfit
- a heavy work jacket over a stained undersuit || civ
- nondescript grey work coveralls

## Gear
- nothing at all, hands loose and empty
- a sidearm holstered high on a chest rig || mil
"@ | Set-Content "$dir\npc-generator-tables.md"
New-Item -ItemType Directory -Path "$dir\FoundryData" -Force | Out-Null
"{}" | Set-Content "$dir\manifest.json"
@{
  port = 5196; host = "127.0.0.1"; secret = ""
  npcManifestPath = "$dir\manifest.json"
  foundryDataRoot = "$dir\FoundryData"
  npcTablesPath = "$dir\npc-generator-tables.md"
} | ConvertTo-Json | Set-Content "$dir\config.json"
$env:IMPORT_GUI_CONFIG = "$dir\config.json"
node server.js
```

With that running, open `http://127.0.0.1:5196` in a browser and confirm:

1. A "Tables" tab appears in the nav, alongside Import Generated Art / Create NPC / Trait Imports.
2. Clicking it shows two headings on the left: "Outfit (2)" and "Gear (2)".
3. Clicking "Outfit" shows its two bullets on the right, both checked.
4. Unchecking the first bullet's checkbox produces no error, and the left-hand heading immediately updates to "Outfit (2, 1 disabled)".
5. Opening `$dir\npc-generator-tables.md` in a text editor shows that line now reads `<!-- - a heavy work jacket over a stained undersuit || civ -->`.
6. Re-checking the same checkbox flips the heading badge back to "Outfit (2)" and restores the line in the file to `- a heavy work jacket...` (no `<!--`/`-->`).

Stop the server (Ctrl+C) and remove `$env:IMPORT_GUI_CONFIG` when done:

```powershell
Remove-Item Env:\IMPORT_GUI_CONFIG
```

- [x] **Step 5: Commit**

```bash
git add import-gui-server/public/index.html import-gui-server/public/app.js import-gui-server/public/style.css
git commit -m "feat: add a Tables tab for viewing and toggling generator-table bullets"
```

---

### Task 9: Client — Presets panel

**Files:**
- Modify: `import-gui-server/public/index.html`
- Modify: `import-gui-server/public/app.js`
- Modify: `import-gui-server/public/style.css`

**Interfaces:**
- Consumes: `GET/POST /api/presets`, `POST /api/presets/delete`, `GET /api/presets/export`, `POST /api/presets/import`, `POST /api/presets/apply` (Task 7); `tablesState`, `elTables`, `loadTables()` (Task 8).
- Produces: `tablesState.presets`, `tablesState.pendingPreset`; additional `elTables` keys `presetList`, `saveBtn`, `importInput`, `preview`, `previewSummary`, `previewList`, `applyBtn`, `cancelBtn`.

- [x] **Step 1: Add the presets panel markup to `index.html`**

Find the `tab-tables` section added in Task 8:

```html
<section class="tab-panel" id="tab-tables" hidden>
  <div class="tables-layout">
    <div class="table-heading-list" id="table-heading-list"></div>
    <div class="table-bullet-panel">
      <h2 id="table-bullet-heading">Select a table</h2>
      <div class="table-bullet-list" id="table-bullet-list"></div>
    </div>
  </div>
  <p class="empty" id="tables-empty" hidden>No tables found — check npcTablesPath in config.json.</p>
</section>
```

Replace with:

```html
<section class="tab-panel" id="tab-tables" hidden>
  <div class="tables-layout">
    <div class="table-heading-list" id="table-heading-list"></div>
    <div class="table-bullet-panel">
      <h2 id="table-bullet-heading">Select a table</h2>
      <div class="table-bullet-list" id="table-bullet-list"></div>
    </div>
  </div>
  <p class="empty" id="tables-empty" hidden>No tables found — check npcTablesPath in config.json.</p>

  <div class="presets-panel">
    <h2>Presets</h2>
    <div class="preset-list" id="preset-list"></div>
    <div class="preset-actions">
      <button id="preset-save-btn" type="button">Save current as preset…</button>
      <label class="preset-import-label">
        Import preset…
        <input type="file" id="preset-import-input" accept="application/json" hidden />
      </label>
    </div>
    <div class="preset-preview" id="preset-preview" hidden>
      <h3>Preview</h3>
      <p id="preset-preview-summary"></p>
      <ul id="preset-preview-list"></ul>
      <div class="preset-preview-actions">
        <button id="preset-apply-btn" type="button">Apply</button>
        <button id="preset-cancel-btn" type="button">Cancel</button>
      </div>
    </div>
  </div>
</section>
```

- [x] **Step 2: Add the presets element refs and wire the tab switch**

Find the `elTables` object from Task 8:

```js
const elTables = {
  headingList: document.getElementById('table-heading-list'),
  bulletHeading: document.getElementById('table-bullet-heading'),
  bulletList: document.getElementById('table-bullet-list'),
  empty: document.getElementById('tables-empty'),
};
```

Replace with:

```js
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
```

Find the `tablesState` object from Task 8:

```js
const tablesState = {
  tables: [],
  selectedTable: null,
};
```

Replace with:

```js
const tablesState = {
  tables: [],
  selectedTable: null,
  presets: [],
  pendingPreset: null, // the parsed preset object currently shown in the preview, or null
};
```

Find the `switchTab()` block added in Task 8:

```js
  if (tab === 'tables') loadTables().catch((err) => {
    elTables.empty.hidden = false;
    elTables.empty.textContent = `Failed to load: ${err.message}`;
  });
}
```

Replace with:

```js
  if (tab === 'tables') {
    loadTables().catch((err) => {
      elTables.empty.hidden = false;
      elTables.empty.textContent = `Failed to load: ${err.message}`;
    });
    loadPresets().catch(() => { /* the preset list just stays empty on failure */ });
  }
}
```

- [x] **Step 3: Add the presets logic to the end of `app.js`**

```js
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
```

- [x] **Step 4: Add presets styling to `style.css`**

Append:

```css
.presets-panel { margin-top: 1.5rem; border-top: 1px solid #363b47; padding-top: 1rem; }
.preset-row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  background: #1c1f26;
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  margin-bottom: 0.3rem;
  font-size: 0.85rem;
}
.preset-name { flex: 1; }
.preset-date { color: #9aa1ad; font-size: 0.78rem; }
.preset-actions { display: flex; gap: 0.6rem; margin-top: 0.6rem; align-items: center; }
.preset-import-label {
  background: #262a33;
  border: 1px solid #363b47;
  color: #e6e6e6;
  padding: 0.5rem 0.9rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
}
.preset-preview { margin-top: 0.8rem; background: #1c1f26; border-radius: 6px; padding: 0.7rem; }
.preset-preview-not-found { color: #e0a458; }
.preset-preview-actions { display: flex; gap: 0.6rem; margin-top: 0.6rem; }
```

- [x] **Step 5: Verify manually against a fixture server**

Reuse the fixture setup from Task 8 Step 4 (or start a fresh one the same way). With the server running and the browser open on the Tables tab:

1. Disable one bullet (as in Task 8's check), then click **Save current as preset…**, type "Test Preset", confirm. A row appears under Presets reading "Test Preset (1)" with today's date and a Download link.
2. Click **Download** — the browser saves a `test-preset.json` file; open it and confirm it has `{"name": "Test Preset", "created": "...", "disabled": {"Outfit": ["..."]}}` matching whichever bullet you disabled.
3. Click **Delete** on that preset, confirm the dialog — the row disappears.
4. Click **Import preset…**, pick the `test-preset.json` you downloaded in step 2. A preview panel appears listing which bullets will be disabled (should show 0 in "will disable" since you already deleted the preset but the bullet you originally disabled might already be disabled or re-enabled depending on what you did in step 3 — re-enable that bullet first via its checkbox if you want to see a non-empty "will disable" preview) and "not found locally" for anything that doesn't match.
5. Click **Apply** — the preview panel hides, and the previously-disabled bullet's checkbox is unchecked again.
6. Click **Cancel** on a fresh import preview instead of Apply — confirm nothing in the tables file changes.

Stop the server and clean up the env var as in Task 8.

- [x] **Step 6: Commit**

```bash
git add import-gui-server/public/index.html import-gui-server/public/app.js import-gui-server/public/style.css
git commit -m "feat: add save/export/import/apply presets panel"
```

---

### Task 10: Client — Trait Imports sort + date badges (items 13, 14)

**Files:**
- Modify: `import-gui-server/public/index.html`
- Modify: `import-gui-server/public/app.js`
- Modify: `import-gui-server/public/style.css`

**Interfaces:**
- Consumes: `traitState`, `elTraits`, `renderTraits()`, `refreshTraitCandidates()` (all pre-existing in `app.js`). `c.generatedAt`/`c.importedAt` are already present on every candidate object returned by the existing `GET /api/trait-candidates` (`allTraitCandidates()` in `server.js` already computes both — confirmed by reading it; no server change needed).
- Produces: `traitState.sort`.

- [x] **Step 1: Add the sort control to `index.html`**

Find:

```html
  <div class="filters" id="trait-filters">
    <input type="text" id="trait-search" placeholder="Search bullet text, source image…" />
    <select id="trait-table-filter">
      <option value="">All tables</option>
    </select>
  </div>
```

Replace with:

```html
  <div class="filters" id="trait-filters">
    <input type="text" id="trait-search" placeholder="Search bullet text, source image…" />
    <select id="trait-table-filter">
      <option value="">All tables</option>
    </select>
    <label class="sort-by">
      Sort by
      <select id="trait-sort-select">
        <option value="when-desc" selected>Newest first</option>
        <option value="when-asc">Oldest first</option>
        <option value="table">Table</option>
      </select>
    </label>
  </div>
```

(`.sort-by` already exists in `style.css`, used by the Import tab's own sort control — no new CSS needed for the control itself.)

- [x] **Step 2: Add sorting and date badges to `app.js`**

Find the `traitState` object:

```js
const traitState = {
  candidates: [],
  visible: [],
  selected: new Set(),
  search: '',
  tableFilter: '',
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
  sort: 'when-desc',
};
```

Find the `elTraits` object and add the new select:

```js
const elTraits = {
  list: document.getElementById('trait-list'),
  empty: document.getElementById('trait-empty'),
  status: document.getElementById('trait-status'),
  importBtn: document.getElementById('trait-import-btn'),
  selectAll: document.getElementById('trait-select-all'),
  search: document.getElementById('trait-search'),
  tableFilter: document.getElementById('trait-table-filter'),
  overlay: document.getElementById('trait-detail-overlay'),
```

Replace the `tableFilter` line with two lines:

```js
  tableFilter: document.getElementById('trait-table-filter'),
  sortSelect: document.getElementById('trait-sort-select'),
  overlay: document.getElementById('trait-detail-overlay'),
```

Find `renderTraits()`:

```js
function renderTraits() {
  elTraits.list.innerHTML = '';
  traitState.visible = traitState.candidates.filter(traitMatchesFilters);
  elTraits.empty.hidden = traitState.visible.length > 0;
```

Replace the second line with a sort step:

```js
function renderTraits() {
  elTraits.list.innerHTML = '';
  traitState.visible = traitState.candidates.filter(traitMatchesFilters).sort(compareTraitCandidates);
  elTraits.empty.hidden = traitState.visible.length > 0;
```

Add `compareTraitCandidates` right before `renderTraits()`:

```js
function compareTraitCandidates(a, b) {
  if (traitState.sort === 'when-asc') return (a.generatedAt || '').localeCompare(b.generatedAt || '');
  if (traitState.sort === 'table') {
    return a.table.localeCompare(b.table) || (b.generatedAt || '').localeCompare(a.generatedAt || '');
  }
  return (b.generatedAt || '').localeCompare(a.generatedAt || ''); // when-desc, the default
}
```

Find the bullet-row-building block inside `renderTraits()`:

```js
    const bullet = document.createElement('span');
    bullet.className = 'trait-bullet';
    bullet.textContent = c.bullet.length > 160 ? `${c.bullet.slice(0, 160)}…` : c.bullet;
    row.appendChild(bullet);

    if (c.imported) {
      const importedBadge = document.createElement('span');
      importedBadge.className = 'badge';
      importedBadge.textContent = 'Imported';
      row.appendChild(importedBadge);
    }
```

Replace with:

```js
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
```

Find where the other `elTraits` listeners are wired (right after `elTraits.tableFilter.addEventListener(...)`):

```js
elTraits.tableFilter.addEventListener('change', () => {
  traitState.tableFilter = elTraits.tableFilter.value;
  renderTraits();
});
```

Add directly after it:

```js
elTraits.sortSelect.addEventListener('change', () => {
  traitState.sort = elTraits.sortSelect.value;
  renderTraits();
});
```

- [x] **Step 3: Add the date-badge style to `style.css`**

Append:

```css
.trait-row .date-badge { background: #262a33; color: #7c8ba1; }
```

- [x] **Step 4: Verify manually against a fixture server**

This tab reads staged trait-import candidates, which live under `<tables dir>/staged-imports/*.json` (see `STAGED_IMPORTS_DIR` in `server.js`). Using the same fixture pattern as Tasks 8/9:

```powershell
New-Item -ItemType Directory -Path "$dir\staged-imports" -Force | Out-Null
@'
{
  "generated_at": "2026-08-20T10:00:00.000Z",
  "entries": [
    { "id": "a", "table": "Gear", "bullet": "a compact hold-out pistol", "imported": false },
    { "id": "b", "table": "Outfit", "bullet": "a scuffed leather jacket", "imported": true, "imported_at": "2026-08-25T10:00:00.000Z" }
  ]
}
'@ | Set-Content "$dir\staged-imports\batch1.json"
```

Restart `node server.js` (same `$env:IMPORT_GUI_CONFIG`), reload the page, click **Trait Imports**, and confirm:

1. A "Sort by" dropdown appears next to the table filter, defaulted to "Newest first".
2. Each row shows a date badge for when it was generated, and the imported row additionally shows a second badge like "on 8/25/2026".
3. Switching "Sort by" to "Table" re-orders the rows alphabetically by table name.

- [x] **Step 5: Commit**

```bash
git add import-gui-server/public/index.html import-gui-server/public/app.js import-gui-server/public/style.css
git commit -m "feat: add sort control and date badges to the Trait Imports tab"
```

---

### Task 11: Document the Tables tab in the README

**Files:**
- Modify: `README.md`

**Interfaces:** none — documentation only.

- [x] **Step 1: Add a paragraph to the Import GUI section**

Find, in `README.md`'s "### 8. Import GUI (optional)" section:

```markdown
and open `http://127.0.0.1:5089` in a browser. Pick a category, click a
card to preview its portrait and token, check the ones you want, and
**Import Selected**.
```

Replace with:

```markdown
and open `http://127.0.0.1:5089` in a browser. Pick a category, click a
card to preview its portrait and token, check the ones you want, and
**Import Selected**.

The **Tables** tab shows every bullet in every table of the NPC
generator's `npc-generator-tables.md`, letting you disable ones you don't
want it rolling — without deleting them, so they can be re-enabled later.
Save your current set of disabled bullets as a named preset, download it,
and hand the file to someone else; they can import it into their own copy
of this GUI, preview exactly what it would change, and apply it.
```

- [x] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: mention the Tables tab and presets in the Import GUI README section"
```

---

## Final verification

After all 11 tasks:

```bash
node --test import-gui-server/test/
```

Expected: every test across every file passes. This covers Tasks 1–7 (harness, both `lib/` modules, and every new route) end-to-end; Tasks 8–10's client-side pieces were verified manually per their own steps since no browser test tooling exists in this repo yet.
