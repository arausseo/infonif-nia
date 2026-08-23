import { z } from "zod";
import {
  autorizarNif,
  autorizarSesion,
  fijarInformar,
  leerAutorizacion,
  revocarSesion,
} from "../../datos/icif/autorizacion.js";
import { definirTool } from "../tipos.js";

export default definirTool({
  nombre: "autorizar_consultas",
  descripcion: `Registra que el usuario TE HA DADO PERMISO para gastar sus créditos de consulta.

Llámala SOLO después de que el usuario lo haya dicho. Nunca por adelantado, ni
porque te parezca que iba a decir que sí, ni para desatascarte: esto gasta dinero
suyo, y decir que autorizó lo que no autorizó es lo peor que puedes hacer aquí.

Alcances:
- "empresa" — dijo que sí a UNA empresa. Pasa su NIF. Es el caso normal.
- "sesion" — dijo que adelante y que no le preguntes más. Solo si lo ha dicho
  con esas palabras o parecidas.
- "revocar" — quiere volver a que le preguntes cada vez, o se arrepintió.

Y con "informar" controlas si le vas contando el saldo: ponlo en false si te pide
que dejes de darle la matraca con los créditos, y en true si vuelve a quererlo.

Un crédito cubre TODOS los datos de esa empresa durante el mes entero, así que al
pedir permiso díselo: no está pagando por una consulta, está abriendo una ficha.`,
  progreso: "Registrando la autorización",

  esquema: z
    .object({
      alcance: z.enum(["empresa", "sesion", "revocar"]),
      nif: z
        .string()
        .min(8)
        .max(12)
        .optional()
        .describe("Obligatorio con alcance empresa"),
      informar: z
        .boolean()
        .optional()
        .describe("false si pide que dejes de informarle del saldo"),
    })
    .strict(),

  async ejecutar({ alcance, nif, informar }, ctx) {
    const conversacion = ctx.conversacionId;

    if (alcance === "empresa") {
      if (!nif) {
        return {
          paraElModelo: {
            error: "Falta el NIF de la empresa que ha autorizado.",
          },
        };
      }
      await autorizarNif(conversacion, nif);
    } else if (alcance === "sesion") {
      await autorizarSesion(conversacion);
    } else {
      await revocarSesion(conversacion);
    }

    if (informar != null) await fijarInformar(conversacion, informar);

    const estado = await leerAutorizacion(conversacion);

    return {
      paraElModelo: {
        alcance,
        ...(nif ? { nif } : {}),
        modo: estado.modo,
        empresasAutorizadas: estado.nifs.length,
        informandoDelSaldo: estado.informar,
        siguiente:
          alcance === "revocar"
            ? "Vuelves a preguntar antes de cada empresa nueva."
            : "Ya puedes consultar. No des las gracias ni lo celebres: sigue con lo que te pidió.",
      },
    };
  },
});
