import { icif, type ResultadoIcif } from "./cliente.js";
import {
  ActoBorme,
  Cargo,
  comoLista,
  Deposito,
  EmpresaGrupo,
  PerfilEmpresa,
  RespuestaActosBorme,
  RespuestaCargos,
  RespuestaDepositos,
  RespuestaEmpresasGrupo,
} from "./tipos.js";

/**
 * Familia `/dato` del gateway: lo que se puede saber de una empresa concreta.
 *
 * **El coste es 1 crédito por NIF y por mes, no por llamada.** Está verificado
 * en su código, no supuesto: `deductCredits` busca si ese NIF ya aparece en el
 * historial del mes y, si aparece, pone `needToDeduct = false` y no descuenta
 * nada. Además cachean por NIF, así que la segunda consulta ni siquiera sale a
 * su origen.
 *
 * Eso cambia por completo cómo hay que orientar al modelo. Si cada llamada
 * costara un crédito, habría que pedirle que consultara lo mínimo y preguntara
 * antes. Como el coste es por empresa, **una vez «abierta» una empresa, mirar
 * también sus cargos, su grupo y su BORME sale gratis** — y quedarse corto es el
 * único error que sí cuesta algo, porque obliga al usuario a repreguntar.
 *
 * Lo que sigue siendo caro es abrir empresas nuevas. Ahí es donde el modelo
 * tiene que ir con tiento, y por eso las descripciones de las herramientas lo
 * dicen en esos términos y no en abstracto.
 */

/** Estado de los cargos que se piden. Su API lo exige (`getEstado`). */
export type EstadoCargo = "vigentes" | "todos";

const ESTADO: Record<EstadoCargo, number> = {
  // Deducido de su API: el parámetro es numérico y obligatorio. Sin clave de
  // pruebas no se ha podido confirmar la correspondencia; está aislado aquí para
  // que corregirlo sea una línea.
  vigentes: 1,
  todos: 2,
};

export interface Cargos {
  nif: string;
  estado: EstadoCargo;
  cargos: Cargo[];
}

export async function obtenerCargos(
  nif: string,
  usuarioId: number | undefined,
  opciones: { estado?: EstadoCargo; senal?: AbortSignal } = {},
): Promise<ResultadoIcif<Cargos>> {
  const estado = opciones.estado ?? "vigentes";
  const cuerpo: { nif: string; estado: number } = { nif, estado: ESTADO[estado] };
  const bruto = await llamar("/dato/obtener-cargos", usuarioId, cuerpo, opciones.senal);
  if (bruto.estado !== "ok") return bruto;

  const analizado = RespuestaCargos.safeParse(bruto.datos);
  const cargos = analizado.success
    ? comoLista(analizado.data.listado?.cargo).flatMap((c) => {
        const v = Cargo.safeParse(c);
        return v.success ? [v.data] : [];
      })
    : [];

  // Una empresa sin ningún cargo publicado no es un error: es una respuesta.
  return {
    estado: "ok",
    datos: { nif, estado, cargos },
    origenClave: bruto.origenClave,
  };
}

export interface ActosBorme {
  nif: string;
  actos: ActoBorme[];
}

export async function obtenerActosBorme(
  nif: string,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<ActosBorme>> {
  const bruto = await llamar(
    "/dato/obtener-actos-borme",
    usuarioId,
    { nif },
    opciones.senal,
  );
  if (bruto.estado !== "ok") return bruto;

  const analizado = RespuestaActosBorme.safeParse(bruto.datos);
  const actos = analizado.success
    ? comoLista(analizado.data.listado?.acto).flatMap((a) => {
        const v = ActoBorme.safeParse(a);
        return v.success ? [v.data] : [];
      })
    : [];

  return { estado: "ok", datos: { nif, actos }, origenClave: bruto.origenClave };
}

export interface EmpresasGrupo {
  nif: string;
  empresas: EmpresaGrupo[];
}

export async function obtenerEmpresasGrupo(
  nif: string,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<EmpresasGrupo>> {
  const bruto = await llamar(
    "/dato/obtener-empresas-grupo",
    usuarioId,
    { nif },
    opciones.senal,
  );
  if (bruto.estado !== "ok") return bruto;

  const analizado = RespuestaEmpresasGrupo.safeParse(bruto.datos);
  const empresas = analizado.success
    ? comoLista(analizado.data.listado?.empresa).flatMap((e) => {
        const v = EmpresaGrupo.safeParse(e);
        return v.success ? [v.data] : [];
      })
    : [];

  return { estado: "ok", datos: { nif, empresas }, origenClave: bruto.origenClave };
}

export interface DepositosDisponibles {
  nif: string;
  depositos: Deposito[];
  /** Los ejercicios, ordenados de más reciente a más antiguo. */
  ejercicios: string[];
}

export async function obtenerDepositosDisponibles(
  nif: string,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<DepositosDisponibles>> {
  const bruto = await llamar(
    "/dato/obtener-depositos-disponibles",
    usuarioId,
    { nif },
    opciones.senal,
  );
  if (bruto.estado !== "ok") return bruto;

  const analizado = RespuestaDepositos.safeParse(bruto.datos);
  const depositos = analizado.success
    ? comoLista(analizado.data.listado?.deposito).flatMap((d) => {
        const v = Deposito.safeParse(d);
        return v.success ? [v.data] : [];
      })
    : [];

  const ejercicios = [
    ...new Set(
      depositos
        .map((d) => (d.ejercicio == null ? "" : String(d.ejercicio)))
        .filter(Boolean),
    ),
  ].sort((a, b) => b.localeCompare(a));

  return {
    estado: "ok",
    datos: { nif, depositos, ejercicios },
    origenClave: bruto.origenClave,
  };
}

export interface Perfil {
  nif: string;
  razonSocial?: string;
  domicilio?: string;
  codigoPostal?: string;
  poblacion?: string;
  provincia?: string;
  cnae?: string;
  objetoSocial?: string;
  fechaConstitucion?: string;
  situacion?: string;
}

export async function obtenerPerfilEmpresa(
  nif: string,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<Perfil>> {
  const bruto = await llamar(
    "/dato/obtener-perfil-empresa",
    usuarioId,
    { nif },
    opciones.senal,
  );
  if (bruto.estado !== "ok") return bruto;

  const analizado = PerfilEmpresa.safeParse(bruto.datos);
  const e = analizado.success ? analizado.data.empresa : undefined;

  const perfil: Perfil = { nif };
  if (e?.razonsocial) perfil.razonSocial = e.razonsocial;
  if (e?.domicilio) perfil.domicilio = e.domicilio;
  if (e?.codigopostal != null) perfil.codigoPostal = String(e.codigopostal);
  if (e?.poblacion) perfil.poblacion = e.poblacion;
  if (e?.provincia) perfil.provincia = e.provincia;
  if (e?.cnae != null) perfil.cnae = String(e.cnae);
  if (e?.objetosocial) perfil.objetoSocial = e.objetosocial;
  if (e?.fechaconstitucion != null) {
    perfil.fechaConstitucion = String(e.fechaconstitucion);
  }
  if (e?.situacion) perfil.situacion = e.situacion;

  return { estado: "ok", datos: perfil, origenClave: bruto.origenClave };
}

/** El NIF es obligatorio en todas: su API devuelve 400 sin él. */
function llamar(
  ruta: string,
  usuarioId: number | undefined,
  cuerpo: { nif: string } & Record<string, unknown>,
  senal: AbortSignal | undefined,
): Promise<ResultadoIcif<unknown>> {
  return icif(ruta, usuarioId, senal ? { cuerpo, senal } : { cuerpo });
}
