import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "./client";

// Raw form submissions, written server-side (Admin SDK) by
// /api/leads/public-submit alongside the lead it creates. Kept separate
// from the "leads" collection so every answer to every question is
// preserved verbatim — including ones that get folded into a lead's Notes
// or don't map to a lead field at all — even if the form's questions
// change later.
export async function getAllEnquiryResponses() {
  const q = query(collection(db, "enquiryResponses"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}