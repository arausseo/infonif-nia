/**
 * Crea el índice de empresas en el Elasticsearch local y carga los fixtures.
 *
 * Idempotente: borra el índice y lo vuelve a crear. Solo para desarrollo — este
 * script nunca debe apuntar al clúster de Infonif.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { config } from "../src/comun/config.js";
import { es, existe } from "../src/datos/elastic/cliente.js";
import { rutas } from "../src/datos/elastic/rutas.js";
import {
  AJUSTES_INDICE,
  DocumentoEmpresa,
  PROPIEDADES_EMPRESA,
} from "../src/datos/elastic/mapping.js";

const TAMANO_LOTE = 500;

const aqui = dirname(fileURLToPath(import.meta.url));
const ficheroEmpresas = resolve(aqui, "../src/datos/fixtures/empresas.json");

async function esperarACluster(intentos = 30): Promise<void> {
  for (let i = 1; i <= intentos; i++) {
    try {
      const salud = await es<{ status: string }>("/_cluster/health", {
        tiempoLimiteMs: 3000,
      });
      if (salud.status === "green" || salud.status === "yellow") {
        console.log(`Elasticsearch listo (estado ${salud.status})`);
        return;
      }
    } catch {
      // todavía arrancando
    }
    process.stdout.write(`\rEsperando a ${config.ES_URL}… (${i}/${intentos})`);
    await new Promise((listo) => setTimeout(listo, 2000));
  }
  throw new Error(
    `Elasticsearch no respondió en ${config.ES_URL}. ¿Está levantado el compose?`,
  );
}

async function recrearIndice(): Promise<void> {
  if (await existe(rutas.indiceRaiz)) {
    await es(rutas.indiceRaiz, { metodo: "DELETE" });
    console.log(`Índice "${rutas.indice}" anterior borrado`);
  }
  await es(rutas.indiceRaiz, {
    metodo: "PUT",
    cuerpo: {
      settings: AJUSTES_INDICE,
      mappings: rutas.envolverMapping(PROPIEDADES_EMPRESA),
    },
  });
  console.log(`Índice "${rutas.indice}" creado (rutas de ES ${rutas.version}.x)`);
}

interface RespuestaBulk {
  errors: boolean;
  items: { index?: { status: number; error?: { reason?: string } } }[];
}

async function cargar(empresas: z.infer<typeof DocumentoEmpresa>[]): Promise<void> {
  for (let inicio = 0; inicio < empresas.length; inicio += TAMANO_LOTE) {
    const lote = empresas.slice(inicio, inicio + TAMANO_LOTE);
    const ndjson =
      lote
        .flatMap((empresa) => [
          JSON.stringify(rutas.accionBulk(empresa.nif)),
          JSON.stringify(empresa),
        ])
        .join("\n") + "\n";

    const respuesta = await es<RespuestaBulk>(rutas.bulk, { ndjson });
    if (respuesta.errors) {
      const fallo = respuesta.items.find((i) => i.index && i.index.status >= 300);
      throw new Error(
        `El bulk falló: ${fallo?.index?.error?.reason ?? "motivo desconocido"}`,
      );
    }
    console.log(
      `  indexadas ${Math.min(inicio + TAMANO_LOTE, empresas.length)}/${empresas.length}`,
    );
  }
  await es(rutas.refrescar, { metodo: "POST" });
}

async function principal(): Promise<void> {
  const crudo: unknown = JSON.parse(readFileSync(ficheroEmpresas, "utf8"));
  const empresas = z.array(DocumentoEmpresa).parse(crudo);
  console.log(`${empresas.length} empresas leídas de fixtures`);

  await esperarACluster();
  await recrearIndice();
  await cargar(empresas);

  const { count } = await es<{ count: number }>(rutas.contar, {
    cuerpo: { query: { match_all: {} } },
  });
  console.log(
    `\nListo: ${count} empresas consultables en ${config.ES_URL}/${rutas.indice}`,
  );

  if (count !== empresas.length) {
    throw new Error(
      `Se esperaban ${empresas.length} documentos y el índice tiene ${count}`,
    );
  }
}

principal().catch((error: unknown) => {
  console.error(`\nLa siembra ha fallado: ${String(error)}`);
  process.exit(1);
});
