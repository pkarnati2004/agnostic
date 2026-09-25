# Catalog

The catalog is the data agnostic scores and bills with: published benchmark results and where each
one came from, the models each agent answers to, the plans each vendor sells, what those plans
include, and token prices. It is one JSON file. agnostic ships with a snapshot and downloads newer
ones into `~/.agnostic/catalog.json`; the higher version wins, and a downloaded file that does not
parse is ignored in favour of the snapshot.

## Reading it

```bash
agn catalog show claude-code:opus:native
```

prints the catalog the daemon is using, then the fresh rows for that profile: the ones naming the
agent first, then bare-model rows, newest first, each with the weight its age has left it. A `*`
marks the rows the last recommendation cited, and the last line names the task class it was made
for and how strong that evidence was:

```
* cited by the last recommendation (debug, strong evidence)
```

## Updating it

```bash
agn catalog update
```

Each check is one GET of `manifest.json`. The catalog itself is downloaded only when the manifest
names a version newer than the one in use, and is written only when its sha256 matches the
manifest, it parses, and its `version` is the one the manifest promised. Anything else leaves the
file on disk in use and reports what went wrong. The command prints one line:

```
catalog updated 12 → 14 (generated 2026-09-08, 212 benchmark rows)
catalog 14 is current (generated 2026-09-08)
catalog 16 needs a newer agn: it uses schema 2 and this agn reads schema 1     # exit 1
agn: could not fetch https://…/manifest.json: <reason>                        # exit 1
```

The daemon runs the same check on its own: once a few seconds after it starts, if the last check on
record is more than a day old, and once every 24 hours while it runs. It records the last check in
`~/.agnostic/catalog-check.json`. This is the only call agnostic makes off your machine.
`catalog_check: false` in `~/.agnostic/config.yaml` turns the daily check off; `agn catalog update`
keeps working. `AGNOSTIC_CATALOG_URL` replaces the base both files are read from, for a mirror or
an offline copy.

The workspace reads the last check once per page load. If it is more than seven days old or it
failed, the page says so and offers "Update now", which runs the same check. With `catalog_check:
false` it says nothing. See [Catalog](workspace.md#catalog).

## What the publisher produces

The catalog lives in its own repo, and a weekly Action writes two files at its root, which is the
base URL agnostic reads:

```
agnostic-catalog/
  catalog.json      # the catalog itself
  manifest.json     # what the daily check reads
```

`manifest.json` is a strict object; an unknown field is an error, not something to ignore:

| Field | Type | What it is |
|---|---|---|
| `schemaVersion` | positive integer | The catalog schema `catalog.json` is written for. An agn that reads an older schema stops here and says so rather than downloading. |
| `version` | positive integer | The catalog's own version, incremented on every publish. agn downloads only when this is higher than the version it is using. |
| `generatedAt` | ISO 8601 timestamp | When the catalog was generated. |
| `sha256` | 64 lowercase hex characters | The digest of `catalog.json`'s bytes, exactly as served. |

```json
{
  "schemaVersion": 1,
  "version": 14,
  "generatedAt": "2026-09-08T03:12:44.000Z",
  "sha256": "9f2a…"
}
```

The three numbers have to agree: `manifest.version` equals `catalog.json`'s `version`,
`manifest.schemaVersion` equals its `schemaVersion`, and `manifest.sha256` is the digest of the
bytes published beside it. agn refuses a download where any of them disagree, so the manifest is
written after the catalog and both are published together.
