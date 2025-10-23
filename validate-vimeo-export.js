// validate-vimeo-export.js
require('dotenv').config();
const fs = require('fs').promises;
const SalesforceAuthJWT = require('./cloud/salesforce-auth-jwt');
const SalesforceUpdater = require('./salesforce-updater-enhanced');

/**
 * Validate Vimeo export file before processing
 */
async function validateVimeoExport(filePath, workOrderIdentifier = 'work_order_name') {
  console.log('='.repeat(70));
  console.log('🔍 VIMEO EXPORT VALIDATION');
  console.log('='.repeat(70));

  try {
    // 1. Check if file exists
    console.log(`\n📂 Checking file: ${filePath}`);
    await fs.access(filePath);
    console.log('✅ File exists');

    // 2. Read and parse file
    let records;
    if (filePath.endsWith('.json')) {
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      records = Array.isArray(data) ? data : (data.data || []);
      console.log(`✅ Valid JSON format with ${records.length} records`);
    } else if (filePath.endsWith('.csv')) {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      console.log(`✅ Valid CSV format with ${lines.length - 1} data rows`);
      console.log(`   Columns: ${headers.join(', ')}`);
      
      // Parse records for validation
      records = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const record = {};
        headers.forEach((header, index) => {
          record[header] = values[index] || '';
        });
        records.push(record);
      }
    } else {
      throw new Error('Unsupported file format. Use .csv or .json');
    }

    if (records.length === 0) {
      throw new Error('No records found in file');
    }

    // 3. Check for work order identifier field
    console.log(`\n🔍 Checking for Work Order identifier: '${workOrderIdentifier}'`);
    const hasIdentifier = records.every(r => workOrderIdentifier in r);
    
    if (!hasIdentifier) {
      console.log('❌ Work Order identifier field not found!');
      console.log('   Available fields:', Object.keys(records[0]).join(', '));
      throw new Error(`Field '${workOrderIdentifier}' not found in records`);
    }
    console.log('✅ Work Order identifier field found in all records');

    // 4. Check for empty work order names
    const emptyNames = records.filter(r => !r[workOrderIdentifier] || r[workOrderIdentifier].trim() === '');
    if (emptyNames.length > 0) {
      console.log(`⚠️  ${emptyNames.length} records have empty Work Order names`);
    } else {
      console.log('✅ All records have Work Order names');
    }

    // 5. Extract unique work order names
    const workOrderNames = [...new Set(
      records
        .filter(r => r[workOrderIdentifier] && r[workOrderIdentifier].trim())
        .map(r => r[workOrderIdentifier].trim())
    )];

    console.log(`\n📋 Found ${workOrderNames.length} unique Work Orders:`);
    workOrderNames.slice(0, 10).forEach((name, i) => {
      console.log(`   ${i + 1}. ${name}`);
    });
    if (workOrderNames.length > 10) {
      console.log(`   ... and ${workOrderNames.length - 10} more`);
    }

    // 6. Authenticate with Salesforce and check which Work Orders exist
    console.log('\n🔐 Authenticating with Salesforce...');
    const auth = new SalesforceAuthJWT({
      clientId: process.env.SF_CLIENT_ID,
      username: process.env.SF_USERNAME,
      privateKeyPath: process.env.SF_PRIVATE_KEY_PATH,
      loginUrl: process.env.SF_LOGIN_URL || 'https://realitybasedgroup.my.salesforce.com'
    });
    await auth.authenticate();
    console.log('✅ Authentication successful');

    const updater = new SalesforceUpdater(auth);

    console.log('\n🔍 Validating Work Orders exist in Salesforce...');
    const validationResults = {
      found: [],
      notFound: []
    };

    for (const name of workOrderNames) {
      try {
        const workOrder = await updater.lookupWorkOrderByNumber(name);
        if (workOrder) {
          validationResults.found.push(name);
        } else {
          validationResults.notFound.push(name);
        }
      } catch (error) {
        validationResults.notFound.push(name);
      }
    }

    // 7. Display validation results
    console.log('\n' + '='.repeat(70));
    console.log('📊 VALIDATION RESULTS');
    console.log('='.repeat(70));
    console.log(`Total Records in File: ${records.length}`);
    console.log(`Unique Work Orders: ${workOrderNames.length}`);
    console.log(`Found in Salesforce: ${validationResults.found.length}`);
    console.log(`NOT Found in Salesforce: ${validationResults.notFound.length}`);

    if (validationResults.notFound.length > 0) {
      console.log('\n⚠️  Work Orders NOT found in Salesforce:');
      validationResults.notFound.forEach(name => {
        console.log(`   ❌ ${name}`);
      });
      console.log('\n💡 These Work Orders will fail during sync.');
      console.log('   Either create them in Salesforce or remove from export.');
    }

    if (validationResults.found.length > 0) {
      console.log('\n✅ Work Orders found in Salesforce:');
      validationResults.found.slice(0, 5).forEach(name => {
        console.log(`   ✓ ${name}`);
      });
      if (validationResults.found.length > 5) {
        console.log(`   ... and ${validationResults.found.length - 5} more`);
      }
    }

    // 8. Summary
    console.log('\n' + '='.repeat(70));
    if (validationResults.notFound.length === 0) {
      console.log('✅ ALL WORK ORDERS VALIDATED - Ready to sync!');
      console.log('='.repeat(70));
      console.log('\nNext step:');
      console.log('  node vimeo-to-salesforce.js');
    } else {
      console.log('⚠️  VALIDATION INCOMPLETE - Some Work Orders not found');
      console.log('='.repeat(70));
      console.log('\nOptions:');
      console.log('  1. Create missing Work Orders in Salesforce');
      console.log('  2. Remove invalid rows from export file');
      console.log('  3. Fix Work Order names to match Salesforce exactly');
    }

    return {
      valid: validationResults.notFound.length === 0,
      totalRecords: records.length,
      uniqueWorkOrders: workOrderNames.length,
      found: validationResults.found,
      notFound: validationResults.notFound
    };

  } catch (error) {
    console.error('\n❌ Validation failed:', error.message);
    throw error;
  }
}

// Run validation if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node validate-vimeo-export.js <file-path> [work-order-field]');
    console.log('');
    console.log('Examples:');
    console.log('  node validate-vimeo-export.js ./vimeo-export.csv');
    console.log('  node validate-vimeo-export.js ./vimeo-data.json work_order_name');
    process.exit(1);
  }

  const filePath = args[0];
  const workOrderIdentifier = args[1] || 'work_order_name';

  validateVimeoExport(filePath, workOrderIdentifier)
    .then(results => {
      process.exit(results.valid ? 0 : 1);
    })
    .catch(error => {
      process.exit(1);
    });
}

module.exports = validateVimeoExport;
