export default function register(ctx: {
  program: {
    command(name: string): {
      description(text: string): { action(fn: () => void): unknown };
    };
  };
  logger: { info(message: string): void };
}): void {
  ctx.program
    .command("hello")
    .description("Example plugin greeting")
    .action(() => {
      ctx.logger.info("hello from example-hello");
      console.log("Hello from example-hello");
    });
}
