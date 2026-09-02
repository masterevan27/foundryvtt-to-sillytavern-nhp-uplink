# The Foundry importer contract

`scripts/importer.js` in this repo consumes the `/importer/*` routes served by
[lancer-npc-import-gui](https://github.com/masterevan27/lancer-npc-import-gui),
which ships inside `module.zip`. The two live in different repositories and
version independently, and a released module is already installed in worlds
nobody here can update.

**So these three routes cannot change unilaterally.** `test/importerContract.test.js`
in [lancer-npc-import-gui](https://github.com/masterevan27/lancer-npc-import-gui)
pins them. A failure there means a shipped Foundry module has been broken.

## Direction

Foundry only ever calls *out*. This server never reaches into a running world,
and the module declares `"socket": false`. Exactly one client polls: the primary
active GM.

## Authentication

Every `/importer/*` request carries:

```
X-Import-Gui-Key: <config.secret>
```

An empty `secret` in `config.json` disables the check. A mismatch is
`401 {"error": "bad or missing X-Import-Gui-Key"}`.

Responses set `Access-Control-Allow-Origin`, because these requests are
cross-origin from Foundry's browser page. The `/api/*` routes do not need this —
they are same-origin with the page this server itself serves.

## `GET /importer/pending`

Returns jobs the GM queued and marks each one `sent`.

```json
{ "jobs": [
  {
    "jobId": "<uuid>",
    "itemId": "<generator's stable item id>",
    "kind": "npc",
    "name": "...",
    "callsign": "...",
    "role": "... or null",
    "faction": "... or null",
    "portraitPath": "<path relative to Foundry's Data/>",
    "tokenPath": "<path relative to Foundry's Data/>",
    "status": "sent",
    "queuedAt": 1234567890,
    "sentAt": 1234567890
  }
] }
```

`portraitPath` and `tokenPath` are already relative to Foundry's `Data/`
directory — this server resolves and, if needed, copies the files under
`config.foundryDataRoot` before queueing. The module sets them straight onto the
Actor; no file transfer happens over this connection.

A job left `sent` for more than two minutes (`SENT_STALE_MS`) is re-offered on
the next poll, so a GM who reloaded mid-import is not stuck.

## `POST /importer/complete`

```json
{ "jobId": "...", "itemId": "...", "ok": true, "actorId": "...", "actorUuid": "...", "error": "only when ok is false" }
```

`200 {"ok": true}` when the `jobId` matches the job held for that `itemId`;
`409 {"ok": false}` when it does not. A `409` is not an error condition — it is
how a duplicate or stale report is refused.

## `POST /importer/reconcile`

```json
{ "entries": [ { "itemId": "...", "actorId": "...", "actorUuid": "..." } ] }
```

The **full** set of Actors currently carrying the module's `importItemId` flag,
sent on every poll. This server replaces its index with it, so deleting an Actor
in Foundry makes that item importable again on the next tick and a fresh machine
with no local state still sees the right picture on first connect.

Returns `200 {"ok": true, "tracked": <index size>}`.

## Changing any of this

Land the server change and the module change together, and bump the module. If
the module cannot be updated in step, add a route rather than altering one.
