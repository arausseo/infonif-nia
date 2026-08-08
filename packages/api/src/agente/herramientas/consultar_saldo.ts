import { z } from "zod";
import { definirTool } from "../tipos.js";

export default definirTool({
  nombre: "consultar_saldo",
  descripcion: `Qué plan tiene el usuario y cuántos registros le quedan.

Úsala antes de proponer una compra o una descarga, para saber si le hace falta
pagar o le basta con su saldo. Con plan, cada descarga consume un registro por
empresa y los campos no influyen; sin plan, se paga por campo y por registro.

NO se la enseñes al usuario sin que venga a cuento: es información suya, no un
argumento de venta.`,
  progreso: "Consultando el saldo",

  esquema: z.object({}).strict(),

  async ejecutar(_args, ctx) {
    const { derechos } = ctx;

    if (derechos.perfil === "anonimo") {
      return {
        paraElModelo: {
          perfil: "anonimo",
          nota: "El usuario no ha iniciado sesión. Para comprar o descargar tendrá que entrar en su cuenta.",
        },
      };
    }

    if (derechos.perfil === "registrado") {
      return {
        paraElModelo: {
          perfil: "registrado",
          tienePlan: false,
          nota: "Sin plan de registros. Cada listado se paga por los campos elegidos, más IVA.",
        },
      };
    }

    return {
      paraElModelo: {
        perfil: "conPlan",
        tienePlan: true,
        registrosContratados: derechos.registrosContratados,
        registrosConsumidos: derechos.registrosConsumidos,
        registrosDisponibles: derechos.registrosDisponibles,
        nota: "Cada descarga consume un registro por empresa, con todos los campos incluidos.",
      },
    };
  },
});
