export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      brief_stories: {
        Row: {
          brief_id: string;
          created_at: string;
          headline: string;
          id: string;
          position: number;
          sources: Json;
          summary: string;
          updated_at: string;
          why_it_matters: string | null;
        };
        Insert: {
          brief_id: string;
          created_at?: string;
          headline: string;
          id?: string;
          position: number;
          sources?: Json;
          summary: string;
          updated_at?: string;
          why_it_matters?: string | null;
        };
        Update: {
          brief_id?: string;
          created_at?: string;
          headline?: string;
          id?: string;
          position?: number;
          sources?: Json;
          summary?: string;
          updated_at?: string;
          why_it_matters?: string | null;
        };
      };
      daily_briefs: {
        Row: {
          brief_date: string;
          created_at: string;
          id: string;
          published_at: string | null;
          status: "draft" | "published";
          title: string | null;
          updated_at: string;
        };
        Insert: {
          brief_date: string;
          created_at?: string;
          id?: string;
          published_at?: string | null;
          status: "draft" | "published";
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          brief_date?: string;
          created_at?: string;
          id?: string;
          published_at?: string | null;
          status?: "draft" | "published";
          title?: string | null;
          updated_at?: string;
        };
      };
    };
  };
};
