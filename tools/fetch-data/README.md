# fetch-data

Offline tool that turns PokéAPI responses into the local JSON the game loads (`src/data/generated/`).

Contract (ADR-005):
- Only the species used by the vertical slice (8 balls, 8 enemies, 1 boss): types, base stats, sprite path.
- Always cache raw responses in `tools/fetch-data/.cache/` (git-ignored) before hitting the network again.
- The game itself never calls PokéAPI at runtime.

Status: placeholder, not implemented yet.
