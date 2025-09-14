# Coding Standards

## Core Standards
- **Languages & Runtimes:** Node.js 20.17.0, TypeScript 5.6.2
- **Style & Linting:** Basic ESLint, minimal Prettier
- **Test Organization:** Co-located `.test.ts` files

## Critical Rules
- **Use structured console logging:** `console.log(JSON.stringify({level, message, context}))`
- **All database queries must handle errors:** Basic try/catch around all DB operations
- **External API calls must have timeouts:** Use fetch with AbortController
- **Never expose internal errors to clients:** Always return generic error messages
