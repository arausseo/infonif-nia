import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { celdas, leerTabla, Markdown } from "./Markdown.js";

const html = (texto: string) => renderToStaticMarkup(createElement(Markdown, { texto }));

describe("tablas en las respuestas", () => {
  const RESPUESTA = [
    "Estos son los cargos vigentes:",
    "| Cargo | Nombre | Desde |",
    "|---|---|---|",
    "| Consejero delegado | INMO ALAMEDA SL | 2023-04-19 |",
    "| Presidente | **JUAN ROIG** | 1990-01-01 |",
    "",
    "¿Quieres ver los históricos?",
  ].join("\n");

  it("pinta una tabla y no funde las filas en el párrafo", () => {
    // El fallo que se corrige: sin línea en blanco entre la frase y la tabla,
    // todo acababa en un <p> con barras.
    const salida = html(RESPUESTA);
    expect(salida).toContain("<table>");
    expect(salida).not.toMatch(/<p>[^<]*\|/);
    expect(salida.match(/<tr>/g)).toHaveLength(3);
    expect(salida).toContain("<p>Estos son los cargos vigentes:</p>");
    expect(salida).toContain("<p>¿Quieres ver los históricos?</p>");
  });

  it("aplica negrita dentro de las celdas", () => {
    expect(html(RESPUESTA)).toContain("<strong>JUAN ROIG</strong>");
  });

  it("va dentro de un contenedor que desplaza, para no ensanchar el cajón", () => {
    expect(html(RESPUESTA)).toMatch(/<div class="nia-tabla"[^>]*><table>/);
  });

  it("alinea a la derecha las columnas de cifras aunque el modelo no lo pida", () => {
    const salida = html(
      [
        "| Partida | 2024 | 2023 |",
        "|---|---|---|",
        "| Ventas | 38.835.000 € | 35.527.000 € |",
        "| Resultado | 1.378.000 € | — |",
      ].join("\n"),
    );
    expect(salida).toMatch(/<td style="text-align:right" class="nia-cifra">38\.835\.000 €/);
    // La columna de texto no.
    expect(salida).toMatch(/<td>Ventas<\/td>/);
  });

  it("las fechas no se parten por el guion ni se alinean como cifras", () => {
    const salida = html(
      ["| Cargo | Desde |", "|---|---|", "| Presidente | 2023-04-19 |", "| Consejero | — |"].join(
        "\n",
      ),
    );
    expect(salida).toContain('<td class="nia-compacto">2023-04-19</td>');
  });

  it("respeta las alineaciones explícitas del separador", () => {
    const tabla = leerTabla(["| a | b | c |", "|:--|:-:|--:|"], 0);
    expect(tabla?.alineaciones).toEqual(["left", "center", "right"]);
  });

  it("completa filas cortas y recorta las largas", () => {
    const tabla = leerTabla(["| a | b |", "|---|---|", "| 1 |", "| 1 | 2 | 3 |"], 0);
    expect(tabla?.filas).toEqual([
      ["1", ""],
      ["1", "2"],
    ]);
  });

  it("respeta las barras escapadas dentro de una celda", () => {
    expect(celdas("| A \\| B | C |")).toEqual(["A | B", "C"]);
  });

  it("no convierte en tabla una frase que contiene una barra", () => {
    expect(html("Ventas | resultado del ejercicio")).not.toContain("<table>");
  });

  it("no convierte en tabla una línea con barra que no lleva separador", () => {
    expect(html("| esto no es una tabla\ny esto tampoco")).not.toContain("<table>");
  });
});

describe("tablas mientras llegan por streaming", () => {
  // El texto se repinta cada 50 ms con lo que haya llegado. Si en algún paso la
  // cabecera se pintara como texto, se vería parpadear.
  const pasos = [
    "Cargos:\n| Cargo | Nombre |",
    "Cargos:\n| Cargo | Nombre |\n",
    "Cargos:\n| Cargo | Nombre |\n|",
    "Cargos:\n| Cargo | Nombre |\n|--",
    "Cargos:\n| Cargo | Nombre |\n|---|---|",
    "Cargos:\n| Cargo | Nombre |\n|---|---|\n| Presidente | JUAN",
  ];

  for (const paso of pasos) {
    it(`es tabla en todo momento: ${JSON.stringify(paso.slice(8))}`, () => {
      const salida = html(paso);
      expect(salida).toContain("<table>");
      expect(salida).not.toMatch(/<p>[^<]*\|/);
    });
  }
});
