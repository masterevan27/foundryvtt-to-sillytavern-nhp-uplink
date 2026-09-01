# FoundryVTT → SillyTavern NHP Uplink

[![Module version](https://img.shields.io/github/v/release/masterevan27/foundryvtt-to-sillytavern-nhp-uplink?style=for-the-badge&label=MODULE%20VERSION&color=0b6bcb)](https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink/releases/latest)
[![Foundry version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgithub.com%2Fmasterevan27%2Ffoundryvtt-to-sillytavern-nhp-uplink%2Freleases%2Flatest%2Fdownload%2Fmodule.json&query=%24.compatibility.verified&style=for-the-badge&label=FOUNDRY%20VERSION&color=fe6a00)](https://foundryvtt.com/)
[![Lancer system](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgithub.com%2Fmasterevan27%2Ffoundryvtt-to-sillytavern-nhp-uplink%2Freleases%2Flatest%2Fdownload%2Fmodule.json&query=%24.relationships.systems%5B0%5D.compatibility.minimum&style=for-the-badge&label=LANCER%20SYSTEM&prefix=v&suffix=%2B&color=6c3fa8)](https://foundryvtt.com/packages/lancer)

[![Downloads (total)](https://img.shields.io/github/downloads/masterevan27/foundryvtt-to-sillytavern-nhp-uplink/module.zip?style=for-the-badge&label=DOWNLOADS%20(TOTAL)&color=2ea043)](https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink/releases)
[![Downloads (latest)](https://img.shields.io/github/downloads-pre/masterevan27/foundryvtt-to-sillytavern-nhp-uplink/latest/module.zip?style=for-the-badge&label=DOWNLOADS%20(LATEST)&color=2ea043)](https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink/releases/latest)
[![License](https://img.shields.io/badge/LICENSE-GPL--3.0--or--later-blue?style=for-the-badge)](LICENSE)

Streams live [LANCER](https://massifpress.com/lancer) combat out of [Foundry VTT](https://foundryvtt.com/)
into [SillyTavern](https://github.com/SillyTavern/SillyTavern), so a character
card can act as an AI GM that narrates the fight, voices NPCs, and reacts to
what actually happened at the table. Its replies come back into Foundry chat.

The AI never rolls dice or decides outcomes. Foundry stays the authority on
mechanics; the uplink hands the model a faithful, structured account of what
occurred and asks it for fiction.

<details>
<summary><strong>Why "NHP Uplink"?</strong></summary>

In LANCER, an _NHP_ — Non-Human Person — is the setting's term for a machine
intelligence: a paracausal mind run inside a shackled cage, riding along with a
pilot and talking back. That is exactly the role the AI plays here, so the module
is the _uplink_ that carries the table's combat down the wire to it and its
narration back up.

</details>

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

---

## Examples

Four screenshots, collapsed so the page stays short. The first three are the
same exchange — a crit on a simulated Assault mech — seen from SillyTavern, from
Foundry, and from the table.

<details>
<summary><strong>The table feed in SillyTavern</strong> — what the AI GM actually receives, and how it answers</summary>

Foundry's combat flows arrive as structured digests and the AI GM answers each
one in turn. Note what it does _not_ do: on the natural 20 it names the roll and
stops — _"Roll damage and let's see what Foundry gives you"_ — instead of
inventing the damage itself. That restraint is the card's doing, and it is the
single most important thing to carry over if you write your own. The
`BOARD STATE` block under each digest is the live snapshot described in
[Architecture](#architecture).

![The Foundry table feed and the AI GM's replies, alternating in SillyTavern](examples/FoundryVTT%20Table%20Feed%20in%20SillyTavern.png)

</details>

<details>
<summary><strong>The replies coming back into Foundry</strong> — the return leg of the round trip</summary>

The same exchange seen from the other end. AI GM messages land in Foundry's own
chat log interleaved with the Lancer roll cards that prompted them — crit,
narration, damage, narration — so players who never open SillyTavern still read
everything the AI GM says. Note the last message: it reacts to the structure
result Foundry rolled, then closes the scene, because the feed told it the field
was clear.

Narration posted this way carries a flag that stops the module capturing its own
output; the two settings that turn the leg on are in
[Troubleshooting](#troubleshooting).

![AI GM narration posted back into Foundry's chat log between Lancer roll cards](examples/SillyTavern%20AI%20GM%20Feed%20in%20FoundryVTT.png)

</details>

<details>
<summary><strong>The whole thing at the table</strong> — board and AI GM in one Foundry window</summary>

Board on the left, AI GM in the sidebar on the right, both live. This is the
argument for the return leg: the GM runs the fight in Foundry and never switches
windows to read the narration — SillyTavern is doing the work off-screen. Every
number in the sidebar came from Foundry, the model only wrote the prose around
them.

![A Lancer battle in Foundry with AI GM narration in the chat sidebar](examples/FoundryVTT%20simulated%20combat.png)

</details>

<details>
<summary><strong>Out of combat, with SillyTavern's own extras</strong> — ComfyUI image generation and TTS</summary>

None of this comes from the uplink — it is SillyTavern's ComfyUI image
generation (and TTS, which a screenshot cannot show) working from the same chat
and characters. It is here because it is the payoff for keeping the AI GM inside
SillyTavern rather than bolting a chat window onto Foundry: everything
SillyTavern already does comes along for free.

![An out-of-combat AI GM scene illustrated by ComfyUI image generation](examples/SillyTavern%20Extra%20Immersion%20with%20ComfyUI%20and%20TTS.png)

</details>

---

## Install in Foundry

Paste this **Manifest URL** into Foundry's **Add-on Modules → Install Module**:

```
https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink/releases/latest/download/module.json
```

That covers the Foundry half and enables update checks. The SillyTavern
extension installs from its own repository URL and the server plugin is copied
in by hand — see [Install](#install) for all six steps, plus an optional seventh
for the [Lancer UI theme](#7-lancer-ui-theme-optional).

---

## Requirements

|                                                           |                                        |
| --------------------------------------------------------- | -------------------------------------- |
| [Foundry VTT](https://foundryvtt.com/)                    | v12 or v13                             |
| [Lancer system](https://foundryvtt.com/packages/lancer)   | 2.0+ (developed against 3.1.3)         |
| [SillyTavern](https://github.com/SillyTavern/SillyTavern) | any version with server plugin support |

Optional, but recommended: the
[Lancer // CompCon theme](https://github.com/masterevan27/sillytavern-lancer-ui-theme)
— a SillyTavern UI theme in COMP/CON's palette that colour-codes who is speaking.
It is a separate project; see [install step 7](#7-lancer-ui-theme-optional).

The Lancer system only supports Foundry VTT up to **v13** at the moment, so v13
is the practical ceiling for this module even if a newer Foundry is available.

Server plugins are **not** enabled in SillyTavern by default — see install
step 2.

---

## Architecture

Three pieces, because neither application can talk to the other directly.

```
Foundry VTT (GM's browser)
    |  POST /event          (combat events + board state)
    |  GET  /outbound       (poll for AI narration)
    v
foundryvtt-to-sillytavern-nhp-uplink   <- SillyTavern server plugin, port 5088
    ^
    |  SSE  /stream         (events pushed to the UI)
    |  POST /narration      (AI reply headed back to Foundry)
    |
SillyTavern UI extension (browser) -> character card -> LLM
```

The server plugin deliberately runs **its own HTTP listener on port 5088** rather
than serving Foundry through SillyTavern's normal Express app.

<details>
<summary>Why a separate listener, and not SillyTavern's own port</summary>

Foundry's requests are cross-origin, and SillyTavern's Helmet and CSRF middleware
reject them — the preflight comes back with no `Access-Control-Allow-Origin`, so
the browser blocks the POST before it is ever sent. The separate listener
sidesteps that entirely.

</details>

**Do not point Foundry at SillyTavern's web UI port.** That is the most common
misconfiguration; see [Troubleshooting](#troubleshooting).

---

## Install

### 1. Foundry module

In Foundry, go to **Add-on Modules → Install Module** and paste this into the
**Manifest URL** field:

```
https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink/releases/latest/download/module.json
```

Foundry installs the module and then re-checks that URL for updates, so you get
an update prompt whenever a new release is published. Enable it in your Lancer
world afterwards.

The manifest is generated from [`foundry-module/foundryvtt-to-sillytavern-nhp-uplink/module.json`](https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink/blob/main/foundry-module/foundryvtt-to-sillytavern-nhp-uplink/module.json) — the release
workflow stamps it with the release version and download URL before attaching
it. Browse it there if you want to check compatibility before installing.

<details>
<summary>Manual install instead</summary>

Copy `foundry-module/foundryvtt-to-sillytavern-nhp-uplink/` into your Foundry
**Data** directory's `modules/` folder.

Foundry shows its data path under **Configuration** on the setup screen. Note
that if you launch with `--dataPath=<dir>`, Foundry creates a `Data` subfolder
_inside_ it, so modules live at `<dir>/Data/modules/`. Easy to get wrong when
you have more than one install.

Installing this way means no automatic update checks.

</details>

The SillyTavern half below installs separately — Foundry's installer only
understands Foundry modules.

### 2. SillyTavern server plugin

Copy `st-server-plugin/sillytavern-foundryvtt-input-server-plugin/` into
SillyTavern's `plugins/` folder, then create its config from the template:

```bash
cp config.example.json config.json
```

Edit `config.json` and set `secret` to a random string of your own:

```json
{
  "port": 5088,
  "host": "127.0.0.1",
  "secret": "<a random string you generate>",
  "maxQueue": 500,
  "logEvents": false
}
```

Then enable server plugins in SillyTavern's `config.yaml`:

```yaml
enableServerPlugins: true
```

Restart SillyTavern. Plugins load at startup only, so a browser reload will not
do it. The console should print:

```
[foundryvtt-to-sillytavern-nhp-uplink] Foundry listener on http://127.0.0.1:5088 (auth: on)
[foundryvtt-to-sillytavern-nhp-uplink] ready
```

If it says `auth: OFF`, your `secret` is empty — read [Security](#security).

### 3. SillyTavern UI extension

The extension is published in its own repository,
[**sillytavern-foundryvtt-input**](https://github.com/masterevan27/sillytavern-foundryvtt-input),
so SillyTavern's own installer can reach it. In SillyTavern, go to
**Extensions → Install extension** and paste:

```
https://github.com/masterevan27/sillytavern-foundryvtt-input
```

Reload the browser afterwards. Installed this way the extension is a clone, so
SillyTavern can update it in place when a new release is published.

<details>
<summary>Manual install instead</summary>

Copy `st-ui-extension/sillytavern-foundryvtt-input/` from this repo into
`data/<your-user>/extensions/` and reload SillyTavern in the browser.

Installing this way means no automatic updates.

</details>

<details>
<summary>Why it lives in a second repository</summary>

SillyTavern's installer only accepts a repo with `manifest.json` at the **root**,
which this one cannot provide — the extension is one of three components here.
That repo is therefore a generated mirror, rewritten wholesale by this repo's
release workflow from `st-ui-extension/sillytavern-foundryvtt-input/`. Nothing is
developed there; open issues and pull requests against **this** repository.

</details>

### 4. AI GM character card

Import `lancer-ai-gm.card.png` through SillyTavern's character panel and start
a chat with **OMNINET//GM**. The card is a normal PNG with its data embedded in
the image metadata, which is SillyTavern's native character format.

The card instructs the model that feed blocks are authoritative mechanical fact
it must never re-roll or contradict. That instruction is what keeps it narrating
rather than inventing dice results — if you write your own card, carry it over.

<details>
<summary>Three other things in the card worth keeping</summary>

- **Name the roll, then wait.** It is told to say what needs rolling and stop,
  rather than narrating an outcome the feed has not reported yet.
- **Answer whoever spoke.** The feed attributes player dialogue, so the card
  addresses that pilot by name and treats a mid-scene speaker change as normal.
- **Keep it short.** Output is the expensive half of the conversation. The card
  targets one or two paragraphs for a routine beat and reserves length for
  Structure checks, destructions and scene changes.

</details>

### 5. Point Foundry at the uplink

**Game Settings → Configure Settings → FoundryVTT to SillyTavern NHP Uplink**:

- **SillyTavern uplink URL**: `http://127.0.0.1:5088`
- **Shared secret**: the same string you put in `config.json`

Everything else has a working default.

### 6. Choose a mode

Extensions panel → **FoundryVTT to SillyTavern NHP Uplink**:

| Mode      | Behaviour                                                      |
| --------- | -------------------------------------------------------------- |
| `auto`    | Injects the feed and immediately generates a reply. Hands-off. |
| `manual`  | Injects the feed; you press send when you want narration.      |
| `observe` | Logs digests to the browser console only. Good for tuning.     |

Start in `manual` for your first session so you can see what the AI receives
before it starts talking.

### 7. Lancer UI theme (optional)

Purely cosmetic, and entirely optional — the uplink works exactly the same
without it. It is recommended anyway: it makes the SillyTavern window look like
it belongs next to a Lancer table, and colour-codes speakers so the AI GM, your
pilots and hostiles are distinguishable at a glance during a fight.

The theme lives in its own repository,
[**sillytavern-lancer-ui-theme**](https://github.com/masterevan27/sillytavern-lancer-ui-theme),
and is installed independently of everything above.

<details>
<summary>Installing the theme and its controls</summary>

Two halves:

**The extension** (_Lancer Theme Controls_ — separate from the uplink extension
in step 3) — SillyTavern's **Extensions → Install extension**, paste:

```
https://github.com/masterevan27/sillytavern-lancer-ui-theme
```

**The theme itself** — **User Settings → Themes → Import**, pick
`Lancer CompCon.json` from a clone of that repo, then select **Lancer CompCon**
in the theme dropdown. Reload the browser afterwards.

The theme works on its own; the extension only adds the toggles and sliders that
drive it, so install both if you want to tune it. Full details, palette notes and
screenshots are in that repository's README.

</details>

### 8. Import GUI (optional)

Lets a GM browse NPCs rolled by a companion generator script (currently
`generate-npc.py` in the
[Lancer TTRPG GM Hub](https://github.com/masterevan27/Lancer-TTRPG-GM-Hub),
which renders a portrait/token pair per NPC) and pick which ones become
Actors, instead of hand-copying files through Foundry's file picker. It has
no dependency on the narration relay above and works whether or not you use
SillyTavern at all.

Two halves, same shape as the rest of this project — a standalone local
server, and a piece of the Foundry module that polls it:

```bash
cd import-gui-server
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "port": 5089,
  "host": "127.0.0.1",
  "secret": "",
  "npcManifestPath": "<path to generate-npc.py's .generated-npcs.json>",
  "foundryDataRoot": "<path to your Foundry install's Data directory>"
}
```

An item only shows as importable once its files actually live under
`foundryDataRoot` — this tool references images in place, it does not copy
them in for you. Then:

```bash
node server.js
```

and open `http://127.0.0.1:5089` in a browser. Pick a category, click a
card to preview its portrait and token, check the ones you want, and
**Import Selected**.

In Foundry, **Game Settings → Configure Settings → FoundryVTT to
SillyTavern NHP Uplink**, set **Import GUI server URL** to that same
address (and **Import GUI shared secret** if you set one). The primary GM
client polls it and creates the Actors; a badge on each card flips to
**Imported** once that's done. Deleting the Actor in Foundry clears the
badge again on the next poll, so re-importing it later is safe.

Only NPCs exist as generated content today — mechs and spaceships have no
generator yet, so their categories won't appear until one writes manifest
entries in the same shape.

---

## Security

The uplink listener binds to `127.0.0.1` and is not reachable from your network.
The shared secret still matters: **any web page you visit can attempt requests
to `localhost`**, and CORS on this listener is permissive by necessity, since
Foundry's origin varies by deployment. The secret is what stops an arbitrary
page from injecting fabricated combat events or narration into your game.

- A blank or missing `secret` disables authentication entirely. The plugin logs
  `auth: OFF` at startup when that happens.
- `config.json` is gitignored. Never commit it — `config.example.json` is the
  template to ship.
- Treat the secret like a password: generate a fresh random value per install
  rather than reusing one from documentation.

---

## What gets sent

Events are buffered and flushed once the table has been quiet for 2.5 seconds
(configurable), so one attack becomes a single coherent digest rather than six
fragments.

<details>
<summary>Every event type the module captures</summary>

- **Lancer flows** — attacks, tech attacks, damage, structure/stress, overcharge,
  overheat, stabilize, cascade, core power, system and talent use. Hooked via
  `lancer.postFlow.*`, which the Lancer system exposes for modules.
- **Chat cards** — the rendered card text carries the real roll numbers. Cards
  are folded into the flow event that produced them, so you get one line, not two.
- **Resource changes** — real before/after deltas for HP, heat, structure,
  stress, burn and overshield.
- **Statuses** — conditions gained and lost.
- **Movement** — coalesced per token, reported in grid spaces. **Off by default**:
  it is the highest-volume, lowest-value event, and the live board state already
  reports where every token ended up. Enable it if you want movement narrated,
  and use **Minimum move to report** to ignore small repositioning.
- **Player chat** — in-character and out-of-character.

</details>

Non-combatant canvas tokens ("bystanders") are **off by default** and capped when
enabled — they otherwise inflate every board state with scenery.

Only the **primary active GM's** client transmits, so multiple GMs will not
produce duplicate events.

### Talking to the AI GM directly

In Foundry chat:

```
/aigm The players are stalling. Have the enemy commander call for reinforcements.
```

This is whispered to GMs and reaches the AI tagged as an out-of-character
directive, which the card is told to obey literally rather than narrate.

### Mission briefings

The board state tells the AI GM what is happening. A briefing tells it what is
_at stake_ — which is the one thing a combat feed can never carry. Without it
the AI knows Sunzi is at 13/22 and has no idea the party is raiding the compound
to find the man who ended their careers.

Write the mission as an ordinary Foundry journal entry, link it to the scene
(**Scene Configuration → Journal Entry**), and send it:

```
/brief
```

The briefing is whispered to GMs as a receipt and reaches the AI under its own
banner, ahead of the table feed. Because it is a GM directive it bypasses the
significance gate and generates immediately.

`/brief <text>` sends an ad-hoc briefing instead, without touching any journal:

```
/brief The dropship is on final approach. Flak is heavy and the LZ is hot.
```

<details>
<summary><strong>What the journal should look like</strong></summary>

Headings name the sections, lists carry the items, and a wholly italic line is
read as the mission's pull-quote:

```markdown
# Mission // #001

## Catfish

_"Life is full of surprises, some good, some not so good..."_

# Goals

- Locate the ship of a lieutenant from the Vector Dogs.
- Acquire the hash-id of the ship.

# Stakes

- Reputation amongst the higher ups at DIADEM

> Space Station DIADEM 01 is wholly owned by DIADEM CORP.
```

`Goals` also matches _Objectives_ and _Tasks_; `Stakes` matches _Risks_,
_Consequences_ and _Rewards_. Anything else becomes context. Unlabelled bullets
are read as goals. Nothing is mandatory — a journal that is only prose still
sends as context.

The parser reads both Foundry's own editor markup and markdown pasted in as
plain text, so a mission file written for a campaign briefing site such as
[lancer-briefings](https://github.com/Kuenaimaku/lancer-briefings) can be pasted
into a journal entry unchanged.

</details>

<details>
<summary><strong>What the AI receives</strong></summary>

```
[FOUNDRY VTT // MISSION BRIEFING]

MISSION // 001
CATFISH
DEPLOYMENT  DIADEM 01 - Docking Ring

"Life is full of surprises, some good, some not so good..."

GOALS
  - Locate the ship of a lieutenant from the Vector Dogs.
  - Acquire the hash-id of the ship.

STAKES
  - Reputation amongst the higher ups at DIADEM

Space Station DIADEM 01 is wholly owned by DIADEM CORP.
```

A briefing sent mid-combat is hoisted above the turn-by-turn events rather than
buried between two damage rolls, so the model reads it as standing context for
the engagement instead of as a beat inside it.

</details>

If the scene has no journal linked, the module falls back to the entry named in
the **Fallback briefing journal** setting. With neither, `/brief` still sends the
plain scene cue it always did.

<details>
<summary>Macro API</summary>

```js
const api = game.modules.get("foundryvtt-to-sillytavern-nhp-uplink").api;
api.sendBriefing(); // the current scene's mission briefing
api.sendBriefing("Ad-hoc briefing text."); // same, without a journal
api.sendSceneBrief(); // alias, kept for existing macros
api.sendDirective("Describe the dropship arriving.");
api.snapshotState(); // returns the current board state object
api.resolveBriefingSource(); // {name, html} of the journal /brief would use
api.previewBriefing(); // parse it without sending, to check how it reads
api.flush(); // force-send whatever is queued, without waiting
```

</details>

---

## Tuning

The most useful setting is **quiet period**. Too short and the AI narrates
mid-attack; too long and it feels laggy. 2500ms suits most tables — raise it if
your group rolls in fast bursts.

**Inject live board state** keeps exactly one current roster in the prompt,
injected at depth 0 rather than appended to each digest. That means the history
holds one live snapshot instead of one stale snapshot per turn, and because
depth 0 sits behind the cached prefix it does not invalidate prompt caching.
Static defences (Armor, Evasion, E-Defense, speed, size) are omitted from the
recurring block; the **Insert board state** button drops the full sheet when you
want it.

**Only relay during combat** keeps the feed quiet during downtime.

The extension panel carries four buttons: **Send buffered now** flushes the
current buffer without waiting out the quiet period, **Narrate now** overrides
the significance gate and generates immediately, **Reconnect** re-opens the
event stream if the plugin was restarted under it, and **Insert board state**
drops the full roster into chat on demand.

### Cost

Every generation re-sends the whole chat history, so what a session costs is
driven by how _often_ the AI speaks, not by how much Foundry sends. Three things
keep that in check:

**Only generate on narrative beats** (on by default) injects every digest but
spends a generation only on something worth narrating — structure and stress,
overheat, cascade, core power, a status gained, HP crossing half or hitting
zero, a player speaking, or a GM directive. Movement, turn order and stat checks
ride along and are narrated at the next beat. A GM directive always fires
immediately. Two escape valves keep it honest: **Minimum gap between
generations** is a floor between ordinary beats, and **Force a generation after
N unnarrated events** fires anyway once enough has piled up.

**Prompt caching** is the single biggest lever and costs nothing in quality —
cache reads are a tenth of the input price, and almost all of every request is
an identical prefix.

<details>
<summary>Enabling it in SillyTavern's <code>config.yaml</code></summary>

```yaml
claude:
  enableSystemPromptCache: true
  cachingAtDepth: 2
  extendedTTL: true
```

`extendedTTL: true` buys the 1-hour cache. It costs a higher write premium but
pays for itself here, because the significance gate deliberately leaves gaps
longer than the 5-minute default TTL. Verify it is working on the Anthropic
Console usage page — cache-read tokens should dominate.

</details>

**Model choice.** Narration over authoritative mechanics does not need the top
of the range; the card is explicitly told never to adjudicate. Whatever you
pick, stick with it — caches are model-scoped, so switching models forfeits
cache reuse.

<details>
<summary>One cliff to know about: context overflow ends cache reuse</summary>

Once the chat exceeds your context limit and SillyTavern starts dropping the
oldest messages, the prefix changes on every request and message caching quietly
stops paying. Keeping digests compact delays that.

</details>

---

## Troubleshooting

<details>
<summary><strong>"Uplink unreachable: Failed to fetch", with no status code.</strong></summary>

Almost always the wrong port — Foundry pointed at SillyTavern's web UI instead
of the uplink listener. SillyTavern's Express app answers the CORS preflight
without an `Access-Control-Allow-Origin` header, so the browser blocks the
request before sending it and the module never sees a status. Check the listener
directly:

```bash
curl http://127.0.0.1:5088/health
```

Expect `{"ok":true,...}`. `lastFoundryContact: null` means Foundry has never
reached the uplink; `uiConnected` reports whether the SillyTavern extension is
attached.

</details>

<details>
<summary><strong>Plugin didn't load.</strong></summary>

Confirm `enableServerPlugins: true` in `config.yaml` and that you fully restarted
the server, not just the browser.

</details>

<details>
<summary><strong>401 errors.</strong></summary>

The secret in Foundry's settings doesn't match `config.json`.

</details>

<details>
<summary><strong>Extension status says "not reachable".</strong></summary>

The UI extension reaches the plugin through SillyTavern itself, so this means the
plugin isn't loaded — same fix as above.

</details>

<details>
<summary><strong>Extension status says "out of date" or "version mismatch".</strong></summary>

The plugin _is_ loaded; the two halves are just at different versions. This is
the expected failure now that the UI extension auto-updates itself from its own
repo while the server plugin is still copied in by hand — so the extension can
move ahead on its own and leave the plugin behind. Re-copy `st-server-plugin/…`
into SillyTavern's `plugins/` folder and restart the server. Do **not** go
looking at `enableServerPlugins` for this one; loading was never the problem.

</details>

<details>
<summary><strong>Events arrive but nothing generates.</strong></summary>

You're in `manual` or `observe` mode.

</details>

<details>
<summary><strong>Nothing comes back to Foundry.</strong></summary>

Check "Relay AI replies back to Foundry chat" in the extension, and "Receive
AI-GM narration" in Foundry.

</details>

<details>
<summary><strong>The AI keeps replying to itself.</strong></summary>

Narration posted into Foundry carries a flag that stops the module re-capturing
it, so the AI's own words never come back as a table event. If you see feed lines
quoting the AI's last message, either the module is running stale code (see the
next item) or the flag was stripped by another module. The fallback guard for
that case matches on the speaker's name, which only works while Foundry's
**Narration speaker name** and the extension's **Speaker name in Foundry** hold
the same value — both default to `AI GM`. Change one and you must change the
other.

</details>

<details>
<summary><strong>Code changes don't seem to apply.</strong></summary>

Fetch what Foundry actually serves rather than trusting the file you edited; with
multiple installs it is easy to patch a copy nothing loads:

```bash
curl -s http://localhost:30001/modules/foundryvtt-to-sillytavern-nhp-uplink/scripts/uplink.js | head
```

Module JS is cached per page load, so hard-refresh (Ctrl+F5) after any change.

</details>

<details>
<summary><strong>Verbose diagnostics.</strong></summary>

Turn on `debug` in the Foundry module settings and watch the browser console; the
plugin logs every event when `logEvents` is `true` in `config.json`.

</details>

---

## Extending it

`st-ui-extension/sillytavern-foundryvtt-input/format.js` holds all digest formatting
as pure functions with no DOM or SillyTavern dependencies, so you can test
changes with plain Node. That is the file to edit for different prose, more or
less detail, or a different board-state layout.

To capture something not currently sent, add a hook in the Foundry module's
`uplink.js` that calls `enqueue({ type: "your_type", ... })`, then teach
`describeEvent` in `format.js` how to render it. Unknown event types degrade
gracefully rather than breaking the digest.

---

## Releasing

Releases are built by `.github/workflows/release.yml`. Cut one from the
**Actions** tab — **Release → Run workflow** — and enter the version without the
leading `v` (e.g. `0.1.5`).

CI does the version bookkeeping for you. It stamps the version into both
manifests, commits that to `main`, tags **that** commit, and publishes. The tag
therefore always points at a tree that declares its own version.

<details>
<summary>What CI stamps, and why the manifests are treated differently</summary>

The two manifests are consumed differently, which is why the workflow stamps
them at different points:

| File                                                   | How users get it                                   | Stamped with                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `foundry-module/…/module.json`                         | Fetched as a **release asset** by Foundry          | `version`, plus a `download` URL pinned to the tag and a `manifest` URL pointing at `latest` |
| `st-ui-extension/…/manifest.json`                    | Mirrored to the **extension repo** and installed from there | `version` and `homePage`                                                            |
| `st-server-plugin/…/index.js`                        | Copied in by hand                                  | `PLUGIN_VERSION`, the version it reports to the UI extension                                 |

Both stamped files are then committed to `main` in the same `release: vX.Y.Z`
commit, and that commit is what gets tagged. The extension manifest _has_ to be
committed — it is synced out of the tagged tree rather than out of a build
artifact, so stamping it only in an artifact would reach nobody.

A separate `mirror` job then copies `st-ui-extension/sillytavern-foundryvtt-input/` to
[`masterevan27/sillytavern-foundryvtt-input`](https://github.com/masterevan27/sillytavern-foundryvtt-input)
with `manifest.json` at the root and `auto_update` flipped on, which is what
users actually install from. It runs separately from the release job on purpose:
a mirror failure goes red without retracting a release that has already
published.

`module.json` is committed alongside it mostly so the repo does not contradict
the release it just cut. Note the consequence: between releases, the repo copy's
`download` points at the previous tag's `module.zip`. That is consistent with the
`version` beside it, and the next release re-stamps both — but it does mean the
in-repo `module.json` is a snapshot of the last release, not a `latest`-tracking
manifest. Users should paste the release-asset URL below, never a raw link to
the repo copy.

The run also verifies every `esmodules` entry exists and parses, checks the
extension manifest's `version`, `homePage`, `js` and `css`, and packages the
module with `module.json` at the **zip root** (Foundry rejects a nested folder).

That produces the two URLs that matter:

| URL                                    | Purpose                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `releases/latest/download/module.json` | Stable manifest — what users paste, and what Foundry polls for updates |
| `releases/download/vX.Y.Z/module.zip`  | The version-pinned payload                                             |

`manifest` always points at `latest` so update checks resolve to the newest
release, while `download` is pinned to the tag so Foundry fetches the exact
version that manifest describes.

</details>

<details>
<summary>Tagging by hand</summary>

Pushing a tag still triggers a release, but CI can then only _verify_ the
version — a tag has already frozen the tree, so nothing can be bumped into it.
Bump `manifest.json` yourself first, in the commit you intend to tag:

```bash
git tag v0.1.5
git push origin v0.1.5
```

If the manifest does not already declare the tag's version, the build fails
rather than shipping a wrong number.

The tag must also point at a commit that _contains_
`.github/workflows/release.yml`. Tagging an earlier commit produces no release
at all and no error — GitHub simply has no workflow to run at that ref, and the
manifest URL keeps returning 404. Check before pushing:

```bash
git ls-tree -r v0.1.5 --name-only | grep release.yml
```

</details>

---

## License

Copyright (C) 2026 masterevan27.

GPL-3.0-or-later — see [LICENSE](LICENSE). This covers all three components in this
repository: the Foundry module, the SillyTavern server plugin, and the
SillyTavern UI extension.

The [Lancer // CompCon theme](https://github.com/masterevan27/sillytavern-lancer-ui-theme)
is a separate project in its own repository, under its own copy of the same
licence.

LANCER is a trademark of Massif Press. This is an unofficial community tool with
no affiliation to Massif Press, Foundry Gaming LLC, or the SillyTavern project.
