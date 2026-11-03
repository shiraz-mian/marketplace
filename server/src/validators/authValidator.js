import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

const registerSchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: z.string().min(15).max(128),
});

const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export { registerSchema, loginSchema };
