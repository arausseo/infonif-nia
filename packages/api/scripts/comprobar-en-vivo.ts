/**
 * Ejercita la capa de datos contra el API real de Infonif.
 *
 * No es un test: los tests corren sin red y contra respuestas grabadas. Esto es
 * la comprobación de que lo grabado sigue pareciéndose a la realidad. Conviene
 * pasarlo antes de una demo.
 *
 *   pnpm --filter @nia/api verificar
 */
import { buscarEmpresas } from "../src/datos/infonif/empresas.js";
import { compilar, type FiltroSegmento } from "../src/datos/infonif/filtros.js";
import {
  estadoCacheResumen,
  obtenerEjerciciosRecientes,
  obtenerResumen,
  resolverProvincias,
} from "../src/datos/infonif/resumen.js";
import { contarSegmento } from "../src/datos/infonif/segmentos.js";
import { cotizarListado } from "../src/datos/precios.js";
import { cerrarRedis } from "../src/datos/redis/cliente.js";

const euros = (n: number) =>
  `${n.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`;
const miles = (n: number) => n.toLocaleString("es-ES");

async function cronometrar<T>(que: string, tarea: () => Promise<T>): Promise<T> {
  const arranque = performance.now();
  const resultado = await tarea();
  console.log(`  (${Math.round(performance.now() - arranque)} ms)  ${que}`);
  return resultado;
}

async function principal(): Promise<void> {
  console.log("\n=== 1. Resumen de facetas =========================================");
  const resumen = await cronometrar("GET /buscador/resumen", obtenerResumen);
  console.log(`  universo: ${miles(resumen.cantidad)} empresas`);
  const anios = resumen.cuentas_disponibles
    .filter((c) => /^\d{4}$/.test(c.id))
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, 3);
  console.log(
    `  ejercicios recientes: ${anios.map((a) => `${a.id} (${miles(a.data)})`).join(" · ")}`,
  );

  const cache = estadoCacheResumen();
  console.log(
    `  caché: ${cache.fresco ? "fresca" : "caducada, sirviendo mientras refresca"}` +
      ` · ${cache.antiguedadSegundos} s de antigüedad`,
  );
  // La segunda lectura no debe volver a la red aunque esté caducada.
  const segunda = await cronometrar("segunda lectura del resumen", obtenerResumen);
  if (segunda.cantidad !== resumen.cantidad) {
    throw new Error("la caché ha devuelto un resumen distinto");
  }

  console.log("\n=== 2. Búsqueda por nombre (flujo A del demo) ======================");
  const { empresas, posiblesMas } = await cronometrar("autocomplete q=mercadona", () =>
    buscarEmpresas("mercadona"),
  );
  for (const empresa of empresas.slice(0, 3)) {
    console.log(
      `  ${empresa.nif}  ${empresa.razonSocial}  (${empresa.provincia ?? "?"})`,
    );
    if (empresa.denominacionesAnteriores.length > 0) {
      console.log(`      antes: ${empresa.denominacionesAnteriores.join(" / ")}`);
    }
  }
  console.log(
    `  ${empresas.length} empresas tras deduplicar${posiblesMas ? " (su API topa en 25)" : ""}`,
  );

  console.log("\n=== 3. Segmento del flujo C del demo ==============================");
  const filtro: FiltroSegmento = {
    cnae: ["4941", "5210", "5229"],
    provincias: ["Valencia", "Castellón"],
    empleados: { min: 20 },
    ventas: { min: 2_000_000 },
    conEmail: true,
  };

  const { ids } = await resolverProvincias(filtro.provincias ?? []);
  const ejercicios = await obtenerEjerciciosRecientes();
  console.log(`  ejercicios para el criterio financiero: ${ejercicios.join(", ")}`);
  console.log(`  provincias resueltas: ${ids.join(" · ")}`);
  console.log(
    `  pasos del embudo: ${compilar(filtro, { provincias: ids, ejercicios })
      .pasos.map((p) => p.criterio)
      .join(" → ")}`,
  );

  const segmento = await cronometrar("POST /buscador/filtrar (embudo en paralelo)", () =>
    contarSegmento(filtro),
  );

  for (const paso of segmento.embudo) {
    console.log(
      `    ${paso.criterio.padEnd(12)} ${String(miles(paso.cantidad)).padStart(10)}  ${paso.etiqueta}`,
    );
  }
  console.log(`  segmento final: ${miles(segmento.cantidad)} empresas`);
  if (segmento.cantidadSinRequisitoContacto !== undefined) {
    console.log(
      `  sin exigir contacto serían ${miles(segmento.cantidadSinRequisitoContacto)}: ` +
        `exigir email se lleva ${miles(segmento.cantidadSinRequisitoContacto - segmento.cantidad)}`,
    );
  }

  console.log("\n=== 4. Cotización =================================================");
  const presupuesto = cotizarListado(
    ["CIF", "RazonSocial", "Direccion", "Email", "Telefono", "99053"],
    segmento.camposDisponibles,
    segmento.cantidad,
  );
  for (const linea of presupuesto.lineas) {
    console.log(
      `    ${linea.etiqueta.padEnd(24)} ${String(linea.registros).padStart(6)} reg × ` +
        `${linea.precioUnitario.toFixed(2)} € = ${euros(linea.importe).padStart(12)}`,
    );
  }
  console.log(
    `  base ${euros(presupuesto.baseImponible)} + IVA ${euros(presupuesto.iva)} = ${euros(presupuesto.total)}`,
  );

  console.log("\nTodo respondió.\n");
}

principal()
  .catch((error: unknown) => {
    console.error(`\nFALLÓ: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => cerrarRedis());
