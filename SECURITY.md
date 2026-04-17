# Security Policy

## Supported versions

This project is pre-1.0 and receives best-effort security updates on the latest `main` branch.

## Reporting a vulnerability

Please report vulnerabilities privately via your repository hosting platform's private reporting feature.

Include:

- affected component/path
- reproduction steps
- potential impact
- suggested remediation (if available)

## Secret management expectations

- Never commit API tokens, credentials, or private keys.
- Use `.env.example` for placeholders only.
- Use OS-native secret storage integration for runtime secrets.

## Data handling

Meeting artifacts can include sensitive business data. Treat all local DB files and logs as confidential.
