import { createSupabaseClient } from "./supabase-client.mjs";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stockPiValue(info, row, key, dbKey) {
  return numberOrNull(row?.[dbKey] ?? info?.stockPiPorCodigo?.[row.codigo]?.[key]);
}

function toSavedLoad(run, rows) {
  const info = run.info || {};

  return {
    id: run.id,
    fecha: run.created_at,
    archivo: run.archivo,
    hojas: run.hojas || [],
    datos: info.datosHistorico || {},
    info,
    createdBy: run.created_by
      ? {
          id: run.created_by,
          username: run.created_by_username || "",
          fullName: run.created_by_name || "",
        }
      : undefined,
    analisis: rows.map((row) => ({
      codigo: row.codigo,
      material: row.material || "",
      um: row.um || "",
      seccion: row.seccion || "",
      seccionesArray: row.secciones_array || [],
      estado: row.estado,
      totalNecesidad: Number(row.total_necesidad || 0),
      totalRecepcion: Number(row.total_recepcion || 0),
      totalExistencia: Number(row.total_existencia || 0),
      diferenciaTotal: Number(row.diferencia_total || 0),
      inventarioLibre: Number(row.inventario_libre || 0),
      inventarioBloqueado: Number(row.inventario_bloqueado || 0),
      stockTotal: Number(row.stock_total || 0),
      valorInventarioLibre: Number(row.valor_inventario_libre || 0),
      valorInventarioBloqueado: Number(row.valor_inventario_bloqueado || 0),
      valorStockTotal: Number(row.valor_stock_total || 0),
      necesidadesPorSemana: row.necesidades_por_semana || {},
      recepcionesPorSemana: row.recepciones_por_semana || {},
      fechasRecepcionPorSemana: row.fechas_recepcion_por_semana || {},
      transitosPorSemana: row.transitos_por_semana || {},
      coberturaPorSemana: row.cobertura_por_semana || {},
      almacenes: row.almacenes || {},
      diferenciasPorSemana: row.diferencias_por_semana || {},
      stockMin: stockPiValue(info, row, "stockMin", "stock_min"),
      stockMed: stockPiValue(info, row, "stockMed", "stock_med"),
      stockMax: stockPiValue(info, row, "stockMax", "stock_max"),
    })),
  };
}

export async function handler(event) {
  try {
    const id = event.queryStringParameters?.id;
    if (!id) {
      return json(400, { error: "Missing balance id." });
    }

    const supabase = createSupabaseClient();

    if (event.httpMethod === "GET") {
      const { data: run, error: runError } = await supabase
        .from("balance_runs")
        .select("id, created_at, created_by, archivo, hojas, info")
        .eq("id", id)
        .single();

      if (runError) return json(500, { error: runError.message });

      const { data: rows, error: rowsError } = await supabase
        .from("balance_rows")
        .select("*")
        .eq("run_id", id);

      if (rowsError) return json(500, { error: rowsError.message });

      return json(200, toSavedLoad(run, rows || []));
    }

    if (event.httpMethod === "DELETE") {
      const { error } = await supabase
        .from("balance_runs")
        .delete()
        .eq("id", id);

      if (error) {
        return json(500, { error: error.message });
      }

      await supabase.from("audit_events").insert({
        action: "BALANCE_DELETED",
        entity: "balance_run",
        entity_id: id,
        details: {},
      });

      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(500, { error: error.message || "Unexpected error." });
  }
}