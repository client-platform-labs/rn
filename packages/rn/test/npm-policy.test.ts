import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildNpmChildEnv,
  DEFAULT_NPM_POLICY,
  DEFAULT_PUBLIC_NPM_REGISTRY,
  resolveNpmPolicy,
} from "../dist/npm-policy.js";

describe("resolveNpmPolicy", () => {
  it("defaults to inherit without forcing registry", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rn-npm-policy-"));
    const resolved = resolveNpmPolicy({
      env: {},
      hostConfigPath: path.join(dir, "missing.json"),
    });
    assert.equal(DEFAULT_NPM_POLICY, "inherit");
    assert.equal(resolved.policy, "inherit");
    assert.equal(resolved.policySource, "default");
    assert.equal(resolved.registry, undefined);
    assert.equal(resolved.registrySource, "none");
  });

  it("flag beats env and host config", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rn-npm-policy-"));
    const configPath = path.join(dir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ npm: { policy: "inherit", registry: "https://host.example/" } }),
    );
    const resolved = resolveNpmPolicy({
      isolatedNpmrc: true,
      flagRegistry: "https://flag.example/",
      env: {
        CLIENT_PLATFORM_NPM_POLICY: "inherit",
        CLIENT_PLATFORM_NPM_REGISTRY: "https://env.example/",
      },
      hostConfigPath: configPath,
    });
    assert.equal(resolved.policy, "isolated");
    assert.equal(resolved.policySource, "flag");
    assert.equal(resolved.registry, "https://flag.example/");
    assert.equal(resolved.registrySource, "flag");
  });

  it("reads host config when env unset", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rn-npm-policy-"));
    const configPath = path.join(dir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        npm: { policy: "isolated", registry: "https://corp.example/" },
      }),
    );
    const resolved = resolveNpmPolicy({
      env: {},
      hostConfigPath: configPath,
    });
    assert.equal(resolved.policy, "isolated");
    assert.equal(resolved.policySource, "host-config");
    assert.equal(resolved.registry, "https://corp.example/");
    assert.equal(resolved.registrySource, "host-config");
    assert.equal(resolved.hostConfigLoaded, true);
  });

  it("isolated without registry override uses public default", () => {
    const resolved = resolveNpmPolicy({
      flagPolicy: "isolated",
      env: {},
      hostConfigPath: path.join(tmpdir(), "no-such-rn-config.json"),
    });
    assert.equal(resolved.policy, "isolated");
    assert.equal(resolved.registry, DEFAULT_PUBLIC_NPM_REGISTRY);
    assert.equal(resolved.registrySource, "default");
  });
});

describe("buildNpmChildEnv", () => {
  it("isolated drops npm_config_* and forces registry", () => {
    const resolved = resolveNpmPolicy({
      flagPolicy: "isolated",
      env: {},
      hostConfigPath: path.join(tmpdir(), "no-such.json"),
    });
    const { env, replaceEnv } = buildNpmChildEnv(
      resolved,
      { CI: "1" },
      {
        PATH: "/bin",
        npm_config_cdnurl: "http://noise",
        npm_config_registry: "https://should-drop.example/",
        HOME: "/tmp",
      },
    );
    assert.equal(replaceEnv, true);
    assert.equal(env.CI, "1");
    assert.equal(env.npm_config_cdnurl, undefined);
    assert.equal(env.npm_config_registry, DEFAULT_PUBLIC_NPM_REGISTRY);
    assert.ok(env.NPM_CONFIG_USERCONFIG);
  });

  it("inherit keeps npm_config_* and optional registry override", () => {
    const resolved = resolveNpmPolicy({
      flagPolicy: "inherit",
      flagRegistry: "https://override.example/",
      env: {},
      hostConfigPath: path.join(tmpdir(), "no-such.json"),
    });
    const { env, replaceEnv } = buildNpmChildEnv(
      resolved,
      { CI: "1" },
      {
        PATH: "/bin",
        npm_config_proxy: "http://proxy:8080",
        HOME: "/tmp",
      },
    );
    assert.equal(replaceEnv, false);
    assert.equal(env.npm_config_proxy, "http://proxy:8080");
    assert.equal(env.npm_config_registry, "https://override.example/");
    assert.equal(env.CI, "1");
  });
});
