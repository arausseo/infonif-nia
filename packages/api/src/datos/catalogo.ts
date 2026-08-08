import { z } from "zod";
import { config } from "../comun/config.js";
import { registro } from "../comun/registro.js";
import { obtenerRedis } from "./redis/cliente.js";
// Copia congelada: solo es el punto de partida y el respaldo. La buena se baja.
import catalogoCongelado from "./fixtures/infonif/campos-comprables.json";

/**
 * El catálogo de campos comprables, **en vivo**.
 *
 * Con el CNAE el problema de tenerlo congelado eran etiquetas envejecidas. Aquí
 * son **precios**, y un precio viejo es una factura mal emitida (regla 7). Si
 * Infonif sube el email de 0,05 a 0,06 y nosotros seguimos con la copia de
 * agosto, cotizamos de menos en cada listado y nadie se entera.
 *
 * Así que se baja de su fichero, igual que hace su propio buscador, y se cachea
 * sirviendo lo viejo mientras se refresca. La copia congelada del repositorio
 * queda como semilla —para que el proceso arranque sabiendo algo y para que los
 * tests corran sin red— y como último respaldo.
 *
 * Un cambio de precio se registra a nivel `warn`: es un hecho de negocio, no un
 * detalle técnico.
 */

const URL_CATALOGO =
  "https://infonif.economia3.com/bases-de-datos/herramienta/fields.json";

const CLAVE_REDIS = "nia:infonif:campos:v1";
const CLAVE_CERROJO = "nia:infonif:campos:refrescando";

export const CampoComprable = z.object({
  name: z.string().min(1),
  group: z.enum(["contacto", "comerciales", "financieros"]),
  label: z.string().min(1),
  price: z.number().positive(),
  requiredFilter: z.boolean().optional(),
  partida: z.string().optional(),
  tipoPartida: z.enum(["Perdida", "InformacionFinanciera", "Ratios"]).optional(),
});

export type CampoComprable = z.infer<typeof CampoComprable>;

const Catalogo = z.array(CampoComprable).min(1);

interface Entrada {
  generadoEn: number;
  campos: CampoComprable[];
}

const SEMILLA: CampoComprable[] = Catalogo.parse(catalogoCongelado);

let enMemoria: Entrada = { generadoEn: 0, campos: SEMILLA };
let refrescando = false;

/** El catálogo vigente. Síncrono a propósito: el cálculo de precios no espera. */
export function catalogoCampos(): readonly CampoComprable[] {
  return enMemoria.campos;
}

export function catalogoEsDeLaSemilla(): boolean {
  return enMemoria.generadoEn === 0;
}

function estaFresco(ahora: number): boolean {
  return ahora - enMemoria.generadoEn < config.INFONIF_CATALOGO_TTL_SEGUNDOS * 1000;
}

/** Avisa de lo que ha cambiado. Un precio distinto no puede pasar en silencio. */
function compararYAvisar(nuevos: readonly CampoComprable[]): void {
  const antes = new Map(enMemoria.campos.map((c) => [c.name, c]));
  const ahora = new Map(nuevos.map((c) => [c.name, c]));

  for (const [nombre, campo] of ahora) {
    const previo = antes.get(nombre);
    if (!previo) {
      registro.warn(
        { campo: nombre, etiqueta: campo.label, precio: campo.price },
        "campo comprable NUEVO en el catálogo de Infonif",
      );
    } else if (previo.price !== campo.price) {
      registro.warn(
        { campo: nombre, etiqueta: campo.label, antes: previo.price, ahora: campo.price },
        "CAMBIO DE PRECIO en el catálogo de Infonif",
      );
    }
  }

  for (const [nombre, campo] of antes) {
    if (!ahora.has(nombre)) {
      registro.warn(
        { campo: nombre, etiqueta: campo.label },
        "campo comprable RETIRADO del catálogo de Infonif",
      );
    }
  }
}

async function descargar(): Promise<CampoComprable[]> {
  const respuesta = await fetch(URL_CATALOGO, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!respuesta.ok) throw new Error(`fields.json respondió ${respuesta.status}`);

  const campos = Catalogo.parse(await respuesta.json());
  compararYAvisar(campos);

  enMemoria = { generadoEn: Date.now(), campos };

  try {
    await obtenerRedis().set(
      CLAVE_REDIS,
      JSON.stringify(enMemoria),
      "EX",
      config.INFONIF_CATALOGO_CADUCIDAD_SEGUNDOS,
    );
  } catch {
    // Sin Redis se vuelve a bajar en el siguiente arranque. No es grave.
  }

  return campos;
}

function refrescarEnSegundoPlano(): void {
  if (refrescando) return;
  refrescando = true;

  void (async () => {
    try {
      const cerrojo = await obtenerRedis()
        .set(CLAVE_CERROJO, "1", "EX", 60, "NX")
        .catch(() => "OK");
      if (cerrojo !== "OK") return;
      await descargar();
      registro.info("catálogo de campos refrescado");
    } catch (error) {
      registro.warn({ err: String(error) }, "no se pudo refrescar el catálogo de campos");
    } finally {
      refrescando = false;
    }
  })();
}

/**
 * Carga el catálogo al arrancar y lo mantiene fresco.
 *
 * No bloquea: mientras baja, se usa la semilla del repositorio. Es un catálogo
 * de 34 campos que cambia muy de tarde en tarde.
 */
export async function prepararCatalogo(): Promise<void> {
  try {
    const cacheado = await obtenerRedis().get(CLAVE_REDIS);
    if (cacheado) {
      const entrada = JSON.parse(cacheado) as { generadoEn?: unknown; campos?: unknown };
      if (typeof entrada.generadoEn === "number") {
        enMemoria = {
          generadoEn: entrada.generadoEn,
          campos: Catalogo.parse(entrada.campos),
        };
      }
    }
  } catch {
    // Da igual: se baja del origen.
  }

  if (!estaFresco(Date.now())) refrescarEnSegundoPlano();
}

/** Para /salud/dependencias. */
export function estadoCatalogo(): {
  campos: number;
  origen: "semilla" | "vivo";
  antiguedadSegundos?: number;
} {
  if (enMemoria.generadoEn === 0) {
    return { campos: enMemoria.campos.length, origen: "semilla" };
  }
  return {
    campos: enMemoria.campos.length,
    origen: "vivo",
    antiguedadSegundos: Math.round((Date.now() - enMemoria.generadoEn) / 1000),
  };
}

/** Solo para tests. */
export function fijarCatalogo(campos: CampoComprable[], generadoEn = Date.now()): void {
  enMemoria = { generadoEn, campos };
}
