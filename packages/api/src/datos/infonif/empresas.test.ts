import { describe, expect, it } from "vitest";
import { deduplicar } from "./empresas.js";
import type { EmpresaAutocomplete } from "./tipos.js";
import muestra from "../fixtures/infonif/ejemplo-busqueda.json";

const FILAS = muestra.empresas as EmpresaAutocomplete[];

describe("deduplicar resultados de búsqueda", () => {
  it("un NIF repetido sale una sola vez", () => {
    // En la muestra, RENFE MERCANCIAS aparece dos veces con el mismo NIF.
    expect(FILAS.filter((f) => f.nif === "A86868114")).toHaveLength(2);
    const empresas = deduplicar(FILAS);
    expect(empresas.filter((e) => e.nif === "A86868114")).toHaveLength(1);
  });

  it("se queda con la denominación vigente (ea = 1)", () => {
    const renfe = deduplicar(FILAS).find((e) => e.nif === "A86868114");
    expect(renfe?.razonSocial).toBe("RENFE MERCANCIAS SOCIEDAD MERCANTIL ESTATAL SA");
  });

  it("conserva las denominaciones anteriores para poder desambiguar", () => {
    const renfe = deduplicar(FILAS).find((e) => e.nif === "A86868114");
    expect(renfe?.denominacionesAnteriores).toEqual(["RENFE MERCANCIAS SA"]);
  });

  it("ordena por relevancia", () => {
    const puntos = deduplicar(FILAS).map((e) => e.relevancia ?? 0);
    expect([...puntos].sort((a, b) => b - a)).toEqual(puntos);
  });

  it("si ninguna fila declara ea, se queda con la de más relevancia", () => {
    const filas: EmpresaAutocomplete[] = [
      { nif: "B1", rs: "SEGUNDA SL", pts: 5 },
      { nif: "B1", rs: "PRIMERA SL", pts: 9 },
    ];
    const [empresa] = deduplicar(filas);
    expect(empresa?.razonSocial).toBe("PRIMERA SL");
    expect(empresa?.denominacionesAnteriores).toEqual(["SEGUNDA SL"]);
  });

  it("no duplica una denominación anterior repetida", () => {
    const filas: EmpresaAutocomplete[] = [
      { nif: "B1", rs: "VIGENTE SL", ea: 1 },
      { nif: "B1", rs: "ANTIGUA SL", ea: 0 },
      { nif: "B1", rs: "ANTIGUA SL", ea: 0 },
    ];
    expect(deduplicar(filas)[0]?.denominacionesAnteriores).toEqual(["ANTIGUA SL"]);
  });

  it("normaliza los campos vacíos a undefined en vez de arrastrar null", () => {
    const sinLogo = deduplicar(FILAS).find((e) => e.nif === "B05558929");
    expect(sinLogo?.logo).toBeUndefined();
    expect(sinLogo?.provincia).toBe("MURCIA");
  });

  it("prefiere el logo grande cuando hay los dos", () => {
    const mercadona = deduplicar(FILAS).find((e) => e.nif === "A46103834");
    expect(mercadona?.logo).toBe(
      "https://infonif.economia3.com/images/logo-empresas/nif-46103834.gif",
    );
  });

  it("una lista vacía no revienta", () => {
    expect(deduplicar([])).toEqual([]);
  });
});
