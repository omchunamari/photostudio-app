import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "./client";

// --- Org-wide quote settings: a single doc holding the default payment
// (bank/UPI) details shown on every quote unless the quote overrides them. ---

const ORG_SETTINGS_REF = () => doc(db, "orgSettings", "main");

export async function getOrgQuoteSettings() {
  const snap = await getDoc(ORG_SETTINGS_REF());
  return snap.exists() ? snap.data() : { businessName: "", tagline: "", paymentDetails: {} };
}

export async function saveOrgQuoteSettings(data) {
  await setDoc(
    ORG_SETTINGS_REF(),
    {
      businessName: data.businessName || "",
      tagline: data.tagline || "",
      paymentDetails: {
        accountName: data.accountName || "",
        bank: data.bank || "",
        accountNumber: data.accountNumber || "",
        ifsc: data.ifsc || "",
        upi: data.upi || "",
      },
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

// --- Generic template collection helpers (packageTemplates,
// contractTemplates, paymentScheduleTemplates all share this shape:
// { name, ...fields, createdAt } ) ---

function templatesCollection(kind) {
  return collection(db, kind);
}

async function listTemplates(kind) {
  const q = query(templatesCollection(kind), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function createTemplate(kind, data) {
  const ref = await addDoc(templatesCollection(kind), {
    ...data,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

async function updateTemplate(kind, id, data) {
  await updateDoc(doc(db, kind, id), { ...data, updatedAt: new Date().toISOString() });
}

async function deleteTemplate(kind, id) {
  await deleteDoc(doc(db, kind, id));
}

// Package templates: { name, events:[{name,teamSize,shift}], descriptionHtml,
// deliverables:[string], addonsHtml, unitPrice }
export const getPackageTemplates = () => listTemplates("packageTemplates");
export const createPackageTemplate = (data) => createTemplate("packageTemplates", data);
export const updatePackageTemplate = (id, data) => updateTemplate("packageTemplates", id, data);
export const deletePackageTemplate = (id) => deleteTemplate("packageTemplates", id);

// Contract templates: { name, bodyHtml }
export const getContractTemplates = () => listTemplates("contractTemplates");
export const createContractTemplate = (data) => createTemplate("contractTemplates", data);
export const updateContractTemplate = (id, data) => updateTemplate("contractTemplates", id, data);
export const deleteContractTemplate = (id) => deleteTemplate("contractTemplates", id);

// Payment schedule templates: { name, splits: [30, 60, 10] }
export const getPaymentScheduleTemplates = () => listTemplates("paymentScheduleTemplates");
export const createPaymentScheduleTemplate = (data) =>
  createTemplate("paymentScheduleTemplates", data);
export const updatePaymentScheduleTemplate = (id, data) =>
  updateTemplate("paymentScheduleTemplates", id, data);
export const deletePaymentScheduleTemplate = (id) =>
  deleteTemplate("paymentScheduleTemplates", id);