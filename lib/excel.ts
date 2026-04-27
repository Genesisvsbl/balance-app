import * as XLSX from "xlsx";
import { ExcelData } from "@/types/balance";

export async function leerArchivoExcel(file: File): Promise<ExcelData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const resultado: ExcelData = {};

  workbook.SheetNames.forEach((nombreHoja) => {
    const worksheet = workbook.Sheets[nombreHoja];

    const json = XLSX.utils.sheet_to_json(worksheet, {
      defval: "",
      raw: true,
    });

    resultado[nombreHoja] = {
      nombreReal: nombreHoja,
      filas: json.length,
      datos: json.slice(0, 10000),
    };
  });

  return resultado;
}