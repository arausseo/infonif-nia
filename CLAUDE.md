# Nia — Agente conversacional para Infonif

## Qué es esto

Agente de IA embebido en `infonif.economia3.com`, un portal español de información
mercantil de empresas. Permite a los usuarios **consultar** datos de empresas y
**comprar** informes y listados segmentados desde una conversación, sin pasar por
los formularios actuales.

Estado: **MVP greenfield**. Objetivo: demo funcional en 5 semanas ante dirección
de Infonif. No es producción.

El sitio existente es **ASP Classic + SQL Server + Elasticsearch**. No se toca.
Este proyecto es un _sidecar_: se despliega al lado y se embebe con un `<script>`.

## Decisiones ya tomadas

Están en `docs/ADR.md` con su justificación. **No las relitigues.** Si algo parece
un error, plantéalo antes de cambiarlo.

Resumen del stack:

| Pieza     | Tecnología                                                          |
| --------- | ------------------------------------------------------------------- |
| API       | Node 22 LTS + TypeScript + Fastify, en Debian                       |
| Modelo    | Claude vía SDK de Anthropic, bucle de herramientas propio           |
| Widget    | React 18 + Vite, montado en **Shadow DOM**, CSS propio sin Tailwind |
| Datos     | SQL Server (solo lectura) + Elasticsearch existente                 |
| Semántica | Embeddings CNAE precalculados en build, búsqueda en memoria         |
| Estado    | Redis (conversaciones, caché, idempotencia)                         |
| Pagos     | Stripe Checkout en modo prueba                                      |
| Trazas    | Langfuse autoalojado + OpenTelemetry                                |

**Sin framework de agentes.** Nada de LangChain, LangGraph, Vercel AI SDK ni
CopilotKit. El bucle es propio (~150 líneas) porque el protocolo de progreso es
el diferenciador del producto y los frameworks abstraen justamente esa capa.

**Sin librería de chat UI.** Nada de assistant-ui ni shadcn. Usan portales de
Radix que escapan del Shadow DOM y rompen el aislamiento de estilos.

## Estructura

```
packages/
  api/
    src/
      datos/        # SQL Server + Elasticsearch. NO conoce el modelo de lenguaje
      agente/       # bucle, herramientas, SSE, prompts
      comun/        # config, logging, errores
  widget/           # React + Vite → bundle único
  semantica/        # genera embeddings CNAE en build time
demo/               # página que simula el ASP Classic para el demo
docs/
  ADR.md            # decisiones de arquitectura
  PLAN.md           # fases y criterios de aceptación
  CONTRATOS.md      # protocolo SSE, herramientas, esquemas
```

**Regla de capas:** `agente/` llama a `datos/` a través de funciones exportadas.
`datos/` nunca importa nada de `agente/`. Si necesitas lógica de negocio en una
herramienta, va en `datos/`, no en el ejecutor.

## Reglas no negociables

Estas existen por razones legales y de seguridad. No las flexibilices.

1. **El agente nunca ejecuta un cobro.** `crear_intento_compra` devuelve una URL
   de pago y una tarjeta de confirmación. El usuario pulsa. El webhook abona.

2. **Los derechos se verifican dentro de la herramienta, antes de devolver el
   dato.** Si el usuario no tiene acceso, la herramienta devuelve
   `{ requiereCompra: true, skuSugerido }`. El dato de pago **jamás entra al
   contexto del modelo**. Nunca le pidas al modelo que "no mencione" algo.

3. **El modelo no emite DSL de Elasticsearch ni SQL.** Emite un objeto JSON
   validado con Zod (`.strict()`), que el código compila a consulta.

4. **Cero cifras sin fuente.** Todo número financiero viene de un resultado de
   herramienta, con ejercicio fiscal declarado.

5. **El agente no genera recomendaciones de crédito.** Es el producto pagado y
   además es decisión automatizada bajo el artículo 22 del RGPD. Respuesta
   programada: esa recomendación la produce el Informe de Riesgo.

6. **Vista previa máxima de 5 filas en el chat.** El aviso legal del sitio
   prohíbe la reproducción de contenido. El dataset completo va por descarga
   tras compra.

7. **El precio siempre sale del API `_count` de Elasticsearch**, que es exacto.
   Nunca de `hits.total` (se corta en 10.000 en 7.x) ni de `cardinality`
   (es aproximada). Cotizar mal es facturar mal.

## Convenciones

- **Idioma:** código, nombres de variables y comentarios en **español**.
  Los nombres de herramientas del agente también (`buscar_empresa`,
  `construir_segmento`). El usuario final es hispanohablante y las descripciones
  de herramientas son parte del prompt.
- **TypeScript estricto.** `strict: true`, sin `any`. Zod en todo borde externo.
- **Sin clases** salvo que haya estado real que encapsular. Funciones y módulos.
- **Errores:** tipos de error propios en `comun/errores.ts`. Nunca `throw` de
  strings. Los errores de herramienta se devuelven al modelo como
  `{ error: "descripción" }`, no revientan el bucle.
- **Tests:** Vitest. Obligatorios en el compilador de filtros y en la
  verificación de derechos. El resto, a criterio.
- **Commits:** convencionales, en español. `feat(agente): añade herramienta de segmentos`

## Comandos

```bash
pnpm dev          # api + widget + demo en paralelo
pnpm build        # incluye generación de embeddings
pnpm test
pnpm typecheck
pnpm embeddings   # regenera vectores CNAE (solo si cambia el corpus)
```

## Variables de entorno

Ver `.env.example`. Las que importan:

```
ANTHROPIC_API_KEY=
ES_URL=http://localhost:9200
MSSQL_HOST= MSSQL_USER= MSSQL_PASSWORD= MSSQL_DATABASE=
REDIS_URL=
STRIPE_SECRET_KEY=          # modo prueba
AGENT_SHARED_SECRET=        # el ASP Classic lo usa para acuñar tokens
TOKEN_TTL_SEGUNDOS=900
```

## Incógnitas bloqueantes

**No inventes valores para esto. Si el código lo necesita, pon un adaptador con
un stub claramente marcado y pregunta.**

1. **Versión de Elasticsearch** — es 6.x o 7.x, distribución OSS. La diferencia:
   en 6.x la ruta de búsqueda lleva el tipo (`/empresas/_doc/_search`), en 7 no.
   Aísla esto en `datos/elastic/rutas.ts`.
2. **Mapping real del índice de empresas** — no sabemos qué campos financieros
   están normalizados. Define el mapping esperado en `datos/elastic/mapping.ts`
   y trabaja contra fixtures locales hasta tener el real.
3. **Versión de SQL Server** — si es 2012 o anterior, OpenSSL 3 de Debian 12
   rechaza el handshake TLS. Deja `trustServerCertificate` y `encrypt`
   configurables por entorno.
4. **Modelo de sesión del ASP Classic** — si hay varios nodos sin sesión pegajosa,
   el puente de tokens necesita otro diseño.
5. **Catálogo real de SKU y precios** — usa `datos/fixtures/skus.json` con los
   precios públicos observados (RAI 6€, Comercial 15€, Riesgo 30€,
   Cuentas Anuales 10€, listados 0,30/0,15/0,10 € por registro).

## Qué NO hacer

- No instales un framework de agentes ni una librería de chat UI.
- No uses el cliente `@elastic/elasticsearch`: a partir de 7.14 tiene una
  verificación de producto que rechaza clústeres OSS. Usa `fetch` directo.
- No metas Tailwind en el widget. El Shadow DOM no hereda variables de `:root`.
- No uses `localStorage` para el historial: `sessionStorage` solo guarda el
  `conversationId`; el historial vive en Redis.
- No escribas nunca en SQL Server desde `datos/`. Todo es lectura. La única
  escritura del sistema es el abono de créditos vía webhook, y en el MVP es un
  stub.
- No pongas lógica de precios en el ejecutor de una herramienta. Va en
  `datos/precios.ts`, fuente única.
