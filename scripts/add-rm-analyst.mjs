#!/usr/bin/env node

/**
 * Migration: allow 'RM' in the analyst_initials CHECK constraints.
 *
 * JM and BB remain valid (historical rows keep them; the UI just no longer
 * offers them for new submissions).
 */

import { sql } from '@vercel/postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const ANALYSTS = `('EY', 'TR', 'JM', 'BB', 'NM', 'RM')`;

async function migrate() {
  try {
    for (const table of ['companies', 'submission_logs', 'change_logs']) {
      await sql.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_analyst_initials_check`);
      await sql.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_analyst_initials_check CHECK (analyst_initials IN ${ANALYSTS})`);
      console.log(`✅ ${table}: analyst_initials now allows RM`);
    }
    console.log('\n✅ Migration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
