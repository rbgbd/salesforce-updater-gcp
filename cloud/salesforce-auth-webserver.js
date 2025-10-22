// salesforce-auth-webserver.js
// Alternative OAuth flow using Web Server (Authorization Code) flow
const axios = require("axios");
const express = require("express");

class SalesforceAuthWebServer {
  constructor(config) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri || "http://localhost:3000/oauth/callback";
    this.loginUrl = config.loginUrl || "https://realitybasedgroup.my.salesforce.com";
    this.accessToken = null;
    this.refreshToken = null;
    this.instanceUrl = null;
  }

  /**
   * Get the authorization URL to redirect users to
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl() {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: "api refresh_token"
    });

    return `${this.loginUrl}/services/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code from callback
   * @returns {Promise<Object>} Authentication result
   */
  async exchangeCodeForToken(code) {
    try {
      const tokenUrl = `${this.loginUrl}/services/oauth2/token`;
      
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        code: code
      });

      console.log("🔐 Exchanging authorization code for access token...");

      const response = await axios.post(tokenUrl, params, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.instanceUrl = response.data.instance_url;

      console.log("✅ Authentication successful!");
      console.log("Instance URL:", this.instanceUrl);

      return {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        instanceUrl: this.instanceUrl,
        success: true
      };
    } catch (error) {
      console.error("❌ Token exchange failed:", error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Refresh the access token using refresh token
   * @returns {Promise<Object>} New authentication result
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error("No refresh token available. Need to re-authenticate.");
    }

    try {
      const tokenUrl = `${this.loginUrl}/services/oauth2/token`;
      
      const params = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken
      });

      const response = await axios.post(tokenUrl, params, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });

      this.accessToken = response.data.access_token;
      this.instanceUrl = response.data.instance_url;

      console.log("✅ Token refreshed successfully");

      return {
        accessToken: this.accessToken,
        instanceUrl: this.instanceUrl,
        success: true
      };
    } catch (error) {
      console.error("❌ Token refresh failed:", error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get authorization headers for API calls
   * @returns {Object} Headers object with authorization
   */
  getAuthHeaders() {
    if (!this.accessToken) {
      throw new Error("Not authenticated. Need to authenticate first.");
    }
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json"
    };
  }

  /**
   * Start OAuth flow with interactive server
   * This will open a browser for the user to log in
   */
  async authenticateInteractive() {
    return new Promise((resolve, reject) => {
      const app = express();
      let server;

      // Callback route
      app.get("/oauth/callback", async (req, res) => {
        const code = req.query.code;
        const error = req.query.error;

        if (error) {
          res.send(`<h1>Authentication Failed</h1><p>${error}</p>`);
          server.close();
          reject(new Error(error));
          return;
        }

        if (!code) {
          res.send("<h1>Error</h1><p>No authorization code received</p>");
          server.close();
          reject(new Error("No authorization code received"));
          return;
        }

        try {
          await this.exchangeCodeForToken(code);
          res.send("<h1>Success!</h1><p>Authentication successful. You can close this window.</p>");
          server.close();
          resolve({
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            instanceUrl: this.instanceUrl,
            success: true
          });
        } catch (error) {
          res.send(`<h1>Error</h1><p>${error.message}</p>`);
          server.close();
          reject(error);
        }
      });

      // Start server
      server = app.listen(3000, () => {
        const authUrl = this.getAuthorizationUrl();
        console.log("\n" + "=".repeat(70));
        console.log("🔐 SALESFORCE AUTHENTICATION");
        console.log("=".repeat(70));
        console.log("\nPlease open this URL in your browser to authenticate:");
        console.log("\n" + authUrl + "\n");
        console.log("Waiting for authentication...");
        console.log("=".repeat(70) + "\n");
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error("Authentication timeout"));
      }, 300000);
    });
  }
}

module.exports = SalesforceAuthWebServer;
