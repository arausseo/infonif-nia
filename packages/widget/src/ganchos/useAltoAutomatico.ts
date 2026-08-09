import { useEffect, type RefObject } from "react";

/**
 * Hace que un `<textarea>` crezca con lo que se escribe.
 *
 * El alto se mide en dos tiempos y el primero es imprescindible: hay que
 * ponerlo a `auto` antes de leer `scrollHeight`. Si no, el `scrollHeight`
 * incluye el alto que ya tiene puesto y la caja **solo crece** — al borrar
 * texto se queda grande para siempre.
 *
 * El tope lo pone el CSS (`max-height`), no este gancho: pasado ese alto el
 * navegador saca su barra y el cajón no se come la conversación.
 *
 * `box-sizing: border-box` obliga a sumar los bordes. `scrollHeight` cuenta el
 * relleno pero no el borde, mientras que `height` con border-box sí lo cuenta,
 * y sin ese ajuste la última línea queda cortada por dos píxeles.
 */
export function useAltoAutomatico(
  referencia: RefObject<HTMLTextAreaElement | null>,
  valor: string,
): void {
  useEffect(() => {
    const campo = referencia.current;
    if (!campo) return;

    campo.style.height = "auto";
    const bordes = campo.offsetHeight - campo.clientHeight;
    campo.style.height = `${campo.scrollHeight + bordes}px`;
  }, [referencia, valor]);
}
