'use client';

import { useState } from 'react';
import type { Order } from '@/lib/types';
import AppHeader from '@/components/app-header';
import OrderTabsView from '@/components/order-tabs-view';

interface DashboardProps {
  initialOrders: Order[];
}

export default function Dashboard({ initialOrders }: DashboardProps) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);

  return (
    <div className="flex flex-col h-screen">
      <AppHeader orders={orders} />
      <OrderTabsView orders={orders} setOrders={setOrders} />
    </div>
  );
}
