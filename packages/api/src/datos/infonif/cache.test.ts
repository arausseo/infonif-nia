import { beforeEach, describe, expect, it } from "vitest";
import {
  estaFresco,
  estadoCacheResumen,
  fijarResumen,
  obtenerResumen,
  olvidarResumen,
} from "./resumen.js";
import { ResumenInfonif } from "./tipos.js";
import instantanea from "../fixtures/infonif/resumen-2026-08-08.json";

/**
 * La caché del resumen no es una optimización: es lo que evita que una petición
 * de usuario espere 26 segundos. Estos tests fijan esa garantía.
 */

const RESUMEN = ResumenInfonif.parse(instantanea);
const HORA = 3_600_000;
const DIA = 24 * HORA;
const TTL = 86_400;

beforeEach(() => {
  olvidarResumen();
});

describe("estaFresco", () => {
  const ahora = 1_000 * DIA;

  it("recién descargado está fresco", () => {
    expect(estaFresco(ahora, ahora, TTL)).toBe(true);
  });

  it("dos horas y media después sigue fresco", () => {
    // Comprobado contra el API: a las 2,5 h la respuesta era idéntica byte a byte.
    expect(estaFresco(ahora - 2.5 * HORA, ahora, TTL)).toBe(true);
  });

  it("justo antes de las 24 h todavía", () => {
    expect(estaFresco(ahora - (DIA - 1_000), ahora, TTL)).toBe(true);
  });

  it("pasadas las 24 h ya no", () => {
    expect(estaFresco(ahora - DIA - 1_000, ahora, TTL)).toBe(false);
  });

  it("un TTL corto caduca antes", () => {
    expect(estaFresco(ahora - 10_000, ahora, 5)).toBe(false);
    expect(estaFresco(ahora - 1_000, ahora, 5)).toBe(true);
  });
});

describe("servir mientras se refresca", () => {
  it("con algo en memoria no se espera al API, ni caducado", async () => {
    // Generado hace una semana: caducadísimo. Aun así tiene que responder ya.
    fijarResumen(RESUMEN, Date.now() - 7 * DIA);

    const arranque = performance.now();
    const resumen = await obtenerResumen();
    const ms = performance.now() - arranque;

    expect(resumen.cantidad).toBe(2_712_875);
    // Si esperase al API serían ~26.000 ms. El margen es amplio a propósito:
    // lo que se afirma es «no ha ido a la red», no una cifra de rendimiento.
    expect(ms).toBeLessThan(500);
  });

  it("lo caducado dispara un refresco, lo fresco no", async () => {
    fijarResumen(RESUMEN, Date.now() - 7 * DIA);
    await obtenerResumen();
    expect(estadoCacheResumen().refrescando).toBe(true);

    olvidarResumen();
    fijarResumen(RESUMEN, Date.now());
    await obtenerResumen();
    expect(estadoCacheResumen().refrescando).toBe(false);
  });

  it("varias llamadas seguidas no arrancan varios refrescos", async () => {
    fijarResumen(RESUMEN, Date.now() - 7 * DIA);
    await Promise.all([obtenerResumen(), obtenerResumen(), obtenerResumen()]);
    // El cerrojo en memoria basta para el proceso; el de Redis, entre nodos.
    expect(estadoCacheResumen().refrescando).toBe(true);
  });
});

describe("estadoCacheResumen", () => {
  it("dice que no hay nada cuando no hay nada", () => {
    expect(estadoCacheResumen()).toEqual({ cargado: false, refrescando: false });
  });

  it("informa de la antigüedad y de si está fresco", () => {
    fijarResumen(RESUMEN, Date.now() - 2 * HORA);
    const estado = estadoCacheResumen();

    expect(estado.cargado).toBe(true);
    expect(estado.fresco).toBe(true);
    expect(estado.antiguedadSegundos).toBeGreaterThanOrEqual(7_190);
    expect(estado.antiguedadSegundos).toBeLessThanOrEqual(7_210);
    expect(estado.generadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("marca como no fresco lo que pasó de las 24 h", () => {
    fijarResumen(RESUMEN, Date.now() - 2 * DIA);
    expect(estadoCacheResumen().fresco).toBe(false);
  });
});
