# design-sync — notas de este repo

Lo que una sincronización futura necesita saber y que no se deduce del código.

## El repo no era una biblioteca de componentes

`packages/widget` se construye a un bundle IIFE único que embebe el portal ASP.
Su punto de entrada, `src/montar.tsx`, **se auto-monta al importarse** — planta un
shadow host en `document.body` y arranca el cajón. Servía de nada para el design
system.

Se añadió `src/biblioteca.ts`: los diez componentes, sin efectos secundarios y sin
`Widget` (que abre un flujo SSE al montarse y no tiene nada que enseñar fuera de
una conversación real).

- Se compila con `tsc -p tsconfig.biblioteca.json` → `dist-biblioteca/`
  (`pnpm --filter @nia/widget build:biblioteca`).
- **Directorio aparte de `dist/` a propósito**: `vite build` vacía `dist/` en cada
  ejecución y se llevaba la biblioteca por delante. Costó un ciclo descubrirlo.
- El tsconfig usa `files` + `include: []`. Las dos cosas hacen falta: con un glob
  entraba `Widget.tsx`, que importa `montar.js`; y el `include` del tsconfig padre
  **se hereda y se suma a `files`** si no se anula explícitamente.
- `package.json` declara `"types": "./dist-biblioteca/biblioteca.d.ts"` porque
  `findTypesRoot` solo busca en `build/ts`, `dist/types`, `types`, `lib`, `dist`.
  Sin eso, `exportedNames` daba 0 y el conversor trataba el paquete como
  «tokens-only».

## Los tokens tuvieron que salir del Shadow DOM

`estilos.css` declaraba los once tokens en `:host`. Fuera de un shadow root
`:host` no casa con nada, así que en las previsualizaciones no resolvía ninguno.
Ahora se declaran en `:host, .nia-raiz`.

**`all: initial` se quedó solo en `:host`, en su propia regla y antes de los
tokens.** No puede compartir regla con `.nia-raiz`: eso es un `div` y le pondría
`display: inline`, cambiando el layout del widget real.

`cfg.provider` es `RaizNia`, que es esa clase hecha componente. Sin él las
previsualizaciones salen sin estilo.

## El fork de `source-kit.mjs`

`GENERIC_DIR` solo tiene nombres de contenedor en inglés. Este repo nombra en
español (CLAUDE.md), y con `componentes/` como directorio no genérico **seis de
los diez componentes caían en un cajón llamado «componentes»** y el `category`
del frontmatter no llegaba a aplicarse nunca — la regla es que la categoría solo
gana si el grupo derivado del directorio es genérico.

El fork añade `componentes`, `componente`, `fuente`, `biblioteca`. Está declarado
en `cfg.libOverrides`. En un clon nuevo hay que recrear el enlace:

```sh
ln -sfn ../.ds-sync/node_modules .design-sync/node_modules
```

El fork importa `ts-morph` a pelo y sin ese enlace no resuelve.

## Los grupos vienen de `packages/widget/docs/`

Diez ficheros `<Nombre>.md` con `category:` en el frontmatter, cableados por
`cfg.docsDir`. **No son solo para agrupar**: son la documentación que el agente de
diseño lee como `.prompt.md`, y es donde está la forma real de `datos` — las tres
tarjetas reciben `Record<string, unknown>`, así que el `.d.ts` no dice nada útil.

**Sin acentos en `category`.** El slug convierte `Conversación` en
`conversaci-n`, que es lo que se enseña como nombre de grupo.

`cfg.guidelinesGlob` está a `[]` a propósito: el patrón por defecto (`docs/*.md`)
copiaba estos mismos diez ficheros a `guidelines/`, duplicándolos.

## Avisos conocidos (Known render warns)

Si aparece uno que no esté aquí, es nuevo: míralo antes de descartarlo.

- **`[GRID_OVERFLOW]` en `Lanzador`** — el componente lleva `position: fixed` con
  `z-index: 2147483000` para ganarle al CSS del portal. Resuelto con
  `cfg.overrides.Lanzador = {cardMode: "single", primaryStory: "Sugerencia"}`.
  Los cuatro estados de la animación siguen navegables en la tarjeta de
  `IconoNia`, que no está marcada.
- **`[GRID_OVERFLOW]` en `RaizNia`** — `UnTurnoCompleto` es una composición ancha
  (línea de tiempo + respuesta + tarjeta). Resuelto con `cardMode: "column"`.
- **`[RENDER_BLANK]` en `IconoNia`** (ya no aparece) — el icono mide 18×18 px y se
  pinta con `currentColor`, así que suelto sobre blanco daba un PNG de 4,7 KB. La
  previsualización lo pone sobre el violeta y ampliado con `transform: scale()`;
  el tamaño lo fija el CSS y no hay prop.

## Lo que no se puede previsualizar

- **Las animaciones del icono.** Los cuatro estados se distinguen SOLO por
  movimiento; en una captura salen idénticos. Cada celda lleva un pie explicando
  qué hace el suyo — sin eso la tarjeta era la misma píldora cinco veces.
- **`LineaDeTiempo` desplegada tras pulsar.** El estado `hecho` se pliega solo, y
  volver a abrirlo es interacción. La celda `Terminada` enseña el plegado, que es
  el estado real.
- **`Widget`**, el cajón completo. Abre SSE al montarse. No se exporta.

## Riesgos para la próxima sincronización

- **`cfg.provider = RaizNia` envuelve la tarjeta entera.** Una previsualización no
  puede demostrar «qué pasa fuera de la raíz»: se intentó y la celda afirmaba algo
  falso (las dos líneas salían violetas). Se sustituyó por una muestra de la
  paleta. No lo reintentes.
- **Los valores de token están duplicados** en `.design-sync/previews/RaizNia.tsx`
  (la celda `LosTokens`) y en `conventions.md`. Si alguien cambia un color en
  `estilos.css`, esos dos sitios quedan mintiendo y nada lo detecta. Revísalos
  contra `_ds_bundle.css` en cada sync.
- **Las previsualizaciones llevan datos reales de Infonif** (Mercadona, cifras de
  2024, precios de informes). Si los precios del catálogo cambian —y cambian, se
  bajan en vivo, ver ADR-011— las tarjetas de `TarjetaBloqueado` enseñarán importes
  viejos. No es grave, son maquetas, pero conviene saberlo.
- **Playwright se instaló en `.ds-sync/`**, que está en `.gitignore`. Un clon nuevo
  lo tiene que reinstalar (`npm i playwright && npx playwright install chromium`,
  ~200 MB).
- El widget se sigue construyendo con `vite build` para el portal. **Esa parte no
  la toca el design system** y hay que comprobar que sigue verde después de
  cualquier cambio en `estilos.css`.
