export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      activity_events: {
        Row: {
          accounting_version: number;
          actor_scope: string;
          attempt_id: string | null;
          created_at: string;
          event_id: string | null;
          id: string;
          operation_kind: string;
        };
        ComputedFields: never;
        Insert: {
          accounting_version?: number;
          actor_scope: string;
          attempt_id?: string | null;
          created_at?: string;
          event_id?: string | null;
          id?: string;
          operation_kind: string;
        };
        Update: {
          accounting_version?: number;
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
      additional_film_package_entries: {
        Row: {
          accounting_version: number;
          actor_id: string;
          client_request_note: string;
          created_at: string;
          event_id: string;
          id: string;
          operation_key: string;
          packages: number;
        };
        ComputedFields: never;
        Insert: {
          accounting_version?: number;
          actor_id: string;
          client_request_note: string;
          created_at?: string;
          event_id: string;
          id?: string;
          operation_key: string;
          packages: number;
        };
        Update: {
          accounting_version?: number;
          actor_id?: string;
          client_request_note?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          operation_key?: string;
          packages?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'additional_film_package_entries_event_id_fkey';
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
          accounting_version: number;
          capabilities: string[];
          created_at: string;
          device_hash: string | null;
          event_id: string;
          expires_at: string;
          id: string;
          last_seen_at: string;
          revoked_at: string | null;
          run_id: string;
          secret_hash: string | null;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          accounting_version?: number;
          capabilities?: string[];
          created_at?: string;
          device_hash?: string | null;
          event_id: string;
          expires_at: string;
          id?: string;
          last_seen_at?: string;
          revoked_at?: string | null;
          run_id: string;
          secret_hash?: string | null;
          state?: string;
        };
        Update: {
          accounting_version?: number;
          capabilities?: string[];
          created_at?: string;
          device_hash?: string | null;
          event_id?: string;
          expires_at?: string;
          id?: string;
          last_seen_at?: string;
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
      booth_handoffs: {
        Row: {
          accounting_version: number;
          admin_session_id: string;
          admin_user_id: string;
          created_at: string;
          device_token_hash: string;
          event_id: string;
          expires_at: string;
          grant_id: string;
          id: string;
          run_id: string;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          accounting_version?: number;
          admin_session_id: string;
          admin_user_id: string;
          created_at?: string;
          device_token_hash: string;
          event_id: string;
          expires_at: string;
          grant_id: string;
          id?: string;
          run_id: string;
          state?: string;
        };
        Update: {
          accounting_version?: number;
          admin_session_id?: string;
          admin_user_id?: string;
          created_at?: string;
          device_token_hash?: string;
          event_id?: string;
          expires_at?: string;
          grant_id?: string;
          id?: string;
          run_id?: string;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'booth_handoffs_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booth_handoffs_grant_id_fkey';
            columns: ['grant_id'];
            isOneToOne: true;
            referencedRelation: 'booth_grants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booth_handoffs_run_id_event_id_fkey';
            columns: ['run_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'booth_runs';
            referencedColumns: ['id', 'event_id'];
          },
        ];
      };
      booth_reload_requests: {
        Row: {
          accounting_version: number;
          confirmation_source: string | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          connection_generation: number;
          created_at: string;
          event_id: string;
          id: string;
          printer_id: string;
          revision: number;
          run_id: string;
          state: string;
          trigger: string;
        };
        ComputedFields: never;
        Insert: {
          accounting_version?: number;
          confirmation_source?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          connection_generation: number;
          created_at?: string;
          event_id: string;
          id?: string;
          printer_id: string;
          revision?: number;
          run_id: string;
          state?: string;
          trigger: string;
        };
        Update: {
          accounting_version?: number;
          confirmation_source?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          connection_generation?: number;
          created_at?: string;
          event_id?: string;
          id?: string;
          printer_id?: string;
          revision?: number;
          run_id?: string;
          state?: string;
          trigger?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'booth_reload_requests_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booth_reload_requests_run_id_event_id_fkey';
            columns: ['run_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'booth_runs';
            referencedColumns: ['id', 'event_id'];
          },
        ];
      };
      booth_runs: {
        Row: {
          accounting_version: number;
          blockers: string[];
          connection_generation: number;
          connection_id: string | null;
          created_at: string;
          device_hash: string | null;
          ended_at: string | null;
          event_id: string;
          film_loaded_confirmed: boolean;
          finish_requested_at: string | null;
          finished_at: string | null;
          guided_access_confirmed: boolean;
          id: string;
          observed_at: string | null;
          power_confirmed: boolean;
          printer_id: string | null;
          readiness_observation: NonNullable<Json>;
          received_at: string | null;
          revision: number;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          accounting_version?: number;
          blockers?: string[];
          connection_generation?: number;
          connection_id?: string | null;
          created_at?: string;
          device_hash?: string | null;
          ended_at?: string | null;
          event_id: string;
          film_loaded_confirmed?: boolean;
          finish_requested_at?: string | null;
          finished_at?: string | null;
          guided_access_confirmed?: boolean;
          id?: string;
          observed_at?: string | null;
          power_confirmed?: boolean;
          printer_id?: string | null;
          readiness_observation?: NonNullable<Json>;
          received_at?: string | null;
          revision?: number;
          state: string;
        };
        Update: {
          accounting_version?: number;
          blockers?: string[];
          connection_generation?: number;
          connection_id?: string | null;
          created_at?: string;
          device_hash?: string | null;
          ended_at?: string | null;
          event_id?: string;
          film_loaded_confirmed?: boolean;
          finish_requested_at?: string | null;
          finished_at?: string | null;
          guided_access_confirmed?: boolean;
          id?: string;
          observed_at?: string | null;
          power_confirmed?: boolean;
          printer_id?: string | null;
          readiness_observation?: NonNullable<Json>;
          received_at?: string | null;
          revision?: number;
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
          accounting_version: number;
          captured_at: string;
          created_at: string;
          event_id: string;
          id: string;
          reported_after_stop: boolean;
          run_id: string;
          session_id: string;
          shutter_operation_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          accounting_version?: number;
          captured_at: string;
          created_at?: string;
          event_id: string;
          id?: string;
          reported_after_stop?: boolean;
          run_id: string;
          session_id: string;
          shutter_operation_id?: string | null;
        };
        Update: {
          accounting_version?: number;
          captured_at?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          reported_after_stop?: boolean;
          run_id?: string;
          session_id?: string;
          shutter_operation_id?: string | null;
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
          accounting_version: number;
          booking_review_required: boolean;
          client_email: string | null;
          client_name: string | null;
          client_phone: string | null;
          deleted_at: string | null;
          ends_at: string | null;
          film_package_count: number;
          id: string;
          media_removal_state: string;
          original_print_allowance: number | null;
          redacted_at: string | null;
          revision: number;
          starts_at: string | null;
          state: string;
          time_zone: string | null;
          title: string | null;
          venue_address: string | null;
        };
        ComputedFields: never;
        Insert: {
          accounting_version?: number;
          booking_review_required?: boolean;
          client_email?: string | null;
          client_name?: string | null;
          client_phone?: string | null;
          deleted_at?: string | null;
          ends_at?: string | null;
          film_package_count: number;
          id?: string;
          media_removal_state?: string;
          original_print_allowance?: number | null;
          redacted_at?: string | null;
          revision?: number;
          starts_at?: string | null;
          state?: string;
          time_zone?: string | null;
          title?: string | null;
          venue_address?: string | null;
        };
        Update: {
          accounting_version?: number;
          booking_review_required?: boolean;
          client_email?: string | null;
          client_name?: string | null;
          client_phone?: string | null;
          deleted_at?: string | null;
          ends_at?: string | null;
          film_package_count?: number;
          id?: string;
          media_removal_state?: string;
          original_print_allowance?: number | null;
          redacted_at?: string | null;
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
          accounting_version: number;
          closed_at: string | null;
          created_at: string;
          event_id: string;
          id: string;
          run_id: string;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          accounting_version?: number;
          closed_at?: string | null;
          created_at?: string;
          event_id: string;
          id?: string;
          run_id: string;
          state?: string;
        };
        Update: {
          accounting_version?: number;
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
          accounting_version: number;
          actor_scope: string;
          committed_revision: number | null;
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
          accounting_version?: number;
          actor_scope: string;
          committed_revision?: number | null;
          created_at?: string;
          event_id?: string | null;
          id?: string;
          input_digest: string;
          operation_key: string;
          operation_kind: string;
          result: NonNullable<Json>;
        };
        Update: {
          accounting_version?: number;
          actor_scope?: string;
          committed_revision?: number | null;
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
          accounting_version: number;
          actor_id: string | null;
          actor_scope: string;
          attempt_id: string;
          created_at: string;
          evidence_kind: string | null;
          evidence_policy_version: string | null;
          id: string;
          observed_at: string | null;
          reason: string | null;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          accounting_version?: number;
          actor_id?: string | null;
          actor_scope: string;
          attempt_id: string;
          created_at?: string;
          evidence_kind?: string | null;
          evidence_policy_version?: string | null;
          id?: string;
          observed_at?: string | null;
          reason?: string | null;
          state: string;
        };
        Update: {
          accounting_version?: number;
          actor_id?: string | null;
          actor_scope?: string;
          attempt_id?: string;
          created_at?: string;
          evidence_kind?: string | null;
          evidence_policy_version?: string | null;
          id?: string;
          observed_at?: string | null;
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
          accounting_version: number;
          capture_id: string | null;
          connection_generation: number | null;
          connection_id: string;
          created_at: string;
          dispatch_id: string | null;
          dispatched_at: string | null;
          event_id: string;
          evidence_policy_version: string | null;
          id: string;
          initiating_admin_session_id: string | null;
          kind: string;
          printer_id: string | null;
          request_key: string;
          resolved_at: string | null;
          run_id: string | null;
          session_id: string | null;
          state: string;
          test_output_usable: boolean | null;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accounting_version?: number;
          capture_id?: string | null;
          connection_generation?: number | null;
          connection_id: string;
          created_at?: string;
          dispatch_id?: string | null;
          dispatched_at?: string | null;
          event_id: string;
          evidence_policy_version?: string | null;
          id?: string;
          initiating_admin_session_id?: string | null;
          kind: string;
          printer_id?: string | null;
          request_key: string;
          resolved_at?: string | null;
          run_id?: string | null;
          session_id?: string | null;
          state?: string;
          test_output_usable?: boolean | null;
        };
        Update: {
          accepted_at?: string | null;
          accounting_version?: number;
          capture_id?: string | null;
          connection_generation?: number | null;
          connection_id?: string;
          created_at?: string;
          dispatch_id?: string | null;
          dispatched_at?: string | null;
          event_id?: string;
          evidence_policy_version?: string | null;
          id?: string;
          initiating_admin_session_id?: string | null;
          kind?: string;
          printer_id?: string | null;
          request_key?: string;
          resolved_at?: string | null;
          run_id?: string | null;
          session_id?: string | null;
          state?: string;
          test_output_usable?: boolean | null;
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
      printer_completion_policy: {
        Row: {
          id: boolean;
          mode: string;
        };
        ComputedFields: never;
        Insert: {
          id?: boolean;
          mode?: string;
        };
        Update: {
          id?: boolean;
          mode?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      abandon_guest_session: {
        Args: { grant_hash: string; operation_key: string; session_id: string };
        Returns: Json;
      };
      add_event_prints: {
        Args: {
          admin_session_id: string;
          admin_user_id: string;
          event_id: string;
          operation_key: string;
          quantity: number;
        };
        Returns: Json;
      };
      add_film_stock: {
        Args: {
          admin_session_id: string;
          admin_user_id: string;
          operation_key: string;
          reason: string;
          sheets: number;
        };
        Returns: Json;
      };
      begin_event_redaction: {
        Args: {
          action: string;
          admin_session_id: string;
          admin_user_id: string;
          event_id: string;
          expected_revision: number;
          operation_key: string;
          replacement_title?: string;
        };
        Returns: Json;
      };
      change_event_run: {
        Args: {
          action: string;
          admin_session_id: string;
          admin_user_id: string;
          event_id: string;
          expected_revision: number;
          operation_key: string;
        };
        Returns: Json;
      };
      complete_event_redaction: {
        Args: {
          admin_session_id: string;
          admin_user_id: string;
          event_id: string;
          operation_key: string;
        };
        Returns: Json;
      };
      confirm_booth_handoff: {
        Args: { grant_hash: string; handoff_id: string; operation_key: string };
        Returns: Json;
      };
      confirm_test_output: {
        Args: {
          admin_session_id: string;
          admin_user_id: string;
          attempt_id: string;
          operation_key: string;
          usable: boolean;
        };
        Returns: Json;
      };
      finish_booth_handoff: {
        Args: {
          device_token_hash: string;
          expires_at: string;
          grant_hash: string;
          handoff_id: string;
          operation_key: string;
        };
        Returns: Json;
      };
      mark_wasted_film: {
        Args: {
          admin_session_id: string;
          admin_user_id: string;
          attempt_id: string;
          operation_key: string;
          reason: string;
        };
        Returns: Json;
      };
      open_guest_session: {
        Args: { grant_hash: string; operation_key: string; run_id: string };
        Returns: Json;
      };
      pause_booth_for_reconnect: {
        Args: { grant_hash: string; operation_key: string; run_id: string };
        Returns: Json;
      };
      prepare_booth_handoff: {
        Args: {
          admin_session_id: string;
          admin_user_id: string;
          connection_id: string;
          event_id: string;
          expected_revision: number;
          operation_key: string;
          setup_evidence: Json;
        };
        Returns: Json;
      };
      reconcile_film_stock: {
        Args: {
          admin_session_id: string;
          admin_user_id: string;
          observed_sheets: number;
          operation_key: string;
          reason: string;
        };
        Returns: Json;
      };
      record_capture: {
        Args: {
          captured_at: string;
          grant_hash: string;
          operation_key: string;
          session_id: string;
        };
        Returns: Json;
      };
      recover_interrupted_print: {
        Args: {
          admin_session_id: string;
          admin_user_id: string;
          attempt_id: string;
          operation_key: string;
          reason: string;
        };
        Returns: Json;
      };
      report_booth_observation: {
        Args: {
          attempt_id: string;
          evidence_code: string;
          grant_hash: string;
          observation_kind: string;
          observed_at: string;
          operation_key: string;
        };
        Returns: Json;
      };
      report_test_observation: {
        Args: {
          admin_session_id: string;
          admin_user_id: string;
          attempt_id: string;
          evidence_code: string;
          observation_kind: string;
          observed_at: string;
          operation_key: string;
        };
        Returns: Json;
      };
      request_booth_pause: {
        Args: { grant_hash: string; operation_key: string; run_id: string };
        Returns: Json;
      };
      reserve_guest_attempt: {
        Args: {
          capture_id: string;
          grant_hash: string;
          operation_key: string;
          run_id: string;
          session_id: string;
        };
        Returns: Json;
      };
      reserve_test_attempt: {
        Args: {
          admin_session_id: string;
          admin_user_id: string;
          connection_id: string;
          event_id: string;
          operation_key: string;
        };
        Returns: Json;
      };
      resolve_uncertain_print: {
        Args: {
          admin_session_id: string;
          admin_user_id: string;
          attempt_id: string;
          inspection_reason: string;
          operation_key: string;
          outcome: string;
        };
        Returns: Json;
      };
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
