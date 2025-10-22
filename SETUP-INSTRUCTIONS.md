# Salesforce Authentication Fix - Setup Instructions

## The Problem
Your Salesforce org has the **Username-Password OAuth flow DISABLED**, which is why you're getting the "unsupported_grant_type" error.

## The Solution
Use the **Web Server (Authorization Code) OAuth flow** instead. This is more secure and supported in all Salesforce orgs.

---

## Step 1: Update Your Connected App

In Salesforce, go to: **Setup → App Manager → RBG Data Sync → Edit**

### Update the Callback URL:
```
http://localhost:3000/oauth/callback
```

**Important:** Make sure this EXACT URL is in the callback URLs list.

---

## Step 2: Install Dependencies

You'll need Express for the OAuth callback server:

```bash
npm install express
```

---

## Step 3: Update Your .env File

```env
SF_CLIENT_ID=your_consumer_key_from_connected_app
SF_CLIENT_SECRET=your_consumer_secret_from_connected_app
SF_LOGIN_URL=https://realitybasedgroup.my.salesforce.com
```

**Note:** You no longer need `SF_USERNAME`, `SF_PASSWORD`, or `SF_SECURITY_TOKEN` for this flow!

---

## Step 4: Test the New Authentication

Run the test script:

```bash
node test-webserver-auth.js
```

This will:
1. Start a local web server on port 3000
2. Print a URL in the console
3. You open that URL in your browser
4. You log in to Salesforce
5. Salesforce redirects back to your app with the authentication

---

## Step 5: Integrate Into Your Application

### Option A: For Interactive/Development Use

Replace your existing `SalesforceAuth` with `SalesforceAuthWebServer`:

```javascript
const SalesforceAuthWebServer = require('./salesforce-auth-webserver');

const config = {
  clientId: process.env.SF_CLIENT_ID,
  clientSecret: process.env.SF_CLIENT_SECRET,
  redirectUri: 'http://localhost:3000/oauth/callback',
  loginUrl: 'https://realitybasedgroup.my.salesforce.com'
};

const auth = new SalesforceAuthWebServer(config);

// First time authentication (opens browser)
await auth.authenticateInteractive();

// Use the access token
const headers = auth.getAuthHeaders();
```

### Option B: For Server/Production Use

Store the refresh token after first authentication, then use it to get new access tokens:

```javascript
// After first authentication, save the refresh token
const result = await auth.authenticateInteractive();
const refreshToken = result.refreshToken;
// Save this refresh token securely (database, secret manager, etc.)

// Later, use the refresh token to get a new access token
auth.refreshToken = savedRefreshToken;
await auth.refreshAccessToken();
```

---

## Step 6: Update Your SalesforceUpdater

Modify your `salesforce-updater.js` to accept either auth type:

```javascript
class SalesforceUpdater {
  constructor(auth) {
    // Accept either SalesforceAuth or SalesforceAuthWebServer
    this.auth = auth;
    this.successfulUpdates = [];
    this.failedUpdates = [];
    this.apiVersion = 'v58.0';
  }

  async initialize() {
    // For web server auth, this might already be done
    if (typeof this.auth.authenticateInteractive === 'function') {
      if (!this.auth.accessToken) {
        await this.auth.authenticateInteractive();
      }
    } else {
      await this.auth.authenticate();
    }
    console.log('🚀 Salesforce Updater initialized successfully');
  }
  
  // Rest of your code stays the same...
}
```

---

## Production Deployment Options

### Option 1: Pre-authenticate and Store Refresh Token
1. Run authentication once locally to get refresh token
2. Store refresh token in Google Cloud Secret Manager
3. Use refresh token to get access tokens as needed (no browser required)

### Option 2: Use JWT Bearer Flow (Most Production-Ready)
For fully automated server-to-server authentication:
- Requires a certificate/key pair
- No user interaction needed
- Most secure for production

Would you like me to create the JWT Bearer flow implementation?

---

## Testing Checklist

✅ Connected App callback URL updated to `http://localhost:3000/oauth/callback`  
✅ Express installed (`npm install express`)  
✅ `.env` file has `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, and `SF_LOGIN_URL`  
✅ Port 3000 is available  
✅ Run `node test-webserver-auth.js`  
✅ Open the URL printed in console  
✅ Log in to Salesforce  
✅ See success message  

---

## Common Issues

**"EADDRINUSE" error:**
- Port 3000 is already in use
- Kill the process using port 3000 or change the port in the code

**"redirect_uri_mismatch" error:**
- The callback URL in your Connected App doesn't match exactly
- Make sure it's `http://localhost:3000/oauth/callback` (no trailing slash)

**Browser doesn't open automatically:**
- Copy the URL from the console and paste it in your browser manually

---

## Files Provided

1. **salesforce-auth-webserver.js** - New OAuth implementation
2. **test-webserver-auth.js** - Test script
3. **SETUP-INSTRUCTIONS.md** - This file

---

## Next Steps

After you get authentication working:
1. Test updating a Salesforce record
2. Implement refresh token storage for production
3. Consider JWT Bearer flow for fully automated deployment

Need help with any of these steps? Let me know!
