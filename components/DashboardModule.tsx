"use client";

import { useMemo, useState } from "react";
import { BalanceInfo, BalanceRow } from "@/types/balance";
import { formatoNumero } from "@/lib/format";

type Props = {
  analisis: BalanceRow[];
  infoAnalisis: BalanceInfo | null;
};

export default function DashboardModule({ analisis, infoAnalisis }: Props) {
  const semanas = infoAnalisis?.columnasSemana || [];
  const [semanaSeleccionada, setSemanaSeleccionada] = useState<string>("");

  const semanaActiva = semanaSeleccionada || semanas[0] || "";

  const topFaltantes = [...analisis]
    .filter((r) => r.diferenciaTotal < 0)
    .sort((a, b) => a.diferenciaTotal - b.diferenciaTotal)
    .slice(0, 10);

  const analisisSemana = useMemo(() => {
    if (!semanaActiva) return [];

    return analisis
      .map((row) => {
        const necesidadSemana = row.necesidadesPorSemana[semanaActiva] || 0;
        const diferenciaSemana = row.diferenciasPorSemana[semanaActiva] || 0;
        const estadoSemana = diferenciaSemana < 0 ? "CRÍTICO" : "OK";

        return {
          ...row,
          necesidadSemana,
          diferenciaSemana,
          estadoSemana,
        };
      })
      .filter((row) => row.necesidadSemana > 0 || row.diferenciaSemana < 0);
  }, [analisis, semanaActiva]);

  const criticosSemana = analisisSemana
    .filter((r: any) => r.diferenciaSemana < 0)
    .sort((a: any, b: any) => a.diferenciaSemana - b.diferenciaSemana);

  const necesidadTotalSemana = analisisSemana.reduce(
    (acc: number, row: any) => acc + row.necesidadSemana,
    0
  );

  const faltanteTotalSemana = criticosSemana.reduce(
    (acc: number, row: any) => acc + Math.abs(row.diferenciaSemana),
    0
  );

  const coberturaOkSemana = analisisSemana.filter(
    (r: any) => r.diferenciaSemana >= 0
  ).length;

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black text-slate-950">
              Dashboard ejecutivo
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Resumen gerencial del último análisis de balance generado.
            </p>
          </div>

          <div className="rounded-xl border border-[#d4a017]/30 bg-[#fff8df] px-5 py-3 text-sm font-black text-[#9a6a00]">
            Base AG01 + AG04
          </div>
        </div>
      </div>

      {infoAnalisis ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">
                Componentes
              </p>
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
              <p className="text-sm font-semibold text-slate-500">Identidad</p>
              <p className="mt-1 text-2xl font-black text-[#9a6a00]">
                Bavaria
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-xl font-black text-slate-950">
                  Riesgo por semana
                </h4>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Selecciona una semana y revisa materiales críticos para esa
                  necesidad.
                </p>
              </div>

              <select
                value={semanaActiva}
                onChange={(e) => setSemanaSeleccionada(e.target.value)}
                className="h-11 min-w-[220px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#e30613]"
              >
                {semanas.map((sem) => (
                  <option key={sem} value={sem}>
                    {sem}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-[#fbfbfa] p-5">
                <p className="text-sm font-semibold text-slate-500">
                  Semana evaluada
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">
                  {semanaActiva || "-"}
                </p>
              </div>

              <div className="rounded-2xl border border-red-100 bg-white p-5">
                <p className="text-sm font-semibold text-slate-500">
                  Críticos semana
                </p>
                <p className="mt-1 text-3xl font-black text-[#e30613]">
                  {criticosSemana.length}
                </p>
              </div>

              <div className="rounded-2xl border border-[#d4a017]/25 bg-white p-5">
                <p className="text-sm font-semibold text-slate-500">
                  Necesidad semana
                </p>
                <p className="mt-1 text-2xl font-black text-[#9a6a00]">
                  {formatoNumero(necesidadTotalSemana)}
                </p>
              </div>

              <div className="rounded-2xl border border-red-100 bg-white p-5">
                <p className="text-sm font-semibold text-slate-500">
                  Faltante acumulado
                </p>
                <p className="mt-1 text-2xl font-black text-[#e30613]">
                  {formatoNumero(faltanteTotalSemana)}
                </p>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-[460px] overflow-auto">
                <table className="w-full min-w-[1100px] border-collapse text-sm">
                  <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 text-left font-black">
                        Componente
                      </th>
                      <th className="px-4 py-3 text-left font-black">
                        Material
                      </th>
                      <th className="px-4 py-3 text-left font-black">
                        Sección
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Necesidad {semanaActiva}
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Stock base
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Diferencia {semanaActiva}
                      </th>
                      <th className="px-4 py-3 text-left font-black">
                        Estado
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {criticosSemana.map((row: any, i: number) => (
                      <tr
                        key={`${row.codigo}-${i}`}
                        className="border-b border-slate-100 bg-white transition hover:bg-[#fbfbfa]"
                      >
                        <td className="px-4 py-3 font-black text-slate-950">
                          {row.codigo}
                        </td>

                        <td className="max-w-[420px] px-4 py-3 font-medium text-slate-700">
                          {row.material}
                        </td>

                        <td className="px-4 py-3 font-semibold text-slate-500">
                          {row.seccion || "-"}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold text-slate-700">
                          {formatoNumero(row.necesidadSemana)}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold text-slate-700">
                          {formatoNumero(row.totalExistencia)}
                        </td>

                        <td className="px-4 py-3 text-right font-black text-[#e30613]">
                          {formatoNumero(row.diferenciaSemana)}
                        </td>

                        <td className="px-4 py-3">
                          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-[#e30613]">
                            CRÍTICO
                          </span>
                        </td>
                      </tr>
                    ))}

                    {criticosSemana.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                        >
                          No hay materiales críticos para la semana
                          seleccionada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="mt-3 text-sm font-semibold text-slate-500">
              Componentes con cobertura OK en esta semana:{" "}
              <b>{coberturaOkSemana}</b>
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="mb-4 text-xl font-black text-slate-950">
              Top 10 faltantes críticos
            </h4>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-[#f8f8f6]">
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left font-black">
                      Componente
                    </th>
                    <th className="px-4 py-3 text-left font-black">
                      Material
                    </th>
                    <th className="px-4 py-3 text-left font-black">Sección</th>
                    <th className="px-4 py-3 text-right font-black">
                      Faltante total
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {topFaltantes.map((r) => (
                    <tr
                      key={r.codigo}
                      className="border-b border-slate-100 bg-white transition hover:bg-[#fbfbfa]"
                    >
                      <td className="px-4 py-3 font-black text-slate-950">
                        {r.codigo}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {r.material}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-500">
                        {r.seccion}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-[#e30613]">
                        {formatoNumero(r.diferenciaTotal)}
                      </td>
                    </tr>
                  ))}

                  {topFaltantes.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                      >
                        No hay faltantes críticos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="font-bold text-slate-600">
            Todavía no hay análisis generado.
          </p>
        </div>
      )}
    </section>
  );
}