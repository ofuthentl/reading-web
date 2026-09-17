import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Book = {
  id: string;
  title: string;
  author: string;
  description: string | null;
  cover_color: string;
  file_path: string | null;
  file_type: 'pdf' | 'epub' | null;
  owner_id: string | null;
  is_public: boolean;
  created_at: string;
};

export type Chapter = {
  id: string;
  book_id: string;
  title: string;
  content: string;
  chapter_number: number;
  created_at: string;
  content_html?: string;
};
