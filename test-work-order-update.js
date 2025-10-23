// test-work-order-update.js
require("dotenv").config();
const SalesforceAuthJWT = require("./cloud/salesforce-auth-jwt");
const SalesforceUpdater = require("./salesforce-updater-enhanced");

/**
 * Test updating a single Work Order
 */
async function testWorkOrderUpdate() {
  try {
    console.log("=".repeat(70));
    console.log("🧪 TESTING WORK ORDER UPDATE");
    console.log("=".repeat(70));

    // 1. Authenticate with Salesforce using JWT
    console.log("\n📝 Step 1: Authenticating with Salesforce...");
    const auth = new SalesforceAuthJWT({
      clientId: process.env.SF_CLIENT_ID,
      username: process.env.SF_USERNAME,
      privateKeyPath: process.env.SF_PRIVATE_KEY_PATH, // Or use privateKey directly
      loginUrl:
        process.env.SF_LOGIN_URL ||
        "https://realitybasedgroup.my.salesforce.com",
    });

    await auth.authenticate();

    // 2. Initialize the updater
    console.log("\n📝 Step 2: Initializing Salesforce Updater...");
    const updater = new SalesforceUpdater(auth);

    // 3. Test looking up a Work Order (REPLACE WITH YOUR ACTUAL WORK ORDER NUMBER)
    console.log("\n📝 Step 3: Looking up Work Order...");
    const testWorkOrderNumber = "2230"; // 👈 REPLACE THIS with an actual Work Order Number

    const workOrder = await updater.lookupWorkOrderByNumber(
      testWorkOrderNumber
    );

    if (!workOrder) {
      console.log(
        "\n❌ Work Order not found. Please verify the Work Order Number exists."
      );
      console.log(
        "   Update the 'testWorkOrderNumber' variable in this script with a valid Work Order Number."
      );
      return;
    }

    console.log("\n📋 Work Order Details:");
    console.log(`   ID: ${workOrder.Id}`);
    console.log(`   Name: ${workOrder.Name}`);

    // 4. Test updating the Work Order
    console.log("\n📝 Step 4: Updating Work Order...");

    // REPLACE THESE FIELDS with the actual fields you want to update
    // Example fields - adjust based on your Work_Order__c object schema
    const updateData = {
      Video_Link_Vimeo__c: "Updated from Vimeo import",
      Vimeo_Downloadable_Link__c: "Farts",
      Date_Delivered__c: new Date().toISOString(),
      // Add more fields as needed
    };

    console.log("   Update data:", JSON.stringify(updateData, null, 2));

    const result = await updater.updateWorkOrderByNumber(
      testWorkOrderNumber,
      updateData,
      { source: "test_script", test: true }
    );

    // 5. Display results
    console.log("\n" + "=".repeat(70));
    console.log("📊 UPDATE RESULT");
    console.log("=".repeat(70));
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log("\n✅ SUCCESS! Work Order updated successfully.");
      console.log(`   Record ID: ${result.recordId}`);
      console.log(`   Status: ${result.status}`);
    } else {
      console.log("\n❌ FAILED! Work Order update failed.");
      console.log(`   Error: ${JSON.stringify(result.error, null, 2)}`);
    }

    // 6. Display statistics
    console.log("\n📈 Statistics:");
    console.log(JSON.stringify(updater.getStats(), null, 2));
  } catch (error) {
    console.error("\n❌ Test failed with error:");
    console.error(error);

    if (error.response) {
      console.error("\nSalesforce API Response:");
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
testWorkOrderUpdate();
