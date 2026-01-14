// server.js - Vercel Serverless compatible
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// ========== MIDDLEWARE ==========
app.use(cors({
    origin: ['https://3kv215.dfi.fund', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== DATABASE CONNECTION ==========
let pool;
try {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    console.log('✅ Database pool created');
} catch (error) {
    console.error('❌ Database pool error:', error.message);
}

// ========== AUTHENTICATION MIDDLEWARE ==========
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access token required' 
        });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'development-secret', (err, user) => {
        if (err) {
            console.error('❌ Token verification error:', err.message);
            return res.status(403).json({ 
                success: false, 
                message: 'Invalid or expired token' 
            });
        }
        req.user = user;
        next();
    });
};

// ========== STATIC FILES ==========
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/static', express.static(path.join(__dirname, 'static')));

// Serve HTML files from templates directory
app.use(express.static(path.join(__dirname, 'templates')));

// ========== HTML PAGE ROUTES ==========
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates/login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates/dashboard.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates/index.html'));
});

// ========== API ROUTES ==========

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        let dbStatus = 'unknown';
        if (pool) {
            await pool.query('SELECT NOW()');
            dbStatus = 'connected';
        }
        
        res.json({
            success: true,
            service: 'KokKokKok API v2.1.5',
            status: 'online',
            timestamp: new Date().toISOString(),
            database: dbStatus,
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        res.json({
            success: true,
            service: 'KokKokKok API v2.1.5',
            status: 'online',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error.message
        });
    }
});

// Auth health endpoint (for frontend)
app.get('/api/auth/health', async (req, res) => {
    res.json({
        success: true,
        service: 'KokKokKok Auth API',
        status: 'online',
        timestamp: new Date().toISOString()
    });
});

// Token validation endpoints
app.get('/api/auth/validate-token', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user,
        message: 'Token is valid',
        timestamp: new Date().toISOString()
    });
});

// Debug token endpoint (alias for compatibility)
app.get('/api/auth/debug-token', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user,
        message: 'Token is valid',
        timestamp: new Date().toISOString()
    });
});

// Get user profile
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({
                success: false,
                message: 'Database connection not available'
            });
        }
        
        const userId = req.user.userId;
        const result = await pool.query(
            'SELECT id, user_id, email, name, created_at FROM users WHERE id = $1',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        res.json({
            success: true,
            user: result.rows[0]
        });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching profile'
        });
    }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }
        
        if (!pool) {
            return res.status(500).json({
                success: false,
                message: 'Database connection not available'
            });
        }
        
        // Find user by email or user_id
        const result = await pool.query(
            `SELECT id, user_id, email, name, password_hash
             FROM users WHERE email = $1 OR user_id = $1`,
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        // Create JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                user_id: user.user_id,
                email: user.email,
                name: user.name
            },
            process.env.JWT_SECRET || 'development-secret',
            { expiresIn: '7d' }
        );
        
        // Remove password from response
        const { password_hash, ...userData } = user;
        
        res.json({
            success: true,
            token,
            user: userData,
            message: 'Login successful',
            redirect: '/dashboard'
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
});

// Update profile endpoint - FIXED VERSION
app.put('/api/auth/update-profile', authenticateToken, async (req, res) => {
    console.log('📝 Update profile request received');
    
    try {
        const { name } = req.body;
        const userId = req.user.userId;
        
        console.log('Request data:', { name, userId, user: req.user });
        
        // Validate input
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid name is required'
            });
        }

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        if (!pool) {
            console.error('❌ Database pool not available');
            return res.status(500).json({
                success: false,
                message: 'Database connection not available'
            });
        }

        // Test database connection first
        try {
            await pool.query('SELECT 1');
            console.log('✅ Database connection OK');
        } catch (dbError) {
            console.error('❌ Database connection failed:', dbError);
            return res.status(500).json({
                success: false,
                message: 'Database connection failed',
                error: dbError.message
            });
        }

        // Update user in database - SIMPLE WORKING VERSION
        const trimmedName = name.trim();
        
        console.log(`🔄 Updating user ${userId} name to: "${trimmedName}"`);
        
        const query = 'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, user_id, email, name';
        const values = [trimmedName, userId];
        
        console.log('Executing query:', query);
        console.log('With values:', values);
        
        const result = await pool.query(query, values);
        
        console.log('Update result:', result.rows);
        
        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log('✅ Profile updated successfully');
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Update profile error:', error);
        console.error('Error stack:', error.stack);
        
        res.status(500).json({
            success: false,
            message: 'Server error updating profile',
            error: error.message,
            // Include stack trace only in development
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        });
    }
});

// ========== CATCH-ALL ROUTES ==========
// API 404 handler
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// SPA catch-all - serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates/index.html'));
});

// ========== EXPORT & START SERVER ==========
module.exports = app;

// Start server locally if not running on Vercel
if (require.main === module) {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📁 Static files: ${__dirname}`);
        console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
        console.log(`🔗 API endpoints:`);
        console.log(`   POST /api/auth/login`);
        console.log(`   GET  /api/auth/validate-token`);
        console.log(`   GET  /api/auth/profile`);
        console.log(`   PUT  /api/auth/update-profile`);
    });
}