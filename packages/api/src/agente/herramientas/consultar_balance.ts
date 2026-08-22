import { z } from "zod";
import { obtenerBalanceResumido } from "../../datos/icif/dato.js";
import { definirTool } from "../tipos.js";
import { sinDato } from "./_icif.js";

/**
 * Las que se devuelven si no piden otra cosa.
 *
 * Son 55 partidas por tres ejercicios: mandarlas todas cuesta tokens y entierra
 * lo que el usuario preguntaba. Estas doce son las que se miran de verdad, y
 * cubren las tres caras —resultados, balance y estructura— para que el modelo
 * pueda contestar sin pedir una segunda vuelta.
 *
 * Los códigos son los mismos del catálogo de campos comprables.
 */
const PRINCIPALES = [
  "40100", // Importe neto de la cifra de negocio
  "99999996", // Ingresos de explotación
  "49100", // Resultado de explotación
  "49300", // Resultado antes de impuestos
  "49500", // Resultado del ejercicio
  "40600", // Gastos de personal
  "10000", // Total activo
  "11000", // Activo no corriente
  "12000", // Activo corriente
  "20000", // Patrimonio neto
  "31000", // Pasivo no corriente
  "32000", // Pasivo corriente
];

export default definirTool({
  nombre: "consultar_balance",
  descripcion: `Las cuentas de una empresa: cifra de negocio, resultado, activo, patrimonio neto
y demás partidas, con su valor en cada uno de los últimos ejercicios.

**Es la PRIMERA que hay que probar para cualquier pregunta sobre cifras**:
cuánto factura, cuánto gana, cuánto tiene, cómo le va. No requiere que el usuario
haya comprado nada, así que responde a quien pregunta sin haber iniciado sesión.
Solo si te piden el EBITDA —que aquí no viene— pasas a obtener_magnitudes.

Necesita el NIF.

Por defecto devuelve las doce partidas principales. Pide "todas" solo si te piden
el balance completo, porque son 55 y llenan la pantalla.

Los importes vienen en EUROS y sin redondear. Al contarlos, di siempre de qué
ejercicio es cada uno: «36.813 millones en 2025», nunca «unos 36.000 millones».

NO interpretes las cifras como una valoración de solvencia. Que suba o baje el
resultado es un hecho; decir si la empresa es de fiar es scoring, y eso lo
produce el Informe de Riesgo, nunca tú.`,
  progreso: "Consultando las cuentas",

  esquema: z
    .object({
      nif: z.string().min(8).max(12).describe("NIF de la empresa"),
      partidas: z
        .union([
          z.literal("principales"),
          z.literal("todas"),
          z.array(z.string()).max(20),
        ])
        .optional()
        .describe(
          "principales (por defecto), todas, o una lista de conceptos o códigos",
        ),
      ejercicio: z
        .string()
        .regex(/^\d{4}$/)
        .optional()
        .describe("Un solo ejercicio. Sin esto vienen todos los disponibles"),
    })
    .strict(),

  async ejecutar({ nif, partidas, ejercicio }, ctx) {
    const usuarioId = ctx.derechos.usuarioId;
    const resultado = await obtenerBalanceResumido(nif, usuarioId, {
      senal: ctx.senal,
    });

    if (resultado.estado !== "ok") {
      return sinDato(resultado, "el balance", {
        ...(usuarioId != null ? { usuarioId } : {}),
        senal: ctx.senal,
      });
    }

    const { ejercicios } = resultado.datos;
    let elegidas = resultado.datos.partidas;

    if (partidas === "todas") {
      // tal cual
    } else if (Array.isArray(partidas)) {
      const busca = partidas.map((p) => normalizar(p));
      elegidas = elegidas.filter(
        (p) =>
          busca.includes(p.codigo) ||
          busca.some((b) => normalizar(p.concepto).includes(b)),
      );
      // Si lo que pidió no existe, mejor las principales que nada: así el
      // modelo tiene con qué contestar en vez de volver a preguntar.
      if (elegidas.length === 0) {
        elegidas = resultado.datos.partidas.filter((p) =>
          PRINCIPALES.includes(p.codigo),
        );
      }
    } else {
      elegidas = elegidas.filter((p) => PRINCIPALES.includes(p.codigo));
    }

    const filas = elegidas.map((p) => ({
      concepto: p.concepto,
      valores: ejercicio
        ? { [ejercicio]: p.valores[ejercicio] ?? null }
        : p.valores,
    }));

    return {
      paraElModelo: {
        nif,
        ejerciciosDisponibles: ejercicios,
        moneda: "EUR",
        partidas: filas,
        nota: "Importes en euros. Cada cifra va con su ejercicio: no los mezcles ni los redondees a ojo.",
        ...(partidas === "todas" || Array.isArray(partidas)
          ? {}
          : { aviso: "Son las principales. Hay más si las piden." }),
      },
    };
  },
});

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
