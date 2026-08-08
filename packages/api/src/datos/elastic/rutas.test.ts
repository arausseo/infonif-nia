import { describe, expect, it } from "vitest";
import { construirRutas } from "./rutas.js";

/**
 * La incógnita 6.x/7.x se resuelve aquí y en ningún otro sitio. Estos tests son
 * el contrato de ese aislamiento.
 */
describe("rutas de Elasticsearch", () => {
  describe("7.x", () => {
    const rutas = construirRutas("7", "empresas");

    it("no mete el tipo en la ruta", () => {
      expect(rutas.buscar).toBe("/empresas/_search");
      expect(rutas.contar).toBe("/empresas/_count");
    });

    it("no envuelve el mapping", () => {
      expect(rutas.envolverMapping({ nif: { type: "keyword" } })).toEqual({
        properties: { nif: { type: "keyword" } },
      });
    });

    it("omite _type en la acción de bulk", () => {
      expect(rutas.accionBulk("B12345678")).toEqual({
        index: { _index: "empresas", _id: "B12345678" },
      });
    });
  });

  describe("6.x", () => {
    const rutas = construirRutas("6", "empresas");

    it("mete el tipo en la ruta", () => {
      expect(rutas.buscar).toBe("/empresas/_doc/_search");
      expect(rutas.contar).toBe("/empresas/_doc/_count");
    });

    it("envuelve el mapping en el nombre del tipo", () => {
      expect(rutas.envolverMapping({ nif: { type: "keyword" } })).toEqual({
        _doc: { properties: { nif: { type: "keyword" } } },
      });
    });

    it("incluye _type en la acción de bulk", () => {
      expect(rutas.accionBulk("B12345678")).toEqual({
        index: { _index: "empresas", _type: "_doc", _id: "B12345678" },
      });
    });
  });

  it("el bulk y el refresco no llevan tipo en ninguna versión", () => {
    for (const version of ["6", "7"] as const) {
      const rutas = construirRutas(version, "empresas");
      expect(rutas.bulk).toBe("/empresas/_bulk");
      expect(rutas.refrescar).toBe("/empresas/_refresh");
    }
  });

  it("escapa el identificador en la ruta del documento", () => {
    expect(construirRutas("7", "empresas").documento("A/1")).toBe("/empresas/_doc/A%2F1");
  });
});
