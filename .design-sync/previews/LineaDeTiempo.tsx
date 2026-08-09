import { LineaDeTiempo } from "@nia/widget";

/**
 * Los pasos son los reales del agente: `resolver_actividad` y luego
 * `construir_segmento`, con el detalle que devuelve cada herramienta. El detalle
 * es lo que convierte la línea en información en vez de entretenimiento.
 */

const base = { id: "t1", texto: "", tarjetas: [] };

export const Trabajando = () => (
  <LineaDeTiempo
    turno={{
      ...base,
      enCurso: true,
      pasos: [
        {
          id: "s1",
          texto: "Interpretando la actividad",
          detalle: "CNAE 1071, 1072",
          estado: "ok",
          desde: 0,
        },
        { id: "s2", texto: "Contando el segmento", estado: "activo", desde: 0 },
      ],
    }}
  />
);

/**
 * Al terminar se pliega sola a un resumen. Es el estado en que pasa el 99 % del
 * tiempo: la conversación sigue debajo y la línea no debe estorbar.
 */
export const Terminada = () => (
  <LineaDeTiempo
    turno={{
      ...base,
      enCurso: false,
      duracion: 12100,
      pasos: [
        {
          id: "s1",
          texto: "Interpretando la actividad",
          detalle: "CNAE 1071, 1072",
          estado: "ok",
          desde: 0,
        },
        {
          id: "s2",
          texto: "Contando el segmento",
          detalle: "582 empresas",
          estado: "ok",
          desde: 0,
        },
      ],
    }}
  />
);

/** Con error se queda abierta a propósito, para que se vea dónde se rompió. */
export const ConError = () => (
  <LineaDeTiempo
    turno={{
      ...base,
      enCurso: false,
      duracion: 3400,
      pasos: [
        {
          id: "s1",
          texto: "Interpretando la actividad",
          detalle: "CNAE 4941",
          estado: "ok",
          desde: 0,
        },
        {
          id: "s2",
          texto: "Contando el segmento",
          detalle: "el servicio no respondió",
          estado: "error",
          desde: 0,
        },
      ],
    }}
  />
);

/** Un turno largo: cuatro herramientas encadenadas, todas con su resultado. */
export const VariosPasos = () => (
  <LineaDeTiempo
    turno={{
      ...base,
      enCurso: true,
      pasos: [
        {
          id: "s1",
          texto: "Interpretando la actividad",
          detalle: "CNAE 4941, 5229",
          estado: "ok",
          desde: 0,
        },
        {
          id: "s2",
          texto: "Contando el segmento",
          detalle: "12.480 empresas",
          estado: "ok",
          desde: 0,
        },
        {
          id: "s3",
          texto: "Aplicando el precio de cada campo",
          detalle: "378,00 € con IVA",
          estado: "ok",
          desde: 0,
        },
        { id: "s4", texto: "Comparando con los planes", estado: "activo", desde: 0 },
      ],
    }}
  />
);
