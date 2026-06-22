"use client";

import { useEffect, useState } from "react";
import { obtenerCargas, limpiarCargas, eliminarCarga } from "@/lib/storage";
import { SavedLoad } from "@/types/balance";

const CLAVE_AVAL = "balance2026";

type Props = {
  onLoad: (data: SavedLoad) => void;
};

type AvalPendiente =
  | {
      tipo: "uno";
      id: string;
      titulo: string;
      mensaje: string;
    }
  | {
      tipo: "todo";
      titulo: string;
      mensaje: string;
    };

export default function HistoricoModule({ onLoad }: Props) {
  const [cargas, setCargas] = useState<SavedLoad[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [avalPendiente, setAvalPendiente] = useState<AvalPendiente | null>(null);
  const [claveAval, setClaveAval] = useState("");
  const [errorAval, setErrorAval] = useState("");
  const [procesandoAval, setProcesandoAval] = useState(false);

  async function cargar() {
    try {
      const data = await obtenerCargas();
      setCargas(data);
      return data;
    } catch (error: any) {
      alert(error.message || "No se pudo cargar el historico.");
      return [];
    }
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

  function cerrarAval() {
    if (procesandoAval) return;
    setAvalPendiente(null);
    setClaveAval("");
    setErrorAval("");
  }

  function pedirAvalBorrado(carga: SavedLoad) {
    setAvalPendiente({
      tipo: "uno",
      id: carga.id,
      titulo: "Borrar balance guardado",
      mensaje: `Vas a borrar definitivamente "${carga.archivo}".`,
    });
    setClaveAval("");
    setErrorAval("");
  }

  function pedirAvalLimpiar() {
    setAvalPendiente({
      tipo: "todo",
      titulo: "Limpiar historico",
      mensaje: "Vas a borrar todos los balances guardados del historico.",
    });
    setClaveAval("");
    setErrorAval("");
  }

  async function confirmarAval() {
    if (!avalPendiente) return;

    if (claveAval.trim() !== CLAVE_AVAL) {
      setErrorAval("Clave incorrecta. No se realizo ningun borrado.");
      return;
    }

    setProcesandoAval(true);
    setErrorAval("");

    try {
      if (avalPendiente.tipo === "uno") {
        setCargas((actual) =>
          actual.filter((carga) => carga.id !== avalPendiente.id)
        );
        await eliminarCarga(avalPendiente.id);
      } else {
        setCargas([]);
        await limpiarCargas();
      }

      setBusqueda("");
      await cargar();
      cerrarAval();
    } catch (error: any) {
      setErrorAval(error.message || "No se pudo completar el borrado.");
    } finally {
      setProcesandoAval(false);
    }
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
            onClick={pedirAvalLimpiar}
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

        <div className="rounded-2xl border border-[#2F80ED]/25 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Último balance</p>
          <p className="mt-1 text-lg font-black text-[#0B4EA2]">
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
            name="balance-history-search"
            autoComplete="off"
            className="h-11 min-w-[360px] rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10"
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
                          className="rounded-lg bg-[#0057B8] px-3 py-2 text-xs font-black text-white transition hover:bg-[#003B7A]"
                        >
                          Ver
                        </button>

                        <button
                          onClick={() => pedirAvalBorrado(carga)}
                          className="rounded-lg border border-[#e30613]/30 px-3 py-2 text-xs font-black text-[#e30613] hover:bg-red-50"
                          title="Borrar balance"
                        >
                          Borrar
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

      {avalPendiente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-[#F8FAFC] px-6 py-5">
              <p className="text-xs font-black uppercase tracking-wide text-[#0B4EA2]">
                Confirmacion requerida
              </p>
              <h3 className="mt-1 text-xl font-black text-slate-950">
                {avalPendiente.titulo}
              </h3>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                {avalPendiente.mensaje}
              </p>
            </div>

            <div className="space-y-3 px-6 py-5">
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-[#e30613]">
                Esta accion no se puede deshacer. Ingresa la clave de aval para continuar.
              </div>

              <label className="text-xs font-black uppercase text-slate-500">
                Clave de acceso
              </label>
              <input
                value={claveAval}
                onChange={(e) => {
                  setClaveAval(e.target.value);
                  setErrorAval("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmarAval();
                  if (e.key === "Escape") cerrarAval();
                }}
                type="password"
                autoFocus
                placeholder="Ingresa la clave de aval"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold outline-none transition focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10"
              />

              {errorAval && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-[#e30613]">
                  {errorAval}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-[#F8FAFC] px-6 py-4">
              <button
                onClick={cerrarAval}
                disabled={procesandoAval}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarAval}
                disabled={procesandoAval}
                className="rounded-xl bg-[#e30613] px-5 py-2.5 text-sm font-black text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {procesandoAval ? "Procesando..." : "Confirmar borrado"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
