"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BalanceInfo,
  BalanceRow,
  ExcelData,
  InventarioBloqueadoRow,
} from "@/types/balance";
import { formatoNumero } from "@/lib/format";
import { obtenerCarga, obtenerCargas } from "@/lib/storage";
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

type TipoMovimiento = "APROVISIONAMIENTO" | "REABASTECIMIENTO";

type MovimientoDashboard = {
  tipo: TipoMovimiento;
  codigo: string;
  material: string;
  seccion: string;
  semana: string;
  fecha: string;
  cantidad: number;
};

type BalanceOption = {
  id: string;
  nombre: string;
  fecha: string;
  datos: ExcelData;
};

type ProduccionMeta = {
  categoria: string;
  descripcion: string;
};

type ConsumoEntrada = {
  categoria: string;
  codigo: string;
  descripcion: string;
  linea: string;
  semana: string;
  plan: number;
  real: number;
};

type ConsumoResumen = {
  categoria: string;
  codigo?: string;
  descripcion?: string;
  linea?: string;
  plan: number;
  real: number;
};

type ModoConsumo = "CATEGORIA" | "SKU" | "LINEA";

function normalizarBusqueda(valor: string) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizarClave(valor: string) {
  return normalizarBusqueda(valor).replace(/[^a-z0-9]/g, "");
}

function obtenerValorLocal(fila: Record<string, any>, nombres: string[]) {
  for (const nombre of nombres) {
    const objetivo = normalizarClave(nombre);
    const key = Object.keys(fila || {}).find(
      (columna) =>
        normalizarClave(columna) === objetivo &&
        fila[columna] !== undefined &&
        fila[columna] !== null &&
        fila[columna] !== ""
    );

    if (key) return fila[key];
  }

  return "";
}

function obtenerHojaLocal(datos: ExcelData, nombres: string[]) {
  const objetivos = nombres.map(normalizarClave);
  return (
    Object.entries(datos || {}).find(([nombre]) =>
      objetivos.includes(normalizarClave(nombre))
    )?.[1] || null
  );
}

function convertirNumero(valor: any) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor ?? "").trim();
  if (!texto) return 0;

  const normalizado = texto
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

function normalizarCategoria(valor: string) {
  const texto = normalizarBusqueda(valor);
  if (texto.includes("nabs") || texto.includes("malta")) return "Nabs";
  if (texto.includes("cerveza")) return "Cervezas";
  return valor || "Sin categoria";
}

function semanaDesdeFecha(valor: any) {
  if (!valor) return "";

  let fecha: Date | null = null;

  if (typeof valor === "number") {
    fecha = new Date(Math.round((valor - 25569) * 86400 * 1000));
  } else {
    const texto = String(valor).trim();
    const partes = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);

    if (partes) {
      const dia = Number(partes[1]);
      const mes = Number(partes[2]) - 1;
      const anio = Number(partes[3].length === 2 ? `20${partes[3]}` : partes[3]);
      fecha = new Date(anio, mes, dia);
    } else {
      const parsed = new Date(texto);
      fecha = Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  if (!fecha || Number.isNaN(fecha.getTime())) return "";

  const utc = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return `Sem ${week}`;
}

function nombreBalanceOpcion(carga: any) {
  const fecha = carga.fecha
    ? new Date(carga.fecha).toLocaleString("es-CO", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return `${fecha} · ${carga.archivo || "Balance guardado"}`;
}

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
  const [cargasHistoricasCompletas, setCargasHistoricasCompletas] = useState<Record<string, any>>({});
  const [movimientoSeleccionado, setMovimientoSeleccionado] =
    useState<TipoMovimiento | null>(null);
  const [filtroMovimientoSemana, setFiltroMovimientoSemana] = useState("");
  const [filtroMovimientoFecha, setFiltroMovimientoFecha] = useState("");
  const [filtroMovimientoSeccion, setFiltroMovimientoSeccion] = useState("");
  const [balancePlanId, setBalancePlanId] = useState("");
  const [balanceRealId, setBalanceRealId] = useState("");
  const [filtroConsumoTexto, setFiltroConsumoTexto] = useState("");
  const [filtroConsumoCategorias, setFiltroConsumoCategorias] = useState<string[]>([]);
  const [filtroConsumoSkus, setFiltroConsumoSkus] = useState<string[]>([]);
  const [filtroConsumoLineas, setFiltroConsumoLineas] = useState<string[]>([]);
  const [modoConsumo, setModoConsumo] = useState<ModoConsumo>("CATEGORIA");
  const [tablaExpandida, setTablaExpandida] = useState<"CONSUMO" | "CRITICOS" | null>(null);
  const [semanaCriticosInforme, setSemanaCriticosInforme] = useState("");
  const [materialesCriticosVisibles, setMaterialesCriticosVisibles] = useState<string[]>([]);

  useEffect(() => {
    obtenerCargas()
      .then(setCargasHistoricas)
      .catch(() => setCargasHistoricas([]));
  }, []);

  const opcionesBalance = useMemo<BalanceOption[]>(() => {
    const opciones: BalanceOption[] = [];

    if (Object.keys(datos || {}).length > 0) {
      opciones.push({
        id: "actual",
        nombre: "Balance actual cargado",
        fecha: new Date().toISOString(),
        datos,
      });
    }

    cargasHistoricas.forEach((carga) => {
      const cargaCompleta = cargasHistoricasCompletas[carga.id] || carga;
      const datosHistoricos =
        cargaCompleta?.datos || cargaCompleta?.info?.datosHistorico || {};

      opciones.push({
        id: carga.id,
        nombre: nombreBalanceOpcion(carga),
        fecha: carga.fecha,
        datos: datosHistoricos,
      });
    });

    return opciones;
  }, [datos, cargasHistoricas, cargasHistoricasCompletas]);

  useEffect(() => {
    const ids = [balancePlanId, balanceRealId].filter(
      (id) => id && id !== "actual" && !cargasHistoricasCompletas[id]
    );
    const unicos = Array.from(new Set(ids));

    unicos.forEach((id) => {
      obtenerCarga(id)
        .then((carga) => {
          setCargasHistoricasCompletas((actual) => ({
            ...actual,
            [id]: carga,
          }));
        })
        .catch(() => {
          // Si un historico no carga completo, se mantiene el resumen sin bloquear el dashboard.
        });
    });
  }, [balancePlanId, balanceRealId, cargasHistoricasCompletas]);

  useEffect(() => {
    if (opcionesBalance.length === 0) return;

    setBalancePlanId((actual) => {
      if (actual && opcionesBalance.some((item) => item.id === actual)) return actual;
      return opcionesBalance[opcionesBalance.length - 1]?.id || opcionesBalance[0].id;
    });

    setBalanceRealId((actual) => {
      if (actual && opcionesBalance.some((item) => item.id === actual)) return actual;
      return opcionesBalance[0].id;
    });
  }, [opcionesBalance]);

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

  const movimientosDashboard = useMemo<MovimientoDashboard[]>(() => {
    const movimientos: MovimientoDashboard[] = [];

    riesgos.forEach((row) => {
      const ag40 = row.almacenes?.["AG40"] || 0;
      const seccion = row.seccion || "SIN SECCION";

      if (ag40 > 0) {
        semanasActivas
          .filter((sem) => (row.necesidadesPorSemana[sem] || 0) > 0)
          .forEach((sem) => {
            movimientos.push({
              tipo: "REABASTECIMIENTO",
              codigo: row.codigo,
              material: row.material,
              seccion,
              semana: sem,
              fecha: "AG40",
              cantidad: ag40,
            });
          });
        return;
      }

      semanasActivas.forEach((sem) => {
        const detalles = row.transitosPorSemana?.[sem] || [];
        const detalleValido = detalles.filter(
          (detalle) => (detalle.cantidad || 0) > 0
        );

        if (detalleValido.length > 0) {
          detalleValido.forEach((detalle) => {
            movimientos.push({
              tipo: "APROVISIONAMIENTO",
              codigo: row.codigo,
              material: row.material,
              seccion,
              semana: sem,
              fecha: detalle.fechaOperativa || "-",
              cantidad: detalle.cantidad || 0,
            });
          });
          return;
        }

        const cantidad = row.recepcionesPorSemana?.[sem] || 0;
        if (cantidad <= 0) return;

        const fechas = row.fechasRecepcionPorSemana?.[sem] || ["-"];
        fechas.forEach((fecha) => {
          movimientos.push({
            tipo: "APROVISIONAMIENTO",
            codigo: row.codigo,
            material: row.material,
            seccion,
            semana: sem,
            fecha,
            cantidad,
          });
        });
      });
    });

    return movimientos.sort((a, b) => b.cantidad - a.cantidad);
  }, [riesgos, semanasActivas]);

  const reabastecimientoDetalle = movimientosDashboard.filter(
    (row) => row.tipo === "REABASTECIMIENTO"
  );
  const aprovisionamientoDetalle = movimientosDashboard.filter(
    (row) => row.tipo === "APROVISIONAMIENTO"
  );

  const totalReabastecimiento = riesgos.reduce(
    (acc, row) => acc + (row.almacenes?.["AG40"] || 0),
    0
  );
  const totalAprovisionamiento = aprovisionamientoDetalle.reduce(
    (acc, row) => acc + row.cantidad,
    0
  );
  const skuReabastecimiento = new Set(
    reabastecimientoDetalle.map((row) => row.codigo)
  ).size;
  const skuAprovisionamiento = new Set(
    aprovisionamientoDetalle.map((row) => row.codigo)
  ).size;

  const movimientosPorSemana = semanasActivas.map((sem) => {
    const movimientos = movimientosDashboard
      .filter((row) => row.semana === sem)
      .sort((a, b) => b.cantidad - a.cantidad);

    return {
      semana: sem,
      movimientos,
      cantidad: movimientos.length,
      total: movimientos.reduce((acc, row) => acc + row.cantidad, 0),
    };
  });

  const movimientosModal = movimientosDashboard.filter((row) => {
    const coincideTipo = row.tipo === movimientoSeleccionado;
    const coincideSemana =
      !filtroMovimientoSemana || row.semana === filtroMovimientoSemana;
    const coincideFecha =
      !filtroMovimientoFecha ||
      row.fecha.toLowerCase().includes(filtroMovimientoFecha.toLowerCase());
    const coincideSeccion =
      !filtroMovimientoSeccion ||
      row.seccion.toLowerCase().includes(filtroMovimientoSeccion.toLowerCase());

    return coincideTipo && coincideSemana && coincideFecha && coincideSeccion;
  });
  const seccionesMovimiento = Array.from(
    new Set(movimientosDashboard.map((row) => row.seccion).filter(Boolean))
  ).sort();

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

  const balancePlanSeleccionado =
    opcionesBalance.find((item) => item.id === balancePlanId) || opcionesBalance[0];
  const balanceRealSeleccionado =
    opcionesBalance.find((item) => item.id === balanceRealId) || opcionesBalance[0];

  const mapaSkuProduccion = useMemo(() => {
    const mapa = new Map<string, ProduccionMeta>();
    const fuentes = [
      datos,
      balancePlanSeleccionado?.datos,
      balanceRealSeleccionado?.datos,
      ...opcionesBalance.map((opcion) => opcion?.datos),
    ].filter(Boolean) as ExcelData[];

    fuentes.forEach((fuente) => {
      Object.values(fuente).forEach((hoja) => {
        const filas = hoja?.datos || [];
        if (filas.length === 0) return;

        const primera = filas[0] || {};
        const tieneCategoria = Object.keys(primera).some(
          (key) => normalizarClave(key) === "categoria"
        );
        const tieneCodigo = Object.keys(primera).some((key) =>
          ["codigosap", "sap", "codigo"].includes(normalizarClave(key))
        );

        if (!tieneCategoria || !tieneCodigo) return;

        filas.forEach((fila) => {
          const codigo = String(
            obtenerValorLocal(fila, ["Codigo SAP", "Código SAP", "SAP", "Codigo"])
          ).trim();
          if (!codigo) return;

          const categoria = normalizarCategoria(
            String(obtenerValorLocal(fila, ["Categoria", "Categoría"]))
          );
          const descripcion = String(
            obtenerValorLocal(fila, ["Descripcion Sku", "Descripción Sku", "SKU"])
          ).trim();

          mapa.set(codigo, {
            categoria,
            descripcion,
          });
        });
      });
    });

    return mapa;
  }, [
    datos,
    balancePlanSeleccionado?.datos,
    balanceRealSeleccionado?.datos,
    opcionesBalance,
  ]);

  const consumosPlanReal = useMemo(() => {
    const entradas: ConsumoEntrada[] = [];
    const hojaPlan = obtenerHojaLocal(balancePlanSeleccionado?.datos || {}, ["Plan"]);
    const hojaConsumos = obtenerHojaLocal(balanceRealSeleccionado?.datos || {}, [
      "Consumos",
      "Consumo",
    ]);

    (hojaPlan?.datos || []).forEach((fila) => {
      const codigo = String(
        obtenerValorLocal(fila, ["SAP", "Codigo SAP", "Código SAP", "Material"])
      ).trim();
      if (!codigo) return;

      const semana = String(obtenerValorLocal(fila, ["sem", "Semana", "Week"])).trim();
      if (semanasActivas.length > 0 && semana && !semanasActivas.includes(semana)) {
        return;
      }

      const meta = mapaSkuProduccion.get(codigo);
      const descripcion =
        meta?.descripcion ||
        String(obtenerValorLocal(fila, ["SKU", "Descripcion Sku", "Descripción Sku"])).trim();

      entradas.push({
        categoria: meta?.categoria || "Sin categoria",
        codigo,
        descripcion,
        linea: String(obtenerValorLocal(fila, ["Linea", "Línea", "Recurso"])).trim(),
        semana,
        plan: convertirNumero(obtenerValorLocal(fila, ["HL"])),
        real: 0,
      });
    });

    (hojaConsumos?.datos || []).forEach((fila) => {
      const codigo = String(
        obtenerValorLocal(fila, ["Material", "SAP", "Codigo SAP", "Código SAP"])
      ).trim();
      if (!codigo) return;

      const fechaConsumo =
        obtenerValorLocal(fila, ["Fe.Cont", "Fecha", "Inicio Ejec.", "Fin Ejec."]) || "";
      const semana = semanaDesdeFecha(fechaConsumo);
      if (semanasActivas.length > 0 && semana && !semanasActivas.includes(semana)) {
        return;
      }

      const meta = mapaSkuProduccion.get(codigo);

      entradas.push({
        categoria: meta?.categoria || "Sin categoria",
        codigo,
        descripcion:
          meta?.descripcion ||
          String(
            obtenerValorLocal(fila, [
              "Descripcion Material",
              "Descripción Material",
              "SKU",
            ])
          ).trim(),
        linea: String(obtenerValorLocal(fila, ["Recurso", "Linea", "Línea"])).trim(),
        semana,
        plan: 0,
        real: convertirNumero(obtenerValorLocal(fila, ["Cantidad HL", "HL"])),
      });
    });

    const texto = normalizarBusqueda(filtroConsumoTexto);
    const filtradas = entradas.filter((row) => {
      const coincideCategoria =
        filtroConsumoCategorias.length === 0 ||
        filtroConsumoCategorias.includes(row.categoria);
      const coincideSku =
        filtroConsumoSkus.length === 0 || filtroConsumoSkus.includes(row.codigo);
      const coincideLinea =
        filtroConsumoLineas.length === 0 || filtroConsumoLineas.includes(row.linea);
      const coincideTexto =
        !texto ||
        normalizarBusqueda(
          `${row.categoria} ${row.codigo} ${row.descripcion} ${row.linea}`
        ).includes(texto);

      return coincideCategoria && coincideSku && coincideLinea && coincideTexto;
    });

    function agrupar(
      rows: ConsumoEntrada[],
      crearClave: (row: ConsumoEntrada) => string,
      crearBase: (row: ConsumoEntrada) => ConsumoResumen
    ) {
      const mapa = new Map<string, ConsumoResumen>();

      rows.forEach((row) => {
        const clave = crearClave(row);
        const actual = mapa.get(clave) || crearBase(row);
        actual.plan += row.plan;
        actual.real += row.real;
        mapa.set(clave, actual);
      });

      return Array.from(mapa.values()).sort((a, b) => {
        const categoria = a.categoria.localeCompare(b.categoria);
        if (categoria !== 0) return categoria;
        return (a.codigo || "").localeCompare(b.codigo || "");
      });
    }

    return {
      entradas,
      filtradas,
      porCategoria: agrupar(
        filtradas,
        (row) => row.categoria,
        (row) => ({
          categoria: row.categoria,
          plan: 0,
          real: 0,
        })
      ),
      porSku: agrupar(
        filtradas,
        (row) => `${row.categoria}|${row.codigo}`,
        (row) => ({
          categoria: row.categoria,
          codigo: row.codigo,
          descripcion: row.descripcion,
          plan: 0,
          real: 0,
        })
      ),
      porLinea: agrupar(
        filtradas,
        (row) => `${row.categoria}|${row.linea}|${row.codigo}`,
        (row) => ({
          categoria: row.categoria,
          linea: row.linea || "-",
          codigo: row.codigo,
          descripcion: row.descripcion,
          plan: 0,
          real: 0,
        })
      ),
    };
  }, [
    balancePlanSeleccionado?.datos,
    balanceRealSeleccionado?.datos,
    mapaSkuProduccion,
    semanasActivas,
    filtroConsumoTexto,
    filtroConsumoCategorias,
    filtroConsumoSkus,
    filtroConsumoLineas,
  ]);

  const opcionesCategoriaConsumo = Array.from(
    new Set(consumosPlanReal.entradas.map((row) => row.categoria).filter(Boolean))
  ).sort();
  const opcionesSkuConsumo = Array.from(
    new Map(
      consumosPlanReal.entradas
        .filter((row) => row.plan > 0)
        .map((row) => [
          row.codigo,
          {
            value: row.codigo,
            label: `${row.codigo} · ${row.descripcion || "Sin descripcion"}`,
          },
        ])
    ).values()
  ).sort((a, b) => a.value.localeCompare(b.value));
  const opcionesLineaConsumo = Array.from(
    new Set(consumosPlanReal.entradas.map((row) => row.linea).filter(Boolean))
  ).sort();

  const consumoInforme = useMemo(() => {
    if (modoConsumo === "CATEGORIA") {
      return {
        titulo: "Consumo por categoria",
        registro: `${consumosPlanReal.porCategoria.length} categorias`,
        columns: ["Categoria", "Plan", "Real", "% Cum"],
        rows: consumosPlanReal.porCategoria,
      };
    }

    if (modoConsumo === "SKU") {
      return {
        titulo: "Consumo por categoria y SKU de produccion",
        registro: `${consumosPlanReal.porSku.length} SKU`,
        columns: ["Categoria", "SAP", "Descripcion", "Plan", "Real", "% Cum"],
        rows: consumosPlanReal.porSku,
      };
    }

    return {
      titulo: "Consumo por categoria, TREN y SKU de produccion",
      registro: `${consumosPlanReal.porLinea.length} lineas`,
      columns: [
        "Categoria",
        "TREN",
        "SAP",
        "Descripcion",
        "Plan",
        "Real",
        "% Cum",
      ],
      rows: consumosPlanReal.porLinea,
    };
  }, [modoConsumo, consumosPlanReal]);

  const semanaCriticosActiva =
    semanaCriticosInforme && semanas.includes(semanaCriticosInforme)
      ? semanaCriticosInforme
      : semanasActivas[0] || semanas[0] || "";

  const materialesCriticosSemana = useMemo(() => {
    return (
      criticosPorSemana.find((item) => item.semana === semanaCriticosActiva)
        ?.materiales || []
    );
  }, [criticosPorSemana, semanaCriticosActiva]);

  useEffect(() => {
    if (tablaExpandida !== "CRITICOS") return;
    setMaterialesCriticosVisibles(
      materialesCriticosSemana.map((row) => row.codigo)
    );
  }, [tablaExpandida, semanaCriticosActiva]);

  const criticosInforme = useMemo(() => {
    return materialesCriticosSemana.filter((row) =>
      materialesCriticosVisibles.includes(row.codigo)
    );
  }, [materialesCriticosSemana, materialesCriticosVisibles]);
  const totalConsumoInforme = consumoInforme.rows.reduce(
    (acc, row) => ({
      plan: acc.plan + row.plan,
      real: acc.real + row.real,
    }),
    { plan: 0, real: 0 }
  );

  const renderConsumoRows = (dense = false) => {
    if (modoConsumo === "CATEGORIA") {
      return consumoInforme.rows.map((row) => (
        <ConsumoRow
          key={`${dense ? "dense" : "normal"}-${row.categoria}`}
          cells={[row.categoria]}
          plan={row.plan}
          real={row.real}
          dense={dense}
        />
      ));
    }

    const rows: ReactNode[] = [];
    let categoriaActual = "";
    let subtotal = { plan: 0, real: 0 };
    const labelSpan = Math.max(consumoInforme.columns.length - 4, 1);

    const pushSubtotal = () => {
      if (!categoriaActual) return;
      rows.push(
        <ConsumoCategoryTotalRow
          key={`${dense ? "dense" : "normal"}-subtotal-${categoriaActual}`}
          label={`Total ${categoriaActual}`}
          labelSpan={labelSpan}
          plan={subtotal.plan}
          real={subtotal.real}
          dense={dense}
        />
      );
    };

    consumoInforme.rows.forEach((row) => {
      if (row.categoria !== categoriaActual) {
        pushSubtotal();
        categoriaActual = row.categoria;
        subtotal = { plan: 0, real: 0 };
      }

      subtotal.plan += row.plan;
      subtotal.real += row.real;

      rows.push(
        <ConsumoRow
          key={`${dense ? "dense" : "normal"}-${row.categoria}-${row.linea || ""}-${row.codigo || ""}`}
          cells={
            modoConsumo === "SKU"
              ? [row.categoria, row.codigo || "-", row.descripcion || "-"]
              : [
                  row.categoria,
                  row.linea || "-",
                  row.codigo || "-",
                  row.descripcion || "-",
                ]
          }
          plan={row.plan}
          real={row.real}
          dense={dense}
        />
      );
    });

    pushSubtotal();
    return rows;
  };

  return (
    <section className="space-y-2">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-950">
              Dashboard de planeacion y abastecimiento
            </h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Riesgo por semanas, transito, consumo notificado e inventario
              bloqueado para toma de decisiones.
            </p>
          </div>

          <div className="rounded-lg border border-[#2F80ED]/30 bg-[#EAF4FF] px-2 py-1 text-[11px] font-black text-[#0B4EA2]">
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
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-black text-slate-950">
                  Filtro de semanas
                </h4>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Selecciona una, dos o varias semanas para recalcular las tablas.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSemanasSeleccionadas(semanas)}
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

            <div className="mt-2 flex flex-wrap gap-2">
              {semanas.map((sem) => {
                const activo = semanasActivas.includes(sem);

                return (
                  <button
                    key={sem}
                    onClick={() => toggleSemana(sem)}
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

          <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
            <Kpi titulo="Semanas evaluadas" valor={semanasActivas.length} />
            <Kpi
              titulo="Materiales criticos"
              valor={materialesCriticos.length}
              color="text-[#e30613]"
              border="border-red-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <ActionCard
              titulo="Reabastecimiento"
              valor={`${skuReabastecimiento} SKU`}
              texto={`AG40 disponible para movimiento interno. Total: ${formatoNumero(totalReabastecimiento)}.`}
              tipo="verde"
              onClick={() => setMovimientoSeleccionado("REABASTECIMIENTO")}
            />
            <ActionCard
              titulo="Aprovisionamiento"
              valor={`${skuAprovisionamiento} SKU`}
              texto={`Plan de recibo sin duplicar materiales cubiertos por AG40. Total: ${formatoNumero(totalAprovisionamiento)}.`}
              tipo="azul"
              onClick={() => setMovimientoSeleccionado("APROVISIONAMIENTO")}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black text-slate-950">
                    Materiales criticos por semana
                  </h4>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Conteo y principales SKU con faltante por cada semana.
                  </p>
                </div>
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-black uppercase text-[#e30613]">
                  {materialesCriticos.length} SKU criticos
                </div>
                <button
                  onClick={() => setTablaExpandida("CRITICOS")}
                  className="rounded-lg border border-[#0057B8] bg-white px-3 py-2 text-[11px] font-black uppercase text-[#0057B8] transition hover:bg-[#EAF4FF]"
                >
                  Ampliar informe
                </button>
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
                    <button
                      onClick={() => {
                        setSemanaCriticosInforme(grupo.semana);
                        setTablaExpandida("CRITICOS");
                      }}
                      className="mt-2 h-8 w-full rounded-lg border border-[#0057B8]/30 bg-white text-[11px] font-black text-[#0057B8] transition hover:bg-[#EAF4FF]"
                    >
                      Informe {grupo.semana}
                    </button>
                    <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                      Faltante: {formatoNumero(grupo.faltante)}
                    </p>
                    <div className="compact-scroll mt-2 max-h-[260px] space-y-1.5 overflow-auto pr-1">
                      {grupo.materiales.map((row) => (
                        <button
                          key={`${grupo.semana}-${row.codigo}`}
                          onClick={() => toggleMaterial(row.codigo)}
                          className={`grid w-full grid-cols-[minmax(0,1fr)_96px] items-start gap-2 rounded-lg px-3 py-2 text-left transition ${
                            materialSeleccionado === row.codigo
                              ? "bg-[#EAF4FF] ring-2 ring-[#2F80ED]/30"
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

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black text-slate-950">
                    Llegadas por semana
                  </h4>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Reabastecimiento AG40 y aprovisionamiento por plan de recibo.
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700">
                  {movimientosDashboard.length} movimientos
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {movimientosPorSemana.map((grupo) => (
                  <div
                    key={grupo.semana}
                    className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black text-slate-950">
                        {grupo.semana}
                      </p>
                      <p className="text-xs font-black text-emerald-700">
                        {grupo.cantidad} mov.
                      </p>
                    </div>
                    <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                      Cantidad: {formatoNumero(grupo.total)}
                    </p>
                    <div className="compact-scroll mt-2 max-h-[260px] space-y-1.5 overflow-auto pr-1">
                      {grupo.movimientos.map((row, index) => (
                        <button
                          key={`${grupo.semana}-${row.codigo}-${row.tipo}-${index}`}
                          onClick={() => setMovimientoSeleccionado(row.tipo)}
                          className="grid w-full grid-cols-[minmax(0,1fr)_94px] items-start gap-2 rounded-lg bg-white px-3 py-2 text-left transition hover:bg-[#fbfbfa]"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-black text-slate-950">
                                {row.codigo}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                                  row.tipo === "REABASTECIMIENTO"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-[#EAF4FF] text-[#0B4EA2]"
                                }`}
                              >
                                {row.tipo === "REABASTECIMIENTO"
                                  ? "AG40"
                                  : "RECIBO"}
                              </span>
                            </div>
                            <p className="truncate text-[11px] font-semibold text-slate-500">
                              {row.material}
                            </p>
                            <p className="truncate text-[10px] font-semibold text-slate-400">
                              {row.fecha}
                            </p>
                          </div>
                          <p className="truncate text-right text-[11px] font-black text-emerald-700">
                            {formatoNumero(row.cantidad)}
                          </p>
                        </button>
                      ))}
                      {grupo.movimientos.length === 0 && (
                        <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                          Sin llegadas para esta semana.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {!detalleMaterial && (
              <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h4 className="text-xl font-black text-slate-950">
                  Tabla operativa de materiales
                </h4>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Criticos, transito y consumo segun las semanas seleccionadas.
                </p>
              </div>

              <div className="grid w-full grid-cols-1 gap-3 md:w-auto md:grid-cols-3">
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar material, texto breve, seccion..."
                  className="h-11 min-w-[320px] rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10"
                />

                <select
                  value={filtroRiesgo}
                  onChange={(e) => setFiltroRiesgo(e.target.value)}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#0057B8]"
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
              <div className="rounded-xl border border-[#2F80ED]/30 bg-[#EAF4FF] px-4 py-2 text-xs font-black uppercase tracking-wide text-[#0B4EA2]">
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
                            ? "bg-[#EAF4FF]"
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
                        <td className="px-4 py-3 font-black text-[#0057B8]">
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
                        <td className="px-4 py-3 text-right font-black text-[#0B4EA2]">
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
                                ? "bg-[#EAF4FF] text-[#0B4EA2]"
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
                          className="px-4 py-6 text-center text-xs font-semibold text-slate-500"
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
              <div className="mt-5 rounded-2xl border border-[#2F80ED]/25 bg-[#EAF4FF] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-[#0B4EA2]">
                      Detalle del material seleccionado
                    </p>
                    <h5 className="mt-0.5 text-lg font-black text-slate-950">
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
                            <td className="px-4 py-3 text-right font-black text-[#0B4EA2]">
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

          <div className="grid grid-cols-1 gap-5">
            <DataTable
              titulo="Inventario bloqueado"
              subtitulo={`Valor total bloqueado: ${formatoNumero(valorBloqueado)}. Mayor valor bloqueado para revisar liberacion o decision de uso.`}
              registro={`${materialesBloqueados.length} SKU`}
              columns={["Material", "Texto breve", "Cantidad", "Valor"]}
              empty="No hay inventario bloqueado."
              compact
            >
              {materialesBloqueados.map((row) => (
                <tr key={row.material} className="border-b border-slate-100">
                  <td className="px-2 py-1 font-black text-slate-950">{row.material}</td>
                  <td className="px-2 py-1 font-medium text-slate-700">
                    {row.textoBreve || "-"}
                  </td>
                  <td className="px-2 py-1 text-right font-semibold">
                    {formatoNumero(row.cantidad)}
                  </td>
                  <td className="px-2 py-1 text-right font-black text-[#0B4EA2]">
                    {formatoNumero(row.valor)}
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-black text-slate-950">
                  Cumplimiento de consumo
                </h4>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Plan en HL contra consumo real en HL, filtrado por semana,
                  categoria, SAP y TREN.
                </p>
              </div>

              <div className="rounded-lg border border-[#2F80ED]/30 bg-[#EAF4FF] px-3 py-2 text-[11px] font-black uppercase text-[#0B4EA2]">
                {consumosPlanReal.filtradas.length} registros
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                  Plan base
                </span>
                <select
                  value={balancePlanId}
                  onChange={(e) => setBalancePlanId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-[#0057B8]"
                >
                  {opcionesBalance.map((opcion) => (
                    <option key={opcion.id} value={opcion.id}>
                      {opcion.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                  Consumo real
                </span>
                <select
                  value={balanceRealId}
                  onChange={(e) => setBalanceRealId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-[#0057B8]"
                >
                  {opcionesBalance.map((opcion) => (
                    <option key={opcion.id} value={opcion.id}>
                      {opcion.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-5">
              <input
                value={filtroConsumoTexto}
                onChange={(e) => setFiltroConsumoTexto(e.target.value)}
                placeholder="Buscar categoria, SAP, descripcion o TREN..."
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-[#0057B8] focus:ring-4 focus:ring-[#0057B8]/10"
              />
              <MultiSelectFilter
                titulo="Categorias"
                opciones={opcionesCategoriaConsumo.map((item) => ({
                  value: item,
                  label: item,
                }))}
                seleccionados={filtroConsumoCategorias}
                setSeleccionados={setFiltroConsumoCategorias}
              />
              <MultiSelectFilter
                titulo="SAP produccion"
                opciones={opcionesSkuConsumo}
                seleccionados={filtroConsumoSkus}
                setSeleccionados={setFiltroConsumoSkus}
                conBusqueda
              />
              <MultiSelectFilter
                titulo="TREN"
                opciones={opcionesLineaConsumo.map((item) => ({
                  value: item,
                  label: item,
                }))}
                seleccionados={filtroConsumoLineas}
                setSeleccionados={setFiltroConsumoLineas}
                conBusqueda
              />
              <button
                onClick={() => {
                  setFiltroConsumoTexto("");
                  setFiltroConsumoCategorias([]);
                  setFiltroConsumoSkus([]);
                  setFiltroConsumoLineas([]);
                }}
                className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50"
              >
                Limpiar filtros
              </button>
            </div>

            {mapaSkuProduccion.size === 0 && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                No se detecto la hoja SKU Produccion en el balance o historico seleccionado.
              </div>
            )}

            <div className="mt-4 rounded-xl border border-[#BBD7FF] bg-[#F5FAFF] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {[
                    ["CATEGORIA", "Categoria"],
                    ["SKU", "Categoria + SKU"],
                    ["LINEA", "Categoria + TREN + SKU"],
                  ].map(([valor, label]) => (
                    <button
                      key={valor}
                      onClick={() => setModoConsumo(valor as ModoConsumo)}
                      className={`h-8 rounded-lg border px-3 text-[11px] font-black transition ${
                        modoConsumo === valor
                          ? "border-[#0057B8] bg-[#0057B8] text-white"
                          : "border-[#BBD7FF] bg-white text-[#0B4EA2] hover:bg-[#EAF4FF]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setTablaExpandida("CONSUMO")}
                  className="h-8 rounded-lg border border-[#0057B8] bg-white px-3 text-[11px] font-black text-[#0057B8] transition hover:bg-[#EAF4FF]"
                >
                  Ampliar informe
                </button>
              </div>

              <ConsumoTable
                titulo={consumoInforme.titulo}
                registro={consumoInforme.registro}
                columns={consumoInforme.columns}
                compact
              >
                {renderConsumoRows(false)}
                <ConsumoTotalRow
                  labelSpan={consumoInforme.columns.length - 4}
                  plan={totalConsumoInforme.plan}
                  real={totalConsumoInforme.real}
                />
              </ConsumoTable>
            </div>
          </div>

          {tablaExpandida && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-2">
              <div className="max-h-[98vh] w-full max-w-7xl overflow-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#BBD7FF] bg-[#F5FAFF] px-5 py-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-[#0B4EA2]">
                      Vista para informe
                    </p>
                    <h4 className="mt-0.5 text-lg font-black text-slate-950">
                      {tablaExpandida === "CONSUMO"
                        ? consumoInforme.titulo
                        : "Materiales criticos por semana"}
                    </h4>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Vista compacta para captura y envio.
                    </p>
                  </div>

                  <button
                    onClick={() => setTablaExpandida(null)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                  >
                    Cerrar
                  </button>
                </div>

                {tablaExpandida === "CONSUMO" ? (
                  <div className="p-3">
                    <div className="mb-2 flex flex-wrap gap-2">
                      {[
                        ["CATEGORIA", "Categoria"],
                        ["SKU", "Categoria + SKU"],
                        ["LINEA", "Categoria + TREN + SKU"],
                      ].map(([valor, label]) => (
                        <button
                          key={valor}
                          onClick={() => setModoConsumo(valor as ModoConsumo)}
                          className={`h-8 rounded-lg border px-3 text-[11px] font-black transition ${
                            modoConsumo === valor
                              ? "border-[#0057B8] bg-[#0057B8] text-white"
                              : "border-[#BBD7FF] bg-white text-[#0B4EA2] hover:bg-[#EAF4FF]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <ConsumoTable
                      titulo={consumoInforme.titulo}
                      registro={consumoInforme.registro}
                      columns={consumoInforme.columns}
                      expanded
                    >
                      {renderConsumoRows(true)}
                      <ConsumoTotalRow
                        labelSpan={consumoInforme.columns.length - 4}
                        plan={totalConsumoInforme.plan}
                        real={totalConsumoInforme.real}
                        dense
                      />
                    </ConsumoTable>
                  </div>
                ) : (
                  <div className="p-3">
                    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.5fr_1fr]">
                      <select
                        value={semanaCriticosActiva}
                        onChange={(e) => setSemanaCriticosInforme(e.target.value)}
                        className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black outline-none focus:border-[#0057B8]"
                      >
                        {semanas.map((sem) => (
                          <option key={sem} value={sem}>
                            {sem}
                          </option>
                        ))}
                      </select>
                      <MultiSelectFilter
                        titulo="Mostrar materiales"
                        opciones={materialesCriticosSemana.map((row) => ({
                          value: row.codigo,
                          label: `${row.codigo} - ${row.material}`,
                        }))}
                        seleccionados={materialesCriticosVisibles}
                        setSeleccionados={setMaterialesCriticosVisibles}
                        conBusqueda
                      />
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-[#e30613]">
                        <span>
                          {semanaCriticosActiva} - {criticosInforme.length} visibles
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() =>
                              setMaterialesCriticosVisibles(
                                materialesCriticosSemana.map((row) => row.codigo)
                              )
                            }
                            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[10px] font-black text-[#e30613]"
                          >
                            Todos
                          </button>
                          <button
                            onClick={() => setMaterialesCriticosVisibles([])}
                            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[10px] font-black text-[#e30613]"
                          >
                            Limpiar
                          </button>
                        </div>
                      </div>
                    </div>

                    <ConsumoTable
                      titulo={`Materiales criticos ${semanaCriticosActiva}`}
                      registro={`${criticosInforme.length} SKU`}
                      columns={["Material", "Descripcion", "Seccion", "Necesidad", "Faltante", "Transito"]}
                      expanded
                    >
                      {criticosInforme.map((row) => (
                        <tr key={`critico-${semanaCriticosActiva}-${row.codigo}`} className="border-b border-slate-100">
                          <td className="px-2 py-1.5 font-black text-slate-950">{row.codigo}</td>
                          <td className="px-2 py-1.5 font-semibold text-slate-700">{row.material}</td>
                          <td className="px-2 py-1.5 font-semibold text-slate-500">{row.seccion || "-"}</td>
                          <td className="px-2 py-1.5 text-right font-black text-slate-950">
                            {formatoNumero(row.necesidad)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-black text-[#e30613]">
                            {formatoNumero(Math.abs(row.diferencia))}
                          </td>
                          <td className="px-2 py-1.5 text-right font-black text-[#0B4EA2]">
                            {formatoNumero(row.transito)}
                          </td>
                        </tr>
                      ))}
                    </ConsumoTable>
                  </div>
                )}
              </div>
            </div>
          )}

          {movimientoSeleccionado && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
              <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-[#0B4EA2]">
                      Detalle operativo
                    </p>
                    <h4 className="mt-1 text-2xl font-black text-slate-950">
                      {movimientoSeleccionado === "REABASTECIMIENTO"
                        ? "Reabastecimiento AG40"
                        : "Aprovisionamiento plan de recibo"}
                    </h4>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {movimientoSeleccionado === "REABASTECIMIENTO"
                        ? "Movimientos internos desde AG40. Estos materiales no se duplican en aprovisionamiento."
                        : "Materiales con llegada por compras, excluyendo los que ya tienen cobertura en AG40."}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setMovimientoSeleccionado(null);
                      setFiltroMovimientoSemana("");
                      setFiltroMovimientoFecha("");
                      setFiltroMovimientoSeccion("");
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                  >
                    Cerrar
                  </button>
                </div>

                <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4 md:grid-cols-3">
                  <select
                    value={filtroMovimientoSemana}
                    onChange={(e) => setFiltroMovimientoSemana(e.target.value)}
                    className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold outline-none focus:border-[#0057B8]"
                  >
                    <option value="">Todas las semanas</option>
                    {semanasActivas.map((sem) => (
                      <option key={sem} value={sem}>
                        {sem}
                      </option>
                    ))}
                  </select>

                  <input
                    value={filtroMovimientoFecha}
                    onChange={(e) => setFiltroMovimientoFecha(e.target.value)}
                    placeholder="Buscar fecha..."
                    className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold outline-none focus:border-[#0057B8]"
                  />

                  <select
                    value={filtroMovimientoSeccion}
                    onChange={(e) => setFiltroMovimientoSeccion(e.target.value)}
                    className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold outline-none focus:border-[#0057B8]"
                  >
                    <option value="">Todas las secciones</option>
                    {seccionesMovimiento.map((seccion) => (
                      <option key={seccion} value={seccion}>
                        {seccion}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="px-6 py-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="rounded-xl border border-[#2F80ED]/30 bg-[#EAF4FF] px-4 py-2 text-xs font-black text-[#0B4EA2]">
                      {new Set(movimientosModal.map((row) => row.codigo)).size} SKU
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700">
                      Total:{" "}
                      {formatoNumero(
                        movimientosModal.reduce((acc, row) => acc + row.cantidad, 0)
                      )}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="compact-scroll max-h-[430px] overflow-auto">
                      <table className="w-full min-w-[980px] border-collapse text-sm">
                        <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
                          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-4 py-3 text-left font-black">
                              Semana
                            </th>
                            <th className="px-4 py-3 text-left font-black">
                              Material
                            </th>
                            <th className="px-4 py-3 text-left font-black">
                              Texto breve
                            </th>
                            <th className="px-4 py-3 text-left font-black">
                              Seccion
                            </th>
                            <th className="px-4 py-3 text-left font-black">
                              Fecha
                            </th>
                            <th className="px-4 py-3 text-right font-black">
                              Cantidad
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {movimientosModal.map((row, index) => (
                            <tr
                              key={`${row.tipo}-${row.codigo}-${row.semana}-${row.fecha}-${index}`}
                              className="border-b border-slate-100"
                            >
                              <td className="px-4 py-3 font-black text-[#0B4EA2]">
                                {row.semana}
                              </td>
                              <td className="px-4 py-3 font-black text-slate-950">
                                {row.codigo}
                              </td>
                              <td className="px-4 py-3 font-medium text-slate-700">
                                {row.material}
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-500">
                                {row.seccion}
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-600">
                                {row.fecha}
                              </td>
                              <td className="px-4 py-3 text-right font-black text-emerald-700">
                                {formatoNumero(row.cantidad)}
                              </td>
                            </tr>
                          ))}

                          {movimientosModal.length === 0 && (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-4 py-6 text-center text-xs font-semibold text-slate-500"
                              >
                                No hay movimientos con los filtros seleccionados.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
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
      ? "border-[#2F80ED]/25 text-[#0B4EA2]"
      : "border-slate-200 text-slate-950";

  return (
    <div className={`rounded-xl border ${style} bg-white p-4 shadow-sm`}>
      <p className="truncate text-xs font-semibold text-slate-500">{titulo}</p>
      <p className="mt-1 truncate text-lg font-black">{valor}</p>
      <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{texto}</p>
    </div>
  );
}

function ActionCard({
  titulo,
  valor,
  texto,
  tipo,
  onClick,
}: {
  titulo: string;
  valor: string | number;
  texto: string;
  tipo: "azul" | "verde";
  onClick: () => void;
}) {
  const style =
    tipo === "verde"
      ? "border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-50"
      : "border-[#2F80ED]/30 bg-[#EAF4FF] text-[#0B4EA2] hover:bg-blue-50";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border ${style} p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {titulo}
      </p>
      <p className="mt-0.5 text-xl font-black">{valor}</p>
      <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-slate-600">{texto}</p>
    </button>
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
      ? "text-[#0B4EA2]"
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
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <h4 className="mb-3 text-sm font-black text-slate-950">{titulo}</h4>
      <div className="h-[280px]">{children}</div>
    </div>
  );
}

function formatoPorcentaje(real: number, plan: number) {
  if (!plan) return real > 0 ? "100.00%" : "0.00%";
  return `${((real / plan) * 100).toFixed(2)}%`;
}

function MultiSelectFilter({
  titulo,
  opciones,
  seleccionados,
  setSeleccionados,
  conBusqueda = false,
}: {
  titulo: string;
  opciones: { value: string; label: string }[];
  seleccionados: string[];
  setSeleccionados: (valores: string[]) => void;
  conBusqueda?: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const texto = normalizarBusqueda(busqueda);
  const opcionesFiltradas = opciones.filter((opcion) =>
    normalizarBusqueda(`${opcion.value} ${opcion.label}`).includes(texto)
  );

  function toggle(valor: string) {
    setSeleccionados(
      seleccionados.includes(valor)
        ? seleccionados.filter((item) => item !== valor)
        : [...seleccionados, valor]
    );
  }

  return (
    <details className="group relative">
      <summary className="flex h-10 cursor-pointer list-none items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 outline-none transition hover:bg-slate-50 group-open:border-[#0057B8]">
        <span className="truncate">
          {seleccionados.length > 0
            ? `${seleccionados.length} ${titulo.toLowerCase()}`
            : titulo}
        </span>
        <span className="text-slate-400">▾</span>
      </summary>

      <div className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        {conBusqueda && (
          <div className="border-b border-slate-100 p-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={`Buscar ${titulo.toLowerCase()}...`}
              className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-semibold outline-none focus:border-[#0057B8]"
            />
          </div>
        )}

        <div className="compact-scroll max-h-60 overflow-auto p-2">
          {opcionesFiltradas.map((opcion) => (
            <label
              key={opcion.value}
              className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-xs font-semibold transition hover:bg-[#EAF4FF] ${
                seleccionados.includes(opcion.value) ? "bg-[#EAF4FF]" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={seleccionados.includes(opcion.value)}
                onChange={() => toggle(opcion.value)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block truncate font-black text-slate-950">
                  {opcion.value}
                </span>
                {opcion.label !== opcion.value && (
                  <span className="block truncate text-[11px] text-slate-500">
                    {opcion.label.replace(`${opcion.value} · `, "")}
                  </span>
                )}
              </span>
            </label>
          ))}

          {opcionesFiltradas.length === 0 && (
            <p className="px-2 py-4 text-center text-xs font-semibold text-slate-500">
              Sin opciones.
            </p>
          )}
        </div>
      </div>
    </details>
  );
}

function ConsumoTable({
  titulo,
  registro,
  columns,
  children,
  compact = false,
  expanded = false,
}: {
  titulo: string;
  registro: string;
  columns: string[];
  children: React.ReactNode;
  compact?: boolean;
  expanded?: boolean;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;

  return (
    <div className={`rounded-xl border border-[#BBD7FF] bg-white ${expanded ? "p-2" : compact ? "p-2" : "p-3"}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h5 className={`${compact ? "text-xs" : "text-sm"} font-black text-slate-950`}>
          {titulo}
        </h5>
        <span className="rounded-lg border border-[#2F80ED]/30 bg-[#EAF4FF] px-3 py-1.5 text-[11px] font-black uppercase text-[#0B4EA2]">
          {registro}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#BBD7FF]">
        <div
          className={
            expanded
              ? "overflow-visible"
              : `compact-scroll overflow-auto ${compact ? "max-h-[260px]" : "max-h-[340px]"}`
          }
        >
          <table className={`w-full border-collapse ${expanded ? "text-[7.5px]" : "min-w-[820px] text-[11px]"}`}>
            <thead className="sticky top-0 z-20 bg-[#DDEEFF]">
              <tr className={`border-b border-[#BBD7FF] ${expanded ? "text-[7px]" : "text-[10px]"} uppercase tracking-wide text-[#0B4EA2]`}>
                {columns.map((column, index) => (
                  <th
                    key={column}
                    className={`${expanded ? "px-1.5 py-0.5" : "px-3 py-2"} font-black ${
                      index >= columns.length - 4 ? "text-right" : "text-left"
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
                    className="px-4 py-8 text-center text-sm font-semibold text-slate-500"
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
  );
}

function ConsumoRow({
  cells,
  plan,
  real,
  dense = false,
}: {
  cells: string[];
  plan: number;
  real: number;
  dense?: boolean;
}) {
  const cellClass = dense ? "px-1.5 py-0.5 leading-tight" : "px-3 py-2";

  return (
    <tr className="border-b border-slate-100 transition hover:bg-[#fbfbfa]">
      {cells.map((cell, index) => (
        <td
          key={`${cell}-${index}`}
          className={`${cellClass} font-semibold ${
            index === 0 ? "text-slate-950" : "text-slate-600"
          }`}
        >
          {cell}
        </td>
      ))}
      <td className={`${cellClass} text-right font-black text-slate-950`}>
        {formatoNumero(plan)}
      </td>
      <td className={`${cellClass} text-right font-black text-[#0B4EA2]`}>
        {formatoNumero(real)}
      </td>
      <td
        className={`${cellClass} text-right font-black ${
          real >= plan ? "text-emerald-700" : "text-[#e30613]"
        }`}
      >
        {formatoPorcentaje(real, plan)}
      </td>
    </tr>
  );
}

function ConsumoCategoryTotalRow({
  label,
  labelSpan,
  plan,
  real,
  dense = false,
}: {
  label: string;
  labelSpan: number;
  plan: number;
  real: number;
  dense?: boolean;
}) {
  const cellClass = dense ? "px-1.5 py-0.5 leading-tight" : "px-3 py-2";

  return (
    <tr className="border-y border-[#7CB8FF] bg-[#EAF4FF]">
      <td
        colSpan={Math.max(labelSpan, 1)}
        className={`${cellClass} text-right font-black text-[#003B7A]`}
      >
        {label}
      </td>
      <td className={`${cellClass} text-right font-black text-slate-950`}>
        {formatoNumero(plan)}
      </td>
      <td className={`${cellClass} text-right font-black text-[#0B4EA2]`}>
        {formatoNumero(real)}
      </td>
      <td
        className={`${cellClass} text-right font-black ${
          real >= plan ? "text-emerald-700" : "text-[#e30613]"
        }`}
      >
        {formatoPorcentaje(real, plan)}
      </td>
    </tr>
  );
}

function ConsumoTotalRow({
  labelSpan,
  plan,
  real,
  dense = false,
}: {
  labelSpan: number;
  plan: number;
  real: number;
  dense?: boolean;
}) {
  const cellClass = dense ? "px-1.5 py-0.5 leading-tight" : "px-3 py-2";

  return (
    <tr className="border-t-2 border-[#7CB8FF] bg-[#DDEEFF]">
      <td
        colSpan={Math.max(labelSpan, 1)}
        className={`${cellClass} text-right font-black text-[#003B7A]`}
      >
        Total general
      </td>
      <td className={`${cellClass} text-right font-black text-slate-950`}>
        {formatoNumero(plan)}
      </td>
      <td className={`${cellClass} text-right font-black text-[#0B4EA2]`}>
        {formatoNumero(real)}
      </td>
      <td
        className={`${cellClass} text-right font-black ${
          real >= plan ? "text-emerald-700" : "text-[#e30613]"
        }`}
      >
        {formatoPorcentaje(real, plan)}
      </td>
    </tr>
  );
}

function DataTable({
  titulo,
  subtitulo,
  registro,
  columns,
  children,
  empty,
  compact = false,
}: {
  titulo: string;
  subtitulo: string;
  registro: string;
  columns: string[];
  children: React.ReactNode;
  empty: string;
  compact?: boolean;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-slate-950">{titulo}</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {subtitulo}
          </p>
        </div>

        <div className="rounded-lg border border-[#2F80ED]/30 bg-[#EAF4FF] px-3 py-2 text-[11px] font-black uppercase text-[#0B4EA2]">
          {registro}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div
          className={compact ? "overflow-visible" : "compact-scroll max-h-[340px] overflow-auto"}
        >
          <table className={`w-full border-collapse ${compact ? "text-[10px]" : "min-w-[760px] text-xs"}`}>
            <thead className="sticky top-0 z-20 bg-[#f8f8f6]">
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                {columns.map((column, index) => (
                  <th
                    key={column}
                    className={`${compact ? "px-2 py-1.5" : "px-4 py-3"} font-black ${
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
                    className="px-4 py-6 text-center text-xs font-semibold text-slate-500"
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
