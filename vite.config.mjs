import {defineConfig} from 'vite';
import {attachShooter} from './server/transport.mjs';

export default defineConfig({
  plugins: [{name:'niva-duell-server', configureServer(server) {
    const runtime=attachShooter(server.httpServer);
    server.middlewares.use(runtime.middleware);
    server.httpServer.once('close',runtime.close);
  }}],
  server:{port:5205,strictPort:true},
  worker:{format:'es'},
  build:{chunkSizeWarningLimit:750}
});
