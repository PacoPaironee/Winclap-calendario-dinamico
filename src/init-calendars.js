// `npm run calendars:init` — crea un calendario de Google por cada clapbase que
// todavía no tenga ID en el .env, y te imprime las líneas para pegar.
import { CALENDARIOS, calendarIdFor, TIMEZONE } from "./config.js";
import { crearCalendario } from "./calendar.js";
import { serviceAccountEmail } from "./google.js";

async function main() {
  console.log(`\n🛠  Inicializando calendarios (zona horaria: ${TIMEZONE})`);
  console.log(`   Service account: ${serviceAccountEmail()}\n`);

  const lineas = [];
  for (const clapbase of CALENDARIOS) {
    const existente = calendarIdFor(clapbase.key);
    if (existente) {
      console.log(`✔︎ ${clapbase.nombre}: ya tiene ID (${existente}).`);
      lineas.push(`CAL_${clapbase.key}=${existente}`);
      continue;
    }
    const id = await crearCalendario(clapbase.nombre, TIMEZONE);
    console.log(`＋ ${clapbase.nombre}: creado → ${id}`);
    lineas.push(`CAL_${clapbase.key}=${id}`);
  }

  console.log(`\n📋 Pegá esto en tu .env:\n`);
  console.log(lineas.join("\n"));
  console.log(`\n🔗 Cada calendario quedó legible por link. Para suscribirse, los`);
  console.log(`   clappers usan el ID en Google Calendar → "Suscribirse a calendario".`);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
