import { SavedLoad } from "@/types/balance";

const API_BASES = ["/.netlify/functions", "/api"];

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error("La ruta de guardado devolvio HTML. Revisa el deploy de funciones.");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo completar la operacion.");
  }

  return response.json();
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  options: { query?: string } = {}
): Promise<T> {
  let lastError = "No se pudo conectar con el guardado.";

  for (const base of API_BASES) {
    const separator = base === "/api" && path.startsWith("/balance-run") ? "" : "";
    const url = `${base}${separator}${path}${options.query || ""}`;

    try {
      return await parseResponse<T>(await fetch(url, init));
    } catch (error: any) {
      lastError = error.message || lastError;
    }
  }

  throw new Error(lastError);
}

export async function guardarCarga(carga: SavedLoad) {
  await requestJson<{ ok: boolean }>(
    "/balance-runs",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(carga),
    }
  );
}

export async function obtenerCargas(): Promise<SavedLoad[]> {
  return requestJson<SavedLoad[]>("/balance-runs");
}

export async function obtenerCarga(id: string): Promise<SavedLoad> {
  return requestJson<SavedLoad>(
    "/balance-run",
    undefined,
    { query: `?id=${encodeURIComponent(id)}` }
  );
}

export async function eliminarCarga(id: string) {
  await requestJson<{ ok: boolean }>(
    "/balance-run",
    {
      method: "DELETE",
    },
    { query: `?id=${encodeURIComponent(id)}` }
  );
}

export async function limpiarCargas() {
  await requestJson<{ ok: boolean }>(
    "/balance-runs",
    {
      method: "DELETE",
    }
  );
}

export function crearNombreBalance() {
  const fecha = new Date();

  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  const hh = String(fecha.getHours()).padStart(2, "0");
  const min = String(fecha.getMinutes()).padStart(2, "0");

  return `${yyyy}.${mm}.${dd} ${hh}-${min}_Balance de materiales`;
}
