import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://jidknptoyloucgldaool.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_WwdMLSfWZE8fErjAKcs6UQ_tIBSHZcA";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export default supabase;
