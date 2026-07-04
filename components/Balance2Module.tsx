"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BalanceInfo, BalanceRow, ExcelData } from "@/types/balance";

type Props = {
  datos: ExcelData;
  analisis: BalanceRow[];
  infoAnalisis: BalanceInfo | null;
};

type EditField =
  | "ingresar"
  | "descargar"
  | "fisicoPiso"
  | "fisicoEstanteria"
  | "transito"
  | "vehiculo"
  | "gaylor";

type SimBaseRow = {
  id: string;
  codigo: string;
  texto: string;
  um: string;
  seccion: string;
  cantidadSap: number;
  necesidadesPorSemana: Record<string, number>;
  capacidadVehiculo: number;
  capacidadUnidad: number;
};

type CalculatedRow = SimBaseRow & Record<EditField, number> & {
  teorico: number;
  diferencia: number;
  necesidad: number;
  requerimiento: number;
  numeroVehiculos: number;
  cantidadGaylor: number;
};

const fieldLabels: Record<EditField, string> = {
  ingresar: "Cant. x ingresar",
  descargar: "Cant. x descargar",
  fisicoPiso: "Fisico piso",
  fisicoEstanteria: "Fisico estanteria",
  transito: "Transito",
  vehiculo: "Vehiculo",
  gaylor: "Gaylor / Estiba",
};

const columnByField: Record<string, string> = {
  cantidadSap: "D",
  ingresar: "E",
  descargar: "F",
  teorico: "G",
  fisicoPiso: "H",
  fisicoEstanteria: "I",
  diferencia: "J",
  necesidad: "K",
  transito: "L",
  requerimiento: "M",
  numeroVehiculos: "N",
  vehiculo: "O",
  gaylor: "P",
  cantidadGaylor: "Q",
};

function normalizar(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function numero(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formato(value: number, decimals = 0) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function capacidadGaylor(row: BalanceRow) {
  const texto = normalizar(`${row.codigo} ${row.material} ${row.seccion}`);
  if (texto.includes("tapa")) return 5000;
  if (texto.includes("1.5") || texto.includes("1,5")) return 6048;
  if (texto.includes("1000")) return 8136;
  if (texto.includes("330")) return 17088;
  if (texto.includes("200")) return 20736;
  return 5000;
}

function stockDisponible(row: BalanceRow) {
  return row.inventarioLibre ?? row.almacenes?.AG04 ?? row.totalExistencia ?? 0;
}

function tipoMaterial(row: Pick<SimBaseRow, "codigo" | "texto" | "seccion">) {
  const texto = normalizar(`${row.codigo} ${row.texto} ${row.seccion}`);
  if (texto.includes("preforma")) return "PREFORMA";
  if (texto.includes("tapa")) return "TAPA";
  if (texto.includes("plastico") || texto.includes("plastico")) return "PLASTICO";
  if (texto.includes("pet") || texto.includes("etiq")) return "PET";
  return row.seccion || "OTROS";
}

function extraerFilas(analisis: BalanceRow[]) {
  return analisis
    .filter((row) => {
      const secciones = normalizar([row.seccion, ...(row.seccionesArray || [])].join(" "));
      const texto = normalizar(row.material);
      return (
        secciones.includes("pet") ||
        secciones.includes("tapa") ||
        secciones.includes("preforma") ||
        secciones.includes("plastico") ||
        texto.includes("preforma") ||
        texto.includes("tapa")
      );
    })
    .map<SimBaseRow>((row) => {
      const unidad = capacidadGaylor(row);
      return {
        id: row.codigo,
        codigo: row.codigo,
        texto: row.material,
        um: row.um || "UN",
        seccion: row.seccionesArray?.[0] || row.seccion || "Sin seccion",
        cantidadSap: stockDisponible(row),
        necesidadesPorSemana: row.necesidadesPorSemana || {},
        capacidadVehiculo: unidad * 550,
        capacidadUnidad: unidad,
      };
    });
}

function valorPorRef(row: Partial<CalculatedRow> & SimBaseRow, ref: string) {
  const col = ref.replace(/\d+/g, "").toUpperCase();
  switch (col) {
    case "D": return row.cantidadSap;
    case "E": return row.ingresar || 0;
    case "F": return row.descargar || 0;
    case "G": return row.teorico || row.cantidadSap;
    case "H": return row.fisicoPiso || row.cantidadSap;
    case "I": return row.fisicoEstanteria || 0;
    case "J": return row.diferencia || 0;
    case "K": return row.necesidad || 0;
    case "L": return row.transito || 0;
    case "M": return row.requerimiento || 0;
    case "N": return row.numeroVehiculos || 0;
    case "O": return row.vehiculo || row.capacidadVehiculo;
    case "P": return row.gaylor || row.capacidadUnidad;
    case "Q": return row.cantidadGaylor || 0;
    default: return 0;
  }
}

function evaluarFormula(raw: string, row: Partial<CalculatedRow> & SimBaseRow) {
  const formula = raw.trim();
  if (!formula.startsWith("=")) return numero(raw);

  const expr = formula
    .slice(1)
    .replace(/\b([D-Q])(\d+)\b/gi, (match) => String(valorPorRef(row, match)))
    .replace(/,/g, ".");

  if (!/^[0-9+\-*/().\s]+$/.test(expr)) return 0;

  try {
    const result = Function(`"use strict"; return (${expr});`)();
    return Number.isFinite(result) ? Number(result) : 0;
  } catch {
    return 0;
  }
}

function claseNumero(value: number) {
  if (value < 0) return "text-red-600";
  if (value > 0) return "text-emerald-700";
  return "text-[#0B4EA2]";
}

export default function Balance2Module({ analisis }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [secciones, setSecciones] = useState<string[]>(["PET"]);
  const [materiales, setMateriales] = useState<string[]>(["TAPA", "PREFORMA"]);
  const [semanas, setSemanas] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<Record<EditField, string>>>>({});
  const [activeFormula, setActiveFormula] = useState<{ rowId: string; field: EditField } | null>(null);

  const baseRows = useMemo(() => extraerFilas(analisis), [analisis]);
  const semanasDisponibles = useMemo(() => {
    const set = new Set<string>();
    baseRows.forEach((row) => Object.keys(row.necesidadesPorSemana).forEach((sem) => set.add(sem)));
    return Array.from(set).sort((a, b) => numero(a) - numero(b));
  }, [baseRows]);
  const semanasActivas = semanas.length > 0 ? semanas : semanasDisponibles;
  const seccionesDisponibles = useMemo(() => Array.from(new Set(baseRows.map((row) => row.seccion).filter(Boolean))).sort(), [baseRows]);
  const materialesDisponibles = useMemo(() => Array.from(new Set(baseRows.map((row) => tipoMaterial(row)).filter(Boolean))).sort(), [baseRows]);

  function rawEdit(row: SimBaseRow, field: EditField) {
    const saved = edits[row.id]?.[field];
    if (saved !== undefined) return saved;
    if (field === "fisicoPiso") return String(row.cantidadSap || 0);
    if (field === "vehiculo") return String(row.capacidadVehiculo || 0);
    if (field === "gaylor") return String(row.capacidadUnidad || 0);
    return "0";
  }

  function calcularRow(row: SimBaseRow): CalculatedRow {
    const partial: Partial<CalculatedRow> & SimBaseRow = {
      ...row,
      ingresar: 0,
      descargar: 0,
      teorico: row.cantidadSap,
      fisicoPiso: row.cantidadSap,
      fisicoEstanteria: 0,
      diferencia: 0,
      necesidad: semanasActivas.reduce((acc, sem) => acc + (row.necesidadesPorSemana[sem] || 0), 0),
      transito: 0,
      requerimiento: 0,
      vehiculo: row.capacidadVehiculo,
      gaylor: row.capacidadUnidad,
      numeroVehiculos: 0,
      cantidadGaylor: 0,
    };

    partial.ingresar = evaluarFormula(rawEdit(row, "ingresar"), partial);
    partial.descargar = evaluarFormula(rawEdit(row, "descargar"), partial);
    partial.teorico = partial.cantidadSap + partial.ingresar - partial.descargar;
    partial.fisicoPiso = evaluarFormula(rawEdit(row, "fisicoPiso"), partial);
    partial.fisicoEstanteria = evaluarFormula(rawEdit(row, "fisicoEstanteria"), partial);
    partial.diferencia = partial.fisicoPiso + partial.fisicoEstanteria - partial.teorico;
    partial.transito = evaluarFormula(rawEdit(row, "transito"), partial);
    partial.vehiculo = evaluarFormula(rawEdit(row, "vehiculo"), partial) || row.capacidadVehiculo;
    partial.gaylor = evaluarFormula(rawEdit(row, "gaylor"), partial) || row.capacidadUnidad;
    const necesidad = partial.necesidad || 0;
    partial.requerimiento = partial.fisicoPiso + partial.fisicoEstanteria + partial.transito - necesidad;
    partial.numeroVehiculos = partial.vehiculo ? partial.requerimiento / partial.vehiculo : 0;
    partial.cantidadGaylor = partial.gaylor ? partial.requerimiento / partial.gaylor : 0;
    return partial as CalculatedRow;
  }

  const rows = useMemo(() => {
    const texto = normalizar(busqueda);
    return baseRows
      .filter((row) => {
        const matchTexto = !texto || normalizar(`${row.codigo} ${row.texto} ${row.seccion}`).includes(texto);
        const matchSeccion = secciones.length === 0 || secciones.some((sec) => normalizar(row.seccion).includes(normalizar(sec)));
        const matchMaterial = materiales.length === 0 || materiales.includes(tipoMaterial(row));
        return matchTexto && matchSeccion && matchMaterial;
      })
      .map(calcularRow);
  }, [baseRows, busqueda, secciones, materiales, semanasActivas.join("|"), edits]);

  const resumen = useMemo(() => rows.reduce((acc, row) => {
    acc.sap += row.cantidadSap;
    acc.teorico += row.teorico;
    acc.fisico += row.fisicoPiso + row.fisicoEstanteria;
    acc.necesidad += row.necesidad;
    acc.requerimiento += row.requerimiento;
    return acc;
  }, { sap: 0, teorico: 0, fisico: 0, necesidad: 0, requerimiento: 0 }), [rows]);

  function setEdit(rowId: string, field: EditField, value: string) {
    setEdits((prev) => ({ ...prev, [rowId]: { ...(prev[rowId] || {}), [field]: value } }));
  }

  function toggleSemana(sem: string) {
    setSemanas((actual) => (actual.includes(sem) ? actual.filter((item) => item !== sem) : [...actual, sem]));
  }

  function insertarReferencia(ref: string) {
    if (!activeFormula) return;
    const raw = edits[activeFormula.rowId]?.[activeFormula.field] ?? "=";
    const next = raw.startsWith("=") ? `${raw}${ref}` : `=${ref}`;
    setEdit(activeFormula.rowId, activeFormula.field, next);
  }

  function RefCell({ children, refId, className = "" }: { children: React.ReactNode; refId: string; className?: string }) {
    return (
      <td
        onMouseDown={(event) => {
          if (!activeFormula) return;
          event.preventDefault();
          insertarReferencia(refId);
        }}
        className={`whitespace-nowrap px-3 py-2 text-right text-[11px] font-black ${className}`}
        title={`Referencia ${refId}`}
      >
        {children}
      </td>
    );
  }

  function EditCell({ row, field }: { row: CalculatedRow; field: EditField }) {
    const raw = edits[row.id]?.[field] ?? rawEdit(row, field);
    const value = row[field];
    return (
      <td className="min-w-[110px] px-2 py-1.5">
        <input
          type="text"
          inputMode="decimal"
          value={raw}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onFocus={() => setActiveFormula({ rowId: row.id, field })}
          onChange={(event) => setEdit(row.id, field, event.target.value)}
          className="h-8 w-full rounded-lg border border-blue-100 bg-white px-2 text-right text-[11px] font-black text-slate-900 outline-none transition focus:border-[#0057B8] focus:ring-2 focus:ring-blue-100"
          title={`${fieldLabels[field]}: ${formato(value, 2)}`}
        />
      </td>
    );
  }

  if (baseRows.length === 0) {
    return (
      <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-slate-950">Balance 2 - simulador PET</h3>
        <p className="mt-2 text-sm font-semibold text-slate-500">Primero genera un balance para detectar materiales PET, tapas, preformas y necesidades por semana.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">Balance 2 - simulador PET</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">Simulador operativo con celdas calculables, necesidad por semana y requerimiento de vehiculos.</p>
          </div>
          <span className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-[#0057B8]">{rows.length} materiales visibles</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <ResumenCard label="Cantidad en SAP" value={resumen.sap} tone="blue" />
        <ResumenCard label="Teorico" value={resumen.teorico} tone="blue" />
        <ResumenCard label="Fisico" value={resumen.fisico} tone="green" />
        <ResumenCard label="Necesidad" value={resumen.necesidad} tone="red" />
        <ResumenCard label="Requerimiento" value={resumen.requerimiento} tone={resumen.requerimiento < 0 ? "red" : "green"} />
      </div>

      <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.25fr_1fr_1fr_1fr_auto]">
          <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar material, descripcion o seccion..." className="h-11 rounded-xl border border-blue-100 px-4 text-sm font-semibold outline-none focus:border-[#0057B8] focus:ring-2 focus:ring-blue-100" />
          <div className="rounded-xl border border-blue-100 p-3">
            <p className="mb-2 text-[11px] font-black uppercase text-slate-500">Semanas</p>
            <div className="flex flex-wrap gap-2">
              {semanasDisponibles.map((sem) => (
                <button key={sem} onClick={() => toggleSemana(sem)} className={`rounded-lg border px-3 py-1.5 text-xs font-black ${semanasActivas.includes(sem) ? "border-[#0057B8] bg-blue-50 text-[#0057B8]" : "border-slate-200 bg-white text-slate-500"}`}>{sem}</button>
              ))}
            </div>
          </div>
          <SelectorMultiple label="Materiales" opciones={materialesDisponibles} seleccion={materiales} setSeleccion={setMateriales} />
          <SelectorMultiple label="Secciones" opciones={seccionesDisponibles} seleccion={secciones} setSeleccion={setSecciones} />
          <button onClick={() => { setBusqueda(""); setSemanas([]); setSecciones(["PET"]); setMateriales(["TAPA", "PREFORMA"]); }} className="h-11 self-end rounded-xl border border-blue-200 px-5 text-sm font-black text-[#0057B8]">Limpiar</button>
        </div>
      </div>

      {activeFormula && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-[#003B7A]">Editando formula en {fieldLabels[activeFormula.field]}. Haz clic en una celda numerica de la tabla para insertar su referencia.</div>}

      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="max-h-[62vh] overflow-auto">
          <table className="min-w-[2050px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 text-[#0B4EA2]">
              <tr className="bg-blue-200/80">
                <Th rowSpan={2}>N componente</Th><Th rowSpan={2}>Texto breve-objeto</Th><Th rowSpan={2}>UN</Th>
                <GroupTh colSpan={4}>SAP</GroupTh>
                <GroupTh colSpan={3}>Fisico</GroupTh>
                <GroupTh colSpan={7}>Necesidad y transporte</GroupTh>
              </tr>
              <tr className="bg-blue-100">
                <Th right>Cantidad en SAP</Th><Th right>Cantidad X ingresar</Th><Th right>Cantidad X descargar</Th><Th right>Teorico</Th>
                <Th right>Fisico piso</Th><Th right>Fisico estanteria</Th><Th right>Diferencia</Th>
                <Th right>Necesidad</Th><Th right>Transito</Th><Th right>Requerimiento</Th><Th right>No. vehiculos</Th><Th right>Vehiculo</Th><Th right>Gaylor / Estiba</Th><Th right>Cant. gaylor</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const rowNumber = index + 2;
                return (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-blue-50/70">
                    <td className="whitespace-nowrap px-3 py-2 text-[11px] font-black text-slate-950">{row.codigo}</td>
                    <td className="min-w-[280px] px-3 py-2 text-[11px] font-bold text-slate-700">{row.texto}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[11px] font-bold text-slate-600">{row.um}</td>
                    <RefCell refId={`${columnByField.cantidadSap}${rowNumber}`} className="text-[#0057B8]">{formato(row.cantidadSap)}</RefCell>
                    <EditCell row={row} field="ingresar" />
                    <EditCell row={row} field="descargar" />
                    <RefCell refId={`${columnByField.teorico}${rowNumber}`}>{formato(row.teorico)}</RefCell>
                    <EditCell row={row} field="fisicoPiso" />
                    <EditCell row={row} field="fisicoEstanteria" />
                    <RefCell refId={`${columnByField.diferencia}${rowNumber}`} className={claseNumero(row.diferencia)}>{formato(row.diferencia)}</RefCell>
                    <RefCell refId={`${columnByField.necesidad}${rowNumber}`} className="text-red-600">{formato(row.necesidad)}</RefCell>
                    <EditCell row={row} field="transito" />
                    <RefCell refId={`${columnByField.requerimiento}${rowNumber}`} className={claseNumero(row.requerimiento)}>{formato(row.requerimiento)}</RefCell>
                    <RefCell refId={`${columnByField.numeroVehiculos}${rowNumber}`} className={claseNumero(row.numeroVehiculos)}>{formato(row.numeroVehiculos, 2)}</RefCell>
                    <EditCell row={row} field="vehiculo" />
                    <EditCell row={row} field="gaylor" />
                    <RefCell refId={`${columnByField.cantidadGaylor}${rowNumber}`} className={claseNumero(row.cantidadGaylor)}>{formato(row.cantidadGaylor, 2)}</RefCell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs font-semibold text-slate-500">Tip: en celdas editables puedes escribir valores o formulas como =D2+E2-F2. Mientras editas una formula, haz clic en otra celda numerica para insertar la referencia.</p>
    </section>
  );
}

function SelectorMultiple({ label, opciones, seleccion, setSeleccion }: { label: string; opciones: string[]; seleccion: string[]; setSeleccion: (value: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtradas = opciones.filter((opcion) => normalizar(opcion).includes(normalizar(search)));

  function toggle(opcion: string) {
    setSeleccion(seleccion.includes(opcion) ? seleccion.filter((item) => item !== opcion) : [...seleccion, opcion]);
  }

  return (
    <div ref={ref} className="relative">
      <p className="mb-1 text-[11px] font-black uppercase text-slate-500">{label}</p>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-11 w-full items-center justify-between rounded-xl border border-blue-100 bg-white px-3 text-left text-xs font-black text-slate-700">
        <span>{seleccion.length ? `${seleccion.length} seleccionados` : `Todos los ${label.toLowerCase()}`}</span>
        <span className="text-slate-400">v</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[68px] z-30 rounded-xl border border-blue-100 bg-white p-2 shadow-xl">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." className="mb-2 h-9 w-full rounded-lg border border-blue-100 px-3 text-xs font-semibold outline-none focus:border-[#0057B8]" />
          <div className="max-h-56 space-y-1 overflow-auto">
            {filtradas.map((opcion) => (
              <label key={opcion} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-blue-50">
                <input type="checkbox" checked={seleccion.includes(opcion)} onChange={() => toggle(opcion)} className="h-4 w-4 accent-[#0057B8]" />
                {opcion}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResumenCard({ label, value, tone }: { label: string; value: number; tone: "blue" | "green" | "red" }) {
  const color = tone === "green" ? "text-emerald-700 border-emerald-200" : tone === "red" ? "text-red-600 border-red-200" : "text-[#0057B8] border-blue-200";
  return <div className={`rounded-2xl border bg-white p-4 shadow-sm ${color}`}><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{formato(value)}</p></div>;
}

function GroupTh({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return <th colSpan={colSpan} className="border-l border-blue-300 px-3 py-2 text-center text-[11px] font-black uppercase tracking-wide">{children}</th>;
}

function Th({ children, right = false, rowSpan }: { children: React.ReactNode; right?: boolean; rowSpan?: number }) {
  return <th rowSpan={rowSpan} className={`whitespace-nowrap border-l border-blue-200 px-3 py-3 text-[11px] font-black uppercase ${right ? "text-right" : "text-left"}`}>{children}</th>;
}


