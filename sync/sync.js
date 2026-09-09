/* ============================================================
   BLUEPRINT — Sincronización ManyChat → CRM
   Corre en GitHub Actions. Node 20+, sin dependencias.

   Regla central: el sheet manda sobre ETAPA, TOQUES y FECHA DE ENTRADA.
                  El CRM manda sobre todo lo demás.
   ============================================================ */

const SHEET_ID = process.env.SHEET_ID;
const SB_URL   = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SB_KEY   = process.env.SUPABASE_SERVICE_KEY;

if (!SHEET_ID || !SB_URL || !SB_KEY) {
  console.error("Faltan variables: SHEET_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY");
  process.exit(1);
}

/* Hoy en Puerto Rico, no en UTC. A las 8pm de PR ya es otro día en UTC,
   y fechar un toque de la noche con el día siguiente rompe los conteos. */
const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Puerto_Rico" });
const AHORA = new Date().toISOString();

/* ---------- utilidades ---------- */
const norm = (v) => String(v == null ? "" : v).trim().replace(/^@/, "").toLowerCase();
const esTrue = (v) => ["true", "verdadero", "1", "sí", "si", "yes", "x"].includes(String(v == null ? "" : v).trim().toLowerCase());

/* Acepta 2026-09-07, 07/09/2026, 9/7/2026, ISO con hora. Devuelve AAAA-MM-DD o "". */
function fecha(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    // Ambiguo entre DD/MM y MM/DD. Si el primero pasa de 12, es día.
    const [, a, b, y] = m;
    const [dd, mm] = Number(a) > 12 ? [a, b] : [b, a];
    return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}

/* ---------- CSV ---------- */
function parseCSV(texto) {
  const filas = [];
  let fila = [], celda = "", comillas = false;
  const t = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"') { if (t[i + 1] === '"') { celda += '"'; i++; } else comillas = false; }
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") { fila.push(celda); celda = ""; }
    else if (c === "\n") { fila.push(celda); filas.push(fila); fila = []; celda = ""; }
    else celda += c;
  }
  if (celda.length || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter((f) => f.some((c) => String(c).trim() !== ""));
}

/* Lee una pestaña del Sheet. Requiere que el archivo esté compartido como
   "cualquiera con el enlace puede ver" — si no, Google devuelve HTML de login. */
async function leerPestana(nombre) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(nombre)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No pude leer la pestaña "${nombre}" (HTTP ${r.status})`);
  const txt = await r.text();
  if (/^\s*<(!doctype|html)/i.test(txt)) {
    throw new Error(`La pestaña "${nombre}" devolvió HTML. El Sheet no está compartido por enlace.`);
  }
  const filas = parseCSV(txt);
  if (!filas.length) return [];
  const cab = filas[0].map((h) => String(h).trim());
  return filas.slice(1).map((f) => {
    const o = {};
    cab.forEach((h, i) => { o[h] = f[i] == null ? "" : f[i]; });
    return o;
  });
}

/* ---------- Supabase ---------- */
async function sb(ruta, opciones = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(opciones.headers || {})
    }
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

const traerLeads = () => sb("leads?select=id,data");
const guardarLeads = (filas) =>
  sb("leads", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(filas) });
const guardarKV = (key, data) =>
  sb("kv", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify([{ key, data, updated_at: AHORA }]) });

/* ---------- tags ---------- */
const TAGS = [
  "Tag Interest", "Tag Interest Buildup", "Ta Interest Buildup", "Tag Not Interested",
  "Tag Lead", "Tag Warming Lead", "Tag Link", "Tag Booked", "Tag VSL",
  "Tag Client", "Tag Not Closed"
];
/* Estos cuatro prueban que el link salió. Son los únicos que suben el bloque. */
const PRECALL = ["Tag Link", "Tag Booked", "Tag Not Closed", "Tag Client"];

const tiene = (t, n) => t.includes(n);
const nuevoId = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ============================================================ */
(async function main() {
  const informe = {
    fecha: HOY, corridoA: AHORA, creados: 0, avanzados: 0, toquesHoy: 0,
    toquesActualizados: 0, entradasCorregidas: 0, contactosViejos: [],
    duplicadosEnSheet: [], clientesRecuperados: [], sinCambio: 0, detalle: []
  };

  /* --- 1. leer el sheet --- */
  const instagram = await leerPestana("Instagram");
  let toquesLog = [];
  try { toquesLog = await leerPestana("Daily Touch"); }
  catch (e) { informe.detalle.push("Sin pestaña Daily Touch: " + e.message); }

  /* --- 2. deduplicar por username --- */
  const porUser = new Map();
  for (const f of instagram) {
    const u = norm(f.Username);
    if (!u) continue;
    const cuantos = TAGS.filter((t) => esTrue(f[t])).length;
    const previo = porUser.get(u);
    if (previo) {
      informe.duplicadosEnSheet.push(u);
      if (cuantos < previo.cuantos) continue;   // gana el de más tags; empate → el último
    }
    porUser.set(u, { fila: f, cuantos });
  }

  /* --- 3. toques --- */
  const porDia = new Map();          // fecha -> Set(usernames)
  const ultimoToque = new Map();     // username -> fecha más reciente
  for (const f of toquesLog) {
    const u = norm(f.Username), d = fecha(f.Date);
    if (!u || !d) continue;
    if (!porDia.has(d)) porDia.set(d, new Set());
    porDia.get(d).add(u);
    if (!ultimoToque.has(u) || d > ultimoToque.get(u)) ultimoToque.set(u, d);
  }
  /* La columna "Last Touch" de la pestaña Instagram NO se lee a proposito.
     La actualizan tambien los envios automaticos de la secuencia de ManyChat,
     asi que contarla inflaba los toques del setter con mensajes del bot: alguien
     a quien solo le escribio la automatizacion aparecia como trabajado, y
     "Toca hoy" lo bajaba en la cola sin que nadie hubiera hablado con el.
     Un toque es lo que hace una persona, y eso vive en "Daily Touch". */

  /* Últimos 120 días, recalculado siempre desde el log entero: se autocorrige. */
  const corte = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const dias = {};
  for (const [d, set] of porDia) if (d >= corte) dias[d] = set.size;
  informe.toquesHoy = dias[HOY] || 0;

  /* --- 4. leer el CRM --- */
  const actuales = await traerLeads();
  const porHandle = new Map(actuales.map((r) => [norm(r.data.handle), r]));

  const escribir = [];

  for (const [u, { fila }] of porUser) {
    const tags = TAGS.filter((t) => esTrue(fila[t]));
    const precall = tags.some((t) => PRECALL.includes(t));
    const cliente = tiene(tags, "Tag Client");
    const booked = tiene(tags, "Tag Booked");
    const notClosed = tiene(tags, "Tag Not Closed");
    const propuesta = precall;
    const toque = ultimoToque.get(u) || null;
    const subs = fecha(fila.Subscribed);

    const existente = porHandle.get(u);

    /* ---------- A) no está en el CRM: crear ---------- */
    if (!existente) {
      const l = {
        id: nuevoId(), handle: u,
        nombre: String(fila.Name || "").trim() || u,
        fuente: "Bienvenida",
        contactId: String(fila["Contact ID"] || "").trim(),
        entry: subs || HOY,
        subscribedAt: String(fila.Subscribed || "").trim(),
        block: "00 Apertura", blockLock: false,
        blockFloor: precall ? "04 Pre-call" : "",
        meta: "", dolor: "", yaHace: "", comentarios: "", oferta: "", objecion: "",
        respondio: true, respondioAt: HOY,
        propuesta, propuestaAt: propuesta ? HOY : null,
        agendo: null, agendoHora: "",
        agendoAt: (booked || notClosed || cliente) ? HOY : null,
        pendingBook: booked && !cliente && !notClosed,
        callDate: null, show: null, showAt: null,
        cierre: null, cierreAt: null, importe: null,
        estado: "activo", via: tiene(tags, "Tag VSL") ? "VSL" : "",
        touchedAt: toque, seed: false, tags,
        createdAt: AHORA, updatedAt: AHORA
      };
      if (cliente) Object.assign(l, { show: true, cierre: true, cierreAt: HOY, estado: "cliente", pendingBook: false });
      else if (notClosed) Object.assign(l, { show: true, showAt: HOY, cierre: false, cierreAt: HOY });
      else if (tiene(tags, "Tag Not Interested")) l.estado = "muerto";

      if (subs && subs < new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)) {
        informe.contactosViejos.push({ username: u, subscribed: subs });
      }
      escribir.push({ id: l.id, data: l, updated_at: AHORA });
      informe.creados++;
      informe.detalle.push(`creado: @${u} [${tags.join(", ") || "sin tags"}]`);
      continue;
    }

    /* ---------- B) ya está: solo lo que sube ---------- */
    const l = { ...existente.data };
    let cambió = false;
    const set = (k, v) => { if (l[k] !== v) { l[k] = v; cambió = true; } };

    /* B1 · toque — nunca hacia atrás */
    if (toque && (!l.touchedAt || toque > l.touchedAt)) { set("touchedAt", toque); informe.toquesActualizados++; }

    /* B2 · Contact ID */
    const cid = String(fila["Contact ID"] || "").trim();
    if (cid && !l.contactId) set("contactId", cid);

    /* B3 · fecha de entrada — los `seed` no se tocan */
    if (!l.seed && subs && !l.subscribedAt) {
      set("subscribedAt", String(fila.Subscribed || "").trim());
      set("entry", subs);
      informe.entradasCorregidas++;
      if (subs < new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)) {
        informe.contactosViejos.push({ username: u, subscribed: subs });
      }
    }

    /* B4 · etapa */
    const igualTags = JSON.stringify((l.tags || []).slice().sort()) === JSON.stringify(tags.slice().sort());
    if (!igualTags) {
      const antes = (l.tags || []).join(", ") || "sin tags";
      set("tags", tags);
      if (precall) set("blockFloor", "04 Pre-call");     // nunca 01/02/03
      if (tiene(tags, "Tag VSL")) set("via", "VSL");
      if (!l.respondio) { set("respondio", true); set("respondioAt", HOY); }
      if (!l.propuesta && propuesta) { set("propuesta", true); if (!l.propuestaAt) set("propuestaAt", HOY); }
      if (!l.agendoAt && (booked || notClosed || cliente)) set("agendoAt", HOY);
      if (booked && !cliente && !notClosed && !l.agendo) set("pendingBook", true);
      if (tiene(tags, "Tag Not Interested") && !cliente) set("estado", "muerto");
      informe.avanzados++;
      informe.detalle.push(`@${u}: [${antes}] → [${tags.join(", ")}]`);
    }

    /* B5 · Not Closed — solo llena huecos, el closer manda */
    if (notClosed && !cliente) {
      if (!l.propuesta) { set("propuesta", true); if (!l.propuestaAt) set("propuestaAt", HOY); }
      if (l.show === null || l.show === undefined) { set("show", true); set("showAt", l.callDate || HOY); }
      if (l.cierre === null || l.cierre === undefined) { set("cierre", false); set("cierreAt", l.callDate || HOY); }
      set("pendingBook", false);
    }

    /* LA EXCEPCIÓN · Tag Client manda sobre el closer.
       Si ManyChat dice que pagó, pagó. Pero el importe NO se toca: lo pone
       el closer, y así el lead sale en "Cerradas · falta el dinero". */
    if (cliente && l.cierre !== true) {
      set("cierre", true);
      set("show", true);
      set("estado", "cliente");
      set("pendingBook", false);
      if (!l.cierreAt) set("cierreAt", HOY);
      informe.clientesRecuperados.push(u);
      informe.detalle.push(`@${u}: Tag Client ganó sobre el cierre — falta el importe`);
    }

    if (cambió) { l.updatedAt = AHORA; escribir.push({ id: l.id, data: l, updated_at: AHORA }); }
    else informe.sinCambio++;
  }

  /* --- 5. escribir --- */
  for (let i = 0; i < escribir.length; i += 50) await guardarLeads(escribir.slice(i, i + 50));
  await guardarKV("metrics/touches", { dias, actualizado: AHORA });
  await guardarKV("sync/last", informe);
  /* metrics/manual NO se toca: son los toques que el setter anota a mano. */

  console.log(`✓ ${HOY} — creados ${informe.creados}, avanzados ${informe.avanzados}, ` +
              `toques hoy ${informe.toquesHoy}, sin cambio ${informe.sinCambio}`);
  if (informe.clientesRecuperados.length) console.log("  clientes recuperados (falta importe):", informe.clientesRecuperados.join(", "));
  if (informe.contactosViejos.length) console.log("  contactos viejos:", informe.contactosViejos.map((c) => `${c.username} (${c.subscribed})`).join(", "));
  if (informe.duplicadosEnSheet.length) console.log("  duplicados en el sheet:", [...new Set(informe.duplicadosEnSheet)].join(", "));
  informe.detalle.forEach((d) => console.log("  ·", d));
})().catch((e) => { console.error("✗ Falló la sincronización:", e.message); process.exit(1); });
