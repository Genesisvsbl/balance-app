import type {
  BalanceInfo,
  BalanceRow,
  ExcelData,
  InventarioBloqueadoRow,
  RecepcionTransito,
} from "@/types/balance";
import { convertirNumero } from "./format";

type ExcelRow = Record<string, any>;
type ColumnaSemana = { key: string; label: string };

function normalizarTexto(valor: string) {
  return valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function obtenerHoja(datos: ExcelData, nombres: string[]) {
  const objetivos = nombres.map(normalizarTexto);
  const entrada = Object.entries(datos).find(([key]) =>
    objetivos.includes(normalizarTexto(key))
  );

  return entrada ? entrada[1] : null;
}

function obtenerValor(fila: ExcelRow, nombres: string[]) {
  for (const nombre of nombres) {
    const objetivo = normalizarTexto(nombre);
    const key = Object.keys(fila || {}).find(
      (columna) =>
        normalizarTexto(columna) === objetivo &&
        fila[columna] !== undefined &&
        fila[columna] !== ""
    );

    if (key) return fila[key];
  }

  return "";
}

function esFecha(valor: string) {
  const texto = valor.trim();
  if (!texto) return false;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(texto)) return true;
  if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(texto)) return true;

  const fecha = new Date(texto);
  return (
    !Number.isNaN(fecha.getTime()) &&
    (/[a-zA-Z]{3,}/.test(texto) || /[/-]/.test(texto))
  );
}

function formatearFecha(valor: any) {
  if (valor instanceof Date) {
    return valor.toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  const texto = String(valor ?? "").trim();
  const fecha = new Date(texto);

  if (esFecha(texto) && !Number.isNaN(fecha.getTime())) {
    return fecha.toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  return texto;
}

function obtenerColumnasSemana(columnas: string[]): ColumnaSemana[] {
  const usadas = new Set<string>();

  return columnas
    .filter((col) => normalizarTexto(col).startsWith("sem"))
    .map((key) => {
      let label = key.trim();
      let contador = 2;

      while (usadas.has(label)) {
        label = `${key.trim()} (${contador})`;
        contador += 1;
      }

      usadas.add(label);
      return { key, label };
    });
}

function obtenerSemanaDePlan(fila: ExcelRow, semanasBalance: string[]) {
  const semana = String(
    obtenerValor(fila, [
      "Semana",
      "Semana correspondiente",
      "Semana recepcion",
      "Semana recepciÃ³n",
      "Week",
    ])
  ).trim();

  if (!semana) return "";

  return (
    semanasBalance.find(
      (sem) => normalizarTexto(sem) === normalizarTexto(semana)
    ) || ""
  );
}

export function generarBalance(datos: ExcelData): {
  analisis: BalanceRow[];
  info: BalanceInfo;
} {
  const hojaReceta: any = obtenerHoja(datos, ["Receta"]);
  const hojaExistencias: any = obtenerHoja(datos, ["Existencias"]);
  const hojaConsumos: any = obtenerHoja(datos, ["Consumos", "Consumo"]);
  const hojaPlanProduccion: any = obtenerHoja(datos, ["Plan"]);
  const hojaPi: any = obtenerHoja(datos, ["PI", "P.I", "Politica Inventario", "Politica de Inventario", "Politicas Inventario", "PolÃ­tica Inventario", "PolÃ­tica de Inventario"]);
  const hojaPlan: any = obtenerHoja(datos, [
    "Plan de Recibo",
    "PLAN DE RECIBO",
    "Plan de Recepcion",
    "Plan de RecepciÃ³n",
    "Plan Recepcion",
    "Plan RecepciÃ³n",
    "Programacion",
    "ProgramaciÃ³n",
  ]);

  if (!hojaReceta || !hojaExistencias) {
    throw new Error("No se encontrÃ³ la hoja Receta o Existencias.");
  }

  const receta = hojaReceta.datos || [];
  const existencias = hojaExistencias.datos || [];
  const consumos = hojaConsumos?.datos || [];
  const planRecepcion = hojaPlan?.datos || [];
  const planProduccion = hojaPlanProduccion?.datos || [];
  const politicasInventario = hojaPi?.datos || [];

  if (receta.length === 0 || existencias.length === 0) {
    throw new Error("Receta o Existencias no tienen datos.");
  }

  const columnasReceta = Object.keys(receta[0] || {});
  const columnasSemana = obtenerColumnasSemana(columnasReceta);
  const etiquetasSemana = columnasSemana.map((col) => col.label);

  const mapaExistencias: any = {};
  const almacenesSet = new Set<string>();
  const skuLibreSet = new Set<string>();
  const skuBloqueadoSet = new Set<string>();
  const skuExistenciasSet = new Set<string>();

  existencias.forEach((fila: ExcelRow) => {
    const material = String(
      obtenerValor(fila, ["Material", "CÃ³digo", "Codigo"])
    ).trim();
    const textoBreve = String(
      obtenerValor(fila, [
        "Texto breve de material",
        "Texto breve material",
        "Texto breve",
        "Descripcion",
        "DescripciÃ³n",
      ])
    ).trim();
    const almacen = String(
      obtenerValor(fila, ["Alm.", "Alm", "ALM", "Almacen", "AlmacÃ©n"])
    ).trim();
    const libre = convertirNumero(
      obtenerValor(fila, [
        "Libre utiliz.",
        "Libre utiliz",
        "Libre Utiliz.",
        "Libre Utiliz",
        "Libre utilizaciÃ³n",
        "Libre Utilizacion",
      ])
    );
    const bloqueado = convertirNumero(
      obtenerValor(fila, ["Bloqueado", "Stock bloqueado", "Inventario bloqueado"])
    );
    const valorStock = convertirNumero(
      obtenerValor(fila, ["Vr.Stock Alm.", "Vr.Stock Alm"])
    );
    const valorBloqueado =
      libre > 0
        ? (valorStock / libre) * bloqueado
        : bloqueado > 0
        ? valorStock
        : 0;

    if (!material) return;

    const skuExistenciaKey = `${material}::${almacen || "SIN_ALMACEN"}`;
    if (libre > 0) skuLibreSet.add(skuExistenciaKey);
    if (bloqueado > 0) skuBloqueadoSet.add(skuExistenciaKey);
    skuExistenciasSet.add(skuExistenciaKey);

    if (!mapaExistencias[material]) {
      mapaExistencias[material] = {
        total: 0,
        bloqueado: 0,
        valorStock: 0,
        valorBloqueado: 0,
        textoBreve: "",
        almacenes: {},
      };
    }

    if (textoBreve && !mapaExistencias[material].textoBreve) {
      mapaExistencias[material].textoBreve = textoBreve;
    }
    mapaExistencias[material].total += libre;
    mapaExistencias[material].bloqueado += bloqueado;
    mapaExistencias[material].valorStock += valorStock;
    mapaExistencias[material].valorBloqueado += valorBloqueado;

    if (almacen) {
      almacenesSet.add(almacen);
      mapaExistencias[material].almacenes[almacen] =
        (mapaExistencias[material].almacenes[almacen] || 0) + libre;
    }
  });

  const almacenesDetectados = Array.from(almacenesSet);
  const valoresInventario: {
    total: number;
    bloqueado: number;
    libre: number;
  } = (Object.values(mapaExistencias) as any[]).reduce(
    (acc: any, item: any) => {
      acc.total += item.valorStock || 0;
      acc.bloqueado += item.valorBloqueado || 0;
      return acc;
    },
    { total: 0, bloqueado: 0, libre: 0 }
  );
  valoresInventario.libre =
    valoresInventario.total - valoresInventario.bloqueado;

  const totalSkuLibre = skuLibreSet.size;
  const totalSkuBloqueado = skuBloqueadoSet.size;
  const totalSkuExistencias = skuExistenciasSet.size;

  const materialesBloqueados: InventarioBloqueadoRow[] = (
    Object.entries(mapaExistencias) as [string, any][]
  )
    .map(([material, item]) => ({
      material,
      textoBreve: item.textoBreve || "",
      cantidad: item.bloqueado || 0,
      valor: item.valorBloqueado || 0,
    }))
    .filter((item) => item.cantidad > 0 || item.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  const skuProduccionDescripcion = new Map<string, string>();
  const skuProduccionSemanas = new Map<string, Set<string>>();

  planProduccion.forEach((fila: ExcelRow) => {
    const codigoSap = String(
      obtenerValor(fila, ["SAP", "Codigo SAP", "CÃ³digo SAP", "Sku SAP", "SKU SAP"])
    ).trim();
    const descripcionSku = String(
      obtenerValor(fila, ["SKU", "Descripcion SKU", "DescripciÃ³n SKU", "Producto", "Descripcion"])
    ).trim();

    const semanaSap = obtenerSemanaDePlan(fila, etiquetasSemana);

    if (codigoSap) {
      skuProduccionDescripcion.set(codigoSap, descripcionSku || codigoSap);
      if (!skuProduccionSemanas.has(codigoSap)) {
        skuProduccionSemanas.set(codigoSap, new Set());
      }
      if (semanaSap) skuProduccionSemanas.get(codigoSap)?.add(semanaSap);
    }
  });

  const mapaRecepciones: Record<string, any> = {};

  planRecepcion.forEach((fila: ExcelRow) => {
    const codigo = String(
      obtenerValor(fila, [
        "SKU",
        "Codigo SKU",
        "CÃ³digo SKU",
        "CÃ³digo material",
        "Codigo material",
        "Codigo",
        "CÃ³digo",
        "Material",
      ])
    ).trim();
    const semana = obtenerSemanaDePlan(fila, etiquetasSemana);
    const cantidad = convertirNumero(
      obtenerValor(fila, [
        "Cantidad",
        "Cantidad programada",
        "Cantidad prevista",
        "Cantidad prevista de recepciÃ³n",
      ])
    );
    const fecha = formatearFecha(
      obtenerValor(fila, [
        "Fecha operativa",
        "Fecha",
        "Fecha recepcion",
        "Fecha recepciÃ³n",
      ])
    );

    const fechaRecibo = formatearFecha(
      obtenerValor(fila, [
        "Fecha recibo",
        "Fecha de recibo",
        "FECHA  RECIBO",
        "FECHA RECIBO",
      ])
    );

    if (!codigo || !semana || fechaRecibo) return;

    if (!mapaRecepciones[codigo]) mapaRecepciones[codigo] = {};
    if (!mapaRecepciones[codigo][semana]) {
      mapaRecepciones[codigo][semana] = {
        cantidad: 0,
        fechas: new Set<string>(),
        detalles: [],
      };
    }

    mapaRecepciones[codigo][semana].cantidad += cantidad;
    if (fecha) mapaRecepciones[codigo][semana].fechas.add(fecha);
    mapaRecepciones[codigo][semana].detalles.push({
      fechaOperativa: fecha,
      cantidad,
    });
  });


  function obtenerNumeroOpcional(fila: ExcelRow, nombres: string[]) {
    const valor = obtenerValor(fila, nombres);
    if (valor === "" || valor === null || valor === undefined) return null;
    const numero = convertirNumero(valor);
    return Number.isFinite(numero) ? numero : null;
  }

  const mapaPoliticasInventario: Record<
    string,
    { stockMin: number | null; stockMed: number | null; stockMax: number | null }
  > = {};

  politicasInventario.forEach((fila: ExcelRow) => {
    const codigo = String(
      obtenerValor(fila, [
        "Codigo",
        "CÃ³digo",
        "Material",
        "NÂ° componente",
        "NÂº componente",
        "No. componente",
        "Componente",
        "SKU",
      ])
    ).trim();

    if (!codigo) return;

    mapaPoliticasInventario[codigo] = {
      stockMin: obtenerNumeroOpcional(fila, [
        "Stock Min",
        "Stock Min.",
        "Stock Minimo",
        "Stock MÃ­nimo",
        "Min",
        "Minimo",
        "MÃ­nimo",
      ]),
      stockMed: obtenerNumeroOpcional(fila, [
        "Stock Med",
        "Stock Med.",
        "Stock Medio",
        "Med",
        "Medio",
      ]),
      stockMax: obtenerNumeroOpcional(fila, [
        "Stock Max",
        "Stock Max.",
        "Stock Maximo",
        "Stock MÃ¡ximo",
        "Max",
        "Maximo",
        "MÃ¡ximo",
      ]),
    };
  });
  const mapaNecesidades: any = {};
  const recetaPorSku: Record<
    string,
    { componente: string; cantidadBase: number }[]
  > = {};
  const skusPorComponente: Record<string, Map<string, string>> = {};
  const seccionesSet = new Set<string>();

  receta.forEach((fila: ExcelRow) => {
    const codigo = String(
      obtenerValor(fila, [
        "N° componente",
        "Nº componente",
        "No. componente",
        "No componente",
        "Nro componente",
        "Numero componente",
        "Número componente",
        "N componente",
        "NÃ‚Â° componente",
        "NÃ‚Âº componente",
        "NÃƒâ€šÃ‚Â° componente",
        "NÃƒâ€šÃ‚Âº componente",
        "N° Componente",
        "Nº Componente",
        "No. Componente",
        "Componente",
      ])
    ).trim();

    if (!codigo) return;

    const skuPlan = String(
      obtenerValor(fila, [
        "Codigo",
        "CÃ³digo",
        "SKU",
        "Material padre",
        "Material Padre",
      ])
    ).trim();

    const seccion = String(
      obtenerValor(fila, ["Seccion", "SecciÃ³n", "SECCION", "SECCIÃ“N"])
    ).trim();

    if (seccion) seccionesSet.add(seccion);

    if (!mapaNecesidades[codigo]) {
      mapaNecesidades[codigo] = {
        codigo,
        material:
          obtenerValor(fila, [
            "Texto breve-objeto",
            "Texto breve objeto",
            "Texto breve de material",
            "Texto breve",
            "DescripciÃ³n",
            "Descripcion",
          ]) || "",
        um: obtenerValor(fila, ["UM", "UMB"]) || "",
        secciones: new Set<string>(),
        necesidadesPorSemana: {},
        totalNecesidad: 0,
      };

      etiquetasSemana.forEach((sem) => {
        mapaNecesidades[codigo].necesidadesPorSemana[sem] = 0;
      });
    }

    if (seccion) mapaNecesidades[codigo].secciones.add(seccion);

    if (skuPlan) {
      if (!recetaPorSku[skuPlan]) recetaPorSku[skuPlan] = [];
      recetaPorSku[skuPlan].push({
        componente: codigo,
        cantidadBase: convertirNumero(
          obtenerValor(fila, ["Cantidad", "Cantidad base"])
        ),
      });

      if (!skusPorComponente[codigo]) skusPorComponente[codigo] = new Map();
      skusPorComponente[codigo].set(
        skuPlan,
        skuProduccionDescripcion.get(skuPlan) || skuPlan
      );
    }

    columnasSemana.forEach(({ key, label }) => {
      const valor = convertirNumero(fila[key]);
      mapaNecesidades[codigo].necesidadesPorSemana[label] += valor;
      mapaNecesidades[codigo].totalNecesidad += valor;
    });
  });

  const consumosPorMaterial: Record<string, number> = {};

  consumos.forEach((fila: ExcelRow) => {
    const sku = String(
      obtenerValor(fila, ["Material", "SKU", "Codigo", "CÃ³digo"])
    ).trim();
    const cantidadConsumo = convertirNumero(
      obtenerValor(fila, ["Cantidad", "Cantidad consumo"])
    );
    const recetaSku = recetaPorSku[sku] || [];

    recetaSku.forEach((item) => {
      consumosPorMaterial[item.componente] =
        (consumosPorMaterial[item.componente] || 0) +
        (cantidadConsumo * item.cantidadBase) / 100;
    });
  });

  const analisis: BalanceRow[] = Object.values(mapaNecesidades).map(
    (item: any) => {
      const codigo = item.codigo;
      const existencia = mapaExistencias[codigo] || {};
      const politicaInventario = mapaPoliticasInventario[codigo] || {};
      const almacenes = existencia.almacenes || {};
      const existenciaBalance =
        (almacenes["AG01"] || 0) + (almacenes["AG04"] || 0);
      const recepciones = mapaRecepciones[codigo] || {};
      const recepcionesPorSemana: Record<string, number> = {};
      const fechasRecepcionPorSemana: Record<string, string[]> = {};
      const transitosPorSemana: Record<string, RecepcionTransito[]> = {};
      const coberturaPorSemana: Record<string, number> = {};
      const diferenciasPorSemana: any = {};
      let acumulado = existenciaBalance;
      let totalRecepcion = 0;

      etiquetasSemana.forEach((sem) => {
        const recepcion = recepciones[sem]?.cantidad || 0;
        const necesidad = item.necesidadesPorSemana[sem] || 0;

        totalRecepcion += recepcion;
        recepcionesPorSemana[sem] = recepcion;
        fechasRecepcionPorSemana[sem] = Array.from(
          recepciones[sem]?.fechas || []
        );
        transitosPorSemana[sem] = recepciones[sem]?.detalles || [];
        coberturaPorSemana[sem] = necesidad > 0 ? (recepcion / necesidad) * 100 : 0;
        acumulado -= necesidad;
        diferenciasPorSemana[sem] = acumulado;
      });

      const diferenciaTotal = existenciaBalance - item.totalNecesidad;

      let estado: BalanceRow["estado"] = "OK";
      if (diferenciaTotal < 0) estado = "FALTANTE";
      if (diferenciaTotal === 0) estado = "JUSTO";
      if (diferenciaTotal > 0) estado = "SOBRANTE";

      return {
        codigo,
        material: item.material,
        um: item.um,
        seccion: Array.from(item.secciones || []).join(", "),
        seccionesArray: Array.from(item.secciones || []),
        necesidadesPorSemana: item.necesidadesPorSemana,
        recepcionesPorSemana,
        fechasRecepcionPorSemana,
        transitosPorSemana,
        coberturaPorSemana,
        skusProduccion: Array.from(skusPorComponente[codigo]?.entries() || []).map(
          ([codigoSku, descripcion]) => ({
            codigo: codigoSku,
            descripcion,
            semanas: Array.from(skuProduccionSemanas.get(codigoSku) || []),
          })
        ),
        totalNecesidad: item.totalNecesidad,
        totalRecepcion,
        almacenes,
        inventarioLibre: existencia.total || 0,
        inventarioBloqueado: existencia.bloqueado || 0,
        stockTotal: (existencia.total || 0) + (existencia.bloqueado || 0),
        valorInventarioLibre:
          (existencia.valorStock || 0) - (existencia.valorBloqueado || 0),
        valorInventarioBloqueado: existencia.valorBloqueado || 0,
        valorStockTotal: existencia.valorStock || 0,
        stockMin: politicaInventario.stockMin ?? null,
        stockMed: politicaInventario.stockMed ?? null,
        stockMax: politicaInventario.stockMax ?? null,
        totalExistencia: existenciaBalance,
        diferenciaTotal,
        diferenciasPorSemana,
        estado,
      };
    }
  );

  const faltantes = analisis.filter((r) => r.estado === "FALTANTE");
  const sobrantes = analisis.filter((r) => r.estado === "SOBRANTE");

  return {
    analisis,
    info: {
      hojaReceta: hojaReceta.nombreReal || "Receta",
      hojaExistencias: hojaExistencias.nombreReal || "Existencias",
      hojaPlanRecepcion: hojaPlan?.nombreReal || "",
      columnasSemana: etiquetasSemana,
      almacenesDetectados,
      seccionesDetectadas: Array.from(seccionesSet).sort(),
      totalComponentes: analisis.length,
      totalFaltantes: faltantes.length,
      totalSobrantes: sobrantes.length,
      totalPlanRecepcion: planRecepcion.length,
      valorInventarioLibre: valoresInventario.libre,
      valorInventarioBloqueado: valoresInventario.bloqueado,
      valorInventarioTotal: valoresInventario.total,
      totalSkuLibre,
      totalSkuBloqueado,
      totalSkuExistencias,
      materialesBloqueados,
      consumosPorMaterial,
      skusProduccionDetectados: Array.from(skuProduccionDescripcion.entries()).map(
        ([codigo, descripcion]) => ({
          codigo,
          descripcion,
          semanas: Array.from(skuProduccionSemanas.get(codigo) || []),
        })
      ),
    },
  };
}
