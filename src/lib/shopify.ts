
import type { Order } from '@/lib/types';
import { STAGES } from '@/lib/types';

// A type for the raw order data from Shopify to make it easier to work with.
type ShopifyOrder = {
  id: number;
  name: string; // e.g., #1001
  created_at: string;
  customer: {
    first_name: string;
    last_name: string;
  };
  line_items: {
    title: string;
  }[];
  metafields: {
      key: string;
      namespace: string;
      value: string;
  }[];
};

const STAGE_METAFIELD_MAP: { [key: string]: number } = {
  'stage_1_photo': 2, // Frame Ready
  'stage_2_photo': 3, // Foaming/Fabric Done
  'stage_3_photo': 4, // Dispatched
};


// This function transforms a single Shopify order into our app's Order format.
function transformShopifyOrder(order: ShopifyOrder): Order {
  const customerName = `${order.customer?.first_name || ''} ${order.customer?.last_name || 'N/A'}`.trim();
  const productName = order.line_items?.[0]?.title || 'Unknown Product';
  const orderId = order.name; // Use the readable order name like #1021
  
  let currentStageIndex = 1; // Default to 'Order Placed'
  let stageEnteredAt = order.created_at;
  let imageUrl = 'https://placehold.co/600x400.png';

  // Check metafields to determine the current stage
  if (order.metafields && order.metafields.length > 0) {
    let latestStage = 1;
    let latestImageUrl = imageUrl;

    const photoFields = order.metafields.filter(mf => 
        mf.namespace === 'custom' && STAGE_METAFIELD_MAP[mf.key]
    );

    if (photoFields.length > 0) {
        // Find the highest stage that has a photo
        const latestPhotoField = photoFields.reduce((latest, field) => {
            return STAGE_METAFIELD_MAP[field.key] > STAGE_METAFIELD_MAP[latest.key] ? field : latest;
        });

        const stageIndex = STAGE_METAFIELD_MAP[latestPhotoField.key];
        // The process is that uploading a photo approves the *previous* stage.
        // So if stage_1_photo exists, we are now IN stage 2 ('Frame Ready').
        // The photo approval moves it to the *next* stage.
        latestStage = stageIndex;
        // The value of the metafield is the GID of the file. We will need to query the file URL later if we want to display it.
        // For now, let's assume we have an image if the metafield exists.
        // In a real app, you'd make another API call to get the file URL from the GID.
        latestImageUrl = `https://placehold.co/600x400.png?text=Stage+${latestStage}+Approved`; 
    }
    
    currentStageIndex = latestStage;
    imageUrl = latestImageUrl;
    // In a real scenario, we would also store the timestamp of stage approval in another metafield.
    // For now, we'll just use the order creation date.
    stageEnteredAt = order.created_at;
  }
  
  // A simple check for delivered status (could be a tag or fulfillment status in a real app)
  // This is a placeholder for now.
  if (currentStageIndex === 4) { // If it was dispatched...
    // let's assume it gets delivered after 2 days for demo purposes
     const dispatchedDate = new Date(stageEnteredAt);
     if (new Date().getTime() > dispatchedDate.getTime() + 2 * 24 * 60 * 60 * 1000) {
         currentStageIndex = 5; // Delivered
     }
  }


  return {
    id: orderId,
    customerName,
    productName,
    orderDate: order.created_at,
    currentStageIndex,
    stageEnteredAt: stageEnteredAt,
    imageUrl,
  };
}


// Fetches the last 50 orders from your Shopify store.
export async function getShopifyOrders(): Promise<Order[]> {
  const { SHOPIFY_STORE_NAME, SHOPIFY_ADMIN_API_ACCESS_TOKEN } = process.env;

  if (!SHOPIFY_STORE_NAME || !SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    console.error("Shopify credentials are not set in .env file.");
    return [];
  }

  const shopifyApiUrl = `https://${SHOPIFY_STORE_NAME}.myshopify.com/admin/api/2024-04/orders.json?limit=50&status=any&sort=created_at&fields=id,name,created_at,customer,line_items`;
  
  try {
    const response = await fetch(shopifyApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_ACCESS_TOKEN,
      },
      cache: 'no-store', // Ensure we always get fresh data
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to fetch Shopify orders: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data: { orders: ShopifyOrder[] } = await response.json();
    
    if (!data.orders) {
        return [];
    }
    
    // In a production app, you might want to fetch metafields separately
    // as it can be more efficient if not all orders have them.
    // For simplicity here, we assume they might be included or we would fetch them.
    // The current `fields` param doesn't fetch them. We'd need GraphQL for that efficiently.
    // So for now, the stage will default to 'Order Placed'.
    
    const transformedOrders = data.orders.map(transformShopifyOrder);
    
    return transformedOrders;

  } catch (error) {
    console.error('Error fetching or transforming Shopify orders:', error);
    // Return an empty array or handle the error as appropriate for your app
    return [];
  }
}
