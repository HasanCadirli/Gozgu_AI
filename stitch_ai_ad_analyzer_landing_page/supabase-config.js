import { createClient } from '@supabase/supabase-js'

// Supabase bağlantı bilgileri .env dosyasından okunur
// (Vite, VITE_ önekli değişkenleri otomatik import.meta.env'ye aktarır)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase bağlantı bilgileri eksik! .env dosyasını kontrol edin.');
}

// Supabase istemcisini başlatıyoruz
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
