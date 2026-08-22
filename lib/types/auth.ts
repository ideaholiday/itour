export type UserRole = 'user' | 'supplier' | 'admin' | 'ops';
export type AccountType = 'traveler' | 'supplier';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  company_name?: string | null;
  city?: string | null;
  state?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
}

export interface AuthActionResponse {
  success: boolean;
  message?: string;
  error?: string;
  redirectTo?: string;
}
