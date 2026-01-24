// server.js - FINAL WORKING VERSION
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
    origin: ['https://3kv218.dfi.fund', 'http://localhost:3000'],
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
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use(express.static(path.join(__dirname, 'templates')));

// ========== HTML ROUTES ==========
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

// Health check
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

// Auth health
app.get('/api/auth/health', (req, res) => {
    res.json({
        success: true,
        service: 'KokKokKok Auth API',
        status: 'online',
        timestamp: new Date().toISOString()
    });
});

// Token validation - THIS ENDPOINT WAS MISSING
app.get('/api/auth/validate-token', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user,
        message: 'Token is valid',
        timestamp: new Date().toISOString()
    });
});

// Debug token (compatibility)
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

// Login
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

// Update profile - SIMPLIFIED WORKING VERSION
app.put('/api/auth/update-profile', authenticateToken, async (req, res) => {
    console.log('=== UPDATE PROFILE REQUEST ===');
    console.log('Headers:', req.headers);
    console.log('User from token:', req.user);
    console.log('Request body:', req.body);
    
    try {
        const { name } = req.body;
        const userId = req.user.userId;
        
        console.log('Processing:', { name, userId });
        
        // Validate
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            console.log('Validation failed: Invalid name');
            return res.status(400).json({
                success: false,
                message: 'Valid name is required'
            });
        }

        if (!userId) {
            console.log('Validation failed: No user ID');
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        if (!pool) {
            console.log('Database pool not available');
            return res.status(500).json({
                success: false,
                message: 'Database connection not available'
            });
        }

        const trimmedName = name.trim();
        console.log(`Updating user ${userId} name to: "${trimmedName}"`);
        
        // SIMPLE UPDATE - No error handling for now
        const result = await pool.query(
            'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, user_id, email, name',
            [trimmedName, userId]
        );
        
        console.log('Update result:', result.rows);
        
        if (result.rowCount === 0) {
            console.log('No user found with ID:', userId);
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log('✅ Update successful');
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ UPDATE ERROR:', error);
        console.error('Error stack:', error.stack);
        
        res.status(500).json({
            success: false,
            message: 'Server error updating profile',
            error: error.message,
            hint: 'Check if user ID exists in database'
        });
    }
});

// ========== ERROR HANDLING ==========
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates/index.html'));
});

// ========== CHANGE PASSWORD ENDPOINT ==========
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    console.log('🔐 Change password request received');
    
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.userId;
        const userEmail = req.user.email;
        
        console.log('Request data:', { 
            userId, 
            userEmail,
            hasCurrentPassword: !!currentPassword,
            hasNewPassword: !!newPassword 
        });
        
        // Validate input
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters'
            });
        }
        
        if (currentPassword === newPassword) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from current password'
            });
        }
        
        if (!pool) {
            return res.status(500).json({
                success: false,
                message: 'Database connection not available'
            });
        }
        
        // Get user from database
        const userResult = await pool.query(
            'SELECT id, password_hash FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const user = userResult.rows[0];
        
        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }
        
        // Hash new password
        const saltRounds = 10;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
        
        // Update password in database
        const updateResult = await pool.query(
            'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name',
            [newPasswordHash, userId]
        );
        
        console.log('✅ Password updated successfully for user:', userId);
        
        res.json({
            success: true,
            message: 'Password changed successfully',
            logoutRequired: false
        });
        
    } catch (error) {
        console.error('❌ Change password error:', error);
        
        if (error.message.includes('bcrypt')) {
            return res.status(500).json({
                success: false,
                message: 'Password encryption error'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error changing password',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========== EXPORT ==========
module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📁 Serving from: ${__dirname}`);
        console.log(`🔗 Test endpoints:`);
        console.log(`   http://localhost:${PORT}/api/health`);
        console.log(`   http://localhost:${PORT}/api/auth/validate-token`);
        console.log(`   http://localhost:${PORT}/api/auth/update-profile`);
    });
}