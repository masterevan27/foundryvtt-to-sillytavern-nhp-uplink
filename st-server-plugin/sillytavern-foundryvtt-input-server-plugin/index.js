/*
 * FoundryVTT to SillyTavern NHP Uplink
 * Copyright (C) 2026 masterevan27
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * SillyTavern server plugin: sillytavern-foundryvtt-input
 *
 * Two faces on one shared queue pair:
 *
 *   1. A standalone HTTP listener (default :5088) that Foundry VTT talks to.
 *      It lives outside SillyTavern's Express app deliberately, so Foundry's
 *      cross-origin POSTs never meet SillyTavern's CSRF/auth middleware.
 *
 *   2. Routes under /api/plugins/sillytavern-foundryvtt-input/* that the SillyTavern UI
 *      extension talks to. Same-origin, so the normal request headers apply.
 *
 * Foundry  --POST /event-->  [inbound queue]  --SSE /stream-->  UI extension
 * Foundry  <--GET /outbound--  [outbound queue]  <--POST /narration--  UI extension
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ID = 'sillytavern-foundryvtt-input';

// Stamped by the release workflow. Reported to the UI extension so a mismatch
// can name the version the user actually has, instead of just failing.
const PLUGIN_VERSION = '0.1.6';

/*
 * Wire-contract version, shared with the UI extension. Bump it ONLY when a
 * change breaks an older counterpart -- a renamed route, a changed payload
 * shape, a newly required header. Ordinary releases leave it alone, because an
 * unchanged contract means an older half still works fine.
 *
 * It exists because only half of this project auto-updates. The UI extension is
 * a git clone SillyTavern can pull; this plugin is copied in by hand. The two
 * WILL drift apart, and without an explicit contract number the symptom is a
 * bare 404 that looks exactly like 'plugin never loaded' -- sending the user off
 * to check enableServerPlugins, which was never the problem.
 */
const PROTOCOL = 1;

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_CONFIG = {
    port: 5088,
    host: '127.0.0.1',
    secret: '',
    maxQueue: 500,
    logEvents: false,
};

function loadConfig() {
    const file = path.join(__dirname, 'config.json');
    let fromFile = {};
    try {
        if (fs.existsSync(file)) fromFile = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        console.warn(`[${PLUGIN_ID}] could not read config.json:`, err.message);
    }
    return {
        ...DEFAULT_CONFIG,
        ...fromFile,
        port: Number(process.env.NHP_UPLINK_PORT || fromFile.port || DEFAULT_CONFIG.port),
        host: process.env.NHP_UPLINK_HOST || fromFile.host || DEFAULT_CONFIG.host,
        secret: process.env.NHP_UPLINK_SECRET ?? fromFile.secret ?? DEFAULT_CONFIG.secret,
    };
}

const config = loadConfig();

/* ------------------------------------------------------------------ */
/* Shared state                                                        */
/* ------------------------------------------------------------------ */

/** Events from Foundry, waiting for the UI extension. */
const inbound = [];
/** Narration from SillyTavern, waiting for Foundry to collect. */
const outbound = [];

let inboundSeq = 0;
let outboundSeq = 0;

/** Most recent board state snapshot sent by Foundry. */
let latestState = null;
let lastFoundryContact = null;

/** Connected SSE clients (the UI extension, usually exactly one). */
const sseClients = new Set();

function trim(queue) {
    while (queue.length > config.maxQueue) queue.shift();
}

function pushInbound(events, state) {
    if (state) latestState = state;
    lastFoundryContact = Date.now();

    const stored = [];
    for (const event of events) {
        const record = { seq: ++inboundSeq, receivedAt: Date.now(), ...event };
        inbound.push(record);
        stored.push(record);
    }
    trim(inbound);

    if (config.logEvents) {
        for (const e of stored) console.log(`[${PLUGIN_ID}] << ${e.type}${e.flow ? `:${e.flow}` : ''}${e.actor ? ` (${e.actor})` : ''}`);
    }

    broadcast({ type: 'events', events: stored, state: latestState });
    return stored;
}

function pushOutbound(text, speaker) {
    const record = { seq: ++outboundSeq, createdAt: Date.now(), text, speaker: speaker || null };
    outbound.push(record);
    trim(outbound);
    if (config.logEvents) console.log(`[${PLUGIN_ID}] >> narration (${text.length} chars)`);
    return record;
}

function since(queue, cursor) {
    const n = Number(cursor) || 0;
    return queue.filter((item) => item.seq > n);
}

function broadcast(payload) {
    if (!sseClients.size) return;
    const frame = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of sseClients) {
        try {
            res.write(frame);
        } catch {
            sseClients.delete(res);
        }
    }
}

function authorised(providedKey) {
    if (!config.secret) return true;
    return providedKey === config.secret;
}

/* ------------------------------------------------------------------ */
/* Standalone listener (Foundry side)                                  */
/* ------------------------------------------------------------------ */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Uplink-Key',
    'Access-Control-Max-Age': '86400',
};

function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}

function readBody(req, limitBytes = 2 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limitBytes) {
                reject(new Error('payload too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

async function handleStandalone(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const route = url.pathname.replace(/\/+$/, '') || '/';

    if (route === '/health') {
        sendJson(res, 200, {
            ok: true,
            plugin: PLUGIN_ID,
            version: PLUGIN_VERSION,
            protocol: PROTOCOL,
            inboundPending: inbound.length,
            outboundPending: outbound.length,
            uiConnected: sseClients.size > 0,
            lastFoundryContact,
        });
        return;
    }

    if (!authorised(req.headers['x-uplink-key'] ?? url.searchParams.get('key'))) {
        sendJson(res, 401, { error: 'bad or missing X-Uplink-Key' });
        return;
    }

    if (route === '/event' && req.method === 'POST') {
        try {
            const raw = await readBody(req);
            const payload = JSON.parse(raw || '{}');
            const events = Array.isArray(payload.events) ? payload.events : [];
            const stored = pushInbound(events, payload.state ?? null);
            sendJson(res, 200, { ok: true, accepted: stored.length, cursor: inboundSeq });
        } catch (err) {
            sendJson(res, 400, { error: err.message });
        }
        return;
    }

    if (route === '/outbound' && req.method === 'GET') {
        const items = since(outbound, url.searchParams.get('since'));
        sendJson(res, 200, { cursor: outboundSeq, items });
        return;
    }

    sendJson(res, 404, { error: `no route ${req.method} ${route}` });
}

let standaloneServer = null;

function startStandalone() {
    standaloneServer = http.createServer((req, res) => {
        handleStandalone(req, res).catch((err) => {
            console.error(`[${PLUGIN_ID}] request failed:`, err);
            try {
                sendJson(res, 500, { error: 'internal error' });
            } catch { /* response already sent */ }
        });
    });

    standaloneServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[${PLUGIN_ID}] port ${config.port} is already in use — Foundry will not be able to connect.`);
        } else {
            console.error(`[${PLUGIN_ID}] listener error:`, err);
        }
    });

    standaloneServer.listen(config.port, config.host, () => {
        console.log(`[${PLUGIN_ID}] Foundry listener on http://${config.host}:${config.port} (auth: ${config.secret ? 'on' : 'OFF'})`);
    });
}

/* ------------------------------------------------------------------ */
/* SillyTavern routes (UI extension side)                              */
/* ------------------------------------------------------------------ */

function registerRoutes(router) {
    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });

    router.get('/status', (req, res) => {
        res.json({
            ok: true,
            version: PLUGIN_VERSION,
            protocol: PROTOCOL,
            port: config.port,
            authEnabled: !!config.secret,
            inboundPending: inbound.length,
            outboundPending: outbound.length,
            lastFoundryContact,
            hasState: !!latestState,
        });
    });

    router.get('/state', (req, res) => {
        res.json({ state: latestState, cursor: inboundSeq });
    });

    router.get('/inbound', (req, res) => {
        res.json({ cursor: inboundSeq, items: since(inbound, req.query.since), state: latestState });
    });

    router.get('/stream', (req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.write(`data: ${JSON.stringify({ type: 'hello', cursor: inboundSeq, state: latestState })}\n\n`);
        sseClients.add(res);

        const keepAlive = setInterval(() => {
            try {
                res.write(': keep-alive\n\n');
            } catch {
                clearInterval(keepAlive);
            }
        }, 20000);

        req.on('close', () => {
            clearInterval(keepAlive);
            sseClients.delete(res);
        });
    });

    router.post('/narration', (req, res) => {
        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
        if (!text) {
            res.status(400).json({ error: 'text is required' });
            return;
        }
        const record = pushOutbound(text, req.body.speaker);
        res.json({ ok: true, seq: record.seq });
    });

    router.post('/clear', (req, res) => {
        inbound.length = 0;
        outbound.length = 0;
        res.json({ ok: true });
    });
}

/* ------------------------------------------------------------------ */
/* Plugin lifecycle                                                    */
/* ------------------------------------------------------------------ */

async function init(router) {
    registerRoutes(router);
    startStandalone();
    console.log(`[${PLUGIN_ID}] ready`);
}

async function exit() {
    for (const res of sseClients) {
        try { res.end(); } catch { /* already closed */ }
    }
    sseClients.clear();
    await new Promise((resolve) => {
        if (!standaloneServer) return resolve();
        standaloneServer.close(() => resolve());
    });
    console.log(`[${PLUGIN_ID}] stopped`);
}

module.exports = {
    init,
    exit,
    info: {
        id: PLUGIN_ID,
        name: 'FoundryVTT to SillyTavern NHP Uplink',
        description: 'Receives Lancer combat events from Foundry VTT and relays AI-GM narration back.',
    },
};
