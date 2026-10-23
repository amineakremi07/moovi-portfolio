/**
 * GENERATED from the live schema of Supabase project <your-project-ref>
 * (2026-10-17, after 20261017000000_players_without_home_club). Do not hand-edit.
 *
 * Regenerate with:  npx supabase gen types typescript --linked > lib/types/database.types.ts
 * then diff against the curated lib/types/database.ts, which is what the clients import.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      anonymous_bookers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          org_id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          org_id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          org_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anonymous_bookers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          last_used_at: string | null
          name: string
          organization_id: string
          permissions: string[]
          prefix: string
          rate_limit: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          last_used_at?: string | null
          name: string
          organization_id: string
          permissions?: string[]
          prefix: string
          rate_limit?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          permissions?: string[]
          prefix?: string
          rate_limit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_notes: {
        Row: {
          booking_id: string
          created_at: string
          note: string
          org_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          note: string
          org_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          note?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_notes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_shares: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          id: string
          invite_token_hash: string | null
          is_organizer: boolean
          paid_at: string | null
          payer_name: string | null
          share_no: number
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          id?: string
          invite_token_hash?: string | null
          is_organizer?: boolean
          paid_at?: string | null
          payer_name?: string | null
          share_no: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          id?: string
          invite_token_hash?: string | null
          is_organizer?: boolean
          paid_at?: string | null
          payer_name?: string | null
          share_no?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_shares_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booker_anon_id: string | null
          booker_profile_id: string | null
          buffer_ends_at: string
          cancellation_deadline: string
          cancellation_reason: string | null
          check_in_code: string | null
          checked_in_at: string | null
          court_id: string | null
          court_pending: boolean
          created_at: string
          ends_at: string
          guest_cancel_token_hash: string | null
          id: string
          org_id: string
          pass_token_hash: string | null
          payment_method: string
          player_count: number
          source: string
          sport: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          booker_anon_id?: string | null
          booker_profile_id?: string | null
          buffer_ends_at: string
          cancellation_deadline: string
          cancellation_reason?: string | null
          check_in_code?: string | null
          checked_in_at?: string | null
          court_id?: string | null
          court_pending?: boolean
          created_at?: string
          ends_at: string
          guest_cancel_token_hash?: string | null
          id?: string
          org_id: string
          pass_token_hash?: string | null
          payment_method: string
          player_count: number
          source?: string
          sport: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          booker_anon_id?: string | null
          booker_profile_id?: string | null
          buffer_ends_at?: string
          cancellation_deadline?: string
          cancellation_reason?: string | null
          check_in_code?: string | null
          checked_in_at?: string | null
          court_id?: string | null
          court_pending?: boolean
          created_at?: string
          ends_at?: string
          guest_cancel_token_hash?: string | null
          id?: string
          org_id?: string
          pass_token_hash?: string | null
          payment_method?: string
          player_count?: number
          source?: string
          sport?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_booker_anon_id_fkey"
            columns: ["booker_anon_id"]
            isOneToOne: false
            referencedRelation: "anonymous_bookers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_booker_profile_id_fkey"
            columns: ["booker_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      court_slot_locks: {
        Row: {
          booking_id: string
          court_id: string
          occupied_from: string
          occupied_until: string
        }
        Insert: {
          booking_id: string
          court_id: string
          occupied_from: string
          occupied_until: string
        }
        Update: {
          booking_id?: string
          court_id?: string
          occupied_from?: string
          occupied_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_slot_locks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_slot_locks_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          close_time: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          night_starts_at: string
          night_surcharge_per_hour: number
          open_time: string
          org_id: string
          price_per_hour: number
          sport: string
          status: string
          updated_at: string
        }
        Insert: {
          close_time?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          night_starts_at?: string
          night_surcharge_per_hour?: number
          open_time?: string
          org_id: string
          price_per_hour?: number
          sport: string
          status?: string
          updated_at?: string
        }
        Update: {
          close_time?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          night_starts_at?: string
          night_surcharge_per_hour?: number
          open_time?: string
          org_id?: string
          price_per_hour?: number
          sport?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          attempts: number
          booking_id: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          last_error: string | null
          payload: Json | null
          provider_id: string | null
          recipient: string
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          attempts?: number
          booking_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          last_error?: string | null
          payload?: Json | null
          provider_id?: string | null
          recipient: string
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          attempts?: number
          booking_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json | null
          provider_id?: string | null
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          gallery_urls: string[]
          id: string
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          name: string
          registry_number: string | null
          rejection_reason: string | null
          sport_types: string[]
          status: string
          timezone: string
          updated_at: string
          verification_documents: Json | null
          verified_at: string | null
          verified_by: string | null
          weekly_hours: Json | null
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          gallery_urls?: string[]
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          registry_number?: string | null
          rejection_reason?: string | null
          sport_types?: string[]
          status?: string
          timezone?: string
          updated_at?: string
          verification_documents?: Json | null
          verified_at?: string | null
          verified_by?: string | null
          weekly_hours?: Json | null
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          gallery_urls?: string[]
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          registry_number?: string | null
          rejection_reason?: string | null
          sport_types?: string[]
          status?: string
          timezone?: string
          updated_at?: string
          verification_documents?: Json | null
          verified_at?: string | null
          verified_by?: string | null
          weekly_hours?: Json | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_records: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          provider: string
          status: string
          stripe_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          provider: string
          status?: string
          stripe_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          provider?: string
          status?: string
          stripe_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          anonymized_at: string | null
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          is_suspended: boolean
          last_visited_club_id: string | null
          no_show_count: number
          org_id: string | null
          phone: string | null
          remind_by_email: boolean
          remind_by_sms: boolean
          remind_by_whatsapp: boolean
          role: string
          suspended_until: string | null
          trust_score: number
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          is_suspended?: boolean
          last_visited_club_id?: string | null
          no_show_count?: number
          org_id?: string | null
          phone?: string | null
          remind_by_email?: boolean
          remind_by_sms?: boolean
          remind_by_whatsapp?: boolean
          role: string
          suspended_until?: string | null
          trust_score?: number
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_suspended?: boolean
          last_visited_club_id?: string | null
          no_show_count?: number
          org_id?: string | null
          phone?: string | null
          remind_by_email?: boolean
          remind_by_sms?: boolean
          remind_by_whatsapp?: boolean
          role?: string
          suspended_until?: string | null
          trust_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_visited_club_id_fkey"
            columns: ["last_visited_club_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          role: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          org_id: string
          role: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      anonymize_guest: { Args: { p_guest_id: string }; Returns: Json }
      anonymize_player: { Args: { p_user_id: string }; Returns: Json }
      archive_organization: {
        Args: { p_cancel_upcoming?: boolean; p_org_id: string }
        Returns: Json
      }
      booked_with_my_club: { Args: { p_profile_id: string }; Returns: boolean }
      check_in_booking: {
        Args: { p_booking_id?: string; p_code?: string; p_org_id: string }
        Returns: Json
      }
      club_demand_counts: {
        Args: { p_org_id: string; p_since: string; p_until: string }
        Returns: {
          first_start: string
          hour: number
          n: number
          weekday: number
        }[]
      }
      create_booking: {
        Args: {
          p_amount: number
          p_court_id: string
          p_guest_name?: string
          p_guest_phone?: string
          p_notes?: string
          p_org_id: string
          p_paid?: boolean
          p_player_count: number
          p_profile_id?: string
          p_source?: string
          p_sport: string
          p_starts_at: string
          p_status?: string
        }
        Returns: Json
      }
      create_booking_shares: {
        Args: {
          p_booking_id: string
          p_provider: string
          p_share_count: number
        }
        Returns: Json
      }
      generate_api_key: {
        Args: {
          p_created_by: string
          p_expires_at: string
          p_name: string
          p_organization_id: string
          p_permissions: string[]
          p_rate_limit: number
        }
        Returns: {
          created_at: string
          id: string
          key: string
          name: string
          permissions: string[]
          prefix: string
        }[]
      }
      generate_check_in_code: { Args: { p_org_id: string }; Returns: string }
      generate_invite_token: { Args: never; Returns: string }
      get_sport_duration: { Args: { sport_type: string }; Returns: string }
      hard_delete_allowed: { Args: never; Returns: boolean }
      mark_booking_no_show: {
        Args: { p_booking_id: string; p_org_id: string }
        Returns: Json
      }
      mark_cash_paid: {
        Args: { p_booking_id: string; p_org_id: string }
        Returns: Json
      }
      org_is_approved: { Args: { p_org_id: string }; Returns: boolean }
      pay_booking_share: {
        Args: {
          p_payer_name?: string
          p_provider: string
          p_token_hash: string
        }
        Returns: Json
      }
      purge_bookings: { Args: { p_ids: string[] }; Returns: number }
      reassign_booking_court: {
        Args: { p_booking_id: string; p_court_id: string; p_org_id: string }
        Returns: Json
      }
      release_stale_bookings: {
        Args: {
          p_cutoff?: string
          p_grace?: string
          p_include_guest_cash?: boolean
          p_max_age?: string
        }
        Returns: {
          booking_id: string
          org_id: string
        }[]
      }
      restore_organization: { Args: { p_org_id: string }; Returns: Json }
      revoke_api_key: {
        Args: { p_key_id: string; p_organization_id: string }
        Returns: undefined
      }
      settle_booking_online: {
        Args: { p_booking_id: string; p_provider: string }
        Returns: Json
      }
      switch_active_organization: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: Json
      }
      user_has_verified_totp: { Args: never; Returns: boolean }
      user_org_id: { Args: never; Returns: string }
      user_role: { Args: never; Returns: string }
      verify_api_key: {
        Args: { input_key: string }
        Returns: {
          error: string
          organization_id: string
          permissions: string[]
          rate_limit: number
          valid: boolean
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
