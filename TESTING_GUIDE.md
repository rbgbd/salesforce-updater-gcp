# Work Order Update Testing Guide

## 🎯 What You've Built

You now have a complete system for:
1. ✅ Authenticating with Salesforce using JWT Bearer Flow (no user interaction!)
2. ✅ Looking up Work Orders by Work Order Number
3. ✅ Updating Work Order records
4. ✅ Batch processing multiple updates
5. ✅ Exporting results to CSV

## 📋 Prerequisites

Before testing, make sure you have:

1. **Salesforce Connected App** configured with JWT Bearer Flow
2. **Certificate uploaded** to your Connected App (salesforce.crt)
3. **Private key file** (salesforce-private.key) in your project root
4. **Environment variables** configured in `.env` file
5. **Node.js packages** installed

## 🚀 Quick Start - Test One Record

### Step 1: Install Dependencies

```bash
npm install dotenv axios jsonwebtoken
```

### Step 2: Set Up Environment Variables

Create a `.env` file in your project root:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
SF_CLIENT_ID=your_consumer_key_from_connected_app
SF_USERNAME=your.username@realitybasedgroup.com
SF_LOGIN_URL=https://realitybasedgroup.my.salesforce.com
SF_PRIVATE_KEY_PATH=./salesforce-private.key
```

### Step 3: Discover Available Fields

First, let's see what fields are available on the Work_Orders__c object:

```bash
node describe-work-orders.js
```

This will show you:
- All updateable fields
- Field types (text, picklist, date, etc.)
- Picklist values (if applicable)
- Details about the Work_Order_Number__c field

### Step 4: Update the Test Script

Open `test-work-order-update.js` and update these two sections:

1. **Line 35**: Replace with an actual Work Order Number from your Salesforce:
```javascript
const testWorkOrderNumber = "WO-001"; // 👈 REPLACE with real Work Order Number
```

2. **Lines 49-54**: Replace with the fields you want to update:
```javascript
const updateData = {
  Status__c: "In Progress",  // Replace with actual field names
  Description__c: "Updated from Vimeo import",
  // Add more fields as needed
};
```

### Step 5: Run the Test

```bash
node test-work-order-update.js
```

You should see output like:

```
======================================================================
🧪 TESTING WORK ORDER UPDATE
======================================================================

📝 Step 1: Authenticating with Salesforce...
🔐 SALESFORCE JWT BEARER AUTHENTICATION
✅ AUTHENTICATION SUCCESSFUL!

📝 Step 2: Initializing Salesforce Updater...

📝 Step 3: Looking up Work Order...
🔍 Looking up Work Order: WO-001
✅ Found Work Order: a0X1234567890ABC (Work Order 001)

📋 Work Order Details:
   ID: a0X1234567890ABC
   Name: Work Order 001
   Work Order Number: WO-001

📝 Step 4: Updating Work Order...
✅ Updated Work_Orders__c record: a0X1234567890ABC

======================================================================
📊 UPDATE RESULT
======================================================================
{
  "success": true,
  "recordId": "a0X1234567890ABC",
  "objectType": "Work_Orders__c",
  "updateData": { ... },
  "timestamp": "2025-10-23T...",
  "status": 204
}

✅ SUCCESS! Work Order updated successfully.
```

## 🔧 Troubleshooting

### "Work Order not found"
- Verify the Work Order Number exists in Salesforce
- Check that the `Work_Order_Number__c` field name is correct
- Run `describe-work-orders.js` to confirm the field API name

### "Field not found" or "Invalid field" errors
- Run `describe-work-orders.js` to see all available fields
- Check that field API names match exactly (including `__c` suffix)
- Verify fields are marked as updateable

### Authentication errors
- Verify your `.env` file has correct credentials
- Check that the private key file exists at the specified path
- Confirm the Connected App has JWT Bearer Flow enabled
- Verify your user is pre-authorized in the Connected App

### Permission errors
- Check that your user has edit permissions on Work_Orders__c
- Verify field-level security allows editing of the fields you're updating

## 📦 Next Steps - Batch Processing

Once single record updates work, you can process multiple records:

```javascript
const updater = new SalesforceUpdater(auth);

const updates = [
  {
    workOrderNumber: "WO-001",
    updateData: { Status__c: "Complete" },
    metadata: { source: "vimeo_export" }
  },
  {
    workOrderNumber: "WO-002", 
    updateData: { Status__c: "In Progress" },
    metadata: { source: "vimeo_export" }
  }
];

const results = await updater.processWorkOrderUpdates(updates, {
  batchSize: 5,
  delayMs: 100
});

console.log(`Success: ${results.successful}, Failed: ${results.failed}`);
```

## 🌐 Deploying to Google Cloud Functions

Once testing is complete locally, deploy to Google Cloud:

```bash
cd config
chmod +x deploy.sh
./deploy.sh
```

Make sure to:
1. Store the private key in Google Secret Manager
2. Set environment variables in the Cloud Function
3. Update `cloud/index.js` with your Work Order update logic

## 📝 Field Mapping for Vimeo Data

Common mappings you might use:

| Vimeo Field | Salesforce Field | Type |
|-------------|------------------|------|
| Video ID | Vimeo_Video_ID__c | Text |
| Video Title | Video_Title__c | Text |
| Upload Date | Video_Upload_Date__c | DateTime |
| Duration | Video_Duration__c | Number |
| Status | Status__c | Picklist |

Run `describe-work-orders.js` to confirm your exact field names.

## 🎯 Summary

You're ready to test! Here's the workflow:

1. ✅ Authentication is working (JWT Bearer Flow)
2. 🔍 Run `describe-work-orders.js` to see available fields
3. ✏️ Update `test-work-order-update.js` with real data
4. 🧪 Run `node test-work-order-update.js`
5. 🎉 Verify the update in Salesforce
6. 📦 Scale up to batch processing
7. 🌐 Deploy to Google Cloud Functions

Need help? Check the error messages - they're designed to be descriptive!
