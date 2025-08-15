
import Dashboard from '@/components/dashboard';
import { getShopifyOrders } from '@/lib/shopify';

export default async function Home() {
  const initialOrders = await getShopifyOrders();
  
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Dashboard initialOrders={initialOrders} />
    </main>
  );
}
