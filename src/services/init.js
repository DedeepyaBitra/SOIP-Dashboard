// Wires the browser Supabase client into the service layer. Imported once from main.jsx.
import { supabase } from '../lib/supabaseClient.js';
import { setDbClient } from './db.js';

setDbClient(supabase);
