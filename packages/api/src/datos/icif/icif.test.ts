import { describe, expect, it } from "vitest";
import { sinDato } from "../../agente/herramientas/_icif.js";
import { comoLista } from "./tipos.js";

/**
 * Dos piezas, y las dos fallan en silencio si están mal.
 *
 * La normalización XML devuelve un dato incompleto sin quejarse; el traductor de
 * resultados manda al usuario a comprar algo que no necesita. Ninguna de las dos
 * levanta una excepción, así que solo se ven aquí.
 */

describe("comoLista", () => {
  it("envuelve el elemento suelto que devuelve el conversor XML", () => {
    // El caso que rompe en producción y no en las pruebas de nadie: la pyme con
    // un solo administrador. `fast-xml-parser` devuelve el objeto, no un array.
    expect(comoLista({ nombre: "Ana" })).toEqual([{ nombre: "Ana" }]);
  });

  it("deja pasar los arrays tal cual", () => {
    expect(comoLista([{ nombre: "Ana" }, { nombre: "Luis" }])).toHaveLength(2);
  });

  it("convierte ausencia en lista vacía, no en excepción", () => {
    expect(comoLista(undefined)).toEqual([]);
    expect(comoLista(null)).toEqual([]);
  });

  it("no confunde una cadena con una lista de caracteres", () => {
    expect(comoLista("2024")).toEqual(["2024"]);
  });
});

describe("sinDato", () => {
  it("«no hay nada de esto» no es una venta", () => {
    const r = sinDato({ estado: "sinDatos", origenClave: "usuario" }, "los cargos");
    const m = r.paraElModelo as Record<string, unknown>;

    expect(m["motivo"]).toBe("sinDatos");
    expect(m["requiereCompra"]).toBeUndefined();
  });

  it("sin créditos SÍ es una venta, con su SKU", () => {
    const r = sinDato({ estado: "sinCreditos", origenClave: "usuario" }, "los cargos");
    const m = r.paraElModelo as Record<string, unknown>;

    expect(m["motivo"]).toBe("sinCreditos");
    expect(m["requiereCompra"]).toBe(true);
    expect(m["skuSugerido"]).toBe("PLAN_BBDD");
  });

  it("sin credencial NO es una venta: comprar no lo arregla", () => {
    // El error caro. Mandar a recargar créditos a quien solo tiene que iniciar
    // sesión le hace pagar por algo que no le resuelve el problema.
    const r = sinDato({ estado: "sinClave" }, "los cargos");
    const m = r.paraElModelo as Record<string, unknown>;

    expect(m["motivo"]).toBe("sinCredencial");
    expect(m["requiereCompra"]).toBeUndefined();
    expect(String(m["aviso"])).toMatch(/sesión|cuenta/i);
    expect(String(m["aviso"])).toMatch(/NO le ofrezcas comprar/i);
  });

  it("en ningún caso sube el dato al contexto del modelo", () => {
    // Regla 2: lo que sube es una situación, nunca el dato que no se puede dar.
    for (const caso of [
      { estado: "sinDatos", origenClave: "usuario" },
      { estado: "sinCreditos", origenClave: "usuario" },
      { estado: "sinClave" },
    ] as const) {
      const m = sinDato(caso, "los cargos").paraElModelo as Record<string, unknown>;
      expect(m["hayDatos"]).toBe(false);
      expect(m["cargos"]).toBeUndefined();
      expect(m["datos"]).toBeUndefined();
    }
  });
});
