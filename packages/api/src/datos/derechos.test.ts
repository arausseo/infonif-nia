import { describe, expect, it } from "vitest";
import {
  consumoDeSaldo,
  DERECHOS_ANONIMO,
  interpretarPlan,
  type Derechos,
} from "./derechos.js";

/**
 * ADR-008: los derechos se verifican dentro de la herramienta, antes de devolver
 * el dato. Estos tests fijan los tres perfiles y —lo que más importa— que un
 * plan se consume en registros, no en euros ni en campos.
 */

/** Respuesta real del usuario 133627, verificada el 08/08/2026. */
const PLAN_REAL = {
  iD_usuario: 133627,
  numRegistrosConsumidos: 919_398,
  numRegistrosMensuales: 9_000_000,
  fechaFinContrato: "2026-11-16T00:00:00",
};

describe("interpretarPlan", () => {
  it("lee el plan real y calcula el saldo como lo enseña su portal", () => {
    const derechos = interpretarPlan(133627, PLAN_REAL);

    expect(derechos.perfil).toBe("conPlan");
    expect(derechos.registrosContratados).toBe(9_000_000);
    expect(derechos.registrosConsumidos).toBe(919_398);
    // El portal muestra exactamente esta cifra en «Disponibles».
    expect(derechos.registrosDisponibles).toBe(8_080_602);
    expect(derechos.puedeConsumirSaldo).toBe(true);
    expect(derechos.finContrato).toBe("2026-11-16T00:00:00");
  });

  it("un 204 sin cuerpo es «no tiene plan», no un error", () => {
    // Su API responde 204 vacío para el usuario 142583. Verificado en vivo.
    const derechos = interpretarPlan(142583, undefined);
    expect(derechos.perfil).toBe("registrado");
    expect(derechos.puedeConsumirSaldo).toBe(false);
    expect(derechos.registrosDisponibles).toBeUndefined();
  });

  it("un cuerpo sin iD_usuario tampoco es plan", () => {
    expect(interpretarPlan(1, {}).perfil).toBe("registrado");
  });

  it("un plan agotado no permite consumir", () => {
    const derechos = interpretarPlan(1, {
      ...PLAN_REAL,
      numRegistrosConsumidos: 9_000_000,
    });
    expect(derechos.registrosDisponibles).toBe(0);
    expect(derechos.puedeConsumirSaldo).toBe(false);
  });

  it("no deja el saldo en negativo si han consumido de más", () => {
    const derechos = interpretarPlan(1, {
      ...PLAN_REAL,
      numRegistrosConsumidos: 9_500_000,
    });
    expect(derechos.registrosDisponibles).toBe(0);
  });

  it("una fecha de contrato pasada NO bloquea: sus planes no caducan", () => {
    // Su página lo dice literalmente y su frontend ignora esa fecha por
    // completo. Denegar aquí dejaría a un cliente con saldo pagado sin poder
    // gastarlo, que es peor error que el contrario.
    const antiguo = interpretarPlan(133627, {
      ...PLAN_REAL,
      fechaFinContrato: "2020-01-01T00:00:00",
    });

    expect(antiguo.puedeConsumirSaldo).toBe(true);
    // Se conserva como información, por si alguna vez hay que enseñarla.
    expect(antiguo.finContrato).toBe("2020-01-01T00:00:00");
  });
});

describe("los tres perfiles", () => {
  it("el anónimo no consume saldo", () => {
    expect(DERECHOS_ANONIMO.perfil).toBe("anonimo");
    expect(DERECHOS_ANONIMO.puedeConsumirSaldo).toBe(false);
    expect(DERECHOS_ANONIMO.usuarioId).toBeUndefined();
  });

  it("el registrado sin plan paga o no descarga", () => {
    const derechos = interpretarPlan(142583, undefined);
    expect(derechos.perfil).toBe("registrado");
    expect(derechos.usuarioId).toBe(142583);
    expect(derechos.puedeConsumirSaldo).toBe(false);
  });

  it("el que tiene plan consume saldo", () => {
    expect(interpretarPlan(133627, PLAN_REAL).puedeConsumirSaldo).toBe(true);
  });
});

describe("consumoDeSaldo", () => {
  const conPlan: Derechos = interpretarPlan(133627, PLAN_REAL);

  it("cuesta un registro por empresa, den igual los campos", () => {
    // Su portal: 50 empresas con 5 campos seleccionados descuentan 50, no 207.
    const consumo = consumoDeSaldo(conPlan, 50);
    expect(consumo.registros).toBe(50);
    expect(consumo.disponiblesAntes).toBe(8_080_602);
    expect(consumo.disponiblesDespues).toBe(8_080_552);
    expect(consumo.alcanza).toBe(true);
  });

  it("justo en el límite alcanza", () => {
    expect(consumoDeSaldo(conPlan, 8_080_602).alcanza).toBe(true);
    expect(consumoDeSaldo(conPlan, 8_080_602).disponiblesDespues).toBe(0);
  });

  it("dice cuántos faltan, para poder avisar antes de pulsar", () => {
    const consumo = consumoDeSaldo(conPlan, 9_000_000);
    expect(consumo.alcanza).toBe(false);
    expect(consumo.faltan).toBe(919_398);
  });

  it("sin plan no alcanza nunca y faltan todos", () => {
    const sinPlan = interpretarPlan(142583, undefined);
    expect(consumoDeSaldo(sinPlan, 30)).toMatchObject({ alcanza: false, faltan: 30 });
    expect(consumoDeSaldo(DERECHOS_ANONIMO, 30)).toMatchObject({
      alcanza: false,
      faltan: 30,
    });
  });
});
