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

Catorce, con nombre en español porque su descripción forma parte del prompt.

Segmentación y venta, contra el API del buscador:

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

Datos de una empresa concreta, contra el gateway. Comparten credencial, coste y
forma de fallar:

| Herramienta | Qué hace |
|---|---|
| `consultar_cargos` | quién administra o representa |
| `consultar_actos_borme` | qué se ha publicado y cuándo |
| `consultar_empresas_grupo` | matriz, filiales y participadas |
| `consultar_depositos_disponibles` | de qué ejercicios hay cuentas |
| `consultar_creditos` | saldo de consulta y consumo del mes |

**Hay dos monedas y el usuario llama «créditos» a las dos.** Los registros de un
plan de Base de Datos sirven para descargar listados; los créditos de consulta,
para abrir fichas de empresa. Se compran aparte y no se convierten entre sí.
Confundirlas manda al usuario a recargar donde no es, así que las herramientas
declaran cuál gastan y el prompt lo advierte.

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

## Potencial: el resto de APIs de Infonif

Todo lo descrito hasta aquí se apoya en **una sola fuente**: el API REST que
alimenta al buscador de bases de datos. Es la que hacía falta para la prueba de
concepto, pero no es la única que existe.

`icif-apigw` es un API Gateway sobre AWS (Serverless, Node) con una treintena de
endpoints en producción, agrupados en tres familias. **Dos ya están integradas**
—`/dato` y la parte de lectura de `/credito`— y este apartado cuenta qué se
aprendió al hacerlo y qué queda.

Un aviso de método antes de nada: el `serverless.yml` del repositorio **no es un
inventario fiable de lo desplegado**. `GET /buscador`, que funciona, no aparece
ahí. Todo lo que sigue está comprobado contra el API real, no leído del código.

### `/credito` — la pieza que falta para vender

Seis endpoints: consultar créditos, agregar créditos, historial, consumo del mes,
saldo por producto y generación del 460.

Esto es, literalmente, **la fase 5 de Nia**. Hoy el abono de créditos es un
apaño: la conversación sabe cotizar y sabe preparar una compra, pero quien
descuenta el saldo es un módulo de mentira. Aquí está el de verdad, con su
historial y su contabilidad.

Integrarlo convierte a Nia de «sabe cuánto cuesta» en «lo ha comprado», que es
donde está el valor. Y no habría que inventar el modelo de cobro: es el mismo que
ya usa el portal, con las mismas reglas y los mismos límites.

### `/dato` — de contar empresas a conocerlas

Siete endpoints: razón social por NIF, perfil de empresa, actos del BORME,
cargos, balance resumido, empresas del grupo y depósitos disponibles.

Nia hoy cuenta segmentos y cotiza listados. Con esto respondería a preguntas que
ahora no puede tocar:

- «¿Quién administra esta empresa?» → cargos
- «¿Ha cambiado algo últimamente?» → actos del BORME
- «¿De quién depende?» → empresas del grupo
- «¿De qué años hay cuentas?» → depósitos disponibles

Son preguntas que un usuario hace de forma natural en mitad de una conversación
sobre una empresa, y que hoy obligan a salirse de ella.

### `/producto` — entregar lo que se compra

Diecisiete endpoints: solicitar y obtener RAI, informes, depósitos en PDF,
titularidad real, partidas del depósito y el bloque RETIR (socios, depósitos,
declaración de titularidad real).

Con esta familia el ciclo se cierra dentro del chat: el usuario pregunta, Nia
recomienda el producto, lo compra y **lo entrega**, sin mandarlo a otra pantalla.

Ojo con un matiz que ya está en las reglas del proyecto: que Nia pueda entregar
un Informe de Riesgo no significa que pueda opinar sobre el riesgo. El informe lo
produce el sistema; la valoración sigue sin ser criterio del modelo.

---

## Dónde encajaría todo esto

Aquí es donde la separación de capas deja de ser una preferencia estética y
empieza a pagar.

```
agente/  ──►  datos/  ──┬──►  bbdd-api.infonif.es     (integrado)
                        ├──►  api.infonif.es /dato    (integrado)
                        ├──►  api.infonif.es /credito (integrado: lectura)
                        └──►  api.infonif.es /producto (pendiente)
```

Un API nuevo es **un adaptador más en `datos/`**. El bucle del agente no cambia,
el protocolo SSE no cambia, el widget no cambia. Lo único que crece es el
catálogo de herramientas, y cada herramienta nueva es un fichero con su esquema
Zod y su ejecutor.

Las reglas siguen aplicando sin excepción: los derechos se verifican dentro de la
herramienta, el precio se calcula en servidor y el agente sigue sin ejecutar
cobros. Añadir una fuente no añade una vía de escape.

### Lo que se aprendió integrándolo

**Autenticación: son dos cabeceras, no una.** Es lo más confuso de este API y no
está documentado en ninguna parte. `x-api-key` es la puerta de AWS; `ICIF-APIKEY`
es la cuenta de créditos de la aplicación. No son alternativas.

Se estableció probando, que es la única forma:

| Cabeceras enviadas | Respuesta de `/dato` |
|---|---|
| solo `x-api-key` | `401 Falta API Key` |
| solo `ICIF-APIKEY` | `403 No tiene créditos` |
| las dos | `403 No tiene créditos` |

El matiz está en el 403: significa que la petición **pasó la autenticación** y
llegó al control de saldo. `/buscador` es al revés — quiere la de AWS. Nia manda
las dos.

**Identidad: la clave del usuario NO viaja en el token.** El ASP la manda en
`/internal/mint`, servidor a servidor, y se guarda en Redis con el TTL de la
sesión. El token sigue llevando solo el `usuarioId`.

La razón es que la carga del token es `base64url`: va **firmada pero no
cifrada**. Cualquiera con el token la decodifica desde la consola del navegador.
Con un identificador de usuario eso da igual; con una credencial que gasta saldo
de su titular, no. El identificador es la llave del casillero, no su contenido.

**El coste no es por llamada: es 1 crédito por NIF y por mes.** Verificado en su
código, no supuesto: antes de descontar comprueban si ese NIF ya aparece en el
historial del mes y, si aparece, no descuentan. Además cachean por NIF.

Esto invierte por completo la orientación al modelo. Con coste por llamada habría
que pedirle que consultara lo justo; con coste por empresa, **una vez abierta una
ficha, mirar además cargos, grupo y BORME sale gratis**, y quedarse corto solo
obliga al usuario a repreguntar. Lo caro es abrir empresas nuevas.

**Y `GET /buscador` del gateway es el autocompletado de siempre**, byte a byte.
No se cambió `buscar_empresa` para usarlo: no aporta ningún campo nuevo y añadiría
una dependencia de credencial donde hoy no hay ninguna.

### Lo que sigue abierto

**Entorno.** El gateway está en AWS; Nia, en la red interna del cliente. Falta
comprobar salida y latencia desde la máquina de producción, que no es lo mismo
llamar a un servicio de la LAN que a uno en la nube.

**Una clave con saldo.** Las credenciales de prueba disponibles devuelven
`403 No tiene créditos` en toda la familia `/dato`, así que las formas de
respuesta siguen deducidas de su código y no contrastadas contra datos reales.

Ojo con un detalle que despista: `consultar-creditos` responde `{"cantidad": 0}`
**tanto si el saldo es cero como si la clave no está dada de alta** —usa una
función que devuelve `0` cuando no encuentra el registro, mientras que `/dato` usa
otra que lanza 403—. Una clave inventada da exactamente la misma respuesta. Así
que lo más probable es que haya que **dar de alta la clave** en la tabla de
créditos con `tipo = "icif"`, no recargarla.

---

## Un canal más: MCP

Existe ya un análisis de viabilidad (`icif-apigw/docs/mcp-infonif-analisis-cliente.md`)
para exponer estas APIs como servidor **MCP**, de modo que asistentes de terceros
—Claude Desktop, Cursor, Copilot, agentes propios de clientes— consulten la
información mercantil de Infonif como herramientas.

Conviene señalar que **eso y Nia no compiten: se complementan**, y que la
decisión de arquitectura de este proyecto ya lo anticipó. La ADR-009 descartó MCP
como protocolo *interno* —entre `agente/` y `datos/` no aporta nada, son el mismo
equipo y el mismo despliegue— pero dejó apuntado el MCP **público** como
oportunidad de fase 2.

Son dos caras de la misma capa de datos:

| | Nia | MCP |
|---|---|---|
| Quién lo usa | el cliente final, en el portal | otro agente, en su herramienta |
| Qué aporta | conversación guiada y venta | acceso programático estándar |
| Monetización | créditos y euros, la de siempre | consumo medido por clave |

Lo que se construya en `datos/` para Nia sirve a los dos. Y al revés: cada
endpoint que se integre acerca las dos cosas a la vez.

---

## Prioridad sugerida

Si hubiera que ordenarlo, este sería el orden por relación entre valor y
esfuerzo:

1. **`/credito`** — cierra el ciclo de venta, que es lo que convierte la demo en
   producto. Es además donde hoy hay un apaño que habrá que quitar de todas
   formas.
2. **`/dato`** — el salto más visible en la conversación. Son consultas de
   lectura, pero **sí gastan saldo**: no es la integración gratuita que parecía.
3. **`/producto`** — el de más recorrido comercial, pero también el que más
   depende de tener resuelto lo anterior.

Nada de esto está comprometido para la prueba de concepto. Se documenta porque la
pregunta «¿y esto hasta dónde llega?» se va a hacer, y la respuesta corta es: la
arquitectura no es el límite.

---

## Estado

Prueba de concepto funcional. Consulta, segmentación y cotización funcionan de
punta a punta contra los datos reales de Infonif.

Pendiente: el flujo de compra (Stripe en modo prueba y webhook de abono) y la
integración con la ficha de empresa.

Pruebas obligatorias en las dos piezas donde un error cuesta dinero: el
compilador de filtros y la verificación de derechos.
