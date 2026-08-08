import type { ContextoPagina } from "../tipos.js";

/**
 * Lo que se le ofrece al usuario según dónde esté.
 *
 * No es relleno: en una ficha de empresa, la pregunta útil ya la sabe el
 * sistema, y escribirla entera es fricción. En la portada no se sabe nada, así
 * que se ofrecen los tres caminos del producto.
 */
export function sugerenciasDe(contexto?: ContextoPagina): string[] {
  if (!contexto) return GENERICAS;

  switch (contexto.tipo) {
    case "ficha": {
      const nombre = contexto.razonSocial ?? "esta empresa";
      return [
        `¿Cómo le fue a ${nombre} el último ejercicio?`,
        `¿Quién administra ${nombre}?`,
        "¿Qué empresas parecidas hay en la zona?",
      ];
    }
    case "busqueda":
      return contexto.termino
        ? [
            `Cuántas empresas hay de ${contexto.termino}`,
            `Empresas de ${contexto.termino} con más de 10 empleados`,
            "¿Qué informe me conviene?",
          ]
        : GENERICAS;
    case "listado":
      return [
        "Quiero afinar este listado",
        "¿Cuánto costaría descargarlo con email?",
        "¿Me sale a cuenta un plan?",
      ];
    case "ranking":
      return [
        "¿Quién lidera este sector?",
        "Empresas de este sector en mi provincia",
        "¿Qué datos puedo descargar de estas empresas?",
      ];
    default:
      return GENERICAS;
  }
}

const GENERICAS = [
  "Empresas de logística en Valencia con más de 20 empleados",
  "Un cliente me pide crédito a 90 días, ¿qué miro?",
  "¿Cuántas empresas nuevas hay en mi provincia?",
];

export function Sugerencias({
  contexto,
  onElegir,
}: {
  contexto?: ContextoPagina;
  onElegir: (texto: string) => void;
}) {
  return (
    <div className="nia-sugerencias">
      <p className="nia-sugerencias__intro">Puedes empezar por aquí:</p>
      {sugerenciasDe(contexto).map((sugerencia) => (
        <button
          key={sugerencia}
          type="button"
          className="nia-sugerencia"
          onClick={() => onElegir(sugerencia)}
        >
          {sugerencia}
        </button>
      ))}
    </div>
  );
}
