/**
 * Deletes storage log entries (the "Log Storage" records under
 * Post-Production > Storage). Intended for clearing out test/dummy data
 * accumulated while the storage-logging feature was being built out.
 *
 * This is a permanent delete, not a status change, so it has one more
 * guard than the other scripts in this folder: --apply alone isn't
 * enough. You must also type DELETE at the prompt it shows you, which
 * states exactly how many documents are about to go. --yes skips that
 * prompt for non-interactive use (CI, etc.) — use it deliberately, not
 * out of habit.
 *
 * Usage:
 *   node scripts/clear-storage-entries.js                    # dry run — lists what would be deleted
 *   node scripts/clear-storage-entries.js --apply             # deletes ALL entries, asks to confirm
 *   node scripts/clear-storage-entries.js --apply --yes        # deletes ALL entries, no prompt
 *   node scripts/clear-storage-entries.js --project <id>       # scope to one project (add --apply to write)
 *
 * Needs the same FIREBASE_ADMIN_* env vars as scripts/seed-admin.js
 * (loaded from .env.local).
 */
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const readline = require("readline");
require("dotenv").config({ path: ".env.local" });

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
const skipPrompt = process.argv.includes("--yes");
const projectArg = process.argv.find((a) => a.startsWith("--project="));
const projectId = projectArg ? projectArg.split("=")[1] : null;

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer);
  }));
}

/** Commits deletes in chunks of 400 — Firestore's batch limit is 500. */
function makeBatcher() {
  let batch = db.batch();
  let count = 0;
  return {
    async delete(ref) {
      batch.delete(ref);
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

async function run() {
  let query = db.collection("storageEntries");
  if (projectId) query = query.where("projectId", "==", projectId);

  const snap = await query.get();

  if (snap.empty) {
    console.log(
      projectId
        ? `No storage entries found for project ${projectId}.`
        : "No storage entries found — nothing to delete."
    );
    return;
  }

  console.log(
    `Found ${snap.size} storage ${snap.size === 1 ? "entry" : "entries"}` +
      (projectId ? ` for project ${projectId}` : " (all projects)") +
      ".\n"
  );

  // A quick preview so a dry run (or the confirm prompt) tells you what
  // you're about to lose, not just a bare count.
  const preview = snap.docs.slice(0, 10);
  preview.forEach((d) => {
    const e = d.data();
    console.log(
      `  - ${e.projectName || e.projectId || "?"} · ${e.eventName || "?"} · ` +
        `${e.memberName || "?"} · logged by ${e.loggedBy || "someone"}`
    );
  });
  if (snap.size > preview.length) {
    console.log(`  ... and ${snap.size - preview.length} more.`);
  }

  if (!apply) {
    console.log("\nDry run — nothing deleted. Pass --apply to actually delete these.");
    return;
  }

  if (!skipPrompt) {
    const answer = await confirm(
      `\nThis permanently deletes ${snap.size} storage ${snap.size === 1 ? "entry" : "entries"}. ` +
        `Type DELETE to confirm: `
    );
    if (answer.trim() !== "DELETE") {
      console.log("Confirmation text didn't match — aborted, nothing deleted.");
      return;
    }
  }

  const batcher = makeBatcher();
  for (const doc of snap.docs) {
    await batcher.delete(doc.ref);
  }
  await batcher.flush();

  console.log(`\nDeleted ${snap.size} storage ${snap.size === 1 ? "entry" : "entries"}.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});