/**
 * Turns raw Foundry/Lancer uplink events into a readable combat digest.
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
    OverchargeFlow: 'Overcharge',
    OverheatFlow: 'OVERHEATING',
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
            return body ? `${head}\n${body}` : head;
        }

        case 'chat_card': {
            const body = indent(event.text, lines);
            return body ? `* ${who}:\n${body}` : null;
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
            return `[The GM requests a scene description for ${event.scene ?? 'the current scene'}.]`;

        case 'uplink_connected':
            return `[Foundry connected: world "${event.world ?? '?'}", scene "${event.scene ?? '?'}".]`;

        default:
            return `* ${event.type}${event.actor ? ` (${event.actor})` : ''}`;
    }
}

export function formatCombatant(c) {
    const bits = [];
    if (c.hp) bits.push(`HP ${c.hp.value}${c.hp.max != null ? `/${c.hp.max}` : ''}`);
    if (c.heat) bits.push(`Heat ${c.heat.value}${c.heat.max != null ? `/${c.heat.max}` : ''}`);
    if (c.structure) bits.push(`Str ${c.structure.value}${c.structure.max != null ? `/${c.structure.max}` : ''}`);
    if (c.stress) bits.push(`Stress ${c.stress.value}${c.stress.max != null ? `/${c.stress.max}` : ''}`);
    if (c.overshield) bits.push(`OS ${c.overshield}`);
    if (c.burn) bits.push(`Burn ${c.burn}`);
    if (c.armor) bits.push(`Armor ${c.armor}`);
    if (c.evasion != null) bits.push(`Ev ${c.evasion}`);
    if (c.edef != null) bits.push(`EDef ${c.edef}`);

    const statuses = c.statuses?.length ? `  [${c.statuses.join(', ').toUpperCase()}]` : '';
    const pos = c.position ? `  @(${c.position.x},${c.position.y})` : '';
    const flags = [];
    if (c.isActive) flags.push('ACTIVE');
    if (c.defeated || c.destroyed) flags.push('DOWN');
    const flagStr = flags.length ? `  <${flags.join(' ')}>` : '';

    return `  ${c.name}${flagStr}  ${bits.join('  ')}${statuses}${pos}`;
}

export function formatState(state) {
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
        for (const c of groups[key]) lines.push(formatCombatant(c));
    }
    return lines.join('\n');
}

export function buildDigest(events, state, cfg = {}) {
    const described = events.map((e) => describeEvent(e, cfg)).filter(Boolean);
    if (!described.length) return null;

    const chunks = ['[FOUNDRY VTT // TABLE FEED]', '', described.join('\n')];
    if (cfg.includeState && state) chunks.push('', formatState(state));
    return chunks.join('\n');
}
