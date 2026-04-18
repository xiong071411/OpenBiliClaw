/**
 * Tests for the xhs task dispatcher's pure helpers.
 *
 * Chrome integration (tabs.create, alarms, fetch) is tested only via the
 * thin wrappers' type contracts — no jsdom needed for the logic layer.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTaskUrl,
  isValidTask,
  type XhsTask,
} from "../src/background/xhs-task-dispatcher.ts";

test("buildTaskUrl encodes keyword search URL", () => {
  const task: XhsTask = { id: "t1", type: "search", keyword: "机械键盘" };
  const url = buildTaskUrl(task);
  assert.equal(
    url,
    "https://www.xiaohongshu.com/search_result?keyword=%E6%9C%BA%E6%A2%B0%E9%94%AE%E7%9B%98",
  );
});

test("buildTaskUrl returns creator URL directly", () => {
  const task: XhsTask = {
    id: "t2",
    type: "creator",
    creator_url: "https://www.xiaohongshu.com/user/profile/abc",
  };
  assert.equal(
    buildTaskUrl(task),
    "https://www.xiaohongshu.com/user/profile/abc",
  );
});

test("buildTaskUrl returns null for search without keyword", () => {
  const task: XhsTask = { id: "t3", type: "search" };
  assert.equal(buildTaskUrl(task), null);
});

test("buildTaskUrl returns null for creator without url", () => {
  const task: XhsTask = { id: "t4", type: "creator" };
  assert.equal(buildTaskUrl(task), null);
});

test("isValidTask accepts well-formed tasks", () => {
  assert.equal(isValidTask({ id: "t1", type: "search", keyword: "x" }), true);
  assert.equal(
    isValidTask({
      id: "t2",
      type: "creator",
      creator_url: "https://example.com",
    }),
    true,
  );
});

test("isValidTask rejects malformed input", () => {
  assert.equal(isValidTask(null), false);
  assert.equal(isValidTask({}), false);
  assert.equal(isValidTask({ id: "", type: "search" }), false);
  assert.equal(isValidTask({ id: "t1", type: "unknown" }), false);
  assert.equal(isValidTask("string"), false);
});
