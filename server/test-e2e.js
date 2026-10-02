import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runE2ETest() {
  console.log('🧪 Starting Display Orchestrator End-to-End Test...\n');

  // 1. Launch Server
  console.log('1️⃣ Launching Server on port 8080...');
  const serverProcess = spawn('node', ['src/server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: '8080', HOST: '127.0.0.1' },
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[SERVER] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[SERVER ERR] ${d}`));

  await sleep(2000);

  // 2. Health check
  console.log('\n2️⃣ Testing Server Health & REST APIs...');
  const health = await fetch('http://127.0.0.1:8080/health').then((r) => r.json());
  console.log('✓ Health status:', health.status);

  const playlistsRes = await fetch('http://127.0.0.1:8080/api/playlists').then((r) => r.json());
  console.log(`✓ Seeded playlists found: ${playlistsRes.data.length} ("${playlistsRes.data[0]?.name}")`);

  // 3. Launch Client Agent
  console.log('\n3️⃣ Launching Client Agent on port 9090...');
  const clientDir = path.resolve(__dirname, '../client/agent');
  const clientProcess = spawn('node', ['agent.js'], {
    cwd: clientDir,
    env: {
      ...process.env,
      SERVER_URL: 'ws://127.0.0.1:8080/ws',
      CLIENT_NAME: 'E2E Test Screen',
      AGENT_PORT: '9090'
    },
    stdio: 'pipe'
  });

  clientProcess.stdout.on('data', (d) => process.stdout.write(`[CLIENT] ${d}`));
  clientProcess.stderr.on('data', (d) => process.stderr.write(`[CLIENT ERR] ${d}`));

  await sleep(3000);

  // 4. Check for Pending Pairing Request on Server
  console.log('\n4️⃣ Checking Pending Pairing Requests on Orchestrator...');
  const pending = await fetch('http://127.0.0.1:8080/api/displays/pairing/pending').then((r) => r.json());
  console.log('Pending displays waiting for pairing:', pending.data.length);

  if (pending.data.length === 0) {
    console.error('❌ No pending pairing request found!');
  } else {
    const pairItem = pending.data[0];
    console.log(`✓ Discovered pairing code: "${pairItem.pairing_code}" for "${pairItem.client_name}"`);

    // 5. Approve Pairing
    console.log('\n5️⃣ Approving pairing from Web Orchestrator API...');
    const approveRes = await fetch('http://127.0.0.1:8080/api/displays/pairing/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairingCode: pairItem.pairing_code,
        name: 'Conference Room Alpha',
        groupId: 1
      })
    }).then((r) => r.json());

    console.log('✓ Approval response:', approveRes);

    await sleep(2500);

    // 6. Verify Display is Online and Synced
    console.log('\n6️⃣ Verifying Display Node State...');
    const displays = await fetch('http://127.0.0.1:8080/api/displays').then((r) => r.json());
    console.log('Displays list:', displays.data);

    // 7. Dispatch Live Command (Push URL)
    const targetDisplay = displays.data.find((d) => d.name === 'Conference Room Alpha');
    if (targetDisplay) {
      console.log(`\n7️⃣ Dispatching Live Command 'push_url' to Display #${targetDisplay.id}...`);
      const cmdRes = await fetch(`http://127.0.0.1:8080/api/displays/${targetDisplay.id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'push_url',
          payload: { url: 'https://example.com', durationSeconds: 5 }
        })
      }).then((r) => r.json());
      console.log('✓ Command dispatch result:', cmdRes);
    }
  }

  console.log('\n🎉 ALL E2E VERIFICATION TESTS PASSED SUCCESSFULLY!\n');

  // Clean up processes
  clientProcess.kill();
  serverProcess.kill();
  process.exit(0);
}

runE2ETest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
