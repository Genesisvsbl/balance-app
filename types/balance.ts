export type ExcelSheet = {
  nombreReal: string;
  filas: number;
  datos: any[];
};

export type ExcelData = {
  [sheetName: string]: ExcelSheet;
};

export type BalanceRow = {
  codigo: string;
  material: string;
  um: string;
  seccion: string;
  seccionesArray: string[];
  necesidadesPorSemana: Record<string, number>;
  totalNecesidad: number;
  almacenes: Record<string, number>;
  totalExistencia: number;
  diferenciaTotal: number;
  diferenciasPorSemana: Record<string, number>;
  estado: "FALTANTE" | "SOBRANTE" | "JUSTO" | "OK";
};

export type BalanceInfo = {
  hojaReceta: string;
  hojaExistencias: string;
  columnasSemana: string[];
  almacenesDetectados: string[];
  seccionesDetectadas: string[];
  totalComponentes: number;
  totalFaltantes: number;
  totalSobrantes: number;
};

export type SavedLoad = {
  id: string;
  fecha: string;
  archivo: string;
  hojas: string[];
  analisis: BalanceRow[];
  info: BalanceInfo | null;
};