/**
 * Supabase Database Types — HD-System
 *
 * This file mirrors the Supabase auto-generated types.
 * Generated from: docs/supabase-schema.md
 *
 * To regenerate (requires Supabase CLI access):
 *   npx supabase gen types typescript --project-id tixwhmgzibvazkqbqoev > src/types/database.ts
 *
 * ⚠️  If you change the database schema, update this file OR re-run the command above.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          logo_url?: string | null;
          updated_at?: string;
        };
      };
      store_branches: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string;
          cnpj: string;
          city: string;
          state: string;
          address: string;
          phone: string;
          is_headquarters: boolean;
          active: boolean;
          full_address: string | null;
          whatsapp_phone: string | null;
          latitude: number | null;
          longitude: number | null;
          delivery_enabled: boolean;
          pickup_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          code: string;
          cnpj?: string;
          city?: string;
          state?: string;
          address?: string;
          phone?: string;
          is_headquarters?: boolean;
          active?: boolean;
          full_address?: string | null;
          whatsapp_phone?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          delivery_enabled?: boolean;
          pickup_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          name?: string;
          code?: string;
          cnpj?: string;
          city?: string;
          state?: string;
          address?: string;
          phone?: string;
          is_headquarters?: boolean;
          active?: boolean;
          full_address?: string | null;
          whatsapp_phone?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          delivery_enabled?: boolean;
          pickup_enabled?: boolean;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          barcode: string;
          name: string;
          category: string;
          unit: string;
          cost_price: number;
          sale_price: number;
          stock_quantity: number;
          min_stock: number;
          max_stock_quantity: number;
          image_url: string;
          supplier_id: string | null;
          ncm: string | null;
          cfop: string | null;
          active: boolean;
          show_on_tv: boolean;
          tv_promo_price: number | null;
          tv_highlight_tag: string | null;
          show_on_cardapio: boolean;
          expiration_date: string | null;
          is_composite: boolean;
          use_lots: boolean;
          wholesale_options: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          barcode?: string;
          name: string;
          category?: string;
          unit?: string;
          cost_price?: number;
          sale_price: number;
          stock_quantity?: number;
          min_stock?: number;
          max_stock_quantity?: number;
          image_url?: string;
          supplier_id?: string | null;
          ncm?: string | null;
          cfop?: string | null;
          active?: boolean;
          show_on_tv?: boolean;
          tv_promo_price?: number | null;
          tv_highlight_tag?: string | null;
          show_on_cardapio?: boolean;
          expiration_date?: string | null;
          is_composite?: boolean;
          use_lots?: boolean;
          wholesale_options?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          barcode?: string;
          name?: string;
          category?: string;
          unit?: string;
          cost_price?: number;
          sale_price?: number;
          stock_quantity?: number;
          min_stock?: number;
          max_stock_quantity?: number;
          image_url?: string;
          supplier_id?: string | null;
          ncm?: string | null;
          cfop?: string | null;
          active?: boolean;
          show_on_tv?: boolean;
          tv_promo_price?: number | null;
          tv_highlight_tag?: string | null;
          show_on_cardapio?: boolean;
          expiration_date?: string | null;
          is_composite?: boolean;
          use_lots?: boolean;
          wholesale_options?: Json | null;
          updated_at?: string;
        };
      };
      sales: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string;
          code: string;
          date: string;
          operator_id: string;
          operator_name: string;
          customer_id: string | null;
          customer_name: string | null;
          items: Json;
          subtotal: number;
          discount: number;
          total: number;
          payments: Json;
          status: 'completed' | 'cancelled' | 'pending';
          table_id: string | null;
          customer_session_id: string | null;
          order_source: string | null;
          kitchen_status: string | null;
          payment_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id: string;
          code: string;
          date?: string;
          operator_id: string;
          operator_name: string;
          customer_id?: string | null;
          customer_name?: string | null;
          items: Json;
          subtotal: number;
          discount?: number;
          total: number;
          payments: Json;
          status?: 'completed' | 'cancelled' | 'pending';
          table_id?: string | null;
          customer_session_id?: string | null;
          order_source?: string | null;
          kitchen_status?: string | null;
          payment_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string;
          code?: string;
          date?: string;
          operator_id?: string;
          operator_name?: string;
          customer_id?: string | null;
          customer_name?: string | null;
          items?: Json;
          subtotal?: number;
          discount?: number;
          total?: number;
          payments?: Json;
          status?: 'completed' | 'cancelled' | 'pending';
          table_id?: string | null;
          customer_session_id?: string | null;
          order_source?: string | null;
          kitchen_status?: string | null;
          payment_id?: string | null;
          updated_at?: string;
        };
      };
      customers: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          name: string;
          cpf_cnpj: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          credit_limit: number;
          notes: string | null;
          birth_date: string | null;
          whatsapp: string | null;
          address_street: string | null;
          address_number: string | null;
          address_complement: string | null;
          address_neighborhood: string | null;
          address_city: string | null;
          address_state: string | null;
          address_zip: string | null;
          google_id: string | null;
          password_hash: string | null;
          customer_type: 'walkin' | 'delivery' | 'both';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          name: string;
          cpf_cnpj?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          credit_limit?: number;
          notes?: string | null;
          birth_date?: string | null;
          whatsapp?: string | null;
          address_street?: string | null;
          address_number?: string | null;
          address_complement?: string | null;
          address_neighborhood?: string | null;
          address_city?: string | null;
          address_state?: string | null;
          address_zip?: string | null;
          google_id?: string | null;
          password_hash?: string | null;
          customer_type?: 'walkin' | 'delivery' | 'both';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          name?: string;
          cpf_cnpj?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          credit_limit?: number;
          notes?: string | null;
          birth_date?: string | null;
          whatsapp?: string | null;
          address_street?: string | null;
          address_number?: string | null;
          address_complement?: string | null;
          address_neighborhood?: string | null;
          address_city?: string | null;
          address_state?: string | null;
          address_zip?: string | null;
          google_id?: string | null;
          password_hash?: string | null;
          customer_type?: 'walkin' | 'delivery' | 'both';
          updated_at?: string;
        };
      };
      suppliers: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          company_name: string;
          trade_name: string | null;
          cnpj: string | null;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          company_name: string;
          trade_name?: string | null;
          cnpj?: string | null;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          company_name?: string;
          trade_name?: string | null;
          cnpj?: string | null;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          name: string;
          icon: string | null;
          color: string | null;
          description: string | null;
          sectors: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          name: string;
          icon?: string | null;
          color?: string | null;
          description?: string | null;
          sectors?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          name?: string;
          icon?: string | null;
          color?: string | null;
          description?: string | null;
          sectors?: string[] | null;
          updated_at?: string;
        };
      };
      tables: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          name: string;
          number: number | null;
          qr_token: string;
          status: string;
          capacity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          name: string;
          number?: number | null;
          qr_token: string;
          status?: string;
          capacity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          name?: string;
          number?: number | null;
          qr_token?: string;
          status?: string;
          capacity?: number;
          updated_at?: string;
        };
      };
      cash_sessions: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          opened_at: string;
          closed_at: string | null;
          operator_id: string;
          operator_name: string;
          initial_cash: number;
          current_cash_balance: number;
          total_sales_cash: number;
          total_sales_pix: number;
          total_sales_card: number;
          total_sales_credit_account: number;
          suprimentos: number;
          sangrias: number;
          status: 'open' | 'closed';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          opened_at?: string;
          closed_at?: string | null;
          operator_id: string;
          operator_name: string;
          initial_cash: number;
          current_cash_balance: number;
          total_sales_cash?: number;
          total_sales_pix?: number;
          total_sales_card?: number;
          total_sales_credit_account?: number;
          suprimentos?: number;
          sangrias?: number;
          status?: 'open' | 'closed';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          opened_at?: string;
          closed_at?: string | null;
          operator_id?: string;
          operator_name?: string;
          initial_cash?: number;
          current_cash_balance?: number;
          total_sales_cash?: number;
          total_sales_pix?: number;
          total_sales_card?: number;
          total_sales_credit_account?: number;
          suprimentos?: number;
          sangrias?: number;
          status?: 'open' | 'closed';
          notes?: string | null;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string | null;
          store_branch_id: string | null;
          name: string;
          email: string;
          role: 'admin' | 'collaborator';
          avatar_url: string | null;
          active: boolean;
          superadmin: boolean;
          permissions: Json;
          salary: number | null;
          transportation_allowance: number | null;
          meal_allowance: number | null;
          other_benefits: number | null;
          inss_discount: number | null;
          ir_discount: number | null;
          other_discounts: number | null;
          whatsapp: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id?: string | null;
          store_branch_id?: string | null;
          name: string;
          email: string;
          role?: 'admin' | 'collaborator';
          avatar_url?: string | null;
          active?: boolean;
          superadmin?: boolean;
          permissions?: Json;
          salary?: number | null;
          transportation_allowance?: number | null;
          meal_allowance?: number | null;
          other_benefits?: number | null;
          inss_discount?: number | null;
          ir_discount?: number | null;
          other_discounts?: number | null;
          whatsapp?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string | null;
          store_branch_id?: string | null;
          name?: string;
          email?: string;
          role?: 'admin' | 'collaborator';
          avatar_url?: string | null;
          active?: boolean;
          superadmin?: boolean;
          permissions?: Json;
          salary?: number | null;
          transportation_allowance?: number | null;
          meal_allowance?: number | null;
          other_benefits?: number | null;
          inss_discount?: number | null;
          ir_discount?: number | null;
          other_discounts?: number | null;
          whatsapp?: string | null;
          updated_at?: string;
        };
      };
      system_users: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          name: string;
          email: string;
          role: string;
          active: boolean;
          permissions: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id: string;
          store_branch_id?: string | null;
          name: string;
          email: string;
          role?: string;
          active?: boolean;
          permissions?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          name?: string;
          email?: string;
          role?: string;
          active?: boolean;
          permissions?: Json | null;
          updated_at?: string;
        };
      };
      financial_transactions: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          title: string;
          type: 'payable' | 'receivable';
          category: string | null;
          amount: number;
          due_date: string;
          paid_date: string | null;
          status: 'pending' | 'paid' | 'overdue' | 'cancelled';
          recipient_or_payer: string;
          notes: string | null;
          sale_id: string | null;
          installments: number | null;
          current_installment: number | null;
          recurring: boolean;
          recurrence_interval: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          title: string;
          type: 'payable' | 'receivable';
          category?: string | null;
          amount: number;
          due_date: string;
          paid_date?: string | null;
          status?: 'pending' | 'paid' | 'overdue' | 'cancelled';
          recipient_or_payer: string;
          notes?: string | null;
          sale_id?: string | null;
          installments?: number | null;
          current_installment?: number | null;
          recurring?: boolean;
          recurrence_interval?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          title?: string;
          type?: 'payable' | 'receivable';
          category?: string | null;
          amount?: number;
          due_date?: string;
          paid_date?: string | null;
          status?: 'pending' | 'paid' | 'overdue' | 'cancelled';
          recipient_or_payer?: string;
          notes?: string | null;
          sale_id?: string | null;
          installments?: number | null;
          current_installment?: number | null;
          recurring?: boolean;
          recurrence_interval?: string | null;
          updated_at?: string;
        };
      };
      stock_movements: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          product_id: string;
          product_name: string;
          type: 'in' | 'out' | 'adjustment' | 'loss';
          quantity: number;
          previous_stock: number;
          new_stock: number;
          reason: string;
          date: string;
          operator_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          product_id: string;
          product_name: string;
          type: 'in' | 'out' | 'adjustment' | 'loss';
          quantity: number;
          previous_stock: number;
          new_stock: number;
          reason: string;
          date?: string;
          operator_name: string;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          product_id?: string;
          product_name?: string;
          type?: 'in' | 'out' | 'adjustment' | 'loss';
          quantity?: number;
          previous_stock?: number;
          new_stock?: number;
          reason?: string;
          date?: string;
          operator_name?: string;
        };
      };
      printers: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          name: string;
          role: 'caixa' | 'bar' | 'cozinha' | 'outro';
          ip_address: string | null;
          mac_address: string | null;
          is_default: boolean;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          name: string;
          role?: 'caixa' | 'bar' | 'cozinha' | 'outro';
          ip_address?: string | null;
          mac_address?: string | null;
          is_default?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          name?: string;
          role?: 'caixa' | 'bar' | 'cozinha' | 'outro';
          ip_address?: string | null;
          mac_address?: string | null;
          is_default?: boolean;
          active?: boolean;
          updated_at?: string;
        };
      };
      customer_sessions: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          table_id: string | null;
          customer_name: string;
          status: 'active' | 'completed' | 'cancelled';
          started_at: string;
          ended_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          table_id?: string | null;
          customer_name: string;
          status?: 'active' | 'completed' | 'cancelled';
          started_at?: string;
          ended_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          table_id?: string | null;
          customer_name?: string;
          status?: 'active' | 'completed' | 'cancelled';
          started_at?: string;
          ended_at?: string | null;
          updated_at?: string;
        };
      };
      delivery_orders: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string;
          sale_id: string | null;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string | null;
          address: string;
          neighborhood: string | null;
          latitude: number | null;
          longitude: number | null;
          delivery_fee: number;
          total: number;
          status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
          driver_name: string | null;
          estimated_delivery: string | null;
          actual_delivery: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id: string;
          sale_id?: string | null;
          customer_id?: string | null;
          customer_name: string;
          customer_phone?: string | null;
          address: string;
          neighborhood?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          delivery_fee?: number;
          total: number;
          status?: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
          driver_name?: string | null;
          estimated_delivery?: string | null;
          actual_delivery?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string;
          sale_id?: string | null;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string | null;
          address?: string;
          neighborhood?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          delivery_fee?: number;
          total?: number;
          status?: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
          driver_name?: string | null;
          estimated_delivery?: string | null;
          actual_delivery?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
      };
      credit_payments: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          customer_id: string;
          sale_id: string;
          amount: number;
          payment_method: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          customer_id: string;
          sale_id: string;
          amount: number;
          payment_method?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          customer_id?: string;
          sale_id?: string;
          amount?: number;
          payment_method?: string;
          notes?: string | null;
          updated_at?: string;
        };
      };
      movements: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          session_id: string;
          type: 'supply' | 'withdrawal';
          amount: number;
          reason: string;
          operator_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          session_id: string;
          type: 'supply' | 'withdrawal';
          amount: number;
          reason: string;
          operator_name: string;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          session_id?: string;
          type?: 'supply' | 'withdrawal';
          amount?: number;
          reason?: string;
          operator_name?: string;
        };
      };
      scanned_boletos: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          file_name: string;
          file_url: string | null;
          payer_name: string | null;
          payer_cpf_cnpj: string | null;
          amount: number;
          due_date: string | null;
          barcode_data: string | null;
          status: 'pending' | 'confirmed' | 'cancelled';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          file_name: string;
          file_url?: string | null;
          payer_name?: string | null;
          payer_cpf_cnpj?: string | null;
          amount: number;
          due_date?: string | null;
          barcode_data?: string | null;
          status?: 'pending' | 'confirmed' | 'cancelled';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          file_name?: string;
          file_url?: string | null;
          payer_name?: string | null;
          payer_cpf_cnpj?: string | null;
          amount?: number;
          due_date?: string | null;
          barcode_data?: string | null;
          status?: 'pending' | 'confirmed' | 'cancelled';
          notes?: string | null;
          updated_at?: string;
        };
      };
      nf_records: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          nf_number: string;
          sale_id: string | null;
          customer_name: string | null;
          amount: number;
          status: 'pending' | 'issued' | 'cancelled';
          xml_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          nf_number: string;
          sale_id?: string | null;
          customer_name?: string | null;
          amount: number;
          status?: 'pending' | 'issued' | 'cancelled';
          xml_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          nf_number?: string;
          sale_id?: string | null;
          customer_name?: string | null;
          amount?: number;
          status?: 'pending' | 'issued' | 'cancelled';
          xml_url?: string | null;
          updated_at?: string;
        };
      };
      composite_items: {
        Row: {
          id: string;
          organization_id: string;
          composite_product_id: string;
          ingredient_product_id: string;
          ingredient_name: string | null;
          quantity: number;
          unit: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          composite_product_id: string;
          ingredient_product_id: string;
          ingredient_name?: string | null;
          quantity: number;
          unit?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          composite_product_id?: string;
          ingredient_product_id?: string;
          ingredient_name?: string | null;
          quantity?: number;
          unit?: string | null;
          updated_at?: string;
        };
      };
      open_containers: {
        Row: {
          id: string;
          organization_id: string | null;
          store_branch_id: string | null;
          product_id: string;
          remaining_quantity: number;
          opened_at: string | null;
          status: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          store_branch_id?: string | null;
          product_id: string;
          remaining_quantity?: number;
          opened_at?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          organization_id?: string | null;
          store_branch_id?: string | null;
          product_id?: string;
          remaining_quantity?: number;
          opened_at?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      product_lots: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          product_id: string;
          lot_number: string;
          expiration_date: string;
          quantity: number;
          cost_price: number | null;
          status: 'active' | 'expired' | 'disposed';
          supplier_id: string | null;
          received_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          product_id: string;
          lot_number: string;
          expiration_date: string;
          quantity: number;
          cost_price?: number | null;
          status?: 'active' | 'expired' | 'disposed';
          supplier_id?: string | null;
          received_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          product_id?: string;
          lot_number?: string;
          expiration_date?: string;
          quantity?: number;
          cost_price?: number | null;
          status?: 'active' | 'expired' | 'disposed';
          supplier_id?: string | null;
          received_at?: string | null;
          updated_at?: string;
        };
      };
      stock_loss_log: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          product_id: string;
          reason: 'expired' | 'damaged' | 'other';
          quantity: number;
          product_name: string | null;
          operator_name: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          product_id: string;
          reason: 'expired' | 'damaged' | 'other';
          quantity: number;
          product_name?: string | null;
          operator_name?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          product_id?: string;
          reason?: 'expired' | 'damaged' | 'other';
          quantity?: number;
          product_name?: string | null;
          operator_name?: string | null;
          notes?: string | null;
        };
      };
      footer_messages: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          message: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          message: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          message?: string;
          active?: boolean;
          updated_at?: string;
        };
      };
      media_devices: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          name: string;
          type: string;
          connection_url: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          name: string;
          type: string;
          connection_url?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          name?: string;
          type?: string;
          connection_url?: string | null;
          active?: boolean;
          updated_at?: string;
        };
      };
      printer_assignments: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          printer_id: string;
          category_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          printer_id: string;
          category_id: string;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          printer_id?: string;
          category_id?: string;
        };
      };
      printer_routing_rules: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          printer_id: string;
          category_id: string;
          sector: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          printer_id: string;
          category_id: string;
          sector?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          printer_id?: string;
          category_id?: string;
          sector?: string | null;
          active?: boolean;
          updated_at?: string;
        };
      };
      module_visibility: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string;
          module_pdv: boolean;
          module_inventory: boolean;
          module_fiado: boolean;
          module_crm: boolean;
          module_dashboard: boolean;
          module_finance: boolean;
          module_kds: boolean;
          module_delivery: boolean;
          module_cardapio_digital: boolean;
          module_cardapio_preview: boolean;
          module_tv_showcase: boolean;
          module_tv_connect: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id: string;
          module_pdv?: boolean;
          module_inventory?: boolean;
          module_fiado?: boolean;
          module_crm?: boolean;
          module_dashboard?: boolean;
          module_finance?: boolean;
          module_kds?: boolean;
          module_delivery?: boolean;
          module_cardapio_digital?: boolean;
          module_cardapio_preview?: boolean;
          module_tv_showcase?: boolean;
          module_tv_connect?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string;
          module_pdv?: boolean;
          module_inventory?: boolean;
          module_fiado?: boolean;
          module_crm?: boolean;
          module_dashboard?: boolean;
          module_finance?: boolean;
          module_kds?: boolean;
          module_delivery?: boolean;
          module_cardapio_digital?: boolean;
          module_cardapio_preview?: boolean;
          module_tv_showcase?: boolean;
          module_tv_connect?: boolean;
          updated_at?: string;
        };
      };
      delivery_settings: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string;
          delivery_enabled: boolean;
          pickup_enabled: boolean;
          delivery_fee: number;
          min_order: number;
          estimated_time: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id: string;
          delivery_enabled?: boolean;
          pickup_enabled?: boolean;
          delivery_fee?: number;
          min_order?: number;
          estimated_time?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string;
          delivery_enabled?: boolean;
          pickup_enabled?: boolean;
          delivery_fee?: number;
          min_order?: number;
          estimated_time?: number;
          updated_at?: string;
        };
      };
      delivery_neighborhoods: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string;
          name: string;
          delivery_fee: number;
          estimated_time: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id: string;
          name: string;
          delivery_fee?: number;
          estimated_time?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string;
          name?: string;
          delivery_fee?: number;
          estimated_time?: number;
          active?: boolean;
          updated_at?: string;
        };
      };
      delivery_distance_rates: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string;
          min_km: number;
          max_km: number;
          fee: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id: string;
          min_km: number;
          max_km: number;
          fee: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string;
          min_km?: number;
          max_km?: number;
          fee?: number;
          active?: boolean;
          updated_at?: string;
        };
      };
      delivery_workers: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string;
          name: string;
          phone: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id: string;
          name: string;
          phone?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string;
          name?: string;
          phone?: string | null;
          active?: boolean;
          updated_at?: string;
        };
      };
      digital_menu_config: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string;
          config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id: string;
          config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string;
          config?: Json;
          updated_at?: string;
        };
      };
      branch_themes: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string;
          theme: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id: string;
          theme?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string;
          theme?: Json;
          updated_at?: string;
        };
      };
      api_keys: {
        Row: {
          id: string;
          organization_id: string;
          store_branch_id: string | null;
          service: string;
          key_encrypted: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_branch_id?: string | null;
          service: string;
          key_encrypted: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          store_branch_id?: string | null;
          service?: string;
          key_encrypted?: string;
          active?: boolean;
          updated_at?: string;
        };
      };
      webhook_events: {
        Row: {
          id: string;
          organization_id: string;
          event_type: string;
          payload: Json;
          status: 'pending' | 'processed' | 'failed';
          error_message: string | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          event_type: string;
          payload: Json;
          status?: 'pending' | 'processed' | 'failed';
          error_message?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          organization_id?: string;
          event_type?: string;
          payload?: Json;
          status?: 'pending' | 'processed' | 'failed';
          error_message?: string | null;
          processed_at?: string | null;
        };
      };
    };
    Functions: {
      get_is_superadmin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_user_org_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      get_user_branch_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      get_user_role: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      is_superadmin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      set_current_branch: {
        Args: { branch_id: string };
        Returns: void;
      };
      ensure_system_user: {
        Args: { p_user_id: string; p_email: string; p_name: string; p_org_id: string };
        Returns: void;
      };
    };
    Enums: {
      role_type: 'admin' | 'collaborator';
      sale_status: 'completed' | 'cancelled' | 'pending';
      payment_method_type: 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'credit_account' | 'other';
      session_status: 'open' | 'closed';
      customer_session_status: 'active' | 'completed' | 'cancelled';
      delivery_order_status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
      financial_status: 'pending' | 'paid' | 'overdue' | 'cancelled';
      stock_movement_type: 'in' | 'out' | 'adjustment' | 'loss';
      printer_role: 'caixa' | 'bar' | 'cozinha' | 'outro';
    };
  };
}

// Convenience types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
export type Functions<T extends keyof Database['public']['Functions']> = Database['public']['Functions'][T];
