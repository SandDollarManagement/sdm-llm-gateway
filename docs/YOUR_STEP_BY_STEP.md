# Your step-by-step — sdm-llm-gateway

> Generated file — do not edit by hand. It is rebuilt from `docs/OPERATOR_INPUTS.md`
> every time that file changes, so anything typed here would be overwritten.
>
> Last built: 2026-08-04

**One thing for you to do.**

## 1. Turn on Google sign-in for LLM Gateway *(OI-001)*

**Why this matters:** The code is deployed and waiting. Until these are set, the Continue with Google button does not appear and LLM Gateway still needs its password. Once set, your Google account signs you in and there is no password to forget.

**Where you do it:** Coolify, in your browser — the LLM Gateway application, Environment Variables tab. Do this after you have the two values from the SDM Login Google project.

*3 minutes · cost: none*

**1.** Open Coolify, pick the LLM Gateway application, then Environment Variables

**2.** Add a variable named AUTH_GOOGLE_CLIENT_ID and paste the Client ID (it ends in .apps.googleusercontent.com)

```
AUTH_GOOGLE_CLIENT_ID
```

**3.** Add a variable named AUTH_GOOGLE_CLIENT_SECRET and paste the Client secret (it starts with GOCSPX-)

```
AUTH_GOOGLE_CLIENT_SECRET
```

**4.** Add a variable named ADMIN_EMAILS set to your email address. This is the list of who is allowed in. If it is blank, NOBODY can sign in with Google — that is deliberate.

```
ADMIN_EMAILS=sanddollarmanagementllc@gmail.com
```

**5.** Click Redeploy. An environment variable change does nothing until the app restarts.

**6.** Open the login page and check for the button

```
https://llm.sanddollarmanagementllc.com/login
```

**What you'll see:** A Continue with Google button above the email and password boxes. Clicking it takes you to Google, then straight into LLM Gateway with no password.

**How we'll know it's done:** https://llm.sanddollarmanagementllc.com answers OK — this one clears itself off your list once that's true.
