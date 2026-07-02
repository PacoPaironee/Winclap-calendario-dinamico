// Lee la nómina del Google Sheet y la convierte en una lista de personas limpia.
import { sheetsClient } from "./google.js";
import { COLUMNAS, STATUS_ACTIVO, SHEET_ID, SHEET_RANGE, resolverClapbase } from "./config.js";

// Pasa "MUÑOZ GONZALO" → "Muñoz Gonzalo" (capitaliza cada palabra; respeta ñ/tildes).
function lindo(texto) {
  return String(texto || "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();
}

// Busca el índice de una columna por cualquiera de sus nombres aceptados.
function indiceDe(headers, nombresAceptados) {
  const norm = headers.map((h) => String(h || "").trim().toLowerCase());
  for (const nombre of nombresAceptados) {
    const i = norm.indexOf(nombre);
    if (i !== -1) return i;
  }
  return -1;
}

// Parsea fechas en formatos comunes: ISO (1995-03-12), dd/mm/yyyy, dd-mm-yyyy.
// Devuelve { year, month, day } o null. El mes va 1-12.
export function parseFecha(valor) {
  const s = String(valor || "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/); // yyyy-mm-dd
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };

  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/); // dd/mm/yyyy
  if (m) {
    let year = +m[3];
    if (year < 100) year += year < 50 ? 2000 : 1900;
    return { year, month: +m[2], day: +m[1] };
  }
  return null;
}

// Resuelve el rango: si no trae pestaña ("!"), antepone la primera del Sheet.
async function resolverRango(sheets) {
  if (SHEET_RANGE.includes("!")) return SHEET_RANGE;
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const tab = meta.data.sheets[0].properties.title;
  return `'${tab}'!${SHEET_RANGE}`;
}

export async function leerNomina() {
  if (!SHEET_ID) throw new Error("Falta NOMINA_SHEET_ID en el .env.");
  const sheets = sheetsClient();
  const range = await resolverRango(sheets);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });

  const filas = res.data.values || [];
  if (filas.length < 2) return { personas: [], avisos: ["La nómina está vacía o no tiene filas de datos."] };

  const headers = filas[0];
  const idx = {
    nombre: indiceDe(headers, COLUMNAS.nombre),
    apellido: indiceDe(headers, COLUMNAS.apellido),
    email: indiceDe(headers, COLUMNAS.email),
    clapbase: indiceDe(headers, COLUMNAS.clapbase),
    fechaNacimiento: indiceDe(headers, COLUMNAS.fechaNacimiento),
    fechaIngreso: indiceDe(headers, COLUMNAS.fechaIngreso),
    status: indiceDe(headers, COLUMNAS.status), // opcional
  };

  // Solo estas son obligatorias; status es opcional.
  const requeridas = ["nombre", "email", "clapbase", "fechaNacimiento", "fechaIngreso"];
  const faltantes = requeridas.filter((k) => idx[k] === -1);
  if (faltantes.length) {
    throw new Error(
      `No encontré estas columnas en la nómina: ${faltantes.join(", ")}.\n` +
        `Encabezados detectados: ${headers.join(" | ")}\n` +
        `Ajustá los nombres aceptados en src/config.js → COLUMNAS.`
    );
  }

  const avisos = [];
  const personas = [];
  let inactivos = 0;
  filas.slice(1).forEach((fila, n) => {
    const nombrePila = String(fila[idx.nombre] || "").trim();
    const apellido = idx.apellido !== -1 ? String(fila[idx.apellido] || "").trim() : "";
    const email = String(fila[idx.email] || "").trim().toLowerCase();
    if (!nombrePila && !apellido && !email) return; // fila vacía

    // Filtrar inactivos (bajas).
    if (idx.status !== -1) {
      const st = String(fila[idx.status] || "").trim().toLowerCase();
      if (st && !STATUS_ACTIVO.includes(st)) { inactivos++; return; }
    }

    const nombre = lindo([nombrePila, apellido].filter(Boolean).join(" ")) || email;
    const clapbase = resolverClapbase(fila[idx.clapbase]);
    const nacimiento = parseFecha(fila[idx.fechaNacimiento]);
    const ingreso = parseFecha(fila[idx.fechaIngreso]);

    if (!clapbase) avisos.push(`Fila ${n + 2}: sin clapbase propia "${fila[idx.clapbase]}" (${nombre}). Va solo al calendario Global.`);
    if (!nacimiento) avisos.push(`Fila ${n + 2}: sin fecha de nacimiento válida (${nombre}).`);
    if (!ingreso) avisos.push(`Fila ${n + 2}: sin fecha de ingreso válida (${nombre}).`);

    personas.push({ nombre, email, clapbase, nacimiento, ingreso });
  });

  if (inactivos) avisos.unshift(`${inactivos} persona(s) excluida(s) por Status no activo.`);
  return { personas, avisos };
}
