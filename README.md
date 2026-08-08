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

La demo en http://localhost:5174 imita una ficha del portal. Con
`?usuario=133627` se entra con plan de registros, y sin nada se navega como
anónimo: es la forma de ver los dos perfiles del guion.

## Estructura

```
packages/
  api/
    src/
      datos/        # API de Infonif, precios y derechos. NO conoce el modelo de lenguaje
      agente/       # bucle de herramientas, las 9 herramientas, SSE y prompt
      comun/        # config, logging, errores
    scripts/        # generar-fixtures.ts, sembrar.ts
  widget/           # React 18 + Vite → widget.js único, en Shadow DOM
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
| `pnpm demo`                        | Corre los tres flujos del guion contra el agente real   |
| `pnpm embeddings`                  | Regenera los vectores CNAE (Fase 2)                     |
| `pnpm servicios:arriba` / `:abajo` | Docker Compose                                          |

El widget se construye aparte con `pnpm --filter @nia/widget build`, que produce
el `widget.js` único que el ASP embebe.

## Estado

Fases 0 a 4 completas: andamiaje, datos, semántica, agente y widget. Ver [docs/PLAN.md](docs/PLAN.md) para el resto.
