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

function esPreforma(row: SimRow) {
  return `${row.codigo} ${row.material}`.toLowerCase().includes("preforma");
}

// 1 VH por defecto: preformas = gaylords x unidad; tapas/latas = la unidad (varia, el usuario ajusta).
function vhBase(row: SimRow) {
  const unidad = row.capacidadUnidad || 0;
  if (esPreforma(row)) return gaylordsPorVh(row.codigo) * unidad;
  return unidad;
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
  const [semanasCombinar, setSemanasCombinar] = useState<string[]>([]);

  const anio = new Date().getFullYear();
  const dias = DIAS_SET[diasHabiles];

  const semanasSel = useMemo(() => {
    const sel = semanas.filter((s) => !semanasOff.has(s));
    return sel.length ? sel : semanas;
  }, [semanas, semanasOff]);

  // Dinamico: solo referencias con necesidad en alguna de las semanas seleccionadas.
  const filasVisibles = useMemo(
    () => rows.filter((row) => semanasSel.some((sem) => (row.necesidadesPorSemana[sem] || 0) > 0)),
    [rows, semanasSel]
  );

  const fechasPorSemana = useMemo(() => {
    const mapa: Record<string, string[]> = {};
    semanasSel.forEach((sem) => {
      mapa[sem] = fechasDeSemana(sem, anio, dias);
    });
    return mapa;
  }, [semanasSel, anio, dias]);

  // Grupos de planeacion: las semanas elegidas en "Combinar" se juntan en un bloque; el resto van separadas.
  const grupos = useMemo(() => {
    const combSet = semanasCombinar
      .filter((s) => semanasSel.includes(s))
      .sort((x, y) => numeroSemana(x) - numeroSemana(y));
    if (combSet.length >= 2) {
      // La semana objetivo (la mas temprana) es la que se programa: su titulo y sus dias,
      // pero con la necesidad sumada de todas las semanas combinadas.
      const target = combSet[0];
      const noComb = semanasSel.filter((s) => !combSet.includes(s));
      const bloques = [
        { label: target, fechas: fechasPorSemana[target] || [], semanas: combSet, orden: numeroSemana(target) },
        ...noComb.map((sem) => ({ label: sem, fechas: fechasPorSemana[sem] || [], semanas: [sem], orden: numeroSemana(sem) })),
      ];
      bloques.sort((x, y) => x.orden - y.orden);
      return bloques.map(({ label, fechas, semanas }) => ({ label, fechas, semanas }));
    }
    return semanasSel.map((sem) => ({ label: sem, fechas: fechasPorSemana[sem] || [], semanas: [sem] }));
  }, [semanasCombinar, semanasSel, fechasPorSemana]);

  function toggleCombinar(sem: string) {
    setSemanasCombinar((prev) => (prev.includes(sem) ? prev.filter((s) => s !== sem) : [...prev, sem]));
  }

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

  function asignadoUnidFechas(codigo: string, fechas: string[]) {
    return fechas.reduce((acc, fecha) => acc + unidadesCelda(codigo, fecha), 0);
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
    filasVisibles.forEach((row) => {
      const base = vhBasePorCodigo[row.codigo] || 0;
      if (base <= 0) return;
      grupos.forEach((g) => {
        const necesidad = g.semanas.reduce((acc, sem) => acc + (row.necesidadesPorSemana[sem] || 0), 0);
        if (necesidad <= 0) return;
        const fechas = g.fechas;
        if (fechas.length === 0) return;
        const vhNecesarios = Math.ceil(necesidad / base);
        for (let i = 0; i < vhNecesarios; i++) {
          const fecha = fechas[i % fechas.length];
          const key = clave(row.codigo, fecha);
          nuevas[key] = String(numero(nuevas[key] ?? "0") + 1);
        }
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
      filasVisibles.reduce(
        (acc, row) => acc + semanasSel.reduce((s, sem) => s + (row.necesidadesPorSemana[sem] || 0), 0),
        0
      ),
    [filasVisibles, semanasSel]
  );

  const totalProgramado = useMemo(() => {
    let total = 0;
    filasVisibles.forEach((row) => {
      semanasSel.forEach((sem) => {
        total += asignadoUnidSemana(row.codigo, sem);
      });
    });
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filasVisibles, semanasSel, vehiculos, fechasPorSemana, vhBasePorCodigo]);

  const totalVh = useMemo(() => {
    let total = 0;
    filasVisibles.forEach((row) => {
      semanasSel.forEach((sem) => {
        (fechasPorSemana[sem] || []).forEach((fecha) => {
          total += numero(vhCelda(row.codigo, fecha));
        });
      });
    });
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filasVisibles, semanasSel, vehiculos, fechasPorSemana]);

  if (rows.length === 0) return null;

  const cubreTotal = totalProgramado >= totalNecesidad;

  return (
    <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-black text-slate-950">Simulador de programacion (por vehiculos)</h3>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Solo aparecen las referencias con requerimiento en las semanas que elijas. Haz clic en el dia para agregar vehiculos. 1 VH = gaylords x gaylor/estiba (preformas 40, SKU 303845 va de 36); el valor de &quot;1 VH&quot; es editable por referencia (las tapas 424220 / 424230 lo pones tu). Puedes pasarte del requerimiento.
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

        <div className="relative">
          <p className="mb-1 text-xs font-black uppercase text-slate-500">Combinar semanas</p>
          <details className="group">
            <summary className="flex h-11 cursor-pointer list-none items-center rounded-xl border border-blue-100 px-3 text-xs font-black text-slate-600">
              {semanasCombinar.filter((s) => semanasSel.includes(s)).length >= 2
                ? `${semanasCombinar.filter((s) => semanasSel.includes(s)).length} combinadas`
                : "Ninguna"}
            </summary>
            <div className="absolute left-0 z-30 mt-1 w-40 rounded-xl border border-blue-100 bg-white p-2 shadow-xl">
              {semanasSel.map((sem) => (
                <label key={sem} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs font-bold text-slate-700 hover:bg-blue-50">
                  <input
                    type="checkbox"
                    checked={semanasCombinar.includes(sem)}
                    onChange={() => toggleCombinar(sem)}
                    className="h-4 w-4 accent-[#0057B8]"
                  />
                  {sem}
                </label>
              ))}
            </div>
          </details>
        </div>

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
          Requerim.: <span className="text-red-600">{formato(totalNecesidad)}</span>
          {"  ·  "}Programado: <span className="text-[#0057B8]">{formato(totalProgramado)}</span>
          {"  ·  "}VH: <span className="text-slate-900">{formato(totalVh)}</span>
          {"  ·  "}
          <span className={cubreTotal ? "text-emerald-700" : "text-red-600"}>
            {cubreTotal ? "CUBRE" : `Falta ${formato(totalNecesidad - totalProgramado)}`}
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs font-semibold text-slate-500">
        Tip: 1 clic suma &quot;VH por clic&quot;. Teclea el numero exacto de VH. Doble clic borra la celda. Pasa el mouse por una celda para ver las unidades.
      </p>

      {filasVisibles.length === 0 ? (
        <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-[#003B7A]">
          No hay referencias con requerimiento en las semanas seleccionadas.
        </p>
      ) : (
        <div className="mt-4 overflow-auto rounded-2xl border border-blue-100">
          <table className="w-full table-fixed border-collapse text-left text-[9px]">
            <thead className="sticky top-0 z-20">
              <tr className="bg-blue-200/80 text-[#0B4EA2]">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-30 w-[140px] border-b border-blue-200 bg-blue-200/95 px-2 py-1 text-[8px] font-black uppercase"
                >
                  Referencia (1 VH = unid.)
                </th>
                {grupos.map((g) => (
                  <th
                    key={g.label}
                    colSpan={g.fechas.length + 1}
                    className="border-b border-l border-blue-300 px-1 py-1 text-center text-[8px] font-black uppercase"
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr className="bg-blue-100 text-[#0B4EA2]">
                {grupos.map((g) => (
                  <FragmentHeader key={g.label} fechas={g.fechas} />
                ))}
              </tr>
            </thead>
            <tbody>
              {filasVisibles.map((row, idx) => {
                const base = vhBasePorCodigo[row.codigo] || 0;
                return (
                  <tr key={row.codigo} className={`border-b border-slate-100 hover:bg-blue-50 ${idx % 2 ? "bg-slate-50/60" : "bg-white"}`}>
                    <td className="sticky left-0 z-10 w-[140px] bg-inherit px-2 py-1">
                      <div className="text-[9px] font-black text-slate-900 text-center">{row.codigo}</div>
                      <div className="text-[8px] font-semibold leading-tight text-slate-500 break-words text-center" title={row.material}>
                        {row.material}
                      </div>
                      <div className="mt-1 flex items-center justify-center gap-1">
                        <span className="text-[8px] font-bold text-slate-400">1 VH</span>
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
                          className="h-5 w-full rounded border border-blue-100 px-1 text-center text-[8px] font-black text-[#0057B8] outline-none focus:border-[#0057B8]"
                        />
                      </div>
                    </td>
                    {grupos.map((g) => {
                      const necesidad = g.semanas.reduce((acc, sem) => acc + (row.necesidadesPorSemana[sem] || 0), 0);
                      const asignado = asignadoUnidFechas(row.codigo, g.fechas);
                      return (
                        <FragmentRow
                          key={g.label}
                          fechas={g.fechas}
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
                <td className="sticky left-0 z-10 bg-slate-50 px-2 py-1 text-[8px] font-black uppercase text-slate-500">
                  Total por dia
                </td>
                {grupos.map((g) => (
                  <FragmentFooter
                    key={g.label}
                    fechas={g.fechas}
                    vhDia={(fecha) => filasVisibles.reduce((acc, row) => acc + numero(vhCelda(row.codigo, fecha)), 0)}
                    unidDia={(fecha) => filasVisibles.reduce((acc, row) => acc + unidadesCelda(row.codigo, fecha), 0)}
                  />
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function FragmentHeader({ fechas }: { fechas: string[] }) {
  return (
    <>
      {fechas.map((fecha) => (
        <th key={fecha} className="border-l border-blue-100 px-0.5 py-1 text-center text-[8px] font-black text-slate-500">
          <div>{diaNombre(fecha)}</div>
          <div className="font-semibold text-slate-400">{fechaCorta(fecha)}</div>
        </th>
      ))}
      <th className="border-l-2 border-blue-200 px-1 py-1 text-center text-[8px] font-black text-slate-500">
        Requerim.
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
  const falta = Math.max(0, necesidad - asignado);
  return (
    <>
      {fechas.map((fecha) => {
        const vh = vhCelda(fecha);
        const tiene = numero(vh) > 0;
        const unidades = numero(vh) * base;
        return (
          <td key={fecha} className="border-l border-slate-100 p-[2px]">
            <div
              onClick={() => onClic(fecha)}
              onDoubleClick={() => onClear(fecha)}
              title={tiene ? `${vh} VH = ${formato(unidades)} unid.` : "Clic para agregar VH"}
              className={`flex h-6 w-full cursor-pointer items-center justify-center overflow-hidden rounded text-center text-[9px] font-black transition ${
                tiene ? "bg-[#0057B8] text-white shadow-sm" : "bg-transparent text-slate-200 hover:bg-blue-50"
              }`}
            >
              {tiene ? formato(unidades) : "+"}
            </div>
            {tiene ? (
              <div className="mt-0.5 flex items-center justify-center gap-0.5">
                <input
                  type="text"
                  inputMode="numeric"
                  value={vh}
                  onChange={(e) => onChange(fecha, e.target.value.replace(/[^0-9]/g, ""))}
                  title="N de vehiculos (editable)"
                  className="h-4 w-6 rounded border border-blue-100 text-center text-[8px] font-bold text-[#0057B8] outline-none focus:border-[#0057B8]"
                />
                <span className="text-[8px] font-bold text-slate-400">VH</span>
              </div>
            ) : null}
          </td>
        );
      })}
      <td className="border-l-2 border-blue-200 px-1 py-0.5 text-center">
        {necesidad <= 0 ? (
          <span className="text-[9px] text-slate-300">&mdash;</span>
        ) : (
          <>
            <div className="text-[8px] font-semibold text-slate-400">{formato(necesidad)}</div>
            {cubre ? (
              <span className="inline-block rounded bg-emerald-100 px-1 py-[1px] text-[8px] font-black text-emerald-700">CUBRE</span>
            ) : (
              <span className="inline-block rounded bg-red-100 px-1 py-[1px] text-[8px] font-black text-red-600">Falta {formato(falta)}</span>
            )}
          </>
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
      {fechas.map((fecha) => {
        const vh = vhDia(fecha);
        return (
          <td
            key={fecha}
            title={vh > 0 ? `${formato(unidDia(fecha))} unid.` : ""}
            className="border-l border-slate-100 px-0.5 py-1 text-center text-[8px] font-bold text-slate-500"
          >
            {vh > 0 ? `${vh} VH` : "·"}
          </td>
        );
      })}
      <td className="border-l-2 border-blue-200" />
    </>
  );
}
