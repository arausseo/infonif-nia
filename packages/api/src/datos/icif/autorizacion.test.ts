import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El permiso de gasto.
 *
 * Lo que se prueba aquí no es que funcione cuando todo va bien —eso se ve a
 * simple vista— sino que **falla del lado correcto**. Un permiso que se concede
 * solo cuando alguien lo pide es un permiso; uno que se concede porque Redis se
 * cayó, o porque el NIF venía con un guion, es un adorno.
 */

const almacen = new Map<string, string>();

vi.mock("../redis/cliente.js", () => ({
  obtenerRedis: () => ({
    get: async (clave: string) => almacen.get(clave) ?? null,
    set: async (clave: string, valor: string) => {
      almacen.set(clave, valor);
      return "OK";
    },
  }),
}));

const {
  autorizarNif,
  autorizarSesion,
  estaAutorizado,
  fijarInformar,
  leerAutorizacion,
  revocarSesion,
} = await import("./autorizacion.js");

beforeEach(() => almacen.clear());

describe("permiso para gastar créditos", () => {
  it("por defecto NO hay permiso", async () => {
    expect(await estaAutorizado("c1", "A46103834")).toBe(false);
  });

  it("autorizar una empresa no autoriza las demás", async () => {
    await autorizarNif("c1", "A46103834");

    expect(await estaAutorizado("c1", "A46103834")).toBe(true);
    // Lo importante: decir que sí a Mercadona no abre la puerta a nadie más.
    expect(await estaAutorizado("c1", "B98001720")).toBe(false);
  });

  it("el permiso no se escapa a otra conversación", async () => {
    await autorizarSesion("c1");
    expect(await estaAutorizado("c1", "A46103834")).toBe(true);
    expect(await estaAutorizado("c2", "A46103834")).toBe(false);
  });

  it("«adelante y no me preguntes más» vale para cualquier empresa", async () => {
    await autorizarSesion("c1");
    expect(await estaAutorizado("c1", "A46103834")).toBe(true);
    expect(await estaAutorizado("c1", "B98001720")).toBe(true);
  });

  it("y se puede retirar: un permiso irrevocable no es un permiso", async () => {
    await autorizarSesion("c1");
    await autorizarNif("c1", "A46103834");
    await revocarSesion("c1");

    expect(await estaAutorizado("c1", "A46103834")).toBe(false);
    expect(await estaAutorizado("c1", "B98001720")).toBe(false);
  });

  it("el NIF se normaliza: «b-98001720» y «B98001720» son la misma empresa", async () => {
    await autorizarNif("c1", " b-98001720 ");
    expect(await estaAutorizado("c1", "B98001720")).toBe(true);
  });

  it("sin conversación no hay permiso posible", async () => {
    // Sin identificar la conversación no se puede saber quién autorizó qué, así
    // que se deniega. Es el caso de un turno sin conversationId.
    await autorizarSesion(undefined);
    expect(await estaAutorizado(undefined, "A46103834")).toBe(false);
  });

  it("si Redis se cae, se DENIEGA — nunca se gasta por defecto", async () => {
    const roto = await import("./autorizacion.js");
    const espia = vi.spyOn(JSON, "parse").mockImplementation(() => {
      throw new Error("Redis devolvió basura");
    });
    almacen.set("nia:icif:autorizacion:c1", "{}");

    expect(await roto.estaAutorizado("c1", "A46103834")).toBe(false);
    espia.mockRestore();
  });
});

describe("informar del saldo", () => {
  it("por defecto se informa", async () => {
    expect((await leerAutorizacion("c1")).informar).toBe(true);
  });

  it("se puede silenciar y volver a encender", async () => {
    await fijarInformar("c1", false);
    expect((await leerAutorizacion("c1")).informar).toBe(false);

    await fijarInformar("c1", true);
    expect((await leerAutorizacion("c1")).informar).toBe(true);
  });

  it("silenciarlo no toca el permiso de gasto", async () => {
    await autorizarNif("c1", "A46103834");
    await fijarInformar("c1", false);

    // Son dos cosas distintas: «no me des la matraca» no es «gasta lo que
    // quieras». Si esto se mezclara, callar implicaría autorizar.
    expect(await estaAutorizado("c1", "A46103834")).toBe(true);
    expect(await estaAutorizado("c1", "B98001720")).toBe(false);
  });
});
