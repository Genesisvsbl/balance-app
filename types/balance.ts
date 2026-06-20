export type ExcelSheet = {
  nombreReal: string;
  filas: number;
  datos: any[];
};

export type ExcelData = {
  [sheetName: string]: ExcelSheet;
};

export type RecepcionTransito = {
  fechaOperativa: string;
  cantidad: number;
};

export type SkuProduccion = {
  codigo: string;
  descripcion: string;
  semanas?: string[];
};

export type InventarioBloqueadoRow = {
  material: string;
  textoBreve: string;
  cantidad: number;
  valor: number;
};

export type BalanceRow = {
  codigo: string;
  material: string;
  um: string;
  seccion: string;
  seccionesArray: string[];
  necesidadesPorSemana: Record<string, number>;
  recepcionesPorSemana?: Record<string, number>;
  fechasRecepcionPorSemana?: Record<string, string[]>;
  transitosPorSemana?: Record<string, RecepcionTransito[]>;
  coberturaPorSemana?: Record<string, number>;
  skusProduccion?: SkuProduccion[];
  totalNecesidad: number;
  totalRecepcion?: number;
  almacenes: Record<string, number>;
  inventarioLibre?: number;
  inventarioBloqueado?: number;
  stockTotal?: number;
  valorInventarioLibre?: number;
  valorInventarioBloqueado?: number;
  valorStockTotal?: number;
  totalExistencia: number;
  diferenciaTotal: number;
  diferenciasPorSemana: Record<string, number>;
  estado: "FALTANTE" | "SOBRANTE" | "JUSTO" | "OK" | "DISPONIBLE" | "RESERVADO" | "REPOSICION" | "REABASTECIMIENTO" | "SIN_NECESIDAD";
};

export type BalanceInfo = {
  hojaReceta: string;
  hojaExistencias: string;
  hojaPlanRecepcion?: string;
  columnasSemana: string[];
  almacenesDetectados: string[];
  seccionesDetectadas: string[];
  totalComponentes: number;
  totalFaltantes: number;
  totalSobrantes: number;
  totalPlanRecepcion?: number;
  valorInventarioLibre?: number;
  valorInventarioBloqueado?: number;
  valorInventarioTotal?: number;
  totalSkuLibre?: number;
  totalSkuBloqueado?: number;
  totalSkuExistencias?: number;
  materialesBloqueados?: InventarioBloqueadoRow[];
  consumosPorMaterial?: Record<string, number>;
  skusProduccionDetectados?: SkuProduccion[];
};

export type SavedLoad = {
  id: string;
  fecha: string;
  createdBy?: {
    id: string;
    username: string;
    fullName: string;
  };
  archivo: string;
  hojas: string[];
  analisis: BalanceRow[];
  info: BalanceInfo | null;
};
