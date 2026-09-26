import { z } from "zod";
import {
  autorizarNif,
  autorizarSesion,
  autorizarSiempre,
  fijarInformar,
  leerAutorizacion,
  revocarSesion,
  tieneAutorizacionPermanente,
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
- "siempre" — quiere que NUNCA se le vuelva a preguntar, tampoco en
  conversaciones futuras. Es el más fuerte de todos: úsalo solo si ha dicho algo
  como «no me preguntes nunca más» o «autoriza siempre». Ante la duda, "sesion".
- "revocar" — quiere volver a que le preguntes cada vez, o se arrepintió. Retira
  también el "siempre".

Y con "informar" controlas si le vas contando el saldo: ponlo en false si te pide
que dejes de darle la matraca con los créditos, y en true si vuelve a quererlo.

Un crédito cubre TODOS los datos de esa empresa durante el mes entero, así que al
pedir permiso díselo: no está pagando por una consulta, está abriendo una ficha.`,
  progreso: "Registrando la autorización",

  esquema: z
    .object({
      alcance: z.enum(["empresa", "sesion", "siempre", "revocar"]),
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
    let guardadoPermanente = false;

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
    } else if (alcance === "siempre") {
      // Para la conversación actual también, que si no habría que esperar a la
      // siguiente para que surtiera efecto.
      await autorizarSesion(conversacion);
      guardadoPermanente = await autorizarSiempre(ctx.derechos.usuarioId);
    } else {
      await revocarSesion(conversacion, ctx.derechos.usuarioId);
    }

    if (informar != null) await fijarInformar(conversacion, informar);

    const estado = await leerAutorizacion(conversacion);
    const permanente = await tieneAutorizacionPermanente(ctx.derechos.usuarioId);

    // El «siempre» necesita saber de quién es, y un anónimo no tiene id. Se dice
    // en vez de fallar: la sesión SÍ queda autorizada, que es casi todo lo que
    // pedía, y así no se le promete algo que no va a pasar.
    const avisoAnonimo =
      alcance === "siempre" && !guardadoPermanente
        ? "No se ha podido dejar guardado para futuras conversaciones porque el usuario no ha iniciado sesión. En ESTA conversación ya no se le preguntará más. Díselo así, sin darle importancia, y sugiérele entrar en su cuenta si quiere que se recuerde."
        : undefined;

    return {
      paraElModelo: {
        alcance,
        ...(nif ? { nif } : {}),
        modo: permanente ? "siempre" : estado.modo,
        empresasAutorizadas: estado.nifs.length,
        informandoDelSaldo: estado.informar,
        ...(avisoAnonimo ? { aviso: avisoAnonimo } : {}),
        siguiente:
          alcance === "revocar"
            ? "Vuelves a preguntar antes de cada empresa nueva, también en conversaciones futuras."
            : "Ya puedes consultar. No des las gracias ni lo celebres: sigue con lo que te pidió.",
      },
    };
  },
});
