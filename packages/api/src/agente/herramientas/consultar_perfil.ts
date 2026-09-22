import { z } from "zod";
import { obtenerPerfilEmpresa } from "../../datos/icif/dato.js";
import { definirTool } from "../tipos.js";
import { sinDato } from "./_icif.js";
import { saldoTrasConsultar } from "./_saldo.js";

export default definirTool({
  nombre: "consultar_perfil",
  descripcion: `La ficha de identificación de una empresa: **teléfono, email y web**, dirección
completa, CNAE con su descripción, objeto social, número de empleados, fecha de
constitución, registro mercantil y auditor.

**Es la PRIMERA que hay que probar para cualquier pregunta de contacto**: el
teléfono, el correo, la web, dónde está, a qué se dedica o cuánta gente tiene.
Para eso NO hay que comprar ningún informe, así que no lo ofrezcas: se responde
con esta herramienta.

Tampoco la confundas con obtener_magnitudes, que va de cifras financieras y esa
sí puede pedir compra. Aquí no hay cifras de cuentas: para eso, consultar_balance.

Que un campo no venga significa que de esa empresa no consta, no que haga falta
pagarlo. Dilo tal cual y no lo presentes como algo que se pueda comprar.`,
  progreso: "Consultando la ficha",

  esquema: z
    .object({
      nif: z.string().min(8).max(12).describe("NIF de la empresa"),
    })
    .strict(),

  async ejecutar({ nif }, ctx) {
    const resultado = await obtenerPerfilEmpresa(nif, ctx.derechos.usuarioId, {
      senal: ctx.senal,
      ...(ctx.conversacionId ? { conversacionId: ctx.conversacionId } : {}),
    });

    if (resultado.estado !== "ok") {
      return sinDato(resultado, "la ficha de identificación", {
        usuarioId: ctx.derechos.usuarioId,
        senal: ctx.senal,
      });
    }

    const p = resultado.datos;
    const { saldo, nota: notaSaldo } = await saldoTrasConsultar(ctx);

    // Los campos que de verdad se preguntan, separados del resto: así el modelo
    // ve de un vistazo si tiene lo que le han pedido.
    const contacto = {
      ...(p.telefono ? { telefono: p.telefono } : {}),
      ...(p.email ? { email: p.email } : {}),
      ...(p.web ? { web: p.web } : {}),
    };

    const sinContacto = Object.keys(contacto).length === 0;

    return {
      paraElModelo: {
        ...(saldo ? { creditos: saldo, notaCreditos: notaSaldo } : {}),
        nif,
        razonSocial: p.razonSocial,
        contacto,
        ...(sinContacto
          ? {
              notaContacto:
                "De esta empresa no consta ningún dato de contacto. Es una respuesta válida: NO se arregla comprando nada, así que no ofrezcas informes por esto.",
            }
          : {}),
        direccion: [p.direccion, p.codigoPostal, p.localidad, p.provincia]
          .filter(Boolean)
          .join(", "),
        actividad: p.cnaeDescripcion ?? p.cnae,
        cnae: p.cnae,
        objetoSocial: p.objetoSocial,
        empleados: p.empleados,
        fechaConstitucion: p.fechaConstitucion,
        registroMercantil: p.registroMercantil,
      },
    };
  },
});
