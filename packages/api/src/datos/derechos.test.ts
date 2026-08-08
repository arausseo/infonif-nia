import { describe, expect, it } from "vitest";
import { alcanzaElSaldo, DERECHOS_ANONIMO, type Derechos } from "./derechos.js";

/**
 * ADR-008: los derechos se verifican dentro de la herramienta, antes de devolver
 * el dato. Estos tests fijan los tres perfiles del criterio de aceptación de la
 * Fase 1.
 */

const registrado: Derechos = {
  perfil: "registrado",
  usuarioId: 42,
  puedeConsumirSaldo: false,
};

const conPlan: Derechos = {
  perfil: "conPlan",
  usuarioId: 7,
  registrosMensuales: 5000,
  registrosConsumidos: 4200,
  registrosDisponibles: 800,
  puedeConsumirSaldo: true,
};

describe("los tres perfiles", () => {
  it("el anónimo no consume saldo", () => {
    expect(DERECHOS_ANONIMO.perfil).toBe("anonimo");
    expect(DERECHOS_ANONIMO.puedeConsumirSaldo).toBe(false);
    expect(DERECHOS_ANONIMO.usuarioId).toBeUndefined();
  });

  it("el registrado sin plan tampoco: paga o no descarga", () => {
    expect(registrado.puedeConsumirSaldo).toBe(false);
    expect(registrado.registrosDisponibles).toBeUndefined();
  });

  it("el que tiene plan consume saldo", () => {
    expect(conPlan.puedeConsumirSaldo).toBe(true);
    expect(conPlan.registrosDisponibles).toBe(800);
  });
});

describe("alcanzaElSaldo", () => {
  it("alcanza cuando el segmento cabe en lo que queda", () => {
    expect(alcanzaElSaldo(conPlan, 500)).toEqual({ alcanza: true, faltan: 0 });
  });

  it("justo en el límite alcanza", () => {
    expect(alcanzaElSaldo(conPlan, 800)).toEqual({ alcanza: true, faltan: 0 });
  });

  it("dice cuántos faltan, para poder avisar antes de pulsar", () => {
    expect(alcanzaElSaldo(conPlan, 1000)).toEqual({ alcanza: false, faltan: 200 });
  });

  it("sin plan no alcanza nunca, y faltan todos", () => {
    expect(alcanzaElSaldo(registrado, 30)).toEqual({ alcanza: false, faltan: 30 });
    expect(alcanzaElSaldo(DERECHOS_ANONIMO, 30)).toEqual({ alcanza: false, faltan: 30 });
  });

  it("un plan agotado no alcanza", () => {
    const agotado: Derechos = {
      ...conPlan,
      registrosConsumidos: 5000,
      registrosDisponibles: 0,
      puedeConsumirSaldo: false,
    };
    expect(alcanzaElSaldo(agotado, 1)).toEqual({ alcanza: false, faltan: 1 });
  });
});
