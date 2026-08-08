import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogoCampos, fijarCatalogo } from "./catalogo.js";
import { campoPorNombre, catalogoParaElModelo } from "./precios.js";

/**
 * Lo que se comprueba aquí no es que la descarga funcione —eso depende de la
 * red— sino que **los índices de precios sigan al catálogo cuando cambia**. Si
 * se quedaran pegados al catálogo del arranque, un refresco cambiaría los
 * precios que se cobran pero no los que se enseñan.
 */

const SEMILLA = [...catalogoCampos()];

afterEach(() => {
  fijarCatalogo(SEMILLA, 0);
  vi.restoreAllMocks();
});

describe("catálogo en vivo", () => {
  it("arranca con la copia congelada del repositorio", () => {
    expect(catalogoCampos().length).toBeGreaterThan(30);
    expect(campoPorNombre("EBITDA")?.name).toBe("99016");
  });

  it("los índices se rehacen cuando cambia el catálogo", () => {
    expect(campoPorNombre("Email")?.price).toBe(0.05);

    fijarCatalogo([
      { name: "Email", group: "contacto", label: "Email", price: 0.09 },
      { name: "77777", group: "financieros", label: "Margen bruto", price: 0.5 },
    ]);

    // El precio nuevo, no el memorizado.
    expect(campoPorNombre("Email")?.price).toBe(0.09);
    // Un campo que antes no existía, ahora resoluble por etiqueta.
    expect(campoPorNombre("margen bruto")?.name).toBe("77777");
    // Y uno que ya no está deja de resolver: no se cotiza lo que no se vende.
    expect(campoPorNombre("EBITDA")).toBeUndefined();
    expect(catalogoParaElModelo()).toHaveLength(2);
  });
});

/**
 * Este sí toca la red. Es la comprobación que importa: si Infonif cambia un
 * precio y nuestra copia congelada se queda atrás, aquí salta. Se salta sin red.
 */
describe("contraste con el origen", () => {
  it("la copia congelada coincide con fields.json", { timeout: 20_000 }, async () => {
    let vivo: unknown;
    try {
      const respuesta = await fetch(
        "https://infonif.economia3.com/bases-de-datos/herramienta/fields.json",
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!respuesta.ok) return;
      vivo = await respuesta.json();
    } catch {
      return; // sin red
    }

    const campos = vivo as { name: string; label: string; price: number }[];
    const congelado = new Map(SEMILLA.map((c) => [c.name, c]));

    for (const campo of campos) {
      const previo = congelado.get(campo.name);
      expect(previo, `campo ${campo.name} (${campo.label}) no está en la copia`).toBeDefined();
      expect(previo?.price, `precio de ${campo.label}`).toBe(campo.price);
    }
    expect(campos.length).toBe(SEMILLA.length);
  });
});
