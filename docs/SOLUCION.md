# Nia — descripción técnica de la solución

Qué es, cómo está montada y por qué cada pieza está donde está. Para alguien
técnico que no ha visto el código.

---

## El problema

Comprar un listado segmentado en Infonif hoy exige que el usuario traduzca lo que
quiere al vocabulario del sistema: encontrar los códigos CNAE, dar con los
filtros, entender qué campos hay y calcular qué va a costar. El formulario es
correcto; el problema es que **el usuario no piensa en CNAE, piensa en
«panaderías»**.

Nia hace esa traducción. El usuario describe lo que busca en su idioma y ella
resuelve los códigos, cuenta el segmento contra los datos reales y da el precio
exacto — todo dentro de una conversación.

## Lo que no es

No es un chatbot que responde de memoria. **No emite ni una cifra que no venga de
una consulta hecha en ese mismo turno.** Si no hay dato, lo dice.

Tampoco reemplaza al portal. Es un acompañante: se embebe con una etiqueta
`<script>` y el sitio actual no se toca.

---

## Arquitectura

Un *sidecar*. Nada de lo existente se modifica salvo tres líneas de ASP para
incluir el script.

```
Navegador                     Servidor Nia (Node 22)        Infonif
─────────                     ──────────────────────        ───────
widget (Shadow DOM) ─HTTPS─►  API Fastify
                                │
                                ├─ bucle del agente ─────►  Claude
                                │                            (Anthropic)
                                └─ capa de datos ────────►  bbdd-api
                                       │                     .infonif.es
                                       └─ Redis (local)
```

**API** — Node 22, TypeScript estricto, Fastify. Escucha en `:3000` y se publica
por HTTPS detrás del nginx que ya existe, colgada de un prefijo de ruta. No
necesita dominio ni certificado propios.

**Widget** — React 18 compilado a un único fichero de ~167 KB que sirve el propio
API. Se monta dentro de un **Shadow DOM**: ni hereda el CSS del portal ni se lo
impone. Eso importa porque se inyecta en páginas ASP con años de estilos encima.
React viaja dentro del bundle; el portal no necesita cargar nada.

**Redis** — conversaciones, cachés e idempotencia. Local a la máquina.

**SQL Server no se usa** en la prueba de concepto. Todo sale del API REST que ya
alimenta al buscador actual.

### Separación de capas

```
datos/     Infonif, Elastic, SQL Server. NO conoce el modelo de lenguaje.
agente/    bucle, herramientas, SSE, prompts. Llama a datos/ por funciones.
comun/     configuración, registro, errores.
```

La regla es unidireccional: `agente/` importa de `datos/`, nunca al revés. Si una
herramienta necesita lógica de negocio, esa lógica vive en `datos/`; el ejecutor
solo orquesta. Así el cálculo de precios o la verificación de derechos se pueden
probar sin levantar un modelo.

---

## Cómo funciona un turno

El agente **no tiene un flujo predefinido**. Es un bucle de herramientas: el
modelo decide qué necesita saber, el código lo ejecuta y le devuelve el
resultado, y así hasta que puede responder. Tope de 8 vueltas.

```
usuario: «panaderías en Madrid»
   │
   ├─ vuelta 1: pide resolver_actividad("panaderías")
   │            → 1071 Fabricación de pan…, 1072 Galletas…
   │
   ├─ vuelta 2: pide construir_segmento({cnae, provincia})
   │            → 582 empresas, embudo por criterio, campos disponibles
   │
   └─ vuelta 3: sin más herramientas → redacta la respuesta
```

Lo relevante es que **la segunda llamada depende del resultado de la primera**.
Ningún formulario hace eso.

### El bucle es propio

Sin LangChain, LangGraph ni ningún framework de agentes. Son unas 150 líneas. La
razón: el protocolo de progreso —enseñar al usuario qué está pasando mientras
pasa— es el diferenciador del producto, y los frameworks abstraen justo esa capa.

### Las herramientas

Nueve, con nombre en español porque su descripción forma parte del prompt:

| Herramienta | Qué hace |
|---|---|
| `resolver_actividad` | «logística» → códigos CNAE, con empresas por código |
| `construir_segmento` | cuenta un segmento y devuelve el embudo por criterio |
| `cotizar` | precio exacto del listado y si compensa un plan |
| `buscar_empresa` | busca por nombre o NIF |
| `obtener_ficha_publica` | datos públicos de una empresa |
| `obtener_magnitudes` | cifras financieras, sujetas a derechos |
| `comparar_empresas` | compara varias |
| `consultar_saldo` | registros disponibles del plan del usuario |
| `recomendar_producto` | qué informe cubre lo que se pide |

Cada una valida su entrada con **Zod en modo estricto**. El modelo nunca emite
SQL ni DSL de Elasticsearch: emite un objeto JSON validado que el código compila
a consulta. Un modelo que escribe consultas es un modelo que puede escribir
cualquier consulta.

### Doble canal

Cada herramienta devuelve dos cosas distintas:

- `paraElModelo` — lo que entra en el contexto para que razone.
- `paraLaUI` — la tarjeta que ve el usuario.

La separación es deliberada: la tarjeta puede llevar detalle que el modelo no
necesita procesar, y el contexto puede llevar avisos que no hay que enseñar.

---

## El protocolo de progreso

Una consulta puede tardar quince segundos entre resolver CNAE y contar el
segmento. Una rueda girando quince segundos es una eternidad; ver qué está
haciendo, no.

La respuesta va por **Server-Sent Events**, con seis tipos de evento:

| Evento | Para qué |
|---|---|
| `inicio` | identificadores de conversación y turno |
| `status` | un paso de la línea de tiempo |
| `texto` | fragmento de la respuesta, según se genera |
| `tarjeta` | resultado estructurado (segmento, ficha, confirmación) |
| `fin` | motivo de parada y consumo de tokens |
| `error` | fallo con código |

Los `status` **se actualizan en sitio por su identificador**, no se acumulan: una
consulta con cuatro herramientas dejaría veinte renglones de ruido si cada
actualización fuese un mensaje nuevo. Las tarjetas igual — llevan una clave, y
una tarjeta con la misma clave reemplaza a la anterior en vez de apilarse.

---

## Reglas que están en el código, no en el prompt

Esta distinción es la más importante del diseño. **Un prompt no es un control de
acceso.** Lo que no puede pasar, no pasa porque el código no lo permite.

**Los derechos se verifican dentro de la herramienta, antes de devolver el dato.**
Si el usuario no tiene acceso, la herramienta devuelve `{ requiereCompra: true,
skuSugerido, precio }`, y **el dato de pago nunca entra en el contexto del
modelo**. No se le pide que «no lo mencione»: no lo tiene.

**El agente no ejecuta cobros.** Puede preparar una compra y devolver una tarjeta
de confirmación con su URL de pago. Pulsa el usuario. Abona el webhook.

**El precio se calcula en servidor y sale siempre del `_count` del API**, que es
exacto. Nunca de una estimación. El frontend actual calcula el importe en el
navegador y lo manda como parámetro; aquí no, porque el agente no puede fiarse de
un precio que decide el cliente.

**Nada de recomendaciones de crédito.** Es el producto que se vende (Informe de
Riesgo) y además una decisión automatizada regulada por el artículo 22 del RGPD.
Respuesta programada, no criterio del modelo.

**Máximo cinco empresas de vista previa.** El aviso legal del sitio prohíbe
reproducir el contenido; el conjunto completo va por descarga tras la compra.

---

## Resolución semántica

Traducir «bodegas» o «talleres» a CNAE se hace en dos pasos:

1. **Términos curados** — un léxico escrito a mano para lo frecuente. Resuelve
   sin tocar el modelo y de forma inmediata.
2. **Embeddings** — si el léxico no acierta, búsqueda vectorial sobre el catálogo
   CNAE completo.

Los vectores se generan en tiempo de compilación con un modelo local
(`multilingual-e5-small`, 384 dimensiones) y **van versionados en el
repositorio**: no hay que regenerarlos al desplegar. La búsqueda es en memoria
sobre unos 600 documentos.

Si el modelo semántico no está disponible, el sistema **sigue funcionando** con
los términos curados. Se degrada, no se cae.

---

## Sesión y seguridad

El ASP acuña un token contra `POST /internal/mint` usando un secreto compartido y
lo inyecta en la página. Es **HMAC, dura 15 minutos** y lleva el identificador de
usuario.

El widget nunca ve credenciales. El prefijo `/internal/` no se publica hacia
fuera: se bloquea explícitamente en el nginx, porque el host por el que se publica
Nia es público. CORS restringido al origen del portal.

---

## Rendimiento

**Caché con refresco en segundo plano** para lo que cambia poco. El resumen de
Infonif tarda unos 26 segundos y solo cambia una vez al día, así que se sirve lo
cacheado mientras se actualiza por detrás, con cerrojo en Redis para que no lo
descarguen todos los nodos a la vez.

**El catálogo de campos comprables se descarga en vivo** en lugar de estar copiado
en el código. Ahí no envejecen etiquetas: envejecen **precios**, y un precio
caducado es una factura mal emitida. Un cambio de precio queda registrado como
aviso.

**Caché de prompt** sobre el bloque de sistema, que es idéntico en todas las
conversaciones.

---

## Estado

Prueba de concepto funcional. Consulta, segmentación y cotización funcionan de
punta a punta contra los datos reales de Infonif.

Pendiente: el flujo de compra (Stripe en modo prueba y webhook de abono) y la
integración con la ficha de empresa.

Pruebas obligatorias en las dos piezas donde un error cuesta dinero: el
compilador de filtros y la verificación de derechos.
