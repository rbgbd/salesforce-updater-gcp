// salesforce-auth.js
const axios = require("axios");

class SalesforceAuth {
  constructor(config) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.username = config.username;
    this.password = config.password;
    this.securityToken = config.securityToken;
    this.loginUrl = config.loginUrl || "https://login.salesforce.com";
    this.accessToken = null;
    this.instanceUrl = null;
  }

  /**
   * Authenticate with Salesforce using OAuth2 Username-Password flow
   * @returns {Promise<Object>} Authentication result with access token and instance URL
   */
  async authenticate() {
    try {
      const authUrl = `${this.loginUrl}/services/oauth2/token`;
      const params = new URLSearchParams({
        grant_type: "password",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        username: this.username,
        password: this.password + this.securityToken,
      });

      const response = await axios.post(authUrl, params, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      this.accessToken = response.data.access_token;
      this.instanceUrl = response.data.instance_url;

      console.log("✅ Salesforce authentication successful");
      return {
        accessToken: this.accessToken,
        instanceUrl: this.instanceUrl,
        success: true,
      };
    } catch (error) {
      console.error(
        "❌ Salesforce authentication failed:",
        error.response?.data || error.message
      );
      throw new Error(
        `Authentication failed: ${
          error.response?.data?.error_description || error.message
        }`
      );
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
      "Content-Type": "application/json",
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
        headers: this.getAuthHeaders(),
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

module.exports = SalesforceAuth;
