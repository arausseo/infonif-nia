import { beforeAll, describe, expect, it } from "vitest";
import {
  fijarResumen,
  obtenerIndice,
  olvidarResumen,
  resolverProvincias,
} from "./resumen.js";
import { ResumenInfonif } from "./tipos.js";
import instantanea from "../fixtures/infonif/resumen-2026-08-08.json";

/**
 * Contra la instantánea del API en vivo del 08/08/2026, no contra el fichero
 * estático del portal, que está caducado.
 */
beforeAll(() => {
  olvidarResumen();
  fijarResumen(ResumenInfonif.parse(instantanea));
});

describe("esquema del resumen", () => {
  it("valida la respuesta real del API", () => {
    const resumen = ResumenInfonif.parse(instantanea);
    expect(resumen.cantidad).toBe(2_712_875);
  });

  it("indexa las 627 clases CNAE de cuatro dígitos", async () => {
    const { cnae } = await obtenerIndice();
    const clases = [...cnae.keys()].filter((c) => c.length === 4);
    expect(clases).toHaveLength(627);
    expect(cnae.get("4941")?.label).toBe("Transporte de mercancías por carretera");
    expect(cnae.get("4941")?.data).toBe(21_686);
  });

  it("indexa los rangos cerrados de empleados y antigüedad", async () => {
    const { rangosEmpleados, rangosAntiguedad } = await obtenerIndice();
    expect(rangosEmpleados.size).toBe(4);
    expect(rangosAntiguedad.size).toBe(6);
    expect(rangosEmpleados.has("rango.0")).toBe(true);
    // incluir_null no es un rango: es el recuento de los que no tienen dato.
    expect(rangosEmpleados.has("incluir_null")).toBe(false);
  });

  it("indexa los 47 sectores propios de Infonif", async () => {
    const { industria } = await obtenerIndice();
    expect(industria.size).toBe(47);
    expect(industria.get("transporte terrestre")).toBe("Transporte terrestre");
  });
});

describe("resolverProvincias", () => {
  it("resuelve el nombre castellano a la ruta que espera el filtro", async () => {
    const { ids } = await resolverProvincias(["Teruel"]);
    expect(ids).toEqual(["Aragón|Teruel"]);
  });

  it("resuelve el castellano a la grafía que use Infonif, sea cual sea", async () => {
    // Su catálogo mezcla criterios: "Lleida" y "Ourense" en cooficial, pero
    // "Vizcaya" y "Guipúzcoa" en castellano. Por eso no vale una regla, hace
    // falta casar contra el catálogo.
    const casos: [string, string][] = [
      ["Castellón", "Comunitat Valenciana|Castelló"],
      ["Lérida", "Cataluña|Lleida"],
      ["Orense", "Galicia|Ourense"],
      ["La Coruña", "Galicia|Coruña, A"],
      ["Vizcaya", "País Vasco|Vizcaya"],
      ["Álava", "País Vasco|Álava"],
      ["Baleares", "Islas Baleares|Balears, Illes"],
      ["Las Palmas", "Canarias|Palmas, Las"],
      ["La Rioja", "La Rioja|Rioja, La"],
      ["Alicante", "Comunitat Valenciana|Alicante/Alacant"],
    ];
    for (const [escrito, esperado] of casos) {
      const { ids } = await resolverProvincias([escrito]);
      expect(ids, `«${escrito}» debería resolver a ${esperado}`).toEqual([esperado]);
    }
  });

  it("resuelve también la grafía cooficial que el usuario puede escribir", async () => {
    // El catálogo dice "Vizcaya", pero el usuario puede teclear "Bizkaia".
    const casos: [string, string][] = [
      ["Bizkaia", "País Vasco|Vizcaya"],
      ["Gipuzkoa", "País Vasco|Guipúzcoa"],
      ["Lleida", "Cataluña|Lleida"],
      ["A Coruña", "Galicia|Coruña, A"],
      ["Illes Balears", "Islas Baleares|Balears, Illes"],
      ["València", "Comunitat Valenciana|Valencia/València"],
    ];
    for (const [escrito, esperado] of casos) {
      const { ids } = await resolverProvincias([escrito]);
      expect(ids, `«${escrito}» debería resolver a ${esperado}`).toEqual([esperado]);
    }
  });

  it("tolera minúsculas y falta de acentos", async () => {
    const { ids } = await resolverProvincias(["  castellon "]);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toContain("Castelló");
  });

  it("devuelve LAS DOS grafías de Tenerife, no una", async () => {
    // Quedarse con la larga perdería las 8 empresas de la corta, en silencio.
    const { ids } = await resolverProvincias(["Santa Cruz de Tenerife"]);
    expect(ids).toHaveLength(2);
    expect(ids).toContain("Canarias|Santa Cruz De Tenerife");
    expect(ids).toContain("Canarias|Sta. Cruz De Tenerife");
  });

  it("no repite ids si el usuario nombra dos veces la misma provincia", async () => {
    const { ids } = await resolverProvincias(["Valencia", "valencia"]);
    expect(ids).toHaveLength(1);
  });

  it("informa de lo que no ha sabido resolver, en vez de callar", async () => {
    const { ids, noResueltas } = await resolverProvincias(["Teruel", "Lisboa"]);
    expect(ids).toEqual(["Aragón|Teruel"]);
    expect(noResueltas).toEqual(["Lisboa"]);
  });

  it("resuelve las dos provincias del flujo C del demo", async () => {
    const { ids, noResueltas } = await resolverProvincias(["Valencia", "Castellón"]);
    expect(noResueltas).toEqual([]);
    expect(ids).toHaveLength(2);
  });
});
