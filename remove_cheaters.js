const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function removeCheaters() {
  try {
    const SQL = await initSqlJs();
    const dbPath = path.join(__dirname, 'xnake.db');
    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);
    
    console.log('Finding cheated scores...');
    
    const anon2Query = db.exec("SELECT id FROM players WHERE username = 'Anon2'");
    const testQuery = db.exec("SELECT id FROM players WHERE username = 'test'");
    
    const anon2Id = anon2Query[0]?.values[0]?.[0];
    const testId = testQuery[0]?.values[0]?.[0];
    
    console.log(`Anon2 ID: ${anon2Id}`);
    console.log(`test ID: ${testId}`);
    
    console.log('\nDeleting cheated scores (score >= 9000)...');
    
    if (anon2Id) {
      db.run('DELETE FROM scores WHERE player_id = ? AND score >= 9000', [anon2Id]);
      console.log('✓ Deleted Anon2 cheated scores');
    }
    
    if (testId) {
      db.run('DELETE FROM scores WHERE player_id = ? AND score >= 9000', [testId]);
      console.log('✓ Deleted test cheated scores');
    }
    
    const data = db.export();
    fs.writeFileSync(dbPath, data);
    
    console.log('\n✓ Cheated scores removed successfully!');
    console.log('✓ Database saved to disk');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

removeCheaters();
