export const handler = async (event: any) => {
  console.log('LLM Extraction Handler - Event:', JSON.stringify(event, null, 2));

  try {
    // Get OCR results from previous step
    const { jobId } = event;
    // Accept status either at root (legacy) or nested under ocr (current workflow)
    const status: string | undefined = event?.status ?? event?.ocr?.status;

    if (!jobId) throw new Error('Missing jobId');
    if (status !== 'ocr_completed') {
      throw new Error('OCR processing not completed');
    }

    // Simulate LLM processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    const llmResult = {
      jobId,
      status: 'llm_completed',
      extractedData: {
        invoiceNumber: '12345',
        date: '2024-01-15',
        dueDate: '2024-02-14',
        amount: 1234.56,
        currency: 'USD',
        vendor: {
          name: 'ABC Company',
          address: '123 Business St, City, ST 12345',
          taxId: '12-3456789'
        },
        lineItems: [
          {
            description: 'Professional Services',
            quantity: 1,
            unitPrice: 1234.56,
            total: 1234.56
          }
        ],
        tax: 0.0,
        total: 1234.56
      },
      confidence: 0.92,
      tokensUsed: 1250,
      processingTime: '1.8s',
      timestamp: new Date().toISOString()
    };

    console.log('LLM Extraction Result:', JSON.stringify(llmResult, null, 2));
    // Return plain object for Step Functions chaining
    return llmResult;
  } catch (error) {
    console.error('Error in LLM extraction:', error);
    // Throw to trigger Step Functions retry/catch
    throw error;
  }
};
