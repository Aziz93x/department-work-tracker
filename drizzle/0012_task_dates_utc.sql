-- Author: Abdulaziz Almalki
-- Preserve each valid deadline's instant while making chronological cursors comparable.
UPDATE trainer_tasks
SET due_at = strftime('%Y-%m-%dT%H:%M:%fZ', due_at)
WHERE julianday(due_at) IS NOT NULL
  AND due_at <> strftime('%Y-%m-%dT%H:%M:%fZ', due_at);
