"use client";

import * as XLSX from "xlsx";
import { generarBalance } from "@/lib/balance";
import { guardarCarga, crearNombreBalance } from "@/lib/storage";
import { BalanceInfo, BalanceRow, ExcelData, SavedLoad } from "@/types/balance";
import { formatoNumero } from "@/lib/format";
import { useState } from "react";

type Props = {
  datos: ExcelData;
  archivoNombre: string;
  analisis: BalanceRow[];
  setAnalisis: (data: BalanceRow[]) => void;
  infoAnalisis: BalanceInfo | null;
  setInfoAnalisis: (data: BalanceInfo | null) => void;
};

export default function BalanceModule({
  datos,
  archivoNombre,
  analisis,
  setAnalisis,
  infoAnalisis,
  setInfoAnalisis,
}: Props) {
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroSeccion, setFiltroSeccion] = useState("TODAS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");

  const columnasSemana = infoAnalisis?.columnasSemana || [];
  const almacenesDetectados = infoAnalisis?.almacenesDetectados || [];
  const seccionesDetectadas = infoAnalisis?.seccionesDetectadas || [];

  function ejecutarBalance() {
    try {
      const resultado = generarBalance(datos);

      setAnalisis(resultado.analisis);
      setInfoAnalisis(resultado.info);
    } catch (error: any) {
      alert(error.message);
    }
  }

  function guardarBalanceActual() {
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
      archivo: nombreBalance,
      hojas: Object.keys(datos),
      analisis,
      info: infoAnalisis,
    };

    guardarCarga(carga);

    alert("Balance guardado correctamente.");
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

  function exportar() {
    const dataExport = filtrado.map((row) => {
      const base: any = {
        "N° componente": row.codigo,
        "Texto breve-objeto": row.material,
        UM: row.um,
        Seccion: row.seccion,
      };

      columnasSemana.forEach((sem) => {
        base[sem] = row.necesidadesPorSemana[sem] || 0;
      });

      base["Suma de Total necesidad"] = row.totalNecesidad;

      almacenesDetectados.forEach((alm) => {
        base[alm] = row.almacenes[alm] || 0;
      });

      base["AG01 + AG04"] = row.totalExistencia;
      base["Diferencia total"] = row.diferenciaTotal;

      columnasSemana.forEach((sem) => {
        base[`Dif. ${sem}`] = row.diferenciasPorSemana[sem] || 0;
      });

      base.Estado = row.estado;

      return base;
    });

    const ws = XLSX.utils.json_to_sheet(dataExport);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Analisis");
    XLSX.writeFile(wb, "analisis_balance_materiales.xlsx");
  }

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

            <div className="grid w-full grid-cols-1 gap-3 md:w-auto md:grid-cols-4">
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

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full min-w-[1600px] border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left font-black">
                      Componente
                    </th>
                    <th className="px-4 py-3 text-left font-black">
                      Material
                    </th>
                    <th className="px-4 py-3 text-left font-black">UM</th>
                    <th className="px-4 py-3 text-left font-black">Sección</th>

                    {columnasSemana.map((sem) => (
                      <th
                        key={sem}
                        className="px-4 py-3 text-right font-black"
                      >
                        {sem}
                      </th>
                    ))}

                    <th className="px-4 py-3 text-right font-black">
                      Total necesidad
                    </th>

                    {almacenesDetectados.map((alm) => (
                      <th
                        key={alm}
                        className="px-4 py-3 text-right font-black"
                      >
                        {alm}
                      </th>
                    ))}

                    <th className="px-4 py-3 text-right font-black">
                      AG01 + AG04
                    </th>
                    <th className="px-4 py-3 text-right font-black">
                      Diferencia
                    </th>

                    {columnasSemana.map((sem) => (
                      <th
                        key={`dif-${sem}`}
                        className="px-4 py-3 text-right font-black"
                      >
                        Dif. {sem}
                      </th>
                    ))}

                    <th className="px-4 py-3 text-left font-black">Estado</th>
                  </tr>
                </thead>

                <tbody>
                  {filtrado.map((row, i) => (
                    <tr
                      key={`${row.codigo}-${i}`}
                      className="border-b border-slate-100 bg-white transition hover:bg-[#fbfbfa]"
                    >
                      <td className="px-4 py-3 font-black text-slate-950">
                        {row.codigo}
                      </td>

                      <td className="max-w-[360px] px-4 py-3 font-medium text-slate-700">
                        {row.material}
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-500">
                        {row.um}
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-500">
                        {row.seccion || "-"}
                      </td>

                      {columnasSemana.map((sem) => (
                        <td
                          key={sem}
                          className="px-4 py-3 text-right font-medium text-slate-700"
                        >
                          {formatoNumero(row.necesidadesPorSemana[sem] || 0)}
                        </td>
                      ))}

                      <td className="px-4 py-3 text-right font-black text-slate-950">
                        {formatoNumero(row.totalNecesidad)}
                      </td>

                      {almacenesDetectados.map((alm) => (
                        <td
                          key={alm}
                          className="px-4 py-3 text-right font-medium text-slate-700"
                        >
                          {formatoNumero(row.almacenes[alm] || 0)}
                        </td>
                      ))}

                      <td className="px-4 py-3 text-right font-black text-slate-950">
                        {formatoNumero(row.totalExistencia)}
                      </td>

                      <td
                        className={`px-4 py-3 text-right font-black ${
                          row.diferenciaTotal < 0
                            ? "text-[#e30613]"
                            : "text-emerald-700"
                        }`}
                      >
                        {formatoNumero(row.diferenciaTotal)}
                      </td>

                      {columnasSemana.map((sem) => (
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