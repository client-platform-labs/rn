#!/usr/bin/env node
// scripts/e2e/jget.mjs — 统一的 json/jsonc 读取 (支持 path 表达式)
// usage: node jget.mjs <file> <dot-path>   e.g.   node jget.mjs x.jsonc .modules[0].name
import { readFileSync } from "node:fs";
const [, , file, ...rest] = process.argv;
const expr = rest.join(" ");
let raw = readFileSync(file, "utf8");
// 简单 jsonc 注释剥离
raw = raw
  .split("\n")
  .map((l) => {
    const idx = l.indexOf("//");
    if (idx >= 0) {
      const before = l.slice(0, idx);
      const q = (before.match(/"/g) || []).length;
      if (q % 2 === 0) return before;
    }
    return l;
  })
  .join("\n");
// 去掉尾逗号
raw = raw.replace(/,(\s*[}\]])/g, "$1");
let data;
try { data = JSON.parse(raw); } catch (e) {
  console.error("parse fail:", e.message);
  process.exit(2);
}
if (!expr) {
  console.log(JSON.stringify(data));
  process.exit(0);
}
let v = data;
const re = /\[\d+\]|\.[\w-]+|"[^"]+"/g;
let mm;
while ((mm = re.exec(expr))) {
  const t = mm[0];
  if (t.startsWith("[")) v = v?.[parseInt(t.slice(1, -1), 10)];
  else if (t.startsWith(".")) v = v?.[t.slice(1)];
  else v = v?.[t.slice(1, -1)];
  if (v === undefined || v === null) break;
}
if (typeof v === "object") console.log(JSON.stringify(v));
else console.log(v);
