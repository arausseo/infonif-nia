# Decisiones de arquitectura — Nia / Infonif

Formato ADR abreviado. Estado de todas: **aceptada**, agosto 2026.

---

## ADR-001 · Sidecar sobre ASP Classic, sin tocar el legado

**Contexto.** El portal corre sobre ASP Classic + IIS + SQL Server, con años de
CSS y plantillas acumuladas. Modificarlo es caro y arriesgado.

**Decisión.** Patrón _strangler fig_. Servicio nuevo desplegado aparte, embebido
en las páginas existentes con una etiqueta `<script>`. La única modificación al
ASP son ~8 líneas que acuñan un token e inyectan el contexto de página.

**Consecuencias.** El equipo de Infonif no necesita aprender nada nuevo para que
esto funcione. A cambio, el puente de sesión es el punto frágil del sistema y hay
que validarlo temprano.

---

## ADR-002 · Node en un solo servicio para el MVP

**Contexto.** La propuesta original separaba `data-api` en .NET (para que el
equipo del cliente lo heredara) de `agent-api` en Node. El cliente confirmó que
prefiere Node y que dispone de servidores Debian.

**Decisión.** Un solo servicio Node 22 + TypeScript + Fastify, con dos módulos
internos estrictamente separados: `src/datos/` y `src/agente/`.

**Consecuencias.** Se ahorra una semana de trabajo y una frontera de red. La
separación en dos contenedores queda disponible para producción sin refactor,
siempre que se respete la regla de que `datos/` no importa de `agente/`.

---

## ADR-003 · Elasticsearch se usa tal cual está, sin vectores

**Contexto.** El clúster es distribución OSS, versión 6.x o 7.x. Sin
autenticación, sin seguridad a nivel de campo, sin `dense_vector` usable.

**Decisión.** Elasticsearch se usa **solo** para lo que ya hace: filtros `bool`,
`range`, `term`, agregación `terms` y API `_count`. Todo eso existe desde 5.x.
La capa semántica sale del clúster (ver ADR-004).

**Consecuencias.** La versión deja de ser un riesgo. La ocultación de campos de
pago pasa a ser proyección en código dentro de `datos/`. El clúster no debe ser
alcanzable desde el contenedor del agente: solo `datos/` le habla.

**Nota de implementación.** No usar el cliente oficial: desde 7.14 verifica el
producto y rechaza clústeres OSS. Envoltorio propio de ~40 líneas sobre `fetch`.

---

## ADR-004 · Embeddings CNAE precalculados, en memoria

**Contexto.** El usuario dice "empresas de logística"; el filtro exige códigos
CNAE. El modelo alucina códigos con confianza. CNAE-2009 tiene ~630 clases a
cuatro dígitos: demasiado para el prompt de sistema, ideal para recuperación.

**Decisión.** Corpus de ~1.500 documentos (CNAE + casos comerciales curados +
FAQ). Embeddings generados en tiempo de compilación, versionados como artefacto
binario, cargados en memoria al arrancar. Similitud coseno por fuerza bruta.

**Consecuencias.** 1.500 × 768 floats ≈ 4,6 MB, comparación en <2 ms. Cero
infraestructura nueva, cero pregunta de licencia. El corpus es público y estático,
así que generar los vectores con un proveedor externo no plantea residencia de
datos. Solo la consulta del usuario viaja, y se cachea en Redis normalizada.

**Se rechazó:** pgvector, Qdrant, `dense_vector` en el clúster.

---

## ADR-005 · Bucle de herramientas propio, sin framework

**Contexto.** Existen LangGraph, Vercel AI SDK, CopilotKit, Agent SDK.

**Decisión.** SDK de Anthropic directo con bucle propio.

**Justificación.** El producto necesita dos cosas que los frameworks abstraen
justamente: (a) un protocolo SSE a medida con eventos `status` que actualizan en
sitio, y (b) doble canal de salida por herramienta — `paraElModelo` compacto y
`paraLaUI` rico. Ningún framework da lo segundo de fábrica. El bucle son ~150
líneas.

**Consecuencias.** Hay que implementar a mano el freno de vueltas, el manejo de
`tool_use` múltiples en un turno y la caché de prompt.

---

## ADR-006 · Widget en Shadow DOM, sin librería de UI

**Contexto.** El widget se inyecta en páginas ASP con CSS heredado de años,
incluidas páginas de ranking que traen tráfico orgánico.

**Decisión.** React montado en Shadow DOM, con CSS propio. Sin Tailwind, sin
shadcn, sin assistant-ui.

**Justificación.** Radix (base de shadcn y assistant-ui) hace portal a
`document.body`: todo desplegable o diálogo se renderiza fuera del shadow root,
donde los estilos no llegan. Tailwind asume variables CSS en `:root`, que tampoco
cruzan. Y el peso del bundle impacta Core Web Vitals en las páginas de SEO.

**Consecuencias.** ~15 componentes propios. La carcasa de chat es un día de
trabajo; el valor está en la línea de tiempo de progreso y el registro de tarjetas.

---

## ADR-007 · El agente no cobra: genera intentos de compra

**Contexto.** El agente debe permitir comprar informes y listados.

**Decisión.** `crear_intento_compra` es la única herramienta con efecto
secundario. Devuelve una URL de pago y datos para una tarjeta de confirmación.
La interfaz la renderiza como tarjeta con botón, nunca como texto. El usuario
pulsa, la pasarela cobra, el webhook abona créditos.

**Consecuencias.** Resuelve alcance PCI, responsabilidad legal y confianza de una
sola vez. Requiere clave de idempotencia en Redis para evitar cobros duplicados.
La acción de la tarjeta hace POST a la API propia, nunca directo a la pasarela.

---

## ADR-008 · Los derechos se verifican antes del contexto

**Contexto.** El plan Premium tiene límite de 400 consultas mensuales; los bonos
son por unidad y no caducan. Hay datos gratuitos y datos de pago.

**Decisión.** La verificación ocurre **dentro del ejecutor de la herramienta**,
antes de devolver. Si no hay derecho, se devuelve
`{ requiereCompra: true, skuSugerido, motivo }` y el dato nunca entra al contexto
del modelo.

**Justificación.** La alternativa —dar el dato al modelo e instruirle que no lo
revele— filtra por resumen tarde o temprano.

---

## ADR-009 · MCP hacia afuera, REST hacia adentro

**Contexto.** Se planteó si la capa de datos debía hablar MCP.

**Decisión.** No. MCP resuelve descubrimiento dinámico entre partes que no se
coordinaron al construir. `datos/` y `agente/` son el mismo equipo y el mismo
despliegue. Además la granularidad no coincide: una herramienta del agente
consume varios endpoints de datos.

**Consecuencias.** Un servidor MCP **público** queda como oportunidad de fase 2:
permitiría que agentes de terceros consuman datos de Infonif, y el modelo de
precios por unidad ya mapea a consumo medido. Eso sería un servidor distinto, con
OAuth en lugar de secreto compartido.

---

## ADR-010 · Marca: Nia

**Decisión.** Nombre corto derivado de la marca: la N de NIF más IA. Badge BETA
visible. Icono: la N construida con tres barras ascendentes que forman también un
gráfico de crecimiento, con cuatro estados animados (reposo, sugerencia,
analizando, respondiendo).

**Restricción de color.** El acento de IA **no puede ser verde ni rojo**: en
Infonif esos colores ya significan solvente y riesgo. Usar un color que hoy no
cargue significado en la interfaz, reservado exclusivamente para lo que es IA.

**Pendiente.** Verificar marca en OEPM y EUIPO antes de imprimir nada.
