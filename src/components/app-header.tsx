'use client';

import { useState } from 'react';
import { Layers, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Order } from '@/lib/types';
import { getStalledOrdersSummary } from '@/app/actions';

interface AppHeaderProps {
  orders: Order[];
}

export default function AppHeader({ orders }: AppHeaderProps) {
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const handleGetSummary = async () => {
    setLoadingSummary(true);
    const stalledOrders = orders.filter(order => {
        if (order.currentStageIndex >= 5) return false; // Don't count delivered orders
        const daysInStage = (new Date().getTime() - new Date(order.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysInStage > 3;
    });

    try {
      const result = await getStalledOrdersSummary(stalledOrders);
      setSummary(result.summary);
    } catch (error) {
      setSummary("Failed to generate summary. Please try again later.");
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <>
      <header className="flex items-center justify-between p-4 border-b bg-card shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary text-primary-foreground">
            <Layers className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Decolide Order Processing
          </h1>
        </div>
        <Button onClick={handleGetSummary} disabled={loadingSummary}>
          <Sparkles className="mr-2 h-4 w-4" />
          {loadingSummary ? 'Generating...' : 'Get AI Summary'}
        </Button>
      </header>

      <AlertDialog open={!!summary} onOpenChange={() => setSummary(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stalled Orders Summary</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground whitespace-pre-wrap">
              {summary}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setSummary(null)}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
