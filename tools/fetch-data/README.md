# fetch-data

Offline tool that turns PokéAPI responses into the local JSON the game loads (`src/data/generated/`).
It is the ONLY place allowed to call PokéAPI; the game never does at runtime (ADR-005, ADR-018).

```
pnpm fetch-data                 species + moves + sprites
pnpm fetch-data -- --no-sprites
pnpm fetch-data -- --delay 1000 milliseconds between real requests (default 700)
```

## What it reads (all cached, never asked twice)
| Request | Used for |
|---|---|
| `/pokemon/{id}` | first type, the six base stats (ADR-038), level-up moves, sprite URL |
| `/pokemon-species/{pokedexId}` | the name in Spanish (ADR-036); English if Spanish is missing, with a warning |
| `/move/{id}` | name in Spanish, type, power of every candidate move (ADR-039) |

Raw responses go to `tools/fetch-data/.cache/` (git-ignored): `{id}.json`, `species-{id}.json`,
`move-{id}.json` and the sprite `{id}.png`. A cached file is never requested again. A cold run makes
about 430 requests (about 7 minutes with the default delay); a warm one makes none. The CI keeps this
folder in a cache keyed by `roster.json` and `moves-overrides.json` (see `.github/workflows/ci.yml`).

## What it writes
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
