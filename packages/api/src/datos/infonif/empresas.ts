import { infonif } from "./cliente.js";
import { RespuestaAutocomplete, type EmpresaAutocomplete } from "./tipos.js";

/**
 * Búsqueda de empresa por nombre o NIF.
 *
 * `GET /buscador/autocomplete/listar`. Cubre un universo más amplio que el
 * buscador de segmentos, pero la mayoría de esas empresas no tienen cuentas: esto
 * sirve para *encontrar* una empresa, no para segmentar.
 */

const MINIMO_CARACTERES = 3;

/** Su API topa en 25 y no admite paginación. */
export const TOPE_RESULTADOS = 25;

export interface Empresa {
  nif: string;
  razonSocial: string;
  /** Denominaciones anteriores con el mismo NIF. Útiles para desambiguar. */
  denominacionesAnteriores: string[];
  sector?: string;
  provincia?: string;
  municipio?: string;
  codigoPostal?: string;
  direccion?: string;
  /** Slug de su ficha en el portal. */
  url?: string;
  logo?: string;
  relevancia?: number;
}

const NIF_COMPLETO = /^[A-Za-z]\d{7,8}[A-Za-z0-9]?$/;

/** Su API busca por NIF con letra; solo la parte numérica no devuelve nada. */
function normalizarConsulta(consulta: string): string {
  const limpia = consulta.trim().replace(/[\s.-]/g, "");
  return NIF_COMPLETO.test(limpia) ? limpia.toUpperCase() : consulta.trim();
}

function sinVacios(valor: string | null | undefined): string | undefined {
  const texto = valor?.trim();
  return texto && texto.length > 0 ? texto : undefined;
}

/**
 * Agrupa por NIF y se queda con la denominación vigente (`ea: 1`).
 *
 * No es una precaución teórica: `q=merca` devuelve 25 resultados con solo 20 NIF
 * distintos, porque las denominaciones históricas viajan como filas aparte. Sin
 * esto el usuario ve cuatro veces la misma empresa.
 */
export function deduplicar(filas: readonly EmpresaAutocomplete[]): Empresa[] {
  const porNif = new Map<string, EmpresaAutocomplete[]>();
  for (const fila of filas) {
    const grupo = porNif.get(fila.nif);
    if (grupo) grupo.push(fila);
    else porNif.set(fila.nif, [fila]);
  }

  const empresas: Empresa[] = [];
  for (const grupo of porNif.values()) {
    // La vigente; si ninguna lo declara, la de mayor relevancia.
    const vigente =
      grupo.find((f) => f.ea === 1) ??
      [...grupo].sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0))[0]!;

    const anteriores = grupo
      .filter((f) => f !== vigente && f.rs !== vigente.rs)
      .map((f) => f.rs);

    empresas.push({
      nif: vigente.nif,
      razonSocial: vigente.rs,
      denominacionesAnteriores: [...new Set(anteriores)],
      sector: sinVacios(vigente.s),
      provincia: sinVacios(vigente.p),
      municipio: sinVacios(vigente.loc),
      codigoPostal: sinVacios(vigente.cp),
      direccion: sinVacios(vigente.dir),
      url: sinVacios(vigente.url),
      logo: sinVacios(vigente.lb) ?? sinVacios(vigente.l),
      relevancia: vigente.pts,
    });
  }

  return empresas.sort((a, b) => (b.relevancia ?? 0) - (a.relevancia ?? 0));
}

export interface ResultadoBusqueda {
  empresas: Empresa[];
  /** `true` si su API pudo haber recortado en 25. No hay forma de paginar. */
  posiblesMas: boolean;
}

export async function buscarEmpresas(consulta: string): Promise<ResultadoBusqueda> {
  const termino = normalizarConsulta(consulta);
  if (termino.length < MINIMO_CARACTERES) {
    return { empresas: [], posiblesMas: false };
  }

  const crudo = await infonif(
    `/buscador/autocomplete/listar?q=${encodeURIComponent(termino)}`,
    { tiempoLimiteMs: 10_000 },
  );
  const { empresas } = RespuestaAutocomplete.parse(crudo);

  return {
    empresas: deduplicar(empresas),
    posiblesMas: empresas.length >= TOPE_RESULTADOS,
  };
}
