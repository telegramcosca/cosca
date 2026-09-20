const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Casca app ka live data (Socket.io) setup
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log('Casca par naya user connect hua: ' + socket.id);

    // Jab koi user message bhejega
    socket.on('send_message', (data) => {
        // Sabhi users ko live message forward karna
        io.emit('receive_message', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnect ho gaya');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Casca server port ${PORT} par chal raha hai`);
});
