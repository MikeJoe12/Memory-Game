const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store game state
const state = {
    activeUsers: new Map(), // socket.id -> username
    persistentUsers: new Set(), // usernames
    gameResults: [],
    settings: {
        difficulty: 'easy',
        cardSet: 'emoji',
        soundEnabled: true
    }
};

// Socket.IO connection handling
io.on('connection', (socket) => {
   // console.log('New client connected:', socket.id);

    // Send initial state to new client
    socket.emit('gameSettings', state.settings);
    socket.emit('gameResults', state.gameResults);
    socket.emit('activeUsers', Array.from(state.persistentUsers));

    // Handle login
    socket.on('login', (username) => {
     //   console.log('Login attempt:', username);
        state.activeUsers.set(socket.id, username);
        state.persistentUsers.add(username);
        io.emit('activeUsers', Array.from(state.persistentUsers));
    });

    // Handle game result
    socket.on('gameResult', (data) => {
        const result = {
            username: state.activeUsers.get(socket.id),
            difficulty: data.difficulty,
            moves: data.moves,
            time: data.time,
            timestamp: new Date().toISOString()
        };
        state.gameResults.push(result);
        io.emit('gameResults', state.gameResults);
    });

    // Handle game settings update
    socket.on('gameSettings', (settings) => {
        state.settings = settings;
        io.emit('gameSettings', settings);
    });

    // Handle new game request
    socket.on('newGame', (settings) => {
        state.settings = settings;
        io.emit('newGame', settings);
    });

    // Handle result deletion
    socket.on('deleteResult', (timestamp) => {
        const index = state.gameResults.findIndex(
            result => result.timestamp === timestamp
        );
        if (index !== -1) {
            state.gameResults.splice(index, 1);
            io.emit('gameResults', state.gameResults);
        }
    });

    // Handle reset all
    socket.on('resetAllResults', () => {
        state.gameResults = [];
        state.activeUsers.clear();
        state.persistentUsers.clear();
        io.emit('resetGame');
        io.emit('gameResults', state.gameResults);
        io.emit('activeUsers', Array.from(state.persistentUsers));
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const username = state.activeUsers.get(socket.id);
        state.activeUsers.delete(socket.id);

        // Check if user is still connected from another socket
        let stillConnected = false;
        state.activeUsers.forEach((name) => {
            if (name === username) stillConnected = true;
        });

        if (!stillConnected && username) {
            state.persistentUsers.delete(username);
            io.emit('activeUsers', Array.from(state.persistentUsers));
        }
     //   console.log('Client disconnected:', socket.id);
    });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});