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

> **Reescrita el 08/08/2026.** La fase estaba planteada sobre Elasticsearch, y
> resultó que Infonif tiene un API REST propio delante (`docs/API-INFONIF.md`).
> No emitimos DSL de ES: emitimos su petición de filtro. Se retiró el
> Elasticsearch local y las 200 empresas sintéticas de la Fase 0, porque un
> fixture con otra forma habría validado un contrato que no existe.

- [x] Cliente `fetch` del API de Infonif, con apikey, tiempo límite y errores propios
- [x] Compilador `FiltroSegmento` → `POST /buscador/filtrar`, **con tests exhaustivos**
- [x] `contarSegmento()` con el conteo exacto y el desglose por criterio
- [x] `buscarEmpresas()` sobre el autocompletado, deduplicando por NIF
- [x] `resumen.ts`: vocabulario de filtros en vivo, cacheado en Redis
- [x] `derechos.ts`: resuelve plan y saldo por su API, no por SQL Server
- [x] `precios.ts`: fuente única del cálculo, por campo y por registro

**Aceptación:** tests que demuestran que un filtro complejo produce el conteo
correcto, y que `derechos.ts` distingue los tres perfiles.

**Cumplida** (08/08/2026): 86 tests sin red, contra respuestas grabadas del API
real. `pnpm verificar` ejercita la cadena completa contra Infonif en vivo: el
segmento del flujo C del demo da **135 empresas** con su embudo
(2.141 → 250 → 145 → 135) y **32,43 € IVA incluido** por seis campos.

Lo que queda fuera y hay que recordar: SQL Server sigue configurado pero sin usar,
y las cuentas anuales por empresa (flujo A) todavía no tienen función propia.

---

## Fase 2 — Capa semántica

- [x] `packages/semantica`: corpus CNAE de 627 clases a 4 dígitos, extraído de su
      propio resumen en vivo en lugar de un CNAE-2009 externo
- [x] 50 casos comerciales curados (caso de uso → SKU + justificación)
- [x] Script de build que genera embeddings y los serializa a binario
- [x] Carga en memoria + similitud coseno por fuerza bruta
- [x] Caché Redis por consulta normalizada
- [x] 340 términos comerciales curados, capa léxica delante de los vectores

**Aceptación:** `resolverActividad("logística")` devuelve 4941, 5210 y 5229 en
menos de 5 ms, y "empresas de mudanzas" también acierta.

**Cumplida** (08/08/2026): 38 tests, con el modelo real cargado y no con uno de
mentira. «logística» resuelve en **menos de 1 ms** porque lo cubren los términos
curados sin tocar el modelo; «empresas de mudanzas» da 4942; y «fabricantes de
envases de cartón», que nadie curó, llega a 1721 por los vectores.

Dos decisiones que no estaban en el ADR y se tomaron aquí:

- **El modelo corre en la máquina** (`multilingual-e5-small` por ONNX, 384
  dimensiones). Sin clave de terceros y sin que la consulta del usuario salga del
  servidor, lo que ahorra una conversación de RGPD con Infonif.
- **Capa léxica delante de los vectores.** Lo curado acierta en microsegundos y
  además es auditable: se puede decir _por qué_ salió ese CNAE. Los embeddings
  cubren el resto del árbol. No sustituye a ADR-004, le pone un índice barato
  delante.

Ojo con una trampa medida: los e5 comprimen la escala —un acierto claro da ~0,88
y algo totalmente ajeno ~0,845—, así que **el umbral es relativo al primero,
nunca absoluto**.

---

## Fase 3 — Agente

**Objetivo:** el bucle gira y las herramientas responden. Sin interfaz todavía.

- [x] `definirTool()` + registro que deriva JSON Schema desde Zod
- [x] Bucle de herramientas con freno de vueltas (máx. 8) y manejo de `tool_use`
      múltiples en un turno
- [x] Endpoint SSE `POST /v1/conversar` con todos los eventos de CONTRATOS §1
- [x] Emisión de `status` desde el bucle (`content_block_start`) y desde los
      ejecutores (`ctx.progreso`)
- [x] Las 9 herramientas de lectura, con doble canal `paraElModelo`/`paraLaUI`
- [x] Prompt de sistema con las reglas no negociables
- [x] Persistencia de conversación en Redis
- [x] Caché de prompt sobre el bloque de sistema y las herramientas
- [x] Trazas, con metadatos y sin contenido

**Aceptación:** con `curl` sobre el endpoint SSE, la frase _"empresas de logística
en Valencia y Castellón, más de 20 empleados, que facturen sobre 2 millones"_
produce eventos `status` en orden y un conteo correcto. Un usuario sin derechos
recibe `requiereCompra` y **el dato de pago no aparece en la traza de Langfuse**.

**Cumplida** (08/08/2026). Con `curl` sobre el endpoint salen `status` s1 y s2 en
orden, actualizándose en sitio, y 345 empresas con su embudo. Un anónimo que
pregunta por las ventas de Mercadona recibe `requiereCompra` y tarjeta
`bloqueado`; el mismo mensaje con plan devuelve 34.059 millones de 2024.

La traza no lleva ni el mensaje, ni la respuesta, ni los resultados de las
herramientas: solo qué herramientas se usaron, cuánto tardaron y cuántos tokens
costó. Es una decisión, no un descuido — sacar datos mercantiles de terceros a un
sistema de observabilidad habría que hablarlo antes.

`pnpm demo` corre los tres flujos del guion contra el agente real y comprueba que
el B no opina sobre el riesgo.

Dos cosas que salieron de probarlo, no de escribirlo:

- **El modelo se inventó un precio.** Dijo «5 € + IVA» de un Informe Comercial
  que cuesta 15. La herramienta le daba el SKU pero no el importe, así que
  rellenó el hueco. Ahora el precio viaja en el resultado y el guion lo
  comprueba. Lección general: si una herramienta deja un hueco donde debería ir
  un dato, el modelo lo rellena.
- **`peticion.raw` emite «close» al terminar de leer el cuerpo**, no cuando el
  cliente se va. Escuchar ahí abortaba todos los turnos antes de empezar. Va en
  la respuesta y comprobando `writableFinished`.

Queda fuera: `/internal/mint` es de la Fase 4, así que hoy el `usuarioId` viaja en
el cuerpo de la petición. **Eso no puede llegar a producción**: un usuario no
decide quién es.

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
