import fetch from 'node-fetch';

// ==========================================
// 🛠️ CONFIGURATION
// ==========================================
// To test authenticated routes, paste your JWT token between the quotes below.
const TOKEN = ""; 

const BASE_URL = "http://localhost:3001";

// Helper for formatting section breaks
const printSeparator = () => console.log("-----------------------------------------");

async function runTests() {
  console.log("🚀 Starting AgentForge API Integration Tests...\n");

  // ==========================================
  // 1. PUBLIC HEALTH CHECK ENDPOINT
  // ==========================================
  printSeparator();
  console.log("🔍 Testing Health Endpoint...");
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = await healthRes.json();

    if (healthRes.ok && healthData.status === 'ok') {
      console.log("✅ Health check passed!");
      console.log(`   Timestamp: ${healthData.timestamp}`);
    } else {
      console.log(`❌ Health check failed: Unexpected body`, healthData);
    }
  } catch (err) {
    console.log(`❌ Health check failed: Could not connect to server at ${BASE_URL}.`);
    console.log(`   Error: ${err.message}`);
    return; // Exit early if server isn't even running
  }

  // ==========================================
  // 2. AUTHENTICATION PROTECTION LOOP
  // ==========================================
  printSeparator();
  console.log("🔒 Testing Auth Guard Protection...");
  try {
    const unauthRes = await fetch(`${BASE_URL}/api/agents`);
    
    if (unauthRes.status === 401) {
      console.log("✅ Auth protection working! (Received expected 401 Unauthorized)");
    } else if (unauthRes.status === 200) {
      console.log("❌ Auth not protecting routes! (Received 200 OK without a token)");
    } else {
      console.log(`⚠️  Unexpected Auth Response Status: ${unauthRes.status}`);
    }
  } catch (err) {
    console.log(`❌ Auth route test failed: ${err.message}`);
  }

  // ==========================================
  // 3. AUTHENTICATED ENDPOINTS BLOCK
  // ==========================================
  if (!TOKEN) {
    printSeparator();
    console.log("ℹ️  AUTHENTICATED ROUTE TESTING SKIPPED");
    console.log("\nTo test authenticated routes, add your JWT token to the TOKEN variable at the top of this file.");
    console.log("Get your token from: supabase.com → your project → Authentication → Users → click your user → copy the JWT\n");
    printSeparator();
    return;
  }

  printSeparator();
  console.log("🔑 Token found! Testing authenticated routes...");
  
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  };

  // Test GET /api/agents
  try {
    const agentsRes = await fetch(`${BASE_URL}/api/agents`, { headers });
    const agentsData = await agentsRes.json();
    
    if (agentsRes.ok && Array.isArray(agentsData)) {
      console.log(`✅ GET /api/agents passed! found ${agentsData.length} agent(s).`);
    } else {
      console.log(`❌ GET /api/agents failed! Status: ${agentsRes.status}`, agentsData);
    }
  } catch (err) {
    console.log(`❌ GET /api/agents exception: ${err.message}`);
  }

  // Test GET /api/dashboard/stats
  try {
    const statsRes = await fetch(`${BASE_URL}/api/dashboard/stats`, { headers });
    const statsData = await statsRes.json();
    
    if (statsRes.ok) {
      console.log("✅ GET /api/dashboard/stats passed!");
      console.log("   Metrics:", JSON.stringify(statsData, null, 2).replace(/\n/g, '\n   '));
    } else {
      console.log(`❌ GET /api/dashboard/stats failed! Status: ${statsRes.status}`, statsData);
    }
  } catch (err) {
    console.log(`❌ GET /api/dashboard/stats exception: ${err.message}`);
  }

  // Test GET /api/templates
  try {
    const templatesRes = await fetch(`${BASE_URL}/api/templates`, { headers });
    const templatesData = await templatesRes.json();
    
    if (templatesRes.ok && Array.isArray(templatesData)) {
      console.log(`✅ GET /api/templates passed! Found ${templatesData.length} platform template(s).`);
    } else {
      console.log(`❌ GET /api/templates failed! Status: ${templatesRes.status}`, templatesData);
    }
  } catch (err) {
    console.log(`❌ GET /api/templates exception: ${err.message}`);
  }

  printSeparator();
  console.log("🏁 Testing Suite Complete.");
}

runTests();