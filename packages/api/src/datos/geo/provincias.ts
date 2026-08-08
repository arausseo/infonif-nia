/**
 * Las 52 provincias españolas (50 + Ceuta y Melilla).
 *
 * Es el dominio cerrado de `provincias` en FiltroSegmento (CONTRATOS §3) y el
 * `size` de la agregación `terms` del desglose. La grafía es la castellana
 * porque es la que se espera en el índice; si el índice real usa otra
 * (p. ej. "Lleida" o "A Coruña"), se normaliza aquí y en ningún otro sitio.
 */
export const PROVINCIAS_ES = [
  "Álava",
  "Albacete",
  "Alicante",
  "Almería",
  "Asturias",
  "Ávila",
  "Badajoz",
  "Baleares",
  "Barcelona",
  "Burgos",
  "Cáceres",
  "Cádiz",
  "Cantabria",
  "Castellón",
  "Ceuta",
  "Ciudad Real",
  "Córdoba",
  "Cuenca",
  "Girona",
  "Granada",
  "Guadalajara",
  "Guipúzcoa",
  "Huelva",
  "Huesca",
  "Jaén",
  "La Coruña",
  "La Rioja",
  "Las Palmas",
  "León",
  "Lérida",
  "Lugo",
  "Madrid",
  "Málaga",
  "Melilla",
  "Murcia",
  "Navarra",
  "Orense",
  "Palencia",
  "Pontevedra",
  "Salamanca",
  "Santa Cruz de Tenerife",
  "Segovia",
  "Sevilla",
  "Soria",
  "Tarragona",
  "Teruel",
  "Toledo",
  "Valencia",
  "Valladolid",
  "Vizcaya",
  "Zamora",
  "Zaragoza",
] as const;

export type Provincia = (typeof PROVINCIAS_ES)[number];

/**
 * Código oficial de provincia (INE), que es también el prefijo del código
 * postal. Se usa para validar direcciones y para generar fixtures verosímiles.
 */
export const CODIGO_PROVINCIA: Record<Provincia, string> = {
  Álava: "01",
  Albacete: "02",
  Alicante: "03",
  Almería: "04",
  Ávila: "05",
  Badajoz: "06",
  Baleares: "07",
  Barcelona: "08",
  Burgos: "09",
  Cáceres: "10",
  Cádiz: "11",
  Castellón: "12",
  "Ciudad Real": "13",
  Córdoba: "14",
  "La Coruña": "15",
  Cuenca: "16",
  Girona: "17",
  Granada: "18",
  Guadalajara: "19",
  Guipúzcoa: "20",
  Huelva: "21",
  Huesca: "22",
  Jaén: "23",
  León: "24",
  Lérida: "25",
  "La Rioja": "26",
  Lugo: "27",
  Madrid: "28",
  Málaga: "29",
  Murcia: "30",
  Navarra: "31",
  Orense: "32",
  Asturias: "33",
  Palencia: "34",
  "Las Palmas": "35",
  Pontevedra: "36",
  Salamanca: "37",
  "Santa Cruz de Tenerife": "38",
  Cantabria: "39",
  Segovia: "40",
  Sevilla: "41",
  Soria: "42",
  Tarragona: "43",
  Teruel: "44",
  Toledo: "45",
  Valencia: "46",
  Valladolid: "47",
  Vizcaya: "48",
  Zamora: "49",
  Zaragoza: "50",
  Ceuta: "51",
  Melilla: "52",
};

/** Marcas diacríticas combinantes, para normalizar sin depender de locale. */
const DIACRITICOS = /\p{Diacritic}/gu;

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize("NFD").replace(DIACRITICOS, "");
}

/**
 * Grafías cooficiales y coloquiales que el usuario puede escribir.
 * Las claves están ya normalizadas (minúsculas, sin acentos).
 */
const ALIAS: Record<string, Provincia> = {
  araba: "Álava",
  "a coruna": "La Coruña",
  coruna: "La Coruña",
  lleida: "Lérida",
  gerona: "Girona",
  ourense: "Orense",
  gipuzkoa: "Guipúzcoa",
  "san sebastian": "Guipúzcoa",
  bizkaia: "Vizcaya",
  bilbao: "Vizcaya",
  "islas baleares": "Baleares",
  "illes balears": "Baleares",
  mallorca: "Baleares",
  tenerife: "Santa Cruz de Tenerife",
  "santa cruz": "Santa Cruz de Tenerife",
  "valencia/valencia": "Valencia",
  castello: "Castellón",
  "castellon de la plana": "Castellón",
  alacant: "Alicante",
  almeria: "Almería",
};

const INDICE = new Map<string, Provincia>(PROVINCIAS_ES.map((p) => [normalizar(p), p]));

/** Devuelve la provincia canónica, o `undefined` si el texto no la identifica. */
export function resolverProvincia(texto: string): Provincia | undefined {
  const clave = normalizar(texto);
  return INDICE.get(clave) ?? ALIAS[clave];
}
