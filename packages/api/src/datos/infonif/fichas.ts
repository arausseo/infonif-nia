import { z } from "zod";
import { infonif } from "./cliente.js";
import { armar, type Paso } from "./filtros.js";

/**
 * Ficha de una empresa concreta: `POST /buscador/empresas/filtrar`.
 *
 * **Este endpoint devuelve el dato de pago sin enmascarar.** Su propio frontend
 * lo tapa en el navegador —«A4418\*\*\*\*», «AGUA DE BRO\*\*\*\*\*»— pero lo que
 * viaja por la red viene entero.
 *
 * Por eso este módulo NO se llama nunca desde una herramienta sin pasar por
 * `datos/fichas.ts`, que proyecta según los derechos. La regla 2 dice que el
 * dato de pago no entra al contexto del modelo, y la única forma de garantizarlo
 * es no dárselo, no pedirle que lo calle.
 *
 * `pag` es **0-based**: con `pag=1` y un solo resultado, la respuesta viene
 * vacía. Costó un rato averiguarlo.
 */

const RUTA = "/buscador/empresas/filtrar";

const PartidaFinanciera = z.object({
  Codigo: z.number(),
  ValorEnEuros: z.number(),
  Ejercicio: z.number(),
  TipoCuentas: z.number().optional(),
});

export type PartidaFinanciera = z.infer<typeof PartidaFinanciera>;

export const FichaCruda = z
  .object({
    RazonSocial: z.string(),
    CIF: z.string(),
    CnaeInfo: z
      .object({ Cnae: z.string().optional(), Cnae_text: z.string().optional() })
      .partial()
      .optional(),
    Direccion: z.string().nullable().optional(),
    Comunidad: z.string().nullable().optional(),
    Provincia: z.string().nullable().optional(),
    Localidad: z.string().nullable().optional(),
    Codigo_Postal: z.string().nullable().optional(),
    FechaConstitucion: z.string().nullable().optional(),
    Telefono: z.string().nullable().optional(),
    Email: z.string().nullable().optional(),
    Web: z.string().nullable().optional(),
    IndustriaDescripcion: z.string().nullable().optional(),
    /** Cifras de cabecera del último ejercicio, con su año. */
    UltimaCuentaAnual: z
      .object({
        Ejercicio: z.number(),
        ImporteNetoCifraDeNegocioICIF: z.number().nullable().optional(),
        ResultadoEjercicio: z.number().nullable().optional(),
        SumTotalEmpleados: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),
    CuentasDisponibles: z.array(z.unknown()).optional(),
    UltimaIndividual: z.number().optional(),
    Perdida: z.array(PartidaFinanciera).optional(),
    InformacionFinanciera: z.array(PartidaFinanciera).optional(),
    Ratios: z.array(PartidaFinanciera).optional(),
  })
  .passthrough();

export type FichaCruda = z.infer<typeof FichaCruda>;

const Respuesta = z
  .object({ total: z.number(), empresas: z.array(FichaCruda) })
  .passthrough();

/** Trae la ficha completa de un NIF. `undefined` si no está en la base. */
export async function obtenerFichaCruda(nif: string): Promise<FichaCruda | undefined> {
  const limpio = nif
    .trim()
    .toUpperCase()
    .replace(/[\s.-]/g, "");
  const paso: Paso = {
    criterio: "actividad",
    etiqueta: nif,
    aporta: { cif: [limpio] },
  };

  const crudo = await infonif(`${RUTA}?pag=0&size=1`, {
    cuerpo: armar([paso], []),
    tiempoLimiteMs: 20_000,
  });

  const { empresas } = Respuesta.parse(crudo);
  return empresas[0];
}

/** Busca el valor más reciente de una partida, con el ejercicio al que pertenece. */
export function partida(
  ficha: FichaCruda,
  codigo: number,
): { valor: number; ejercicio: number } | undefined {
  const todas = [
    ...(ficha.Perdida ?? []),
    ...(ficha.InformacionFinanciera ?? []),
    ...(ficha.Ratios ?? []),
  ];
  const encontradas = todas
    .filter((p) => p.Codigo === codigo)
    .sort((a, b) => b.Ejercicio - a.Ejercicio);

  const reciente = encontradas[0];
  return reciente
    ? { valor: reciente.ValorEnEuros, ejercicio: reciente.Ejercicio }
    : undefined;
}

/** Igual, pero de un ejercicio concreto. */
export function partidaDeEjercicio(
  ficha: FichaCruda,
  codigo: number,
  ejercicio: number,
): { valor: number; ejercicio: number } | undefined {
  const todas = [
    ...(ficha.Perdida ?? []),
    ...(ficha.InformacionFinanciera ?? []),
    ...(ficha.Ratios ?? []),
  ];
  const encontrada = todas.find((p) => p.Codigo === codigo && p.Ejercicio === ejercicio);
  return encontrada
    ? { valor: encontrada.ValorEnEuros, ejercicio: encontrada.Ejercicio }
    : undefined;
}

/** Ejercicios con cuentas, de más reciente a más antiguo. */
export function ejerciciosConCuentas(ficha: FichaCruda): number[] {
  const todas = [...(ficha.Perdida ?? []), ...(ficha.InformacionFinanciera ?? [])];
  return [...new Set(todas.map((p) => p.Ejercicio))].sort((a, b) => b - a);
}
