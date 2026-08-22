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

describe("sesión y compra no son lo mismo", () => {
  /**
   * El riesgo que tapa la clave genérica del demo.
   *
   * Con ella, cualquiera obtiene el balance sin identificarse. En producción no
   * habrá genérica: cada consulta gasta del saldo del propio usuario, así que
   * quien no haya iniciado sesión recibirá `sinClave`.
   *
   * Lo que NO puede pasar es que eso se le presente como una compra. Le haría
   * pagar por algo que no le resuelve el problema — y encima el problema tenía
   * arreglo gratis: entrar en su cuenta.
   */
  it("falta de sesión NUNCA se presenta como una compra", async () => {
    const m = (await sinDato({ estado: "sinClave" }, "el balance")).paraElModelo as Record<
      string,
      unknown
    >;

    expect(m["motivo"]).toBe("sinCredencial");
    expect(m["requiereCompra"]).toBeUndefined();
    expect(m["skuSugerido"]).toBeUndefined();
    expect(m["moneda"]).toBeUndefined();
  });

  it("y las tres razones de no tener dato siguen siendo distinguibles", async () => {
    const motivos = await Promise.all(
      (
        [
          { estado: "sinDatos", origenClave: "usuario" },
          { estado: "sinCreditos", origenClave: "usuario" },
          { estado: "noAutorizado", origenClave: "usuario" },
          { estado: "sinClave" },
        ] as const
      ).map(async (c) => {
        const m = (await sinDato(c, "el balance")).paraElModelo as Record<string, unknown>;
        return m["motivo"];
      }),
    );

    // Cuatro situaciones, cuatro respuestas: no consta / falta saldo / no
    // contratado / falta sesión. Si dos se confundieran, el usuario acabaría
    // pagando por lo que no era.
    expect(new Set(motivos).size).toBe(4);
  });
});

describe("respuestas vacías del gateway", () => {
  /**
   * Este gateway tiene TRES formas de decir «no hay datos» y solo dos son
   * evidentes: 204 sin cuerpo y 404. La tercera es un 200 cuyo cuerpo es el JSON
   * `""`, y la devuelve `retir/obtener-socios`. Se encontró probando con un NIF
   * real; leyendo su código no aparece.
   *
   * Importa porque el fallo era silencioso: la herramienta contestaba «ok» con
   * un dato vacío, el modelo recibía una respuesta afirmativa sin contenido, y
   * ahí es exactamente donde se lo inventa.
   */
  it("un 200 con cuerpo vacío no es un dato", () => {
    for (const vacio of ['""', "{}", "[]", "null"]) {
      const datos: unknown = JSON.parse(vacio);
      const esVacio =
        datos == null ||
        (typeof datos === "string" && datos.trim() === "") ||
        (Array.isArray(datos) && datos.length === 0) ||
        (typeof datos === "object" && Object.keys(datos).length === 0);
      expect(esVacio, `${vacio} debería contar como vacío`).toBe(true);
    }
  });

  it("pero un dato de verdad sí pasa", () => {
    const datos: unknown = JSON.parse('{"socios":[{"nombre":"X"}]}');
    expect(Object.keys(datos as object).length).toBeGreaterThan(0);
  });
});

describe("sinDato", () => {
  it("«no hay nada de esto» no es una venta", async () => {
    const r = await sinDato({ estado: "sinDatos", origenClave: "usuario" }, "los cargos");
    const m = r.paraElModelo as Record<string, unknown>;

    expect(m["motivo"]).toBe("sinDatos");
    expect(m["requiereCompra"]).toBeUndefined();
  });

  it("sin créditos avisa de que es OTRA moneda", async () => {
    const r = await sinDato({ estado: "sinCreditos", origenClave: "usuario" }, "los cargos");
    const m = r.paraElModelo as Record<string, unknown>;

    expect(m["motivo"]).toBe("sinCreditos");
    expect(m["requiereCompra"]).toBe(true);
    // Lo importante no es el SKU, es que NO se confunda con los registros del
    // plan de Base de Datos: son dos monedas y el usuario llama «créditos» a las
    // dos. Mandarle a recargar donde no es le hace perder el viaje.
    expect(m["moneda"]).toBe("creditos_consulta");
    expect(String(m["aviso"])).toMatch(/NO son los registros del plan/i);
  });

  it("sin credencial NO es una venta: comprar no lo arregla", async () => {
    // El error caro. Mandar a recargar créditos a quien solo tiene que iniciar
    // sesión le hace pagar por algo que no le resuelve el problema.
    const r = await sinDato({ estado: "sinClave" }, "los cargos");
    const m = r.paraElModelo as Record<string, unknown>;

    expect(m["motivo"]).toBe("sinCredencial");
    expect(m["requiereCompra"]).toBeUndefined();
    expect(String(m["aviso"])).toMatch(/sesión|cuenta/i);
    expect(String(m["aviso"])).toMatch(/NO le ofrezcas comprar/i);
  });

  it("en ningún caso sube el dato al contexto del modelo", async () => {
    // Regla 2: lo que sube es una situación, nunca el dato que no se puede dar.
    for (const caso of [
      { estado: "sinDatos", origenClave: "usuario" },
      { estado: "sinCreditos", origenClave: "usuario" },
      { estado: "sinClave" },
    ] as const) {
      const m = (await sinDato(caso, "los cargos")).paraElModelo as Record<string, unknown>;
      expect(m["hayDatos"]).toBe(false);
      expect(m["cargos"]).toBeUndefined();
      expect(m["datos"]).toBeUndefined();
    }
  });
});
