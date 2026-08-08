import Anthropic from "@anthropic-ai/sdk";
import { exigir } from "../comun/config.js";
import { describirError, esErrorNia } from "../comun/errores.js";
import { registro } from "../comun/registro.js";
import type { Derechos } from "../datos/derechos.js";
import {
  COPY,
  HERRAMIENTAS_PARA_EL_MODELO,
  herramientaPorNombre,
} from "./herramientas/index.js";
import { bloqueEstable, bloqueDeContexto } from "./prompt.js";
import type { ContextoPagina, ContextoTool, EventoSSE, Tarjeta } from "./tipos.js";

/**
 * El bucle de herramientas (ADR-005). Sin framework: son estas ~180 líneas.
 *
 * Se escribe a mano porque el producto necesita dos cosas que los frameworks
 * abstraen justamente: el protocolo `status` que actualiza en sitio, y el doble
 * canal `paraElModelo` / `paraLaUI`.
 */

const MODELO = "claude-sonnet-4-5";
const MAX_VUELTAS = 8;
const MAX_TOKENS = 4096;

export interface OpcionesTurno {
  mensaje: string;
  historial: Anthropic.MessageParam[];
  derechos: Derechos;
  contextoPagina?: ContextoPagina;
  senal: AbortSignal;
  emitir(evento: EventoSSE): void;
}

export interface ResultadoTurno {
  mensajes: Anthropic.MessageParam[];
  tokens: { entrada: number; salida: number };
  stopReason: string;
  tarjetas: Tarjeta[];
  /** Qué herramientas se usaron y cuánto tardaron. Para la traza. */
  herramientas: { nombre: string; ms: number; ok: boolean }[];
}

let cliente: Anthropic | undefined;

function obtenerCliente(): Anthropic {
  cliente ??= new Anthropic({ apiKey: exigir("ANTHROPIC_API_KEY") });
  return cliente;
}

/**
 * Bloques de sistema.
 *
 * El estable lleva `cache_control`: es idéntico en todas las conversaciones y en
 * todas las vueltas, así que se paga una vez. El de contexto va detrás y sin
 * marca, porque cambia con cada usuario.
 */
function sistema(
  derechos: Derechos,
  contexto?: ContextoPagina,
): Anthropic.TextBlockParam[] {
  return [
    {
      type: "text",
      text: bloqueEstable(),
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: bloqueDeContexto(derechos, contexto) },
  ];
}

/** Un turno completo: puede dar varias vueltas si el modelo encadena herramientas. */
export async function ejecutarTurno(opciones: OpcionesTurno): Promise<ResultadoTurno> {
  const { mensaje, derechos, contextoPagina, senal, emitir } = opciones;

  const mensajes: Anthropic.MessageParam[] = [
    ...opciones.historial,
    { role: "user", content: mensaje },
  ];

  const tokens = { entrada: 0, salida: 0 };
  const tarjetas: Tarjeta[] = [];
  const usadas: { nombre: string; ms: number; ok: boolean }[] = [];
  let stopReason = "end_turn";
  let contadorPaso = 0;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    if (senal.aborted) {
      stopReason = "abortado";
      break;
    }

    const flujo = obtenerCliente().messages.stream(
      {
        model: MODELO,
        max_tokens: MAX_TOKENS,
        system: sistema(derechos, contextoPagina),
        tools: HERRAMIENTAS_PARA_EL_MODELO,
        messages: mensajes,
      },
      { signal: senal },
    );

    /** id del `status` de cada herramienta de esta vuelta, por índice de bloque. */
    const pasosDeLaVuelta = new Map<number, string>();

    // Fuente A del protocolo: `content_block_start` trae el nombre de la
    // herramienta ANTES que sus argumentos. Se emite ya, sin esperar al input,
    // que es lo que hace que el progreso se sienta inmediato.
    flujo.on("streamEvent", (evento) => {
      if (
        evento.type === "content_block_start" &&
        evento.content_block.type === "tool_use"
      ) {
        const id = `s${++contadorPaso}`;
        pasosDeLaVuelta.set(evento.index, id);
        emitir({
          evento: "status",
          datos: {
            id,
            texto: COPY[evento.content_block.name] ?? "Consultando",
            estado: "activo",
          },
        });
      }
    });

    flujo.on("text", (delta) => {
      if (delta.length > 0) emitir({ evento: "texto", datos: { delta } });
    });

    const respuesta = await flujo.finalMessage();

    tokens.entrada += respuesta.usage.input_tokens;
    tokens.salida += respuesta.usage.output_tokens;
    stopReason = respuesta.stop_reason ?? "end_turn";

    mensajes.push({ role: "assistant", content: respuesta.content });

    const usos = respuesta.content.filter(
      (bloque): bloque is Anthropic.ToolUseBlock => bloque.type === "tool_use",
    );

    if (usos.length === 0) break;

    // Varios `tool_use` en un mismo turno: se ejecutan en paralelo, y todos los
    // resultados vuelven en UN solo mensaje de usuario. Mandarlos en mensajes
    // separados rompe el emparejamiento con sus tool_use_id.
    const resultados = await Promise.all(
      usos.map((uso, i) =>
        ejecutarHerramienta(uso, {
          derechos,
          ...(contextoPagina ? { contextoPagina } : {}),
          senal,
          emitir,
          idPaso: pasosDeLaVuelta.get(indiceDelBloque(respuesta.content, uso)) ?? `s${i}`,
          usadas,
        }),
      ),
    );

    for (const { tarjeta } of resultados) {
      if (tarjeta) {
        tarjetas.push(tarjeta);
        emitir({ evento: "tarjeta", datos: tarjeta });
      }
    }

    mensajes.push({
      role: "user",
      content: resultados.map((r) => r.bloque),
    });

    if (vuelta === MAX_VUELTAS - 1) {
      stopReason = "limite_de_vueltas";
      registro.warn({ vueltas: MAX_VUELTAS }, "el bucle llegó al freno de vueltas");
    }
  }

  return { mensajes, tokens, stopReason, tarjetas, herramientas: usadas };
}

function indiceDelBloque(
  contenido: Anthropic.ContentBlock[],
  uso: Anthropic.ToolUseBlock,
): number {
  return contenido.indexOf(uso);
}

interface ContextoEjecucion {
  derechos: Derechos;
  contextoPagina?: ContextoPagina;
  senal: AbortSignal;
  emitir(evento: EventoSSE): void;
  idPaso: string;
  usadas: { nombre: string; ms: number; ok: boolean }[];
}

/**
 * Ejecuta una herramienta.
 *
 * Un fallo aquí NO revienta el bucle: se devuelve `{ error }` al modelo para que
 * lo cuente o cambie de estrategia (CLAUDE.md). Lo que se le devuelve es el
 * mensaje pensado para él, no la traza interna.
 */
async function ejecutarHerramienta(
  uso: Anthropic.ToolUseBlock,
  ctx: ContextoEjecucion,
): Promise<{ bloque: Anthropic.ToolResultBlockParam; tarjeta?: Tarjeta }> {
  const herramienta = herramientaPorNombre(uso.name);
  const arranque = performance.now();
  const anotar = (ok: boolean) =>
    ctx.usadas.push({
      nombre: uso.name,
      ms: Math.round(performance.now() - arranque),
      ok,
    });

  const fallar = (mensaje: string): { bloque: Anthropic.ToolResultBlockParam } => {
    anotar(false);
    ctx.emitir({
      evento: "status",
      datos: { id: ctx.idPaso, estado: "error", detalle: mensaje },
    });
    return {
      bloque: {
        type: "tool_result",
        tool_use_id: uso.id,
        content: JSON.stringify({ error: mensaje }),
        is_error: true,
      },
    };
  };

  if (!herramienta) return fallar(`No existe la herramienta ${uso.name}.`);

  // `.strict()` en el esquema es lo que rechaza un parámetro inventado.
  const validado = herramienta.esquema.safeParse(uso.input);
  if (!validado.success) {
    const detalle = validado.error.issues
      .map((i) => `${i.path.join(".") || "raíz"}: ${i.message}`)
      .join("; ");
    return fallar(`Argumentos inválidos para ${uso.name}: ${detalle}`);
  }

  let ultimoDetalle: string | undefined;

  const contexto: ContextoTool = {
    derechos: ctx.derechos,
    ...(ctx.contextoPagina ? { contextoPagina: ctx.contextoPagina } : {}),
    senal: ctx.senal,
    // Fuente B del protocolo: subpasos desde dentro del ejecutor. Actualizan el
    // MISMO paso en sitio, no crean renglones nuevos.
    progreso(texto, opciones) {
      ultimoDetalle = opciones?.detalle ?? ultimoDetalle;
      ctx.emitir({
        evento: "status",
        datos: {
          id: ctx.idPaso,
          texto,
          estado: "activo",
          ...(opciones?.detalle ? { detalle: opciones.detalle } : {}),
        },
      });
    },
  };

  try {
    const resultado = await herramienta.ejecutar(validado.data, contexto);

    anotar(true);
    ctx.emitir({
      evento: "status",
      datos: {
        id: ctx.idPaso,
        estado: "ok",
        ...(ultimoDetalle ? { detalle: ultimoDetalle } : {}),
      },
    });

    const salida: { bloque: Anthropic.ToolResultBlockParam; tarjeta?: Tarjeta } = {
      bloque: {
        type: "tool_result",
        tool_use_id: uso.id,
        content: JSON.stringify(resultado.paraElModelo),
      },
    };
    // La tarjeta NO entra al contexto del modelo: va por el canal de la UI.
    if (resultado.paraLaUI) salida.tarjeta = resultado.paraLaUI;
    return salida;
  } catch (error) {
    registro.warn(
      { herramienta: uso.name, err: describirError(error) },
      "herramienta fallida",
    );
    return fallar(
      esErrorNia(error)
        ? error.mensajeParaElModelo
        : "La consulta no se ha podido completar.",
    );
  }
}
