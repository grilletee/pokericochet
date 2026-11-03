# PokéRicochet

Juego web fan, gratuito y sin ánimo de lucro: adaptación de Ball x Pit (brick-breaker + survivors + fusión de bolas) a Pokémon.

## Stack
TypeScript estricto, Vite, pnpm, Vitest, Biome, PixiJS. Física propia a 60 Hz fijos (círculo vs AABB/círculo, rejilla espacial). Dominio puro y determinista con PRNG con semilla, separado del render.

## PokéAPI
Solo desde `tools/fetch-data`, que genera JSON locales. El juego NUNCA llama a PokéAPI en runtime. Cachear siempre.

## Bóveda de Obsidian (memoria del proyecto)
La ruta está en CLAUDE.local.md. Mientras trabajas:
- Actualiza `pokericochet.md` (bitácora, roadmap, siguiente acción).
- Decisiones de arquitectura: nueva nota `ADR/ADR-00N-titulo.md` con frontmatter (tags, estado, fecha) y enlace `[[pokericochet]]`.
- No borres ni reescribas notas existentes que no sean de este proyecto. Usa wikilinks y frontmatter como el resto de la bóveda.

## Git
El usuario hace sus propios commit/pull/push. NO ejecutes git commit, push ni pull, ni crees PRs. Propón mensajes de commit en el chat. git status/diff están permitidos.

## Reglas de trabajo
- Explica la lógica y las decisiones de diseño paso a paso, nivel arquitecto.
- Tests con Vitest para el dominio; sin lógica de juego en el render.
- Código y comentarios en inglés; conversación en español.

## Fases
0 validación, 1 GDD (1 página), 2 arquitectura (1 página), 3 vertical slice (2 semanas), 4 iteraciones, 5 publicación.

## Restricciones legales
Gratis, sin anuncios ni donaciones. Decisión del usuario (2026-11-03): se mantiene el título «PokéRicochet» aunque lleve «Poké»; no se vuelve a plantear salvo que él lo pida. Hay un repo homónimo de otro autor (papimatcoding, roguelite por turnos): es otro concepto, no copiar nada. Mantén el nombre en una sola constante/config para poder renombrar rápido. Arte y sonido originales. No reutilizar código AGPL/GPL/no comercial. Sprites solo de PokeAPI/sprites o SpriteCollab (CC BY-NC 4.0) con atribución.
