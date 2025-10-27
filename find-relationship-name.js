// find-relationship-name.js
require('dotenv').config();
const SalesforceAuthJWT = require('./cloud/salesforce-auth-jwt');
const axios = require('axios');

/**
 * Find the correct relationship name for a lookup field
 */
async function findRelationshipName() {
  try {
    console.log('='.repeat(70));
    console.log('🔍 FINDING RELATIONSHIP NAMES');
    console.log('='.repeat(70));

    // Authenticate
    const auth = new SalesforceAuthJWT({
      clientId: process.env.SF_CLIENT_ID,
      username: process.env.SF_USERNAME,
      privateKeyPath: process.env.SF_PRIVATE_KEY_PATH,
      loginUrl: process.env.SF_LOGIN_URL || 'https://realitybasedgroup.my.salesforce.com'
    });

    await auth.authenticate();

    // Describe Work_Order__c object
    const describeUrl = `${auth.instanceUrl}/services/data/v58.0/sobjects/Work_Order__c/describe`;
    
    console.log('\n📡 Fetching Work_Order__c metadata...\n');
    
    const response = await axios.get(describeUrl, {
      headers: auth.getAuthHeaders()
    });

    const objectMetadata = response.data;

    // Find all lookup/master-detail fields
    const relationshipFields = objectMetadata.fields.filter(field => 
      (field.type === 'reference' || field.type === 'lookup') && field.relationshipName
    );

    console.log('='.repeat(70));
    console.log('📋 LOOKUP/RELATIONSHIP FIELDS');
    console.log('='.repeat(70));

    relationshipFields.forEach(field => {
      console.log(`\n✓ Field Label: ${field.label}`);
      console.log(`  API Name: ${field.name}`);
      console.log(`  Relationship Name: ${field.relationshipName} ← USE THIS IN QUERIES`);
      console.log(`  References: ${field.referenceTo.join(', ')}`);
      
      if (field.name.includes('Project') || field.label.includes('Project')) {
        console.log(`  ⭐ THIS LOOKS LIKE YOUR PROJECT FIELD!`);
      }
    });

    // Find the Project-related field specifically
    console.log('\n' + '='.repeat(70));
    console.log('🎯 PROJECT-RELATED FIELDS');
    console.log('='.repeat(70));

    const projectFields = relationshipFields.filter(field => 
      field.name.toLowerCase().includes('project') || 
      field.label.toLowerCase().includes('project') ||
      field.referenceTo.some(ref => ref.toLowerCase().includes('project'))
    );

    if (projectFields.length > 0) {
      projectFields.forEach(field => {
        console.log(`\n✅ ${field.label} (${field.name})`);
        console.log(`   Relationship Name: ${field.relationshipName}`);
        console.log(`   References: ${field.referenceTo.join(', ')}`);
        console.log(`\n   📝 Example SOQL Query:`);
        console.log(`   SELECT Id, Name, ${field.relationshipName}.SASSIE_Survey_ID__c`);
        console.log(`   FROM Work_Order__c`);
      });
    } else {
      console.log('\n⚠️  No Project-related fields found');
      console.log('   Check the full list above for the correct relationship');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Complete!');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

findRelationshipName();
