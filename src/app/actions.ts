
'use server';

import { summarizeStalledOrders } from '@/ai/flows/summarize-stalled-orders';
import type { Order } from '@/lib/types';
import { STAGES } from '@/lib/types';
import { z } from 'zod';

import { config } from 'dotenv';
config();

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

// Maps the stage we are *in* to the metafield key that provides proof for it.
const METAFIELD_MAP: { [key: number]: string } = {
  2: 'custom.stage_1_photo', // To prove 'Frame Ready' (index 2) is done, we need 'stage_1_photo'.
  3: 'custom.stage_2_photo', // To prove 'Foaming/Fabric' (index 3) is done, we need 'stage_2_photo'.
  4: 'custom.stage_3_photo', // To prove 'Dispatched' (index 4) is done, we need 'stage_3_photo'.
};

const getMetafieldForStage = (stageIndex: number) => {
  return METAFIELD_MAP[stageIndex] || null;
}

const fileToDataURI = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return `data:${file.type};base64,${buffer.toString('base64')}`;
}

const uploadImageToShopify = async (orderId: string, imageFile: File, metafieldKey: string) => {
  const { SHOPIFY_STORE_NAME, SHOPIFY_ADMIN_API_ACCESS_TOKEN } = process.env;
  if (!SHOPIFY_STORE_NAME || !SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    throw new Error("Shopify store name or access token is not configured in the environment.");
  }
  const shopifyApiUrl = `https://${SHOPIFY_STORE_NAME}.myshopify.com/admin/api/2024-04/graphql.json`;
  
  // Step 1: Find the Order's global ID (GID) from its readable name (e.g., "#1021")
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
    throw new Error(`Could not find Shopify Order GID for order name ${orderId}. Ensure the order exists.`);
  }
  
  // Step 2: Upload the image file to Shopify to create a MediaImage record
  const imageDataUri = await fileToDataURI(imageFile);

  const fileCreateMutation = {
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
      body: JSON.stringify(fileCreateMutation),
  });

  const uploadResult = await uploadResponse.json();
  
  if (uploadResult.errors || uploadResult.data?.fileCreate?.userErrors?.length > 0) {
    console.error("Shopify File Upload Error:", JSON.stringify(uploadResult.errors || uploadResult.data.fileCreate.userErrors, null, 2));
    throw new Error('Failed to upload image to Shopify.');
  }

  const fileGid = uploadResult.data.fileCreate.files[0].id;
  const newImageUrl = uploadResult.data.fileCreate.files[0].image.url;

  // Step 3: Create or update a metafield on the order to link to the new MediaImage
  const metafieldSetMutation = {
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
          value: fileGid, // Link the metafield to the uploaded file's GID
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
    body: JSON.stringify(metafieldSetMutation),
  });

  const metafieldResult = await metafieldResponse.json();

  if (metafieldResult.errors || metafieldResult.data?.metafieldsSet?.userErrors?.length > 0) {
    console.error("Shopify Metafield Set Error:", JSON.stringify(metafieldResult.errors || metafieldResult.data.metafieldsSet.userErrors, null, 2));
    throw new Error('Failed to set metafield in Shopify.');
  }

  return newImageUrl;
}


export async function approveStageWithImage(orderId: string, currentStageIndex: number, imageFile: File | null) {
  // Clicking "Approve" for a stage means we are completing it and providing proof.
  const stageToComplete = currentStageIndex;
  const metafieldKey = getMetafieldForStage(stageToComplete);
  
  // If no metafield is associated with this stage, or no image was provided when one was needed,
  // we can't proceed with an upload.
  // This handles the transition from "Order Placed" -> "Frame Ready" which doesn't require a photo to be uploaded.
  if (!metafieldKey || !imageFile) {
     if (imageFile) {
        // Create a local URL for instant UI feedback, even though it's not a real Shopify URL.
        return { success: true, imageUrl: URL.createObjectURL(imageFile) };
     }
     return { success: true, imageUrl: null }; // No image involved, just advance stage locally.
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
