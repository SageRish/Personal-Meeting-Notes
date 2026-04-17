# Contributing

Thanks for contributing to Personal Meeting Notes.

## Development workflow

1. Fork/branch from `main`.
2. Install dependencies with `npm install`.
3. Create/update tests for your change.
4. Run quality checks locally:

```bash
npm run lint
npm run typecheck
npm run test
```

5. Open a PR with:
   - clear summary
   - linked issue (if applicable)
   - testing notes

## Commit conventions

- Use focused, atomic commits.
- Prefer descriptive commit subjects (imperative mood).

## Code standards

- TypeScript strict mode is enforced.
- Keep secrets out of source and tests.
- Prefer small, composable units with explicit interfaces.

## Pull request checklist

- [ ] Tests added/updated
- [ ] Lint/typecheck/test pass
- [ ] Docs updated (README or package docs)
- [ ] No secrets committed
