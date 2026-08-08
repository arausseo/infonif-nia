/**
 * Normalización de nombres de provincia.
 *
 * Ojo con el cambio respecto a la Fase 0: **la forma canónica ya no es nuestra**.
 * El filtro de Infonif espera la ruta literal `Comunidad|Provincia` con la grafía
 * del INE (`Castelló`, `Coruña, A`, `Valencia/València`). Este módulo ya no
 * mantiene una lista propia: solo sabe reducir cualquier grafía a una clave
 * comparable, para que `resumen.ts` case lo que escribe el usuario con lo que
 * publica el API.
 *
 * Y hay que devolver **todas** las coincidencias, no una: en los datos de
 * Infonif conviven `Santa Cruz De Tenerife` (56.986 empresas) y
 * `Sta. Cruz De Tenerife` (8). Quedarse con una pierde registros en silencio, y
 * un conteo que acaba en factura no puede permitírselo.
 */

const DIACRITICOS = /\p{Diacritic}/gu;

/**
 * Reduce un nombre de provincia a una clave comparable: minúsculas, sin
 * acentos, sin puntuación y con los artículos pospuestos recolocados.
 *
 *   "Coruña, A"     → "a coruna"
 *   "La Coruña"     → "a coruna"
 *   "Sta. Cruz De Tenerife" → "santa cruz de tenerife"
 */
export function claveProvincia(texto: string): string {
  let clave = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // "coruna, a" → "a coruna";  "palmas, las" → "las palmas"
  const pospuesto = /^(.+),\s*(a|as|o|os|el|la|las|los|les|illes|es)$/.exec(clave);
  if (pospuesto) clave = `${pospuesto[2]} ${pospuesto[1]}`;

  clave = clave.replace(/,/g, "").replace(/\s+/g, " ").trim();

  for (const [patron, canonica] of SINONIMOS) {
    if (patron.test(clave)) return canonica;
  }
  return clave;
}

/**
 * Sinónimos que `claveProvincia` no puede deducir por normalización: grafías
 * cooficiales, abreviaturas de sus datos y nombres de capital por provincia.
 */
const SINONIMOS: readonly (readonly [RegExp, string])[] = [
  [/^(a|la) coruna$/, "a coruna"],
  [/^sta cruz de tenerife$/, "santa cruz de tenerife"],
  [/^tenerife$/, "santa cruz de tenerife"],
  [/^(les |illes |islas |las )?(balears|baleares)$/, "balears illes"],
  [/^(illes balears|baleares|balears illes)$/, "balears illes"],
  [/^mallorca$/, "balears illes"],
  [/^(las )?palmas( de gran canaria)?$/, "las palmas"],
  [/^(la )?rioja$/, "la rioja"],
  [/^logrono$/, "la rioja"],
  [/^(lleida|lerida)$/, "lleida"],
  [/^(girona|gerona)$/, "girona"],
  [/^(ourense|orense)$/, "ourense"],
  [/^(gipuzkoa|guipuzcoa)$/, "gipuzkoa"],
  [/^(san sebastian|donostia)$/, "gipuzkoa"],
  [/^(bizkaia|vizcaya)$/, "bizkaia"],
  [/^bilbao$/, "bizkaia"],
  [/^(araba|alava)( ?\/ ?(alava|araba))?$/, "araba alava"],
  [/^vitoria( gasteiz)?$/, "araba alava"],
  [/^(alicante|alacant)( ?\/ ?(alacant|alicante))?$/, "alicante alacant"],
  [/^(valencia|valencia)( ?\/ ?valencia)?$/, "valencia valencia"],
  [
    /^(castellon|castello)( de la plana)?( ?\/ ?(castello|castellon))?$/,
    "castellon castello",
  ],
  [/^(navarra|nafarroa)$/, "navarra"],
  [/^pamplona$/, "navarra"],
  [/^(asturias|principado de asturias)$/, "asturias"],
  [/^oviedo$/, "asturias"],
  [/^(cantabria|santander)$/, "cantabria"],
  [/^(murcia|region de murcia)$/, "murcia"],
];
