# OPERATOR INPUTS — sdm-llm-gateway

Operator-owned setup and policy decisions live here.

## Needs Operator Action (open)

### OI-001 · Turn on Google sign-in for LLM Gateway

- **Added:** 2026-08-01

- **Why it matters:** The code is deployed and waiting. Until these are set, the Continue with Google button does not appear and LLM Gateway still needs its password. Once set, your Google account signs you in and there is no password to forget.
- **Where:** Coolify, in your browser — the LLM Gateway application, Environment Variables tab. Do this after you have the two values from the SDM Login Google project.
- **Time:** 3 minutes
- **Cost:** none

**Steps**

1. Open Coolify, pick the LLM Gateway application, then Environment Variables
2. Add a variable named AUTH_GOOGLE_CLIENT_ID and paste the Client ID (it ends in .apps.googleusercontent.com)
   ```
   AUTH_GOOGLE_CLIENT_ID
   ```
3. Add a variable named AUTH_GOOGLE_CLIENT_SECRET and paste the Client secret (it starts with GOCSPX-)
   ```
   AUTH_GOOGLE_CLIENT_SECRET
   ```
4. Add a variable named ADMIN_EMAILS set to your email address. This is the list of who is allowed in. If it is blank, NOBODY can sign in with Google — that is deliberate.
   ```
   ADMIN_EMAILS=sanddollarmanagementllc@gmail.com
   ```
5. Click Redeploy. An environment variable change does nothing until the app restarts.
6. Open the login page and check for the button
   ```
   https://llm.sanddollarmanagementllc.com/login
   ```

**What you'll see:** A Continue with Google button above the email and password boxes. Clicking it takes you to Google, then straight into LLM Gateway with no password.

**Done when:** http-ok: https://llm.sanddollarmanagementllc.com
