import net from 'net';

async function testPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => resolve({ port, err: err.code }));
    server.once('listening', () => {
      server.close(() => resolve({ port, success: true }));
    });
    server.listen(port, '0.0.0.0');
  });
}

async function main() {
  const ports = [3000, 3001, 3002, 5000, 5173, 5174, 8000, 8080, 8443, 9000, 10000];
  for (let p of ports) {
    const res = await testPort(p);
    if (res.success) console.log(`Port ${p} SUCCESS`);
    else console.log(`Port ${p} FAILED: ${res.err}`);
  }
}
main();
