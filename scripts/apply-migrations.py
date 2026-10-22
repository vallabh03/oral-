import sqlite3
import pathlib

root = pathlib.Path('.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
files = [p for p in root.glob('*.sqlite') if p.name != 'metadata.sqlite']
assert len(files) == 1, f"Expected 1 database file, found {files}"

db_path = files[0]
print(f"Connecting to database: {db_path}")

conn = sqlite3.connect(db_path)
conn.execute("PRAGMA foreign_keys = OFF")

# Run all migration files in sorted order
drizzle_files = sorted(pathlib.Path('drizzle').glob('*.sql'))
for sql_file in drizzle_files:
    print(f"Applying migration: {sql_file.name}")
    content = sql_file.read_text(encoding='utf-8')
    # Execute statements
    try:
        conn.executescript(content)
    except Exception as e:
        print(f"Warning/Error on {sql_file.name}: {e}")

conn.commit()

# Ensure local test user exists if needed
cursor = conn.cursor()
tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print(f"Total tables: {len(tables)}")
print("Tables:", sorted(tables))

# Seed app_settings if empty
res = cursor.execute("SELECT count(*) FROM app_settings").fetchone()[0]
print(f"app_settings count: {res}")
if res == 0:
    cursor.execute("""
        INSERT INTO app_settings (id, value, updated_at, updated_by) VALUES 
        ('programme', '{"supportEmail":"support@haoc-drivesafe.org","supportPhone":"+91 40 2345 6789"}', datetime('now'), 'system'),
        ('security', '{"maxIdleMinutes":30,"maxAbsoluteHours":8}', datetime('now'), 'system')
    """)
    conn.commit()
    print("Seeded default app_settings.")

# Seed super-admin user if needed
user_res = cursor.execute("SELECT count(*) FROM users WHERE id='local_seedy'").fetchone()[0]
if user_res == 0:
    cursor.execute("""
        INSERT INTO users (id, email, name, role) 
        VALUES ('local_seedy', 'seedy@sites.test', 'Local Admin', 'SUPER_ADMIN')
    """)
    conn.commit()
    print("Seeded local_seedy user.")

conn.close()
print("Migrations and seeding complete!")
