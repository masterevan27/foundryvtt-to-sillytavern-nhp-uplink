/*
 * FoundryVTT to SillyTavern NHP Uplink
 * Copyright (C) 2026 Evan Dekalb
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
 * SillyTavern UI extension: FoundryVTT to SillyTavern NHP Uplink
 *
 * Streams combat events out of the sillytavern-foundryvtt-input server plugin, folds them
 * into a readable Lancer combat digest, drops that into the chat, optionally
 * triggers a generation, and relays the AI GM's reply back to Foundry.
 *
 * Token economics: every generation re-sends the whole chat history, so the
 * cost of a session is driven by how OFTEN we generate, not by how much Foundry
 * sends us. Two things keep that in check:
 *
 *   1. A significance gate. Every digest is injected, but only narrative beats
 *      (structure, overheat, a player speaking, a GM directive) spend a
 *      generation. Movement and turn order ride along until the next beat.
 *   2. Board state is injected as a single live block at depth 0 rather than
 *      appended to each digest, so the history holds one current snapshot
 *      instead of one stale snapshot per turn. Depth 0 also keeps it behind
 *      the cached prefix, so it does not invalidate prompt caching.
 */

import { buildDigest, formatState, weighEvents } from './format.js';

const EXT_ID = 'nhpUplink';
const API = '/api/plugins/sillytavern-foundryvtt-input';

/**
 * Must equal PROTOCOL in the server plugin -- see the longer note there. In
 * short: this half auto-updates and the plugin half does not, so they drift,
 * and this number is what turns that drift into a message that says what to do.
 */
const PROTOCOL = 1;

/** script.js extension_prompt_types.IN_CHAT / extension_prompt_roles.SYSTEM. */
const IN_CHAT = 1;
const ROLE_SYSTEM = 0;

const DEFAULTS = {
    enabled: true,
    mode: 'auto',              // auto | manual | observe
    injectAs: 'user',          // user | narrator
    feedName: 'Foundry',
    quietMs: 2500,             // wait for the table to stop acting before digesting
    maxWaitMs: 15000,          // ...but never hold events longer than this
    includeState: true,
    onlyInCombat: false,
    relayReplies: true,
    relaySpeaker: 'AI GM',
    maxCardLines: 6,
    // Significance gate.
    gateGeneration: true,      // only generate on narrative beats
    minGenerateMs: 45000,      // floor between generations
    maxUngenerated: 6,         // ...unless this many events have piled up unnarrated
};

/* ------------------------------------------------------------------ */
/* Settings plumbing                                                   */
/* ------------------------------------------------------------------ */

function ctx() {
    return SillyTavern.getContext();
}

function settings() {
    const c = ctx();
    if (!c.extensionSettings[EXT_ID]) c.extensionSettings[EXT_ID] = structuredClone(DEFAULTS);
    // Fill in any keys added by a later version.
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (c.extensionSettings[EXT_ID][k] === undefined) c.extensionSettings[EXT_ID][k] = v;
    }
    return c.extensionSettings[EXT_ID];
}

function saveSettings() {
    ctx().saveSettingsDebounced();
}

function requestHeaders() {
    const c = ctx();
    if (typeof c.getRequestHeaders === 'function') return c.getRequestHeaders();
    return { 'Content-Type': 'application/json' };
}

/* ------------------------------------------------------------------ */
/* Buffering                                                           */
/* ------------------------------------------------------------------ */

let buffer = [];
let latestState = null;
let quietTimer = null;
let hardTimer = null;
let cursor = 0;
let source = null;
let generating = false;

/** Events injected but not yet narrated, and when we last spent a generation. */
let ungenerated = 0;
let lastGenerateAt = 0;

function resetTimers() {
    if (quietTimer) clearTimeout(quietTimer);
    if (hardTimer) clearTimeout(hardTimer);
    quietTimer = null;
    hardTimer = null;
}

function scheduleDigest() {
    const cfg = settings();
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(emitDigest, cfg.quietMs);
    if (!hardTimer) hardTimer = setTimeout(emitDigest, cfg.maxWaitMs);
}

function acceptEvents(events, state) {
    const cfg = settings();
    if (!cfg.enabled) return;
    if (state) latestState = state;

    for (const e of events) {
        if (cfg.onlyInCombat && !latestState?.inCombat && e.type !== 'gm_directive') continue;
        buffer.push(e);
    }
    if (buffer.length) {
        updateStatus(`${buffer.length} event(s) buffered`);
        scheduleDigest();
    }
}

/* ------------------------------------------------------------------ */
/* Live board state                                                    */
/* ------------------------------------------------------------------ */

/**
 * Keep exactly one board state in the prompt, at depth 0.
 *
 * Depth 0 puts it after the whole conversation, which means (a) it never goes
 * stale in the history and (b) it sits inside the uncached tail, so refreshing
 * it every turn costs nothing in prompt-cache hits.
 */
function refreshStatePrompt() {
    const cfg = settings();
    const c = ctx();
    if (typeof c.setExtensionPrompt !== 'function') return;

    if (!cfg.enabled || !cfg.includeState || !latestState) {
        c.setExtensionPrompt(EXT_ID, '', IN_CHAT, 0, false, ROLE_SYSTEM);
        return;
    }

    const text = `[FOUNDRY VTT // LIVE BOARD STATE]\n${formatState(latestState)}`;
    c.setExtensionPrompt(EXT_ID, text, IN_CHAT, 0, false, ROLE_SYSTEM);
}

function clearStatePrompt() {
    const c = ctx();
    if (typeof c.setExtensionPrompt === 'function') {
        c.setExtensionPrompt(EXT_ID, '', IN_CHAT, 0, false, ROLE_SYSTEM);
    }
}

/* ------------------------------------------------------------------ */
/* Digest emission                                                     */
/* ------------------------------------------------------------------ */

/**
 * Should this batch spend a generation?
 *
 * Urgent beats (a GM directive) always fire. Ordinary beats respect the
 * cooldown. Everything else waits, unless enough unnarrated events have piled
 * up that the AI would be replying to stale ground truth.
 */
function shouldGenerate(events, cfg) {
    if (cfg.mode !== 'auto') return { go: false, why: 'not auto mode' };
    if (!cfg.gateGeneration) return { go: true, why: 'gate disabled' };

    const { significant, urgent, reason } = weighEvents(events);
    if (urgent) return { go: true, why: reason };

    const sinceLast = Date.now() - lastGenerateAt;
    if (significant && sinceLast >= cfg.minGenerateMs) return { go: true, why: reason };
    if (ungenerated >= cfg.maxUngenerated) return { go: true, why: `backlog of ${ungenerated}` };

    if (significant) return { go: false, why: `${reason}, cooling down (${Math.round((cfg.minGenerateMs - sinceLast) / 1000)}s)` };
    return { go: false, why: 'no beat' };
}

async function emitDigest() {
    resetTimers();
    const cfg = settings();
    if (!cfg.enabled || !buffer.length) return;

    if (generating) {
        // Do not interleave with an in-flight generation; try again shortly.
        scheduleDigest();
        return;
    }

    const events = buffer;
    buffer = [];

    const digest = buildDigest(events, cfg);
    if (!digest) return;

    if (cfg.mode === 'observe') {
        console.log('[nhp-uplink] digest (observe mode):\n', digest);
        updateStatus('digest logged (observe mode)');
        return;
    }

    await injectMessage(digest, cfg);
    refreshStatePrompt();
    ungenerated += events.length;

    const { go, why } = shouldGenerate(events, cfg);
    if (!go) {
        updateStatus(`held ${events.length} event(s) - ${why} (${ungenerated} unnarrated)`);
        return;
    }

    updateStatus(`generating on ${why} at ${new Date().toLocaleTimeString()}`);
    try {
        generating = true;
        lastGenerateAt = Date.now();
        ungenerated = 0;
        await ctx().executeSlashCommandsWithOptions('/trigger');
    } catch (err) {
        console.error('[nhp-uplink] trigger failed', err);
        updateStatus(`trigger failed: ${err.message}`);
    } finally {
        generating = false;
    }
}

async function injectMessage(text, cfg) {
    const c = ctx();
    const asNarrator = cfg.injectAs === 'narrator';

    const message = {
        name: asNarrator ? (c.name2 ?? 'System') : cfg.feedName,
        is_user: !asNarrator,
        is_system: asNarrator,
        send_date: c.getMessageTimeStamp ? c.getMessageTimeStamp() : Date.now(),
        mes: text,
        extra: { nhpUplink: true },
    };

    c.chat.push(message);
    await c.addOneMessage(message);
    if (typeof c.saveChat === 'function') await c.saveChat();
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

function connect() {
    disconnect();
    try {
        source = new EventSource(`${API}/stream`);

        source.onopen = () => updateStatus('connected to uplink plugin');

        source.onmessage = (msg) => {
            try {
                const payload = JSON.parse(msg.data);
                if (payload.type === 'hello') {
                    cursor = payload.cursor ?? 0;
                    if (payload.state) {
                        latestState = payload.state;
                        refreshStatePrompt();
                    }
                    return;
                }
                if (payload.type === 'events') {
                    const events = payload.events ?? [];
                    if (events.length) cursor = events[events.length - 1].seq ?? cursor;
                    acceptEvents(events, payload.state);
                }
            } catch (err) {
                console.error('[nhp-uplink] bad SSE payload', err);
            }
        };

        source.onerror = () => {
            updateStatus('stream interrupted, retrying...');
            // EventSource retries on its own; nothing to do here.
        };
    } catch (err) {
        console.error('[nhp-uplink] could not open stream', err);
        updateStatus(`stream failed: ${err.message}`);
    }
}

function disconnect() {
    if (source) {
        source.close();
        source = null;
    }
}

async function relayToFoundry(text) {
    const cfg = settings();
    if (!cfg.relayReplies || !text?.trim()) return;
    try {
        const res = await fetch(`${API}/narration`, {
            method: 'POST',
            headers: requestHeaders(),
            body: JSON.stringify({ text, speaker: cfg.relaySpeaker }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        updateStatus('relayed reply to Foundry');
    } catch (err) {
        console.error('[nhp-uplink] relay failed', err);
        updateStatus(`relay failed: ${err.message}`);
    }
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

async function ownVersion() {
    try {
        const res = await fetch(new URL('./manifest.json', import.meta.url));
        return (await res.json()).version ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

function updateStatus(text) {
    const el = document.getElementById('nhp_uplink_status');
    if (el) el.textContent = text;
}

const PANEL_HTML = `
<div class="nhp-uplink-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>FoundryVTT to SillyTavern NHP Uplink</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <label class="checkbox_label"><input id="fb_enabled" type="checkbox"><span>Enabled</span></label>

      <label for="fb_mode">Mode</label>
      <select id="fb_mode" class="text_pole">
        <option value="auto">Auto - inject events and generate a reply</option>
        <option value="manual">Manual - inject events, I press send</option>
        <option value="observe">Observe - log to console only</option>
      </select>

      <label for="fb_injectAs">Inject feed as</label>
      <select id="fb_injectAs" class="text_pole">
        <option value="user">User message (most reliable)</option>
        <option value="narrator">Narrator / system message</option>
      </select>

      <label for="fb_feedName">Feed display name</label>
      <input id="fb_feedName" class="text_pole" type="text">

      <label for="fb_quietMs">Quiet period before sending (ms)</label>
      <input id="fb_quietMs" class="text_pole" type="number" min="0" step="250">

      <label for="fb_maxWaitMs">Maximum hold time (ms)</label>
      <input id="fb_maxWaitMs" class="text_pole" type="number" min="1000" step="500">

      <label for="fb_maxCardLines">Max lines per chat card</label>
      <input id="fb_maxCardLines" class="text_pole" type="number" min="1" max="40">

      <hr>
      <label class="checkbox_label"><input id="fb_gateGeneration" type="checkbox"><span>Only generate on narrative beats</span></label>
      <small>Every event is still injected. This decides which ones are worth an API call.</small>

      <label for="fb_minGenerateMs">Minimum gap between generations (ms)</label>
      <input id="fb_minGenerateMs" class="text_pole" type="number" min="0" step="5000">

      <label for="fb_maxUngenerated">Force a generation after N unnarrated events</label>
      <input id="fb_maxUngenerated" class="text_pole" type="number" min="1" max="100">
      <hr>

      <label class="checkbox_label"><input id="fb_includeState" type="checkbox"><span>Inject live board state</span></label>
      <label class="checkbox_label"><input id="fb_onlyInCombat" type="checkbox"><span>Only relay during combat</span></label>
      <label class="checkbox_label"><input id="fb_relayReplies" type="checkbox"><span>Relay AI replies back to Foundry chat</span></label>

      <label for="fb_relaySpeaker">Speaker name in Foundry</label>
      <input id="fb_relaySpeaker" class="text_pole" type="text">

      <div class="nhp-uplink-buttons">
        <input id="fb_flush" class="menu_button" type="button" value="Send buffered now">
        <input id="fb_generate" class="menu_button" type="button" value="Narrate now">
        <input id="fb_reconnect" class="menu_button" type="button" value="Reconnect">
        <input id="fb_state" class="menu_button" type="button" value="Insert board state">
      </div>

      <div class="nhp-uplink-status">Status: <span id="nhp_uplink_status">starting...</span></div>
    </div>
  </div>
</div>`;

function bindControls() {
    const cfg = settings();

    const bindCheck = (id, key) => {
        const el = document.getElementById(id);
        el.checked = !!cfg[key];
        el.addEventListener('change', () => {
            settings()[key] = el.checked;
            saveSettings();
            if (key === 'includeState' || key === 'enabled') refreshStatePrompt();
        });
    };

    const bindValue = (id, key, cast = (v) => v) => {
        const el = document.getElementById(id);
        el.value = cfg[key];
        el.addEventListener('change', () => {
            settings()[key] = cast(el.value);
            saveSettings();
        });
    };

    bindCheck('fb_enabled', 'enabled');
    bindCheck('fb_includeState', 'includeState');
    bindCheck('fb_onlyInCombat', 'onlyInCombat');
    bindCheck('fb_relayReplies', 'relayReplies');
    bindCheck('fb_gateGeneration', 'gateGeneration');

    bindValue('fb_mode', 'mode');
    bindValue('fb_injectAs', 'injectAs');
    bindValue('fb_feedName', 'feedName');
    bindValue('fb_relaySpeaker', 'relaySpeaker');
    bindValue('fb_quietMs', 'quietMs', Number);
    bindValue('fb_maxWaitMs', 'maxWaitMs', Number);
    bindValue('fb_maxCardLines', 'maxCardLines', Number);
    bindValue('fb_minGenerateMs', 'minGenerateMs', Number);
    bindValue('fb_maxUngenerated', 'maxUngenerated', Number);

    document.getElementById('fb_flush').addEventListener('click', () => {
        resetTimers();
        emitDigest();
    });

    // Manual override for the gate: narrate whatever has piled up, right now.
    document.getElementById('fb_generate').addEventListener('click', async () => {
        resetTimers();
        await emitDigest();
        if (generating) return;
        try {
            generating = true;
            lastGenerateAt = Date.now();
            ungenerated = 0;
            updateStatus('generating on manual request');
            await ctx().executeSlashCommandsWithOptions('/trigger');
        } catch (err) {
            console.error('[nhp-uplink] manual trigger failed', err);
            updateStatus(`trigger failed: ${err.message}`);
        } finally {
            generating = false;
        }
    });

    document.getElementById('fb_reconnect').addEventListener('click', () => {
        connect();
    });

    document.getElementById('fb_state').addEventListener('click', async () => {
        const res = await fetch(`${API}/state`, { headers: requestHeaders() });
        const payload = await res.json();
        latestState = payload.state ?? latestState;
        if (!latestState) {
            updateStatus('no board state received from Foundry yet');
            return;
        }
        // The manual insert is the full sheet, statics included -- it is a
        // one-off reference drop, not the recurring block.
        await injectMessage(`[FOUNDRY VTT // BOARD STATE]\n\n${formatState(latestState, true)}`, settings());
        refreshStatePrompt();
        updateStatus('board state inserted');
    });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

jQuery(async () => {
    const c = ctx();

    document.getElementById('extensions_settings')?.insertAdjacentHTML('beforeend', PANEL_HTML);
    settings();
    bindControls();

    c.eventSource.on(c.event_types.MESSAGE_RECEIVED, async (messageId) => {
        const cfg = settings();
        if (!cfg.enabled || !cfg.relayReplies) return;
        const message = c.chat[messageId];
        if (!message || message.is_user || message.extra?.nhpUplink) return;
        await relayToFoundry(message.mes);
    });

    c.eventSource.on(c.event_types.CHAT_CHANGED, () => {
        buffer = [];
        ungenerated = 0;
        lastGenerateAt = 0;
        resetTimers();
        clearStatePrompt();
    });

    connect();

    try {
        const res = await fetch(`${API}/status`, { headers: requestHeaders() });

        if (res.status === 404) {
            // The route is absent rather than erroring, which is exactly what an
            // OLD plugin looks like once the plugin id changed -- it is still
            // loaded and running, just answering on the previous path. Saying
            // 'not reachable' here would send the user to config.yaml for a
            // problem that has nothing to do with loading.
            updateStatus(
                `server plugin is out of date - it does not serve ${API}. `
                + 'Re-copy st-server-plugin into SillyTavern/plugins and restart.',
            );
        } else if (!res.ok) {
            updateStatus(`uplink plugin error - HTTP ${res.status}`);
        } else {
            const status = await res.json();
            if (status.protocol !== PROTOCOL) {
                // A plugin older than this check has no protocol field at all,
                // so treat missing as mismatched rather than waving it through.
                const theirs = status.version ?? 'older than 0.1.7';
                updateStatus(
                    `version mismatch - server plugin is ${theirs}, extension is ${await ownVersion()}. `
                    + 'Re-copy st-server-plugin into SillyTavern/plugins and restart.',
                );
                console.warn(
                    `[nhp-uplink] protocol mismatch: plugin ${status.protocol ?? 'none'}, extension ${PROTOCOL}`,
                );
            } else {
                updateStatus(`plugin up, Foundry listener on port ${status.port}`);
            }
        }
    } catch {
        updateStatus('uplink plugin not reachable - is it enabled in config.yaml?');
    }

    console.log('[nhp-uplink] UI extension ready');
});
