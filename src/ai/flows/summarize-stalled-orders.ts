'use server';

/**
 * @fileOverview Summarizes stalled orders using AI, providing a concise summary of orders that have not progressed within the expected timeframe.
 *
 * - summarizeStalledOrders - A function to generate the summary of stalled orders.
 * - SummarizeStalledOrdersInput - The input type for the summarizeStalledOrders function.
 * - SummarizeStalledOrdersOutput - The return type for the summarizeStalledOrders function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeStalledOrdersInputSchema = z.object({
  stalledOrdersData: z.string().describe('JSON string containing details of orders stalled at various stages, including order ID, current stage, and time since last update.'),
});
export type SummarizeStalledOrdersInput = z.infer<typeof SummarizeStalledOrdersInputSchema>;

const SummarizeStalledOrdersOutputSchema = z.object({
  summary: z.string().describe('A concise summary of stalled orders, highlighting key bottlenecks and potential issues in the manufacturing process.'),
});
export type SummarizeStalledOrdersOutput = z.infer<typeof SummarizeStalledOrdersOutputSchema>;

export async function summarizeStalledOrders(input: SummarizeStalledOrdersInput): Promise<SummarizeStalledOrdersOutput> {
  return summarizeStalledOrdersFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeStalledOrdersPrompt',
  input: {schema: SummarizeStalledOrdersInputSchema},
  output: {schema: SummarizeStalledOrdersOutputSchema},
  prompt: `You are a production manager tasked with identifying and addressing bottlenecks in a furniture manufacturing process. Given the following data about orders stalled at various stages, generate a concise summary highlighting key issues and potential areas for improvement.  The data is provided in JSON format.

Stalled Orders Data: {{{stalledOrdersData}}}

Focus on extracting patterns or trends related to the stalled orders.  For example, are orders frequently stalling at a specific stage?  How long, on average, are orders delayed?
`,
});

const summarizeStalledOrdersFlow = ai.defineFlow(
  {
    name: 'summarizeStalledOrdersFlow',
    inputSchema: SummarizeStalledOrdersInputSchema,
    outputSchema: SummarizeStalledOrdersOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
