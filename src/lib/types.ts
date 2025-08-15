
export type Stage = 'Order Received' | 'Order Placed' | 'Frame Ready' | 'Foaming/Fabric Done' | 'Dispatched' | 'Delivered';

export const STAGES: Stage[] = ['Order Received', 'Order Placed', 'Frame Ready', 'Foaming/Fabric Done', 'Dispatched', 'Delivered'];

export type Order = {
  id: string; // Should correspond to the Shopify Order ID for API calls, e.g., "gid://shopify/Order/12345"
  customerName: string;
  productName: string;
  orderDate: string; 
  currentStageIndex: number;
  stageEnteredAt: string;
  imageUrl?: string;
};
