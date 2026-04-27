"use client";

import { useEffect, useMemo, useState } from "react";
import { obtenerCargas } from "@/lib/storage";
import { SavedLoad } from "@/types/balance";
import { formatoNumero } from "@/lib/format";

type VariacionRow = {
  codigo: string;
  material: string;
  seccion: string;
  necesidadAntes: number;
  necesidadAhora: number;
  diferenciaAntes: number;
  diferenciaAhora: number;
  variacionNecesidad: number;
  variacionDiferencia: number;
  estadoAntes: string;
  estadoAhora: string;
  tipoCambio: string;
};

export default function VariacionModule() {
  const [cargas, setCargas] = useState<SavedLoad[]>([]);
  const [cargaAntesId, setCargaAntesId] = useState("");
  const [cargaAhoraId, setCargaAhoraId] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    const data = obtenerCargas();
    setCargas(data);

    if (data.length >= 2) {
      setCargaAhoraId(data[0].id);
      setCargaAntesId(data[1].id);
    }
  }, []);

  const cargaAntes = cargas.find((c) => c.id === cargaAntesId);
  const cargaAhora = cargas.find((c) => c.id === cargaAhoraId);

  const variaciones = useMemo(() => {
    if (!cargaAntes || !cargaAhora) return [];

    const mapaAntes = new Map(
      cargaAntes.analisis.map((row) => [row.codigo, row])
    );

    const mapaAhora = new Map(
      cargaAhora.analisis.map((row) => [row.codigo, row])
    );

    const codigos = new Set([
      ...Array.from(mapaAntes.keys()),
      ...Array.from(mapaAhora.keys()),
    ]);

    const resultado: VariacionRow[] = [];

    codigos.forEach((codigo) => {
      const antes = mapaAntes.get(codigo);
      const ahora = mapaAhora.get(codigo);

      const necesidadAntes = antes?.totalNecesidad || 0;
      const necesidadAhora = ahora?.totalNecesidad || 0;

      const diferenciaAntes = antes?.diferenciaTotal || 0;
      const diferenciaAhora = ahora?.diferenciaTotal || 0;

      const estadoAntes = antes?.estado || "NO EXISTÍA";
      const estadoAhora = ahora?.estado || "ELIMINADO";

      let tipoCambio = "SIN CAMBIO";

      if (!antes && ahora) tipoCambio = "NUEVO MATERIAL";
      else if (antes && !ahora) tipoCambio = "MATERIAL ELIMINADO";
      else if (estadoAntes !== "FALTANTE" && estadoAhora === "FALTANTE")
        tipoCambio = "FALTANTE NUEVO";
      else if (estadoAntes === "FALTANTE" && estadoAhora !== "FALTANTE")
        tipoCambio = "FALTANTE CORREGIDO";
      else if (necesidadAhora > necesidadAntes) tipoCambio = "NECESIDAD AUMENTÓ";
      else if (necesidadAhora < necesidadAntes) tipoCambio = "NECESIDAD BAJÓ";
      else if (diferenciaAhora < diferenciaAntes) tipoCambio = "EMPEORÓ";
      else if (diferenciaAhora > diferenciaAntes) tipoCambio = "MEJORÓ";

      resultado.push({
        codigo,
        material: ahora?.material || antes?.material || "",
        seccion: ahora?.seccion || antes?.seccion || "",
        necesidadAntes,
        necesidadAhora,
        diferenciaAntes,
        diferenciaAhora,
        variacionNecesidad: necesidadAhora - necesidadAntes,
        variacionDiferencia: diferenciaAhora - diferenciaAntes,
        estadoAntes,
        estadoAhora,
        tipoCambio,
      });
    });

    return resultado.sort((a, b) => {
      const prioridad = [
        "FALTANTE NUEVO",
        "EMPEORÓ",
        "NECESIDAD AUMENTÓ",
        "NUEVO MATERIAL",
        "FALTANTE CORREGIDO",
        "MEJORÓ",
        "NECESIDAD BAJÓ",
        "MATERIAL ELIMINADO",
        "SIN CAMBIO",
      ];

      return prioridad.indexOf(a.tipoCambio) - prioridad.indexOf(b.tipoCambio);
    });
  }, [cargaAntes, cargaAhora]);

  const variacionesFiltradas = variaciones.filter((row) => {
    const texto = busqueda.toLowerCase().trim();

    const coincideTexto =
      texto === "" ||
      row.codigo.toLowerCase().includes(texto) ||
      row.material.toLowerCase().includes(texto) ||
      row.seccion.toLowerCase().includes(texto) ||
      row.tipoCambio.toLowerCase().includes(texto);

    const coincideTipo =
      filtroTipo === "TODOS" || row.tipoCambio === filtroTipo;

    return coincideTexto && coincideTipo;
  });

  const tipos = Array.from(new Set(variaciones.map((v) => v.tipoCambio)));

  const faltantesNuevos = variaciones.filter(
    (v) => v.tipoCambio === "FALTANTE NUEVO"
  ).length;

  const corregidos = variaciones.filter(
    (v) => v.tipoCambio === "FALTANTE CORREGIDO"
  ).length;

  const empeoraron = variaciones.filter(
    (v) => v.tipoCambio === "EMPEORÓ" || v.tipoCambio === "NECESIDAD AUMENTÓ"
  ).length;

  const mejoraron = variaciones.filter(
    (v) => v.tipoCambio === "MEJORÓ" || v.tipoCambio === "NECESIDAD BAJÓ"
  ).length;

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">
              Variaciones entre análisis
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Compara dos cargas guardadas y detecta cambios de necesidad,
              faltantes nuevos y correcciones.
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
              <div>
                <label className="mb-2 block text-xs font-black uppercase text-slate-500">
                  Carga anterior
                </label>
                <select
                  value={cargaAntesId}
                  onChange={(e) => setCargaAntesId(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-[#e30613]"
                >
                  {cargas.map((carga) => (
                    <option key={carga.id} value={carga.id}>
                      {new Date(carga.fecha).toLocaleString("es-DO")} ·{" "}
                      {carga.archivo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase text-slate-500">
                  Carga actual
                </label>
                <select
                  value={cargaAhoraId}
                  onChange={(e) => setCargaAhoraId(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-[#e30613]"
                >
                  {cargas.map((carga) => (
                    <option key={carga.id} value={carga.id}>
                      {new Date(carga.fecha).toLocaleString("es-DO")} ·{" "}
                      {carga.archivo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">
                Faltantes nuevos
              </p>
              <p className="mt-1 text-3xl font-black text-[#e30613]">
                {faltantesNuevos}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">
                Faltantes corregidos
              </p>
              <p className="mt-1 text-3xl font-black text-emerald-700">
                {corregidos}
              </p>
            </div>

            <div className="rounded-2xl border border-[#d4a017]/25 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">
                Empeoraron
              </p>
              <p className="mt-1 text-3xl font-black text-[#9a6a00]">
                {empeoraron}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">
                Mejoraron
              </p>
              <p className="mt-1 text-3xl font-black text-slate-950">
                {mejoraron}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h4 className="text-lg font-black text-slate-950">
                  Detalle de variaciones
                </h4>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Mostrando {variacionesFiltradas.length} de{" "}
                  {variaciones.length} cambios.
                </p>
              </div>

              <div className="grid w-full grid-cols-1 gap-3 md:w-auto md:grid-cols-3">
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar componente, material, sección..."
                  className="h-11 min-w-[320px] rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-[#e30613]/10"
                />

                <select
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#e30613]"
                >
                  <option value="TODOS">Todos los cambios</option>
                  {tipos.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setBusqueda("");
                    setFiltroTipo("TODOS");
                  }}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  Limpiar filtros
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-[620px] overflow-auto">
                <table className="w-full min-w-[1400px] border-collapse text-sm">
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
                        Necesidad antes
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Necesidad ahora
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Var. necesidad
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Dif. antes
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Dif. ahora
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Var. diferencia
                      </th>
                      <th className="px-4 py-3 text-left font-black">
                        Cambio
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {variacionesFiltradas.map((row, i) => (
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
                          {row.seccion || "-"}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold">
                          {formatoNumero(row.necesidadAntes)}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold">
                          {formatoNumero(row.necesidadAhora)}
                        </td>

                        <td
                          className={`px-4 py-3 text-right font-black ${
                            row.variacionNecesidad > 0
                              ? "text-[#e30613]"
                              : row.variacionNecesidad < 0
                              ? "text-emerald-700"
                              : "text-slate-500"
                          }`}
                        >
                          {formatoNumero(row.variacionNecesidad)}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold">
                          {formatoNumero(row.diferenciaAntes)}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold">
                          {formatoNumero(row.diferenciaAhora)}
                        </td>

                        <td
                          className={`px-4 py-3 text-right font-black ${
                            row.variacionDiferencia < 0
                              ? "text-[#e30613]"
                              : row.variacionDiferencia > 0
                              ? "text-emerald-700"
                              : "text-slate-500"
                          }`}
                        >
                          {formatoNumero(row.variacionDiferencia)}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              row.tipoCambio === "FALTANTE NUEVO" ||
                              row.tipoCambio === "EMPEORÓ" ||
                              row.tipoCambio === "NECESIDAD AUMENTÓ"
                                ? "bg-red-50 text-[#e30613]"
                                : row.tipoCambio === "FALTANTE CORREGIDO" ||
                                  row.tipoCambio === "MEJORÓ" ||
                                  row.tipoCambio === "NECESIDAD BAJÓ"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {row.tipoCambio}
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
        </>
      )}
    </section>
  );
}