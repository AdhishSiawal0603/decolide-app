
'use server';

import { summarizeStalledOrders } from '@/ai/flows/summarize-stalled-orders';
import type { Order } from '@/lib/types';
import { STAGES } from '@/lib/types';
import { z } from 'zod';

export async function getStalledOrdersSummary(stalledOrders: Order[]) {
  if (stalledOrders.length === 0) {
    return { summary: 'No orders are currently stalled. Great job!' };
  }

  try {
    const stalledOrdersData = JSON.stringify(
      stalledOrders.map(order => ({
        orderId: order.id,
        currentStage: STAGES[order.currentStageIndex],
        timeSinceLastUpdate: `${Math.floor((new Date().getTime() - new Date(order.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24))} days`,
      }))
    );

    const result = await summarizeStalledOrders({ stalledOrdersData });
    return result;
  } catch (error) {
    console.error('Error generating summary:', error);
    if (error instanceof Error) {
        return { summary: `An error occurred while generating the summary: ${error.message}` };
    }
    return { summary: 'An unknown error occurred while generating the summary. Please try again.' };
  }
}

const METAFIELD_MAP: { [key: number]: string } = {
  2: 'custom.stage_1_photo', // Frame Ready
  3: 'custom.stage_2_photo', // Foaming/Fabric Done
  4: 'custom.stage_3_photo', // Dispatched
};

const getMetafieldForStage = (stageIndex: number) => {
  // We upload proof for completing the *previous* stage.
  // When we are IN stage "Frame Ready" (index 2), we upload proof for it.
  // That proof is 'stage_1_photo'.
  return METAFIELD_MAP[stageIndex] || null;
}

const fileToDataURI = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return `data:${file.type};base64,${buffer.toString('base64')}`;
}

const uploadImageToShopify = async (orderId: string, imageFile: File, metafieldKey: string) => {
  // orderId is the human-readable one like #1021. We need the GID for the API.
  // This is a temporary solution. A better approach would be to pass the GID from the component.
  // For now, we will assume the GID can be constructed, which is NOT robust.
  // Let's fetch the GID based on the order name.

  const { SHOPIFY_STORE_NAME, SHOPIFY_ADMIN_API_ACCESS_TOKEN } = process.env;
  if (!SHOPIFY_STORE_NAME || !SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    throw new Error("Shopify store name or access token is not configured.");
  }
  const shopifyApiUrl = `https://${SHOPIFY_STORE_NAME}.myshopify.com/admin/api/2024-04/graphql.json`;
  
  const getOrderGidQuery = {
    query: `query { orders(first: 1, query:"name:${orderId}") { edges { node { id } } } }`
  };

  const gidResponse = await fetch(shopifyApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_ACCESS_TOKEN,
      },
      body: JSON.stringify(getOrderGidQuery),
  });

  const gidResult = await gidResponse.json();
  const storefrontId = gidResult.data?.orders?.edges[0]?.node?.id;

  if (!storefrontId) {
    throw new Error(`Could not find Shopify Order GID for order name ${orderId}`);
  }
  
  const imageDataUri = await fileToDataURI(imageFile);

  const graphqlQuery = {
    query: `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            ... on MediaImage {
              id
              image {
                  url
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    variables: {
      files: {
        contentType: 'IMAGE',
        originalSource: imageDataUri,
      }
    }
  };

  const uploadResponse = await fetch(shopifyApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_ACCESS_TOKEN,
      },
      body: JSON.stringify(graphqlQuery),
  });

  const uploadResult = await uploadResponse.json();
  
  if (uploadResult.errors || uploadResult.data?.fileCreate?.userErrors?.length > 0) {
    console.error("Shopify File Upload Error:", JSON.stringify(uploadResult.errors || uploadResult.data.fileCreate.userErrors, null, 2));
    throw new Error('Failed to upload image to Shopify.');
  }

  const fileGid = uploadResult.data.fileCreate.files[0].id;
  const newImageUrl = uploadResult.data.fileCreate.files[0].image.url;

  const metafieldMutation = {
    query: `
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
            value
          }
          userErrors {
            field
            message
          }
        }
      }`,
    variables: {
      metafields: [
        {
          key: metafieldKey.split('.')[1],
          namespace: metafieldKey.split('.')[0],
          ownerId: storefrontId,
          type: "file_reference",
          value: fileGid,
        }
      ]
    }
  };

  const metafieldResponse = await fetch(shopifyApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    },
    body: JSON.stringify(metafieldMutation),
  });

  const metafieldResult = await metafieldResponse.json();

  if (metafieldResult.errors || metafieldResult.data?.metafieldsSet?.userErrors?.length > 0) {
    console.error("Shopify Metafield Set Error:", JSON.stringify(metafieldResult.errors || metafieldResult.data.metafieldsSet.userErrors, null, 2));
    throw new Error('Failed to set metafield in Shopify.');
  }

  return newImageUrl;
}


export async function approveStageWithImage(orderId: string, currentStageIndex: number, imageFile: File | null) {
  // When we are at a stage, clicking "Approve" means we are completing it and moving to the next.
  // The photo is proof of the stage we are *currently* in.
  const stageToComplete = currentStageIndex;
  const metafieldKey = getMetafieldForStage(stageToComplete);
  
  if (!metafieldKey || !imageFile) {
     // No image upload required or no file provided, just advance the stage locally.
     // This handles stages like 'Order Placed' -> 'Frame Ready' (index 1 -> 2)
     // A photo is required for stage 2, but not for stage 1.
     if (imageFile) {
        return { success: true, imageUrl: URL.createObjectURL(imageFile) };
     }
     return { success: true, imageUrl: null };
  }

  try {
    const imageUrl = await uploadImageToShopify(orderId, imageFile, metafieldKey);
    return { success: true, imageUrl };
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred during image upload.';
    return { success: false, error: message };
  }
}
