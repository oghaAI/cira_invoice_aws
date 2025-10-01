import { extractStructured } from '../packages/api/src/services/llm/client';
import { z } from 'zod';

const ResultSchema = z.object({
  total: z.number().nullable()
});

async function main() {
  const markdown = process.argv.slice(2).join(' ');
  const result = await extractStructured(ResultSchema, { markdown });
  console.log(result);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
