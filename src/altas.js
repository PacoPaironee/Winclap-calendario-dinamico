// Lee la pestaña ALTAS del Sheet espejo (ingresos nuevos) y la deja como lista limpia.
import { sheetsClient } from "./google.js";
import { COLUMNAS_ALTAS, SHEET_ID, ALTAS_RANGE, resolverClapbase } from "./config.js";
import { parseFecha } from "./sheet.js";

function indiceDe(headers, nombresAceptados) {
  const norm = headers.map((h) => String(h || "").trim().toLowerCase());
  for (const nombre of nombresAceptados) {
    const i = norm.indexOf(nombre);
    if (i !== -1) return i;
  }
  return -1;
}

export async function leerAltas() {
  if (!SHEET_ID) throw new Error("Falta NOMINA_SHEET_ID en el .env.");
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: ALTAS_RANGE });

  const filas = res.data.values || [];
  if (filas.length < 2) return { altas: [], avisos: ["La pestaña ALTAS está vacía o no tiene datos."] };

  const headers = filas[0];
  const idx = {
    nombre: indiceDe(headers, COLUMNAS_ALTAS.nombre),
    emailWinclap: indiceDe(headers, COLUMNAS_ALTAS.emailWinclap),
    emailPersonal: indiceDe(headers, COLUMNAS_ALTAS.emailPersonal),
    comunidad: indiceDe(headers, COLUMNAS_ALTAS.comunidad),
    fechaIngreso: indiceDe(headers, COLUMNAS_ALTAS.fechaIngreso),
    rol: indiceDe(headers, COLUMNAS_ALTAS.rol),
    team: indiceDe(headers, COLUMNAS_ALTAS.team),
    area: indiceDe(headers, COLUMNAS_ALTAS.area),
  };

  const requeridas = ["nombre", "comunidad", "fechaIngreso"];
  const faltantes = requeridas.filter((k) => idx[k] === -1);
  if (faltantes.length) {
    throw new Error(
      `No encontré estas columnas en ALTAS: ${faltantes.join(", ")}.\n` +
        `Encabezados detectados: ${headers.join(" | ")}\n` +
        `Ajustá src/config.js → COLUMNAS_ALTAS.`
    );
  }

  const get = (fila, i) => (i !== -1 ? String(fila[i] || "").trim() : "");
  const avisos = [];
  const altas = [];
  filas.slice(1).forEach((fila, n) => {
    const nombre = get(fila, idx.nombre);
    if (!nombre) return; // fila vacía

    const email = (get(fila, idx.emailWinclap) || get(fila, idx.emailPersonal)).toLowerCase();
    const clapbase = resolverClapbase(fila[idx.comunidad]);
    const fecha = parseFecha(fila[idx.fechaIngreso]);
    if (!fecha) avisos.push(`ALTAS fila ${n + 2}: sin fecha de ingreso válida (${nombre}).`);

    altas.push({
      nombre,
      email,
      clapbase,
      fecha,
      rol: get(fila, idx.rol),
      team: get(fila, idx.team),
      area: get(fila, idx.area),
    });
  });

  return { altas, avisos };
}
