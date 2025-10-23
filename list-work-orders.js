// list-work-orders.js
require("dotenv").config();
const SalesforceAuthJWT = require("./cloud/salesforce-auth-jwt");
const SalesforceUpdater = require("./salesforce-updater-enhanced");

/**
 * List existing Work Orders to find valid Work Order Numbers
 */
async function listWorkOrders() {
  try {
    console.log("=".repeat(70));
    console.log("📋 LISTING WORK ORDERS");
    console.log("=".repeat(70));

    // Authenticate
    const auth = new SalesforceAuthJWT({
      clientId: process.env.SF_CLIENT_ID,
      username: process.env.SF_USERNAME,
      privateKeyPath: process.env.SF_PRIVATE_KEY_PATH,
      loginUrl:
        process.env.SF_LOGIN_URL ||
        "https://realitybasedgroup.my.salesforce.com",
    });

    await auth.authenticate();

    // Initialize updater to use query method
    const updater = new SalesforceUpdater(auth);

    // Query for Work Orders
    console.log("\n🔍 Fetching Work Orders...\n");

    const soql = `SELECT Id, Name, CreatedDate 
                  FROM Work_Order__c 
                  ORDER BY CreatedDate DESC 
                  LIMIT 10`;

    const workOrders = await updater.query(soql);

    if (workOrders.length === 0) {
      console.log("⚠️  No Work Orders found in your Salesforce org.");
      console.log("   Please create at least one Work Order to test with.");
      return;
    }

    console.log(`✅ Found ${workOrders.length} Work Orders:\n`);
    console.log("=".repeat(70));

    workOrders.forEach((wo, index) => {
      console.log(
        `${(index + 1).toString().padStart(2)}. Work Order: ${wo.Name}`
      );
      console.log(`    Salesforce ID: ${wo.Id}`);
      console.log(
        `    Created: ${new Date(wo.CreatedDate).toLocaleDateString()}`
      );
      console.log("");
    });

    console.log("=".repeat(70));
    console.log("\n💡 TIP: Copy one of the 'Work Order' values above");
    console.log("   and use it in test-work-order-update.js on line 35");
    console.log("\n   Example:");
    console.log(`   const testWorkOrderNumber = "${workOrders[0].Name}";`);
  } catch (error) {
    console.error("\n❌ Failed to list Work Orders:");
    console.error(error.message);

    if (error.response) {
      console.error("\nSalesforce API Response:");
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the listing
listWorkOrders();
