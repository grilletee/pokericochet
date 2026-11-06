# fetch-data

Offline tool that turns PokéAPI responses into the local JSON the game loads (`src/data/generated/`).
It is the ONLY place allowed to call PokéAPI; the game never does at runtime (ADR-005, ADR-018).

```
pnpm fetch-data                 species + moves + sprites
pnpm fetch-data -- --no-sprites
pnpm fetch-data -- --delay 1000 milliseconds between the requests of each worker (default 500)
pnpm fetch-data -- --concurrency 2 requests at once (default 4; with 500 ms that is about 6 a second)
pnpm fetch-data -- --roster     builds the roster of generations 1-4 by rule (roster.json, roster.generated.json) and stops
```

## What it reads (all cached, never asked twice)
| Request | Used for |
|---|---|
| `/pokemon/{id}` | its one or two types, the six base stats (ADR-038), level-up moves, sprite URL |
| `/pokemon-species/{pokedexId}` | the name in Spanish (ADR-036); English if Spanish is missing, with a warning |
| `/move/{id}` | name in Spanish, type, power of every candidate move (ADR-039) |
| `/type/{name}` | the 18x18 type chart, raw values (ADR-047) |
| `--roster` only: `/pokemon-species/{id}` (1-493), `/evolution-chain/{id}`, `/pokemon/{name}` | the roster rule (ADR-048) |

Raw responses go to `tools/fetch-data/.cache/` (git-ignored): `{id}.json`, `species-{id}.json`,
`move-{id}.json`, `type-{name}.json`, the roster pass's `rs-{n}.json` and `chain-{n}.json`, and the
sprite `{id}.png`. A cached file is never requested again.

**Measured cold download of the whole roster (4H-B2), 4 workers and 500 ms:** the roster rule needs
773 requests (112 s) and the species, moves, types and sprites of the 214 lines (424 forms) plus the
14 legendary bosses another 1,266 (187 s): about 2,040 requests in 5 minutes, 6.8 a second, and 160 MB
of cache. One request at a time it would be about 30 minutes. A warm run makes none (2 s). The CI keeps
the cache between runs, saves it even when the step fails so the next run resumes, and keys it by
`roster.json`, `roster.rules.json`, `moves-overrides.json` and `typechart.ts` (see
`.github/workflows/ci.yml`).

## What it writes
- `src/data/generated/typeChart.json`: the 18x18 chart with the raw values of the games (0, 0.5, 1, 2).
  The game softens the immunity when it reads it: x0 counts as x0.25 (ADR-047).
- `tools/fetch-data/roster.json` (only with `--roster`): the 214 lines of generations 1-4 by the rule
  of `roster.rules.json` (no legendaries or babies, one branch per split), each one both a ball and a
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
- `moves-overrides.json`: the default move ladder of each of the 18 types and the signature moves of
  the starters.

## How a move is chosen (ADR-039, ADR-047)
For each stage of a line, take the form shown at that stage. Among the damaging moves of ANY of the
types of the species that this form learns by level-up (a dual type brings coverage), pick the
strongest inside the power band of the tier (30-60, 61-95, 96 or more; ties go to the lower id),
always stronger than the tier before. If the band has none, use the default move of the FIRST type. A
signature in `moves-overrides.json` wins over all of it. The type of that move is the type the
Pokémon attacks with at that stage.

The pure rules live in `parse.ts` and are unit-tested without network (`tests/tools/fetchData.test.ts`).
