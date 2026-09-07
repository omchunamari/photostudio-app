/**
 * One-time migration: rewrites every deliverable's `status` field from the
 * old 3-stage vocabulary (Pending / In Progress / Done) to the new
 * 7-stage post-production pipeline:
 *   Not Started → In Progress → Draft Ready → Sent to Client →
 *   Approval / Revision → Final Done → Delivered
 *
 * Mapping used:
 *   Pending      -> Not Started
 *   In Progress  -> In Progress   (unchanged)
 *   Done         -> Delivered
 *
 * Anything already on a new-pipeline status, or with no status at all, is
 * left untouched. Safe to re-run — already-migrated docs are skipped.
 *
 * The app itself doesn't need this to keep working: lib/firebase/
 * deliverables.js normalizes old statuses on every read
 * (normalizeDeliverableStatus). This script is for actually rewriting the
 * stored data in Firestore so it's clean going forward (analytics, direct
 * Firestore console browsing, etc. all just see the new values).
 *
 * Usage:
 *   node scripts/migrate-deliverable-statuses.js          # dry run (default)
 *   node scripts/migrate-deliverable-statuses.js --apply   # actually writes
 *
 * Needs the same FIREBASE_ADMIN_* env vars as scripts/seed-admin.js
 * (loaded from .env.local).
 */
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
require("dotenv").config({ path: ".env.local" });

const STATUS_MIGRATION = {
  "Pending": "Not Started",
  "In Progress": "In Progress",
  "Done": "Delivered",
};

const NEW_STATUSES = new Set([
  "Not Started",
  "In Progress",
  "Draft Ready",
  "Sent to Client",
  "Approval / Revision",
  "Final Done",
  "Delivered",
]);

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

async function migrate() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "Running in APPLY mode — this will write changes.\n" : "Running in DRY-RUN mode — no writes will happen. Pass --apply to write.\n");

  // collectionGroup query across every project's deliverables subcollection.
  const snap = await db.collectionGroup("deliverables").get();
  console.log(`Found ${snap.size} deliverable docs total.\n`);

  let toMigrate = 0;
  let alreadyOk = 0;
  let noStatus = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const status = data.status;

    if (!status) {
      noStatus += 1;
      continue;
    }
    if (NEW_STATUSES.has(status)) {
      alreadyOk += 1;
      continue;
    }
    const mapped = STATUS_MIGRATION[status];
    if (!mapped) {
      console.log(`  ! Unrecognized status "${status}" on ${docSnap.ref.path} — skipping, please check manually.`);
      continue;
    }

    toMigrate += 1;
    console.log(`  ${docSnap.ref.path}: "${status}" -> "${mapped}"`);

    if (apply) {
      batch.update(docSnap.ref, { status: mapped, updatedAt: new Date().toISOString() });
      batchCount += 1;
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (apply && batchCount > 0) {
    await batch.commit();
  }

  console.log(`\nDone. ${toMigrate} migrated${apply ? "" : " (dry run, nothing written)"}, ${alreadyOk} already on the new pipeline, ${noStatus} with no status set.`);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});