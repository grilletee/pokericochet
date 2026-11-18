# fetch-data

Offline tool that turns PokéAPI responses into the local JSON the game loads (`src/data/generated/`).
It is the ONLY place allowed to call PokéAPI; the game never does at runtime (ADR-005, ADR-018).

```
pnpm fetch-data                 species + moves + sprites
pnpm fetch-data -- --no-sprites
pnpm fetch-data -- --delay 1000 milliseconds between the requests of each worker (default 500)
pnpm fetch-data -- --concurrency 2 requests at once (default 4; with 500 ms that is about 6 a second)
pnpm fetch-data -- --roster     builds the roster of generations 1-9 by rule (roster.json, roster.generated.json) and stops
```

## What it reads (all cached, never asked twice)
| Request | Used for |
|---|---|
| `/pokemon/{id}` | its one or two types, the six base stats (ADR-038), level-up moves, sprite URL |
| `/pokemon-species/{pokedexId}` | the name in Spanish (ADR-036); English if Spanish is missing, with a warning |
| `/move/{id}` | name in Spanish, type, power of every candidate move (ADR-039) |
| `/type/{name}` | the 18x18 type chart, raw values (ADR-047) |
| `--roster` only: `/pokemon-species/{id}` (1-1025), `/evolution-chain/{id}`, `/pokemon/{name}` | the roster rule (ADR-048) |

Raw responses go to `tools/fetch-data/.cache/` (git-ignored): `{id}.json`, `species-{id}.json`,
`move-{id}.json`, `type-{name}.json`, the roster pass's `rs-{n}.json` and `chain-{n}.json`, and the
sprite `{id}.png`. A cached file is never requested again.

**Measured cold download of the whole roster, 4 workers and 500 ms.** 4H-B2 (generations 1-4): the
roster rule needed 773 requests (112 s) and the species, moves, types and sprites of the 214 lines
another 1,266 (187 s), about 2,040 requests in 5 minutes and 160 MB of cache. 4G-J (generations 1-9,
measured on top of that cache): the roster rule of the 532 new species and their chains needs 835 more
requests (123 s), and the species, names, moves, sprites and cries of the new lines 1,943 more
(336 s). So a cold cache of the nine generations is about **4,800 requests in 13 minutes** (6 a
second) and **236 MB**. That fits in the 20-minute step of the CI; if a run is cut short, the partial
cache is saved and the next run goes on from there. A cache of generations 1-4 (any older key) is
restored by `restore-keys`, so going from 4 to 9 generations only downloads the new ones (~7.5 min).
A warm run makes no request (5 s). The CI keys the cache by `roster.json`, `roster.rules.json`,
`moves-overrides.json` and `typechart.ts` (see `.github/workflows/ci.yml`).

## What it writes
- `src/data/generated/typeChart.json`: the 18x18 chart with the raw values of the games (0, 0.5, 1, 2).
  The game softens the immunity when it reads it: x0 counts as x0.25 (ADR-047).
- `tools/fetch-data/roster.json` (only with `--roster`): the 425 lines of generations 1-9 by the rule
  of `roster.rules.json` (no legendaries or babies, one branch per split, and without the curated
  `exclude` list: Ultra Beasts, Paradox Pokémon and the forms that only evolve from a regional form,
  4G-J), each one both a ball and a
  wild species; plus the starters, the legendary bosses and the fallback boss, which `roster.rules.json`
  curates by hand.
- `tools/fetch-data/roster.generated.json` (only with `--roster`): the same lines with the rules, the
  counts and the branches left out (which the collection of the Phase 5 may bring back).
- `src/data/generated/species.json`: every species of the roster with `name`, `pokedexId`, `type` (the
  first), `types` (one or two) and the six `baseStats`. Deterministic (no dates); the CI fails if it
  differs from the committed file.
- `src/data/generated/moves.json`: the move of every line at stage 1, 2 and 3, and the name, type and
  power of the moves in use.
- `src/data/generated/moves-report.md`: a table of those choices (species, stage, form, move, power,
  and whether it was chosen by rule `auto`, is a `signature` or fell back to the `default` of its type)
  so a person can review them.
- `src/assets/sprites/<id>.png`: PokeAPI/sprites front sprites, git-ignored, fetched on every build.

## Hand-made inputs
- `roster.rules.json`: the generations, the exclusions, the starters, the legendary bosses and the
  fallback boss.
- `moves-overrides.json`: the default move ladder of each of the 18 types, the signature moves of
  the starters and `versionGroups`, the games whose level-up moves count (ADR-059).

## Same output whatever the day of the download (ADR-059)
A cached response is never asked for again, but PokéAPI keeps growing: when a new game appears, its
version group shows up in the responses downloaded from that day on. A cache that mixes old and new
responses (every cache does: a new species is downloaded today, the rest came weeks ago) would then
give a different learnset to two machines. That is what broke the CI after 4W: `legends-za` was in
the responses the CI downloaded and not in the older ones of the local cache.

So only the version groups in `versionGroups.use` count. One in `versionGroups.ignore` is skipped on
purpose, and **any other one stops the tool** with the species and the game in the message: a new game
is always a decision, never a silent change of the data.

To make a new game count, move it to `use` **and** start from a cache without old `/pokemon/`
responses, or the old responses would still lack it: delete `.cache/<species>.json` locally, and in
the workflows bump `v2` to `v3` in the cache key **and** in the last restore key (today `fetch-data-`,
which would bring the old cache back). Review `moves-report.md` afterwards: the moves will change.

The tool stops, instead of filling a gap, when a form has no learnset, a move has no data, or a
species or a move has no Spanish name. `default` in the report means "no move of the band", read
from complete data; it never stands in for missing data.

## How a move is chosen (ADR-039, ADR-047)
For each stage of a line, take the form shown at that stage. Among the damaging moves of ANY of the
types of the species that this form learns by level-up (a dual type brings coverage), pick the
strongest inside the power band of the tier (30-60, 61-95, 96 or more; ties go to the lower id),
always stronger than the tier before. If the band has none, use the default move of the FIRST type. A
signature in `moves-overrides.json` wins over all of it. The type of that move is the type the
Pokémon attacks with at that stage.

The pure rules live in `parse.ts` and are unit-tested without network (`tests/tools/fetchData.test.ts`).
