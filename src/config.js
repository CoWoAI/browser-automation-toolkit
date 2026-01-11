/**
 * Configuration module for browser-automation-toolkit
 * Loads settings from environment variables
 */

export const config = {
  // Server settings
  port: parseInt(process.env.PORT) || 8766,
  host: process.env.HOST || '127.0.0.1',

  // Command execution
  commandTimeout: parseInt(process.env.COMMAND_TIMEOUT) || 30000,

  // Database settings
  databaseUrl: process.env.DATABASE_URL || null,

  // Log settings
  maxLogsInMemory: parseInt(process.env.MAX_LOGS_IN_MEMORY) || 1000,
  logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 30,
};

export default config;
