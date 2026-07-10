"use client";

import { useMemo, useState } from "react";

export type SimRow = {
  codigo: string;
  material: string;
  um: string;
  necesidadesPorSemana: Record<string, number>;
  capacidadVehiculo: number;
  capacidadUnidad: number;
};

type Props = {
  rows: SimRow[];
  semanas: string[];
};

type DiasHabiles = "LV" | "LS" | "TODOS";

const DIAS_SET: Record<DiasHabiles, number[]> = {
  LV: [1, 2, 3, 4, 5],
  LS: [1, 2, 3, 4, 5, 6],
  TODOS: [1, 2, 3, 4, 5, 6, 0],
};

const NOMBRE_DIA = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

function formato(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("en-US");
}

function numero(value: string) {
  const limpio = value.replace(/[^0-9.-]/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

function numeroSemana(sem: string) {
  const match = sem.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function lunesSemanaISO(week: number, year: number) {
  const enero4 = new Date(Date.UTC(year, 0, 4));
  const diaSemana = enero4.getUTCDay() || 7;
  const lunesSemana1 = new Date(enero4);
  lunesSemana1.setUTCDate(enero4.getUTCDate() - (diaSemana - 1));
  const lunes = new Date(lunesSemana1);
  lunes.setUTCDate(lunesSemana1.getUTCDate() + (week - 1) * 7);
  return lunes;
}

function claveFecha(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fechaCorta(clave: string) {
  const d = new Date(`${clave}T00:00:00Z`);
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

function diaNombre(clave: string) {
  const d = new Date(`${clave}T00:00:00Z`);
  return NOMBRE_DIA[d.getUTCDay()];
}

function fechasDeSemana(sem: string, year: number, dias: number[]) {
  const lunes = lunesSemanaISO(numeroSemana(sem), year);
  const resultado: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setUTCDate(lunes.getUTCDate() + i);
    if (dias.includes(d.getUTCDay())) resultado.push(claveFecha(d));
  }
  return resultado;
}

export default function SimuladorProgramacion({ rows, semanas }: Props) {
  const [numSemanas, setNumSemanas] = useState(1);
  const [diasHabiles, setDiasHabiles] = useState<DiasHabiles>("LV");
  const [cantidadPorClic, setCantidadPorClic] = useState(1000000);
  const [asignaciones, setAsignaciones] = useState<Record<string, string>>({});

  const anio = new Date().getFullYear();
  const dias = DIAS_SET[diasHabiles];

  const semanasSel = useMemo(
    () => semanas.slice(0, Math.max(1, Math.min(numSemanas, semanas.length))),
    [semanas, numSemanas]
  );

  const fechasPorSemana = useMemo(() => {
    const mapa: Record<string, string[]> = {};
    semanasSel.forEach((sem) => {
      mapa[sem] = fechasDeSemana(sem, anio, dias);
    });
    return mapa;
  }, [semanasSel, anio, dias]);

  function clave(codigo: string, fecha: string) {
    return `${codigo}|${fecha}`;
  }

  function valorCelda(codigo: string, fecha: string) {
    return asignaciones[clave(codigo, fecha)] ?? "";
  }

  function setCelda(codigo: string, fecha: string, valor: string) {
    setAsignaciones((prev) => {
      const copia = { ...prev };
      if (valor === "" || valor === "0") delete copia[clave(codigo, fecha)];
      else copia[clave(codigo, fecha)] = valor;
      return copia;
    });
  }

  function asignadoSemana(codigo: string, sem: string) {
    return (fechasPorSemana[sem] || []).reduce(
      (acc, fecha) => acc + numero(valorCelda(codigo, fecha)),
      0
    );
  }

  function faltaSemana(row: SimRow, sem: string) {
    const necesidad = row.necesidadesPorSemana[sem] || 0;
    return necesidad - asignadoSemana(row.codigo, sem);
  }

  function clicCelda(row: SimRow, sem: string, fecha: string) {
    const actual = numero(valorCelda(row.codigo, fecha));
    if (actual > 0) return;
    const falta = faltaSemana(row, sem);
    if (falta <= 0) return;
    const cantidad = Math.min(falta, cantidadPorClic);
    setCelda(row.codigo, fecha, String(Math.round(cantidad)));
  }

  function limpiar() {
    setAsignaciones({});
  }

  function autollenar() {
    const nuevas: Record<string, string> = {};
    rows.forEach((row) => {
      semanasSel.forEach((sem) => {
        let restante = row.necesidadesPorSemana[sem] || 0;
        if (restante <= 0) return;
        const fechas = fechasPorSemana[sem] || [];
        for (let i = 0; i < fechas.length && restante > 0; i++) {
          const cantidad = Math.min(cantidadPorClic, restante);
          nuevas[clave(row.codigo, fechas[i])] = String(Math.round(cantidad));
          restante -= cantidad;
        }
      });
    });
    setAsignaciones(nuevas);
  }

  const totalNecesidad = useMemo(
    () =>
      rows.reduce(
        (acc, row) =>
          acc + semanasSel.reduce((s, sem) => s + (row.necesidadesPorSemana[sem] || 0), 0),
        0
      ),
    [rows, semanasSel]
  );

  const totalAsignado = useMemo(
    () => Object.entries(asignaciones).reduce((acc, [, v]) => acc + numero(v), 0),
    [asignaciones]
  );

  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-black text-slate-950">Simulador de programacion</h3>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Elige cuantas semanas planear. Haz clic en el dia donde quieres que llegue cada referencia (o teclea la cantidad). Cada fila es un material y cada columna un dia.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[auto_auto_auto_1fr_auto]">
        <label className="text-xs font-black uppercase text-slate-500">
          Semanas a planear
          <select
            value={numSemanas}
            onChange={(e) => setNumSemanas(Number(e.target.value))}
            className="mt-1 h-11 w-full rounded-xl border border-blue-100 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#0057B8]"
          >
            {semanas.map((_, i) => (
              <option key={i} value={i + 1}>
                {i + 1} {i === 0 ? "semana" : "semanas"}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-black uppercase text-slate-500">
          Dias habiles
          <select
            value={diasHabiles}
            onChange={(e) => setDiasHabiles(e.target.value as DiasHabiles)}
            className="mt-1 h-11 w-full rounded-xl border border-blue-100 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#0057B8]"
          >
            <option value="LV">Lunes a viernes</option>
            <option value="LS">Lunes a sabado</option>
            <option value="TODOS">Todos los dias</option>
          </select>
        </label>

        <label className="text-xs font-black uppercase text-slate-500">
          Cantidad por clic
          <input
            type="number"
            min={1}
            value={cantidadPorClic}
            onChange={(e) => setCantidadPorClic(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 h-11 w-full rounded-xl border border-blue-100 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#0057B8]"
          />
        </label>

        <div className="flex items-end">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-[#003B7A]">
            Necesidad total: <span className="text-red-600">{formato(totalNecesidad)}</span>
            {"  ·  "}
            Asignado: <span className="text-[#0057B8]">{formato(totalAsignado)}</span>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <button
            onClick={autollenar}
            className="h-11 rounded-xl bg-[#0057B8] px-5 text-sm font-black text-white shadow-md transition hover:bg-[#003B7A]"
          >
            Autollenar
          </button>
          <button
            onClick={limpiar}
            className="h-11 rounded-xl border border-blue-200 px-5 text-sm font-black text-[#0057B8]"
          >
            Limpiar
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs font-semibold text-slate-500">
        Tip: un clic coloca la cantidad por clic (o lo que falte). Teclea para ajustar. Baja la cantidad por clic para repartir en camiones por dia. Autollenar reparte todo automaticamente.
      </p>

      <div className="mt-4 overflow-auto rounded-2xl border border-blue-100">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="bg-blue-200/80 text-[#0B4EA2]">
              <th
                rowSpan={2}
                className="sticky left-0 z-30 min-w-[250px] border-b border-blue-200 bg-blue-200/95 px-3 py-2 text-[11px] font-black uppercase"
              >
                Referencia
              </th>
              {semanasSel.map((sem) => (
                <th
                  key={sem}
                  colSpan={(fechasPorSemana[sem]?.length || 0) + 1}
                  className="border-b border-l border-blue-300 px-3 py-2 text-center text-[11px] font-black uppercase"
                >
                  {sem}
                </th>
              ))}
            </tr>
            <tr className="bg-blue-100 text-[#0B4EA2]">
              {semanasSel.map((sem) => (
                <FragmentHeader key={sem} fechas={fechasPorSemana[sem] || []} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.codigo} className="border-b border-slate-100 hover:bg-blue-50/40">
                <td className="sticky left-0 z-10 min-w-[250px] bg-white px-3 py-2">
                  <div className="text-[11px] font-black text-slate-950">{row.codigo}</div>
                  <div className="truncate text-[10px] font-semibold text-slate-500" title={row.material}>
                    {row.material}
                  </div>
                </td>
                {semanasSel.map((sem) => {
                  const necesidad = row.necesidadesPorSemana[sem] || 0;
                  const falta = faltaSemana(row, sem);
                  const cubre = necesidad > 0 && falta <= 0;
                  return (
                    <FragmentRow
                      key={sem}
                      fechas={fechasPorSemana[sem] || []}
                      necesidad={necesidad}
                      falta={falta}
                      cubre={cubre}
                      valorCelda={(fecha) => valorCelda(row.codigo, fecha)}
                      onClic={(fecha) => clicCelda(row, sem, fecha)}
                      onChange={(fecha, v) => setCelda(row.codigo, fecha, v)}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 text-[#0B4EA2]">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-[11px] font-black uppercase">
                Total por dia
              </td>
              {semanasSel.map((sem) => (
                <FragmentFooter
                  key={sem}
                  fechas={fechasPorSemana[sem] || []}
                  totalDia={(fecha) =>
                    rows.reduce((acc, row) => acc + numero(valorCelda(row.codigo, fecha)), 0)
                  }
                />
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function FragmentHeader({ fechas }: { fechas: string[] }) {
  return (
    <>
      {fechas.map((fecha) => (
        <th key={fecha} className="min-w-[92px] border-l border-blue-200 px-2 py-2 text-center text-[10px] font-black">
          <div>{diaNombre(fecha)}</div>
          <div className="text-slate-500">{fechaCorta(fecha)}</div>
        </th>
      ))}
      <th className="min-w-[90px] border-l-2 border-blue-300 px-2 py-2 text-center text-[10px] font-black">
        Necesidad / Falta
      </th>
    </>
  );
}

function FragmentRow({
  fechas,
  necesidad,
  falta,
  cubre,
  valorCelda,
  onClic,
  onChange,
}: {
  fechas: string[];
  necesidad: number;
  falta: number;
  cubre: boolean;
  valorCelda: (fecha: string) => string;
  onClic: (fecha: string) => void;
  onChange: (fecha: string, valor: string) => void;
}) {
  return (
    <>
      {fechas.map((fecha) => {
        const valor = valorCelda(fecha);
        const tiene = numero(valor) > 0;
        return (
          <td key={fecha} className="border-l border-slate-100 px-1 py-1">
            <input
              type="text"
              inputMode="numeric"
              value={valor}
              onClick={() => onClic(fecha)}
              onChange={(e) => onChange(fecha, e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="+"
              className={`h-9 w-full rounded-lg border px-1 text-center text-[11px] font-black outline-none transition ${
                tiene
                  ? "border-blue-200 bg-blue-50 text-[#0057B8]"
                  : "border-dashed border-slate-200 bg-white text-slate-400 hover:border-[#0057B8] hover:bg-blue-50/40"
              }`}
            />
          </td>
        );
      })}
      <td className="border-l-2 border-blue-200 px-2 py-1 text-center">
        <div className="text-[10px] font-bold text-red-600">{formato(necesidad)}</div>
        <div
          className={`text-[10px] font-black ${
            necesidad <= 0 ? "text-slate-300" : cubre ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {necesidad <= 0 ? "-" : cubre ? "OK" : `Falta ${formato(falta)}`}
        </div>
      </td>
    </>
  );
}

function FragmentFooter({ fechas, totalDia }: { fechas: string[]; totalDia: (fecha: string) => number }) {
  return (
    <>
      {fechas.map((fecha) => (
        <td key={fecha} className="border-l border-slate-100 px-1 py-2 text-center text-[10px] font-black text-slate-700">
          {formato(totalDia(fecha))}
        </td>
      ))}
      <td className="border-l-2 border-blue-200 px-2 py-2" />
    </>
  );
}
