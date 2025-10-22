// Create test-creds.js
require("dotenv").config();
const axios = require("axios");

async function testAuth() {
  console.log("=== Credential Test ===");
  console.log("Login URL:", process.env.SF_LOGIN_URL);
  console.log("Username:", process.env.SF_USERNAME);
  console.log("Password length:", process.env.SF_PASSWORD?.length);
  console.log("Token length:", process.env.SF_SECURITY_TOKEN?.length);

  const authUrl = `${process.env.SF_LOGIN_URL}/services/oauth2/token`;
  const params = new URLSearchParams({
    grant_type: "password",
    client_id: process.env.SF_CLIENT_ID,
    client_secret: process.env.SF_CLIENT_SECRET,
    username: process.env.SF_USERNAME,
    password: process.env.SF_PASSWORD + process.env.SF_SECURITY_TOKEN,
  });

  try {
    const response = await axios.post(authUrl, params);
    console.log("✅ SUCCESS! Auth worked");
    console.log("Instance:", response.data.instance_url);
  } catch (error) {
    console.log("❌ Failed:", error.response?.data);
    console.log("\n💡 Try:");
    console.log("1. Check login URL (sandbox vs production)");
    console.log("2. Get fresh security token from Salesforce");
    console.log("3. Verify username/password in web browser");
  }
}

testAuth();
