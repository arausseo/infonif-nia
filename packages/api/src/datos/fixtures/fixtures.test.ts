import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DocumentoEmpresa, rangoDeVentas } from "../elastic/mapping.js";
import { cnaePorCodigo } from "../cnae/catalogo.js";
import { CODIGO_PROVINCIA } from "../geo/provincias.js";

const aqui = dirname(fileURLToPath(import.meta.url));

function leerJson(nombre: string): unknown {
  return JSON.parse(readFileSync(resolve(aqui, nombre), "utf8"));
}

const empresas = z.array(DocumentoEmpresa).parse(leerJson("empresas.json"));

describe("fixture de empresas", () => {
  it("tiene 200 registros con la forma del mapping esperado", () => {
    // El parse de arriba ya valida contra DocumentoEmpresa.strict(): un campo
    // de más o un tipo mal puesto revienta el fichero de test entero.
    expect(empresas).toHaveLength(200);
  });

  it("no repite NIF ni razón social", () => {
    expect(new Set(empresas.map((e) => e.nif)).size).toBe(empresas.length);
    expect(new Set(empresas.map((e) => e.razonSocial)).size).toBe(empresas.length);
  });

  it("usa CNAE del catálogo, con su descripción", () => {
    for (const empresa of empresas) {
      const entrada = cnaePorCodigo(empresa.cnae);
      expect(entrada, `CNAE ${empresa.cnae} fuera del catálogo`).toBeDefined();
      expect(empresa.cnaeDescripcion).toBe(entrada?.descripcion);
    }
  });

  it("el rango de ventas es coherente con la cifra", () => {
    for (const empresa of empresas) {
      expect(empresa.rangoVentas).toBe(rangoDeVentas(empresa.ventas));
    }
  });

  it("las banderas de contacto coinciden con los campos", () => {
    for (const empresa of empresas) {
      expect(empresa.tieneEmail).toBe(empresa.email !== undefined);
      expect(empresa.tieneTelefono).toBe(empresa.telefono !== undefined);
    }
  });

  it("el código postal empieza por el código INE de su provincia", () => {
    for (const empresa of empresas) {
      expect(empresa.codigoPostal).toHaveLength(5);
      expect(empresa.codigoPostal.slice(0, 2)).toBe(CODIGO_PROVINCIA[empresa.provincia]);
    }
  });

  it("todo dato financiero declara ejercicio fiscal", () => {
    // Regla no negociable 4: cero cifras sin fuente.
    for (const empresa of empresas) {
      expect(empresa.ejercicioFiscal).toBeGreaterThanOrEqual(2023);
    }
  });

  it("el segmento del flujo C del demo no está vacío", () => {
    const CNAE_LOGISTICA = ["4941", "5210", "5229", "4942", "5224", "5320", "5040"];
    const segmento = empresas.filter(
      (e) =>
        CNAE_LOGISTICA.includes(e.cnae) &&
        (e.provincia === "Valencia" || e.provincia === "Castellón") &&
        e.empleados > 20 &&
        e.ventas >= 2_000_000 &&
        e.tieneEmail,
    );
    expect(segmento.length).toBeGreaterThanOrEqual(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const CatalogoSkus = z.object({
  moneda: z.literal("EUR"),
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
  ivaPorcentaje: z.literal(21),
  formasDePago: z.array(z.enum(["euros", "creditos"])).nonempty(),
  listados: z.object({
    modeloPrecio: z.literal("por-campo-y-registro"),
    catalogoCampos: z.string(),
    minimoRegistros: z.null(),
  }),
});

const skus = CatalogoSkus.parse(leerJson("skus.json"));

describe("fixture de SKU", () => {
  it("mantiene los precios públicos observados", () => {
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
});

// ─────────────────────────────────────────────────────────────────────────────

const CampoComprable = z.object({
  name: z.string().min(1),
  group: z.enum(["contacto", "comerciales", "financieros"]),
  label: z.string().min(1),
  label2: z.string().optional(),
  price: z.number().positive(),
  isNew: z.boolean().optional(),
  requiredFilter: z.boolean().optional(),
  jsonPath: z.string().optional(),
  partida: z.string().optional(),
  tipoPartida: z.enum(["Perdida", "InformacionFinanciera", "Ratios"]).optional(),
  unit: z.string().optional(),
});

const campos = z.array(CampoComprable).parse(leerJson("infonif/campos-comprables.json"));

describe("catálogo de campos comprables de Infonif", () => {
  it("es la copia congelada de fields.json, con sus 34 campos", () => {
    expect(campos).toHaveLength(34);
    expect(new Set(campos.map((c) => c.name)).size).toBe(campos.length);
  });

  it("todo campo financiero declara partida y tipoPartida", () => {
    for (const campo of campos.filter((c) => c.group === "financieros")) {
      expect(campo.partida, `${campo.name} sin partida`).toBe(campo.name);
      expect(campo.tipoPartida, `${campo.name} sin tipoPartida`).toBeDefined();
    }
  });

  it("los campos de contacto sensibles son los que llevan requiredFilter", () => {
    const conFiltro = campos.filter((c) => c.requiredFilter).map((c) => c.name);
    expect(conFiltro.sort()).toEqual(
      ["CargosDisponibles", "Email", "Telefono", "Web"].sort(),
    );
  });

  it("reproduce el importe de la captura del cliente", () => {
    // 81 empresas con CIF, razón social, dirección y email; 79 con ventas.
    const precio = (nombre: string) => {
      const campo = campos.find((c) => c.name === nombre);
      expect(campo, `campo ${nombre} ausente`).toBeDefined();
      return campo!.price;
    };
    const disponibles: Record<string, number> = {
      CIF: 81,
      RazonSocial: 81,
      Direccion: 81,
      Email: 81,
      "99053": 79,
    };
    const coste = Object.entries(disponibles).reduce(
      (suma, [nombre, registros]) => suma + precio(nombre) * registros,
      0,
    );
    expect(coste).toBeCloseTo(12.07, 2);
    expect(coste * 1.21).toBeCloseTo(14.6, 2);
  });
});
