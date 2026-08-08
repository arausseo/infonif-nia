import { describe, expect, it } from "vitest";
import { armar, compilar, FiltroSegmento, type EstadoFiltro } from "./filtros.js";

/**
 * El compilador es la pieza que convierte lo que dice el modelo en lo que se
 * factura. Si se equivoca, se cotiza mal. De ahí que los tests sean exhaustivos.
 */

const TERUEL = ["Aragón|Teruel"];

/** Lo que devuelve `ejerciciosRecientes()` con los datos de agosto de 2026. */
const EJERCICIOS = ["2024", "2023"];

/** Contexto habitual: sin provincias, con ejercicios resueltos. */
const CTX = { ejercicios: EJERCICIOS };

/** Claves que siempre viajan, aunque vayan vacías. */
const CLAVES = [
  "codigosPostales",
  "cif",
  "comunidades",
  "Provincias",
  "Localidades",
  "antiguedad",
  "razonSocial",
  "auditores",
  "empleados",
  "cuentasDisponibles",
  "TipoCuentas",
  "sector_actividad",
  "cargo",
  "vinculaciones",
  "balance",
  "perdidas",
  "ratios",
  "estado",
];

describe("esquema FiltroSegmento", () => {
  it("rechaza campos que el modelo se invente", () => {
    // .strict() es la defensa contra la alucinación de parámetros.
    expect(
      FiltroSegmento.safeParse({ cnae: ["4941"], sectorFavorito: "logística" }).success,
    ).toBe(false);
  });

  it("rechaza CNAE que no sean de 2 a 4 dígitos", () => {
    expect(FiltroSegmento.safeParse({ cnae: ["494"] }).success).toBe(true);
    expect(FiltroSegmento.safeParse({ cnae: ["4"] }).success).toBe(false);
    expect(FiltroSegmento.safeParse({ cnae: ["49411"] }).success).toBe(false);
    expect(FiltroSegmento.safeParse({ cnae: ["logística"] }).success).toBe(false);
  });

  it("rechaza un rango sin extremos y uno del revés", () => {
    expect(FiltroSegmento.safeParse({ ventas: {} }).success).toBe(false);
    expect(FiltroSegmento.safeParse({ ventas: { min: 10, max: 5 } }).success).toBe(false);
    expect(FiltroSegmento.safeParse({ ventas: { min: 5, max: 10 } }).success).toBe(true);
    expect(FiltroSegmento.safeParse({ ventas: { min: 5 } }).success).toBe(true);
    expect(FiltroSegmento.safeParse({ ventas: { max: 10 } }).success).toBe(true);
  });

  it("acepta un filtro vacío: el error de segmento vacío es de otra capa", () => {
    expect(FiltroSegmento.safeParse({}).success).toBe(true);
  });

  it("pone tope a las listas para que no se cuele una petición desmedida", () => {
    const muchos = Array.from({ length: 21 }, (_, i) => String(1000 + i));
    expect(FiltroSegmento.safeParse({ cnae: muchos }).success).toBe(false);
  });
});

describe("compilar: forma de la petición", () => {
  it("manda todas las claves, vacías si no se filtra", () => {
    const { peticion } = compilar({ cnae: ["4941"] }, CTX);
    for (const clave of CLAVES) {
      expect(peticion, `falta ${clave}`).toHaveProperty(clave);
      expect(Array.isArray(peticion[clave])).toBe(true);
    }
    expect(peticion["campos_requeridos"]).toEqual([]);
  });

  it("el embudo tiene un estado por criterio y es acumulativo", () => {
    const { peticion, pasos } = compilar(
      { cnae: ["4941"], empleados: { min: 20 }, antiguedadMinAnios: 5 },
      { provincias: TERUEL, ejercicios: EJERCICIOS },
    );

    expect(pasos.map((p) => p.criterio)).toEqual([
      "actividad",
      "ubicacion",
      "empleados",
      "antiguedad",
    ]);
    expect(peticion.filtros).toHaveLength(4);

    const [uno, dos, tres, cuatro] = peticion.filtros as EstadoFiltro[];
    expect(Object.keys(uno!)).toEqual(["sector_actividad"]);
    expect(Object.keys(dos!)).toEqual(["sector_actividad", "Provincias"]);
    expect(Object.keys(tres!)).toEqual(["sector_actividad", "Provincias", "empleados"]);
    expect(Object.keys(cuatro!)).toEqual([
      "sector_actividad",
      "Provincias",
      "empleados",
      "antiguedad",
    ]);
  });

  it("cada estado del embudo es una copia, no una referencia compartida", () => {
    const { peticion } = compilar(
      { cnae: ["4941"], empleados: { min: 20 } },
      { provincias: TERUEL, ejercicios: EJERCICIOS },
    );
    const estados = peticion.filtros as EstadoFiltro[];
    expect(estados[0]!["sector_actividad"]).not.toBe(estados[1]!["sector_actividad"]);
    // Si compartieran array, mutar uno cambiaría el otro y el embudo mentiría.
    estados[0]!["sector_actividad"]!.push("cnae|9999");
    expect(estados[1]!["sector_actividad"]).toEqual(["cnae|4941"]);
  });

  it("no genera pasos si no hay ningún criterio", () => {
    const { pasos, peticion } = compilar({}, CTX);
    expect(pasos).toEqual([]);
    expect(peticion.filtros).toEqual([]);
  });
});

describe("compilar: traducción de cada criterio", () => {
  it("CNAE y sectores van juntos en sector_actividad con su prefijo", () => {
    const { peticion } = compilar(
      { cnae: ["4941", "5210"], sectores: ["Transporte terrestre"] },
      CTX,
    );
    expect(peticion["sector_actividad"]).toEqual([
      "cnae|4941",
      "cnae|5210",
      "icif|Transporte terrestre",
    ]);
  });

  it("las provincias van tal cual las resuelve el catálogo, sin reescribir", () => {
    const { peticion } = compilar(
      { provincias: ["Tenerife"] },
      {
        provincias: ["Canarias|Santa Cruz De Tenerife", "Canarias|Sta. Cruz De Tenerife"],
        ejercicios: EJERCICIOS,
      },
    );
    // Las dos grafías: quedarse con una perdería 8 empresas en silencio.
    expect(peticion["Provincias"]).toEqual([
      "Canarias|Santa Cruz De Tenerife",
      "Canarias|Sta. Cruz De Tenerife",
    ]);
  });

  it("«más de 20 empleados» usa el tope que usa su propio frontend", () => {
    expect(compilar({ empleados: { min: 20 } }, CTX).peticion["empleados"]).toEqual([
      "empleados:20|99999999",
    ]);
  });

  it("un rango de empleados cerrado viaja con sus dos extremos", () => {
    expect(
      compilar({ empleados: { min: 10, max: 49 } }, CTX).peticion["empleados"],
    ).toEqual(["empleados:10|49"]);
  });

  it("«hasta N empleados» arranca en 0, no en null", () => {
    expect(compilar({ empleados: { max: 9 } }, CTX).peticion["empleados"]).toEqual([
      "empleados:0|9",
    ]);
  });

  it("las ventas van como partida sobre los ejercicios resueltos", () => {
    expect(compilar({ ventas: { min: 2_000_000 } }, CTX).peticion["perdidas"]).toEqual([
      "2024,2023|99053-Ventas|2000000|null|1",
    ]);
  });

  it("un rango de ventas cerrado rellena los dos montos", () => {
    expect(
      compilar({ ventas: { min: 1_000_000, max: 5_000_000 } }, CTX).peticion["perdidas"],
    ).toEqual(["2024,2023|99053-Ventas|1000000|5000000|1"]);
  });

  it("EBITDA positivo se pide desde 1 €, porque su filtro incluye el mínimo", () => {
    expect(compilar({ ebitdaPositivo: true }, CTX).peticion["perdidas"]).toEqual([
      "2024,2023|99016-EBITDA|1|null|1",
    ]);
  });

  it("ventas y EBITDA conviven en la misma clave perdidas", () => {
    expect(
      compilar({ ventas: { min: 2_000_000 }, ebitdaPositivo: true }, CTX).peticion[
        "perdidas"
      ],
    ).toEqual([
      "2024,2023|99053-Ventas|2000000|null|1",
      "2024,2023|99016-EBITDA|1|null|1",
    ]);
  });

  it("el tipo de cuenta es siempre 1, individual", () => {
    // Con 0 o con 5 el segmento se desploma de 99.122 a 2.423 empresas.
    const partida = compilar({ ventas: { min: 1 } }, CTX).peticion[
      "perdidas"
    ] as string[];
    expect(partida[0]!.split("|").pop()).toBe("1");
  });

  it("un criterio financiero sin ejercicios no se compila: su API daría 500", () => {
    expect(() => compilar({ ventas: { min: 2_000_000 } }, { ejercicios: [] })).toThrow(
      /ejercicio/i,
    );
    expect(() => compilar({ ebitdaPositivo: true })).toThrow(/ejercicio/i);
    // Sin criterio financiero no hacen falta ejercicios.
    expect(() => compilar({ cnae: ["4941"] })).not.toThrow();
  });

  it("ebitdaPositivo en false no añade filtro", () => {
    const { peticion, pasos } = compilar({ ebitdaPositivo: false, cnae: ["4941"] }, CTX);
    expect(peticion["perdidas"]).toEqual([]);
    expect(pasos.map((p) => p.criterio)).toEqual(["actividad"]);
  });

  it("la antigüedad mínima usa el formato de rango de años", () => {
    expect(compilar({ antiguedadMinAnios: 5 }, CTX).peticion["antiguedad"]).toEqual([
      "ahnos:5|150",
    ]);
  });

  it("antigüedad 0 se compila: es distinto de no filtrar", () => {
    expect(compilar({ antiguedadMinAnios: 0 }, CTX).peticion["antiguedad"]).toEqual([
      "ahnos:0|150",
    ]);
    expect(compilar({}, CTX).peticion["antiguedad"]).toEqual([]);
  });

  it("email y teléfono son campos requeridos, no un filtro más del embudo", () => {
    const { peticion, pasos, camposRequeridos } = compilar(
      { cnae: ["4941"], conEmail: true, conTelefono: true },
      CTX,
    );
    expect(camposRequeridos).toEqual(["Email", "Telefono"]);
    expect(peticion["campos_requeridos"]).toEqual(["Email", "Telefono"]);
    // No son un paso: su API los aplica a todo el embudo a la vez.
    expect(pasos.map((p) => p.criterio)).toEqual(["actividad"]);
  });

  it("conEmail en false no exige nada", () => {
    expect(compilar({ conEmail: false }, CTX).camposRequeridos).toEqual([]);
  });
});

describe("armar: prefijos del embudo", () => {
  const filtro: FiltroSegmento = {
    cnae: ["4941"],
    empleados: { min: 20 },
    ventas: { min: 2_000_000 },
  };
  const contexto = { provincias: TERUEL, ejercicios: EJERCICIOS };

  it("un prefijo solo lleva los criterios hasta ese paso", () => {
    const { pasos, camposRequeridos } = compilar(filtro, contexto);
    const primero = armar(pasos, camposRequeridos, 1);

    expect(primero.filtros).toHaveLength(1);
    expect(primero["sector_actividad"]).toEqual(["cnae|4941"]);
    expect(primero["Provincias"]).toEqual([]);
    expect(primero["empleados"]).toEqual([]);
    expect(primero["perdidas"]).toEqual([]);
  });

  it("el prefijo completo coincide con la petición que devuelve compilar", () => {
    const { pasos, camposRequeridos, peticion } = compilar(filtro, contexto);
    expect(armar(pasos, camposRequeridos)).toEqual(peticion);
  });

  it("los campos requeridos viajan en todos los prefijos", () => {
    const { pasos } = compilar({ ...filtro, conEmail: true }, contexto);
    for (let i = 1; i <= pasos.length; i++) {
      expect(armar(pasos, ["Email"], i)["campos_requeridos"]).toEqual(["Email"]);
    }
  });
});

describe("compilar: el flujo C del guion de demo", () => {
  it("«logística en Valencia y Castellón, más de 20 empleados, sobre 2 M, con correo»", () => {
    const filtro: FiltroSegmento = {
      cnae: ["4941", "5210", "5229"],
      provincias: ["Valencia", "Castellón"],
      empleados: { min: 20 },
      ventas: { min: 2_000_000 },
      conEmail: true,
    };

    const { peticion, pasos } = compilar(filtro, {
      provincias: [
        "Comunitat Valenciana|Valencia/València",
        "Comunitat Valenciana|Castelló",
      ],
      ejercicios: EJERCICIOS,
    });

    expect(pasos.map((p) => p.criterio)).toEqual([
      "actividad",
      "ubicacion",
      "empleados",
      "ventas",
    ]);
    expect(peticion["sector_actividad"]).toEqual(["cnae|4941", "cnae|5210", "cnae|5229"]);
    expect(peticion["empleados"]).toEqual(["empleados:20|99999999"]);
    expect(peticion["perdidas"]).toEqual(["2024,2023|99053-Ventas|2000000|null|1"]);
    expect(peticion["campos_requeridos"]).toEqual(["Email"]);
    expect(peticion.filtros).toHaveLength(4);
  });

  it("el ajuste «quita las de menos de 5 años» añade un paso y nada más", () => {
    const base: FiltroSegmento = { cnae: ["4941"], empleados: { min: 20 } };
    const ajustado: FiltroSegmento = { ...base, antiguedadMinAnios: 5 };

    expect(compilar(base, CTX).pasos).toHaveLength(2);
    expect(compilar(ajustado, CTX).pasos).toHaveLength(3);
    expect(compilar(ajustado, CTX).peticion["antiguedad"]).toEqual(["ahnos:5|150"]);
    expect(compilar(ajustado, CTX).peticion["empleados"]).toEqual(
      compilar(base, CTX).peticion["empleados"],
    );
  });
});
