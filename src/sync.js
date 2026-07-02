// Entrada principal: `npm run sync` (o `npm run sync:dry` para simular).
// Lee la nómina, calcula cumples/aniversarios y los vuelca en cada calendario.
import { CALENDARIOS, calendarIdFor } from "./config.js";
import { leerNomina } from "./sheet.js";
import { eventosDePersona } from "./events.js";
import { upsertEvento, listarEventosGenerados, borrarEvento } from "./calendar.js";

const DRY = process.argv.includes("--dry-run");

async function main() {
  const hoy = new Date();
  console.log(`\n🔄 Sync ${DRY ? "(DRY-RUN, no escribe nada)" : ""} — ${hoy.toISOString().slice(0, 10)}\n`);

  const { personas, avisos } = await leerNomina();
  console.log(`📋 Nómina: ${personas.length} personas leídas.`);

  // Calcular eventos deseados, agrupados por clapbase.
  const deseadosPorClapbase = new Map(); // key -> Map(eventId -> event)
  for (const persona of personas) {
    for (const { calendarKey, event } of eventosDePersona(persona, hoy)) {
      if (!deseadosPorClapbase.has(calendarKey)) deseadosPorClapbase.set(calendarKey, new Map());
      deseadosPorClapbase.get(calendarKey).set(event.id, event);
    }
  }

  let creados = 0, actualizados = 0, borrados = 0, sinCalendario = 0;

  for (const clapbase of CALENDARIOS) {
    const calendarId = calendarIdFor(clapbase.key);
    const deseados = deseadosPorClapbase.get(clapbase.key) || new Map();

    if (!calendarId) {
      if (deseados.size) {
        sinCalendario += deseados.size;
        console.log(`⚠️  ${clapbase.nombre}: ${deseados.size} eventos pendientes pero falta CAL_${clapbase.key} en el .env. Corré "npm run calendars:init".`);
      }
      continue;
    }

    // Upsert de los deseados.
    if (!DRY && deseados.size) process.stdout.write(`  ${clapbase.nombre}: ${deseados.size} eventos `);
    let hechos = 0;
    for (const event of deseados.values()) {
      if (DRY) { console.log(`  [${clapbase.key}] would upsert → ${event.summary}`); continue; }
      const r = await upsertEvento(calendarId, event);
      r === "creado" ? creados++ : actualizados++;
      if (++hechos % 50 === 0) process.stdout.write("·"); // latido cada 50
    }
    if (!DRY && deseados.size) process.stdout.write(" ✓\n");

    // Podar: borrar eventos generados que ya no corresponden (bajas, cambios).
    const existentes = DRY ? [] : await listarEventosGenerados(calendarId);
    for (const id of existentes) {
      if (!deseados.has(id)) {
        if (DRY) { console.log(`  [${clapbase.key}] would delete → ${id}`); continue; }
        await borrarEvento(calendarId, id);
        borrados++;
      }
    }
  }

  console.log(`\n✅ Listo. Creados: ${creados} · Actualizados: ${actualizados} · Borrados: ${borrados}` +
    (sinCalendario ? ` · Pendientes sin calendario: ${sinCalendario}` : ""));

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
