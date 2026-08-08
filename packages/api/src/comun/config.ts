import { config as cargarDotenv } from "dotenv";
import { z } from "zod";
import { ErrorConfiguracion } from "./errores.js";

// El .env vive en la raíz del monorepo; los scripts se ejecutan desde packages/api.
cargarDotenv({ path: [".env", "../../.env"] });

const booleano = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const EsquemaEntorno = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PUERTO: z.coerce.number().int().positive().default(3000),
  LOG_NIVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  ORIGENES_PERMITIDOS: z.string().default("http://localhost:5174"),

  // API de Infonif: el origen real de los datos (docs/API-INFONIF.md).
  // La apikey no es un secreto —viaja en el bundle público del buscador actual—,
  // pero se configura para poder rotarla sin tocar código.
  INFONIF_API_URL: z.string().url().default("https://bbdd-api.infonif.es/api"),
  INFONIF_API_KEY: z.string().optional(),
  INFONIF_TIEMPO_LIMITE_MS: z.coerce.number().int().positive().default(45_000),
  /**
   * Cuánto se considera fresco el resumen de facetas. Sus datos cambian una vez
   * al día, así que 24 h. Pasado ese tiempo NO se descarta: se sigue sirviendo
   * mientras se refresca por detrás.
   */
  INFONIF_RESUMEN_TTL_SEGUNDOS: z.coerce.number().int().positive().default(86_400),
  /**
   * Cuánto sobrevive en Redis. Es una red de seguridad muy por encima del TTL:
   * si Infonif estuviera caído dos días, preferimos servir un vocabulario viejo
   * a no poder ni traducir una provincia.
   */
  INFONIF_RESUMEN_CADUCIDAD_SEGUNDOS: z.coerce.number().int().positive().default(604_800),

  // SQL Server. Solo lectura, siempre.
  // Fuera del camino crítico del MVP: los derechos se resuelven por su API
  // (GET /buscador/planBBDD). Se deja configurado para cuando haga falta.
  MSSQL_HOST: z.string().default("localhost"),
  MSSQL_PUERTO: z.coerce.number().int().positive().default(1433),
  MSSQL_USER: z.string().default("sa"),
  MSSQL_PASSWORD: z.string().default(""),
  MSSQL_DATABASE: z.string().default("infonif"),
  MSSQL_ENCRYPT: booleano.default("false"),
  MSSQL_TRUST_CERT: booleano.default("true"),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Opcionales en Fase 0: se exigen en la fase que los estrena.
  ANTHROPIC_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),

  AGENT_SHARED_SECRET: z.string().optional(),
  TOKEN_TTL_SEGUNDOS: z.coerce.number().int().positive().default(900),
});

export type Entorno = z.infer<typeof EsquemaEntorno>;

function leerEntorno(): Entorno {
  const resultado = EsquemaEntorno.safeParse(process.env);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ErrorConfiguracion(`Variables de entorno inválidas:\n${detalle}`);
  }
  return resultado.data;
}

export const config = leerEntorno();

export const esProduccion = config.NODE_ENV === "production";

export const origenesPermitidos = config.ORIGENES_PERMITIDOS.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Para claves que solo hacen falta en algunas fases. Falla en el arranque de la
 * función que las necesita, no en el arranque del proceso.
 */
export function exigir<C extends keyof Entorno>(clave: C): NonNullable<Entorno[C]> {
  const valor = config[clave];
  if (valor === undefined || valor === "") {
    throw new ErrorConfiguracion(`Falta la variable de entorno ${String(clave)}`);
  }
  return valor as NonNullable<Entorno[C]>;
}
