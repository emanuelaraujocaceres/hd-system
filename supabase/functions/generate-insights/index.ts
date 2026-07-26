// ╔══════════════════════════════════════════════════════════════╗
// ║  Supabase Edge Function — Motor de Regras de Negócio        ║
// ║  Roda via CRON a cada hora                                   ║
// ║  Gera alertas operacionais baseados em dados reais do ERP    ║
// ╚══════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── TIPOS ──────────────────────────────────────────────

interface Insight {
  id: string;
  type: 'alert' | 'opportunity' | 'info' | 'warning';
  priority: 'high' | 'medium' | 'low';
  icon: string;
  title: string;
  message: string;
  action?: string;
  actionTab?: string;
  metric?: string;
}

// ─── MOTOR DE REGRAS ────────────────────────────────────

function generateInsights(sales: any, products: any, financial: any): Insight[] {
  const insights: Insight[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // ═══ REGRAS DE VENDAS ═══

  // Regra 1: Queda de faturamento
  if (sales.yesterdayRevenue > 0) {
    const changePercent = ((sales.todayRevenue - sales.yesterdayRevenue) / sales.yesterdayRevenue) * 100;
    if (changePercent < -20) {
      insights.push({
        id: 'sales-drop',
        type: 'alert',
        priority: 'high',
        icon: '📉',
        title: 'Queda de Faturamento',
        message: `Faturamento caiu ${Math.abs(changePercent).toFixed(0)}% vs ontem (R$ ${sales.yesterdayRevenue.toFixed(2)} → R$ ${sales.todayRevenue.toFixed(2)}). Verifique se houve problema no caixa ou redução de tráfego.`,
        action: 'Ver Dashboard',
        actionTab: 'dashboard',
        metric: `${changePercent.toFixed(1)}%`,
      });
    }
  }

  // Regra 2: Ticket médio subiu
  if (sales.yesterdayTicket > 0) {
    const ticketChange = ((sales.ticketMedio - sales.yesterdayTicket) / sales.yesterdayTicket) * 100;
    if (ticketChange > 15) {
      insights.push({
        id: 'ticket-up',
        type: 'opportunity',
        priority: 'medium',
        icon: '🎯',
        title: 'Ticket Médio em Alta',
        message: `Ticket médio subiu ${ticketChange.toFixed(0)}% (R$ ${sales.yesterdayTicket.toFixed(2)} → R$ ${sales.ticketMedio.toFixed(2)}). Estratégias de upsell estão funcionando!`,
        metric: `R$ ${sales.ticketMedio.toFixed(2)}`,
      });
    }
  }

  // Regra 3: Ticket médio caiu
  if (sales.yesterdayTicket > 0) {
    const ticketDrop = ((sales.ticketMedio - sales.yesterdayTicket) / sales.yesterdayTicket) * 100;
    if (ticketDrop < -15) {
      insights.push({
        id: 'ticket-down',
        type: 'warning',
        priority: 'medium',
        icon: '⚠️',
        title: 'Ticket Médio em Queda',
        message: `Ticket médio caiu ${Math.abs(ticketDrop).toFixed(0)}%. Considere oferecer combos ou produtos complementares na hora da compra.`,
        action: 'Configurar Ofertas',
        actionTab: 'tv-showcase',
      });
    }
  }

  // Regra 4: Faturamento subiu
  if (sales.yesterdayRevenue > 0) {
    const growth = ((sales.todayRevenue - sales.yesterdayRevenue) / sales.yesterdayRevenue) * 100;
    if (growth > 10) {
      insights.push({
        id: 'revenue-growth',
        type: 'info',
        priority: 'low',
        icon: '🎉',
        title: 'Faturamento em Alta!',
        message: `Faturamento cresceu ${growth.toFixed(0)}% vs ontem. Continue com as estratégias atuais!`,
        metric: `+${growth.toFixed(0)}%`,
      });
    }
  }

  // ═══ REGRAS DE ESTOQUE ═══

  const outOfStock = products.filter((p: any) => p.stock_quantity === 0 || p.currentStock === 0);
  const lowStock = products.filter((p: any) => {
    const stock = p.stock_quantity || p.currentStock || 0;
    const min = p.min_stock_quantity || p.minStock || 5;
    return stock > 0 && stock <= min;
  });

  // Regra 5: Estoque zero
  if (outOfStock.length > 0) {
    insights.push({
      id: 'out-of-stock',
      type: 'alert',
      priority: 'high',
      icon: '🚨',
      title: `${outOfStock.length} Produto(s) em Estoque Zero`,
      message: `Produtos sem estoque: ${outOfStock.slice(0, 3).map((p: any) => p.name).join(', ')}${outOfStock.length > 3 ? ` e mais ${outOfStock.length - 3}` : ''}. Vendas perdidas!`,
      action: 'Abrir Estoque',
      actionTab: 'inventory',
      metric: `${outOfStock.length}`,
    });
  }

  // Regra 6: Estoque baixo
  if (lowStock.length > 0) {
    insights.push({
      id: 'low-stock',
      type: 'warning',
      priority: lowStock.length > 3 ? 'high' : 'medium',
      icon: '📦',
      title: `${lowStock.length} Produto(s) com Estoque Baixo`,
      message: `${lowStock.slice(0, 3).map((p: any) => p.name).join(', ')} abaixo do estoque mínimo. Considere reabastecer.`,
      action: 'Abrir Estoque',
      actionTab: 'inventory',
    });
  }

  // Regra 7: Nenhum produto na TV
  const tvProducts = products.filter((p: any) => p.show_on_tv || p.showOnTV);
  if (tvProducts.length === 0 && products.length > 5) {
    insights.push({
      id: 'no-tv-products',
      type: 'info',
      priority: 'low',
      icon: '📺',
      title: 'Nenhuma Oferta Configurada',
      message: 'Nenhum produto está exibido na página de Ofertas/TV. Configure ofertas para atrair mais clientes.',
      action: 'Configurar Ofertas',
      actionTab: 'tv-showcase',
    });
  }

  // ═══ REGRAS FINANCEIRAS ═══

  // Regra 8: Contas a pagar atrasadas
  const overdue = financial.filter((f: any) => 
    f.type === 'expense' && f.status !== 'paid' && f.due_date <= today
  );
  if (overdue.length > 0) {
    const totalDue = overdue.reduce((sum: number, f: any) => sum + (parseFloat(f.amount) || 0), 0);
    insights.push({
      id: 'overdue-payable',
      type: 'alert',
      priority: 'high',
      icon: '🔴',
      title: `${overdue.length} Conta(s) Atrasada(s)`,
      message: `Total a pagar atrasado: R$ ${totalDue.toFixed(2)}. Risco de multa e negativação.`,
      action: 'Ver Financeiro',
      actionTab: 'finance',
      metric: `R$ ${totalDue.toFixed(2)}`,
    });
  }

  // Regra 9: Resumo diário
  insights.push({
    id: 'daily-summary',
    type: 'info',
    priority: 'low',
    icon: '📊',
    title: 'Resumo do Dia',
    message: `Faturamento: R$ ${sales.todayRevenue.toFixed(2)} | Vendas: ${sales.totalSales} | Ticket: R$ ${sales.ticketMedio.toFixed(2)} | Produtos: ${products.length} | Estoque baixo: ${lowStock.length}`,
  });

  // Ordenar por prioridade
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return insights.sort((a: any, b: any) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

// ─── HANDLER PRINCIPAL ─────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Buscar dados em paralelo
    const [salesToday, salesYesterday, products, financial] = await Promise.all([
      supabase.from('sales').select('total, created_at').gte('created_at', today),
      supabase.from('sales').select('total, created_at').gte('created_at', yesterday).lt('created_at', today),
      supabase.from('products').select('id, name, stock_quantity, min_stock_quantity, sale_price, cost_price, show_on_tv, is_active').eq('is_active', true),
      supabase.from('financial_transactions').select('type, amount, due_date, status'),
    ]);

    const todaySales = salesToday.data || [];
    const yesterdaySales = salesYesterday.data || [];
    const allProducts = products.data || [];
    const allFinancial = financial.data || [];

    // Montar dados para o motor de regras
    const salesData = {
      todayRevenue: todaySales.reduce((sum: number, s: any) => sum + (parseFloat(s.total) || 0), 0),
      yesterdayRevenue: yesterdaySales.reduce((sum: number, s: any) => sum + (parseFloat(s.total) || 0), 0),
      totalSales: todaySales.length,
      ticketMedio: todaySales.length > 0
        ? todaySales.reduce((sum: number, s: any) => sum + (parseFloat(s.total) || 0), 0) / todaySales.length
        : 0,
      yesterdayTicket: yesterdaySales.length > 0
        ? yesterdaySales.reduce((sum: number, s: any) => sum + (parseFloat(s.total) || 0), 0) / yesterdaySales.length
        : 0,
    };

    // Gerar insights
    const insights = generateInsights(salesData, allProducts, allFinancial);

    // Salvar no banco (upsert por data)
    const insightRecord = {
      id: `daily-${today}`,
      insights: insights,
      generated_at: new Date().toISOString(),
      today_revenue: salesData.todayRevenue,
      total_sales: salesData.totalSales,
      ticket_medio: salesData.ticketMedio,
    };

    const { error } = await supabase
      .from('ai_insights')
      .upsert(insightRecord, { onConflict: 'id' });

    if (error) {
      console.error('[generate-insights] Erro ao salvar:', error);
    }

    return new Response(JSON.stringify({
      success: true,
      insightCount: insights.length,
      generatedAt: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[generate-insights] Erro:', error?.message || error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
