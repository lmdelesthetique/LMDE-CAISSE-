import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/cleanup-demo — delete demo/test data from all tables
export async function POST() {
  const supabase = createAdminClient();
  const log: string[] = [];
  const counts = { products: 0, clients: 0, tickets: 0, orders: 0 };

  // Demo products
  log.push('🔍 Recherche des produits de démonstration...');
  const { data: demoProds, error: prodErr } = await supabase
    .from('products')
    .select('id, name, ref')
    .or('ref.ilike.DEMO%,ref.ilike.TEST%,name.ilike.%demo%,name.ilike.%test%,name.ilike.%exemple%');

  if (!prodErr && demoProds) {
    counts.products = demoProds.length;
    if (demoProds.length > 0) {
      const ids = demoProds.map((p: any) => p.id);
      await supabase.from('products').delete().in('id', ids);
      log.push(`✅ ${demoProds.length} produit(s) démo supprimé(s)`);
    } else {
      log.push('ℹ️ Aucun produit démo détecté');
    }
  }

  // Demo clients
  log.push('🔍 Recherche des clients de démonstration...');
  const { data: demoClients } = await supabase
    .from('clients')
    .select('id')
    .or('email.ilike.%demo%,email.ilike.%test%,email.ilike.%exemple%,first_name.ilike.%demo%,first_name.ilike.%test%');

  if (demoClients && demoClients.length > 0) {
    counts.clients = demoClients.length;
    const ids = demoClients.map((c: any) => c.id);
    await supabase.from('clients').delete().in('id', ids);
    log.push(`✅ ${demoClients.length} client(s) démo supprimé(s)`);
  } else {
    log.push('ℹ️ Aucun client démo détecté');
  }

  // Demo tickets/sales
  log.push('🔍 Recherche des tickets de démonstration...');
  const { data: demoTickets } = await supabase
    .from('sales')
    .select('id')
    .ilike('notes', '%demo%');

  if (demoTickets && demoTickets.length > 0) {
    counts.tickets = demoTickets.length;
    const ids = demoTickets.map((t: any) => t.id);
    await supabase.from('sales').delete().in('id', ids);
    log.push(`✅ ${demoTickets.length} ticket(s) démo supprimé(s)`);
  } else {
    log.push('ℹ️ Aucun ticket démo détecté');
  }

  // Demo supplier orders
  log.push('🔍 Recherche des commandes fictives...');
  const { data: demoOrders } = await supabase
    .from('supplier_orders')
    .select('id')
    .ilike('notes', '%demo%');

  if (demoOrders && demoOrders.length > 0) {
    counts.orders = demoOrders.length;
    const ids = demoOrders.map((o: any) => o.id);
    await supabase.from('supplier_orders').delete().in('id', ids);
    log.push(`✅ ${demoOrders.length} commande(s) fictive(s) supprimée(s)`);
  } else {
    log.push('ℹ️ Aucune commande fictive détectée');
  }

  log.push('');
  log.push('✅ Nettoyage terminé. Les paramètres système sont intacts.');

  return NextResponse.json({ counts, log });
}
