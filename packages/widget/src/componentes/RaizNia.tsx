import type { ReactNode } from "react";

/**
 * El contenedor que lleva los tokens y la tipografía.
 *
 * Es el mismo `<div class="nia-raiz">` que `montar()` crea dentro del shadow
 * root. Existe como componente porque **todo lo demás depende de él**: los
 * tokens (`--nia-*`) y la familia tipográfica cuelgan de esta clase, así que un
 * componente suelto fuera de esta raíz sale sin estilo.
 *
 * Dentro del widget lo pone `montar()`. Fuera —en el design system, o si alguien
 * embebe una pieza en otra aplicación— hay que ponerlo a mano.
 */
export function RaizNia({ children }: { children?: ReactNode }) {
  return <div className="nia-raiz">{children}</div>;
}
