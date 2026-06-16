import * as XLSX from "xlsx";
import { ExcelData } from "@/types/balance";

function normalizarTexto(valor: string) {
  return valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function puntuarFilaEncabezado(fila: any[]) {
  const claves = [
    "material",
    "sku",
    "codigo",
    "codigocita",
    "semana",
    "fechaoperativa",
    "cantidad",
    "cantidadprogramada",
    "libreutiliz",
    "bloqueado",
    "textobreve",
    "ncomponente",
  ];

  return fila.reduce((acc, celda) => {
    const texto = normalizarTexto(String(celda ?? ""));
    if (!texto) return acc;
    return acc + (claves.some((clave) => texto.includes(clave)) ? 3 : 1);
  }, 0);
}

function obtenerFilaEncabezado(worksheet: XLSX.WorkSheet) {
  const filas = XLSX.utils.sheet_to_json<any[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  let mejorIndice = 0;
  let mejorPuntaje = -1;

  filas.slice(0, 10).forEach((fila, indice) => {
    const puntaje = puntuarFilaEncabezado(fila);
    if (puntaje > mejorPuntaje) {
      mejorIndice = indice;
      mejorPuntaje = puntaje;
    }
  });

  return mejorIndice;
}

function unirDatos(base: ExcelData, nuevo: ExcelData) {
  Object.entries(nuevo).forEach(([nombre, hoja]) => {
    let nombreFinal = nombre;
    let contador = 2;

    while (base[nombreFinal]) {
      nombreFinal = `${nombre} (${contador})`;
      contador += 1;
    }

    base[nombreFinal] = hoja;
  });
}

export async function leerArchivoExcel(file: File): Promise<ExcelData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const resultado: ExcelData = {};

  workbook.SheetNames.forEach((nombreHoja) => {
    const worksheet = workbook.Sheets[nombreHoja];
    const headerRow = obtenerFilaEncabezado(worksheet);
    const json = XLSX.utils.sheet_to_json(worksheet, {
      defval: "",
      raw: true,
      range: headerRow,
    });

    resultado[nombreHoja] = {
      nombreReal: nombreHoja,
      filas: json.length,
      datos: json.slice(0, 10000),
    };
  });

  return resultado;
}

export async function leerArchivosExcel(files: File[]): Promise<ExcelData> {
  const combinado: ExcelData = {};

  for (const file of files) {
    unirDatos(combinado, await leerArchivoExcel(file));
  }

  return combinado;
}
