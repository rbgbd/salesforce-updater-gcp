// test-webserver-auth.js
// Test script for the Web Server OAuth flow
require('dotenv').config();
const SalesforceAuthWebServer = require('./salesforce-auth-webserver');

async function testAuth() {
  const config = {
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
    redirectUri: 'http://localhost:3000/oauth/callback',
    loginUrl: 'https://realitybasedgroup.my.salesforce.com'
  };

  const auth = new SalesforceAuthWebServer(config);

  try {
    // Start interactive authentication
    const result = await auth.authenticateInteractive();
    
    console.log('✅ Authentication successful!');
    console.log('Access Token:', result.accessToken.substring(0, 30) + '...');
    console.log('Instance URL:', result.instanceUrl);
    
    // Test API access
    const axios = require('axios');
    const apiUrl = `${result.instanceUrl}/services/data/v58.0/sobjects/`;
    
    const response = await axios.get(apiUrl, {
      headers: auth.getAuthHeaders()
    });
    
    console.log(`\n✅ API Test Successful! Found ${response.data.sobjects.length} sObjects`);
    
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    process.exit(1);
  }
}

testAuth();
