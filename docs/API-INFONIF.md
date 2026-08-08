# Buscador de Infonif — contrato observado

Especificación de los dos APIs de Infonif con los que habla Nia, reconstruida a
partir de sus endpoints, del código del frontend Vue (`frontend-bbdd`) y de las
respuestas del cliente. **No hay Swagger: este documento hace de contrato.**

Última revisión: 08/08/2026.

**Distingue lo verificado de lo supuesto.** Lo que aquí pone «hipótesis» no está
confirmado y no debe convertirse en código que cobre dinero sin confirmarlo.

Copias congeladas en `packages/api/src/datos/fixtures/infonif/`:

| Fichero                   | Origen                                                               |
| ------------------------- | -------------------------------------------------------------------- |
| `campos-comprables.json`  | `GET /bases-de-datos/herramienta/fields.json?v5.3`                   |
| `buscador-data.json`      | `GET /bases-de-datos/herramienta/buscador-data.json?v1.2`            |
| `ejemplo-peticion.json`   | Aportado por el cliente                                              |
| `resumen-2026-08-08.json` | `GET https://bbdd-api.infonif.es/api/buscador/resumen` — datos vivos |
| `ejemplo-busqueda.json`   | `GET /buscador/autocomplete/listar?q=…` — muestra del cliente        |
| `ejemplo-respuesta.json`  | `POST /buscador/filtrar` — respuesta real, verificada en vivo        |

---

## 1. El precio no son tramos por registro: es por campo y por registro

`campos-comprables.json` son 34 campos, cada uno con su `price` **por registro**:

```json
{
  "name": "Email",
  "group": "contacto",
  "label": "Email",
  "price": 0.05,
  "isNew": true,
  "requiredFilter": true
}
```

| Grupo         | Campos | Precio/registro si se llevan todos |
| ------------- | -----: | ---------------------------------: |
| `contacto`    |      7 |                             0,27 € |
| `comerciales` |      4 |                             0,08 € |
| `financieros` |     23 |                             1,07 € |
| **Total**     | **34** |                         **1,42 €** |

Rango unitario: 0,02 € (CIF, razón social, dirección, CNAE, empleados, sector,
fecha de constitución) a 0,08 € (cargo).

### Resuelto: los tramos de CLAUDE.md son referenciales

CLAUDE.md registra «listados 0,30/0,15/0,10 € por registro». **El cliente
confirmó el 08/08/2026 que ese modelo es solo referencial y que el precio real es
el de aquí**: por campo y por registro, con la fórmula de §4.

Consecuencias, ya aplicadas:

- `datos/fixtures/skus.json` ya no lleva tramos ni umbrales inventados.
- **No existe mínimo de registros.** El `minimoRegistros: 50` que puse era mío.

**Este precio en euros solo aplica a quien NO tiene plan.** Quien tiene plan
consume registros de su saldo, y ahí el número de campos da igual: ver §4. Son
dos monedas distintas y no se convierten entre sí.

### `requiredFilter`

Cuatro campos lo llevan: `Telefono`, `Email`, `CargosDisponibles`, `Web`. Encaja
con `campos_requeridos` de la petición: pedir uno de estos campos obliga a
filtrar por que exista. Hipótesis razonable: no se factura un registro por un
campo que va vacío.

### `jsonPath` y `partida`

Los campos comerciales traen la ruta al dato en el documento de origen
(`empleados` → `$.UltimaCuentaAnual.SumTotalEmpleados`, `cnae` →
`$.CnaeInfo.Cnae3_text`). Los financieros traen `partida` + `tipoPartida`
(`Perdida`, `InformacionFinanciera`, `Ratios`). Es el vocabulario que usa la
respuesta de conteo (§3).

Correspondencias que nos interesan: `99053` Ventas · `99016` EBITDA ·
`49500` Resultado del ejercicio · `10000` Total activo · `20000` Patrimonio neto.

---

## 2. El vocabulario de filtros lo sirve el propio buscador

El catálogo de facetas **con sus conteos**. Claves de nivel superior: `cantidad`,
`total_auditores`, `antiguedad`, `empleados`, `provincia`, `provincia_localidad`,
`auditor`, `cnae`, `industria`, `cargos`, `cuentas_disponibles`, `tipo_cuentas`.

Todo nodo tiene la misma forma: `{ id, label, data, children? }`, donde `data`
es el número de empresas.

**El `id` es el valor literal que espera el filtro.** No inventamos códigos:
hablamos su vocabulario.

### Hay dos fuentes y una está caducada

| Fuente                                                 | Qué es                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /bases-de-datos/herramienta/buscador-data.json`   | Fichero estático del portal. **Caché referencial, no refleja los datos actuales.** Es lo que consume hoy el frontend Vue. |
| `GET https://bbdd-api.infonif.es/api/buscador/resumen` | **El bueno.** Misma forma, datos vivos. Tarda ~26 s.                                                                      |

Confirmado por el cliente el 08/08/2026, y la diferencia es enorme:

|                  |     Caché | Vivo (08/08/2026) |
| ---------------- | --------: | ----------------: |
| `cantidad`       | 3.310.964 |     **2.712.875** |
| provincias       |        52 |            **53** |
| localidades      |     7.160 |             7.098 |
| `Aragón\|Teruel` |     6.541 |             5.162 |
| CNAE 4941        |    18.485 |            21.686 |
| años con cuentas | 2016–2022 |     **2016–2026** |
| cuentas de 2024  |        24 |     **1.128.190** |

**Nia debe leer el endpoint vivo, nunca el fichero.** Las copias que hay en
`fixtures/infonif/` son para tests y para no depender de la red en desarrollo.

### Universo

**2.712.875 empresas.**

### Geografía — 3 niveles, `id` con tuberías

```
"Andalucía"                    439.963
"Andalucía|Almería"             41.328
"Andalucía|Almería|Abla"            17
```

19 comunidades · **53 entradas de provincia** · 7.098 localidades. El filtro
`Provincias: ["Aragón|Teruel"]` usa la ruta completa, no el nombre suelto.

**Son 53 porque Tenerife está duplicada**, y esto muerde:

```
"Canarias|Santa Cruz De Tenerife"    56.986   (53 localidades)
"Canarias|Sta. Cruz De Tenerife"          8   (0 localidades)
```

Filtrar por la forma larga pierde 8 empresas. Son pocas, pero un conteo que
alimenta una factura no puede perder registros en silencio: el compilador tiene
que mandar **las dos** variantes. Y como esto puede repetirse con otras
provincias en el futuro, la resolución de provincia debe agrupar por forma
normalizada, no por cadena exacta.

**Los nombres de provincia son los del INE, no los castellanos cortos.** Diez no
coinciden con la lista de `datos/geo/provincias.ts`:

| Infonif                  | Nia (Fase 0)           |
| ------------------------ | ---------------------- |
| `Alicante/Alacant`       | Alicante               |
| `Balears, Illes`         | Baleares               |
| `Castelló`               | Castellón              |
| `Coruña, A`              | La Coruña              |
| `Lleida`                 | Lérida                 |
| `Ourense`                | Orense                 |
| `Palmas, Las`            | Las Palmas             |
| `Rioja, La`              | La Rioja               |
| `Santa Cruz De Tenerife` | Santa Cruz de Tenerife |
| `Valencia/València`      | Valencia               |

La forma canónica tiene que ser la suya, porque va literal en la petición. La
nuestra pasa a ser alias de entrada del usuario. `resolverProvincia()` ya existe
para eso, pero hay que darle la vuelta al mapa.

### CNAE — 4 niveles, 627 clases

```
"A"      Agricultura, ganadería, silvicultura y pesca    49.249
"01"     Agricultura, ganadería, caza y servicios…
"011"    Cultivos no perennes                             3.258
"0111"   Cultivo de cereales (excepto arroz)…             1.056
```

21 secciones · 88 divisiones · 271 grupos · **627 clases de 4 dígitos**.

Coincide con el «~630 clases» de ADR-004. **Este árbol es el corpus de la Fase 2**:
son sus etiquetas, con sus conteos, y sale gratis. Mejor que un CNAE-2009 externo.

Logística, para calibrar el demo:

| CNAE | Descripción                            | Empresas |
| ---- | -------------------------------------- | -------: |
| 4941 | Transporte de mercancías por carretera |   21.686 |
| 5210 | Depósito y almacenamiento              |    2.298 |
| 5229 | Otras actividades anexas al transporte |    1.931 |
| 5224 | Manipulación de mercancías             |      306 |
| 4942 | Servicios de mudanza                   |      341 |

### Rangos: hay enumeración **y** rango libre

Las facetas publican rangos cerrados…

```
antiguedad: rango.0 (80 años o más) … rango.5 (reciente constitución) + incluir_null
empleados:  rango.0 (<10) · rango.1 (10-49) · rango.2 (50-249) · rango.3 (≥250) + incluir_null
```

…pero el filtro acepta además valores con prefijo, que el frontend construye a
mano (§3). El mismo array admite las dos formas:

| Filtro                   | Formas aceptadas                                                  |
| ------------------------ | ----------------------------------------------------------------- |
| `empleados`              | `"rango.N"` · `"empleados:20\|99999999"`                          |
| `antiguedad`             | `"rango.N"` · `"ahnos:5\|20"` · `"fechas:01/01/2015\|31/12/2020"` |
| `sector_actividad`       | `"cnae\|4941"` · `"icif\|<etiqueta del sector Infonif>"`          |
| `Provincias`             | `"Aragón\|Teruel"` (ruta completa)                                |
| `cargo`, `vinculaciones` | id + `"status:0\|1\|2"`                                           |

**«Más de 20 empleados» sí es expresable**: `"empleados:20|99999999"`. El
`99999999` es literalmente lo que pone el frontend cuando el «hasta» va vacío
(`FilterNumeroEmpleados.vue:339`).

Esto corrige lo que asumí al leer solo `buscador-data.json`: `FiltroSegmento`
(CONTRATOS §3) **sí** puede seguir aceptando números libres del usuario. Lo que
cambia es a qué compila.

### `industria` — el sector propio de Infonif

47 valores («Otros» 738.461, «Automotor» 54.517, «Bebidas y Tabaco» 21.940…). Es una taxonomía **distinta** del CNAE, y `IndustriaDescripcion` es un
campo comprable. La capa semántica tendrá que decidir a cuál de las dos resuelve
—o a las dos.

### La cobertura de datos, con las cifras vivas

`incluir_null` es **el número de empresas SIN dato en ese campo**. Comprobado:
en `antiguedad` y en `empleados`, la suma de los rangos más `incluir_null` da
exactamente `cantidad`.

| Campo      |  Con dato |  Sin dato | Cobertura |
| ---------- | --------: | --------: | --------: |
| antigüedad | 1.906.184 |   806.691 |    70,3 % |
| empleados  |   264.267 | 2.448.608 | **9,7 %** |

Años con cuentas (una empresa cuenta en varios, no son excluyentes):

```
2024: 1.128.190   2023: 1.176.287   2022: 1.132.773   2021: 1.081.099
2020: 1.026.290   2019:   977.976   2018:   930.579   2025: 283.094
2017:    17.585   2016:    19.592   2026:         1
```

Ojo: en `cuentas_disponibles` el `incluir_null` vale `cantidad` entera, así que
ahí **no** significa lo mismo que en los otros campos. No usar esa cifra.

Dos avisos para el guion de demo:

1. **Corrige lo que escribí ayer.** Con el fichero caducado deduje «solo 185.000
   empresas (5,6 %) tienen cuentas». Es falso: con datos vivos hay **más de
   1,1 millones con cuentas de 2024**. El flujo A del demo, que pregunta por
   2024, tiene datos de sobra.
2. Lo que sigue siendo escaso es **el número de empleados: 9,7 %**. El flujo C
   del demo filtra por empleados, así que el segmento se moverá sobre 264.267
   empresas, no sobre 2,7 millones. Conviene decirlo antes de que lo pregunten.

Hay una discrepancia sin resolver: `tipo_cuentas` da 259.069 individuales + 34
consolidadas + 6.096 ambas ≈ 265.000, muy lejos del 1.128.190 de
`cuentas_disponibles` para 2024. Cuentan cosas distintas y no sabemos cuáles.

---

## 3. Petición y respuesta de conteo

```
POST https://bbdd-api.infonif.es/api/buscador/filtrar?resumen=false
apikey: <INFONIF_API_KEY>
```

Petición: `ejemplo-peticion.json`. Respuesta real: `ejemplo-respuesta.json`
(ambas verificadas contra el API en vivo el 08/08/2026). Todas las claves van
siempre, con array vacío si no se filtra. Los valores son los `id` del resumen.

Tarda ~1,1 s. Devuelve 81 para el ejemplo del cliente, que es exactamente lo que
enseña su captura de pantalla.

### Forma de la respuesta

```json
{
  "filtro.1":           { "cantidad": 81, "campos_disponibles": [ … ] },
  "cantidad":           81,
  "campos_disponibles": [ … 1.234 entradas … ]
}
```

### `filtros` NO devuelve el embudo entero

`filtros` es un array de estados acumulativos, construido en `utils.js:172`
(`beforeOrderFilters`). Es **obligatorio**: `search.js:286` ni siquiera llama al
API si viene vacío.

Pero la respuesta **solo trae el último paso**, con la clave `filtro.{n-1}`,
siendo `n` el número de elementos de `filtros`. Verificado:

| `filtros` enviados                | Claves devueltas | `cantidad` |
| --------------------------------- | ---------------- | ---------: |
| `[Teruel]`                        | `filtro.0`       |      5.162 |
| `[Teruel]`, `[Teruel+antigüedad]` | `filtro.1`       |        275 |
| … + `[+empleados]`                | `filtro.2`       |         80 |

O sea: **para pintar el embudo hay que llamar una vez por criterio**, que es lo
que hace el frontend —va acumulando los `filtro.N` de llamadas sucesivas en su
store—. A 1,1 s por llamada, los cuatro criterios del flujo C del demo son unos
4,5 s. Encaja bien con el protocolo de `status`: un evento por criterio, con su
conteo como `detalle`.

### `campos_requeridos` recorta de verdad

Mismo filtro, con y sin exigir email:

```
Teruel + antigüedad rango.2                        → 275 empresas
Teruel + antigüedad rango.2 + campos_requeridos:[Email] →  81 empresas
```

**Exigir email se lleva el 70 % del segmento.** Nia tiene que decirlo, no
aplicarlo callando: se pagan menos registros, pero también se compran menos.

### Criterios financieros: el formato que sí traga

Los filtros `balance`, `perdidas` y `ratios` llevan una cadena de cinco campos:

```
años | partida-etiqueta | desde | hasta | tipoCuenta

2024,2023|99053-Ventas|2000000|null|1
```

Medido contra el API, porque aquí es fácil equivocarse en silencio:

| Qué se manda                  | Qué pasa                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `null` en los años            | **HTTP 500.** Son obligatorios, aunque el frontend parezca mandar null                   |
| `2024`                        | 99.122 empresas con ventas ≥ 2 M                                                         |
| `2023`                        | 103.596                                                                                  |
| `2023,2024`                   | **113.619** → varios años significan «al menos uno», no «todos»                          |
| tipoCuenta `1`                | 99.122 → cuentas individuales                                                            |
| tipoCuenta `0` o `5`          | 2.423 → **`0` NO es «cualquier tipo» aquí**, aunque sí lo sea en los ids de la respuesta |
| `2024\|99053\|…` sin etiqueta | mismo resultado: la etiqueta es decorativa                                               |
| `todos:true` / `todos:false`  | ocupan el sitio del tipo de cuenta; no se pueden combinar con él                         |

Que `0` signifique «cualquiera» al leer la respuesta y «casi nada» al filtrar es
la trampa más cara del contrato: dejaría fuera el 97 % del segmento sin que nada
falle ni avise.

Como los años son obligatorios y no se pueden escribir a mano —envejecen—, se
sacan del resumen en vivo: los dos ejercicios más recientes cuya cobertura llegue
al 20 % del universo. Hoy, 2024 y 2023. El año en curso no vale: 2026 tiene una
sola empresa con cuentas.

### Las dos familias de `id` en `campos_disponibles`

Es una lista plana de `{ id, data }`:

**a) Disponibilidad por campo comprable** — la cola de la respuesta:

```json
{ "id": "CIF", "data": 81 }
{ "id": "Email", "data": 81 }
{ "id": "Telefono", "data": 78 }
{ "id": "CargosDisponibles", "data": 66 }
```

De 81 empresas que cumplen el filtro, 78 tienen teléfono y 66 tienen cargo.
**Esto es exactamente la cotización exacta que pide la regla 7:**

```
precio = Σ  precio_campo × registros_con_ese_campo
```

No hay que estimar nada. El propio buscador dice cuántos registros aportan cada
campo. Es mejor de lo que asumía CONTRATOS §4.

**b) Cobertura financiera por partida** — el grueso de la respuesta:

```json
{ "id": "10000|0|2018,2019,2020,2021,2022,2023,2024", "data": 24 }
{ "id": "10000|ultima|1|2024",                        "data": 44 }
```

Formato: `partida | tipoCuenta | años` y `partida | "ultima" | tipoCuenta | año`,
donde `partida` es la de `campos-comprables.json`.

**El segmento intermedio es el tipo de cuenta.** Resuelto leyendo el frontend:

| Valor | Significado    | Dónde                                                                                      |
| ----- | -------------- | ------------------------------------------------------------------------------------------ |
| `0`   | cualquier tipo | `FieldsSelected.vue:201` — «Como no hay seleccionadas buscamos tipo 0 (Cualquier tipo de)» |
| `1`   | Individual     | `FilterInformacionFinanciera.vue:396`                                                      |
| `5`   | Consolidada    | idem                                                                                       |

Ojo: **no** son los ids del filtro `TipoCuentas`, que usa `1` Individual,
`2` Consolidada y `100` Ambas (`buscador-data.json`). Dos codificaciones
distintas para el mismo concepto en la misma API.

Los años vienen **sin ordenar** (`"2019,2022,2023,2024,2018,2020,2021"`): la
cadena es un identificador, no una lista ordenada. Hay que normalizarla antes de
comparar o agrupar.

---

## 4. Cómo lo consume el frontend actual

Analizado sobre `C:\apu\gedesco\frontend-bbdd` (`infonif-buscador` 0.1.1, Vue 2 +
Vuex + axios). Es la herramienta que se ve en
`infonif.economia3.com/bases-de-datos/herramienta/#/`.

### Hay un API REST propio delante

```js
// src/plugins/axios.js
axios.defaults.baseURL = "https://bbdd-api.infonif.es/api"; // producción
axios.defaults.baseURL = "https://bbdd-api2.infonif.es/api"; // infoniftest
```

**Esto responde a la pregunta que bloqueaba la Fase 1: no hablamos con
Elasticsearch, hablamos con `bbdd-api.infonif.es`.** Lo que haya detrás es asunto
suyo. El compilador de filtros de Nia emite esta petición JSON, no DSL de ES.

Endpoints que usa el buscador:

| Método y ruta                                                        | Para qué                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| `POST /buscador/filtrar?resumen=false`                               | **El conteo.** Devuelve `cantidad` y `campos_disponibles` |
| `POST /buscador/empresas/filtrar?pag=&size=&sort=`                   | Resultados paginados                                      |
| `POST /buscador/empresas/excel?nombreArchivo=&a=g`                   | Genera el Excel del listado                               |
| `POST /buscador/empresas/presupuesto?nombreArchivo=&costo=&total=`   | Genera el presupuesto en Excel                            |
| `POST /buscador/empresas/email?to=&nombreArchivo=`                   | Envía los resultados por correo                           |
| `GET /buscador/planBBDD?idusuario=`                                  | Plan de registros del usuario                             |
| `GET /buscador/cuentas/disponibles/count`, `/cuentas/tipos/count`    | Facetas de cuentas                                        |
| `GET /buscador/localidades?buscar=`                                  | Autocompletado de localidades                             |
| `POST /buscador/NIF/validar`, `/codigoPostal/validar` (+ `/archivo`) | Validación de listas y subida de ficheros                 |
| `POST /buscador/razonSocial/buscar?razon=`, `/cargo/buscar`          | Búsquedas auxiliares                                      |
| `GET /buscador/auditor/lista`, `/auditor/buscar`                     | Auditores                                                 |
| `GET /buscador/filtro/id/{id}`                                       | Recupera un filtro guardado                               |

Las dos facetas grandes **no** salen del API: son ficheros estáticos servidos
desde el propio portal (`buscador-data.json`, `fields.json`). Existe
`GET /buscador/resumen`, pero está desactivado con un `loadRemote = false`
(`search.js:159`).

### Autenticación

`Bearer` en el interceptor de axios, con el token sacado de
`localStorage.dataJson` (`auth.js:43`), que es lo que deja ahí el portal ASP. Hay
además una `apikey` fija en el código para los filtros guardados
(`utils.js:1494`).

**Esto valida el diseño del puente de sesión de CONTRATOS §5**: el ASP ya publica
sesión al frontend por este camino. Nia puede hacer lo mismo, pero acuñando su
propio token en `/internal/mint` en vez de leer el de ellos.

### La fórmula del precio

Está en `FieldsSelected.vue:135` (`costoActual`) y `:165` (`getCount`):

```
coste = Σ  precio_campo × N_campo          (sobre los campos seleccionados)

N_campo =
  RazonSocial            → total de empresas del segmento
  campo sin `partida`    → campos_disponibles.find(id === nombre).data
  campo con `partida`:
      con filtro financiero aplicado →
          tipo y años = los de la PRIMERA partida filtrada
          Σ .data de los ids que empiezan por `${nombre}|${tipo}`
            y cuya lista de años corte con los años pedidos
      sin filtro financiero →
          Σ .data de los ids que empiezan por `${nombre}|0`   (0 = cualquier tipo)

total a pagar = coste × 1,21          (IVA, VisualizarResultados.vue:1349)
```

Es exactamente lo que se ve en la captura: CIF 81 · Razón social 81 ·
Dirección 81 · Email 81 · **Ventas 79**, con «Empresas: 81». Los 81 registros
tienen CIF y email —email está marcado obligatorio—, pero solo 79 tienen la
partida de ventas.

Comprobación con esos números: 3 × 0,02 × 81 + 0,05 × 81 + 0,04 × 79 = **12,07 €**
sin IVA, 14,60 € con IVA.

### El interruptor «Obligatorio» cambia el conteo, no solo el precio

Es el `requiredFilter` de `fields.json`. Su tooltip:
«Únicamente se mostrarán los registros que tengan valor en este campo»
(`FieldsList.vue:108`). Al activarlo, el nombre del campo entra en
`campos_requeridos` y **el segmento se reduce**.

O sea: activar «Email obligatorio» baja el número de empresas y sube la
proporción de registros facturables. Medido contra el API en vivo, el recorte es
del 70 % (§3). Nia tiene que explicar ese intercambio, no solo aplicarlo.

En el estado del frontend `campos_requeridos` es un objeto `{Email: true}`; se
aplana a array de nombres justo antes de enviar (`Buscador.vue:505`).

### Dos cosas que NO hay que copiar

1. **El precio se calcula en el cliente y se envía al servidor como parámetro**:
   `presupuesto?costo=${camposCosto}&total=${empresas}`, y el `monto` del TPV sale
   del mismo cálculo del navegador (`VisualizarResultados.vue:1349`). En Nia el
   precio lo calcula el servidor dentro de la herramienta: la regla 1 dice que el
   cobro no lo decide el cliente.

2. **Hay dos implementaciones distintas de `costoActual`** en la misma pantalla:
   la de `Buscador.vue:389` no contempla los campos con `partida` —busca
   `id === "99053"` cuando los ids reales son `"99053|0|…"`— y la de
   `FieldsSelected.vue:135` sí. La que manda es la segunda, porque es la que
   despacha `setCostoTotal`. `datos/precios.ts` será fuente única, como manda
   CLAUDE.md.

### Plan de registros: la segunda moneda

```
GET /buscador/planBBDD?idusuario=133627     (Idusuario también vale)
```

Verificado con los dos usuarios de prueba el 08/08/2026:

| Usuario           | Respuesta                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 133627 (con plan) | `200` · `{"iD_usuario":133627,"numRegistrosConsumidos":919398,"numRegistrosMensuales":9000000,"fechaFinContrato":"2026-11-16T00:00:00"}` |
| 142583 (sin plan) | **`204` sin cuerpo** — no un JSON con nulos                                                                                              |

Dos avisos sobre esos campos:

- **`numRegistrosMensuales` no es mensual.** Es el total contratado: su propio
  portal lo rotula «Registros contratados: 9.000.000», y viene con fecha de fin
  de contrato. Tratarlo como cupo mensual sería multiplicar el saldo por doce.
- **`fechaFinContrato`**: pasada esa fecha, el plan no debería valer aunque
  queden registros.

#### Un plan se consume en REGISTROS, y los campos dan igual

Esto es lo que más cambia respecto a §1. Con plan **no se cotiza un importe**: se
descuenta un registro por empresa, se lleve el usuario una columna o quince.

Confirmado en las tres capas del frontend:

| Dónde                           | Qué dice                                                                    |
| ------------------------------- | --------------------------------------------------------------------------- |
| `VisualizarResultados.vue:1846` | `consumo = this.selected_companies` — el nº de empresas, no los campos      |
| `VisualizarResultados.vue:1848` | `nuevoSaldo = contratados − consumidos − selected_companies`                |
| `FieldsSelected.vue:4`          | el importe en euros se muestra `v-if="… && !tiene_plan"`                    |
| `VisualizarResultados.vue:88`   | el bloque de «Coste total + IVA» también va bajo `!tienePlanBBDD`           |
| `VisualizarResultados.vue:104`  | con plan, en su lugar sale «Registros Filtrados: N» y el botón de descargar |
| `Buscador.vue:611`              | comprueba `disponibles < selected_companies` antes de dejar avanzar         |

Y su propio diálogo lo dice con todas las letras: con 50 empresas y cinco campos
seleccionados (CIF, razón social, dirección, teléfono, email), avisa de que
«vas a consumir **50** registros», no 207 —que es lo que suman los campos—.

O sea que hay **dos monedas que no se convierten entre sí**:

```
sin plan → euros,     y el importe depende de los campos
con plan → registros, y el número de campos no entra en la cuenta
```

`datos/precios.ts` calcula siempre las dos y marca cuál aplica
(`formaDePago: "euros" | "saldo"`), porque un usuario con plan puede querer saber
lo que costaría sin gastarlo. Pero **a quien tiene saldo se le habla de
registros, no de dinero**, igual que hace su portal.

`tienePlanBBDD` es `planBBDD != null && planBBDD.iD_usuario != null`
(`VisualizarResultados.vue:979`). La descarga marca `TipoDescarga: 2` con plan y
`1` sin plan.

Es el mismo modelo de derechos de ADR-008: `derechos.ts` resuelve plan o saldo, y
la herramienta decide antes de devolver el dato.

---

## 5. El otro API: búsqueda de empresa por nombre

Además del buscador de listados hay una búsqueda por nombre sobre Elasticsearch,
con **un universo más amplio** pero casi sin cuentas ni información extra. Sirve
para _encontrar_ una empresa, no para _segmentar_.

Tiene dos puertas a lo mismo:

```
GET https://infonif.economia3.com/api/buscador/buscar.asp?q=merca      ← interna, da 403 desde fuera
GET https://bbdd-api.infonif.es/api/buscador/autocomplete/listar?q=…   ← la que usamos
    apikey: <INFONIF_API_KEY>
```

**Nia usa la segunda.** Verificada el 08/08/2026: responde en ~0,7 s y devuelve
el mismo esquema. Sin la cabecera `apikey` da **500**, no 401.

Comportamiento medido:

- **Tope de 25 resultados**, y no admite paginación: `size`, `rows` y `limit` se
  ignoran. Para el chat sobra —la vista previa son 5 filas— pero significa que
  no se puede recorrer un resultado amplio por aquí.
- **Mínimo de 3 caracteres**: `q=me` devuelve 0, `q=mer` devuelve 25.
- **Busca por NIF completo con letra** (`A46103834` → 1 resultado). Solo la parte
  numérica (`46103834`) devuelve 0. Hay que normalizar el NIF antes de consultar.

Muestra en `fixtures/infonif/ejemplo-busqueda.json`. Respuesta:
`{ "empresas": [ … ] }`, cada una con claves de una o dos letras:

| Clave              | Qué es                                                                            |
| ------------------ | --------------------------------------------------------------------------------- |
| `nif`              | NIF con letra (`A46103834`)                                                       |
| `nifn`             | la parte numérica (`46103834`)                                                    |
| `rs`               | razón social                                                                      |
| `url`              | slug de la ficha en el portal                                                     |
| `s`                | sector — es una etiqueta de `industria`, la taxonomía propia (§2), no CNAE        |
| `p`                | provincia del domicilio, en mayúsculas y con grafía inconsistente                 |
| `r`                | otra provincia, a veces distinta de `p`. **Hipótesis:** la del registro mercantil |
| `l` / `lb`         | logo 80×30 y logo grande. `null` si no hay                                        |
| `ea`               | 0 o 1. **Hipótesis:** «es actual» — marca la razón social vigente                 |
| `pts`              | puntuación de relevancia; la lista viene ordenada de mayor a menor                |
| `dir`, `loc`, `cp` | dirección, localidad y código postal                                              |

### Un mismo NIF sale varias veces

No es cosa de la muestra: medido contra el API en vivo, **`q=merca` devuelve 25
resultados con solo 20 NIF distintos**, y 15 llevan `ea: 1`. `A86868114` sale dos
veces y `A83246314` cuatro, siempre con el mismo `nifn` y el mismo `url` pero
distinta `rs`: son denominaciones históricas.

**`buscar_empresa` tiene que deduplicar por NIF y quedarse con la de `ea: 1`**, o
el usuario verá cuatro veces la misma empresa. Las demás sirven como sinónimos de
búsqueda («¿te refieres a la antes llamada …?»), no como resultados.

Cuidado con dos cosas más:

- **`p` no está normalizada**: conviven `VALENCIA/VALÈNCIA`, `LA CORUÑA`,
  `MALAGA`, `Madrid`. No es el mismo vocabulario que `Provincias` del buscador de
  listados (`Comunidad|Provincia`). Son dos sistemas geográficos distintos y hay
  que mapear entre ellos.
- **`ea: 1` no implica empresa activa.** Es sobre el nombre, no sobre el estado
  mercantil. No usarlo para decir que una empresa opera.

Mercadona (`A46103834`), el NIF que cita el flujo A del guion, está aquí.

---

## 5 bis. La caché del resumen

`GET /buscador/resumen` **tarda ~26 s**, medido cuatro veces en dos días:
25,7 · 25,8 · 26,4 · 25,7. No es un pico, es lo que cuesta.

Y sus datos **cambian una vez al día**, cuando Infonif incorpora o da de baja
empresas. Confirmado por el cliente y comprobado: dos descargas separadas 2,5
horas salieron **idénticas byte a byte** (`sha256` de los 786 KB: `a7a2353…`).

Con esa cadencia, una caché con caducidad dura sería un error sutil: cada vez que
venciera, el usuario que llegara primero pagaría 26 segundos. Así que la caché
**sirve lo viejo mientras se refresca**:

| Situación                       | Qué hace                             | Medido     |
| ------------------------------- | ------------------------------------ | ---------- |
| En memoria del proceso          | responde                             | **0 ms**   |
| En Redis, fresco                | responde                             | **129 ms** |
| En Redis, **caducado (2 días)** | responde igual y refresca por detrás | **89 ms**  |
| No hay nada en ningún sitio     | única vez que se espera              | 25.718 ms  |

El último caso solo puede pasar en un arranque con Redis vacío, y aun así hay
precarga: el servicio acepta peticiones mientras el resumen baja.

Detalles que importan:

- **Cerrojo en Redis** (`SET … NX EX 180`) para que, con varios nodos, solo uno
  cargue con los 26 segundos.
- La caducidad de la clave en Redis (7 días) es una red de seguridad, no el TTL.
  Quien decide si refrescar es el `generadoEn` guardado con los datos. Si Infonif
  estuviera caído dos días, preferimos servir un vocabulario viejo a no poder
  traducir ni una provincia.
- `/salud/dependencias` publica `cacheResumen` con la antigüedad y si está
  refrescando, para poder verlo sin entrar en Redis.

Servir un vocabulario de ayer no tiene coste real: son nombres de provincia,
códigos CNAE y conteos de faceta, que no facturan nada. **El precio sale de
`/buscador/filtrar`, que siempre va en vivo.**

---

## 6. Qué cambia esto respecto a lo escrito

Ninguna decisión de `docs/ADR.md` se toca sin hablarlo.

| Dónde                      | Qué                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONTRATOS §4               | **Cambia el destino del compilador**: no emite DSL de Elasticsearch, emite la petición de `POST /buscador/filtrar`. `datos/elastic/` pasa a ser `datos/bbdd/`. |
| CONTRATOS §4               | Aparece una **segunda llamada**: `autocomplete/listar` para localizar empresa por nombre.                                                                      |
| CONTRATOS §3               | `FiltroSegmento` puede seguir con números libres; compila a `empleados:min\|max`, `ahnos:min\|max`, `cnae\|NNNN`.                                              |
| `datos/precios.ts`         | Desbloqueado. Fórmula en §4, IVA 21 %, sin mínimo, pago en euros o créditos.                                                                                   |
| `datos/geo/provincias.ts`  | Canónico = ruta `Comunidad\|Provincia` del INE. Y hay que resolver el duplicado de Tenerife.                                                                   |
| `datos/fixtures/skus.json` | Corregido: fuera tramos y mínimo inventados.                                                                                                                   |
| `packages/semantica`       | Corpus CNAE resuelto (627 clases). Resolver también a `icif\|<etiqueta>`.                                                                                      |
| CONTRATOS §5               | Puente de sesión validado.                                                                                                                                     |
| ADR-003                    | Dice «Elasticsearch se usa tal cual está». Sigue siendo cierto, pero **nosotros no lo tocamos**: hablamos con dos APIs que lo tienen detrás. Merece una nota.  |

## 7. Endpoints que usa Nia

Todo cuelga de `INFONIF_API_URL` (`https://bbdd-api.infonif.es/api`) con la
cabecera `apikey`. Verificados en vivo el 08/08/2026.

| Uso en Nia                                 | Llamada                                | Latencia |
| ------------------------------------------ | -------------------------------------- | -------- |
| `buscar_empresa`                           | `GET /buscador/autocomplete/listar?q=` | ~0,7 s   |
| `construir_segmento` (conteo y cotización) | `POST /buscador/filtrar?resumen=false` | ~1,1 s   |
| Vocabulario de filtros y facetas           | `GET /buscador/resumen`                | ~26 s    |
| Derechos de listados                       | `GET /buscador/planBBDD?idusuario=`    | —        |

`/buscador/resumen` a 26 s **no se llama por petición del usuario**: se carga al
arrancar y se refresca en segundo plano contra Redis. Un `status` de 26 segundos
no lo aguanta nadie.

Sobre la apikey: es la misma que va incrustada en el bundle público del buscador
actual (`utils.js:1494`), así que **no es un secreto y no controla acceso**. Vive
en `INFONIF_API_KEY` para poder rotarla sin tocar código, y en los logs va
redactada como el resto.

## 8. Lo que sigue pendiente

Resuelto: modelo de precio, mínimo de registros, desfase de ejercicios, el
segmento `0|1|5`, el papel de `filtros`, qué hay detrás del buscador, y el acceso
—`bbdd-api.infonif.es` es alcanzable desde internet con apikey—. No hay Swagger:
este documento es la especificación.

Queda, y ninguna bloquea la Fase 1:

1. **Confirmar `ea` y `r`** en la respuesta de búsqueda. `ea` decide qué empresa
   ve el usuario cuando hay denominaciones históricas, así que conviene estar
   seguros de que significa «denominación vigente».
2. **Créditos**: cuánto vale un crédito y cómo se descuenta. `planBBDD` habla de
   `numRegistrosMensuales`, que parece otra cosa.
3. **El duplicado `Sta. Cruz De Tenerife`** (8 empresas): ¿lo corrigen o
   convivimos?
4. **`tipo_cuentas` (~265.000) vs `cuentas_disponibles` de 2024 (1.128.190)**:
   cuentan cosas distintas y no sabemos cuáles.
5. **Precios de informes y packs** (RAI, Comercial, Riesgo, Cuentas Anuales): otra
   línea de producto, sin confirmar. Solo hace falta para la Fase 5.
