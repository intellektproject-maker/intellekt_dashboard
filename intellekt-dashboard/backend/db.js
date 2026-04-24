const { Pool } = require('pg');

const pool = new Pool({
	user: 'postgres',
	host: 'localhost',
	database: 'intellekt_db', // your DB name
	password: 'welcome123',
	port: 5432
});
module.exports = pool;
