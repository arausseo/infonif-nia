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
pnpm servicios:arriba     # Redis + SQL Server
pnpm dev                  # API en :3000, demo (con el widget) en :5174
```

Comprobación rápida:

```bash
curl http://localhost:3000/salud/dependencias
pnpm verificar
```

## Estructura

```
packages/
  api/
    src/
      datos/        # API de Infonif, precios y derechos. NO conoce el modelo de lenguaje
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

| Comando                            | Qué hace                                                |
| ---------------------------------- | ------------------------------------------------------- |
| `pnpm dev`                         | API + demo (el widget se sirve desde la demo con HMR)   |
| `pnpm build`                       | Embeddings + build de todos los paquetes                |
| `pnpm test`                        | Vitest en todo el workspace                             |
| `pnpm typecheck`                   | `tsc --noEmit` en cada paquete                          |
| `pnpm verificar`                   | Ejercita la capa de datos contra el API real de Infonif |
| `pnpm embeddings`                  | Regenera los vectores CNAE (Fase 2)                     |
| `pnpm servicios:arriba` / `:abajo` | Docker Compose                                          |

El widget se construye aparte con `pnpm --filter @nia/widget build`, que produce
el `widget.js` único que el ASP embebe.

## Estado

Fases 0 (andamiaje) y 1 (capa de datos) completas. Ver [docs/PLAN.md](docs/PLAN.md) para el resto.
