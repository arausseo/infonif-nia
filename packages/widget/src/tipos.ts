/**
 * Lo que el ASP Classic inyecta en la página (CONTRATOS §5).
 */
export interface ContextoPagina {
  tipo: "ficha" | "busqueda" | "listado" | "portada" | "ranking";
  nif?: string;
  razonSocial?: string;
  termino?: string;
}

export interface ConfiguracionEmbebida {
  /** Token de 15 minutos acuñado por POST /internal/mint. */
  token?: string;
  contexto?: ContextoPagina;
  /** Base del API. Por defecto, el mismo origen del script. */
  apiBase?: string;
}

declare global {
  interface Window {
    __INFONIF_AGENT__?: ConfiguracionEmbebida;
  }
}

// ─── Estado del turno (CONTRATOS §6) ──────────────────────────────────────────

/**
 * Un paso de la línea de tiempo.
 *
 * Los pasos **son estado del turno, no mensajes**: se actualizan en sitio por su
 * `id`. Si se acumularan como renglones, una consulta con cuatro herramientas
 * dejaría veinte líneas de ruido.
 */
export interface Paso {
  id: string;
  texto: string;
  detalle?: string;
  estado: "activo" | "ok" | "error";
  /** Milisegundos en que apareció. Sirve para el mínimo visible de 350 ms. */
  desde: number;
}

export interface Tarjeta {
  tipo: "segmento" | "confirmacion" | "ficha" | "bloqueado";
  /** Dos tarjetas con la misma clave son la misma: la segunda reemplaza. */
  clave?: string;
  datos: Record<string, unknown>;
}

export interface Turno {
  id: string;
  /** Lo que escribió el usuario. Vacío en el turno del asistente. */
  pregunta?: string;
  texto: string;
  pasos: Paso[];
  tarjetas: Tarjeta[];
  /** `true` mientras el turno sigue en curso. */
  enCurso: boolean;
  error?: string;
  /** Duración total, en ms, una vez terminado. */
  duracion?: number;
}

// ─── Eventos del stream ───────────────────────────────────────────────────────

export type EventoServidor =
  | { evento: "inicio"; datos: { conversationId: string; turnoId: string } }
  | {
      evento: "status";
      datos: {
        id: string;
        texto?: string;
        estado: "activo" | "ok" | "error";
        detalle?: string;
      };
    }
  | { evento: "texto"; datos: { delta: string } }
  | { evento: "tarjeta"; datos: Tarjeta }
  | {
      evento: "fin";
      datos: { stopReason: string; tokens: { entrada: number; salida: number } };
    }
  | { evento: "error"; datos: { codigo: string; mensaje: string } };
