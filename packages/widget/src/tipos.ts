/**
 * Lo que el ASP Classic inyecta en la página (CONTRATOS §5). El widget no
 * inventa nada de esto: si no está, se monta en modo anónimo.
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
