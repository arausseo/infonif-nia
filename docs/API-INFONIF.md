# Buscador de Infonif — contrato observado

Lo que sabemos del buscador real de `infonif.economia3.com/bases-de-datos/`,
a partir de dos endpoints públicos y de un par petición/respuesta de ejemplo
aportado por el cliente (08/08/2026).

**Distingue lo verificado de lo supuesto.** Lo que aquí pone «hipótesis» no está
confirmado y no debe convertirse en código que cobre dinero sin confirmarlo.

Copias congeladas en `packages/api/src/datos/fixtures/infonif/`:

| Fichero                  | Origen                                                    |
| ------------------------ | --------------------------------------------------------- |
| `campos-comprables.json` | `GET /bases-de-datos/herramienta/fields.json?v5.3`        |
| `buscador-data.json`     | `GET /bases-de-datos/herramienta/buscador-data.json?v1.2` |
| `ejemplo-peticion.json`  | Aportado por el cliente                                   |

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

### Conflicto con lo que dice CLAUDE.md

CLAUDE.md registra «listados 0,30/0,15/0,10 € por registro» como precios
públicos observados, y sobre eso construí los tramos de `skus.json` en la Fase 0.
Esos dos modelos no encajan:

- La suma de una selección típica de contacto (CIF + razón social + dirección +
  email) da **0,11 €/registro**, no 0,30 €.
- Llevárselo todo da 1,42 €/registro, muy por encima de 0,30 €.

Tres lecturas posibles, y **no tenemos con qué elegir**:

1. 0,30/0,15/0,10 son **tramos por volumen** que se aplican encima de la suma de
   campos (multiplicador o mínimo por registro).
2. Son un **producto distinto** (listado cerrado con campos fijos) que convive
   con la herramienta de campos a la carta.
3. Están **obsoletos** y el modelo vigente es solo el de `fields.json`.

**Esto hay que preguntarlo antes de la Fase 5.** La regla no negociable 7 dice
que cotizar mal es facturar mal; ahora mismo `datos/precios.ts` no se puede
escribir con fundamento.

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

`buscador-data.json` (1,6 MB) es el catálogo de facetas **con sus conteos**.
Claves de nivel superior: `cantidad`, `total_auditores`, `antiguedad`,
`empleados`, `provincia`, `provincia_localidad`, `auditor`, `cnae`, `industria`,
`cargos`, `cuentas_disponibles`, `tipo_cuentas`.

Todo nodo tiene la misma forma: `{ id, label, data, children? }`, donde `data`
es el número de empresas.

**El `id` es el valor literal que espera el filtro.** No inventamos códigos:
hablamos su vocabulario.

### Universo

**3.310.964 empresas.**

### Geografía — 3 niveles, `id` con tuberías

```
"Andalucía"                    529.717
"Andalucía|Almería"             49.565
"Andalucía|Almería|Abla"            26
```

19 comunidades · **52 provincias** · 7.160 localidades. El filtro
`Provincias: ["Aragón|Teruel"]` usa la ruta completa, no el nombre suelto.

**Los nombres de provincia son los del INE, no los castellanos cortos.** De las
52, diez no coinciden con la lista de `datos/geo/provincias.ts`:

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
"A"      Agricultura, ganadería, silvicultura y pesca    52.008
"01"     Agricultura, ganadería, caza y servicios…
"011"    Cultivos no perennes                             2.952
"0111"   Cultivo de cereales (excepto arroz)…               838
```

21 secciones · 88 divisiones · 271 grupos · **627 clases de 4 dígitos**.

Coincide con el «~630 clases» de ADR-004. **Este árbol es el corpus de la Fase 2**:
son sus etiquetas, con sus conteos, y sale gratis. Mejor que un CNAE-2009 externo.

Logística, para calibrar el demo:

| CNAE | Descripción                            | Empresas |
| ---- | -------------------------------------- | -------: |
| 4941 | Transporte de mercancías por carretera |   18.485 |
| 5210 | Depósito y almacenamiento              |    2.040 |
| 5229 | Otras actividades anexas al transporte |    1.461 |
| 5224 | Manipulación de mercancías             |      281 |
| 4942 | Servicios de mudanza                   |      220 |

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

47 valores («Otros» 1.144.145, «Construcción y Desarrollo» 180.848, «Automotor»
60.634…). Es una taxonomía **distinta** del CNAE, y `IndustriaDescripcion` es un
campo comprable. La capa semántica tendrá que decidir a cuál de las dos resuelve
—o a las dos.

### La cobertura de datos es el dato más importante de todos

```
empleados   → incluir_null: 3.125.697 de 3.310.964
antiguedad  → incluir_null: 1.252.094
cuentas     → tipo_cuentas: 181.040 individuales + 35 consolidadas + 4.927 ambas
```

Solo del orden de **185.000 empresas (5,6 %) tienen cuentas depositadas**, y solo
~185.000 tienen dato de empleados. Un segmento que cruce empleados y facturación
no se mueve sobre 3,3 millones: se mueve sobre 185.000.

Hay que decirlo en la demo antes de que lo pregunten.

`cuentas_disponibles` topa en 2022 (y con solo 24 empresas; 2021 tiene 146.105),
mientras que la respuesta de ejemplo sí trae 2023 y 2024. O el fichero está
cacheado (`?v1.2`) o son dos fuentes distintas. **Pendiente de aclarar**, porque
el flujo A del demo pregunta por 2024.

---

## 3. Petición y respuesta de conteo

Petición: `ejemplo-peticion.json`. Todas las claves van siempre, con array vacío
si no se filtra. Los valores son los `id` de `buscador-data.json`.

`filtros` es un array de estados acumulativos —primero `{Provincias}`, luego
`{Provincias, antiguedad}`—. **Confirmado** en `utils.js:172` (`beforeOrderFilters`):
recorre los filtros aplicados en orden, va acumulando en un objeto y empuja una
instantánea en cada paso. Es el embudo, y es lo que permite pintar cuántas
empresas quedan tras cada criterio.

Es **obligatorio**: `search.js:286` no llama al API si `filtros` viene vacío.

La respuesta es una lista plana de `{ id, data }` con dos familias de `id`:

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
proporción de registros facturables. Nia tiene que explicar ese intercambio, no
solo aplicarlo.

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

### Plan de registros

`planBBDD` trae `numRegistrosMensuales` y `numRegistrosConsumidos`. Con plan, la
descarga consume saldo y no pasa por el TPV (`descargaPorPaquete`,
`VisualizarResultados.vue:1845`); sin plan, se paga. La descarga marca
`TipoDescarga: 2` con plan y `1` sin plan.

Es el mismo modelo de derechos de ADR-008: `derechos.ts` resuelve plan o saldo, y
la herramienta decide antes de devolver el dato.

---

## 5. Qué cambia esto respecto a lo escrito

Ninguna decisión de `docs/ADR.md` se toca sin hablarlo.

| Dónde                      | Qué                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONTRATOS §4               | **Cambia el destino del compilador**: no emite DSL de Elasticsearch, emite la petición de `POST /buscador/filtrar`. `datos/elastic/` pasa a ser `datos/bbdd/`, o convive si seguimos usando ES para otra cosa. |
| CONTRATOS §3               | `FiltroSegmento` puede seguir con números libres; compila a `empleados:min\|max`, `ahnos:min\|max`, `cnae\|NNNN`.                                                                                              |
| `datos/precios.ts`         | La fórmula ya se conoce (§4) salvo el conflicto de los tramos (§1).                                                                                                                                            |
| `datos/geo/provincias.ts`  | Canónico = ruta `Comunidad\|Provincia` con nombres del INE.                                                                                                                                                    |
| `datos/fixtures/skus.json` | Los tramos 0,30/0,15/0,10 siguen sin encajar. Sigue siendo la pregunta abierta.                                                                                                                                |
| `packages/semantica`       | Corpus CNAE resuelto: 627 clases con etiquetas y conteos. Además hay que resolver a `icif\|<etiqueta>` para el sector propio.                                                                                  |
| CONTRATOS §5               | El puente de sesión queda validado: el ASP ya publica sesión por `localStorage`.                                                                                                                               |

## 6. Lo que sigue pendiente de preguntar

Resueltas leyendo el frontend: el segmento `0|1|5`, el papel de `filtros`, y si el
buscador es Elasticsearch o un servicio (es un servicio).

Quedan:

1. **El modelo de precio del listado** — la única que bloquea. ¿Los 0,30/0,15/0,10
   de CLAUDE.md son tramos por volumen encima de la suma de campos, un producto
   distinto, o están obsoletos? La fórmula del frontend no los aplica por ningún
   lado.
2. **Mínimo de registros**: puse 50 en `skus.json` por mi cuenta. No aparece en el
   frontend. ¿Existe?
3. **Ejercicios disponibles**: `buscador-data.json` topa en 2022, la respuesta de
   conteo trae 2024. ¿Fichero cacheado o dos fuentes?
4. **Acceso de Nia al API**: ¿nos dan credenciales propias contra
   `bbdd-api.infonif.es`, o hay que ir con el token del usuario? De esto depende
   si `datos/` puede consultar sin sesión.
5. **Contrato de `POST /buscador/filtrar`**: ¿hay OpenAPI/Swagger? Lo de aquí está
   deducido del cliente, no de una especificación.
