"use client";

import { useEffect, useState } from "react";
import { obtenerCargas, limpiarCargas, eliminarCarga } from "@/lib/storage";
import { SavedLoad } from "@/types/balance";

type Props = {
  onLoad: (data: SavedLoad) => void;
};

export default function HistoricoModule({ onLoad }: Props) {
  const [cargas, setCargas] = useState<SavedLoad[]>([]);
  const [busqueda, setBusqueda] = useState("");

  function cargar() {
    setCargas(obtenerCargas());
  }

  useEffect(() => {
    cargar();
  }, []);

  const filtradas = cargas.filter((carga) => {
    const texto = busqueda.toLowerCase().trim();

    if (!texto) return true;

    const fecha = new Date(carga.fecha).toLocaleString("es-DO");

    return (
      carga.archivo.toLowerCase().includes(texto) ||
      fecha.toLowerCase().includes(texto)
    );
  });

  function cargarBalance(carga: SavedLoad) {
    onLoad(carga);
  }

  function borrarUno(id: string) {
    const confirmar = confirm(
      "¿Seguro que deseas eliminar este balance guardado?"
    );
    if (!confirmar) return;

    eliminarCarga(id);
    cargar();
  }

  function borrarTodo() {
    const confirmar = confirm("¿Seguro que deseas limpiar todo el histórico?");
    if (!confirmar) return;

    limpiarCargas();
    cargar();
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">
              Histórico de balances
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Consulta, filtra, carga o elimina balances guardados por fecha y
              hora.
            </p>
          </div>

          <button
            onClick={borrarTodo}
            className="rounded-xl border border-[#e30613] px-5 py-3 text-sm font-black text-[#e30613] transition hover:bg-[#e30613] hover:text-white"
          >
            Limpiar histórico
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            Balances guardados
          </p>
          <p className="mt-1 text-3xl font-black text-slate-950">
            {cargas.length}
          </p>
        </div>

        <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            Total faltantes
          </p>
          <p className="mt-1 text-3xl font-black text-[#e30613]">
            {cargas.reduce((acc, c) => acc + (c.info?.totalFaltantes || 0), 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            Total sobrantes
          </p>
          <p className="mt-1 text-3xl font-black text-emerald-700">
            {cargas.reduce((acc, c) => acc + (c.info?.totalSobrantes || 0), 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#d4a017]/25 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Último balance</p>
          <p className="mt-1 text-lg font-black text-[#9a6a00]">
            {cargas.length > 0
              ? new Date(cargas[0].fecha).toLocaleString("es-DO")
              : "-"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h4 className="text-lg font-black text-slate-950">
              Balances guardados
            </h4>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Mostrando {filtradas.length} de {cargas.length} registros.
            </p>
          </div>

          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por fecha, hora o nombre..."
            className="h-11 min-w-[360px] rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-[#e30613]/10"
          />
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left font-black">Fecha</th>
                  <th className="px-4 py-3 text-left font-black">Nombre</th>
                  <th className="px-4 py-3 text-right font-black">
                    Componentes
                  </th>
                  <th className="px-4 py-3 text-right font-black">
                    Faltantes
                  </th>
                  <th className="px-4 py-3 text-right font-black">
                    Sobrantes
                  </th>
                  <th className="px-4 py-3 text-right font-black">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filtradas.map((carga) => (
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

                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => cargarBalance(carga)}
                          className="rounded-lg bg-[#e30613] px-3 py-2 text-xs font-black text-white transition hover:bg-[#b8000f]"
                        >
                          Ver
                        </button>

                        <button
                          onClick={() => borrarUno(carga.id)}
                          className="rounded-lg border border-[#e30613]/30 px-3 py-2 text-xs font-black text-[#e30613] hover:bg-red-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtradas.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                    >
                      No hay balances guardados con esa búsqueda.
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