/**
 * Genera `src/datos/fixtures/empresas.json`: 200 empresas sintéticas con la
 * forma que esperamos del índice real (ver datos/elastic/mapping.ts).
 *
 * DETERMINISTA: semilla fija, mismo fichero en cada ejecución. El fixture se
 * versiona; el script está aquí para poder cambiar la forma sin editar 200
 * registros a mano.
 *
 * SESGO DELIBERADO: el 25 % de las empresas son de transporte y logística, y
 * dentro de ese sector Valencia y Castellón están sobrerrepresentadas. No es una
 * distribución realista del tejido empresarial español: es lo que hace falta
 * para que el flujo C del guion de demo (PLAN.md) tenga contra qué contar. Con
 * 200 registros, cualquier segmento realista saldría vacío.
 *
 * NINGUNA empresa real aparece aquí. Los datos financieros son inventados, así
 * que atribuirlos a una empresa que existe sería fabricar un registro falso.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { CATALOGO_CNAE, type Sector } from "../src/datos/cnae/catalogo.js";
import {
  DocumentoEmpresa,
  rangoDeVentas,
  type DocumentoEmpresa as Empresa,
} from "../src/datos/elastic/mapping.js";
import { ErrorValidacion } from "../src/comun/errores.js";
import { CODIGO_PROVINCIA as CP, type Provincia } from "../src/datos/geo/provincias.js";

const SEMILLA = 20260808;
const TOTAL = 200;

// ─── Azar reproducible ────────────────────────────────────────────────────────

function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const azar = mulberry32(SEMILLA);

function noNulo<T>(valor: T | undefined, que: string): T {
  if (valor === undefined)
    throw new ErrorValidacion(`Fixture inconsistente: falta ${que}`);
  return valor;
}

function elegir<T>(items: readonly T[]): T {
  return noNulo(items[Math.floor(azar() * items.length)], "elemento de una lista vacía");
}

function elegirPonderado<T>(entradas: readonly (readonly [T, number])[]): T {
  const total = entradas.reduce((suma, [, peso]) => suma + peso, 0);
  let punto = azar() * total;
  for (const [valor, peso] of entradas) {
    punto -= peso;
    if (punto <= 0) return valor;
  }
  return noNulo(entradas[entradas.length - 1], "última entrada ponderada")[0];
}

const enteroEntre = (min: number, max: number): number =>
  Math.floor(azar() * (max - min + 1)) + min;

const entre = (min: number, max: number): number => azar() * (max - min) + min;

const ocurre = (probabilidad: number): boolean => azar() < probabilidad;

// ─── Geografía ────────────────────────────────────────────────────────────────

const MUNICIPIOS: Partial<Record<Provincia, readonly string[]>> = {
  Madrid: ["Madrid", "Alcobendas", "Getafe", "Alcalá de Henares", "Móstoles", "Coslada"],
  Barcelona: [
    "Barcelona",
    "Hospitalet de Llobregat",
    "Sabadell",
    "Terrassa",
    "Badalona",
    "Granollers",
  ],
  Valencia: [
    "Valencia",
    "Paterna",
    "Torrent",
    "Sagunto",
    "Ribarroja del Turia",
    "Alzira",
  ],
  Castellón: [
    "Castellón de la Plana",
    "Villarreal",
    "Onda",
    "Almazora",
    "Vinaroz",
    "Burriana",
  ],
  Alicante: ["Alicante", "Elche", "Elda", "Alcoy", "Benidorm", "Ibi"],
  Sevilla: ["Sevilla", "Dos Hermanas", "Alcalá de Guadaíra", "Utrera"],
  Zaragoza: ["Zaragoza", "Calatayud", "Utebo", "La Almunia"],
  Málaga: ["Málaga", "Marbella", "Vélez-Málaga", "Antequera"],
  Vizcaya: ["Bilbao", "Baracaldo", "Guecho", "Durango"],
  Murcia: ["Murcia", "Cartagena", "Lorca", "Molina de Segura"],
  Tarragona: ["Tarragona", "Reus", "Valls", "Amposta"],
  "La Coruña": ["La Coruña", "Santiago de Compostela", "Ferrol", "Arteijo"],
  Navarra: ["Pamplona", "Tudela", "Estella"],
  Toledo: ["Toledo", "Talavera de la Reina", "Illescas"],
  Baleares: ["Palma", "Inca", "Manacor"],
};

const PREFIJO_TEL: Partial<Record<Provincia, string>> = {
  Madrid: "91",
  Barcelona: "93",
  Valencia: "96",
  Castellón: "964",
  Alicante: "965",
  Sevilla: "954",
  Málaga: "952",
  Zaragoza: "976",
  Vizcaya: "944",
  Murcia: "968",
  Tarragona: "977",
  "La Coruña": "981",
  Navarra: "948",
  Baleares: "971",
  Toledo: "925",
};

/** Distribución general. Concentra donde está el tejido empresarial. */
// prettier-ignore
const PROVINCIAS_GENERAL: readonly (readonly [Provincia, number])[] = [
  ["Madrid", 18], ["Barcelona", 15], ["Valencia", 9], ["Alicante", 5],
  ["Sevilla", 5], ["Málaga", 4], ["Vizcaya", 4], ["Zaragoza", 3.5],
  ["Murcia", 3], ["Baleares", 2.5], ["Castellón", 2.5], ["La Coruña", 2.5],
  ["Asturias", 2], ["Pontevedra", 2], ["Tarragona", 2], ["Granada", 1.5],
  ["Navarra", 1.5], ["Guipúzcoa", 1.5], ["Cádiz", 1.5], ["Las Palmas", 1.5],
  ["Santa Cruz de Tenerife", 1.5], ["Valladolid", 1.2], ["Girona", 1.2],
  ["Córdoba", 1], ["Toledo", 1], ["León", 0.8], ["Lérida", 0.8], ["Almería", 0.8],
  ["Cantabria", 0.8], ["Badajoz", 0.7], ["Salamanca", 0.6], ["Burgos", 0.6],
  ["Huelva", 0.5], ["Jaén", 0.5], ["La Rioja", 0.5], ["Ciudad Real", 0.5],
  ["Albacete", 0.5], ["Lugo", 0.4], ["Orense", 0.4], ["Cáceres", 0.4],
  ["Huesca", 0.3], ["Segovia", 0.3], ["Ávila", 0.3], ["Cuenca", 0.3],
  ["Palencia", 0.3], ["Zamora", 0.3], ["Soria", 0.2], ["Teruel", 0.2],
  ["Álava", 0.6], ["Guadalajara", 0.5], ["Ceuta", 0.2], ["Melilla", 0.2],
];

/** El corredor mediterráneo concentra logística. Sesgo deliberado, ver cabecera. */
// prettier-ignore
const PROVINCIAS_LOGISTICA: readonly (readonly [Provincia, number])[] = [
  ["Valencia", 20], ["Castellón", 12], ["Barcelona", 13], ["Madrid", 13],
  ["Murcia", 8], ["Alicante", 8], ["Zaragoza", 7], ["Sevilla", 5],
  ["Tarragona", 4], ["Vizcaya", 3], ["Málaga", 2], ["Baleares", 2],
  ["Navarra", 1.5], ["La Coruña", 1.5],
];

// ─── Sectores y tamaños ───────────────────────────────────────────────────────

const SECTORES: readonly (readonly [Sector, number])[] = [
  ["transporte y logística", 25],
  ["comercio", 12],
  ["tecnología", 10],
  ["construcción e inmobiliario", 10],
  ["industria manufacturera", 10],
  ["servicios profesionales", 8],
  ["agroalimentario", 8],
  ["hostelería", 6],
  ["servicios a empresas", 5],
  ["sanidad", 3],
  ["textil y calzado", 2],
  ["energía y medio ambiente", 1],
];

type Tamano = "micro" | "pequena" | "mediana" | "grande";

const PERFIL_TAMANO: Record<
  Tamano,
  { empleados: [number, number]; vpe: [number, number] }
> = {
  micro: { empleados: [1, 9], vpe: [30_000, 90_000] },
  pequena: { empleados: [10, 49], vpe: [45_000, 145_000] },
  mediana: { empleados: [50, 249], vpe: [60_000, 200_000] },
  grande: { empleados: [250, 2400], vpe: [80_000, 300_000] },
};

// prettier-ignore
const TAMANOS_GENERAL: readonly (readonly [Tamano, number])[] = [
  ["micro", 44], ["pequena", 34], ["mediana", 17], ["grande", 5],
];

// prettier-ignore
const TAMANOS_LOGISTICA: readonly (readonly [Tamano, number])[] = [
  ["micro", 27], ["pequena", 40], ["mediana", 27], ["grande", 6],
];

// ─── Nombres ──────────────────────────────────────────────────────────────────

const PREFIJOS: Record<Sector, readonly string[]> = {
  "transporte y logística": [
    "TRANSPORTES",
    "LOGÍSTICA",
    "DISTRIBUCIONES",
    "ALMACENES",
    "CARGAS",
    "MUDANZAS",
    "TRANSPORTES Y LOGÍSTICA",
  ],
  comercio: ["COMERCIAL", "DISTRIBUCIONES", "SUMINISTROS", "MAYORISTAS"],
  "construcción e inmobiliario": [
    "CONSTRUCCIONES",
    "PROMOCIONES",
    "OBRAS Y SERVICIOS",
    "INMOBILIARIA",
  ],
  hostelería: ["HOSTELERÍA", "RESTAURACIÓN", "HOTELES", "GRUPO GASTRONÓMICO"],
  tecnología: ["SOLUCIONES", "SISTEMAS", "TECNOLOGÍAS", "INFORMÁTICA"],
  "servicios profesionales": ["ASESORÍA", "CONSULTORÍA", "GABINETE", "INGENIERÍA"],
  "servicios a empresas": ["SERVICIOS", "LIMPIEZAS", "SEGURIDAD", "PERSONAL"],
  sanidad: ["CLÍNICA", "CENTRO MÉDICO", "SANITARIA"],
  agroalimentario: ["AGRÍCOLA", "ALIMENTARIA", "BODEGAS", "PRODUCTOS"],
  "textil y calzado": ["TEXTIL", "CONFECCIONES", "CALZADOS"],
  "industria manufacturera": ["INDUSTRIAS", "MANUFACTURAS", "TALLERES", "CERÁMICAS"],
  "energía y medio ambiente": ["ENERGÍAS", "MEDIOAMBIENTE", "RECICLADOS"],
};

const NUCLEOS = [
  "LEVANTE",
  "EBRO",
  "DUERO",
  "TURIA",
  "MEDITERRÁNEO",
  "ATLÁNTICO",
  "IBERIA",
  "GUADIANA",
  "CANTÁBRICO",
  "SEGURA",
  "GARCÍA",
  "MARTÍNEZ",
  "SOLER",
  "NAVARRO",
  "BELTRÁN",
  "CASTELLÓ",
  "AZNAR",
  "PEIRÓ",
  "SANCHIS",
  "MORENO",
  "DELGADO",
  "OLIVA",
  "ALBA",
  "ARCO",
  "PUERTO",
  "MERIDIANO",
  "HORIZONTE",
  "CENTRAL",
  "PENÍNSULA",
  "ARENAL",
  "PINAR",
  "CAMPO",
  "VEGA",
  "RIBERA",
  "SALINAS",
] as const;

const SUFIJOS = [
  "",
  "",
  "",
  "",
  "EXPRESS",
  "GLOBAL",
  "2000",
  "GRUPO",
  "E HIJOS",
  "SERVICIOS",
] as const;

const FORMAS: readonly (readonly [
  { codigo: "SL" | "SA" | "SCOOP" | "OTRA"; letra: string },
  number,
])[] = [
  [{ codigo: "SL", letra: "B" }, 74],
  [{ codigo: "SA", letra: "A" }, 16],
  [{ codigo: "SCOOP", letra: "F" }, 6],
  [{ codigo: "OTRA", letra: "G" }, 4],
];

function ranurizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Generación ───────────────────────────────────────────────────────────────

const nifsUsados = new Set<string>();
const nombresUsados = new Set<string>();

function nifUnico(letra: string): string {
  for (let intento = 0; intento < 1000; intento++) {
    const nif = `${letra}${String(enteroEntre(10_000_000, 99_999_999))}`;
    if (!nifsUsados.has(nif)) {
      nifsUsados.add(nif);
      return nif;
    }
  }
  throw new ErrorValidacion("No se ha podido generar un NIF único");
}

function nombreUnico(sector: Sector, forma: string): string {
  for (let intento = 0; intento < 2000; intento++) {
    const prefijo = elegir(PREFIJOS[sector]);
    const nucleo = elegir(NUCLEOS);
    const sufijo = elegir(SUFIJOS);
    const nombre = [prefijo, nucleo, sufijo].filter(Boolean).join(" ");
    if (!nombresUsados.has(nombre)) {
      nombresUsados.add(nombre);
      return `${nombre} ${forma === "SCOOP" ? "SCOOP" : forma === "OTRA" ? "SL" : forma}`;
    }
  }
  throw new ErrorValidacion("No se ha podido generar una razón social única");
}

function generarEmpresa(): Empresa {
  const sector = elegirPonderado(SECTORES);
  const esLogistica = sector === "transporte y logística";

  const cnae = elegir(CATALOGO_CNAE.filter((e) => e.sector === sector));
  const provincia = elegirPonderado(
    esLogistica ? PROVINCIAS_LOGISTICA : PROVINCIAS_GENERAL,
  );
  const municipio = elegir(MUNICIPIOS[provincia] ?? [provincia]);

  const tamano = elegirPonderado(esLogistica ? TAMANOS_LOGISTICA : TAMANOS_GENERAL);
  const perfil = PERFIL_TAMANO[tamano];
  const empleados = enteroEntre(perfil.empleados[0], perfil.empleados[1]);
  const ventas = Math.round(empleados * entre(perfil.vpe[0], perfil.vpe[1]));

  const margenEbitda = ocurre(0.86) ? entre(0.02, 0.19) : entre(-0.09, 0.0);
  const ebitda = Math.round(ventas * margenEbitda);
  const resultado = Math.round(ebitda * entre(0.35, 0.78) - ventas * entre(0.002, 0.02));
  const activoTotal = Math.round(ventas * entre(0.5, 1.7));
  const fondosPropios = Math.round(activoTotal * entre(0.08, 0.62));

  const forma = elegirPonderado(FORMAS);
  const razonSocial = nombreUnico(sector, forma.codigo);
  const dominio = ranurizar(razonSocial.replace(/ (SL|SA|SCOOP)$/, ""));

  const tieneEmail = ocurre(0.82);
  const tieneTelefono = ocurre(0.93);
  const prefijoTel = PREFIJO_TEL[provincia] ?? `9${CP[provincia]}`;

  const anioConstitucion = enteroEntre(1975, 2024);
  const mes = String(enteroEntre(1, 12)).padStart(2, "0");
  const dia = String(enteroEntre(1, 28)).padStart(2, "0");

  const empresa: Empresa = {
    nif: nifUnico(forma.letra),
    razonSocial,
    cnae: cnae.codigo,
    cnaeDescripcion: cnae.descripcion,
    provincia,
    municipio,
    codigoPostal: `${CP[provincia]}${String(enteroEntre(0, 999)).padStart(3, "0")}`,
    formaJuridica: forma.codigo,
    fechaConstitucion: `${anioConstitucion}-${mes}-${dia}`,
    situacion: elegirPonderado([
      ["activa", 94],
      ["concursal", 3],
      ["extinguida", 3],
    ] as const),
    empleados,
    ejercicioFiscal: ocurre(0.7) ? 2024 : 2023,
    ventas,
    rangoVentas: rangoDeVentas(ventas),
    ebitda,
    resultado,
    activoTotal,
    fondosPropios,
    tieneEmail,
    tieneTelefono,
  };

  if (ocurre(0.25)) {
    empresa.nombreComercial = razonSocial.replace(/ (SL|SA|SCOOP)$/, "");
  }
  if (tieneEmail) empresa.email = `info@${dominio}.es`;
  if (tieneTelefono) {
    const resto = 9 - prefijoTel.length;
    empresa.telefono = `${prefijoTel} ${String(enteroEntre(0, 10 ** resto - 1)).padStart(resto, "0")}`;
  }
  if (ocurre(0.62)) empresa.web = `www.${dominio}.es`;

  return empresa;
}

/**
 * Empresa grande de referencia para el flujo A del demo ("¿cómo le fue a X en
 * 2024?"). Sintética a propósito: el guion cita una cadena real, pero adjudicar
 * cifras inventadas a una empresa que existe sería fabricar un registro.
 */
const EMPRESA_INSIGNIA: Empresa = {
  nif: "A46000001",
  razonSocial: "SUPERMERCADOS TURIA SA",
  nombreComercial: "Turia",
  cnae: "4711",
  cnaeDescripcion: "Comercio al por menor con predominio en productos alimenticios",
  provincia: "Valencia",
  municipio: "Paterna",
  codigoPostal: "46980",
  formaJuridica: "SA",
  fechaConstitucion: "1981-03-17",
  situacion: "activa",
  empleados: 18_400,
  ejercicioFiscal: 2024,
  ventas: 6_240_000_000,
  rangoVentas: rangoDeVentas(6_240_000_000),
  ebitda: 468_000_000,
  resultado: 291_000_000,
  activoTotal: 4_100_000_000,
  fondosPropios: 2_380_000_000,
  email: "atencioncliente@supermercados-turia.es",
  telefono: "96 100 20 00",
  web: "www.supermercados-turia.es",
  tieneEmail: true,
  tieneTelefono: true,
};

function generar(): Empresa[] {
  nifsUsados.add(EMPRESA_INSIGNIA.nif);
  nombresUsados.add(EMPRESA_INSIGNIA.razonSocial);

  const empresas: Empresa[] = [EMPRESA_INSIGNIA];
  while (empresas.length < TOTAL) empresas.push(generarEmpresa());

  for (const empresa of empresas) DocumentoEmpresa.parse(empresa);
  return empresas;
}

// ─── Salida ───────────────────────────────────────────────────────────────────

const aqui = dirname(fileURLToPath(import.meta.url));
const destino = resolve(aqui, "../src/datos/fixtures/empresas.json");

const empresas = generar();
writeFileSync(destino, `${JSON.stringify(empresas, null, 2)}\n`, "utf8");

// Resumen: sirve para comprobar de un vistazo que el demo tiene contra qué contar.
const logistica = empresas.filter((e) =>
  ["4941", "5210", "5229", "4942", "5224", "5320", "5040"].includes(e.cnae),
);
const segmentoDemoC = logistica.filter(
  (e) =>
    (e.provincia === "Valencia" || e.provincia === "Castellón") &&
    e.empleados > 20 &&
    e.ventas >= 2_000_000 &&
    e.tieneEmail,
);

console.log(`Escritas ${empresas.length} empresas en ${destino}`);
console.log(`  transporte y logística: ${logistica.length}`);
console.log(`  segmento del flujo C del demo: ${segmentoDemoC.length} empresas`);
console.log(
  `  provincias distintas: ${new Set(empresas.map((e) => e.provincia)).size} · ` +
    `CNAE distintos: ${new Set(empresas.map((e) => e.cnae)).size}`,
);
