import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [path.join(__dirname, "..", ".env.local"), path.join(__dirname, "..", ".env")],
  quiet: true,
});

const supabaseUrl = process.env.SUPABASE_URL || "https://jidknptoyloucgldaool.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_WwdMLSfWZE8fErjAKcs6UQ_tIBSHZcA";

if (process.env.NODE_ENV === "production" && (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required in production");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});
export default supabase;
