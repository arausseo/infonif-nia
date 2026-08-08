import { describe, expect, it } from "vitest";
import {
  calcularCoste,
  campoPorNombre,
  catalogoCampos,
  cotizarListado,
  planesDeRegistros,
  recomendarPlan,
  registrosConCampo,
} from "./precios.js";
import { DERECHOS_ANONIMO, interpretarPlan } from "./derechos.js";
import type { CampoDisponible } from "./infonif/tipos.js";
import respuestaReal from "./fixtures/infonif/ejemplo-respuesta.json";

/**
 * Cotizar mal es facturar mal (regla no negociable 7). Estos tests son el
 * cinturón de seguridad de esa regla.
 */

/** La cola de `campos_disponibles` del ejemplo real: 81 empresas de Teruel. */
const DISPONIBLES = respuestaReal.campos_disponibles as CampoDisponible[];

describe("catálogo de campos", () => {
  it("carga los 34 campos comprables", () => {
    expect(catalogoCampos()).toHaveLength(34);
  });

  it("conoce los precios unitarios reales", () => {
    expect(campoPorNombre("CIF")?.price).toBe(0.02);
    expect(campoPorNombre("Email")?.price).toBe(0.05);
    expect(campoPorNombre("CargosDisponibles")?.price).toBe(0.08);
    expect(campoPorNombre("99053")?.price).toBe(0.04);
  });

  it("no conoce campos inventados", () => {
    expect(campoPorNombre("Beneficio")).toBeUndefined();
  });
});

describe("registrosConCampo", () => {
  it("los campos simples se leen por su nombre", () => {
    expect(registrosConCampo(campoPorNombre("CIF")!, DISPONIBLES)).toBe(81);
    expect(registrosConCampo(campoPorNombre("Telefono")!, DISPONIBLES)).toBe(78);
    expect(registrosConCampo(campoPorNombre("CargosDisponibles")!, DISPONIBLES)).toBe(66);
  });

  it("un campo que no aparece cuenta cero, no lanza", () => {
    const disponibles: CampoDisponible[] = [{ id: "CIF", data: 10 }];
    expect(registrosConCampo(campoPorNombre("Email")!, disponibles)).toBe(0);
  });

  it("los campos financieros suman las filas de su partida", () => {
    const disponibles: CampoDisponible[] = [
      { id: "99053|0|2023", data: 10 },
      { id: "99053|0|2024", data: 5 },
      { id: "99053|1|2024", data: 7 },
      { id: "99016|0|2024", data: 99 },
    ];
    // Por defecto, tipo 0 = cualquier tipo de cuenta.
    expect(registrosConCampo(campoPorNombre("99053")!, disponibles)).toBe(15);
    expect(
      registrosConCampo(campoPorNombre("99053")!, disponibles, { tipoCuenta: "1" }),
    ).toBe(7);
  });

  it("no confunde partidas con prefijo común", () => {
    const disponibles: CampoDisponible[] = [
      { id: "10000|0|2024", data: 3 },
      { id: "11000|0|2024", data: 5 },
      { id: "12000|0|2024", data: 7 },
    ];
    expect(registrosConCampo(campoPorNombre("10000")!, disponibles)).toBe(3);
  });

  it("filtra por ejercicio aunque los años vengan desordenados", () => {
    const disponibles: CampoDisponible[] = [
      { id: "99053|0|2019,2022,2023,2024,2018", data: 4 },
      { id: "99053|0|2018,2019", data: 9 },
    ];
    expect(
      registrosConCampo(campoPorNombre("99053")!, disponibles, { ejercicios: ["2024"] }),
    ).toBe(4);
    expect(
      registrosConCampo(campoPorNombre("99053")!, disponibles, { ejercicios: ["2018"] }),
    ).toBe(13);
  });
});

describe("cotizarListado", () => {
  it("reproduce la captura del cliente: 81 empresas, 12,07 € + IVA", () => {
    const presupuesto = cotizarListado(
      ["CIF", "RazonSocial", "Direccion", "Email", "99053"],
      DISPONIBLES,
      81,
    );

    expect(presupuesto.baseImponible).toBe(12.07);
    expect(presupuesto.iva).toBe(2.53);
    expect(presupuesto.total).toBe(14.6);
    expect(presupuesto.camposSinDato).toEqual([]);
  });

  it("cada línea factura los registros que de verdad traen el campo", () => {
    const presupuesto = cotizarListado(
      ["CIF", "Telefono", "CargosDisponibles"],
      DISPONIBLES,
      81,
    );
    const registros = Object.fromEntries(
      presupuesto.lineas.map((l) => [l.campo, l.registros]),
    );
    // 81 empresas, pero solo 78 con teléfono y 66 con cargo.
    expect(registros).toEqual({ CIF: 81, Telefono: 78, CargosDisponibles: 66 });
  });

  it("la razón social se factura por todas las empresas del segmento", () => {
    // No sale de campos_disponibles: la tienen todas por definición.
    const presupuesto = cotizarListado(["RazonSocial"], [], 500);
    expect(presupuesto.lineas[0]!.registros).toBe(500);
    expect(presupuesto.baseImponible).toBe(10);
  });

  it("un campo desconocido se avisa y no se factura", () => {
    const presupuesto = cotizarListado(["CIF", "Inventado"], DISPONIBLES, 81);
    expect(presupuesto.camposSinDato).toEqual(["Inventado"]);
    expect(presupuesto.lineas).toHaveLength(1);
  });

  it("un segmento vacío cuesta cero, no lanza", () => {
    const presupuesto = cotizarListado(["CIF", "Email"], [], 0);
    expect(presupuesto.baseImponible).toBe(0);
    expect(presupuesto.total).toBe(0);
  });

  it("sin campos pedidos no hay nada que cobrar", () => {
    expect(cotizarListado([], DISPONIBLES, 81).total).toBe(0);
  });

  it("redondea a céntimos y el IVA cuadra con la base", () => {
    // 0,02 × 333 = 6,66 exacto; el peligro es el arrastre binario al sumar.
    const disponibles: CampoDisponible[] = [{ id: "CIF", data: 333 }];
    const p = cotizarListado(["CIF"], disponibles, 333);
    expect(p.baseImponible).toBe(6.66);
    expect(p.iva).toBe(1.4);
    expect(p.total).toBe(8.06);
    expect(Number.isInteger(Math.round(p.total * 100))).toBe(true);
  });

  it("lanza si le dan un número de empresas imposible", () => {
    expect(() => cotizarListado(["CIF"], DISPONIBLES, -1)).toThrow();
  });

  it("el total es la suma de las líneas más el 21 %", () => {
    const p = cotizarListado(
      ["CIF", "RazonSocial", "Direccion", "Telefono", "Email", "Web", "empleados"],
      DISPONIBLES,
      81,
    );
    const suma = p.lineas.reduce((s, l) => s + l.importe, 0);
    expect(p.baseImponible).toBeCloseTo(suma, 2);
    expect(p.total).toBeCloseTo(p.baseImponible * 1.21, 2);
  });
});

describe("calcularCoste: dos monedas que no se convierten entre sí", () => {
  const CAMPOS = ["CIF", "RazonSocial", "Direccion", "Telefono", "Email"];
  const CON_PLAN = interpretarPlan(133627, {
    iD_usuario: 133627,
    numRegistrosConsumidos: 919_398,
    numRegistrosMensuales: 9_000_000,
    fechaFinContrato: "2026-11-16T00:00:00",
  });
  const SIN_PLAN = interpretarPlan(142583, undefined);

  it("sin plan se paga en euros y los campos importan", () => {
    const coste = calcularCoste(SIN_PLAN, 81, CAMPOS, DISPONIBLES);
    expect(coste.formaDePago).toBe("euros");
    expect(coste.enEuros.total).toBeGreaterThan(0);
    expect(coste.enEuros.lineas).toHaveLength(5);
  });

  it("con plan se consume saldo y los campos NO importan", () => {
    // Su portal: 50 empresas con cinco campos descuentan 50 registros, no 207.
    const conCinco = calcularCoste(CON_PLAN, 50, CAMPOS, DISPONIBLES);
    const conUno = calcularCoste(CON_PLAN, 50, ["CIF"], DISPONIBLES);

    expect(conCinco.formaDePago).toBe("saldo");
    expect(conCinco.enSaldo.registros).toBe(50);
    expect(conCinco.enSaldo.registros).toBe(conUno.enSaldo.registros);
    expect(conCinco.enSaldo.disponiblesDespues).toBe(8_080_552);

    // El importe en euros sí cambia, pero a este usuario no se le cobra.
    expect(conCinco.enEuros.total).toBeGreaterThan(conUno.enEuros.total);
  });

  it("el anónimo paga en euros", () => {
    expect(calcularCoste(DERECHOS_ANONIMO, 10, CAMPOS, DISPONIBLES).formaDePago).toBe(
      "euros",
    );
  });

  it("un plan sin saldo suficiente vuelve a euros y dice cuánto falta", () => {
    const coste = calcularCoste(CON_PLAN, 9_000_000, CAMPOS, DISPONIBLES);
    // Sigue teniendo plan, así que la forma de pago es saldo…
    expect(coste.formaDePago).toBe("saldo");
    // …pero no le llega, y hay que decírselo antes de que pulse.
    expect(coste.enSaldo.alcanza).toBe(false);
    expect(coste.enSaldo.faltan).toBe(919_398);
  });

  it("siempre calcula las dos, para poder responder «¿y si no gastara saldo?»", () => {
    const coste = calcularCoste(CON_PLAN, 81, CAMPOS, DISPONIBLES);
    expect(coste.enEuros.baseImponible).toBeGreaterThan(0);
    expect(coste.enSaldo.registros).toBe(81);
  });
});

describe("recomendarPlan", () => {
  it("conoce los tres tramos reales de su página", () => {
    expect(planesDeRegistros().map((p) => [p.registros, p.precio])).toEqual([
      [1000, 300],
      [5000, 750],
      [10000, 1000],
    ]);
  });

  it("los tramos son los 0,30 / 0,15 / 0,10 € de CLAUDE.md", () => {
    // No eran el precio de un listado por registro: son el precio de COMPRAR
    // registros. El malentendido que arrastré dos días.
    expect(planesDeRegistros().map((p) => p.precioPorRegistro)).toEqual([0.3, 0.15, 0.1]);
    for (const plan of planesDeRegistros()) {
      expect(plan.precio / plan.registros).toBeCloseTo(plan.precioPorRegistro, 4);
    }
  });

  it("recomienda el tramo más barato que cubra", () => {
    expect(recomendarPlan(800, 1000)?.tramo.sku).toBe("PLAN_1000");
    expect(recomendarPlan(3000, 5000)?.tramo.sku).toBe("PLAN_5000");
    expect(recomendarPlan(9000, 5000)?.tramo.sku).toBe("PLAN_10000");
  });

  it("para más de 10.000 combina unidades del tramo más barato por registro", () => {
    const r = recomendarPlan(25_000, 99_999);
    expect(r?.tramo.sku).toBe("PLAN_10000");
    expect(r?.unidades).toBe(3);
    expect(r?.coste).toBe(3000);
    expect(r?.registrosSobrantes).toBe(5000);
  });

  it("NO empuja el plan cuando el listado suelto sale más barato", () => {
    // El segmento del flujo C: 135 empresas, unos 32 € con IVA. El plan más
    // pequeño son 300 €. Recomendarlo aquí sería vender de más.
    const r = recomendarPlan(135, 32.43);
    expect(r?.tramo.sku).toBe("PLAN_1000");
    expect(r?.coste).toBe(300);
    expect(r?.mereceLaPenaParaEsteListado).toBe(false);
  });

  it("sí lo recomienda cuando de verdad compensa", () => {
    // 8.000 empresas con muchos campos se van muy por encima de los 1.000 €.
    const r = recomendarPlan(8000, 4500);
    expect(r?.tramo.sku).toBe("PLAN_10000");
    expect(r?.coste).toBe(1000);
    expect(r?.mereceLaPenaParaEsteListado).toBe(true);
  });

  it("un segmento vacío no tiene plan que recomendar", () => {
    expect(recomendarPlan(0, 0)).toBeUndefined();
  });
});
