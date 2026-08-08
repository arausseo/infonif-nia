import type { Derechos } from "./derechos.js";
import { informePorSku } from "./precios.js";
import {
  ejerciciosConCuentas,
  obtenerFichaCruda,
  partida,
  partidaDeEjercicio,
  type FichaCruda,
} from "./infonif/fichas.js";

/**
 * Proyección de la ficha de una empresa según los derechos del usuario.
 *
 * **Aquí vive la regla 2.** El API de Infonif devuelve la ficha entera, con
 * cifras y contacto, sin enmascarar. Este módulo decide qué sale de aquí, y lo
 * que no sale **no existe** para el resto del sistema: no se devuelve tapado ni
 * marcado, simplemente no se construye.
 *
 * La alternativa —dárselo al modelo y pedirle que no lo diga— filtra por resumen
 * tarde o temprano (ADR-008).
 *
 * Regla 4: toda cifra viaja con su ejercicio. Un número sin año no se devuelve.
 */

/** Códigos de partida del catálogo de Infonif. */
const CODIGO = {
  ventas: 99053,
  ebitda: 99016,
  resultado: 49500,
  activoTotal: 10000,
  patrimonioNeto: 20000,
} as const;

export interface Magnitud {
  valor: number;
  /** Sin esto no se devuelve la cifra. Regla 4. */
  ejercicio: number;
}

/** Lo que ve cualquiera, incluido un anónimo. */
export interface FichaPublica {
  nif: string;
  razonSocial: string;
  cnae?: string;
  actividad?: string;
  sector?: string;
  provincia?: string;
  localidad?: string;
  comunidad?: string;
  fechaConstitucion?: string;
  /** Años de los que hay cuentas depositadas. El dato en sí es de pago. */
  ejerciciosDisponibles: number[];
}

/** Lo que solo ve quien tiene derecho. */
export interface Magnitudes {
  ventas?: Magnitud;
  ebitda?: Magnitud;
  resultado?: Magnitud;
  activoTotal?: Magnitud;
  patrimonioNeto?: Magnitud;
  empleados?: Magnitud;
}

export interface Contacto {
  telefono?: string;
  email?: string;
  web?: string;
}

export type ResultadoFicha =
  | { encontrada: false }
  | {
      encontrada: true;
      publica: FichaPublica;
      /** Solo si hay derecho. Si no, no está la clave. */
      magnitudes?: Magnitudes;
      contacto?: Contacto;
      /** Motivo por el que faltan las magnitudes, para poder ofrecer la compra. */
      requiereCompra?: {
        skuSugerido: string;
        motivo: string;
        /** El precio va aquí para que el modelo no se lo invente. */
        precio?: number;
        nombre?: string;
      };
    };

/** Arma el requiereCompra con su precio real del catálogo. */
function informeSugerido(sku: string): {
  skuSugerido: string;
  motivo: string;
  precio?: number;
  nombre?: string;
} {
  const informe = informePorSku(sku);
  const salida: {
    skuSugerido: string;
    motivo: string;
    precio?: number;
    nombre?: string;
  } = {
    skuSugerido: sku,
    motivo:
      informe?.descripcion ??
      "Las magnitudes financieras se consultan con el Informe Comercial o con las Cuentas Anuales del ejercicio.",
  };
  if (informe) {
    salida.precio = informe.precio;
    salida.nombre = informe.nombre;
  }
  return salida;
}

function limpio(valor: string | null | undefined): string | undefined {
  const texto = valor?.trim();
  return texto && texto.length > 0 ? texto : undefined;
}

function aPublica(ficha: FichaCruda): FichaPublica {
  const publica: FichaPublica = {
    nif: ficha.CIF,
    razonSocial: ficha.RazonSocial,
    ejerciciosDisponibles: ejerciciosConCuentas(ficha).slice(0, 10),
  };

  const cnae = limpio(ficha.CnaeInfo?.Cnae);
  if (cnae) publica.cnae = cnae;
  const actividad = limpio(ficha.CnaeInfo?.Cnae_text);
  if (actividad) publica.actividad = actividad;
  const sector = limpio(ficha.IndustriaDescripcion);
  if (sector) publica.sector = sector;
  const provincia = limpio(ficha.Provincia);
  if (provincia) publica.provincia = provincia;
  const localidad = limpio(ficha.Localidad);
  if (localidad) publica.localidad = localidad;
  const comunidad = limpio(ficha.Comunidad);
  if (comunidad) publica.comunidad = comunidad;
  const constitucion = limpio(ficha.FechaConstitucion);
  if (constitucion) publica.fechaConstitucion = constitucion.slice(0, 10);

  return publica;
}

function aMagnitudes(ficha: FichaCruda, ejercicio?: number): Magnitudes {
  const magnitudes: Magnitudes = {};

  const leer = (codigo: number) =>
    ejercicio !== undefined
      ? partidaDeEjercicio(ficha, codigo, ejercicio)
      : partida(ficha, codigo);

  const asignar = (clave: keyof Magnitudes, codigo: number) => {
    const encontrada = leer(codigo);
    // Sin ejercicio no hay cifra: regla 4.
    if (encontrada) magnitudes[clave] = encontrada;
  };

  asignar("ventas", CODIGO.ventas);
  asignar("ebitda", CODIGO.ebitda);
  asignar("resultado", CODIGO.resultado);
  asignar("activoTotal", CODIGO.activoTotal);
  asignar("patrimonioNeto", CODIGO.patrimonioNeto);

  const ultima = ficha.UltimaCuentaAnual;
  if (
    ultima?.SumTotalEmpleados != null &&
    (ejercicio === undefined || ejercicio === ultima.Ejercicio)
  ) {
    magnitudes.empleados = {
      valor: ultima.SumTotalEmpleados,
      ejercicio: ultima.Ejercicio,
    };
  }

  return magnitudes;
}

/**
 * Trae la ficha de una empresa proyectada según los derechos.
 *
 * `conMagnitudes` lo decide la herramienta que llama, no el modelo:
 * `obtener_ficha_publica` pide siempre `false`.
 */
export async function obtenerFicha(
  nif: string,
  derechos: Derechos,
  opciones: { conMagnitudes?: boolean; ejercicio?: number } = {},
): Promise<ResultadoFicha> {
  const cruda = await obtenerFichaCruda(nif);
  if (!cruda) return { encontrada: false };

  const publica = aPublica(cruda);
  if (!opciones.conMagnitudes) return { encontrada: true, publica };

  // Aquí, y no después, es donde se decide. El dato de pago no llega a salir
  // de esta función si no hay derecho.
  if (!tieneDerechoAMagnitudes(derechos)) {
    return {
      encontrada: true,
      publica,
      requiereCompra: informeSugerido("INFORME_COMERCIAL"),
    };
  }

  const resultado: ResultadoFicha = {
    encontrada: true,
    publica,
    magnitudes: aMagnitudes(cruda, opciones.ejercicio),
  };

  const contacto: Contacto = {};
  const telefono = limpio(cruda.Telefono);
  if (telefono) contacto.telefono = telefono;
  const email = limpio(cruda.Email);
  if (email) contacto.email = email;
  const web = limpio(cruda.Web);
  if (web) contacto.web = web;
  if (Object.keys(contacto).length > 0) resultado.contacto = contacto;

  return resultado;
}

/**
 * Quién puede ver magnitudes de una empresa concreta.
 *
 * Hoy: quien tiene plan de registros. Un anónimo o un registrado sin plan, no.
 * Cuando existan los bonos de informes (Fase 5) esto también los mirará.
 */
export function tieneDerechoAMagnitudes(derechos: Derechos): boolean {
  return derechos.puedeConsumirSaldo;
}
