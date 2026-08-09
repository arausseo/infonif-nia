import { useEffect, type RefObject } from "react";

/**
 * Hace que un `<textarea>` crezca con lo que se escribe.
 *
 * El alto se mide en dos tiempos y el primero es imprescindible: hay que
 * ponerlo a `auto` antes de leer `scrollHeight`. Si no, el `scrollHeight`
 * incluye el alto que ya tiene puesto y la caja **solo crece** — al borrar
 * texto se queda grande para siempre.
 *
 * El tope lo pone el CSS (`max-height`). La barra se enciende **solo al llegar
 * a ese tope**: dejar `overflow-y: auto` fijo hace que Windows dibuje su barra
 * con flechitas dentro de una caja de una línea, y se ve fatal.
 *
 * `box-sizing: border-box` obliga a sumar los bordes. `scrollHeight` cuenta el
 * relleno pero no el borde, mientras que `height` con border-box sí lo cuenta,
 * y sin ese ajuste la última línea queda cortada por dos píxeles.
 *
 * **Vacío, mide el marcador de posición.** El `placeholder` no cuenta para
 * `scrollHeight`, así que un texto que no quepa en una línea se parte y sale
 * cortado — que es lo que pasaba. Se podría acortar la frase y ya, pero el
 * cajón es responsive (`max-width: calc(100vw - 32px)`): en una pantalla
 * estrecha vuelve a no caber por corta que sea. Midiéndolo, el alto es correcto
 * con cualquier ancho y cualquier redacción.
 *
 * El apaño de meter el marcador en `value` para medirlo y quitarlo no parpadea:
 * pasa dentro del mismo fotograma, antes de pintar. Y solo se hace con el campo
 * vacío, así que no toca el cursor de nadie.
 */
export function useAltoAutomatico(
  referencia: RefObject<HTMLTextAreaElement | null>,
  valor: string,
): void {
  useEffect(() => {
    const campo = referencia.current;
    if (!campo) return;

    const prestado = campo.value === "" && campo.placeholder !== "";
    if (prestado) campo.value = campo.placeholder;

    campo.style.height = "auto";
    const bordes = campo.offsetHeight - campo.clientHeight;
    const deseado = campo.scrollHeight + bordes;

    if (prestado) campo.value = "";

    const tope = parseFloat(getComputedStyle(campo).maxHeight);
    campo.style.overflowY = Number.isFinite(tope) && deseado > tope ? "auto" : "hidden";
    campo.style.height = `${deseado}px`;
  }, [referencia, valor]);
}
