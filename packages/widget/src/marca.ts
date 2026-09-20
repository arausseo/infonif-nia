/**
 * El nombre que ve el usuario, en un solo sitio.
 *
 * Estaba escrito a mano en cuatro: el lanzador, su etiqueta accesible, la
 * cabecera del cajón y la tarjeta de bloqueo. Cuando Infonif pidió cambiarlo de
 * «Nia» a «Infonif.IA» hubo que buscarlas una a una, y la etiqueta accesible
 * —que no se ve— es justo la que se queda atrás.
 *
 * Lo que NO cambia con esto son los identificadores internos: el prefijo `nia-`
 * de las clases, `@nia/widget`, `window.__INFONIF_AGENT__`, `/opt/nia`, la ruta
 * `/nia/` del nginx o el servicio de systemd. Renombrarlos obligaría a tocar
 * nginx, systemd y el ASP a la vez para que el usuario no notara absolutamente
 * nada. El nombre comercial y el identificador técnico son cosas distintas y
 * conviene que puedan cambiar por separado.
 */
export const NOMBRE = "Infonif.IA";
