import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  COPY,
  HERRAMIENTAS,
  HERRAMIENTAS_PARA_EL_MODELO,
  herramientaPorNombre,
} from "./herramientas/index.js";
import { BLOQUE_ESTABLE, bloqueDeContexto } from "./prompt.js";
import { recortarSinRomperHerramientas } from "./conversacion.js";
import { DERECHOS_ANONIMO, interpretarPlan } from "../datos/derechos.js";

/**
 * Lo que se prueba aquí es el andamiaje del agente, no el criterio del modelo.
 * El comportamiento con el modelo real se comprueba con `pnpm demo`.
 */

describe("registro de herramientas", () => {
  it("están las nueve de lectura del catálogo de CONTRATOS §2", () => {
    expect(HERRAMIENTAS.map((h) => h.nombre).sort()).toEqual([
      "buscar_empresa",
      "comparar_empresas",
      "construir_segmento",
      "consultar_saldo",
      "cotizar",
      "obtener_ficha_publica",
      "obtener_magnitudes",
      "recomendar_producto",
      "resolver_actividad",
    ]);
  });

  it("ninguna escribe: crear_intento_compra es de la Fase 5", () => {
    expect(herramientaPorNombre("crear_intento_compra")).toBeUndefined();
  });

  it("cada una deriva su JSON Schema del esquema Zod", () => {
    expect(HERRAMIENTAS_PARA_EL_MODELO).toHaveLength(HERRAMIENTAS.length);
    for (const herramienta of HERRAMIENTAS_PARA_EL_MODELO) {
      expect(herramienta.input_schema.type).toBe("object");
      // La descripción es prompt: si se queda corta, el modelo elige a ciegas.
      expect((herramienta.description ?? "").length, herramienta.name).toBeGreaterThan(
        80,
      );
    }
  });

  it("el esquema del segmento llega al modelo con sus campos", () => {
    const segmento = HERRAMIENTAS_PARA_EL_MODELO.find(
      (h) => h.name === "construir_segmento",
    );
    const propiedades = Object.keys(segmento?.input_schema.properties ?? {});
    expect(propiedades).toContain("cnae");
    expect(propiedades).toContain("provincias");
    expect(propiedades).toContain("ventas");
    expect(propiedades).toContain("conEmail");
  });

  it("toda descripción dice cuándo NO usar la herramienta", () => {
    // Es lo que evita que el modelo use construir_segmento para una empresa
    // concreta, o que se invente códigos CNAE.
    const sinNegativa = HERRAMIENTAS.filter(
      (h) => !/\bNO\b|nunca|Nunca/.test(h.descripcion),
    ).map((h) => h.nombre);
    expect(sinNegativa).toEqual([]);
  });

  it("cada una tiene texto de progreso para el primer status", () => {
    for (const herramienta of HERRAMIENTAS) {
      expect(COPY[herramienta.nombre], herramienta.nombre).toBeTruthy();
    }
  });

  it("los esquemas rechazan parámetros inventados", () => {
    const buscar = herramientaPorNombre("buscar_empresa");
    expect(buscar?.esquema.safeParse({ consulta: "mercadona" }).success).toBe(true);
    expect(buscar?.esquema.safeParse({ consulta: "mercadona", limite: 99 }).success).toBe(
      false,
    );
  });

  it("el bloque de herramientas es estable entre llamadas, por la caché de prompt", () => {
    const primera = JSON.stringify(HERRAMIENTAS_PARA_EL_MODELO);
    const segunda = JSON.stringify(HERRAMIENTAS_PARA_EL_MODELO);
    expect(primera).toBe(segunda);
  });
});

describe("prompt de sistema", () => {
  it("lleva las reglas no negociables que dependen del comportamiento", () => {
    expect(BLOQUE_ESTABLE).toMatch(/No valoras el riesgo/i);
    expect(BLOQUE_ESTABLE).toMatch(/ejercicio/i);
    expect(BLOQUE_ESTABLE).toMatch(/5 empresas/);
    expect(BLOQUE_ESTABLE).toMatch(/No cobras nada/i);
  });

  it("el bloque estable no depende del usuario: si no, la caché no sirve", () => {
    expect(BLOQUE_ESTABLE).not.toMatch(/\$\{|registrosDisponibles|usuarioId/);
  });

  it("el contexto distingue los tres perfiles", () => {
    expect(bloqueDeContexto(DERECHOS_ANONIMO)).toMatch(/No ha iniciado sesión/);

    const registrado = interpretarPlan(1, undefined);
    expect(bloqueDeContexto(registrado)).toMatch(/no tiene plan/i);

    const conPlan = interpretarPlan(2, {
      iD_usuario: 2,
      numRegistrosMensuales: 1000,
      numRegistrosConsumidos: 250,
    });
    const texto = bloqueDeContexto(conPlan);
    expect(texto).toMatch(/750/);
    expect(texto).toMatch(/registros, no de euros/);
  });

  it("mete el contexto de página cuando lo hay", () => {
    const texto = bloqueDeContexto(DERECHOS_ANONIMO, {
      tipo: "ficha",
      nif: "A46103834",
      razonSocial: "MERCADONA SA",
    });
    expect(texto).toMatch(/MERCADONA SA/);
    expect(texto).toMatch(/A46103834/);
  });
});

describe("recorte del historial", () => {
  const usuario = (texto: string): Anthropic.MessageParam => ({
    role: "user",
    content: texto,
  });
  const asistenteConHerramienta = (): Anthropic.MessageParam => ({
    role: "assistant",
    content: [
      { type: "tool_use", id: "tu_1", name: "buscar_empresa", input: { consulta: "x" } },
    ],
  });
  const resultadoDeHerramienta = (): Anthropic.MessageParam => ({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "tu_1", content: "{}" }],
  });

  it("no toca un historial corto", () => {
    const mensajes = [usuario("hola"), usuario("qué tal")];
    expect(recortarSinRomperHerramientas(mensajes, 10)).toEqual(mensajes);
  });

  it("corta por el final cuando se pasa de la ventana", () => {
    const mensajes = Array.from({ length: 10 }, (_, i) => usuario(`m${i}`));
    const recortado = recortarSinRomperHerramientas(mensajes, 4);
    expect(recortado).toHaveLength(4);
    expect(recortado[3]).toEqual(usuario("m9"));
  });

  it("nunca deja un tool_result huérfano al principio", () => {
    // Si el primer mensaje conservado trae un tool_result sin su tool_use, la
    // API rechaza la petición entera. Es un error que solo aparece en
    // conversaciones largas, o sea, en la demo.
    const mensajes = [
      usuario("uno"),
      asistenteConHerramienta(),
      resultadoDeHerramienta(),
      usuario("dos"),
    ];
    const recortado = recortarSinRomperHerramientas(mensajes, 2);
    const primero = recortado[0];
    const bloques = typeof primero?.content === "string" ? [] : (primero?.content ?? []);
    expect(bloques.some((b) => b.type === "tool_result")).toBe(false);
  });
});
