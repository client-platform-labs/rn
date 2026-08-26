import type { DevSessionPluginRegister } from "@client-platform/rn-core";

/**
 * Third-party-shaped `dev-session` plugin (map-a/#17 hot-plug proof).
 * Registers a custom Dev Menu contribution consumed by Dev Support panel.
 */
const register: DevSessionPluginRegister = (ctx) => {
  ctx.contributeMenuItem({
    id: "example-dev-session.ping",
    label: "Example: Dev Session ping",
    action: "custom",
    payload: {
      message: "hello from example-dev-session plugin",
    },
  });
  ctx.contributeMenuItem({
    id: "example-dev-session.show-main",
    label: "Example: show main effective",
    moduleId: "main",
    action: "show-effective",
  });
};

export default register;
