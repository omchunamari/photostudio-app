// Freelancers are external, non-payroll crew — kept in their own collection
// (not `users`) since they don't log in and have no Firebase Auth account.
// Skill values intentionally match employee `role` values for photographer/
// videographer/editor/data_manager so both pools can later be merged into a
// single "assign to event" picker without a translation layer.
export const FREELANCER_SKILLS = [
  "photographer",
  "videographer",
  "editor",
  "data_manager",
  "other",
];

export const FREELANCER_SKILL_LABELS = {
  photographer: "Photographer",
  videographer: "Videographer",
  editor: "Editor",
  data_manager: "Data Manager",
  other: "Other",
};

export const FREELANCER_STATUSES = ["active", "inactive"];