"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BalanceInfo, BalanceRow } from "@/types/balance";
import { formatoNumero } from "@/lib/format";

type Props = {
  analisis: BalanceRow[];
  infoAnalisis: BalanceInfo | null;
};

export default function DashboardModule({ analisis, infoAnalisis }: Props) {
  const semanas = infoAnalisis?.columnasSemana || [];
  const [semanaSeleccionada, setSemanaSeleccionada] = useState("");

  const semanaActiva = semanaSeleccionada || semanas[0] || "";

  const analisisSemana = useMemo(() => {
    if (!semanaActiva) return [];

    return analisis
      .map((row) => {
        const necesidadSemana = row.necesidadesPorSemana[semanaActiva] || 0;
        const diferenciaSemana = row.diferenciasPorSemana[semanaActiva] || 0;

        return {
          ...row,
          necesidadSemana,
          diferenciaSemana,
          estadoSemana: diferenciaSemana < 0 ? "CRÍTICO" : "OK",
        };
      })
      .filter((row) => row.necesidadSemana > 0 || row.diferenciaSemana < 0);
  }, [analisis, semanaActiva]);

  const criticosSemana = analisisSemana
    .filter((r: any) => r.diferenciaSemana < 0)
    .sort((a: any, b: any) => a.diferenciaSemana - b.diferenciaSemana);

  const topCriticosSemana = criticosSemana.slice(0, 10);

  const topFaltantes = [...analisis]
    .filter((r) => r.diferenciaTotal < 0)
    .sort((a, b) => a.diferenciaTotal - b.diferenciaTotal)
    .slice(0, 10);

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

  const porcentajeCritico =
    analisisSemana.length > 0
      ? (criticosSemana.length / analisisSemana.length) * 100
      : 0;

  const dataSemanas = semanas.map((sem) => {
    const necesidad = analisis.reduce(
      (acc, row) => acc + (row.necesidadesPorSemana[sem] || 0),
      0
    );

    const criticos = analisis.filter(
      (row) => (row.diferenciasPorSemana[sem] || 0) < 0
    ).length;

    const faltante = analisis.reduce((acc, row) => {
      const dif = row.diferenciasPorSemana[sem] || 0;
      return dif < 0 ? acc + Math.abs(dif) : acc;
    }, 0);

    return {
      semana: sem,
      necesidad,
      criticos,
      faltante,
    };
  });

  const dataSecciones = Object.values(
    analisis.reduce((acc: any, row) => {
      const seccion = row.seccion || "SIN SECCIÓN";

      if (!acc[seccion]) {
        acc[seccion] = {
          seccion,
          faltante: 0,
          criticos: 0,
        };
      }

      if (row.diferenciaTotal < 0) {
        acc[seccion].faltante += Math.abs(row.diferenciaTotal);
        acc[seccion].criticos += 1;
      }

      return acc;
    }, {})
  )
    .sort((a: any, b: any) => b.faltante - a.faltante)
    .slice(0, 8);

  const alertas = [
    {
      titulo: "Semana crítica",
      texto:
        criticosSemana.length > 0
          ? `${semanaActiva} tiene ${criticosSemana.length} materiales críticos.`
          : `${semanaActiva || "-"} no presenta materiales críticos.`,
      tipo: criticosSemana.length > 0 ? "rojo" : "verde",
    },
    {
      titulo: "Faltante acumulado",
      texto:
        faltanteTotalSemana > 0
          ? `Faltante acumulado en ${semanaActiva}: ${formatoNumero(
              faltanteTotalSemana
            )}.`
          : "No hay faltante acumulado en la semana seleccionada.",
      tipo: faltanteTotalSemana > 0 ? "rojo" : "verde",
    },
    {
      titulo: "Concentración por sección",
      texto:
        dataSecciones.length > 0
          ? `${(dataSecciones[0] as any).seccion} concentra el mayor riesgo.`
          : "No hay riesgo por sección.",
      tipo: dataSecciones.length > 0 ? "dorado" : "verde",
    },
  ];

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black text-slate-950">
              Dashboard ejecutivo
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              KPIs, alertas, gráficos y análisis de riesgo por semana.
            </p>
          </div>

          <div className="rounded-xl border border-[#d4a017]/30 bg-[#fff8df] px-5 py-3 text-sm font-black text-[#9a6a00]">
            Base AG01 + AG04
          </div>
        </div>
      </div>

      {!infoAnalisis ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="font-bold text-slate-600">
            Todavía no hay análisis generado.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Kpi titulo="Componentes" valor={infoAnalisis.totalComponentes} />
            <Kpi
              titulo="Faltantes"
              valor={infoAnalisis.totalFaltantes}
              color="text-[#e30613]"
              border="border-red-100"
            />
            <Kpi
              titulo="Sobrantes"
              valor={infoAnalisis.totalSobrantes}
              color="text-emerald-700"
              border="border-emerald-100"
            />
            <Kpi
              titulo="% crítico semana"
              valor={`${porcentajeCritico.toFixed(1)}%`}
              color="text-[#9a6a00]"
              border="border-[#d4a017]/25"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {alertas.map((alerta) => (
              <div
                key={alerta.titulo}
                className={`rounded-2xl border bg-white p-5 shadow-sm ${
                  alerta.tipo === "rojo"
                    ? "border-red-100"
                    : alerta.tipo === "verde"
                    ? "border-emerald-100"
                    : "border-[#d4a017]/25"
                }`}
              >
                <p
                  className={`text-sm font-black ${
                    alerta.tipo === "rojo"
                      ? "text-[#e30613]"
                      : alerta.tipo === "verde"
                      ? "text-emerald-700"
                      : "text-[#9a6a00]"
                  }`}
                >
                  {alerta.titulo}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  {alerta.texto}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-xl font-black text-slate-950">
                  Riesgo por semana
                </h4>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Selecciona una semana y revisa materiales críticos.
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
              <Kpi titulo="Semana" valor={semanaActiva || "-"} />
              <Kpi
                titulo="Críticos"
                valor={criticosSemana.length}
                color="text-[#e30613]"
                border="border-red-100"
              />
              <Kpi
                titulo="Necesidad semana"
                valor={formatoNumero(necesidadTotalSemana)}
                color="text-[#9a6a00]"
                border="border-[#d4a017]/25"
              />
              <Kpi
                titulo="Cobertura OK"
                valor={coberturaOkSemana}
                color="text-emerald-700"
                border="border-emerald-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h4 className="mb-4 text-lg font-black text-slate-950">
                Faltante total por semana
              </h4>

              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dataSemanas}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="semana" />
                    <YAxis />
                    <Tooltip formatter={(v: any) => formatoNumero(v)} />
                    <Bar dataKey="faltante" radius={[8, 8, 0, 0]}>
                      {dataSemanas.map((_, index) => (
                        <Cell key={index} fill="#e30613" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h4 className="mb-4 text-lg font-black text-slate-950">
                Necesidad por semana
              </h4>

              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dataSemanas}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="semana" />
                    <YAxis />
                    <Tooltip formatter={(v: any) => formatoNumero(v)} />
                    <Line
                      type="monotone"
                      dataKey="necesidad"
                      stroke="#d4a017"
                      strokeWidth={4}
                      dot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="mb-4 text-xl font-black text-slate-950">
              Materiales críticos en {semanaActiva}
            </h4>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-[440px] overflow-auto">
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
                        Necesidad
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Stock base
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Diferencia
                      </th>
                      <th className="px-4 py-3 text-left font-black">
                        Estado
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {topCriticosSemana.map((row: any, i: number) => (
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
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatoNumero(row.necesidadSemana)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
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

                    {topCriticosSemana.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                        >
                          No hay materiales críticos para esta semana.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="mb-4 text-xl font-black text-slate-950">
              Top 10 faltantes críticos total
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
      )}
    </section>
  );
}

function Kpi({
  titulo,
  valor,
  color = "text-slate-950",
  border = "border-slate-200",
}: {
  titulo: string;
  valor: any;
  color?: string;
  border?: string;
}) {
  return (
    <div className={`rounded-2xl border ${border} bg-white p-5 shadow-sm`}>
      <p className="text-sm font-semibold text-slate-500">{titulo}</p>
      <p className={`mt-1 text-3xl font-black ${color}`}>{valor}</p>
    </div>
  );
}