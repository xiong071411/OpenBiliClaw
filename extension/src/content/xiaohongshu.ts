/**
 * OpenBiliClaw — Xiaohongshu content script entry.
 *
 * Injected into xiaohongshu.com pages. Wires the generic collector
 * kernel to the xhs-specific adapter. MVP scope: snapshot, click,
 * scroll, search — like/collect/comment are deliberately skipped.
 */

import { startCollector } from "./kernel.js";
import { xiaohongshuAdapter } from "../shared/platforms/xiaohongshu.js";

startCollector(xiaohongshuAdapter);

console.log(
  "[OpenBiliClaw] Xiaohongshu behavior collector initialized on",
  xiaohongshuAdapter.detectPageType(window.location.href),
  "page",
);
