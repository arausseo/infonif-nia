---
category: Marca
---

# Lanzador

El botón flotante que abre Nia. Píldora violeta anclada abajo a la derecha, con
el icono animado, el nombre y la insignia BETA.

Es lo único de Nia que se ve antes de que el usuario haga nada, así que carga con
toda la presentación del producto: la marca, que hay IA detrás, y que está en
pruebas.

```jsx
<Lanzador abierto={false} estado="sugerencia" onClick={() => setAbierto(true)} />
```

## Props

| Prop | Tipo | |
|---|---|---|
| `abierto` | `boolean` | Si el cajón está abierto. Cambia la etiqueta accesible y rota el icono |
| `estado` | `EstadoIcono` | Se pasa tal cual a `IconoNia` — ver ahí qué significa cada uno |
| `onClick` | `() => void` | Alterna el cajón |

## Cuidado al componerlo

Lleva `position: fixed` y un `z-index` altísimo (2147483000), porque tiene que
ganarle a cualquier cosa del portal. **En una maqueta esto significa que se sale
de su contenedor**: para enseñarlo dentro de una tarjeta o una pantalla, envuélvelo
en algo con `position: relative` y neutraliza el anclaje, o se irá a la esquina
de la ventana.

`abierto` no lo oculta. El botón sigue ahí con el cajón abierto — es el mismo
control para abrir y cerrar.
