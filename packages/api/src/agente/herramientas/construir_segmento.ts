import { FiltroSegmento } from "../../datos/infonif/filtros.js";
import { contarSegmento } from "../../datos/infonif/segmentos.js";
import { calcularCoste, recomendarPlan } from "../../datos/precios.js";
import { definirTool } from "../tipos.js";

/** Campos de contacto que se cotizan por defecto: lo que casi todo el mundo pide. */
const CAMPOS_POR_DEFECTO = ["CIF", "RazonSocial", "Direccion", "Telefono", "Email"];

export default definirTool({
  nombre: "construir_segmento",
  descripcion: `Cuenta cuántas empresas cumplen unos criterios y calcula el precio del listado.
Úsala cuando el usuario describa un mercado objetivo o un perfil de cliente.

NO la uses para consultar una empresa concreta: para eso, buscar_empresa.
Devuelve un conteo, no los datos. Los datos requieren compra.

Los códigos CNAE tienen que venir de resolver_actividad, nunca de tu memoria.

Devuelve el desglose por criterio: enséñaselo al usuario, porque es lo que le
permite entender por qué el segmento se le ha quedado corto y qué aflojar.`,
  progreso: "Analizando el segmento",

  esquema: FiltroSegmento,

  async ejecutar(filtro, ctx) {
    ctx.progreso("Traduciendo los criterios");
    const segmento = await contarSegmento(filtro);

    ctx.progreso("Contando empresas", { detalle: `${segmento.cantidad} empresas` });

    if (segmento.provinciasNoResueltas.length > 0) {
      ctx.progreso("Alguna provincia no se ha reconocido", {
        detalle: segmento.provinciasNoResueltas.join(", "),
      });
    }

    ctx.progreso("Calculando el precio");
    const coste = calcularCoste(
      ctx.derechos,
      segmento.cantidad,
      CAMPOS_POR_DEFECTO,
      segmento.camposDisponibles,
    );

    const plan =
      coste.formaDePago === "euros"
        ? recomendarPlan(segmento.cantidad, coste.enEuros.total)
        : undefined;

    ctx.progreso("Segmento listo");

    return {
      paraElModelo: {
        empresas: segmento.cantidad,
        embudo: segmento.embudo.map((p) => ({
          criterio: p.criterio,
          etiqueta: p.etiqueta,
          quedan: p.cantidad,
        })),
        ...(segmento.cantidadSinRequisitoContacto !== undefined
          ? {
              sinExigirContacto: segmento.cantidadSinRequisitoContacto,
              nota: "Exigir email o teléfono reduce el segmento a las empresas que lo tienen.",
            }
          : {}),
        ...(segmento.provinciasNoResueltas.length > 0
          ? { provinciasNoReconocidas: segmento.provinciasNoResueltas }
          : {}),
        precio:
          coste.formaDePago === "saldo"
            ? {
                forma: "saldo",
                registros: coste.enSaldo.registros,
                disponiblesDespues: coste.enSaldo.disponiblesDespues,
                alcanza: coste.enSaldo.alcanza,
                nota: "Con plan se consume un registro por empresa, con todos los campos incluidos.",
              }
            : {
                forma: "euros",
                base: coste.enEuros.baseImponible,
                total: coste.enEuros.total,
                campos: CAMPOS_POR_DEFECTO,
                nota: "El precio depende de los campos elegidos. Se puede recalcular con cotizar.",
              },
        ...(plan
          ? {
              plan: {
                sku: plan.tramo.sku,
                registros: plan.tramo.registros,
                coste: plan.coste,
                compensa: plan.mereceLaPenaParaEsteListado,
              },
            }
          : {}),
      },
      paraLaUI: {
        tipo: "segmento",
        // Misma clave que cotizar: si luego se cotiza, se reemplaza esta tarjeta
        // en lugar de apilar dos precios del mismo listado.
        clave: "segmento",
        datos: {
          empresas: segmento.cantidad,
          embudo: segmento.embudo,
          coste,
          plan,
          camposDisponibles: segmento.camposDisponibles.filter(
            (c) => !c.id.includes("|"),
          ),
        },
      },
    };
  },
});
