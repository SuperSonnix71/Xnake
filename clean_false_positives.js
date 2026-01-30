#!/usr/bin/env node

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'xnake.db');

async function cleanFalsePositives() {
  try {
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);
    
    console.log('🧹 Cleaning false positives from Hall of Shame...\n');
    
    // Get current qwe entries
    const qweEntries = db.exec("SELECT * FROM cheaters WHERE username = 'qwe'");
    
    if (qweEntries.length > 0 && qweEntries[0].values.length > 0) {
      console.log(`Found ${qweEntries[0].values.length} entries for "qwe":`);
      qweEntries[0].values.forEach(entry => {
        console.log(`  - Score: ${entry[6]}, Reason: ${entry[7]}`);
      });
      console.log('');
    } else {
      console.log('No entries found for "qwe"\n');
    }
    
    // Remove qwe entries (false positives from broken duration calculation)
    console.log('Removing qwe entries (false positives from broken duration calculation)...');
    db.run("DELETE FROM cheaters WHERE username = 'qwe'");
    const qweDeleted = db.exec("SELECT changes()")[0].values[0][0];
    console.log(`✓ Deleted ${qweDeleted} entries for "qwe"\n`);
    
    // Show remaining cheaters
    const remaining = db.exec('SELECT username, COUNT(*) as count FROM cheaters GROUP BY username');
    console.log('Remaining cheaters:');
    if (remaining.length > 0 && remaining[0].values.length > 0) {
      remaining[0].values.forEach(([username, count]) => {
        console.log(`  - ${username}: ${count} offense(s)`);
      });
    } else {
      console.log('  (Hall of Shame is now empty)');
    }
    
    // Save changes
    const data = db.export();
    fs.writeFileSync(dbPath, data);
    db.close();
    
    console.log('\n✅ Database updated successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

cleanFalsePositives();
