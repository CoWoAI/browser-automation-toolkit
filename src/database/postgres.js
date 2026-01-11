/**
 * PostgreSQL database connection module
 * Follows patterns from CoWoAI-Identity and CoWoAI-Sync
 */

import pg from 'pg';
const { Pool } = pg;

class Database {
  constructor() {
    this.pool = null;
    this.connected = false;
  }

  /**
   * Connect to PostgreSQL database
   * @param {string} databaseUrl - PostgreSQL connection string
   * @returns {Promise<boolean>} - true if connected, false otherwise
   */
  async connect(databaseUrl) {
    if (!databaseUrl) {
      console.log('DATABASE_URL not set, using file-based storage');
      return false;
    }

    try {
      this.pool = new Pool({
        connectionString: databaseUrl,
        max: 25,                          // Match Identity/Sync settings
        min: 5,
        idleTimeoutMillis: 30 * 60 * 1000,  // 30 minutes
        connectionTimeoutMillis: 10000,      // 10 seconds
      });

      // Test connection with timeout
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.connected = true;
      console.log('Connected to PostgreSQL');
      return true;
    } catch (err) {
      console.error('Failed to connect to PostgreSQL:', err.message);
      console.log('Falling back to file-based storage');
      this.pool = null;
      this.connected = false;
      return false;
    }
  }

  /**
   * Execute a query
   * @param {string} text - SQL query text
   * @param {Array} params - Query parameters
   * @returns {Promise<pg.QueryResult>}
   */
  async query(text, params) {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    return this.pool.query(text, params);
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connected = false;
      console.log('Disconnected from PostgreSQL');
    }
  }

  /**
   * Check if database is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get connection pool stats
   * @returns {Object|null}
   */
  getPoolStats() {
    if (!this.pool) return null;
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}

// Singleton instance
export const db = new Database();

export default db;
