const express = require("express");
const { Pool } = require('pg');
const app = express();

// Middleware
app.use(express.json());

const PORT = 3000;

// PostgreSQL connection configuration
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Orgnization',
  port: 5432,
  password: 'admin'
});

// Create a charity data insert endpoint to handle POST requests with the provided request body
app.post('/api/organsation', async (req, res) => {
  const { type, sector } = req.body;

  if (!type || !sector || !Array.isArray(sector) || sector.length === 0) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const client = await pool.connect();

  try {
    // Begin a transaction
    await client.query('BEGIN');

    // Insert organisation into Organisations table
    const organisationQuery = 'INSERT INTO organisations (type) VALUES ($1) RETURNING id';
    const organisationResult = await client.query(organisationQuery, [type]);
    const organisationId = organisationResult.rows[0].id;

    // Insert sectors into Sectors table if they don't already exist
    const sectorIds = [];
    for (const s of sector) {
      if (s.trim() !== ''){
        const sectorQuery = 'INSERT INTO sectors (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id';
        const sectorResult = await client.query(sectorQuery, [s]);
        if (sectorResult.rows.length > 0) {
          sectorIds.push(sectorResult.rows[0].id);
        }
      }
    }

    // Insert records into OrganisationSectors table
    for (const sectorId of sectorIds) {
      const orgSectorQuery = 'INSERT INTO organisationsectors (organisation_id, sector_id) VALUES ($1, $2)';
      await client.query(orgSectorQuery, [organisationId, sectorId]);
    }

    // Commit the transaction
    await client.query('COMMIT');

    res.json({ message: 'Organisation and sectors inserted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error inserting organisation and sectors:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});


//GET all Orgnization by Id
app.get('/api/organisation', async (req, res) => {
  try {
    const query = `
      SELECT o.id, o.type, array_agg(s.name) AS sector
      FROM organisations o
      JOIN organisationsectors os ON o.id = os.organisation_id
      JOIN sectors s ON os.sector_id = s.id
      GROUP BY o.id, o.type
    `;
    const queryResult = await pool.query(query);
    res.json(queryResult.rows);
  } catch (error) {
    console.error('Error fetching organization data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// Route to fetch organization data with sectors based on ID
app.get('/api/organisation/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT o.id, o.type, array_agg(s.name) AS sector
      FROM organisations o
      JOIN organisationsectors os ON o.id = os.organisation_id
      JOIN sectors s ON os.sector_id = s.id
      WHERE o.id = $1
      GROUP BY o.id, o.type
    `;
    const queryResult = await pool.query(query, [id]);
    if (queryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json(queryResult.rows[0]);
  } catch (error) {
    console.error('Error fetching organization data by ID:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


pool.connect((err, client, release) => {
    if (err) {
      console.error('Error connecting to PostgreSQL:', err.stack);
      return;
    }
    console.log('Connected to PostgreSQL database');
    // Release the client back to the pool
    release();
});
  
// Optionally, you can listen for errors on the pool
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
