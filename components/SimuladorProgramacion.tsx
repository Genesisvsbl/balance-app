"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

export type SimRow = {
  codigo: string;
  material: string;
  um: string;
  necesidadesPorSemana: Record<string, number>;
  transitosPorSemana?: Record<string, number>;
  capacidadVehiculo: number;
  capacidadUnidad: number;
  skusProduccion: string[];
};

type Props = {
  rows: SimRow[];
  semanas: string[];
};

type DiasHabiles = "LV" | "LS" | "TODOS";

const DIAS_SET: Record<DiasHabiles, number[]> = {
  LV: [1, 2, 3, 4, 5],
  LS: [1, 2, 3, 4, 5, 6],
  TODOS: [1, 2, 3, 4, 5, 6, 0],
};

const NOMBRE_DIA = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

const LS_VEHICULOS = "balance2_sim_vehiculos";
const LS_BASE = "balance2_sim_base";
function cargarLS(key: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(key) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

type HtmlToImage = { toBlob: (node: HTMLElement, options?: object) => Promise<Blob | null> };
async function cargarHtmlToImage(): Promise<HtmlToImage> {
  const w = window as unknown as { htmlToImage?: HtmlToImage };
  if (w.htmlToImage) return w.htmlToImage;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar la libreria de imagen"));
    document.head.appendChild(script);
  });
  if (!w.htmlToImage) throw new Error("libreria de imagen no disponible");
  return w.htmlToImage;
}

type OcrWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };
type OcrData = { words?: OcrWord[]; text: string };
type TessWorker = {
  setParameters: (p: Record<string, unknown>) => Promise<unknown>;
  recognize: (img: string) => Promise<{ data: OcrData }>;
  terminate: () => Promise<unknown>;
};
type TesseractLib = {
  createWorker?: (lang?: string) => Promise<TessWorker>;
  recognize: (img: File | string, lang: string) => Promise<{ data: OcrData }>;
};
async function cargarTesseract(): Promise<TesseractLib> {
  const w = window as unknown as { Tesseract?: TesseractLib };
  if (w.Tesseract) return w.Tesseract;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar el OCR"));
    document.head.appendChild(script);
  });
  if (!w.Tesseract) throw new Error("OCR no disponible");
  return w.Tesseract;
}

function cargarImagen(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Preprocesa la foto para el OCR: la agranda, pasa a gris y sube el contraste.
async function preprocesar(file: File): Promise<string> {
  const img = await cargarImagen(file);
  const escala = img.width > 0 ? Math.min(3, Math.max(1, 2400 / img.width)) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    g = (g - 128) * 1.5 + 128;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

function normalizarTexto(t: string) {
  return (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Encuentra el codigo de referencia que corresponde a un formato leido (1000/330/1500/200/269).
function formatoAcodigo(fmt: string, filas: SimRow[], tipo?: "PREFORMA" | "LATA"): string | null {
  const aliases: Record<string, string[]> = {
    "1000": ["1000"],
    "1500": ["1.5", "1500"],
    "330": ["330"],
    "269": ["269"],
    "200": ["200"],
  };
  const al = aliases[fmt] || [fmt];
  const row = filas.find((r) => {
    const texto = normalizarTexto(`${r.codigo} ${r.material}`).replace(/,/g, ".");
    if (tipo === "PREFORMA" && !texto.includes("preforma")) return false;
    if (tipo === "LATA" && !texto.includes("lata")) return false;
    return al.some((a) => texto.includes(a));
  });
  return row ? row.codigo : null;
}

// Lee los dias de produccion por referencia desde las palabras del OCR (usando sus posiciones).
function parsearFoto(words: OcrWord[], filas: SimRow[]): Record<string, number[]> {
  const dia3: Record<string, number> = { lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 0 };
  const cols: { wd: number; x: number }[] = [];
  words.forEach((word) => {
    const t = normalizarTexto(word.text).replace(/[^a-z]/g, "");
    if (t.length >= 3 && t.length <= 10 && dia3[t.slice(0, 3)] !== undefined) {
      cols.push({ wd: dia3[t.slice(0, 3)], x: (word.bbox.x0 + word.bbox.x1) / 2 });
    }
  });
  if (cols.length === 0) return {};
  const res: Record<string, Set<number>> = {};
  const formatos = ["1000", "1500", "330", "269", "200"];
  words.forEach((word) => {
    const nums: string[] = word.text.match(/\d+/g) || [];
    const fmt = formatos.find((f) => nums.includes(f));
    if (!fmt) return;
    const codigo = formatoAcodigo(fmt, filas);
    if (!codigo) return;
    const x = (word.bbox.x0 + word.bbox.x1) / 2;
    let best = cols[0];
    let mejorDist = Math.abs(x - cols[0].x);
    cols.forEach((c) => {
      const d = Math.abs(x - c.x);
      if (d < mejorDist) { mejorDist = d; best = c; }
    });
    (res[codigo] ||= new Set<number>()).add(best.wd);
  });
  const salida: Record<string, number[]> = {};
  Object.entries(res).forEach(([k, v]) => { salida[k] = Array.from(v).sort(); });
  return salida;
}

// Lee la foto del plan con Gemini (IA de vision) y devuelve los dias de produccion por referencia.
async function leerConGemini(file: File, key: string, filas: SimRow[]): Promise<Record<string, number[]>> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });
  const prompt =
    'Esta es una tabla de programacion de produccion de una linea de embotellado. Las columnas son los dias de la semana (lunes a domingo). Dime que FORMATO de botella se produce cada dia. Los formatos posibles son exactamente: 1000, 330, 1500, 200, 269 (en la tabla aparecen como "1000 X 15", "330 X 24", "1500 X 6", etc.). Ignora las celdas que dicen "NST", "sin programacion" o "demanda". Responde UNICAMENTE un JSON con este formato exacto: {"lunes":["1000"],"martes":["1000"],"miercoles":["1000","330"],"jueves":["330"],"viernes":["330","1500"],"sabado":["1500"],"domingo":[]}. Incluye solo los formatos realmente producidos cada dia.';
  const body = {
    contents: [
      { parts: [{ text: prompt }, { inlineData: { mimeType: file.type || "image/png", data: base64 } }] },
    ],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  };
  const modelos = [
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash",
  ];
  let json: { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null = null;
  let ultimoError = "";
  for (const modelo of modelos) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(key)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (resp.ok) {
      json = await resp.json();
      break;
    }
    const t = await resp.text();
    ultimoError = `${resp.status}: ${t.slice(0, 120)}`;
    if (resp.status !== 429 && resp.status !== 404 && resp.status !== 400) {
      throw new Error(`Gemini ${ultimoError}`);
    }
  }
  if (!json) throw new Error(`Gemini sin cupo en todos los modelos (${ultimoError})`);
  const texto: string = json?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const dias = JSON.parse(texto) as Record<string, string[]>;
  const diaNum: Record<string, number> = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0 };
  const res: Record<string, Set<number>> = {};
  Object.entries(dias).forEach(([dia, fmts]) => {
    const wd = diaNum[normalizarTexto(dia)];
    if (wd === undefined) return;
    (fmts || []).forEach((fmt) => {
      const codigo = formatoAcodigo(String(fmt).replace(/[^0-9]/g, ""), filas);
      if (codigo) (res[codigo] ||= new Set<number>()).add(wd);
    });
  });
  const salidaG: Record<string, number[]> = {};
  Object.entries(res).forEach(([k, v]) => { salidaG[k] = Array.from(v).sort(); });
  return salidaG;
}

// Lee el Excel del plan (hoja con fila de dias y fila "PROGRAMA INICIAL" con los formatos por columna).
function parsearExcel(rows: unknown[][], filas: SimRow[]): Record<string, number[]> {
  const diaNum: Record<string, number> = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0 };
  const cols: { wd: number; col: number }[] = [];
  rows.forEach((r) => {
    (r || []).forEach((c, col) => {
      const t = normalizarTexto(String(c ?? ""));
      for (const [d, wd] of Object.entries(diaNum)) {
        if (t.startsWith(d)) cols.push({ wd, col });
      }
    });
  });
  cols.sort((a, b) => a.col - b.col);
  const res: Record<string, Set<number>> = {};
  if (cols.length === 0) return {};
  const diaDeCol = (col: number): number | null => {
    let wd: number | null = null;
    for (const dc of cols) { if (dc.col <= col) wd = dc.wd; else break; }
    return wd;
  };
  // 1) SKU de produccion por dia (de las filas TREN-*).
  const skuDias: Record<string, Set<number>> = {};
  rows.forEach((r) => {
    if (!/tren-?\s*\d+/.test(normalizarTexto(String((r || [])[0] ?? "")))) return;
    (r || []).forEach((c, col) => {
      const nums = String(c ?? "").match(/\d{3,}/g) || [];
      if (nums.length === 0) return;
      const wd = diaDeCol(col);
      if (wd === null) return;
      nums.forEach((n) => { (skuDias[n] ||= new Set<number>()).add(wd); });
    });
  });
  // 2) por referencia: dias segun sus SKUs de produccion (receta). Es lo preciso.
  filas.forEach((row) => {
    (row.skusProduccion || []).forEach((sku) => {
      const dset = skuDias[sku];
      if (dset) dset.forEach((wd) => (res[row.codigo] ||= new Set<number>()).add(wd));
    });
  });
  const conSku = new Set(Object.keys(res));
  // 3) respaldo por formato (por tren) para referencias que no matchearon por SKU.
  const formatos = ["1000", "1500", "330", "269", "200"];
  for (let i = 0; i < rows.length; i++) {
    const m = normalizarTexto(String((rows[i] || [])[0] ?? "")).match(/tren-?\s*(\d+)/);
    if (!m) continue;
    const tipo: "PREFORMA" | "LATA" | null = m[1] === "7" ? "PREFORMA" : m[1] === "5" ? "LATA" : null;
    if (!tipo) continue;
    let progRow = -1;
    for (let j = i + 1; j < Math.min(i + 3, rows.length); j++) {
      if (normalizarTexto(String((rows[j] || [])[0] ?? "")).includes("programa")) { progRow = j; break; }
    }
    if (progRow < 0) continue;
    (rows[progRow] || []).forEach((c, col) => {
      const nums: string[] = String(c ?? "").match(/\d+/g) || [];
      const fmt = formatos.find((f) => nums.includes(f));
      if (!fmt) return;
      const wd = diaDeCol(col);
      if (wd === null) return;
      const codigo = formatoAcodigo(fmt, filas, tipo);
      if (codigo && !conSku.has(codigo)) (res[codigo] ||= new Set<number>()).add(wd);
    });
  }
  const salida: Record<string, number[]> = {};
  Object.entries(res).forEach(([k, v]) => { salida[k] = Array.from(v).sort(); });
  return salida;
}

// Gaylords por vehiculo: preformas 40; el SKU 303845 va de 36.
function gaylordsPorVh(codigo: string) {
  return codigo === "303845" ? 36 : 40;
}

function esPreforma(row: SimRow) {
  return `${row.codigo} ${row.material}`.toLowerCase().includes("preforma");
}

// 1 VH por defecto: preformas = gaylords x unidad; tapas/latas = la unidad (varia, el usuario ajusta).
function vhBase(row: SimRow) {
  const unidad = row.capacidadUnidad || 0;
  if (esPreforma(row)) return gaylordsPorVh(row.codigo) * unidad;
  return unidad;
}

function formato(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("en-US");
}

function numero(value: string) {
  const limpio = value.replace(/[^0-9.-]/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

function numeroSemana(sem: string) {
  const match = sem.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function lunesSemanaISO(week: number, year: number) {
  const enero4 = new Date(Date.UTC(year, 0, 4));
  const diaSemana = enero4.getUTCDay() || 7;
  const lunesSemana1 = new Date(enero4);
  lunesSemana1.setUTCDate(enero4.getUTCDate() - (diaSemana - 1));
  const lunes = new Date(lunesSemana1);
  lunes.setUTCDate(lunesSemana1.getUTCDate() + (week - 1) * 7);
  return lunes;
}

function claveFecha(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fechaCorta(clave: string) {
  const d = new Date(`${clave}T00:00:00Z`);
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

function diaNombre(clave: string) {
  const d = new Date(`${clave}T00:00:00Z`);
  return NOMBRE_DIA[d.getUTCDay()];
}

function fechasDeSemana(sem: string, year: number, dias: number[]) {
  const lunes = lunesSemanaISO(numeroSemana(sem), year);
  const resultado: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setUTCDate(lunes.getUTCDate() + i);
    if (dias.includes(d.getUTCDay())) resultado.push(claveFecha(d));
  }
  return resultado;
}

export default function SimuladorProgramacion({ rows, semanas }: Props) {
  const [diasHabiles, setDiasHabiles] = useState<DiasHabiles>("LV");
  const [vhPorClic, setVhPorClic] = useState(1);
  const [semanasOff, setSemanasOff] = useState<Set<string>>(new Set());
  const [vehiculos, setVehiculos] = useState<Record<string, string>>(() => cargarLS(LS_VEHICULOS));
  // Base editable "1 VH = X unidades" por referencia (para tapas u otros que se manejen distinto).
  const [baseOverride, setBaseOverride] = useState<Record<string, string>>(() => cargarLS(LS_BASE));
  const [semanasCombinar, setSemanasCombinar] = useState<string[]>([]);
  const [textoCorreo, setTextoCorreo] = useState<string | null>(null);
  const tablaRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [produccionDias, setProduccionDias] = useState<Record<string, number[]>>({});
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [ocrEstado, setOcrEstado] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState<string>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem("gemini_key") || "" : ""
  );
  const [panelAbierto, setPanelAbierto] = useState(false);
  const excelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_VEHICULOS, JSON.stringify(vehiculos));
  }, [vehiculos]);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_BASE, JSON.stringify(baseOverride));
  }, [baseOverride]);

  const anio = new Date().getFullYear();
  const dias = DIAS_SET[diasHabiles];

  const semanasSel = useMemo(() => {
    const sel = semanas.filter((s) => !semanasOff.has(s));
    return sel.length ? sel : semanas;
  }, [semanas, semanasOff]);

  // Dinamico: solo referencias con necesidad en alguna de las semanas seleccionadas.
  const filasVisibles = useMemo(
    () => rows.filter((row) => semanasSel.some((sem) => (row.necesidadesPorSemana[sem] || 0) > 0)),
    [rows, semanasSel]
  );

  const fechasPorSemana = useMemo(() => {
    const mapa: Record<string, string[]> = {};
    semanasSel.forEach((sem) => {
      mapa[sem] = fechasDeSemana(sem, anio, dias);
    });
    return mapa;
  }, [semanasSel, anio, dias]);

  // Grupos de planeacion: las semanas elegidas en "Combinar" se juntan en un bloque; el resto van separadas.
  const grupos = useMemo(() => {
    const combSet = semanasCombinar
      .filter((s) => semanasSel.includes(s))
      .sort((x, y) => numeroSemana(x) - numeroSemana(y));
    if (combSet.length >= 2) {
      // La semana objetivo (la mas temprana) es la que se programa: su titulo y sus dias,
      // pero con la necesidad sumada de todas las semanas combinadas.
      const target = combSet[0];
      const noComb = semanasSel.filter((s) => !combSet.includes(s));
      const bloques = [
        { label: target, fechas: fechasPorSemana[target] || [], semanas: combSet, orden: numeroSemana(target) },
        ...noComb.map((sem) => ({ label: sem, fechas: fechasPorSemana[sem] || [], semanas: [sem], orden: numeroSemana(sem) })),
      ];
      bloques.sort((x, y) => x.orden - y.orden);
      return bloques.map(({ label, fechas, semanas }) => ({ label, fechas, semanas }));
    }
    return semanasSel.map((sem) => ({ label: sem, fechas: fechasPorSemana[sem] || [], semanas: [sem] }));
  }, [semanasCombinar, semanasSel, fechasPorSemana]);

  function toggleCombinar(sem: string) {
    setSemanasCombinar((prev) => (prev.includes(sem) ? prev.filter((s) => s !== sem) : [...prev, sem]));
  }

  const vhBasePorCodigo = useMemo(() => {
    const mapa: Record<string, number> = {};
    rows.forEach((row) => {
      const ov = baseOverride[row.codigo];
      mapa[row.codigo] = ov !== undefined && ov !== "" ? numero(ov) : vhBase(row);
    });
    return mapa;
  }, [rows, baseOverride]);

  function clave(codigo: string, fecha: string) {
    return `${codigo}|${fecha}`;
  }

  function vhCelda(codigo: string, fecha: string) {
    return vehiculos[clave(codigo, fecha)] ?? "";
  }

  function setVh(codigo: string, fecha: string, valor: string) {
    setVehiculos((prev) => {
      const copia = { ...prev };
      if (valor === "" || valor === "0") delete copia[clave(codigo, fecha)];
      else copia[clave(codigo, fecha)] = valor;
      return copia;
    });
  }

  function unidadesCelda(codigo: string, fecha: string) {
    return numero(vhCelda(codigo, fecha)) * (vhBasePorCodigo[codigo] || 0);
  }

  function asignadoUnidSemana(codigo: string, sem: string) {
    return (fechasPorSemana[sem] || []).reduce(
      (acc, fecha) => acc + unidadesCelda(codigo, fecha),
      0
    );
  }

  function asignadoUnidFechas(codigo: string, fechas: string[]) {
    return fechas.reduce((acc, fecha) => acc + unidadesCelda(codigo, fecha), 0);
  }

  // VH de TRANSITO (automaticos): se leen del transito por semana del balance y se organizan
  // segun el plan (dias de produccion de esa semana). Se pintan aparte, en verde.
  const transitosCelda = useMemo(() => {
    const mapa: Record<string, number> = {};
    grupos.forEach((g) => {
      filasVisibles.forEach((row) => {
        const base = vhBasePorCodigo[row.codigo] || 0;
        if (base <= 0) return;
        const transito = g.semanas.reduce((acc, sem) => acc + (row.transitosPorSemana?.[sem] || 0), 0);
        if (transito <= 0) return;
        const diasProd = produccionDias[row.codigo] || [];
        const fechasProd = g.fechas.filter((f) => diasProd.includes(new Date(`${f}T00:00:00Z`).getUTCDay()));
        const ventana = fechasProd.length > 0 ? fechasProd : g.fechas;
        if (ventana.length === 0) return;
        const vh = Math.ceil(transito / base);
        for (let i = 0; i < vh; i++) {
          const k = clave(row.codigo, ventana[i % ventana.length]);
          mapa[k] = (mapa[k] || 0) + 1;
        }
      });
    });
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupos, filasVisibles, vhBasePorCodigo, produccionDias]);

  function clicCelda(codigo: string, fecha: string) {
    const actual = numero(vhCelda(codigo, fecha));
    setVh(codigo, fecha, String(actual + vhPorClic));
  }

  function limpiar() {
    setVehiculos({});
  }

  async function copiarImagen() {
    if (!tablaRef.current) return;
    setTextoCorreo("Generando imagen...");
    try {
      const lib = await cargarHtmlToImage();
      const nodo = tablaRef.current;
      const blob = await lib.toBlob(nodo, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width: nodo.scrollWidth,
        height: nodo.scrollHeight,
        style: { overflow: "visible" },
      });
      if (!blob) {
        setTextoCorreo("No se pudo generar la imagen.");
        return;
      }
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setTextoCorreo("Imagen copiada. Pegala en tu correo con Ctrl+V.");
      } catch {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "programacion.png";
        a.click();
        URL.revokeObjectURL(url);
        setTextoCorreo("Imagen descargada. Adjuntala al correo.");
      }
    } catch (e) {
      setTextoCorreo("No se pudo generar la imagen: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function subirFoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFotoUrl(URL.createObjectURL(file));
    setPanelAbierto(true);
    try {
      let detectado: Record<string, number[]> = {};
      if (geminiKey.trim()) {
        setOcrEstado("Leyendo la foto con IA (Gemini)...");
        detectado = await leerConGemini(file, geminiKey.trim(), filasVisibles);
      } else {
        setOcrEstado("Leyendo la foto... (puede tardar unos segundos)");
        const T = await cargarTesseract();
        const imagen = await preprocesar(file);
        let data: OcrData;
        if (T.createWorker) {
          const worker = await T.createWorker("spa");
          await worker.setParameters({ tessedit_pageseg_mode: "11" });
          const r = await worker.recognize(imagen);
          data = r.data;
          await worker.terminate();
        } else {
          const r = await T.recognize(imagen, "spa");
          data = r.data;
        }
        detectado = parsearFoto(data.words || [], filasVisibles);
      }
      setProduccionDias(detectado);
      const cuantas = Object.keys(detectado).length;
      setOcrEstado(
        cuantas > 0
          ? `Detecte dias de produccion en ${cuantas} referencia(s). Revisa/ajusta abajo y dale "Autollenar segun foto".`
          : "No pude leer los dias automaticamente. Marcalos a mano abajo usando la foto de referencia."
      );
    } catch (err) {
      setOcrEstado("No se pudo leer la foto: " + (err instanceof Error ? err.message : String(err)) + ". Marca los dias a mano abajo.");
    }
  }

  async function subirExcel(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFotoUrl(null);
    setPanelAbierto(true);
    setOcrEstado("Leyendo el Excel...");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }) as unknown[][];
      const detectado = parsearExcel(rows, filasVisibles);
      setProduccionDias(detectado);
      const cuantas = Object.keys(detectado).length;
      setOcrEstado(
        cuantas > 0
          ? `Lei el Excel: dias de produccion en ${cuantas} referencia(s). Revisa/ajusta abajo y dale "Autollenar segun foto".`
          : "Lei el Excel pero no encontre formatos conocidos. Marca los dias a mano abajo."
      );
    } catch (err) {
      setOcrEstado("No se pudo leer el Excel: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  function toggleDiaProd(codigo: string, wd: number) {
    setProduccionDias((prev) => {
      const actual = prev[codigo] || [];
      const nuevo = actual.includes(wd) ? actual.filter((d) => d !== wd) : [...actual, wd].sort();
      return { ...prev, [codigo]: nuevo };
    });
  }

  function autollenarFoto() {
    const nuevas: Record<string, string> = {};
    const MAX_DIA = 3; // se busca promediar ~2 por dia.
    grupos.forEach((g) => {
      const cargaDia: Record<string, number> = {};
      g.fechas.forEach((f) => { cargaDia[f] = 0; });
      const colocar = (filas: SimRow[]) => {
        const items = filas
          .map((row) => {
            const base = vhBasePorCodigo[row.codigo] || 0;
            const necesidad = g.semanas.reduce((acc, sem) => acc + (row.necesidadesPorSemana[sem] || 0), 0);
            const vh = base > 0 ? Math.ceil(necesidad / base) : 0;
            const diasProd = produccionDias[row.codigo] || [];
            const fechasProd = g.fechas.filter((f) => diasProd.includes(new Date(`${f}T00:00:00Z`).getUTCDay()));
            let ventana = g.fechas;
            let finIdx = g.fechas.length - 1;
            if (fechasProd.length > 0) {
              // Ventana hasta el ULTIMO dia de produccion: reparte a lo largo de la produccion (no solo al inicio).
              finIdx = g.fechas.indexOf(fechasProd[fechasProd.length - 1]);
              ventana = g.fechas.slice(0, finIdx + 1);
            }
            return { codigo: row.codigo, vh, ventana, finIdx };
          })
          .filter((it) => it.vh > 0 && it.ventana.length > 0);
        // Las mas urgentes (ventana que cierra antes) se acomodan primero.
        items.sort((a, b) => a.finIdx - b.finIdx);
        items.forEach((it) => {
          for (let k = 0; k < it.vh; k++) {
            // Dia de la ventana con menor carga; llena hasta 2 antes de usar el 3; empate -> mas temprano.
            let mejor = it.ventana[0];
            const penalDe = (c: number) => (c >= MAX_DIA ? 1000 + c : c);
            let mejorPenal = penalDe(cargaDia[mejor] ?? 0);
            it.ventana.forEach((f) => {
              const penal = penalDe(cargaDia[f] ?? 0);
              if (penal < mejorPenal) { mejorPenal = penal; mejor = f; }
            });
            cargaDia[mejor] = (cargaDia[mejor] ?? 0) + 1;
            const key = clave(it.codigo, mejor);
            nuevas[key] = String(numero(nuevas[key] ?? "0") + 1);
          }
        });
      };
      // El tope de ~2/dia es de PREFORMA: se nivela primero; las tapas/latas rellenan los dias mas livianos.
      colocar(filasVisibles.filter((r) => esPreforma(r)));
      colocar(filasVisibles.filter((r) => !esPreforma(r)));
    });
    setVehiculos(nuevas);
  }

  function autollenar() {
    const nuevas: Record<string, string> = {};
    filasVisibles.forEach((row) => {
      const base = vhBasePorCodigo[row.codigo] || 0;
      if (base <= 0) return;
      grupos.forEach((g) => {
        const necesidad = g.semanas.reduce((acc, sem) => acc + (row.necesidadesPorSemana[sem] || 0), 0);
        if (necesidad <= 0) return;
        const fechas = g.fechas;
        if (fechas.length === 0) return;
        const vhNecesarios = Math.ceil(necesidad / base);
        for (let i = 0; i < vhNecesarios; i++) {
          const fecha = fechas[i % fechas.length];
          const key = clave(row.codigo, fecha);
          nuevas[key] = String(numero(nuevas[key] ?? "0") + 1);
        }
      });
    });
    setVehiculos(nuevas);
  }

  function toggleSemana(sem: string) {
    setSemanasOff((prev) => {
      const copia = new Set(prev);
      if (copia.has(sem)) copia.delete(sem);
      else copia.add(sem);
      return copia;
    });
  }

  const totalNecesidad = useMemo(
    () =>
      filasVisibles.reduce(
        (acc, row) => acc + semanasSel.reduce((s, sem) => s + (row.necesidadesPorSemana[sem] || 0), 0),
        0
      ),
    [filasVisibles, semanasSel]
  );

  const totalProgramado = useMemo(() => {
    let total = 0;
    filasVisibles.forEach((row) => {
      semanasSel.forEach((sem) => {
        total += asignadoUnidSemana(row.codigo, sem);
      });
    });
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filasVisibles, semanasSel, vehiculos, fechasPorSemana, vhBasePorCodigo]);

  const totalVh = useMemo(() => {
    let total = 0;
    filasVisibles.forEach((row) => {
      semanasSel.forEach((sem) => {
        (fechasPorSemana[sem] || []).forEach((fecha) => {
          total += numero(vhCelda(row.codigo, fecha));
        });
      });
    });
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filasVisibles, semanasSel, vehiculos, fechasPorSemana]);

  if (rows.length === 0) return null;

  const cubreTotal = totalProgramado >= totalNecesidad;

  return (
    <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-black text-slate-950">Simulador de programacion (por vehiculos)</h3>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Solo aparecen las referencias con requerimiento en las semanas que elijas. Haz clic en el dia para agregar vehiculos. 1 VH = gaylords x gaylor/estiba (preformas 40, SKU 303845 va de 36); el valor de &quot;1 VH&quot; es editable por referencia (las tapas 424220 / 424230 lo pones tu). Puedes pasarte del requerimiento.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-xs font-black uppercase text-slate-500">Semanas</p>
          <div className="flex flex-wrap gap-2">
            {semanas.map((sem) => {
              const activa = !semanasOff.has(sem);
              return (
                <button
                  key={sem}
                  onClick={() => toggleSemana(sem)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-black ${
                    activa
                      ? "border-[#0057B8] bg-blue-50 text-[#0057B8]"
                      : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {sem}
                </button>
              );
            })}
          </div>
        </div>

        <label className="text-xs font-black uppercase text-slate-500">
          Dias habiles
          <select
            value={diasHabiles}
            onChange={(e) => setDiasHabiles(e.target.value as DiasHabiles)}
            className="mt-1 block h-11 rounded-xl border border-blue-100 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#0057B8]"
          >
            <option value="LV">Lunes a viernes</option>
            <option value="LS">Lunes a sabado</option>
            <option value="TODOS">Todos los dias</option>
          </select>
        </label>

        <label className="text-xs font-black uppercase text-slate-500">
          VH por clic
          <input
            type="number"
            min={1}
            value={vhPorClic}
            onChange={(e) => setVhPorClic(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 block h-11 w-24 rounded-xl border border-blue-100 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#0057B8]"
          />
        </label>

        <div className="relative">
          <p className="mb-1 text-xs font-black uppercase text-slate-500">Combinar semanas</p>
          <details className="group">
            <summary className="flex h-11 cursor-pointer list-none items-center rounded-xl border border-blue-100 px-3 text-xs font-black text-slate-600">
              {semanasCombinar.filter((s) => semanasSel.includes(s)).length >= 2
                ? `${semanasCombinar.filter((s) => semanasSel.includes(s)).length} combinadas`
                : "Ninguna"}
            </summary>
            <div className="absolute left-0 z-30 mt-1 w-40 rounded-xl border border-blue-100 bg-white p-2 shadow-xl">
              {semanasSel.map((sem) => (
                <label key={sem} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs font-bold text-slate-700 hover:bg-blue-50">
                  <input
                    type="checkbox"
                    checked={semanasCombinar.includes(sem)}
                    onChange={() => toggleCombinar(sem)}
                    className="h-4 w-4 accent-[#0057B8]"
                  />
                  {sem}
                </label>
              ))}
            </div>
          </details>
        </div>

        <button
          onClick={autollenar}
          className="h-11 rounded-xl bg-[#0057B8] px-5 text-sm font-black text-white shadow-md transition hover:bg-[#003B7A]"
        >
          Autollenar
        </button>
        <button
          onClick={limpiar}
          className="h-11 rounded-xl border border-blue-200 px-5 text-sm font-black text-[#0057B8]"
        >
          Limpiar
        </button>
        <button
          onClick={copiarImagen}
          className="h-11 rounded-xl border border-emerald-300 bg-emerald-50 px-5 text-sm font-black text-emerald-700 hover:bg-emerald-100"
        >
          Copiar imagen
        </button>
        <button
          onClick={() => excelRef.current?.click()}
          className="h-11 rounded-xl bg-amber-500 px-5 text-sm font-black text-white shadow-md transition hover:bg-amber-600"
        >
          Subir Excel
        </button>
        <input ref={excelRef} type="file" accept=".xlsx,.xls" onChange={subirExcel} className="hidden" />

        <div className="ml-auto rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-bold text-[#003B7A]">
          Requerim.: <span className="text-red-600">{formato(totalNecesidad)}</span>
          {"  ·  "}Programado: <span className="text-[#0057B8]">{formato(totalProgramado)}</span>
          {"  ·  "}VH: <span className="text-slate-900">{formato(totalVh)}</span>
          {"  ·  "}
          <span className={cubreTotal ? "text-emerald-700" : "text-red-600"}>
            {cubreTotal ? "CUBRE" : `Falta ${formato(totalNecesidad - totalProgramado)}`}
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs font-semibold text-slate-500">
        Tip: 1 clic suma &quot;VH por clic&quot;. Teclea el numero exacto de VH. Doble clic borra la celda. Pasa el mouse por una celda para ver las unidades.
      </p>

      {textoCorreo !== null && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
          <span>{textoCorreo}</span>
          <button onClick={() => setTextoCorreo(null)} className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-black text-emerald-700">Cerrar</button>
        </div>
      )}

      {panelAbierto && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-black text-amber-800">Plan de produccion (dias por referencia)</p>
            <div className="flex gap-2">
              <button onClick={autollenarFoto} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-black text-white hover:bg-amber-700">Autollenar segun foto</button>
              <button onClick={() => { setPanelAbierto(false); setFotoUrl(null); setOcrEstado(null); }} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-black text-amber-700">Cerrar</button>
            </div>
          </div>
          {ocrEstado && <p className="mb-2 text-xs font-semibold text-amber-800">{ocrEstado}</p>}
          <div className="flex flex-wrap gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {fotoUrl && <img src={fotoUrl} alt="Plan de produccion" className="max-h-44 rounded-lg border border-amber-200" />}
            <div className="flex-1 overflow-auto">
              <table className="text-[10px]">
                <thead>
                  <tr className="text-amber-800">
                    <th className="px-2 py-1 text-left">Referencia</th>
                    {dias.map((wd) => (
                      <th key={wd} className="px-2 py-1 text-center">{NOMBRE_DIA[wd]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filasVisibles.map((row) => (
                    <tr key={row.codigo} className="border-t border-amber-100">
                      <td className="px-2 py-1 font-black text-slate-800">{row.codigo}</td>
                      {dias.map((wd) => (
                        <td key={wd} className="px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={(produccionDias[row.codigo] || []).includes(wd)}
                            onChange={() => toggleDiaProd(row.codigo, wd)}
                            className="h-4 w-4 accent-amber-600"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {filasVisibles.length === 0 ? (
        <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-[#003B7A]">
          No hay referencias con requerimiento en las semanas seleccionadas.
        </p>
      ) : (
        <div ref={tablaRef} className="mt-4 overflow-auto rounded-2xl border border-blue-100">
          <table className="w-full table-fixed border-collapse text-left text-[9px]">
            <thead className="sticky top-0 z-20">
              <tr className="bg-blue-200/80 text-[#0B4EA2]">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-30 w-[140px] border-b border-blue-200 bg-blue-200/95 px-2 py-1 text-[8px] font-black uppercase"
                >
                  Referencia (1 VH = unid.)
                </th>
                {grupos.map((g) => (
                  <th
                    key={g.label}
                    colSpan={g.fechas.length + 1}
                    className="border-b border-l border-blue-300 px-1 py-1 text-center text-[8px] font-black uppercase"
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr className="bg-blue-100 text-[#0B4EA2]">
                {grupos.map((g) => (
                  <FragmentHeader key={g.label} fechas={g.fechas} />
                ))}
              </tr>
            </thead>
            <tbody>
              {filasVisibles.map((row, idx) => {
                const base = vhBasePorCodigo[row.codigo] || 0;
                return (
                  <tr key={row.codigo} className={`border-b border-slate-100 hover:bg-blue-50 ${idx % 2 ? "bg-slate-50/60" : "bg-white"}`}>
                    <td className="sticky left-0 z-10 w-[140px] bg-inherit px-2 py-1">
                      <div className="text-[9px] font-black text-slate-900 text-center">{row.codigo}</div>
                      <div className="text-[8px] font-semibold leading-tight text-slate-500 break-words text-center" title={row.material}>
                        {row.material}
                      </div>
                      <div className="mt-1 flex items-center justify-center gap-1">
                        <span className="text-[8px] font-bold text-slate-400">1 VH</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={baseOverride[row.codigo] ?? String(vhBase(row))}
                          onChange={(e) =>
                            setBaseOverride((prev) => ({
                              ...prev,
                              [row.codigo]: e.target.value.replace(/[^0-9]/g, ""),
                            }))
                          }
                          title="Unidades por vehiculo (editable, sobre todo para tapas)"
                          className="h-5 w-full rounded border border-blue-100 px-1 text-center text-[8px] font-black text-[#0057B8] outline-none focus:border-[#0057B8]"
                        />
                      </div>
                    </td>
                    {grupos.map((g) => {
                      const necesidad = g.semanas.reduce((acc, sem) => acc + (row.necesidadesPorSemana[sem] || 0), 0);
                      const asignado = asignadoUnidFechas(row.codigo, g.fechas);
                      return (
                        <FragmentRow
                          key={g.label}
                          fechas={g.fechas}
                          base={base}
                          necesidad={necesidad}
                          asignado={asignado}
                          vhCelda={(fecha) => vhCelda(row.codigo, fecha)}
                          transitoVh={(fecha) => transitosCelda[clave(row.codigo, fecha)] || 0}
                          onClic={(fecha) => clicCelda(row.codigo, fecha)}
                          onChange={(fecha, v) => setVh(row.codigo, fecha, v)}
                          onClear={(fecha) => setVh(row.codigo, fecha, "")}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 text-[#0B4EA2]">
                <td className="sticky left-0 z-10 bg-slate-50 px-2 py-1 text-[8px] font-black uppercase text-slate-500">
                  Total por dia
                </td>
                {grupos.map((g) => (
                  <FragmentFooter
                    key={g.label}
                    fechas={g.fechas}
                    vhDia={(fecha) => filasVisibles.reduce((acc, row) => acc + numero(vhCelda(row.codigo, fecha)), 0)}
                    unidDia={(fecha) => filasVisibles.reduce((acc, row) => acc + unidadesCelda(row.codigo, fecha), 0)}
                  />
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function FragmentHeader({ fechas }: { fechas: string[] }) {
  return (
    <>
      {fechas.map((fecha) => (
        <th key={fecha} className="border-l border-blue-100 px-0.5 py-1 text-center text-[8px] font-black text-slate-500">
          <div>{diaNombre(fecha)}</div>
          <div className="font-semibold text-slate-400">{fechaCorta(fecha)}</div>
        </th>
      ))}
      <th className="border-l-2 border-blue-200 px-1 py-1 text-center text-[8px] font-black text-slate-500">
        Requerim.
      </th>
    </>
  );
}

function FragmentRow({
  fechas,
  base,
  necesidad,
  asignado,
  vhCelda,
  transitoVh,
  onClic,
  onChange,
  onClear,
}: {
  fechas: string[];
  base: number;
  necesidad: number;
  asignado: number;
  vhCelda: (fecha: string) => string;
  transitoVh: (fecha: string) => number;
  onClic: (fecha: string) => void;
  onChange: (fecha: string, valor: string) => void;
  onClear: (fecha: string) => void;
}) {
  const cubre = necesidad > 0 && asignado >= necesidad;
  const falta = Math.max(0, necesidad - asignado);
  return (
    <>
      {fechas.map((fecha) => {
        const vh = vhCelda(fecha);
        const tiene = numero(vh) > 0;
        const unidades = numero(vh) * base;
        const tVh = transitoVh(fecha);
        const tUnid = tVh * base;
        return (
          <td key={fecha} className="border-l border-slate-100 p-[2px]">
            <div
              onClick={() => onClic(fecha)}
              onDoubleClick={() => onClear(fecha)}
              title={tiene ? `${vh} VH = ${formato(unidades)} unid.` : "Clic para agregar VH"}
              className={`flex h-6 w-full cursor-pointer items-center justify-center overflow-hidden rounded text-center text-[9px] font-black transition ${
                tiene ? "bg-[#0057B8] text-white shadow-sm" : "bg-transparent text-slate-200 hover:bg-blue-50"
              }`}
            >
              {tiene ? formato(unidades) : "+"}
            </div>
            {tiene ? (
              <div className="mt-0.5 flex items-center justify-center gap-0.5">
                <input
                  type="text"
                  inputMode="numeric"
                  value={vh}
                  onChange={(e) => onChange(fecha, e.target.value.replace(/[^0-9]/g, ""))}
                  title="N de vehiculos (editable)"
                  className="h-4 w-6 rounded border border-blue-100 text-center text-[8px] font-bold text-[#0057B8] outline-none focus:border-[#0057B8]"
                />
                <span className="text-[8px] font-bold text-slate-400">VH</span>
              </div>
            ) : null}
            {tVh > 0 ? (
              <div
                title={`Transito ya en camino: ${tVh} VH = ${formato(tUnid)} unid.`}
                className="mt-0.5 flex h-4 w-full items-center justify-center gap-0.5 overflow-hidden rounded bg-emerald-500 px-0.5 text-[8px] font-black text-white"
              >
                <span>{formato(tUnid)}</span>
                <span className="opacity-80">· {tVh} VH T</span>
              </div>
            ) : null}
          </td>
        );
      })}
      <td className="border-l-2 border-blue-200 px-1 py-0.5 text-center">
        {necesidad <= 0 ? (
          <span className="text-[9px] text-slate-300">&mdash;</span>
        ) : (
          <>
            <div className="text-[8px] font-semibold text-slate-400">{formato(necesidad)}</div>
            {cubre ? (
              <span className="inline-block rounded bg-emerald-100 px-1 py-[1px] text-[8px] font-black text-emerald-700">CUBRE</span>
            ) : (
              <span className="inline-block rounded bg-red-100 px-1 py-[1px] text-[8px] font-black text-red-600">Falta {formato(falta)}</span>
            )}
          </>
        )}
      </td>
    </>
  );
}

function FragmentFooter({
  fechas,
  vhDia,
  unidDia,
}: {
  fechas: string[];
  vhDia: (fecha: string) => number;
  unidDia: (fecha: string) => number;
}) {
  return (
    <>
      {fechas.map((fecha) => {
        const vh = vhDia(fecha);
        return (
          <td
            key={fecha}
            title={vh > 0 ? `${formato(unidDia(fecha))} unid.` : ""}
            className="border-l border-slate-100 px-0.5 py-1 text-center text-[8px] font-bold text-slate-500"
          >
            {vh > 0 ? `${vh} VH` : "·"}
          </td>
        );
      })}
      <td className="border-l-2 border-blue-200" />
    </>
  );
}
