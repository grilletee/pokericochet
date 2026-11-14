# Third-party resources (licences)

PokéRicochet is a free, non-profit fan game. Every third-party resource it ships is listed here and in
the credits screen of the game.

| Resource | Used for | Author | Licence | Where |
|---|---|---|---|---|
| Pixelify Sans (font) | all the text of the interface | The Pixelify Sans Project Authors | SIL Open Font License 1.1 | `src/assets/fonts/PixelifySans.ttf`, licence text in `src/assets/fonts/OFL-PixelifySans.txt` |
| PixiJS | rendering | PixiJS contributors | MIT | npm dependency |
| PokéAPI data | species, types, base stats (fetched once by `tools/fetch-data`, never at runtime) | PokéAPI | see https://pokeapi.co/docs/v2#fairuse | `src/data/generated/` |
| PokeAPI/sprites | pictures of the Pokémon (non-commercial) | their owners | © their owners, used without profit | `public/` sprites cache |

The pixel art of the backdrops, the boss attacks, the launcher and the effects is original: it is drawn
by code (`src/render/pixelArt.ts`) with the game's own palette (`src/ui/pixelStyle.ts`). No official
asset or rip is used. The sound effects are synthesised.

Since 4G-I (2026-11-13) the title screen is original too: the logo is the name of the game written in
Pixelify Sans (above) and scaled up as pixels, beside a glass sphere of the game's own design
(`src/ui/titleArt.ts`; deliberately no band and no button, so it is no franchise ball), over an
animated night drawn by code (`src/ui/menuBackdrop.ts`). The attacks of each type
(`src/render/bossArt.ts`), the arenas of the legendaries (`src/render/legendArena.ts`) and the deaths
of the bosses (`src/render/deathFx.ts`) are original pixel art drawn by code as well.

The SIL OFL 1.1 allows using, embedding and redistributing the font with software, as long as the
licence and the copyright notice travel with it (they do) and the font is not sold on its own.
