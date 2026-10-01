/**
 * FarmTrack Management System - Backend Server
 * Express.js REST API with SQLite database
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files from the project root
app.use(express.static(__dirname));

// ==========================================
// 1. DATABASE INITIALIZATION (SQLite)
// ==========================================

let db;

try {
    const Database = require('better-sqlite3');
    db = new Database(path.join(__dirname, 'farmtrack.db'));
    console.log('✓ Connected to SQLite database using better-sqlite3');
} catch (err) {
    try {
        const { DatabaseSync } = require('node:sqlite');
        const nativeDb = new DatabaseSync(path.join(__dirname, 'farmtrack.db'));
        db = {
            exec: (sql) => nativeDb.exec(sql),
            prepare: (sql) => {
                const stmt = nativeDb.prepare(sql);
                return {
                    all: (...params) => stmt.all(...params),
                    get: (...params) => stmt.get(...params),
                    run: (...params) => stmt.run(...params)
                };
            }
        };
        console.log('✓ Connected to SQLite database using Node.js built-in node:sqlite');
    } catch (err2) {
        console.error('⚠️ Could not initialize SQLite:', err.message);
    }
}

// Create Tables (No demo data inserted - ready for real farmers)
if (db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS farmers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            location TEXT NOT NULL,
            farm_size REAL NOT NULL,
            main_crop TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sales (
            id TEXT PRIMARY KEY,
            farmer_id TEXT,
            farmer_name TEXT NOT NULL,
            produce TEXT NOT NULL,
            quantity REAL NOT NULL,
            price_per_kg REAL NOT NULL,
            total_amount REAL NOT NULL,
            buyer TEXT NOT NULL,
            sale_date TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tracking (
            id TEXT PRIMARY KEY,
            farmer_name TEXT NOT NULL,
            produce TEXT NOT NULL,
            quantity REAL NOT NULL,
            current_location TEXT NOT NULL,
            destination TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
}


// ==========================================
// 2. API ROUTES: FARMERS
// ==========================================

// GET all farmers
app.get('/api/farmers', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, name, phone, location, farm_size AS size, main_crop AS crop, created_at 
            FROM farmers 
            ORDER BY created_at DESC, id ASC
        `).all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST register new farmer
app.post('/api/farmers', (req, res) => {
    const { id, name, phone, location, size, crop } = req.body;
    if (!id || !name || !phone || !location || !size || !crop) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        const checkExists = db.prepare('SELECT id FROM farmers WHERE LOWER(id) = LOWER(?)').get(id.trim());
        if (checkExists) {
            return res.status(409).json({ error: `National ID / Farmer ID "${id}" is already registered.` });
        }

        const stmt = db.prepare(`
            INSERT INTO farmers (id, name, phone, location, farm_size, main_crop)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id.trim(), name.trim(), phone.trim(), location.trim(), parseFloat(size), crop.trim());
        res.status(201).json({ message: 'Farmer registered successfully', id: id.trim() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE farmer by ID
app.delete('/api/farmers/:id', (req, res) => {
    const { id } = req.params;
    try {
        const result = db.prepare('DELETE FROM farmers WHERE id = ?').run(id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Farmer not found.' });
        }
        res.json({ message: `Farmer ${id} deleted successfully.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// 3. API ROUTES: SALES
// ==========================================

// GET all sales
app.get('/api/sales', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, sale_date AS date, farmer_name AS farmer, produce, quantity, price_per_kg AS price, total_amount AS total, buyer, created_at
            FROM sales
            ORDER BY sale_date DESC, id DESC
        `).all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST record new sale
app.post('/api/sales', (req, res) => {
    const { id, farmer, produce, quantity, price, buyer, date } = req.body;
    if (!id || !farmer || !produce || !quantity || !price || !buyer || !date) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const qty = parseFloat(quantity);
    const prc = parseFloat(price);
    if (qty <= 0 || prc <= 0) {
        return res.status(400).json({ error: 'Quantity and Price must be greater than zero.' });
    }

    try {
        const checkExists = db.prepare('SELECT id FROM sales WHERE LOWER(id) = LOWER(?)').get(id.trim());
        if (checkExists) {
            return res.status(409).json({ error: `Sale ID "${id}" is already recorded.` });
        }

        const total = qty * prc;
        const stmt = db.prepare(`
            INSERT INTO sales (id, farmer_name, produce, quantity, price_per_kg, total_amount, buyer, sale_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id.trim(), farmer.trim(), produce.trim(), qty, prc, total, buyer.trim(), date);
        res.status(201).json({ message: 'Sale recorded successfully', id: id.trim(), total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE sale by ID
app.delete('/api/sales/:id', (req, res) => {
    const { id } = req.params;
    try {
        const result = db.prepare('DELETE FROM sales WHERE id = ?').run(id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Sale record not found.' });
        }
        res.json({ message: `Sale ${id} deleted successfully.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// 4. API ROUTES: TRACKING
// ==========================================

// GET all tracking records
app.get('/api/tracking', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, farmer_name AS farmer, produce, quantity, current_location AS location, destination, status, created_at
            FROM tracking
            ORDER BY created_at DESC, id ASC
        `).all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST add tracking record
app.post('/api/tracking', (req, res) => {
    const { id, farmer, produce, quantity, location, destination, status } = req.body;
    if (!id || !farmer || !produce || !quantity || !location || !destination || !status) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const qty = parseFloat(quantity);
    if (qty <= 0) {
        return res.status(400).json({ error: 'Quantity must be greater than zero.' });
    }

    try {
        const checkExists = db.prepare('SELECT id FROM tracking WHERE LOWER(id) = LOWER(?)').get(id.trim());
        if (checkExists) {
            return res.status(409).json({ error: `Tracking ID "${id}" is already registered.` });
        }

        const stmt = db.prepare(`
            INSERT INTO tracking (id, farmer_name, produce, quantity, current_location, destination, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id.trim(), farmer.trim(), produce.trim(), qty, location.trim(), destination.trim(), status.trim());
        res.status(201).json({ message: 'Tracking record added successfully', id: id.trim() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH update tracking status
app.patch('/api/tracking/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
        return res.status(400).json({ error: 'Status is required.' });
    }

    try {
        const stmt = db.prepare('UPDATE tracking SET status = ? WHERE id = ?');
        const result = stmt.run(status, id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Tracking record not found.' });
        }
        res.json({ message: `Tracking record ${id} status updated to ${status}.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE tracking record
app.delete('/api/tracking/:id', (req, res) => {
    const { id } = req.params;
    try {
        const result = db.prepare('DELETE FROM tracking WHERE id = ?').run(id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Tracking record not found.' });
        }
        res.json({ message: `Tracking record ${id} deleted successfully.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// 5. API ROUTES: REAL DASHBOARD STATS
// ==========================================

app.get('/api/dashboard/stats', (req, res) => {
    try {
        const farmersRow = db.prepare(`
            SELECT COUNT(*) AS totalFarmers, 
                   COUNT(DISTINCT id) AS activeFarms,
                   COALESCE(SUM(farm_size), 0) AS totalArea 
            FROM farmers
        `).get();

        const salesRow = db.prepare(`
            SELECT COUNT(*) AS completedSales, 
                   COALESCE(SUM(total_amount), 0) AS totalSales,
                   COALESCE(SUM(quantity), 0) AS produceSold 
            FROM sales
        `).get();

        const trackingActive = db.prepare(`
            SELECT COUNT(*) AS activeDeliveries 
            FROM tracking 
            WHERE status != 'Delivered'
        `).get();

        const trackingInTransit = db.prepare(`
            SELECT COALESCE(SUM(quantity), 0) AS inTransitKg 
            FROM tracking 
            WHERE status = 'In Transit'
        `).get();

        const trackingDelivered = db.prepare(`
            SELECT COUNT(*) AS deliveredCount 
            FROM tracking 
            WHERE status = 'Delivered'
        `).get();

        res.json({
            farmers: {
                totalFarmers: farmersRow.totalFarmers || 0,
                activeFarms: farmersRow.activeFarms || 0,
                totalArea: Number((farmersRow.totalArea || 0).toFixed(1))
            },
            sales: {
                totalSales: salesRow.totalSales || 0,
                completedSales: salesRow.completedSales || 0,
                produceSold: salesRow.produceSold || 0
            },
            tracking: {
                activeDeliveries: trackingActive.activeDeliveries || 0,
                inTransitKg: trackingInTransit.inTransitKg || 0,
                deliveredCount: trackingDelivered.deliveredCount || 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Default Route: Redirect to farmers.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'farmers.html'));
});


// ==========================================
// 6. SERVER START
// ==========================================

app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🌱 FarmTrack Server running at http://localhost:${PORT}`);
    console.log(`📡 Ready for real farmer registrations`);
    console.log(`===============================================`);
});
