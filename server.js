const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configure WebSocket with proper settings for Render
const wss = new WebSocket.Server({ 
    server,
    clientTracking: true,
    // Add necessary headers for Render
    perMessageDeflate: {
        zlibDeflateOptions: {
            // See zlib defaults.
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        // Other options settable:
        clientNoContextTakeover: true, // Defaults to negotiated value.
        serverNoContextTakeover: true, // Defaults to negotiated value.
        serverMaxWindowBits: 10, // Defaults to negotiated value.
        // Below options specified as default values.
        concurrencyLimit: 10, // Limits zlib concurrency for perf.
        threshold: 1024 // Size (in bytes) below which messages
    }
});

// Enable CORS for websocket
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store active users and game results
const activeUsers = new Map();
const persistentUsers = new Set();
const gameResults = [];
let currentGameSettings = {
    difficulty: 'easy',
    cardSet: 'emoji',
    soundEnabled: true
};

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    //console.log('New client connected');

    // Ping-pong mechanism to keep connection alive
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    // Send initial state
    ws.send(JSON.stringify({
        type: 'gameSettings',
        settings: currentGameSettings
    }));

    ws.send(JSON.stringify({
        type: 'gameResults',
        results: gameResults
    }));

    ws.send(JSON.stringify({
        type: 'activeUsers',
        users: Array.from(persistentUsers)
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
          //  console.log('Received message:', data.type);
            
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
                    gameResults.length = 0;
                    activeUsers.clear();
                    persistentUsers.clear();
                    broadcast(JSON.stringify({ type: 'resetGame' }));
                    broadcastGameResults();
                    broadcastActiveUsers();
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        //console.log('Client disconnected');
        const username = activeUsers.get(ws);
        activeUsers.delete(ws);

        let stillConnected = false;
        activeUsers.forEach((name) => {
            if (name === username) {
                stillConnected = true;
            }
        });

        if (!stillConnected && username) {
            persistentUsers.delete(username);
            broadcastActiveUsers();
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Implement ping-pong to keep connections alive
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
           // console.log('Terminating stale connection');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
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
            try {
                client.send(data);
            } catch (error) {
                console.error('Error broadcasting:', error);
            }
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