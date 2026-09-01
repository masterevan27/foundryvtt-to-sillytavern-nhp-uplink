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
