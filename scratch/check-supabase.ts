
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing env variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  console.log('Checking Supabase connection...');
  try {
    const { data, error } = await supabase.from('salon_config').select('*').limit(1);
    if (error) {
      console.error('Error fetching salon_config:', error);
    } else {
      console.log('Successfully fetched salon_config:', data);
    }

    const { data: appts, error: apptErr } = await supabase.from('appointments').select('*').limit(1);
     if (apptErr) {
      console.error('Error fetching appointments:', apptErr);
    } else {
      console.log('Successfully fetched appointments:', appts);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

check();
