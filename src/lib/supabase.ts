import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nojeazeqqbixzdkjhkcw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vamVhemVxcWJpeHpka2poa2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MTk1NTMsImV4cCI6MjEwNTE5NTU1M30.67hUZmkrLgAG3Nzni2IULgVj51NGvhYR2gn6p_aE3AU';

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
