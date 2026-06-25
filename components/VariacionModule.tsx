"use client";

import { useEffect, useMemo, useState } from "react";
import { formatoNumero } from "@/lib/format";
import { obtenerCarga, obtenerCargas } from "@/lib/storage";
import { BalanceRow, SavedLoad, SkuProduccion } from "@/types/balance";

type Diagnostico =
  | "AUMENTO DE PLAN"
  | "REDUCCION EXPLICADA POR CONSUMO"
  | "REDUCCION NO EXPLICADA"
  | "CONSUMO MAYOR A REDUCCION"
  | "NUEVO MATERIAL"
  | "MATERIAL RETIRADO"
  | "SIN CAMBIO";

type VariacionRow = {
  codigo: string;
  material: string;
  seccion: string;
  planAnterior: number;
  planActual: number;
  movimientoPlan: number;
  reduccionPlan: number;
  consumoNotificado: number;
  diferenciaPorExplicar: number;
  diagnostico: Diagnostico;
  skusProduccion: SkuProduccion[];
  semanas: {
    semana: string;
    anterior: number;
    actual: number;
    movimiento: number;
  }[];
};

type VariacionSkuRow = {
  codigo: string;
  descripcion: string;
  planAnterior: number;
  planActual: number;
  movimientoPlan: number;
  reduccionPlan: number;
  consumoNotificado: number;
  diferenciaPorExplicar: number;
  diagnostico: Diagnostico;
  secciones: string[];
  materiales: VariacionRow[];
  semanas: {
    semana: string;
    anterior: number;
    actual: number;
    movimiento: number;
  }[];
};

const SECCIONES_DETALLE_DEFAULT = ["ETIQUETA", "TAPA", "PREFORMA", "PLASTICO", "PLASTICOS"];

function normalizarBusqueda(valor: string) {
  return valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizarClave(valor: string) {
  return normalizarBusqueda(valor).replace(/[^a-z0-9]/g, "");
}

function obtenerValorFila(fila: Record<string, any>, nombres: string[]) {
  for (const nombre of nombres) {
    const objetivo = normalizarClave(nombre);
    const key = Object.keys(fila || {}).find(
      (columna) =>
        normalizarClave(columna) === objetivo &&
        fila[columna] !== undefined &&
        fila[columna] !== ""
    );

    if (key) return fila[key];
  }

  return "";
}

function obtenerHojaCarga(carga: SavedLoad | undefined, nombres: string[]) {
  const objetivos = nombres.map(normalizarClave);
  return (
    Object.entries(carga?.datos || {}).find(([nombre]) =>
      objetivos.includes(normalizarClave(nombre))
    )?.[1] || null
  );
}

function construirSkusPorComponente(carga: SavedLoad | undefined) {
  const hojaPlan = obtenerHojaCarga(carga, ["Plan"]);
  const hojaReceta = obtenerHojaCarga(carga, ["Receta"]);
  const skusPlan = new Map<string, SkuProduccion>();
  const mapa = new Map<string, SkuProduccion[]>();

  (hojaPlan?.datos || []).forEach((fila: Record<string, any>) => {
    const codigo = String(
      obtenerValorFila(fila, ["SAP", "Codigo SAP", "Codigo"])
    ).trim();
    const descripcion = String(
      obtenerValorFila(fila, ["SKU", "Descripcion SKU", "Descripcion"])
    ).trim();

    if (codigo && !skusPlan.has(codigo)) {
      skusPlan.set(codigo, { codigo, descripcion: descripcion || codigo });
    }
  });

  (hojaReceta?.datos || []).forEach((fila: Record<string, any>) => {
    const codigoSku = String(
      obtenerValorFila(fila, ["Codigo", "SAP", "Material padre"])
    ).trim();
    const componente = String(
      obtenerValorFila(fila, [
        "N componente",
        "No componente",
        "Nro componente",
        "Componente",
      ])
    ).trim();
    const sku = skusPlan.get(codigoSku);

    if (!sku || !componente) return;

    const lista = mapa.get(componente) || [];
    if (!lista.some((item) => item.codigo === sku.codigo)) {
      lista.push(sku);
      mapa.set(componente, lista);
    }
  });

  return mapa;
}

function diagnosticoDesdeValores(
  antes: number,
  ahora: number,
  consumo: number
): Diagnostico {
  const movimiento = ahora - antes;
  const reduccion = Math.max(antes - ahora, 0);

  if (antes <= 0 && ahora > 0) return "NUEVO MATERIAL";
  if (antes > 0 && ahora <= 0) return "MATERIAL RETIRADO";
  if (movimiento > 0) return "AUMENTO DE PLAN";

  if (reduccion > 0) {
    const diferencia = reduccion - consumo;
    const tolerancia = Math.max(1, reduccion * 0.001);

    if (Math.abs(diferencia) <= tolerancia) {
      return "REDUCCION EXPLICADA POR CONSUMO";
    }

    return diferencia > 0
      ? "REDUCCION NO EXPLICADA"
      : "CONSUMO MAYOR A REDUCCION";
  }

  return "SIN CAMBIO";
}

function toggleLista<T extends string>(
  valor: T,
  setter: (updater: (actual: T[]) => T[]) => void
) {
  setter((actual) =>
    actual.includes(valor)
      ? actual.filter((item) => item !== valor)
      : [...actual, valor]
  );
}

function unirSkusProduccion(...filas: (BalanceRow | undefined)[]) {
  const mapa = new Map<string, SkuProduccion>();

  filas.forEach((fila) => {
    (fila?.skusProduccion || []).forEach((sku) => {
      if (!sku.codigo) return;
      if (!mapa.has(sku.codigo)) mapa.set(sku.codigo, sku);
    });
  });

  return Array.from(mapa.values());
}

function esSeccionDefaultDetalle(seccion: string) {
  const normalizada = normalizarClave(seccion);
  return SECCIONES_DETALLE_DEFAULT.some((item) =>
    normalizada.includes(normalizarClave(item))
  );
}

export default function VariacionModule() {
  const [cargas, setCargas] = useState<SavedLoad[]>([]);
  const [cargasDetalle, setCargasDetalle] = useState<Record<string, SavedLoad>>({});
  const [cargaAntesId, setCargaAntesId] = useState("");
  const [cargaAhoraId, setCargaAhoraId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtrosDiagnostico, setFiltrosDiagnostico] = useState<Diagnostico[]>([]);
  const [filtrosSeccion, setFiltrosSeccion] = useState<string[]>([]);
  const [filtrosSemana, setFiltrosSemana] = useState<string[]>([]);
  const [filtrosSkuPlan, setFiltrosSkuPlan] = useState<string[]>([]);
  const [busquedaDetalleSku, setBusquedaDetalleSku] = useState("");
  const [filtrosDetalleSeccion, setFiltrosDetalleSeccion] = useState<string[]>([]);
  const [filtrosDetalleSemana, setFiltrosDetalleSemana] = useState<string[]>([]);
  const [soloPorExplicar, setSoloPorExplicar] = useState(false);
  const [sapSeleccionado, setSapSeleccionado] = useState("");

  useEffect(() => {
    obtenerCargas().then((data) => {
      setCargas(data);
      setCargasDetalle(
        Object.fromEntries(
          data
            .filter((carga) => carga.analisis?.length)
            .map((carga) => [carga.id, carga])
        )
      );

      if (data.length >= 2) {
        setCargaAhoraId(data[0].id);
        setCargaAntesId(data[1].id);
      }
    });
  }, []);

  useEffect(() => {
    [cargaAntesId, cargaAhoraId].filter(Boolean).forEach((id) => {
      if (cargasDetalle[id]) return;

      const parcial = cargas.find((carga) => carga.id === id);
      if (parcial?.analisis?.length) {
        setCargasDetalle((actual) =>
          actual[id] ? actual : { ...actual, [id]: parcial }
        );
        return;
      }

      obtenerCarga(id)
        .then((completa) => {
          setCargasDetalle((actual) => ({ ...actual, [id]: completa }));
        })
        .catch((error) => {
          console.error("No se pudo cargar el balance completo", error);
        });
    });
  }, [cargaAntesId, cargaAhoraId, cargas, cargasDetalle]);

  const cargaAntes =
    cargasDetalle[cargaAntesId] || cargas.find((c) => c.id === cargaAntesId);
  const cargaAhora =
    cargasDetalle[cargaAhoraId] || cargas.find((c) => c.id === cargaAhoraId);

  const variaciones = useMemo(() => {
    if (!cargaAntes || !cargaAhora) return [];

    const mapaAntes = new Map(cargaAntes.analisis.map((row) => [row.codigo, row]));
    const mapaAhora = new Map(cargaAhora.analisis.map((row) => [row.codigo, row]));
    const semanas = Array.from(
      new Set([
        ...(cargaAntes.info?.columnasSemana || []),
        ...(cargaAhora.info?.columnasSemana || []),
      ])
    ).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    const codigos = new Set([...mapaAntes.keys(), ...mapaAhora.keys()]);
    const skusPorComponenteAntes = construirSkusPorComponente(cargaAntes);
    const skusPorComponenteAhora = construirSkusPorComponente(cargaAhora);

    return Array.from(codigos)
      .map((codigo) => {
        const antes = mapaAntes.get(codigo);
        const ahora = mapaAhora.get(codigo);
        const planAnterior = antes?.totalNecesidad || 0;
        const planActual = ahora?.totalNecesidad || 0;
        const movimientoPlan = planActual - planAnterior;
        const reduccionPlan = Math.max(planAnterior - planActual, 0);
        const consumoNotificado =
          cargaAntes.info?.consumosPorMaterial?.[codigo] || 0;
        const diferenciaPorExplicar =
          reduccionPlan > 0 ? reduccionPlan - consumoNotificado : movimientoPlan;

        return {
          codigo,
          material: ahora?.material || antes?.material || "",
          seccion: ahora?.seccion || antes?.seccion || "",
          planAnterior,
          planActual,
          movimientoPlan,
          reduccionPlan,
          consumoNotificado,
          diferenciaPorExplicar,
          diagnostico: diagnosticoDesdeValores(
            planAnterior,
            planActual,
            consumoNotificado
          ),
          skusProduccion: [
            ...unirSkusProduccion(antes, ahora),
            ...(skusPorComponenteAntes.get(codigo) || []),
            ...(skusPorComponenteAhora.get(codigo) || []),
          ].filter(
            (sku, index, lista) =>
              sku.codigo &&
              lista.findIndex((item) => item.codigo === sku.codigo) === index
          ),
          semanas: semanas.map((semana) => {
            const anterior = antes?.necesidadesPorSemana[semana] || 0;
            const actual = ahora?.necesidadesPorSemana[semana] || 0;

            return {
              semana,
              anterior,
              actual,
              movimiento: actual - anterior,
            };
          }),
        };
      })
      .filter((row) => row.skusProduccion.length > 0)
      .sort((a, b) => Math.abs(b.diferenciaPorExplicar) - Math.abs(a.diferenciaPorExplicar));
  }, [cargaAntes, cargaAhora]);

  const semanasDisponibles = Array.from(
    new Set(variaciones.flatMap((v) => v.semanas.map((sem) => sem.semana)))
  ).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));

  const skuPlanOpciones = Array.from(
    new Map(
      [
        ...(cargaAntes?.info?.skusProduccionDetectados || []),
        ...(cargaAhora?.info?.skusProduccionDetectados || []),
        ...variaciones.flatMap((v) => v.skusProduccion),
      ]
        .filter((sku) => sku.codigo)
        .map((sku) => [sku.codigo, sku])
    ).values()
  ).sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));

  const variacionesSku = useMemo(() => {
    return skuPlanOpciones
      .map<VariacionSkuRow>((sku) => {
        const materiales = variaciones.filter((row) =>
          row.skusProduccion.some((item) => item.codigo === sku.codigo)
        );
        const planAnterior = materiales.reduce((acc, row) => acc + row.planAnterior, 0);
        const planActual = materiales.reduce((acc, row) => acc + row.planActual, 0);
        const consumoNotificado = materiales.reduce(
          (acc, row) => acc + row.consumoNotificado,
          0
        );
        const reduccionPlan = Math.max(planAnterior - planActual, 0);
        const movimientoPlan = planActual - planAnterior;
        const diferenciaPorExplicar =
          reduccionPlan > 0 ? reduccionPlan - consumoNotificado : movimientoPlan;
        const secciones = Array.from(
          new Set(materiales.map((row) => row.seccion).filter(Boolean))
        ).sort();

        return {
          codigo: sku.codigo,
          descripcion: sku.descripcion || sku.codigo,
          planAnterior,
          planActual,
          movimientoPlan,
          reduccionPlan,
          consumoNotificado,
          diferenciaPorExplicar,
          diagnostico: diagnosticoDesdeValores(
            planAnterior,
            planActual,
            consumoNotificado
          ),
          secciones,
          materiales,
          semanas: semanasDisponibles.map((semana) => {
            const anterior = materiales.reduce(
              (acc, row) =>
                acc + (row.semanas.find((item) => item.semana === semana)?.anterior || 0),
              0
            );
            const actual = materiales.reduce(
              (acc, row) =>
                acc + (row.semanas.find((item) => item.semana === semana)?.actual || 0),
              0
            );

            return {
              semana,
              anterior,
              actual,
              movimiento: actual - anterior,
            };
          }),
        };
      })
      .filter((row) => row.materiales.length > 0)
      .sort((a, b) => Math.abs(b.diferenciaPorExplicar) - Math.abs(a.diferenciaPorExplicar));
  }, [skuPlanOpciones, variaciones, semanasDisponibles]);

  const diagnosticos = Array.from(new Set(variacionesSku.map((v) => v.diagnostico)));
  const secciones = Array.from(
    new Set(variacionesSku.flatMap((v) => v.secciones).filter(Boolean))
  ).sort();

  const variacionesSkuFiltradas = variacionesSku.filter((row) => {
    const texto = normalizarBusqueda(busqueda);
    const coincideTexto =
      !texto ||
      normalizarBusqueda(row.codigo).includes(texto) ||
      normalizarBusqueda(row.descripcion).includes(texto) ||
      row.materiales.some(
        (material) =>
          normalizarBusqueda(material.codigo).includes(texto) ||
          normalizarBusqueda(material.material).includes(texto) ||
          normalizarBusqueda(material.seccion).includes(texto)
      );
    const coincideDiagnostico =
      filtrosDiagnostico.length === 0 || filtrosDiagnostico.includes(row.diagnostico);
    const coincideSeccion =
      filtrosSeccion.length === 0 ||
      row.secciones.some((seccion) => filtrosSeccion.includes(seccion));
    const coincideSemana =
      filtrosSemana.length === 0 ||
      row.semanas.some(
        (sem) =>
          filtrosSemana.includes(sem.semana) &&
          (sem.anterior !== 0 || sem.actual !== 0 || sem.movimiento !== 0)
      );
    const coincideSkuPlan =
      filtrosSkuPlan.length === 0 || filtrosSkuPlan.includes(row.codigo);
    const coincideExplicar =
      !soloPorExplicar ||
      row.diagnostico === "REDUCCION NO EXPLICADA" ||
      row.diagnostico === "CONSUMO MAYOR A REDUCCION";

    return (
      coincideTexto &&
      coincideDiagnostico &&
      coincideSeccion &&
      coincideSemana &&
      coincideSkuPlan &&
      coincideExplicar
    );
  });

  const seleccionado = variacionesSku.find((row) => row.codigo === sapSeleccionado);
  const seccionesDetalleSku = Array.from(
    new Set(seleccionado?.materiales.map((row) => row.seccion).filter(Boolean) || [])
  ).sort();
  const semanasVisibles =
    filtrosSemana.length > 0 ? filtrosSemana : semanasDisponibles;
  const semanasDetalleVisibles =
    filtrosDetalleSemana.length > 0 ? filtrosDetalleSemana : semanasVisibles;

  const materialesSkuPlanFiltrados = (seleccionado?.materiales || []).filter((row) => {
    const texto = normalizarBusqueda(busquedaDetalleSku);
    const coincideTexto =
      !texto ||
      normalizarBusqueda(row.codigo).includes(texto) ||
      normalizarBusqueda(row.material).includes(texto) ||
      normalizarBusqueda(row.seccion).includes(texto);
    const coincideSeccion =
      filtrosDetalleSeccion.length === 0 ||
      filtrosDetalleSeccion.includes(row.seccion);
    const coincideSemana =
      filtrosDetalleSemana.length === 0 ||
      row.semanas.some(
        (sem) =>
          filtrosDetalleSemana.includes(sem.semana) &&
          (sem.anterior !== 0 || sem.actual !== 0 || sem.movimiento !== 0)
      );

    return coincideTexto && coincideSeccion && coincideSemana;
  });

  const materialesDetalleDinamicos = materialesSkuPlanFiltrados
    .map((row) => {
      const datosSemana = row.semanas.filter((item) =>
        semanasDetalleVisibles.includes(item.semana)
      );
      const planAnterior = datosSemana.reduce((acc, item) => acc + item.anterior, 0);
      const planActual = datosSemana.reduce((acc, item) => acc + item.actual, 0);
      const movimientoPlan = planActual - planAnterior;
      const reduccionPlan = Math.max(planAnterior - planActual, 0);
      const diferenciaPorExplicar =
        reduccionPlan > 0 ? reduccionPlan - row.consumoNotificado : movimientoPlan;

      return {
        ...row,
        planAnterior,
        planActual,
        movimientoPlan,
        reduccionPlan,
        diferenciaPorExplicar,
        diagnostico: diagnosticoDesdeValores(
          planAnterior,
          planActual,
          row.consumoNotificado
        ),
      };
    })
    .filter(
      (row) =>
        row.planAnterior !== 0 ||
        row.planActual !== 0 ||
        row.movimientoPlan !== 0
    );

  const resumen = {
    aumentos: variacionesSku.filter((v) => v.diagnostico === "AUMENTO DE PLAN").length,
    explicadas: variacionesSku.filter(
      (v) => v.diagnostico === "REDUCCION EXPLICADA POR CONSUMO"
    ).length,
    porExplicar: variacionesSku.filter(
      (v) =>
        v.diagnostico === "REDUCCION NO EXPLICADA" ||
        v.diagnostico === "CONSUMO MAYOR A REDUCCION"
    ).length,
    nuevos: variacionesSku.filter((v) => v.diagnostico === "NUEVO MATERIAL").length,
    retirados: variacionesSku.filter((v) => v.diagnostico === "MATERIAL RETIRADO").length,
    diferenciaTotal: variacionesSku.reduce(
      (acc, row) => acc + row.diferenciaPorExplicar,
      0
    ),
  };

  const porcentajeExplicado =
    variacionesSku.length > 0 ? (resumen.explicadas / variacionesSku.length) * 100 : 0;

  function seleccionarSap(row: VariacionSkuRow) {
    setSapSeleccionado(row.codigo);
    setBusquedaDetalleSku("");
    setFiltrosDetalleSemana(filtrosSemana);
    const defaults = row.secciones.filter(esSeccionDefaultDetalle);
    setFiltrosDetalleSeccion(defaults);
  }

  function limpiarFiltros() {
    setBusqueda("");
    setFiltrosDiagnostico([]);
    setFiltrosSeccion([]);
    setFiltrosSemana([]);
    setFiltrosSkuPlan([]);
    setBusquedaDetalleSku("");
    setFiltrosDetalleSeccion([]);
    setFiltrosDetalleSemana(filtrosSemana);
    setSoloPorExplicar(false);
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">
              Control de variaciones del plan
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Compara cambios por SAP del Plan y abre el detalle por materiales de receta.
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
              <SelectorCarga
                label="Balance anterior"
                value={cargaAntesId}
                cargas={cargas}
                onChange={setCargaAntesId}
              />
              <SelectorCarga
                label="Balance actual"
                value={cargaAhoraId}
                cargas={cargas}
                onChange={setCargaAhoraId}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4 xl:grid-cols-7">
            <Kpi titulo="SAP con aumentos" valor={resumen.aumentos} color="text-[#e30613]" border="border-red-100" />
            <Kpi titulo="Explicados por consumo" valor={resumen.explicadas} color="text-emerald-700" border="border-emerald-100" />
            <Kpi titulo="SAP por explicar" valor={resumen.porExplicar} color="text-[#e30613]" border="border-red-100" />
            <Kpi titulo="SAP nuevos" valor={resumen.nuevos} />
            <Kpi titulo="SAP retirados" valor={resumen.retirados} />
            <Kpi titulo="% explicado" valor={`${porcentajeExplicado.toFixed(1)}%`} color="text-emerald-700" border="border-emerald-100" />
            <Kpi titulo="Dif. total" valor={formatoNumero(resumen.diferenciaTotal)} color="text-[#0B4EA2]" border="border-[#2F80ED]/25" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h4 className="text-lg font-black text-slate-950">
                  Resumen de variaciones por SAP
                </h4>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Mostrando {variacionesSkuFiltradas.length} de {variacionesSku.length} SAP evaluados.
                </p>
              </div>

              <div className="grid w-full grid-cols-1 gap-3 md:w-auto md:grid-cols-5">
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar SAP, descripcion, material..."
                  className="h-11 min-w-[280px] rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10"
                />
                <MultiSelectFiltro label="Semanas" opciones={semanasDisponibles} seleccionadas={filtrosSemana} onToggle={(valor) => toggleLista(valor, setFiltrosSemana)} renderOpcion={(valor) => valor} />
                <MultiSelectFiltro label="SAP del Plan" opciones={skuPlanOpciones.map((sku) => sku.codigo)} seleccionadas={filtrosSkuPlan} onToggle={(valor) => toggleLista(valor, setFiltrosSkuPlan)} renderOpcion={(valor) => {
                  const sku = skuPlanOpciones.find((item) => item.codigo === valor);
                  return sku ? `${sku.codigo} - ${sku.descripcion}` : valor;
                }} />
                <MultiSelectFiltro label="Diagnosticos" opciones={diagnosticos} seleccionadas={filtrosDiagnostico} onToggle={(valor) => toggleLista(valor, setFiltrosDiagnostico)} renderOpcion={(valor) => valor} />
                <button
                  onClick={() => setSoloPorExplicar(!soloPorExplicar)}
                  className={`h-11 rounded-xl border px-4 text-sm font-black transition ${
                    soloPorExplicar
                      ? "border-red-100 bg-red-50 text-[#e30613]"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Por explicar
                </button>
                <button
                  onClick={limpiarFiltros}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  Limpiar
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-[#2F80ED]/25">
              <div className="max-h-[620px] overflow-auto">
                <table className="w-full min-w-[1320px] border-collapse text-xs">
                  <thead className="sticky top-0 z-20 bg-[#D8ECFF] text-[#0B4EA2]">
                    <tr className="border-b border-[#2F80ED]/25 uppercase tracking-wide">
                      <th className="px-3 py-2 text-left font-black">SAP</th>
                      <th className="px-3 py-2 text-left font-black">SKU produccion</th>
                      <th className="px-3 py-2 text-right font-black">Plan anterior</th>
                      <th className="px-3 py-2 text-right font-black">Plan actual</th>
                      <th className="px-3 py-2 text-right font-black">Movimiento</th>
                      <th className="px-3 py-2 text-right font-black">Consumo</th>
                      <th className="px-3 py-2 text-right font-black">Por explicar</th>
                      {semanasVisibles.map((sem) => (
                        <th key={`sem-head-${sem}`} className="px-3 py-2 text-right font-black">
                          {sem}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left font-black">Diagnostico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variacionesSkuFiltradas.map((row) => (
                      <tr
                        key={row.codigo}
                        onClick={() => seleccionarSap(row)}
                        className={`cursor-pointer border-b border-slate-100 transition ${
                          sapSeleccionado === row.codigo ? "bg-[#EAF4FF]" : "bg-white hover:bg-[#fbfbfa]"
                        }`}
                      >
                        <td className="px-3 py-2 font-black text-slate-950">{row.codigo}</td>
                        <td className="max-w-[300px] px-3 py-2 font-semibold text-slate-700">{row.descripcion}</td>
                        <td className="px-3 py-2 text-right font-black">{formatoNumero(row.planAnterior)}</td>
                        <td className="px-3 py-2 text-right font-black">{formatoNumero(row.planActual)}</td>
                        <td className={`px-3 py-2 text-right font-black ${row.movimientoPlan > 0 ? "text-[#e30613]" : row.movimientoPlan < 0 ? "text-emerald-700" : "text-slate-500"}`}>{formatoNumero(row.movimientoPlan)}</td>
                        <td className="px-3 py-2 text-right font-black text-[#0B4EA2]">{formatoNumero(row.consumoNotificado)}</td>
                        <td className={`px-3 py-2 text-right font-black ${Math.abs(row.diferenciaPorExplicar) > 0 ? "text-[#e30613]" : "text-emerald-700"}`}>{formatoNumero(row.diferenciaPorExplicar)}</td>
                        {semanasVisibles.map((sem) => {
                          const dato = row.semanas.find((item) => item.semana === sem);
                          const movimiento = dato?.movimiento || 0;
                          return (
                            <td key={`${row.codigo}-${sem}`} className={`px-3 py-2 text-right font-black ${movimiento > 0 ? "text-[#e30613]" : movimiento < 0 ? "text-emerald-700" : "text-slate-500"}`}>
                              {formatoNumero(movimiento)}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2">
                          <DiagnosticoBadge diagnostico={row.diagnostico} />
                        </td>
                      </tr>
                    ))}
                    {variacionesSkuFiltradas.length === 0 && (
                      <tr>
                        <td colSpan={999} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                          No hay SAP con los filtros seleccionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {seleccionado && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
            <div className="max-h-[92vh] w-[min(1600px,96vw)] overflow-auto rounded-2xl border border-[#2F80ED]/25 bg-[#EAF4FF] p-6 shadow-2xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-[#0B4EA2]">
                    Detalle de receta por SAP seleccionado
                  </p>
                  <h4 className="mt-1 text-xl font-black text-slate-950">
                    {seleccionado.codigo} - {seleccionado.descripcion}
                  </h4>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {materialesSkuPlanFiltrados.length} materiales visibles de {seleccionado.materiales.length}. Por defecto: ETIQUETA, TAPA, PREFORMA y PLASTICOS.
                  </p>
                </div>
                <button
                  onClick={() => setSapSeleccionado("")}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Cerrar detalle
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <input
                  value={busquedaDetalleSku}
                  onChange={(e) => setBusquedaDetalleSku(e.target.value)}
                  placeholder="Buscar material asociado..."
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#0057B8]"
                />
                <MultiSelectFiltro label="Semanas" opciones={semanasDisponibles} seleccionadas={filtrosDetalleSemana} onToggle={(valor) => toggleLista(valor, setFiltrosDetalleSemana)} renderOpcion={(valor) => valor} />
                <MultiSelectFiltro label="Secciones" opciones={seccionesDetalleSku} seleccionadas={filtrosDetalleSeccion} onToggle={(valor) => toggleLista(valor, setFiltrosDetalleSeccion)} renderOpcion={(valor) => valor} />
                <button
                  onClick={() => {
                    setBusquedaDetalleSku("");
                    setFiltrosDetalleSemana(filtrosSemana);
                    setFiltrosDetalleSeccion(seleccionado.secciones.filter(esSeccionDefaultDetalle));
                  }}
                  className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Vista inicial
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {seleccionado.semanas.filter((sem) => semanasDetalleVisibles.includes(sem.semana)).map((sem) => (
                  <div key={`resumen-sem-${sem.semana}`} className="rounded-xl border border-[#2F80ED]/20 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black text-slate-950">{sem.semana}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-black ${sem.movimiento > 0 ? "bg-red-50 text-[#e30613]" : sem.movimiento < 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {formatoNumero(sem.movimiento)}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-bold text-slate-600">
                      <span>Anterior: {formatoNumero(sem.anterior)}</span>
                      <span>Actual: {formatoNumero(sem.actual)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-white/70 bg-white">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full min-w-[1120px] border-collapse text-xs">
                    <thead className="sticky top-0 z-20 bg-[#D8ECFF] text-[#0B4EA2]">
                      <tr className="border-b border-[#2F80ED]/25 uppercase tracking-wide">
                        <th className="px-3 py-2 text-left font-black">Material</th>
                        <th className="px-3 py-2 text-left font-black">Texto breve</th>
                        <th className="px-3 py-2 text-left font-black">Seccion</th>
                        <th className="px-3 py-2 text-right font-black">Plan anterior</th>
                        <th className="px-3 py-2 text-right font-black">Plan actual</th>
                        <th className="px-3 py-2 text-right font-black">Movimiento</th>
                        <th className="px-3 py-2 text-right font-black">Consumo</th>
                        <th className="px-3 py-2 text-right font-black">Por explicar</th>
                        <th className="px-3 py-2 text-left font-black">Diagnostico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materialesDetalleDinamicos.map((row) => (
                        <tr key={`sku-detail-${row.codigo}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-black text-slate-950">{row.codigo}</td>
                          <td className="px-3 py-2 font-semibold text-slate-700">{row.material}</td>
                          <td className="px-3 py-2 font-semibold text-slate-500">{row.seccion || "-"}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatoNumero(row.planAnterior)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatoNumero(row.planActual)}</td>
                          <td className={`px-3 py-2 text-right font-black ${row.movimientoPlan < 0 ? "text-emerald-700" : row.movimientoPlan > 0 ? "text-[#e30613]" : "text-slate-500"}`}>{formatoNumero(row.movimientoPlan)}</td>
                          <td className="px-3 py-2 text-right font-black text-[#0B4EA2]">{formatoNumero(row.consumoNotificado)}</td>
                          <td className={`px-3 py-2 text-right font-black ${Math.abs(row.diferenciaPorExplicar) > 0 ? "text-[#e30613]" : "text-emerald-700"}`}>{formatoNumero(row.diferenciaPorExplicar)}</td>
                          <td className="px-3 py-2"><DiagnosticoBadge diagnostico={row.diagnostico} /></td>
                        </tr>
                      ))}
                      {materialesDetalleDinamicos.length === 0 && (
                        <tr>
                          <td colSpan={999} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                            No hay materiales asociados con esos filtros.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SelectorCarga({
  label,
  value,
  cargas,
  onChange,
}: {
  label: string;
  value: string;
  cargas: SavedLoad[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase text-slate-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-[#0057B8]"
      >
        {cargas.map((carga) => (
          <option key={carga.id} value={carga.id}>
            {new Date(carga.fecha).toLocaleString("es-DO")} - {carga.archivo}
          </option>
        ))}
      </select>
    </div>
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
    <div className={`rounded-2xl border ${border} bg-white p-5 shadow-sm`}>
      <p className="text-sm font-semibold text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-black ${color}`}>{valor}</p>
    </div>
  );
}

function DiagnosticoBadge({ diagnostico }: { diagnostico: Diagnostico }) {
  const peligro =
    diagnostico === "REDUCCION NO EXPLICADA" ||
    diagnostico === "CONSUMO MAYOR A REDUCCION" ||
    diagnostico === "AUMENTO DE PLAN";
  const ok = diagnostico === "REDUCCION EXPLICADA POR CONSUMO";

  return (
    <span
      className={`rounded-full px-3 py-1 text-[11px] font-black ${
        peligro
          ? "bg-red-50 text-[#e30613]"
          : ok
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {diagnostico}
    </span>
  );
}

function MultiSelectFiltro<T extends string>({
  label,
  opciones,
  seleccionadas,
  onToggle,
  renderOpcion,
}: {
  label: string;
  opciones: T[];
  seleccionadas: T[];
  onToggle: (value: T) => void;
  renderOpcion: (value: T) => string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const texto = normalizarBusqueda(busqueda);
  const opcionesFiltradas = opciones.filter((opcion) =>
    normalizarBusqueda(renderOpcion(opcion)).includes(texto)
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((actual) => !actual)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-4 text-left text-sm font-black text-slate-700 outline-none transition hover:bg-slate-50 focus:border-[#0057B8]"
      >
        <span className="truncate">
          {seleccionadas.length > 0 ? `${seleccionadas.length} ${label.toLowerCase()}` : label}
        </span>
        <span className="text-slate-400">v</span>
      </button>
      {abierto && (
        <div className="absolute left-0 right-0 top-[48px] z-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar..."
              className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-semibold outline-none focus:border-[#0057B8]"
            />
          </div>
          <div className="max-h-56 overflow-auto p-2">
            {opcionesFiltradas.map((opcion) => (
              <label
                key={opcion}
                className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-[#EAF4FF]"
              >
                <input
                  type="checkbox"
                  checked={seleccionadas.includes(opcion)}
                  onChange={() => onToggle(opcion)}
                  className="mt-0.5"
                />
                <span className="min-w-0 break-words">{renderOpcion(opcion)}</span>
              </label>
            ))}
            {opcionesFiltradas.length === 0 && (
              <p className="px-2 py-3 text-xs font-semibold text-slate-500">
                Sin opciones.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
