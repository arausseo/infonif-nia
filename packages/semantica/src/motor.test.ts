import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  recomendarProducto,
  resolverActividad,
  usarVectorizador,
  vectorizadorLocal,
} from "./motor.js";
import { hayArtefacto, masCercanos } from "./vectores.js";
import { DIMENSIONES } from "./modelo.js";

/**
 * Criterio de aceptación de la Fase 2 (PLAN.md):
 *
 *   resolverActividad("logística") devuelve 4941, 5210 y 5229 en menos de 5 ms,
 *   y "empresas de mudanzas" también acierta.
 *
 * Se prueba con el modelo real cargado, no con uno de mentira: lo que interesa
 * saber es si esto funciona, no si el mock funciona.
 */

beforeAll(async () => {
  expect(hayArtefacto(), "falta el artefacto: corre `pnpm embeddings`").toBe(true);
  usarVectorizador(await vectorizadorLocal());
}, 180_000);

afterAll(() => usarVectorizador(undefined));

const codigos = (r: { actividades: { cnae: string }[] }) =>
  r.actividades.map((a) => a.cnae);

describe("criterio de aceptación", () => {
  it("«logística» da 4941, 5210 y 5229", async () => {
    const resultado = await resolverActividad("logística");
    for (const esperado of ["4941", "5210", "5229"]) {
      expect(codigos(resultado), `falta ${esperado}`).toContain(esperado);
    }
  });

  it("«logística» resuelve en menos de 5 ms", async () => {
    await resolverActividad("logística"); // calentar
    const arranque = performance.now();
    await resolverActividad("logística");
    const ms = performance.now() - arranque;
    // Lo resuelven los términos curados, así que ni se toca el modelo.
    expect(ms).toBeLessThan(5);
  });

  it("«empresas de mudanzas» acierta", async () => {
    const resultado = await resolverActividad("empresas de mudanzas");
    expect(codigos(resultado)[0]).toBe("4942");
  });
});

describe("la capa semántica cubre lo que nadie curó", () => {
  it("«fabricantes de envases de cartón» llega a 1721 sin término curado", async () => {
    const resultado = await resolverActividad("fabricantes de envases de cartón");
    expect(codigos(resultado)).toContain("1721");
    expect(resultado.actividades[0]?.via).toBe("semantica");
  });

  it("«bodegas de vino» y «criadores de cerdos» también", async () => {
    expect(codigos(await resolverActividad("bodegas de vino"))).toContain("1102");
    expect(codigos(await resolverActividad("criadores de cerdos"))).toContain("0146");
  });

  it("marca de dónde salió cada actividad", async () => {
    const resultado = await resolverActividad("logística");
    expect(resultado.actividades.every((a) => a.via === "termino")).toBe(true);
    expect(resultado.actividades[0]?.porQue).toBe("logística");
  });

  it("devuelve el tamaño de cada clase, para calibrar el segmento", async () => {
    const [primera] = (await resolverActividad("logística")).actividades;
    expect(primera?.empresas).toBeGreaterThan(1000);
  });
});

describe("bordes", () => {
  it("una consulta demasiado corta no devuelve nada", async () => {
    expect((await resolverActividad("ab")).actividades).toEqual([]);
  });

  it("respeta el límite", async () => {
    expect((await resolverActividad("logística", 2)).actividades).toHaveLength(2);
  });

  it("no repite códigos entre las dos capas", async () => {
    const resultado = await resolverActividad("transporte de mercancías");
    const salida = codigos(resultado);
    expect(new Set(salida).size).toBe(salida.length);
  });

  it("una consulta sin nada que ver devuelve poco y no inventa", async () => {
    const resultado = await resolverActividad("filosofía medieval comparada");
    // Puede devolver algo por proximidad, pero nunca más de lo pedido.
    expect(resultado.actividades.length).toBeLessThanOrEqual(5);
  });
});

describe("el artefacto de vectores", () => {
  it("tiene un vector por clase, de las dimensiones del modelo", () => {
    const vecinos = masCercanos(new Float32Array(DIMENSIONES).fill(0), 3);
    expect(vecinos).toHaveLength(3);
  });

  it("rechaza un vector de otras dimensiones en vez de dar basura", () => {
    expect(() => masCercanos(new Float32Array(10), 3)).toThrow(/dimensiones/);
  });

  it("recorre las 627 clases en menos de 2 ms", () => {
    const vector = new Float32Array(DIMENSIONES).fill(1 / Math.sqrt(DIMENSIONES));
    masCercanos(vector, 5);
    const arranque = performance.now();
    for (let i = 0; i < 20; i++) masCercanos(vector, 5);
    expect((performance.now() - arranque) / 20).toBeLessThan(2);
  });
});

describe("recomendarProducto", () => {
  it("el flujo B del demo deriva al Informe de Riesgo, no opina", async () => {
    // «Un proveedor nuevo me pide crédito a 90 días por 40.000 €.»
    // Regla 5: Nia no emite recomendaciones de crédito. El caso curado existe
    // para redirigir al producto que sí las produce.
    const [primero] = await recomendarProducto(
      "un proveedor nuevo me pide crédito a 90 días por 40.000 euros",
    );
    expect(primero?.sku).toBe("INFORME_RIESGO");
    expect(primero?.alternativa).toBe("RAI");
    expect(primero?.porQue).toMatch(/scoring|límite de crédito/i);
  });

  it("ninguna pregunta sobre crédito o solvencia acaba en otra cosa", async () => {
    const preguntas = [
      "cuánto crédito le puedo dar a esta empresa",
      "es solvente esta empresa",
      "me fío de este cliente para aplazarle el pago",
    ];
    for (const pregunta of preguntas) {
      const [primero] = await recomendarProducto(pregunta);
      expect(["INFORME_RIESGO", "RAI"], `«${pregunta}» → ${primero?.sku}`).toContain(
        primero?.sku,
      );
    }
  });

  it("una necesidad de prospección lleva al listado", async () => {
    const [primero] = await recomendarProducto(
      "quiero una lista de empresas de mi provincia para vender",
    );
    expect(primero?.sku).toBe("LISTADO_SEGMENTADO");
  });

  it("el uso repetido o de volumen lleva a un plan", async () => {
    const [primero] = await recomendarProducto(
      "voy a descargar listados todos los meses, no solo una vez",
    );
    expect(primero?.sku).toMatch(/^PLAN_/);
  });

  it("deja rastro del caso curado, para poder auditar la recomendación", async () => {
    const [primero] = await recomendarProducto("necesito las cuentas anuales de 2023");
    expect(primero?.caso).toBeTruthy();
    expect(primero?.situacion).toBeTruthy();
  });

  it("una situación vacía no recomienda nada", async () => {
    expect(await recomendarProducto("")).toEqual([]);
  });
});
