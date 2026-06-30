# project-invoice

Invoice intake, OCR, and approval portal for transport company supplier invoices.

## Environment setup

Platform secrets (OAuth, Azure app, AI Gateway) are configured via environment variables — see **[docs/environment-setup.md](docs/environment-setup.md)**.

```bash
cp .env.example .env   # local dev — then fill in secrets
```

Per-tenancy config (O365 connection, mailbox, routing rules) is done in the application UI after deploy.

## Docs

- [Environment setup](docs/environment-setup.md)
- [Product Requirements (PRD)](docs/PRD.md)
- [Authentication (Shipeedo OAuth)](docs/auth.md)
- [Office 365 / Microsoft Graph](docs/o365.md)
