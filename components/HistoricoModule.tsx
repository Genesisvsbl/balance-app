"use client";

import { useEffect, useState } from "react";
import { obtenerCargas, limpiarCargas } from "@/lib/storage";
import { SavedLoad } from "@/types/balance";

export default function HistoricoModule() {
  const [cargas, setCargas] = useState<SavedLoad[]>([]);

  function cargar() {
    setCargas(obtenerCargas());
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <section className="space-y-5">
      {/* HEADER */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">
              Histórico de análisis
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Cada ejecución de balance se guarda automáticamente.
            </p>
          </div>

          <button
            onClick={() => {
              limpiarCargas();
              cargar();
            }}
            className="rounded-xl border border-[#e30613] px-5 py-3 text-sm font-black text-[#e30613] transition hover:bg-[#e30613] hover:text-white"
          >
            Limpiar histórico
          </button>
        </div>
      </div>

      {/* RESUMEN */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Registros</p>
          <p className="mt-1 text-3xl font-black text-slate-950">
            {cargas.length}
          </p>
        </div>

        <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            Total faltantes
          </p>
          <p className="mt-1 text-3xl font-black text-[#e30613]">
            {cargas.reduce(
              (acc, c) => acc + (c.info?.totalFaltantes || 0),
              0
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            Total sobrantes
          </p>
          <p className="mt-1 text-3xl font-black text-emerald-700">
            {cargas.reduce(
              (acc, c) => acc + (c.info?.totalSobrantes || 0),
              0
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-[#d4a017]/25 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            Último análisis
          </p>
          <p className="mt-1 text-lg font-black text-[#9a6a00]">
            {cargas.length > 0
              ? new Date(cargas[0].fecha).toLocaleDateString("es-DO")
              : "-"}
          </p>
        </div>
      </div>

      {/* TABLA */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="max-h-[550px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left font-black">Fecha</th>
                  <th className="px-4 py-3 text-left font-black">Archivo</th>
                  <th className="px-4 py-3 text-right font-black">
                    Componentes
                  </th>
                  <th className="px-4 py-3 text-right font-black">
                    Faltantes
                  </th>
                  <th className="px-4 py-3 text-right font-black">
                    Sobrantes
                  </th>
                </tr>
              </thead>

              <tbody>
                {cargas.map((carga) => (
                  <tr
                    key={carga.id}
                    className="border-b border-slate-100 bg-white transition hover:bg-[#fbfbfa]"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-700">
                      {new Date(carga.fecha).toLocaleString("es-DO")}
                    </td>

                    <td className="px-4 py-3 font-medium text-slate-700">
                      {carga.archivo}
                    </td>

                    <td className="px-4 py-3 text-right font-black text-slate-950">
                      {carga.info?.totalComponentes || 0}
                    </td>

                    <td className="px-4 py-3 text-right font-black text-[#e30613]">
                      {carga.info?.totalFaltantes || 0}
                    </td>

                    <td className="px-4 py-3 text-right font-black text-emerald-700">
                      {carga.info?.totalSobrantes || 0}
                    </td>
                  </tr>
                ))}

                {cargas.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                    >
                      No hay análisis guardados todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}