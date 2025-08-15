
import Dashboard from '@/components/dashboard';
import { getShopifyOrders } from '@/lib/shopify';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

export default async function Home() {
  let initialOrders = [];
  let errorMessage = null;

  try {
    initialOrders = await getShopifyOrders();
  } catch (error) {
    console.error(error); // Log the full error on the server
    errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while fetching orders.';
  }
  
  if (errorMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
          <Alert variant="destructive" className="max-w-lg">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Application Error</AlertTitle>
            <AlertDescription>
              <p>The application could not connect to Shopify to fetch orders. This can happen for a few reasons:</p>
              <ul className="list-disc list-inside my-2">
                <li>Your local `.env` file might be missing or have incorrect values.</li>
                <li>On the live server, the secrets might not be configured correctly in Secret Manager or connected in `apphosting.yaml`.</li>
                <li>The App Hosting service account may not have permission to access secrets.</li>
              </ul>
              <p className="mt-2 font-mono bg-destructive/20 p-2 rounded-md text-xs">
                <strong>Error details:</strong> {errorMessage}
              </p>
               <p className="mt-3 text-xs">
                Please double-check your configuration. If running locally, check your `.env` file. If this is on the live server, ensure secrets are set, `apphosting.yaml` is correct, and the service account has the "Secret Manager Secret Accessor" role.
              </p>
            </AlertDescription>
          </Alert>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Dashboard initialOrders={initialOrders} />
    </main>
  );
}
