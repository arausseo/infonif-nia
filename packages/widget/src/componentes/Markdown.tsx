import { Fragment, type ReactNode } from "react";

/**
 * Markdown mínimo, propio.
 *
 * Dos razones para no meter una librería: el peso del bundle impacta Core Web
 * Vitals en las páginas de ranking, que traen tráfico orgánico (ADR-006); y —más
 * importante— **esto devuelve elementos de React, no HTML**. Nada de
 * `dangerouslySetInnerHTML` sobre texto que ha escrito un modelo de lenguaje.
 *
 * Cubre lo que el agente usa de verdad: párrafos, listas, títulos, tablas,
 * negrita, cursiva y código. Lo que no entiende lo deja como texto plano, que es
 * lo correcto: es preferible enseñar un asterisco de más que tragarse una
 * etiqueta.
 */

export function Markdown({ texto }: { texto: string }) {
  return <>{bloques(texto)}</>;
}

function bloques(texto: string): ReactNode[] {
  const salida: ReactNode[] = [];
  const lineas = texto.split("\n");

  let parrafo: string[] = [];
  let lista: { texto: string; ordenada: boolean }[] = [];

  const cerrarParrafo = () => {
    if (parrafo.length === 0) return;
    salida.push(<p key={`p${salida.length}`}>{enLinea(parrafo.join(" "))}</p>);
    parrafo = [];
  };

  const cerrarLista = () => {
    if (lista.length === 0) return;
    const ordenada = lista[0]?.ordenada ?? false;
    const elementos = lista.map((item, i) => <li key={i}>{enLinea(item.texto)}</li>);
    salida.push(
      ordenada ? (
        <ol key={`l${salida.length}`}>{elementos}</ol>
      ) : (
        <ul key={`l${salida.length}`}>{elementos}</ul>
      ),
    );
    lista = [];
  };

  for (let i = 0; i < lineas.length; i++) {
    const limpia = (lineas[i] ?? "").trim();

    if (limpia.length === 0) {
      cerrarParrafo();
      cerrarLista();
      continue;
    }

    // La tabla se mira ANTES que el párrafo: el modelo suele escribirla pegada a
    // la frase que la presenta, sin línea en blanco, y entonces las filas
    // acababan fundidas en el párrafo como «| Cargo | Nombre | |---|---| …».
    const tabla = leerTabla(lineas, i);
    if (tabla) {
      cerrarParrafo();
      cerrarLista();
      salida.push(<Tabla key={`t${salida.length}`} tabla={tabla} />);
      i = tabla.hasta;
      continue;
    }

    const vineta = /^[-*•]\s+(.*)$/.exec(limpia);
    const numerada = /^\d+[.)]\s+(.*)$/.exec(limpia);

    if (vineta ?? numerada) {
      cerrarParrafo();
      lista.push({
        texto: (vineta?.[1] ?? numerada?.[1]) as string,
        ordenada: numerada !== null,
      });
      continue;
    }

    const titulo = /^#{1,6}\s+(.*)$/.exec(limpia);
    if (titulo) {
      cerrarParrafo();
      cerrarLista();
      salida.push(<h4 key={`h${salida.length}`}>{enLinea(titulo[1] as string)}</h4>);
      continue;
    }

    cerrarLista();
    parrafo.push(limpia);
  }

  cerrarParrafo();
  cerrarLista();
  return salida;
}

// ─── Tablas ─────────────────────────────────────────────────────────────────

type Alineacion = "left" | "center" | "right" | undefined;

export interface TablaLeida {
  cabecera: string[];
  alineaciones: Alineacion[];
  filas: string[][];
  /** Índice de la última línea consumida. */
  hasta: number;
}

/** `|---|:---:|--:|`, también a medio escribir mientras llega por streaming. */
const SEPARADOR = /^\|?\s*:?-+:?\s*(\|\s*:?-*:?\s*)*\|?$/;

/**
 * Lee una tabla estilo GitHub a partir de la línea `desde`, o `undefined` si no
 * hay una.
 *
 * Solo se reconoce con barra inicial (`| a | b |`). GFM admite tablas sin ella,
 * pero entonces cualquier frase con una barra —«ventas | resultado»— se
 * convertiría en tabla. El modelo siempre la pone, así que no se pierde nada.
 *
 * **Pensada para el streaming.** El texto se repinta cada 50 ms con lo que haya
 * llegado, así que la tabla se ve crecer: primero la cabecera sola, luego el
 * separador a medias, luego las filas. Si la cabecera fuese texto hasta que
 * llegue el separador, el usuario vería barras parpadear y convertirse en tabla
 * de golpe. Por eso una cabecera en la ÚLTIMA línea ya se pinta como tabla
 * vacía.
 */
export function leerTabla(lineas: readonly string[], desde: number): TablaLeida | undefined {
  const cabeceraCruda = (lineas[desde] ?? "").trim();
  if (!cabeceraCruda.startsWith("|")) return undefined;

  const cabecera = celdas(cabeceraCruda);
  if (cabecera.length === 0) return undefined;

  const siguiente = lineas[desde + 1]?.trim();

  // Cabecera recién llegada, sin nada detrás todavía.
  if (siguiente === undefined) {
    return { cabecera, alineaciones: cabecera.map(() => undefined), filas: [], hasta: desde };
  }

  // El separador está llegando: «», «|», «|--»… Es la última línea y solo tiene
  // caracteres de separador. Sin esto la cabecera parpadea como texto.
  const esUltima = desde + 1 === lineas.length - 1;
  if (esUltima && /^[|:\-\s]*$/.test(siguiente) && !SEPARADOR.test(siguiente)) {
    return {
      cabecera,
      alineaciones: cabecera.map(() => undefined),
      filas: [],
      hasta: desde + 1,
    };
  }

  if (!SEPARADOR.test(siguiente) || !siguiente.includes("-")) return undefined;

  const marcas = celdas(siguiente);
  const alineaciones = cabecera.map((_, i) => alineacion(marcas[i]));

  const filas: string[][] = [];
  let hasta = desde + 1;
  for (let j = desde + 2; j < lineas.length; j++) {
    const fila = (lineas[j] ?? "").trim();
    if (!fila.startsWith("|")) break;
    const valores = celdas(fila);
    // Filas cortas se completan y las largas se recortan: una celda de más
    // desplazaría todas las columnas de esa fila.
    filas.push(cabecera.map((_, k) => valores[k] ?? ""));
    hasta = j;
  }

  return { cabecera, alineaciones, filas, hasta };
}

/** Parte una fila por las barras que no estén escapadas (`\|`). */
export function celdas(fila: string): string[] {
  let interior = fila.trim();
  if (interior.startsWith("|")) interior = interior.slice(1);
  if (interior.endsWith("|") && !interior.endsWith("\\|")) interior = interior.slice(0, -1);

  const partes: string[] = [];
  let actual = "";
  for (let i = 0; i < interior.length; i++) {
    const c = interior[i];
    if (c === "\\" && interior[i + 1] === "|") {
      actual += "|";
      i++;
    } else if (c === "|") {
      partes.push(actual.trim());
      actual = "";
    } else {
      actual += c;
    }
  }
  partes.push(actual.trim());
  return partes;
}

function alineacion(marca: string | undefined): Alineacion {
  if (!marca) return undefined;
  const izquierda = marca.startsWith(":");
  const derecha = marca.endsWith(":");
  if (izquierda && derecha) return "center";
  if (derecha) return "right";
  if (izquierda) return "left";
  return undefined;
}

/**
 * ¿Parece una cifra? Se alinea a la derecha aunque el modelo no lo pida: en una
 * columna de importes, «4.200.000 €» y «85.000 €» alineados a la izquierda no se
 * pueden comparar de un vistazo, que es para lo que existe la tabla.
 */
const CIFRA = /^[-+−]?[\d.,\s]+\s*(%|€|m€|M€|k€|mill\.?|millones)?$/i;

/**
 * Fechas: no se alinean a la derecha, pero tampoco se pueden partir. El guion es
 * un punto de corte legal para el navegador, y en una columna estrecha salía
 * «2023-04-» en una línea y «19» en la siguiente.
 */
const FECHA = /^(\d{4}-\d{2}(-\d{2})?|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})$/;

/** ¿Todas las celdas no vacías de la columna `k` cumplen el patrón? */
function columnaEs(tabla: TablaLeida, k: number, patron: RegExp): boolean {
  let alguna = false;
  for (const fila of tabla.filas) {
    const v = (fila[k] ?? "").replace(/\*\*/g, "").trim();
    if (v === "" || v === "—" || v === "-") continue;
    if (!patron.test(v)) return false;
    alguna = true;
  }
  return alguna;
}

function Tabla({ tabla }: { tabla: TablaLeida }) {
  const numericas = tabla.cabecera.map((_, k) => columnaEs(tabla, k, CIFRA));
  const fechas = tabla.cabecera.map((_, k) => !numericas[k] && columnaEs(tabla, k, FECHA));

  const alinear = (k: number): Alineacion =>
    tabla.alineaciones[k] ?? (numericas[k] ? "right" : undefined);

  return (
    // El contenedor es el que desplaza, no la tabla: el cajón mide 400 px y una
    // tabla de cinco columnas no cabe. Sin esto empujaba el cajón entero.
    <div className="nia-tabla" role="region" aria-label="Tabla" tabIndex={0}>
      <table>
        <thead>
          <tr>
            {tabla.cabecera.map((celda, k) => (
              <th key={k} style={{ textAlign: alinear(k) }} scope="col">
                {enLinea(celda)}
              </th>
            ))}
          </tr>
        </thead>
        {tabla.filas.length > 0 && (
          <tbody>
            {tabla.filas.map((fila, j) => (
              <tr key={j}>
                {fila.map((celda, k) => (
                  <td
                    key={k}
                    style={{ textAlign: alinear(k) }}
                    className={
                      numericas[k] ? "nia-cifra" : fechas[k] ? "nia-compacto" : undefined
                    }
                  >
                    {enLinea(celda)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

// ─── En línea ───────────────────────────────────────────────────────────────

/**
 * Negrita, cursiva y código dentro de una línea.
 *
 * Un solo recorrido con una expresión alternada. Lo importante: si el markdown
 * llega a medias —`**sin cerrar`, que pasa constantemente mientras se
 * transmite— no casa y se muestra tal cual, sin romper nada.
 */
const MARCAS = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|`[^`\n]+`)/g;

function enLinea(texto: string): ReactNode[] {
  const trozos = texto.split(MARCAS).filter((t) => t.length > 0);

  return trozos.map((trozo, i) => {
    if (/^\*\*[^*]+\*\*$/.test(trozo) || /^__[^_]+__$/.test(trozo)) {
      return <strong key={i}>{trozo.slice(2, -2)}</strong>;
    }
    if (/^\*[^*\n]+\*$/.test(trozo)) return <em key={i}>{trozo.slice(1, -1)}</em>;
    if (/^`[^`\n]+`$/.test(trozo)) return <code key={i}>{trozo.slice(1, -1)}</code>;
    return <Fragment key={i}>{trozo}</Fragment>;
  });
}
