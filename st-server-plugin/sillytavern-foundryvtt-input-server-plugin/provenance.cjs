// SPDX-License-Identifier: GPL-3.0-or-later
// Receiver observations are deliberately separate from caller-supplied fields.
const { createHash } = require('node:crypto');
const DEFAULT_POLICY = Object.freeze({ staleAfterMs: 60000, maxClockSkewMs: 5000 });
const timestamp = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const text = value => typeof value === 'string' && value.trim() ? value : null;
function policyFrom(config = {}) {
    return { staleAfterMs: Number.isFinite(config.staleAfterMs) && config.staleAfterMs > 0 ? config.staleAfterMs : DEFAULT_POLICY.staleAfterMs,
        maxClockSkewMs: Number.isFinite(config.maxClockSkewMs) && config.maxClockSkewMs >= 0 ? config.maxClockSkewMs : DEFAULT_POLICY.maxClockSkewMs };
}
function senderProvenance(payload, receivedAt) {
    return { source: text(payload.source), worldId: text(payload.worldId), worldTitle: text(payload.world),
        sentAt: timestamp(payload.sentAt), snapshotAt: timestamp(payload.snapshotAt),
        snapshotId: text(payload.snapshotId), receivedAt };
}
function evaluateState(record, now = Date.now()) {
    if (!record?.state) return { state: null, stateMeta: { status: 'missing', reason: 'no_snapshot', evaluatedAt: now, ageMs: null, ...DEFAULT_POLICY } };
    const meta = { ...record.stateMeta, evaluatedAt: now };
    meta.ageMs = meta.snapshotAt === null ? null : Math.max(0, now - meta.snapshotAt);
    if (meta.conflict) { meta.status = 'conflict'; meta.reason = meta.conflict.reason; }
    else if (!meta.worldId || meta.source !== 'foundry' || !meta.snapshotId || !meta.snapshotAt || !meta.sentAt) {
        meta.status = 'unknown'; meta.reason = 'missing_sender_provenance';
    } else if (meta.snapshotAt > meta.receivedAt + meta.maxClockSkewMs || meta.sentAt > meta.receivedAt + meta.maxClockSkewMs || meta.snapshotAt > meta.sentAt + meta.maxClockSkewMs) {
        meta.status = 'unknown'; meta.reason = 'sender_clock_skew';
    } else {
        meta.status = meta.ageMs > meta.staleAfterMs ? 'stale' : 'recent';
        meta.reason = meta.status === 'stale' ? 'snapshot_expired' : 'recent_observation_not_live_query';
    }
    return { state: record.state, stateMeta: meta };
}
function observeSnapshot(previous, payload, receivedAt, config = {}) {
    if (!payload.state || typeof payload.state !== 'object' || Array.isArray(payload.state)) return previous;
    const meta = { ...senderProvenance(payload, receivedAt), ...policyFrom(config), conflict: null };
    const state = structuredClone(payload.state);
    meta.stateSha256 = createHash('sha256').update(JSON.stringify(state)).digest('hex');
    let reason = null;
    const old = previous?.stateMeta;
    if (old?.worldId && old.worldId !== meta.worldId) reason = 'world_conflict';
    else if (old?.snapshotAt && !meta.snapshotAt) reason = 'missing_snapshot_time';
    else if (old?.snapshotAt && meta.snapshotAt < old.snapshotAt) reason = 'out_of_order_snapshot';
    else if (old && (meta.snapshotAt === old.snapshotAt || meta.snapshotId === old.snapshotId) && meta.stateSha256 !== old.stateSha256) reason = 'snapshot_conflict';
    if (reason) return { state: previous.state, stateMeta: { ...old, conflict: { reason, incoming: meta } } };
    if (old && meta.snapshotAt === old.snapshotAt && meta.stateSha256 === old.stateSha256) return previous;
    return { state, stateMeta: meta };
}
module.exports = { DEFAULT_POLICY, policyFrom, senderProvenance, evaluateState, observeSnapshot };
