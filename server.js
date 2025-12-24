// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const loginRouter = require('./api/auth/login');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('static')); // Serve static files

// API Routes
app.use('/api/auth', loginRouter);

// Serve HTML files from templates folder
app.get('/templates/:page', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', req.params.page));
});

// Root redirect
app.get('/', (req, res) => {
    res.redirect('/templates/index.html');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});