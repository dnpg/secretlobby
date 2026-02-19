---
sidebar_position: 2
---

# Cloudflare Access

The `main.secretlobby.co` domain is protected by Cloudflare Access. This means users must be explicitly authorized to access the staging/development environment.

## Adding a New User

To grant someone access to `main.secretlobby.co`, follow these steps:

### Step 1: Navigate to Access Policies

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select the **secretlobby.co** domain
3. Go to **Access controls** > **Applications** in the left sidebar
4. Find and click on the application for `main.secretlobby.co` (or `Diego@dnpg.dev's ...`)
5. Click **Configure** and go to the **Policies** tab

You should see the existing access policy:

![Cloudflare Access Policies](/img/cloudflare-access-policies.png)

### Step 2: Edit the Policy

1. Click on the **Allow me** policy name to expand the policy details
2. You'll see the current list of allowed emails under **Include** > **Emails**

![Cloudflare Access Policy Emails](/img/cloudflare-access-policy-emails.png)

### Step 3: Add the New User's Email

1. Click the three-dot menu (⋮) on the policy row and select **Edit**
2. In the **Include** section, find the **Emails** selector
3. Add the new user's email address to the list
4. Click **Save policy**

The new user will now be able to access `main.secretlobby.co` by authenticating with their email.

## How Access Works

When a user visits `main.secretlobby.co`:

1. Cloudflare intercepts the request
2. The user is prompted to enter their email
3. Cloudflare sends a one-time code to the email
4. The user enters the code to verify ownership
5. If the email is in the allowed list, access is granted
6. A session is created (typically valid for 24 hours)

## Removing Access

To remove a user's access:

1. Follow steps 1-2 above to reach the policy editor
2. Remove the user's email from the **Emails** list
3. Click **Save policy**

The user will no longer be able to authenticate after their current session expires.

## Troubleshooting

### User can't receive verification email
- Check if the email is correctly spelled in the policy
- Ensure the user checks their spam/junk folder
- Cloudflare verification emails come from `noreply@cloudflareaccess.com`

### User authenticated but still can't access
- Verify the email in the policy matches exactly (case-insensitive, but check for typos)
- Check if there are any additional policies that might be blocking access
- Review the policy order (policies are evaluated top-to-bottom)
