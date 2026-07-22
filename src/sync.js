// Entrada principal: `npm run sync` (o `npm run sync:dry` para simular).
// Lee la nómina, calcula cumples/aniversarios y sincroniza cada calendario
// tocando SOLO lo que cambió (crear / actualizar / borrar), no todo.
import { CALENDARIOS, calendarIdFor } from "./config.js";
import { leerNomina } from "./sheet.js";
import { leerAltas } from "./altas.js";
import { eventosDePersona, eventosDeAlta } from "./events.js";
import { crearEvento, actualizarEvento, leerEventosGenerados, borrarEvento } from "./calendar.js";

const DRY = process.argv.includes("--dry-run");

// ¿Cambió algo relevante entre lo que hay y lo que queremos? (evita updates al pedo)
function difiere(existente, deseado) {
  const rec = (e) => (e.recurrence || []).join(";");
  return (
    (existente.summary || "") !== (deseado.summary || "") ||
    (existente.description || "") !== (deseado.description || "") ||
    (existente.start?.date || "") !== (deseado.start?.date || "") ||
    (existente.end?.date || "") !== (deseado.end?.date || "") ||
    rec(existente) !== rec(deseado)
  );
}

// Sincroniza un calendario: compara lo existente con lo deseado y aplica el diff.
async function sincronizarCalendario(clapbase, deseados) {
  const calendarId = calendarIdFor(clapbase.key);
  if (!calendarId) {
    return { nombre: clapbase.nombre, sinCalendario: deseados.size, creados: 0, actualizados: 0, borrados: 0, iguales: 0 };
  }

  // 1 lectura por calendario de lo que ya generamos nosotros.
  const existentes = DRY ? new Map() : await leerEventosGenerados(calendarId);
  let creados = 0, actualizados = 0, borrados = 0, iguales = 0;

  // Crear / actualizar / dejar igual.
  for (const event of deseados.values()) {
    const ex = existentes.get(event.id);
    if (!ex) {
      if (!DRY) await crearEvento(calendarId, event);
      creados++;
    } else if (difiere(ex, event)) {
      if (!DRY) await actualizarEvento(calendarId, event);
      actualizados++;
    } else {
      iguales++;
    }
  }

  // Borrar los que sobran (bajas, cambios de clapbase, etc.).
  for (const id of existentes.keys()) {
    if (!deseados.has(id)) {
      if (!DRY) await borrarEvento(calendarId, id);
      borrados++;
    }
  }

  return { nombre: clapbase.nombre, sinCalendario: 0, creados, actualizados, borrados, iguales };
}

async function main() {
  const hoy = new Date();
  console.log(`\n🔄 Sync ${DRY ? "(DRY-RUN, no escribe nada)" : ""} — ${hoy.toISOString().slice(0, 10)}\n`);

  const { personas, avisos } = await leerNomina();
  const { altas, avisos: avisosAltas } = await leerAltas();
  console.log(`📋 Nómina: ${personas.length} personas · Altas: ${altas.length} ingresos.`);
  avisos.push(...avisosAltas);

  // Calcular eventos deseados, agrupados por calendario.
  const deseadosPorCalendario = new Map(); // key -> Map(eventId -> event)
  const agregar = (lista) => {
    for (const { calendarKey, event } of lista) {
      if (!deseadosPorCalendario.has(calendarKey)) deseadosPorCalendario.set(calendarKey, new Map());
      deseadosPorCalendario.get(calendarKey).set(event.id, event);
    }
  };
  for (const persona of personas) agregar(eventosDePersona(persona, hoy));
  for (const alta of altas) agregar(eventosDeAlta(alta, hoy));

  // Procesar los calendarios en paralelo (cada uno hace su diff).
  const resultados = await Promise.all(
    CALENDARIOS.map((c) => sincronizarCalendario(c, deseadosPorCalendario.get(c.key) || new Map()))
  );

  const tot = resultados.reduce(
    (a, r) => ({
      creados: a.creados + r.creados,
      actualizados: a.actualizados + r.actualizados,
      borrados: a.borrados + r.borrados,
      iguales: a.iguales + r.iguales,
      sinCalendario: a.sinCalendario + r.sinCalendario,
    }),
    { creados: 0, actualizados: 0, borrados: 0, iguales: 0, sinCalendario: 0 }
  );

  for (const r of resultados) {
    if (r.sinCalendario) {
      console.log(`⚠️  ${r.nombre}: ${r.sinCalendario} eventos pendientes pero falta su CAL_* en el .env.`);
    } else {
      console.log(`  ${r.nombre.padEnd(28)} +${r.creados} ~${r.actualizados} -${r.borrados} (=${r.iguales})`);
    }
  }

  console.log(
    `\n✅ Listo. Creados: ${tot.creados} · Actualizados: ${tot.actualizados} · Borrados: ${tot.borrados} · Sin cambios: ${tot.iguales}` +
      (tot.sinCalendario ? ` · Pendientes sin calendario: ${tot.sinCalendario}` : "")
  );

  if (avisos.length) {
    console.log(`\n⚠️  Avisos (${avisos.length}):`);
    for (const a of avisos.slice(0, 50)) console.log(`   - ${a}`);
    if (avisos.length > 50) console.log(`   …y ${avisos.length - 50} más.`);
  }
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
