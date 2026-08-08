import { describe, expect, it } from "vitest";
import {
  aplicar,
  esperaHastaCierre,
  estadoDeLaLinea,
  MINIMO_VISIBLE_MS,
  resumenDeLaLinea,
  turnoVacio,
} from "./turno.js";
import { interpretar } from "../sse/cliente.js";
import type { EventoServidor } from "../tipos.js";

/**
 * El reducer del turno es la pieza que convierte un stream de eventos en algo
 * que se puede pintar. Se prueba entera sin navegador ni reloj real.
 */

const T0 = 1_000_000;

function correr(eventos: [EventoServidor, number][]) {
  let turno = turnoVacio("t1", "hola");
  for (const [evento, ahora] of eventos) turno = aplicar(turno, evento, ahora);
  return turno;
}

const status = (
  id: string,
  estado: "activo" | "ok" | "error",
  texto?: string,
  detalle?: string,
): EventoServidor => ({
  evento: "status",
  datos: { id, estado, ...(texto ? { texto } : {}), ...(detalle ? { detalle } : {}) },
});

describe("pasos", () => {
  it("un status con id nuevo crea paso", () => {
    const turno = correr([[status("s1", "activo", "Buscando"), T0]]);
    expect(turno.pasos).toHaveLength(1);
    expect(turno.pasos[0]).toMatchObject({
      id: "s1",
      texto: "Buscando",
      estado: "activo",
    });
  });

  it("un status con id conocido actualiza EN SITIO, no acumula renglones", () => {
    const turno = correr([
      [status("s1", "activo", "Buscando"), T0],
      [status("s1", "activo", "Contando"), T0 + 200],
      [status("s1", "ok", undefined, "345 empresas"), T0 + 900],
    ]);

    expect(turno.pasos).toHaveLength(1);
    expect(turno.pasos[0]).toMatchObject({
      texto: "Contando",
      estado: "ok",
      detalle: "345 empresas",
    });
  });

  it("un cierre sin texto conserva el que había", () => {
    const turno = correr([
      [status("s1", "activo", "Analizando el segmento"), T0],
      [status("s1", "ok"), T0 + 500],
    ]);
    expect(turno.pasos[0]?.texto).toBe("Analizando el segmento");
  });

  it("varios pasos conviven en orden de llegada", () => {
    const turno = correr([
      [status("s1", "activo", "Uno"), T0],
      [status("s2", "activo", "Dos"), T0 + 10],
      [status("s1", "ok"), T0 + 400],
    ]);
    expect(turno.pasos.map((p) => p.id)).toEqual(["s1", "s2"]);
    expect(turno.pasos.map((p) => p.estado)).toEqual(["ok", "activo"]);
  });
});

describe("texto y tarjetas", () => {
  it("el texto se acumula delta a delta", () => {
    const turno = correr([
      [{ evento: "texto", datos: { delta: "He encontrado " } }, T0],
      [{ evento: "texto", datos: { delta: "345 empresas" } }, T0 + 30],
    ]);
    expect(turno.texto).toBe("He encontrado 345 empresas");
  });

  it("las tarjetas se acumulan sin tocar el texto", () => {
    const turno = correr([
      [{ evento: "tarjeta", datos: { tipo: "segmento", datos: { empresas: 345 } } }, T0],
    ]);
    expect(turno.tarjetas).toHaveLength(1);
    expect(turno.texto).toBe("");
  });
});

describe("fin y error", () => {
  it("fin cierra el turno y calcula la duración desde el primer paso", () => {
    const turno = correr([
      [status("s1", "activo", "Uno"), T0],
      [
        {
          evento: "fin",
          datos: { stopReason: "end_turn", tokens: { entrada: 1, salida: 2 } },
        },
        T0 + 1200,
      ],
    ]);
    expect(turno.enCurso).toBe(false);
    expect(turno.duracion).toBe(1200);
  });

  it("un error marca el paso que estuviera en curso", () => {
    const turno = correr([
      [status("s1", "activo", "Uno"), T0],
      [status("s2", "activo", "Dos"), T0 + 10],
      [status("s1", "ok"), T0 + 400],
      [{ evento: "error", datos: { codigo: "X", mensaje: "se rompió" } }, T0 + 500],
    ]);
    expect(turno.pasos.map((p) => p.estado)).toEqual(["ok", "error"]);
    expect(turno.error).toBe("se rompió");
    expect(turno.enCurso).toBe(false);
  });
});

describe("estados de la línea de tiempo", () => {
  it("durante mientras hay turno; hecho al acabar; error si algo falló", () => {
    const enCurso = correr([[status("s1", "activo", "Uno"), T0]]);
    expect(estadoDeLaLinea(enCurso)).toBe("durante");

    const hecho = correr([
      [status("s1", "activo", "Uno"), T0],
      [status("s1", "ok"), T0 + 400],
      [
        {
          evento: "fin",
          datos: { stopReason: "end_turn", tokens: { entrada: 0, salida: 0 } },
        },
        T0 + 500,
      ],
    ]);
    expect(estadoDeLaLinea(hecho)).toBe("hecho");

    const roto = correr([
      [status("s1", "activo", "Uno"), T0],
      [status("s1", "error", undefined, "falló"), T0 + 400],
    ]);
    expect(estadoDeLaLinea(roto)).toBe("error");
  });

  it("el resumen colapsado se lee «3 pasos · 1,2 s»", () => {
    const turno = correr([
      [status("s1", "activo", "Uno"), T0],
      [status("s2", "activo", "Dos"), T0 + 5],
      [status("s3", "activo", "Tres"), T0 + 10],
      [
        {
          evento: "fin",
          datos: { stopReason: "end_turn", tokens: { entrada: 0, salida: 0 } },
        },
        T0 + 1234,
      ],
    ]);
    expect(resumenDeLaLinea(turno)).toBe("3 pasos · 1,2 s");
  });

  it("un solo paso va en singular", () => {
    const turno = correr([
      [status("s1", "activo", "Uno"), T0],
      [
        {
          evento: "fin",
          datos: { stopReason: "end_turn", tokens: { entrada: 0, salida: 0 } },
        },
        T0 + 400,
      ],
    ]);
    expect(resumenDeLaLinea(turno)).toBe("1 paso · 0,4 s");
  });
});

describe("mínimo visible de 350 ms", () => {
  it("un paso que resuelve en 80 ms espera para no parpadear", () => {
    expect(esperaHastaCierre(T0, T0 + 80)).toBe(MINIMO_VISIBLE_MS - 80);
  });

  it("uno que ya lleva tiempo se cierra sin esperar", () => {
    expect(esperaHastaCierre(T0, T0 + 900)).toBe(0);
  });

  it("nunca devuelve una espera negativa", () => {
    expect(esperaHastaCierre(T0, T0 + 100_000)).toBe(0);
  });
});

describe("parser del stream SSE", () => {
  it("lee un bloque normal", () => {
    const evento = interpretar('event: status\ndata: {"id":"s1","estado":"ok"}');
    expect(evento).toEqual({ evento: "status", datos: { id: "s1", estado: "ok" } });
  });

  it("ignora los comentarios que mantienen viva la conexión", () => {
    expect(interpretar(": nia")).toBeUndefined();
  });

  it("no revienta con un bloque a medias ni con JSON roto", () => {
    expect(interpretar("event: texto")).toBeUndefined();
    expect(interpretar("event: texto\ndata: {roto")).toBeUndefined();
    expect(interpretar("")).toBeUndefined();
  });

  it("junta un data repartido en varias líneas", () => {
    const evento = interpretar('event: texto\ndata: {"delta":\ndata: "hola"}');
    expect(evento).toEqual({ evento: "texto", datos: { delta: "hola" } });
  });
});
