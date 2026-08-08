import { describe, expect, it } from "vitest";
import { PROVINCIAS_ES, resolverProvincia } from "./provincias.js";

describe("provincias", () => {
  it("son 52: las 50 provincias más Ceuta y Melilla", () => {
    expect(PROVINCIAS_ES).toHaveLength(52);
    expect(new Set(PROVINCIAS_ES).size).toBe(52);
  });

  it("resuelve la grafía canónica", () => {
    expect(resolverProvincia("Valencia")).toBe("Valencia");
    expect(resolverProvincia("Castellón")).toBe("Castellón");
  });

  it("tolera minúsculas, espacios y falta de acentos", () => {
    expect(resolverProvincia("  castellon ")).toBe("Castellón");
    expect(resolverProvincia("almeria")).toBe("Almería");
    expect(resolverProvincia("ALAVA")).toBe("Álava");
  });

  it("acepta grafías cooficiales", () => {
    expect(resolverProvincia("Lleida")).toBe("Lérida");
    expect(resolverProvincia("Bizkaia")).toBe("Vizcaya");
    expect(resolverProvincia("A Coruña")).toBe("La Coruña");
    expect(resolverProvincia("Ourense")).toBe("Orense");
  });

  it("devuelve undefined si no identifica nada", () => {
    expect(resolverProvincia("Lisboa")).toBeUndefined();
    expect(resolverProvincia("")).toBeUndefined();
  });
});
