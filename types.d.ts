// Type declarations for the Snake Game

declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: any[]): void;
    exec(sql: string, params?: any[]): QueryExecResult[];
    export(): Uint8Array;
    close(): void;
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export default function initSqlJs(config?: object): Promise<SqlJsStatic>;
}

// Express session augmentation
declare module 'express-session' {
  interface SessionData {
    playerId: string;
    username: string;
  }
}

// Player types
interface Player {
  id: string;
  username: string;
  fingerprint: string;
  created_at?: number;
  last_seen?: number;
}

// Score types
interface Score {
  score: number;
  speed_level: number;
  played_at: number;
}

interface HallOfFameEntry {
  username: string;
  score: number;
  speed_level: number;
  played_at: number;
  rank: number;
}

// Cheater types
interface CheaterEntry {
  username: string;
  ip_address: string;
  cheat_type: string;
  attempted_score: number;
  reason: string;
  caught_at: number;
  offense_count: number;
}

// Global stats
interface GlobalStats {
  total_players: number;
  total_games: number;
  highest_score: number;
  average_score: number;
}

// Game validation types
interface Move {
  d: number;  // direction
  f: number;  // frame
  t: number;  // time
}

interface Heartbeat {
  t: number;      // time
  p: number;      // performance time
  f: number;      // frame
  s: number;      // speed
  score: number;  // score
}

interface PauseCheckResult {
  hasPause: boolean;
  suspiciousGaps: Array<{
    moveIndex: number;
    gapMs: number;
    gapSeconds: number;
  }>;
  totalSuspiciousTime?: number;
  gapCount?: number;
}

interface HeartbeatValidationResult {
  valid: boolean;
  reason?: string;
  suspicious?: boolean;
  issues?: Array<object>;
  heartbeatCount?: number;
  avgMsPerFrame?: number;
}

interface BotDetectionResult {
  isBot: boolean;
  reason?: string;
  movesPerFood?: number;
  details?: {
    score: number;
    moves: number;
    foodEaten: number;
    movesPerFood: string;
    threshold: number;
    humanAverage: string;
  };
}

interface GameValidationLog {
  frames: Array<object>;
  summary: object;
  errors: string[];
}

interface GameValidationResult {
  valid: boolean;
  reason?: string;
  replayedScore?: number;
  replayedFoodEaten?: number;
  log: GameValidationLog;
}

interface GameSession {
  seed: number;
  startTime: number;
}
