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
      admins: {
        Row: {
          created_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      articles: {
        Row: {
          fetched_at: string;
          id: string;
          published_at: string | null;
          publisher: string | null;
          raw: Json;
          snippet: string | null;
          source_id: string | null;
          title: string;
          url: string;
        };
        Insert: {
          fetched_at?: string;
          id?: string;
          published_at?: string | null;
          publisher?: string | null;
          raw?: Json;
          snippet?: string | null;
          source_id?: string | null;
          title: string;
          url: string;
        };
        Update: {
          fetched_at?: string;
          id?: string;
          published_at?: string | null;
          publisher?: string | null;
          raw?: Json;
          snippet?: string | null;
          source_id?: string | null;
          title?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "articles_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "feed_sources";
            referencedColumns: ["id"];
          },
        ];
      };
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
        Relationships: [
          {
            foreignKeyName: "brief_stories_brief_id_fkey";
            columns: ["brief_id"];
            isOneToOne: false;
            referencedRelation: "daily_briefs";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [];
      };
      cluster_articles: {
        Row: {
          article_id: string;
          cluster_id: string;
        };
        Insert: {
          article_id: string;
          cluster_id: string;
        };
        Update: {
          article_id?: string;
          cluster_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cluster_articles_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cluster_articles_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "story_clusters";
            referencedColumns: ["id"];
          },
        ];
      };
      cluster_candidates: {
        Row: {
          cluster_id: string;
          created_at: string;
          id: string;
          rank: number;
          window_date: string;
        };
        Insert: {
          cluster_id: string;
          created_at?: string;
          id?: string;
          rank: number;
          window_date: string;
        };
        Update: {
          cluster_id?: string;
          created_at?: string;
          id?: string;
          rank?: number;
          window_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cluster_candidates_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "story_clusters";
            referencedColumns: ["id"];
          },
        ];
      };
      feed_sources: {
        Row: {
          created_at: string | null;
          id: string;
          is_enabled: boolean;
          name: string;
          url: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_enabled?: boolean;
          name: string;
          url: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_enabled?: boolean;
          name?: string;
          url?: string;
        };
        Relationships: [];
      };
      story_clusters: {
        Row: {
          category: string | null;
          created_at: string | null;
          id: string;
          label: string | null;
          score: number;
          window_date: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string | null;
          id?: string;
          label?: string | null;
          score?: number;
          window_date: string;
        };
        Update: {
          category?: string | null;
          created_at?: string | null;
          id?: string;
          label?: string | null;
          score?: number;
          window_date?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
