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

function buildStockPiPorCodigo(rows) {
  return Object.fromEntries(
    (rows || [])
      .filter((row) => row?.codigo)
      .map((row) => [
        row.codigo,
        {
          stockMin: numberOrNull(row.stockMin),
          stockMed: numberOrNull(row.stockMed),
          stockMax: numberOrNull(row.stockMax),
        },
      ])
  );
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

function toRunSummary(run) {
  const info = run.info || {};

  return {
    id: run.id,
    fecha: run.created_at,
    archivo: run.archivo,
    hojas: run.hojas || [],
    datos: {},
    info: {
      hojaReceta: info.hojaReceta || "",
      hojaExistencias: info.hojaExistencias || "",
      hojaPlanRecepcion: info.hojaPlanRecepcion || "",
      columnasSemana: info.columnasSemana || [],
      almacenesDetectados: info.almacenesDetectados || [],
      seccionesDetectadas: info.seccionesDetectadas || [],
      totalComponentes: info.totalComponentes || 0,
      totalFaltantes: info.totalFaltantes || 0,
      totalSobrantes: info.totalSobrantes || 0,
      totalPlanRecepcion: info.totalPlanRecepcion || 0,
      valorInventarioLibre: info.valorInventarioLibre || 0,
      valorInventarioBloqueado: info.valorInventarioBloqueado || 0,
      valorInventarioTotal: info.valorInventarioTotal || 0,
      totalSkuLibre: info.totalSkuLibre || 0,
      totalSkuBloqueado: info.totalSkuBloqueado || 0,
      totalSkuExistencias: info.totalSkuExistencias || 0,
      createdBy: info.createdBy || null,
    },
    createdBy: info.createdBy || undefined,
    analisis: [],
  };
}
function toDbRows(runId, rows) {
  return rows.map((row) => ({
    run_id: runId,
    codigo: row.codigo,
    material: row.material,
    um: row.um,
    seccion: row.seccion,
    secciones_array: row.seccionesArray || [],
    estado: row.estado,
    total_necesidad: row.totalNecesidad || 0,
    total_recepcion: row.totalRecepcion || 0,
    total_existencia: row.totalExistencia || 0,
    diferencia_total: row.diferenciaTotal || 0,
    inventario_libre: row.inventarioLibre || 0,
    inventario_bloqueado: row.inventarioBloqueado || 0,
    stock_total: row.stockTotal || 0,
    valor_inventario_libre: row.valorInventarioLibre || 0,
    valor_inventario_bloqueado: row.valorInventarioBloqueado || 0,
    valor_stock_total: row.valorStockTotal || 0,
    necesidades_por_semana: row.necesidadesPorSemana || {},
    recepciones_por_semana: row.recepcionesPorSemana || {},
    fechas_recepcion_por_semana: row.fechasRecepcionPorSemana || {},
    transitos_por_semana: row.transitosPorSemana || {},
    cobertura_por_semana: row.coberturaPorSemana || {},
    almacenes: row.almacenes || {},
    diferencias_por_semana: row.diferenciasPorSemana || {},
  }));
}

export async function handler(event) {
  try {
    const supabase = createSupabaseClient();

    if (event.httpMethod === "GET") {
      const { data: runs, error: runsError } = await supabase
        .from("balance_runs")
        .select("id, created_at, created_by, archivo, hojas, info")
        .order("created_at", { ascending: false });

      if (runsError) return json(500, { error: runsError.message });

      return json(
        200,
        (runs || []).map((run) => toRunSummary(run))
      );
    }

    if (event.httpMethod === "POST") {
      const carga = JSON.parse(event.body || "{}");
      const info = {
        ...(carga.info || {}),
        createdBy: carga.createdBy || carga.info?.createdBy || null,
        datosHistorico: carga.datos || carga.info?.datosHistorico || {},
      };

      const { error: runError } = await supabase.from("balance_runs").insert({
        id: carga.id,
        created_at: carga.fecha,
        created_by: null,
        archivo: carga.archivo,
        hojas: carga.hojas || [],
        info,
      });

      if (runError) return json(500, { error: runError.message });

      const rows = toDbRows(carga.id, carga.analisis || []);
      for (let i = 0; i < rows.length; i += 500) {
        const { error: rowsError } = await supabase
          .from("balance_rows")
          .insert(rows.slice(i, i + 500));

        if (rowsError) {
          await supabase.from("balance_runs").delete().eq("id", carga.id);
          return json(500, { error: rowsError.message });
        }
      }

      await supabase.from("audit_events").insert({
        user_id: null,
        username: carga.createdBy?.username || null,
        action: "BALANCE_CREATED",
        entity: "balance_run",
        entity_id: carga.id,
        details: {
          archivo: carga.archivo,
          hojas: carga.hojas || [],
          componentes: carga.info?.totalComponentes || 0,
          faltantes: carga.info?.totalFaltantes || 0,
          sobrantes: carga.info?.totalSobrantes || 0,
        },
      });

      return json(200, { ok: true });
    }

    if (event.httpMethod === "DELETE") {
      const { data: runs, error: readError } = await supabase
        .from("balance_runs")
        .select("id");

      if (readError) return json(500, { error: readError.message });

      for (const run of runs || []) {
        const { error } = await supabase
          .from("balance_runs")
          .delete()
          .eq("id", run.id);

        if (error) return json(500, { error: error.message });
      }

      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(500, { error: error.message || "Unexpected error." });
  }
}
