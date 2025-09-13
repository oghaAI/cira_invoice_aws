-- Sample seed data for development
INSERT INTO jobs (client_id, status, pdf_url)
VALUES
  ('client_dev_1', 'queued', 'https://example.com/invoices/1.pdf'),
  ('client_dev_1', 'processing', 'https://example.com/invoices/2.pdf'),
  ('client_dev_2', 'completed', 'https://example.com/invoices/3.pdf');

-- Optional corresponding job_results for completed jobs
INSERT INTO job_results (job_id, extracted_data, confidence_score, tokens_used)
SELECT id, '{"invoiceNumber":"INV-1001"}', 0.95, 1200
FROM jobs
WHERE status = 'completed'
ON CONFLICT (job_id) DO NOTHING;


