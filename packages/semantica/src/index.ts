/**
 * Capa semántica: texto libre del usuario → códigos CNAE (ADR-004).
 *
 * FASE 2 (PLAN.md). Aquí solo están los tipos, para que `agente/` y `datos/`
 * puedan escribirse contra una firma estable. La implementación —corpus de
 * ~1.500 documentos, embeddings precalculados en build, similitud coseno por
 * fuerza bruta sobre un artefacto binario cargado en memoria— llega en su fase.
 *
 * Lo que NO se hará: pedirle los códigos CNAE al modelo. Se los inventa con
 * aplomo, y un CNAE inventado es un segmento mal contado y una factura mal
 * emitida.
 */

export interface DocumentoCorpus {
  /** `cnae:4941`, `caso:proveedor-credito-90-dias`, `faq:que-es-el-rai` */
  id: string;
  tipo: "cnae" | "caso-comercial" | "faq";
  texto: string;
  /** Códigos CNAE a los que apunta el documento. */
  cnae?: string[];
  /** SKU sugerido, en documentos de tipo caso-comercial. */
  sku?: string;
}

export interface Coincidencia {
  documento: DocumentoCorpus;
  /** Similitud coseno en [0, 1]. */
  puntuacion: number;
}

export interface ActividadResuelta {
  cnae: string;
  descripcion: string;
  puntuacion: number;
}

export interface MotorSemantico {
  resolverActividad(consulta: string, limite?: number): Promise<ActividadResuelta[]>;
  buscar(consulta: string, limite?: number): Promise<Coincidencia[]>;
}
