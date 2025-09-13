export const handler = async (event: any) => {
  console.log('LLM Extraction Handler - Event:', JSON.stringify(event, null, 2));

  try {
    // Get OCR results from previous step
    const { jobId, extractedText, status } = event;
    
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
        tax: 0.00,
        total: 1234.56
      },
      confidence: 0.92,
      tokensUsed: 1250,
      processingTime: '1.8s',
      timestamp: new Date().toISOString()
    };

    console.log('LLM Extraction Result:', JSON.stringify(llmResult, null, 2));

    return {
      statusCode: 200,
      body: llmResult
    };

  } catch (error) {
    console.error('Error in LLM extraction:', error);
    
    return {
      statusCode: 500,
      body: {
        jobId: event.jobId,
        status: 'llm_failed',
        error: 'LLM extraction failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    };
  }
};