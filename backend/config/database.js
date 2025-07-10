const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL Connection Pool with fallback handling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // maximum number of clients in the pool
  idleTimeoutMillis: 30000, // close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // return an error after 2 seconds if connection could not be established
});

let isDBConnected = false;

// Test database connection with graceful fallback
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Successfully connected to PostgreSQL database');
    client.release();
    isDBConnected = true;
    return true;
  } catch (error) {
    console.warn('⚠️ Database connection failed:', error.message);
    console.log('🔄 Server will continue without database functionality');
    isDBConnected = false;
    return false;
  }
};

// Execute query with error handling and database availability check
const query = async (text, params = []) => {
  if (!isDBConnected) {
    console.warn('Database not available, skipping query:', text.substring(0, 50) + '...');
    return { rows: [], rowCount: 0 };
  }

  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query:', { text: text.substring(0, 50) + '...', duration, rows: result.rowCount });
    }
    
    return result;
  } catch (error) {
    console.error('Database query error:', { text: text.substring(0, 50) + '...', error: error.message });
    // Don't throw error, return empty result instead
    return { rows: [], rowCount: 0 };
  }
};

// Get a client from the pool for transactions
const getClient = async () => {
  if (!isDBConnected) {
    throw new Error('Database not available');
  }
  return await pool.connect();
};

// Graceful shutdown
const shutdown = async () => {
  if (isDBConnected) {
    console.log('Closing database connections...');
    await pool.end();
    console.log('Database connections closed.');
  }
};

module.exports = {
  pool,
  query,
  getClient,
  testConnection,
  shutdown,
  isDBConnected: () => isDBConnected
};