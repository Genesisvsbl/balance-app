import { json, supabaseRequest } from "../_shared/supabase-rest.js";

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
    })),
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

export async function onRequestGet({ env }) {
  try {
    const runs = await supabaseRequest(
      env,
      "/balance_runs?select=id,created_at,created_by,archivo,hojas,info&order=created_at.desc"
    );

    const runIds = (runs || []).map((run) => run.id);
    if (runIds.length === 0) return json(200, []);

    const filter = encodeURIComponent(`(${runIds.join(",")})`);
    const rows = await supabaseRequest(env, `/balance_rows?select=*&run_id=in.${filter}`);

    const rowsByRun = new Map();
    for (const row of rows || []) {
      const list = rowsByRun.get(row.run_id) || [];
      list.push(row);
      rowsByRun.set(row.run_id, list);
    }

    return json(
      200,
      (runs || []).map((run) => toSavedLoad(run, rowsByRun.get(run.id) || []))
    );
  } catch (error) {
    return json(500, { error: error.message || "Unexpected error." });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const carga = await request.json().catch(() => ({}));
    const info = {
      ...(carga.info || {}),
      createdBy: carga.createdBy || carga.info?.createdBy || null,
      datosHistorico: carga.datos || carga.info?.datosHistorico || {},
    };

    await supabaseRequest(env, "/balance_runs", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: carga.id,
        created_at: carga.fecha,
        created_by: null,
        archivo: carga.archivo,
        hojas: carga.hojas || [],
        info,
      }),
    });

    const rows = toDbRows(carga.id, carga.analisis || []);
    for (let i = 0; i < rows.length; i += 500) {
      try {
        await supabaseRequest(env, "/balance_rows", {
          method: "POST",
          headers: {
            Prefer: "return=minimal",
          },
          body: JSON.stringify(rows.slice(i, i + 500)),
        });
      } catch (error) {
        await supabaseRequest(env, `/balance_runs?id=eq.${encodeURIComponent(carga.id)}`, {
          method: "DELETE",
          headers: {
            Prefer: "return=minimal",
          },
        });
        throw error;
      }
    }

    await supabaseRequest(env, "/audit_events", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
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
      }),
    });

    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error.message || "Unexpected error." });
  }
}

export async function onRequestDelete({ env }) {
  try {
    const runs = await supabaseRequest(env, "/balance_runs?select=id");

    for (const run of runs || []) {
      await supabaseRequest(env, `/balance_runs?id=eq.${encodeURIComponent(run.id)}`, {
        method: "DELETE",
        headers: {
          Prefer: "return=minimal",
        },
      });
    }

    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error.message || "Unexpected error." });
  }
}
