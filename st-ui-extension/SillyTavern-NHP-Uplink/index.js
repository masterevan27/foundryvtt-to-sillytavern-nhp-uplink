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
 * Streams combat events out of the foundryvtt-to-sillytavern-nhp-uplink server plugin, folds them
 * into a readable Lancer combat digest, drops that into the chat, optionally
 * triggers a generation, and relays the AI GM's reply back to Foundry.
 */

import { buildDigest, formatState } from './format.js';

const EXT_ID = 'nhpUplink';
const API = '/api/plugins/foundryvtt-to-sillytavern-nhp-uplink';

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

    const digest = buildDigest(events, latestState, cfg);
    if (!digest) return;

    if (cfg.mode === 'observe') {
        console.log('[nhp-uplink] digest (observe mode):\n', digest);
        updateStatus('digest logged (observe mode)');
        return;
    }

    await injectMessage(digest, cfg);
    updateStatus(`sent ${events.length} event(s) at ${new Date().toLocaleTimeString()}`);

    if (cfg.mode === 'auto') {
        try {
            generating = true;
            await ctx().executeSlashCommandsWithOptions('/trigger');
        } catch (err) {
            console.error('[nhp-uplink] trigger failed', err);
        } finally {
            generating = false;
        }
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
                    if (payload.state) latestState = payload.state;
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

      <label class="checkbox_label"><input id="fb_includeState" type="checkbox"><span>Append board state</span></label>
      <label class="checkbox_label"><input id="fb_onlyInCombat" type="checkbox"><span>Only relay during combat</span></label>
      <label class="checkbox_label"><input id="fb_relayReplies" type="checkbox"><span>Relay AI replies back to Foundry chat</span></label>

      <label for="fb_relaySpeaker">Speaker name in Foundry</label>
      <input id="fb_relaySpeaker" class="text_pole" type="text">

      <div class="nhp-uplink-buttons">
        <input id="fb_flush" class="menu_button" type="button" value="Send buffered now">
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

    bindValue('fb_mode', 'mode');
    bindValue('fb_injectAs', 'injectAs');
    bindValue('fb_feedName', 'feedName');
    bindValue('fb_relaySpeaker', 'relaySpeaker');
    bindValue('fb_quietMs', 'quietMs', Number);
    bindValue('fb_maxWaitMs', 'maxWaitMs', Number);
    bindValue('fb_maxCardLines', 'maxCardLines', Number);

    document.getElementById('fb_flush').addEventListener('click', () => {
        resetTimers();
        emitDigest();
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
        await injectMessage(`[FOUNDRY VTT // BOARD STATE]\n\n${formatState(latestState)}`, settings());
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
        resetTimers();
    });

    connect();

    try {
        const res = await fetch(`${API}/status`, { headers: requestHeaders() });
        const status = await res.json();
        updateStatus(`plugin up, Foundry listener on port ${status.port}`);
    } catch {
        updateStatus('uplink plugin not reachable - is it enabled in config.yaml?');
    }

    console.log('[nhp-uplink] UI extension ready');
});
