import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./client";
import { DEFAULT_ENQUIRY_FORM } from "@/lib/constants/enquiryForm";

// Stored at orgSettings/enquiryForm — a separate doc from orgSettings/main
// (quote settings) but same collection, so it inherits the existing rule
// (`allow get: if true`) that already lets the public read orgSettings
// without being signed in. Only admin/PM (isProjectOps) can write it.
const ENQUIRY_FORM_REF = () => doc(db, "orgSettings", "enquiryForm");

export async function getEnquiryFormConfig() {
  const snap = await getDoc(ENQUIRY_FORM_REF());
  if (!snap.exists()) return DEFAULT_ENQUIRY_FORM;
  const data = snap.data();
  return {
    title: data.title || DEFAULT_ENQUIRY_FORM.title,
    subtitle: data.subtitle || "",
    fields: Array.isArray(data.fields) && data.fields.length ? data.fields : DEFAULT_ENQUIRY_FORM.fields,
  };
}

export async function saveEnquiryFormConfig(config) {
  await setDoc(
    ENQUIRY_FORM_REF(),
    {
      title: config.title || DEFAULT_ENQUIRY_FORM.title,
      subtitle: config.subtitle || "",
      fields: config.fields,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}