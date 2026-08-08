import { useCallback, useEffect, useRef, useState } from "react";

/** Margen para dar por bueno que el usuario está pegado al fondo. */
const MARGEN = 100;

/**
 * Autoscroll solo si el usuario NO se ha ido a leer hacia arriba.
 *
 * Arrastrar la vista mientras alguien relee una respuesta anterior es de las
 * cosas que más molestan de un chat. Si se ha separado del fondo, se deja de
 * seguir y se le ofrece una píldora «↓ nuevo» (CONTRATOS §6).
 */
export function useAutoscroll<T extends HTMLElement>(dependencia: unknown) {
  const referencia = useRef<T | null>(null);
  const pegado = useRef(true);
  const [hayNuevo, setHayNuevo] = useState(false);

  const alDesplazar = useCallback(() => {
    const nodo = referencia.current;
    if (!nodo) return;
    const distancia = nodo.scrollHeight - nodo.scrollTop - nodo.clientHeight;
    pegado.current = distancia <= MARGEN;
    if (pegado.current) setHayNuevo(false);
  }, []);

  useEffect(() => {
    const nodo = referencia.current;
    if (!nodo) return;

    if (pegado.current) {
      nodo.scrollTop = nodo.scrollHeight;
    } else {
      setHayNuevo(true);
    }
  }, [dependencia]);

  const irAlFondo = useCallback(() => {
    const nodo = referencia.current;
    if (!nodo) return;
    nodo.scrollTo({ top: nodo.scrollHeight, behavior: "smooth" });
    pegado.current = true;
    setHayNuevo(false);
  }, []);

  return { referencia, alDesplazar, hayNuevo, irAlFondo };
}
