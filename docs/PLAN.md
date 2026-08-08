# Plan de construcción

Cinco fases. Cada una termina en algo demostrable. **No avances a la siguiente sin
cumplir los criterios de aceptación.**

Trabaja fase por fase. Al terminar cada una, para y reporta antes de continuar.

---

## Fase 0 — Andamiaje

**Objetivo:** el repositorio arranca y compila.

- [x] Monorepo pnpm con `packages/api`, `packages/widget`, `packages/semantica`, `demo/`
- [x] TypeScript estricto, Vitest, ESLint, Prettier
- [x] `docker-compose.yml` local: Elasticsearch 7 OSS, Redis, SQL Server 2019
- [x] `.env.example` completo
- [x] Fixtures: `datos/fixtures/empresas.json` (~200 empresas sintéticas con la
      forma esperada del índice real), `skus.json` con precios públicos
- [x] Script de siembra que carga los fixtures en el Elasticsearch local

**Aceptación:** `pnpm dev` levanta todo, `pnpm test` pasa, hay 200 empresas
consultables en el ES local.

**Cumplida** (08/08/2026): `pnpm dev` levanta API en :3000 y demo en :5174;
`pnpm test` pasa 24 tests; el índice `empresas` tiene 200 documentos en el ES
7.10.2 OSS local. Pendiente de decisión del cliente: los umbrales de tramo de
precio de los listados y los precios de los packs, marcados como supuestos en
`skus.json`.

---

## Fase 1 — Capa de datos

**Objetivo:** `datos/` funciona y es probado, sin saber que existe un modelo de
lenguaje.

- [ ] Envoltorio `fetch` sobre Elasticsearch, con `rutas.ts` que abstrae 6.x/7.x
- [ ] Compilador `FiltroSegmento` → consulta ES, **con tests exhaustivos**
- [ ] `contarSegmento()` usando `_count` (exacto) + desglose `terms` por provincia
- [ ] `buscarEmpresas()` con proyección de campos según nivel de acceso
- [ ] Conexión a SQL Server con `mssql`, TLS configurable
- [ ] `derechos.ts`: resuelve plan, créditos, packs y cuota mensual de un usuario
- [ ] `precios.ts`: fuente única de cálculo de precios (informes y listados)

**Aceptación:** tests que demuestran que un filtro complejo produce el conteo
correcto contra los fixtures, y que `derechos.ts` distingue los tres perfiles
(anónimo, con bono, Premium).

---

## Fase 2 — Capa semántica

- [ ] `packages/semantica`: corpus CNAE-2009 (~630 clases a 4 dígitos) en JSON
- [ ] ~50 casos comerciales curados (caso de uso → SKU + justificación)
- [ ] Script de build que genera embeddings y los serializa a binario
- [ ] Carga en memoria al arrancar + similitud coseno por fuerza bruta
- [ ] Caché Redis por consulta normalizada

**Aceptación:** `resolverActividad("logística")` devuelve 4941, 5210 y 5229 en
menos de 5 ms, y "empresas de mudanzas" también acierta.

---

## Fase 3 — Agente

**Objetivo:** el bucle gira y las herramientas responden. Sin interfaz todavía.

- [ ] `definirTool()` + registro que deriva JSON Schema desde Zod
- [ ] Bucle de herramientas con freno de vueltas (máx. 8) y manejo de `tool_use`
      múltiples en un turno
- [ ] Endpoint SSE `POST /v1/conversar` con todos los eventos de CONTRATOS §1
- [ ] Emisión de `status` desde el bucle (`content_block_start`) y desde los
      ejecutores (`ctx.progreso`)
- [ ] Las 9 herramientas de lectura, con doble canal `paraElModelo`/`paraLaUI`
- [ ] Prompt de sistema con las reglas no negociables
- [ ] Persistencia de conversación en Redis
- [ ] Caché de prompt sobre el bloque de sistema y las herramientas
- [ ] Trazas en Langfuse

**Aceptación:** con `curl` sobre el endpoint SSE, la frase _"empresas de logística
en Valencia y Castellón, más de 20 empleados, que facturen sobre 2 millones"_
produce eventos `status` en orden y un conteo correcto. Un usuario sin derechos
recibe `requiereCompra` y **el dato de pago no aparece en la traza de Langfuse**.

---

## Fase 4 — Widget

- [ ] Bundle único con Vite, montado en Shadow DOM, CSS propio
- [ ] Cliente SSE + reducer de turno
- [ ] Línea de tiempo de pasos con los tres estados y tiempo mínimo de 350 ms
- [ ] Autoscroll con detección de fondo + píldora "↓ nuevo"
- [ ] Streaming de texto con throttle de markdown
- [ ] Registro de tarjetas (segmento, ficha, bloqueado)
- [ ] Lanzador con los cuatro estados del icono; drawer overlay de 400 px +
      modo pantalla completa
- [ ] Sugerencias contextuales según página
- [ ] `POST /internal/mint` + página `demo/` que simula el ASP con el snippet real
- [ ] Persistencia de `conversationId` en `sessionStorage` y rehidratación

**Aceptación:** en la página demo, la conversación sobrevive a una recarga
completa. Los estilos del sitio no afectan al widget ni viceversa.

---

## Fase 5 — Compra

- [ ] `crear_intento_compra` con clave de idempotencia en Redis
- [ ] `TarjetaConfirmar` con botón que hace POST a la API propia
- [ ] Stripe Checkout en modo prueba
- [ ] Webhook que valida firma y abona créditos (stub que escribe en Redis, **no
      en SQL Server**)
- [ ] `cotizar` + recomendación de pack óptimo

**Aceptación:** los tres flujos del guion de demo corren de principio a fin.

---

## Guion de demo (criterio final)

**A — Consulta y upsell.** _"¿Cómo le fue a Mercadona en 2024?"_ → ficha pública →
usuario anónimo recibe tarjeta de compra; usuario Premium recibe cifras con
ejercicio citado.

**B — Asesoría y compra.** _"Un proveedor nuevo me pide crédito a 90 días por
40.000 €. ¿Qué me conviene mirar?"_ → el agente **no opina sobre el riesgo**,
explica qué incluye el Informe de Riesgo, lo compara con el RAI de 6 €, sugiere
el pack de 10 y genera la tarjeta de pago.

**C — Listado conversacional.** _"Empresas de logística en Valencia y Castellón,
más de 20 empleados, que facturen sobre 2 millones y tengan correo."_ → conteo,
desglose, ajuste _"quita las de menos de 5 años"_, recuento, precio,
recomendación de plan, compra.

---

## Orden de riesgo

Si hay que recortar, recorta en este orden inverso: lo primero que se protege es
la Fase 3 (el agente) y el flujo C del demo. Es lo que decide la venta.

Lo que **no** se recorta nunca: la verificación de derechos, el conteo exacto
para el precio, y la negativa a dar recomendaciones de crédito.
