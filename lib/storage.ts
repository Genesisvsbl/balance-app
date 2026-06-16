import { SavedLoad } from "@/types/balance";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo completar la operacion.");
  }

  return response.json();
}

export async function guardarCarga(carga: SavedLoad) {
  await parseResponse<{ ok: boolean }>(
    await fetch("/api/balance-runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(carga),
    })
  );
}

export async function obtenerCargas(): Promise<SavedLoad[]> {
  return parseResponse<SavedLoad[]>(await fetch("/api/balance-runs"));
}

export async function eliminarCarga(id: string) {
  await parseResponse<{ ok: boolean }>(
    await fetch(`/api/balance-runs/${id}`, {
      method: "DELETE",
    })
  );
}

export async function limpiarCargas() {
  await parseResponse<{ ok: boolean }>(
    await fetch("/api/balance-runs", {
      method: "DELETE",
    })
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
