# Inventario del gateway `api.infonif.es/v1`

Qué hay, qué cuesta, qué está integrado y qué no debería integrarse tal cual.

Todo comprobado **contra el API real**, no leído del `serverless.yml` — que no es
un inventario fiable: `GET /buscador` funciona y no aparece ahí, y `retir/*`
aparece y no se comporta como dice el código.

Los contratos se sacaron sondeando: un cuerpo vacío devuelve `400 Falta el campo
X` y va nombrando lo que falta, uno a uno, hasta completarlo.

---

## Las tres monedas

Esto es lo primero que hay que tener claro, porque el usuario llama «créditos» a
las tres y no se convierten entre sí.

| Moneda | Para qué | Dónde se compra |
|---|---|---|
| **Registros de plan** | descargar listados segmentados | `/bases-de-datos/` |
| **Créditos de consulta** | abrir la ficha de una empresa (`/dato`) | aparte |
| **Pago por producto** | un informe, un RAI, un depósito | en la web, por unidad |

Mandar al usuario a recargar la que no es le hace perder el viaje, así que cada
herramienta declara cuál gasta.

---

## `/dato` — integrada

**Coste: 1 crédito de consulta por NIF y por mes.** No por llamada. Verificado en
su código: antes de descontar miran si ese NIF ya está en el historial del mes y,
si está, no descuentan. Además cachean por NIF.

| Endpoint | Estado | Por qué |
|---|---|---|
| `obtener-perfil-empresa` | integrado | |
| `obtener-cargos` | integrado | |
| `obtener-actos-borme` | integrado | |
| `obtener-empresas-grupo` | integrado | |
| `obtener-depositos-disponibles` | integrado | |
| `obtener-razonsocial_nif` | **descartado** | ver abajo |
| `obtener-balance-resumido` | **descartado** | ver abajo |

### Por qué se descartan dos

No por dificultad: **porque duplican algo que ya funciona gratis**.

`obtener-razonsocial_nif` traduce NIF a razón social. `buscar_empresa` ya lo hace
contra el API del buscador, sin gastar un crédito y sin credencial de usuario.
Pagar por lo mismo sería un error de diseño, no un avance.

`obtener-balance-resumido` da cifras financieras, y `obtener_magnitudes` también
—gratis—. Puede que el del gateway traiga más detalle, pero **no se ha podido
comprobar** por falta de saldo. Añadir un duplicado de pago, sin verificar y sin
saber si aporta algo, es exactamente el tipo de decisión que luego nadie recuerda
por qué se tomó.

Si algún día se confirma que el balance del gateway trae partidas que el otro no,
se añade. Con el dato delante, no antes.

---

## `/credito` — integrada la lectura

| Endpoint | Estado | Contrato |
|---|---|---|
| `consultar-creditos` | integrado | `{}` → `{"response":{"cantidad":N}}` |
| `consultar-mes` | integrado | `{ahno, mes}` — sí, `ahno` |
| `consultar-historial` | integrado | `{desde, hasta}` en `yyyy-MM-dd HH:mm` |
| `obtener-saldo-productos` | no | responde `401 No autorizado` con clave válida |
| `agregar-creditos` | **nunca** | escribe saldo |

### `agregar-creditos` no va a ser una herramienta

Es la única del gateway que **escribe créditos**. Ponerla al alcance del modelo
sería darle la capacidad de regalarse saldo, y choca de frente con la regla de
que el agente no ejecuta cobros ni abonos.

Cuando llegue el flujo de compra, quien llame a esto será el webhook de pago
tras confirmar el cobro. Nunca el bucle del agente.

### La trampa de `consultar-creditos`

Responde `{"cantidad": 0}` **tanto si el saldo es cero como si la clave no está
dada de alta**. Una clave inventada devuelve exactamente lo mismo.

Está en su código: usa `queryCredits`, que devuelve `0` cuando no encuentra el
registro, mientras que `/dato` usa `getCredits`, que en ese mismo caso lanza 403.
Dos funciones sobre la misma tabla y solo una distingue «cero» de «no está».

Consecuencia práctica: con las claves de prueba disponibles no se puede saber si
falta saldo o falta el alta. **Lo que hay que pedir a Infonif es el alta con
`tipo = "icif"`**, no una recarga.

---

## `/producto` — entregar lo ya comprado

**Estas operaciones no cobran, y es lo que más despista del gateway entero.**
`solicitar-*` suena a «comprar» y no lo es: el cliente compra el producto en la
web y esto solo pide que se le entregue. Quien comprueba que la compra existe es
el servicio de aguas arriba.

Por eso no chocan con la regla de que el agente no ejecuta cobros: no hay cobro
que ejecutar. Y por eso tampoco pasan por el control de créditos de consulta —son
otra moneda— cosa que confirma su código: ninguna llama a `deductCredits`.

### Contratos, comprobados uno a uno

No había forma de deducirlos: el `serverless.yml` no los describe y el gateway
solo reenvía. Se sacaron probando.

| Endpoint | Cuerpo | Estado |
|---|---|---|
| `obtener-rai` | `{nif}` | **integrado** (`consultar_rai`) |
| `solicitar-rai` | `{nif}` | disponible |
| `solicitar-informe` | `{nif, tipo}` con tipo `6` u `11` | disponible |
| `obtener-informe` | `{id}` del solicitar | disponible |
| `obtener-deposito-pdf` | `{nif, ejercicio, consolidado}` | **integrado** (`descargar_cuentas_anuales`) |
| `obtener-partidas-deposito` | `{nif, ejercicio, consolidado}` | disponible |
| `solicitar-deposito` | `{nif, ejercicio, consolidado}` | disponible |
| `estado-partidas-deposito` | `{nif, ejercicio, consolidado}` | disponible |
| `obtener-titularidad-real` | `{nif}` | ver abajo |

**`consolidado` es obligatorio y no tiene valor por defecto.** Con NIF y ejercicio
pero sin él, responden `400 Falta el campo consolidado`. No está documentado en
ningún sitio; se descubrió probando. `false` son las cuentas individuales.

### Los dos 401 significan cosas opuestas

Es la trampa de esta familia, y se distinguen solo por el texto:

| Cuerpo del 401 | De dónde viene | Qué significa |
|---|---|---|
| `Unauthorized - Falta API Key` | del gateway | fallo de configuración nuestro |
| `No autorizado` | traducido de aguas arriba | **el producto no está contratado** |

Confundirlos sería grave en las dos direcciones: tratar una compra que falta como
una avería deja de vender, y tratar una avería como una compra que falta manda al
usuario a pagar por algo que ya tiene. El cliente los separa por el cuerpo.

Comprobado con la clave de pruebas: RAI e informes dan `401 No autorizado` —no
contratados—, mientras que `obtener-titularidad-real` da **404**, o sea que ahí sí
hay acceso y simplemente no hay datos de esa empresa.

### Titularidad real y socios — integradas, con salvaguardas

Son **datos de personas físicas** y el RGPD aplica. Se integran a petición
expresa, y lo que hace el código para que no se desmande:

- **No se consultan salvo que el usuario lo pida.** Está en la descripción de
  cada herramienta, que es lo que lee el modelo: «si nadie ha preguntado, no se
  consulta». No es como mirar un CNAE de más.
- **Van de sociedad a personas y nunca al revés.** Sus esquemas solo aceptan un
  NIF. Hay un test que falla si alguien añade un parámetro `nombre`, `persona`,
  `titular`, `socio` o `dni`, porque ese sería el cambio que convierte un dato
  registral en perfilado.
- **Se presentan sin valorar.** El resultado lleva un recordatorio explícito de
  que son hechos registrales.

| Herramienta | Ruta | Qué responde hoy |
|---|---|---|
| `consultar_titularidad_real` | `producto/obtener-titularidad-real` | 404 sobre Mercadona |
| `consultar_titularidad_real` con `declaracion` | `retir/obtener-declaracion-titularidad-real` | 401: no contratado |
| `consultar_socios` | `retir/obtener-socios` | 200 con cuerpo `""` |

### RETIR sí funciona

Lo que fallaba antes era el sondeo, no las rutas: se probaron con `{}` y lo que
respondían era el `getNif` quejándose. **Con un NIF real responden.**

Se usa `retir/obtener-socios` y no `retir-socios`: sobre el mismo NIF, la nueva
da 200 y la vieja 404.

### La tercera forma de decir «no hay datos»

`retir/obtener-socios` devuelve **200 con el cuerpo `""`** —el JSON de una cadena
vacía— cuando no hay nada. Ni 204 ni 404: un 200 que parece bueno.

Esto era un fallo silencioso de nuestro cliente, encontrado probando con un NIF
real: daba la respuesta por válida y la herramienta contestaba «ok» con un dato
vacío. Es la peor de las salidas posibles, porque el modelo recibe una respuesta
afirmativa sin contenido y ahí es justo donde rellena el hueco por su cuenta.

El cliente trata ahora como «sin datos» la cadena vacía, el objeto sin claves y
la lista sin elementos.

## La clave genérica es una muleta del demo

Ahora mismo Nia usa `ICIF_APIKEY_GENERICA` porque el ASP **todavía no manda la
clave del usuario** en `/internal/mint`. Eso hace que en el demo cualquiera
obtenga cargos, balance o BORME sin identificarse.

**En producción no vale**, por dos razones y ninguna es técnica:

- Cada consulta gasta saldo. Con la genérica lo gasta **Gedesco**, no quien
  pregunta.
- El usuario tiene que estar identificado para consumir su propio saldo, que es
  justo lo que la genérica se salta.

Lo que hay que hacer para el paso a producción:

1. Que el ASP incluya `apiKey` en su llamada a `POST /internal/mint`. El campo ya
   está aceptado y la clave se guarda en Redis, no en el token.
2. Poner `ICIF_PERMITIR_GENERICA=false`.

Mientras la genérica siga activa **con `NODE_ENV=production`, el servicio lo avisa
en cada arranque**. Se avisa en vez de bloquear porque bloquear dejaría el
servicio mudo sin explicar por qué; pero se avisa fuerte, porque es de esas cosas
que se ponen «un momento» y duran un año.

### El efecto en la conversación

Sin genérica, quien no haya iniciado sesión recibe `sinClave`, y eso **no se le
presenta como una compra**: se le dice que entre en su cuenta. La distinción está
probada, porque confundirla haría pagar a alguien por algo que no le resuelve el
problema.

Son cuatro situaciones distintas y cada una lleva a una frase distinta:

| Situación | Qué le falta | Qué se le dice |
|---|---|---|
| `sinDatos` | nada, no hay dato | «no consta» |
| `sinCreditos` | saldo de consulta | recargar |
| `noAutorizado` | el producto | comprarlo en el portal |
| `sinCredencial` | **sesión** | iniciar sesión, y nada más |

---

## Qué pedir a Infonif

Por orden de lo que desbloquea:

1. ~~Alta de la apikey en la tabla de créditos.~~ **Resuelto**: la clave del
   22/08/2026 tiene 2.857.097 créditos y toda la familia `/dato` responde con
   datos reales. Los esquemas están contrastados (ver abajo).
2. **Una clave con algún producto contratado**, para contrastar las respuestas de
   `/producto`. Hoy todas dan `401 No autorizado`, que es la vía correcta pero no
   enseña la forma del dato cuando sí lo hay.
3. **Qué pasa con RETIR**, y bajo qué base legal se pueden servir datos de
   titularidad real desde una conversación.
4. **Si `obtener-balance-resumido` aporta algo** sobre las magnitudes que ya
   tenemos gratis. Si no, se queda descartado para siempre y se documenta.

---

## Lo que enseñó el contraste con datos reales

Los esquemas estuvieron deducidos del código hasta tener una clave con saldo, y
el contraste demostró que **eso no basta**. Los contenedores estaban bien; los
campos de dentro fallaban en casi todos:

| Dónde | Deducido | Real |
|---|---|---|
| perfil | `domicilio`, `poblacion` | `direccion`, `localidad` |
| cargos | `nifcargo` | no existe; sí hay `estado` y `vinculaciones` |
| BORME | `fecha`, `registro`, `acto`, `descripcion` | **los cuatro mal**: `fechaborme`, `grupo`, `subgrupo`, `detalle`, `urlficheroborme` |
| grupo | `relacion`, `participacion` | solo `matriz` (0/1) |
| depósitos | `ejercicio`, `tipo`, `fechadeposito` | `anno`, `consolidado`, `procesadas` |

El de depósitos era el caro: al leer `ejercicio` en vez de `anno`, la lista de
ejercicios salía **vacía siempre** y la herramienta contestaba «no consta ninguna
cuenta» sobre empresas que sí las tenían. Sin lanzar ninguna excepción.

Es también el argumento a favor de haber dejado los esquemas permisivos: con
`.strict()` habría reventado en producción en vez de degradar.

### `estado` en cargos: solo sirve el 1

Se ofrecía una opción `todos` que no existe. Comprobado con tres empresas:

| valor | respuesta |
|---|---|
| `0` | 400 «Falta estado» — su `getEstado` usa `if (!data.estado)` y el 0 es falso |
| `1` | 200 con los vigentes: 174 en Mercadona, todos «Activo» |
| `2` y `3` | **204, sin contenido** |

La opción se ha retirado: prometía un histórico que siempre volvía vacío.

### `vinculaciones` no se expone

Los cargos traen en cuántas sociedades más figura esa persona. Es justo el dato
que convierte una consulta mercantil en el perfil de alguien, así que se lee y no
se pasa al modelo.

---

## Una nota de seguridad que no es de este proyecto

`consultar-creditos` lleva una clave de administración escrita en el código, con
valor por defecto si falta la variable de entorno:

```js
const AUTHORIZED_API_KEY = process.env.AUTHORIZED_API_KEY ?? 'Os7iA3Eqfg1a7Z…';
```

Quien la use puede consultar el saldo de **cualquier apikey** pasándola en el
cuerpo. No se ha utilizado. Pero si `AUTHORIZED_API_KEY` no está definida en el
entorno desplegado, esa cadena literal es la que está activa, y está en el
repositorio.

Alguien de Infonif debería decidir si eso sigue así.
