import { describe, expect, it } from "vitest";
import { claveProvincia } from "./provincias.js";

/**
 * `claveProvincia` solo tiene que garantizar una cosa: que la grafía del usuario
 * y la del INE produzcan la misma clave. Quién casa con qué se prueba contra el
 * catálogo real en `infonif/resumen.test.ts`.
 */

describe("claveProvincia", () => {
  it("iguala la grafía castellana y la del INE", () => {
    const pares: [string, string][] = [
      ["Castellón", "Castelló"],
      ["Lérida", "Lleida"],
      ["Gerona", "Girona"],
      ["Orense", "Ourense"],
      ["Vizcaya", "Bizkaia"],
      ["Guipúzcoa", "Gipuzkoa"],
      ["Álava", "Araba/Álava"],
      ["La Coruña", "Coruña, A"],
      ["Las Palmas", "Palmas, Las"],
      ["La Rioja", "Rioja, La"],
      ["Baleares", "Balears, Illes"],
      ["Alicante", "Alicante/Alacant"],
      ["Valencia", "Valencia/València"],
    ];
    for (const [castellano, ine] of pares) {
      expect(claveProvincia(castellano), `${castellano} vs ${ine}`).toBe(
        claveProvincia(ine),
      );
    }
  });

  it("iguala las dos grafías de Tenerife de sus propios datos", () => {
    expect(claveProvincia("Sta. Cruz De Tenerife")).toBe(
      claveProvincia("Santa Cruz De Tenerife"),
    );
  });

  it("es indiferente a mayúsculas, acentos y espacios", () => {
    expect(claveProvincia("  TERUEL ")).toBe(claveProvincia("Teruel"));
    expect(claveProvincia("almeria")).toBe(claveProvincia("Almería"));
  });

  it("admite el nombre de la capital cuando no hay ambigüedad", () => {
    expect(claveProvincia("Bilbao")).toBe(claveProvincia("Bizkaia"));
    expect(claveProvincia("Pamplona")).toBe(claveProvincia("Navarra"));
    expect(claveProvincia("Santander")).toBe(claveProvincia("Cantabria"));
  });

  it("no confunde provincias distintas", () => {
    expect(claveProvincia("Cáceres")).not.toBe(claveProvincia("Cádiz"));
    expect(claveProvincia("León")).not.toBe(claveProvincia("Lleida"));
    expect(claveProvincia("Valencia")).not.toBe(claveProvincia("Valladolid"));
    expect(claveProvincia("Las Palmas")).not.toBe(claveProvincia("Palencia"));
  });

  it("deja pasar sin tocar lo que no reconoce", () => {
    expect(claveProvincia("Lisboa")).toBe("lisboa");
  });
});
