import {sqliteTable,text,integer,index,uniqueIndex,primaryKey,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const users=sqliteTable('users',{
 id:text('id').primaryKey(),username:text('username').notNull().unique(),displayName:text('display_name').notNull(),
 passwordHash:text('password_hash').notNull(),role:text('role',{enum:['head','trainer','deputy','dean']}).notNull(),
 active:integer('active').notNull().default(1),isTest:integer('is_test').notNull().default(0),mustChangePassword:integer('must_change_password').notNull().default(0),
 avatarKey:text('avatar_key'),avatarUpdatedAt:integer('avatar_updated_at'),
 createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[check('valid_role',sql`${t.role} IN ('head','trainer','deputy','dean')`),check('valid_active',sql`${t.active} IN (0,1)`)]);
export const profiles=sqliteTable('profiles',{userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),office:text('office').notNull().default(''),officeHours:text('office_hours').notNull().default('[]'),specialty:text('specialty').notNull().default(''),staffNumber:text('staff_number').unique()});
export const sessions=sqliteTable('sessions',{tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),csrf:text('csrf').notNull(),expiresAt:integer('expires_at').notNull()},t=>[index('idx_sessions_user').on(t.userId),index('idx_sessions_expiry').on(t.expiresAt)]);
export const preferences=sqliteTable('dashboard_preferences',{userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),layout:text('layout').notNull(),updatedAt:integer('updated_at').notNull()});
export const attempts=sqliteTable('login_attempts',{key:text('key').primaryKey(),count:integer('count').notNull(),resetAt:integer('reset_at').notNull()});
export const audit=sqliteTable('audit_log',{id:text('id').primaryKey(),actorId:text('actor_id').references(()=>users.id),action:text('action').notNull(),targetId:text('target_id'),createdAt:integer('created_at').notNull()},t=>[index('idx_audit_created').on(t.createdAt)]);
export const courses=sqliteTable('courses',{id:text('id').primaryKey(),code:text('code').notNull().unique(),title:text('title').notNull()});
export const sections=sqliteTable('sections',{id:text('id').primaryKey(),courseId:text('course_id').notNull().references(()=>courses.id),trainerId:text('trainer_id').notNull().references(()=>users.id),term:text('term').notNull()},t=>[index('idx_sections_trainer').on(t.trainerId)]);
export const trainees=sqliteTable('trainees',{id:text('id').primaryKey(),trainingNumber:text('training_number').notNull().unique(),status:text('status').notNull()});
export const enrollments=sqliteTable('enrollments',{sectionId:text('section_id').notNull().references(()=>sections.id),traineeId:text('trainee_id').notNull().references(()=>trainees.id)},t=>[primaryKey({columns:[t.sectionId,t.traineeId]})]);
export const evidence=sqliteTable('evidence',{
 id:text('id').primaryKey(),trainerId:text('trainer_id').notNull().references(()=>users.id),title:text('title').notNull(),reviewStatus:text('review_status',{enum:['pending','passed','failed']}).notNull().default('pending'),createdBy:text('created_by').notNull().references(()=>users.id),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[index('idx_evidence_trainer').on(t.trainerId),check('valid_review_status',sql`${t.reviewStatus} IN ('pending','passed','failed')`)]);
export const evidenceVersions=sqliteTable('evidence_versions',{
 id:text('id').primaryKey(),evidenceId:text('evidence_id').notNull().references(()=>evidence.id,{onDelete:'cascade'}),versionNumber:integer('version_number').notNull(),objectKey:text('object_key').notNull().unique(),contentType:text('content_type').notNull(),originalFilename:text('original_filename').notNull(),byteSize:integer('byte_size').notNull(),uploadedBy:text('uploaded_by').notNull().references(()=>users.id),createdAt:integer('created_at').notNull()
},t=>[uniqueIndex('idx_evidence_versions_number').on(t.evidenceId,t.versionNumber)]);
export const evidenceReviews=sqliteTable('evidence_reviews',{
 id:text('id').primaryKey(),evidenceId:text('evidence_id').notNull().references(()=>evidence.id,{onDelete:'cascade'}),versionId:text('version_id').notNull().references(()=>evidenceVersions.id),status:text('status',{enum:['passed','failed']}).notNull(),note:text('note').notNull().default(''),reviewedBy:text('reviewed_by').notNull().references(()=>users.id),createdAt:integer('created_at').notNull()
},t=>[index('idx_evidence_reviews_evidence').on(t.evidenceId)]);
export const rayatReports=sqliteTable('rayat_reports',{
 id:text('id').primaryKey(),kind:text('kind',{enum:['SF01','SS01','SL03','SO08','SO01','SF06']}).notNull(),term:text('term'),normalizedTerm:text('normalized_term'),
 originalFilename:text('original_filename').notNull(),objectKey:text('object_key').notNull().unique(),byteSize:integer('byte_size').notNull(),
 summary:text('summary').notNull(),uploadedBy:text('uploaded_by').notNull().references(()=>users.id),createdAt:integer('created_at').notNull(),active:integer('active').notNull().default(1)
},t=>[index('idx_rayat_kind_term').on(t.kind,t.normalizedTerm,t.createdAt),check('valid_rayat_active',sql`${t.active} IN (0,1)`)]);
export const departmentActions=sqliteTable('department_actions',{
 id:text('id').primaryKey(),kind:text('kind',{enum:['initiative','improvement']}).notNull(),category:text('category',{enum:['withdrawn','dismissed','deprived']}),
 title:text('title').notNull(),description:text('description').notNull().default(''),expectedResult:text('expected_result').notNull().default(''),
 status:text('status',{enum:['planned','in_progress','completed']}).notNull().default('planned'),targetDate:text('target_date'),
 createdBy:text('created_by').notNull().references(()=>users.id),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[index('idx_department_actions_kind').on(t.kind,t.createdAt),check('valid_department_action_kind',sql`${t.kind} IN ('initiative','improvement')`),check('valid_department_action_status',sql`${t.status} IN ('planned','in_progress','completed')`)]);
export const departmentActionEvidence=sqliteTable('department_action_evidence',{
 id:text('id').primaryKey(),actionId:text('action_id').notNull().references(()=>departmentActions.id,{onDelete:'cascade'}),
 objectKey:text('object_key').notNull().unique(),originalFilename:text('original_filename').notNull(),contentType:text('content_type').notNull(),byteSize:integer('byte_size').notNull(),
 uploadedBy:text('uploaded_by').notNull().references(()=>users.id),createdAt:integer('created_at').notNull()
},t=>[index('idx_department_action_evidence_action').on(t.actionId,t.createdAt)]);
export const trainerWorkRecords=sqliteTable('trainer_work_records',{
 id:text('id').primaryKey(),trainerId:text('trainer_id').notNull().references(()=>users.id,{onDelete:'cascade'}),courseKey:text('course_key').notNull().default('general'),category:text('category').notNull(),itemKey:text('item_key').notNull(),status:text('status').notNull().default('not_done'),payload:text('payload').notNull().default('{}'),updatedAt:integer('updated_at').notNull()
},t=>[uniqueIndex('idx_trainer_work_unique').on(t.trainerId,t.courseKey,t.category,t.itemKey),index('idx_trainer_work_trainer').on(t.trainerId,t.updatedAt),check('valid_trainer_work_status',sql`${t.status} IN ('done','not_done','not_applicable')`)]);
export const trainerWorkFiles=sqliteTable('trainer_work_files',{
 id:text('id').primaryKey(),purpose:text('purpose',{enum:['evidence','decision']}).notNull().default('evidence'),recordId:text('record_id').notNull().references(()=>trainerWorkRecords.id,{onDelete:'cascade'}),objectKey:text('object_key').notNull().unique(),originalFilename:text('original_filename').notNull(),contentType:text('content_type').notNull(),byteSize:integer('byte_size').notNull(),uploadedBy:text('uploaded_by').notNull().references(()=>users.id),createdAt:integer('created_at').notNull()
},t=>[index('idx_trainer_work_files_record').on(t.recordId,t.createdAt)]);


export const trainerTasks=sqliteTable('trainer_tasks',{id:text('id').primaryKey(),trainerId:text('trainer_id').notNull().references(()=>users.id,{onDelete:'cascade'}),title:text('title').notNull(),description:text('description').notNull().default(''),dueAt:text('due_at').notNull(),reminderDays:integer('reminder_days').notNull().default(7),status:text('status').notNull().default('pending'),createdBy:text('created_by').notNull().references(()=>users.id),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()},t=>[index('idx_trainer_tasks_owner').on(t.trainerId,t.dueAt)]);
