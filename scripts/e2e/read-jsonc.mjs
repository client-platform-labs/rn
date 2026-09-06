#!/usr/bin/env node
// scripts/e2e/read-jsonc.mjs — 读 JSONC (支持 // 注释 + 尾逗号)
// usage: node read-jsonc.mjs <file> [jq-expression]
import { readFileSync } from "node:fs";
const [, , file, ...expr] = process.argv;
let raw = readFileSync(file, "utf8");
// 去 // 行内注释（保留 // 开头但不在字符串内的）
raw = raw
  .split("\n")
  .map((l) => {
    // 简单处理：以 // 开头整行去掉；行内 // 后面也去掉
    const idx = l.indexOf("//");
    if (idx >= 0) {
      // 粗略判断是否在字符串内
      const before = l.slice(0, idx);
      const q = (before.match(/"/g) || []).length;
      if (q % 2 === 0) return before;
    }
    return l;
  })
  .join("\n");
const data = JSON.parse(raw);
if (expr.length > 0) {
  // 简单表达式：.a.b.c 或 .a[0].b
  const path = expr.join(" ");
  const m = path.match(/^\.([\w-]+)((?:\.[\w-]+|\[\d+\])*)$/);
  if (!m) {
    console.error("unsupported expr:", path);
    process.exit(2);
  }
  let v = data;
  const tail = m[2];
  const re = /\[\d+\]|\.[\w-]+/g;
  let mm;
  while ((mm = re.exec(tail))) {
    const t = mm[0];
    if (t.startsWith("[")) v = v?.[parseInt(t.slice(1, -1), 10)];
    else v = v?.[t.slice(1)];
    if (v === undefined) break;
  }
  if (typeof v === "object") console.log(JSON.stringify(v));
  else console.log(v);
} else {
  console.log(JSON.stringify(data, null, 2));
}
