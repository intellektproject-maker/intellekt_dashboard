const express = require('express');

const ADMIN_IDS = new Set(['IG001', 'IG002']);

function registerRecordEditRoutes(app, pool) {
  let schemaReady;
  const ensureSchema = () => {
    if (!schemaReady) {
      schemaReady = pool.query(`
        CREATE TABLE IF NOT EXISTS record_edit_requests (
          id BIGSERIAL PRIMARY KEY,
          record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('marks', 'attendance')),
          roll_no TEXT NOT NULL,
          student_name TEXT,
          test_code TEXT,
          subject_id INTEGER,
          attendance_date DATE,
          original_value TEXT NOT NULL,
          requested_value TEXT NOT NULL,
          requested_by TEXT NOT NULL,
          requested_by_name TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'Pending'
            CHECK (status IN ('Pending', 'Approved', 'Declined', 'Applied')),
          reviewed_by TEXT,
          review_note TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          reviewed_at TIMESTAMPTZ,
          applied_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_record_edit_requests_status
          ON record_edit_requests(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_record_edit_requests_requester
          ON record_edit_requests(requested_by, status);
      `).catch((error) => {
        schemaReady = null;
        throw error;
      });
    }
    return schemaReady;
  };

  const cleanId = (value) => String(value || '').trim().toUpperCase();
  const isAdmin = (value) => ADMIN_IDS.has(cleanId(value));

  app.post('/record-edit-requests', async (req, res) => {
    const {
      facultyId, recordType, roll_no, test_code, subject_id,
      attendance_date, requested_value
    } = req.body || {};
    const requester = cleanId(facultyId);
    const type = String(recordType || '').trim().toLowerCase();
    const roll = String(roll_no || '').trim();
    const requested = String(requested_value ?? '').trim();

    if (!requester || isAdmin(requester)) {
      return res.status(403).json({ error: 'A valid faculty account is required.' });
    }
    if (!['marks', 'attendance'].includes(type) || !roll || !requested) {
      return res.status(400).json({ error: 'recordType, roll_no and requested_value are required.' });
    }

    try {
      await ensureSchema();
      const facultyResult = await pool.query(
        'SELECT name FROM faculty WHERE UPPER(TRIM(faculty_id)) = $1',
        [requester]
      );
      if (!facultyResult.rows.length) {
        return res.status(403).json({ error: 'Faculty account was not found.' });
      }

      let studentResult;
      let originalValue;
      let testCodeValue = null;
      let subjectIdValue = null;
      let attendanceDateValue = null;

      if (type === 'marks') {
        if (!test_code) return res.status(400).json({ error: 'test_code is required for marks edits.' });
        studentResult = await pool.query(
          `SELECT s.name, m.marks_obtained AS original_value
           FROM students s
           JOIN marks m ON UPPER(TRIM(m.roll_no)) = UPPER(TRIM(s.roll_no))
           WHERE UPPER(TRIM(s.roll_no)) = UPPER(TRIM($1))
             AND UPPER(TRIM(m.test_code)) = UPPER(TRIM($2))
           LIMIT 1`,
          [roll, test_code]
        );
        testCodeValue = String(test_code).trim();
        if (!studentResult.rows.length) return res.status(404).json({ error: 'Marks record not found.' });
        originalValue = String(studentResult.rows[0].original_value);
        const totalResult = await pool.query(
          'SELECT total_marks FROM marks WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1)) AND UPPER(TRIM(test_code)) = UPPER(TRIM($2))',
          [roll, test_code]
        );
        const total = Number(totalResult.rows[0]?.total_marks);
        if (requested.toUpperCase() !== 'A') {
          const n = Number(requested);
          if (!Number.isFinite(n) || n < 0 || (Number.isFinite(total) && n > total)) {
            return res.status(400).json({ error: 'Requested marks must be between 0 and the total marks, or A for absent.' });
          }
        }
      } else {
        const date = String(attendance_date || '').trim();
        const subject = Number(subject_id);
        if (!date || !Number.isInteger(subject) || subject <= 0 || !['Present', 'Absent'].includes(requested)) {
          return res.status(400).json({ error: 'A valid attendance_date, subject_id and Present/Absent value are required.' });
        }
        studentResult = await pool.query(
          `SELECT s.name, a.status AS original_value
           FROM students s
           JOIN attendance a ON UPPER(TRIM(a.roll_no)) = UPPER(TRIM(s.roll_no))
           WHERE UPPER(TRIM(s.roll_no)) = UPPER(TRIM($1))
             AND a.subject_id = $2 AND a.attendance_date = $3
           LIMIT 1`,
          [roll, subject, date]
        );
        if (!studentResult.rows.length) return res.status(404).json({ error: 'Attendance record not found.' });
        originalValue = String(studentResult.rows[0].original_value);
        subjectIdValue = subject;
        attendanceDateValue = date;
      }

      if (originalValue === requested) {
        return res.status(400).json({ error: 'The requested value is the same as the current value.' });
      }

      const pending = await pool.query(
        `SELECT id FROM record_edit_requests
         WHERE record_type = $1 AND UPPER(TRIM(roll_no)) = UPPER(TRIM($2))
           AND COALESCE(UPPER(TRIM(test_code)), '') = COALESCE(UPPER(TRIM($3)), '')
           AND COALESCE(subject_id, 0) = COALESCE($4, 0)
           AND COALESCE(attendance_date, DATE '1900-01-01') = COALESCE($5::date, DATE '1900-01-01')
           AND status IN ('Pending', 'Approved') LIMIT 1`,
        [type, roll, testCodeValue, subjectIdValue, attendanceDateValue]
      );
      if (pending.rows.length) return res.status(409).json({ error: 'An edit request for this record is already pending.' });

      const inserted = await pool.query(
        `INSERT INTO record_edit_requests
          (record_type, roll_no, student_name, test_code, subject_id, attendance_date,
           original_value, requested_value, requested_by, requested_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [type, roll, studentResult.rows[0].name, testCodeValue, subjectIdValue,
          attendanceDateValue, originalValue, requested, requester, facultyResult.rows[0].name]
      );

      const message = `${facultyResult.rows[0].name} requested edit access for ${studentResult.rows[0].name}'s ${type} record.`;
      await pool.query(
        `INSERT INTO faculty_notifications (faculty_id, module_name, message)
         VALUES ('IG001', 'record-edit-request', $1), ('IG002', 'record-edit-request', $1)`,
        [message]
      );
      return res.status(201).json({ message: 'Edit request sent to the admins.', request: inserted.rows[0] });
    } catch (error) {
      console.error('POST /record-edit-requests error:', error);
      return res.status(500).json({ error: 'Could not submit edit request.' });
    }
  });

  app.get('/record-edit-requests', async (req, res) => {
    const adminId = cleanId(req.query.adminId);
    if (!isAdmin(adminId)) return res.status(403).json({ error: 'Only IG001 and IG002 can review edit requests.' });
    try {
      await ensureSchema();
      const result = await pool.query(
        `SELECT * FROM record_edit_requests
         ORDER BY CASE WHEN status = 'Pending' THEN 0 ELSE 1 END, created_at DESC`
      );
      res.json(result.rows);
    } catch (error) {
      console.error('GET /record-edit-requests error:', error);
      res.status(500).json({ error: 'Could not load edit requests.' });
    }
  });

  app.get('/record-edit-requests/approved', async (req, res) => {
    const facultyId = cleanId(req.query.facultyId);
    if (!facultyId || isAdmin(facultyId)) return res.status(403).json({ error: 'A valid faculty account is required.' });
    try {
      await ensureSchema();
      const result = await pool.query(
        `SELECT * FROM record_edit_requests
         WHERE requested_by = $1 AND status = 'Approved'
         ORDER BY reviewed_at DESC`,
        [facultyId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('GET approved edit requests error:', error);
      res.status(500).json({ error: 'Could not load approved edit requests.' });
    }
  });

  app.put('/record-edit-requests/:id/review', async (req, res) => {
    const adminId = cleanId(req.body?.adminId);
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const note = String(req.body?.note || '').trim() || null;
    if (!isAdmin(adminId)) return res.status(403).json({ error: 'Only IG001 and IG002 can review edit requests.' });
    if (!['approve', 'decline'].includes(decision)) return res.status(400).json({ error: 'decision must be approve or decline.' });
    try {
      await ensureSchema();
      const result = await pool.query(
        `UPDATE record_edit_requests
         SET status = $1, reviewed_by = $2, review_note = $3, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND status = 'Pending'
         RETURNING *`,
        [decision === 'approve' ? 'Approved' : 'Declined', adminId, note, req.params.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Pending edit request not found.' });
      const request = result.rows[0];
      await pool.query(
        `INSERT INTO faculty_notifications (faculty_id, module_name, message)
         VALUES ($1, 'record-edit-result', $2)`,
        [request.requested_by, `Your edit request #${request.id} was ${request.status.toLowerCase()} by ${adminId}.`]
      );
      res.json({ message: `Edit request ${request.status.toLowerCase()}.`, request });
    } catch (error) {
      console.error('PUT edit request review error:', error);
      res.status(500).json({ error: 'Could not review edit request.' });
    }
  });

  app.post('/record-edit-requests/:id/apply', async (req, res) => {
    const facultyId = cleanId(req.body?.facultyId);
    const newValue = String(req.body?.newValue ?? '').trim();
    if (!facultyId || isAdmin(facultyId)) return res.status(403).json({ error: 'A valid faculty account is required.' });
    try {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const requestResult = await client.query(
          `SELECT * FROM record_edit_requests
           WHERE id = $1 AND requested_by = $2 AND status = 'Approved'
           FOR UPDATE`,
          [req.params.id, facultyId]
        );
        if (!requestResult.rows.length) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'No approved edit permission exists for this record.' });
        }
        const request = requestResult.rows[0];
        const currentResult = request.record_type === 'marks'
          ? await client.query(
              'SELECT marks_obtained AS current_value FROM marks WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1)) AND UPPER(TRIM(test_code)) = UPPER(TRIM($2))',
              [request.roll_no, request.test_code]
            )
          : await client.query(
              'SELECT status AS current_value FROM attendance WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1)) AND subject_id = $2 AND attendance_date = $3',
              [request.roll_no, request.subject_id, request.attendance_date]
            );
        const currentValue = currentResult.rows.length ? String(currentResult.rows[0].current_value).trim() : '';
        const originalValue = String(request.original_value).trim();
        const valuesMatch = request.record_type === 'marks' &&
            currentValue.toUpperCase() !== 'A' && originalValue.toUpperCase() !== 'A'
          ? Number(currentValue) === Number(originalValue)
          : currentValue.toUpperCase() === originalValue.toUpperCase();
        if (!currentResult.rows.length || !valuesMatch) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'This record changed after the request was submitted. Please submit a new edit request.' });
        }
        if (!newValue) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'newValue is required.' });
        }
        if (request.record_type === 'marks') {
          if (newValue.toUpperCase() !== 'A') {
            const n = Number(newValue);
            const totalResult = await client.query(
              'SELECT total_marks FROM marks WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1)) AND UPPER(TRIM(test_code)) = UPPER(TRIM($2))',
              [request.roll_no, request.test_code]
            );
            const total = Number(totalResult.rows[0]?.total_marks);
            if (!totalResult.rows.length || !Number.isFinite(n) || n < 0 || n > total) {
              await client.query('ROLLBACK');
              return res.status(400).json({ error: 'Marks must be within the test total, or A for absent.' });
            }
          }
          const clean = newValue.toUpperCase();
          const totalResult = await client.query(
            'SELECT total_marks FROM marks WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1)) AND UPPER(TRIM(test_code)) = UPPER(TRIM($2))',
            [request.roll_no, request.test_code]
          );
          if (!totalResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Marks record no longer exists.' });
          }
          const total = Number(totalResult.rows[0].total_marks);
          const comment = clean === 'A' ? 'Absent' : Number(clean) / total * 100 >= 90 ? 'Excellent' : Number(clean) / total * 100 >= 75 ? 'Very Good' : Number(clean) / total * 100 >= 60 ? 'Good' : Number(clean) / total * 100 >= 40 ? 'Average' : 'Needs Improvement';
          await client.query(
            `UPDATE marks SET marks_obtained = $1, comments = $2
             WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($3)) AND UPPER(TRIM(test_code)) = UPPER(TRIM($4))`,
            [clean, comment, request.roll_no, request.test_code]
          );
        } else {
          if (!['Present', 'Absent'].includes(newValue)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Attendance must be Present or Absent.' });
          }
          const updated = await client.query(
            `UPDATE attendance SET status = $1, edited_by = $2, edited_at = CURRENT_TIMESTAMP
             WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($3)) AND subject_id = $4 AND attendance_date = $5
             RETURNING roll_no`,
            [newValue, facultyId, request.roll_no, request.subject_id, request.attendance_date]
          );
          if (!updated.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Attendance record no longer exists.' });
          }
        }
        await client.query(
          `UPDATE record_edit_requests SET status = 'Applied', applied_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [request.id]
        );
        await client.query('COMMIT');
        res.json({ message: 'Approved edit applied successfully.' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('POST edit request apply error:', error);
      res.status(500).json({ error: 'Could not apply approved edit.' });
    }
  });
}

module.exports = registerRecordEditRoutes;
