import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config, origenesPermitidos } from "./comun/config.js";
import { registro } from "./comun/registro.js";
import { esErrorNia } from "./comun/errores.js";
import { estadoInfonif } from "./datos/infonif/cliente.js";
import { estadoCacheResumen, precargarResumen } from "./datos/infonif/resumen.js";
import { estadoCatalogo, prepararCatalogo } from "./datos/catalogo.js";
import { cerrarRedis, estadoRedis } from "./datos/redis/cliente.js";
import { registrarConversar } from "./rutas/conversar.js";
import { registrarMint } from "./rutas/mint.js";

export function construirServidor() {
  const app = Fastify({ loggerInstance: registro, disableRequestLogging: false });

  app.register(cors, { origin: origenesPermitidos, credentials: true });

  app.get("/salud", async () => ({
    ok: true,
    servicio: "nia-api",
    entorno: config.NODE_ENV,
  }));

  app.get("/salud/dependencias", async () => {
    const [infonif, redis] = await Promise.all([estadoInfonif(), estadoRedis()]);
    return {
      ok: infonif.disponible && redis.disponible,
      infonif: { ...infonif, url: config.INFONIF_API_URL },
      redis,
      cacheResumen: estadoCacheResumen(),
      catalogoCampos: estadoCatalogo(),
    };
  });

  registrarConversar(app);
  registrarMint(app);

  app.setErrorHandler((error, peticion, respuesta) => {
    if (esErrorNia(error)) {
      peticion.log.warn({ codigo: error.codigo, err: error.message }, "error controlado");
      return respuesta
        .status(error.codigo === "VALIDACION" ? 400 : 502)
        .send({ codigo: error.codigo, mensaje: error.mensajeParaElModelo });
    }
    peticion.log.error({ err: error }, "error no controlado");
    return respuesta.status(500).send({ codigo: "INTERNO", mensaje: "Error interno" });
  });

  return app;
}

async function arrancar(): Promise<void> {
  const app = construirServidor();

  for (const senal of ["SIGINT", "SIGTERM"] as const) {
    process.once(senal, () => {
      void (async () => {
        await app.close();
        await cerrarRedis();
        process.exit(0);
      })();
    });
  }

  await app.listen({ port: config.PUERTO, host: "0.0.0.0" });

  // Sin esperarlo: el servicio ya acepta peticiones mientras el resumen baja.
  // Así el primer usuario no paga los 26 segundos ni con Redis vacío.
  precargarResumen();
  void prepararCatalogo();
}

/** `true` solo si este módulo es el que se ha ejecutado, no cuando lo importa un test. */
function esEntrada(): boolean {
  const invocado = process.argv[1];
  if (!invocado) return false;
  try {
    return realpathSync(invocado) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (esEntrada()) {
  arrancar().catch((error: unknown) => {
    registro.fatal({ err: error }, "no se pudo arrancar");
    process.exit(1);
  });
}
