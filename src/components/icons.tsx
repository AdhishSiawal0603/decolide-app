import type { Stage } from '@/lib/types';
import { Package, PackageCheck, Square, Scissors, Truck, CheckCircle2 } from 'lucide-react';

export const StageIcons: Record<Stage, React.ElementType> = {
  'Order Received': Package,
  'Order Placed': PackageCheck,
  'Frame Ready': Square,
  'Foaming/Fabric Done': Scissors,
  'Dispatched': Truck,
  'Delivered': CheckCircle2,
};
