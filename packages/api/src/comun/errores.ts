/**
 * Tipos de error propios. Nunca se hace `throw` de un string.
 *
 * Los errores de herramienta NO revientan el bucle del agente: el ejecutor los
 * captura y los devuelve al modelo como `{ error: "descripción" }`. Por eso cada
 * error lleva un `mensajeParaElModelo`: lo que el modelo puede leer sin filtrar
 * detalles de infraestructura.
 */

export type CodigoError =
  | "CONFIGURACION"
  | "ELASTIC"
  | "SQL"
  | "VALIDACION"
  | "DERECHOS"
  | "HERRAMIENTA_FALLO"
  | "NO_ENCONTRADO"
  | "LIMITE_VUELTAS";

export class ErrorNia extends Error {
  readonly codigo: CodigoError;
  readonly mensajeParaElModelo: string;
  readonly causa?: unknown;

  constructor(
    codigo: CodigoError,
    mensaje: string,
    opciones: { mensajeParaElModelo?: string; causa?: unknown } = {},
  ) {
    super(mensaje);
    this.name = new.target.name;
    this.codigo = codigo;
    this.mensajeParaElModelo = opciones.mensajeParaElModelo ?? mensaje;
    this.causa = opciones.causa;
  }
}

export class ErrorConfiguracion extends ErrorNia {
  constructor(mensaje: string, causa?: unknown) {
    super("CONFIGURACION", mensaje, {
      mensajeParaElModelo: "El servicio no está configurado correctamente.",
      causa,
    });
  }
}

export class ErrorElastic extends ErrorNia {
  readonly estado: number;

  constructor(estado: number, cuerpo: string) {
    super("ELASTIC", `Elasticsearch respondió ${estado}: ${cuerpo}`, {
      mensajeParaElModelo: "La búsqueda de empresas no está disponible ahora mismo.",
    });
    this.estado = estado;
  }
}

export class ErrorSql extends ErrorNia {
  constructor(mensaje: string, causa?: unknown) {
    super("SQL", mensaje, {
      mensajeParaElModelo: "No se han podido consultar los datos de la cuenta.",
      causa,
    });
  }
}

export class ErrorValidacion extends ErrorNia {
  readonly detalles: unknown;

  constructor(mensaje: string, detalles?: unknown) {
    super("VALIDACION", mensaje, { mensajeParaElModelo: mensaje });
    this.detalles = detalles;
  }
}

export class ErrorNoEncontrado extends ErrorNia {
  constructor(mensaje: string) {
    super("NO_ENCONTRADO", mensaje, { mensajeParaElModelo: mensaje });
  }
}

export function esErrorNia(valor: unknown): valor is ErrorNia {
  return valor instanceof ErrorNia;
}

/** Convierte cualquier valor lanzado en algo que se puede registrar sin romper. */
export function describirError(valor: unknown): string {
  if (esErrorNia(valor)) return `${valor.codigo}: ${valor.message}`;
  if (valor instanceof Error) return valor.message;
  return String(valor);
}
