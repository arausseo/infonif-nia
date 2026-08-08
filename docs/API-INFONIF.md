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

### Rangos cerrados, no números libres

```
antiguedad: rango.0 (80 años o más) … rango.5 (reciente constitución) + incluir_null
empleados:  rango.0 (<10) · rango.1 (10-49) · rango.2 (50-249) · rango.3 (≥250) + incluir_null
```

**El `FiltroSegmento` de CONTRATOS §3 no encaja.** Allí `empleados` y
`antiguedadMinAnios` son números libres; aquí son enumeraciones. «Más de 20
empleados» no es expresable: hay que traducirlo a `rango.1`+ (10-49) y avisar de
que el corte real es en 10, o dejarlo fuera del filtro y advertirlo. Es una
decisión de producto, no técnica.

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
`{Provincias, antiguedad}`—. **Hipótesis:** es el embudo, para poder pintar
cuánto queda tras cada criterio. Encaja con lo que Nia necesita para el desglose,
pero no está confirmado.

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

Formato observado: `partida | X | años` y `partida | "ultima" | X | año`, donde
`partida` es la de `campos-comprables.json`.

**El segmento `X` no lo sabemos.** Toma valores `0`, `1` y `5`. No son los ids de
`tipo_cuentas` (1, 2, 100). En el ejemplo, `0` y `1` dan conteos idénticos en
todas las partidas, lo que sugiere que no es un eje de filtrado sino una variante
del mismo dato. **Preguntar.**

Los años vienen **sin ordenar** (`"2019,2022,2023,2024,2018,2020,2021"`): la
cadena es un identificador, no una lista ordenada. Hay que normalizarla antes de
comparar o agrupar.

---

## 4. Qué cambia esto respecto a lo escrito

Ninguna decisión de `docs/ADR.md` se toca sin hablarlo. Lo que sí queda tocado:

| Dónde                      | Qué                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `datos/geo/provincias.ts`  | La forma canónica pasa a ser la del INE con ruta `Comunidad\|Provincia`. Lo nuestro queda como alias.                                                                      |
| `datos/elastic/mapping.ts` | Los supuestos declarados hay que revisarlos contra `$.UltimaCuentaAnual.*` y `$.CnaeInfo.*`.                                                                               |
| `datos/fixtures/skus.json` | Los tramos 0,30/0,15/0,10 quedan en entredicho (§1). No escribir `precios.ts` hasta resolverlo.                                                                            |
| CONTRATOS §3               | `empleados` y `antiguedadMinAnios` son rangos cerrados, no números.                                                                                                        |
| CONTRATOS §4               | Puede que no compilemos a DSL de Elasticsearch, sino a esta petición JSON. Hay que averiguar si este buscador es un servicio propio delante de ES o si es ES directamente. |
| `packages/semantica`       | El corpus CNAE ya lo tenemos: 627 clases con etiquetas y conteos reales.                                                                                                   |

## 5. Lo que hay que preguntar a Infonif

1. **El modelo de precio del listado**: ¿los 0,30/0,15/0,10 son tramos sobre la
   suma de campos, un producto distinto, o están obsoletos?
2. **El segmento `0|1|5`** de los identificadores de partida.
3. **`filtros`**: ¿es el embudo acumulativo? ¿Es obligatorio enviarlo?
4. **¿Este buscador es Elasticsearch directamente o un servicio delante?** De la
   respuesta depende si el compilador de la Fase 1 emite DSL de ES o emite esta
   petición.
5. **Ejercicios disponibles**: `buscador-data.json` topa en 2022, la respuesta
   trae 2024.
6. **Autenticación**: ambos endpoints responden sin credenciales. ¿La petición de
   conteo también, o exige sesión?
