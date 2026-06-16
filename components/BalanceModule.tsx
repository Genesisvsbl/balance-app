"use client";

import * as XLSX from "xlsx";
import { generarBalance } from "@/lib/balance";
import { guardarCarga, crearNombreBalance } from "@/lib/storage";
import { BalanceInfo, BalanceRow, ExcelData, SavedLoad } from "@/types/balance";
import { formatoNumero } from "@/lib/format";
import { Fragment, useEffect, useMemo, useState } from "react";

type Props = {
  datos: ExcelData;
  archivoNombre: string;
  analisis: BalanceRow[];
  setAnalisis: (data: BalanceRow[]) => void;
  infoAnalisis: BalanceInfo | null;
  setInfoAnalisis: (data: BalanceInfo | null) => void;
  currentUser: {
    id: string;
    username: string;
    fullName: string;
  };
};

type ColumnVisibility = {
  codigo: boolean;
  material: boolean;
  um: boolean;
  seccion: boolean;
  semanas: boolean;
  totalNecesidad: boolean;
  almacenes: Record<string, boolean>;
  totalExistencia: boolean;
  diferenciaTotal: boolean;
  diferenciasSemana: boolean;
  estado: boolean;
};

type SortConfig = {
  key: string;
  direction: "asc" | "desc";
} | null;

function crearVisibilidadInicial(almacenes: string[]): ColumnVisibility {
  const almacenesVisibles: Record<string, boolean> = {};

  almacenes.forEach((alm) => {
    almacenesVisibles[alm] = alm === "AG01" || alm === "AG04";
  });

  return {
    codigo: true,
    material: true,
    um: true,
    seccion: true,
    semanas: true,
    totalNecesidad: true,
    almacenes: almacenesVisibles,
    totalExistencia: true,
    diferenciaTotal: true,
    diferenciasSemana: true,
    estado: true,
  };
}

export default function BalanceModule({
  datos,
  archivoNombre,
  analisis,
  setAnalisis,
  infoAnalisis,
  setInfoAnalisis,
  currentUser,
}: Props) {
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroSeccion, setFiltroSeccion] = useState("TODAS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [mostrarColumnas, setMostrarColumnas] = useState(false);
  const [semanasTransito, setSemanasTransito] = useState<string[]>([]);
  const [orden, setOrden] = useState<SortConfig>(null);
  const [visibilidad, setVisibilidad] = useState<ColumnVisibility>(
    crearVisibilidadInicial([])
  );

  const columnasSemana = infoAnalisis?.columnasSemana || [];
  const almacenesDetectados = infoAnalisis?.almacenesDetectados || [];
  const seccionesDetectadas = infoAnalisis?.seccionesDetectadas || [];

  useEffect(() => {
    if (almacenesDetectados.length === 0) return;

    setVisibilidad((actual) => {
      const nuevosAlmacenes: Record<string, boolean> = {};

      almacenesDetectados.forEach((alm) => {
        nuevosAlmacenes[alm] =
          actual.almacenes[alm] ?? (alm === "AG01" || alm === "AG04");
      });

      return {
        ...actual,
        almacenes: nuevosAlmacenes,
      };
    });
  }, [almacenesDetectados.join("|")]);

  function toggleCampo(campo: keyof Omit<ColumnVisibility, "almacenes">) {
    setVisibilidad((actual) => ({
      ...actual,
      [campo]: !actual[campo],
    }));
  }

  function toggleAlmacen(alm: string) {
    setVisibilidad((actual) => ({
      ...actual,
      almacenes: {
        ...actual.almacenes,
        [alm]: !actual.almacenes[alm],
      },
    }));
  }

  function mostrarTodosLosAlmacenes() {
    const todos: Record<string, boolean> = {};
    almacenesDetectados.forEach((alm) => {
      todos[alm] = true;
    });

    setVisibilidad((actual) => ({
      ...actual,
      almacenes: todos,
    }));
  }

  function ocultarTodosLosAlmacenes() {
    const todos: Record<string, boolean> = {};
    almacenesDetectados.forEach((alm) => {
      todos[alm] = false;
    });

    setVisibilidad((actual) => ({
      ...actual,
      almacenes: todos,
    }));
  }

  function vistaEjecutiva() {
    const almacenesBase: Record<string, boolean> = {};
    almacenesDetectados.forEach((alm) => {
      almacenesBase[alm] = alm === "AG01" || alm === "AG04";
    });

    setVisibilidad({
      codigo: true,
      material: true,
      um: true,
      seccion: true,
      semanas: true,
      totalNecesidad: true,
      almacenes: almacenesBase,
      totalExistencia: true,
      diferenciaTotal: true,
      diferenciasSemana: true,
      estado: true,
    });
  }

  function toggleSemanaTransito(semana: string) {
    setSemanasTransito((actual) =>
      actual.includes(semana)
        ? actual.filter((item) => item !== semana)
        : [...actual, semana]
    );
  }

  function ordenarPor(key: string) {
    setOrden((actual) => {
      if (actual?.key !== key) return { key, direction: "asc" };
      return {
        key,
        direction: actual.direction === "asc" ? "desc" : "asc",
      };
    });
  }

  function obtenerValorOrden(row: BalanceRow, key: string) {
    if (key.startsWith("sem:")) {
      return row.necesidadesPorSemana[key.replace("sem:", "")] || 0;
    }
    if (key.startsWith("alm:")) {
      return row.almacenes[key.replace("alm:", "")] || 0;
    }
    if (key.startsWith("dif:")) {
      return row.diferenciasPorSemana[key.replace("dif:", "")] || 0;
    }
    if (key.startsWith("transitoFecha:")) {
      const semana = key.replace("transitoFecha:", "");
      return row.transitosPorSemana?.[semana]?.[0]?.fechaOperativa || "";
    }
    if (key.startsWith("transitoCantidad:")) {
      const semana = key.replace("transitoCantidad:", "");
      return row.recepcionesPorSemana?.[semana] || 0;
    }

    switch (key) {
      case "codigo":
        return row.codigo;
      case "material":
        return row.material;
      case "um":
        return row.um;
      case "seccion":
        return row.seccion;
      case "totalNecesidad":
        return row.totalNecesidad;
      case "totalExistencia":
        return row.totalExistencia;
      case "diferenciaTotal":
        return row.diferenciaTotal;
      case "estado":
        return row.estado;
      default:
        return "";
    }
  }

  function ejecutarBalance() {
    try {
      const resultado = generarBalance(datos);

      setAnalisis(resultado.analisis);
      setInfoAnalisis(resultado.info);
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function guardarBalanceActual() {
    if (!infoAnalisis || analisis.length === 0) {
      alert("Primero genera un balance.");
      return;
    }

    const nombreBalance = crearNombreBalance();

    const confirmar = confirm(
      `¿Deseas guardar este balance como:\n\n${nombreBalance}?`
    );

    if (!confirmar) return;

    const carga: SavedLoad = {
      id: crypto.randomUUID(),
      fecha: new Date().toISOString(),
      createdBy: currentUser,
      archivo: nombreBalance,
      hojas: Object.keys(datos),
      analisis,
      info: infoAnalisis,
    };

    try {
      await guardarCarga(carga);
      alert("Balance guardado correctamente.");
    } catch (error: any) {
      alert(error.message || "No se pudo guardar el balance.");
    }
  }

  const filtrado = analisis.filter((row) => {
    const texto = filtroTexto.toLowerCase().trim();

    const coincideTexto =
      texto === "" ||
      String(row.codigo).toLowerCase().includes(texto) ||
      String(row.material).toLowerCase().includes(texto) ||
      String(row.seccion).toLowerCase().includes(texto) ||
      String(row.estado).toLowerCase().includes(texto);

    const coincideSeccion =
      filtroSeccion === "TODAS" ||
      (row.seccionesArray || []).includes(filtroSeccion);

    const coincideEstado =
      filtroEstado === "TODOS" || row.estado === filtroEstado;

    return coincideTexto && coincideSeccion && coincideEstado;
  });

  const filtradoOrdenado = useMemo(() => {
    if (!orden) return filtrado;

    return [...filtrado].sort((a, b) => {
      const valorA = obtenerValorOrden(a, orden.key);
      const valorB = obtenerValorOrden(b, orden.key);

      let comparacion = 0;
      if (typeof valorA === "number" && typeof valorB === "number") {
        comparacion = valorA - valorB;
      } else {
        comparacion = String(valorA ?? "").localeCompare(
          String(valorB ?? ""),
          "es",
          { numeric: true, sensitivity: "base" }
        );
      }

      return orden.direction === "asc" ? comparacion : -comparacion;
    });
  }, [filtrado, orden]);

  function exportar() {
    const dataExport = filtradoOrdenado.map((row) => {
      const base: any = {};

      if (visibilidad.codigo) base["N° componente"] = row.codigo;
      if (visibilidad.material) base["Texto breve-objeto"] = row.material;
      if (visibilidad.um) base.UM = row.um;
      if (visibilidad.seccion) base.Seccion = row.seccion;

      if (visibilidad.semanas) {
        columnasSemana.forEach((sem) => {
          base[sem] = row.necesidadesPorSemana[sem] || 0;
          if (semanasTransito.includes(sem)) {
            const transitos = row.transitosPorSemana?.[sem] || [];
            const fechas = Array.from(
              new Set(
                transitos
                  .map((item) => item.fechaOperativa)
                  .filter(Boolean)
              )
            );

            base[`Fecha operativa ${sem}`] = fechas.join(", ");
            base[`Cantidad transito ${sem}`] =
              row.recepcionesPorSemana?.[sem] || 0;
          }
        });
      }

      if (visibilidad.totalNecesidad) {
        base["Suma de Total necesidad"] = row.totalNecesidad;
      }

      almacenesDetectados.forEach((alm) => {
        if (visibilidad.almacenes[alm]) {
          base[alm] = row.almacenes[alm] || 0;
        }
      });

      if (visibilidad.totalExistencia) {
        base["AG01 + AG04"] = row.totalExistencia;
      }

      if (visibilidad.diferenciaTotal) {
        base["Diferencia total"] = row.diferenciaTotal;
      }

      if (visibilidad.diferenciasSemana) {
        columnasSemana.forEach((sem) => {
          base[`Dif. ${sem}`] = row.diferenciasPorSemana[sem] || 0;
        });
      }

      if (visibilidad.estado) base.Estado = row.estado;

      return base;
    });

    const ws = XLSX.utils.json_to_sheet(dataExport);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Analisis");
    XLSX.writeFile(wb, "analisis_balance_materiales.xlsx");
  }

  const almacenesVisibles = almacenesDetectados.filter(
    (alm) => visibilidad.almacenes[alm]
  );

  const resumenValoresInventario = analisis.reduce(
    (acc, row) => {
      acc.libre += row.valorInventarioLibre || 0;
      acc.bloqueado += row.valorInventarioBloqueado || 0;
      acc.total += row.valorStockTotal || 0;
      return acc;
    },
    { libre: 0, bloqueado: 0, total: 0 }
  );
  const valoresInventario = {
    libre:
      infoAnalisis?.valorInventarioLibre ?? resumenValoresInventario.libre,
    bloqueado:
      infoAnalisis?.valorInventarioBloqueado ??
      resumenValoresInventario.bloqueado,
    total:
      infoAnalisis?.valorInventarioTotal ?? resumenValoresInventario.total,
  };

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">
              Balance de materiales
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Base de cálculo: AG01 + AG04 contra necesidades por semana.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={ejecutarBalance}
              className="rounded-xl bg-[#e30613] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#b8000f]"
            >
              Generar balance
            </button>

            {analisis.length > 0 && (
              <>
                <button
                  onClick={guardarBalanceActual}
                  className="rounded-xl border border-[#d4a017] bg-white px-5 py-3 text-sm font-black text-[#9a6a00] shadow-sm transition hover:bg-[#fff8df]"
                >
                  Guardar balance
                </button>

                <button
                  onClick={exportar}
                  className="rounded-xl bg-[#d4a017] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#b88900]"
                >
                  Exportar Excel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {infoAnalisis && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">
                Valor inventario libre
              </p>
              <p className="mt-1 text-3xl font-black text-emerald-700">
                {formatoNumero(valoresInventario.libre)}
              </p>
            </div>

            <div className="rounded-2xl border border-[#d4a017]/25 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">
                Valor inventario bloqueado
              </p>
              <p className="mt-1 text-3xl font-black text-[#9a6a00]">
                {formatoNumero(valoresInventario.bloqueado)}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">
                Valor inventario total
              </p>
              <p className="mt-1 text-3xl font-black text-slate-950">
                {formatoNumero(valoresInventario.total)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">Componentes</p>
              <p className="mt-1 text-3xl font-black text-slate-950">
                {infoAnalisis.totalComponentes}
              </p>
            </div>

            <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">Faltantes</p>
              <p className="mt-1 text-3xl font-black text-[#e30613]">
                {infoAnalisis.totalFaltantes}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">Sobrantes</p>
              <p className="mt-1 text-3xl font-black text-emerald-700">
                {infoAnalisis.totalSobrantes}
              </p>
            </div>

            <div className="rounded-2xl border border-[#d4a017]/25 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">Base balance</p>
              <p className="mt-1 text-2xl font-black text-[#9a6a00]">
                AG01 + AG04
              </p>
            </div>
          </div>
        </>
      )}

      {analisis.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h4 className="text-lg font-black text-slate-950">
                Análisis de componentes
              </h4>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Mostrando {filtrado.length} de {analisis.length} componentes.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-3 md:w-auto md:grid-cols-5">
              <input
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder="Buscar componente, descripción, sección..."
                className="h-11 min-w-[320px] rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-[#e30613]/10"
              />

              <select
                value={filtroSeccion}
                onChange={(e) => setFiltroSeccion(e.target.value)}
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#e30613]"
              >
                <option value="TODAS">Todas las secciones</option>
                {seccionesDetectadas.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#e30613]"
              >
                <option value="TODOS">Todos los estados</option>
                <option value="FALTANTE">Faltante</option>
                <option value="SOBRANTE">Sobrante</option>
                <option value="JUSTO">Justo</option>
              </select>

              <button
                onClick={() => setMostrarColumnas(!mostrarColumnas)}
                className="h-11 rounded-xl border border-[#d4a017]/50 bg-[#fff8df] px-4 text-sm font-black text-[#9a6a00] transition hover:bg-[#fff1bf]"
              >
                {mostrarColumnas ? "Ocultar panel" : "Columnas"}
              </button>

              <button
                onClick={() => {
                  setFiltroTexto("");
                  setFiltroSeccion("TODAS");
                  setFiltroEstado("TODOS");
                }}
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          {mostrarColumnas && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-[#fbfbfa] p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h5 className="text-sm font-black text-slate-950">
                    Visibilidad de columnas
                  </h5>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Oculta almacenes o columnas para una vista más limpia.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={vistaEjecutiva}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                  >
                    Vista ejecutiva
                  </button>

                  <button
                    onClick={mostrarTodosLosAlmacenes}
                    className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"
                  >
                    Mostrar almacenes
                  </button>

                  <button
                    onClick={ocultarTodosLosAlmacenes}
                    className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-black text-[#e30613] hover:bg-red-50"
                  >
                    Ocultar almacenes
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                <Toggle
                  label="Componente"
                  checked={visibilidad.codigo}
                  onClick={() => toggleCampo("codigo")}
                />
                <Toggle
                  label="Material"
                  checked={visibilidad.material}
                  onClick={() => toggleCampo("material")}
                />
                <Toggle
                  label="UM"
                  checked={visibilidad.um}
                  onClick={() => toggleCampo("um")}
                />
                <Toggle
                  label="Sección"
                  checked={visibilidad.seccion}
                  onClick={() => toggleCampo("seccion")}
                />
                <Toggle
                  label="Semanas"
                  checked={visibilidad.semanas}
                  onClick={() => toggleCampo("semanas")}
                />
                <Toggle
                  label="Total necesidad"
                  checked={visibilidad.totalNecesidad}
                  onClick={() => toggleCampo("totalNecesidad")}
                />
                <Toggle
                  label="AG01 + AG04"
                  checked={visibilidad.totalExistencia}
                  onClick={() => toggleCampo("totalExistencia")}
                />
                <Toggle
                  label="Diferencia total"
                  checked={visibilidad.diferenciaTotal}
                  onClick={() => toggleCampo("diferenciaTotal")}
                />
                <Toggle
                  label="Dif. semanas"
                  checked={visibilidad.diferenciasSemana}
                  onClick={() => toggleCampo("diferenciasSemana")}
                />
                <Toggle
                  label="Estado"
                  checked={visibilidad.estado}
                  onClick={() => toggleCampo("estado")}
                />
              </div>

              <div className="mt-5">
                <h6 className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">
                  Almacenes
                </h6>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-6 xl:grid-cols-10">
                  {almacenesDetectados.map((alm) => (
                    <Toggle
                      key={alm}
                      label={alm}
                      checked={!!visibilidad.almacenes[alm]}
                      onClick={() => toggleAlmacen(alm)}
                    />
                  ))}
                </div>
              </div>

              <p className="mt-4 text-xs font-semibold text-slate-500">
                Almacenes visibles:{" "}
                <b>{almacenesVisibles.length > 0 ? almacenesVisibles.join(", ") : "ninguno"}</b>
              </p>
            </div>
          )}

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full min-w-[1200px] border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    {visibilidad.codigo && (
                      <SortHeader
                        label="Material"
                        sortKey="codigo"
                        orden={orden}
                        onSort={ordenarPor}
                      />
                    )}

                    {visibilidad.material && (
                      <SortHeader
                        label="Texto breve del material"
                        sortKey="material"
                        orden={orden}
                        onSort={ordenarPor}
                      />
                    )}

                    {visibilidad.um && (
                      <SortHeader
                        label="UM"
                        sortKey="um"
                        orden={orden}
                        onSort={ordenarPor}
                      />
                    )}

                    {visibilidad.seccion && (
                      <SortHeader
                        label="Seccion"
                        sortKey="seccion"
                        orden={orden}
                        onSort={ordenarPor}
                      />
                    )}

                    {visibilidad.semanas &&
                      columnasSemana.map((sem) => {
                        const activo = semanasTransito.includes(sem);

                        return (
                          <Fragment key={sem}>
                            <th className="px-4 py-3 text-right font-black">
                              <button
                                type="button"
                                onClick={() => toggleSemanaTransito(sem)}
                                className={`w-full text-right uppercase transition ${
                                  activo
                                    ? "text-[#e30613]"
                                    : "text-slate-500 hover:text-slate-950"
                                }`}
                                title="Mostrar u ocultar plan en transito"
                              >
                                {sem}
                              </button>
                              <button
                                type="button"
                                onClick={() => ordenarPor(`sem:${sem}`)}
                                className="mt-1 text-[10px] font-black text-slate-400 hover:text-slate-950"
                              >
                                Orden {orden?.key === `sem:${sem}` ? orden.direction : ""}
                              </button>
                            </th>
                            {activo && (
                              <>
                                <SortHeader
                                  label={`Fecha operativa ${sem}`}
                                  sortKey={`transitoFecha:${sem}`}
                                  orden={orden}
                                  onSort={ordenarPor}
                                  align="right"
                                />
                                <SortHeader
                                  label={`Cantidad transito ${sem}`}
                                  sortKey={`transitoCantidad:${sem}`}
                                  orden={orden}
                                  onSort={ordenarPor}
                                  align="right"
                                />
                              </>
                            )}
                          </Fragment>
                        );
                      })}

                    {visibilidad.totalNecesidad && (
                      <SortHeader
                        label="Total necesidad"
                        sortKey="totalNecesidad"
                        orden={orden}
                        onSort={ordenarPor}
                        align="right"
                      />
                    )}

                    {almacenesDetectados.map(
                      (alm) =>
                        visibilidad.almacenes[alm] && (
                          <SortHeader
                            key={alm}
                            label={alm}
                            sortKey={`alm:${alm}`}
                            orden={orden}
                            onSort={ordenarPor}
                            align="right"
                          />
                        )
                    )}

                    {visibilidad.totalExistencia && (
                      <SortHeader
                        label="AG01 + AG04"
                        sortKey="totalExistencia"
                        orden={orden}
                        onSort={ordenarPor}
                        align="right"
                      />
                    )}

                    {visibilidad.diferenciaTotal && (
                      <SortHeader
                        label="Diferencia"
                        sortKey="diferenciaTotal"
                        orden={orden}
                        onSort={ordenarPor}
                        align="right"
                      />
                    )}

                    {visibilidad.diferenciasSemana &&
                      columnasSemana.map((sem) => (
                        <SortHeader
                          key={`dif-${sem}`}
                          label={`Dif. ${sem}`}
                          sortKey={`dif:${sem}`}
                          orden={orden}
                          onSort={ordenarPor}
                          align="right"
                        />
                      ))}

                    {visibilidad.estado && (
                      <SortHeader
                        label="Estado"
                        sortKey="estado"
                        orden={orden}
                        onSort={ordenarPor}
                      />
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filtradoOrdenado.map((row, i) => (
                    <tr
                      key={`${row.codigo}-${i}`}
                      className="border-b border-slate-100 bg-white transition hover:bg-[#fbfbfa]"
                    >
                      {visibilidad.codigo && (
                        <td className="px-4 py-3 font-black text-slate-950">
                          {row.codigo}
                        </td>
                      )}

                      {visibilidad.material && (
                        <td className="max-w-[360px] px-4 py-3 font-medium text-slate-700">
                          {row.material}
                        </td>
                      )}

                      {visibilidad.um && (
                        <td className="px-4 py-3 font-semibold text-slate-500">
                          {row.um}
                        </td>
                      )}

                      {visibilidad.seccion && (
                        <td className="px-4 py-3 font-semibold text-slate-500">
                          {row.seccion || "-"}
                        </td>
                      )}

                      {visibilidad.semanas &&
                        columnasSemana.map((sem) => {
                          const activo = semanasTransito.includes(sem);
                          const transitos = row.transitosPorSemana?.[sem] || [];
                          const fechas = Array.from(
                            new Set(
                              transitos
                                .map((item) => item.fechaOperativa)
                                .filter(Boolean)
                            )
                          );
                          const cantidadTransito =
                            row.recepcionesPorSemana?.[sem] || 0;

                          return (
                            <Fragment key={sem}>
                              <td className="px-4 py-3 text-right font-medium text-slate-700">
                                {formatoNumero(
                                  row.necesidadesPorSemana[sem] || 0
                                )}
                              </td>
                              {activo && (
                                <>
                                  <td className="min-w-[150px] px-4 py-3 text-right font-semibold text-slate-600">
                                    {fechas.length > 0 ? fechas.join(", ") : "-"}
                                  </td>
                                  <td className="px-4 py-3 text-right font-black text-[#9a6a00]">
                                    {formatoNumero(cantidadTransito)}
                                  </td>
                                </>
                              )}
                            </Fragment>
                          );
                        })}

                      {visibilidad.totalNecesidad && (
                        <td className="px-4 py-3 text-right font-black text-slate-950">
                          {formatoNumero(row.totalNecesidad)}
                        </td>
                      )}

                      {almacenesDetectados.map(
                        (alm) =>
                          visibilidad.almacenes[alm] && (
                            <td
                              key={alm}
                              className="px-4 py-3 text-right font-medium text-slate-700"
                            >
                              {formatoNumero(row.almacenes[alm] || 0)}
                            </td>
                          )
                      )}

                      {visibilidad.totalExistencia && (
                        <td className="px-4 py-3 text-right font-black text-slate-950">
                          {formatoNumero(row.totalExistencia)}
                        </td>
                      )}

                      {visibilidad.diferenciaTotal && (
                        <td
                          className={`px-4 py-3 text-right font-black ${
                            row.diferenciaTotal < 0
                              ? "text-[#e30613]"
                              : "text-emerald-700"
                          }`}
                        >
                          {formatoNumero(row.diferenciaTotal)}
                        </td>
                      )}

                      {visibilidad.diferenciasSemana &&
                        columnasSemana.map((sem) => (
                          <td
                            key={`dif-${sem}`}
                            className={`px-4 py-3 text-right font-black ${
                              row.diferenciasPorSemana[sem] < 0
                                ? "text-[#e30613]"
                                : "text-slate-700"
                            }`}
                          >
                            {formatoNumero(row.diferenciasPorSemana[sem] || 0)}
                          </td>
                        ))}

                      {visibilidad.estado && (
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              row.estado === "FALTANTE"
                                ? "bg-red-50 text-[#e30613]"
                                : row.estado === "SOBRANTE"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {row.estado}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}

                  {filtrado.length === 0 && (
                    <tr>
                      <td
                        colSpan={999}
                        className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                      >
                        No hay datos con los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left text-xs font-black transition ${
        checked
          ? "border-[#e30613]/30 bg-red-50 text-[#e30613]"
          : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
      }`}
    >
      <span className="mr-2 inline-block">{checked ? "●" : "○"}</span>
      {label}
    </button>
  );
}

function SortHeader({
  label,
  sortKey,
  orden,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  orden: SortConfig;
  onSort: (key: string) => void;
  align?: "left" | "right";
}) {
  const activo = orden?.key === sortKey;
  const marca = activo ? (orden.direction === "asc" ? "asc" : "desc") : "";

  return (
    <th
      className={`px-4 py-3 font-black ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`w-full uppercase transition ${
          align === "right" ? "text-right" : "text-left"
        } ${activo ? "text-[#e30613]" : "text-slate-500 hover:text-slate-950"}`}
        title="Ordenar columna"
      >
        {label}
        {marca && <span className="ml-1 text-[10px]">{marca}</span>}
      </button>
    </th>
  );
}
