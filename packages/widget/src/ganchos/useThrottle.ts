import { useEffect, useRef, useState } from "react";

/**
 * Deja pasar un valor como mucho cada `ms`.
 *
 * El texto llega token a token. Parsear markdown en cada uno es caro, y además
 * el markdown a medias —`**sin cerrar`— se ve mal si se pinta en cada
 * fotograma. Con ~50 ms el ojo no nota el escalón y el trabajo se reduce mucho
 * (CONTRATOS §6).
 *
 * El último valor siempre acaba mostrándose: si el stream para justo después de
 * un token, no se queda a medias.
 */
export function useThrottle<T>(valor: T, ms = 50): T {
  const [visible, setVisible] = useState(valor);
  const ultimo = useRef(0);
  const pendiente = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const desde = Date.now() - ultimo.current;

    if (desde >= ms) {
      ultimo.current = Date.now();
      setVisible(valor);
      return;
    }

    if (pendiente.current) clearTimeout(pendiente.current);
    pendiente.current = setTimeout(() => {
      ultimo.current = Date.now();
      setVisible(valor);
    }, ms - desde);

    return () => {
      if (pendiente.current) clearTimeout(pendiente.current);
    };
  }, [valor, ms]);

  return visible;
}
