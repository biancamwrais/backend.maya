const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

// Se existir a variável DATABASE_URL (na Vercel), ele conecta no Aiven
if (process.env.DATABASE_URL) {
  pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
  });
} 
// Se não existir (no seu PC), ele continua conectando localmente!
else {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'maya_rpg',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
  });
}

module.exports = pool;