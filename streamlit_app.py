from __future__ import annotations

import io
import re
import unicodedata
from datetime import datetime
from typing import Any
from uuid import uuid4

import pandas as pd
import plotly.express as px
import streamlit as st
from supabase import create_client


st.set_page_config(
    page_title="BALANCE",
    page_icon="public/LOGO.png",
    layout="wide",
    initial_sidebar_state="expanded",
)


ROJO = "#e30613"
DORADO = "#d4a017"
FONDO = "#f8f8f6"
TEXTO = "#0f172a"
CLAVE_AVAL = "balance2026"


def inject_css() -> None:
    st.markdown(
        f"""
        <style>
        .stApp {{
            background: {FONDO};
            color: {TEXTO};
        }}
        [data-testid="stSidebar"] {{
            background: #ffffff;
            border-right: 1px solid #e2e8f0;
        }}
        [data-testid="stSidebar"] img {{
            margin: 0 auto 0.5rem auto;
            display: block;
        }}
        .block-container {{
            padding-top: 1.2rem;
            padding-bottom: 3rem;
        }}
        h1, h2, h3 {{
            color: #020617;
            letter-spacing: 0;
        }}
        div[data-testid="stMetric"] {{
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 18px 18px 14px 18px;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }}
        .panel {{
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 18px;
            padding: 22px;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
            margin-bottom: 18px;
        }}
        .top-title {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 14px;
            margin-bottom: 18px;
        }}
        .pill {{
            border: 1px solid rgba(227, 6, 19, 0.25);
            background: rgba(227, 6, 19, 0.06);
            color: {ROJO};
            border-radius: 999px;
            padding: 8px 14px;
            font-size: 13px;
            font-weight: 800;
        }}
        .gold-pill {{
            border: 1px solid rgba(212, 160, 23, 0.30);
            background: #fff8df;
            color: #9a6a00;
            border-radius: 12px;
            padding: 10px 14px;
            font-size: 13px;
            font-weight: 900;
        }}
        .small-muted {{
            color: #64748b;
            font-size: 14px;
            font-weight: 600;
            margin-top: -8px;
        }}
        .stButton > button {{
            border-radius: 12px;
            font-weight: 900;
            border: 1px solid #cbd5e1;
        }}
        .stDownloadButton > button {{
            border-radius: 12px;
            font-weight: 900;
            background: {DORADO};
            color: #ffffff;
            border: 1px solid {DORADO};
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def normalizar_texto(valor: Any) -> str:
    texto = str(valor or "").lower()
    texto = unicodedata.normalize("NFD", texto)
    texto = "".join(ch for ch in texto if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]", "", texto)


def convertir_numero(valor: Any) -> float:
    if valor is None or valor == "" or valor == "-":
        return 0.0
    if isinstance(valor, (int, float)):
        return float(valor)

    texto = str(valor).strip().replace(" ", "")
    tiene_coma = "," in texto
    tiene_punto = "." in texto

    if tiene_coma and tiene_punto:
        texto = texto.replace(".", "").replace(",", ".") if texto.rfind(",") > texto.rfind(".") else texto.replace(",", "")
    elif tiene_coma:
        partes = texto.split(",")
        texto = texto.replace(",", "") if len(partes) > 2 or (len(partes) == 2 and len(partes[1]) == 3) else texto.replace(",", ".")
    elif tiene_punto:
        partes = texto.split(".")
        if len(partes) > 2:
            texto = texto.replace(".", "")

    texto = re.sub(r"[^\d.-]", "", texto)
    try:
        return float(texto)
    except ValueError:
        return 0.0


def formato_numero(valor: Any) -> str:
    return f"{convertir_numero(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def obtener_valor(fila: dict[str, Any], nombres: list[str]) -> Any:
    keys = list(fila.keys())
    for nombre in nombres:
        objetivo = normalizar_texto(nombre)
        for key in keys:
            if normalizar_texto(key) == objetivo and fila.get(key) not in (None, ""):
                return fila.get(key)
    return ""


def es_fecha(valor: str) -> bool:
    texto = str(valor or "").strip()
    if not texto:
        return False
    if re.match(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$", texto):
        return True
    if re.match(r"^\d{4}[/-]\d{1,2}[/-]\d{1,2}$", texto):
        return True
    return False


def formatear_fecha(valor: Any) -> str:
    if isinstance(valor, (datetime, pd.Timestamp)):
        return valor.strftime("%d/%m/%Y")
    texto = str(valor or "").strip()
    if not texto:
        return ""
    if es_fecha(texto):
        fecha = pd.to_datetime(texto, errors="coerce", dayfirst=True)
        if pd.notna(fecha):
            return fecha.strftime("%d/%m/%Y")
    return texto


def fila_encabezado(df_raw: pd.DataFrame) -> int:
    claves = [
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
    ]
    mejor_indice = 0
    mejor_puntaje = -1
    for idx in range(min(10, len(df_raw))):
        puntaje = 0
        for celda in df_raw.iloc[idx].fillna("").tolist():
            texto = normalizar_texto(celda)
            if texto:
                puntaje += 3 if any(clave in texto for clave in claves) else 1
        if puntaje > mejor_puntaje:
            mejor_indice = idx
            mejor_puntaje = puntaje
    return mejor_indice


def leer_excel(uploaded_files: list[Any]) -> dict[str, dict[str, Any]]:
    resultado: dict[str, dict[str, Any]] = {}
    for uploaded_file in uploaded_files:
        xls = pd.ExcelFile(uploaded_file)
        for sheet_name in xls.sheet_names:
            uploaded_file.seek(0)
            raw = pd.read_excel(uploaded_file, sheet_name=sheet_name, header=None, dtype=object)
            header = fila_encabezado(raw)
            uploaded_file.seek(0)
            df = pd.read_excel(uploaded_file, sheet_name=sheet_name, header=header, dtype=object)
            df = df.fillna("")
            nombre = sheet_name
            contador = 2
            while nombre in resultado:
                nombre = f"{sheet_name} ({contador})"
                contador += 1
            resultado[nombre] = {
                "nombreReal": sheet_name,
                "filas": len(df),
                "datos": df.head(10000).to_dict("records"),
            }
    return resultado


def obtener_hoja(datos: dict[str, dict[str, Any]], nombres: list[str]) -> dict[str, Any] | None:
    objetivos = {normalizar_texto(nombre) for nombre in nombres}
    for key, hoja in datos.items():
        if normalizar_texto(key) in objetivos:
            return hoja
    return None


def columnas_semana(columnas: list[str]) -> list[dict[str, str]]:
    usadas: set[str] = set()
    salida = []
    for col in columnas:
        if normalizar_texto(col).startswith("sem"):
            label = str(col).strip()
            contador = 2
            while label in usadas:
                label = f"{str(col).strip()} ({contador})"
                contador += 1
            usadas.add(label)
            salida.append({"key": col, "label": label})
    return salida


def obtener_semana_plan(fila: dict[str, Any], semanas_balance: list[str]) -> str:
    semana = str(
        obtener_valor(
            fila,
            ["Semana", "Semana correspondiente", "Semana recepcion", "Semana recepción", "Week"],
        )
    ).strip()
    if not semana:
        return ""
    for sem in semanas_balance:
        if normalizar_texto(sem) == normalizar_texto(semana):
            return sem
    return ""


def generar_balance(datos: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    hoja_receta = obtener_hoja(datos, ["Receta"])
    hoja_existencias = obtener_hoja(datos, ["Existencias"])
    hoja_consumos = obtener_hoja(datos, ["Consumos", "Consumo"])
    hoja_plan = obtener_hoja(
        datos,
        [
            "Plan de Recibo",
            "PLAN DE RECIBO",
            "Plan de Recepcion",
            "Plan de Recepción",
            "Plan Recepcion",
            "Plan Recepción",
            "Programacion",
            "Programación",
        ],
    )

    if not hoja_receta or not hoja_existencias:
        raise ValueError("No se encontró la hoja Receta o Existencias.")

    receta = hoja_receta.get("datos", [])
    existencias = hoja_existencias.get("datos", [])
    consumos = hoja_consumos.get("datos", []) if hoja_consumos else []
    plan_recepcion = hoja_plan.get("datos", []) if hoja_plan else []

    if not receta or not existencias:
        raise ValueError("Receta o Existencias no tienen datos.")

    cols = list(receta[0].keys())
    cols_semana = columnas_semana(cols)
    etiquetas_semana = [col["label"] for col in cols_semana]

    mapa_existencias: dict[str, dict[str, Any]] = {}
    almacenes_set: set[str] = set()

    for fila in existencias:
        material = str(obtener_valor(fila, ["Material", "Código", "Codigo"])).strip()
        texto_breve = str(
            obtener_valor(
                fila,
                [
                    "Texto breve de material",
                    "Texto breve material",
                    "Texto breve",
                    "Descripcion",
                    "Descripción",
                ],
            )
        ).strip()
        almacen = str(obtener_valor(fila, ["Alm.", "Alm", "ALM", "Almacen", "Almacén"])).strip()
        libre = convertir_numero(
            obtener_valor(
                fila,
                [
                    "Libre utiliz.",
                    "Libre utiliz",
                    "Libre Utiliz.",
                    "Libre Utiliz",
                    "Libre utilización",
                    "Libre Utilizacion",
                ],
            )
        )
        bloqueado = convertir_numero(obtener_valor(fila, ["Bloqueado", "Stock bloqueado", "Inventario bloqueado"]))
        valor_stock = convertir_numero(obtener_valor(fila, ["Vr.Stock Alm.", "Vr.Stock Alm"]))
        valor_bloqueado = (valor_stock / libre) * bloqueado if libre > 0 else (valor_stock if bloqueado > 0 else 0)

        if not material:
            continue

        item = mapa_existencias.setdefault(
            material,
            {
                "total": 0,
                "bloqueado": 0,
                "valorStock": 0,
                "valorBloqueado": 0,
                "textoBreve": "",
                "almacenes": {},
            },
        )
        if texto_breve and not item["textoBreve"]:
            item["textoBreve"] = texto_breve
        item["total"] += libre
        item["bloqueado"] += bloqueado
        item["valorStock"] += valor_stock
        item["valorBloqueado"] += valor_bloqueado
        if almacen:
            almacenes_set.add(almacen)
            item["almacenes"][almacen] = item["almacenes"].get(almacen, 0) + libre

    almacenes_detectados = list(almacenes_set)
    valores_inventario = {"total": 0, "bloqueado": 0, "libre": 0}
    for item in mapa_existencias.values():
        valores_inventario["total"] += item.get("valorStock", 0)
        valores_inventario["bloqueado"] += item.get("valorBloqueado", 0)
    valores_inventario["libre"] = valores_inventario["total"] - valores_inventario["bloqueado"]

    materiales_bloqueados = sorted(
        [
            {
                "material": material,
                "textoBreve": item.get("textoBreve", ""),
                "cantidad": item.get("bloqueado", 0),
                "valor": item.get("valorBloqueado", 0),
            }
            for material, item in mapa_existencias.items()
            if item.get("bloqueado", 0) > 0 or item.get("valorBloqueado", 0) > 0
        ],
        key=lambda item: item["valor"],
        reverse=True,
    )

    mapa_recepciones: dict[str, dict[str, Any]] = {}
    for fila in plan_recepcion:
        codigo = str(
            obtener_valor(
                fila,
                [
                    "SKU",
                    "Codigo SKU",
                    "Código SKU",
                    "Código material",
                    "Codigo material",
                    "Codigo",
                    "Código",
                    "Material",
                ],
            )
        ).strip()
        semana = obtener_semana_plan(fila, etiquetas_semana)
        cantidad = convertir_numero(
            obtener_valor(fila, ["Cantidad", "Cantidad programada", "Cantidad prevista", "Cantidad prevista de recepción"])
        )
        fecha = formatear_fecha(obtener_valor(fila, ["Fecha operativa", "Fecha", "Fecha recepcion", "Fecha recepción"]))
        fecha_recibo = formatear_fecha(obtener_valor(fila, ["Fecha recibo", "Fecha de recibo", "FECHA  RECIBO", "FECHA RECIBO"]))
        if not codigo or not semana or fecha_recibo:
            continue
        sem_item = mapa_recepciones.setdefault(codigo, {}).setdefault(
            semana, {"cantidad": 0, "fechas": set(), "detalles": []}
        )
        sem_item["cantidad"] += cantidad
        if fecha:
            sem_item["fechas"].add(fecha)
        sem_item["detalles"].append({"fechaOperativa": fecha, "cantidad": cantidad})

    mapa_necesidades: dict[str, dict[str, Any]] = {}
    receta_por_sku: dict[str, list[dict[str, Any]]] = {}
    secciones_set: set[str] = set()

    for fila in receta:
        codigo = str(
            obtener_valor(
                fila,
                ["N° componente", "Nº componente", "N° Componente", "Nº Componente", "Material", "Código", "Codigo"],
            )
        ).strip()
        if not codigo:
            continue

        sku_plan = str(obtener_valor(fila, ["Codigo", "Código", "SKU", "Material padre", "Material Padre"])).strip()
        seccion = str(obtener_valor(fila, ["Seccion", "Sección", "SECCION", "SECCIÓN"])).strip()
        if seccion:
            secciones_set.add(seccion)

        item = mapa_necesidades.setdefault(
            codigo,
            {
                "codigo": codigo,
                "material": obtener_valor(
                    fila,
                    [
                        "Texto breve-objeto",
                        "Texto breve objeto",
                        "Texto breve de material",
                        "Texto breve",
                        "Descripción",
                        "Descripcion",
                    ],
                )
                or "",
                "um": obtener_valor(fila, ["UM", "UMB"]) or "",
                "secciones": set(),
                "necesidadesPorSemana": {sem: 0 for sem in etiquetas_semana},
                "totalNecesidad": 0,
            },
        )
        if seccion:
            item["secciones"].add(seccion)
        if sku_plan:
            receta_por_sku.setdefault(sku_plan, []).append(
                {
                    "componente": codigo,
                    "cantidadBase": convertir_numero(obtener_valor(fila, ["Cantidad", "Cantidad base"])),
                }
            )
        for col in cols_semana:
            valor = convertir_numero(fila.get(col["key"]))
            item["necesidadesPorSemana"][col["label"]] += valor
            item["totalNecesidad"] += valor

    consumos_por_material: dict[str, float] = {}
    for fila in consumos:
        sku = str(obtener_valor(fila, ["Material", "SKU", "Codigo", "Código"])).strip()
        cantidad_consumo = convertir_numero(obtener_valor(fila, ["Cantidad", "Cantidad consumo"]))
        for item in receta_por_sku.get(sku, []):
            consumos_por_material[item["componente"]] = consumos_por_material.get(item["componente"], 0) + (
                cantidad_consumo * item["cantidadBase"]
            ) / 100

    analisis = []
    for item in mapa_necesidades.values():
        codigo = item["codigo"]
        existencia = mapa_existencias.get(codigo, {})
        almacenes = existencia.get("almacenes", {})
        existencia_balance = almacenes.get("AG01", 0) + almacenes.get("AG04", 0)
        recepciones = mapa_recepciones.get(codigo, {})
        recepciones_por_semana = {}
        fechas_recepcion_por_semana = {}
        transitos_por_semana = {}
        cobertura_por_semana = {}
        diferencias_por_semana = {}
        acumulado = existencia_balance
        total_recepcion = 0

        for sem in etiquetas_semana:
            recepcion = recepciones.get(sem, {}).get("cantidad", 0)
            necesidad = item["necesidadesPorSemana"].get(sem, 0)
            total_recepcion += recepcion
            recepciones_por_semana[sem] = recepcion
            fechas_recepcion_por_semana[sem] = list(recepciones.get(sem, {}).get("fechas", []))
            transitos_por_semana[sem] = recepciones.get(sem, {}).get("detalles", [])
            cobertura_por_semana[sem] = (recepcion / necesidad) * 100 if necesidad > 0 else 0
            acumulado -= necesidad
            diferencias_por_semana[sem] = acumulado

        diferencia_total = existencia_balance - item["totalNecesidad"]
        estado = "OK"
        if diferencia_total < 0:
            estado = "FALTANTE"
        elif diferencia_total == 0:
            estado = "JUSTO"
        elif diferencia_total > 0:
            estado = "SOBRANTE"

        analisis.append(
            {
                "codigo": codigo,
                "material": item["material"],
                "um": item["um"],
                "seccion": ", ".join(sorted(item["secciones"])),
                "seccionesArray": list(item["secciones"]),
                "necesidadesPorSemana": item["necesidadesPorSemana"],
                "recepcionesPorSemana": recepciones_por_semana,
                "fechasRecepcionPorSemana": fechas_recepcion_por_semana,
                "transitosPorSemana": transitos_por_semana,
                "coberturaPorSemana": cobertura_por_semana,
                "totalNecesidad": item["totalNecesidad"],
                "totalRecepcion": total_recepcion,
                "almacenes": almacenes,
                "inventarioLibre": existencia.get("total", 0),
                "inventarioBloqueado": existencia.get("bloqueado", 0),
                "stockTotal": existencia.get("total", 0) + existencia.get("bloqueado", 0),
                "valorInventarioLibre": existencia.get("valorStock", 0) - existencia.get("valorBloqueado", 0),
                "valorInventarioBloqueado": existencia.get("valorBloqueado", 0),
                "valorStockTotal": existencia.get("valorStock", 0),
                "totalExistencia": existencia_balance,
                "diferenciaTotal": diferencia_total,
                "diferenciasPorSemana": diferencias_por_semana,
                "estado": estado,
            }
        )

    faltantes = [row for row in analisis if row["estado"] == "FALTANTE"]
    sobrantes = [row for row in analisis if row["estado"] == "SOBRANTE"]
    info = {
        "hojaReceta": hoja_receta.get("nombreReal", "Receta"),
        "hojaExistencias": hoja_existencias.get("nombreReal", "Existencias"),
        "hojaPlanRecepcion": hoja_plan.get("nombreReal", "") if hoja_plan else "",
        "columnasSemana": etiquetas_semana,
        "almacenesDetectados": almacenes_detectados,
        "seccionesDetectadas": sorted(secciones_set),
        "totalComponentes": len(analisis),
        "totalFaltantes": len(faltantes),
        "totalSobrantes": len(sobrantes),
        "totalPlanRecepcion": len(plan_recepcion),
        "valorInventarioLibre": valores_inventario["libre"],
        "valorInventarioBloqueado": valores_inventario["bloqueado"],
        "valorInventarioTotal": valores_inventario["total"],
        "materialesBloqueados": materiales_bloqueados,
        "consumosPorMaterial": consumos_por_material,
    }
    return analisis, info


def supabase_client():
    url = st.secrets.get("SUPABASE_URL", "")
    key = st.secrets.get("SUPABASE_SECRET_KEY", "")
    if not url or not key:
        return None
    return create_client(url, key)


def row_to_db(run_id: str, row: dict[str, Any]) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "codigo": row.get("codigo", ""),
        "material": row.get("material", ""),
        "um": row.get("um", ""),
        "seccion": row.get("seccion", ""),
        "secciones_array": row.get("seccionesArray", []),
        "estado": row.get("estado", "OK"),
        "total_necesidad": row.get("totalNecesidad", 0),
        "total_recepcion": row.get("totalRecepcion", 0),
        "total_existencia": row.get("totalExistencia", 0),
        "diferencia_total": row.get("diferenciaTotal", 0),
        "inventario_libre": row.get("inventarioLibre", 0),
        "inventario_bloqueado": row.get("inventarioBloqueado", 0),
        "stock_total": row.get("stockTotal", 0),
        "valor_inventario_libre": row.get("valorInventarioLibre", 0),
        "valor_inventario_bloqueado": row.get("valorInventarioBloqueado", 0),
        "valor_stock_total": row.get("valorStockTotal", 0),
        "necesidades_por_semana": row.get("necesidadesPorSemana", {}),
        "recepciones_por_semana": row.get("recepcionesPorSemana", {}),
        "fechas_recepcion_por_semana": row.get("fechasRecepcionPorSemana", {}),
        "transitos_por_semana": row.get("transitosPorSemana", {}),
        "cobertura_por_semana": row.get("coberturaPorSemana", {}),
        "almacenes": row.get("almacenes", {}),
        "diferencias_por_semana": row.get("diferenciasPorSemana", {}),
    }


def db_to_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "codigo": row.get("codigo", ""),
        "material": row.get("material", ""),
        "um": row.get("um", ""),
        "seccion": row.get("seccion", ""),
        "seccionesArray": row.get("secciones_array", []),
        "estado": row.get("estado", "OK"),
        "totalNecesidad": row.get("total_necesidad", 0),
        "totalRecepcion": row.get("total_recepcion", 0),
        "totalExistencia": row.get("total_existencia", 0),
        "diferenciaTotal": row.get("diferencia_total", 0),
        "inventarioLibre": row.get("inventario_libre", 0),
        "inventarioBloqueado": row.get("inventario_bloqueado", 0),
        "stockTotal": row.get("stock_total", 0),
        "valorInventarioLibre": row.get("valor_inventario_libre", 0),
        "valorInventarioBloqueado": row.get("valor_inventario_bloqueado", 0),
        "valorStockTotal": row.get("valor_stock_total", 0),
        "necesidadesPorSemana": row.get("necesidades_por_semana", {}),
        "recepcionesPorSemana": row.get("recepciones_por_semana", {}),
        "fechasRecepcionPorSemana": row.get("fechas_recepcion_por_semana", {}),
        "transitosPorSemana": row.get("transitos_por_semana", {}),
        "coberturaPorSemana": row.get("cobertura_por_semana", {}),
        "almacenes": row.get("almacenes", {}),
        "diferenciasPorSemana": row.get("diferencias_por_semana", {}),
    }


def obtener_cargas() -> list[dict[str, Any]]:
    client = supabase_client()
    if client is None:
        return st.session_state.get("cargas_locales", [])
    runs = client.table("balance_runs").select("id, created_at, archivo, hojas, info").order("created_at", desc=True).execute().data
    if not runs:
        return []
    ids = [run["id"] for run in runs]
    rows = client.table("balance_rows").select("*").in_("run_id", ids).execute().data
    rows_by_run: dict[str, list[dict[str, Any]]] = {}
    for row in rows or []:
        rows_by_run.setdefault(row["run_id"], []).append(row)
    return [
        {
            "id": run["id"],
            "fecha": run["created_at"],
            "archivo": run["archivo"],
            "hojas": run.get("hojas", []),
            "info": run.get("info"),
            "analisis": [db_to_row(row) for row in rows_by_run.get(run["id"], [])],
        }
        for run in runs
    ]


def guardar_carga(carga: dict[str, Any]) -> None:
    client = supabase_client()
    if client is None:
        st.session_state.setdefault("cargas_locales", []).insert(0, carga)
        return
    client.table("balance_runs").insert(
        {
            "id": carga["id"],
            "created_at": carga["fecha"],
            "archivo": carga["archivo"],
            "hojas": carga["hojas"],
            "info": carga["info"],
        }
    ).execute()
    rows = [row_to_db(carga["id"], row) for row in carga["analisis"]]
    for start in range(0, len(rows), 500):
        client.table("balance_rows").insert(rows[start : start + 500]).execute()


def eliminar_carga(carga_id: str) -> None:
    client = supabase_client()
    if client is None:
        st.session_state["cargas_locales"] = [c for c in st.session_state.get("cargas_locales", []) if c["id"] != carga_id]
        return
    client.table("balance_runs").delete().eq("id", carga_id).execute()


def limpiar_cargas() -> None:
    client = supabase_client()
    if client is None:
        st.session_state["cargas_locales"] = []
        return
    runs = client.table("balance_runs").select("id").execute().data
    for run in runs or []:
        client.table("balance_runs").delete().eq("id", run["id"]).execute()


def df_balance(rows: list[dict[str, Any]], info: dict[str, Any] | None, detalle_transito: list[str] | None = None) -> pd.DataFrame:
    info = info or {}
    detalle_transito = detalle_transito or []
    semanas = info.get("columnasSemana", [])
    almacenes = info.get("almacenesDetectados", [])
    salida = []
    for row in rows:
        base = {
            "Material": row.get("codigo"),
            "Texto breve del material": row.get("material"),
            "UM": row.get("um"),
            "Seccion": row.get("seccion"),
        }
        for sem in semanas:
            base[sem] = row.get("necesidadesPorSemana", {}).get(sem, 0)
            if sem in detalle_transito:
                transitos = row.get("transitosPorSemana", {}).get(sem, [])
                fechas = sorted({item.get("fechaOperativa", "") for item in transitos if item.get("fechaOperativa")})
                base[f"Fecha operativa {sem}"] = ", ".join(fechas)
                base[f"Cantidad transito {sem}"] = row.get("recepcionesPorSemana", {}).get(sem, 0)
        base["Total necesidad"] = row.get("totalNecesidad", 0)
        for alm in almacenes:
            base[alm] = row.get("almacenes", {}).get(alm, 0)
        base["AG01 + AG04"] = row.get("totalExistencia", 0)
        base["Diferencia"] = row.get("diferenciaTotal", 0)
        for sem in semanas:
            base[f"Dif. {sem}"] = row.get("diferenciasPorSemana", {}).get(sem, 0)
        base["Estado"] = row.get("estado")
        salida.append(base)
    return pd.DataFrame(salida)


def to_excel_bytes(df: pd.DataFrame, sheet_name: str = "Analisis") -> bytes:
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=sheet_name)
    return output.getvalue()


def header(title: str, active: str) -> None:
    st.markdown(
        f"""
        <div class="top-title">
            <div>
                <h1 style="margin:0;">{title}</h1>
                <p class="small-muted">BALANCE · Planeación de materiales</p>
            </div>
            <div class="pill">{active}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def panel(title: str, subtitle: str = "") -> None:
    st.markdown(
        f"""
        <div class="panel">
            <h3 style="margin:0 0 6px 0;">{title}</h3>
            <p class="small-muted">{subtitle}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def login() -> None:
    inject_css()
    col1, col2, col3 = st.columns([1.2, 1, 1.2])
    with col2:
        st.image("public/LOGO.png", width=170)
        st.title("BALANCE")
        st.caption("Planeación de materiales")
        usuario = st.text_input("Usuario")
        password = st.text_input("Contraseña", type="password")
        if st.button("ACCEDER", use_container_width=True):
            if usuario == "admin" and password == "balance2026":
                st.session_state["logged"] = True
                st.rerun()
            else:
                st.error("Usuario o contraseña incorrectos.")
        st.info("Usuario: admin · Contraseña: balance2026")


def init_state() -> None:
    defaults = {
        "logged": False,
        "datos": {},
        "hoja_activa": "",
        "archivo_nombre": "",
        "analisis": [],
        "info": None,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


def sidebar() -> str:
    with st.sidebar:
        st.image("public/LOGO.png", width=160)
        st.markdown("### BALANCE")
        st.caption("Sistema profesional de planeación")
        modulo = st.radio(
            "Módulos",
            ["Dashboard", "Importación / Bases", "Balance de materiales", "Variaciones", "Histórico"],
            label_visibility="collapsed",
        )
        st.divider()
        st.markdown('<div class="gold-pill">Base AG01 + AG04</div>', unsafe_allow_html=True)
        if st.button("Cerrar sesión", use_container_width=True):
            st.session_state["logged"] = False
            st.rerun()
    return modulo


def modulo_importacion() -> None:
    header("Importación / Bases", "Importación")
    panel("Importación / Bases de datos", "Carga el Balance y, cuando lo necesites, carga también el Plan de Recibo.")
    files = st.file_uploader(
        "Cargar Balance y Plan de Recibo",
        type=["xlsx", "xlsm", "xls"],
        accept_multiple_files=True,
    )
    if files and st.button("Procesar archivos", type="primary"):
        datos = leer_excel(files)
        st.session_state["datos"] = datos
        st.session_state["hoja_activa"] = list(datos.keys())[0] if datos else ""
        st.session_state["archivo_nombre"] = " + ".join(file.name for file in files)
        st.success("Archivos cargados correctamente.")

    datos = st.session_state["datos"]
    if not datos:
        st.warning("Todavía no hay bases cargadas.")
        return

    hojas = list(datos.keys())
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Hojas", len(hojas))
    c2.metric("Hoja activa", st.session_state["hoja_activa"] or "-")
    hoja = datos.get(st.session_state["hoja_activa"], {})
    c3.metric("Filas", hoja.get("filas", 0))
    c4.metric("Columnas", len(hoja.get("datos", [{}])[0].keys()) if hoja.get("datos") else 0)
    c5.metric("Estado", "Cargado")

    st.session_state["hoja_activa"] = st.selectbox("Bases detectadas", hojas, index=hojas.index(st.session_state["hoja_activa"]))
    hoja = datos[st.session_state["hoja_activa"]]
    df = pd.DataFrame(hoja["datos"])
    busqueda = st.text_input("Buscar en esta base")
    if busqueda:
        mask = df.astype(str).apply(lambda col: col.str.contains(busqueda, case=False, na=False)).any(axis=1)
        df = df[mask]
    st.dataframe(df, use_container_width=True, height=620)


def modulo_balance() -> None:
    header("Balance de materiales", "Balance")
    panel("Balance de materiales", "Base de cálculo: AG01 + AG04 contra necesidades por semana.")
    if st.button("Generar balance", type="primary"):
        try:
            analisis, info = generar_balance(st.session_state["datos"])
            st.session_state["analisis"] = analisis
            st.session_state["info"] = info
            st.success("Balance generado correctamente.")
        except Exception as exc:
            st.error(str(exc))

    analisis = st.session_state["analisis"]
    info = st.session_state["info"]
    if not analisis or not info:
        st.warning("Primero carga bases y genera un balance.")
        return

    c1, c2, c3 = st.columns(3)
    c1.metric("Valor inventario libre", formato_numero(info.get("valorInventarioLibre", 0)))
    c2.metric("Valor inventario bloqueado", formato_numero(info.get("valorInventarioBloqueado", 0)))
    c3.metric("Valor inventario total", formato_numero(info.get("valorInventarioTotal", 0)))
    c4, c5, c6, c7 = st.columns(4)
    c4.metric("Componentes", info.get("totalComponentes", 0))
    c5.metric("Faltantes", info.get("totalFaltantes", 0))
    c6.metric("Sobrantes", info.get("totalSobrantes", 0))
    c7.metric("Base balance", "AG01 + AG04")

    semanas = info.get("columnasSemana", [])
    detalle_transito = st.multiselect("Mostrar tránsito por semana", semanas)
    df = df_balance(analisis, info, detalle_transito)

    col_a, col_b, col_c = st.columns([2, 1, 1])
    texto = col_a.text_input("Buscar componente, descripción, sección")
    estado = col_b.selectbox("Estado", ["TODOS", "FALTANTE", "SOBRANTE", "JUSTO"])
    secciones = ["TODAS"] + info.get("seccionesDetectadas", [])
    seccion = col_c.selectbox("Sección", secciones)
    filtrado = df.copy()
    if texto:
        filtrado = filtrado[filtrado.astype(str).apply(lambda col: col.str.contains(texto, case=False, na=False)).any(axis=1)]
    if estado != "TODOS":
        filtrado = filtrado[filtrado["Estado"] == estado]
    if seccion != "TODAS" and "Seccion" in filtrado:
        filtrado = filtrado[filtrado["Seccion"].astype(str).str.contains(seccion, case=False, na=False)]

    st.dataframe(filtrado, use_container_width=True, height=620)
    st.download_button(
        "Exportar Excel",
        to_excel_bytes(filtrado),
        file_name="analisis_balance_materiales.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    if st.button("Guardar balance"):
        carga = {
            "id": str(uuid4()),
            "fecha": datetime.utcnow().isoformat(),
            "archivo": datetime.now().strftime("%Y.%m.%d %H-%M_Balance de materiales"),
            "hojas": list(st.session_state["datos"].keys()),
            "analisis": analisis,
            "info": info,
        }
        try:
            guardar_carga(carga)
            st.success("Balance guardado correctamente.")
        except Exception as exc:
            st.error(f"No se pudo guardar el balance: {exc}")


def modulo_dashboard() -> None:
    header("Dashboard", "Dashboard")
    panel("Dashboard de planeación y abastecimiento", "Riesgo por semanas, tránsito, consumo notificado e inventario bloqueado.")
    analisis = st.session_state["analisis"]
    info = st.session_state["info"]
    if not analisis or not info:
        st.warning("Todavía no hay análisis generado.")
        return
    semanas = info.get("columnasSemana", [])
    semanas_activas = st.multiselect("Filtro de semanas", semanas, default=semanas)
    riesgos = []
    consumos = info.get("consumosPorMaterial", {})
    for row in analisis:
        faltante = sum(abs(row.get("diferenciasPorSemana", {}).get(sem, 0)) for sem in semanas_activas if row.get("diferenciasPorSemana", {}).get(sem, 0) < 0)
        necesidad = sum(row.get("necesidadesPorSemana", {}).get(sem, 0) for sem in semanas_activas)
        transito = sum(row.get("recepcionesPorSemana", {}).get(sem, 0) for sem in semanas_activas)
        if necesidad > 0 or faltante > 0:
            riesgos.append({**row, "faltanteSeleccionado": faltante, "necesidadSeleccionada": necesidad, "transitoSeleccionado": transito, "consumoNotificado": consumos.get(row["codigo"], 0)})
    criticos = [row for row in riesgos if row["faltanteSeleccionado"] > 0]
    con_transito = [row for row in riesgos if row["transitoSeleccionado"] > 0]
    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.metric("Semanas evaluadas", len(semanas_activas))
    c2.metric("Materiales críticos", len(criticos))
    c3.metric("Faltante acumulado", formato_numero(sum(row["faltanteSeleccionado"] for row in criticos)))
    c4.metric("Tránsito programado", formato_numero(sum(row["transitoSeleccionado"] for row in con_transito)))
    c5.metric("Cobertura tránsito", f"{((sum(row['transitoSeleccionado'] for row in con_transito) / sum(row['faltanteSeleccionado'] for row in criticos)) * 100 if criticos else 0):.1f}%")
    c6.metric("Valor bloqueado", formato_numero(sum(item.get("valor", 0) for item in info.get("materialesBloqueados", []))))

    data_sem = []
    for sem in semanas:
        data_sem.append(
            {
                "Semana": sem,
                "Necesidad": sum(row.get("necesidadesPorSemana", {}).get(sem, 0) for row in analisis),
                "Faltante": sum(abs(row.get("diferenciasPorSemana", {}).get(sem, 0)) for row in analisis if row.get("diferenciasPorSemana", {}).get(sem, 0) < 0),
                "Tránsito": sum(row.get("recepcionesPorSemana", {}).get(sem, 0) for row in analisis),
            }
        )
    df_sem = pd.DataFrame(data_sem)
    st.plotly_chart(px.bar(df_sem, x="Semana", y=["Necesidad", "Faltante", "Tránsito"], barmode="group"), use_container_width=True)
    st.dataframe(pd.DataFrame(riesgos), use_container_width=True, height=520)


def modulo_historico() -> None:
    header("Histórico", "Histórico")
    panel("Histórico de balances", "Consulta, filtra, carga o elimina balances guardados por fecha y hora.")
    try:
        cargas = obtener_cargas()
    except Exception as exc:
        st.error(f"No se pudo cargar el histórico: {exc}")
        return
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Balances guardados", len(cargas))
    c2.metric("Total faltantes", sum(c.get("info", {}).get("totalFaltantes", 0) for c in cargas))
    c3.metric("Total sobrantes", sum(c.get("info", {}).get("totalSobrantes", 0) for c in cargas))
    c4.metric("Último balance", cargas[0]["fecha"] if cargas else "-")
    busqueda = st.text_input("Buscar por fecha, hora o nombre")
    filtradas = [c for c in cargas if not busqueda or busqueda.lower() in c["archivo"].lower() or busqueda.lower() in c["fecha"].lower()]
    rows = [
        {
            "Fecha": c["fecha"],
            "Nombre": c["archivo"],
            "Componentes": c.get("info", {}).get("totalComponentes", 0),
            "Faltantes": c.get("info", {}).get("totalFaltantes", 0),
            "Sobrantes": c.get("info", {}).get("totalSobrantes", 0),
            "id": c["id"],
        }
        for c in filtradas
    ]
    st.dataframe(pd.DataFrame(rows), use_container_width=True, height=480)
    ids = {f'{row["Fecha"]} - {row["Nombre"]}': row["id"] for row in rows}
    if ids:
        seleccionado = st.selectbox("Balance guardado", list(ids.keys()))
        carga = next((c for c in cargas if c["id"] == ids[seleccionado]), None)
        col1, col2 = st.columns(2)
        if col1.button("Ver balance seleccionado"):
            st.session_state["analisis"] = carga["analisis"]
            st.session_state["info"] = carga["info"]
            st.success("Balance cargado. Abre el módulo Balance o Dashboard.")
        clave = col2.text_input("Clave para borrar", type="password")
        if col2.button("Borrar seleccionado"):
            if clave == CLAVE_AVAL:
                eliminar_carga(ids[seleccionado])
                st.success("Balance eliminado.")
                st.rerun()
            else:
                st.error("Clave incorrecta.")


def modulo_variaciones() -> None:
    header("Variaciones", "Variaciones")
    panel("Control de variaciones del plan", "Compara plan anterior contra plan actual y valida reducciones contra consumo notificado.")
    cargas = obtener_cargas()
    if len(cargas) < 2:
        st.warning("Necesitas al menos 2 balances guardados para comparar variaciones.")
        return
    opciones = {f'{c["fecha"]} - {c["archivo"]}': c for c in cargas}
    labels = list(opciones.keys())
    col1, col2 = st.columns(2)
    antes = opciones[col1.selectbox("Balance anterior", labels, index=1)]
    ahora = opciones[col2.selectbox("Balance actual", labels, index=0)]
    mapa_antes = {row["codigo"]: row for row in antes["analisis"]}
    mapa_ahora = {row["codigo"]: row for row in ahora["analisis"]}
    semanas = sorted(set((antes.get("info") or {}).get("columnasSemana", []) + (ahora.get("info") or {}).get("columnasSemana", [])))
    codigos = sorted(set(mapa_antes.keys()) | set(mapa_ahora.keys()))
    consumos = (antes.get("info") or {}).get("consumosPorMaterial", {})
    rows = []
    for codigo in codigos:
        a = mapa_antes.get(codigo)
        b = mapa_ahora.get(codigo)
        plan_anterior = a.get("totalNecesidad", 0) if a else 0
        plan_actual = b.get("totalNecesidad", 0) if b else 0
        movimiento = plan_actual - plan_anterior
        reduccion = max(plan_anterior - plan_actual, 0)
        consumo = consumos.get(codigo, 0)
        diferencia = reduccion - consumo if reduccion > 0 else movimiento
        diagnostico = "SIN CAMBIO"
        if not a and b:
            diagnostico = "NUEVO MATERIAL"
        elif a and not b:
            diagnostico = "MATERIAL RETIRADO"
        elif movimiento > 0:
            diagnostico = "AUMENTO DE PLAN"
        elif reduccion > 0:
            tolerancia = max(1, reduccion * 0.001)
            if abs(reduccion - consumo) <= tolerancia:
                diagnostico = "REDUCCION EXPLICADA POR CONSUMO"
            elif reduccion - consumo > 0:
                diagnostico = "REDUCCION NO EXPLICADA"
            else:
                diagnostico = "CONSUMO MAYOR A REDUCCION"
        rows.append(
            {
                "Material": codigo,
                "Texto breve del material": (b or a or {}).get("material", ""),
                "Seccion": (b or a or {}).get("seccion", ""),
                "Plan anterior": plan_anterior,
                "Plan actual": plan_actual,
                "Movimiento del plan": movimiento,
                "Consumo notificado": consumo,
                "Diferencia por explicar": diferencia,
                "Diagnostico": diagnostico,
            }
        )
    df = pd.DataFrame(rows)
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Aumentos", int((df["Diagnostico"] == "AUMENTO DE PLAN").sum()))
    c2.metric("Explicadas", int((df["Diagnostico"] == "REDUCCION EXPLICADA POR CONSUMO").sum()))
    c3.metric("Por explicar", int(df["Diagnostico"].isin(["REDUCCION NO EXPLICADA", "CONSUMO MAYOR A REDUCCION"]).sum()))
    c4.metric("Nuevos", int((df["Diagnostico"] == "NUEVO MATERIAL").sum()))
    c5.metric("Retirados", int((df["Diagnostico"] == "MATERIAL RETIRADO").sum()))
    st.dataframe(df, use_container_width=True, height=620)


def main() -> None:
    inject_css()
    init_state()
    if not st.session_state["logged"]:
        login()
        return

    modulo = sidebar()
    if modulo == "Importación / Bases":
        modulo_importacion()
    elif modulo == "Balance de materiales":
        modulo_balance()
    elif modulo == "Dashboard":
        modulo_dashboard()
    elif modulo == "Histórico":
        modulo_historico()
    elif modulo == "Variaciones":
        modulo_variaciones()


if __name__ == "__main__":
    main()
