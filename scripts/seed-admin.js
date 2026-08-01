const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
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

const auth = getAuth(app);
const db = getFirestore(app);

async function seedAdmin() {
  const email = "chunamariom@gmail.com";
  const password = "Om@1234567";    // CHANGE THIS, meets policy: 8+ chars, capital, number, special char
  const name = "Om Chunamari";             // CHANGE THIS

  // 1. Create the Firebase Auth user
  const userRecord = await auth.createUser({
    email,
    password,
    displayName: name,
  });

  console.log("Auth user created:", userRecord.uid);

  // 2. Create the matching Firestore profile
  const now = new Date().toISOString();
  await db.collection("users").doc(userRecord.uid).set({
    employeeId: "EMP-0001",
    name,
    email,
    phone: "0000000000",
    photoUrl: null,
    role: "super_admin",
    department: "Management",
    joiningDate: now,
    bloodGroup: null,
    address: null,
    emergencyContact: null,
    status: "active",
    isMobileAllowed: true,
    forcePasswordChange: false,
    createdAt: now,
    updatedAt: now,
  });

  console.log("Firestore profile created for:", email);
  console.log("Done. You can now log in with:", email, "/", password);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});