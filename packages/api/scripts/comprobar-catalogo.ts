/**
 * Comprueba el catálogo de campos comprables contra el origen.
 *
 * `pnpm --filter @nia/api catalogo`
 *
 * Sirve para dos cosas: ver que la descarga en vivo funciona, y enterarse de si
 * Infonif ha cambiado un precio desde la última vez que se actualizó la copia
 * congelada del repositorio. Lo segundo es lo importante: cotizar con precios
 * viejos es facturar mal.
 */
import { bloqueEstable } from "../src/agente/prompt.js";
import {
  catalogoCampos,
  estadoCatalogo,
  prepararCatalogo,
} from "../src/datos/catalogo.js";

const congelado = new Map(catalogoCampos().map((c) => [c.name, c]));
console.log(`Copia congelada: ${congelado.size} campos\n`);

await prepararCatalogo();

// prepararCatalogo() no bloquea a propósito; aquí sí queremos el resultado.
for (let i = 0; i < 40 && estadoCatalogo().origen === "semilla"; i++) {
  await new Promise((r) => setTimeout(r, 250));
}

const estado = estadoCatalogo();
if (estado.origen === "semilla") {
  console.log("No se pudo bajar el catálogo. Se sigue con la copia congelada.");
  process.exit(1);
}

console.log(`En vivo: ${estado.campos} campos\n`);

let diferencias = 0;
for (const campo of catalogoCampos()) {
  const previo = congelado.get(campo.name);
  if (!previo) {
    console.log(`  NUEVO    ${campo.name} ${campo.label} — ${campo.price} €`);
    diferencias++;
  } else if (previo.price !== campo.price) {
    console.log(
      `  PRECIO   ${campo.name} ${campo.label} — ${previo.price} € → ${campo.price} €`,
    );
    diferencias++;
  }
  congelado.delete(campo.name);
}
for (const campo of congelado.values()) {
  console.log(`  RETIRADO ${campo.name} ${campo.label}`);
  diferencias++;
}

if (diferencias === 0) {
  console.log("Sin cambios respecto a la copia del repositorio.\n");
} else {
  console.log(
    `\n${diferencias} diferencia(s). Actualiza datos/fixtures/infonif/campos-comprables.json.\n`,
  );
}

// Y que el prompt lo lleve dentro, que es de lo que se trataba.
const seccion = bloqueEstable().split("## Los campos que se pueden comprar")[1];
console.log("Lo que ve el modelo:");
console.log(
  (seccion ?? "").split("Al pedirlos").slice(0, 1).join("").trimEnd().slice(0, 1400),
);

process.exit(diferencias === 0 ? 0 : 2);
