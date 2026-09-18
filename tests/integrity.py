import sqlite3,pathlib,unittest
class Integrity(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON')
  for f in sorted(pathlib.Path('drizzle').glob('*.sql')):self.db.executescript(f.read_text(encoding='utf8'))
  self.db.execute("INSERT INTO patients(id,tenant,name,phone,created_at) VALUES ('p1','t','Demo A','0000000000','now'),('p2','t','Demo B','0000000001','now')")
  self.db.execute("INSERT INTO samples(id,patient_id,type,status,collected_at,collected_by,location) VALUES ('s1','p1','Oral','Collected','now','u','loc')")
 def test_wrong_patient_report(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO reports(id,sample_id,patient_id,object_key,filename,status,uploaded_by,at) VALUES ('r1','s1','p2','k','f','Uploaded','u','now')")
 def test_audit_is_append_only(self):
  self.db.execute("INSERT INTO audit VALUES ('a','t','p1','u','view','now','signed')")
  for q in ["DELETE FROM audit","UPDATE audit SET action='changed'"]:
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute(q)
 def test_duplicate_case_insensitive(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO patients(id,tenant,name,phone,created_at) VALUES ('p3','t','demo a','0000000000','now')")
 def test_consent_history(self):
  self.db.execute("INSERT INTO consents VALUES ('c','p1','testing','granted','v1','now','u','written')")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE consents SET status='withdrawn'")
 def test_role_migration_preserves_restricted_accounts(self):
  for role in ['ADMIN','DOCTOR','PATIENT','LAB','COUNSELLOR','REGISTRATION']:
   self.db.execute("INSERT INTO users(id,email,name,role) VALUES (?,?,?,?)",(role,role+'@test.invalid','Synthetic user',role))
  self.db.executescript(pathlib.Path('drizzle/0005_staff_access_levels.sql').read_text())
  mapped=dict(self.db.execute('SELECT id,role FROM users'))
  self.assertEqual(mapped['ADMIN'],'SUPER_ADMIN');self.assertEqual(mapped['DOCTOR'],'DOCTOR_ADMIN')
  for role in ['PATIENT','LAB','COUNSELLOR','REGISTRATION']:self.assertEqual(mapped[role],role)
if __name__=='__main__':unittest.main()
