// SPDX-License-Identifier: GPL-3.0-or-later
// Age from receiver-provided age plus local elapsed time avoids comparing clocks.
export function createStateView() {
    let state = null, meta = null, seenAt = 0, connected = false;
    function accept(payload, now = Date.now()) {
        state = payload?.state ?? null;
        meta = payload?.stateMeta ?? null;
        seenAt = now;
        connected = true;
        return current(now);
    }
    function disconnect() { connected = false; }
    function current(now = Date.now()) {
        if (!state) return { state: null, stateMeta: { status: 'missing', reason: 'no_snapshot', ageMs: null } };
        const result = { ...meta };
        const validAge = Number.isFinite(meta?.ageMs) && meta.ageMs >= 0;
        result.ageMs = validAge ? meta.ageMs + Math.max(0, now - seenAt) : null;
        if (!['recent', 'stale', 'unknown', 'conflict'].includes(result.status)) {
            result.status = 'unknown'; result.reason = 'missing_receiver_provenance';
        }
        if (result.status === 'recent') {
            if (!validAge || !Number.isFinite(meta?.staleAfterMs) || !meta?.worldId || !meta?.snapshotAt) {
                result.status = 'unknown'; result.reason = 'incomplete_receiver_provenance';
            } else if (!connected || result.ageMs > meta.staleAfterMs) {
                result.status = 'stale'; result.reason = connected ? 'snapshot_expired' : 'receiver_disconnected';
            }
        }
        return { state, stateMeta: result };
    }
    function format(formatState, full = false, now = Date.now()) {
        const observed = current(now), m = observed.stateMeta;
        const stamp = value => Number.isSafeInteger(value) && value > 0 ? new Date(value).toISOString() : 'unknown';
        const lines = [`[FOUNDRY VTT // BOARD STATE ${m.status.toUpperCase()}]`,
            `Source: ${m.source ?? 'unknown'}; world: ${m.worldTitle ?? '?'} (${m.worldId ?? 'unknown'}).`,
            `Snapshot: ${stamp(m.snapshotAt)}; received: ${stamp(m.receivedAt)}; age: ${m.ageMs === null ? 'unknown' : Math.floor(m.ageMs / 1000) + 's'}; ${m.reason}.`,
            'This is a received historical observation, not a live query. Intent is not execution.'];
        if (observed.state) lines.push(formatState(observed.state, full));
        else lines.push('No board state is available. Request a new Foundry report.');
        return lines.join('\n');
    }
    async function refresh(fetcher, now = Date.now()) {
        try {
            const response = await fetcher();
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            accept(await response.json(), now);
            return { ok: true };
        } catch (error) {
            disconnect();
            return { ok: false, error: error.message };
        }
    }
    return { accept, disconnect, current, format, refresh };
}
