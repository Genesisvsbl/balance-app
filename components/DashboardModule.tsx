"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BalanceInfo,
  BalanceRow,
  ExcelData,
  InventarioBloqueadoRow,
} from "@/types/balance";
import { formatoNumero } from "@/lib/format";
import { obtenerCargas } from "@/lib/storage";
import { generarBalance } from "@/lib/balance";

type Props = {
  datos: ExcelData;
  analisis: BalanceRow[];
  infoAnalisis: BalanceInfo | null;
};

type RiesgoSemana = BalanceRow & {
  semanasCriticas: string[];
  necesidadSeleccionada: number;
  faltanteSeleccionado: number;
  transitoSeleccionado: number;
  consumoNotificado: number;
};

export default function DashboardModule({
  datos,
  analisis,
  infoAnalisis,
}: Props) {
  const semanas = infoAnalisis?.columnasSemana || [];
  const almacenesDetectados = infoAnalisis?.almacenesDetectados || [];
  const [semanasSeleccionadas, setSemanasSeleccionadas] = useState<string[]>([]);
  const [filtroRiesgo, setFiltroRiesgo] = useState("CRITICOS");
  const [busqueda, setBusqueda] = useState("");
  const [materialSeleccionado, setMaterialSeleccionado] = useState("");
  const [cargasHistoricas, setCargasHistoricas] = useState<any[]>([]);

  useEffect(() => {
    obtenerCargas()
      .then(setCargasHistoricas)
      .catch(() => setCargasHistoricas([]));
  }, []);

  useEffect(() => {
    setSemanasSeleccionadas((actual) => {
      const validas = actual.filter((sem) => semanas.includes(sem));
      return validas.length > 0 ? validas : semanas;
    });
  }, [semanas.join("|")]);

  const semanasActivas =
    semanasSeleccionadas.length > 0 ? semanasSeleccionadas : semanas;

  function toggleSemana(semana: string) {
    setSemanasSeleccionadas((actual) =>
      actual.includes(semana)
        ? actual.filter((item) => item !== semana)
        : [...actual, semana]
    );
  }

  function toggleMaterial(codigo: string) {
    setMaterialSeleccionado((actual) => (actual === codigo ? "" : codigo));
  }

  const resumenCalculado = useMemo(() => {
    if (Object.keys(datos).length === 0) return null;

    try {
      return generarBalance(datos).info;
    } catch {
      return null;
    }
  }, [datos]);

  const materialesBloqueados = useMemo(() => {
    let lista: InventarioBloqueadoRow[] =
      infoAnalisis?.materialesBloqueados ||
      resumenCalculado?.materialesBloqueados ||
      [];

    if (lista.length === 0) {
      lista = analisis
        .filter(
          (row) =>
            (row.inventarioBloqueado || 0) > 0 ||
            (row.valorInventarioBloqueado || 0) > 0
        )
        .map((row) => ({
          material: row.codigo,
          textoBreve: row.material,
          cantidad: row.inventarioBloqueado || 0,
          valor: row.valorInventarioBloqueado || 0,
        }));
    }

    return lista.slice().sort((a, b) => (b.valor || 0) - (a.valor || 0));
  }, [analisis, infoAnalisis, resumenCalculado]);

  const consumosPorMaterial =
    infoAnalisis?.consumosPorMaterial ||
    resumenCalculado?.consumosPorMaterial ||
    {};

  const riesgos = useMemo<RiesgoSemana[]>(() => {
    return analisis
      .map((row) => {
        const semanasCriticas = semanasActivas.filter(
          (sem) => (row.diferenciasPorSemana[sem] || 0) < 0
        );
        const necesidadSeleccionada = semanasActivas.reduce(
          (acc, sem) => acc + (row.necesidadesPorSemana[sem] || 0),
          0
        );
        const faltanteSeleccionado = semanasActivas.reduce((acc, sem) => {
          const dif = row.diferenciasPorSemana[sem] || 0;
          return dif < 0 ? acc + Math.abs(dif) : acc;
        }, 0);
        const transitoSeleccionado = semanasActivas.reduce(
          (acc, sem) => acc + (row.recepcionesPorSemana?.[sem] || 0),
          0
        );

        return {
          ...row,
          semanasCriticas,
          necesidadSeleccionada,
          faltanteSeleccionado,
          transitoSeleccionado,
          consumoNotificado: consumosPorMaterial[row.codigo] || 0,
        };
      })
      .filter((row) => row.necesidadSeleccionada > 0 || row.faltanteSeleccionado > 0)
      .sort((a, b) => b.faltanteSeleccionado - a.faltanteSeleccionado);
  }, [analisis, consumosPorMaterial, semanasActivas]);

  const riesgosFiltrados = riesgos.filter((row) => {
    const texto = busqueda.toLowerCase().trim();
    const coincideTexto =
      !texto ||
      row.codigo.toLowerCase().includes(texto) ||
      row.material.toLowerCase().includes(texto) ||
      row.seccion.toLowerCase().includes(texto);

    const coincideRiesgo =
      filtroRiesgo === "TODOS" ||
      (filtroRiesgo === "CRITICOS" && row.faltanteSeleccionado > 0) ||
      (filtroRiesgo === "CON_TRANSITO" && row.transitoSeleccionado > 0) ||
      (filtroRiesgo === "CON_CONSUMO" && row.consumoNotificado > 0);

    return coincideTexto && coincideRiesgo;
  });

  const materialesCriticos = riesgos.filter((row) => row.faltanteSeleccionado > 0);
  const materialesConTransito = riesgos.filter(
    (row) => row.transitoSeleccionado > 0
  );
  const materialesConConsumo = riesgos.filter((row) => row.consumoNotificado > 0);

  const necesidadSeleccionada = riesgos.reduce(
    (acc, row) => acc + row.necesidadSeleccionada,
    0
  );
  const faltanteSeleccionado = materialesCriticos.reduce(
    (acc, row) => acc + row.faltanteSeleccionado,
    0
  );
  const transitoSeleccionado = materialesConTransito.reduce(
    (acc, row) => acc + row.transitoSeleccionado,
    0
  );
  const consumoSeleccionado = materialesConConsumo.reduce(
    (acc, row) => acc + row.consumoNotificado,
    0
  );
  const valorBloqueado = materialesBloqueados.reduce(
    (acc, row) => acc + (row.valor || 0),
    0
  );

  const coberturaTransito =
    faltanteSeleccionado > 0
      ? (transitoSeleccionado / faltanteSeleccionado) * 100
      : 0;

  const dataSemanas = semanas.map((sem) => {
    const necesidad = analisis.reduce(
      (acc, row) => acc + (row.necesidadesPorSemana[sem] || 0),
      0
    );
    const faltante = analisis.reduce((acc, row) => {
      const dif = row.diferenciasPorSemana[sem] || 0;
      return dif < 0 ? acc + Math.abs(dif) : acc;
    }, 0);
    const transito = analisis.reduce(
      (acc, row) => acc + (row.recepcionesPorSemana?.[sem] || 0),
      0
    );

    return {
      semana: sem,
      necesidad,
      faltante,
      transito,
      criticos: analisis.filter((row) => (row.diferenciasPorSemana[sem] || 0) < 0)
        .length,
    };
  });

  const criticosPorSemana = semanas.map((sem) => {
    const materiales = analisis
      .map((row) => {
        const diferencia = row.diferenciasPorSemana[sem] || 0;
        return {
          codigo: row.codigo,
          material: row.material,
          seccion: row.seccion,
          diferencia,
          necesidad: row.necesidadesPorSemana[sem] || 0,
          transito: row.recepcionesPorSemana?.[sem] || 0,
        };
      })
      .filter((row) => row.diferencia < 0)
      .sort((a, b) => a.diferencia - b.diferencia);

    return {
      semana: sem,
      materiales,
      cantidad: materiales.length,
      faltante: materiales.reduce((acc, row) => acc + Math.abs(row.diferencia), 0),
    };
  });

  const dataSecciones = Object.values(
    materialesCriticos.reduce((acc: any, row) => {
      const seccion = row.seccion || "SIN SECCION";

      if (!acc[seccion]) {
        acc[seccion] = { seccion, faltante: 0, materiales: 0 };
      }

      acc[seccion].faltante += row.faltanteSeleccionado;
      acc[seccion].materiales += 1;
      return acc;
    }, {})
  )
    .sort((a: any, b: any) => b.faltante - a.faltante)
    .slice(0, 8);

  const dataComparativoBalances = cargasHistoricas
    .slice()
    .reverse()
    .map((carga) => ({
      nombre: new Date(carga.fecha).toLocaleString("es-DO", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      componentes: carga.info?.totalComponentes || 0,
      faltantes: carga.info?.totalFaltantes || 0,
      sobrantes: carga.info?.totalSobrantes || 0,
    }));

  const evolucionBalances = dataComparativoBalances.map((item, index, lista) => {
    const anterior = lista[index - 1];

    return {
      ...item,
      varFaltantes: anterior ? item.faltantes - anterior.faltantes : 0,
      varSobrantes: anterior ? item.sobrantes - anterior.sobrantes : 0,
      varComponentes: anterior ? item.componentes - anterior.componentes : 0,
    };
  });

  const transitosDetalle = riesgos
    .flatMap((row) =>
      semanasActivas
        .filter((sem) => (row.recepcionesPorSemana?.[sem] || 0) > 0)
        .map((sem) => ({
          codigo: row.codigo,
          material: row.material,
          semana: sem,
          cantidad: row.recepcionesPorSemana?.[sem] || 0,
          fechas: row.fechasRecepcionPorSemana?.[sem] || [],
          faltante: Math.max(Math.abs(row.diferenciasPorSemana[sem] || 0), 0),
        }))
    )
    .sort((a, b) => b.cantidad - a.cantidad);

  const detalleMaterial = useMemo(() => {
    if (!materialSeleccionado) return null;

    const row = riesgos.find((item) => item.codigo === materialSeleccionado);
    if (!row) return null;

    let saldoInicial = row.totalExistencia;
    const semanasDetalle = semanas.map((sem) => {
      const necesidad = row.necesidadesPorSemana[sem] || 0;
      const diferencia = row.diferenciasPorSemana[sem] || 0;
      const faltante = diferencia < 0 ? Math.abs(diferencia) : 0;
      const detalle = {
        semana: sem,
        saldoInicial,
        necesidad,
        diferencia,
        faltante,
        transito: row.recepcionesPorSemana?.[sem] || 0,
        fechas: row.fechasRecepcionPorSemana?.[sem] || [],
      };

      saldoInicial = diferencia;
      return detalle;
    });

    const bloqueado = materialesBloqueados.find(
      (item) => item.material === row.codigo
    );

    return {
      row,
      semanasDetalle,
      bloqueado,
    };
  }, [materialSeleccionado, materialesBloqueados, riesgos, semanas]);

  const topConsumos = Object.entries(consumosPorMaterial)
    .map(([codigo, cantidad]) => {
      const row = analisis.find((item) => item.codigo === codigo);
      return {
        codigo,
        material: row?.material || "",
        seccion: row?.seccion || "",
        cantidad,
      };
    })
    .filter((row) => row.cantidad > 0)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 25);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-950">
              Dashboard de planeacion y abastecimiento
            </h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Riesgo por semanas, transito, consumo notificado e inventario
              bloqueado para toma de decisiones.
            </p>
          </div>

          <div className="rounded-lg border border-[#d4a017]/30 bg-[#fff8df] px-3 py-2 text-xs font-black text-[#9a6a00]">
            Base AG01 + AG04 · {almacenesDetectados.length} almacenes detectados
          </div>
        </div>
      </div>

      {!infoAnalisis ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="font-bold text-slate-600">
            Todavia no hay analisis generado.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-base font-black text-slate-950">
                  Filtro de semanas
                </h4>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Selecciona una, dos o varias semanas para recalcular las tablas.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSemanasSeleccionadas(semanas)}
                  className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Todas
                </button>
                <button
                  onClick={() => setSemanasSeleccionadas([])}
                  className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Limpiar
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {semanas.map((sem) => {
                const activo = semanasActivas.includes(sem);

                return (
                  <button
                    key={sem}
                    onClick={() => toggleSemana(sem)}
                    className={`h-10 rounded-xl border px-4 text-sm font-black transition ${
                      activo
                        ? "border-[#e30613]/30 bg-red-50 text-[#e30613]"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {sem}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi titulo="Semanas evaluadas" valor={semanasActivas.length} />
            <Kpi
              titulo="Materiales criticos"
              valor={materialesCriticos.length}
              color="text-[#e30613]"
              border="border-red-100"
            />
            <Kpi
              titulo="Faltante acumulado"
              valor={formatoNumero(faltanteSeleccionado)}
              color="text-[#e30613]"
              border="border-red-100"
            />
            <Kpi
              titulo="Transito programado"
              valor={formatoNumero(transitoSeleccionado)}
              color="text-[#9a6a00]"
              border="border-[#d4a017]/25"
            />
            <Kpi
              titulo="Cobertura transito"
              valor={`${coberturaTransito.toFixed(1)}%`}
              color="text-emerald-700"
              border="border-emerald-100"
            />
            <Kpi
              titulo="Valor bloqueado"
              valor={formatoNumero(valorBloqueado)}
              color="text-[#9a6a00]"
              border="border-[#d4a017]/25"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <SignalCard
              titulo="Necesidad seleccionada"
              valor={formatoNumero(necesidadSeleccionada)}
              texto="Demanda total de las semanas filtradas."
              tipo="base"
            />
            <SignalCard
              titulo="Materiales con transito"
              valor={materialesConTransito.length}
              texto="Recepciones pendientes sin fecha de recibo."
              tipo="dorado"
            />
            <SignalCard
              titulo="Consumo notificado"
              valor={formatoNumero(consumoSeleccionado)}
              texto={`${materialesConConsumo.length} materiales con consumo aplicado.`}
              tipo="verde"
            />
            <SignalCard
              titulo="Seccion mas expuesta"
              valor={(dataSecciones[0] as any)?.seccion || "-"}
              texto={
                dataSecciones.length > 0
                  ? `${(dataSecciones[0] as any).materiales} materiales criticos.`
                  : "Sin riesgo concentrado."
              }
              tipo="rojo"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-black text-slate-950">
                    Materiales criticos por semana
                  </h4>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Conteo y principales SKU con faltante por cada semana.
                  </p>
                </div>
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-black uppercase text-[#e30613]">
                  {materialesCriticos.length} SKU criticos
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {criticosPorSemana.map((grupo) => (
                  <div
                    key={grupo.semana}
                    className={`rounded-xl border p-3 ${
                      semanasActivas.includes(grupo.semana)
                        ? "border-red-100 bg-red-50"
                        : "border-slate-200 bg-[#fbfbfa]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black text-slate-950">
                        {grupo.semana}
                      </p>
                      <p className="text-xs font-black text-[#e30613]">
                        {grupo.cantidad} SKU
                      </p>
                    </div>
                    <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                      Faltante: {formatoNumero(grupo.faltante)}
                    </p>
                    <div className="compact-scroll mt-2 max-h-[190px] space-y-1.5 overflow-auto pr-1">
                      {grupo.materiales.slice(0, 25).map((row) => (
                        <button
                          key={`${grupo.semana}-${row.codigo}`}
                          onClick={() => toggleMaterial(row.codigo)}
                          className={`grid w-full grid-cols-[minmax(0,1fr)_96px] items-start gap-2 rounded-lg px-3 py-2 text-left transition ${
                            materialSeleccionado === row.codigo
                              ? "bg-[#fff8df] ring-2 ring-[#d4a017]/30"
                              : "bg-white hover:bg-[#fbfbfa]"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-950">
                              {row.codigo}
                            </p>
                            <p className="truncate text-[11px] font-semibold text-slate-500">
                              {row.material}
                            </p>
                          </div>
                          <p className="truncate text-right text-[11px] font-black text-[#e30613]">
                            {formatoNumero(Math.abs(row.diferencia))}
                          </p>
                        </button>
                      ))}
                      {grupo.materiales.length > 25 && (
                        <p className="rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-slate-500">
                          +{grupo.materiales.length - 25} materiales adicionales.
                        </p>
                      )}
                      {grupo.materiales.length === 0 && (
                        <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                          Sin materiales criticos.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <ChartCard titulo="Necesidad por semana">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dataSemanas}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="semana" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => formatoNumero(v)} />
                  <Line
                    type="monotone"
                    dataKey="necesidad"
                    name="Necesidad"
                    stroke="#d4a017"
                    strokeWidth={4}
                    dot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {!detalleMaterial && (
              <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h4 className="text-xl font-black text-slate-950">
                  Tabla operativa de materiales
                </h4>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Criticos, transito y consumo segun las semanas seleccionadas.
                </p>
              </div>

              <div className="grid w-full grid-cols-1 gap-3 md:w-auto md:grid-cols-3">
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar material, texto breve, seccion..."
                  className="h-11 min-w-[320px] rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-[#e30613]/10"
                />

                <select
                  value={filtroRiesgo}
                  onChange={(e) => setFiltroRiesgo(e.target.value)}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#e30613]"
                >
                  <option value="CRITICOS">Solo criticos</option>
                  <option value="CON_TRANSITO">Con transito</option>
                  <option value="CON_CONSUMO">Con consumo</option>
                  <option value="TODOS">Todos</option>
                </select>

                <button
                  onClick={() => {
                    setBusqueda("");
                    setFiltroRiesgo("CRITICOS");
                  }}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  Limpiar filtros
                </button>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <div className="rounded-xl border border-[#d4a017]/30 bg-[#fff8df] px-4 py-2 text-xs font-black uppercase tracking-wide text-[#9a6a00]">
                {riesgosFiltrados.length} SKU
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[1300px] border-collapse text-sm">
                  <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 text-left font-black">Material</th>
                      <th className="px-4 py-3 text-left font-black">
                        Texto breve del material
                      </th>
                      <th className="px-4 py-3 text-left font-black">Seccion</th>
                      <th className="px-4 py-3 text-left font-black">
                        Semanas criticas
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Necesidad
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Faltante
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Transito
                      </th>
                      <th className="px-4 py-3 text-right font-black">
                        Consumo
                      </th>
                      <th className="px-4 py-3 text-left font-black">
                        Accion sugerida
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {riesgosFiltrados.map((row) => (
                      <tr
                        key={row.codigo}
                        onClick={() => toggleMaterial(row.codigo)}
                        className={`cursor-pointer border-b border-slate-100 transition ${
                          materialSeleccionado === row.codigo
                            ? "bg-[#fff8df]"
                            : "bg-white hover:bg-[#fbfbfa]"
                        }`}
                      >
                        <td className="px-4 py-3 font-black text-slate-950">
                          {row.codigo}
                        </td>
                        <td className="max-w-[420px] px-4 py-3 font-medium text-slate-700">
                          {row.material}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-500">
                          {row.seccion || "-"}
                        </td>
                        <td className="px-4 py-3 font-black text-[#e30613]">
                          {row.semanasCriticas.length > 0
                            ? row.semanasCriticas.join(", ")
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatoNumero(row.necesidadSeleccionada)}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-[#e30613]">
                          {formatoNumero(row.faltanteSeleccionado)}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-[#9a6a00]">
                          {formatoNumero(row.transitoSeleccionado)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                          {formatoNumero(row.consumoNotificado)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              row.faltanteSeleccionado > row.transitoSeleccionado
                                ? "bg-red-50 text-[#e30613]"
                                : row.transitoSeleccionado > 0
                                ? "bg-[#fff8df] text-[#9a6a00]"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {row.faltanteSeleccionado > row.transitoSeleccionado
                              ? "Gestionar compra / llegada"
                              : row.transitoSeleccionado > 0
                              ? "Monitorear recibo"
                              : "Sin accion urgente"}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {riesgosFiltrados.length === 0 && (
                      <tr>
                        <td
                          colSpan={999}
                          className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                        >
                          No hay materiales con los filtros seleccionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            )}

            {detalleMaterial && (
              <div className="mt-5 rounded-2xl border border-[#d4a017]/25 bg-[#fff8df] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-[#9a6a00]">
                      Detalle del material seleccionado
                    </p>
                    <h5 className="mt-1 text-xl font-black text-slate-950">
                      {detalleMaterial.row.codigo}
                    </h5>
                    <p className="mt-1 text-sm font-semibold text-slate-600">
                      {detalleMaterial.row.material}
                    </p>
                  </div>

                  <button
                    onClick={() => setMaterialSeleccionado("")}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                  >
                    Cerrar detalle
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <MiniDato
                    titulo="Stock base AG01 + AG04"
                    valor={formatoNumero(detalleMaterial.row.totalExistencia)}
                    tipo="base"
                  />
                  <MiniDato
                    titulo="AG01"
                    valor={formatoNumero(detalleMaterial.row.almacenes["AG01"] || 0)}
                    tipo="base"
                  />
                  <MiniDato
                    titulo="AG04"
                    valor={formatoNumero(detalleMaterial.row.almacenes["AG04"] || 0)}
                    tipo="base"
                  />
                  <MiniDato
                    titulo="Stock libre total"
                    valor={formatoNumero(detalleMaterial.row.inventarioLibre || 0)}
                    tipo="base"
                  />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <MiniDato
                    titulo="Faltante seleccionado"
                    valor={formatoNumero(detalleMaterial.row.faltanteSeleccionado)}
                    tipo="rojo"
                  />
                  <MiniDato
                    titulo="Transito seleccionado"
                    valor={formatoNumero(detalleMaterial.row.transitoSeleccionado)}
                    tipo="dorado"
                  />
                  <MiniDato
                    titulo="Consumo notificado"
                    valor={formatoNumero(detalleMaterial.row.consumoNotificado)}
                    tipo="verde"
                  />
                  <MiniDato
                    titulo="Valor bloqueado"
                    valor={formatoNumero(detalleMaterial.bloqueado?.valor || 0)}
                    tipo="base"
                  />
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-white/70 bg-white">
                  <div className="max-h-[260px] overflow-auto">
                    <table className="w-full min-w-[1100px] border-collapse text-sm">
                      <thead className="sticky top-0 bg-[#f8f8f6]">
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-3 text-left font-black">
                            Semana
                          </th>
                          <th className="px-4 py-3 text-right font-black">
                            Saldo inicial
                          </th>
                          <th className="px-4 py-3 text-right font-black">
                            Necesidad
                          </th>
                          <th className="px-4 py-3 text-right font-black">
                            Saldo proyectado
                          </th>
                          <th className="px-4 py-3 text-right font-black">
                            Faltante
                          </th>
                          <th className="px-4 py-3 text-right font-black">
                            Transito
                          </th>
                          <th className="px-4 py-3 text-left font-black">
                            Fecha operativa
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalleMaterial.semanasDetalle.map((sem) => (
                          <tr
                            key={sem.semana}
                            className="border-b border-slate-100"
                          >
                            <td className="px-4 py-3 font-black text-slate-950">
                              {sem.semana}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-semibold ${
                                sem.saldoInicial < 0
                                  ? "text-[#e30613]"
                                  : "text-slate-700"
                              }`}
                            >
                              {formatoNumero(sem.saldoInicial)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">
                              {formatoNumero(sem.necesidad)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-black ${
                                sem.diferencia < 0
                                  ? "text-[#e30613]"
                                  : "text-emerald-700"
                              }`}
                            >
                              {formatoNumero(sem.diferencia)}
                            </td>
                            <td className="px-4 py-3 text-right font-black text-[#e30613]">
                              {formatoNumero(sem.faltante)}
                            </td>
                            <td className="px-4 py-3 text-right font-black text-[#9a6a00]">
                              {formatoNumero(sem.transito)}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-600">
                              {sem.fechas.length > 0
                                ? sem.fechas.join(", ")
                                : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <DataTable
              titulo="Recepciones en transito"
              subtitulo="Materiales con plan de recibo pendiente en semanas filtradas."
              registro={`${new Set(transitosDetalle.map((row) => row.codigo)).size} SKU`}
              columns={["Material", "Texto breve", "Semana", "Fecha", "Cantidad"]}
              empty="No hay recepciones en transito para las semanas seleccionadas."
            >
              {transitosDetalle.slice(0, 40).map((row, index) => (
                <tr key={`${row.codigo}-${row.semana}-${index}`} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-black text-slate-950">{row.codigo}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{row.material}</td>
                  <td className="px-4 py-3 font-black text-[#9a6a00]">{row.semana}</td>
                  <td className="px-4 py-3 font-semibold text-slate-600">
                    {row.fechas.length > 0 ? row.fechas.join(", ") : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-[#9a6a00]">
                    {formatoNumero(row.cantidad)}
                  </td>
                </tr>
              ))}
            </DataTable>

            <DataTable
              titulo="Inventario bloqueado"
              subtitulo="Mayor valor bloqueado para revisar liberacion o decision de uso."
              registro={`${materialesBloqueados.length} SKU`}
              columns={["Material", "Texto breve", "Cantidad", "Valor"]}
              empty="No hay inventario bloqueado."
            >
              {materialesBloqueados.slice(0, 40).map((row) => (
                <tr key={row.material} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-black text-slate-950">{row.material}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {row.textoBreve || "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatoNumero(row.cantidad)}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-[#9a6a00]">
                    {formatoNumero(row.valor)}
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <DataTable
              titulo="Consumos notificados"
              subtitulo="Consumo convertido por receta para ajustar la lectura del plan."
              registro={`${topConsumos.length} SKU`}
              columns={["Material", "Texto breve", "Seccion", "Consumo"]}
              empty="No hay consumos notificados."
            >
              {topConsumos.map((row) => (
                <tr key={row.codigo} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-black text-slate-950">{row.codigo}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {row.material || "-"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-500">
                    {row.seccion || "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-emerald-700">
                    {formatoNumero(row.cantidad)}
                  </td>
                </tr>
              ))}
            </DataTable>

            <DataTable
              titulo="Evolucion de balances guardados"
              subtitulo="Lectura directa de cambios entre balances guardados."
              registro={`${evolucionBalances.length} balances`}
              columns={[
                "Balance",
                "Faltantes",
                "Var. faltantes",
                "Sobrantes",
                "Var. sobrantes",
              ]}
              empty="Todavia no hay balances guardados para comparar."
            >
              {evolucionBalances.map((row) => (
                <tr key={row.nombre} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-black text-slate-950">
                    {row.nombre}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {row.faltantes}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-black ${
                      row.varFaltantes > 0
                        ? "text-[#e30613]"
                        : row.varFaltantes < 0
                        ? "text-emerald-700"
                        : "text-slate-500"
                    }`}
                  >
                    {row.varFaltantes > 0 ? "+" : ""}
                    {row.varFaltantes}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {row.sobrantes}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-black ${
                      row.varSobrantes > 0
                        ? "text-emerald-700"
                        : row.varSobrantes < 0
                        ? "text-[#e30613]"
                        : "text-slate-500"
                    }`}
                  >
                    {row.varSobrantes > 0 ? "+" : ""}
                    {row.varSobrantes}
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        </>
      )}
    </section>
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
    <div className={`rounded-xl border ${border} bg-white p-4 shadow-sm`}>
      <p className="truncate text-xs font-semibold text-slate-500">{titulo}</p>
      <p className={`mt-1 truncate text-lg font-black ${color}`}>{valor}</p>
    </div>
  );
}

function SignalCard({
  titulo,
  valor,
  texto,
  tipo,
}: {
  titulo: string;
  valor: string | number;
  texto: string;
  tipo: "base" | "rojo" | "verde" | "dorado";
}) {
  const style =
    tipo === "rojo"
      ? "border-red-100 text-[#e30613]"
      : tipo === "verde"
      ? "border-emerald-100 text-emerald-700"
      : tipo === "dorado"
      ? "border-[#d4a017]/25 text-[#9a6a00]"
      : "border-slate-200 text-slate-950";

  return (
    <div className={`rounded-xl border ${style} bg-white p-4 shadow-sm`}>
      <p className="truncate text-xs font-semibold text-slate-500">{titulo}</p>
      <p className="mt-1 truncate text-lg font-black">{valor}</p>
      <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{texto}</p>
    </div>
  );
}

function MiniDato({
  titulo,
  valor,
  tipo,
}: {
  titulo: string;
  valor: string | number;
  tipo: "rojo" | "verde" | "dorado" | "base";
}) {
  const color =
    tipo === "rojo"
      ? "text-[#e30613]"
      : tipo === "verde"
      ? "text-emerald-700"
      : tipo === "dorado"
      ? "text-[#9a6a00]"
      : "text-slate-950";

  return (
    <div className="rounded-xl border border-white/70 bg-white px-4 py-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {titulo}
      </p>
      <p className={`mt-1 truncate text-base font-black ${color}`}>{valor}</p>
    </div>
  );
}

function ChartCard({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="mb-3 text-base font-black text-slate-950">{titulo}</h4>
      <div className="h-[280px]">{children}</div>
    </div>
  );
}

function DataTable({
  titulo,
  subtitulo,
  registro,
  columns,
  children,
  empty,
}: {
  titulo: string;
  subtitulo: string;
  registro: string;
  columns: string[];
  children: React.ReactNode;
  empty: string;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-black text-slate-950">{titulo}</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {subtitulo}
          </p>
        </div>

        <div className="rounded-lg border border-[#d4a017]/30 bg-[#fff8df] px-3 py-2 text-[11px] font-black uppercase text-[#9a6a00]">
          {registro}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="compact-scroll max-h-[340px] overflow-auto">
          <table className="w-full min-w-[760px] border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                {columns.map((column, index) => (
                  <th
                    key={column}
                    className={`px-4 py-3 font-black ${
                      index >= columns.length - 2 ? "text-right" : "text-left"
                    }`}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {hasRows ? (
                children
              ) : (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                  >
                    {empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
