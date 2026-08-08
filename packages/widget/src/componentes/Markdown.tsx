import { Fragment, type ReactNode } from "react";

/**
 * Markdown mínimo, propio.
 *
 * Dos razones para no meter una librería: el peso del bundle impacta Core Web
 * Vitals en las páginas de ranking, que traen tráfico orgánico (ADR-006); y —más
 * importante— **esto devuelve elementos de React, no HTML**. Nada de
 * `dangerouslySetInnerHTML` sobre texto que ha escrito un modelo de lenguaje.
 *
 * Cubre lo que el agente usa de verdad: párrafos, listas, negrita, cursiva y
 * código. Lo que no entiende lo deja como texto plano, que es lo correcto: es
 * preferible enseñar un asterisco de más que tragarse una etiqueta.
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

  for (const linea of lineas) {
    const limpia = linea.trim();

    if (limpia.length === 0) {
      cerrarParrafo();
      cerrarLista();
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
