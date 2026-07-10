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

type Cita = {
  id: string;
  codigo: string;
  material: string;
  um: string;
  sem: string;
  cantidad: number;
  fecha: string; // YYYY-MM-DD
};

type DiasHabiles = "LV" | "LS" | "TODOS";

const DIAS_SET: Record<DiasHabiles, number[]> = {
  LV: [1, 2, 3, 4, 5],
  LS: [1, 2, 3, 4, 5, 6],
  TODOS: [0, 1, 2, 3, 4, 5, 6],
};

const NOMBRE_DIA = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

function formato(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("en-US");
}

function numeroSemana(sem: string) {
  const match = sem.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

// Lunes (UTC) de la semana ISO indicada.
function lunesSemanaISO(week: number, year: number) {
  const enero4 = new Date(Date.UTC(year, 0, 4));
  const diaSemana = enero4.getUTCDay() || 7; // 1..7 (lunes..domingo)
  const lunesSemana1 = new Date(enero4);
  lunesSemana1.setUTCDate(enero4.getUTCDate() - (diaSemana - 1));
  const lunes = new Date(lunesSemana1);
  lunes.setUTCDate(lunesSemana1.getUTCDate() + (week - 1) * 7);
  return lunes;
}

function claveFecha(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fechaLegible(clave: string) {
  const d = new Date(`${clave}T00:00:00Z`);
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${NOMBRE_DIA[d.getUTCDay()]} ${dia}/${mes}`;
}

// Fechas (claves) de los dias habiles de una semana ISO, a partir de la fecha de inicio.
function fechasDeSemana(sem: string, year: number, dias: number[], inicioClave: string) {
  const lunes = lunesSemanaISO(numeroSemana(sem), year);
  const resultado: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setUTCDate(lunes.getUTCDate() + i);
    if (!dias.includes(d.getUTCDay())) continue;
    const clave = claveFecha(d);
    if (clave < inicioClave) continue;
    resultado.push(clave);
  }
  return resultado;
}

export default function SimuladorProgramacion({ rows, semanas }: Props) {
  const hoy = claveFecha(new Date());
  const [inicio, setInicio] = useState(hoy);
  const [unidadesDia, setUnidadesDia] = useState(500000);
  const [diasHabiles, setDiasHabiles] = useState<DiasHabiles>("LV");
  const [citas, setCitas] = useState<Cita[]>([]);
  const [generado, setGenerado] = useState(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);

  const anio = Number(inicio.slice(0, 4)) || new Date().getFullYear();
  const dias = DIAS_SET[diasHabiles];

  function generar() {
    const nuevas: Cita[] = [];
    let contador = 0;

    rows.forEach((row) => {
      semanas.forEach((sem) => {
        const necesidad = row.necesidadesPorSemana[sem] || 0;
        if (necesidad <= 0) return;

        const fechas = fechasDeSemana(sem, anio, dias, inicio);
        if (fechas.length === 0) return;

        let restante = necesidad;
        let indice = 0;
        while (restante > 0 && indice < fechas.length) {
          const cantidad = Math.min(unidadesDia, restante);
          nuevas.push({
            id: `c${contador++}`,
            codigo: row.codigo,
            material: row.material,
            um: row.um,
            sem,
            cantidad,
            fecha: fechas[indice],
          });
          restante -= cantidad;
          indice += 1;
        }

        // Si no alcanzaron los dias de la semana, el resto se apila el ultimo dia habil.
        if (restante > 0 && fechas.length > 0) {
          nuevas.push({
            id: `c${contador++}`,
            codigo: row.codigo,
            material: row.material,
            um: row.um,
            sem,
            cantidad: restante,
            fecha: fechas[fechas.length - 1],
          });
        }
      });
    });

    setCitas(nuevas);
    setGenerado(true);
  }

  function limpiar() {
    setCitas([]);
    setGenerado(false);
  }

  function moverCita(id: string, fecha: string) {
    setCitas((prev) =>
      prev.map((cita) => (cita.id === id ? { ...cita, fecha } : cita))
    );
  }

  // Agrupacion: semana -> fecha -> citas
  const calendario = useMemo(() => {
    return semanas.map((sem) => {
      const fechas = fechasDeSemana(sem, anio, dias, inicio);
      const necesidadSem = rows.reduce(
        (acc, row) => acc + (row.necesidadesPorSemana[sem] || 0),
        0
      );
      const programadoSem = citas
        .filter((c) => c.sem === sem)
        .reduce((acc, c) => acc + c.cantidad, 0);

      const columnas = fechas.map((fecha) => ({
        fecha,
        citas: citas.filter((c) => c.sem === sem && c.fecha === fecha),
      }));

      return { sem, necesidadSem, programadoSem, columnas };
    });
  }, [semanas, citas, rows, anio, diasHabiles, inicio]);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950">Simulador de programacion</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Genera el calendario de citas de recepcion segun el requerimiento por semana. Arrastra las citas para mover las fechas.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <label className="text-xs font-black uppercase text-slate-500">
          Fecha de inicio
          <input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-blue-100 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#0057B8]"
          />
        </label>
        <label className="text-xs font-black uppercase text-slate-500">
          Unidades por dia
          <input
            type="number"
            min={1}
            value={unidadesDia}
            onChange={(e) => setUnidadesDia(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 h-11 w-full rounded-xl border border-blue-100 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#0057B8]"
          />
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
        <button
          onClick={generar}
          className="h-11 self-end rounded-xl bg-[#0057B8] px-6 text-sm font-black text-white shadow-md transition hover:bg-[#003B7A]"
        >
          GENERAR
        </button>
        <button
          onClick={limpiar}
          className="h-11 self-end rounded-xl border border-blue-200 px-5 text-sm font-black text-[#0057B8]"
        >
          Limpiar
        </button>
      </div>

      {!generado && (
        <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-[#003B7A]">
          Ajusta la fecha de inicio, las unidades por dia y presiona GENERAR para armar el calendario.
        </p>
      )}

      {generado && (
        <div className="mt-5 space-y-5">
          {calendario.map(({ sem, necesidadSem, programadoSem, columnas }) => {
            const cubre = programadoSem >= necesidadSem;
            const falta = Math.max(0, necesidadSem - programadoSem);
            return (
              <div key={sem} className="rounded-2xl border border-blue-100">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl bg-blue-50 px-4 py-2.5">
                  <p className="text-sm font-black text-[#003B7A]">{sem}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                    <span className="text-slate-500">Necesidad: <span className="text-red-600">{formato(necesidadSem)}</span></span>
                    <span className="text-slate-500">Programado: <span className="text-[#0057B8]">{formato(programadoSem)}</span></span>
                    <span className={`rounded-full px-3 py-1 font-black ${cubre ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                      {cubre ? "CUBRE" : `Falta ${formato(falta)}`}
                    </span>
                  </div>
                </div>

                {columnas.length === 0 ? (
                  <p className="px-4 py-3 text-xs font-semibold text-slate-400">
                    No hay dias habiles de esta semana despues de la fecha de inicio.
                  </p>
                ) : (
                  <div className="grid gap-2 p-3" style={{ gridTemplateColumns: `repeat(${columnas.length}, minmax(140px, 1fr))` }}>
                    {columnas.map(({ fecha, citas: citasDia }) => {
                      const totalDia = citasDia.reduce((acc, c) => acc + c.cantidad, 0);
                      const esDrop = arrastrando !== null;
                      return (
                        <div
                          key={fecha}
                          onDragOver={(e) => { if (esDrop) e.preventDefault(); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (arrastrando) moverCita(arrastrando, fecha);
                            setArrastrando(null);
                          }}
                          className={`min-h-[90px] rounded-xl border p-2 transition ${esDrop ? "border-dashed border-[#0057B8] bg-blue-50/50" : "border-slate-200 bg-slate-50"}`}
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-[11px] font-black text-slate-600">{fechaLegible(fecha)}</span>
                            <span className="text-[10px] font-bold text-slate-400">{formato(totalDia)}</span>
                          </div>
                          <div className="space-y-1">
                            {citasDia.map((cita) => (
                              <div
                                key={cita.id}
                                draggable
                                onDragStart={() => setArrastrando(cita.id)}
                                onDragEnd={() => setArrastrando(null)}
                                title={cita.material}
                                className="cursor-grab rounded-lg border border-blue-200 bg-white px-2 py-1 text-[10px] font-black text-[#003B7A] shadow-sm active:cursor-grabbing"
                              >
                                <div className="truncate">{cita.codigo}</div>
                                <div className="text-[#0057B8]">{formato(cita.cantidad)} {cita.um}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
