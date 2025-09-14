import type { CoreMessage } from '../client';

export function buildInvoiceExtractionPrompt(markdown: string): CoreMessage[] {
  const system = `You are a precise invoice extraction assistant.
- Only extract factual fields present in the input. Do not infer or hallucinate.
- If a field is missing, set it to null or an empty list as appropriate.
- Output strictly as JSON per the requested schema (no prose).`;

  const user = `Extract structured invoice data from the following OCR-converted markdown.
Return JSON only. Do not include any commentary.

--- BEGIN OCR MARKDOWN ---
${markdown}
--- END OCR MARKDOWN ---`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}
