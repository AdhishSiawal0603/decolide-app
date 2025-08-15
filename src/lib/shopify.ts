
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

const STAGE_METAFIELD_MAP: { [key: string]: number } = {
  'stage_1_photo': 2, // Frame Ready
  'stage_2_photo': 3, // Foaming/Fabric Done
  'stage_3_photo': 4, // Dispatched
};

function transformShopifyOrder(orderNode: ShopifyOrderNode): Order {
  const { node: order } = orderNode;
  const customerName = `${order.customer?.firstName || ''} ${order.customer?.lastName || 'N/A'}`.trim();
  const productName = order.lineItems.edges[0]?.node.title || 'Unknown Product';
  
  // The GID format is what we need for subsequent API calls.
  // We'll use the readable name for display.
  const orderId = order.name; 

  let currentStageIndex = 1; // Default to 'Order Placed'
  let stageEnteredAt = order.createdAt;
  let imageUrl = 'https://placehold.co/600x400.png';

  const photoMetafields = order.metafields.edges.filter(
    ({ node: mf }) => mf.namespace === 'custom' && STAGE_METAFIELD_MAP[mf.key]
  );
  
  if (photoMetafields.length > 0) {
    const latestMetafield = photoMetafields.reduce((latest, current) => {
      const latestStage = STAGE_METAFIELD_MAP[latest.node.key];
      const currentStage = STAGE_METAFIELD_MAP[current.node.key];
      return currentStage > latestStage ? current : latest;
    });

    // The presence of `stage_X_photo` means stage X+1 is complete.
    // So the current stage is (X+1)+1.
    // e.g. `stage_1_photo` means stage 2 ('Frame Ready') is complete, so the current stage is 3 ('Foaming/Fabric Done')
    // Let's fix this logic.
    // The presence of a metafield indicates the completion of that stage.
    // stage_1_photo means 'Frame Ready' is done. The current stage is 'Foaming/Fabric Done'.
    
    let latestStageIndex = 0;
    let latestImageUrl = imageUrl;
    
    photoMetafields.forEach(({node: mf}) => {
        const stageIndexForMetafield = STAGE_METAFIELD_MAP[mf.key];
        if (stageIndexForMetafield > latestStageIndex) {
            latestStageIndex = stageIndexForMetafield;
            // The value of a file reference metafield is a GID. We need the resolved URL.
            if (mf.reference?.image?.url) {
              latestImageUrl = mf.reference.image.url;
            }
        }
    });

    currentStageIndex = latestStageIndex;
    imageUrl = latestImageUrl;
  } else {
    // If no custom metafields are found, we assume the order is newly placed.
    currentStageIndex = 1; // 'Order Placed'
  }
  
  // Simple check for delivered status (this is a placeholder)
  // A real app would check fulfillment status.
  if (currentStageIndex === 4) {
     const dispatchedDate = new Date(stageEnteredAt);
     if (new Date().getTime() > dispatchedDate.getTime() + 2 * 24 * 60 * 60 * 1000) {
         currentStageIndex = 5; // Delivered
     }
  }

  // Final check: if an order has no metafields, it must be in "Order Placed"
  const hasCustomMetafields = order.metafields.edges.some(({node: mf}) => mf.namespace === 'custom' && mf.key.startsWith('stage_'));
  if (!hasCustomMetafields) {
      currentStageIndex = 1; // Order Placed
  }


  return {
    id: orderId,
    customerName,
    productName,
    orderDate: order.createdAt,
    currentStageIndex,
    stageEnteredAt: stageEnteredAt, 
    imageUrl,
  };
}

export async function getShopifyOrders(): Promise<Order[]> {
  const { SHOPIFY_STORE_NAME, SHOPIFY_ADMIN_API_ACCESS_TOKEN } = process.env;

  if (!SHOPIFY_STORE_NAME || !SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    console.error("Shopify credentials are not set in .env file.");
    return [];
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
      body: JSON.stringify(graphqlQuery),
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to fetch Shopify orders: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const jsonResponse = await response.json();
    
    if (jsonResponse.errors) {
        console.error("GraphQL Errors:", JSON.stringify(jsonResponse.errors, null, 2));
        throw new Error("Error executing GraphQL query.");
    }
    
    const orderEdges = jsonResponse.data?.orders?.edges;

    if (!orderEdges) {
      console.log("No orders found in the Shopify response.");
      return [];
    }

    const transformedOrders = orderEdges.map(transformShopifyOrder);
    return transformedOrders;

  } catch (error) {
    console.error('Error fetching or transforming Shopify orders:', error);
    return [];
  }
}
