# PokéRicochet

Juego web de brick-breaker, supervivientes y fusión de bolas con temática Pokémon, inspirado en *Ball x Pit*.

> **Aviso:** proyecto de fans sin ánimo de lucro, no afiliado ni respaldado por Nintendo, Game Freak ni The Pokémon Company. Pokémon y los nombres de los Pokémon son marcas de sus respectivos propietarios.
> *Unofficial, non-profit fan project. Not affiliated with or endorsed by Nintendo, Game Freak or The Pokémon Company.*

Este proyecto no tiene ninguna relación con el repositorio homónimo de [papimatcoding](https://github.com/papimatcoding/pokericochet), que es otro juego con otro concepto; no comparte código con él.

## Estado

En desarrollo, sin versión jugable todavía. Gratis, sin anuncios ni donaciones.

## Desarrollo

Requiere Node 20.19 o superior y pnpm (la versión exacta está en `packageManager`; Corepack la instala).

```sh
pnpm install
pnpm dev          # servidor de desarrollo
pnpm check        # lint + typecheck + tests
```

Scripts sueltos: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

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

El juego nunca llama a PokéAPI en ejecución: los datos se generan antes con `tools/fetch-data` y se guardan como JSON. Los sprites proceden de [PokeAPI/sprites](https://github.com/PokeAPI/sprites) o de SpriteCollab (CC BY-NC 4.0); la atribución completa se añadirá cuando se incluyan.
