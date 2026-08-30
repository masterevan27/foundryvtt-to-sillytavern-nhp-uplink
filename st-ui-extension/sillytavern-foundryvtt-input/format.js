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
 * Turns raw Foundry/Lancer uplink events into a readable Lancer combat digest,
 * and decides which batches are worth spending a generation on.
 *
 * Pure functions only, no SillyTavern or DOM dependencies, so this module can
 * be unit-tested outside the browser.
 */

export const FLOW_LABEL = {
    WeaponAttackFlow: 'Weapon Attack',
    BasicAttackFlow: 'Basic Attack',
    TechAttackFlow: 'Tech Attack',
    DamageRollFlow: 'Damage',
    StatRollFlow: 'Stat Check',
    StructureFlow: 'STRUCTURE DAMAGE',
    SecondaryStructureFlow: 'Structure Table',
    OverheatFlow: 'OVERHEATING',
    OverchargeFlow: 'Overcharge',
    StabilizeFlow: 'Stabilize',
    FullRepairFlow: 'Full Repair',
    BurnFlow: 'Burn Check',
    CascadeFlow: 'CASCADE CHECK',
    CoreActiveFlow: 'CORE POWER',
    NPCRechargeFlow: 'NPC Recharge',
    SystemFlow: 'System',
    TalentFlow: 'Talent',
    ActivationFlow: 'Action',
    BondPowerFlow: 'Bond Power',
    ActionTrackFlow: 'Action Tracking',
    SimpleTextFlow: 'Note',
    SimpleHTMLFlow: 'Note',
};

const RESOURCE_LABEL = {
    hp: 'HP',
    heat: 'Heat',
    structure: 'Structure',
    stress: 'Stress',
    overshield: 'Overshield',
    burn: 'Burn',
};

function indent(text, lines) {
    if (!text) return '';
    return String(text)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, lines)
        .map((l) => `    ${l}`)
        .join('\n');
}

function signed(n) {
    if (typeof n !== 'number') return '';
    return n > 0 ? `+${n}` : `${n}`;
}

function damagePhrase(d) {
    const parts = d.parts.map((p) => `${p.amount}${p.type ? ` ${p.type}` : ''}`);
    const to = d.target ? ` to ${d.target}` : '';
    const ap = d.ap ? ' AP' : '';
    if (parts.length === 1) return `DAMAGE ${parts[0]}${ap}${to}`;
    return `DAMAGE ${d.total}${ap}${to} (${parts.join(' + ')})`;
}

/**
 * The numbers the GM must not get wrong, taken from the flow's own state rather
 * than scraped out of the card text. These lines are never truncated: the card
 * body below them is flavour and gets cut to maxCardLines, which is how a 13
 * used to reach the model as a 1.
 */
function rollLines(event) {
    const out = [];
    const r = event.rolls ?? {};
    const defense = r.defense ? String(r.defense).toUpperCase() : 'DEFENSE';

    for (const t of r.targets ?? []) {
        const outcome = t.crit ? 'CRIT' : t.hit ? 'HIT' : 'MISS';
        const lock = t.usedLockOn ? ', spent LOCK ON' : '';
        out.push(`ATTACK ROLL ${t.total ?? '?'} vs ${t.target ?? 'target'} ${defense} => ${outcome}${lock}`);
    }
    if (!out.length && r.attackTotals?.length) {
        out.push(`ATTACK ROLL ${r.attackTotals.join(', ')} (no target selected)`);
    }
    if (!out.length && typeof r.total === 'number') {
        out.push(`ROLL TOTAL ${r.total}`);
    }
    for (const d of r.damage ?? []) out.push(damagePhrase(d));

    // Fall back to Foundry's own roll totals when the flow shape is unfamiliar.
    if (!out.length && Array.isArray(event.rollTotals) && event.rollTotals.length) {
        out.push(`ROLL TOTAL${event.rollTotals.length > 1 ? 'S' : ''} ${event.rollTotals.join(', ')}`);
    }
    return out.map((l) => `    ${l}`);
}

/* ------------------------------------------------------------------ */
/* Mission briefing                                                    */
/* ------------------------------------------------------------------ */

export const BRIEFING_HEADER = '[FOUNDRY VTT // MISSION BRIEFING]';

const BRIEF_ITEMS = 12;
const BRIEF_CONTEXT_LINES = 40;

function briefSection(title, items) {
    if (!items?.length) return null;
    return [title, ...items.slice(0, BRIEF_ITEMS).map((i) => `  - ${i}`)].join('\n');
}

/**
 * The mission the fight is part of: goals, stakes and situation, laid out the
 * way the board state is laid out so the two read as one instrument panel.
 *
 * Returns null for a briefing-less scene cue, which is what older Foundry
 * modules send and what `describeEvent` falls back to.
 */
export function formatBriefing(event) {
    const b = event?.briefing;
    if (!b) return null;

    const head = [];
    if (b.designation) head.push(b.designation);
    if (b.title) head.push(String(b.title).toUpperCase());
    if (event.scene && String(event.scene).toUpperCase() !== String(b.title ?? '').toUpperCase()) {
        head.push(`DEPLOYMENT  ${event.scene}`);
    }

    const blocks = [];
    if (head.length) blocks.push(head.join('\n'));
    if (b.quote) blocks.push(`"${b.quote}"`);

    const goals = briefSection('GOALS', b.goals);
    if (goals) blocks.push(goals);

    const stakes = briefSection('STAKES', b.stakes);
    if (stakes) blocks.push(stakes);

    if (b.context?.length) blocks.push(b.context.slice(0, BRIEF_CONTEXT_LINES).join('\n'));

    return blocks.length ? blocks.join('\n\n') : null;
}

export function describeEvent(event, cfg = {}) {
    const lines = cfg.maxCardLines ?? 6;
    const who = event.actor ?? 'Someone';

    switch (event.type) {
        case 'combat_start': {
            const sides = (event.combatants ?? []).map((c) => `${c.name} [${c.disposition}]`).join(', ');
            return `=== COMBAT BEGINS on ${event.scene ?? 'the field'} ===\n    Combatants: ${sides || 'unknown'}`;
        }
        case 'combat_end':
            return `=== COMBAT ENDS after ${event.rounds ?? '?'} rounds ===`;
        case 'round_change':
            return `--- ROUND ${event.round} ---`;
        case 'turn_change':
            return `> ${event.activeCombatant ?? 'Unknown'} [${event.disposition}] takes their turn.`;
        case 'activation':
            return `> ${who} [${event.disposition}] activates.`;

        case 'flow': {
            const label = FLOW_LABEL[event.flow] ?? event.flow;
            const item = event.item ? ` - ${event.item}` : '';
            const head = `* ${who}: ${label}${item}${event.success === false ? ' (cancelled)' : ''}`;
            const body = indent(event.rendered, lines);
            return [head, ...rollLines(event), body].filter(Boolean).join('\n');
        }

        case 'chat_card': {
            const rolls = rollLines(event);
            const body = indent(event.text, lines);
            if (!rolls.length && !body) return null;
            return [`* ${who}:`, ...rolls, body].filter(Boolean).join('\n');
        }

        case 'resource_change': {
            const parts = (event.changes ?? []).map((c) => {
                const name = RESOURCE_LABEL[c.resource] ?? c.resource;
                const max = c.max != null ? `/${c.max}` : '';
                if (typeof c.delta === 'number' && c.from != null) {
                    return `${name} ${c.from} -> ${c.to}${max} (${signed(c.delta)})`;
                }
                return `${name} ${c.to}${max}`;
            });
            return parts.length ? `* ${who}: ${parts.join(', ')}` : null;
        }

        case 'status_change':
            return `* ${who} ${event.gained ? 'gains' : 'loses'} ${String(event.status).toUpperCase()}`;

        case 'movement':
            return `* ${who} moves ${event.spaces} space${event.spaces === 1 ? '' : 's'} (${event.from?.x},${event.from?.y}) -> (${event.to?.x},${event.to?.y})`;

        case 'chat':
            if (event.inCharacter && event.actor) return `[${event.actor}]: "${event.text}"`;
            return `[OOC ${event.user}]: ${event.text}`;

        case 'gm_directive':
            return `[DIRECTIVE FROM ${event.user}]: ${event.text}`;

        case 'scene_brief':
            return (
                formatBriefing(event) ??
                `[The GM requests a scene description for ${event.scene ?? 'the current scene'}.]`
            );

        case 'uplink_connected':
            return `[Foundry connected: world "${event.world ?? '?'}", scene "${event.scene ?? '?'}".]`;

        default:
            return `* ${event.type}${event.actor ? ` (${event.actor})` : ''}`;
    }
}

/* ------------------------------------------------------------------ */
/* Board state                                                         */
/* ------------------------------------------------------------------ */

/**
 * A combatant line. Static defences (Armor / Evasion / E-Def, speed, size)
 * only appear in the `full` variant, which is emitted once when combat opens.
 * The recurring live block carries just what actually moves.
 */
export function formatCombatant(c, full = false) {
    const bits = [];
    if (c.hp) bits.push(`HP ${c.hp.value}${c.hp.max != null ? `/${c.hp.max}` : ''}`);
    if (c.heat) bits.push(`Heat ${c.heat.value}${c.heat.max != null ? `/${c.heat.max}` : ''}`);
    if (c.structure) bits.push(`Str ${c.structure.value}${c.structure.max != null ? `/${c.structure.max}` : ''}`);
    if (c.stress) bits.push(`Stress ${c.stress.value}${c.stress.max != null ? `/${c.stress.max}` : ''}`);
    if (c.overshield) bits.push(`OS ${c.overshield}`);
    if (c.burn) bits.push(`Burn ${c.burn}`);
    if (full) {
        if (c.armor) bits.push(`Armor ${c.armor}`);
        if (c.evasion != null) bits.push(`Ev ${c.evasion}`);
        if (c.edef != null) bits.push(`EDef ${c.edef}`);
        if (c.speed != null) bits.push(`Spd ${c.speed}`);
        if (c.size != null) bits.push(`Size ${c.size}`);
    }

    const statuses = c.statuses?.length ? `  [${c.statuses.join(', ').toUpperCase()}]` : '';
    const pos = c.position ? `  @(${c.position.x},${c.position.y})` : '';
    const flags = [];
    if (c.isActive) flags.push('ACTIVE');
    if (c.defeated || c.destroyed) flags.push('DOWN');
    const flagStr = flags.length ? `  <${flags.join(' ')}>` : '';

    return `  ${c.name}${flagStr}  ${bits.join('  ')}${statuses}${pos}`;
}

export function formatState(state, full = false) {
    if (!state) return '';
    const header = state.inCombat
        ? `BOARD STATE - Round ${state.round ?? '?'}${state.activeCombatant ? `, active: ${state.activeCombatant}` : ''}`
        : 'BOARD STATE - out of combat';

    const all = [...(state.combatants ?? []), ...(state.bystanders ?? [])];
    if (!all.length) return `${header}\n  (no tokens)`;

    const groups = { friendly: [], hostile: [], neutral: [], other: [] };
    for (const c of all) {
        const key = groups[c.disposition] ? c.disposition : 'other';
        groups[key].push(c);
    }

    const lines = [header];
    for (const [key, title] of [['friendly', 'ALLIED'], ['hostile', 'HOSTILE'], ['neutral', 'NEUTRAL'], ['other', 'OTHER']]) {
        if (!groups[key].length) continue;
        lines.push(`${title}:`);
        for (const c of groups[key]) lines.push(formatCombatant(c, full));
    }
    return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Significance                                                        */
/* ------------------------------------------------------------------ */

/** Flows that are a narrative beat in their own right. */
const SIGNIFICANT_FLOWS = new Set([
    'StructureFlow', 'SecondaryStructureFlow', 'OverheatFlow', 'CascadeFlow',
    'OverchargeFlow', 'CoreActiveFlow', 'StabilizeFlow', 'FullRepairFlow', 'BondPowerFlow',
]);

/** Event types that always deserve a reply. */
const SIGNIFICANT_TYPES = new Set([
    'combat_start', 'combat_end', 'gm_directive', 'scene_brief', 'chat',
]);

/**
 * The GM talking to the AI directly. Never make these wait out a cooldown, and
 * never let the combat-only filter swallow them -- a briefing is sent before
 * the fight starts, which is precisely when that filter is closed.
 */
export const GM_DIRECTED_TYPES = new Set(['gm_directive', 'scene_brief']);

function crossesThreshold(change) {
    if (change.resource === 'structure' || change.resource === 'stress') return true;
    if (change.resource !== 'hp') return false;
    if (typeof change.to !== 'number') return false;
    if (change.to <= 0) return true;
    if (typeof change.max !== 'number' || !change.max) return false;
    // Dropping through half health is a beat; chip damage above it is not.
    return typeof change.from === 'number' && change.from > change.max / 2 && change.to <= change.max / 2;
}

/**
 * Decide whether a batch of events is worth a generation.
 *
 * Everything gets injected either way -- this only governs whether we spend a
 * full-context round trip narrating it now, or let it ride until the next beat.
 *
 * @returns {{significant: boolean, urgent: boolean, reason: string|null}}
 */
export function weighEvents(events) {
    let reason = null;

    for (const e of events) {
        if (GM_DIRECTED_TYPES.has(e.type)) return { significant: true, urgent: true, reason: e.type };

        if (SIGNIFICANT_TYPES.has(e.type)) {
            reason ??= e.type;
            continue;
        }

        if (e.type === 'flow' && SIGNIFICANT_FLOWS.has(e.flow)) {
            reason ??= e.flow;
            continue;
        }

        if (e.type === 'status_change' && e.gained) {
            reason ??= `status:${e.status}`;
            continue;
        }

        if (e.type === 'resource_change' && (e.changes ?? []).some(crossesThreshold)) {
            reason ??= `resource:${e.actor ?? 'unknown'}`;
        }
    }

    return { significant: !!reason, urgent: false, reason };
}

/* ------------------------------------------------------------------ */
/* Digest                                                              */
/* ------------------------------------------------------------------ */

/**
 * Render events as a feed block. Board state is deliberately NOT included --
 * it is injected separately as a single live block, so the chat history does
 * not accumulate one stale snapshot per turn.
 *
 * A mission briefing is hoisted out of the feed and banner-headed on its own.
 * It is standing context for the whole engagement rather than a beat inside
 * it, and burying "the party is here to find the man who ruined them" between
 * two damage rolls is exactly how the model loses track of why it matters.
 */
export function buildDigest(events, cfg = {}) {
    const briefings = [];
    const feed = [];

    for (const event of events) {
        if (event.type === 'scene_brief' && event.briefing) {
            const brief = formatBriefing(event);
            if (brief) {
                briefings.push(brief);
                continue;
            }
        }
        const described = describeEvent(event, cfg);
        if (described) feed.push(described);
    }

    const blocks = [];
    if (briefings.length) blocks.push([BRIEFING_HEADER, '', briefings.join('\n\n')].join('\n'));
    if (feed.length) blocks.push(['[FOUNDRY VTT // TABLE FEED]', '', feed.join('\n')].join('\n'));

    return blocks.length ? blocks.join('\n\n') : null;
}
