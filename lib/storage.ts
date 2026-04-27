import { SavedLoad } from "@/types/balance";

const KEY = "BALANCE_ERP_CARGAS";

export function guardarCarga(carga: SavedLoad) {
  const actuales = obtenerCargas();
  const nuevas = [carga, ...actuales];
  localStorage.setItem(KEY, JSON.stringify(nuevas));
}

export function obtenerCargas(): SavedLoad[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function limpiarCargas() {
  localStorage.removeItem(KEY);
}