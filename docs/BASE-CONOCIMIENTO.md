# Base de conocimiento sobre las cuentas y los informes

Cómo convertir los documentos que Infonif compra —cuentas anuales depositadas,
informes de auditoría, informes propios— en algo que Infonif.IA pueda consultar
para hacer análisis, sin que el modelo se invente nada y sin que nadie vea lo
que no ha pagado.

Es una propuesta de diseño, no un plan cerrado. Está escrita **sin haber visto
los documentos**: al final hay una lista concreta de lo que necesito para
ajustar la parte que más depende de ellos, que es el troceado.

---

## 1. Qué hay que convertir, y qué no

Conviene empezar por lo que **no** hace falta meter en una base de conocimiento,
porque es la mitad del trabajo que se ahorra.

Las **cifras** ya están estructuradas. `consultar_balance` devuelve las 55
partidas del balance y la cuenta de resultados por ejercicio, con su unidad, a
través del API. Un balance no es un documento que haya que «entender»: es una
tabla, y ya se consulta como tabla. Vectorizar un balance sería convertir un dato
exacto en una aproximación.

Lo que hoy no se puede consultar de ninguna forma es **el texto que acompaña a
las cifras**:

| Documento | Lo que contiene | Por qué importa para el análisis |
|---|---|---|
| **Memoria** de las cuentas anuales | Actividad, bases de presentación, políticas contables, deterioros, provisiones, operaciones vinculadas, hechos posteriores, avales | Es donde se explica *por qué* las cifras son las que son. Un resultado negativo por un deterioro extraordinario y uno por caída de ventas son la misma cifra y dos historias distintas |
| **Informe de auditoría** | Opinión (favorable, con salvedades, desfavorable, denegada), párrafos de énfasis, incertidumbre sobre continuidad | Una salvedad o una duda sobre la continuidad cambia la lectura de todo lo demás, y no aparece en ninguna partida |
| **Informe de gestión** | Evolución del negocio, riesgos, perspectivas, I+D, plantilla | Contexto cualitativo que la empresa escribe de sí misma |
| **Informes propios** de Infonif (Comercial, Riesgo) | Síntesis, vinculaciones, scoring | Producto ya elaborado; ver §2 sobre lo que el agente puede hacer con él |

La base de conocimiento es para **esto**. Su valor es que, cuando alguien
pregunte «¿por qué cayó el resultado en 2023?», el agente pueda responder «la
memoria lo atribuye a un deterioro de 1,2 millones en la participada X (nota
9)» en vez de «el resultado cayó de A a B».

---

## 2. Reglas que gobiernan el diseño

Son las mismas que ya gobiernan el agente, aplicadas a documentos. No son
recomendaciones: si el diseño no las cumple, no vale.

**El derecho se comprueba antes de que el pasaje llegue al modelo.** Las
cuentas anuales son un producto de pago. Que estén vectorizadas no cambia eso:
la búsqueda **filtra por lo que el usuario ha comprado** antes de buscar por
significado, y un pasaje de una empresa no contratada no entra nunca al contexto.
No es una instrucción al modelo, es un filtro en la consulta.

**Cada respuesta cita su fuente.** Empresa, ejercicio, documento, nota y página.
Un pasaje sin cita no se devuelve. Es la regla «cero cifras sin fuente» llevada
al texto, y además es lo que permite al usuario ir al PDF a comprobarlo.

**Se busca dentro de una empresa, no en todas.** El caso de uso es analizar una
empresa concreta. Buscar «deterioro de fondo de comercio» en toda la base
devolvería la memoria de otra empresa parecida, que es peor que no devolver
nada. El NIF y el ejercicio van siempre como filtro duro, nunca como parte de la
pregunta.

**Los informes de riesgo se entregan, no se interpretan.** Si el usuario ha
comprado un Informe de Riesgo, el agente puede citar lo que dice — es el producto.
Lo que sigue sin poder hacer es producir una valoración propia a partir de la
memoria. La línea es la de siempre: el informe opina; el agente lo transmite.

---

## 3. Arquitectura

Dos mitades que no se tocan: **ingesta** (fuera de línea, por lotes) y
**consulta** (en línea, desde el agente).

```
INGESTA (por lotes, cuando llega un documento)
═══════════════════════════════════════════════════════════════════════

  \\SNOW\CUENTASRM\...          ┌──────────────┐
  \\192.168.1.202\Escaneada\    │  detector    │   ¿tiene capa de texto?
  ─────────────────────────────►│  de tipo     ├──────┬──────────────┐
                                └──────────────┘      │ sí           │ no (escaneado)
                                                      ▼              ▼
                                              ┌───────────┐   ┌───────────┐
                                              │ extracción│   │    OCR    │
                                              │ de texto  │   │           │
                                              └─────┬─────┘   └─────┬─────┘
                                                    └───────┬───────┘
                                                            ▼
                                                  ┌──────────────────┐
                                                  │  segmentación    │  por sección de la
                                                  │  por estructura  │  memoria, no por
                                                  └────────┬─────────┘  tamaño fijo
                                                           ▼
                                                  ┌──────────────────┐
                                                  │  metadatos       │  nif, ejercicio, tipo,
                                                  │  + embeddings    │  nota, página, consolidado
                                                  └────────┬─────────┘
                                                           ▼
                                        ┌──────────────────────────────────┐
                                        │  almacén de pasajes              │
                                        │  vector + texto + metadatos      │
                                        └──────────────────────────────────┘

CONSULTA (en línea, un turno del agente)
═══════════════════════════════════════════════════════════════════════

  usuario ──► Infonif.IA ──► herramienta consultar_documentos(nif, ejercicio, pregunta)
                                   │
                                   ├─ 1. ¿tiene derecho a ESAS cuentas?  ── no ──► requiereCompra
                                   │
                                   ├─ 2. filtro duro: nif + ejercicio + documentos comprados
                                   │
                                   ├─ 3. búsqueda híbrida: léxica + semántica, sobre el filtro
                                   │
                                   └─ 4. pasajes con cita ──► al modelo ──► respuesta citada
```

### Los componentes, uno a uno

**Detector de tipo.** Los PDF llegan de dos sitios muy distintos: `CUENTASRM`
son depósitos recientes con capa de texto, y `Documentacion Escaneada Librados`
son escaneos. Un escaneo no tiene texto que extraer: hay que reconocerlo. Se
detecta al vuelo mirando si el PDF tiene texto, y solo los escaneados pasan por
OCR. Es la decisión que más pesa en el coste (§5).

**Extracción y OCR.** Para los digitales, extracción directa: es rápida, exacta
y gratis. Para los escaneados hay que decidir entre OCR propio (Tesseract, gratis
y mediocre con tablas) y OCR de servicio (Textract, de pago y bueno con formularios).
Para el texto corrido de una memoria, Tesseract llega; para las tablas del
balance escaneado, no — pero esas tablas **ya las tenemos por API**, así que no
hacen falta. Esto abarata mucho: el OCR solo tiene que sacar prosa.

**Segmentación por estructura.** Aquí está la diferencia entre una base que
sirve y una que no. La memoria de unas cuentas anuales viene numerada: «1.
Actividad de la empresa», «2. Bases de presentación», «4. Normas de registro y
valoración», «9. Inversiones financieras»… Trocear por esas notas —y no cada N
caracteres— hace que cada pasaje sea una unidad con sentido, que la cita sea
exacta («nota 9») y que una pregunta sobre deterioros caiga en la nota de
deterioros. Esto es lo que necesito ver en documentos reales para ajustarlo
(§7).

**Metadatos.** Cada pasaje lleva: NIF, razón social, ejercicio, tipo de documento
(memoria / auditoría / gestión / informe), consolidado o individual, número y
título de nota, página del PDF, ruta del fichero origen. Sin esto no hay filtro
por derechos ni cita posible; con esto, todo lo demás es búsqueda.

**Embeddings.** Infonif.IA ya usa `multilingual-e5-small` en local (384
dimensiones, ONNX) para el CNAE. Sirve para arrancar y mantiene una sola pieza de
tecnología. Para texto largo y técnico un modelo mayor (`e5-large` o `bge-m3`,
los dos multilingües y con buen castellano) recupera mejor; se puede cambiar
después sin tocar nada más, porque el almacén guarda el texto y se reembebe.

**Almacén.** Necesita tres cosas a la vez: vectores, búsqueda léxica y filtros
por metadatos. **PostgreSQL con pgvector** las da las tres en una sola pieza,
corre en sus servidores, y es lo que recomiendo. Las alternativas se discuten en
§4.

**Búsqueda híbrida.** Semántica sola falla con los términos técnicos: «deterioro»,
«provisión», «aval», «vinculada» son palabras exactas que un buscador léxico
clava y un vector aproxima. Se hacen las dos y se combinan. En pgvector es una
consulta con `tsvector` (diccionario español) y una de distancia, fusionadas.

**La herramienta del agente.** Una nueva, `consultar_documentos(nif, ejercicio,
pregunta)`, con el mismo patrón que las demás: comprueba el derecho, filtra,
busca, y devuelve pasajes **con su cita** en `paraElModelo`. La cita no es
opcional en la estructura: un pasaje es `{texto, documento, nota, pagina}` o no
es nada. El prompt le dice al modelo que responda desde los pasajes y cite, y la
regla de fondo la sostiene el código: si no hay pasajes, no hay respuesta.

---

## 4. Dónde corre cada cosa: servidores propios o AWS

La pregunta no es «todo aquí o todo allí». Es **qué merece salir**.

### Opción A — todo en servidores propios

| Pieza | Con qué |
|---|---|
| Ficheros | Donde ya están (los recursos compartidos actuales) |
| Extracción | `pdftotext` / Python, en un proceso por lotes |
| OCR | Tesseract con modelo español |
| Embeddings | `e5` por ONNX, como ya hace el agente |
| Almacén | PostgreSQL + pgvector, una máquina |
| Consulta | El propio API de Infonif.IA |

**Coste directo:** cero en servicios. **Coste real:** una máquina más que
administrar y la calidad del OCR de Tesseract, que con escaneos de mala calidad
se nota. Funciona bien si la mayoría de los documentos son digitales.

### Opción B — híbrida: lo caro de operar, en AWS

| Pieza | Con qué | Por qué fuera |
|---|---|---|
| OCR | **Amazon Textract** | Es lo único que de verdad es mejor en la nube: reconoce escaneos malos y no hay que mantenerlo |
| Embeddings | Bedrock (Titan Embeddings v2 o Cohere multilingüe) | Opcional: quita carga de CPU a los servidores propios |
| Almacén | PostgreSQL + pgvector **en propio** | El texto de las cuentas compradas se queda en casa |
| Ficheros | En propio, con **copia en S3** solo para lo que Textract procese | Textract lee de S3 |

**Coste directo, en orden de magnitud** (precios públicos, a verificar en su
región y contrato; no son una cotización):

- Textract, solo texto: ~1,5 $ por mil páginas. **Se paga una vez** por documento,
  no por consulta. Diez mil escaneos de 40 páginas ≈ 600 $, una sola vez.
- Bedrock Titan Embeddings v2: ~0,02 $ por millón de tokens. Una memoria de 40
  páginas son ~30.000 tokens. Diez mil documentos ≈ 6 $. Irrelevante.
- S3: ~0,023 $ por GB y mes. Diez mil PDF de 2 MB ≈ 20 GB ≈ 0,50 $ al mes.

**La consulta no cuesta nada en AWS**: se resuelve contra el pgvector propio.
Solo la ingesta toca la nube, y solo la de escaneados. Por eso esta opción es
barata: el gasto está en el paso que se hace una vez, no en el que se hace mil
veces al día.

### Lo que NO recomiendo

- **OpenSearch Serverless** como almacén: su mínimo mensual (cientos de dólares)
  no se justifica para este volumen.
- **Un vector store gestionado externo** (Pinecone y similares): meter el texto
  de cuentas anuales compradas en un tercero es una conversación con legal que
  no hace falta tener.
- **Elasticsearch, el que ya tienen**: en versión OSS no lleva búsqueda vectorial
  utilizable. Sí serviría para la parte léxica si se quisiera reutilizar, pero
  entonces son dos sistemas donde pgvector es uno.
- **SQL Server como vector store**: la versión 2025 lo incorpora, pero no
  sabemos qué versión tienen (es una de las incógnitas abiertas del proyecto) y
  probablemente no sea esa.

### Mi recomendación

**Opción B, empezando por la A.** Es decir: montar el pipeline entero en propio
con Tesseract, medir qué porcentaje de escaneados sale mal, y **solo entonces**
decidir si Textract merece la pena. Si el 90 % de los documentos son digitales,
puede que no haga falta nunca. Si la mitad son escaneos de 2008, sí.

Lo que no cambia entre las dos: el almacén y la consulta se quedan en casa.

---

## 4b. Capacidad: qué máquina hace falta

Poca. Lo que hay que dimensionar es la memoria, y hay un dato real del proyecto:
el proceso de embeddings **murió con 2 GB** en la Fedora (`exit 137`, el OOM
killer) y necesitó ~4 GB solo para cargar el modelo y vectorizar 627 documentos.
La ingesta hace lo mismo con más documentos, y comparte máquina con PostgreSQL,
Redis y el API. **8 GB, no menos.**

### PoC en AWS

| | |
|---|---|
| Instancia | `t3.large` — 2 vCPU, 8 GB |
| Disco | 50 GB gp3. Los PDF no van aquí |
| Coste | ~65–75 $/mes bajo demanda en Irlanda. Verificar en la calculadora |
| Qué corre | PostgreSQL + pgvector, Redis, el API, la ingesta. Todo en una |

Tamaño de la base, para situarlo: 10.000 documentos × 40 pasajes × 384
dimensiones ≈ 600 MB de vectores, ~1,5 GB con índice. Cabe de sobra.

### Dónde aprieta: el lote histórico

`t3` es una familia con ráfagas: gasta crédito de CPU y luego se frena. Perfecta
para servir consultas, mala para vectorizar 10.000 documentos seguidos. La
solución es pagar el pico una vez: parar la instancia, redimensionarla a
`c7i.xlarge` (4 vCPU, sin ráfagas, ~0,18 $/h), correr el lote —horas, no días— y
volver a `t3.large`. EC2 lo permite sin migrar nada.

### Lo que no hace falta

- **GPU.** `e5-small` en CPU vectoriza cientos de pasajes por minuto. Las
  instancias con GPU (desde ~0,50 $/h) solo se justifican con un modelo grande
  sobre cientos de miles de documentos.
- **RDS.** Postgres gestionado (`db.t4g.small`, ~25 $/mes) tiene sentido cuando
  se quieran copias automáticas. Para el PoC, Postgres en la EC2. Se migra
  después sin tocar código.

### Antes de encender nada: dónde está el API

El API corre hoy en la Fedora del cliente, y `consultar_documentos` tiene que
llegar al Postgres. Si la base va en AWS, o se mueve el API a la misma EC2
durante el PoC —lo más simple— o hay que abrir un camino entre redes, que ya
sabemos lo que cuesta en la suya.

Y la alternativa que conviene no descartar: **hacer el PoC en la propia Fedora**.
Subirla a 8 GB e instalar Postgres. Sin AWS, sin red que cruzar, sin coste. AWS
empieza a tener sentido en la fase 3, cuando entran Textract y la ingesta
continua.

---

## 4c. Con dos máquinas en propio

Se separan por **perfil de carga**, no por componente: una sirve, otra ingiere.

| | A — Consulta | B — Ingesta |
|---|---|---|
| Qué corre | API, Redis, PostgreSQL + pgvector | OCR, extracción, troceado, embeddings |
| Perfil | Poca CPU, siempre encendida, sensible a latencia | Mucha CPU, a ráfagas, puede apagarse |
| Tamaño | 2–4 vCPU, 8 GB, 100 GB SSD | 4–8 vCPU, 8–16 GB, disco temporal |
| Es… | La Fedora actual ampliada a 8 GB | Una VM nueva, o una que solo se enciende para lotes |

La ingesta es lo que consume a lo bruto, y ya tuvo un OOM en este proyecto. En
la misma máquina que el API, cada lote ralentiza al agente y un fallo de memoria
tumba las conversaciones. Separadas, B puede morir y A ni se entera. B solo
escribe en el Postgres de A.

Postgres no necesita máquina propia: a esta escala convive con el API. Y las dos
en el mismo segmento de red — B tiene que llegar al 5432 de A, y ya sabemos lo
que cuesta cruzar segmentos en esa red.

## 4d. SaaS que ayuda, y SaaS que no

Primero, qué datos pueden salir. Las cuentas depositadas son documentos públicos
del Registro Mercantil: Infonif pagó el acceso, pero no son datos de clientes.
Mandarlas a un OCR externo es de bajo riesgo. Los informes propios —Comercial,
Riesgo— llevan el criterio y el scoring de Infonif: **esos no salen**.

**OCR — sí, y es donde más aporta.**

| Servicio | Qué da | Orden de magnitud |
|---|---|---|
| Azure Document Intelligence (*layout*) | Texto **y estructura**: títulos, secciones, tablas | ~10 $ / 1.000 páginas |
| Amazon Textract | Texto limpio de escaneos malos | ~1,5 $ / 1.000 páginas |
| Mistral OCR | Texto con estructura en Markdown, muy barato | ~1 $ / 1.000 páginas |

La diferencia que importa: Textract y Mistral sacan el texto; Azure Document
Intelligence saca además **qué es un título de nota y qué es su cuerpo**. Es lo
que hace falta para trocear una memoria escaneada por secciones, y no se deduce
de otra forma. Con muchos escaneados malos, es el que encaja. Con pocos,
Tesseract en propio.

**Embeddings — opcional, ganancia pequeña.** Cohere, Voyage, Bedrock. Solo salen
fragmentos de texto. Mejoran algo frente a `e5-small`, pero `e5-large` en propio
recupera parecido sin sacar nada.

**Almacén vectorial — no.** Pinecone, Qdrant Cloud, Weaviate. pgvector hace lo
mismo a este volumen, gratis y en casa.

**Plataformas RAG completas — con cuidado.** Bedrock Knowledge Bases, Azure AI
Search, Vectara. Ahorran construir el pipeline, pero trocean por tamaño o por
«semántica» genérica, y todo este documento explica por qué aquí hay que
trocear por notas de la memoria. Bedrock admite una función propia de troceado;
Azure AI Search puede apoyarse en Document Intelligence para hacerlo por
estructura. Viables, pero hay que verificar esa capacidad concreta antes de
elegir: sin ella, la plataforma entera resuelve el problema equivocado.

**Recomendación:** dos máquinas en propio, Tesseract en B, y una sola cuenta de
SaaS —la de OCR— activada solo cuando la medición de la fase 3 diga que Tesseract
no llega. Si llega, no se contrata nada.

---

## 5. Lo que hace que esto salga mal

Por experiencia con este tipo de sistema, los fallos vienen de aquí y no de la
tecnología:

**Trocear por tamaño en vez de por estructura.** Un pasaje que corta la nota 9 a
la mitad y pega el final con el principio de la 10 responde mal a todo. Es el
error más común y el más silencioso: el sistema «funciona» y las respuestas son
vagas.

**Buscar sin filtrar.** Sin el NIF como filtro duro, la pregunta «¿tiene avales?»
devuelve los avales de la empresa que mejor encaje semánticamente, que puede ser
otra. El modelo no lo nota. El usuario tampoco, hasta que se fía.

**OCR sin revisión.** Un escaneo torcido produce texto con errores que el
embedding digiere sin quejarse. Hay que medir la calidad de salida (proporción
de palabras reconocidas en diccionario, por ejemplo) y marcar los documentos que
salen mal en vez de indexarlos como si nada.

**Confiar en el modelo para no mezclar ejercicios.** Si le llegan pasajes de
2022 y 2023 en la misma respuesta sin etiquetar, mezclará cifras. El ejercicio
va en cada pasaje y el prompt exige citarlo. Es la regla 4 otra vez.

**Reembeber cada vez que cambia algo.** Guardar solo vectores obliga a
reprocesar los PDF ante cualquier cambio de modelo. Se guarda el texto troceado
con sus metadatos; los vectores son derivados y se regeneran.

---

## 6. Cómo se haría, por fases

Cada fase deja algo utilizable. Ninguna depende de tener todo lo demás.

**Fase 1 — Un lote pequeño, a mano.** Cien documentos digitales de empresas
conocidas. Extracción, troceado por notas, pgvector en una máquina de pruebas.
Objetivo: **ver si el troceado por estructura funciona con SUS documentos**, y
ajustarlo. Sin OCR, sin AWS, sin agente. Una semana.

**Fase 2 — La herramienta del agente.** `consultar_documentos` con derechos,
filtro y citas. Se prueba con el lote de la fase 1 contra preguntas reales:
«¿por qué cayó el resultado?», «¿tiene salvedades el auditor?», «¿qué dice de la
continuidad?». Aquí se ve si el valor es el que se espera. Una o dos semanas.

**Fase 3 — Ingesta continua.** El proceso por lotes que vigila las carpetas
compartidas y procesa lo nuevo. Detector de tipo, Tesseract para escaneados,
medición de calidad del OCR. Ahora sí se conoce el porcentaje de escaneados y
su calidad, que es el dato que decide la fase 4.

**Fase 4 — Textract, si hace falta.** Solo para los escaneados que Tesseract
no resuelve. Con la cifra real de páginas ya se puede calcular el coste exacto.

**Fase 5 — Histórico.** Procesar el fondo documental completo. Es lo que más
tarda y lo que menos decisiones tiene: llegados aquí, es dejar correr el lote.

---

## 7. Lo que necesito para afinar esto

El diseño de arriba es genérico donde no puede ser otra cosa. Para que deje de
serlo, me harían falta:

1. **Tres o cuatro PDF de cuentas anuales digitales** de empresas distintas,
   con memoria e informe de auditoría. Es para ver cómo vienen numeradas las
   notas y si el troceado por estructura se puede hacer con reglas o necesita
   algo más.
2. **Dos o tres escaneados** de la carpeta de documentación escaneada, a poder
   ser de distinta calidad. Es para medir qué saca Tesseract y decidir sobre
   Textract con datos y no con suposiciones.
3. **Un informe Comercial y uno de Riesgo** generados por Infonif, para ver qué
   estructura tienen y qué parte tiene sentido indexar.
4. **Volúmenes:** cuántos documentos hay hoy, cuántos llegan al mes, y qué
   proporción aproximada son escaneados. Es lo que convierte la tabla de costes
   de §4 en una cifra.

Con eso, la fase 1 se puede empezar directamente.
