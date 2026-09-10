// SPDX-License-Identifier: GPL-3.0-or-later
export function buildEnvelope(events, state, world, snapshotAt, sentAt = Date.now()) {
    const worldId = world?.id ?? null;
    return { source: 'foundry', worldId, world: world?.title ?? worldId,
        snapshotAt, snapshotId: worldId ? `${worldId}:${snapshotAt}` : null,
        sentAt, events, state };
}
