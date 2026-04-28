import { SavedLoad } from "@/types/balance";

const STORAGE_KEY = "balance_cargas_guardadas";

export function guardarCarga(carga: SavedLoad) {
  const cargas = obtenerCargas();
  const nuevasCargas = [carga, ...cargas];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevasCargas));
}

export function obtenerCargas(): SavedLoad[] {
  if (typeof window === "undefined") return [];

  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function eliminarCarga(id: string) {
  const cargas = obtenerCargas();
  const nuevasCargas = cargas.filter((carga) => carga.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevasCargas));
}

export function limpiarCargas() {
  localStorage.removeItem(STORAGE_KEY);
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