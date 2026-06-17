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
    almacenesVisibles[alm] = false;
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
  const [semanasSeleccionadas, setSemanasSeleccionadas] = useState<string[]>([]);
  const [semanasTransito, setSemanasTransito] = useState<string[]>([]);
  const [orden, setOrden] = useState<SortConfig>(null);
  const [nombreGuardado, setNombreGuardado] = useState("");
  const [guardandoBalance, setGuardandoBalance] = useState(false);
  const [filaSeleccionada, setFilaSeleccionada] = useState<BalanceRow | null>(
    null
  );
  const [mensajeGuardado, setMensajeGuardado] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);
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
        nuevosAlmacenes[alm] = actual.almacenes[alm] ?? false;
      });

      return {
        ...actual,
        almacenes: nuevosAlmacenes,
      };
    });
  }, [almacenesDetectados.join("|")]);

  useEffect(() => {
    setSemanasSeleccionadas((actual) => {
      const validas = actual.filter((sem) => columnasSemana.includes(sem));
      return validas.length > 0 ? validas : columnasSemana;
    });
    setSemanasTransito((actual) =>
      actual.filter((sem) => columnasSemana.includes(sem))
    );
  }, [columnasSemana.join("|")]);

  function toggleCampo(campo: keyof Omit<ColumnVisibility, "almacenes">) {
    setVisibilidad((actual) => ({
      ...actual,
      [campo]: !actual[campo],
    }));
  }

  function vistaEjecutiva() {
    const almacenesBase: Record<string, boolean> = {};
    almacenesDetectados.forEach((alm) => {
      almacenesBase[alm] = false;
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

  const semanasActivas = semanasSeleccionadas;

  function toggleSemanaAnalisis(semana: string) {
    setSemanasSeleccionadas((actual) =>
      actual.includes(semana)
        ? actual.filter((item) => item !== semana)
        : [...actual, semana]
    );
  }

  function totalNecesidadSeleccionada(row: BalanceRow) {
    return semanasActivas.reduce(
      (acc, sem) => acc + (row.necesidadesPorSemana[sem] || 0),
      0
    );
  }

  function diferenciaSeleccionada(row: BalanceRow) {
    return row.totalExistencia - totalNecesidadSeleccionada(row);
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
        return totalNecesidadSeleccionada(row);
      case "totalExistencia":
        return row.totalExistencia;
      case "diferenciaTotal":
        return diferenciaSeleccionada(row);
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
      setSemanasSeleccionadas(resultado.info.columnasSemana || []);
    } catch (error: any) {
      alert(error.message);
    }
  }

  function abrirModalGuardarBalance() {
    if (!infoAnalisis || analisis.length === 0) {
      setMensajeGuardado({
        tipo: "error",
        texto: "Primero genera un balance.",
      });
      return;
    }

    setNombreGuardado(crearNombreBalance());
  }

  async function confirmarGuardarBalance() {
    if (!infoAnalisis || analisis.length === 0 || !nombreGuardado.trim()) {
      setMensajeGuardado({
        tipo: "error",
        texto: "No hay balance listo para guardar.",
      });
      return;
    }

    setGuardandoBalance(true);
    setMensajeGuardado(null);

    const carga: SavedLoad = {
      id: crypto.randomUUID(),
      fecha: new Date().toISOString(),
      createdBy: currentUser,
      archivo: nombreGuardado.trim(),
      hojas: Object.keys(datos),
      analisis,
      info: infoAnalisis,
    };

    try {
      await guardarCarga(carga);
      setNombreGuardado("");
      setMensajeGuardado({
        tipo: "ok",
        texto: "Balance guardado correctamente.",
      });
    } catch (error: any) {
      setMensajeGuardado({
        tipo: "error",
        texto: error.message || "No se pudo guardar el balance.",
      });
    } finally {
      setGuardandoBalance(false);
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
        semanasActivas.forEach((sem) => {
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
        base["Suma de Total necesidad"] = totalNecesidadSeleccionada(row);
      }

      if (visibilidad.totalExistencia) {
        base["AG01 + AG04"] = row.totalExistencia;
      }

      if (visibilidad.diferenciaTotal) {
        base["Diferencia total"] = diferenciaSeleccionada(row);
      }

      if (visibilidad.diferenciasSemana) {
        semanasActivas.forEach((sem) => {
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
  const primeraSemanaValidacion = columnasSemana[0] || "";
  const skusCriticosPrimeraSemana = primeraSemanaValidacion
    ? analisis.filter(
        (row) => (row.diferenciasPorSemana[primeraSemanaValidacion] || 0) < 0
      ).length
    : 0;
  const faltantePrimeraSemana = primeraSemanaValidacion
    ? analisis.reduce(
        (acc, row) => {
          const diferencia =
            row.diferenciasPorSemana[primeraSemanaValidacion] || 0;
          return diferencia < 0 ? acc + Math.abs(diferencia) : acc;
        },
        0
      )
    : 0;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-950">
              Balance de materiales
            </h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
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
                  onClick={abrirModalGuardarBalance}
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

      {mensajeGuardado && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-bold shadow-sm ${
            mensajeGuardado.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-[#e30613]"
          }`}
        >
          {mensajeGuardado.texto}
        </div>
      )}

      {infoAnalisis && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">
                Valor inventario libre
              </p>
              <p className="mt-1 truncate text-xl font-black text-emerald-700">
                {formatoNumero(valoresInventario.libre)}
              </p>
            </div>

            <div className="rounded-xl border border-[#d4a017]/25 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">
                Valor inventario bloqueado
              </p>
              <p className="mt-1 truncate text-xl font-black text-[#9a6a00]">
                {formatoNumero(valoresInventario.bloqueado)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">
                Valor inventario total
              </p>
              <p className="mt-1 truncate text-xl font-black text-slate-950">
                {formatoNumero(valoresInventario.total)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Componentes</p>
              <p className="mt-1 truncate text-xl font-black text-slate-950">
                {infoAnalisis.totalComponentes}
              </p>
            </div>

            <div className="rounded-xl border border-red-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Faltantes</p>
              <p className="mt-1 truncate text-xl font-black text-[#e30613]">
                {infoAnalisis.totalFaltantes}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Sobrantes</p>
              <p className="mt-1 truncate text-xl font-black text-emerald-700">
                {infoAnalisis.totalSobrantes}
              </p>
            </div>

            <div className="rounded-xl border border-[#d4a017]/25 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">
                SKU críticos {primeraSemanaValidacion || ""}
              </p>
              <p className="mt-1 truncate text-xl font-black text-[#9a6a00]">
                {skusCriticosPrimeraSemana}
              </p>
              <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                Faltante: {formatoNumero(faltantePrimeraSemana)}
              </p>
            </div>
          </div>
        </>
      )}

      {analisis.length > 0 && (
        <div
          className="origin-top-left rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          style={{ zoom: 0.8 } as any}
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h4 className="text-base font-black text-slate-950">
                Análisis de componentes
              </h4>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                Mostrando {filtrado.length} de {analisis.length} componentes.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 md:w-auto md:grid-cols-5">
              <input
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder="Buscar componente, descripción, sección..."
                className="h-9 min-w-[280px] rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-[#e30613]/10"
              />

              <select
                value={filtroSeccion}
                onChange={(e) => setFiltroSeccion(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none transition focus:border-[#e30613]"
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
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none transition focus:border-[#e30613]"
              >
                <option value="TODOS">Todos los estados</option>
                <option value="FALTANTE">Faltante</option>
                <option value="SOBRANTE">Sobrante</option>
                <option value="JUSTO">Justo</option>
              </select>

              <button
                onClick={() => setMostrarColumnas(!mostrarColumnas)}
                className="h-9 rounded-lg border border-[#d4a017]/50 bg-[#fff8df] px-3 text-xs font-black text-[#9a6a00] transition hover:bg-[#fff1bf]"
              >
                {mostrarColumnas ? "Ocultar panel" : "Columnas"}
              </button>

              <button
                onClick={() => {
                  setFiltroTexto("");
                  setFiltroSeccion("TODAS");
                  setFiltroEstado("TODOS");
                }}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-[#fbfbfa] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h5 className="text-sm font-black text-slate-950">
                  Filtro de semanas
                </h5>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  Por defecto se evaluan todas. Desmarca las semanas que no quieras analizar.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSemanasSeleccionadas(columnasSemana)}
                  className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  Todas
                </button>
                <button
                  onClick={() => setSemanasSeleccionadas([])}
                  className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  Limpiar
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {columnasSemana.map((sem) => {
                const activo = semanasActivas.includes(sem);

                return (
                  <button
                    key={sem}
                    onClick={() => toggleSemanaAnalisis(sem)}
                    className={`h-8 rounded-lg border px-3 text-xs font-black transition ${
                      activo
                        ? "border-[#e30613]/30 bg-red-50 text-[#e30613]"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {sem}
                  </button>
                );
              })}
            </div>
          </div>

          {mostrarColumnas && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-[#fbfbfa] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h5 className="text-sm font-black text-slate-950">
                    Visibilidad de columnas
                  </h5>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Oculta almacenes o columnas para una vista más limpia.
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={vistaEjecutiva}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                  >
                    Vista ejecutiva
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
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
            </div>
          )}

          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[1080px] border-collapse text-[11px]">
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
                      semanasActivas.map((sem) => {
                        const activo = semanasTransito.includes(sem);

                        return (
                          <Fragment key={sem}>
                            <th className="px-2.5 py-1.5 text-right font-black">
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
                      semanasActivas.map((sem) => (
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
                      onMouseDown={() => setFilaSeleccionada(row)}
                      onDoubleClick={() => setFilaSeleccionada(row)}
                      className="cursor-pointer border-b border-slate-100 bg-white transition hover:bg-[#fff1bf] active:bg-[#ffe7a3]"
                    >
                      {visibilidad.codigo && (
                        <td className="px-2.5 py-1.5 font-black text-slate-950">
                          {row.codigo}
                        </td>
                      )}

                      {visibilidad.material && (
                        <td className="max-w-[300px] px-2.5 py-1.5 font-medium text-slate-700">
                          {row.material}
                        </td>
                      )}

                      {visibilidad.um && (
                        <td className="px-2.5 py-1.5 font-semibold text-slate-500">
                          {row.um}
                        </td>
                      )}

                      {visibilidad.seccion && (
                        <td className="px-2.5 py-1.5 font-semibold text-slate-500">
                          {row.seccion || "-"}
                        </td>
                      )}

                      {visibilidad.semanas &&
                        semanasActivas.map((sem) => {
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
                              <td className="px-2.5 py-1.5 text-right font-medium text-slate-700">
                                {formatoNumero(
                                  row.necesidadesPorSemana[sem] || 0
                                )}
                              </td>
                              {activo && (
                                <>
                                  <td className="min-w-[130px] px-2.5 py-1.5 text-right font-semibold text-slate-600">
                                    {fechas.length > 0 ? fechas.join(", ") : "-"}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-right font-black text-[#9a6a00]">
                                    {formatoNumero(cantidadTransito)}
                                  </td>
                                </>
                              )}
                            </Fragment>
                          );
                        })}

                      {visibilidad.totalNecesidad && (
                        <td className="px-2.5 py-1.5 text-right font-black text-slate-950">
                          {formatoNumero(totalNecesidadSeleccionada(row))}
                        </td>
                      )}

                      {visibilidad.totalExistencia && (
                        <td className="px-2.5 py-1.5 text-right font-black text-slate-950">
                          {formatoNumero(row.totalExistencia)}
                        </td>
                      )}

                      {visibilidad.diferenciaTotal && (
                        <td
                          className={`px-2.5 py-1.5 text-right font-black ${
                            diferenciaSeleccionada(row) < 0
                              ? "text-[#e30613]"
                              : "text-emerald-700"
                          }`}
                        >
                          {formatoNumero(diferenciaSeleccionada(row))}
                        </td>
                      )}

                      {visibilidad.diferenciasSemana &&
                        semanasActivas.map((sem) => (
                          <td
                            key={`dif-${sem}`}
                            className={`px-2.5 py-1.5 text-right font-black ${
                              row.diferenciasPorSemana[sem] < 0
                                ? "text-[#e30613]"
                                : "text-slate-700"
                            }`}
                          >
                            {formatoNumero(row.diferenciasPorSemana[sem] || 0)}
                          </td>
                        ))}

                      {visibilidad.estado && (
                        <td className="px-2.5 py-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
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
                        className="px-3 py-6 text-center text-xs font-semibold text-slate-500"
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

      {nombreGuardado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <h3 className="text-lg font-black text-slate-950">
                Guardar balance
              </h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Confirma el nombre con el que quedara en el historico.
              </p>
            </div>

            <div className="space-y-3 px-6 py-5">
              <label className="text-xs font-black uppercase text-slate-500">
                Nombre del balance
              </label>
              <input
                value={nombreGuardado}
                onChange={(e) => setNombreGuardado(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#e30613] focus:ring-4 focus:ring-[#e30613]/10"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-[#fbfbfa] px-6 py-4">
              <button
                onClick={() => setNombreGuardado("")}
                disabled={guardandoBalance}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarGuardarBalance}
                disabled={guardandoBalance || !nombreGuardado.trim()}
                className="rounded-xl bg-[#e30613] px-5 py-2.5 text-sm font-black text-white shadow-sm hover:bg-[#b8000f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {guardandoBalance ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {filaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase text-slate-500">
                  Detalle del componente
                </p>
                <h3 className="mt-1 text-xl font-black text-slate-950">
                  {filaSeleccionada.codigo} · {filaSeleccionada.material}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {filaSeleccionada.um || "-"} · {filaSeleccionada.seccion || "Sin seccion"}
                </p>
              </div>

              <button
                onClick={() => setFilaSeleccionada(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto px-6 py-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-[#fbfbfa] p-4">
                  <p className="text-xs font-black uppercase text-slate-500">
                    AG01 + AG04
                  </p>
                  <p className="mt-1 text-lg font-black text-slate-950">
                    {formatoNumero(filaSeleccionada.totalExistencia)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-[#fbfbfa] p-4">
                  <p className="text-xs font-black uppercase text-slate-500">
                    Necesidad seleccionada
                  </p>
                  <p className="mt-1 text-lg font-black text-slate-950">
                    {formatoNumero(totalNecesidadSeleccionada(filaSeleccionada))}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-[#fbfbfa] p-4">
                  <p className="text-xs font-black uppercase text-slate-500">
                    Diferencia
                  </p>
                  <p
                    className={`mt-1 text-lg font-black ${
                      diferenciaSeleccionada(filaSeleccionada) < 0
                        ? "text-[#e30613]"
                        : "text-emerald-700"
                    }`}
                  >
                    {formatoNumero(diferenciaSeleccionada(filaSeleccionada))}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-[#fbfbfa] p-4">
                  <p className="text-xs font-black uppercase text-slate-500">
                    Estado
                  </p>
                  <p
                    className={`mt-1 text-lg font-black ${
                      filaSeleccionada.estado === "FALTANTE"
                        ? "text-[#e30613]"
                        : filaSeleccionada.estado === "SOBRANTE"
                          ? "text-emerald-700"
                          : "text-slate-950"
                    }`}
                  >
                    {filaSeleccionada.estado}
                  </p>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-[#f8f8f6] text-slate-500">
                    <tr className="border-b border-slate-200 uppercase">
                      <th className="px-3 py-2 text-left font-black">Semana</th>
                      <th className="px-3 py-2 text-right font-black">
                        Necesidad
                      </th>
                      <th className="px-3 py-2 text-right font-black">
                        Transito
                      </th>
                      <th className="px-3 py-2 text-right font-black">
                        Diferencia
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {semanasActivas.map((sem) => {
                      const diferencia =
                        filaSeleccionada.diferenciasPorSemana[sem] || 0;

                      return (
                        <tr
                          key={sem}
                          className="border-b border-slate-100 last:border-b-0"
                        >
                          <td className="px-3 py-2 font-black text-slate-950">
                            {sem}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-700">
                            {formatoNumero(
                              filaSeleccionada.necesidadesPorSemana[sem] || 0
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-[#9a6a00]">
                            {formatoNumero(
                              filaSeleccionada.recepcionesPorSemana?.[sem] || 0
                            )}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-black ${
                              diferencia < 0
                                ? "text-[#e30613]"
                                : "text-emerald-700"
                            }`}
                          >
                            {formatoNumero(diferencia)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
      className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-black transition ${
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
      className={`px-2.5 py-1.5 font-black ${
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
