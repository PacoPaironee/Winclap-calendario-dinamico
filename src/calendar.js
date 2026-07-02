// Operaciones sobre Google Calendar: asegurar que existan los calendarios y
// volcar (upsert) los eventos de forma idempotente.
import { calendarClient } from "./google.js";

// Crea el calendario de una clapbase si no se pasó un ID, y lo deja legible por
// cualquiera con el link (para que los clappers se puedan suscribir en la prueba).
export async function crearCalendario(nombre, timeZone) {
  const cal = calendarClient();
  const { data } = await cal.calendars.insert({ requestBody: { summary: nombre, timeZone } });
  // ACL público de lectura → cualquiera con el ID puede suscribirse.
  await cal.acl.insert({
    calendarId: data.id,
    requestBody: { role: "reader", scope: { type: "default" } },
  });
  return data.id;
}

// Reintenta una operación ante límites de ritmo / errores transitorios.
async function conReintento(fn, intentos = 5) {
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (err) {
      const code = err?.code;
      // Transitorio: límites de Google (403/429/5xx) o errores de red (códigos no numéricos).
      const transitorio =
        typeof code !== "number" || code === 403 || code === 429 || (code >= 500 && code < 600);
      if (!transitorio || i === intentos - 1) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i)); // backoff: 0.5s, 1s, 2s…
    }
  }
}

const opts = { timeout: 30000 }; // 30s por request: falla rápido y reintenta

// Crea un evento nuevo. Si el id ya existe en Google (p. ej. un evento borrado
// que todavía recuerda), cae a actualizar para no romper.
export async function crearEvento(calendarId, event) {
  const cal = calendarClient();
  await conReintento(async () => {
    try {
      await cal.events.insert({ calendarId, requestBody: event }, opts);
    } catch (err) {
      if (err?.code === 409) {
        await cal.events.update(
          { calendarId, eventId: event.id, requestBody: { ...event, status: "confirmed" } },
          opts
        );
        return;
      }
      throw err;
    }
  });
}

// Actualiza un evento existente.
export async function actualizarEvento(calendarId, event) {
  const cal = calendarClient();
  await conReintento(() => cal.events.update({ calendarId, eventId: event.id, requestBody: event }, opts));
}

// Lee TODOS los eventos que generamos nosotros (ids con prefijo 'a'/'b' + hash) y
// los devuelve como Map(id -> evento). Una sola pasada para poder comparar y
// tocar solo lo que cambió (en vez de reescribir todo).
export async function leerEventosGenerados(calendarId) {
  const cal = calendarClient();
  const mapa = new Map();
  let pageToken;
  do {
    const { data } = await conReintento(() =>
      cal.events.list(
        { calendarId, maxResults: 2500, showDeleted: false, singleEvents: false, pageToken },
        opts
      )
    );
    for (const ev of data.items || []) {
      if (/^[ab][0-9a-f]{40}$/.test(ev.id || "")) mapa.set(ev.id, ev);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return mapa;
}

export async function borrarEvento(calendarId, eventId) {
  const cal = calendarClient();
  try {
    await conReintento(() => cal.events.delete({ calendarId, eventId }, { timeout: 30000 }));
  } catch (err) {
    if (err?.code !== 404 && err?.code !== 410) throw err;
  }
}
