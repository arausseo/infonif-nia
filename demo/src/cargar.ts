/**
 * Único punto de entrada de la demo. En el portal real esto no existe: el ASP
 * pone la etiqueta `<script src=".../widget.js" async>` y el bundle se monta
 * solo leyendo `window.__INFONIF_AGENT__`.
 *
 * Aquí, además, se imita la parte servidor del puente de sesión: el ASP llama a
 * `POST /internal/mint` con el secreto compartido y le inyecta el token a la
 * página. Como esto es un navegador y no un IIS, el token se pide desde el
 * propio Vite. **En producción esa llamada NUNCA sale del servidor**, porque
 * lleva el secreto compartido.
 */
import "@nia/widget";
import type { ConfiguracionEmbebida } from "@nia/widget";

declare global {
  interface Window {
    __INFONIF_AGENT__?: ConfiguracionEmbebida;
  }
}

const API = "http://localhost:3000";

/** Se elige con ?usuario=133627 en la URL, para poder enseñar los dos perfiles. */
const usuarioId = new URLSearchParams(location.search).get("usuario");

async function acunarToken(): Promise<void> {
  if (!usuarioId) return;

  try {
    const respuesta = await fetch("/api-demo/mint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuarioId: Number(usuarioId) }),
    });
    if (!respuesta.ok) throw new Error(`mint devolvió ${respuesta.status}`);
    const { token } = (await respuesta.json()) as { token: string };

    window.__INFONIF_AGENT__ = { ...window.__INFONIF_AGENT__, token, apiBase: API };
    document.querySelector("#estado-sesion")!.textContent =
      `Sesión iniciada como usuario ${usuarioId}`;
  } catch (error) {
    console.warn("No se pudo acuñar el token:", error);
    document.querySelector("#estado-sesion")!.textContent =
      "No se pudo iniciar sesión: sigue como anónimo";
  }
}

// Antes de que el widget mande nada: si no, el primer turno iría sin token.
void acunarToken();
