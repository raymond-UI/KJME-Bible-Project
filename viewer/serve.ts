// Dev server: the app with hot reload, and the exported book data from public/.
import index from "./index.html";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  routes: {
    "/": index,
    "/data/*": async (req) => {
      const name = decodeURIComponent(new URL(req.url).pathname.slice("/data/".length));
      if (!/^[\w.-]+\.json$/.test(name)) return new Response("Not found", { status: 404 });
      const f = Bun.file(`${import.meta.dir}/public/data/${name}`);
      return (await f.exists()) ? new Response(f, { headers: { "Cache-Control": "no-cache" } }) : new Response("Not found", { status: 404 });
    },
  },
  development: { hmr: true, console: true },
});

console.log(`KJME viewer on ${server.url}`);
