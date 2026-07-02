// Gestiona los permisos de los calendarios.
//
//   node src/share.js <email> <rol> [KEY] [--solo] [--notificar]
//
//   <rol>  : reader | writer | owner
//     reader = ver todos los eventos
//     writer = hacer cambios en los eventos (editor)
//     owner  = hacer cambios y administrar accesos (admin)
//   [KEY]  : opcional. Si se indica una clapbase (GLOBAL, CORDOBA, BUENOS_AIRES,
//            MENDOZA, COLOMBIA, BRAZIL, MEXICO) aplica SOLO a ese calendario.
//            Si se omite, aplica a TODOS.
//   --solo      : además quita el acceso público (scope "default").
//   --notificar : manda el mail de "Agregar calendario" a la persona.
//
// Ejemplos:
//   node src/share.js ana@winclap.com writer CORDOBA      → editora solo de Córdoba
//   node src/share.js ana@winclap.com reader GLOBAL       → lectora del global
//   node src/share.js franco@winclap.com owner --solo     → owner de todos, sin público
import { CALENDARIOS, calendarIdFor } from "./config.js";
import { calendarClient } from "./google.js";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const pos = args.filter((a) => !a.startsWith("--"));
const [email, rol = "reader", key] = pos;

const soloYo = flags.includes("--solo");
const notificar = flags.includes("--notificar");
const claves = CALENDARIOS.map((c) => c.key);

if (!email || !["reader", "writer", "owner"].includes(rol) || (key && !claves.includes(key))) {
  console.error("Uso: node src/share.js <email> <reader|writer|owner> [KEY] [--solo] [--notificar]");
  console.error("KEY posibles:", claves.join(", "));
  process.exit(1);
}

async function main() {
  const cal = calendarClient();
  const objetivo = key ? CALENDARIOS.filter((c) => c.key === key) : CALENDARIOS;

  for (const c of objetivo) {
    const calendarId = calendarIdFor(c.key);
    if (!calendarId) { console.log(`— ${c.nombre}: sin ID en el .env, salteo.`); continue; }

    await cal.acl.insert({
      calendarId,
      requestBody: { role: rol, scope: { type: "user", value: email } },
      sendNotifications: notificar,
    });

    if (soloYo) {
      try {
        await cal.acl.delete({ calendarId, ruleId: "default" });
      } catch (err) {
        if (err?.code !== 404) throw err;
      }
    }

    console.log(`✔︎ ${c.nombre}: ${email} → ${rol}${soloYo ? " · público quitado" : ""}${notificar ? " · notificado" : ""}`);
  }
  console.log(`\n✅ Listo.`);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
