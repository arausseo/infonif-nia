import type { ReactNode } from "react";
import type { Tarjeta } from "../../tipos.js";
import { TarjetaBloqueado } from "./TarjetaBloqueado.js";
import { TarjetaFicha } from "./TarjetaFicha.js";
import { TarjetaSegmento } from "./TarjetaSegmento.js";

/**
 * Registro de tarjetas (CONTRATOS §6).
 *
 * Las tarjetas llegan por el canal `paraLaUI`, que **no pasa por el contexto del
 * modelo**. Por eso se pueden enseñar cifras y tablas sin pagarlas en tokens ni
 * arriesgarse a que el modelo las reescriba mal.
 *
 * Un tipo desconocido no rompe nada: no se pinta. Si mañana el servidor manda
 * una tarjeta nueva, un widget viejo la ignora en vez de caerse.
 */
type ComponenteTarjeta = (props: { datos: Record<string, unknown> }) => ReactNode;

const TARJETAS: Record<string, ComponenteTarjeta> = {
  segmento: TarjetaSegmento,
  ficha: TarjetaFicha,
  bloqueado: TarjetaBloqueado,
  // confirmacion: TarjetaConfirmar — Fase 5, con la compra.
};

export function Tarjetas({ tarjetas }: { tarjetas: Tarjeta[] }) {
  if (tarjetas.length === 0) return null;

  return (
    <>
      {tarjetas.map((tarjeta, i) => {
        const Componente = TARJETAS[tarjeta.tipo];
        if (!Componente) return null;
        return <Componente key={`${tarjeta.tipo}-${i}`} datos={tarjeta.datos} />;
      })}
    </>
  );
}
