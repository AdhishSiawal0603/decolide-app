
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
  return METAFIELD_MAP[stageIndex] || null;
}

const fileToDataURI = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return `data:${file.type};base64,${buffer.toString('base64')}`;
}

const uploadImageToShopify = async (orderId: string, imageFile: File, metafieldKey: string) => {
  const storefrontId = `gid://shopify/Order/${orderId.split('-').pop()}`;
  const { SHOPIFY_STORE_NAME, SHOPIFY_ADMIN_API_ACCESS_TOKEN } = process.env;

  if (!SHOPIFY_STORE_NAME || !SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    throw new Error("Shopify store name or access token is not configured.");
  }
  
  const imageDataUri = await fileToDataURI(imageFile);

  const graphqlQuery = {
    query: `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            ... on GenericFile {
              id
              url
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
        contentType: imageFile.type.toUpperCase().replace('/', '_'),
        originalSource: imageDataUri,
      }
    }
  };

  const uploadResponse = await fetch(`https://${SHOPIFY_STORE_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_ACCESS_TOKEN,
      },
      body: JSON.stringify(graphqlQuery),
  });

  const uploadResult = await uploadResponse.json();
  
  if (uploadResult.errors || uploadResult.data?.fileCreate?.userErrors?.length > 0) {
    console.error("Shopify File Upload Error:", uploadResult.errors || uploadResult.data.fileCreate.userErrors);
    throw new Error('Failed to upload image to Shopify.');
  }

  const fileGid = uploadResult.data.fileCreate.files[0].id;

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

  const metafieldResponse = await fetch(`https://${SHOPIFY_STORE_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    },
    body: JSON.stringify(metafieldMutation),
  });

  const metafieldResult = await metafieldResponse.json();

  if (metafieldResult.errors || metafieldResult.data?.metafieldsSet?.userErrors?.length > 0) {
    console.error("Shopify Metafield Set Error:", metafieldResult.errors || metafieldResult.data.metafieldsSet.userErrors);
    throw new Error('Failed to set metafield in Shopify.');
  }

  return uploadResult.data.fileCreate.files[0].url;
}


export async function approveStageWithImage(orderId: string, currentStageIndex: number, imageFile: File) {
  const metafieldKey = getMetafieldForStage(currentStageIndex);
  
  if (!metafieldKey) {
     return { success: true, imageUrl: URL.createObjectURL(imageFile) };
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
