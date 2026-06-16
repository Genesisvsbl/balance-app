import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { BalanceRow, SavedLoad } from "@/types/balance";

type DbBalanceRun = {
  id: string;
  created_at: string;
  archivo: string;
  hojas: string[];
  info: SavedLoad["info"];
};

type DbBalanceRow = {
  run_id: string;
  codigo: string;
  material: string;
  um: string;
  seccion: string;
  secciones_array: string[];
  estado: BalanceRow["estado"];
  total_necesidad: number;
  total_recepcion: number;
  total_existencia: number;
  diferencia_total: number;
  inventario_libre: number;
  inventario_bloqueado: number;
  stock_total: number;
  valor_inventario_libre: number;
  valor_inventario_bloqueado: number;
  valor_stock_total: number;
  necesidades_por_semana: BalanceRow["necesidadesPorSemana"];
  recepciones_por_semana: BalanceRow["recepcionesPorSemana"];
  fechas_recepcion_por_semana: BalanceRow["fechasRecepcionPorSemana"];
  transitos_por_semana: BalanceRow["transitosPorSemana"];
  cobertura_por_semana: BalanceRow["coberturaPorSemana"];
  almacenes: BalanceRow["almacenes"];
  diferencias_por_semana: BalanceRow["diferenciasPorSemana"];
};

function toSavedLoad(run: DbBalanceRun, rows: DbBalanceRow[]): SavedLoad {
  return {
    id: run.id,
    fecha: run.created_at,
    archivo: run.archivo,
    hojas: run.hojas || [],
    info: run.info,
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

function toDbRows(runId: string, rows: BalanceRow[]) {
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

export async function GET() {
  const supabaseServer = createSupabaseServerClient();

  const { data: runs, error: runsError } = await supabaseServer
    .from("balance_runs")
    .select("id, created_at, archivo, hojas, info")
    .order("created_at", { ascending: false });

  if (runsError) {
    return NextResponse.json({ error: runsError.message }, { status: 500 });
  }

  const runIds = (runs || []).map((run) => run.id);

  if (runIds.length === 0) {
    return NextResponse.json([]);
  }

  const { data: rows, error: rowsError } = await supabaseServer
    .from("balance_rows")
    .select("*")
    .in("run_id", runIds);

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  const rowsByRun = new Map<string, DbBalanceRow[]>();

  (rows || []).forEach((row) => {
    const list = rowsByRun.get(row.run_id) || [];
    list.push(row);
    rowsByRun.set(row.run_id, list);
  });

  return NextResponse.json(
    (runs || []).map((run) => toSavedLoad(run, rowsByRun.get(run.id) || []))
  );
}

export async function POST(request: Request) {
  const supabaseServer = createSupabaseServerClient();
  const carga = (await request.json()) as SavedLoad;

  const { error: runError } = await supabaseServer.from("balance_runs").insert({
    id: carga.id,
    created_at: carga.fecha,
    archivo: carga.archivo,
    hojas: carga.hojas || [],
    info: carga.info,
  });

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }

  const rows = toDbRows(carga.id, carga.analisis || []);

  if (rows.length > 0) {
    const { error: rowsError } = await supabaseServer
      .from("balance_rows")
      .insert(rows);

    if (rowsError) {
      await supabaseServer.from("balance_runs").delete().eq("id", carga.id);
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabaseServer = createSupabaseServerClient();

  const { error } = await supabaseServer
    .from("balance_runs")
    .delete()
    .not("id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
