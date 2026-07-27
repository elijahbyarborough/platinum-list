#!/usr/bin/env node

/**
 * Migration: drop the updated_at trigger on companies.
 *
 * The trigger bumped updated_at on ANY update, so the twice-daily price cron
 * made every company look freshly "Updated" on the dashboard and PDF.
 * updated_at now means "last analyst submission" and is set explicitly by the
 * submission endpoint; price refreshes only touch price_last_updated.
 */

import { sql } from '@vercel/postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function migrate() {
  try {
    await sql`DROP TRIGGER IF EXISTS update_companies_updated_at ON companies`;
    console.log('✅ Dropped update_companies_updated_at trigger');
    console.log('\n✅ Migration complete! updated_at now only changes on submissions.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
