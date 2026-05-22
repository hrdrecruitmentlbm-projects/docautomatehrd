import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

// For client-side interactions
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// For server-side interactions requiring admin privileges (like bypassing RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
