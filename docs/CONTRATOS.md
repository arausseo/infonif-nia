# Contratos técnicos

Referencia de implementación. Todo lo de aquí es contrato: si cambia, se actualiza
este archivo en el mismo commit.

---

## 1. Protocolo SSE

Endpoint: `POST /v1/conversar` → `text/event-stream`

Petición:

```ts
{ conversationId?: string, mensaje: string, contexto?: ContextoPagina }
```

### Eventos

```
event: inicio
data: { "conversationId": "cv_abc123", "turnoId": "t_01" }

event: status
data: { "id": "s1", "texto": "Interpretando los criterios", "estado": "activo" }

event: status
data: { "id": "s1", "estado": "ok", "detalle": "4 actividades CNAE" }

event: texto
data: { "delta": "He encontrado " }

event: tarjeta
data: { "tipo": "segmento", "datos": { ... } }

event: fin
data: { "stopReason": "end_turn", "tokens": { "entrada": 4120, "salida": 380 } }

event: error
data: { "codigo": "HERRAMIENTA_FALLO", "mensaje": "..." }
```

**El `id` de `status` es obligatorio.** El widget actualiza en sitio, no acumula
renglones. Un `status` sin `id` previo crea un paso nuevo; con `id` existente,
lo actualiza.

### Fuentes de los eventos `status`

**A — bucle de herramientas.** El evento `content_block_start` de la API trae el
nombre de la herramienta antes de que lleguen los argumentos. Emitir de inmediato
usando el diccionario `COPY[nombreHerramienta]`. Al cerrar el bloque, parsear los
argumentos acumulados de `input_json_delta` y enriquecer con `detalle`.

**B — subpasos dentro del ejecutor.** El ejecutor recibe `ctx.progreso(texto, opts)`.
Ahí está la riqueza real: `construir_segmento` reporta 5 subpasos.

---

## 2. Registro de herramientas

Fuente única por archivo en `agente/herramientas/`:

```ts
export default definirTool({
  nombre: "construir_segmento",
  descripcion: `...`,          // ESTO ES PROMPT, no documentación
  esquema: FiltroSegmento,     // Zod → se deriva el JSON Schema
  progreso: "Analizando el segmento",
  async ejecutar(args, ctx): Promise<ResultadoTool> { ... }
});

type ResultadoTool = {
  paraElModelo: object;   // compacto, cuesta tokens
  paraLaUI?: Tarjeta;     // rico, no entra al contexto
};
```

El registro deriva el JSON Schema con `zod-to-json-schema` y arma el mapa de
despacho. Una definición, tres consumidores: modelo, validador, ejecutor.

### Catálogo

| Herramienta             | Efecto        | Notas                                                            |
| ----------------------- | ------------- | ---------------------------------------------------------------- |
| `buscar_empresa`        | lectura       | ES. Devuelve NIF, razón social, CNAE, provincia, rango de ventas |
| `obtener_ficha_publica` | lectura       | Solo nivel gratuito                                              |
| `obtener_magnitudes`    | lectura       | **Verifica derechos.** Devuelve datos o `requiereCompra`         |
| `resolver_actividad`    | lectura       | Texto → códigos CNAE. Embeddings en memoria                      |
| `construir_segmento`    | lectura       | Conteo + desglose + precio                                       |
| `comparar_empresas`     | lectura       | ComparaTE. Verifica derechos                                     |
| `consultar_saldo`       | lectura       | Créditos, packs, plan, cuota mensual usada                       |
| `recomendar_producto`   | lectura       | Recuperación sobre casos comerciales → SKU                       |
| `cotizar`               | lectura       | Precio unitario, pack óptimo, ahorro                             |
| `crear_intento_compra`  | **escritura** | Única con efecto. Requiere confirmación en UI                    |

### Sobre las descripciones

Es donde más vas a iterar. Incluir siempre cuándo **no** usarla:

```
construir_segmento: "Cuenta empresas que cumplen criterios y calcula el precio
del listado. Úsala cuando el usuario describa un mercado objetivo o un perfil de
cliente. NO la uses para consultar una empresa concreta — para eso, buscar_empresa.
Devuelve un conteo, no los datos. Los datos requieren compra."
```

---

## 3. Esquema de filtros

```ts
export const FiltroSegmento = z
  .object({
    actividad: z.string().optional(), // texto libre → resolver_actividad
    cnae: z
      .array(z.string().regex(/^\d{2,4}$/))
      .max(20)
      .optional(),
    provincias: z.array(z.enum(PROVINCIAS_ES)).max(52).optional(),
    ventas: z
      .object({ min: z.number().min(0), max: z.number() })
      .partial()
      .optional(),
    empleados: z
      .object({ min: z.number().int(), max: z.number().int() })
      .partial()
      .optional(),
    ebitdaPositivo: z.boolean().optional(),
    antiguedadMinAnios: z.number().int().min(0).max(150).optional(),
    conEmail: z.boolean().optional(),
    conTelefono: z.boolean().optional(),
  })
  .strict(); // .strict() rechaza campos inventados por el modelo
```

El compilador a consulta Elasticsearch vive en `datos/elastic/compilador.ts`, con
tests. **El modelo nunca ve DSL.**

---

## 4. Elasticsearch

Envoltorio propio, sin cliente oficial:

```ts
async function es(ruta: string, cuerpo?: object) {
  const r = await fetch(`${ES_URL}${ruta}`, {
    method: cuerpo ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!r.ok) throw new ErrorElastic(r.status, await r.text());
  return r.json();
}
```

**Rutas según versión** (aislar en `datos/elastic/rutas.ts`):

- 6.x: `/empresas/_doc/_search`, `/empresas/_doc/_count`
- 7.x: `/empresas/_search`, `/empresas/_count`

**Conteo para precio — siempre `_count`:**

```ts
const { count } = await es(rutas.count, { query: compilar(filtros) });
```

Nunca `hits.total` (se corta en 10.000 en 7.x por defecto) ni `cardinality`
(aproximada por diseño). Cotizar mal es facturar mal.

**Desglose por provincia:** agregación `terms` con `size: 52`.

---

## 5. Puente de sesión con ASP Classic

El ASP hace una llamada servidor a servidor:

```asp
<%
Dim http, token
Set http = Server.CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.open "POST", "https://nia.infonif.es/internal/mint", False
http.setRequestHeader "X-Shared-Secret", Application("AGENT_SECRET")
http.setRequestHeader "Content-Type", "application/json"
http.send "{""usuarioId"":""" & Session("UserID") & """,""plan"":""" & Session("Plan") & """}"
token = http.responseText
%>
<script>
window.__INFONIF_AGENT__ = {
  token: <%= token %>,
  contexto: { tipo: "ficha", nif: "<%= empresa.NIF %>" }
};
</script>
<script src="https://nia.infonif.es/widget.js" async></script>
```

> Las URLs de arriba son ilustrativas. En el entorno de prueba del cliente Nia no
> tiene dominio propio: cuelga de `https://bbdd-api2.infonif.es/nia/`. Los valores
> reales están en [INSTALACION-PRUEBA.md](INSTALACION-PRUEBA.md) §5.

`POST /internal/mint` valida el secreto compartido, resuelve los derechos del
usuario contra SQL Server y firma un token de 15 minutos. **Este endpoint no debe
ser alcanzable desde internet**: solo desde la red del IIS.

El `contexto` entra al prompt de sistema como texto plano:

> El usuario está viendo la ficha de MERCADONA SA (NIF A46103834).

---

## 6. Widget: estado del turno

```ts
type Paso = {
  id: string;
  texto: string;
  detalle?: string;
  estado: "activo" | "ok" | "error";
  desde: number;
};
type Turno = { texto: string; pasos: Paso[]; tarjetas: Tarjeta[] };
```

Reducer sobre el stream SSE. Los pasos **son estado del turno, no mensajes**.

### Reglas de render

- **Tiempo mínimo visible de 350 ms por paso.** Si completa en 80 ms parpadea y
  se lee como fallo. Esto no es falsear progreso: el trabajo ocurrió, solo se
  evita el parpadeo.
- **Sin animación de salida** en los pasos: produce saltos de layout durante el
  streaming.
- **Autoscroll solo si el usuario está pegado al fondo** (margen ~100 px). Si no,
  píldora "↓ nuevo".
- **Markdown con throttle de ~50 ms** o en límites de párrafo. Parsear cada token
  es caro y el markdown incompleto (`**sin cerrar`) se ve mal.
- **Tres estados de la línea de tiempo:** durante → expandida con spinner;
  al terminar → colapsada a "3 pasos · 1,2 s" con chevron; error → abierta en el
  paso que falló.
- **Accesibilidad:** `aria-live="polite"` solo en la respuesta final, nunca en los
  pasos. Contenedor con `aria-busy`.

### Registro de tarjetas

```tsx
const TARJETAS = {
  segmento: TarjetaSegmento, // desglose provincia, campos, planes
  confirmacion: TarjetaConfirmar, // resumen + botón → POST a la API propia
  ficha: TarjetaFicha,
  bloqueado: TarjetaUpsell, // requiereCompra → SKU sugerido
};
```

### Persistencia entre páginas

El sitio es multipágina: cada clic remonta el widget. `sessionStorage` guarda
`conversationId` y el estado abierto/cerrado. El historial se rehidrata desde
Redis al montar. **El widget renderiza el esqueleto de inmediato** y rellena
cuando llegue el historial; no espera.

---

## 7. Despliegue en Debian

**Nginx rompe el SSE por defecto.** El síntoma confunde: los mensajes de progreso
llegan todos juntos al final. En el bloque del endpoint:

```nginx
location /v1/conversar {
    proxy_pass http://127.0.0.1:3000;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
    add_header X-Accel-Buffering no;
}
```

No pasar el streaming por IIS/ARR: también almacena en búfer. Subdominio propio
servido directamente por nginx.

**SQL Server con OpenSSL 3.** Debian 12 rechaza TLS < 1.2 y claves DH cortas. Si
el servidor es 2012 o anterior, el handshake falla con un error opaco. Dejar
configurables:

```ts
{ encrypt: env.MSSQL_ENCRYPT, trustServerCertificate: env.MSSQL_TRUST_CERT }
```

**Node desde NodeSource**, no desde los repos de Debian (van muy atrasados).
