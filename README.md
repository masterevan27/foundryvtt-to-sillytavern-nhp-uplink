# Lancer Uplink: Foundry VTT → SillyTavern

Streams live Lancer combat out of Foundry VTT into SillyTavern, so a character
card can act as an AI GM that narrates, voices NPCs, and reacts to what actually
happened at the table. Its replies come back into Foundry chat.

**Everything here is already installed on this machine.** This document covers
what was installed, how to turn it on, and how to troubleshoot it.

---

## Architecture

Three pieces, because neither application can talk to the other directly.

```
Foundry VTT (GM's browser)
    |  POST /event          (combat events + board state)
    |  GET  /outbound       (poll for AI narration)
    v
foundryvtt-to-sillytavern-nhp-uplink  <-- SillyTavern server plugin, port 5088
    ^
    |  SSE  /stream         (events pushed to the UI)
    |  POST /narration      (AI reply headed back to Foundry)
    |
SillyTavern UI extension (browser) --> character card --> LLM
```

The server plugin deliberately runs its own listener on port **5088** rather
than serving Foundry through SillyTavern's normal Express app. Foundry's
requests are cross-origin, and SillyTavern's CSRF and auth middleware would
reject them. The separate listener sidesteps that entirely.

### Installed locations

| Component | Path |
|---|---|
| Foundry module | `C:\Users\Evan\AppData\Local\FoundryVTT\Data\modules\foundryvtt-to-sillytavern-nhp-uplink` |
| SillyTavern server plugin | `G:\Programs\SillyTavern\plugins\foundryvtt-to-sillytavern-nhp-uplink` |
| SillyTavern UI extension | `G:\Programs\SillyTavern\data\default-user\extensions\SillyTavern-NHP-Uplink` |
| AI GM character card | `G:\Documents\Lancer TTRPG GM Hub\AI GM\FoundryVTT_to_SillyTavern_NHP_Uplink\lancer-ai-gm.card.json` |

`G:\Programs\SillyTavern\config.yaml` was changed: `enableServerPlugins` is now
`true`. The original is backed up as `config.yaml.bak-before-foundry-bridge`.

### Shared secret

```
8296e359b8294f9dbc64bdcbf10afd11
```

Already written into the plugin's `config.json`. You need to paste it into the
Foundry module settings (step 3 below). It only guards localhost, but it stops
any random web page you visit from posting into your game.

---

## Turning it on

### 1. Restart SillyTavern

Server plugins load at startup only. On restart the console should print:

```
[nhp-uplink] Foundry listener on http://127.0.0.1:5088 (auth: on)
[nhp-uplink] ready
```

If you don't see that, the plugin didn't load — see Troubleshooting.

### 2. Import the AI GM character

In SillyTavern, open the character panel, choose import, and select
`lancer-ai-gm.card.json` from this folder. Start a chat with **OMNINET//GM**.

The card tells the model that feed blocks are authoritative mechanical fact it
must never re-roll or contradict — that instruction is what keeps it narrating
instead of hallucinating dice results.

### 3. Enable the Foundry module

In your Lancer world: **Game Settings → Manage Modules → Lancer ↔ SillyTavern
Uplink**, enable, reload. Then **Game Settings → Configure Settings → Lancer ↔
SillyTavern Uplink** and set:

- **SillyTavern uplink URL**: `http://127.0.0.1:5088`
- **Shared secret**: the value above

Everything else has a working default. On connect you'll see a notification if
it can't reach the uplink.

### 4. Check the SillyTavern side

Open the Extensions panel → **FoundryVTT to SillyTavern NHP Uplink**. The status line should
read `plugin up, Foundry listener on port 5088`. Set **Mode**:

| Mode | Behaviour |
|---|---|
| `auto` | Injects the feed and immediately generates a reply. Hands-off. |
| `manual` | Injects the feed; you press send when you want narration. |
| `observe` | Logs digests to the browser console only. Good for tuning. |

Start in `manual` for your first session so you can see what the AI receives
before it starts talking.

---

## What gets sent

Events are buffered and flushed once the table has been quiet for 2.5 seconds
(configurable), so one attack becomes one coherent digest rather than six
fragments. A digest looks like this:

```
[FOUNDRY VTT // TABLE FEED]

--- ROUND 3 ---
> Blackbeard [friendly] takes their turn.
* Blackbeard moves 4 spaces (8,7) -> (12,7)
* Blackbeard: Weapon Attack - Assault Rifle
    ATTACK
    18 vs EVASION 8
    HIT
    9 Kinetic
* Sunzi: HP 22 -> 13/22 (-9)
* Sunzi gains IMPAIRED
[Blackbeard]: "Falling back to the ridge, cover me."

BOARD STATE - Round 3, active: Blackbeard
ALLIED:
  Blackbeard  <ACTIVE>  HP 18/18  Heat 4/6  Str 4/4  Stress 4/4  Armor 1  Ev 8  EDef 8  @(12,7)
HOSTILE:
  Sunzi  HP 13/22  Str 0/1  Stress 1/1  Ev 8  EDef 10  [IMPAIRED]  @(15,9)
```

Captured sources:

- **Lancer flows** — attacks, tech attacks, damage, structure/stress, overcharge,
  overheat, stabilize, cascade, core power, system and talent use. Hooked via
  `lancer.postFlow.*`, which the Lancer system (3.1.3 here) exposes for modules.
- **Chat cards** — the rendered card text carries the real roll numbers. Cards
  are folded into the flow event that produced them, so you get one line, not two.
- **Resource changes** — real before/after deltas for HP, heat, structure, stress,
  burn, overshield.
- **Statuses** — conditions gained and lost.
- **Movement** — coalesced per token, reported in grid spaces.
- **Player chat** — in-character and out-of-character.

### Talking to the AI GM directly

In Foundry chat:

```
/aigm The players are stalling. Have the enemy commander call for reinforcements.
```

This is whispered to GMs and reaches the AI tagged as an out-of-character
directive, which the card is told to obey literally rather than narrate.

Macro API is also available:

```js
game.modules.get("foundryvtt-to-sillytavern-nhp-uplink").api.sendSceneBrief();
game.modules.get("foundryvtt-to-sillytavern-nhp-uplink").api.sendDirective("Describe the dropship arriving.");
```

---

## Tuning

The single most useful setting is **quiet period**. Too short and the AI
narrates mid-attack; too long and it feels laggy. 2500ms suits most tables.
Raise it if your group rolls in fast bursts.

**Append board state** re-sends the full roster on every digest. That is what
lets the AI reason about who is hurt and who is where, but it costs tokens on
every turn. If your context window is tight, turn it off and use the **Insert
board state** button when it matters.

**Only relay during combat** keeps the feed quiet during downtime.

Consider a modest context limit or message trimming in SillyTavern — the board
state block repeats, and old copies are pure noise once superseded.

---

## Troubleshooting

**Plugin didn't load.** Confirm `enableServerPlugins: true` in
`G:\Programs\SillyTavern\config.yaml` and that you fully restarted the server
(not just reloaded the browser).

**Foundry says "uplink unreachable".** Check the listener:

```bash
curl http://127.0.0.1:5088/health
```

Expect JSON with `"ok": true`. If the port is taken, change `port` in
`G:\Programs\SillyTavern\plugins\foundryvtt-to-sillytavern-nhp-uplink\config.json` and update the
Foundry setting to match.

**401 errors.** The secret in Foundry's settings doesn't match `config.json`.

**Extension status says "not reachable".** The UI extension talks to the plugin
through SillyTavern itself, so this means the plugin isn't loaded — same fix as
the first item.

**Events arrive but nothing generates.** You're in `manual` or `observe` mode.

**Nothing comes back to Foundry.** Check "Relay AI replies back to Foundry chat"
in the extension, and "Receive AI-GM narration" in Foundry.

**Duplicated or missing events with two GMs logged in.** Only the primary active
GM's client transmits, by design. If that GM disconnects, reload the remaining
GM's browser to hand over the uplink.

**Verbose diagnostics.** Turn on `debug` in the Foundry module settings and
watch the browser console; the plugin logs every event when `logEvents` is true
in its `config.json`.

---

## Extending it

`format.js` in the UI extension holds all digest formatting as pure functions
with no DOM or SillyTavern dependencies, so you can test changes with plain
Node. That's the file to edit if you want different prose, more or less detail,
or a different structure for the board state.

To capture something not currently sent, add a hook in the Foundry module's
`uplink.js` that calls `enqueue({ type: "your_type", ... })`, then teach
`describeEvent` in `format.js` how to render it. Unknown event types degrade
gracefully rather than breaking the digest.
