/**
 * Un solo `vitest run` en la raíz recorre todos los paquetes.
 * Cada paquete conserva su propio script `test` para trabajar aislado.
 */
export default ["packages/*"];
