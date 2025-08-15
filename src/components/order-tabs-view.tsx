
'use client';

import { useMemo } from 'react';
import type { Order } from '@/lib/types';
import { STAGES } from '@/lib/types';
import OrderCard from '@/components/order-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle } from 'lucide-react';

interface OrderTabsViewProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
}

export default function OrderTabsView({ orders, setOrders }: OrderTabsViewProps) {
  const handleApproveStage = (orderId: string, imageUrl: string | null) => {
    setOrders(prevOrders =>
      prevOrders.map(order => {
        if (order.id === orderId && order.currentStageIndex < STAGES.length - 1) {
          return {
            ...order,
            currentStageIndex: order.currentStageIndex + 1,
            stageEnteredAt: new Date().toISOString(),
            // Only update image url if a new one was provided
            imageUrl: imageUrl || order.imageUrl,
          };
        }
        return order;
      })
    );
  };
  
  const stalledOrders = useMemo(() => {
    return orders.filter(order => {
        const daysInStage = (new Date().getTime() - new Date(order.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysInStage > 3 && order.currentStageIndex < STAGES.length - 1;
    });
  }, [orders]);


  return (
    <div className="flex-1 p-4 lg:p-6">
      <Tabs defaultValue="Order Placed" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
            <TabsTrigger value="Stalled">
                <AlertTriangle className="mr-2 h-4 w-4 text-destructive" /> Stalled ({stalledOrders.length})
            </TabsTrigger>
          {STAGES.map((stage, index) => {
             const ordersInStage = orders.filter(o => o.currentStageIndex === index);
            return (
              <TabsTrigger key={stage} value={stage}>
                {stage} ({ordersInStage.length})
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value="Stalled">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 py-4">
                {stalledOrders.map(order => (
                    <OrderCard
                        key={order.id}
                        order={order}
                        onApproveStage={handleApproveStage}
                    />
                ))}
             </div>
             {stalledOrders.length === 0 && (
                <div className="flex justify-center items-center h-48">
                    <p className="text-muted-foreground">No stalled orders.</p>
                </div>
            )}
        </TabsContent>
        {STAGES.map((stage, index) => (
          <TabsContent key={stage} value={stage}>
             {orders.filter(order => order.currentStageIndex === index).length === 0 ? (
                <div className="flex justify-center items-center h-48">
                    <p className="text-muted-foreground">No orders in this stage.</p>
                </div>
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 py-4">
                {orders
                    .filter(order => order.currentStageIndex === index)
                    .map(order => (
                    <OrderCard
                        key={order.id}
                        order={order}
                        onApproveStage={handleApproveStage}
                    />
                    ))}
                </div>
             )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
