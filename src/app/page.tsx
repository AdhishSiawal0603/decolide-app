import Dashboard from '@/components/dashboard';
import { MOCK_ORDERS } from '@/lib/data';

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Dashboard initialOrders={MOCK_ORDERS} />
    </main>
  );
}
