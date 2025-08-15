
'use server';

import type { Order } from '@/lib/types';

type ShopifyOrderNode = {
  node: {
    id: string; // This will be the GID, e.g., "gid://shopify/Order/12345"
    name: string; // This is the readable name, e.g., "#1021"
    createdAt: string;
    customer: {
      firstName: string;
      lastName: string;
    };
    lineItems: {
      edges: {
        node: {
          title: string;
        };
      }[];
    };
    metafields: {
      edges: {
        node: {
          key: string;
          namespace: string;
          value: string;
          reference?: {
            image: {
              url: string;
            }
          }
        };
      }[];
    };
  };
};

// This map defines which metafield key corresponds to which stage index in our app.
const STAGE_METAFIELD_MAP: { [key: string]: number } = {
  'stage_1_photo': 2, // 'Frame Ready' is complete
  'stage_2_photo': 3, // 'Foaming/Fabric Done' is complete
  'stage_3_photo': 4, // 'Dispatched' is complete
};

function transformShopifyOrder(orderNode: ShopifyOrderNode): Order {
  const { node: order } = orderNode;
  const customerName = `${order.customer?.firstName || ''} ${order.customer?.lastName || 'N/A'}`.trim();
  const productName = order.lineItems.edges[0]?.node.title || 'Unknown Product';
  const orderId = order.name; 

  let currentStageIndex = 1; // Default to 'Order Placed'
  let latestStageCompletionDate = order.createdAt;
  let imageUrl = 'https://placehold.co/600x400.png'; // Default placeholder

  const photoMetafields = order.metafields.edges.filter(
    ({ node: mf }) => mf.namespace === 'custom' && STAGE_METAFIELD_MAP[mf.key]
  );
  
  // Find the most advanced stage the order has reached based on its metafields.
  if (photoMetafields.length > 0) {
    let latestStageIndex = 0;
    let latestImageUrl = imageUrl;

    photoMetafields.forEach(({ node: mf }) => {
        const stageIndexForMetafield = STAGE_METAFIELD_MAP[mf.key];
        // The presence of a metafield (e.g., stage_1_photo) means that stage (e.g., Frame Ready) is complete.
        // The *current* stage is the one *after* the latest completed stage.
        const currentStageForThisMetafield = stageIndexForMetafield + 1;
        
        if (currentStageForThisMetafield > latestStageIndex) {
            latestStageIndex = currentStageForThisMetafield;
            if (mf.reference?.image?.url) {
              latestImageUrl = mf.reference.image.url;
            }
            // A real app would have a 'completed_at' timestamp on the metafield.
            // For now, we'll just use the order creation date.
            latestStageCompletionDate = order.createdAt;
        }
    });

    currentStageIndex = latestStageIndex;
    imageUrl = latestImageUrl;
  }
  
  // A simple check for delivered status. A real app would check fulfillment status.
  // If the order was dispatched more than 5 days ago, mark it as Delivered.
  if (currentStageIndex === 5) { // If current stage is Dispatched
     const dispatchedDate = new Date(latestStageCompletionDate);
     if (new Date().getTime() > dispatchedDate.getTime() + 5 * 24 * 60 * 60 * 1000) {
         currentStageIndex = 6; // Delivered
     }
  }

  return {
    id: orderId,
    customerName,
    productName,
    orderDate: order.createdAt,
    currentStageIndex,
    stageEnteredAt: latestStageCompletionDate, 
    imageUrl,
  };
}

export async function getShopifyOrders(): Promise<Order[]> {
  const { SHOPIFY_STORE_NAME, SHOPIFY_ADMIN_API_ACCESS_TOKEN } = process.env;

  if (!SHOPIFY_STORE_NAME || !SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    // This error will be thrown during the build process or on the server if secrets are missing.
    // It will be caught by the page and displayed to the user.
    throw new Error("Application is not configured with Shopify credentials. Please check server secrets and .env file.");
  }

  const shopifyApiUrl = `https://${SHOPIFY_STORE_NAME}.myshopify.com/admin/api/2024-04/graphql.json`;

  const graphqlQuery = {
    query: `
      query getOrders {
        orders(first: 50, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              customer {
                firstName
                lastName
              }
              lineItems(first: 1) {
                edges {
                  node {
                    title
                  }
                }
              }
              metafields(first: 10, namespace: "custom") {
                edges {
                  node {
                    key
                    namespace
                    value
                    reference {
                       ... on MediaImage {
                        image {
                          url
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
  };

  try {
    const response = await fetch(shopifyApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_ACCESS_TOKEN,
      },
      body: JSON.stringify(graphqlQuery), // This was the missing piece
      cache: 'no-store', 
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Shopify API Error: ${response.status} ${response.statusText}. Response: ${errorBody}`);
    }

    const jsonResponse = await response.json();
    
    if (jsonResponse.errors) {
        throw new Error(`Shopify GraphQL Error: ${jsonResponse.errors[0].message}`);
    }
    
    const orderEdges = jsonResponse.data?.orders?.edges;

    if (!orderEdges) {
      return [];
    }

    const transformedOrders = orderEdges.map(transformShopifyOrder);
    return transformedOrders;

  } catch (error) {
    console.error('Failed to fetch Shopify orders:', error);
    // Re-throw the error so the page can display a helpful message.
    throw error;
  }
}
