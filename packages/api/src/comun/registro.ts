import pino from "pino";
import { config, esProduccion } from "./config.js";

/**
 * Un solo logger para todo el servicio. Fastify lo reutiliza.
 *
 * `redact` no es cosmética: los tokens del puente de sesión y las claves de la
 * pasarela no deben acabar en un fichero de log.
 */
export const registro = pino({
  level: config.LOG_NIVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers['x-shared-secret']",
      "token",
      "*.token",
      "password",
      "*.password",
      "ANTHROPIC_API_KEY",
      "STRIPE_SECRET_KEY",
    ],
    censor: "[oculto]",
  },
  transport: esProduccion
    ? undefined
    : {
        target: "pino-pretty",
        options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
});

export type Registro = typeof registro;
