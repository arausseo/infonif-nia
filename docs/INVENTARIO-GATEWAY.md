# Inventario del gateway `api.infonif.es/v1`

Qué hay, qué cuesta, qué está integrado y qué no debería integrarse tal cual.

Todo comprobado **contra el API real**, no leído del `serverless.yml` — que no es
un inventario fiable: `GET /buscador` funciona y no aparece ahí, y `retir/*`
aparece y no se comporta como dice el código.

Método para las que cobran: se sondearon con **cuerpo vacío**. Validan el NIF
antes de llamar al servicio de aguas arriba, así que un `{}` devuelve `400 Falta
NIF` y revela el contrato sin llegar a comprar nada.

---

## Las tres monedas

Esto es lo primero que hay que tener claro, porque el usuario llama «créditos» a
las tres y no se convierten entre sí.

| Moneda | Para qué | Dónde se compra |
|---|---|---|
| **Registros de plan** | descargar listados segmentados | `/bases-de-datos/` |
| **Créditos de consulta** | abrir la ficha de una empresa (`/dato`) | aparte |
| **Pago por producto** | un informe, un RAI, un depósito | por unidad |

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

## `/producto` — no integrada, y no por falta de tiempo

Aquí está el dinero de verdad, y por eso hay que pararse.

### Las que compran

| Endpoint | Cuerpo | Qué hace |
|---|---|---|
| `solicitar-rai` | `{nif}` | pide un RAI |
| `solicitar-informe` | `{nif, tipo}` con tipo 6 u 11 | pide un informe |
| `solicitar-deposito` | `{nif, …}` | pide unas cuentas |

**Estas tres no pueden ser herramientas del modelo.** No es una cuestión de
prudencia: la regla del proyecto dice que el agente nunca ejecuta un cobro, y
esto es un cobro.

Y hay un agravante que conviene conocer: **el gateway no descuenta nada al
llamarlas**. Reenvía la petición a un servicio interno (`httpPost`) y registra el
histórico con coste cero. El cargo ocurre aguas arriba, **donde este código no lo
ve**. Es decir, leyendo `icif-apigw` no se puede saber cuánto cuesta una llamada
a `solicitar-informe`. Eso hay que preguntarlo.

La forma correcta de integrarlas es la que ya está diseñada para el flujo de
compra: el agente **prepara** la compra y devuelve una tarjeta de confirmación
con su importe; el usuario pulsa; y quien llama a `solicitar-*` es el servidor
tras el pago. El agente propone, no ejecuta.

### Las que recuperan

| Endpoint | Cuerpo |
|---|---|
| `obtener-rai` | `{nif}` |
| `obtener-informe` | `{id}` — el que devuelve `solicitar-informe` |
| `obtener-deposito-pdf` | `{nif}` |
| `obtener-partidas-deposito` | `{nif}` |
| `obtener-titularidad-real` | `{nif}` |

Éstas sí son seguras en principio —recuperan algo ya comprado, y su propia
documentación dice que reconsultar no debería generar un segundo cobro— pero
**sin el flujo de compra no sirven para nada**: no hay nada que recuperar.

Así que la familia entera está bloqueada por la misma pieza, y esa pieza es de
diseño de producto, no de integración.

### RETIR

Ocho endpoints (`retir-*` y `retir/*`, más tres en `/dev/`). Todos responden
`400 Body no es un JSON válido` incluso con un JSON válido, aunque su código usa
el mismo `getNif` que el resto.

O el despliegue no coincide con el repositorio, o esas rutas esperan algo que no
está en el código que hemos leído. **No se toca hasta preguntar**, porque además
son las de titularidad real: datos de personas físicas, con lo que eso implica en
protección de datos.

---

## Qué pedir a Infonif

Por orden de lo que desbloquea:

1. **Alta de la apikey en la tabla de créditos con `tipo = "icif"`.** Sin esto la
   familia `/dato` no se puede contrastar contra datos reales, y sus formas de
   respuesta siguen deducidas del código.
2. **Cuánto cuesta cada `solicitar-*`.** No está en el gateway; el cargo ocurre
   aguas arriba. Sin ese dato no se puede enseñar un importe al usuario, y la
   regla dice que un precio que no viene de una herramienta no se dice.
3. **Qué pasa con RETIR**, y bajo qué base legal se pueden servir datos de
   titularidad real desde una conversación.
4. **Si `obtener-balance-resumido` aporta algo** sobre las magnitudes que ya
   tenemos gratis. Si no, se queda descartado para siempre y se documenta.

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
