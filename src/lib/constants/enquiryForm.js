// Field types the enquiry form builder / renderer supports.
export const ENQUIRY_FIELD_TYPES = [
  { value: "text", label: "Short answer" },
  { value: "textarea", label: "Paragraph" },
  { value: "tel", label: "Phone number" },
  { value: "email", label: "Email" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
];

// Locked fields are the minimum an incoming lead needs (a name to call
// someone by, and a way to reach them). They can be relabelled but never
// removed or made optional, so the public form can never be edited into a
// state that produces leads without contact info.
export const LOCKED_FIELD_KEYS = ["firstName", "lastName", "whatsappNumber"];

// Where an unlocked question's answer lands on the lead it creates.
// "custom" (the default for any new question you add) folds the answer
// into the lead's Notes, prefixed with the question's label so several
// custom answers stay distinguishable from each other. Every other option
// writes straight into that lead attribute — map only one question per
// option, since the last one submitted wins if two questions share a target.
export const ENQUIRY_MAPS_TO_OPTIONS = [
  { value: "custom", label: "Notes (labeled)" },
  { value: "email", label: "Email" },
  { value: "projectType", label: "Project Type" },
  { value: "eventDate", label: "Event Date" },
  { value: "budget", label: "Budget" },
  { value: "eventDetails", label: "Notes (unlabeled)" },
];

// Shipped as the starting configuration the first time anyone opens the
// Enquiry Form settings tab / the first time the public form is loaded and
// no orgSettings/enquiryForm doc exists yet.
export const DEFAULT_ENQUIRY_FORM = {
  title: "Enquiry Form",
  subtitle: "You're just a step away from getting us making your day special!",
  fields: [
    { id: "firstName", key: "firstName", label: "First Name", type: "text", required: true, locked: true, mapsTo: "clientNameFirst", options: [] },
    { id: "lastName", key: "lastName", label: "Last Name", type: "text", required: true, locked: true, mapsTo: "clientNameLast", options: [] },
    { id: "whatsappNumber", key: "whatsappNumber", label: "WhatsApp Number", type: "tel", required: true, locked: true, mapsTo: "phone", options: [] },
    { id: "email", key: "email", label: "Email ID", type: "email", required: false, locked: false, mapsTo: "email", options: [] },
    { id: "projectType", key: "projectType", label: "What are you enquiring about?", type: "select", required: false, locked: false, mapsTo: "projectType", options: ["Wedding", "Pre-Wedding", "Engagement", "Commercial", "Portrait", "Event", "Other"] },
    { id: "eventDate", key: "eventDate", label: "Event Date", type: "date", required: false, locked: false, mapsTo: "eventDate", options: [] },
    { id: "message", key: "message", label: "Tell us about your event", type: "textarea", required: false, locked: false, mapsTo: "eventDetails", options: [] },
  ],
};

export function slugifyFieldKey(label, existingKeys = []) {
  const base = (label || "field")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "") || "field";
  let key = base;
  let i = 2;
  while (existingKeys.includes(key)) {
    key = `${base}${i}`;
    i += 1;
  }
  return key;
}