import { z } from "zod";
import { ErrorValidacion } from "../comun/errores.js";
import { consumoDeSaldo, type ConsumoSaldo, type Derechos } from "./derechos.js";
import type { CampoDisponible } from "./infonif/tipos.js";
// Se importa, no se lee de disco: así viaja dentro del bundle y no depende de
// dónde quede el fichero al desplegar.
import catalogoCrudo from "./fixtures/infonif/campos-comprables.json";

/**
 * Fuente única del cálculo de precios. **No hay lógica de precio en ningún
 * ejecutor de herramienta** (CLAUDE.md).
 *
 * El precio de un listado es por campo y por registro: cada campo comprable
 * cuesta lo suyo, y se multiplica por cuántos registros del segmento REALMENTE
 * tienen ese campo. Eso lo dice el propio API en `campos_disponibles`, así que
 * la cotización es exacta y no hay nada que estimar (regla no negociable 7).
 *
 * Ojo con la diferencia respecto al frontend actual de Infonif: allí el importe
 * se calcula en el navegador y viaja al servidor como parámetro. Aquí se calcula
 * en servidor porque el agente no puede fiarse de un precio que decide el cliente.
 */

const IVA = 0.21;

// ─── Catálogo de campos comprables ────────────────────────────────────────────

const CampoComprable = z.object({
  name: z.string().min(1),
  group: z.enum(["contacto", "comerciales", "financieros"]),
  label: z.string().min(1),
  price: z.number().positive(),
  requiredFilter: z.boolean().optional(),
  partida: z.string().optional(),
  tipoPartida: z.enum(["Perdida", "InformacionFinanciera", "Ratios"]).optional(),
});

export type CampoComprable = z.infer<typeof CampoComprable>;

const CATALOGO: readonly CampoComprable[] = z.array(CampoComprable).parse(catalogoCrudo);

const POR_NOMBRE = new Map(CATALOGO.map((campo) => [campo.name, campo]));

export function catalogoCampos(): readonly CampoComprable[] {
  return CATALOGO;
}

export function campoPorNombre(nombre: string): CampoComprable | undefined {
  return POR_NOMBRE.get(nombre);
}

// ─── Cotización ───────────────────────────────────────────────────────────────

export interface LineaPresupuesto {
  campo: string;
  etiqueta: string;
  precioUnitario: number;
  /** Registros del segmento que traen ese campo. Es lo que se factura. */
  registros: number;
  importe: number;
}

export interface Presupuesto {
  lineas: LineaPresupuesto[];
  /** Empresas del segmento. No todas aportan todos los campos. */
  empresas: number;
  baseImponible: number;
  iva: number;
  total: number;
  /** Campos pedidos que el API no sabe cotizar. Se avisa, no se factura. */
  camposSinDato: string[];
}

/**
 * Cuenta cuántos registros del segmento aportan un campo.
 *
 * Los campos de contacto y comerciales vienen con su nombre tal cual
 * (`{"id":"Email","data":81}`). Los financieros vienen desglosados por partida,
 * tipo de cuenta y combinación de ejercicios
 * (`{"id":"99053|1|2023,2024","data":…}`), así que hay que sumar las filas que
 * correspondan.
 *
 * `tipoCuenta` `"0"` significa «cualquier tipo» **al leer la respuesta**, que es
 * lo que devuelve el API cuando no se ha filtrado por ninguna partida. Cuidado:
 * en la PETICIÓN ese mismo `0` no significa eso y deja fuera el 97 % del
 * segmento (ver `filtros.ts`). Aquí se lee; allí se filtra.
 */
export function registrosConCampo(
  campo: CampoComprable,
  disponibles: readonly CampoDisponible[],
  opciones: { tipoCuenta?: string; ejercicios?: readonly string[] } = {},
): number {
  if (!campo.partida) {
    return disponibles.find((fila) => fila.id === campo.name)?.data ?? 0;
  }

  const tipoCuenta = opciones.tipoCuenta ?? "0";
  const prefijo = `${campo.partida}|${tipoCuenta}|`;
  const ejercicios = opciones.ejercicios;

  let registros = 0;
  for (const fila of disponibles) {
    if (!fila.id.startsWith(prefijo)) continue;
    if (ejercicios && ejercicios.length > 0) {
      // Los años vienen sin ordenar: la cadena es un identificador, no una lista.
      const anios = fila.id.slice(prefijo.length).split(",");
      if (!anios.some((anio) => ejercicios.includes(anio))) continue;
    }
    registros += fila.data;
  }
  return registros;
}

/**
 * Cotiza un listado.
 *
 * `empresas` es el total del segmento; se usa para la razón social, que se
 * factura por todas las empresas porque todas la tienen.
 */
export function cotizarListado(
  camposPedidos: readonly string[],
  disponibles: readonly CampoDisponible[],
  empresas: number,
  opciones: { tipoCuenta?: string; ejercicios?: readonly string[] } = {},
): Presupuesto {
  if (empresas < 0)
    throw new ErrorValidacion("El segmento no puede tener empresas negativas");

  const lineas: LineaPresupuesto[] = [];
  const camposSinDato: string[] = [];

  for (const nombre of camposPedidos) {
    const campo = POR_NOMBRE.get(nombre);
    if (!campo) {
      camposSinDato.push(nombre);
      continue;
    }

    const registros =
      campo.name === "RazonSocial"
        ? empresas
        : registrosConCampo(campo, disponibles, opciones);

    lineas.push({
      campo: campo.name,
      etiqueta: campo.label,
      precioUnitario: campo.price,
      registros,
      importe: redondear(campo.price * registros),
    });
  }

  const baseImponible = redondear(lineas.reduce((suma, l) => suma + l.importe, 0));
  const iva = redondear(baseImponible * IVA);

  return {
    lineas,
    empresas,
    baseImponible,
    iva,
    total: redondear(baseImponible + iva),
    camposSinDato,
  };
}

/** A céntimos. Sin esto, sumar 0,02 × 81 arrastra error binario a la factura. */
function redondear(importe: number): number {
  return Math.round(importe * 100) / 100;
}

// ─── Qué le cuesta a ESTE usuario ─────────────────────────────────────────────

export interface CosteListado {
  empresas: number;
  /** `saldo` si el usuario tiene plan con registros disponibles; si no, `euros`. */
  formaDePago: "euros" | "saldo";
  /**
   * Lo que costaría pagando: por campo y por registro, más IVA. Se calcula
   * siempre, también con plan, porque el usuario puede querer saberlo.
   */
  enEuros: Presupuesto;
  /** Lo que costaría al saldo. Solo tiene sentido con plan. */
  enSaldo: ConsumoSaldo;
}

/**
 * Traduce un segmento a lo que le cuesta a un usuario concreto.
 *
 * Son dos monedas distintas y no se convierten entre sí:
 *
 * - **Sin plan** se paga en euros, y el importe depende de los campos: cada uno
 *   tiene su precio y se multiplica por los registros que lo traen.
 * - **Con plan** se consume saldo, y **el número de campos da igual**. Cincuenta
 *   empresas cuestan cincuenta registros tanto si te llevas una columna como si
 *   te llevas cinco. Verificado en su portal y en su frontend
 *   (`descargaPorPaquete` descuenta `selected_companies`, no los campos).
 *
 * Por eso el portal ni siquiera enseña el importe en euros a quien tiene plan
 * (`FieldsSelected.vue:4`). Nia hará lo mismo: a quien tiene saldo se le habla
 * de registros, no de dinero.
 */
export function calcularCoste(
  derechos: Derechos,
  empresas: number,
  camposPedidos: readonly string[],
  disponibles: readonly CampoDisponible[],
  opciones: { tipoCuenta?: string; ejercicios?: readonly string[] } = {},
): CosteListado {
  return {
    empresas,
    formaDePago: derechos.puedeConsumirSaldo ? "saldo" : "euros",
    enEuros: cotizarListado(camposPedidos, disponibles, empresas, opciones),
    enSaldo: consumoDeSaldo(derechos, empresas),
  };
}
