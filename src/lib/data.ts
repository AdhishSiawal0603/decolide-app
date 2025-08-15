import type { Order } from '@/lib/types';

const daysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

export const MOCK_ORDERS: Order[] = [
  {
    id: 'DF-1021',
    customerName: 'Elena Velez',
    productName: 'Velvet Dream Sofa',
    orderDate: daysAgo(15),
    currentStageIndex: 1, // Start at Order Placed
    stageEnteredAt: daysAgo(2),
    imageUrl: 'https://placehold.co/600x400.png',
  },
  {
    id: 'DF-1022',
    customerName: 'Marcus Holloway',
    productName: 'Oakwood Dining Table',
    orderDate: daysAgo(20),
    currentStageIndex: 2, // Frame Ready
    stageEnteredAt: daysAgo(5), // Stalled
  },
  {
    id: 'DF-1023',
    customerName: 'Anya Sharma',
    productName: 'Modernist Bookshelf',
    orderDate: daysAgo(8),
    currentStageIndex: 3, // Foaming/Fabric
    stageEnteredAt: daysAgo(1),
    imageUrl: 'https://placehold.co/600x400.png',
  },
  {
    id: 'DF-1024',
    customerName: 'Leo Gallagher',
    productName: 'Leather Armchair',
    orderDate: daysAgo(30),
    currentStageIndex: 4, // Dispatched
    stageEnteredAt: daysAgo(4), // Stalled
  },
  {
    id: 'DF-1025',
    customerName: 'Sofia Rossi',
    productName: 'Minimalist Coffee Table',
    orderDate: daysAgo(12),
    currentStageIndex: 5, // Delivered
    stageEnteredAt: daysAgo(1),
    imageUrl: 'https://placehold.co/600x400.png',
  },
  {
    id: 'DF-1026',
    customerName: 'Chen Wei',
    productName: 'Canopy Bed Frame',
    orderDate: daysAgo(5),
    currentStageIndex: 1, // Order Placed
    stageEnteredAt: daysAgo(4), // Stalled
  },
  {
    id: 'DF-1027',
    customerName: 'Isabella Costa',
    productName: 'Floating Wall Shelves',
    orderDate: daysAgo(18),
    currentStageIndex: 2, // Frame Ready
    stageEnteredAt: daysAgo(1),
  },
   {
    id: 'DF-1028',
    customerName: 'David Kim',
    productName: 'Ergonomic Office Chair',
    orderDate: daysAgo(25),
    currentStageIndex: 3, // Foaming/Fabric
    stageEnteredAt: daysAgo(6), // Stalled
  },
  {
    id: 'DF-1029',
    customerName: 'John Doe',
    productName: 'New Fancy Chair',
    orderDate: daysAgo(1),
    currentStageIndex: 0, // Order Received
    stageEnteredAt: daysAgo(1),
  }
];
