"use client";

import { useEffect, useMemo, useState } from "react";
import { formatoNumero } from "@/lib/format";
import { obtenerCargas } from "@/lib/storage";
import { SavedLoad } from "@/types/balance";

type Diagnostico =
  | "AUMENTO DE PLAN"
  | "REDUCCION EXPLICADA POR CONSUMO"
  | "REDUCCION NO EXPLICADA"
  | "CONSUMO MAYOR A REDUCCION"
  | "NUEVO MATERIAL"
  | "MATERIAL RETIRADO"
  | "SIN CAMBIO";

type VariacionRow = {
  codigo: string;
  material: string;
  seccion: string;
  planAnterior: number;
  planActual: number;
  movimientoPlan: number;
  reduccionPlan: number;
  consumoNotificado: number;
  diferenciaPorExplicar: number;
  diagnostico: Diagnostico;
  semanas: {
    semana: string;
    anterior: number;
    actual: number;
    movimiento: number;
  }[];
};

export default function VariacionModule() {
  const [cargas, setCargas] = useState<SavedLoad[]>([]);
  const [cargaAntesId, setCargaAntesId] = useState("");
  const [cargaAhoraId, setCargaAhoraId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroDiagnostico, setFiltroDiagnostico] = useState("TODOS");
  const [filtroSeccion, setFiltroSeccion] = useState("TODAS");
  const [soloPorExplicar, setSoloPorExplicar] = useState(false);
  const [materialSeleccionado, setMaterialSeleccionado] = useState("");

  useEffect(() => {
    obtenerCargas().then((data) => {
      setCargas(data);

      if (data.length >= 2) {
        setCargaAhoraId(data[0].id);
        setCargaAntesId(data[1].id);
      }
    });
  }, []);

  const cargaAntes = cargas.find((c) => c.id === cargaAntesId);
  const cargaAhora = cargas.find((c) => c.id === cargaAhoraId);

  const variaciones = useMemo(() => {
    if (!cargaAntes || !cargaAhora) return [];

    const mapaAntes = new Map(cargaAntes.analisis.map((row) => [row.codigo, row]));
    const mapaAhora = new Map(cargaAhora.analisis.map((row) => [row.codigo, row]));
    const semanas = Array.from(
      new Set([
        ...(cargaAntes.info?.columnasSemana || []),
        ...(cargaAhora.info?.columnasSemana || []),
      ])
    );
    const codigos = new Set([...mapaAntes.keys(), ...mapaAhora.keys()]);

    return Array.from(codigos)
      .map((codigo) => {
        const antes = mapaAntes.get(codigo);
        const ahora = mapaAhora.get(codigo);
        const planAnterior = antes?.totalNecesidad || 0;
        const planActual = ahora?.totalNecesidad || 0;
        const movimientoPlan = planActual - planAnterior;
        const reduccionPlan = Math.max(planAnterior - planActual, 0);
        const consumoNotificado =
          cargaAntes.info?.consumosPorMaterial?.[codigo] || 0;
        const diferenciaPorExplicar =
          reduccionPlan > 0 ? reduccionPlan - consumoNotificado : movimientoPlan;

        let diagnostico: Diagnostico = "SIN CAMBIO";

        if (!antes && ahora) diagnostico = "NUEVO MATERIAL";
        else if (antes && !ahora) diagnostico = "MATERIAL RETIRADO";
        else if (movimientoPlan > 0) diagnostico = "AUMENTO DE PLAN";
        else if (reduccionPlan > 0) {
          const tolerancia = Math.max(1, reduccionPlan * 0.001);
          const diferencia = reduccionPlan - consumoNotificado;

          if (Math.abs(diferencia) <= tolerancia) {
            diagnostico = "REDUCCION EXPLICADA POR CONSUMO";
          } else if (diferencia > 0) {
            diagnostico = "REDUCCION NO EXPLICADA";
          } else {
            diagnostico = "CONSUMO MAYOR A REDUCCION";
          }
        }

        return {
          codigo,
          material: ahora?.material || antes?.material || "",
          seccion: ahora?.seccion || antes?.seccion || "",
          planAnterior,
          planActual,
          movimientoPlan,
          reduccionPlan,
          consumoNotificado,
          diferenciaPorExplicar,
          diagnostico,
          semanas: semanas.map((semana) => {
            const anterior = antes?.necesidadesPorSemana[semana] || 0;
            const actual = ahora?.necesidadesPorSemana[semana] || 0;

            return {
              semana,
              anterior,
              actual,
              movimiento: actual - anterior,
            };
          }),
        };
      })
      .sort((a, b) => {
        const prioridad: Diagnostico[] = [
          "REDUCCION NO EXPLICADA",
          "CONSUMO MAYOR A REDUCCION",
          "AUMENTO DE PLAN",
          "NUEVO MATERIAL",
          "MATERIAL RETIRADO",
          "REDUCCION EXPLICADA POR CONSUMO",
          "SIN CAMBIO",
        ];

        const orden =
          prioridad.indexOf(a.diagnostico) - prioridad.indexOf(b.diagnostico);
        if (orden !== 0) return orden;
        return Math.abs(b.diferenciaPorExplicar) - Math.abs(a.diferenciaPorExplicar);
      });
  }, [cargaAntes, cargaAhora]);

  const diagnosticos = Array.from(new Set(variaciones.map((v) => v.diagnostico)));
  const secciones = Array.from(
    new Set(variaciones.map((v) => v.seccion).filter(Boolean))
  ).sort();

  const variacionesFiltradas = variaciones.filter((row) => {
    const texto = busqueda.toLowerCase().trim();
    const coincideTexto =
      !texto ||
      row.codigo.toLowerCase().includes(texto) ||
      row.material.toLowerCase().includes(texto) ||
      row.seccion.toLowerCase().includes(texto);
    const coincideDiagnostico =
      filtroDiagnostico === "TODOS" || row.diagnostico === filtroDiagnostico;
    const coincideSeccion =
      filtroSeccion === "TODAS" || row.seccion === filtroSeccion;
    const coincideExplicar =
      !soloPorExplicar ||
      row.diagnostico === "REDUCCION NO EXPLICADA" ||
      row.diagnostico === "CONSUMO MAYOR A REDUCCION";

    return (
      coincideTexto && coincideDiagnostico && coincideSeccion && coincideExplicar
    );
  });

  const seleccionado = variaciones.find(
    (row) => row.codigo === materialSeleccionado
  );

  const resumen = {
    aumentos: variaciones.filter((v) => v.diagnostico === "AUMENTO DE PLAN")
      .length,
    explicadas: variaciones.filter(
      (v) => v.diagnostico === "REDUCCION EXPLICADA POR CONSUMO"
    ).length,
    porExplicar: variaciones.filter(
      (v) =>
        v.diagnostico === "REDUCCION NO EXPLICADA" ||
        v.diagnostico === "CONSUMO MAYOR A REDUCCION"
    ).length,
    nuevos: variaciones.filter((v) => v.diagnostico === "NUEVO MATERIAL").length,
    retirados: variaciones.filter((v) => v.diagnostico === "MATERIAL RETIRADO")
      .length,
    diferenciaTotal: variaciones.reduce(
      (acc, row) => acc + row.diferenciaPorExplicar,
      0
    ),
    consumoTotal: variaciones.reduce(
      (acc, row) => acc + row.consumoNotificado,
      0
    ),
  };

  const porcentajeExplicado =
    variaciones.length > 0 ? (resumen.explicadas / variaciones.length) * 100 : 0;

  function toggleMaterial(codigo: string) {
    setMaterialSeleccionado((actual) => (actual === codigo ? "" : codigo));
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">
              Control de variaciones del plan
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Compara plan anterior contra plan actual y valida si las reducciones
              estan explicadas por consumo notificado.
            </p>
          </div>
        </div>
      </div>

      {cargas.length < 2 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="font-bold text-slate-600">
            Necesitas al menos 2 balances guardados para comparar variaciones.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectorCarga
                label="Balance anterior"
                value={cargaAntesId}
                cargas={cargas}
                onChange={setCargaAntesId}
              />
              <SelectorCarga
                label="Balance actual"
                value={cargaAhoraId}
                cargas={cargas}
                onChange={setCargaAhoraId}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4 xl:grid-cols-7">
            <Kpi
              titulo="Aumentos"
              valor={resumen.aumentos}
              color="text-[#0057B8]"
              border="border-blue-100"
            />
            <Kpi
              titulo="Explicadas por consumo"
              valor={resumen.explicadas}
              color="text-emerald-700"
              border="border-emerald-100"
            />
            <Kpi
              titulo="Por explicar"
              valor={resumen.porExplicar}
              color="text-[#0057B8]"
              border="border-blue-100"
            />
            <Kpi titulo="Nuevos" valor={resumen.nuevos} />
            <Kpi titulo="Retirados" valor={resumen.retirados} />
            <Kpi
              titulo="% explicado"
              valor={`${porcentajeExplicado.toFixed(1)}%`}
              color="text-emerald-700"
              border="border-emerald-100"
            />
            <Kpi
              titulo="Dif. total"
              valor={formatoNumero(resumen.diferenciaTotal)}
              color="text-[#0B4EA2]"
              border="border-[#2F80ED]/25"
            />
          </div>

          <div className="rounded-2xl border border-[#2F80ED]/25 bg-[#EAF4FF] p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#0B4EA2]">
              Regla de lectura
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm font-black text-slate-800 md:grid-cols-5">
              <div className="rounded-xl border border-white/70 bg-white px-4 py-3">
                Movimiento = Plan actual - Plan anterior
              </div>
              <div className="flex items-center justify-center text-xl text-[#0B4EA2]">
                |
              </div>
              <div className="rounded-xl border border-white/70 bg-white px-4 py-3">
                Si reduce, debe coincidir con consumo
              </div>
              <div className="flex items-center justify-center text-xl text-[#0B4EA2]">
                |
              </div>
              <div className="rounded-xl border border-white/70 bg-white px-4 py-3">
                Diferencia por explicar = reduccion - consumo
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h4 className="text-lg font-black text-slate-950">
                  Detalle de variaciones
                </h4>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Mostrando {variacionesFiltradas.length} de {variaciones.length}
                  materiales evaluados.
                </p>
              </div>

              <div className="grid w-full grid-cols-1 gap-3 md:w-auto md:grid-cols-5">
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar material, texto breve, seccion..."
                  className="h-11 min-w-[280px] rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10"
                />

                <select
                  value={filtroDiagnostico}
                  onChange={(e) => setFiltroDiagnostico(e.target.value)}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#0057B8]"
                >
                  <option value="TODOS">Todos los diagnosticos</option>
                  {diagnosticos.map((diag) => (
                    <option key={diag} value={diag}>
                      {diag}
                    </option>
                  ))}
                </select>

                <select
                  value={filtroSeccion}
                  onChange={(e) => setFiltroSeccion(e.target.value)}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#0057B8]"
                >
                  <option value="TODAS">Todas las secciones</option>
                  {secciones.map((seccion) => (
                    <option key={seccion} value={seccion}>
                      {seccion}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setSoloPorExplicar(!soloPorExplicar)}
                  className={`h-11 rounded-xl border px-4 text-sm font-black transition ${
                    soloPorExplicar
                      ? "border-blue-100 bg-blue-50 text-[#0057B8]"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Por explicar
                </button>

                <button
                  onClick={() => {
                    setBusqueda("");
                    setFiltroDiagnostico("TODOS");
                    setFiltroSeccion("TODAS");
                    setSoloPorExplicar(false);
                  }}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  Limpiar
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-[620px] overflow-auto">
                <table className="w-full min-w-[1500px] border-collapse text-sm">
                  <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 text-left font-black">Material</th>
                      <th className="px-4 py-3 text-left font-black">
                        Texto breve del material
                      </th>
                      <th className="px-4 py-3 text-left font-black">Seccion</th>
                      <th className="px-4 py-3 text-right font-black">
                        Plan anterior
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Plan actual
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Movimiento del plan
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Consumo notificado
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Diferencia por explicar
                      </th>
                      <th className="px-4 py-3 text-left font-black">
                        Diagnostico
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {variacionesFiltradas.map((row) => (
                      <tr
                        key={row.codigo}
                        onClick={() => toggleMaterial(row.codigo)}
                        className={`cursor-pointer border-b border-slate-100 transition ${
                          materialSeleccionado === row.codigo
                            ? "bg-[#EAF4FF]"
                            : "bg-white hover:bg-[#fbfbfa]"
                        }`}
                      >
                        <td className="px-4 py-3 font-black text-slate-950">
                          {row.codigo}
                        </td>
                        <td className="max-w-[360px] px-4 py-3 font-medium text-slate-700">
                          {row.material}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-500">
                          {row.seccion || "-"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatoNumero(row.planAnterior)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatoNumero(row.planActual)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-black ${
                            row.movimientoPlan > 0
                              ? "text-[#0057B8]"
                              : row.movimientoPlan < 0
                              ? "text-emerald-700"
                              : "text-slate-500"
                          }`}
                        >
                          {formatoNumero(row.movimientoPlan)}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-[#0B4EA2]">
                          {formatoNumero(row.consumoNotificado)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-black ${
                            Math.abs(row.diferenciaPorExplicar) > 0
                              ? "text-[#0057B8]"
                              : "text-emerald-700"
                          }`}
                        >
                          {formatoNumero(row.diferenciaPorExplicar)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              row.diagnostico === "REDUCCION NO EXPLICADA" ||
                              row.diagnostico === "CONSUMO MAYOR A REDUCCION" ||
                              row.diagnostico === "AUMENTO DE PLAN"
                                ? "bg-blue-50 text-[#0057B8]"
                                : row.diagnostico ===
                                  "REDUCCION EXPLICADA POR CONSUMO"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {row.diagnostico}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {variacionesFiltradas.length === 0 && (
                      <tr>
                        <td
                          colSpan={999}
                          className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                        >
                          No hay variaciones con los filtros seleccionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {seleccionado && (
            <div className="rounded-2xl border border-[#2F80ED]/25 bg-[#EAF4FF] p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-[#0B4EA2]">
                    Detalle semanal del movimiento
                  </p>
                  <h4 className="mt-1 text-xl font-black text-slate-950">
                    {seleccionado.codigo}
                  </h4>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {seleccionado.material}
                  </p>
                </div>

                <button
                  onClick={() => setMaterialSeleccionado("")}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Cerrar detalle
                </button>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-white/70 bg-white">
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3 text-left font-black">Semana</th>
                        <th className="px-4 py-3 text-right font-black">
                          Plan anterior
                        </th>
                        <th className="px-4 py-3 text-right font-black">
                          Plan actual
                        </th>
                        <th className="px-4 py-3 text-right font-black">
                          Movimiento
                        </th>
                        <th className="px-4 py-3 text-left font-black">
                          Lectura
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {seleccionado.semanas.map((sem) => (
                        <tr key={sem.semana} className="border-b border-slate-100">
                          <td className="px-4 py-3 font-black text-slate-950">
                            {sem.semana}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatoNumero(sem.anterior)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatoNumero(sem.actual)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-black ${
                              sem.movimiento > 0
                                ? "text-[#0057B8]"
                                : sem.movimiento < 0
                                ? "text-emerald-700"
                                : "text-slate-500"
                            }`}
                          >
                            {formatoNumero(sem.movimiento)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-600">
                            {sem.movimiento > 0
                              ? "Aumento en esta semana"
                              : sem.movimiento < 0
                              ? "Reduccion en esta semana"
                              : "Sin cambio"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SelectorCarga({
  label,
  value,
  cargas,
  onChange,
}: {
  label: string;
  value: string;
  cargas: SavedLoad[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase text-slate-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-[#0057B8]"
      >
        {cargas.map((carga) => (
          <option key={carga.id} value={carga.id}>
            {new Date(carga.fecha).toLocaleString("es-DO")} - {carga.archivo}
          </option>
        ))}
      </select>
    </div>
  );
}

function Kpi({
  titulo,
  valor,
  color = "text-slate-950",
  border = "border-slate-200",
}: {
  titulo: string;
  valor: string | number;
  color?: string;
  border?: string;
}) {
  return (
    <div className={`rounded-2xl border ${border} bg-white p-5 shadow-sm`}>
      <p className="text-sm font-semibold text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-black ${color}`}>{valor}</p>
    </div>
  );
}
