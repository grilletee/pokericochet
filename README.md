# PokéRicochet

Juego web de brick-breaker, supervivientes y fusión de bolas con temática Pokémon, inspirado en *Ball x Pit*.

> **Aviso:** proyecto de fans sin ánimo de lucro, no afiliado ni respaldado por Nintendo, Game Freak ni The Pokémon Company. Pokémon y los nombres de los Pokémon son marcas de sus respectivos propietarios.
> *Unofficial, non-profit fan project. Not affiliated with or endorsed by Nintendo, Game Freak or The Pokémon Company.*

Este proyecto no tiene ninguna relación con el repositorio homónimo de [papimatcoding](https://github.com/papimatcoding/pokericochet), que es otro juego con otro concepto; no comparte código con él.

## Estado

Vertical slice jugable: una run completa de unos 8 minutos (7 oleadas, jefe, fusión de bolas). Gratis, sin anuncios ni donaciones.

Se publica en GitHub Pages con cada push a `main` (`.github/workflows/pages.yml`; en el repositorio hay que activar Settings → Pages → Source: *GitHub Actions*): <https://grilletee.github.io/pokericochet/>.

## Desarrollo

Requiere Node 20.19 o superior y pnpm (la versión exacta está en `packageManager`; Corepack la instala).

```sh
pnpm install
pnpm fetch-data   # una vez: datos de PokéAPI (JSON) y sprites (carpeta ignorada)
pnpm dev          # servidor de desarrollo
pnpm check        # lint + typecheck + tests
```

Scripts sueltos: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Sin ejecutar `pnpm fetch-data` el juego funciona igual, con marcadores en lugar de sprites.

Mediciones: `pnpm bench:balance` (equilibrio con bots), `pnpm bench:agency`, `pnpm bench:run`, `pnpm bench:browser`, `pnpm smoke` y `pnpm playtest` (sesión observacional en móvil y escritorio).

## Estructura

| Carpeta | Contenido | Puede importar |
|---|---|---|
| `src/domain` | Reglas del juego, puras y deterministas | nada |
| `src/data` | JSON generado y configuración | `domain` |
| `src/render` | Dibujo (PixiJS) | `domain` |
| `src/ui` | Interfaz DOM | `domain` |
| `src/app` | Raíz de composición, reloj, entrada, persistencia | todo |
| `tools/fetch-data` | Genera el JSON local desde PokéAPI | — |
| `tests/` | Tests; `tests/architecture` hace cumplir las reglas anteriores | — |

El dominio no puede usar DOM, `Date`, `Math.random` ni más funciones de `Math` que `sqrt`, `abs`, `min`, `max`, `floor`, `ceil`, `trunc` y `sign`. Lo verifica `tests/architecture`.

## Datos y atribución

El juego nunca llama a PokéAPI en ejecución: los datos de las especies se generan antes con `tools/fetch-data` (JSON pequeño y determinista en `src/data/generated`, que sí va al repositorio). Los sprites proceden de [PokeAPI/sprites](https://github.com/PokeAPI/sprites), **no se suben al repositorio**: `pnpm fetch-data` los descarga a `src/assets/sprites/` (ignorada por git) y la CI los obtiene en cada build. Los créditos y el aviso de no afiliación son visibles dentro del juego.
