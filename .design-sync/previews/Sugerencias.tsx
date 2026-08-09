import { Sugerencias } from "@nia/widget";

/**
 * Una celda por sitio del portal, porque el componente cambia entero según el
 * contexto: eso es lo que hay que ver de un vistazo.
 */

export const EnUnaFicha = () => (
  <Sugerencias
    contexto={{ tipo: "ficha", razonSocial: "Mercadona, S.A.", nif: "A46103834" }}
    onElegir={() => {}}
  />
);

export const EnUnaBusqueda = () => (
  <Sugerencias
    contexto={{ tipo: "busqueda", termino: "logística" }}
    onElegir={() => {}}
  />
);

export const EnUnListado = () => (
  <Sugerencias contexto={{ tipo: "listado" }} onElegir={() => {}} />
);

export const EnUnRanking = () => (
  <Sugerencias contexto={{ tipo: "ranking" }} onElegir={() => {}} />
);

/** Sin contexto: los tres caminos del producto — listado, riesgo y mercado. */
export const SinContexto = () => <Sugerencias onElegir={() => {}} />;
