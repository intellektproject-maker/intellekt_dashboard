const ADMIN_IDS = new Set(['IG001', 'IG002']);

function registerTestBatchEditRequestRoutes(app, pool) {
  let schemaPromise;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(
        "CREATE TABLE IF NOT EXISTS test_batch_record_edit_requests (" +
        "id BIGSERIAL PRIMARY KEY, record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('marks','attendance','schedule')), " +
        "roll_no TEXT NOT NULL, student_name TEXT, test_code TEXT, subject_name TEXT, attendance_date DATE, " +
        "original_value TEXT NOT NULL, requested_value TEXT NOT NULL, requested_by TEXT NOT NULL, requested_by_name TEXT, " +
        "status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Declined','Applied')), " +
        "reviewed_by TEXT, review_note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
        "reviewed_at TIMESTAMPTZ, applied_at TIMESTAMPTZ)"
      ).then(() => pool.query(
        "ALTER TABLE test_batch_record_edit_requests DROP CONSTRAINT IF EXISTS test_batch_record_edit_requests_record_type_check"
      )).then(() => pool.query(
        "ALTER TABLE test_batch_record_edit_requests ADD CONSTRAINT test_batch_record_edit_requests_record_type_check CHECK (record_type IN ('marks','attendance','schedule'))"
      )).then(() => pool.query(
        "CREATE INDEX IF NOT EXISTS idx_test_batch_edit_requests_status ON test_batch_record_edit_requests(status, created_at DESC)"
      )).catch((err) => { schemaPromise = null; throw err; });
    }
    return schemaPromise;
  }

  const cleanId = (v) => String(v || '').trim().toUpperCase();
  const isAdmin = (v) => ADMIN_IDS.has(cleanId(v));
  const validFaculty = async (id) => {
    const result = await pool.query(
      'SELECT name FROM faculty WHERE UPPER(TRIM(faculty_id)) = $1 LIMIT 1', [cleanId(id)]
    );
    return result.rows[0] || null;
  };

  app.post('/test-batch/record-edit-requests', async (req, res) => {
    const facultyId = cleanId(req.body?.facultyId);
    const type = String(req.body?.recordType || '').trim().toLowerCase();
    const roll = String(req.body?.roll_no || '').trim().toUpperCase();
    const testCode = String(req.body?.test_code || '').trim().toUpperCase() || null;
    const subjectName = String(req.body?.subject_name || '').trim() || null;
    const date = String(req.body?.attendance_date || '').trim() || null;
    const requested = String(req.body?.requested_value ?? '').trim();

    if (!facultyId || isAdmin(facultyId)) return res.status(403).json({ error: 'A valid faculty account is required.' });
    if (!['marks', 'attendance'].includes(type) || !roll || !requested) {
      return res.status(400).json({ error: 'recordType, roll_no and requested_value are required.' });
    }

    try {
      await ensureSchema();
      const faculty = await validFaculty(facultyId);
      if (!faculty) return res.status(403).json({ error: 'Faculty account was not found.' });

      let studentName = '';
      let original = '';
      let totalMarks = null;
      if (type === 'marks') {
        if (!testCode) return res.status(400).json({ error: 'test_code is required for marks edits.' });
        const result = await pool.query(
          "SELECT s.name, m.marks_obtained, m.total_marks FROM test_batch_students s " +
          "JOIN test_batch_marks m ON UPPER(TRIM(m.roll_no)) = UPPER(TRIM(s.roll_no)) " +
          "WHERE UPPER(TRIM(s.roll_no)) = $1 AND UPPER(TRIM(m.test_code)) = $2 " +
          "AND ($3::text IS NULL OR LOWER(TRIM(m.subject_name)) = LOWER(TRIM($3))) LIMIT 1",
          [roll, testCode, subjectName]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Test Batch marks record not found.' });
        studentName = result.rows[0].name;
        original = String(result.rows[0].marks_obtained);
        totalMarks = Number(result.rows[0].total_marks);
        if (requested.toUpperCase() !== 'A') {
          const n = Number(requested);
          if (!Number.isFinite(n) || n < 0 || n > totalMarks) {
            return res.status(400).json({ error: 'Marks must be between 0 and total marks, or A for absent.' });
          }
        }
      } else {
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !['Present', 'Absent'].includes(requested)) {
          return res.status(400).json({ error: 'A valid attendance_date and Present/Absent value are required.' });
        }
        const result = await pool.query(
          "SELECT s.name, a.status FROM test_batch_students s JOIN test_batch_attendance a " +
          "ON UPPER(TRIM(a.roll_no)) = UPPER(TRIM(s.roll_no)) " +
          "WHERE UPPER(TRIM(s.roll_no)) = $1 AND a.attendance_date = $2 LIMIT 1",
          [roll, date]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Test Batch attendance record not found.' });
        studentName = result.rows[0].name;
        original = String(result.rows[0].status);
      }
      if (type === 'attendance' && original.toUpperCase() === requested.toUpperCase()) {
        return res.status(400).json({ error: 'The requested value is the same as the current value.' });
      }
      const pending = await pool.query(
        "SELECT id FROM test_batch_record_edit_requests WHERE record_type=$1 AND UPPER(TRIM(roll_no))=$2 " +
        "AND COALESCE(UPPER(TRIM(test_code)),'')=COALESCE($3,'') " +
        "AND COALESCE(LOWER(TRIM(subject_name)),'')=COALESCE(LOWER(TRIM($4)),'') " +
        "AND COALESCE(attendance_date, DATE '1900-01-01')=COALESCE($5::date, DATE '1900-01-01') " +
        "AND status IN ('Pending','Approved') LIMIT 1",
        [type, roll, testCode, subjectName, date]
      );
      if (pending.rows.length) return res.status(409).json({ error: 'An edit request for this record is already pending or approved.' });

      const inserted = await pool.query(
        "INSERT INTO test_batch_record_edit_requests " +
        "(record_type,roll_no,student_name,test_code,subject_name,attendance_date,original_value,requested_value,requested_by,requested_by_name) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
        [type, roll, studentName, testCode, subjectName, date, original, requested, facultyId, faculty.name]
      );
      const detail = type === 'marks' ? 'test ' + testCode : 'attendance on ' + date;
      const message = faculty.name + ' requested to edit Test Batch ' + detail + ' for ' + studentName + ' (' + roll + ').';
      await pool.query(
        "INSERT INTO faculty_notifications (faculty_id,module_name,message) VALUES ('IG001','record-edit-request',$1),('IG002','record-edit-request',$1)",
        [message]
      );
      return res.status(201).json({ message: 'Edit request sent to the admins.', request: inserted.rows[0] });
    } catch (error) {
      console.error('POST Test Batch edit request error:', error);
      return res.status(500).json({ error: 'Could not submit Test Batch edit request.' });
    }
  });

  app.post('/test-batch/record-edit-requests/schedule', async (req, res) => {
    const facultyId = cleanId(req.body?.facultyId);
    const testId = Number(req.body?.test_id);
    if (!facultyId || isAdmin(facultyId)) return res.status(403).json({ error: 'A valid faculty account is required.' });
    if (!Number.isInteger(testId) || testId <= 0) return res.status(400).json({ error: 'A valid Test Batch test is required.' });
    try {
      await ensureSchema();
      const faculty = await validFaculty(facultyId);
      if (!faculty) return res.status(403).json({ error: 'Faculty account was not found.' });
      const testResult = await pool.query(
        "SELECT id,test_code,test_series_id,subject_name,duration_minutes,total_marks,portion,chapter,application_open_date,application_close_date,writing_close_date,status FROM test_batch_tests WHERE id=$1 LIMIT 1",
        [testId]
      );
      if (!testResult.rows.length) return res.status(404).json({ error: 'Test Batch test not found.' });
      const test = testResult.rows[0];
      const pending = await pool.query(
        "SELECT id,status FROM test_batch_record_edit_requests WHERE record_type='schedule' AND roll_no=$1 AND status IN ('Pending','Approved') LIMIT 1",
        ['TEST:' + testId]
      );
      if (pending.rows.length) return res.status(409).json({ error: 'A schedule edit request for this test is already pending or approved.' });
      const inserted = await pool.query(
        "INSERT INTO test_batch_record_edit_requests (record_type,roll_no,student_name,test_code,subject_name,original_value,requested_value,requested_by,requested_by_name) VALUES ('schedule',$1,'Test schedule',$2,$3,$4,'EDIT_SCHEDULE',$5,$6) RETURNING *",
        ['TEST:' + testId, test.test_code, test.subject_name, JSON.stringify(test), facultyId, faculty.name]
      );
      const notice = faculty.name + ' requested permission to edit the schedule for Test Batch test ' + test.test_code + '.';
      await pool.query(
        "INSERT INTO faculty_notifications (faculty_id,module_name,message) VALUES ('IG001','record-edit-request',$1),('IG002','record-edit-request',$1)",
        [notice]
      );
      return res.status(201).json({ message: 'Test schedule edit request sent to the admins.', request: inserted.rows[0] });
    } catch (error) {
      console.error('POST Test Batch schedule edit request error:', error);
      return res.status(500).json({ error: 'Could not submit Test Batch schedule edit request.' });
    }
  });

  app.get('/test-batch/record-edit-requests', async (req, res) => {
    const adminId = cleanId(req.query.adminId);
    if (!isAdmin(adminId)) return res.status(403).json({ error: 'Only IG001 and IG002 can review edit requests.' });
    try {
      await ensureSchema();
      const result = await pool.query(
        "SELECT * FROM test_batch_record_edit_requests ORDER BY CASE WHEN status='Pending' THEN 0 ELSE 1 END, created_at DESC"
      );
      res.json(result.rows);
    } catch (error) {
      console.error('GET Test Batch edit requests error:', error);
      res.status(500).json({ error: 'Could not load Test Batch edit requests.' });
    }
  });

  app.post('/test-batch/record-edit-requests/bulk-marks', async (req, res) => {
    const facultyId = cleanId(req.body?.facultyId);
    const testCode = String(req.body?.test_code || '').trim().toUpperCase();
    const subjectName = String(req.body?.subject_name || '').trim() || null;
    const writingDate = String(req.body?.writing_date || '').trim();
    const rolls = [...new Set((Array.isArray(req.body?.roll_nos) ? req.body.roll_nos : [])
      .map((value) => String(value || '').trim().toUpperCase()).filter(Boolean))];
    if (!facultyId || isAdmin(facultyId)) return res.status(403).json({ error: 'A valid faculty account is required.' });
    if (!testCode || !/^\d{4}-\d{2}-\d{2}$/.test(writingDate) || !rolls.length) {
      return res.status(400).json({ error: 'Test code, writing date and registered student roll numbers are required.' });
    }
    try {
      await ensureSchema();
      const faculty = await validFaculty(facultyId);
      if (!faculty) return res.status(403).json({ error: 'Faculty account was not found.' });
      const marks = await pool.query(
        "SELECT m.roll_no,m.subject_name,m.marks_obtained,m.total_marks,s.name FROM test_batch_marks m " +
        "JOIN test_batch_students s ON UPPER(TRIM(s.roll_no))=UPPER(TRIM(m.roll_no)) " +
        "WHERE UPPER(TRIM(m.test_code))=$1 AND UPPER(TRIM(m.roll_no))=ANY($2::text[]) " +
        "AND ($3::text IS NULL OR LOWER(TRIM(m.subject_name))=LOWER(TRIM($3))) ORDER BY m.roll_no",
        [testCode, rolls, subjectName]
      );
      if (!marks.rows.length) return res.status(404).json({ error: 'No saved marks found for the selected students.' });
      const snapshot = marks.rows.map((row) => ({
        roll_no: row.roll_no,
        subject_name: row.subject_name,
        marks_obtained: String(row.marks_obtained),
        total_marks: Number(row.total_marks),
      }));
      const existing = await pool.query(
        "SELECT id,status FROM test_batch_record_edit_requests WHERE record_type='marks' AND roll_no='*' " +
        "AND UPPER(TRIM(test_code))=$1 AND attendance_date=$2::date AND status IN ('Pending','Approved') LIMIT 1",
        [testCode, writingDate]
      );
      if (existing.rows.length) return res.status(409).json({ error: 'An overall edit request for this test and writing date is already pending or approved.' });
      const inserted = await pool.query(
        "INSERT INTO test_batch_record_edit_requests " +
        "(record_type,roll_no,student_name,test_code,subject_name,attendance_date,original_value,requested_value,requested_by,requested_by_name) " +
        "VALUES ('marks','*',$1,$2,$3,$4,$5,'BULK_EDIT',$6,$7) RETURNING *",
        [marks.rows.length + ' registered students', testCode, subjectName, writingDate, JSON.stringify(snapshot), facultyId, faculty.name]
      );
      const notice = faculty.name + ' requested overall Test Batch marks edit for test ' + testCode +
        ' on ' + writingDate + ' (' + marks.rows.length + ' students).';
      await pool.query(
        "INSERT INTO faculty_notifications (faculty_id,module_name,message) VALUES ('IG001','record-edit-request',$1),('IG002','record-edit-request',$1)",
        [notice]
      );
      res.status(201).json({ message: 'Overall edit request sent to the admins.', request: inserted.rows[0] });
    } catch (error) {
      console.error('POST overall Test Batch marks edit request error:', error);
      res.status(500).json({ error: 'Could not submit overall Test Batch edit request.' });
    }
  });

  app.get('/test-batch/record-edit-requests/mine', async (req, res) => {
    const facultyId = cleanId(req.query.facultyId);
    if (!facultyId || isAdmin(facultyId)) return res.status(403).json({ error: 'A valid faculty account is required.' });
    try {
      await ensureSchema();
      const result = await pool.query(
        "SELECT * FROM test_batch_record_edit_requests WHERE requested_by=$1 ORDER BY created_at DESC",
        [facultyId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('GET own Test Batch edit requests error:', error);
      res.status(500).json({ error: 'Could not load your Test Batch edit requests.' });
    }
  });
  app.get('/test-batch/record-edit-requests/approved', async (req, res) => {
    const facultyId = cleanId(req.query.facultyId);
    if (!facultyId || isAdmin(facultyId)) return res.status(403).json({ error: 'A valid faculty account is required.' });
    try {
      await ensureSchema();
      const result = await pool.query(
        "SELECT * FROM test_batch_record_edit_requests WHERE requested_by=$1 AND status='Approved' ORDER BY reviewed_at DESC",
        [facultyId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('GET approved Test Batch edit requests error:', error);
      res.status(500).json({ error: 'Could not load approved Test Batch edit requests.' });
    }
  });

  app.put('/test-batch/record-edit-requests/:id/review', async (req, res) => {
    const adminId = cleanId(req.body?.adminId);
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const note = String(req.body?.note || '').trim() || null;
    if (!isAdmin(adminId)) return res.status(403).json({ error: 'Only IG001 and IG002 can review edit requests.' });
    if (!['approve', 'decline'].includes(decision)) return res.status(400).json({ error: 'decision must be approve or decline.' });
    try {
      await ensureSchema();
      const result = await pool.query(
        "UPDATE test_batch_record_edit_requests SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=CURRENT_TIMESTAMP " +
        "WHERE id=$4 AND status='Pending' RETURNING *",
        [decision === 'approve' ? 'Approved' : 'Declined', adminId, note, req.params.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Pending edit request not found.' });
      const request = result.rows[0];
      await pool.query(
        "INSERT INTO faculty_notifications (faculty_id,module_name,message) VALUES ($1,'record-edit-result',$2)",
        [request.requested_by, 'Your Test Batch edit request #' + request.id + ' was ' + request.status.toLowerCase() + ' by ' + adminId + '.']
      );
      res.json({ message: 'Edit request ' + decision + 'd.', request });
    } catch (error) {
      console.error('Review Test Batch edit request error:', error);
      res.status(500).json({ error: 'Could not review Test Batch edit request.' });
    }
  });

  app.post('/test-batch/record-edit-requests/:id/apply', async (req, res) => {
    const facultyId = cleanId(req.body?.facultyId);
    if (!facultyId || isAdmin(facultyId)) return res.status(403).json({ error: 'A valid faculty account is required.' });
    const client = await pool.connect();
    try {
      await ensureSchema();
      await client.query('BEGIN');
      const requestResult = await client.query(
        "SELECT * FROM test_batch_record_edit_requests WHERE id=$1 AND requested_by=$2 AND status='Approved' FOR UPDATE",
        [req.params.id, facultyId]
      );
      if (!requestResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No approved edit permission exists for this record.' });
      }
      const request = requestResult.rows[0];
      if (request.record_type === 'schedule') {
        const testId = Number(String(request.roll_no || '').replace(/^TEST:/, ''));
        let snapshot;
        try { snapshot = JSON.parse(request.original_value); } catch { snapshot = null; }
        const form = req.body?.schedule || {};
        if (!Number.isInteger(testId) || !snapshot || !form.test_code || !form.test_series_id || !form.subject_name ||
            !Number(form.duration_minutes) || !Number(form.total_marks) || !form.application_open_date ||
            !form.application_close_date || !form.writing_close_date) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Complete and valid schedule details are required.' });
        }
        if (form.application_close_date < form.application_open_date || form.application_close_date >= form.writing_close_date) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Registration dates must be valid and close before the writing close date.' });
        }
        const currentResult = await client.query(
          "SELECT id,test_code,test_series_id,subject_name,duration_minutes,total_marks,portion,chapter,application_open_date,application_close_date,writing_close_date,status FROM test_batch_tests WHERE id=$1 FOR UPDATE",
          [testId]
        );
        if (!currentResult.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Test Batch test not found.' });
        }
        const current = currentResult.rows[0];
        const fields = ['test_code','test_series_id','subject_name','duration_minutes','total_marks','portion','chapter','application_open_date','application_close_date','writing_close_date','status'];
        const unchanged = fields.every((field) => String(current[field] ?? '').slice(0,10) === String(snapshot[field] ?? '').slice(0,10));
        if (!unchanged) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'This test schedule changed after the request. Submit a new request.' });
        }
        const series = await client.query('SELECT id FROM test_series WHERE id=$1 LIMIT 1', [Number(form.test_series_id)]);
        if (!series.rows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Invalid Test Series.' });
        }
        const updated = await client.query(
          "UPDATE test_batch_tests SET test_code=$1,test_series_id=$2,subject_name=$3,duration_minutes=$4,total_marks=$5,portion=$6,chapter=$7,application_open_date=$8,application_close_date=$9,writing_close_date=$10,status=$11,updated_at=CURRENT_TIMESTAMP WHERE id=$12 RETURNING *",
          [String(form.test_code).trim().toUpperCase(),Number(form.test_series_id),String(form.subject_name).trim(),Number(form.duration_minutes),Number(form.total_marks),form.portion || null,form.chapter || null,form.application_open_date,form.application_close_date,form.writing_close_date,form.status || 'Scheduled',testId]
        );
        await client.query("UPDATE test_batch_record_edit_requests SET status='Applied',applied_at=CURRENT_TIMESTAMP WHERE id=$1", [request.id]);
        await client.query('COMMIT');
        return res.json({ message: 'Approved Test Batch schedule edit applied successfully.', test: updated.rows[0] });
      }
      if (request.record_type === 'marks' && request.roll_no === '*') {
        const records = Array.isArray(req.body?.records) ? req.body.records : [];
        let snapshot;
        try { snapshot = JSON.parse(request.original_value); } catch { snapshot = null; }
        if (!snapshot || !Array.isArray(snapshot) || !records.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'A valid set of edited marks is required.' });
        }
        const snapshotByRoll = new Map(snapshot.map((row) => [String(row.roll_no).trim().toUpperCase(), row]));
        const submittedRolls = new Set();
        for (const row of records) {
          const roll = String(row.roll_no || '').trim().toUpperCase();
          const original = snapshotByRoll.get(roll);
          const next = String(row.marks_obtained ?? '').trim().toUpperCase();
          if (!original || submittedRolls.has(roll) || !next) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Invalid or duplicate student mark in the overall edit.' });
          }
          submittedRolls.add(roll);
          if (next !== 'A' && (!Number.isFinite(Number(next)) || Number(next) < 0 || Number(next) > Number(original.total_marks))) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Marks for ' + roll + ' must be between 0 and ' + original.total_marks + ', or A for absent.' });
          }
          const current = await client.query(
            "SELECT marks_obtained,total_marks FROM test_batch_marks WHERE UPPER(TRIM(roll_no))=$1 AND UPPER(TRIM(test_code))=UPPER(TRIM($2)) AND LOWER(TRIM(subject_name))=LOWER(TRIM($3)) FOR UPDATE",
            [roll, request.test_code, original.subject_name]
          );
          if (!current.rows.length || String(current.rows[0].marks_obtained).trim().toUpperCase() !== String(original.marks_obtained).trim().toUpperCase()) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Marks for ' + roll + ' changed after approval was requested. Submit a new overall request.' });
          }
        }
        for (const row of records) {
          const roll = String(row.roll_no).trim().toUpperCase();
          const original = snapshotByRoll.get(roll);
          const next = String(row.marks_obtained).trim().toUpperCase();
          const total = Number(original.total_marks);
          const percent = next === 'A' ? 0 : Number(next) / total * 100;
          const comment = next === 'A' ? 'Absent' : percent >= 90 ? 'Excellent' : percent >= 75 ? 'Very Good' : percent >= 60 ? 'Good' : percent >= 40 ? 'Average' : 'Needs Improvement';
          await client.query(
            "UPDATE test_batch_marks SET marks_obtained=$1,comments=$2,updated_at=CURRENT_TIMESTAMP WHERE UPPER(TRIM(roll_no))=$3 AND UPPER(TRIM(test_code))=UPPER(TRIM($4)) AND LOWER(TRIM(subject_name))=LOWER(TRIM($5))",
            [next, comment, roll, request.test_code, original.subject_name]
          );
        }
        await client.query(
          "UPDATE test_batch_record_edit_requests SET status='Applied',applied_at=CURRENT_TIMESTAMP WHERE id=$1",
          [request.id]
        );
        await client.query('COMMIT');
        return res.json({ message: 'Overall approved Test Batch marks edit applied successfully.', updated: records.length });
      }
      const current = request.record_type === 'marks'
        ? await client.query(
            "SELECT marks_obtained AS value,total_marks FROM test_batch_marks WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1)) " +
            "AND UPPER(TRIM(test_code))=UPPER(TRIM($2)) AND ($3::text IS NULL OR LOWER(TRIM(subject_name))=LOWER(TRIM($3)))",
            [request.roll_no, request.test_code, request.subject_name]
          )
        : await client.query(
            "SELECT status AS value FROM test_batch_attendance WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1)) AND attendance_date=$2",
            [request.roll_no, request.attendance_date]
          );
      const currentValue = current.rows.length ? String(current.rows[0].value).trim() : '';
      const same = request.record_type === 'marks' && currentValue.toUpperCase() !== 'A' && String(request.original_value).toUpperCase() !== 'A'
        ? Number(currentValue) === Number(request.original_value)
        : currentValue.toUpperCase() === String(request.original_value).trim().toUpperCase();
      if (!current.rows.length || !same) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This record changed after the request. Submit a new request.' });
      }
      if (request.record_type === 'marks') {
        const next = String(req.body?.newValue ?? request.requested_value).trim().toUpperCase();
        const total = Number(current.rows[0].total_marks);
        if (next !== 'A' && (!Number.isFinite(Number(next)) || Number(next) < 0 || Number(next) > total)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Marks must be between 0 and total marks, or A for absent.' });
        }
        const comment = next === 'A' ? 'Absent' : Number(next) / total * 100 >= 90 ? 'Excellent' : Number(next) / total * 100 >= 75 ? 'Very Good' : Number(next) / total * 100 >= 60 ? 'Good' : Number(next) / total * 100 >= 40 ? 'Average' : 'Needs Improvement';
        await client.query(
          "UPDATE test_batch_marks SET marks_obtained=$1,comments=$2,updated_at=CURRENT_TIMESTAMP " +
          "WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($3)) AND UPPER(TRIM(test_code))=UPPER(TRIM($4)) " +
          "AND ($5::text IS NULL OR LOWER(TRIM(subject_name))=LOWER(TRIM($5)))",
          [next, comment, request.roll_no, request.test_code, request.subject_name]
        );
      } else {
        if (!['Present', 'Absent'].includes(request.requested_value)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Attendance must be Present or Absent.' });
        }
        await client.query(
          "UPDATE test_batch_attendance SET status=$1,edited_by=$2,edited_at=CURRENT_TIMESTAMP " +
          "WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($3)) AND attendance_date=$4",
          [request.requested_value, facultyId, request.roll_no, request.attendance_date]
        );
      }
      await client.query(
        "UPDATE test_batch_record_edit_requests SET status='Applied',applied_at=CURRENT_TIMESTAMP WHERE id=$1",
        [request.id]
      );
      await client.query('COMMIT');
      res.json({ message: 'Approved Test Batch edit applied successfully.' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Apply Test Batch edit request error:', error);
      res.status(500).json({ error: 'Could not apply approved Test Batch edit.' });
    } finally {
      client.release();
    }
  });
}

module.exports = registerTestBatchEditRequestRoutes;
