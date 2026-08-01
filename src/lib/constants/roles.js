export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  HR: "hr",
  PROJECT_MANAGER: "project_manager",
  PHOTOGRAPHER: "photographer",
  VIDEOGRAPHER: "videographer",
  EDITOR: "editor",
  DATA_MANAGER: "data_manager",
  ACCOUNTANT: "accountant",
};

export const MODULES = {
  PROJECTS: "projects",
  ATTENDANCE: "attendance",
  USERS: "users",
  FINANCE: "finance",
  CRM: "crm",
  SETTINGS: "settings",
  REPORTS: "reports",
};

export const ACTIONS = ["create", "view", "edit", "delete"];

// Default permission matrix — editable later via Role Management UI.
// true/false per module per action.
export const DEFAULT_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: "ALL", // bypasses matrix entirely
  [ROLES.ADMIN]: "ALL",
  [ROLES.HR]: {
    [MODULES.USERS]: { create: true, view: true, edit: true, delete: false },
    [MODULES.ATTENDANCE]: { create: false, view: true, edit: true, delete: false },
  },
  [ROLES.PROJECT_MANAGER]: {
    [MODULES.PROJECTS]: { create: true, view: true, edit: true, delete: false },
    [MODULES.CRM]: { create: true, view: true, edit: true, delete: false },
  },
  [ROLES.PHOTOGRAPHER]: {
    [MODULES.PROJECTS]: { create: false, view: true, edit: false, delete: false },
  },
  [ROLES.VIDEOGRAPHER]: {
    [MODULES.PROJECTS]: { create: false, view: true, edit: false, delete: false },
  },
  [ROLES.EDITOR]: {
    [MODULES.PROJECTS]: { create: false, view: true, edit: true, delete: false },
  },
  [ROLES.DATA_MANAGER]: {
    [MODULES.PROJECTS]: { create: false, view: true, edit: true, delete: false },
  },
  [ROLES.ACCOUNTANT]: {
    [MODULES.FINANCE]: { create: true, view: true, edit: true, delete: false },
    [MODULES.REPORTS]: { create: false, view: true, edit: false, delete: false },
  },
};

/** @param {string} role @param {string} module @param {string} action */
export function hasPermission(role, module, action, customPermissions = null) {
  const perms = customPermissions || DEFAULT_PERMISSIONS[role];
  if (perms === "ALL") return true;
  if (!perms || !perms[module]) return false;
  return !!perms[module][action];
}