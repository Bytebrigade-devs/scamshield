/**
 * Route-service tests: `/api/check` and `/api/usage` must share ONE checker service, otherwise
 * the read-back would always report an empty store. Also pins that the shared service reports the
 * trial allowance before any check, so an empty checker is not mistaken for a broken endpoint.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeCheckService } from './route-service.ts';
import { PLAN_ALLOWANCES } from '../boundary/check-boundary.ts';

test('both mounted routes resolve to the same checker service and usage store', () => {
  assert.equal(routeCheckService(), routeCheckService());
});

test('the shared service reports the trial allowance before any accepted check', () => {
  const reading = routeCheckService().readUsage();
  assert.equal(reading.monthlyLimit, PLAN_ALLOWANCES.trial.monthly);
  assert.equal(reading.dailyLimit, PLAN_ALLOWANCES.trial.daily);
  assert.equal(reading.anchored, true);
  assert.equal(reading.monthlyUsed, 0);
});