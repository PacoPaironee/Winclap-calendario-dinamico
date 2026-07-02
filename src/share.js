// Gestiona los permisos de los calendarios.
//
//   node src/share.js <email> <rol>        → da acceso a una persona
//   node src/share.js <email> owner --solo  → además QUITA el acceso público
//
// Roles válidos: reader | writer | owner
//   reader = ver todos los eventos
//   writer = hacer cambios en los eventos (editor)
//   owner  = hacer cambios y administrar el uso compartido (admin)
import { CALENDARIOS, calendarIdFor } from "./config.js";
import { calendarClient } from "./google.js";

const [, , email, rol = "owner", ...flags] = process.argv;
const soloYo = flags.includes("--solo"); // quita el acceso público (scope "default")

if (!email || !["reader", "writer", "owner"].includes(rol)) {
  console.error("Uso: node src/share.js <email> <reader|writer|owner> [--solo]");
  process.exit(1);
}

async function main() {
  const cal = calendarClient();
  for (const c of CALENDARIOS) {
    const calendarId = calendarIdFor(c.key);
    if (!calendarId) { console.log(`— ${c.nombre}: sin ID en el .env, salteo.`); continue; }

    // Dar acceso a la persona.
    await cal.acl.insert({
      calendarId,
      requestBody: { role: rol, scope: { type: "user", value: email } },
      sendNotifications: false,
    });

    // Opcional: quitar el acceso público (la regla scope "default").
    if (soloYo) {
      try {
        await cal.acl.delete({ calendarId, ruleId: "default" });
      } catch (err) {
        if (err?.code !== 404) throw err;
      }
    }

    console.log(`✔︎ ${c.nombre}: ${email} → ${rol}${soloYo ? " · público quitado" : ""}`);
  }
  console.log(`\n✅ Listo. Revisá tu Google Calendar: los calendarios "Winclap · ..." deberían aparecer en tu lista.`);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
