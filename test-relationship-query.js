// test-relationship-query.js
require('dotenv').config();
const SalesforceAuthJWT = require('./cloud/salesforce-auth-jwt');
const SalesforceUpdater = require('./salesforce-updater-enhanced');

/**
 * Test querying Work Order with related Project fields
 */
async function testRelationshipQuery() {
  try {
    console.log('='.repeat(70));
    console.log('🧪 TESTING RELATIONSHIP QUERY');
    console.log('='.repeat(70));

    // Authenticate
    const auth = new SalesforceAuthJWT({
      clientId: process.env.SF_CLIENT_ID,
      username: process.env.SF_USERNAME,
      privateKeyPath: process.env.SF_PRIVATE_KEY_PATH,
      loginUrl: process.env.SF_LOGIN_URL || 'https://realitybasedgroup.my.salesforce.com'
    });

    await auth.authenticate();

    const updater = new SalesforceUpdater(auth);

    // Test different query approaches
    console.log('\n📝 Test 1: Basic query without related fields');
    const basicQuery = `SELECT Id, Name, SASSIE_ID__c FROM Work_Order__c LIMIT 3`;
    const basicResults = await updater.query(basicQuery);
    
    console.log('\nResults:');
    basicResults.forEach(wo => {
      console.log(`  ${wo.Name} - SASSIE_ID: ${wo.SASSIE_ID__c || 'null'}`);
    });

    console.log('\n📝 Test 2: Query WITH relationship (Related_Project__r)');
    const relQuery = `SELECT Id, Name, SASSIE_ID__c, Related_Project__c, Related_Project__r.SASSIE_Survey_ID__c FROM Work_Order__c LIMIT 3`;
    
    try {
      const relResults = await updater.query(relQuery);
      
      console.log('\n✅ Relationship query SUCCESS!');
      console.log('\nResults:');
      relResults.forEach(wo => {
        console.log(`\n  Work Order: ${wo.Name}`);
        console.log(`  WO SASSIE_ID: ${wo.SASSIE_ID__c || 'null'}`);
        console.log(`  Related Project ID: ${wo.Related_Project__c || 'null'}`);
        console.log(`  Project Survey ID: ${wo.Related_Project__r?.SASSIE_Survey_ID__c || 'null'}`);
      });
    } catch (error) {
      console.log('\n❌ Relationship query FAILED');
      console.log('Error:', error.response?.data || error.message);
    }

    console.log('\n📝 Test 3: Query with ALL related fields');
    const fullQuery = `SELECT Id, Name, SASSIE_ID__c, 
      Related_Project__r.SASSIE_Survey_ID__c,
      Related_Project__r.SASSIE_Survey_Name__c,
      Related_Project__r.Video_QID__c,
      Related_Project__r.Download_Video_QID__c
    FROM Work_Order__c 
    WHERE Related_Project__c != null
    LIMIT 3`;
    
    try {
      const fullResults = await updater.query(fullQuery);
      
      console.log('\n✅ Full relationship query SUCCESS!');
      console.log(`\nFound ${fullResults.length} Work Orders with Projects:`);
      
      fullResults.forEach(wo => {
        console.log(`\n  Work Order: ${wo.Name}`);
        console.log(`  WO SASSIE_ID: ${wo.SASSIE_ID__c || 'null'}`);
        console.log(`  Project Survey ID: ${wo.Related_Project__r?.SASSIE_Survey_ID__c || 'null'}`);
        console.log(`  Project Survey Name: ${wo.Related_Project__r?.SASSIE_Survey_Name__c || 'null'}`);
        console.log(`  Video QID: ${wo.Related_Project__r?.Video_QID__c || 'null'}`);
        console.log(`  Download Video QID: ${wo.Related_Project__r?.Download_Video_QID__c || 'null'}`);
      });

      console.log('\n' + '='.repeat(70));
      console.log('✅ ALL TESTS PASSED!');
      console.log('='.repeat(70));
      console.log('\nYour relationship query is working correctly!');
      console.log('Make sure Work Orders have Related_Project__c populated.');

    } catch (error) {
      console.log('\n❌ Full relationship query FAILED');
      console.log('Error:', error.response?.data || error.message);
      
      if (error.response?.data) {
        console.log('\n💡 This usually means:');
        console.log('   1. Field name is misspelled');
        console.log('   2. Field doesn\'t exist on Project__c');
        console.log('   3. You don\'t have permission to access the field');
      }
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

testRelationshipQuery();
