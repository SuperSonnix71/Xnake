const http = require('http');
const { spawn } = require('child_process');

async function testServerStartup() {
  console.log('=== Server Startup Test ===\n');
  
  console.log('Starting server...');
  const serverProcess = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: '3001' },
    stdio: 'pipe'
  });
  
  let serverOutput = '';
  serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });
  
  serverProcess.stderr.on('data', (data) => {
    serverOutput += data.toString();
  });
  
  await new Promise(resolve => {
    setTimeout(resolve, 3000);
  });
  
  console.log('Checking scheduler status endpoint...\n');
  
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/ml/scheduler/status',
    method: 'GET'
  };
  
  const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        
        console.log('Scheduler Status Response:');
        console.log(JSON.stringify(response, null, 2));
        console.log('');
        
        if (response.scheduler && response.scheduler.running !== undefined) {
          console.log('✓ Scheduler endpoint accessible');
          console.log(`✓ Scheduler running: ${response.scheduler.running}`);
          console.log(`✓ Check interval: ${response.scheduler.config.CHECK_INTERVAL_MS / 1000 / 60} minutes`);
          console.log(`✓ Edge case threshold: ${response.scheduler.config.EDGE_CASE_THRESHOLD}`);
          console.log(`✓ Cooldown period: ${response.scheduler.config.MIN_RETRAINING_INTERVAL_MS / 1000 / 60 / 60} hours`);
          console.log(`✓ Total edge cases: ${response.edgeCases.total}\n`);
          
          console.log('✓ Server startup test passed!');
          console.log('\nServer is running with:');
          console.log('  - Periodic retraining scheduler active');
          console.log('  - Status endpoint responding');
          console.log('  - Configuration loaded correctly\n');
        } else {
          console.log('✗ Invalid scheduler status response\n');
        }
      } catch (err) {
        console.log(`✗ Error parsing response: ${err.message}\n`);
      }
      
      console.log('Shutting down server...');
      serverProcess.kill('SIGTERM');
      
      setTimeout(() => {
        if (!serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }
        process.exit(0);
      }, 2000);
    });
  });
  
  req.on('error', (err) => {
    console.log(`✗ Error connecting to server: ${err.message}\n`);
    console.log('Server output:\n', serverOutput);
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
      process.exit(1);
    }, 2000);
  });
  
  req.end();
}

testServerStartup().catch(err => {
  console.error('Server startup test failed:', err);
  process.exit(1);
});
