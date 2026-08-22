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

/**
 * `estado` es obligatorio y **el único valor que sirve es 1**.
 *
 * Comprobado contra el API con tres empresas distintas:
 *
 * | valor | respuesta |
 * |---|---|
 * | `0` | 400 «Falta estado» — su `getEstado` usa `if (!data.estado)` y el 0 es falso |
 * | `1` | 200 con los cargos vigentes: en Mercadona, 174, todos «Activo» |
 * | `2` | **204, sin contenido** |
 * | `3` | 204 |
 *
 * Al deducirlo supuse que 2 serían «todos» y llegué a ofrecerlo como opción de
 * la herramienta. Era una promesa falsa: quien pidiera el histórico recibía
 * siempre «no consta ninguno». Mejor no ofrecer lo que no existe.
 */
const ESTADO_VIGENTES = 1;

export interface Cargos {
  nif: string;
  cargos: Cargo[];
}

export async function obtenerCargos(
  nif: string,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<Cargos>> {
  const cuerpo = { nif, estado: ESTADO_VIGENTES };
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
  return { estado: "ok", datos: { nif, cargos }, origenClave: bruto.origenClave };
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

  // `anno`, no `ejercicio`. Leyendo el campo que no era, esto salía vacío
  // siempre y la herramienta decía «no consta ninguna cuenta» sobre empresas que
  // sí las tenían. Sin lanzar nada, que es lo peor.
  const ejercicios = [
    ...new Set(
      depositos.map((d) => (d.anno == null ? "" : String(d.anno))).filter(Boolean),
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
  /** Su campo es `direccion`; `domicilio` no existe. */
  direccion?: string;
  codigoPostal?: string;
  /** Su campo es `localidad`; `poblacion` no existe. */
  localidad?: string;
  provincia?: string;
  cnae?: string;
  cnaeDescripcion?: string;
  objetoSocial?: string;
  fechaConstitucion?: string;
  empleados?: string;
  web?: string;
  email?: string;
  registroMercantil?: string;
  auditor?: string;
  /** Último ejercicio con cuentas presentadas. Útil antes de ofrecer un depósito. */
  ultimasCuentas?: string;
  denominacionAnterior?: string;
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
  const pon = (clave: keyof Perfil, valor: unknown) => {
    if (valor == null || valor === "") return;
    perfil[clave] = String(valor) as never;
  };

  pon("razonSocial", e?.razonsocial);
  pon("direccion", e?.direccion);
  pon("codigoPostal", e?.codigopostal);
  pon("localidad", e?.localidad);
  pon("provincia", e?.provincia);
  pon("cnae", e?.cnae);
  pon("cnaeDescripcion", e?.cnaedescripcion);
  pon("objetoSocial", e?.objetosocial);
  pon("fechaConstitucion", e?.fechaconstitucion);
  pon("empleados", e?.empleados);
  pon("web", e?.web);
  pon("email", e?.email);
  pon("registroMercantil", e?.registromercantil);
  pon("auditor", e?.auditor);
  pon("ultimasCuentas", e?.ultimascuentaspresentadas);
  pon("denominacionAnterior", e?.denominacionanterior);

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
