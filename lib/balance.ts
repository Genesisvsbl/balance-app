import { BalanceInfo, BalanceRow, ExcelData } from "@/types/balance";
import { convertirNumero } from "./format";

function obtenerHoja(datos: ExcelData, nombre: string) {
  const entrada = Object.entries(datos).find(
    ([key]) => key.toLowerCase().trim() === nombre.toLowerCase().trim()
  );

  return entrada ? entrada[1] : null;
}

export function generarBalance(datos: ExcelData): {
  analisis: BalanceRow[];
  info: BalanceInfo;
} {
  const hojaReceta: any = obtenerHoja(datos, "Receta");
  const hojaExistencias: any = obtenerHoja(datos, "Existencias");

  if (!hojaReceta || !hojaExistencias) {
    throw new Error("No se encontró la hoja Receta o Existencias.");
  }

  const receta = hojaReceta.datos || [];
  const existencias = hojaExistencias.datos || [];

  if (receta.length === 0 || existencias.length === 0) {
    throw new Error("Receta o Existencias no tienen datos.");
  }

  const columnasReceta = Object.keys(receta[0] || {});

  const columnasSemana = columnasReceta.filter((col) =>
    col.toLowerCase().replace(/\s/g, "").startsWith("sem")
  );

  const mapaExistencias: any = {};
  const almacenesSet = new Set<string>();

  existencias.forEach((fila: any) => {
    const material = String(fila["Material"] || "").trim();

    const almacen = String(
      fila["Alm."] || fila["Alm"] || fila["ALM"] || fila["Almacen"] || ""
    ).trim();

    const libre = convertirNumero(
      fila["Libre utiliz."] ||
        fila["Libre utiliz"] ||
        fila["Libre Utiliz."] ||
        fila["Libre Utiliz"] ||
        fila["Libre utilización"] ||
        fila["Libre Utilizacion"] ||
        0
    );

    if (!material) return;

    if (!mapaExistencias[material]) {
      mapaExistencias[material] = {
        total: 0,
        almacenes: {},
      };
    }

    mapaExistencias[material].total += libre;

    if (almacen) {
      almacenesSet.add(almacen);
      mapaExistencias[material].almacenes[almacen] =
        (mapaExistencias[material].almacenes[almacen] || 0) + libre;
    }
  });

  const almacenesDetectados = Array.from(almacenesSet);

  const mapaNecesidades: any = {};
  const seccionesSet = new Set<string>();

  receta.forEach((fila: any) => {
    const codigo = String(
      fila["N° componente"] ||
        fila["Nº componente"] ||
        fila["N° Componente"] ||
        fila["Nº Componente"] ||
        fila["Material"] ||
        ""
    ).trim();

    if (!codigo) return;

    const seccion = String(
      fila["Seccion"] ||
        fila["Sección"] ||
        fila["SECCION"] ||
        fila["SECCIÓN"] ||
        ""
    ).trim();

    if (seccion) seccionesSet.add(seccion);

    if (!mapaNecesidades[codigo]) {
      mapaNecesidades[codigo] = {
        codigo,
        material:
          fila["Texto breve-objeto"] ||
          fila["Texto breve objeto"] ||
          fila["Texto breve de material"] ||
          fila["Descripción"] ||
          fila["Descripcion"] ||
          "",
        um: fila["UM"] || fila["UMB"] || "",
        secciones: new Set<string>(),
        necesidadesPorSemana: {},
        totalNecesidad: 0,
      };

      columnasSemana.forEach((sem) => {
        mapaNecesidades[codigo].necesidadesPorSemana[sem] = 0;
      });
    }

    if (seccion) {
      mapaNecesidades[codigo].secciones.add(seccion);
    }

    columnasSemana.forEach((sem) => {
      const valor = convertirNumero(fila[sem]);
      mapaNecesidades[codigo].necesidadesPorSemana[sem] += valor;
      mapaNecesidades[codigo].totalNecesidad += valor;
    });
  });

  const analisis: BalanceRow[] = Object.values(mapaNecesidades).map(
    (item: any) => {
      const codigo = item.codigo;
      const almacenes = mapaExistencias[codigo]?.almacenes || {};

      const existenciaBalance =
        (almacenes["AG01"] || 0) + (almacenes["AG04"] || 0);

      const diferenciaTotal = existenciaBalance - item.totalNecesidad;

      let acumulado = existenciaBalance;
      const diferenciasPorSemana: any = {};

      columnasSemana.forEach((sem) => {
        acumulado -= item.necesidadesPorSemana[sem] || 0;
        diferenciasPorSemana[sem] = acumulado;
      });

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
        totalNecesidad: item.totalNecesidad,
        almacenes,
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
      columnasSemana,
      almacenesDetectados,
      seccionesDetectadas: Array.from(seccionesSet).sort(),
      totalComponentes: analisis.length,
      totalFaltantes: faltantes.length,
      totalSobrantes: sobrantes.length,
    },
  };
}