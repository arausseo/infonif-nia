const fs = require("fs");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  BorderStyle,
  LevelFormat,
  PageBreak,
  Footer,
  PageNumber,
} = require("docx");

const ENTRADA = process.argv[2];
const SALIDA = process.argv[3];

// A4 (11906 dxa) menos 1134 dxa (2 cm) de margen a cada lado.
const ANCHO = 11906 - 2268;

const TINTA = "1A1A1A";
const ACENTO = "4A3AA8"; // el violeta de la marca, algo más oscuro para papel
const GRIS = "5B6072";
const BORDE = "D8DAE5";
const FONDO_CODIGO = "F5F5F9";

// ─── Formato en línea ────────────────────────────────────────────────────────

/** Convierte **negrita**, `código` y *cursiva* en TextRuns. */
function runs(texto, base = {}) {
  const salida = [];
  const patron = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let ultimo = 0;
  let m;

  while ((m = patron.exec(texto)) !== null) {
    if (m.index > ultimo) {
      salida.push(new TextRun({ text: texto.slice(ultimo, m.index), ...base }));
    }
    const t = m[0];
    if (t.startsWith("**")) {
      salida.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    } else if (t.startsWith("`")) {
      salida.push(
        new TextRun({
          text: t.slice(1, -1),
          font: "Consolas",
          size: 19,
          color: ACENTO,
          ...base,
        }),
      );
    } else {
      salida.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    }
    ultimo = m.index + t.length;
  }
  if (ultimo < texto.length) {
    salida.push(new TextRun({ text: texto.slice(ultimo), ...base }));
  }
  return salida.length ? salida : [new TextRun({ text: "", ...base })];
}

// ─── Bloques ─────────────────────────────────────────────────────────────────

function parrafo(texto, extra = {}) {
  return new Paragraph({
    children: runs(texto),
    spacing: { after: 160, line: 300 },
    alignment: AlignmentType.JUSTIFIED,
    ...extra,
  });
}

function encabezado(texto, nivel) {
  const tamanos = { 1: 40, 2: 28, 3: 23 };
  return new Paragraph({
    children: [
      new TextRun({
        text: texto,
        bold: true,
        size: tamanos[nivel],
        color: nivel === 3 ? TINTA : ACENTO,
        font: "Calibri Light",
      }),
    ],
    heading:
      nivel === 1
        ? HeadingLevel.HEADING_1
        : nivel === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3,
    spacing: { before: nivel === 2 ? 360 : 260, after: nivel === 2 ? 180 : 120 },
    ...(nivel === 2
      ? {
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDE, space: 6 },
          },
        }
      : {}),
  });
}

/** Bloque preformateado: los diagramas de la documentación. */
function codigo(lineas) {
  return lineas.map(
    (l, i) =>
      new Paragraph({
        children: [
          new TextRun({ text: l || " ", font: "Consolas", size: 17, color: TINTA }),
        ],
        spacing: {
          before: i === 0 ? 120 : 0,
          after: i === lineas.length - 1 ? 200 : 0,
          line: 240,
        },
        shading: { type: ShadingType.CLEAR, fill: FONDO_CODIGO },
        indent: { left: 220, right: 220 },
      }),
  );
}

function tabla(filas) {
  const columnas = filas[0].length;
  // Primera columna más estrecha: en todas las tablas del documento es la clave.
  const anchos =
    columnas === 2
      ? [Math.round(ANCHO * 0.32), ANCHO - Math.round(ANCHO * 0.32)]
      : Array.from({ length: columnas }, (_, i) =>
          i === 0
            ? Math.round(ANCHO * 0.24)
            : Math.round((ANCHO - Math.round(ANCHO * 0.24)) / (columnas - 1)),
        );
  // Que sumen exactamente el ancho, pase lo que pase con el redondeo.
  anchos[anchos.length - 1] = ANCHO - anchos.slice(0, -1).reduce((a, b) => a + b, 0);

  return new Table({
    columnWidths: anchos,
    width: { size: ANCHO, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: BORDE },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: filas.map(
      (fila, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: fila.map(
            (celda, j) =>
              new TableCell({
                width: { size: anchos[j], type: WidthType.DXA },
                shading:
                  i === 0 ? { type: ShadingType.CLEAR, fill: "EEEAFB" } : undefined,
                margins: { top: 90, bottom: 90, left: 130, right: 130 },
                children: [
                  new Paragraph({
                    children: runs(celda, i === 0 ? { bold: true } : {}),
                    spacing: { after: 0, line: 260 },
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

// ─── Traducción del markdown ─────────────────────────────────────────────────

const lineas = fs.readFileSync(ENTRADA, "utf8").split(/\r?\n/);
const hijos = [];
let i = 0;
let titulo = "";
let subtitulo = "";

/** ¿Esta línea abre un bloque propio (encabezado, tabla, lista, código)? */
function abreBloque(l) {
  return (
    /^#{1,6}\s/.test(l) ||
    l.startsWith("|") ||
    l.startsWith("```") ||
    l.startsWith("- ") ||
    /^\d+\.\s/.test(l) ||
    l.trim() === "---"
  );
}

function acumularParrafo() {
  // La primera línea SIEMPRE se consume: si no, un párrafo que empieza por
  // acento grave —«`icif-apigw` es un API Gateway…»— no lo recoge ninguna rama
  // y el bucle principal se queda dando vueltas sin avanzar.
  const trozos = [lineas[i].trim()];
  i++;
  while (i < lineas.length && lineas[i].trim() !== "" && !abreBloque(lineas[i])) {
    trozos.push(lineas[i].trim());
    i++;
  }
  return trozos.join(" ");
}

while (i < lineas.length) {
  const antes = i;
  const l = lineas[i];

  if (l.startsWith("# ")) {
    titulo = l.slice(2).trim();
    i++;
    continue;
  }

  if (l.startsWith("## ")) {
    hijos.push(encabezado(l.slice(3).trim(), 2));
    i++;
    continue;
  }

  if (l.startsWith("### ")) {
    hijos.push(encabezado(l.slice(4).trim(), 3));
    i++;
    continue;
  }

  // Separadores: el diseño ya separa con los encabezados.
  if (l.trim() === "---") {
    i++;
    continue;
  }

  if (l.startsWith("```")) {
    i++;
    const bloque = [];
    while (i < lineas.length && !lineas[i].startsWith("```")) {
      bloque.push(lineas[i]);
      i++;
    }
    i++;
    hijos.push(...codigo(bloque));
    continue;
  }

  if (l.startsWith("|")) {
    const filas = [];
    while (i < lineas.length && lineas[i].startsWith("|")) {
      const cruda = lineas[i];
      i++;
      if (/^\|[\s:|-]+\|$/.test(cruda.trim())) continue; // separador de cabecera
      filas.push(
        cruda
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim()),
      );
    }
    hijos.push(tabla(filas));
    hijos.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    continue;
  }

  if (l.startsWith("- ")) {
    let texto = l.slice(2).trim();
    i++;
    while (i < lineas.length && /^\s{2,}\S/.test(lineas[i])) {
      texto += " " + lineas[i].trim();
      i++;
    }
    hijos.push(
      new Paragraph({
        children: runs(texto),
        numbering: { reference: "vinetas", level: 0 },
        spacing: { after: 100, line: 290 },
      }),
    );
    continue;
  }

  if (/^\d+\.\s/.test(l)) {
    let texto = l.replace(/^\d+\.\s/, "").trim();
    i++;
    while (i < lineas.length && /^\s{2,}\S/.test(lineas[i])) {
      texto += " " + lineas[i].trim();
      i++;
    }
    hijos.push(
      new Paragraph({
        children: runs(texto),
        numbering: { reference: "numeros", level: 0 },
        spacing: { after: 120, line: 290 },
      }),
    );
    continue;
  }

  if (l.trim() === "") {
    i++;
    continue;
  }

  const texto = acumularParrafo();
  if (i === antes) i++; // nunca quedarse sin avanzar
  // Las dos primeras líneas sueltas tras el título son el subtítulo.
  if (!subtitulo && hijos.length === 0) {
    subtitulo = texto;
    continue;
  }
  if (texto) hijos.push(parrafo(texto));
}

// ─── Portada ─────────────────────────────────────────────────────────────────

const portada = [
  new Paragraph({ text: "", spacing: { after: 2200 } }),
  new Paragraph({
    children: [
      new TextRun({ text: "Nia", bold: true, size: 88, color: ACENTO, font: "Calibri Light" }),
    ],
    spacing: { after: 60 },
  }),
  new Paragraph({
    children: [
      new TextRun({
        text: "Descripción técnica de la solución",
        size: 40,
        color: TINTA,
        font: "Calibri Light",
      }),
    ],
    spacing: { after: 200 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: ACENTO, space: 10 },
    },
  }),
  new Paragraph({
    children: [
      new TextRun({
        text: "Agente conversacional para el portal de información mercantil de Infonif",
        size: 24,
        color: GRIS,
      }),
    ],
    spacing: { before: 240, after: 120 },
  }),
  new Paragraph({
    children: [
      new TextRun({ text: subtitulo || "", size: 21, color: GRIS, italics: true }),
    ],
    spacing: { after: 3200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Gedesco", bold: true, size: 22, color: TINTA })],
    spacing: { after: 40 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Agosto de 2026", size: 20, color: GRIS })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

const doc = new Document({
  creator: "Gedesco",
  title: titulo || "Nia — descripción técnica de la solución",
  description: "Descripción técnica de la solución Nia para Infonif",
  numbering: {
    config: [
      {
        reference: "vinetas",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 460, hanging: 240 } },
              run: { color: ACENTO },
            },
          },
        ],
      },
      {
        reference: "numeros",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 460, hanging: 280 } },
              run: { bold: true, color: ACENTO },
            },
          },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 21, color: TINTA } },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1418, right: 1134, bottom: 1418, left: 1134 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Nia · Descripción técnica    ", size: 16, color: GRIS }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRIS }),
              ],
            }),
          ],
        }),
      },
      children: [...portada, ...hijos],
    },
  ],
});

Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(SALIDA, b);
  console.log(`escrito: ${SALIDA} (${Math.round(b.length / 1024)} KB)`);
});
