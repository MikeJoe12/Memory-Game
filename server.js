const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store active users and game results
const activeUsers = new Map(); // Stores WebSocket -> username mapping
const persistentUsers = new Set(); // Stores just usernames - persists through refreshes
const gameResults = [];
let currentGameSettings = {
    difficulty: 'easy',
    cardSet: 'emoji',
    soundEnabled: true
};

// WebSocket connection handling
wss.on('connection', (ws) => {
    // Send current game settings and results to new client
    ws.send(JSON.stringify({
        type: 'gameSettings',
        settings: currentGameSettings
    }));

    ws.send(JSON.stringify({
        type: 'gameResults',
        results: gameResults
    }));

    // Send current active users
    ws.send(JSON.stringify({
        type: 'activeUsers',
        users: Array.from(persistentUsers)
    }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch(data.type) {
            case 'login':
                activeUsers.set(ws, data.username);
                persistentUsers.add(data.username);
                broadcastActiveUsers();
                break;
                
            case 'gameResult':
                const result = {
                    username: activeUsers.get(ws),
                    difficulty: data.difficulty,
                    moves: data.moves,
                    time: data.time,
                    timestamp: new Date().toISOString()
                };
                gameResults.push(result);
                broadcastGameResults();
                break;

            case 'gameSettings':
                currentGameSettings = data.settings;
                broadcast(JSON.stringify({
                    type: 'gameSettings',
                    settings: currentGameSettings
                }));
                break;

            case 'newGame':
                currentGameSettings = data.settings;
                broadcast(JSON.stringify({
                    type: 'newGame',
                    settings: currentGameSettings
                }));
                break;

            case 'deleteResult':
                const indexToDelete = gameResults.findIndex(
                    result => result.timestamp === data.timestamp
                );
                if (indexToDelete !== -1) {
                    gameResults.splice(indexToDelete, 1);
                    broadcastGameResults();
                } else {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Result not found'
                    }));
                }
                break;

            case 'resetAllResults':
                gameResults.length = 0; // Clear all results
                activeUsers.clear(); // Clear all active users
                persistentUsers.clear(); // Clear persisted users
                broadcast(JSON.stringify({ type: 'resetGame' })); // Notify all clients to reset
                broadcastGameResults();
                broadcastActiveUsers();
                break;
        }
    });

    ws.on('close', () => {
        const username = activeUsers.get(ws);
        activeUsers.delete(ws);

        // Check if this username is still connected from another tab/window
        let stillConnected = false;
        activeUsers.forEach((name) => {
            if (name === username) {
                stillConnected = true;
            }
        });

        // Only remove from persistentUsers if not connected anywhere else
        if (!stillConnected && username) {
            persistentUsers.delete(username);
            broadcastActiveUsers();
        }
    });
});

function broadcastActiveUsers() {
    broadcast(JSON.stringify({
        type: 'activeUsers',
        users: Array.from(persistentUsers)
    }));
}

function broadcastGameResults() {
    broadcast(JSON.stringify({
        type: 'gameResults',
        results: gameResults
    }));
}

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

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