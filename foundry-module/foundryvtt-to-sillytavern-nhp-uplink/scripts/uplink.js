/**
 * FoundryVTT to SillyTavern NHP Uplink
 *
 * Runs on exactly one client: the primary active GM. That client observes Lancer
 * flows, chat cards, resource changes and token movement, batches them into
 * normalised events, and POSTs them to the SillyTavern uplink plugin. It also
 * polls the plugin for AI-GM narration and posts it into Foundry chat.
 */

const MOD = "foundryvtt-to-sillytavern-nhp-uplink";

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const SETTINGS = {
  enabled: { type: Boolean, default: true, name: "Enable uplink", hint: "Master switch. Only the primary active GM's client transmits." },
  endpoint: { type: String, default: "http://127.0.0.1:5088", name: "SillyTavern uplink URL", hint: "Base URL of the foundryvtt-to-sillytavern-nhp-uplink server plugin's standalone listener." },
  secret: { type: String, default: "", name: "Shared secret", hint: "Must match the secret in the uplink plugin's config.json. Leave blank to disable auth." },
  sendFlows: { type: Boolean, default: true, name: "Send Lancer flows", hint: "Attacks, tech attacks, damage, structure/stress, overcharge, activations, etc." },
  sendChatCards: { type: Boolean, default: true, name: "Send chat cards", hint: "Rendered text of Lancer chat cards, which carry the actual roll numbers." },
  sendResourceChanges: { type: Boolean, default: true, name: "Send HP/heat changes", hint: "Deltas to HP, heat, structure, stress, burn and overshield." },
  sendStatuses: { type: Boolean, default: true, name: "Send status effects", hint: "Conditions gained or lost (IMPAIRED, JAMMED, EXPOSED, ...)." },
  sendMovement: { type: Boolean, default: true, name: "Send token movement", hint: "Coalesced move events with distance in grid spaces." },
  sendPlayerChat: { type: Boolean, default: true, name: "Send player chat", hint: "In-character and out-of-character messages typed by players." },
  receiveNarration: { type: Boolean, default: true, name: "Receive AI-GM narration", hint: "Poll SillyTavern and post its replies into Foundry chat." },
  narrationSpeaker: { type: String, default: "AI GM", name: "Narration speaker name", hint: "Alias shown on chat messages coming back from SillyTavern." },
  pollSeconds: { type: Number, default: 2, name: "Poll interval (seconds)", hint: "How often to check SillyTavern for new narration." },
  debug: { type: Boolean, default: false, name: "Debug logging", hint: "Verbose console output." }
};

function setting(key) {
  return game.settings.get(MOD, key);
}

function log(...args) {
  console.log(`${MOD} |`, ...args);
}

function debug(...args) {
  if (game.settings.settings.has(`${MOD}.debug`) && setting("debug")) console.debug(`${MOD} |`, ...args);
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Lancer resources are usually {value, max}; be tolerant of plain numbers. */
function bounded(field) {
  if (field == null) return null;
  if (typeof field === "number") return { value: field, max: null };
  if (typeof field === "object") {
    const value = field.value ?? null;
    const max = field.max ?? null;
    if (value === null && max === null) return null;
    return { value, max };
  }
  return null;
}

function scalar(field) {
  if (typeof field === "number") return field;
  if (field && typeof field === "object" && typeof field.value === "number") return field.value;
  return null;
}

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll("script, style").forEach((n) => n.remove());
  // Preserve card structure a little so the digest stays readable.
  div.querySelectorAll("br, hr, div, p, li, tr").forEach((n) => n.append("\n"));
  return coalesceCardText(div.textContent);
}

/**
 * Lancer builds one visual row out of several inline elements: a weapon's
 * threat // range // damage becomes five text nodes, and a target's name and
 * its HIT badge become two. Flattened naively that is six lines of weapon tags
 * before the roll is even mentioned, and the digest's per-card line budget then
 * cuts the card off before the number the GM actually needs. Glue runt
 * fragments back onto the line above so a truncated card still shows the roll.
 */
function coalesceCardText(raw) {
  const out = [];
  for (const piece of String(raw ?? "").split("\n")) {
    const line = piece.replace(/[\s\u00a0]+/g, " ").trim();
    if (!line) continue;
    const prev = out.length ? out[out.length - 1] : null;
    if (prev !== null && line.length <= 4 && prev.length <= 72) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out.join("\n").trim();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function dispositionLabel(token) {
  const d = token?.disposition ?? token?.document?.disposition;
  const C = CONST.TOKEN_DISPOSITIONS;
  if (d === C.FRIENDLY) return "friendly";
  if (d === C.HOSTILE) return "hostile";
  if (d === C.NEUTRAL) return "neutral";
  if (d === C.SECRET) return "secret";
  return "unknown";
}

/** Token position in grid spaces rather than pixels. */
function gridPosition(token) {
  const doc = token?.document ?? token;
  if (!doc || doc.x == null || !canvas?.grid?.size) return null;
  return {
    x: Math.round(doc.x / canvas.grid.size),
    y: Math.round(doc.y / canvas.grid.size)
  };
}

function gridDistance(a, b) {
  if (!a || !b) return null;
  // Lancer uses square grids with diagonal-as-1 movement.
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/* ------------------------------------------------------------------ */
/* Pruning arbitrary flow data into something safe to serialise        */
/* ------------------------------------------------------------------ */

const MAX_STRING = 400;
const MAX_ARRAY = 24;
const MAX_KEYS = 40;

function prune(value, depth = 0) {
  if (value == null) return null;
  const t = typeof value;

  if (t === "number" || t === "boolean") return value;
  if (t === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (t === "function" || t === "symbol") return undefined;

  if (depth > 3) return undefined;

  // Foundry documents collapse to an identity stub.
  if (value instanceof foundry.abstract.Document || value?.documentName) {
    return { _doc: value.documentName ?? "Document", name: value.name ?? null, id: value.id ?? null, type: value.type ?? null };
  }

  // Rolls collapse to their evaluated result.
  if (value instanceof Roll || (value?.formula !== undefined && value?.total !== undefined)) {
    return { formula: value.formula ?? null, total: value.total ?? null, result: typeof value.result === "string" ? value.result : null };
  }

  if (Array.isArray(value)) {
    const out = [];
    for (const item of value.slice(0, MAX_ARRAY)) {
      const p = prune(item, depth + 1);
      if (p !== undefined) out.push(p);
    }
    if (value.length > MAX_ARRAY) out.push(`…${value.length - MAX_ARRAY} more`);
    return out;
  }

  if (value instanceof Set) return prune([...value], depth);
  if (value instanceof Map) return prune(Object.fromEntries(value), depth);

  if (t === "object") {
    const out = {};
    let n = 0;
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith("_") || k === "parent" || k === "document") continue;
      if (n++ >= MAX_KEYS) break;
      const p = prune(v, depth + 1);
      if (p !== undefined && p !== null && !(Array.isArray(p) && p.length === 0)) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }

  return undefined;
}

/* ------------------------------------------------------------------ */
/* Authoritative roll extraction                                       */
/* ------------------------------------------------------------------ */

function tokenName(token) {
  return token?.name ?? token?.document?.name ?? null;
}

/**
 * Lancer keeps the real numbers on the flow's state.data, so read them from
 * there instead of hoping they survive the card's HTML -> text flattening.
 *
 * Shapes (Lancer system v3.1): attack_results[] = {roll, tt};
 * hit_results[] = {target, total, hit, crit, usedLockOn}, where total is a
 * zero-padded string ("07"); targets[] = {target, damage: [{type, amount}],
 * hit, crit, ap}; damage_results[] = {roll, tt, d_type, target};
 * result = {roll, tt} for stat, structure and stress rolls.
 */
function rollSummary(data) {
  if (!data || typeof data !== "object") return undefined;
  const out = {};

  const attackTotals = [];
  for (const r of data.attack_results ?? []) {
    if (typeof r?.roll?.total === "number") attackTotals.push(r.roll.total);
  }
  if (attackTotals.length) out.attackTotals = attackTotals;

  const targets = [];
  for (const h of data.hit_results ?? []) {
    const total = Number(h?.total);
    targets.push({
      target: tokenName(h?.target),
      total: Number.isFinite(total) ? total : null,
      hit: !!h?.hit,
      crit: !!h?.crit,
      usedLockOn: !!h?.usedLockOn
    });
  }
  if (targets.length) out.targets = targets;
  if (typeof data.defense === "string") out.defense = data.defense;

  const damage = [];
  for (const t of data.targets ?? []) {
    const parts = (t?.damage ?? [])
      .filter((d) => typeof d?.amount === "number")
      .map((d) => ({ type: d.type ?? null, amount: d.amount }));
    if (!parts.length) continue;
    damage.push({
      target: tokenName(t?.target),
      hit: !!t?.hit,
      crit: !!t?.crit,
      ap: !!t?.ap,
      parts,
      total: parts.reduce((sum, d) => sum + d.amount, 0)
    });
  }
  if (!damage.length) {
    // An untargeted damage roll only ever populates damage_results.
    for (const d of data.damage_results ?? []) {
      if (typeof d?.roll?.total !== "number") continue;
      damage.push({
        target: tokenName(d?.target),
        parts: [{ type: d?.d_type ?? null, amount: d.roll.total }],
        total: d.roll.total
      });
    }
  }
  if (damage.length) out.damage = damage;

  // Stat checks, structure and stress rolls carry a single result instead.
  const single = data.result?.total ?? data.result?.roll?.total ?? data.roll?.total;
  if (typeof single === "number") out.total = single;

  return Object.keys(out).length ? out : undefined;
}

/* ------------------------------------------------------------------ */
/* Board state snapshot                                                */
/* ------------------------------------------------------------------ */

function snapshotActor(actor, token) {
  if (!actor) return null;
  const s = actor.system ?? {};
  const out = {
    name: token?.name ?? actor.name,
    actorType: actor.type,
    disposition: token ? dispositionLabel(token) : "unknown",
    hp: bounded(s.hp),
    heat: bounded(s.heat),
    structure: bounded(s.structure),
    stress: bounded(s.stress),
    overshield: scalar(s.overshield),
    burn: scalar(s.burn),
    evasion: scalar(s.evasion),
    edef: scalar(s.edef),
    armor: scalar(s.armor),
    speed: scalar(s.speed),
    save: scalar(s.save),
    size: scalar(s.size),
    tier: scalar(s.tier),
    statuses: [...(actor.statuses ?? [])],
    position: gridPosition(token)
  };
  if (s.destroyed) out.destroyed = true;
  if (s.activations != null) out.activations = scalar(s.activations);
  // Drop empty keys so the payload stays small and the digest stays readable.
  for (const [k, v] of Object.entries(out)) {
    if (v === null || (Array.isArray(v) && !v.length)) delete out[k];
  }
  return out;
}

function snapshotState() {
  const combat = game.combat ?? null;
  const state = {
    scene: canvas?.scene?.name ?? null,
    inCombat: !!combat?.started,
    round: combat?.round ?? null,
    activeCombatant: combat?.combatant?.name ?? null,
    combatants: [],
    bystanders: []
  };

  const seen = new Set();

  if (combat) {
    for (const c of combat.combatants) {
      const token = c.token?.object ?? c.token;
      const snap = snapshotActor(c.actor, token ?? c.token);
      if (!snap) continue;
      snap.isActive = combat.combatant?.id === c.id;
      if (c.defeated) snap.defeated = true;
      state.combatants.push(snap);
      if (c.actor?.id) seen.add(c.actor.id);
    }
  }

  // Anything else on the canvas that has Lancer stats but is not in the tracker.
  for (const token of canvas?.tokens?.placeables ?? []) {
    const actor = token.actor;
    if (!actor || seen.has(actor.id)) continue;
    if (!actor.system?.hp) continue;
    if (token.document.hidden) continue;
    const snap = snapshotActor(actor, token);
    if (snap) state.bystanders.push(snap);
    seen.add(actor.id);
  }

  return state;
}

/* ------------------------------------------------------------------ */
/* Outbound queue                                                      */
/* ------------------------------------------------------------------ */

let queue = [];
let flushTimer = null;
let seq = 0;
let transportHealthy = true;

function isUplinkClient() {
  if (!game.user?.isGM) return false;
  const primary = game.users?.activeGM;
  if (primary) return primary.id === game.user.id;
  return true;
}

function enqueue(event) {
  if (!setting("enabled") || !isUplinkClient()) return null;
  event.id = `${Date.now().toString(36)}-${seq++}`;
  event.ts = Date.now();
  queue.push(event);
  if (queue.length > 300) queue.splice(0, queue.length - 300);
  debug("queued", event.type, event);
  scheduleFlush();
  return event;
}

function scheduleFlush() {
  if (flushTimer) return;
  // Short debounce so a flow and its chat card leave together as one batch.
  flushTimer = setTimeout(flush, 450);
}

async function flush() {
  flushTimer = null;
  if (!queue.length) return;

  const batch = queue;
  queue = [];

  const body = JSON.stringify({
    source: "foundry",
    world: game.world?.title ?? game.world?.id ?? null,
    sentAt: Date.now(),
    events: batch,
    state: snapshotState()
  });

  try {
    const res = await fetch(`${setting("endpoint").replace(/\/+$/, "")}/event`, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        "X-Uplink-Key": setting("secret") ?? ""
      },
      body
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    if (!transportHealthy) {
      transportHealthy = true;
      ui.notifications.info("SillyTavern uplink reconnected.");
    }
    debug("flushed", batch.length, "events");
  } catch (err) {
    // Put the batch back at the front so nothing is lost, then retry on the next tick.
    queue = batch.concat(queue).slice(-300);
    if (transportHealthy) {
      transportHealthy = false;
      ui.notifications.warn(`SillyTavern uplink unreachable: ${err.message}`);
    }
    console.warn(`${MOD} | flush failed`, err);
    setTimeout(scheduleFlush, 5000);
  }
}

/* ------------------------------------------------------------------ */
/* Flow capture                                                        */
/* ------------------------------------------------------------------ */

const FLOW_NAMES = [
  "ActivationFlow", "BasicAttackFlow", "WeaponAttackFlow", "TechAttackFlow",
  "DamageRollFlow", "StatRollFlow", "StructureFlow", "SecondaryStructureFlow",
  "OverchargeFlow", "OverheatFlow", "StabilizeFlow", "FullRepairFlow",
  "BurnFlow", "CascadeFlow", "CoreActiveFlow", "NPCRechargeFlow",
  "SystemFlow", "TalentFlow", "BondPowerFlow", "ActionTrackFlow",
  "SimpleTextFlow", "SimpleHTMLFlow"
];

/**
 * Chat cards already queued, so a flow can absorb the card it printed.
 *
 * Printing the card is a step *inside* the flow, so createChatMessage fires
 * before lancer.postFlow -- the card is always the older event, never the
 * newer one. Pairing them the other way round never matched, which is why
 * every attack shipped as a bare flow line plus a detached card.
 */
const recentCards = [];

function rememberCard(event, actorId, speakerName) {
  recentCards.push({ event, actorId, speakerName, ts: Date.now(), claimed: false });
  while (recentCards.length > 12) recentCards.shift();
}

function absorbCardIntoFlow(flowEvent, actorId) {
  const now = Date.now();
  for (let i = recentCards.length - 1; i >= 0; i--) {
    const entry = recentCards[i];
    if (entry.claimed || now - entry.ts > 2500) continue;
    const sameActor = actorId && entry.actorId
      ? actorId === entry.actorId
      : !!flowEvent.actor && entry.speakerName === flowEvent.actor;
    if (!sameActor) continue;
    entry.claimed = true;
    flowEvent.rendered = entry.event.text;
    if (entry.event.rollTotals) flowEvent.rollTotals = entry.event.rollTotals;
    // Drop the standalone card so the digest does not carry it twice. If the
    // batch already flushed, the card is no longer in the queue; the flow still
    // carries the numbers, so the duplicate is harmless.
    const idx = queue.indexOf(entry.event);
    if (idx !== -1) queue.splice(idx, 1);
    debug("absorbed card into flow", flowEvent.flow);
    return;
  }
}

function onFlow(flowName, flow, success) {
  if (!setting("sendFlows")) return;
  const state = flow?.state ?? {};
  const actor = state.actor ?? null;
  const item = state.item ?? null;

  const event = {
    type: "flow",
    flow: flowName,
    success: success !== false,
    actor: actor?.name ?? null,
    actorType: actor?.type ?? null,
    item: item?.name ?? null,
    itemType: item?.type ?? null,
    rolls: rollSummary(state.data),
    data: prune(state.data) ?? undefined
  };

  const emitted = enqueue(event);
  if (emitted) absorbCardIntoFlow(emitted, actor?.id ?? null);
}

/* ------------------------------------------------------------------ */
/* Chat capture                                                        */
/* ------------------------------------------------------------------ */

function onChatMessage(msg) {
  if (!isUplinkClient()) return;

  // Narration this module just posted on SillyTavern's behalf. Re-capturing it
  // would ship the AI's own words back as a player chat event, which SillyTavern
  // then answers -- an endless self-reply loop.
  if (msg.getFlag?.(MOD, "fromSillyTavern")) return;

  // Belt and braces: if the flag is ever lost (another module rewriting the
  // message, a relayed copy), fall back to matching the narration speaker alias.
  const narrationAlias = (setting("narrationSpeaker") ?? "").trim();
  if (narrationAlias && (msg.speaker?.alias ?? "").trim() === narrationAlias) return;

  // A directive typed by anyone via /aigm.
  const directive = msg.getFlag?.(MOD, "directive");
  if (directive) {
    enqueue({ type: "gm_directive", user: msg.author?.name ?? msg.user?.name ?? "unknown", text: directive });
    return;
  }

  const speaker = msg.speaker ?? {};
  const actor = speaker.actor ? game.actors.get(speaker.actor) : null;
  const speakerName = speaker.alias ?? actor?.name ?? msg.author?.name ?? "unknown";
  const text = htmlToText(msg.content);

  const isLancerCard = !!msg.flags?.lancer || !!msg.rolls?.length;

  if (isLancerCard) {
    if (!setting("sendChatCards")) return;
    const rollTotals = (msg.rolls ?? []).map((r) => r.total).filter((n) => typeof n === "number");
    const emitted = enqueue({
      type: "chat_card",
      actor: speakerName,
      text,
      rollTotals: rollTotals.length ? rollTotals : undefined
    });
    // The flow that printed this card has not fired postFlow yet; when it does,
    // absorbCardIntoFlow folds this event into it.
    if (emitted) rememberCard(emitted, actor?.id ?? null, speakerName);
    return;
  }

  if (!setting("sendPlayerChat")) return;
  if (!text) return;

  enqueue({
    type: "chat",
    user: msg.author?.name ?? msg.user?.name ?? "unknown",
    actor: speaker.alias ?? actor?.name ?? null,
    inCharacter: !!(speaker.alias || actor),
    whisper: !!msg.whisper?.length,
    text
  });
}

/* ------------------------------------------------------------------ */
/* Resource + status capture                                           */
/* ------------------------------------------------------------------ */

const TRACKED_RESOURCES = ["hp", "heat", "structure", "stress", "overshield", "burn"];

/** Values captured before an update lands, keyed by actor id. */
const preUpdateValues = new Map();

function onPreUpdateActor(actor, changes) {
  if (!setting("sendResourceChanges")) return;
  if (!changes.system) return;
  const before = {};
  for (const key of TRACKED_RESOURCES) {
    if (changes.system[key] === undefined) continue;
    before[key] = scalar(actor.system?.[key]);
  }
  if (Object.keys(before).length) preUpdateValues.set(actor.id, before);
}

function onUpdateActor(actor, changes) {
  if (!setting("sendResourceChanges")) return;
  const sys = changes.system;
  if (!sys) return;

  const before = preUpdateValues.get(actor.id) ?? {};
  preUpdateValues.delete(actor.id);

  const deltas = [];
  for (const key of TRACKED_RESOURCES) {
    if (sys[key] === undefined) continue;
    const after = scalar(actor.system?.[key]);
    if (after === null) continue;
    const prior = before[key];
    if (prior === after) continue; // no real change
    deltas.push({
      resource: key,
      from: prior ?? null,
      to: after,
      delta: typeof prior === "number" ? after - prior : null,
      max: bounded(actor.system?.[key])?.max ?? null
    });
  }

  if (!deltas.length) return;

  const token = actor.getActiveTokens?.()?.[0] ?? null;
  enqueue({
    type: "resource_change",
    actor: token?.name ?? actor.name,
    actorType: actor.type,
    disposition: token ? dispositionLabel(token) : "unknown",
    changes: deltas
  });
}

function onActiveEffect(effect, added) {
  if (!setting("sendStatuses")) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;
  const label = effect.name ?? effect.label ?? "unknown effect";
  const token = actor.getActiveTokens?.()?.[0] ?? null;
  enqueue({
    type: "status_change",
    actor: token?.name ?? actor.name,
    disposition: token ? dispositionLabel(token) : "unknown",
    status: label,
    gained: added
  });
}

/* ------------------------------------------------------------------ */
/* Movement capture (coalesced per token)                              */
/* ------------------------------------------------------------------ */

const pendingMoves = new Map(); // tokenId -> {from, timer}

/** The updateToken hook sees the new position, so record the origin beforehand. */
function onPreUpdateToken(tokenDoc, changes) {
  if (!setting("sendMovement")) return;
  if (changes.x === undefined && changes.y === undefined) return;
  if (pendingMoves.has(tokenDoc.id)) return; // keep the origin of the first hop
  pendingMoves.set(tokenDoc.id, { from: gridPosition(tokenDoc), timer: null });
}

function onUpdateToken(tokenDoc, changes) {
  if (!setting("sendMovement")) return;
  if (changes.x === undefined && changes.y === undefined) return;
  if (!tokenDoc.actor) return;

  const id = tokenDoc.id;
  const existing = pendingMoves.get(id);
  const from = existing?.from ?? gridPosition(tokenDoc);

  if (existing?.timer) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    const entry = pendingMoves.get(id);
    pendingMoves.delete(id);
    if (!entry) return;
    const to = gridPosition(tokenDoc);
    const distance = gridDistance(entry.from, to);
    if (!distance) return;
    enqueue({
      type: "movement",
      actor: tokenDoc.name,
      disposition: dispositionLabel(tokenDoc),
      from: entry.from,
      to,
      spaces: distance
    });
  }, 1200);

  pendingMoves.set(id, { from, timer });
}

/* ------------------------------------------------------------------ */
/* Combat lifecycle                                                    */
/* ------------------------------------------------------------------ */

function registerCombatHooks() {
  Hooks.on("combatStart", (combat) => {
    enqueue({
      type: "combat_start",
      scene: canvas?.scene?.name ?? null,
      combatants: combat.combatants.map((c) => ({
        name: c.name,
        disposition: c.token ? dispositionLabel(c.token) : "unknown"
      }))
    });
  });

  Hooks.on("combatRound", (combat, _updates, _opts) => {
    enqueue({ type: "round_change", round: combat.round });
  });

  Hooks.on("combatTurn", (combat) => {
    enqueue({
      type: "turn_change",
      round: combat.round,
      activeCombatant: combat.combatant?.name ?? null,
      disposition: combat.combatant?.token ? dispositionLabel(combat.combatant.token) : "unknown"
    });
  });

  // Lancer Initiative fires turn changes through combatant activation instead.
  Hooks.on("updateCombatant", (combatant, changes) => {
    if (changes.flags?.["lancer-initiative"]?.activations === undefined) return;
    enqueue({
      type: "activation",
      actor: combatant.name,
      round: combatant.combat?.round ?? null,
      disposition: combatant.token ? dispositionLabel(combatant.token) : "unknown"
    });
  });

  Hooks.on("deleteCombat", (combat) => {
    enqueue({ type: "combat_end", rounds: combat.round });
  });
}

/* ------------------------------------------------------------------ */
/* Inbound narration                                                   */
/* ------------------------------------------------------------------ */

let inboundCursor = 0;
let pollTimer = null;

async function pollInbound() {
  if (!setting("enabled") || !setting("receiveNarration") || !isUplinkClient()) return;
  try {
    const url = `${setting("endpoint").replace(/\/+$/, "")}/outbound?since=${inboundCursor}`;
    const res = await fetch(url, { mode: "cors", headers: { "X-Uplink-Key": setting("secret") ?? "" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    inboundCursor = payload.cursor ?? inboundCursor;
    for (const item of payload.items ?? []) await postNarration(item);
  } catch (err) {
    debug("poll failed", err.message);
  }
}

async function postNarration(item) {
  const text = (item?.text ?? "").trim();
  if (!text) return;
  const alias = item.speaker || setting("narrationSpeaker");
  const html = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  await ChatMessage.create({
    content: `<div class="lancer-tavern-narration">${html}</div>`,
    speaker: { alias },
    flags: { [MOD]: { fromSillyTavern: true } }
  });
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  const seconds = Math.max(1, Number(setting("pollSeconds")) || 2);
  pollTimer = setInterval(pollInbound, seconds * 1000);
}

/* ------------------------------------------------------------------ */
/* /aigm chat command                                                  */
/* ------------------------------------------------------------------ */

function registerChatCommand() {
  Hooks.on("chatMessage", (_log, message) => {
    const match = message.match(/^\/aigm\s+([\s\S]+)$/i);
    if (!match) return;
    const text = match[1].trim();
    ChatMessage.create({
      content: `<em>→ AI GM:</em> ${escapeHtml(text)}`,
      whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id),
      flags: { [MOD]: { directive: text } }
    });
    return false;
  });
}

/* ------------------------------------------------------------------ */
/* Public API + init                                                   */
/* ------------------------------------------------------------------ */

Hooks.once("init", () => {
  for (const [key, cfg] of Object.entries(SETTINGS)) {
    game.settings.register(MOD, key, {
      name: cfg.name,
      hint: cfg.hint,
      scope: "world",
      config: true,
      type: cfg.type,
      default: cfg.default,
      onChange: () => {
        if (key === "pollSeconds") startPolling();
      }
    });
  }
  log("settings registered");
});

Hooks.once("ready", () => {
  if (game.system.id !== "lancer") {
    log("not the Lancer system; uplink idle");
    return;
  }

  for (const name of FLOW_NAMES) {
    Hooks.on(`lancer.postFlow.${name}`, (flow, success) => onFlow(name, flow, success));
  }

  Hooks.on("createChatMessage", onChatMessage);
  Hooks.on("preUpdateActor", onPreUpdateActor);
  Hooks.on("updateActor", onUpdateActor);
  Hooks.on("preUpdateToken", onPreUpdateToken);
  Hooks.on("updateToken", onUpdateToken);
  Hooks.on("createActiveEffect", (e) => onActiveEffect(e, true));
  Hooks.on("deleteActiveEffect", (e) => onActiveEffect(e, false));
  registerCombatHooks();
  registerChatCommand();
  startPolling();

  // Expose a small API for macros and debugging.
  game.modules.get(MOD).api = {
    snapshotState,
    sendDirective: (text) => enqueue({ type: "gm_directive", user: game.user.name, text }),
    sendSceneBrief: () => enqueue({ type: "scene_brief", scene: canvas?.scene?.name ?? null }),
    flush
  };

  if (isUplinkClient()) {
    log(`active as uplink client → ${setting("endpoint")}`);
    enqueue({ type: "uplink_connected", world: game.world?.title ?? null, scene: canvas?.scene?.name ?? null });
  } else {
    log("standing by (another GM client owns the uplink)");
  }
});
