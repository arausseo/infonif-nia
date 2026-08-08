import { describe, expect, it } from "vitest";
import { z } from "zod";
import skusCrudo from "./skus.json";

/**
 * Integridad del catálogo de productos. El catálogo de campos comprables y su
 * aritmética se prueban en `datos/precios.test.ts`, que es donde vive el cálculo.
 */

const CatalogoSkus = z.object({
  moneda: z.literal("EUR"),
  ivaPorcentaje: z.literal(21),
  formasDePago: z.array(z.enum(["euros", "creditos"])).nonempty(),
  informes: z
    .array(
      z.object({ sku: z.string(), precio: z.number().positive(), unidad: z.string() }),
    )
    .nonempty(),
  packs: z
    .array(
      z.object({
        sku: z.string(),
        skuBase: z.string(),
        unidades: z.number().int().positive(),
        precio: z.number().positive(),
        precioUnitarioEfectivo: z.number().positive(),
      }),
    )
    .nonempty(),
  listados: z.object({
    modeloPrecio: z.literal("por-campo-y-registro"),
    catalogoCampos: z.string(),
    minimoRegistros: z.null(),
  }),
});

const skus = CatalogoSkus.parse(skusCrudo);

describe("fixture de SKU", () => {
  it("mantiene los precios públicos observados de los informes", () => {
    const precio = (sku: string) => skus.informes.find((i) => i.sku === sku)?.precio;
    expect(precio("RAI")).toBe(6);
    expect(precio("INFORME_COMERCIAL")).toBe(15);
    expect(precio("INFORME_RIESGO")).toBe(30);
    expect(precio("CUENTAS_ANUALES")).toBe(10);
  });

  it("cada pack referencia un informe existente y sale más barato por unidad", () => {
    for (const pack of skus.packs) {
      const base = skus.informes.find((i) => i.sku === pack.skuBase);
      expect(base, `pack ${pack.sku} sin informe base`).toBeDefined();
      expect(pack.precioUnitarioEfectivo).toBeLessThan(base!.precio);
      expect(pack.precio).toBeCloseTo(pack.precioUnitarioEfectivo * pack.unidades, 2);
    }
  });

  it("el listado no tiene tramos por volumen ni mínimo de registros", () => {
    // El cliente confirmó (08/08/2026) que los tramos 0,30/0,15/0,10 de CLAUDE.md
    // son referenciales. El precio real es por campo y por registro, y no hay
    // mínimo. Este test existe para que nadie los reintroduzca de memoria.
    expect(skus.listados).not.toHaveProperty("tramos");
    expect(skus.listados.minimoRegistros).toBeNull();
    expect(skus.listados.modeloPrecio).toBe("por-campo-y-registro");
  });

  it("se puede pagar en euros y con créditos", () => {
    expect(skus.formasDePago).toContain("euros");
    expect(skus.formasDePago).toContain("creditos");
  });
});
