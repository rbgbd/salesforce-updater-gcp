// salesforce-auth-jwt.js
// JWT Bearer Flow for server-to-server authentication (no user interaction required)
const axios = require("axios");
const jwt = require("jsonwebtoken");
const fs = require("fs");

class SalesforceAuthJWT {
  constructor(config) {
    this.clientId = config.clientId; // Consumer Key
    this.username = config.username; // Salesforce username to authenticate as
    this.privateKey = config.privateKey; // Private key content (string or buffer)
    this.privateKeyPath = config.privateKeyPath; // OR path to private key file
    this.loginUrl = config.loginUrl || "https://realitybasedgroup.my.salesforce.com";
    this.accessToken = null;
    this.instanceUrl = null;
  }

  /**
   * Load private key from file if path is provided
   * @returns {string} Private key content
   */
  getPrivateKey() {
    if (this.privateKey) {
      return this.privateKey;
    }
    
    if (this.privateKeyPath) {
      return fs.readFileSync(this.privateKeyPath, "utf8");
    }
    
    throw new Error("No private key provided. Set either privateKey or privateKeyPath.");
  }

  /**
   * Create and sign JWT token
   * @returns {string} Signed JWT
   */
  createJWT() {
    const privateKey = this.getPrivateKey();
    
    const claims = {
      iss: this.clientId,           // Consumer Key (Client ID)
      sub: this.username,            // Salesforce username
      aud: this.loginUrl,            // Login URL
      exp: Math.floor(Date.now() / 1000) + 300  // Expires in 5 minutes
    };

    console.log("🔐 Creating JWT with claims:");
    console.log("  Issuer (Client ID):", this.clientId.substring(0, 25) + "...");
    console.log("  Subject (Username):", this.username);
    console.log("  Audience (Login URL):", this.loginUrl);
    console.log("  Expiration:", new Date(claims.exp * 1000).toISOString());

    // Sign JWT with RS256 algorithm
    const token = jwt.sign(claims, privateKey, {
      algorithm: "RS256"
    });

    return token;
  }

  /**
   * Authenticate using JWT Bearer Flow
   * @returns {Promise<Object>} Authentication result with access token and instance URL
   */
  async authenticate() {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("🔐 SALESFORCE JWT BEARER AUTHENTICATION");
      console.log("=".repeat(70));

      const jwtToken = this.createJWT();
      const tokenUrl = `${this.loginUrl}/services/oauth2/token`;

      console.log("\n📤 Sending authentication request...");
      console.log("  Token URL:", tokenUrl);

      const params = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwtToken
      });

      const response = await axios.post(tokenUrl, params, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        timeout: 15000
      });

      this.accessToken = response.data.access_token;
      this.instanceUrl = response.data.instance_url;

      console.log("\n✅ AUTHENTICATION SUCCESSFUL!");
      console.log("  Instance URL:", this.instanceUrl);
      console.log("  Access Token (first 30 chars):", this.accessToken.substring(0, 30) + "...");
      console.log("  Token Type:", response.data.token_type);
      console.log("=".repeat(70) + "\n");

      return {
        accessToken: this.accessToken,
        instanceUrl: this.instanceUrl,
        success: true
      };
    } catch (error) {
      console.log("\n❌ AUTHENTICATION FAILED");
      console.log("=".repeat(70));

      if (error.response) {
        console.log("  HTTP Status:", error.response.status);
        console.log("  Error:", error.response.data.error);
        console.log("  Description:", error.response.data.error_description);
        
        console.log("\n🔧 TROUBLESHOOTING TIPS:");
        
        if (error.response.data.error === "invalid_grant") {
          console.log("  • Verify the username is correct and has API access");
          console.log("  • Check that the user is authorized to use this Connected App");
          console.log("  • Ensure JWT Bearer Flow is enabled in the Connected App");
          console.log("  • Verify the certificate is uploaded to the Connected App");
          console.log("  • Check that pre-authorized users/profiles are configured");
        } else if (error.response.data.error === "invalid_client_id") {
          console.log("  • Consumer Key (Client ID) is incorrect");
          console.log("  • Verify in Connected App settings");
        }
      } else if (error.request) {
        console.log("  No response from Salesforce");
        console.log("  Check network connectivity and login URL");
      } else {
        console.log("  Error:", error.message);
      }

      console.log("=".repeat(70) + "\n");
      throw error;
    }
  }

  /**
   * Get authorization headers for API calls
   * @returns {Object} Headers object with authorization
   */
  getAuthHeaders() {
    if (!this.accessToken) {
      throw new Error("Not authenticated. Call authenticate() first.");
    }
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json"
    };
  }

  /**
   * Check if current session is valid
   * @returns {Promise<boolean>} True if session is valid
   */
  async validateSession() {
    if (!this.accessToken || !this.instanceUrl) {
      return false;
    }

    try {
      await axios.get(`${this.instanceUrl}/services/data/v58.0/sobjects/`, {
        headers: this.getAuthHeaders()
      });
      return true;
    } catch (error) {
      console.log("Session expired, re-authentication required");
      return false;
    }
  }

  /**
   * Ensure we have a valid authenticated session
   * @returns {Promise<void>}
   */
  async ensureAuthenticated() {
    const isValid = await this.validateSession();
    if (!isValid) {
      await this.authenticate();
    }
  }
}

module.exports = SalesforceAuthJWT;
