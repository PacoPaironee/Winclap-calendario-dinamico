# Winclap · Calendario Dinámico

Sincroniza **cumpleaños** y **aniversarios laborales (1, 3, 5 y 10 años)** desde la
nómina (Google Sheet) hacia Google Calendar — **un calendario por clapbase**
(Buenos Aires, Mendoza, Córdoba, Colombia, Brazil).

Los clappers se suscriben a los calendarios y los prenden/apagan con los checkboxes
nativos de Google Calendar. El "owner de experience" de cada clapbase puede además
cargar eventos a mano (eventos de oficina, asados, etc.) en su calendario.

## Cómo funciona

```
Google Sheet (nómina)  ──►  script de sync (cron diario)  ──►  5 calendarios de Google
   nombre, email,            calcula cumples y                    (uno por clapbase)
   clapbase, f. nac.,        aniversarios del período                 │
   f. ingreso                                                  clappers se suscriben
```

El sync es **idempotente**: cada evento tiene un id único derivado de la persona,
así que correrlo muchas veces no duplica. Si agregás a alguien en el Sheet, al otro
día aparece; si lo borrás, su evento se elimina solo.

## Setup (una sola vez)

### 1. Service Account (la "cuenta robot")
1. Entrá a https://console.cloud.google.com → creá un proyecto (ej. `winclap-calendario`).
2. **APIs & Services → Enable APIs** → habilitá **Google Sheets API** y **Google Calendar API**.
3. **APIs & Services → Credentials → Create credentials → Service account**. Ponele un nombre.
4. En la service account → pestaña **Keys → Add key → JSON**. Se descarga un `.json`.
5. Guardá ese archivo en esta carpeta como `service-account.json` (ya está en `.gitignore`).
6. Copiá el **email** de la service account (`...@...iam.gserviceaccount.com`).

### 2. Compartir la nómina con la cuenta robot
En el Google Sheet de la nómina → **Compartir** → pegá el email de la service account
como **Lector**.

### 3. Configurar el `.env`
```bash
cp .env.example .env
```
Editá `.env` y completá `GOOGLE_APPLICATION_CREDENTIALS`, `NOMINA_SHEET_ID` y `NOMINA_RANGE`.

### 4. Crear los calendarios
```bash
npm install
npm run calendars:init
```
Esto crea los 5 calendarios y te imprime las líneas `CAL_*=...` para pegar en el `.env`.
> En producción, en vez de auto-crearlos podés crear los calendarios a mano en una
> cuenta de Winclap y compartirlos con la service account como "Hacer cambios en eventos".

## Uso

```bash
npm run sync:dry   # simula: muestra qué crearía/borraría sin tocar nada
npm run sync       # sincroniza de verdad
```

### Automatizar (cron diario)
En cualquier servidor o en Netlify/cron, programá `npm run sync` una vez por día.
Ejemplo crontab (6:00 AM):
```
0 6 * * *  cd /ruta/Calendario\ Dinamico && /usr/bin/node src/sync.js
```

## Columnas esperadas en la nómina
`nombre`, `email`, `clapbase`, `fecha de nacimiento`, `fecha de ingreso`.
Los nombres aceptados (y las clapbases) se ajustan en [`src/config.js`](src/config.js).
Formatos de fecha soportados: `1995-03-12`, `12/03/1995`, `12-03-1995`.
