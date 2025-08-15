
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Order } from '@/lib/types';
import { STAGES } from '@/lib/types';
import { approveStageWithImage } from '@/app/actions';
import { useToast } from "@/hooks/use-toast";


interface OrderCardProps {
  order: Order;
  onApproveStage: (orderId: string, imageUrl: string | null) => void;
}

const STAGES_REQUIRING_PHOTO = [2, 3, 4]; // Frame Ready, Foaming/Fabric Done, Dispatched

export default function OrderCard({ order, onApproveStage }: OrderCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const daysInStage = useMemo(() => {
    return (new Date().getTime() - new Date(order.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24);
  }, [order.stageEnteredAt]);

  const isStalled = daysInStage > 3 && order.currentStageIndex < STAGES.length - 1;
  
  // The photo is required for the stage we are currently IN.
  const photoIsRequired = STAGES_REQUIRING_PHOTO.includes(order.currentStageIndex);

  const handleApproveClick = () => {
    if (order.currentStageIndex >= STAGES.length - 1) return;
    setIsDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleConfirmApproval = async () => {
    if (photoIsRequired && !imageFile) {
      setError('Image upload is mandatory to approve this stage.');
      return;
    }

    setIsUploading(true);
    setError(null);
    
    const result = await approveStageWithImage(order.id, order.currentStageIndex, imageFile);
    
    if (result.success) {
        toast({
          title: "Success",
          description: `Stage approved. Moving to next stage.`,
        });
        onApproveStage(order.id, result.imageUrl);
    } else {
        setError(result.error || 'Failed to approve stage.');
        toast({
          variant: "destructive",
          title: "Approval Failed",
          description: result.error || 'An unknown error occurred.',
        });
    }
    
    setIsUploading(false);
    setIsDialogOpen(false);
    setImageFile(null);
  };

  const progressValue = ((order.currentStageIndex) / (STAGES.length -1)) * 100;
  
  return (
    <>
      <Card className={cn("shadow-md hover:shadow-lg transition-shadow duration-300", isStalled && "border-destructive/50 ring-2 ring-destructive/20")}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>{order.id}</span>
            {isStalled && (
              <span className="group relative">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                 <span className="absolute bottom-full mb-2 w-max px-2 py-1 bg-gray-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  Stalled for {Math.floor(daysInStage)} days
                </span>
              </span>
            )}
          </CardTitle>
          <CardDescription>{order.productName}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{order.customerName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            In stage for: {formatDistanceToNow(new Date(order.stageEnteredAt), { addSuffix: false })}
          </p>
           <img src={order.imageUrl} alt="Order proof" className="mt-2 rounded-md" data-ai-hint="product manufacturing"/>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-4">
          <div className="w-full text-center text-sm font-medium text-muted-foreground">{STAGES[order.currentStageIndex]}</div>
          <Progress value={progressValue} className={cn(progressValue === 100 && "[&>div]:bg-accent")} />
          {order.currentStageIndex < STAGES.length - 1 && (
            <Button onClick={handleApproveClick} size="sm" className="w-full">
              Approve & Move to Next Stage
            </Button>
          )}
          {order.currentStageIndex === STAGES.length - 1 && (
             <p className="text-sm font-medium text-accent-foreground p-2 bg-accent/20 rounded-md w-full text-center">Delivered Successfully</p>
          )}
        </CardFooter>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve: {STAGES[order.currentStageIndex]}</DialogTitle>
            <DialogDescription>
               {photoIsRequired 
                  ? <>Upload an image to approve this stage. This will move the order to the next stage: <span className="font-semibold text-primary">{STAGES[order.currentStageIndex + 1]}</span>.</>
                  : <>Approve this stage to move the order to <span className="font-semibold text-primary">{STAGES[order.currentStageIndex + 1]}</span>.</>
              }
            </DialogDescription>
          </DialogHeader>
          {photoIsRequired && (
            <div className="grid w-full max-w-sm items-center gap-1.5 py-4">
              <Label htmlFor="picture">Upload Stage Image</Label>
              <Input id="picture" type="file" onChange={handleFileChange} accept="image/*" disabled={isUploading}/>
              {error && <p className="text-sm text-destructive mt-2">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isUploading}>Cancel</Button>
            <Button onClick={handleConfirmApproval} disabled={isUploading || (photoIsRequired && !imageFile)}>
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isUploading ? 'Uploading...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
