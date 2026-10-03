ALTER TABLE profiles ADD COLUMN office_hours text NOT NULL DEFAULT '[]';
CREATE TABLE trainer_tasks (
 id text PRIMARY KEY NOT NULL,
 trainer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title text NOT NULL,
 description text NOT NULL DEFAULT '',
 due_at text NOT NULL,
 reminder_days integer NOT NULL DEFAULT 7 CHECK(reminder_days BETWEEN 0 AND 30),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done')),
 created_by text NOT NULL REFERENCES users(id),
 created_at integer NOT NULL,
 updated_at integer NOT NULL
);
CREATE INDEX idx_trainer_tasks_owner ON trainer_tasks(trainer_id,due_at);
