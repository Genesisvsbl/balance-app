"use client";

import { ExcelData } from "@/types/balance";
import { leerArchivosExcel } from "@/lib/excel";
import { formatearValor } from "@/lib/format";
import { useState } from "react";

type Props = {
  datos: ExcelData;
  setDatos: (datos: ExcelData) => void;
  hojasEncontradas: string[];
  setHojasEncontradas: (hojas: string[]) => void;
  hojaActiva: string;
  setHojaActiva: (hoja: string) => void;
  setArchivoNombre: (nombre: string) => void;
};

export default function ImportModule({
  datos,
  setDatos,
  hojasEncontradas,
  setHojasEncontradas,
  hojaActiva,
  setHojaActiva,
  setArchivoNombre,
}: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [balanceNombre, setBalanceNombre] = useState("");
  const [planNombre, setPlanNombre] = useState("");

  async function cargarArchivo(
    e: React.ChangeEvent<HTMLInputElement>,
    tipo: "balance" | "plan"
  ) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    const resultado = await leerArchivosExcel([archivo]);
    const combinado = { ...datos, ...resultado };
    const hojas = Object.keys(combinado);
    const nuevoBalance = tipo === "balance" ? archivo.name : balanceNombre;
    const nuevoPlan = tipo === "plan" ? archivo.name : planNombre;

    if (tipo === "balance") setBalanceNombre(archivo.name);
    if (tipo === "plan") setPlanNombre(archivo.name);

    setDatos(combinado);
    setHojasEncontradas(hojas);
    setHojaActiva(hojaActiva || hojas[0] || "");
    setArchivoNombre(
      [nuevoBalance, nuevoPlan].filter(Boolean).join(" + ") || archivo.name
    );
    e.target.value = "";
  }

  const hoja = datos[hojaActiva];
  const columnas = Object.keys(hoja?.datos?.[0] || {});

  const datosFiltrados =
    hoja?.datos?.filter((fila: any) => {
      const texto = busqueda.toLowerCase().trim();
      if (!texto) return true;

      return Object.values(fila).some((valor) =>
        String(valor ?? "").toLowerCase().includes(texto)
      );
    }) || [];

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">
              Importacion / Bases de datos
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Carga el Balance y, cuando lo necesites, carga tambien el Plan de
              Recibo. Ambos quedan unidos para el analisis.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="cursor-pointer rounded-xl bg-[#0057B8] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#003B7A]">
              Cargar Balance
              <input
                type="file"
                accept=".xlsx,.xlsm,.xls"
                onChange={(e) => cargarArchivo(e, "balance")}
                className="hidden"
              />
            </label>

            <label className="cursor-pointer rounded-xl bg-[#2F80ED] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#1D4ED8]">
              Cargar Plan de Recibo
              <input
                type="file"
                accept=".xlsx,.xlsm,.xls"
                onChange={(e) => cargarArchivo(e, "plan")}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {(balanceNombre || planNombre) && (
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            <ArchivoEstado titulo="Balance" nombre={balanceNombre} />
            <ArchivoEstado titulo="Plan de Recibo" nombre={planNombre} />
          </div>
        )}
      </div>

      {hojasEncontradas.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Hojas</p>
            <p className="mt-1 text-3xl font-black text-slate-950">
              {hojasEncontradas.length}
            </p>
          </div>

          <div className="rounded-2xl border border-[#2F80ED]/25 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Hoja activa</p>
            <p className="mt-1 truncate text-2xl font-black text-[#0B4EA2]">
              {hojaActiva || "-"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Filas</p>
            <p className="mt-1 text-3xl font-black text-slate-950">
              {hoja?.filas || 0}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Columnas</p>
            <p className="mt-1 text-3xl font-black text-slate-950">
              {columnas.length}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Estado</p>
            <p className="mt-1 text-2xl font-black text-emerald-700">
              Cargado
            </p>
          </div>
        </div>
      )}

      {hojasEncontradas.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h4 className="text-lg font-black text-slate-950">
                Bases detectadas
              </h4>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Selecciona una hoja para visualizar su informacion.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {hojasEncontradas.map((hoja) => (
                <button
                  key={hoja}
                  onClick={() => {
                    setHojaActiva(hoja);
                    setBusqueda("");
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-black transition ${
                    hojaActiva === hoja
                      ? "bg-[#0057B8] text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {hoja}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {hoja && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h4 className="text-lg font-black text-slate-950">
                {hoja.nombreReal}
              </h4>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Mostrando {datosFiltrados.length} de {hoja.datos.length} filas.
              </p>
            </div>

            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en esta base..."
              className="h-11 min-w-[360px] rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10"
            />
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="max-h-[650px] overflow-auto">
              <table className="w-full min-w-[1200px] border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    {columnas.map((columna) => (
                      <th
                        key={columna}
                        className="px-4 py-3 text-left font-black"
                      >
                        {columna}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {datosFiltrados.map((fila: any, index: number) => (
                    <tr
                      key={index}
                      className="border-b border-slate-100 bg-white transition hover:bg-[#fbfbfa]"
                    >
                      {columnas.map((columna) => (
                        <td
                          key={columna}
                          className="max-w-[320px] px-4 py-3 text-sm font-medium text-slate-700"
                        >
                          {formatearValor(fila[columna])}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {datosFiltrados.length === 0 && (
                    <tr>
                      <td
                        colSpan={999}
                        className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                      >
                        No hay datos con la busqueda seleccionada.
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

function ArchivoEstado({ titulo, nombre }: { titulo: string; nombre: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-[#fbfbfa] px-4 py-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {titulo}
      </p>
      <p
        className={`mt-1 truncate text-sm font-black ${
          nombre ? "text-emerald-700" : "text-slate-400"
        }`}
      >
        {nombre || "Pendiente"}
      </p>
    </div>
  );
}
