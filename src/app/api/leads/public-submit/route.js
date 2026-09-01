export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DEFAULT_ENQUIRY_FORM, LOCKED_FIELD_KEYS } from "@/lib/constants/enquiryForm";

export async function POST(request) {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");

    const body = await request.json();
    const values = body?.values && typeof body.values === "object" ? body.values : {};

    // Honeypot: a real visitor never fills this hidden field; a bot filling
    // every field usually does. Pretend success without writing anything.
    if (body?.hp) {
      return NextResponse.json({ success: true });
    }

    // Re-fetch the field config server-side rather than trusting whatever
    // the client says its fields were — required-ness and which fields are
    // locked/mapped is the actual gate on what's needed to create a lead.
    const settingsSnap = await adminDb.collection("orgSettings").doc("enquiryForm").get();
    const fields =
      settingsSnap.exists && Array.isArray(settingsSnap.data().fields) && settingsSnap.data().fields.length
        ? settingsSnap.data().fields
        : DEFAULT_ENQUIRY_FORM.fields;

    // Guard against a stale/tampered config missing the fields a lead needs.
    for (const requiredKey of LOCKED_FIELD_KEYS) {
      if (!fields.some((f) => f.key === requiredKey)) {
        return NextResponse.json({ error: "Form is misconfigured. Please contact us directly." }, { status: 500 });
      }
    }

    const missing = [];
    for (const field of fields) {
      if (field.required) {
        const v = values[field.key];
        if (v === undefined || v === null || String(v).trim() === "") {
          missing.push(field.label);
        }
      }
    }
    if (missing.length) {
      return NextResponse.json({ error: `Please fill in: ${missing.join(", ")}` }, { status: 400 });
    }

    const get = (key) => (values[key] ?? "").toString().trim();

    const firstName = get("firstName");
    const lastName = get("lastName");
    const clientName = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (!clientName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const leadData = {
      clientName,
      phone: "",
      email: "",
      projectType: null,
      eventDate: null,
      budget: 0,
      source: "Website",
      origin: "form",
    };

    // Anything not mapped to a known lead attribute is preserved as text so
    // no submitted answer is silently dropped, even for custom fields the
    // admin adds later.
    const extraNotes = [];

    for (const field of fields) {
      if (LOCKED_FIELD_KEYS.includes(field.key)) continue;
      const raw = values[field.key];
      const v = raw === undefined || raw === null ? "" : String(raw).trim();
      if (!v) continue;

      switch (field.mapsTo) {
        case "email":
          leadData.email = v;
          break;
        case "projectType":
          leadData.projectType = v;
          break;
        case "eventDate":
          leadData.eventDate = v;
          break;
        case "budget": {
          const n = Number(v.replace(/[^0-9.]/g, ""));
          if (!Number.isNaN(n)) leadData.budget = n;
          break;
        }
        case "eventDetails":
          extraNotes.push(v);
          break;
        default:
          extraNotes.push(`${field.label}: ${v}`);
      }
    }
    leadData.phone = get("whatsappNumber");
    leadData.eventDetails = extraNotes.join("\n");

    const now = new Date().toISOString();
    const leadRef = await adminDb.collection("leads").add({
      clientName: leadData.clientName,
      phone: leadData.phone,
      email: leadData.email,
      projectType: leadData.projectType,
      eventDate: leadData.eventDate,
      eventDetails: leadData.eventDetails,
      source: leadData.source,
      origin: leadData.origin,
      budget: leadData.budget,
      handledByUid: null,
      handledByName: "",
      followUpDate: null,
      followUpTime: null,
      priority: null,
      status: "New Inquiry",
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    });

    await adminDb.collection("leads").doc(leadRef.id).collection("activities").add({
      type: "system",
      text: "Lead added via Enquiry Form",
      addedByUid: null,
      addedByName: "Enquiry Form",
      addedAt: now,
    });

    // Store the raw submission as its own record, independent of how the
    // answers got mapped onto the lead — so every question and answer is
    // still visible on the Responses tab even if the form's questions
    // change (or a mapping is edited/removed) after this was submitted.
    const answers = fields
      .filter((field) => !LOCKED_FIELD_KEYS.includes(field.key))
      .map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        value: values[field.key] === undefined || values[field.key] === null ? "" : String(values[field.key]).trim(),
      }))
      .filter((a) => a.value !== "");

    await adminDb.collection("enquiryResponses").add({
      leadId: leadRef.id,
      clientName: leadData.clientName,
      phone: leadData.phone,
      answers,
      createdAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Public enquiry submit error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}