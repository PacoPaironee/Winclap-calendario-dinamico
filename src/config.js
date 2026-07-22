// Configuración central del calendario. Todo lo que se ajusta a mano vive acá.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Mini-cargador de .env (sin dependencias) ────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

// ── Clapbases ───────────────────────────────────────────────────────────────
// Cada clapbase = un calendario de Google. La `key` se usa para leer el ID del
// calendario desde el .env (CAL_<KEY>) y el `match` son los nombres que pueden
// aparecer en la columna "clapbase" de la nómina (case-insensitive).
// El `match` son los valores de la columna "Clapbase" (ciudades) que caen en cada
// calendario. Colombia agrupa Bogotá + Medellín; Brazil = São Paulo.
export const CLAPBASES = [
  { key: "BUENOS_AIRES", nombre: "Winclap · Buenos Aires", match: ["buenos aires", "baires", "bsas"] },
  { key: "MENDOZA",      nombre: "Winclap · Mendoza",      match: ["mendoza", "mza"] },
  { key: "CORDOBA",      nombre: "Winclap · Córdoba",      match: ["cordoba", "córdoba", "cba"] },
  { key: "COLOMBIA",     nombre: "Winclap · Colombia",     match: ["colombia", "bogota", "bogotá", "medellin", "medellín", "cali"] },
  { key: "BRAZIL",       nombre: "Winclap · Brazil",       match: ["brazil", "brasil", "sao paulo", "são paulo", "sp"] },
  { key: "MEXICO",       nombre: "Winclap · México",       match: ["mexico", "méxico", "mexico df", "cdmx"] },
];

// Calendario global: contiene a TODOS (incluye sedes sueltas como Trotter,
// Santiago de Chile o Nueva York, que no tienen calendario de clapbase propio).
export const GLOBAL = { key: "GLOBAL", nombre: "Winclap · Global (todos)", match: [] };

// Lista completa de calendarios a crear/sincronizar (global + clapbases).
export const CALENDARIOS = [GLOBAL, ...CLAPBASES];

// Aniversarios que se festejan (años cumplidos en Winclap).
export const HITOS_ANIVERSARIO = [1, 3, 5, 10];

// Mapeo de columnas de la nómina → nombres que esperamos en la fila de encabezado
// del Sheet. Si tu Sheet usa otros títulos, agregalos acá (todo en minúscula).
export const COLUMNAS = {
  nombre:           ["name", "nombre", "first name"],
  apellido:         ["last name", "apellido", "surname"],
  email:            ["mail", "email", "correo", "e-mail"],
  clapbase:         ["clapbase", "oficina", "office", "sede", "base"],
  fechaNacimiento:  ["date of birth", "fecha de nacimiento", "nacimiento", "cumpleaños", "birthday"],
  fechaIngreso:     ["start date", "fecha de ingreso", "ingreso", "alta", "hire date"],
  status:           ["status", "estado"],
};

// Valores de la columna Status que cuentan como persona activa (se incluye).
export const STATUS_ACTIVO = ["activo", "active"];

// Mapeo de columnas de la pestaña ALTAS (ingresos nuevos).
export const COLUMNAS_ALTAS = {
  nombre:        ["nombre", "name"],
  emailWinclap:  ["correo winclap", "mail winclap", "email winclap"],
  emailPersonal: ["correo personal", "mail personal"],
  comunidad:     ["comunidad", "clapbase", "community", "sede"],
  fechaIngreso:  ["fecha ingreso", "fecha de ingreso", "start date"],
  rol:           ["rol", "role", "puesto"],
  team:          ["team", "equipo"],
  area:          ["area", "área"],
};

// Hasta cuántos días hacia adelante se crean los aniversarios (además de todos
// los del año en curso, aunque ya hayan pasado). Evita llenar el calendario con
// hitos de años anteriores; el cron diario va sumando los que se acercan.
export const VENTANA_ANIVERSARIO_DIAS = { adelante: 400 };

export const TIMEZONE = process.env.TIMEZONE || "America/Argentina/Buenos_Aires";
export const SHEET_ID = process.env.NOMINA_SHEET_ID;
// Rango de celdas. Si no incluye "!", se le antepone la primera pestaña automáticamente.
export const SHEET_RANGE = process.env.NOMINA_RANGE || "A1:AZ2000";
// Altas: viven en la pestaña "ALTAS" del mismo Sheet espejo (ya compartido).
export const ALTAS_RANGE = process.env.ALTAS_RANGE || "ALTAS!A1:AZ2000";

export function calendarIdFor(clapbaseKey) {
  return process.env[`CAL_${clapbaseKey}`] || "";
}

// Devuelve la clapbase que matchea un valor de la columna, o null.
export function resolverClapbase(valor) {
  const v = String(valor || "").trim().toLowerCase();
  if (!v) return null;
  return CLAPBASES.find((c) => c.match.some((m) => v.includes(m))) || null;
}
