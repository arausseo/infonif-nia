import type { z } from "zod";
import type { Derechos } from "../datos/derechos.js";

/**
 * Contratos del agente (docs/CONTRATOS.md §1 y §2).
 */

/** Lo que el ASP inyecta sobre la página que está viendo el usuario. */
export interface ContextoPagina {
  tipo: "ficha" | "busqueda" | "listado" | "portada" | "ranking";
  nif?: string;
  razonSocial?: string;
  termino?: string;
}

/** Una tarjeta para la interfaz. No entra al contexto del modelo. */
export interface Tarjeta {
  tipo: "segmento" | "confirmacion" | "ficha" | "bloqueado";
  datos: Record<string, unknown>;
}

/**
 * Doble canal de salida (ADR-005).
 *
 * `paraElModelo` cuesta tokens y va compacto. `paraLaUI` es rico y **no entra al
 * contexto**: es lo que permite enseñar una tabla de 5 filas sin pagarla en
 * tokens ni arriesgarse a que el modelo la reescriba mal.
 */
export interface ResultadoTool {
  paraElModelo: object;
  paraLaUI?: Tarjeta;
}

/** Lo que recibe un ejecutor además de sus argumentos. */
export interface ContextoTool {
  derechos: Derechos;
  contextoPagina?: ContextoPagina;
  /**
   * Subpasos dentro del ejecutor (CONTRATOS §1, fuente B). Aquí está la riqueza
   * real del protocolo de progreso: `construir_segmento` reporta cinco.
   */
  progreso(texto: string, opciones?: { detalle?: string }): void;
  /** Se cancela si el cliente cierra la conexión SSE. */
  senal: AbortSignal;
}

export interface Herramienta<E extends z.ZodTypeAny = z.ZodTypeAny> {
  nombre: string;
  /** ESTO ES PROMPT, no documentación. Incluye siempre cuándo NO usarla. */
  descripcion: string;
  esquema: E;
  /** Texto del `status` que se emite en cuanto el modelo la nombra. */
  progreso: string;
  ejecutar(args: z.infer<E>, ctx: ContextoTool): Promise<ResultadoTool>;
}

/**
 * Una definición, tres consumidores: el modelo (JSON Schema), el validador (Zod)
 * y el ejecutor.
 */
export function definirTool<E extends z.ZodTypeAny>(
  herramienta: Herramienta<E>,
): Herramienta<E> {
  return herramienta;
}

// ─── Eventos SSE (CONTRATOS §1) ───────────────────────────────────────────────

export type EventoSSE =
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
