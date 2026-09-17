/**
 * One-time backfill for three fields added after the data already existed.
 * Safe to re-run — every doc that already has the field is skipped.
 *
 * 1. projects.eventType
 *    Copied from the originating lead's `projectType` (projects/{id}.leadId
 *    -> leads/{leadId}.projectType). Projects created standalone, or whose
 *    lead has been deleted or never had an event type set, are left alone
 *    and reported at the end so you can set them by hand.
 *
 *    Fallback: older projects were named "<Client> - <Event Type>" at
 *    conversion time. When the lead lookup comes up empty, the suffix after
 *    the last " - " is checked against the known event types and used if it
 *    matches. Anything that doesn't match exactly is NOT guessed at.
 *
 * 2. projects.leadName
 *    The originating lead's clientName, denormalized so the project header
 *    can link back to the lead without a second read per project.
 *
 * 3. invoices.paidAt
 *    Invoices marked paid before paidAt existed have no record of WHEN the
 *    money landed. There is no way to recover the true collection date, so
 *    this seeds paidAt from the invoice's raised date — which is exactly
 *    what collectionDate() already falls back to at read time. Running this
 *    changes no numbers on the dashboard; it just makes the stored data
 *    match what the app computes, so future edits behave predictably.
 *    Unpaid invoices get paidAt: null.
 *
 * Usage:
 *   node scripts/backfill-project-and-invoice-fields.js            # dry run (default)
 *   node scripts/backfill-project-and-invoice-fields.js --apply    # actually writes
 *
 * Limit to one part if you'd rather go in stages:
 *   node scripts/backfill-project-and-invoice-fields.js --only=projects --apply
 *   node scripts/backfill-project-and-invoice-fields.js --only=invoices --apply
 *
 * Also strip the event type off the end of project names, so
 * "Sahil & Isha Wedding" becomes "Sahil & Isha" (the type now has its own
 * column, so keeping it in the name duplicates it):
 *   node scripts/backfill-project-and-invoice-fields.js --clean-names --apply
 *
 * Needs the same FIREBASE_ADMIN_* env vars as scripts/seed-admin.js
 * (loaded from .env.local).
 */
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
require("dotenv").config({ path: ".env.local" });

// Mirrors PROJECT_TYPES in src/lib/constants/leads.js. Kept as a literal
// copy because this script runs under plain node/CommonJS and can't import
// from the app's ES-module source tree.
const PROJECT_TYPES = [
  "Wedding",
  "Pre-Wedding",
  "Engagement",
  "Commercial",
  "Portrait",
  "Event",
  "Other",
];

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });

const db = getFirestore(app);

const apply = process.argv.includes("--apply");
const cleanNames = process.argv.includes("--clean-names");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.split("=")[1] : "all";

/**
 * Commits in chunks of 400 (Firestore's limit is 500 per batch, leaving
 * headroom). Collects writes and flushes as it goes, so a few thousand
 * projects won't blow the limit.
 */
function makeBatcher() {
  let batch = db.batch();
  let count = 0;
  return {
    async update(ref, data) {
      batch.update(ref, data);
      count += 1;
      if (count >= 400) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    },
    async flush() {
      if (count > 0) await batch.commit();
    },
  };
}

// Misspellings seen in real project names. Kept explicit and tiny rather
// than doing fuzzy matching — a wrong auto-correct is worse than a manual fix.
const TYPE_ALIASES = {
  engagment: "Engagement",
  engagement: "Engagement",
  "pre wedding": "Pre-Wedding",
  prewedding: "Pre-Wedding",
};

// Longest first so "Pre-Wedding" is tested before "Wedding" — otherwise
// "Aarti Pre-Wedding" would match the shorter one and be filed as a wedding.
const TYPES_BY_LENGTH = [...PROJECT_TYPES].sort((a, b) => b.length - a.length);

/**
 * Recovers an event type from the project's name.
 *
 * Handles both naming conventions in the data: the "<Client> - <Type>" form
 * used by the old convert-to-project flow, and the plain "<Client> <Type>"
 * form typed by hand. Matching is case-insensitive and anchored to the end
 * of the name.
 *
 * Returns { type } on a confident match, { ambiguous: [...] } when the name
 * mentions more than one event type (e.g. "Engagement + Wedding" — a real
 * judgement call, not something to guess), or null when nothing matches.
 */
function eventTypeFromName(projectName) {
  if (!projectName) return null;
  const name = projectName.trim();
  const lower = name.toLowerCase();

  // More than one type named? Don't guess — these need a human.
  const mentioned = TYPES_BY_LENGTH.filter((t) => {
    const re = new RegExp(`\\b${t.toLowerCase().replace(/[-]/g, "[- ]")}\\b`);
    return re.test(lower);
  });
  // "Pre-Wedding" also contains "Wedding"; collapse that overlap so it isn't
  // reported as ambiguous on its own.
  const distinct = mentioned.filter(
    (t) => !mentioned.some((o) => o !== t && o.toLowerCase().includes(t.toLowerCase()))
  );
  if (distinct.length > 1) return { ambiguous: distinct };
  if (distinct.length === 1) return { type: distinct[0] };

  // No exact type — try the alias list against the trailing word or two.
  const words = lower.split(/[\s\-]+/);
  for (const n of [2, 1]) {
    const tail = words.slice(-n).join(" ");
    if (TYPE_ALIASES[tail]) return { type: TYPE_ALIASES[tail], viaAlias: tail };
  }
  return null;
}

/**
 * Strips a trailing event type off a project name, so "Sahil & Isha Wedding"
 * becomes "Sahil & Isha". Only used with --clean-names. Returns null when
 * there's nothing to strip or stripping would leave the name empty.
 */
function nameWithoutEventType(projectName, type) {
  if (!projectName || !type) return null;
  const cleaned = projectName
    .trim()
    .replace(new RegExp(`[\\s\\-–+&]*${type.replace(/[-]/g, "[- ]")}\\s*$`, "i"), "")
    .replace(/[\s\-–+&]+$/, "")
    .trim();
  if (!cleaned || cleaned === projectName.trim()) return null;
  return cleaned;
}

async function backfillProjects() {
  console.log("── projects: eventType + leadName ──\n");

  const [projectsSnap, leadsSnap] = await Promise.all([
    db.collection("projects").get(),
    db.collection("leads").get(),
  ]);

  const leadsById = new Map();
  leadsSnap.docs.forEach((d) => leadsById.set(d.id, d.data()));

  console.log(`${projectsSnap.size} projects, ${leadsSnap.size} leads.\n`);

  const batcher = makeBatcher();
  let updated = 0;
  let alreadyOk = 0;
  const unresolved = [];

  for (const docSnap of projectsSnap.docs) {
    const p = docSnap.data();
    const lead = p.leadId ? leadsById.get(p.leadId) : null;
    const patch = {};

    if (!p.eventType) {
      const fromLead = lead?.projectType || null;
      const guess = fromLead ? null : eventTypeFromName(p.projectName);
      const resolved = fromLead || guess?.type || null;

      if (resolved) {
        patch.eventType = resolved;
        let how = "from linked lead";
        if (!fromLead) how = guess.viaAlias ? `from name, spelled "${guess.viaAlias}"` : "from name";
        console.log(`  ${docSnap.id} "${p.projectName}": eventType -> "${resolved}"  (${how})`);

        if (cleanNames) {
          const cleaned = nameWithoutEventType(p.projectName, resolved);
          if (cleaned) {
            patch.projectName = cleaned;
            console.log(`      projectName -> "${cleaned}"`);
          }
        }
      } else if (guess?.ambiguous) {
        unresolved.push(
          `${docSnap.id} — ${p.projectName}   (mentions ${guess.ambiguous.join(" and ")} — pick one)`
        );
      } else {
        unresolved.push(`${docSnap.id} — ${p.projectName || "(no name)"}`);
      }
    }

    if (!p.leadName && lead?.clientName) {
      patch.leadName = lead.clientName;
      console.log(`  ${docSnap.id} "${p.projectName}": leadName -> "${lead.clientName}"`);
    }

    if (Object.keys(patch).length === 0) {
      alreadyOk += 1;
      continue;
    }

    updated += 1;
    if (apply) {
      patch.updatedAt = new Date().toISOString();
      await batcher.update(docSnap.ref, patch);
    }
  }

  await batcher.flush();

  console.log(
    `\n  ${updated} project${updated === 1 ? "" : "s"} updated${apply ? "" : " (dry run, nothing written)"}, ` +
      `${alreadyOk} already complete.`
  );

  if (unresolved.length > 0) {
    console.log(
      `\n  ${unresolved.length} project${unresolved.length === 1 ? "" : "s"} need an event type set by hand ` +
        `(no linked lead, or the lead has no event type):`
    );
    unresolved.forEach((line) => console.log(`    - ${line}`));
    console.log("\n  Set these on each project's detail page.");
  }
}

async function backfillInvoices() {
  console.log("\n── invoices: paidAt ──\n");

  const snap = await db.collection("invoices").get();
  console.log(`${snap.size} invoices.\n`);

  const batcher = makeBatcher();
  let seeded = 0;
  let clearedUnpaid = 0;
  let alreadyOk = 0;
  let noDate = 0;

  for (const docSnap of snap.docs) {
    const inv = docSnap.data();

    // Already has an explicit value (including a deliberate null) — leave it.
    if (inv.paidAt !== undefined) {
      alreadyOk += 1;
      continue;
    }

    if (inv.status === "paid") {
      if (!inv.date) {
        // Nothing sensible to seed from. collectionDate() returns null for
        // these, so they're already excluded from the FY cash figure —
        // writing a made-up date would be worse than leaving it unset.
        noDate += 1;
        console.log(`  ! ${inv.invoiceNumber || docSnap.id}: paid but no date — skipping, set manually.`);
        continue;
      }
      seeded += 1;
      console.log(`  ${inv.invoiceNumber || docSnap.id}: paidAt -> ${inv.date} (from raised date)`);
      if (apply) {
        await batcher.update(docSnap.ref, { paidAt: inv.date, updatedAt: new Date().toISOString() });
      }
    } else {
      clearedUnpaid += 1;
      if (apply) {
        await batcher.update(docSnap.ref, { paidAt: null, updatedAt: new Date().toISOString() });
      }
    }
  }

  await batcher.flush();

  console.log(
    `\n  ${seeded} paid invoice${seeded === 1 ? "" : "s"} seeded, ` +
      `${clearedUnpaid} unpaid set to null, ${alreadyOk} already had paidAt, ${noDate} skipped (paid, no date)` +
      `${apply ? "" : " — dry run, nothing written"}.`
  );
}

async function run() {
  console.log(
    apply
      ? "Running in APPLY mode — this will write changes.\n"
      : "Running in DRY-RUN mode — no writes will happen. Pass --apply to write.\n"
  );

  if (only !== "all" && only !== "projects" && only !== "invoices") {
    console.error(`Unknown --only value "${only}". Use "projects" or "invoices".`);
    process.exit(1);
  }

  if (cleanNames) {
    console.log('--clean-names is on: the event type will also be stripped off the END of each project name.\n');
  }

  if (only === "all" || only === "projects") await backfillProjects();
  if (only === "all" || only === "invoices") await backfillInvoices();

  console.log("\nDone.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});