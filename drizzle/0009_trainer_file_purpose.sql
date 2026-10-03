ALTER TABLE trainer_work_files ADD COLUMN purpose text NOT NULL DEFAULT 'evidence' CHECK(purpose IN ('evidence','decision'));
