export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_scope: string;
          attempt_id: string | null;
          created_at: string;
          event_id: string | null;
          id: string;
          operation_kind: string;
        };
        ComputedFields: never;
        Insert: {
          actor_scope: string;
          attempt_id?: string | null;
          created_at?: string;
          event_id?: string | null;
          id?: string;
          operation_kind: string;
        };
        Update: {
          actor_scope?: string;
          attempt_id?: string | null;
          created_at?: string;
          event_id?: string | null;
          id?: string;
          operation_kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_events_attempt_id_fkey';
            columns: ['attempt_id'];
            isOneToOne: false;
            referencedRelation: 'print_attempts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_events_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      additional_print_entries: {
        Row: {
          actor_id: string;
          created_at: string;
          event_id: string;
          id: string;
          quantity: number;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          created_at?: string;
          event_id: string;
          id?: string;
          quantity: number;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'additional_print_entries_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      admin_profiles: {
        Row: {
          id: string;
          phone: string | null;
          theme: string;
        };
        ComputedFields: never;
        Insert: {
          id: string;
          phone?: string | null;
          theme?: string;
        };
        Update: {
          id?: string;
          phone?: string | null;
          theme?: string;
        };
        Relationships: [];
      };
      booth_grants: {
        Row: {
          created_at: string;
          event_id: string;
          expires_at: string;
          id: string;
          revoked_at: string | null;
          run_id: string;
          secret_hash: string | null;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          expires_at: string;
          id?: string;
          revoked_at?: string | null;
          run_id: string;
          secret_hash?: string | null;
          state?: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          expires_at?: string;
          id?: string;
          revoked_at?: string | null;
          run_id?: string;
          secret_hash?: string | null;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'booth_grants_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booth_grants_run_id_event_id_fkey';
            columns: ['run_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'booth_runs';
            referencedColumns: ['id', 'event_id'];
          },
        ];
      };
      booth_runs: {
        Row: {
          created_at: string;
          ended_at: string | null;
          event_id: string;
          id: string;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          event_id: string;
          id?: string;
          state: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          event_id?: string;
          id?: string;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'booth_runs_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      captures: {
        Row: {
          captured_at: string;
          created_at: string;
          event_id: string;
          id: string;
          run_id: string;
          session_id: string;
        };
        ComputedFields: never;
        Insert: {
          captured_at: string;
          created_at?: string;
          event_id: string;
          id?: string;
          run_id: string;
          session_id: string;
        };
        Update: {
          captured_at?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          run_id?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'captures_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'captures_session_id_event_id_run_id_fkey';
            columns: ['session_id', 'event_id', 'run_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id', 'event_id', 'run_id'];
          },
        ];
      };
      events: {
        Row: {
          client_email: string | null;
          client_name: string | null;
          client_phone: string | null;
          deleted_at: string | null;
          ends_at: string | null;
          film_package_count: number;
          id: string;
          original_print_allowance: number;
          revision: number;
          starts_at: string | null;
          state: string;
          time_zone: string | null;
          title: string | null;
          venue_address: string | null;
        };
        ComputedFields: never;
        Insert: {
          client_email?: string | null;
          client_name?: string | null;
          client_phone?: string | null;
          deleted_at?: string | null;
          ends_at?: string | null;
          film_package_count: number;
          id?: string;
          original_print_allowance: number;
          revision?: number;
          starts_at?: string | null;
          state?: string;
          time_zone?: string | null;
          title?: string | null;
          venue_address?: string | null;
        };
        Update: {
          client_email?: string | null;
          client_name?: string | null;
          client_phone?: string | null;
          deleted_at?: string | null;
          ends_at?: string | null;
          film_package_count?: number;
          id?: string;
          original_print_allowance?: number;
          revision?: number;
          starts_at?: string | null;
          state?: string;
          time_zone?: string | null;
          title?: string | null;
          venue_address?: string | null;
        };
        Relationships: [];
      };
      film_stock_balance: {
        Row: {
          id: string;
          on_hand: number;
          revision: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          on_hand?: number;
          revision?: number;
        };
        Update: {
          id?: string;
          on_hand?: number;
          revision?: number;
        };
        Relationships: [];
      };
      film_stock_entries: {
        Row: {
          actor_scope: string;
          attempt_id: string | null;
          created_at: string;
          event_id: string | null;
          id: string;
          kind: string;
          observed_sheets: number | null;
          reason: string | null;
          signed_sheets: number;
        };
        ComputedFields: never;
        Insert: {
          actor_scope: string;
          attempt_id?: string | null;
          created_at?: string;
          event_id?: string | null;
          id?: string;
          kind: string;
          observed_sheets?: number | null;
          reason?: string | null;
          signed_sheets: number;
        };
        Update: {
          actor_scope?: string;
          attempt_id?: string | null;
          created_at?: string;
          event_id?: string | null;
          id?: string;
          kind?: string;
          observed_sheets?: number | null;
          reason?: string | null;
          signed_sheets?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'film_stock_entries_attempt_id_event_id_fkey';
            columns: ['attempt_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'print_attempts';
            referencedColumns: ['id', 'event_id'];
          },
          {
            foreignKeyName: 'film_stock_entries_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      guest_sessions: {
        Row: {
          closed_at: string | null;
          created_at: string;
          event_id: string;
          id: string;
          run_id: string;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          event_id: string;
          id?: string;
          run_id: string;
          state?: string;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          event_id?: string;
          id?: string;
          run_id?: string;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_sessions_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_sessions_run_id_event_id_fkey';
            columns: ['run_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'booth_runs';
            referencedColumns: ['id', 'event_id'];
          },
        ];
      };
      operation_receipts: {
        Row: {
          actor_scope: string;
          created_at: string;
          event_id: string | null;
          id: string;
          input_digest: string;
          operation_key: string;
          operation_kind: string;
          result: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          actor_scope: string;
          created_at?: string;
          event_id?: string | null;
          id?: string;
          input_digest: string;
          operation_key: string;
          operation_kind: string;
          result: NonNullable<Json>;
        };
        Update: {
          actor_scope?: string;
          created_at?: string;
          event_id?: string | null;
          id?: string;
          input_digest?: string;
          operation_key?: string;
          operation_kind?: string;
          result?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'operation_receipts_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      print_attempt_events: {
        Row: {
          actor_scope: string;
          attempt_id: string;
          created_at: string;
          evidence_kind: string | null;
          id: string;
          reason: string | null;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          actor_scope: string;
          attempt_id: string;
          created_at?: string;
          evidence_kind?: string | null;
          id?: string;
          reason?: string | null;
          state: string;
        };
        Update: {
          actor_scope?: string;
          attempt_id?: string;
          created_at?: string;
          evidence_kind?: string | null;
          id?: string;
          reason?: string | null;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'print_attempt_events_attempt_id_fkey';
            columns: ['attempt_id'];
            isOneToOne: false;
            referencedRelation: 'print_attempts';
            referencedColumns: ['id'];
          },
        ];
      };
      print_attempts: {
        Row: {
          accepted_at: string | null;
          capture_id: string | null;
          connection_id: string;
          created_at: string;
          event_id: string;
          id: string;
          kind: string;
          request_key: string;
          resolved_at: string | null;
          run_id: string | null;
          session_id: string | null;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          capture_id?: string | null;
          connection_id: string;
          created_at?: string;
          event_id: string;
          id?: string;
          kind: string;
          request_key: string;
          resolved_at?: string | null;
          run_id?: string | null;
          session_id?: string | null;
          state?: string;
        };
        Update: {
          accepted_at?: string | null;
          capture_id?: string | null;
          connection_id?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          kind?: string;
          request_key?: string;
          resolved_at?: string | null;
          run_id?: string | null;
          session_id?: string | null;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'print_attempts_capture_id_session_id_event_id_run_id_fkey';
            columns: ['capture_id', 'session_id', 'event_id', 'run_id'];
            isOneToOne: false;
            referencedRelation: 'captures';
            referencedColumns: ['id', 'session_id', 'event_id', 'run_id'];
          },
          {
            foreignKeyName: 'print_attempts_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
