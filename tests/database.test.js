/**
 * Database connection tests
 * Tests PostgreSQL connection pool and configuration
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/database/postgres.js';
import config from '../src/config.js';

describe('Database Connection', () => {
  // Skip tests if no DATABASE_URL configured
  const skipIfNoDatabase = !config.databaseUrl;

  test('connect returns false when no DATABASE_URL', async () => {
    const testDb = (await import('../src/database/postgres.js')).db;
    // Create a fresh instance to test
    const connected = await testDb.connect(null);
    assert.strictEqual(connected, false);
    assert.strictEqual(testDb.isConnected(), false);
  });

  test('connect returns false with invalid URL', async () => {
    const connected = await db.connect('postgres://invalid:invalid@localhost:9999/nonexistent');
    assert.strictEqual(connected, false);
    assert.strictEqual(db.isConnected(), false);
  });

  test('connect succeeds with valid DATABASE_URL', { skip: skipIfNoDatabase }, async () => {
    const connected = await db.connect(config.databaseUrl);
    assert.strictEqual(connected, true);
    assert.strictEqual(db.isConnected(), true);
  });

  test('query executes successfully after connect', { skip: skipIfNoDatabase }, async () => {
    if (!db.isConnected()) {
      await db.connect(config.databaseUrl);
    }
    const result = await db.query('SELECT 1 as num');
    assert.strictEqual(result.rows[0].num, 1);
  });

  test('getPoolStats returns connection stats', { skip: skipIfNoDatabase }, async () => {
    if (!db.isConnected()) {
      await db.connect(config.databaseUrl);
    }
    const stats = db.getPoolStats();
    assert.ok(stats !== null);
    assert.ok('totalCount' in stats);
    assert.ok('idleCount' in stats);
    assert.ok('waitingCount' in stats);
  });

  test('close disconnects successfully', { skip: skipIfNoDatabase }, async () => {
    if (!db.isConnected()) {
      await db.connect(config.databaseUrl);
    }
    await db.close();
    assert.strictEqual(db.isConnected(), false);
  });

  test('query throws after close', { skip: skipIfNoDatabase }, async () => {
    await db.close();
    await assert.rejects(
      () => db.query('SELECT 1'),
      { message: 'Database not connected' }
    );
  });

  // Clean up after all tests
  after(async () => {
    if (db.isConnected()) {
      await db.close();
    }
  });
});
