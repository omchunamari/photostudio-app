import { z } from "zod";
import { ROLES } from "@/lib/constants/roles";

export const userSchema = z.object({
  uid: z.string(),
  employeeId: z.string(),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10),
  photoUrl: z.string().optional().nullable(),
  role: z.enum(Object.values(ROLES)),
  department: z.string(),
  joiningDate: z.string(), // ISO date
  bloodGroup: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  emergencyContact: z.string().optional().nullable(),
  status: z.enum(["active", "inactive", "on_leave", "resigned"]).default("active"),
  isMobileAllowed: z.boolean().default(false), // true only for owner/admin
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createUserInputSchema = userSchema.omit({
  uid: true,
  createdAt: true,
  updatedAt: true,
});