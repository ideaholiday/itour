import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const travelerSignupSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  phone: z
    .string()
    .min(10, 'Mobile number must be at least 10 digits')
    .regex(/^(?:\+91[\s-]?)?[6789]\d{9}$/, 'Enter a valid Indian mobile number (e.g. +91 9876543210)'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  accountType: z.literal('traveler').default('traveler'),
});

export type TravelerSignupValues = z.infer<typeof travelerSignupSchema>;

export const supplierSignupSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  phone: z
    .string()
    .min(10, 'Mobile number must be at least 10 digits')
    .regex(/^(?:\+91[\s-]?)?[6789]\d{9}$/, 'Enter a valid Indian mobile number (e.g. +91 9876543210)'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  company_name: z
    .string()
    .trim()
    .min(2, 'Company/Agency name is required'),
  city: z
    .string()
    .trim()
    .min(2, 'City is required'),
  state: z
    .string()
    .trim()
    .min(2, 'State is required'),
  accountType: z.literal('supplier').default('supplier'),
});

export type SupplierSignupValues = z.infer<typeof supplierSignupSchema>;

export type SignupFormValues = TravelerSignupValues | SupplierSignupValues;
