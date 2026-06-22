"use client";

import * as XLSX from "xlsx";
import { generarBalance } from "@/lib/balance";
import { guardarCarga, crearNombreBalance } from "@/lib/storage";
import { BalanceInfo, BalanceRow, ExcelData, SavedLoad, SkuProduccion } from "@/types/balance";
import { formatoNumero } from "@/lib/format";
import { Fragment, useEffect, useMemo, useState } from "react";

type Props = {
  datos: ExcelData;
  archivoNombre: string;
  analisis: BalanceRow[];
  setAnalisis: (data: BalanceRow[]) => void;
  infoAnalisis: BalanceInfo | null;
  setInfoAnalisis: (data: BalanceInfo | null) => void;
  currentUser: {
    id: string;
    username: string;
    fullName: string;
  };
};

type ColumnVisibility = {
  codigo: boolean;
  material: boolean;
  um: boolean;
  seccion: boolean;
  semanas: boolean;
  totalNecesidad: boolean;
  almacenes: Record<string, boolean>;
  totalExistencia: boolean;
  diferenciaTotal: boolean;
  diferenciasSemana: boolean;
  estado: boolean;
};

type SortConfig = {
  key: string;
  direction: "asc" | "desc";
} | null;

type EstadoAnalisis =
  | "DISPONIBLE"
  | "RESERVADO"
  | "REPOSICION"
  | "REABASTECIMIENTO"
  | "SIN_NECESIDAD";

const ESTADOS_ANALISIS: EstadoAnalisis[] = [
  "DISPONIBLE",
  "RESERVADO",
  "REPOSICION",
  "REABASTECIMIENTO",
  "SIN_NECESIDAD",
];

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

function obtenerHojaLocal(datos: ExcelData, nombres: string[]) {
  const objetivos = nombres.map(normalizarClave);
  return (
    Object.entries(datos).find(([nombre]) =>
      objetivos.includes(normalizarClave(nombre))
    )?.[1] || null
  );
}

function obtenerValorLocal(fila: Record<string, any>, nombres: string[]) {
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

function obtenerSemanaPlanLocal(fila: Record<string, any>, semanas: string[]) {
  const semana = String(
    obtenerValorLocal(fila, ["sem", "Semana", "Week"])
  ).trim();

  if (!semana) return "";

  return (
    semanas.find((sem) => normalizarClave(sem) === normalizarClave(semana)) ||
    semana
  );
}

function crearVisibilidadInicial(almacenes: string[]): ColumnVisibility {
  const almacenesVisibles: Record<string, boolean> = {};

  almacenes.forEach((alm) => {
    almacenesVisibles[alm] = false;
  });

  return {
    codigo: true,
    material: true,
    um: true,
    seccion: true,
    semanas: true,
    totalNecesidad: true,
    almacenes: almacenesVisibles,
    totalExistencia: true,
    diferenciaTotal: true,
    diferenciasSemana: true,
    estado: true,
  };
}

export default function BalanceModule({
  datos,
  archivoNombre,
  analisis,
  setAnalisis,
  infoAnalisis,
  setInfoAnalisis,
  currentUser,
}: Props) {
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtrosSkuProduccion, setFiltrosSkuProduccion] = useState<string[]>([]);
  const [busquedaSkuProduccion, setBusquedaSkuProduccion] = useState("");
  const [mostrarTodoSkuProduccion, setMostrarTodoSkuProduccion] = useState(false);
  const [filtrosSeccion, setFiltrosSeccion] = useState<string[]>([]);
  const [busquedaSeccion, setBusquedaSeccion] = useState("");
  const [filtrosEstado, setFiltrosEstado] = useState<EstadoAnalisis[]>([]);
  const [mostrarColumnas, setMostrarColumnas] = useState(false);
  const [semanasSeleccionadas, setSemanasSeleccionadas] = useState<string[]>([]);
  const [semanasTransito, setSemanasTransito] = useState<string[]>([]);
  const [orden, setOrden] = useState<SortConfig>(null);
  const [nombreGuardado, setNombreGuardado] = useState("");
  const [guardandoBalance, setGuardandoBalance] = useState(false);
  const [filaSeleccionada, setFilaSeleccionada] = useState<BalanceRow | null>(
    null
  );
  const [mensajeGuardado, setMensajeGuardado] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);
  const [visibilidad, setVisibilidad] = useState<ColumnVisibility>(
    crearVisibilidadInicial([])
  );

  const columnasSemana = infoAnalisis?.columnasSemana || [];
  const almacenesDetectados = infoAnalisis?.almacenesDetectados || [];
  const seccionesDetectadas = infoAnalisis?.seccionesDetectadas || [];

  useEffect(() => {
    if (almacenesDetectados.length === 0) return;

    setVisibilidad((actual) => {
      const nuevosAlmacenes: Record<string, boolean> = {};

      almacenesDetectados.forEach((alm) => {
        nuevosAlmacenes[alm] = actual.almacenes[alm] ?? false;
      });

      return {
        ...actual,
        almacenes: nuevosAlmacenes,
      };
    });
  }, [almacenesDetectados.join("|")]);

  useEffect(() => {
    setSemanasSeleccionadas((actual) => {
      const validas = actual.filter((sem) => columnasSemana.includes(sem));
      return validas.length > 0 ? validas : columnasSemana;
    });
    setSemanasTransito((actual) =>
      actual.filter((sem) => columnasSemana.includes(sem))
    );
  }, [columnasSemana.join("|")]);

  function toggleCampo(campo: keyof Omit<ColumnVisibility, "almacenes">) {
    setVisibilidad((actual) => ({
      ...actual,
      [campo]: !actual[campo],
    }));
  }

  function vistaEjecutiva() {
    const almacenesBase: Record<string, boolean> = {};
    almacenesDetectados.forEach((alm) => {
      almacenesBase[alm] = false;
    });

    setVisibilidad({
      codigo: true,
      material: true,
      um: true,
      seccion: true,
      semanas: true,
      totalNecesidad: true,
      almacenes: almacenesBase,
      totalExistencia: true,
      diferenciaTotal: true,
      diferenciasSemana: true,
      estado: true,
    });
  }

  function toggleSemanaTransito(semana: string) {
    setSemanasTransito((actual) =>
      actual.includes(semana)
        ? actual.filter((item) => item !== semana)
        : [...actual, semana]
    );
  }

  const semanasActivas = semanasSeleccionadas;

  const skusProduccionDesdePlan = useMemo<SkuProduccion[]>(() => {
    const hojaPlan = obtenerHojaLocal(datos, ["Plan"]);
    const mapa = new Map<string, SkuProduccion & { semanas: string[] }>();

    (hojaPlan?.datos || []).forEach((fila: Record<string, any>) => {
      const codigo = String(
        obtenerValorLocal(fila, ["SAP", "Codigo SAP", "Código SAP"])
      ).trim();
      if (!codigo) return;

      const descripcion = String(
        obtenerValorLocal(fila, ["SKU", "Descripcion SKU", "Descripción SKU", "Producto"])
      ).trim();
      const semana = obtenerSemanaPlanLocal(fila, columnasSemana);

      if (!mapa.has(codigo)) {
        mapa.set(codigo, {
          codigo,
          descripcion: descripcion || codigo,
          semanas: [],
        });
      }

      const item = mapa.get(codigo);
      if (item && descripcion && item.descripcion === codigo) item.descripcion = descripcion;
      if (item && semana && !item.semanas.includes(semana)) item.semanas.push(semana);
    });

    return Array.from(mapa.values());
  }, [datos, columnasSemana.join("|")]);

  const componentesPorSkuProduccion = useMemo(() => {
    const hojaReceta = obtenerHojaLocal(datos, ["Receta"]);
    const mapa = new Map<string, Set<string>>();

    (hojaReceta?.datos || []).forEach((fila: Record<string, any>) => {
      const codigoSku = String(
        obtenerValorLocal(fila, ["Codigo", "Código", "SAP", "SKU", "Material padre"])
      ).trim();
      const componente = String(
        obtenerValorLocal(fila, [
          "N° componente",
          "Nº componente",
          "N° Componente",
          "Nº Componente",
          "Material",
          "Código",
          "Codigo",
        ])
      ).trim();

      if (!codigoSku || !componente) return;
      if (!mapa.has(codigoSku)) mapa.set(codigoSku, new Set());
      mapa.get(codigoSku)?.add(componente);
    });

    return mapa;
  }, [datos]);

  const opcionesSkuProduccion = useMemo(() => {
    const semanasSet = new Set(semanasActivas);
    const mapa = new Map<string, SkuProduccion>();

    skusProduccionDesdePlan.forEach((sku) => {
      if (!sku.codigo) return;
      const actual = mapa.get(sku.codigo);
      mapa.set(sku.codigo, {
        codigo: sku.codigo,
        descripcion: sku.descripcion || actual?.descripcion || sku.codigo,
        semanas: Array.from(new Set([...(actual?.semanas || []), ...(sku.semanas || [])])),
      });
    });

    return Array.from(mapa.values())
      .filter((sku) => {
        if (semanasSet.size === 0 || !sku.semanas || sku.semanas.length === 0) {
          return true;
        }

        return sku.semanas.some((sem) => semanasSet.has(sem));
      })
      .sort((a, b) =>
        String(a.codigo).localeCompare(String(b.codigo), "es", {
          numeric: true,
          sensitivity: "base",
        })
      );
  }, [
    skusProduccionDesdePlan,
    semanasActivas.join("|"),
  ]);

  const skusProduccionSeleccionados = opcionesSkuProduccion.filter((sku) =>
    filtrosSkuProduccion.includes(sku.codigo)
  );

  const opcionesSkuProduccionFiltradas = useMemo(() => {
    const texto = normalizarBusqueda(busquedaSkuProduccion);
    if (!texto) return opcionesSkuProduccion;

    return opcionesSkuProduccion.filter(
      (sku) =>
        normalizarBusqueda(sku.codigo).includes(texto) ||
        normalizarBusqueda(sku.descripcion).includes(texto)
    );
  }, [opcionesSkuProduccion, busquedaSkuProduccion]);

  const seccionesFiltradas = useMemo(() => {
    const texto = normalizarBusqueda(busquedaSeccion);
    if (!texto) return seccionesDetectadas;

    return seccionesDetectadas.filter((seccion) =>
      normalizarBusqueda(seccion).includes(texto)
    );
  }, [seccionesDetectadas, busquedaSeccion]);

  useEffect(() => {
    function cerrarMenus(event: MouseEvent) {
      const objetivo = event.target as HTMLElement | null;
      if (objetivo?.closest("[data-filter-menu]")) return;

      document.querySelectorAll<HTMLDetailsElement>("[data-filter-menu][open]").forEach((menu) => {
        menu.open = false;
      });
    }

    document.addEventListener("mousedown", cerrarMenus);
    return () => document.removeEventListener("mousedown", cerrarMenus);
  }, []);

  useEffect(() => {
    if (filtrosSkuProduccion.length === 0) return;
    const validos = new Set(opcionesSkuProduccion.map((sku) => sku.codigo));
    const siguientes = filtrosSkuProduccion.filter((codigo) => validos.has(codigo));
    if (siguientes.length === filtrosSkuProduccion.length) return;
    setFiltrosSkuProduccion(siguientes);
    setMostrarTodoSkuProduccion(false);
  }, [filtrosSkuProduccion, opcionesSkuProduccion]);

  function toggleSemanaAnalisis(semana: string) {
    setSemanasSeleccionadas((actual) =>
      actual.includes(semana)
        ? actual.filter((item) => item !== semana)
        : [...actual, semana]
    );
  }

  function toggleFiltroLista<T extends string>(
    valor: T,
    setter: (updater: (actual: T[]) => T[]) => void
  ) {
    setter((actual) =>
      actual.includes(valor)
        ? actual.filter((item) => item !== valor)
        : [...actual, valor]
    );
  }

  function totalNecesidadSeleccionada(row: BalanceRow) {
    return semanasActivas.reduce(
      (acc, sem) => acc + (row.necesidadesPorSemana[sem] || 0),
      0
    );
  }

  function diferenciaSeleccionada(row: BalanceRow) {
    return row.totalExistencia - totalNecesidadSeleccionada(row);
  }

  function estadoSeleccionado(row: BalanceRow): EstadoAnalisis {
    const necesidad = totalNecesidadSeleccionada(row);
    const diferencia = diferenciaSeleccionada(row);

    if (necesidad <= 0) return "SIN_NECESIDAD";
    if (diferencia > 0) return "DISPONIBLE";
    if (diferencia === 0) return "RESERVADO";
    return row.totalExistencia > 0 ? "REPOSICION" : "REABASTECIMIENTO";
  }

  function estadoClasses(estado: EstadoAnalisis) {
    if (estado === "DISPONIBLE") return "bg-emerald-50 text-emerald-700";
    if (estado === "RESERVADO") return "bg-blue-50 text-blue-700";
    if (estado === "REPOSICION") return "bg-sky-50 text-[#0B4EA2]";
    if (estado === "REABASTECIMIENTO") return "bg-blue-50 text-[#0057B8]";
    return "bg-slate-100 text-slate-600";
  }

  function estadoTone(estado: EstadoAnalisis): "neutral" | "success" | "danger" | "warning" {
    if (estado === "DISPONIBLE") return "success";
    if (estado === "REPOSICION") return "warning";
    if (estado === "REABASTECIMIENTO") return "danger";
    return "neutral";
  }

  function ordenarPor(key: string) {
    setOrden((actual) => {
      if (actual?.key !== key) return { key, direction: "asc" };
      return {
        key,
        direction: actual.direction === "asc" ? "desc" : "asc",
      };
    });
  }

  function obtenerValorOrden(row: BalanceRow, key: string) {
    if (key.startsWith("sem:")) {
      return row.necesidadesPorSemana[key.replace("sem:", "")] || 0;
    }
    if (key.startsWith("alm:")) {
      return row.almacenes[key.replace("alm:", "")] || 0;
    }
    if (key.startsWith("dif:")) {
      return row.diferenciasPorSemana[key.replace("dif:", "")] || 0;
    }
    if (key.startsWith("transitoFecha:")) {
      const semana = key.replace("transitoFecha:", "");
      return row.transitosPorSemana?.[semana]?.[0]?.fechaOperativa || "";
    }
    if (key.startsWith("transitoCantidad:")) {
      const semana = key.replace("transitoCantidad:", "");
      return row.recepcionesPorSemana?.[semana] || 0;
    }

    switch (key) {
      case "codigo":
        return row.codigo;
      case "material":
        return row.material;
      case "um":
        return row.um;
      case "seccion":
        return row.seccion;
      case "totalNecesidad":
        return totalNecesidadSeleccionada(row);
      case "totalExistencia":
        return row.totalExistencia;
      case "diferenciaTotal":
        return diferenciaSeleccionada(row);
      case "estado":
        return estadoSeleccionado(row);
      default:
        return "";
    }
  }

  function ejecutarBalance() {
    try {
      const resultado = generarBalance(datos);

      setAnalisis(resultado.analisis);
      setInfoAnalisis(resultado.info);
      setSemanasSeleccionadas(resultado.info.columnasSemana || []);
    } catch (error: any) {
      alert(error.message);
    }
  }

  function abrirModalGuardarBalance() {
    if (!infoAnalisis || analisis.length === 0) {
      setMensajeGuardado({
        tipo: "error",
        texto: "Primero genera un balance.",
      });
      return;
    }

    setNombreGuardado(crearNombreBalance());
  }

  async function confirmarGuardarBalance() {
    if (!infoAnalisis || analisis.length === 0 || !nombreGuardado.trim()) {
      setMensajeGuardado({
        tipo: "error",
        texto: "No hay balance listo para guardar.",
      });
      return;
    }

    setGuardandoBalance(true);
    setMensajeGuardado(null);

    const carga: SavedLoad = {
      id: crypto.randomUUID(),
      fecha: new Date().toISOString(),
      createdBy: currentUser,
      archivo: nombreGuardado.trim(),
      hojas: Object.keys(datos),
      analisis,
      info: infoAnalisis,
    };

    try {
      await guardarCarga(carga);
      setNombreGuardado("");
      setMensajeGuardado({
        tipo: "ok",
        texto: "Balance guardado correctamente.",
      });
    } catch (error: any) {
      setMensajeGuardado({
        tipo: "error",
        texto: error.message || "No se pudo guardar el balance.",
      });
    } finally {
      setGuardandoBalance(false);
    }
  }

  async function guardarBalanceActual() {
    if (!infoAnalisis || analisis.length === 0) {
      alert("Primero genera un balance.");
      return;
    }

    const nombreBalance = crearNombreBalance();

    const confirmar = confirm(
      `¿Deseas guardar este balance como:\n\n${nombreBalance}?`
    );

    if (!confirmar) return;

    const carga: SavedLoad = {
      id: crypto.randomUUID(),
      fecha: new Date().toISOString(),
      createdBy: currentUser,
      archivo: nombreBalance,
      hojas: Object.keys(datos),
      analisis,
      info: infoAnalisis,
    };

    try {
      await guardarCarga(carga);
      alert("Balance guardado correctamente.");
    } catch (error: any) {
      alert(error.message || "No se pudo guardar el balance.");
    }
  }

  const filtrado = analisis.filter((row) => {
    const texto = normalizarBusqueda(filtroTexto);
    const estadoActual = estadoSeleccionado(row);
    const necesidadSeleccionada = totalNecesidadSeleccionada(row);

    const coincideTexto =
      texto === "" ||
      normalizarBusqueda(String(row.codigo)).includes(texto) ||
      normalizarBusqueda(String(row.material)).includes(texto) ||
      normalizarBusqueda(String(row.seccion)).includes(texto) ||
      normalizarBusqueda(estadoActual).includes(texto);

    const coincideSkuProduccion =
      filtrosSkuProduccion.length === 0 ||
      filtrosSkuProduccion.some((codigoSku) => {
        const estaEnFila = (row.skusProduccion || []).some(
          (sku) => sku.codigo === codigoSku
        );
        const estaEnReceta = componentesPorSkuProduccion
          .get(codigoSku)
          ?.has(String(row.codigo));

        return estaEnFila || estaEnReceta;
      });

    const coincideNecesidadSku =
      filtrosSkuProduccion.length === 0 ||
      mostrarTodoSkuProduccion ||
      necesidadSeleccionada > 0;

    const coincideSeccion =
      filtrosSeccion.length === 0 ||
      filtrosSeccion.some((seccion) => (row.seccionesArray || []).includes(seccion));

    const coincideEstado =
      filtrosEstado.length === 0 || filtrosEstado.includes(estadoActual);

    return (
      coincideTexto &&
      coincideSkuProduccion &&
      coincideNecesidadSku &&
      coincideSeccion &&
      coincideEstado
    );
  });

  const filtradoOrdenado = useMemo(() => {
    if (!orden) return filtrado;

    return [...filtrado].sort((a, b) => {
      const valorA = obtenerValorOrden(a, orden.key);
      const valorB = obtenerValorOrden(b, orden.key);

      let comparacion = 0;
      if (typeof valorA === "number" && typeof valorB === "number") {
        comparacion = valorA - valorB;
      } else {
        comparacion = String(valorA ?? "").localeCompare(
          String(valorB ?? ""),
          "es",
          { numeric: true, sensitivity: "base" }
        );
      }

      return orden.direction === "asc" ? comparacion : -comparacion;
    });
  }, [filtrado, orden]);

  function exportar() {
    const dataExport = filtradoOrdenado.map((row) => {
      const base: any = {};

      if (visibilidad.codigo) base["N° componente"] = row.codigo;
      if (visibilidad.material) base["Texto breve-objeto"] = row.material;
      if (visibilidad.um) base.UM = row.um;
      if (visibilidad.seccion) base.Seccion = row.seccion;

      almacenesDetectados.forEach((alm) => {
        if (visibilidad.almacenes[alm]) base[alm] = row.almacenes[alm] || 0;
      });
      if (visibilidad.semanas) {
        semanasActivas.forEach((sem) => {
          base[sem] = row.necesidadesPorSemana[sem] || 0;
          if (semanasTransito.includes(sem)) {
            const transitos = row.transitosPorSemana?.[sem] || [];
            const fechas = Array.from(
              new Set(
                transitos
                  .map((item) => item.fechaOperativa)
                  .filter(Boolean)
              )
            );

            base[`Fecha operativa ${sem}`] = fechas.join(", ");
            base[`Cantidad transito ${sem}`] =
              row.recepcionesPorSemana?.[sem] || 0;
          }
        });
      }

      if (visibilidad.totalNecesidad) {
        base["Suma de Total necesidad"] = totalNecesidadSeleccionada(row);
      }

      if (visibilidad.totalExistencia) {
        base["AG01 + AG04"] = row.totalExistencia;
      }

      if (visibilidad.diferenciaTotal) {
        base["Diferencia total"] = diferenciaSeleccionada(row);
      }

      if (visibilidad.diferenciasSemana) {
        semanasActivas.forEach((sem) => {
          base[`Dif. ${sem}`] = row.diferenciasPorSemana[sem] || 0;
        });
      }

      if (visibilidad.estado) base.Estado = estadoSeleccionado(row);

      return base;
    });

    const ws = XLSX.utils.json_to_sheet(dataExport);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Analisis");
    XLSX.writeFile(wb, "analisis_balance_materiales.xlsx");
  }

  const resumenValoresInventario = analisis.reduce(
    (acc, row) => {
      acc.libre += row.valorInventarioLibre || 0;
      acc.bloqueado += row.valorInventarioBloqueado || 0;
      acc.total += row.valorStockTotal || 0;
      return acc;
    },
    { libre: 0, bloqueado: 0, total: 0 }
  );
  const valoresInventario = {
    libre:
      infoAnalisis?.valorInventarioLibre ?? resumenValoresInventario.libre,
    bloqueado:
      infoAnalisis?.valorInventarioBloqueado ??
      resumenValoresInventario.bloqueado,
    total:
      infoAnalisis?.valorInventarioTotal ?? resumenValoresInventario.total,
  };
  const semanasResumen = semanasActivas.length > 0 ? semanasActivas : columnasSemana;
  const materialesEnRiesgo = analisis.filter((row) =>
    semanasResumen.some((sem) => (row.diferenciasPorSemana[sem] || 0) < 0)
  ).length;
  const totalSkuLibre = infoAnalisis?.totalSkuLibre;
  const totalSkuBloqueado = infoAnalisis?.totalSkuBloqueado;
  const totalSkuExistencias = infoAnalisis?.totalSkuExistencias;
  const conteosSkuActualizados =
    totalSkuLibre !== undefined &&
    totalSkuBloqueado !== undefined &&
    totalSkuExistencias !== undefined;
  const mostrarSku = (valor?: number) =>
    typeof valor === "number" ? valor.toLocaleString("en-US") : "Regenerar";
  const indicadoresPorSemana = semanasResumen.map((sem) => {
    const criticos = analisis.filter(
      (row) => (row.diferenciasPorSemana[sem] || 0) < 0
    ).length;
    const faltante = analisis.reduce((acc, row) => {
      const diferencia = row.diferenciasPorSemana[sem] || 0;
      return diferencia < 0 ? acc + Math.abs(diferencia) : acc;
    }, 0);

    return {
      semana: sem,
      label: "SKU Criticos",
      criticos,
      faltante,
    };
  });

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-950">
              Balance de materiales
            </h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Base de cálculo: AG01 + AG04 contra necesidades por semana.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={ejecutarBalance}
              className="rounded-xl bg-[#0057B8] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#003B7A]"
            >
              Generar balance
            </button>

            {analisis.length > 0 && (
              <>
                <button
                  onClick={abrirModalGuardarBalance}
                  className="rounded-xl border border-[#2F80ED] bg-white px-5 py-3 text-sm font-black text-[#0B4EA2] shadow-sm transition hover:bg-[#EAF4FF]"
                >
                  Guardar balance
                </button>

                <button
                  onClick={exportar}
                  className="rounded-xl bg-[#2F80ED] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#1D4ED8]"
                >
                  Exportar Excel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {mensajeGuardado && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-bold shadow-sm ${
            mensajeGuardado.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-blue-200 bg-blue-50 text-[#0057B8]"
          }`}
        >
          {mensajeGuardado.texto}
        </div>
      )}

      {infoAnalisis && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">
                Vr.Stock Alm. Libre Utilizacion
              </p>
              <p className="mt-1 truncate text-xl font-black text-emerald-700">
                {formatoNumero(valoresInventario.libre)}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                No. Total SKU: {mostrarSku(totalSkuLibre)}
              </p>
            </div>

            <div className="rounded-xl border border-[#2F80ED]/25 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">
                Vr.Stock Alm. Bloqueado
              </p>
              <p className="mt-1 truncate text-xl font-black text-[#0B4EA2]">
                {formatoNumero(valoresInventario.bloqueado)}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                No. Total SKU: {mostrarSku(totalSkuBloqueado)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">
                Vr.Total Stock Almacen
              </p>
              <p className="mt-1 truncate text-xl font-black text-slate-950">
                {formatoNumero(valoresInventario.total)}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                No. Total SKU: {mostrarSku(totalSkuExistencias)}
              </p>
            </div>
          </div>

          {!conteosSkuActualizados && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold text-sky-800">
              Este balance fue guardado antes de calcular los SKU desde Existencias. Genera el balance nuevamente desde el Excel y vuelve a guardarlo para ver 318 / 10 / 321.
            </div>
          )}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">
                No. Materiales en riesgo
              </p>
              <p className="mt-1 truncate text-xl font-black text-[#0057B8]">
                {materialesEnRiesgo}
              </p>
            </div>

            {indicadoresPorSemana.map((item) => (
              <div
                key={item.semana}
                className="rounded-xl border border-[#2F80ED]/25 bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-semibold text-slate-500">
                  {item.label}
                </p>
                <p className="mt-1 truncate text-xl font-black text-[#0B4EA2]">
                  {item.criticos}
                </p>
                <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                  {item.semana} - Faltante: {formatoNumero(item.faltante)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {analisis.length > 0 && (
        <div
          className="origin-top-left rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          style={{ zoom: 0.8 } as any}
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h4 className="text-base font-black text-slate-950">
                Análisis de componentes
              </h4>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                Mostrando {filtrado.length} de {analisis.length} componentes.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-[minmax(240px,1fr)_minmax(260px,1fr)_minmax(220px,0.85fr)_minmax(220px,0.85fr)_140px_160px]">
              <input
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder="Buscar componente, descripción, sección..."
                className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none transition focus:border-[#0057B8] focus:ring-2 focus:ring-[#0057B8]/10"
              />

              <details data-filter-menu className="relative rounded-lg border border-slate-300 bg-white">
                <summary className="flex h-9 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-bold text-slate-700">
                  <span className="truncate">
                    {filtrosSkuProduccion.length === 0
                      ? "Selecciona SAP del Plan"
                      : `${filtrosSkuProduccion.length} SAP seleccionados`}
                  </span>
                  <span className="text-[10px] text-slate-400">▼</span>
                </summary>
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-300 bg-white p-2 shadow-xl">
                  <input
                    value={busquedaSkuProduccion}
                    onChange={(e) => setBusquedaSkuProduccion(e.target.value)}
                    placeholder="Buscar SAP o descripcion..."
                    className="mb-2 h-8 w-full rounded-md border border-slate-300 px-2 text-xs font-semibold outline-none focus:border-[#0057B8]"
                  />
                  {opcionesSkuProduccion.length === 0 ? (
                    <p className="px-2 py-1 text-xs font-bold text-blue-600">
                      No hay SAP detectados en la hoja Plan.
                    </p>
                  ) : opcionesSkuProduccionFiltradas.length === 0 ? (
                    <p className="px-2 py-1 text-xs font-bold text-slate-500">
                      Sin resultados para esa busqueda.
                    </p>
                  ) : (
                    opcionesSkuProduccionFiltradas.map((sku) => (
                      <label
                        key={sku.codigo}
                        className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-blue-50"
                      >
                        <input
                          type="checkbox"
                          checked={filtrosSkuProduccion.includes(sku.codigo)}
                          onChange={() => {
                            toggleFiltroLista(sku.codigo, setFiltrosSkuProduccion);
                            setMostrarTodoSkuProduccion(false);
                          }}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="font-black text-slate-950">{sku.codigo}</span>
                          <span className="block truncate text-slate-500">
                            {sku.descripcion}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </details>

              <details data-filter-menu className="relative rounded-lg border border-slate-300 bg-white">
                <summary className="flex h-9 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-bold text-slate-700">
                  <span className="truncate">
                    {filtrosSeccion.length === 0
                      ? "Todas las secciones"
                      : `${filtrosSeccion.length} secciones`}
                  </span>
                  <span className="text-[10px] text-slate-400">▼</span>
                </summary>
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-300 bg-white p-2 shadow-xl">
                  <input
                    value={busquedaSeccion}
                    onChange={(e) => setBusquedaSeccion(e.target.value)}
                    placeholder="Buscar seccion..."
                    className="mb-2 h-8 w-full rounded-md border border-slate-300 px-2 text-xs font-semibold outline-none focus:border-[#0057B8]"
                  />
                  {seccionesFiltradas.length === 0 ? (
                    <p className="px-2 py-1 text-xs font-bold text-slate-500">
                      Sin resultados para esa busqueda.
                    </p>
                  ) : seccionesFiltradas.map((s) => (
                    <label
                      key={s}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-blue-50"
                    >
                      <input
                        type="checkbox"
                        checked={filtrosSeccion.includes(s)}
                        onChange={() => toggleFiltroLista(s, setFiltrosSeccion)}
                      />
                      <span className="truncate">{s}</span>
                    </label>
                  ))}
                </div>
              </details>

              <details data-filter-menu className="relative rounded-lg border border-slate-300 bg-white">
                <summary className="flex h-9 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-bold text-slate-700">
                  <span className="truncate">
                    {filtrosEstado.length === 0
                      ? "Todos los estados"
                      : `${filtrosEstado.length} estados`}
                  </span>
                  <span className="text-[10px] text-slate-400">▼</span>
                </summary>
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-300 bg-white p-2 shadow-xl">
                  {ESTADOS_ANALISIS.map((estado) => (
                    <label
                      key={estado}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-blue-50"
                    >
                      <input
                        type="checkbox"
                        checked={filtrosEstado.includes(estado)}
                        onChange={() => toggleFiltroLista(estado, setFiltrosEstado)}
                      />
                      <span className="truncate">{estado}</span>
                    </label>
                  ))}
                </div>
              </details>

              <button
                onClick={() => setMostrarColumnas(!mostrarColumnas)}
                className="h-9 rounded-lg border border-[#2F80ED]/50 bg-[#EAF4FF] px-3 text-xs font-black text-[#0B4EA2] transition hover:bg-[#D8ECFF]"
              >
                {mostrarColumnas ? "Ocultar panel" : "Columnas"}
              </button>

              <button
                onClick={() => {
                  setFiltroTexto("");
                  setFiltrosSkuProduccion([]);
                  setBusquedaSkuProduccion("");
                  setMostrarTodoSkuProduccion(false);
                  setFiltrosSeccion([]);
                  setBusquedaSeccion("");
                  setFiltrosEstado([]);
                }}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          {filtrosSkuProduccion.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2F80ED]/30 bg-[#EAF4FF] px-3 py-2">
              <p className="text-xs font-bold text-[#6f4b00]">
                SAP seleccionados:{" "}
                {skusProduccionSeleccionados
                  .map((sku) => `${sku.codigo} - ${sku.descripcion}`)
                  .join(" · ")}{" "}
                · {mostrarTodoSkuProduccion
                  ? "Mostrando receta completa"
                  : "Mostrando solo materiales con necesidad en las semanas filtradas"}
              </p>
              <button
                onClick={() => setMostrarTodoSkuProduccion((actual) => !actual)}
                className="h-8 rounded-lg border border-[#2F80ED]/50 bg-white px-3 text-xs font-black text-[#0B4EA2] transition hover:bg-[#D8ECFF]"
              >
                {mostrarTodoSkuProduccion ? "Ocultar sin necesidad" : "Ver todo SAP"}
              </button>
            </div>
          )}

          <div className="mt-3 rounded-xl border border-slate-200 bg-[#fbfbfa] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h5 className="text-sm font-black text-slate-950">
                  Filtro de semanas
                </h5>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  Por defecto se evaluan todas. Desmarca las semanas que no quieras analizar.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSemanasSeleccionadas(columnasSemana)}
                  className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  Todas
                </button>
                <button
                  onClick={() => setSemanasSeleccionadas([])}
                  className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  Limpiar
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {columnasSemana.map((sem) => {
                const activo = semanasActivas.includes(sem);

                return (
                  <button
                    key={sem}
                    onClick={() => toggleSemanaAnalisis(sem)}
                    className={`h-8 rounded-lg border px-3 text-xs font-black transition ${
                      activo
                        ? "border-[#0057B8]/30 bg-blue-50 text-[#0057B8]"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {sem}
                  </button>
                );
              })}
            </div>
          </div>

          {mostrarColumnas && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-[#fbfbfa] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h5 className="text-sm font-black text-slate-950">
                    Visibilidad de columnas
                  </h5>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Oculta almacenes o columnas para una vista más limpia.
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={vistaEjecutiva}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                  >
                    Vista ejecutiva
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
                <Toggle
                  label="Componente"
                  checked={visibilidad.codigo}
                  onClick={() => toggleCampo("codigo")}
                />
                <Toggle
                  label="Material"
                  checked={visibilidad.material}
                  onClick={() => toggleCampo("material")}
                />
                <Toggle
                  label="UM"
                  checked={visibilidad.um}
                  onClick={() => toggleCampo("um")}
                />
                <Toggle
                  label="Sección"
                  checked={visibilidad.seccion}
                  onClick={() => toggleCampo("seccion")}
                />
                <Toggle
                  label="Semanas"
                  checked={visibilidad.semanas}
                  onClick={() => toggleCampo("semanas")}
                />
                <Toggle
                  label="Total necesidad"
                  checked={visibilidad.totalNecesidad}
                  onClick={() => toggleCampo("totalNecesidad")}
                />
                <Toggle
                  label="AG01 + AG04"
                  checked={visibilidad.totalExistencia}
                  onClick={() => toggleCampo("totalExistencia")}
                />
                <Toggle
                  label="Diferencia total"
                  checked={visibilidad.diferenciaTotal}
                  onClick={() => toggleCampo("diferenciaTotal")}
                />
                <Toggle
                  label="Dif. semanas"
                  checked={visibilidad.diferenciasSemana}
                  onClick={() => toggleCampo("diferenciasSemana")}
                />
                <Toggle
                  label="Estado"
                  checked={visibilidad.estado}
                  onClick={() => toggleCampo("estado")}
                />
              </div>
              {almacenesDetectados.length > 0 && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <p className="mb-2 text-xs font-black uppercase text-slate-500">
                    Subalmacenes
                  </p>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-6 xl:grid-cols-10">
                    {almacenesDetectados.map((alm) => (
                      <Toggle
                        key={alm}
                        label={alm}
                        checked={visibilidad.almacenes[alm] || false}
                        onClick={() =>
                          setVisibilidad((actual) => ({
                            ...actual,
                            almacenes: {
                              ...actual.almacenes,
                              [alm]: !actual.almacenes[alm],
                            },
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[1080px] border-collapse text-[11px]">
                <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    {visibilidad.codigo && (
                      <SortHeader
                        label="Material"
                        sortKey="codigo"
                        orden={orden}
                        onSort={ordenarPor}
                      />
                    )}

                    {visibilidad.material && (
                      <SortHeader
                        label="Texto breve del material"
                        sortKey="material"
                        orden={orden}
                        onSort={ordenarPor}
                      />
                    )}

                    {visibilidad.um && (
                      <SortHeader
                        label="UM"
                        sortKey="um"
                        orden={orden}
                        onSort={ordenarPor}
                      />
                    )}

                    {visibilidad.seccion && (
                      <SortHeader
                        label="Seccion"
                        sortKey="seccion"
                        orden={orden}
                        onSort={ordenarPor}
                      />
                    )}

                    {visibilidad.semanas &&
                      semanasActivas.map((sem) => {
                        const activo = semanasTransito.includes(sem);

                        return (
                          <Fragment key={sem}>
                            <th className="px-2.5 py-1.5 text-right font-black">
                              <button
                                type="button"
                                onClick={() => toggleSemanaTransito(sem)}
                                className={`w-full text-right uppercase transition ${
                                  activo
                                    ? "text-[#0057B8]"
                                    : "text-slate-500 hover:text-slate-950"
                                }`}
                                title="Mostrar u ocultar plan en transito"
                              >
                                {sem}
                              </button>
                              <button
                                type="button"
                                onClick={() => ordenarPor(`sem:${sem}`)}
                                className="mt-1 text-[10px] font-black text-slate-400 hover:text-slate-950"
                              >
                                Orden {orden?.key === `sem:${sem}` ? orden.direction : ""}
                              </button>
                            </th>
                            {activo && (
                              <>
                                <SortHeader
                                  label={`Fecha operativa ${sem}`}
                                  sortKey={`transitoFecha:${sem}`}
                                  orden={orden}
                                  onSort={ordenarPor}
                                  align="right"
                                />
                                <SortHeader
                                  label={`Cantidad transito ${sem}`}
                                  sortKey={`transitoCantidad:${sem}`}
                                  orden={orden}
                                  onSort={ordenarPor}
                                  align="right"
                                />
                              </>
                            )}
                          </Fragment>
                        );
                      })}

                    {visibilidad.totalNecesidad && (
                      <SortHeader
                        label="Total necesidad"
                        sortKey="totalNecesidad"
                        orden={orden}
                        onSort={ordenarPor}
                        align="right"
                      />
                    )}

                    {visibilidad.totalExistencia && (
                      <SortHeader
                        label="AG01 + AG04"
                        sortKey="totalExistencia"
                        orden={orden}
                        onSort={ordenarPor}
                        align="right"
                      />
                    )}

                    
                    {almacenesDetectados
                      .filter((alm) => visibilidad.almacenes[alm])
                      .map((alm) => (
                        <SortHeader
                          key={`alm-${alm}`}
                          label={alm}
                          sortKey={`alm:${alm}`}
                          orden={orden}
                          onSort={ordenarPor}
                          align="right"
                        />
                      ))}                    {visibilidad.diferenciaTotal && (
                      <SortHeader
                        label="Diferencia"
                        sortKey="diferenciaTotal"
                        orden={orden}
                        onSort={ordenarPor}
                        align="right"
                      />
                    )}

                    {visibilidad.diferenciasSemana &&
                      semanasActivas.map((sem) => (
                        <SortHeader
                          key={`dif-${sem}`}
                          label={`Dif. ${sem}`}
                          sortKey={`dif:${sem}`}
                          orden={orden}
                          onSort={ordenarPor}
                          align="right"
                        />
                      ))}

                    {visibilidad.estado && (
                      <SortHeader
                        label="Estado"
                        sortKey="estado"
                        orden={orden}
                        onSort={ordenarPor}
                      />
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filtradoOrdenado.map((row, i) => (
                    <tr
                      key={`${row.codigo}-${i}`}
                      onClickCapture={() => setFilaSeleccionada(row)}
                      onMouseDown={() => setFilaSeleccionada(row)}
                      onDoubleClick={() => setFilaSeleccionada(row)}
                      className="cursor-pointer border-b border-slate-100 bg-white transition hover:bg-[#D8ECFF] active:bg-[#ffe7a3]"
                    >
                      {visibilidad.codigo && (
                        <td className="px-2.5 py-1.5 font-black text-slate-950">
                          {row.codigo}
                        </td>
                      )}

                      {visibilidad.material && (
                        <td className="max-w-[300px] px-2.5 py-1.5 font-medium text-slate-700">
                          {row.material}
                        </td>
                      )}

                      {visibilidad.um && (
                        <td className="px-2.5 py-1.5 font-semibold text-slate-500">
                          {row.um}
                        </td>
                      )}

                      {visibilidad.seccion && (
                        <td className="px-2.5 py-1.5 font-semibold text-slate-500">
                          {row.seccion || "-"}
                        </td>
                      )}

                      {visibilidad.semanas &&
                        semanasActivas.map((sem) => {
                          const activo = semanasTransito.includes(sem);
                          const transitos = row.transitosPorSemana?.[sem] || [];
                          const fechas = Array.from(
                            new Set(
                              transitos
                                .map((item) => item.fechaOperativa)
                                .filter(Boolean)
                            )
                          );
                          const cantidadTransito =
                            row.recepcionesPorSemana?.[sem] || 0;

                          return (
                            <Fragment key={sem}>
                              <td className="px-2.5 py-1.5 text-right font-medium text-slate-700">
                                {formatoNumero(
                                  row.necesidadesPorSemana[sem] || 0
                                )}
                              </td>
                              {activo && (
                                <>
                                  <td className="min-w-[130px] px-2.5 py-1.5 text-right font-semibold text-slate-600">
                                    {fechas.length > 0 ? fechas.join(", ") : "-"}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-right font-black text-[#0B4EA2]">
                                    {formatoNumero(cantidadTransito)}
                                  </td>
                                </>
                              )}
                            </Fragment>
                          );
                        })}

                      {visibilidad.totalNecesidad && (
                        <td className="px-2.5 py-1.5 text-right font-black text-slate-950">
                          {formatoNumero(totalNecesidadSeleccionada(row))}
                        </td>
                      )}

                      {visibilidad.totalExistencia && (
                        <td className="px-2.5 py-1.5 text-right font-black text-slate-950">
                          {formatoNumero(row.totalExistencia)}
                        </td>
                      )}

                      
                      {almacenesDetectados
                        .filter((alm) => visibilidad.almacenes[alm])
                        .map((alm) => (
                          <td key={`alm-${alm}`} className="px-2.5 py-1.5 text-right font-black text-slate-700">
                            {formatoNumero(row.almacenes[alm] || 0)}
                          </td>
                        ))}                      {visibilidad.diferenciaTotal && (
                        <td
                          className={`px-2.5 py-1.5 text-right font-black ${
                            diferenciaSeleccionada(row) < 0
                              ? "text-[#0057B8]"
                              : "text-emerald-700"
                          }`}
                        >
                          {formatoNumero(diferenciaSeleccionada(row))}
                        </td>
                      )}

                      {visibilidad.diferenciasSemana &&
                        semanasActivas.map((sem) => (
                          <td
                            key={`dif-${sem}`}
                            className={`px-2.5 py-1.5 text-right font-black ${
                              row.diferenciasPorSemana[sem] < 0
                                ? "text-[#0057B8]"
                                : "text-slate-700"
                            }`}
                          >
                            {formatoNumero(row.diferenciasPorSemana[sem] || 0)}
                          </td>
                        ))}

                      {visibilidad.estado && (
                        <td className="px-2.5 py-1.5">
                          {(() => {
                            const estadoActual = estadoSeleccionado(row);
                            return (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${estadoClasses(estadoActual)}`}>
                                {estadoActual}
                              </span>
                            );
                          })()}
                        </td>
                      )}                    </tr>
                  ))}

                  {filtrado.length === 0 && (
                    <tr>
                      <td
                        colSpan={999}
                        className="px-3 py-6 text-center text-xs font-semibold text-slate-500"
                      >
                        No hay datos con los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {nombreGuardado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <h3 className="text-lg font-black text-slate-950">
                Guardar balance
              </h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Confirma el nombre con el que quedara en el historico.
              </p>
            </div>

            <div className="space-y-3 px-6 py-5">
              <label className="text-xs font-black uppercase text-slate-500">
                Nombre del balance
              </label>
              <input
                value={nombreGuardado}
                onChange={(e) => setNombreGuardado(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-[#fbfbfa] px-6 py-4">
              <button
                onClick={() => setNombreGuardado("")}
                disabled={guardandoBalance}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarGuardarBalance}
                disabled={guardandoBalance || !nombreGuardado.trim()}
                className="rounded-xl bg-[#0057B8] px-5 py-2.5 text-sm font-black text-white shadow-sm hover:bg-[#003B7A] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {guardandoBalance ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {filaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase text-slate-500">
                  Detalle del componente
                </p>
                <h3 className="mt-1 text-xl font-black text-slate-950">
                  {filaSeleccionada.codigo} · {filaSeleccionada.material}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {filaSeleccionada.um || "-"} · {filaSeleccionada.seccion || "Sin seccion"}
                </p>
              </div>

              <button
                onClick={() => setFilaSeleccionada(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto px-6 py-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                <DetalleCard label="AG01 + AG04" value={formatoNumero(filaSeleccionada.totalExistencia)} />
                <DetalleCard label="AG01" value={formatoNumero(filaSeleccionada.almacenes["AG01"] || 0)} />
                <DetalleCard label="AG04" value={formatoNumero(filaSeleccionada.almacenes["AG04"] || 0)} />
                <DetalleCard label="Necesidad" value={formatoNumero(totalNecesidadSeleccionada(filaSeleccionada))} />
                <DetalleCard
                  label="Transito"
                  value={formatoNumero(
                    semanasActivas.reduce(
                      (acc, sem) => acc + (filaSeleccionada.recepcionesPorSemana?.[sem] || 0),
                      0
                    )
                  )}
                  tone="warning"
                />
                <DetalleCard
                  label="Diferencia"
                  value={formatoNumero(diferenciaSeleccionada(filaSeleccionada))}
                  tone={diferenciaSeleccionada(filaSeleccionada) < 0 ? "danger" : "success"}
                />
                <DetalleCard
                  label="Estado"
                  value={estadoSeleccionado(filaSeleccionada)}
                  tone={estadoTone(estadoSeleccionado(filaSeleccionada))}
                />
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-[#f8f8f6] text-slate-500">
                    <tr className="border-b border-slate-200 uppercase">
                      <th className="px-3 py-2 text-left font-black">Semana</th>
                      <th className="px-3 py-2 text-right font-black">Necesidad</th>
                      <th className="px-3 py-2 text-right font-black">Transito</th>
                      <th className="px-3 py-2 text-left font-black">Fecha operativa</th>
                      <th className="px-3 py-2 text-right font-black">AG01 + AG04</th>
                      <th className="px-3 py-2 text-right font-black">Diferencia</th>
                      <th className="px-3 py-2 text-left font-black">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {semanasActivas.map((sem) => {
                      const necesidad = filaSeleccionada.necesidadesPorSemana[sem] || 0;
                      const transito = filaSeleccionada.recepcionesPorSemana?.[sem] || 0;
                      const diferencia = filaSeleccionada.diferenciasPorSemana[sem] || 0;
                      const transitos = filaSeleccionada.transitosPorSemana?.[sem] || [];
                      const fechas = Array.from(
                        new Set(
                          transitos
                            .map((item) => item.fechaOperativa)
                            .filter(Boolean)
                        )
                      );
                      const estadoSemana: EstadoAnalisis =
                        necesidad <= 0
                          ? "SIN_NECESIDAD"
                          : diferencia > 0
                            ? "DISPONIBLE"
                            : diferencia === 0
                              ? "RESERVADO"
                              : filaSeleccionada.totalExistencia > 0
                                ? "REPOSICION"
                                : "REABASTECIMIENTO";

                      return (
                        <tr
                          key={sem}
                          className="border-b border-slate-100 last:border-b-0 hover:bg-[#EAF4FF]"
                        >
                          <td className="px-3 py-2 font-black text-slate-950">{sem}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-700">
                            {formatoNumero(necesidad)}
                          </td>
                          <td className="px-3 py-2 text-right font-black text-[#0B4EA2]">
                            {formatoNumero(transito)}
                          </td>
                          <td className="min-w-[150px] px-3 py-2 font-semibold text-slate-600">
                            {fechas.length > 0 ? fechas.join(", ") : "-"}
                          </td>
                          <td className="px-3 py-2 text-right font-black text-slate-950">
                            {formatoNumero(filaSeleccionada.totalExistencia)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-black ${
                              diferencia < 0 ? "text-[#0057B8]" : "text-emerald-700"
                            }`}
                          >
                            {formatoNumero(diferencia)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${estadoClasses(estadoSemana)}`}
                            >
                              {estadoSemana}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DetalleCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "danger"
      ? "text-[#0057B8]"
      : tone === "success"
        ? "text-emerald-700"
        : tone === "warning"
          ? "text-[#0B4EA2]"
          : "text-slate-950";

  return (
    <div className="rounded-xl border border-slate-200 bg-[#fbfbfa] p-4">
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-lg font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-black transition ${
        checked
          ? "border-[#0057B8]/30 bg-blue-50 text-[#0057B8]"
          : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
      }`}
    >
      <span className="mr-2 inline-block">{checked ? "●" : "○"}</span>
      {label}
    </button>
  );
}

function SortHeader({
  label,
  sortKey,
  orden,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  orden: SortConfig;
  onSort: (key: string) => void;
  align?: "left" | "right";
}) {
  const activo = orden?.key === sortKey;
  const marca = activo ? (orden.direction === "asc" ? "asc" : "desc") : "";

  return (
    <th
      className={`px-2.5 py-1.5 font-black ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`w-full uppercase transition ${
          align === "right" ? "text-right" : "text-left"
        } ${activo ? "text-[#0057B8]" : "text-slate-500 hover:text-slate-950"}`}
        title="Ordenar columna"
      >
        {label}
        {marca && <span className="ml-1 text-[10px]">{marca}</span>}
      </button>
    </th>
  );
}
