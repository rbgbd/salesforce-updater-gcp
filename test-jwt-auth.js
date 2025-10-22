// test-jwt-auth.js
// Quick test script for JWT Bearer authentication
require('dotenv').config();
const SalesforceAuthJWT = require('./salesforce-auth-jwt');
const axios = require('axios');

async function testJWTAuth() {
  console.log('🧪 Testing Salesforce JWT Bearer Authentication\n');

  const config = {
    clientId: process.env.SF_CLIENT_ID,
    username: process.env.SF_USERNAME,
    privateKeyPath: process.env.SF_PRIVATE_KEY_PATH,
    loginUrl: process.env.SF_LOGIN_URL || 'https://realitybasedgroup.my.salesforce.com'
  };

  // Validate configuration
  const missing = [];
  if (!config.clientId) missing.push('SF_CLIENT_ID');
  if (!config.username) missing.push('SF_USERNAME');
  if (!config.privateKeyPath) missing.push('SF_PRIVATE_KEY_PATH');

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.log('\nMake sure your .env file contains:');
    console.log('  SF_CLIENT_ID=...');
    console.log('  SF_USERNAME=...');
    console.log('  SF_PRIVATE_KEY_PATH=./keys/server.key');
    console.log('  SF_LOGIN_URL=https://realitybasedgroup.my.salesforce.com');
    process.exit(1);
  }

  const auth = new SalesforceAuthJWT(config);

  try {
    // Authenticate
    const result = await auth.authenticate();
    
    console.log('\n✅ Authentication Test Passed!');
    console.log('   Access Token:', result.accessToken.substring(0, 30) + '...');
    console.log('   Instance URL:', result.instanceUrl);

    // Test API access
    console.log('\n🌐 Testing API Access...');
    const apiUrl = `${result.instanceUrl}/services/data/v58.0/sobjects/`;
    
    const response = await axios.get(apiUrl, {
      headers: auth.getAuthHeaders()
    });
    
    console.log(`✅ API Test Passed! Found ${response.data.sobjects.length} sObjects`);
    console.log('   Sample objects:', response.data.sobjects.slice(0, 5).map(o => o.name).join(', '));

    console.log('\n' + '='.repeat(70));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(70));
    console.log('\n✅ Your JWT authentication is working correctly!');
    console.log('✅ You can now use this for scheduled/automated updates!');
    console.log('\nNext steps:');
    console.log('  1. Integrate with your SalesforceUpdater');
    console.log('  2. Deploy to Google Cloud Functions');
    console.log('  3. Set up Cloud Scheduler for automation');
    console.log('');

  } catch (error) {
    console.error('\n❌ Authentication Test Failed');
    console.error('Error:', error.message);
    
    if (error.response) {
      console.error('\nSalesforce Error Response:');
      console.error('  Status:', error.response.status);
      console.error('  Error:', error.response.data.error);
      console.error('  Description:', error.response.data.error_description);
    }
    
    process.exit(1);
  }
}

testJWTAuth();
