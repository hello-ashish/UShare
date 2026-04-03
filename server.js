import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import os from 'os';

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Return the first non-internal IPv4 address
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

app.get('/api/ip', (req, res) => {
  res.json({ ip: getLocalIp() });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
    // Notify others in the room
    socket.to(roomId).emit('user-joined', socket.id);
  });

  socket.on('file-metadata', (data) => {
    socket.to(data.roomId).emit('file-metadata', data);
  });

  socket.on('file-chunk', (data) => {
    socket.to(data.roomId).emit('file-chunk', data);
  });

  socket.on('file-eof', (data) => {
    socket.to(data.roomId).emit('file-eof', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 3001;
const localIp = getLocalIp();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`Local IP: ${localIp}`);
});
