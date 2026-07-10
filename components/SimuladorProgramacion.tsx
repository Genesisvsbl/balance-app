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

// Gaylords por vehiculo: preformas 40; el SKU 303845 va de 36.
function gaylordsPorVh(codigo: string) {
  return codigo === "303845" ? 36 : 40;
}

// Unidades por vehiculo por defecto = gaylords x (gaylor/estiba).
function vhBase(row: SimRow) {
  return gaylordsPorVh(row.codigo) * (row.capacidadUnidad || 0);
}

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
  const [diasHabiles, setDiasHabiles] = useState<DiasHabiles>("LV");
  const [vhPorClic, setVhPorClic] = useState(1);
  const [semanasOff, setSemanasOff] = useState<Set<string>>(new Set());
  const [vehiculos, setVehiculos] = useState<Record<string, string>>({});
  // Base editable "1 VH = X unidades" por referencia (para tapas u otros que se manejen distinto).
  const [baseOverride, setBaseOverride] = useState<Record<string, string>>({});

  const anio = new Date().getFullYear();
  const dias = DIAS_SET[diasHabiles];

  const semanasSel = useMemo(() => {
    const sel = semanas.filter((s) => !semanasOff.has(s));
    return sel.length ? sel : semanas;
  }, [semanas, semanasOff]);

  const fechasPorSemana = useMemo(() => {
    const mapa: Record<string, string[]> = {};
    semanasSel.forEach((sem) => {
      mapa[sem] = fechasDeSemana(sem, anio, dias);
    });
    return mapa;
  }, [semanasSel, anio, dias]);

  const vhBasePorCodigo = useMemo(() => {
    const mapa: Record<string, number> = {};
    rows.forEach((row) => {
      const ov = baseOverride[row.codigo];
      mapa[row.codigo] = ov !== undefined && ov !== "" ? numero(ov) : vhBase(row);
    });
    return mapa;
  }, [rows, baseOverride]);

  function clave(codigo: string, fecha: string) {
    return `${codigo}|${fecha}`;
  }

  function vhCelda(codigo: string, fecha: string) {
    return vehiculos[clave(codigo, fecha)] ?? "";
  }

  function setVh(codigo: string, fecha: string, valor: string) {
    setVehiculos((prev) => {
      const copia = { ...prev };
      if (valor === "" || valor === "0") delete copia[clave(codigo, fecha)];
      else copia[clave(codigo, fecha)] = valor;
      return copia;
    });
  }

  function unidadesCelda(codigo: string, fecha: string) {
    return numero(vhCelda(codigo, fecha)) * (vhBasePorCodigo[codigo] || 0);
  }

  function asignadoUnidSemana(codigo: string, sem: string) {
    return (fechasPorSemana[sem] || []).reduce(
      (acc, fecha) => acc + unidadesCelda(codigo, fecha),
      0
    );
  }

  function clicCelda(codigo: string, fecha: string) {
    const actual = numero(vhCelda(codigo, fecha));
    setVh(codigo, fecha, String(actual + vhPorClic));
  }

  function limpiar() {
    setVehiculos({});
  }

  function autollenar() {
    const nuevas: Record<string, string> = {};
    rows.forEach((row) => {
      const base = vhBasePorCodigo[row.codigo] || 0;
      if (base <= 0) return;
      semanasSel.forEach((sem) => {
        const necesidad = row.necesidadesPorSemana[sem] || 0;
        if (necesidad <= 0) return;
        const fechas = fechasPorSemana[sem] || [];
        if (fechas.length === 0) return;
        const vhNecesarios = Math.ceil(necesidad / base);
        const conteo: Record<string, number> = {};
        for (let i = 0; i < vhNecesarios; i++) {
          const fecha = fechas[i % fechas.length];
          conteo[fecha] = (conteo[fecha] || 0) + 1;
        }
        Object.entries(conteo).forEach(([fecha, vh]) => {
          nuevas[clave(row.codigo, fecha)] = String(vh);
        });
      });
    });
    setVehiculos(nuevas);
  }

  function toggleSemana(sem: string) {
    setSemanasOff((prev) => {
      const copia = new Set(prev);
      if (copia.has(sem)) copia.delete(sem);
      else copia.add(sem);
      return copia;
    });
  }

  const totalNecesidad = useMemo(
    () =>
      rows.reduce(
        (acc, row) => acc + semanasSel.reduce((s, sem) => s + (row.necesidadesPorSemana[sem] || 0), 0),
        0
      ),
    [rows, semanasSel]
  );

  const totalProgramado = useMemo(() => {
    let total = 0;
    rows.forEach((row) => {
      semanasSel.forEach((sem) => {
        total += asignadoUnidSemana(row.codigo, sem);
      });
    });
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, semanasSel, vehiculos, fechasPorSemana, vhBasePorCodigo]);

  const totalVh = useMemo(
    () => Object.values(vehiculos).reduce((acc, v) => acc + numero(v), 0),
    [vehiculos]
  );

  if (rows.length === 0) return null;

  const cubreTotal = totalProgramado >= totalNecesidad;

  return (
    <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-black text-slate-950">Simulador de programacion (por vehiculos)</h3>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Cada fila es una referencia y cada columna un dia. Haz clic en el dia para agregar vehiculos. 1 VH = gaylords x gaylor/estiba (preformas 40, SKU 303845 va de 36); el valor de &quot;1 VH&quot; es editable por referencia (las tapas 424220 / 424230 lo pones tu). Puedes pasarte de la necesidad.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-xs font-black uppercase text-slate-500">Semanas</p>
          <div className="flex flex-wrap gap-2">
            {semanas.map((sem) => {
              const activa = !semanasOff.has(sem);
              return (
                <button
                  key={sem}
                  onClick={() => toggleSemana(sem)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-black ${
                    activa
                      ? "border-[#0057B8] bg-blue-50 text-[#0057B8]"
                      : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {sem}
                </button>
              );
            })}
          </div>
        </div>

        <label className="text-xs font-black uppercase text-slate-500">
          Dias habiles
          <select
            value={diasHabiles}
            onChange={(e) => setDiasHabiles(e.target.value as DiasHabiles)}
            className="mt-1 block h-11 rounded-xl border border-blue-100 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#0057B8]"
          >
            <option value="LV">Lunes a viernes</option>
            <option value="LS">Lunes a sabado</option>
            <option value="TODOS">Todos los dias</option>
          </select>
        </label>

        <label className="text-xs font-black uppercase text-slate-500">
          VH por clic
          <input
            type="number"
            min={1}
            value={vhPorClic}
            onChange={(e) => setVhPorClic(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 block h-11 w-24 rounded-xl border border-blue-100 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#0057B8]"
          />
        </label>

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

        <div className="ml-auto rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-bold text-[#003B7A]">
          Necesidad: <span className="text-red-600">{formato(totalNecesidad)}</span>
          {"  ·  "}Programado: <span className="text-[#0057B8]">{formato(totalProgramado)}</span>
          {"  ·  "}VH: <span className="text-slate-900">{formato(totalVh)}</span>
          {"  ·  "}
          <span className={cubreTotal ? "text-emerald-700" : "text-red-600"}>
            {cubreTotal ? "CUBRE" : `Falta ${formato(totalNecesidad - totalProgramado)}`}
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs font-semibold text-slate-500">
        Tip: 1 clic = &quot;VH por clic&quot; vehiculos. Teclea para poner el numero exacto de VH. Doble clic en una celda la borra. Debajo de cada celda ves las unidades de esos vehiculos.
      </p>

      <div className="mt-4 overflow-auto rounded-2xl border border-blue-100">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="bg-blue-200/80 text-[#0B4EA2]">
              <th
                rowSpan={2}
                className="sticky left-0 z-30 min-w-[240px] border-b border-blue-200 bg-blue-200/95 px-3 py-2 text-[11px] font-black uppercase"
              >
                Referencia (1 VH = unid.)
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
            {rows.map((row) => {
              const base = vhBasePorCodigo[row.codigo] || 0;
              return (
                <tr key={row.codigo} className="border-b border-slate-100 hover:bg-blue-50/40">
                  <td className="sticky left-0 z-10 min-w-[240px] bg-white px-3 py-2">
                    <div className="text-[11px] font-black text-slate-950">{row.codigo}</div>
                    <div className="truncate text-[10px] font-semibold text-slate-500" title={row.material}>
                      {row.material}
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-[9px] font-bold text-slate-500">1 VH =</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={baseOverride[row.codigo] ?? String(vhBase(row))}
                        onChange={(e) =>
                          setBaseOverride((prev) => ({
                            ...prev,
                            [row.codigo]: e.target.value.replace(/[^0-9]/g, ""),
                          }))
                        }
                        title="Unidades por vehiculo (editable, sobre todo para tapas)"
                        className="h-6 w-24 rounded border border-blue-100 px-1 text-center text-[10px] font-black text-[#0057B8] outline-none focus:border-[#0057B8]"
                      />
                    </div>
                  </td>
                  {semanasSel.map((sem) => {
                    const necesidad = row.necesidadesPorSemana[sem] || 0;
                    const asignado = asignadoUnidSemana(row.codigo, sem);
                    return (
                      <FragmentRow
                        key={sem}
                        fechas={fechasPorSemana[sem] || []}
                        base={base}
                        necesidad={necesidad}
                        asignado={asignado}
                        vhCelda={(fecha) => vhCelda(row.codigo, fecha)}
                        onClic={(fecha) => clicCelda(row.codigo, fecha)}
                        onChange={(fecha, v) => setVh(row.codigo, fecha, v)}
                        onClear={(fecha) => setVh(row.codigo, fecha, "")}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 text-[#0B4EA2]">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-[11px] font-black uppercase">
                Total por dia (VH / unid.)
              </td>
              {semanasSel.map((sem) => (
                <FragmentFooter
                  key={sem}
                  fechas={fechasPorSemana[sem] || []}
                  vhDia={(fecha) => rows.reduce((acc, row) => acc + numero(vhCelda(row.codigo, fecha)), 0)}
                  unidDia={(fecha) => rows.reduce((acc, row) => acc + unidadesCelda(row.codigo, fecha), 0)}
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
        <th key={fecha} className="min-w-[86px] border-l border-blue-200 px-2 py-2 text-center text-[10px] font-black">
          <div>{diaNombre(fecha)}</div>
          <div className="text-slate-500">{fechaCorta(fecha)}</div>
        </th>
      ))}
      <th className="min-w-[96px] border-l-2 border-blue-300 px-2 py-2 text-center text-[10px] font-black">
        Necesidad / Estado
      </th>
    </>
  );
}

function FragmentRow({
  fechas,
  base,
  necesidad,
  asignado,
  vhCelda,
  onClic,
  onChange,
  onClear,
}: {
  fechas: string[];
  base: number;
  necesidad: number;
  asignado: number;
  vhCelda: (fecha: string) => string;
  onClic: (fecha: string) => void;
  onChange: (fecha: string, valor: string) => void;
  onClear: (fecha: string) => void;
}) {
  const cubre = necesidad > 0 && asignado >= necesidad;
  const sobra = asignado - necesidad;
  return (
    <>
      {fechas.map((fecha) => {
        const vh = vhCelda(fecha);
        const tiene = numero(vh) > 0;
        const unidades = numero(vh) * base;
        return (
          <td key={fecha} className="border-l border-slate-100 px-1 py-1 align-top">
            <input
              type="text"
              inputMode="numeric"
              value={vh}
              title={tiene ? `${formato(unidades)} unid.` : "Clic para agregar VH"}
              onClick={() => onClic(fecha)}
              onDoubleClick={() => onClear(fecha)}
              onChange={(e) => onChange(fecha, e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="+"
              className={`h-8 w-full rounded-lg border px-1 text-center text-[11px] font-black outline-none transition ${
                tiene
                  ? "border-blue-200 bg-blue-50 text-[#0057B8]"
                  : "border-dashed border-slate-200 bg-white text-slate-400 hover:border-[#0057B8] hover:bg-blue-50/40"
              }`}
            />
            <div className="mt-0.5 text-center text-[9px] font-bold text-slate-400">
              {tiene ? formato(unidades) : ""}
            </div>
          </td>
        );
      })}
      <td className="border-l-2 border-blue-200 px-2 py-1 text-center align-top">
        <div className="text-[10px] font-bold text-red-600">{formato(necesidad)}</div>
        {necesidad <= 0 ? (
          <div className="text-[10px] font-black text-slate-300">-</div>
        ) : cubre ? (
          <div className="text-[10px] font-black text-emerald-700">
            CUBRE{sobra > 0 ? ` +${formato(sobra)}` : ""}
          </div>
        ) : (
          <div className="text-[10px] font-black text-red-600">Falta {formato(necesidad - asignado)}</div>
        )}
      </td>
    </>
  );
}

function FragmentFooter({
  fechas,
  vhDia,
  unidDia,
}: {
  fechas: string[];
  vhDia: (fecha: string) => number;
  unidDia: (fecha: string) => number;
}) {
  return (
    <>
      {fechas.map((fecha) => (
        <td key={fecha} className="border-l border-slate-100 px-1 py-2 text-center text-[10px] font-black text-slate-700">
          <div>{formato(vhDia(fecha))} VH</div>
          <div className="text-[9px] font-bold text-slate-400">{formato(unidDia(fecha))}</div>
        </td>
      ))}
      <td className="border-l-2 border-blue-200 px-2 py-2" />
    </>
  );
}
