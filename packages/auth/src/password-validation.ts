import { z } from "zod";
import { PASSWORD_REQUIREMENTS } from "./password-requirements.js";

// Re-export client-safe utilities
export { PASSWORD_REQUIREMENTS, checkPasswordRequirements, type PasswordRequirement } from "./password-requirements.js";

export const passwordSchema = z.string().refine(
  (password) => PASSWORD_REQUIREMENTS.every((req) => req.test(password)),
  { message: "Password does not meet all requirements" }
);

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Token is required"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});
