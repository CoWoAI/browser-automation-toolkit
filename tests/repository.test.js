/**
 * Log Repository tests
 * Tests CRUD operations for log storage
 */

import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/database/postgres.js';
import { logRepository } from '../src/repositories/log-repository.js';
import config from '../src/config.js';

describe('Log Repository', () => {
  // Skip all tests if no DATABASE_URL configured
  const skipIfNoDatabase = !config.databaseUrl;

  before(async () => {
    if (config.databaseUrl) {
      await db.connect(config.databaseUrl);
    }
  });

  beforeEach(async () => {
    if (config.databaseUrl && db.isConnected()) {
      // Clean up logs before each test
      await logRepository.deleteAll();
    }
  });

  after(async () => {
    if (db.isConnected()) {
      await logRepository.deleteAll();
      await db.close();
    }
  });

  describe('create()', () => {
    test('creates log with id and timestamp', { skip: skipIfNoDatabase }, async () => {
      const log = await logRepository.create({
        level: 'info',
        message: 'Test message',
        tool: 'test_tool'
      });

      assert.ok(log.id);
      assert.ok(log.id.startsWith('log_'));
      assert.ok(log.timestamp);
      assert.strictEqual(log.level, 'info');
      assert.strictEqual(log.message, 'Test message');
      assert.strictEqual(log.tool, 'test_tool');
    });

    test('defaults level to info', { skip: skipIfNoDatabase }, async () => {
      const log = await logRepository.create({
        message: 'No level specified'
      });

      assert.strictEqual(log.level, 'info');
    });

    test('stores metadata in JSONB', { skip: skipIfNoDatabase }, async () => {
      const log = await logRepository.create({
        level: 'error',
        message: 'Error with details',
        tool: 'screenshot',
        tabId: 123,
        customField: 'custom value'
      });

      assert.strictEqual(log.tabId, 123);
      assert.strictEqual(log.customField, 'custom value');
    });
  });

  describe('findMany()', () => {
    test('returns all logs ordered by created_at DESC', { skip: skipIfNoDatabase }, async () => {
      await logRepository.create({ level: 'info', message: 'First' });
      await logRepository.create({ level: 'error', message: 'Second' });
      await logRepository.create({ level: 'warn', message: 'Third' });

      const logs = await logRepository.findMany({});
      assert.strictEqual(logs.length, 3);
      assert.strictEqual(logs[0].message, 'Third'); // Most recent first
    });

    test('filters by level', { skip: skipIfNoDatabase }, async () => {
      await logRepository.create({ level: 'info', message: 'Info log' });
      await logRepository.create({ level: 'error', message: 'Error log' });
      await logRepository.create({ level: 'info', message: 'Another info' });

      const logs = await logRepository.findMany({ level: 'error' });
      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0].message, 'Error log');
    });

    test('filters by tool', { skip: skipIfNoDatabase }, async () => {
      await logRepository.create({ level: 'info', message: 'Screenshot', tool: 'screenshot' });
      await logRepository.create({ level: 'info', message: 'Click', tool: 'click' });
      await logRepository.create({ level: 'info', message: 'Another click', tool: 'click' });

      const logs = await logRepository.findMany({ tool: 'click' });
      assert.strictEqual(logs.length, 2);
    });

    test('searches in message', { skip: skipIfNoDatabase }, async () => {
      await logRepository.create({ level: 'info', message: 'User login successful' });
      await logRepository.create({ level: 'error', message: 'Login failed' });
      await logRepository.create({ level: 'info', message: 'User logout' });

      const logs = await logRepository.findMany({ search: 'login' });
      assert.strictEqual(logs.length, 2);
    });

    test('filters by since timestamp', { skip: skipIfNoDatabase }, async () => {
      await logRepository.create({ level: 'info', message: 'Old log' });
      const since = new Date().toISOString();
      await new Promise(r => setTimeout(r, 10)); // Small delay
      await logRepository.create({ level: 'info', message: 'New log' });

      const logs = await logRepository.findMany({ since });
      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0].message, 'New log');
    });

    test('respects limit', { skip: skipIfNoDatabase }, async () => {
      for (let i = 0; i < 10; i++) {
        await logRepository.create({ level: 'info', message: `Log ${i}` });
      }

      const logs = await logRepository.findMany({ limit: 5 });
      assert.strictEqual(logs.length, 5);
    });

    test('respects offset', { skip: skipIfNoDatabase }, async () => {
      for (let i = 0; i < 5; i++) {
        await logRepository.create({ level: 'info', message: `Log ${i}` });
      }

      const logs = await logRepository.findMany({ limit: 2, offset: 2 });
      assert.strictEqual(logs.length, 2);
    });
  });

  describe('count()', () => {
    test('returns total count', { skip: skipIfNoDatabase }, async () => {
      await logRepository.create({ level: 'info', message: 'One' });
      await logRepository.create({ level: 'info', message: 'Two' });
      await logRepository.create({ level: 'info', message: 'Three' });

      const count = await logRepository.count();
      assert.strictEqual(count, 3);
    });

    test('returns filtered count', { skip: skipIfNoDatabase }, async () => {
      await logRepository.create({ level: 'info', message: 'Info' });
      await logRepository.create({ level: 'error', message: 'Error' });
      await logRepository.create({ level: 'info', message: 'Another info' });

      const count = await logRepository.count({ level: 'error' });
      assert.strictEqual(count, 1);
    });
  });

  describe('getFilters()', () => {
    test('returns unique levels and tools', { skip: skipIfNoDatabase }, async () => {
      await logRepository.create({ level: 'info', message: 'A', tool: 'screenshot' });
      await logRepository.create({ level: 'error', message: 'B', tool: 'click' });
      await logRepository.create({ level: 'info', message: 'C', tool: 'screenshot' });
      await logRepository.create({ level: 'warn', message: 'D' }); // No tool

      const filters = await logRepository.getFilters();
      assert.ok(filters.levels.includes('info'));
      assert.ok(filters.levels.includes('error'));
      assert.ok(filters.levels.includes('warn'));
      assert.ok(filters.tools.includes('screenshot'));
      assert.ok(filters.tools.includes('click'));
      assert.strictEqual(filters.tools.length, 2);
    });
  });

  describe('deleteAll()', () => {
    test('removes all logs', { skip: skipIfNoDatabase }, async () => {
      await logRepository.create({ level: 'info', message: 'One' });
      await logRepository.create({ level: 'info', message: 'Two' });

      const deleted = await logRepository.deleteAll();
      assert.ok(deleted >= 2);

      const count = await logRepository.count();
      assert.strictEqual(count, 0);
    });
  });

  describe('deleteBefore()', () => {
    test('removes logs before date', { skip: skipIfNoDatabase }, async () => {
      await logRepository.create({ level: 'info', message: 'Old' });
      const cutoff = new Date();
      await new Promise(r => setTimeout(r, 10));
      await logRepository.create({ level: 'info', message: 'New' });

      const deleted = await logRepository.deleteBefore(cutoff);
      assert.strictEqual(deleted, 1);

      const remaining = await logRepository.findMany({});
      assert.strictEqual(remaining.length, 1);
      assert.strictEqual(remaining[0].message, 'New');
    });
  });
});
