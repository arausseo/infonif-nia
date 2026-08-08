# Nia

Agente conversacional para `infonif.economia3.com`. Sidecar: se despliega al lado
del portal ASP Classic y se embebe con una etiqueta `<script>`.

Contexto y reglas: [CLAUDE.md](CLAUDE.md).
Decisiones: [docs/ADR.md](docs/ADR.md) · Plan: [docs/PLAN.md](docs/PLAN.md) ·
Contratos: [docs/CONTRATOS.md](docs/CONTRATOS.md).

## Puesta en marcha

```bash
pnpm install
cp .env.example .env
pnpm servicios:arriba     # Elasticsearch 7 OSS + Redis + SQL Server 2019
pnpm sembrar              # crea el índice y carga las 200 empresas de fixtures
pnpm dev                  # API en :3000, demo (con el widget) en :5174
```

Comprobación rápida:

```bash
curl http://localhost:3000/salud/dependencias
```

## Estructura

```
packages/
  api/
    src/
      datos/        # SQL Server + Elasticsearch. NO conoce el modelo de lenguaje
      agente/       # bucle, herramientas, SSE, prompts   (Fase 3)
      comun/        # config, logging, errores
    scripts/        # generar-fixtures.ts, sembrar.ts
  widget/           # React 18 + Vite → bundle único en Shadow DOM
  semantica/        # embeddings CNAE en build time        (Fase 2)
demo/               # página que simula el ASP Classic
```

`agente/` llama a `datos/` por funciones exportadas. `datos/` nunca importa de
`agente/`.

## Comandos

| Comando                            | Qué hace                                              |
| ---------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                         | API + demo (el widget se sirve desde la demo con HMR) |
| `pnpm build`                       | Embeddings + build de todos los paquetes              |
| `pnpm test`                        | Vitest en todo el workspace                           |
| `pnpm typecheck`                   | `tsc --noEmit` en cada paquete                        |
| `pnpm fixtures`                    | Regenera `empresas.json` (determinista, semilla fija) |
| `pnpm sembrar`                     | Carga los fixtures en el Elasticsearch local          |
| `pnpm embeddings`                  | Regenera los vectores CNAE (Fase 2)                   |
| `pnpm servicios:arriba` / `:abajo` | Docker Compose                                        |

El widget se construye aparte con `pnpm --filter @nia/widget build`, que produce
el `widget.js` único que el ASP embebe.

## Estado

Fase 0 (andamiaje) completa. Ver [docs/PLAN.md](docs/PLAN.md) para el resto.
