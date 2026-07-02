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

// Inserta o actualiza un evento usando su id determinístico (idempotente).
// Inserta primero (1 sola llamada en la corrida inicial); si ya existe, actualiza.
export async function upsertEvento(calendarId, event) {
  const cal = calendarClient();
  const opts = { timeout: 30000 }; // 30s por request: falla rápido y reintenta
  return conReintento(async () => {
    try {
      await cal.events.insert({ calendarId, requestBody: event }, opts);
      return "creado";
    } catch (err) {
      if (err?.code === 409) {
        await cal.events.update({ calendarId, eventId: event.id, requestBody: event }, opts);
        return "actualizado";
      }
      throw err;
    }
  });
}

// Lista los eventos que generamos nosotros (los nuestros tienen ids con prefijo
// 'a' o 'b' seguido de hash). Sirve para borrar los que ya no están en la nómina.
export async function listarEventosGenerados(calendarId) {
  const cal = calendarClient();
  const ids = [];
  let pageToken;
  do {
    const { data } = await conReintento(() =>
      cal.events.list(
        { calendarId, maxResults: 2500, showDeleted: false, singleEvents: false, pageToken },
        { timeout: 30000 }
      )
    );
    for (const ev of data.items || []) {
      if (/^[ab][0-9a-f]{40}$/.test(ev.id || "")) ids.push(ev.id);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

export async function borrarEvento(calendarId, eventId) {
  const cal = calendarClient();
  try {
    await conReintento(() => cal.events.delete({ calendarId, eventId }, { timeout: 30000 }));
  } catch (err) {
    if (err?.code !== 404 && err?.code !== 410) throw err;
  }
}
