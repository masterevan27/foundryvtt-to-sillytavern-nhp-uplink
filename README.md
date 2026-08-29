# FoundryVTT → SillyTavern NHP Uplink

Streams live [LANCER](https://massifpress.com/lancer) combat out of Foundry VTT
into [SillyTavern](https://github.com/SillyTavern/SillyTavern), so a character
card can act as an AI GM that narrates the fight, voices NPCs, and reacts to
what actually happened at the table. Its replies come back into Foundry chat.

The AI never rolls dice or decides outcomes. Foundry stays the authority on
mechanics; the uplink hands the model a faithful, structured account of what
occurred and asks it for fiction.

**Why "NHP Uplink"?** In LANCER, an *NHP* — Non-Human Person — is the setting's
term for a machine intelligence: a paracausal mind run inside a shackled cage,
riding along with a pilot and talking back. That is exactly the role the AI plays
here, so the module is the *uplink* that carries the table's combat down the wire
to it and its narration back up.

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

## Install in Foundry

Paste this **Manifest URL** into Foundry's **Add-on Modules → Install Module**:

```
https://github.com/masterevan27/foundryvtt-to-sillytavern-nhp-uplink/releases/latest/download/module.json
```

That covers the Foundry half and enables update checks. The SillyTavern plugin
and extension are copied in by hand — see [Install](#install) for all six steps.

---

## Requirements

| | |
|---|---|
| [Foundry VTT](https://foundryvtt.com/) | v12 or v13 |
| [Lancer system](https://foundryvtt.com/packages/lancer) | 2.0+ (developed against 3.1.3) |
| [SillyTavern](https://github.com/SillyTavern/SillyTavern) | any version with server plugin support |

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

The server plugin deliberately runs **its own HTTP listener on port 5088**
rather than serving Foundry through SillyTavern's normal Express app. Foundry's
requests are cross-origin, and SillyTavern's Helmet and CSRF middleware reject
them — the preflight comes back with no `Access-Control-Allow-Origin`, so the
browser blocks the POST before it is ever sent. The separate listener sidesteps
that entirely.

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
*inside* it, so modules live at `<dir>/Data/modules/`. Easy to get wrong when
you have more than one install.

Installing this way means no automatic update checks.

</details>

The SillyTavern half below still has to be copied in by hand — Foundry's
installer only understands Foundry modules.

### 2. SillyTavern server plugin

Copy `st-server-plugin/foundryvtt-to-sillytavern-nhp-uplink/` into
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

Copy `st-ui-extension/SillyTavern-NHP-Uplink/` into
`data/<your-user>/extensions/` and reload SillyTavern in the browser.

### 4. AI GM character card

Import `lancer-ai-gm.card.png` through SillyTavern's character panel and start
a chat with **OMNINET//GM**. The card is a normal PNG with its data embedded in
the image metadata, which is SillyTavern's native character format.

The card instructs the model that feed blocks are authoritative mechanical fact
it must never re-roll or contradict. That instruction is what keeps it narrating
rather than inventing dice results — if you write your own card, carry it over.
Three other things in it are worth keeping:

- **Name the roll, then wait.** It is told to say what needs rolling and stop,
  rather than narrating an outcome the feed has not reported yet.
- **Answer whoever spoke.** The feed attributes player dialogue, so the card
  addresses that pilot by name and treats a mid-scene speaker change as normal.
- **Keep it short.** Output is the expensive half of the conversation. The card
  targets one or two paragraphs for a routine beat and reserves length for
  Structure checks, destructions and scene changes.

### 5. Point Foundry at the uplink

**Game Settings → Configure Settings → FoundryVTT to SillyTavern NHP Uplink**:

- **SillyTavern uplink URL**: `http://127.0.0.1:5088`
- **Shared secret**: the same string you put in `config.json`

Everything else has a working default.

### 6. Choose a mode

Extensions panel → **FoundryVTT to SillyTavern NHP Uplink**:

| Mode | Behaviour |
|---|---|
| `auto` | Injects the feed and immediately generates a reply. Hands-off. |
| `manual` | Injects the feed; you press send when you want narration. |
| `observe` | Logs digests to the browser console only. Good for tuning. |

Start in `manual` for your first session so you can see what the AI receives
before it starts talking.

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

A macro API is also available:

```js
const api = game.modules.get("foundryvtt-to-sillytavern-nhp-uplink").api;
api.sendSceneBrief();
api.sendDirective("Describe the dropship arriving.");
api.snapshotState();   // returns the current board state object
api.flush();           // force-send whatever is queued, without waiting
```

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
driven by how *often* the AI speaks, not by how much Foundry sends. Three things
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
an identical prefix. Enable it in SillyTavern's `config.yaml`:

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

**Model choice.** Narration over authoritative mechanics does not need the top
of the range; the card is explicitly told never to adjudicate. Whatever you
pick, stick with it — caches are model-scoped, so switching models forfeits
cache reuse.

One cliff to know about: once the chat exceeds your context limit and
SillyTavern starts dropping the oldest messages, the prefix changes on every
request and message caching quietly stops paying. Keeping digests compact delays
that.

---

## Troubleshooting

**"Uplink unreachable: Failed to fetch", with no status code.**
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

**Plugin didn't load.** Confirm `enableServerPlugins: true` in `config.yaml`
and that you fully restarted the server, not just the browser.

**401 errors.** The secret in Foundry's settings doesn't match `config.json`.

**Extension status says "not reachable".** The UI extension reaches the plugin
through SillyTavern itself, so this means the plugin isn't loaded — same fix as
above.

**Events arrive but nothing generates.** You're in `manual` or `observe` mode.

**Nothing comes back to Foundry.** Check "Relay AI replies back to Foundry chat"
in the extension, and "Receive AI-GM narration" in Foundry.

**The AI keeps replying to itself.** Narration posted into Foundry carries a flag
that stops the module re-capturing it, so the AI's own words never come back as a
table event. If you see feed lines quoting the AI's last message, either the
module is running stale code (see the next item) or the flag was stripped by
another module. The fallback guard for that case matches on the speaker's name,
which only works while Foundry's **Narration speaker name** and the extension's
**Speaker name in Foundry** hold the same value — both default to `AI GM`. Change
one and you must change the other.

**Code changes don't seem to apply.** Fetch what Foundry actually serves rather
than trusting the file you edited; with multiple installs it is easy to patch a
copy nothing loads:

```bash
curl -s http://localhost:30001/modules/foundryvtt-to-sillytavern-nhp-uplink/scripts/uplink.js | head
```

Module JS is cached per page load, so hard-refresh (Ctrl+F5) after any change.

**Verbose diagnostics.** Turn on `debug` in the Foundry module settings and
watch the browser console; the plugin logs every event when `logEvents` is
`true` in `config.json`.

---

## Extending it

`st-ui-extension/SillyTavern-NHP-Uplink/format.js` holds all digest formatting
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

The two manifests are consumed differently, which is why the workflow stamps
them at different points:

| File | How users get it | Stamped with |
|---|---|---|
| `foundry-module/…/module.json` | Fetched as a **release asset** by Foundry | `version`, plus a `download` URL pinned to the tag and a `manifest` URL pointing at `latest` |
| `st-ui-extension/SillyTavern-NHP-Uplink/manifest.json` | Read straight from the **repo**, copied in by hand | `version` and `homePage` |

Both stamped files are then committed to `main` in the same `release: vX.Y.Z`
commit, and that commit is what gets tagged. The extension manifest *has* to be
committed — it is copied out of a clone rather than downloaded from a release,
so stamping it only inside a build artifact would reach nobody.

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

| URL | Purpose |
|---|---|
| `releases/latest/download/module.json` | Stable manifest — what users paste, and what Foundry polls for updates |
| `releases/download/vX.Y.Z/module.zip` | The version-pinned payload |

`manifest` always points at `latest` so update checks resolve to the newest
release, while `download` is pinned to the tag so Foundry fetches the exact
version that manifest describes.

### Tagging by hand

Pushing a tag still triggers a release, but CI can then only *verify* the
version — a tag has already frozen the tree, so nothing can be bumped into it.
Bump `manifest.json` yourself first, in the commit you intend to tag:

```bash
git tag v0.1.5
git push origin v0.1.5
```

If the manifest does not already declare the tag's version, the build fails
rather than shipping a wrong number.

The tag must also point at a commit that *contains*
`.github/workflows/release.yml`. Tagging an earlier commit produces no release
at all and no error — GitHub simply has no workflow to run at that ref, and the
manifest URL keeps returning 404. Check before pushing:

```bash
git ls-tree -r v0.1.5 --name-only | grep release.yml
```

---

## License

Copyright (C) 2026 masterevan27.

GPL-3.0-or-later — see [LICENSE](LICENSE). This covers all three components in this
repository: the Foundry module, the SillyTavern server plugin, and the
SillyTavern UI extension.

LANCER is a trademark of Massif Press. This is an unofficial community tool with
no affiliation to Massif Press, Foundry Gaming LLC, or the SillyTavern project.
