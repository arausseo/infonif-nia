/**
 * Corre los flujos del guion de demo contra el agente real.
 *
 *   pnpm demo            (con la API levantada en :3000)
 *   pnpm demo D          (solo el flujo D)
 *
 * No es un test: gasta tokens y depende de la red. Es el ensayo, y sirve para
 * ver el protocolo de progreso tal como lo verá el widget.
 */

import { config as cargarDotenv } from "dotenv";

cargarDotenv({ path: [".env", "../../.env"] });

const API = process.env["NIA_URL"] ?? "http://localhost:3000";

interface Turno {
  titulo: string;
  mensaje: string;
  usuarioId?: number;
  /** Lo que NO puede aparecer en la respuesta. */
  prohibido?: RegExp[];
  /** Lo que sí debería aparecer. */
  esperado?: RegExp[];
}

const GUION: { flujo: string; turnos: Turno[] }[] = [
  {
    flujo: "A — Consulta y upsell",
    turnos: [
      {
        titulo: "anónimo pregunta por cifras",
        mensaje: "¿Cómo le fue a Mercadona en 2024? Dame sus ventas.",
        // Sin derechos no puede salir ninguna cifra de ventas.
        prohibido: [/\d{2}\.\d{3}\s*millones/, /34\.059/],
        esperado: [/[Ii]nforme|comprar|acceso/],
      },
      {
        titulo: "el mismo dato con plan de registros",
        mensaje: "¿Cómo le fue a Mercadona en 2024? Dame sus ventas.",
        usuarioId: 133627,
        esperado: [/2024/],
      },
    ],
  },
  {
    flujo: "B — Asesoría",
    turnos: [
      {
        titulo: "pregunta de crédito: no puede opinar",
        mensaje:
          "Un proveedor nuevo me pide crédito a 90 días por 40.000 €. ¿Qué me conviene mirar?",
        prohibido: [
          /yo (le )?dar[ií]a/i,
          /es solvente/i,
          /parece fiable/i,
          /te recomiendo conceder/i,
        ],
        esperado: [/[Ii]nforme de [Rr]iesgo/],
      },
    ],
  },
  {
    flujo: "C — Listado conversacional",
    turnos: [
      {
        titulo: "el segmento",
        mensaje:
          "Empresas de logística en Valencia y Castellón, más de 20 empleados, que facturen sobre 2 millones y tengan correo",
        esperado: [/empresas/],
      },
      {
        titulo: "el ajuste, en la misma conversación",
        mensaje: "Quita las de menos de 5 años",
        esperado: [/empresas/],
      },
    ],
  },
  {
    // Este flujo no estaba en el guion original: se añadió porque falló en una
    // prueba real. El modelo dijo que el EBITDA no era un campo y se inventó
    // qué significaban los códigos —colocó el 99022 como «Resultado del
    // ejercicio», cuando es Apalancamiento—. Ahora el catálogo va en el prompt
    // y los registros por campo los da construir_segmento.
    flujo: "D — Campos de un listado",
    turnos: [
      {
        titulo: "el segmento",
        mensaje: "Panaderías en Madrid",
        esperado: [/empresas|540/],
      },
      {
        titulo: "qué campos financieros trae",
        mensaje: "¿Qué campos financieros puedo incluir? ¿Está el EBITDA?",
        prohibido: [
          // Las dos formas de fallar: negar un campo que existe…
          /(EBITDA|ebitda)[^.]{0,60}no (es|est[áa]|figura|existe|se encuentra)/i,
          /no (es|est[áa]) (un )?campo/i,
          // …y colocarle a un código una etiqueta que no es la suya.
          /99022[^\n]{0,40}[Rr]esultado del ejercicio/,
          /49500[^\n]{0,40}[Aa]palancamiento/,
        ],
        esperado: [/EBITDA/i],
      },
    ],
  },
];

interface Salida {
  texto: string;
  pasos: { id: string; texto?: string; estado: string; detalle?: string }[];
  tarjetas: string[];
  conversationId: string;
  tokens?: { entrada: number; salida: number };
}

async function conversar(turno: Turno, conversationId?: string): Promise<Salida> {
  const cuerpo: Record<string, unknown> = { mensaje: turno.mensaje };
  if (conversationId) cuerpo["conversationId"] = conversationId;

  // El usuario se acredita con el token que acuña el ASP contra /internal/mint,
  // no diciendo su id. Aquí se imita lo que hará el ASP de verdad.
  const cabeceras: Record<string, string> = { "content-type": "application/json" };
  if (turno.usuarioId) {
    const acunado = await fetch(`${API}/internal/mint`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shared-secret": process.env["AGENT_SHARED_SECRET"] ?? "",
      },
      body: JSON.stringify({ usuarioId: turno.usuarioId }),
    });
    if (!acunado.ok) throw new Error(`mint devolvió ${acunado.status}`);
    const { token } = (await acunado.json()) as { token: string };
    cabeceras["authorization"] = `Bearer ${token}`;
  }

  const respuesta = await fetch(`${API}/v1/conversar`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify(cuerpo),
  });

  if (!respuesta.body) throw new Error(`Sin cuerpo: HTTP ${respuesta.status}`);

  const salida: Salida = { texto: "", pasos: [], tarjetas: [], conversationId: "" };
  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let resto = "";

  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    resto += decodificador.decode(value, { stream: true });

    const bloques = resto.split("\n\n");
    resto = bloques.pop() ?? "";

    for (const bloque of bloques) {
      const evento = /event: (\w+)/.exec(bloque)?.[1];
      const datos = /data: (.*)/.exec(bloque)?.[1];
      if (!evento || !datos) continue;
      const j = JSON.parse(datos) as Record<string, string | undefined> & {
        tokens?: { entrada: number; salida: number };
      };

      if (evento === "texto") salida.texto += j["delta"] ?? "";
      else if (evento === "status")
        salida.pasos.push(j as unknown as Salida["pasos"][number]);
      else if (evento === "tarjeta") salida.tarjetas.push(j["tipo"] ?? "?");
      else if (evento === "inicio") salida.conversationId = j["conversationId"] ?? "";
      else if (evento === "fin" && j.tokens) salida.tokens = j.tokens;
      else if (evento === "error") salida.texto += `\n[ERROR] ${j["mensaje"]}`;
    }
  }

  return salida;
}

let fallos = 0;

// `pnpm demo D` corre solo el flujo D. Útil cuando se está arreglando uno.
const soloEstos = process.argv.slice(2).map((a) => a.toUpperCase());

for (const { flujo, turnos } of GUION) {
  if (soloEstos.length > 0 && !soloEstos.includes(flujo[0] ?? "")) continue;
  console.log(`\n${"═".repeat(70)}\n${flujo}\n${"═".repeat(70)}`);
  let conversacion: string | undefined;

  for (const turno of turnos) {
    console.log(`\n▸ ${turno.titulo}`);
    console.log(`  «${turno.mensaje}»`);

    const arranque = Date.now();
    // Si cambia el usuario, cambia la conversación: un anónimo y un usuario con
    // plan no comparten historial ni en la demo ni en la realidad.
    const salida = await conversar(turno, turno.usuarioId ? undefined : conversacion);
    conversacion = turno.usuarioId ? undefined : salida.conversationId;

    // Solo los cierres: es lo que se ve como línea de tiempo colapsada.
    for (const paso of salida.pasos.filter((p) => p.estado !== "activo")) {
      console.log(
        `    ${paso.estado === "ok" ? "✓" : "✗"} ${paso.id}${paso.detalle ? ` · ${paso.detalle}` : ""}`,
      );
    }
    if (salida.tarjetas.length > 0)
      console.log(`    tarjetas: ${salida.tarjetas.join(", ")}`);

    console.log(
      `    ${((Date.now() - arranque) / 1000).toFixed(1)} s · ${salida.tokens?.entrada ?? 0}/${salida.tokens?.salida ?? 0} tokens`,
    );
    console.log(
      salida.texto
        .trim()
        .split("\n")
        .map((l) => `    │ ${l}`)
        .join("\n"),
    );

    for (const patron of turno.prohibido ?? []) {
      if (patron.test(salida.texto)) {
        console.log(`    ⚠️  APARECE LO QUE NO DEBÍA: ${patron}`);
        fallos++;
      }
    }
    for (const patron of turno.esperado ?? []) {
      if (!patron.test(salida.texto)) {
        console.log(`    ⚠️  FALTA lo esperado: ${patron}`);
        fallos++;
      }
    }
  }
}

console.log(
  `\n${"═".repeat(70)}\n${fallos === 0 ? "Todo pasa." : `${fallos} comprobaciones fallidas.`}\n`,
);
if (fallos > 0) process.exitCode = 1;
