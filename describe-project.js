// describe-project.js
require('dotenv').config();
const SalesforceAuthJWT = require('./cloud/salesforce-auth-jwt');
const axios = require('axios');

/**
 * Describe the Project__c object to see available fields
 */
async function describeProject() {
  try {
    console.log('='.repeat(70));
    console.log('🔍 DESCRIBING PROJECT__C OBJECT');
    console.log('='.repeat(70));

    // Authenticate
    const auth = new SalesforceAuthJWT({
      clientId: process.env.SF_CLIENT_ID,
      username: process.env.SF_USERNAME,
      privateKeyPath: process.env.SF_PRIVATE_KEY_PATH,
      loginUrl: process.env.SF_LOGIN_URL || 'https://realitybasedgroup.my.salesforce.com'
    });

    await auth.authenticate();

    // Describe the object
    const describeUrl = `${auth.instanceUrl}/services/data/v58.0/sobjects/Project__c/describe`;
    
    console.log('\n📡 Fetching Project__c metadata...\n');
    
    const response = await axios.get(describeUrl, {
      headers: auth.getAuthHeaders()
    });

    const objectMetadata = response.data;

    console.log('📋 Object Information:');
    console.log(`   Label: ${objectMetadata.label}`);
    console.log(`   API Name: ${objectMetadata.name}`);
    console.log(`   Total Fields: ${objectMetadata.fields.length}`);

    // Look for SASSIE-related fields
    console.log('\n' + '='.repeat(70));
    console.log('🔍 SASSIE-RELATED FIELDS');
    console.log('='.repeat(70));

    const sassieFields = objectMetadata.fields.filter(field => 
      field.name.toLowerCase().includes('sassie') ||
      field.name.toLowerCase().includes('video') ||
      field.name.toLowerCase().includes('survey')
    );

    if (sassieFields.length > 0) {
      sassieFields.forEach((field, index) => {
        console.log(`\n${index + 1}. ${field.label}`);
        console.log(`   API Name: ${field.name} ← USE THIS`);
        console.log(`   Type: ${field.type}`);
        console.log(`   Queryable: ${field.queryable}`);
      });
    } else {
      console.log('\n⚠️  No SASSIE-related fields found');
    }

    // Show all fields for reference
    console.log('\n' + '='.repeat(70));
    console.log('📝 ALL FIELDS (first 50)');
    console.log('='.repeat(70));

    objectMetadata.fields.slice(0, 50).forEach((field, index) => {
      console.log(`${(index + 1).toString().padStart(3)}. ${field.label.padEnd(40)} | API: ${field.name}`);
    });

    if (objectMetadata.fields.length > 50) {
      console.log(`\n... and ${objectMetadata.fields.length - 50} more fields`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Description complete!');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Failed to describe Project__c:');
    console.error(error.message);
    
    if (error.response) {
      console.error('\nSalesforce API Response:');
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the description
describeProject();
