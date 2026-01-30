#!/bin/bash

# Xnake Monitoring Script
# Usage: ./monitor.sh [check|logs|shame|fame|stats]

case "$1" in
  check)
    echo "🔍 Checking Xnake Server Status..."
    echo ""
    
    # Check if container is running
    if ssh ai "docker ps | grep -q Xnake"; then
      echo "✅ Container is running"
    else
      echo "❌ Container is NOT running!"
      exit 1
    fi
    
    # Check if server responds
    if ssh ai "curl -s -f http://localhost:3333 > /dev/null"; then
      echo "✅ Server is responding"
    else
      echo "❌ Server is NOT responding!"
      exit 1
    fi
    
    echo "✅ All systems operational"
    ;;
    
  logs)
    echo "📋 Recent Server Logs (last 50 lines):"
    echo "========================================"
    ssh ai "docker logs Xnake 2>&1 | tail -50"
    ;;
    
  errors)
    echo "🚨 Recent Validation Errors:"
    echo "========================================"
    ssh ai "docker logs Xnake 2>&1 | grep -E '(CHEAT DETECTION|validation failed)' | tail -20"
    ;;
    
  shame)
    echo "🔴 Hall of Shame (Caught Cheaters):"
    echo "========================================"
    ssh ai "curl -s 'http://localhost:3333/api/hallofshame?limit=20' | python3 -m json.tool"
    ;;
    
  fame)
    echo "🏆 Hall of Fame (Top 10 Scores):"
    echo "========================================"
    ssh ai "curl -s 'http://localhost:3333/api/halloffame?limit=10' | python3 -m json.tool"
    ;;
    
  stats)
    echo "📊 Xnake Statistics:"
    echo "========================================"
    ssh ai "docker exec Xnake node -e \"
const initSqlJs = require('sql.js');
const fs = require('fs');
(async () => {
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync('/app/xnake.db');
  const db = new SQL.Database(buffer);
  
  const players = db.exec('SELECT COUNT(*) FROM players')[0].values[0][0];
  const scores = db.exec('SELECT COUNT(*) FROM scores')[0].values[0][0];
  const cheaters = db.exec('SELECT COUNT(*) FROM cheaters')[0].values[0][0];
  const topScore = db.exec('SELECT MAX(score) FROM scores')[0].values[0][0];
  
  console.log('');
  console.log('Total Players:', players);
  console.log('Total Games:', scores);
  console.log('Cheaters Caught:', cheaters);
  console.log('Highest Score:', topScore);
  console.log('');
  
  db.close();
})();
\""
    ;;
    
  *)
    echo "🐍 Xnake Monitoring Tool"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  check   - Check if server is running and responding"
    echo "  logs    - View recent server logs (last 50 lines)"
    echo "  errors  - View recent validation errors/cheat detections"
    echo "  shame   - View Hall of Shame (caught cheaters)"
    echo "  fame    - View Hall of Fame (top scores)"
    echo "  stats   - View database statistics"
    echo ""
    echo "Example: $0 check"
    ;;
esac
