export const handler = async (event: any) => {
  console.log('OCR Processing Handler - Event:', JSON.stringify(event, null, 2));

  // Simulate OCR processing
  const { jobId, pdfUrl } = event;
  try {
    if (!jobId || !pdfUrl) {
      throw new Error('Missing jobId or pdfUrl');
    }
    // Placeholder OCR processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const ocrResult = {
      jobId,
      status: 'ocr_completed',
      extractedText:
        'Invoice #12345\nDate: 2024-01-15\nAmount: $1,234.56\nVendor: ABC Company\n(Placeholder OCR extraction)',
      confidence: 0.95,
      pageCount: 1,
      processingTime: '1.2s',
      timestamp: new Date().toISOString()
    };

    console.log('OCR Result:', JSON.stringify(ocrResult, null, 2));
    // Return plain object for Step Functions chaining
    return ocrResult;
  } catch (error) {
    console.error('Error in OCR processing:', error);
    // Throw to trigger Step Functions retry/catch
    throw error;
  }
};
