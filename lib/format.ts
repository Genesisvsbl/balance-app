export function convertirNumero(valor: any) {
  if (valor === null || valor === undefined || valor === "" || valor === "-") {
    return 0;
  }

  if (typeof valor === "number") return valor;

  let texto = String(valor).trim();
  texto = texto.replace(/\s/g, "");

  const tieneComa = texto.includes(",");
  const tienePunto = texto.includes(".");

  if (tieneComa && tienePunto) {
    const ultimaComa = texto.lastIndexOf(",");
    const ultimoPunto = texto.lastIndexOf(".");

    if (ultimaComa > ultimoPunto) {
      texto = texto.replace(/\./g, "").replace(",", ".");
    } else {
      texto = texto.replace(/,/g, "");
    }
  } else if (tieneComa && !tienePunto) {
    texto = texto.replace(",", ".");
  }

  texto = texto.replace(/[^\d.-]/g, "");
  return Number(texto) || 0;
}

export function formatearValor(valor: any) {
  if (valor instanceof Date) return valor.toLocaleDateString("es-DO");
  return String(valor ?? "");
}

export function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-DO", {
    maximumFractionDigits: 2,
  });
}