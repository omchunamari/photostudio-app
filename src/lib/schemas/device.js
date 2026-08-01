import { z } from "zod";

export const deviceSchema = z.object({
  id: z.string(),
  deviceName: z.string(),
  deviceFingerprint: z.string(), // generated client-side, stored to identify machine
  employeeUid: z.string(),
  department: z.string(),
  registeredBy: z.string(), // admin uid
  status: z.enum(["pending", "approved", "blocked", "removed"]).default("pending"),
  createdAt: z.string(),
  approvedAt: z.string().optional().nullable(),
});