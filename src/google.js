// Autenticación con Google usando la Service Account (la "cuenta robot").
// La llave (.json) se indica en GOOGLE_APPLICATION_CREDENTIALS dentro del .env.
import fs from "node:fs";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly", // leer la nómina
  "https://www.googleapis.com/auth/calendar",              // crear/editar calendarios y eventos
];

let _auth;
function getAuth() {
  if (_auth) return _auth;
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile) {
    throw new Error(
      "Falta GOOGLE_APPLICATION_CREDENTIALS en el .env (ruta al JSON de la service account)."
    );
  }
  _auth = new google.auth.GoogleAuth({ keyFile, scopes: SCOPES });
  return _auth;
}

export function sheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

export function calendarClient() {
  return google.calendar({ version: "v3", auth: getAuth() });
}

// Email de la service account (para mostrar instrucciones de compartido).
export function serviceAccountEmail() {
  try {
    const data = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
    return data.client_email;
  } catch {
    return "(no se pudo leer la llave)";
  }
}
