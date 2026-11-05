# fetch-data

Offline tool that turns PokéAPI responses into the local JSON the game loads (`src/data/generated/`).
It is the ONLY place allowed to call PokéAPI; the game never does at runtime (ADR-005, ADR-018).

```
pnpm fetch-data                 species + moves + sprites
pnpm fetch-data -- --no-sprites
pnpm fetch-data -- --delay 1000 milliseconds between the requests of each worker (default 500)
pnpm fetch-data -- --concurrency 2 requests at once (default 4; with 500 ms that is about 6 a second)
pnpm fetch-data -- --roster     builds the candidate roster of generations 1-4 (roster.generated.json) and stops
```

## What it reads (all cached, never asked twice)
| Request | Used for |
|---|---|
| `/pokemon/{id}` | first type, the six base stats (ADR-038), level-up moves, sprite URL |
| `/pokemon-species/{pokedexId}` | the name in Spanish (ADR-036); English if Spanish is missing, with a warning |
| `/move/{id}` | name in Spanish, type, power of every candidate move (ADR-039) |
| `/type/{name}` | the 18x18 type chart, raw values (ADR-047) |
| `--roster` only: `/pokemon-species/{id}` (1-493), `/evolution-chain/{id}`, `/pokemon/{name}` | the roster rule (ADR-048) |

Raw responses go to `tools/fetch-data/.cache/` (git-ignored): `{id}.json`, `species-{id}.json`,
`move-{id}.json`, `type-{name}.json`, the roster pass's `rs-{n}.json` and `chain-{n}.json`, and the
sprite `{id}.png`. A cached file is never requested again. A cold run of the default mode makes about
650 requests (633 for the 101 species of today plus the 18 types): about a minute and a half at the
rate the roster pass measured (773 requests in 112 s with 4 workers and 500 ms, 6.9 a second),
against about ten minutes one request at a time. A warm run makes none. The CI keeps this folder in a cache keyed by `roster.json`
and `moves-overrides.json` (see `.github/workflows/ci.yml`).

## What it writes
- `src/data/generated/typeChart.json`: the 18x18 chart with the raw values of the games (0, 0.5, 1, 2).
  The game softens the immunity when it reads it (ADR-047). Not read by the game until the 4H-B2.
- `tools/fetch-data/roster.generated.json` (only with `--roster`): the lines of generations 1-4 by the
  rule of `roster.rules.json` (no legendaries or babies, one branch per split) and the branches left
  out. A candidate for review; the game still uses the hand-made `roster.json` until the 4H-B2.
- `src/data/generated/species.json`: every species of the roster with `name`, `pokedexId`, `type` and
  the six `baseStats`. Deterministic (no dates); the CI fails if it differs from the committed file.
- `src/data/generated/moves.json`: the move of every ball and enemy line at stage 1, 2 and 3, and the
  name, type and power of the moves in use.
- `src/data/generated/moves-report.md`: a table of those choices (species, stage, form, move, power,
  and whether it was chosen by rule `auto`, is a `signature` or fell back to the `default` of its type)
  so a person can review them.
- `src/assets/sprites/<id>.png`: PokeAPI/sprites front sprites, git-ignored, fetched on every build.

## Hand-made inputs
- `roster.json`: which species play which role, and the evolution line of each (zero, one or two forms).
- `moves-overrides.json`: the default move ladder of each type and the signature moves of the starters.

## How a move is chosen (ADR-039)
For each stage of a line, take the form shown at that stage. Among the damaging moves of the type of
the species that this form learns by level-up, pick the strongest inside the power band of the tier
(30-60, 61-95, 96 or more; ties go to the lower id), always stronger than the tier before. If the band
has none, use the default move of the type. A signature in `moves-overrides.json` wins over all of it.

The pure rules live in `parse.ts` and are unit-tested without network (`tests/tools/fetchData.test.ts`).
