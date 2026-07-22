// Convierte cada persona de la nómina en sus eventos de calendario.
import crypto from "node:crypto";
import { HITOS_ANIVERSARIO, VENTANA_ANIVERSARIO_DIAS, TIMEZONE } from "./config.js";

// ID determinístico y válido para Google Calendar (base32hex: 0-9 + a-v).
// Mismo input => mismo id => al re-sincronizar actualiza en vez de duplicar.
function eventId(prefijo, ...partes) {
  const hash = crypto.createHash("sha1").update(partes.join("|")).digest("hex");
  return `${prefijo}${hash}`; // prefijo: 'a' (cumple) / 'b' (aniversario), ambos válidos
}

function fechaISO(year, month, day) {
  const p = (n) => String(n).padStart(2, "0");
  return `${year}-${p(month)}-${p(day)}`;
}

function masUnDia(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day + 1));
  return fechaISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function diasEntre(isoA, isoB) {
  return Math.round((Date.parse(isoB) - Date.parse(isoA)) / 86400000);
}

// Config común de todos los eventos que generamos.
const BASE_EVENTO = {
  transparency: "transparent", // no marca "ocupado" en la agenda de nadie
  visibility: "public",
  reminders: { useDefault: false },
};

// ¿La fecha entra en la ventana? (todo el año en curso + los próximos N días)
function enVentana(fechaISOstr, hoy) {
  const inicioAnioISO = fechaISO(hoy.getUTCFullYear(), 1, 1);
  const hoyISO = fechaISO(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, hoy.getUTCDate());
  return fechaISOstr >= inicioAnioISO && diasEntre(hoyISO, fechaISOstr) <= VENTANA_ANIVERSARIO_DIAS.adelante;
}

// Devuelve los eventos de una persona. `hoy` es una fecha de referencia (Date).
export function eventosDePersona(persona, hoy = new Date()) {
  const eventos = [];
  // Cada evento va al calendario global + al de su clapbase (si tiene una).
  const destinos = ["GLOBAL"];
  if (persona.clapbase) destinos.push(persona.clapbase.key);
  const anioActual = hoy.getUTCFullYear();

  // ── Cumpleaños: evento de todo el día, recurrente cada año ────────────────
  if (persona.nacimiento) {
    const { month, day } = persona.nacimiento;
    const inicio = fechaISO(anioActual, month, day);
    const event = {
      id: eventId("a", "cumple", persona.email || persona.nombre),
      summary: `🎂 Cumple de ${persona.nombre}`,
      description: "Cumpleaños — generado automáticamente desde la nómina.",
      start: { date: inicio, timeZone: TIMEZONE },
      end: { date: masUnDia(anioActual, month, day), timeZone: TIMEZONE },
      recurrence: ["RRULE:FREQ=YEARLY"],
      ...BASE_EVENTO,
    };
    for (const calendarKey of destinos) eventos.push({ calendarKey, event });
  }

  // ── Aniversarios 1/3/5/10 años: evento de todo el día en su fecha exacta ──
  if (persona.ingreso) {
    const { year, month, day } = persona.ingreso;
    for (const hito of HITOS_ANIVERSARIO) {
      const anioEvento = year + hito;
      const fecha = fechaISO(anioEvento, month, day);
      if (!enVentana(fecha, hoy)) continue;
      const event = {
        id: eventId("b", "aniv", persona.email || persona.nombre, hito),
        summary: `🎉 ${hito} ${hito === 1 ? "año" : "años"} de ${persona.nombre} en Winclap`,
        description: `Aniversario laboral (${hito} años). Ingreso: ${fechaISO(year, month, day)}. Generado automáticamente.`,
        start: { date: fecha, timeZone: TIMEZONE },
        end: { date: masUnDia(anioEvento, month, day), timeZone: TIMEZONE },
        ...BASE_EVENTO,
      };
      for (const calendarKey of destinos) eventos.push({ calendarKey, event });
    }
  }

  return eventos;
}

// Evento de un ingreso nuevo (pestaña ALTAS). Va al global + su comunidad.
export function eventosDeAlta(alta, hoy = new Date()) {
  const eventos = [];
  if (!alta.fecha) return eventos;
  const { year, month, day } = alta.fecha;
  const fecha = fechaISO(year, month, day);
  if (!enVentana(fecha, hoy)) return eventos;

  const destinos = ["GLOBAL"];
  if (alta.clapbase) destinos.push(alta.clapbase.key);

  const detalle = [alta.rol, alta.team, alta.area].filter(Boolean).join(" · ");
  const event = {
    id: eventId("c", "alta", alta.email || alta.nombre),
    summary: `🎉 Nuevo ingreso: ${alta.nombre}`,
    description: detalle ? `${detalle}\n\nNuevo ingreso — generado automáticamente.` : "Nuevo ingreso — generado automáticamente.",
    start: { date: fecha, timeZone: TIMEZONE },
    end: { date: masUnDia(year, month, day), timeZone: TIMEZONE },
    ...BASE_EVENTO,
  };
  for (const calendarKey of destinos) eventos.push({ calendarKey, event });
  return eventos;
}
