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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          branch_id: string | null
          changes: Json
          company_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          ip: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          branch_id?: string | null
          changes?: Json
          company_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: number
          ip?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          branch_id?: string | null
          changes?: Json
          company_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: number
          ip?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      caja_admin_pin: {
        Row: {
          company_id: string
          created_at: string
          id: string
          pin_hash: string
          updated_at: string
          updated_by: string | null
          updated_by_email: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          pin_hash: string
          updated_at?: string
          updated_by?: string | null
          updated_by_email?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          pin_hash?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_admin_pin_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      caja_documentos: {
        Row: {
          branch_id: string | null
          caja_codigo: string
          clave_acceso: string | null
          cliente_email: string | null
          cliente_identificacion: string | null
          cliente_nombre: string | null
          company_id: string
          created_at: string
          doc_number: string
          doc_relacionado: string | null
          estado_sri: string
          fecha_autorizacion: string | null
          fecha_emision: string
          forma_pago: string | null
          id: string
          items: Json
          iva: number
          mensajes_sri: string | null
          mesa: string | null
          mesero: string | null
          numero_autorizacion: string | null
          orden_numero: number | null
          order_id: string | null
          subtotal: number
          tipo: string
          total: number
          updated_at: string
          xml_firmado: string | null
        }
        Insert: {
          branch_id?: string | null
          caja_codigo: string
          clave_acceso?: string | null
          cliente_email?: string | null
          cliente_identificacion?: string | null
          cliente_nombre?: string | null
          company_id?: string
          created_at?: string
          doc_number: string
          doc_relacionado?: string | null
          estado_sri?: string
          fecha_autorizacion?: string | null
          fecha_emision?: string
          forma_pago?: string | null
          id?: string
          items?: Json
          iva?: number
          mensajes_sri?: string | null
          mesa?: string | null
          mesero?: string | null
          numero_autorizacion?: string | null
          orden_numero?: number | null
          order_id?: string | null
          subtotal?: number
          tipo?: string
          total?: number
          updated_at?: string
          xml_firmado?: string | null
        }
        Update: {
          branch_id?: string | null
          caja_codigo?: string
          clave_acceso?: string | null
          cliente_email?: string | null
          cliente_identificacion?: string | null
          cliente_nombre?: string | null
          company_id?: string
          created_at?: string
          doc_number?: string
          doc_relacionado?: string | null
          estado_sri?: string
          fecha_autorizacion?: string | null
          fecha_emision?: string
          forma_pago?: string | null
          id?: string
          items?: Json
          iva?: number
          mensajes_sri?: string | null
          mesa?: string | null
          mesero?: string | null
          numero_autorizacion?: string | null
          orden_numero?: number | null
          order_id?: string | null
          subtotal?: number
          tipo?: string
          total?: number
          updated_at?: string
          xml_firmado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_documentos_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_documentos_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_documentos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      caja_totales_diarios: {
        Row: {
          branch_id: string | null
          caja_codigo: string
          company_id: string
          created_at: string
          fecha: string
          formas_pago: Json
          id: string
          transacciones: number
          updated_at: string
          ventas: number
        }
        Insert: {
          branch_id?: string | null
          caja_codigo: string
          company_id?: string
          created_at?: string
          fecha: string
          formas_pago?: Json
          id?: string
          transacciones?: number
          updated_at?: string
          ventas?: number
        }
        Update: {
          branch_id?: string | null
          caja_codigo?: string
          company_id?: string
          created_at?: string
          fecha?: string
          formas_pago?: Json
          id?: string
          transacciones?: number
          updated_at?: string
          ventas?: number
        }
        Relationships: [
          {
            foreignKeyName: "caja_totales_diarios_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_totales_diarios_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          activa: boolean
          branch_id: string | null
          codigo: string
          company_id: string
          created_at: string
          emission_point: string
          establishment: string
          id: string
          last_seen_at: string | null
          local: string
          nombre: string
          sync_key: string
          tipo_local: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          branch_id?: string | null
          codigo: string
          company_id?: string
          created_at?: string
          emission_point?: string
          establishment?: string
          id?: string
          last_seen_at?: string | null
          local?: string
          nombre?: string
          sync_key: string
          tipo_local?: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          branch_id?: string | null
          codigo?: string
          company_id?: string
          created_at?: string
          emission_point?: string
          establishment?: string
          id?: string
          last_seen_at?: string | null
          local?: string
          nombre?: string
          sync_key?: string
          tipo_local?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cajas_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cajas_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_closures: {
        Row: {
          branch_id: string | null
          business_date: string
          closure_type: string
          company_id: string
          counted_card: number
          counted_cash: number
          counted_other: number
          counted_total: number
          counted_transfer: number
          counted_voucher: number
          created_at: string
          difference: number
          expected_total: number
          id: string
          iva_rate: number
          notes: string | null
          opening_float: number
          period_end: string
          period_start: string
          reopened_at: string | null
          reopened_by: string | null
          reopened_by_email: string | null
          shift: string
          subtotal: number
          system_card: number
          system_cash: number
          system_other: number
          system_transfer: number
          system_voucher: number
          tax_amount: number
          tickets_count: number
          total: number
          updated_at: string
          user_email: string
          user_id: string | null
          voided_count: number
          voided_total: number
        }
        Insert: {
          branch_id?: string | null
          business_date?: string
          closure_type?: string
          company_id?: string
          counted_card?: number
          counted_cash?: number
          counted_other?: number
          counted_total?: number
          counted_transfer?: number
          counted_voucher?: number
          created_at?: string
          difference?: number
          expected_total?: number
          id?: string
          iva_rate?: number
          notes?: string | null
          opening_float?: number
          period_end: string
          period_start: string
          reopened_at?: string | null
          reopened_by?: string | null
          reopened_by_email?: string | null
          shift?: string
          subtotal?: number
          system_card?: number
          system_cash?: number
          system_other?: number
          system_transfer?: number
          system_voucher?: number
          tax_amount?: number
          tickets_count?: number
          total?: number
          updated_at?: string
          user_email?: string
          user_id?: string | null
          voided_count?: number
          voided_total?: number
        }
        Update: {
          branch_id?: string | null
          business_date?: string
          closure_type?: string
          company_id?: string
          counted_card?: number
          counted_cash?: number
          counted_other?: number
          counted_total?: number
          counted_transfer?: number
          counted_voucher?: number
          created_at?: string
          difference?: number
          expected_total?: number
          id?: string
          iva_rate?: number
          notes?: string | null
          opening_float?: number
          period_end?: string
          period_start?: string
          reopened_at?: string | null
          reopened_by?: string | null
          reopened_by_email?: string | null
          shift?: string
          subtotal?: number
          system_card?: number
          system_cash?: number
          system_other?: number
          system_transfer?: number
          system_voucher?: number
          tax_amount?: number
          tickets_count?: number
          total?: number
          updated_at?: string
          user_email?: string
          user_id?: string | null
          voided_count?: number
          voided_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_closures_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closures_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow_manual: {
        Row: {
          branch_id: string | null
          business_date: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          other_expense: number
          other_income: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          business_date: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          other_expense?: number
          other_income?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          business_date?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          other_expense?: number
          other_income?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_manual_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_manual_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          kind: string
          name: string
          sort_order: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_modules: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean
          id: string
          module_key: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          module_key: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          module_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          accounting_required: boolean
          address: string
          branch_address: string
          business_name: string
          company_id: string
          created_at: string
          email: string
          emission_point: string
          emission_type: string
          environment: string
          establishment: string
          id: string
          iva_rate: number
          logo_url: string | null
          monthly_goal: number
          next_sequential: number
          operation_mode: string
          phone: string
          prep_limit_domicilio: number
          prep_limit_llevar: number
          prep_limit_mesa: number
          prep_limit_minutes: number
          printer_copies: number
          printer_grill: string
          printer_kitchen: string
          printer_pos: string
          ruc: string
          service_charge_rate: number
          setup_completed: boolean
          special_taxpayer: string | null
          tax_regime: string
          trade_name: string
          updated_at: string
        }
        Insert: {
          accounting_required?: boolean
          address?: string
          branch_address?: string
          business_name?: string
          company_id?: string
          created_at?: string
          email?: string
          emission_point?: string
          emission_type?: string
          environment?: string
          establishment?: string
          id?: string
          iva_rate?: number
          logo_url?: string | null
          monthly_goal?: number
          next_sequential?: number
          operation_mode?: string
          phone?: string
          prep_limit_domicilio?: number
          prep_limit_llevar?: number
          prep_limit_mesa?: number
          prep_limit_minutes?: number
          printer_copies?: number
          printer_grill?: string
          printer_kitchen?: string
          printer_pos?: string
          ruc?: string
          service_charge_rate?: number
          setup_completed?: boolean
          special_taxpayer?: string | null
          tax_regime?: string
          trade_name?: string
          updated_at?: string
        }
        Update: {
          accounting_required?: boolean
          address?: string
          branch_address?: string
          business_name?: string
          company_id?: string
          created_at?: string
          email?: string
          emission_point?: string
          emission_type?: string
          environment?: string
          establishment?: string
          id?: string
          iva_rate?: number
          logo_url?: string | null
          monthly_goal?: number
          next_sequential?: number
          operation_mode?: string
          phone?: string
          prep_limit_domicilio?: number
          prep_limit_llevar?: number
          prep_limit_mesa?: number
          prep_limit_minutes?: number
          printer_copies?: number
          printer_grill?: string
          printer_kitchen?: string
          printer_pos?: string
          ruc?: string
          service_charge_rate?: number
          setup_completed?: boolean
          special_taxpayer?: string | null
          tax_regime?: string
          trade_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings_audit: {
        Row: {
          changes: Json
          company_id: string
          created_at: string
          id: string
          ip: string | null
          settings_id: string | null
          updated_at: string
          user_agent: string | null
          user_email: string
          user_id: string | null
          user_role: string
        }
        Insert: {
          changes?: Json
          company_id?: string
          created_at?: string
          id?: string
          ip?: string | null
          settings_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_email?: string
          user_id?: string | null
          user_role?: string
        }
        Update: {
          changes?: Json
          company_id?: string
          created_at?: string
          id?: string
          ip?: string | null
          settings_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_email?: string
          user_id?: string | null
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_audit_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_signature: {
        Row: {
          company_id: string
          created_at: string
          id: string
          p12_password: string | null
          p12_path: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          p12_password?: string | null
          p12_path?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          p12_password?: string | null
          p12_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_signature_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_users: {
        Row: {
          active: boolean
          branch_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_company_owner: boolean
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          branch_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_company_owner?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          branch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_company_owner?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          id_number: string
          id_type: string
          name: string
          notes: string | null
          phone: string | null
          privacy_accepted: boolean
          tax_regime: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          id_number: string
          id_type?: string
          name: string
          notes?: string | null
          phone?: string | null
          privacy_accepted?: boolean
          tax_regime?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          id_number?: string
          id_type?: string
          name?: string
          notes?: string | null
          phone?: string | null
          privacy_accepted?: boolean
          tax_regime?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_actions: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          detail: string
          evidence_url: string | null
          id: string
          kind: string
          response_note: string | null
          status: string
          target_chat_id: string | null
          target_role: string
          telegram_message_id: number | null
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          detail?: string
          evidence_url?: string | null
          id?: string
          kind: string
          response_note?: string | null
          status?: string
          target_chat_id?: string | null
          target_role?: string
          telegram_message_id?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          detail?: string
          evidence_url?: string | null
          id?: string
          kind?: string
          response_note?: string | null
          status?: string
          target_chat_id?: string | null
          target_role?: string
          telegram_message_id?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_actions_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      delay_logs: {
        Row: {
          actual_minutes: number
          area: string
          branch_id: string | null
          company_id: string
          created_at: string
          delivered_at: string
          folio: number
          guests: number
          id: string
          items_summary: string
          limit_minutes: number
          notes: string | null
          order_id: string | null
          over_minutes: number
          service_type: string
          started_at: string
          table_id: string | null
          table_name: string
          total: number
          updated_at: string
        }
        Insert: {
          actual_minutes?: number
          area?: string
          branch_id?: string | null
          company_id?: string
          created_at?: string
          delivered_at?: string
          folio?: number
          guests?: number
          id?: string
          items_summary?: string
          limit_minutes?: number
          notes?: string | null
          order_id?: string | null
          over_minutes?: number
          service_type?: string
          started_at?: string
          table_id?: string | null
          table_name?: string
          total?: number
          updated_at?: string
        }
        Update: {
          actual_minutes?: number
          area?: string
          branch_id?: string | null
          company_id?: string
          created_at?: string
          delivered_at?: string
          folio?: number
          guests?: number
          id?: string
          items_summary?: string
          limit_minutes?: number
          notes?: string | null
          order_id?: string | null
          over_minutes?: number
          service_type?: string
          started_at?: string
          table_id?: string | null
          table_name?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delay_logs_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delay_logs_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delay_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          block_size: number
          company_id: string
          doc_type: string
          emission_point: string
          establishment: string
          next_sequential: number
          updated_at: string
        }
        Insert: {
          block_size?: number
          company_id?: string
          doc_type: string
          emission_point?: string
          establishment: string
          next_sequential?: number
          updated_at?: string
        }
        Update: {
          block_size?: number
          company_id?: string
          doc_type?: string
          emission_point?: string
          establishment?: string
          next_sequential?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          base_amount: number
          branch_id: string | null
          business_date: string
          category_id: string | null
          category_name: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          doc_type: string
          document_number: string
          due_date: string | null
          id: string
          iva_rate: number
          notes: string | null
          paid: boolean
          paid_at: string | null
          payment_method: string
          supplier_id: string | null
          supplier_id_number: string | null
          supplier_name: string
          tax_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          base_amount?: number
          branch_id?: string | null
          business_date?: string
          category_id?: string | null
          category_name?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          doc_type?: string
          document_number?: string
          due_date?: string | null
          id?: string
          iva_rate?: number
          notes?: string | null
          paid?: boolean
          paid_at?: string | null
          payment_method?: string
          supplier_id?: string | null
          supplier_id_number?: string | null
          supplier_name?: string
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          base_amount?: number
          branch_id?: string | null
          business_date?: string
          category_id?: string | null
          category_name?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          doc_type?: string
          document_number?: string
          due_date?: string | null
          id?: string
          iva_rate?: number
          notes?: string | null
          paid?: boolean
          paid_at?: string | null
          payment_method?: string
          supplier_id?: string | null
          supplier_id_number?: string | null
          supplier_name?: string
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_categories: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_categories_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_day_closures: {
        Row: {
          branch_id: string | null
          business_date: string
          closed_by: string | null
          closed_by_email: string | null
          company_id: string
          created_at: string
          id: string
          items_count: number
          notes: string | null
          total_value: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          business_date: string
          closed_by?: string | null
          closed_by_email?: string | null
          company_id?: string
          created_at?: string
          id?: string
          items_count?: number
          notes?: string | null
          total_value?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          business_date?: string
          closed_by?: string | null
          closed_by_email?: string | null
          company_id?: string
          created_at?: string
          id?: string
          items_count?: number
          notes?: string | null
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_day_closures_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_day_closures_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          active: boolean
          branch_id: string | null
          category: string
          category_id: string | null
          code: string | null
          company_id: string
          control_frequency: string
          cost_per_recipe_unit: number
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          inventory_to_recipe: number
          last_purchase_at: string | null
          last_purchase_unit_cost: number
          location: string | null
          min_stock: number
          name: string
          notes: string | null
          purchase_to_inventory: number
          purchase_unit: string
          recipe_unit: string
          stock: number
          supplier_id: string | null
          tax_treatment: string
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          branch_id?: string | null
          category?: string
          category_id?: string | null
          code?: string | null
          company_id?: string
          control_frequency?: string
          cost_per_recipe_unit?: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          inventory_to_recipe?: number
          last_purchase_at?: string | null
          last_purchase_unit_cost?: number
          location?: string | null
          min_stock?: number
          name: string
          notes?: string | null
          purchase_to_inventory?: number
          purchase_unit?: string
          recipe_unit?: string
          stock?: number
          supplier_id?: string | null
          tax_treatment?: string
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          branch_id?: string | null
          category?: string
          category_id?: string | null
          code?: string | null
          company_id?: string
          control_frequency?: string
          cost_per_recipe_unit?: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          inventory_to_recipe?: number
          last_purchase_at?: string | null
          last_purchase_unit_cost?: number
          location?: string | null
          min_stock?: number
          name?: string
          notes?: string | null
          purchase_to_inventory?: number
          purchase_unit?: string
          recipe_unit?: string
          stock?: number
          supplier_id?: string | null
          tax_treatment?: string
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          branch_id: string | null
          business_date: string
          category: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_email: string | null
          edited_at: string | null
          edited_by: string | null
          edited_by_email: string | null
          id: string
          item_code: string | null
          item_id: string
          item_name: string
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          production_entry_id: string | null
          quantity: number
          reason: string | null
          total_value: number
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          business_date?: string
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_email?: string | null
          edited_at?: string | null
          edited_by?: string | null
          edited_by_email?: string | null
          id?: string
          item_code?: string | null
          item_id: string
          item_name: string
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          production_entry_id?: string | null
          quantity: number
          reason?: string | null
          total_value?: number
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          business_date?: string
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_email?: string | null
          edited_at?: string | null
          edited_by?: string | null
          edited_by_email?: string | null
          id?: string
          item_code?: string | null
          item_id?: string
          item_name?: string
          movement_type?: Database["public"]["Enums"]["inventory_movement_type"]
          production_entry_id?: string | null
          quantity?: number
          reason?: string | null
          total_value?: number
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_opening_balances: {
        Row: {
          branch_id: string | null
          business_date: string
          company_id: string
          created_at: string
          id: string
          item_id: string
          quantity: number
          total_value: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          business_date: string
          company_id?: string
          created_at?: string
          id?: string
          item_id: string
          quantity?: number
          total_value?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          business_date?: string
          company_id?: string
          created_at?: string
          id?: string
          item_id?: string
          quantity?: number
          total_value?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_opening_balances_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_opening_balances_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_opening_balances_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_physical_counts: {
        Row: {
          branch_id: string | null
          business_date: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          quantity: number
          total_value: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          business_date: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          quantity?: number
          total_value?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          business_date?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          quantity?: number
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_physical_counts_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_physical_counts_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_physical_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_cost_history: {
        Row: {
          branch_id: string | null
          company_id: string
          cost_per_inventory_unit: number
          cost_per_recipe_unit: number
          created_at: string
          id: string
          inventory_unit: string
          item_id: string
          item_name: string
          purchase_id: string | null
          purchase_unit: string
          purchase_unit_cost: number
          quantity_inventory: number
          quantity_purchase: number
          recipe_unit: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          company_id?: string
          cost_per_inventory_unit?: number
          cost_per_recipe_unit?: number
          created_at?: string
          id?: string
          inventory_unit?: string
          item_id: string
          item_name?: string
          purchase_id?: string | null
          purchase_unit?: string
          purchase_unit_cost?: number
          quantity_inventory?: number
          quantity_purchase?: number
          recipe_unit?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          cost_per_inventory_unit?: number
          cost_per_recipe_unit?: number
          created_at?: string
          id?: string
          inventory_unit?: string
          item_id?: string
          item_name?: string
          purchase_id?: string | null
          purchase_unit?: string
          purchase_unit_cost?: number
          quantity_inventory?: number
          quantity_purchase?: number
          recipe_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_cost_history_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_cost_history_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_cost_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_cost_history_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      login_sessions: {
        Row: {
          city: string | null
          company_id: string
          concurrent: boolean
          country: string | null
          created_at: string
          device_id: string
          device_label: string
          id: string
          ip: string | null
          is_new_device: boolean
          is_new_location: boolean
          last_seen_at: string
          revoked_at: string | null
          revoked_by: string | null
          revoked_by_email: string | null
          role: string
          status: string
          updated_at: string
          user_agent: string
          user_email: string
          user_id: string
        }
        Insert: {
          city?: string | null
          company_id?: string
          concurrent?: boolean
          country?: string | null
          created_at?: string
          device_id: string
          device_label?: string
          id?: string
          ip?: string | null
          is_new_device?: boolean
          is_new_location?: boolean
          last_seen_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_by_email?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_agent?: string
          user_email?: string
          user_id: string
        }
        Update: {
          city?: string | null
          company_id?: string
          concurrent?: boolean
          country?: string | null
          created_at?: string
          device_id?: string
          device_label?: string
          id?: string
          ip?: string | null
          is_new_device?: boolean
          is_new_location?: boolean
          last_seen_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_by_email?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_agent?: string
          user_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_sessions_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_units: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurement_units_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          alert_cash_closure: boolean
          alert_low_stock: boolean
          alert_order_ready: boolean
          chat_id_admin: string | null
          chat_id_inventory: string | null
          chat_id_kitchen: string | null
          chat_id_owner: string | null
          company_id: string
          created_at: string
          id: string
          telegram_bot_token: string | null
          telegram_chat_id: string | null
          updated_at: string
        }
        Insert: {
          alert_cash_closure?: boolean
          alert_low_stock?: boolean
          alert_order_ready?: boolean
          chat_id_admin?: string | null
          chat_id_inventory?: string | null
          chat_id_kitchen?: string | null
          chat_id_owner?: string | null
          company_id?: string
          created_at?: string
          id?: string
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Update: {
          alert_cash_closure?: boolean
          alert_low_stock?: boolean
          alert_order_ready?: boolean
          chat_id_admin?: string | null
          chat_id_inventory?: string | null
          chat_id_kitchen?: string | null
          chat_id_owner?: string | null
          company_id?: string
          created_at?: string
          id?: string
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          id: string
          item_code: string | null
          notes: string | null
          option_kind: string | null
          order_id: string
          parent_item_id: string | null
          product_id: string | null
          product_name: string
          quantity: number
          recipe_id: string | null
          status: Database["public"]["Enums"]["item_status"]
          tax_rate: number
          unit_price: number
        }
        Insert: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          item_code?: string | null
          notes?: string | null
          option_kind?: string | null
          order_id: string
          parent_item_id?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          recipe_id?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          item_code?: string | null
          notes?: string | null
          option_kind?: string | null
          order_id?: string
          parent_item_id?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          recipe_id?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          access_key: string | null
          adjustment_reason: string | null
          amount_in_words: string | null
          authorization_number: string | null
          branch_id: string | null
          client_uid: string | null
          company_id: string
          created_at: string
          created_by: string | null
          credit_customer_id: string | null
          credit_customer_name: string | null
          credit_due_date: string | null
          credit_paid_at: string | null
          credit_phone: string | null
          credit_status: string | null
          customer_address: string | null
          customer_email: string | null
          customer_id_number: string | null
          customer_id_type: string | null
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          discount: number
          doc_number: string | null
          doc_status: string
          doc_type: string
          folio: number
          guests: number
          id: string
          issued_at_device: string | null
          iva_rate: number
          kitchen_sent_at: string | null
          notes: string | null
          order_label: string | null
          origin: string
          paid_at: string | null
          payment_method: string | null
          ready_at: string | null
          related_access_key: string | null
          related_doc_number: string | null
          released_at: string | null
          replaces_doc_number: string | null
          sales_channel: string
          service_type: string
          sri_authorized_at: string | null
          sri_message: string | null
          sri_sent_at: string | null
          sri_status: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          tax_amount: number
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          voided_by_email: string | null
          xml_authorized: string | null
          xml_signed: string | null
        }
        Insert: {
          access_key?: string | null
          adjustment_reason?: string | null
          amount_in_words?: string | null
          authorization_number?: string | null
          branch_id?: string | null
          client_uid?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          credit_customer_id?: string | null
          credit_customer_name?: string | null
          credit_due_date?: string | null
          credit_paid_at?: string | null
          credit_phone?: string | null
          credit_status?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id_number?: string | null
          customer_id_type?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          discount?: number
          doc_number?: string | null
          doc_status?: string
          doc_type?: string
          folio?: number
          guests?: number
          id?: string
          issued_at_device?: string | null
          iva_rate?: number
          kitchen_sent_at?: string | null
          notes?: string | null
          order_label?: string | null
          origin?: string
          paid_at?: string | null
          payment_method?: string | null
          ready_at?: string | null
          related_access_key?: string | null
          related_doc_number?: string | null
          released_at?: string | null
          replaces_doc_number?: string | null
          sales_channel?: string
          service_type?: string
          sri_authorized_at?: string | null
          sri_message?: string | null
          sri_sent_at?: string | null
          sri_status?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_by_email?: string | null
          xml_authorized?: string | null
          xml_signed?: string | null
        }
        Update: {
          access_key?: string | null
          adjustment_reason?: string | null
          amount_in_words?: string | null
          authorization_number?: string | null
          branch_id?: string | null
          client_uid?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          credit_customer_id?: string | null
          credit_customer_name?: string | null
          credit_due_date?: string | null
          credit_paid_at?: string | null
          credit_phone?: string | null
          credit_status?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id_number?: string | null
          customer_id_type?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          discount?: number
          doc_number?: string | null
          doc_status?: string
          doc_type?: string
          folio?: number
          guests?: number
          id?: string
          issued_at_device?: string | null
          iva_rate?: number
          kitchen_sent_at?: string | null
          notes?: string | null
          order_label?: string | null
          origin?: string
          paid_at?: string | null
          payment_method?: string | null
          ready_at?: string | null
          related_access_key?: string | null
          related_doc_number?: string | null
          released_at?: string | null
          replaces_doc_number?: string | null
          sales_channel?: string
          service_type?: string
          sri_authorized_at?: string | null
          sri_message?: string | null
          sri_sent_at?: string | null
          sri_status?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_by_email?: string | null
          xml_authorized?: string | null
          xml_signed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_expenses: {
        Row: {
          amount: number
          base_amount: number
          branch_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          expense_date: string
          id: string
          invoice_number: string
          iva_rate: number
          label: string
          line_item_id: string | null
          line_key: string
          month: number
          notes: string | null
          section: string
          supplier_name: string
          tax_amount: number
          updated_at: string
          year: number
        }
        Insert: {
          amount?: number
          base_amount?: number
          branch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          invoice_number?: string
          iva_rate?: number
          label: string
          line_item_id?: string | null
          line_key: string
          month: number
          notes?: string | null
          section: string
          supplier_name?: string
          tax_amount?: number
          updated_at?: string
          year: number
        }
        Update: {
          amount?: number
          base_amount?: number
          branch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          invoice_number?: string
          iva_rate?: number
          label?: string
          line_item_id?: string | null
          line_key?: string
          month?: number
          notes?: string | null
          section?: string
          supplier_name?: string
          tax_amount?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "pl_expenses_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pl_expenses_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pl_expenses_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "pl_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_groups: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          key: string
          kind: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          key: string
          kind?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          key?: string
          kind?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pl_groups_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_line_items: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          label: string
          line_key: string
          section: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          label: string
          line_key: string
          section: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          label?: string
          line_key?: string
          section?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pl_line_items_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_manual_lines: {
        Row: {
          amount: number
          branch_id: string | null
          company_id: string
          created_at: string
          id: string
          label: string
          line_key: string
          month: number
          section: string
          updated_at: string
          year: number
        }
        Insert: {
          amount?: number
          branch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          label: string
          line_key: string
          month: number
          section: string
          updated_at?: string
          year: number
        }
        Update: {
          amount?: number
          branch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          label?: string
          line_key?: string
          month?: number
          section?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "pl_manual_lines_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pl_manual_lines_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          email: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_branches: {
        Row: {
          active: boolean
          address: string
          code: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          emission_point: string
          establishment: string
          id: string
          is_primary: boolean
          kind: Database["public"]["Enums"]["branch_kind"]
          name: string
          phone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          address?: string
          code: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          emission_point?: string
          establishment?: string
          id?: string
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["branch_kind"]
          name: string
          phone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          address?: string
          code?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          emission_point?: string
          establishment?: string
          id?: string
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["branch_kind"]
          name?: string
          phone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_companies: {
        Row: {
          contact_email: string
          contact_phone: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          legal_name: string
          onboarded_at: string
          plan: Database["public"]["Enums"]["platform_plan"]
          region: string
          ruc: string
          slug: string
          status: Database["public"]["Enums"]["company_status"]
          trade_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contact_email?: string
          contact_phone?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          legal_name?: string
          onboarded_at?: string
          plan?: Database["public"]["Enums"]["platform_plan"]
          region?: string
          ruc?: string
          slug: string
          status?: Database["public"]["Enums"]["company_status"]
          trade_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contact_email?: string
          contact_phone?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          legal_name?: string
          onboarded_at?: string
          plan?: Database["public"]["Enums"]["platform_plan"]
          region?: string
          ruc?: string
          slug?: string
          status?: Database["public"]["Enums"]["company_status"]
          trade_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      product_channel_prices: {
        Row: {
          channel_value: string
          company_id: string
          created_at: string
          id: string
          price: number
          product_id: string
          updated_at: string
        }
        Insert: {
          channel_value: string
          company_id?: string
          created_at?: string
          id?: string
          price?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          channel_value?: string
          company_id?: string
          created_at?: string
          id?: string
          price?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_channel_prices_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_channel_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          company_id: string
          created_at: string
          default_selected: boolean
          id: string
          kind: string
          option_product_id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          default_selected?: boolean
          id?: string
          kind: string
          option_product_id: string
          product_id: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          default_selected?: boolean
          id?: string
          kind?: string
          option_product_id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_options_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_options_option_product_id_fkey"
            columns: ["option_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_recipe_variants: {
        Row: {
          company_id: string
          created_at: string
          id: string
          product_id: string
          recipe_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          product_id: string
          recipe_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          product_id?: string
          recipe_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_recipe_variants_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recipe_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recipe_variants_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      production_entries: {
        Row: {
          batch_cost: number
          batches: number
          branch_id: string | null
          business_date: string
          company_id: string
          created_at: string
          created_by: string | null
          created_by_email: string | null
          id: string
          item_id: string | null
          notes: string | null
          purchase_id: string | null
          recipe_code: string | null
          recipe_id: string | null
          recipe_name: string
          shift: string
          total_cost: number
          total_quantity: number
          unit: string
          unit_cost: number
          updated_at: string
          yield_per_batch: number
        }
        Insert: {
          batch_cost?: number
          batches?: number
          branch_id?: string | null
          business_date?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          item_id?: string | null
          notes?: string | null
          purchase_id?: string | null
          recipe_code?: string | null
          recipe_id?: string | null
          recipe_name: string
          shift?: string
          total_cost?: number
          total_quantity?: number
          unit?: string
          unit_cost?: number
          updated_at?: string
          yield_per_batch?: number
        }
        Update: {
          batch_cost?: number
          batches?: number
          branch_id?: string | null
          business_date?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          item_id?: string | null
          notes?: string | null
          purchase_id?: string | null
          recipe_code?: string | null
          recipe_id?: string | null
          recipe_name?: string
          shift?: string
          total_cost?: number
          total_quantity?: number
          unit?: string
          unit_cost?: number
          updated_at?: string
          yield_per_batch?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_entries_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      production_entry_items: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          entry_id: string
          id: string
          item_id: string | null
          name: string
          quantity_batch: number
          quantity_total: number
          sub_recipe_id: string | null
          total_cost: number
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          entry_id: string
          id?: string
          item_id?: string | null
          name: string
          quantity_batch?: number
          quantity_total?: number
          sub_recipe_id?: string | null
          total_cost?: number
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          entry_id?: string
          id?: string
          item_id?: string | null
          name?: string
          quantity_batch?: number
          quantity_total?: number
          sub_recipe_id?: string | null
          total_cost?: number
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_entry_items_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entry_items_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entry_items_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "production_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entry_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entry_items_sub_recipe_id_fkey"
            columns: ["sub_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          available: boolean
          category_id: string | null
          code: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          print_area: string
        }
        Insert: {
          available?: boolean
          category_id?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          print_area?: string
        }
        Update: {
          available?: boolean
          category_id?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          print_area?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string
          contact_email: string | null
          created_at: string
          display_name: string | null
          home_path: string | null
          id: string
          login_email: string | null
          updated_at: string
          username: string
        }
        Insert: {
          company_id?: string
          contact_email?: string | null
          created_at?: string
          display_name?: string | null
          home_path?: string | null
          id: string
          login_email?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          company_id?: string
          contact_email?: string | null
          created_at?: string
          display_name?: string | null
          home_path?: string | null
          id?: string
          login_email?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_audit_log: {
        Row: {
          action: string
          company_id: string
          created_at: string
          detail: Json
          document_number: string | null
          id: string
          purchase_id: string | null
          supplier_name: string | null
          updated_at: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string
          created_at?: string
          detail?: Json
          document_number?: string | null
          id?: string
          purchase_id?: string | null
          supplier_name?: string | null
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          detail?: Json
          document_number?: string | null
          id?: string
          purchase_id?: string | null
          supplier_name?: string | null
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_audit_log_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          id: string
          item_id: string | null
          item_name: string
          purchase_id: string
          quantity: number
          quantity_inventory: number
          subtotal: number
          tax_amount: number
          tax_rate: number
          tax_treatment: string
          unit_cost: number
          unit_cost_inventory: number
        }
        Insert: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          item_id?: string | null
          item_name?: string
          purchase_id: string
          quantity?: number
          quantity_inventory?: number
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tax_treatment?: string
          unit_cost?: number
          unit_cost_inventory?: number
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          item_id?: string | null
          item_name?: string
          purchase_id?: string
          quantity?: number
          quantity_inventory?: number
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tax_treatment?: string
          unit_cost?: number
          unit_cost_inventory?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          document_number: string
          due_date: string | null
          id: string
          notes: string | null
          order_number: string | null
          paid: boolean
          paid_at: string | null
          payment_method: string
          purchased_at: string
          received_at: string | null
          status: string
          supplier_id: string | null
          supplier_name: string
          tax_amount: number
          tax_base: number
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          voided_by_email: string | null
        }
        Insert: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_number?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          paid?: boolean
          paid_at?: string | null
          payment_method?: string
          purchased_at?: string
          received_at?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          tax_amount?: number
          tax_base?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_by_email?: string | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_number?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          paid?: boolean
          paid_at?: string | null
          payment_method?: string
          purchased_at?: string
          received_at?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          tax_amount?: number
          tax_base?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_by_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          item_id: string | null
          name: string
          quantity: number
          recipe_id: string
          sort_order: number
          source_type: string
          sub_recipe_id: string | null
          subtotal: number
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          item_id?: string | null
          name: string
          quantity?: number
          recipe_id: string
          sort_order?: number
          source_type?: string
          sub_recipe_id?: string | null
          subtotal?: number
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          item_id?: string | null
          name?: string
          quantity?: number
          recipe_id?: string
          sort_order?: number
          source_type?: string
          sub_recipe_id?: string | null
          subtotal?: number
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_sub_recipe_id_fkey"
            columns: ["sub_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          code: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          inventory_item_id: string | null
          kind: string
          name: string
          notes: string | null
          product_id: string | null
          sale_price: number | null
          suggested_net_price: number | null
          updated_at: string
          variant_name: string | null
          yield_quantity: number
          yield_unit: string
        }
        Insert: {
          code?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id?: string | null
          kind?: string
          name: string
          notes?: string | null
          product_id?: string | null
          sale_price?: number | null
          suggested_net_price?: number | null
          updated_at?: string
          variant_name?: string | null
          yield_quantity?: number
          yield_unit?: string
        }
        Update: {
          code?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id?: string | null
          kind?: string
          name?: string
          notes?: string | null
          product_id?: string | null
          sale_price?: number | null
          suggested_net_price?: number | null
          updated_at?: string
          variant_name?: string | null
          yield_quantity?: number
          yield_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      report_snapshots: {
        Row: {
          branch_id: string | null
          business_date: string
          company_id: string
          computed_at: string
          created_at: string
          id: string
          kind: string
          payload: Json
          period_from: string
          period_to: string
          scope: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          business_date: string
          company_id?: string
          computed_at?: string
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          period_from: string
          period_to: string
          scope: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          business_date?: string
          company_id?: string
          computed_at?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          period_from?: string
          period_to?: string
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_snapshots_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          seats: number
          sort_order: number
          status: string
          zone: string
        }
        Insert: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name: string
          seats?: number
          sort_order?: number
          status?: string
          zone?: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          seats?: number
          sort_order?: number
          status?: string
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "platform_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_channels: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          label: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_channels_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sri_emission_logs: {
        Row: {
          access_key: string | null
          company_id: string
          created_at: string
          created_by: string | null
          detail: string | null
          doc_number: string | null
          id: string
          order_id: string | null
          stage: string
          status: string
          updated_at: string
        }
        Insert: {
          access_key?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          doc_number?: string | null
          id?: string
          order_id?: string | null
          stage: string
          status: string
          updated_at?: string
        }
        Update: {
          access_key?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          doc_number?: string | null
          id?: string
          order_id?: string | null
          stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sri_emission_logs_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sri_emission_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          category: string | null
          code: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          id_number: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          category?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          id_number?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          category?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          id_number?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_owner: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          is_owner?: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_owner?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "platform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_physical_count_as_opening: {
        Args: { _business_date: string }
        Returns: number
      }
      apply_sales_consumption: { Args: { _order_id: string }; Returns: number }
      can_manage_movements: { Args: { _user_id: string }; Returns: boolean }
      claim_system_ownership: { Args: never; Returns: boolean }
      claim_system_ownership_for: {
        Args: { _user_id: string }
        Returns: boolean
      }
      close_inventory_day: {
        Args: { _business_date: string; _notes?: string }
        Returns: {
          business_date: string
          items_count: number
          total_value: number
        }[]
      }
      company_has_module: { Args: { _module_key: string }; Returns: boolean }
      consume_inventory_recipe: {
        Args: { _item_id: string; _qty_recipe: number }
        Returns: number
      }
      create_platform_company: {
        Args: {
          _actor: string
          _branch_address: string
          _branch_name: string
          _contact_email: string
          _contact_phone: string
          _emission_point: string
          _establishment: string
          _legal_name: string
          _modules: string[]
          _owner_user_id: string
          _plan: Database["public"]["Enums"]["platform_plan"]
          _region: string
          _ruc: string
          _slug: string
          _status: Database["public"]["Enums"]["company_status"]
          _trade_name: string
        }
        Returns: string
      }
      current_company_id: { Args: never; Returns: string }
      day_is_locked: { Args: never; Returns: boolean }
      default_branch_id: { Args: never; Returns: string }
      default_company_id: { Args: never; Returns: string }
      delete_inventory_movement: {
        Args: { _movement_id: string }
        Returns: undefined
      }
      delete_production_entry: {
        Args: { _entry_id: string }
        Returns: undefined
      }
      delete_purchase: { Args: { _purchase_id: string }; Returns: undefined }
      ec_business_date: { Args: never; Returns: string }
      edit_inventory_movement: {
        Args: {
          _business_date: string
          _item_id: string
          _movement_id: string
          _quantity: number
          _reason: string
        }
        Returns: undefined
      }
      ensure_company_settings: { Args: never; Returns: string }
      is_platform_admin: { Args: never; Returns: boolean }
      is_system_owner: { Args: { _user_id: string }; Returns: boolean }
      movement_stock_delta: {
        Args: {
          _qty: number
          _type: Database["public"]["Enums"]["inventory_movement_type"]
        }
        Returns: number
      }
      next_invoice_sequential: {
        Args: never
        Returns: {
          emission_point: string
          establishment: string
          sequential: number
        }[]
      }
      next_order_folio: { Args: never; Returns: number }
      next_order_folio_for: {
        Args: { _branch: string; _company: string }
        Returns: number
      }
      recalc_inventory_period: {
        Args: { _from: string; _to: string }
        Returns: {
          dia: string
          items: number
        }[]
      }
      recalc_inventory_stock: { Args: never; Returns: number }
      recalc_sales_consumption: {
        Args: { _desde?: string }
        Returns: {
          movimientos: number
          pedidos: number
        }[]
      }
      receive_purchase: { Args: { _purchase_id: string }; Returns: undefined }
      repropagate_item_cost: { Args: { _item_id: string }; Returns: undefined }
      reserve_document_sequence_block: {
        Args: { _block_size?: number; _doc_type: string }
        Returns: {
          doc_type: string
          emission_point: string
          establishment: string
          first_sequential: number
          last_sequential: number
        }[]
      }
      restore_inventory_item: { Args: { _item_id: string }; Returns: undefined }
      resync_sequences: { Args: never; Returns: Json }
      revert_purchase: { Args: { _purchase_id: string }; Returns: undefined }
      rls_policy_report: { Args: { _table: string }; Returns: Json }
      soft_delete_inventory_item: {
        Args: { _item_id: string }
        Returns: undefined
      }
      transfer_system_ownership: {
        Args: { _current_owner: string; _target_user_id: string }
        Returns: boolean
      }
      unit_convert_factor: {
        Args: { _from: string; _to: string }
        Returns: number
      }
      void_order: {
        Args: { _order_id: string; _reason: string }
        Returns: undefined
      }
      void_purchase: {
        Args: { _purchase_id: string; _reason: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "administrador"
        | "cajero"
        | "mesero"
        | "admin_operativo"
        | "cocina"
      branch_kind: "local" | "bodega"
      company_status: "activa" | "prueba" | "suspendida"
      doc_type: "factura" | "nota_venta"
      inventory_movement_type:
        | "baja"
        | "lunch"
        | "transferencia"
        | "venta"
        | "ajuste"
        | "consumo_produccion"
        | "entrada_produccion"
      item_status: "pendiente" | "preparando" | "listo" | "entregado"
      order_status: "abierto" | "en_cocina" | "listo" | "pagado" | "cancelado"
      platform_plan: "junior" | "pro" | "premium"
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
  public: {
    Enums: {
      app_role: [
        "administrador",
        "cajero",
        "mesero",
        "admin_operativo",
        "cocina",
      ],
      branch_kind: ["local", "bodega"],
      company_status: ["activa", "prueba", "suspendida"],
      doc_type: ["factura", "nota_venta"],
      inventory_movement_type: [
        "baja",
        "lunch",
        "transferencia",
        "venta",
        "ajuste",
        "consumo_produccion",
        "entrada_produccion",
      ],
      item_status: ["pendiente", "preparando", "listo", "entregado"],
      order_status: ["abierto", "en_cocina", "listo", "pagado", "cancelado"],
      platform_plan: ["junior", "pro", "premium"],
    },
  },
} as const
