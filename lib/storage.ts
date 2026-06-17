import { SavedLoad } from "@/types/balance";
import { supabase } from "./supabase-browser";

function throwIfSupabaseError(error: { message?: string } | null) {
  if (error) {
    throw new Error(error.message || "No se pudo completar la operacion.");
  }
}

export async function guardarCarga(carga: SavedLoad) {
  const { error } = await supabase.rpc("save_balance_load", {
    carga: carga as any,
  });

  throwIfSupabaseError(error);
}

export async function obtenerCargas(): Promise<SavedLoad[]> {
  const { data, error } = await supabase.rpc("get_balance_loads");
  throwIfSupabaseError(error);

  return (data || []) as SavedLoad[];
}

export async function eliminarCarga(id: string) {
  const { error } = await supabase.rpc("delete_balance_load", {
    load_id: id,
  });

  throwIfSupabaseError(error);
}

export async function limpiarCargas() {
  const { error } = await supabase.rpc("clear_balance_loads");
  throwIfSupabaseError(error);
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
