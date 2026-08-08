import { describe, expect, it } from "vitest";
import { buscarLexico, normalizar } from "./lexico.js";
import { corpus, terminos } from "./corpus.js";

/**
 * La capa curada es la que resuelve lo que de verdad pide un comercial, y la
 * única que se puede explicar. Un término mal puesto mete empresas que no tocan
 * en un segmento que se factura, así que conviene tenerla sujeta.
 */

const codigos = (consulta: string) => buscarLexico(consulta).map((c) => c.clase.codigo);

describe("integridad del corpus", () => {
  it("trae las 627 clases CNAE de cuatro dígitos", () => {
    expect(corpus.clases).toHaveLength(627);
    expect(new Set(corpus.clases.map((c) => c.codigo)).size).toBe(627);
  });

  it("todo código con términos existe en el árbol de Infonif", () => {
    // Un código inventado aquí sería un filtro que su API rechaza en silencio.
    const validos = new Set(corpus.clases.map((c) => c.codigo));
    for (const codigo of Object.keys(terminos)) {
      expect(validos.has(codigo), `${codigo} no existe en el CNAE de Infonif`).toBe(true);
    }
  });

  it("ningún término está vacío ni repetido dentro de su clase", () => {
    for (const [codigo, lista] of Object.entries(terminos)) {
      expect(lista.length, `${codigo} sin términos`).toBeGreaterThan(0);
      expect(new Set(lista).size, `${codigo} repite términos`).toBe(lista.length);
      // Se admiten siglas de dos letras («FP», «IT»). No casan en la capa léxica
      // —se filtran por longitud— pero sí enriquecen el texto que se vectoriza.
      for (const termino of lista)
        expect(termino.trim().length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("normalizar", () => {
  it("quita acentos, mayúsculas y puntuación", () => {
    expect(normalizar("  Logística, S.L.  ")).toBe("logistica s l");
    expect(normalizar("MUDANZAS")).toBe("mudanzas");
  });
});

describe("buscarLexico", () => {
  it("«logística» da las clases de logística, la mayor primero", () => {
    const resultado = codigos("logística");
    expect(resultado.slice(0, 3)).toEqual(["4941", "5210", "5229"]);
  });

  it("acierta sin acento y en mayúsculas", () => {
    expect(codigos("LOGISTICA").slice(0, 3)).toEqual(["4941", "5210", "5229"]);
  });

  it("«empresas de mudanzas» llega a 4942 pese al ruido", () => {
    // «empresas» y «de» no distinguen nada y se descartan.
    expect(codigos("empresas de mudanzas")[0]).toBe("4942");
  });

  it("explica por qué, que es lo que un vector no sabe hacer", () => {
    const [primera] = buscarLexico("clínica dental");
    expect(primera?.clase.codigo).toBe("8623");
    expect(primera?.porQue).toBe("clínica dental");
  });

  it("una coincidencia exacta puntúa más que una parcial", () => {
    const exacta = buscarLexico("mudanzas")[0];
    const parcial = buscarLexico("necesito mudanzas urgentes")[0];
    expect(exacta?.puntuacion).toBe(1);
    expect(parcial?.puntuacion).toBeLessThan(1);
    expect(parcial?.clase.codigo).toBe("4942");
  });

  it("resuelve términos de varias palabras dentro de una frase", () => {
    expect(codigos("busco empresas de trabajo temporal")[0]).toBe("7820");
    expect(codigos("quiero talleres mecánicos")[0]).toBe("4520");
  });

  it("un término de una sola palabra tiene que casar entero", () => {
    // «solar» no puede colarse por «soldadura» ni por «solares».
    expect(codigos("soldadura")).not.toContain("3519");
  });

  it("no inventa nada con una consulta que no toca su vocabulario", () => {
    expect(buscarLexico("filosofía medieval")).toEqual([]);
  });

  it("una consulta vacía o mínima no devuelve nada", () => {
    expect(buscarLexico("")).toEqual([]);
    expect(buscarLexico("   ")).toEqual([]);
  });

  it("respeta el límite que se le pide", () => {
    expect(buscarLexico("logística", 2)).toHaveLength(2);
  });

  it("no repite una clase aunque casen varios de sus términos", () => {
    const resultado = codigos("empresa de transporte con camiones y paquetería");
    expect(new Set(resultado).size).toBe(resultado.length);
  });

  it("resuelve sin tocar el modelo", () => {
    buscarLexico("logística"); // calentar
    const arranque = performance.now();
    for (let i = 0; i < 50; i++) buscarLexico("logística");
    const porConsulta = (performance.now() - arranque) / 50;
    // Lo que se afirma es que NO hay inferencia de por medio, no un tiempo
    // concreto: una pasada del modelo son decenas de milisegundos. El umbral es
    // holgado a propósito, que si no falla en una máquina ocupada.
    expect(porConsulta).toBeLessThan(10);
  });
});

describe("plurales", () => {
  it("da igual singular que plural: así escribe la gente", () => {
    const pares: [string, string][] = [
      ["clínica dental", "clínicas dentales"],
      ["taller mecánico", "talleres mecánicos"],
      ["agencia de publicidad", "agencias de publicidad"],
      ["despacho de abogados", "despachos de abogados"],
    ];
    for (const [singular, plural] of pares) {
      expect(codigos(plural)[0], `«${plural}»`).toBe(codigos(singular)[0]);
    }
  });

  it("no confunde palabras que acaban en s en singular", () => {
    // «gas» no debe reducirse a «ga» y arrastrar cualquier cosa.
    expect(codigos("gas")).not.toContain("4941");
  });
});
