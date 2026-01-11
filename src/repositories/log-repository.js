/**
 * Log Repository - Data access layer for logs
 * Follows repository pattern from CoWoAI-Identity and CoWoAI-Sync
 */

import { db } from '../database/postgres.js';

export class LogRepository {
  /**
   * Create a new log entry
   * @param {Object} entry - Log entry data
   * @returns {Promise<Object>} - Created log entry
   */
  async create(entry) {
    const externalId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Extract known fields, put rest in metadata
    const { level, tool, message, tabId, ...rest } = entry;
    const metadata = Object.keys(rest).length > 0 ? rest : null;
    if (tabId !== undefined) {
      metadata ? metadata.tabId = tabId : null;
    }

    const result = await db.query(`
      INSERT INTO logs (external_id, level, tool, message, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, external_id, level, tool, message, metadata, created_at
    `, [
      externalId,
      level || 'info',
      tool || null,
      message || '',
      metadata ? JSON.stringify(metadata) : null
    ]);

    return this.rowToLog(result.rows[0]);
  }

  /**
   * Find logs with filtering
   * @param {Object} options - Query options
   * @returns {Promise<Object[]>} - Array of log entries
   */
  async findMany({ level, tool, search, since, limit = 100, offset = 0 } = {}) {
    let query = 'SELECT * FROM logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (level) {
      query += ` AND level = $${paramIndex++}`;
      params.push(level);
    }
    if (tool) {
      query += ` AND tool = $${paramIndex++}`;
      params.push(tool);
    }
    if (search) {
      query += ` AND (message ILIKE $${paramIndex} OR tool ILIKE $${paramIndex})`;
      paramIndex++;
      params.push(`%${search}%`);
    }
    if (since) {
      query += ` AND created_at > $${paramIndex++}`;
      params.push(new Date(since));
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows.map(row => this.rowToLog(row));
  }

  /**
   * Count total logs
   * @param {Object} options - Filter options (same as findMany)
   * @returns {Promise<number>}
   */
  async count({ level, tool, search, since } = {}) {
    let query = 'SELECT COUNT(*) as count FROM logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (level) {
      query += ` AND level = $${paramIndex++}`;
      params.push(level);
    }
    if (tool) {
      query += ` AND tool = $${paramIndex++}`;
      params.push(tool);
    }
    if (search) {
      query += ` AND (message ILIKE $${paramIndex} OR tool ILIKE $${paramIndex})`;
      paramIndex++;
      params.push(`%${search}%`);
    }
    if (since) {
      query += ` AND created_at > $${paramIndex++}`;
      params.push(new Date(since));
    }

    const result = await db.query(query, params);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get unique filter values for UI dropdowns
   * @returns {Promise<Object>} - { levels: string[], tools: string[] }
   */
  async getFilters() {
    const levelsResult = await db.query(
      'SELECT DISTINCT level FROM logs WHERE level IS NOT NULL ORDER BY level'
    );
    const toolsResult = await db.query(
      'SELECT DISTINCT tool FROM logs WHERE tool IS NOT NULL ORDER BY tool'
    );

    return {
      levels: levelsResult.rows.map(r => r.level),
      tools: toolsResult.rows.map(r => r.tool)
    };
  }

  /**
   * Delete all logs
   * @returns {Promise<number>} - Number of deleted rows
   */
  async deleteAll() {
    const result = await db.query('DELETE FROM logs');
    return result.rowCount;
  }

  /**
   * Delete logs older than a date (for retention cleanup)
   * @param {Date} date - Delete logs before this date
   * @returns {Promise<number>} - Number of deleted rows
   */
  async deleteBefore(date) {
    const result = await db.query('DELETE FROM logs WHERE created_at < $1', [date]);
    return result.rowCount;
  }

  /**
   * Convert database row to log object
   * @param {Object} row - Database row
   * @returns {Object} - Log object matching API format
   */
  rowToLog(row) {
    const log = {
      id: row.external_id,
      timestamp: row.created_at.toISOString(),
      level: row.level,
      message: row.message,
    };

    if (row.tool) {
      log.tool = row.tool;
    }

    // Merge metadata back into log object
    if (row.metadata) {
      const metadata = typeof row.metadata === 'string'
        ? JSON.parse(row.metadata)
        : row.metadata;
      Object.assign(log, metadata);
    }

    return log;
  }
}

// Singleton instance
export const logRepository = new LogRepository();

export default logRepository;
